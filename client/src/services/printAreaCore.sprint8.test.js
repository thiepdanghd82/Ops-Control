/**
 * Sprint 8 Tier-1/2/3 accuracy upgrades — pure-math regressions.
 *
 * Covers:
 *   1. rgbToLab + deltaE76 (perceptual color distance)
 *   2. mergeClusters with metric='lab' merges JPG-artifact duplicates
 *      that metric='rgb' leaves split
 *   3. maskPrintable AA sub-pixel weighting — edge pixels get weight<1
 *   4. Dot gain — 50% file on flexo ≈ 68% press
 *   5. Rotation auto-detect — portrait artwork for landscape label
 *   6. BG sanity check — flags <5% and >95% printable ratios
 *   7. rotateImageData 90° round-trips (back to original after 4 rotations)
 *   8. Extensible spot-color picker — userExcludedHex marks a cluster
 *   9. Bleed denominator — frame mm² is used when bleed > 0
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rgbToLab,
  deltaE76,
  labDist,
  colorDist,
  mergeClusters,
  maskPrintable,
  quantizeColors,
  applyDotGain,
  applyInkProfile,
  detectRotation,
  rotateImageData,
  bgSanityCheck,
  buildResult,
} from './printAreaCore.js';

// ── Lab / ΔE76 ────────────────────────────────────────────────────

test('rgbToLab: white → [100, 0, 0]', () => {
  const [L, a, b] = rgbToLab([255, 255, 255]);
  assert.ok(Math.abs(L - 100) < 0.1);
  assert.ok(Math.abs(a) < 0.5);
  assert.ok(Math.abs(b) < 0.5);
});

test('rgbToLab: black → [0, 0, 0]', () => {
  const [L, a, b] = rgbToLab([0, 0, 0]);
  assert.equal(L, 0);
  assert.equal(a, 0);
  assert.equal(b, 0);
});

test('rgbToLab: pure red → L≈53, positive a, positive b (known values)', () => {
  const [L, a, b] = rgbToLab([255, 0, 0]);
  assert.ok(Math.abs(L - 53.24) < 1, `L=${L}`);
  assert.ok(a > 70, `a=${a}`);
  assert.ok(b > 60, `b=${b}`);
});

test('deltaE76: identical colors → 0; large ΔE for red↔green', () => {
  assert.equal(deltaE76([50, 0, 0], [50, 0, 0]), 0);
  const de = labDist([255, 0, 0], [0, 255, 0]);
  assert.ok(de > 80, `red↔green ΔE should be large, got ${de}`);
});

test('deltaE76 is lower than RGB-Euclidean at near-white (perceptually small change)', () => {
  // Two near-white grays the eye barely distinguishes.
  const rgbDist = colorDist([250, 250, 250], [240, 240, 240]);
  const labDe = labDist([250, 250, 250], [240, 240, 240]);
  // RGB Euclidean is ~17; ΔE76 is ~3. Lab matches the eye.
  assert.ok(rgbDist > 15, `RGB Euclidean = ${rgbDist}`);
  assert.ok(labDe < 5, `ΔE76 = ${labDe}`);
});

// ── mergeClusters with metric='lab' ──────────────────────────────

test('mergeClusters (lab): merges JPG-artifact variants that RGB leaves split', () => {
  // Three "reds" within JPG ringing of each other (tightly clustered)
  // plus one distinct blue. Lab (ΔE ≤ 6) should collapse the reds;
  // a tight RGB threshold leaves them apart because Euclidean RGB
  // between dark reds is larger than the perceptual difference.
  const clusters = [
    { rgb: [220, 38, 38], count: 1000 },
    { rgb: [222, 40, 36], count: 300 },
    { rgb: [218, 36, 40], count: 200 },
    { rgb: [0, 100, 200], count: 500 },
  ];
  const labMerged = mergeClusters(clusters, 28, { metric: 'lab' }); // → ~7 ΔE
  const rgbMerged = mergeClusters(clusters, 4, { metric: 'rgb' }); // intentionally tight
  const labReds = labMerged.filter((c) => c.rgb[0] > 150 && c.rgb[1] < 60);
  const rgbReds = rgbMerged.filter((c) => c.rgb[0] > 150 && c.rgb[1] < 60);
  assert.equal(
    labReds.length,
    1,
    `Lab should merge 3 JPG-ringed reds into 1, got ${labReds.length}`
  );
  assert.ok(
    rgbReds.length > 1,
    `tight RGB threshold should leave ≥2 red clusters, got ${rgbReds.length}`
  );
});

// ── AA sub-pixel weighting ───────────────────────────────────────

test('maskPrintable AA weighting: edge pixels contribute < 1; solid pixels = 1', () => {
  // 10×1 strip. BG white, tolerance 30. AA band = distance 30..60 from BG.
  // A gray `g` has RGB-distance to white ≈ (255 - g) × √3. So:
  //   g = 245 → d ≈ 17 (BG)
  //   g = 235 → d ≈ 35 (AA band — weight ≈ 0.15)
  //   g = 225 → d ≈ 52 (AA band — weight ≈ 0.73)
  //   g = 215 → d ≈ 69 (beyond band — weight = 1)
  //   g = 0   → d ≈ 442 (solid — weight = 1)
  const data = new Uint8ClampedArray(10 * 4);
  const greys = [255, 245, 240, 235, 230, 225, 220, 215, 100, 0];
  for (let i = 0; i < 10; i++) {
    data[i * 4] = greys[i];
    data[i * 4 + 1] = greys[i];
    data[i * 4 + 2] = greys[i];
    data[i * 4 + 3] = 255;
  }
  const img = { data, width: 10, height: 1 };
  const bg = [255, 255, 255];
  const weighted = maskPrintable(img, bg, 30, { aaWeighting: true });
  const unweighted = maskPrintable(img, bg, 30, { aaWeighting: false });
  // Some pixels must land in the AA band → fractional weight.
  assert.ok(
    weighted.weights.some((w) => w > 0 && w < 1),
    `expected some fractional weights, got: ${weighted.weights.join(',')}`
  );
  // Σweights ≤ printable count (AA pixels contribute < 1).
  assert.ok(weighted.printableWeight <= unweighted.pixels.length);
  // Solid black (last element in the test data) contributes full weight.
  assert.equal(weighted.weights[weighted.weights.length - 1], 1);
});

test('maskPrintable AA off: reproduces pre-Sprint-8 numbers bit-for-bit', () => {
  const data = new Uint8ClampedArray(4 * 4);
  // 4 px: white, dark-gray, black, white
  data.set([255, 255, 255, 255, 50, 50, 50, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  const img = { data, width: 4, height: 1 };
  const bg = [255, 255, 255];
  const off = maskPrintable(img, bg, 12, { aaWeighting: false });
  assert.equal(off.pixels.length, 2);
  assert.equal(off.bgCount, 2);
  // All weights are 1 when AA off.
  for (const w of off.weights) assert.equal(w, 1);
});

test('quantizeColors: weights sum to printableWeight across clusters', () => {
  // 5 pixels: 3 "red" with weights [1, 0.7, 0.4], 2 "blue" with weights [1, 0.9].
  const pixels = [
    [255, 0, 0],
    [230, 30, 30],
    [180, 80, 80],
    [0, 0, 255],
    [10, 10, 230],
  ];
  const weights = [1, 0.7, 0.4, 1, 0.9];
  const clusters = quantizeColors(pixels, 2, weights, { metric: 'lab' });
  const totalWeight = clusters.reduce((s, c) => s + c.count, 0);
  assert.ok(Math.abs(totalWeight - 4.0) < 0.001, `Σ weights = ${totalWeight}, expected 4.0`);
});

// ── Dot gain ──────────────────────────────────────────────────────

test('applyDotGain: solids (0% and 100%) are untouched; 50% gains significantly', () => {
  assert.equal(applyDotGain(0, 18), 0);
  assert.ok(Math.abs(applyDotGain(1, 18) - 1) < 0.001, '100% file stays 100%');
  // 50% file on flexo (18% gain) → roughly 0.68
  const press50 = applyDotGain(0.5, 18);
  assert.ok(press50 > 0.65 && press50 < 0.7, `flexo 50% → ~68%, got ${press50}`);
});

test('applyDotGain: accepts both 0..1 and 0..100 input magnitudes', () => {
  const a = applyDotGain(0.5, 18);
  const b = applyDotGain(50, 18);
  assert.ok(Math.abs(b - a * 100) < 0.001);
});

test('applyInkProfile: dot gain increases ink volume for a 50% cluster; no change for solid', () => {
  const colors50 = [{ print_area_pct: 0.5, print_area_mm2: 300 }];
  const colors100 = [{ print_area_pct: 1.0, print_area_mm2: 600 }];
  const withGain = applyInkProfile(colors50, 'flexo', { applyDotGain: true });
  const noGain = applyInkProfile(colors50, 'flexo', { applyDotGain: false });
  const solidGain = applyInkProfile(colors100, 'flexo', { applyDotGain: true });
  const solidNo = applyInkProfile(colors100, 'flexo', { applyDotGain: false });
  // 50% ink volume goes up by ~35% (press 68% / file 50%).
  assert.ok(
    withGain[0].ink_uL_per_label > noGain[0].ink_uL_per_label * 1.3,
    `dot gain should inflate 50% ink vol by ~35%: ${withGain[0].ink_uL_per_label} vs ${noGain[0].ink_uL_per_label}`
  );
  assert.ok(withGain[0].dot_gain_pct > 0.1, 'should expose dot_gain_pct > 0.1');
  // 100% fill: identical with/without gain.
  assert.ok(
    Math.abs(solidGain[0].ink_uL_per_label - solidNo[0].ink_uL_per_label) < 0.001,
    'solid fill: dot gain should be a no-op'
  );
});

// ── Rotation ─────────────────────────────────────────────────────

test('detectRotation: portrait artwork for landscape label → 90°', () => {
  // Label 30×20 (landscape 1.5:1), artwork 800×1200 (portrait 0.67:1)
  // → swap aspect 20×30 (0.67:1) matches exactly → rotate 90°.
  assert.equal(detectRotation(800, 1200, 30, 20), 90);
});

test('detectRotation: matching aspect → 0°', () => {
  // Label 30×20 (1.5), artwork 600×400 (1.5) — no rotation.
  assert.equal(detectRotation(600, 400, 30, 20), 0);
});

test('detectRotation: near-square labels return 0 (safety)', () => {
  // 20×20 label with 400×390 artwork — tiny aspect mismatch, but
  // rotating would produce the same aspect. Should NOT recommend.
  assert.equal(detectRotation(400, 390, 20, 20), 0);
});

test('rotateImageData: 4× 90° rotations returns to original', () => {
  const data = new Uint8ClampedArray(3 * 2 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = i;
    data[i + 1] = i + 1;
    data[i + 2] = i + 2;
    data[i + 3] = 255;
  }
  const img = { data, width: 3, height: 2 };
  let r = img;
  for (let i = 0; i < 4; i++) r = rotateImageData(r, 90);
  assert.equal(r.width, img.width);
  assert.equal(r.height, img.height);
  for (let i = 0; i < data.length; i++) assert.equal(r.data[i], img.data[i]);
});

test('rotateImageData: 90° swaps dimensions', () => {
  const data = new Uint8ClampedArray(4 * 4); // 2×2 image
  data.set([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255]);
  const img = { data, width: 2, height: 2 };
  const rot = rotateImageData(img, 90);
  assert.equal(rot.width, 2); // 2×2 stays 2×2
  assert.equal(rot.height, 2);
  // Original layout: [1 2 / 3 4]. After 90° CW: [3 1 / 4 2].
  assert.equal(rot.data[0], 3, 'top-left should be bottom-left rotated');
  assert.equal(rot.data[4], 1);
  assert.equal(rot.data[8], 4);
  assert.equal(rot.data[12], 2);
});

// ── BG sanity ─────────────────────────────────────────────────────

test('bgSanityCheck: <5% printable → low_printable flag + hint', () => {
  const r = bgSanityCheck(100000, 99000); // 1% printable
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'low_printable');
  assert.match(r.hint, /manually/i);
});

test('bgSanityCheck: >95% printable → high_printable flag + hint', () => {
  const r = bgSanityCheck(100000, 2000); // 98% printable
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'high_printable');
});

test('bgSanityCheck: mid-range (10..90%) → ok:true', () => {
  const r = bgSanityCheck(100000, 50000);
  assert.equal(r.ok, true);
  assert.equal(r.printable_ratio, 0.5);
});

// ── Extensible spot-color picker ─────────────────────────────────

test('buildResult userExcludedHex: hex match marks cluster excluded with reason=user', () => {
  const clusters = [
    { rgb: [255, 0, 0], count: 1000 }, // #FF0000 — user will exclude
    { rgb: [0, 0, 0], count: 500 }, // #000000 — kept
  ];
  const res = buildResult(clusters, 10000, 0, 30, 20, null, { userExcludedHex: ['#FF0000'] });
  const red = res.colors.find((c) => c.hex === '#FF0000');
  const black = res.colors.find((c) => c.hex === '#000000');
  assert.equal(red.excluded, true);
  assert.equal(red.excluded_reason, 'user');
  assert.equal(black.excluded, false);
  // Total should exclude the red cluster.
  assert.equal(res.totals.excluded_pixels, 1000);
});

// ── Bleed-aware denominator ──────────────────────────────────────

test('buildResult + bleed: mm² uses frame area (trim + bleed)', () => {
  // Trim 30×20 = 600 mm²; bleed 3 mm all sides → frame 36×26 = 936 mm².
  // Pass frame dims to buildResult (runPrintAreaAnalysis does this).
  const res = buildResult(
    [{ rgb: [0, 0, 0], count: 4680 }],
    10000,
    0,
    36,
    26, // frame
    null
  );
  // 4680 / 10000 = 46.8% of frame → 46.8% × 936 = ~438 mm².
  assert.ok(
    Math.abs(res.totals.total_print_mm2 - 438) < 2,
    `expected ~438 mm², got ${res.totals.total_print_mm2}`
  );
});
