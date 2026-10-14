import test from 'node:test';
import assert from 'node:assert/strict';
import { nextControlInDirection, resolveTableTarget } from './gridKeyboardNav.js';

// ── resolveTableTarget (structural table nav) ────────────────────────────

// Full R×C grid where every cell has a focusable, el = `r{row}c{col}`.
function fullGrid(rows, cols) {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({ el: `r${r}c${c}` }))
  );
}

test('table: Right/Left step one column and clamp at row ends', () => {
  const g = fullGrid(3, 4);
  assert.equal(resolveTableTarget(g, { row: 1, col: 1 }, 'right'), 'r1c2');
  assert.equal(resolveTableTarget(g, { row: 1, col: 1 }, 'left'), 'r1c0');
  assert.equal(resolveTableTarget(g, { row: 1, col: 3 }, 'right'), null, 'clamp at right end');
  assert.equal(resolveTableTarget(g, { row: 1, col: 0 }, 'left'), null, 'clamp at left end');
});

test('table: Down/Up step one row in the SAME column', () => {
  const g = fullGrid(3, 4);
  assert.equal(resolveTableTarget(g, { row: 0, col: 2 }, 'down'), 'r1c2');
  assert.equal(resolveTableTarget(g, { row: 2, col: 2 }, 'up'), 'r1c2');
});

test('table: clamp at top and bottom rows', () => {
  const g = fullGrid(3, 4);
  assert.equal(resolveTableTarget(g, { row: 0, col: 1 }, 'up'), null);
  assert.equal(resolveTableTarget(g, { row: 2, col: 1 }, 'down'), null);
});

test('table: Down into a row whose same-column cell is empty → nearest focusable column', () => {
  // row1 has no control at col2; nearest is col1 (left before right on a tie).
  const g = [
    [{ el: 'r0c0' }, { el: 'r0c1' }, { el: 'r0c2' }, { el: 'r0c3' }],
    [{ el: 'r1c0' }, { el: 'r1c1' }, null, { el: 'r1c3' }],
    [{ el: 'r2c0' }, { el: 'r2c1' }, { el: 'r2c2' }, { el: 'r2c3' }],
  ];
  assert.equal(resolveTableTarget(g, { row: 0, col: 2 }, 'down'), 'r1c1');
});

test('table: Down skips a fully-empty row to the next row with a control', () => {
  const g = [
    [{ el: 'r0c0' }, { el: 'r0c1' }, { el: 'r0c2' }],
    [null, null, null], // empty row (e.g. a subtotal/derived row)
    [{ el: 'r2c0' }, { el: 'r2c1' }, { el: 'r2c2' }],
  ];
  assert.equal(resolveTableTarget(g, { row: 0, col: 1 }, 'down'), 'r2c1');
});

test('table: guards on bad input', () => {
  assert.equal(resolveTableTarget(null, { row: 0, col: 0 }, 'down'), null);
  assert.equal(resolveTableTarget(fullGrid(2, 2), null, 'down'), null);
  assert.equal(resolveTableTarget(fullGrid(2, 2), { row: 5, col: 0 }, 'down'), null);
  assert.equal(resolveTableTarget(fullGrid(2, 2), { row: 0, col: 0 }, 'sideways'), null);
});

// ── nextControlInDirection (geometry fallback) ───────────────────────────

// Rect helper: box 60 wide × 20 tall centered on (cx,cy) → tol = 10 for
// Left/Right (height/2), 30 for Up/Down (width/2).
function cell(el, cx, cy) {
  return { el, rect: { top: cy - 10, bottom: cy + 10, left: cx - 30, right: cx + 30, cx, cy } };
}
function grid3x3() {
  const cols = [100, 200, 300];
  const rows = [10, 40, 70];
  const out = [];
  rows.forEach((cy, r) => cols.forEach((cx, c) => out.push(cell(`r${r}c${c}`, cx, cy))));
  return out;
}
const rectOfId = (controls, id) => controls.find((c) => c.el === id).rect;

test('geometry: clean grid picks the immediate neighbor in every direction', () => {
  const g = grid3x3();
  const from = rectOfId(g, 'r1c1');
  assert.equal(nextControlInDirection(g, from, 'down'), 'r2c1');
  assert.equal(nextControlInDirection(g, from, 'up'), 'r0c1');
  assert.equal(nextControlInDirection(g, from, 'right'), 'r1c2');
  assert.equal(nextControlInDirection(g, from, 'left'), 'r1c0');
});

test('geometry: Right picks the same-ROW next control, NOT a horizontally-nearer other-row cell', () => {
  // Regression for the reported bug: a different-row control is x-nearer but
  // must be rejected because it is out of the row alignment band.
  const controls = [
    cell('active', 200, 40),
    cell('otherRowNearer', 230, 80), // Δx 30 (nearer) but Δy 40 > tol(10)
    cell('sameRowNext', 260, 40), // Δx 60 but same row (Δy 0)
  ];
  const from = rectOfId(controls, 'active');
  assert.equal(nextControlInDirection(controls, from, 'right'), 'sameRowNext');
});

test('geometry: Down picks the same-COLUMN next control despite >1px row jitter', () => {
  const controls = [
    cell('active', 200, 40),
    cell('adjColNearer', 280, 66), // Δy 26 (nearer) but Δx 80 > tol(30)
    cell('sameColNext', 204, 70), // Δy 30, Δx 4 (within tol) → wins
  ];
  const from = rectOfId(controls, 'active');
  assert.equal(nextControlInDirection(controls, from, 'down'), 'sameColNext');
});

test('geometry: no in-band candidate → null (clamp, never off-axis fallback)', () => {
  const controls = [cell('active', 200, 40), cell('offAxis', 280, 70)]; // Δx 80 > tol 30
  const from = rectOfId(controls, 'active');
  assert.equal(nextControlInDirection(controls, from, 'down'), null);
});

test('geometry: Down lands in the nearest aligned row, never skips', () => {
  const g = grid3x3();
  const from = rectOfId(g, 'r0c1');
  assert.equal(nextControlInDirection(g, from, 'down'), 'r1c1');
});

test('geometry: returns null at the grid edge', () => {
  const g = grid3x3();
  const topLeft = rectOfId(g, 'r0c0');
  assert.equal(nextControlInDirection(g, topLeft, 'up'), null);
  assert.equal(nextControlInDirection(g, topLeft, 'left'), null);
  const bottomRight = rectOfId(g, 'r2c2');
  assert.equal(nextControlInDirection(g, bottomRight, 'down'), null);
  assert.equal(nextControlInDirection(g, bottomRight, 'right'), null);
});

test('geometry: strictly-equal-position ties resolve to first array index', () => {
  const controls = [cell('active', 200, 40), cell('twinA', 200, 70), cell('twinB', 200, 70)];
  const from = rectOfId(controls, 'active');
  assert.equal(nextControlInDirection(controls, from, 'down'), 'twinA');
  const reversed = [controls[0], controls[2], controls[1]];
  assert.equal(nextControlInDirection(reversed, from, 'down'), 'twinB');
});

test('geometry: same-row cells are excluded from up/down', () => {
  const controls = [cell('active', 200, 40), cell('sameRow', 300, 40)];
  const from = rectOfId(controls, 'active');
  assert.equal(nextControlInDirection(controls, from, 'down'), null);
  assert.equal(nextControlInDirection(controls, from, 'up'), null);
  assert.equal(nextControlInDirection(controls, from, 'right'), 'sameRow');
});

test('geometry: guards on bad input', () => {
  assert.equal(nextControlInDirection(null, { cx: 0, cy: 0 }, 'down'), null);
  assert.equal(nextControlInDirection([], { cx: 0, cy: 0 }, 'down'), null);
  assert.equal(nextControlInDirection(grid3x3(), null, 'down'), null);
  assert.equal(nextControlInDirection(grid3x3(), { cx: 200, cy: 40 }, 'sideways'), null);
});
