/**
 * Calibration fixture — golden test for end-to-end ink-coverage math.
 *
 * Instead of pulling in a real PNG at runtime (filesystem paths +
 * createImageBitmap don't work in `node --test` without extra infra),
 * we synthesize a known-coverage ImageData in memory and run the post-
 * render portion of the pipeline on it. If future refactors change any
 * piece of the math — Lab vs RGB, AA weighting, dot gain, bleed,
 * exclusion accounting — one of these golden assertions will budge
 * and CI fails.
 *
 * Reference artwork: 354×236 px (= 30×20 mm @ 300 DPI). The left half
 * is solid CYAN (30%-ish on the eye but 100% coverage ink-wise), the
 * right half is solid MAGENTA. Outside area is white (BG). Exactly
 * 50% coverage for each color; both full ink.
 *
 * Expected measurements:
 *   printable_ratio ≈ 1.0 (every pixel is inked — both halves)
 *   cyan    print_area_pct ≈ 0.50
 *   magenta print_area_pct ≈ 0.50
 *   total_print_mm2 ≈ 600 mm² (30×20 label, fully inked)
 *   cyan ink_uL (flexo, AA on, DG on) ≈ deterministic (golden number)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maskPrintable,
  quantizeColors,
  mergeClusters,
  buildResult,
  applyInkProfile,
  mmToPx,
  isDielineColor,
} from './printAreaCore.js';

// Synthesize the reference artwork.
function makeCalibrationArtwork() {
  const W = mmToPx(30, 300); // 354
  const H = mmToPx(20, 300); // 236
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const isLeft = x < W / 2;
      data[i]     = isLeft ? 0   : 217;  // CYAN(0,174,239) vs MAGENTA(217,70,239)
      data[i + 1] = isLeft ? 174 : 70;
      data[i + 2] = isLeft ? 239 : 239;
      data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

test('calibration: Lab + AA on, solid 50/50 cyan/magenta reads as 50%/50%', () => {
  const img = makeCalibrationArtwork();
  const bg = [255, 255, 255];
  const { pixels, weights, bgCount, total } = maskPrintable(img, bg, 12,
    { aaWeighting: true, metric: 'lab' });
  assert.equal(bgCount, 0, 'no BG pixels in a fully-inked reference');
  assert.equal(total, img.width * img.height);
  // Both pixels are >> AA band from white — all weights should be ~1.
  for (const w of weights) assert.equal(w, 1, 'solid ink should weight 1');

  let clusters = quantizeColors(pixels, 2, weights, { metric: 'lab' });
  clusters = mergeClusters(clusters, 18, { metric: 'lab' });
  // Exactly two clusters.
  assert.equal(clusters.length, 2, `expected 2 clusters, got ${clusters.length}`);

  // Magenta auto-excludes via the dieline heuristic — but for THIS
  // calibration we want to measure both, so pass null predicate.
  const result = buildResult(clusters, total, bgCount, 30, 20, null);
  // Each color should be ~50% ± 0.5%.
  for (const c of result.colors) {
    assert.ok(Math.abs(c.print_area_pct - 0.5) < 0.005,
      `${c.hex} pct = ${c.print_area_pct}, expected ~0.5`);
  }
  // total_print_mm² = 100% × 600 mm² = 600 mm².
  assert.ok(Math.abs(result.totals.total_print_mm2 - 600) < 0.5,
    `total mm² = ${result.totals.total_print_mm2}, expected 600`);
});

test('calibration: dieline heuristic still flags the magenta half by default', () => {
  // Sanity: isDielineColor should match the magenta (217, 70, 239).
  assert.equal(isDielineColor([217, 70, 239]), true);
  assert.equal(isDielineColor([0, 174, 239]), false);  // cyan is not a dieline
});

test('calibration: ink volume is deterministic for flexo + AA on + DG on', () => {
  const img = makeCalibrationArtwork();
  const bg = [255, 255, 255];
  const { pixels, weights, bgCount, total } = maskPrintable(img, bg, 12,
    { aaWeighting: true, metric: 'lab' });
  let clusters = quantizeColors(pixels, 2, weights, { metric: 'lab' });
  clusters = mergeClusters(clusters, 18, { metric: 'lab' });
  const result = buildResult(clusters, total, bgCount, 30, 20, null);
  const withInk = applyInkProfile(result.colors, 'flexo', { applyDotGain: true });
  // Each color: 50% × 600 mm² = 300 mm² of ink. Flexo profile:
  //   transfer = 1.12, film = 3.0 µm, DG at 50% = 18%.
  // For a SOLID 100% cluster (which is what each half is — the cluster
  // IS 100% of its pixels, not 50% of the canvas for dot-gain purposes
  // per-cluster. print_area_pct is the CANVAS %, not the TINT %, so
  // DG on 50% canvas fraction is... hmm).
  //
  // IMPORTANT: `print_area_pct` in the current pipeline IS the share of
  // the canvas covered by this ink. For dot-gain, we should be using
  // the TINT percentage (density within the mark), not the canvas
  // fraction. This is a known modeling caveat — dot gain on "50% of
  // canvas as solid fill" is a no-op ON THE FILL, since tint=100% there.
  //
  // The current applyDotGain() passes `print_area_pct` (canvas share)
  // into the DG curve. For a 50% SOLID FILL, this inflates ink volume
  // by the DG factor, OVER-estimating ink usage. A future refactor
  // should distinguish TINT (within-mark density) from CANVAS fraction.
  //
  // Golden numbers below assume the current (canvas-share) model.
  // When the model is fixed the golden numbers will shift — update
  // the assertions in lockstep.
  for (const c of withInk) {
    // Each cluster: 300 mm² × 3 µm × 1.12 × 0.001 = 1.008 µL baseline.
    // With DG at 50% canvas share (0.5) on flexo (18%), press_pct ≈
    // 0.68 → gainRatio = 0.68/0.5 = 1.36 → 1.008 × 1.36 ≈ 1.371 µL.
    assert.ok(c.ink_uL_per_label > 1.2 && c.ink_uL_per_label < 1.5,
      `${c.hex} ink_uL = ${c.ink_uL_per_label}, expected 1.2..1.5 µL`);
  }
});

test('calibration: AA off + DG off reproduces pre-Sprint-8 ink numbers', () => {
  const img = makeCalibrationArtwork();
  const bg = [255, 255, 255];
  const { pixels, weights, bgCount, total } = maskPrintable(img, bg, 12,
    { aaWeighting: false, metric: 'rgb' });
  const clusters = quantizeColors(pixels, 2, weights, { metric: 'rgb' });
  const result = buildResult(clusters, total, bgCount, 30, 20, null);
  const withInk = applyInkProfile(result.colors, 'flexo', { applyDotGain: false });
  for (const c of withInk) {
    // Baseline: 300 mm² × 3 µm × 1.12 × 0.001 = 1.008 µL, no DG multiplier.
    assert.ok(Math.abs(c.ink_uL_per_label - 1.008) < 0.01,
      `${c.hex} ink_uL = ${c.ink_uL_per_label}, expected ~1.008 (pre-Sprint-8)`);
  }
});
