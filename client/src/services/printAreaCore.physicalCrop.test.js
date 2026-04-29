/**
 * Tests for Sprint-7 Print Area accuracy improvements:
 *   - physicalAnchoredCrop: input-driven crop anchored on content centroid
 *   - centroidOfMask:       pixel-weighted centroid used to aim the crop
 *   - dilateMask / openMask: morphological opening for thin-stroke removal
 *
 * These are pure-math unit tests — no DOM, no canvas, no async. They
 * synthesize ImageData by hand so every pixel is predictable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mmToPx,
  dilateMask,
  openMask,
  centroidOfMask,
  physicalAnchoredCrop,
  cropImageData,
  maskPrintable,
  buildResult,
} from './printAreaCore.js';

// ── Small helper: build an RGBA Uint8ClampedArray from a 2-D list of
//    {r,g,b} cells. Undefined cells default to pure-white BG.
function makeImg(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
  }
  if (typeof paint === 'function') paint((x, y, r, g, b) => {
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  });
  return { data, width: w, height: h };
}

// ── centroidOfMask ────────────────────────────────────────────────

test('centroidOfMask: single pixel → that coordinate', () => {
  const m = new Uint8Array(10 * 10);
  m[7 * 10 + 3] = 1;
  const c = centroidOfMask(m, 10, 10);
  assert.equal(c.cx, 3);
  assert.equal(c.cy, 7);
  assert.equal(c.count, 1);
});

test('centroidOfMask: uniform rectangle → geometric center', () => {
  const m = new Uint8Array(20 * 20);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) m[y * 20 + x] = 1;
  const c = centroidOfMask(m, 20, 20);
  assert.ok(Math.abs(c.cx - 9.5) < 0.001);
  assert.ok(Math.abs(c.cy - 9.5) < 0.001);
  assert.equal(c.count, 100);
});

test('centroidOfMask: weighted toward the denser region (one big + one small blob)', () => {
  const m = new Uint8Array(30 * 30);
  // Big blob: 6×6 at top-left (36 px, centered at (2.5, 2.5))
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) m[y * 30 + x] = 1;
  // Small blob: 2×2 at bottom-right (4 px, centered at (28.5, 28.5))
  for (let y = 28; y < 30; y++) for (let x = 28; x < 30; x++) m[y * 30 + x] = 1;
  const c = centroidOfMask(m, 30, 30);
  // Expected cx = (36×2.5 + 4×28.5) / 40 = (90 + 114) / 40 = 5.1
  assert.ok(c.cx < 10, `expected centroid pulled toward big blob, got cx=${c.cx}`);
  assert.ok(c.cy < 10);
});

test('centroidOfMask: empty mask returns null', () => {
  const m = new Uint8Array(5 * 5);
  assert.equal(centroidOfMask(m, 5, 5), null);
});

// ── dilateMask / openMask ─────────────────────────────────────────

test('dilateMask: single pixel → 5 pixels (self + 4-neighbors)', () => {
  const m = new Uint8Array(5 * 5);
  m[2 * 5 + 2] = 1;
  const d = dilateMask(m, 5, 5);
  let count = 0;
  for (const v of d) if (v) count++;
  assert.equal(count, 5, '4-neighbor dilation of 1 px produces a plus-shape of 5 px');
  assert.equal(d[2 * 5 + 2], 1);
  assert.equal(d[1 * 5 + 2], 1);
  assert.equal(d[3 * 5 + 2], 1);
  assert.equal(d[2 * 5 + 1], 1);
  assert.equal(d[2 * 5 + 3], 1);
});

test('openMask: 1-px horizontal line is destroyed; 5×5 solid block survives', () => {
  const w = 15, h = 15;
  const m = new Uint8Array(w * h);
  // A 1-px-tall line across the middle (y=7, x=1..13)
  for (let x = 1; x < 14; x++) m[7 * w + x] = 1;
  // A 5×5 solid block (x=1..5, y=1..5)
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) m[y * w + x] = 1;
  const opened = openMask(m, w, h, 1);
  // Line must be gone.
  for (let x = 1; x < 14; x++) {
    assert.equal(opened[7 * w + x], 0, `line px at (${x},7) should be erased by 1-iter opening`);
  }
  // Block must survive (possibly shrunken by 1 px around the edge but
  // then re-dilated — net: same 5×5 region).
  let blockCount = 0;
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) if (opened[y * w + x]) blockCount++;
  assert.ok(blockCount >= 20, `5×5 block should mostly survive opening, kept ${blockCount}/25`);
});

test('openMask: 2 iterations drops a 3-px-wide stroke but keeps an 8×8 block', () => {
  // Separate the stroke from the block by a margin so dilation can't
  // reconstitute the stroke from the block's expanding edge. Opening
  // is a LOCAL operation — touching features interact.
  const w = 30, h = 30;
  const m = new Uint8Array(w * h);
  // 3-px-wide vertical stroke at x=22..24 (isolated from the block)
  for (let y = 2; y < 28; y++) for (let x = 22; x <= 24; x++) m[y * w + x] = 1;
  // 8×8 solid block at x=2..9, y=2..9
  for (let y = 2; y <= 9; y++) for (let x = 2; x <= 9; x++) m[y * w + x] = 1;
  const opened = openMask(m, w, h, 2);
  // Stroke gone entirely.
  let strokeLeft = 0;
  for (let y = 2; y < 28; y++) for (let x = 22; x <= 24; x++) if (opened[y * w + x]) strokeLeft++;
  assert.equal(strokeLeft, 0,
    `3-px stroke should be fully destroyed by 2-iter opening when isolated; kept ${strokeLeft} px`);
  // Block mostly intact.
  let blockLeft = 0;
  for (let y = 2; y <= 9; y++) for (let x = 2; x <= 9; x++) if (opened[y * w + x]) blockLeft++;
  assert.ok(blockLeft >= 40, `8×8 block should mostly survive 2-iter opening, kept ${blockLeft}/64`);
});

// ── physicalAnchoredCrop ──────────────────────────────────────────

test('physicalAnchoredCrop: returns null when image is already ≤ target dims', () => {
  // 100 px image, target = 200 px at any DPI → no room to crop.
  const img = makeImg(100, 100);
  const crop = physicalAnchoredCrop(img, [255, 255, 255], 100, 100, 300, 12);
  assert.equal(crop, null);
});

test('physicalAnchoredCrop: geometric center when content is empty (BG-only image)', () => {
  const img = makeImg(1000, 800);  // pure white
  const bg = [255, 255, 255];
  // Target 30mm×20mm @ 300 DPI → 354×236 px. Image 1000×800 → plenty of room.
  const crop = physicalAnchoredCrop(img, bg, 30, 20, 300, 12);
  assert.ok(crop);
  assert.equal(crop.w, mmToPx(30, 300));
  assert.equal(crop.h, mmToPx(20, 300));
  // Centered: x = (1000-354)/2 = 323, y = (800-236)/2 = 282
  assert.ok(Math.abs(crop.x - (1000 - crop.w) / 2) <= 1);
  assert.ok(Math.abs(crop.y - (800 - crop.h) / 2) <= 1);
});

test('physicalAnchoredCrop: centered on content when content is off-center', () => {
  const img = makeImg(1000, 800, (set) => {
    // 200×100 black blob centered at (200, 400) — far left of image
    for (let y = 350; y < 450; y++) for (let x = 100; x < 300; x++) set(x, y, 0, 0, 0);
  });
  const bg = [255, 255, 255];
  const crop = physicalAnchoredCrop(img, bg, 30, 20, 300, 12);
  assert.ok(crop);
  // The crop box should be centered on (200, 400), clamped to canvas.
  // Target w=354, h=236. Ideal x = 200 - 354/2 = 23, clamped to ≥0.
  const expectedX = Math.max(0, Math.round(200 - crop.w / 2));
  const expectedY = Math.max(0, Math.round(400 - crop.h / 2));
  assert.ok(Math.abs(crop.x - expectedX) <= 1, `crop.x=${crop.x} expected~${expectedX}`);
  assert.ok(Math.abs(crop.y - expectedY) <= 1, `crop.y=${crop.y} expected~${expectedY}`);
  // Crop must not overflow canvas.
  assert.ok(crop.x + crop.w <= 1000);
  assert.ok(crop.y + crop.h <= 800);
});

test('physicalAnchoredCrop end-to-end: dim-line margin is removed, math is correct', () => {
  // Synthesize a 600×400 artwork containing a centered 354×236 "label"
  // with a 50%-coverage black fill, plus SYMMETRIC dimension lines top
  // and bottom. Symmetric margins mean the content centroid stays on
  // the label's y-axis, so the crop lands exactly on the label.
  const W = 600, H = 400, bg = [255, 255, 255];
  const labelW = mmToPx(30, 300); // 354
  const labelH = mmToPx(20, 300); // 236
  const labelX0 = Math.round((W - labelW) / 2); // 123
  const labelY0 = Math.round((H - labelH) / 2); // 82
  const img = makeImg(W, H, (set) => {
    // Half-fill inside the label area → 50% label coverage.
    for (let y = labelY0; y < labelY0 + labelH / 2; y++) {
      for (let x = labelX0; x < labelX0 + labelW; x++) set(x, y, 0, 0, 0);
    }
    // Dim lines well outside the label, symmetric top/bottom so they
    // contribute equal y-bias to the centroid (net zero shift on y).
    // With the half-fill biasing the centroid upward, the crop lands
    // slightly above the true label center — but still far inside the
    // canvas, and the coverage number is what we ultimately validate.
    for (let y = 10; y < 14; y++) for (let x = 50; x < 550; x++) set(x, y, 0, 0, 0);
    for (let y = 386; y < 390; y++) for (let x = 50; x < 550; x++) set(x, y, 0, 0, 0);
  });

  const crop = physicalAnchoredCrop(img, bg, 30, 20, 300, 12);
  assert.ok(crop);
  assert.equal(crop.w, labelW);
  assert.equal(crop.h, labelH);
  // x-centroid is symmetric → crop.x lands ±5 px of label column.
  assert.ok(Math.abs(crop.x - labelX0) < 10, `crop.x=${crop.x} expected~${labelX0}`);

  // Coverage within the crop box: the half-fill (118×354 = 41,772 px)
  // may be partially clipped if the crop slides upward, but any portion
  // captured yields a coverage ≥ 25% (if only the fill bottom is cut)
  // and ≤ 100% (if the empty half is cut). The KEY property we're
  // testing: coverage is meaningfully higher than full-canvas coverage
  // because the crop strips the empty margins + dim-line regions.
  const cropped = cropImageData(img, crop);
  const maskedCrop = maskPrintable(cropped, bg, 12);
  const cropCover = (maskedCrop.total - maskedCrop.bgCount) / maskedCrop.total;
  const maskedFull = maskPrintable(img, bg, 12);
  const fullCover = (maskedFull.total - maskedFull.bgCount) / maskedFull.total;
  assert.ok(cropCover > fullCover,
    `physical-crop coverage (${(cropCover * 100).toFixed(1)}%) must exceed full-canvas (${(fullCover * 100).toFixed(1)}%) — cropping BG/dim margins inflates the numerator fraction`);
  assert.ok(cropCover > 0.35,
    `crop coverage ${(cropCover * 100).toFixed(1)}% should be ≥35% (captures most of the half-fill)`);

  // buildResult end-to-end: mm² output uses the USER's 30×20=600 mm²
  // as denominator regardless of crop pixel count.
  const res = buildResult([{ rgb: [0, 0, 0], count: maskedCrop.pixels.length }],
    maskedCrop.total, maskedCrop.bgCount, 30, 20, null);
  assert.equal(res.totals.total_pixels, maskedCrop.total);
  assert.ok(Math.abs(res.totals.total_print_mm2 - 600 * cropCover) < 0.5,
    `total_print_mm2=${res.totals.total_print_mm2.toFixed(2)} should equal 600×coverage=${(600 * cropCover).toFixed(2)}`);
});

// ── Sanity: mmToPx round-trip ─────────────────────────────────────

test('mmToPx: 30mm @ 300dpi = 354 px (matches user spec in Sprint 7 brief)', () => {
  assert.equal(mmToPx(30, 300), 354);  // 30/25.4 × 300 = 354.33 → round
  assert.equal(mmToPx(20, 300), 236);  // 20/25.4 × 300 = 236.22 → round
});

// ── Regression guard: buildResult math keeps the label area as the
//    denominator for mm² output ─────────────────────────────────────

test('buildResult: color_mm² sums to total_print_mm² (within rounding)', () => {
  // 2 clusters, 60% + 20% coverage, both kept (not excluded).
  const total = 10000;
  const bgCount = 2000; // 80% is printable
  const clusters = [
    { rgb: [255, 0, 0], count: 6000 }, // 60%
    { rgb: [0, 0, 255], count: 2000 }, // 20%
  ];
  const res = buildResult(clusters, total, bgCount, 30, 20, null);
  const sumMm2 = res.colors.reduce((a, c) => a + c.print_area_mm2, 0);
  assert.ok(Math.abs(sumMm2 - res.totals.total_print_mm2) < 0.01,
    `Σ color mm² (${sumMm2}) should equal total_print_mm² (${res.totals.total_print_mm2})`);
  assert.ok(Math.abs(res.totals.total_print_mm2 - 600 * 0.8) < 0.01,
    `total_print_mm² should be 80% of 30×20=600 mm² = 480, got ${res.totals.total_print_mm2}`);
});
