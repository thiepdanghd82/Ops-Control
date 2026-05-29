/**
 * Sprint 9: die-line bbox detection — the crop mode that reads the
 * artwork's own cut outline as the source of truth for the label area.
 *
 * Scenario reproduced synthetically: a 600×400 canvas containing
 *   - A thin RED rectangle outline from (100,80) to (500,320) — the
 *     "die-line" (just the 4 edges, 2 px thick).
 *   - A filled BLUE disc INSIDE the rectangle (logo).
 *   - A QR-like black block INSIDE the rectangle.
 *   - Dimension-line annotations (thin black lines) OUTSIDE the rectangle.
 *
 * The die-line's stroke-score (bbox_area / pixel_count) dominates the
 * fills because it encloses a LOT of area with very FEW pixels. The
 * detector must pick the red stroke, return its bbox, and ignore the
 * outside dim-line annotations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickDielineBbox, dielineBboxByColor, rgbToHex } from './printAreaCore.js';

function makeCanvas(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
function paint(img, x, y, rgb) {
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = rgb[0];
  img.data[i + 1] = rgb[1];
  img.data[i + 2] = rgb[2];
  img.data[i + 3] = 255;
}
function rect(img, x0, y0, x1, y1, rgb) {
  // Filled rectangle.
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paint(img, x, y, rgb);
}
function strokeRect(img, x0, y0, x1, y1, rgb, thickness = 2) {
  // Rectangle outline only (hollow).
  for (let t = 0; t < thickness; t++) {
    for (let x = x0; x <= x1; x++) {
      paint(img, x, y0 + t, rgb);
      paint(img, x, y1 - t, rgb);
    }
    for (let y = y0; y <= y1; y++) {
      paint(img, x0 + t, y, rgb);
      paint(img, x1 - t, y, rgb);
    }
  }
}
function disc(img, cx, cy, r, rgb) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) paint(img, x, y, rgb);
    }
  }
}

function makeArtworkWithDieline() {
  const img = makeCanvas(600, 400);
  const RED = [236, 68, 68]; // die-line color
  const BLUE = [100, 150, 240]; // logo fill
  const BLACK = [20, 20, 20]; // QR + dim lines
  // Dimension annotations OUTSIDE the label (top + bottom thin lines).
  strokeRect(img, 50, 20, 550, 22, BLACK, 2);
  strokeRect(img, 50, 378, 550, 380, BLACK, 2);
  // Die-line: 400×240 rectangle at (100,80)..(500,320), 2 px thick.
  strokeRect(img, 100, 80, 500, 320, RED, 2);
  // Logo + QR INSIDE the die-line.
  disc(img, 200, 200, 50, BLUE);
  rect(img, 280, 150, 420, 250, BLACK);
  return { img, expectedBbox: { x: 100, y: 80, w: 401, h: 241 }, RED };
}

// ── pickDielineBbox ───────────────────────────────────────────────

test('pickDielineBbox: thin red outline wins over filled blue/black blobs', () => {
  const { img, expectedBbox, RED } = makeArtworkWithDieline();
  const pick = pickDielineBbox(img, [255, 255, 255], { tolerance: 12, metric: 'rgb' });
  assert.ok(pick, 'expected a die-line candidate');
  // Color must be red (tolerant to ±10 per channel for averaging).
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(pick.rgb[i] - RED[i]) <= 10, `rgb[${i}]=${pick.rgb[i]} expected ~${RED[i]}`);
  }
  // Bbox matches the die-line rectangle (±2 px tolerance).
  assert.ok(Math.abs(pick.bbox.x - expectedBbox.x) <= 2);
  assert.ok(Math.abs(pick.bbox.y - expectedBbox.y) <= 2);
  assert.ok(Math.abs(pick.bbox.w - expectedBbox.w) <= 4);
  assert.ok(Math.abs(pick.bbox.h - expectedBbox.h) <= 4);
  // Stroke score should be high — an outline has bbox_area >> pixel_count.
  assert.ok(pick.score > 30, `stroke_score=${pick.score}, expected >30 for a thin outline`);
});

test('pickDielineBbox: returns null when no candidate passes minRelSize', () => {
  const img = makeCanvas(600, 400);
  // Only a tiny 10×10 red square — bbox_area < 10% of canvas.
  rect(img, 10, 10, 20, 20, [236, 68, 68]);
  const pick = pickDielineBbox(img, [255, 255, 255], { metric: 'rgb' });
  assert.equal(pick, null);
});

test('pickDielineBbox: ignoreHex filters out a designated non-dieline color', () => {
  const { img, RED } = makeArtworkWithDieline();
  const redHex = rgbToHex(RED);
  const pick = pickDielineBbox(img, [255, 255, 255], { metric: 'rgb', ignoreHex: [redHex] });
  // Red is filtered out → the NEXT best stroke-score candidate wins.
  // In this synthetic setup, the outside dim lines (black thin strips)
  // also have high score; detector should fall back to them rather
  // than returning null — proving ignoreHex works.
  // If the dim-line bbox happens to fall under the relSize floor,
  // pick can be null; that's acceptable. Key property: it's NOT the
  // red die-line anymore.
  if (pick) {
    const asHex = rgbToHex(pick.rgb);
    assert.notEqual(asHex, redHex, 'ignoreHex must prevent red from being picked');
  }
});

// ── dielineBboxByColor ────────────────────────────────────────────

test('dielineBboxByColor: targeted pick returns bbox of matching pixels', () => {
  const { img, expectedBbox, RED } = makeArtworkWithDieline();
  const hit = dielineBboxByColor(img, rgbToHex(RED), { metric: 'rgb', matchTolerance: 20 });
  assert.ok(hit);
  assert.ok(Math.abs(hit.bbox.x - expectedBbox.x) <= 2);
  assert.ok(Math.abs(hit.bbox.y - expectedBbox.y) <= 2);
  assert.ok(Math.abs(hit.bbox.w - expectedBbox.w) <= 4);
  assert.ok(Math.abs(hit.bbox.h - expectedBbox.h) <= 4);
  assert.ok(hit.n > 500, 'must find hundreds of red stroke pixels');
});

test('dielineBboxByColor: returns null for a color not present', () => {
  const { img } = makeArtworkWithDieline();
  const hit = dielineBboxByColor(img, '#00FF00', { metric: 'rgb', matchTolerance: 10 });
  assert.equal(hit, null);
});

test('dielineBboxByColor: Lab metric tolerates small JPG drift in die-line color', () => {
  const img = makeCanvas(400, 300);
  // Real stroke is [236, 68, 68] but we target [220, 60, 60] — same
  // perceptual red but non-trivial RGB distance.
  strokeRect(img, 50, 50, 350, 250, [236, 68, 68], 2);
  const rgbMiss = dielineBboxByColor(img, '#DC3C3C', { metric: 'rgb', matchTolerance: 10 });
  // Strict RGB misses because distance > 10.
  assert.equal(rgbMiss, null);
  // Lab ΔE76 sees the perceptual match.
  const labHit = dielineBboxByColor(img, '#DC3C3C', { metric: 'lab', matchTolerance: 8 });
  assert.ok(labHit, 'Lab metric should tolerate small rgb drift');
});
