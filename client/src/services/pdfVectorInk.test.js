/**
 * Unit tests for pdfVectorInk — covers the pure math primitives and
 * a synthetic operator-list walk (no pdf.js dependency) so the logic
 * can be verified in Node without a real PDF.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shoelaceArea,
  flattenCubic,
  matrixDet,
  matrixMul,
  applyMatrix,
  plateKey,
  plateName,
  accumulatePlates,
  plateSwatchHex,
} from './pdfVectorInk.js';

// ── shoelaceArea ─────────────────────────────────────────────

test('shoelaceArea: 10×10 square → 100 (or -100 depending on winding)', () => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.equal(Math.abs(shoelaceArea(square)), 100);
});

test('shoelaceArea: triangle (0,0)-(4,0)-(0,3) → 6', () => {
  const tri = [
    [0, 0],
    [4, 0],
    [0, 3],
  ];
  assert.equal(Math.abs(shoelaceArea(tri)), 6);
});

test('shoelaceArea: degenerate 2-point polygon → 0', () => {
  assert.equal(
    shoelaceArea([
      [0, 0],
      [1, 1],
    ]),
    0
  );
});

test('shoelaceArea: clockwise vs counter-clockwise — sign differs', () => {
  const ccw = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  const cw = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
  ];
  assert.equal(shoelaceArea(ccw), -shoelaceArea(cw));
});

// ── flattenCubic ─────────────────────────────────────────────

test('flattenCubic: straight line (all control points collinear) → polyline on the line', () => {
  // A degenerate Bezier where all 4 points are on y=0 — the flattened
  // points should all have y=0 too.
  const flat = flattenCubic([0, 0], [1, 0], [2, 0], [3, 0], 4);
  for (const [, y] of flat) assert.ok(Math.abs(y) < 1e-10);
});

test('flattenCubic: segments count matches request + 1', () => {
  const flat = flattenCubic([0, 0], [10, 10], [20, 10], [30, 0], 8);
  assert.equal(flat.length, 9); // segments + 1 endpoints
});

// ── matrix ops ───────────────────────────────────────────────

test('matrixDet: identity → 1', () => {
  assert.equal(matrixDet([1, 0, 0, 1, 0, 0]), 1);
});
test('matrixDet: 2× uniform scale → 4', () => {
  assert.equal(matrixDet([2, 0, 0, 2, 0, 0]), 4);
});
test('matrixMul: identity × M = M', () => {
  const id = [1, 0, 0, 1, 0, 0];
  const m = [2, 0, 0, 3, 5, 7];
  assert.deepEqual(matrixMul(id, m), m);
});
test('applyMatrix: translate (10, 20) applied to origin → (10, 20)', () => {
  assert.deepEqual(applyMatrix([1, 0, 0, 1, 10, 20], [0, 0]), [10, 20]);
});

// ── plateKey / plateName ─────────────────────────────────────

test('plateKey: spot Pantone uppercase + prefixed', () => {
  assert.equal(plateKey({ cs: 'Separation', name: 'PANTONE 485 C' }), 'spot:PANTONE 485 C');
});

test('plateKey: identical CMYK produces identical key (clusters together)', () => {
  const a = { cs: 'DeviceCMYK', values: [0, 0.95, 1, 0] };
  const b = { cs: 'DeviceCMYK', values: [0, 0.95, 1, 0] };
  assert.equal(plateKey(a), plateKey(b));
});

test('plateKey: different CMYK produces different keys', () => {
  assert.notEqual(
    plateKey({ cs: 'DeviceCMYK', values: [1, 0, 0, 0] }),
    plateKey({ cs: 'DeviceCMYK', values: [0, 1, 0, 0] })
  );
});

test('plateName: CMYK with only magenta → "M95"', () => {
  const p = plateName({ cs: 'DeviceCMYK', values: [0, 0.95, 0, 0] });
  assert.ok(p.includes('M95'), `got "${p}"`);
});

test('plateName: Separation → the spot name verbatim', () => {
  assert.equal(
    plateName({ cs: 'Separation', name: 'PANTONE Reflex Blue C' }),
    'PANTONE Reflex Blue C'
  );
});

// ── accumulatePlates ─────────────────────────────────────────
//
// Build a synthetic OPS enum + operator list that draws a 100×100
// red square at the origin with fill colour CMYK(0, 1, 1, 0).
// Verify the resulting plate has areaPdfUnits = 10000.

const FAKE_OPS = {
  save: 1,
  restore: 2,
  transform: 3,
  moveTo: 10,
  lineTo: 11,
  curveTo: 12,
  curveTo2: 13,
  curveTo3: 14,
  rectangle: 15,
  closePath: 16,
  fill: 20,
  eoFill: 21,
  fillStroke: 22,
  eoFillStroke: 23,
  closeFillStroke: 24,
  closeEOFillStroke: 25,
  endPath: 26,
  setFillRGBColor: 30,
  setStrokeRGBColor: 31,
  setFillCMYKColor: 32,
  setStrokeCMYKColor: 33,
  setFillGray: 34,
  setStrokeGray: 35,
  setFillColorN: 36,
  setStrokeColorN: 37,
  paintImageXObject: 40,
  paintJpegXObject: 41,
};

test('accumulatePlates: 100×100 CMYK red square → one plate, area 10000', () => {
  const ops = [FAKE_OPS.setFillCMYKColor, FAKE_OPS.rectangle, FAKE_OPS.fill];
  const args = [
    [0, 1, 1, 0], // setFillCMYKColor: C=0, M=1, Y=1, K=0
    [0, 0, 100, 100], // rectangle: x, y, w, h
    [], // fill
  ];
  const plates = accumulatePlates({ fnArray: ops, argsArray: args }, FAKE_OPS);
  assert.equal(plates.size, 1);
  const p = [...plates.values()][0];
  assert.ok(Math.abs(p.areaPdfUnits - 10000) < 1e-6, `got ${p.areaPdfUnits}`);
  assert.equal(p.type, 'process');
  assert.equal(p.objectCount, 1);
});

test('accumulatePlates: two rectangles same colour → one plate, summed area', () => {
  const ops = [
    FAKE_OPS.setFillCMYKColor,
    FAKE_OPS.rectangle,
    FAKE_OPS.fill,
    FAKE_OPS.rectangle,
    FAKE_OPS.fill,
  ];
  const args = [[0, 1, 1, 0], [0, 0, 10, 10], [], [20, 0, 5, 5], []];
  const plates = accumulatePlates({ fnArray: ops, argsArray: args }, FAKE_OPS);
  assert.equal(plates.size, 1);
  const p = [...plates.values()][0];
  assert.ok(Math.abs(p.areaPdfUnits - (100 + 25)) < 1e-6, `got ${p.areaPdfUnits}`);
  assert.equal(p.objectCount, 2);
});

test('accumulatePlates: two different colours → two plates', () => {
  const ops = [
    FAKE_OPS.setFillCMYKColor,
    FAKE_OPS.rectangle,
    FAKE_OPS.fill,
    FAKE_OPS.setFillRGBColor,
    FAKE_OPS.rectangle,
    FAKE_OPS.fill,
  ];
  const args = [[0, 1, 1, 0], [0, 0, 10, 10], [], [0, 0, 0], [20, 0, 10, 10], []];
  const plates = accumulatePlates({ fnArray: ops, argsArray: args }, FAKE_OPS);
  assert.equal(plates.size, 2);
});

test('accumulatePlates: CTM scale 2× multiplies area by 4', () => {
  const ops = [
    FAKE_OPS.transform, // scale 2× uniform
    FAKE_OPS.setFillCMYKColor,
    FAKE_OPS.rectangle,
    FAKE_OPS.fill,
  ];
  const args = [
    [2, 0, 0, 2, 0, 0], // CTM = 2× uniform
    [0, 1, 1, 0],
    [0, 0, 10, 10],
    [],
  ];
  const plates = accumulatePlates({ fnArray: ops, argsArray: args }, FAKE_OPS);
  const p = [...plates.values()][0];
  // 10×10 = 100 pre-scale, × |det([2,0,0,2])| = 4 → 400
  assert.ok(Math.abs(p.areaPdfUnits - 400) < 1e-6, `got ${p.areaPdfUnits}`);
});

test('accumulatePlates: q/Q save+restore isolates CTM', () => {
  const ops = [
    FAKE_OPS.save, // q
    FAKE_OPS.transform, // scale 2×
    FAKE_OPS.setFillCMYKColor,
    FAKE_OPS.rectangle,
    FAKE_OPS.fill,
    FAKE_OPS.restore, // Q — CTM reverts
    FAKE_OPS.setFillRGBColor,
    FAKE_OPS.rectangle,
    FAKE_OPS.fill,
  ];
  const args = [
    [],
    [2, 0, 0, 2, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 10, 10],
    [],
    [],
    [0, 0, 0],
    [0, 0, 10, 10],
    [],
  ];
  const plates = accumulatePlates({ fnArray: ops, argsArray: args }, FAKE_OPS);
  assert.equal(plates.size, 2);
  const [scaledPlate, normalPlate] = [...plates.values()].sort(
    (a, b) => b.areaPdfUnits - a.areaPdfUnits
  );
  // Scaled 10×10 = 400; normal 10×10 = 100
  assert.ok(Math.abs(scaledPlate.areaPdfUnits - 400) < 1e-6);
  assert.ok(Math.abs(normalPlate.areaPdfUnits - 100) < 1e-6);
});

test('accumulatePlates: image XObject → synthetic raster plate', () => {
  const ops = [FAKE_OPS.paintImageXObject];
  const args = [['img1']];
  const plates = accumulatePlates({ fnArray: ops, argsArray: args }, FAKE_OPS);
  assert.equal(plates.size, 1);
  const p = [...plates.values()][0];
  assert.equal(p.type, 'raster');
  assert.equal(p.key, 'raster:image');
});

// ── plateSwatchHex ───────────────────────────────────────────

test('plateSwatchHex: pure CMYK black → #000000', () => {
  assert.equal(plateSwatchHex({ cs: 'DeviceCMYK', values: [0, 0, 0, 1] }), '#000000');
});

test('plateSwatchHex: pure CMYK cyan → #00FFFF-ish', () => {
  const hex = plateSwatchHex({ cs: 'DeviceCMYK', values: [1, 0, 0, 0] });
  // Naive CMYK: R=0, G=255, B=255
  assert.equal(hex, '#00FFFF');
});

test('plateSwatchHex: RGB pass-through', () => {
  assert.equal(plateSwatchHex({ cs: 'DeviceRGB', values: [1, 0, 0] }), '#FF0000');
});
