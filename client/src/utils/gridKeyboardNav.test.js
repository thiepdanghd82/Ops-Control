import test from 'node:test';
import assert from 'node:assert/strict';
import { nextControlInDirection } from './gridKeyboardNav.js';

// Minimal rect — nextControlInDirection only reads cx/cy, but include the box
// fields so the fixtures read like real getBoundingClientRect output.
function cell(el, cx, cy) {
  return { el, rect: { top: cy - 10, bottom: cy + 10, left: cx - 30, right: cx + 30, cx, cy } };
}

// Clean 3×3 grid: columns at cx 100/200/300, rows at cy 10/40/70.
function grid3x3() {
  const cols = [100, 200, 300];
  const rows = [10, 40, 70];
  const out = [];
  rows.forEach((cy, r) => cols.forEach((cx, c) => out.push(cell(`r${r}c${c}`, cx, cy))));
  return out;
}
const active = (controls, id) => controls.find((c) => c.el === id).rect;

test('down / up / left / right pick the immediate neighbor in a clean grid', () => {
  const g = grid3x3();
  const from = active(g, 'r1c1');
  assert.equal(nextControlInDirection(g, from, 'down'), 'r2c1');
  assert.equal(nextControlInDirection(g, from, 'up'), 'r0c1');
  assert.equal(nextControlInDirection(g, from, 'right'), 'r1c2');
  assert.equal(nextControlInDirection(g, from, 'left'), 'r1c0');
});

test('down lands in the NEAREST row, never skips to a farther aligned cell', () => {
  const g = grid3x3();
  const from = active(g, 'r0c1'); // cy 10
  // r1c1 (cy40) and r2c1 (cy70) are both perfectly aligned; must pick r1c1.
  assert.equal(nextControlInDirection(g, from, 'down'), 'r1c1');
});

test('down prefers the nearer row even when that row cell is misaligned', () => {
  const controls = [
    cell('active', 200, 40),
    cell('near-misaligned', 280, 70), // next row, 80px off column
    cell('far-aligned', 200, 100), // two rows down, perfectly aligned
  ];
  const from = active(controls, 'active');
  assert.equal(nextControlInDirection(controls, from, 'down'), 'near-misaligned');
});

test('ragged row → nearest by x within the nearest row below', () => {
  const controls = [
    cell('active', 200, 40),
    cell('below-a', 150, 70), // miss 50
    cell('below-b', 300, 70), // miss 100
  ];
  const from = active(controls, 'active');
  assert.equal(nextControlInDirection(controls, from, 'down'), 'below-a');
});

test('returns null at the grid edge (no candidate in that direction)', () => {
  const g = grid3x3();
  const topLeft = active(g, 'r0c0');
  assert.equal(nextControlInDirection(g, topLeft, 'up'), null);
  assert.equal(nextControlInDirection(g, topLeft, 'left'), null);
  const bottomRight = active(g, 'r2c2');
  assert.equal(nextControlInDirection(g, bottomRight, 'down'), null);
  assert.equal(nextControlInDirection(g, bottomRight, 'right'), null);
});

test('right / left use nearest column with vertical misalignment as tiebreak', () => {
  const controls = [
    cell('active', 200, 40),
    cell('near-right', 260, 80), // 60px right, 40px down
    cell('far-right', 300, 40), // 100px right, aligned row
  ];
  const from = active(controls, 'active');
  // Nearest column to the right wins (primary = horizontal distance).
  assert.equal(nextControlInDirection(controls, from, 'right'), 'near-right');
});

test('strictly-equal-position ties resolve deterministically to first index', () => {
  const controls = [
    cell('active', 200, 40),
    cell('twinA', 200, 70),
    cell('twinB', 200, 70), // identical rect to twinA
  ];
  const from = active(controls, 'active');
  assert.equal(nextControlInDirection(controls, from, 'down'), 'twinA');
  // Reversed input order → the other twin wins, proving it's array-order stable.
  const reversed = [controls[0], controls[2], controls[1]];
  assert.equal(nextControlInDirection(reversed, from, 'down'), 'twinB');
});

test('same-row cells are not "below" (excluded from down) and vice-versa', () => {
  const controls = [cell('active', 200, 40), cell('same-row', 300, 40)];
  const from = active(controls, 'active');
  assert.equal(nextControlInDirection(controls, from, 'down'), null);
  assert.equal(nextControlInDirection(controls, from, 'up'), null);
  assert.equal(nextControlInDirection(controls, from, 'right'), 'same-row');
});

test('guards: bad inputs → null', () => {
  assert.equal(nextControlInDirection(null, { cx: 0, cy: 0 }, 'down'), null);
  assert.equal(nextControlInDirection([], { cx: 0, cy: 0 }, 'down'), null);
  assert.equal(nextControlInDirection(grid3x3(), null, 'down'), null);
  assert.equal(nextControlInDirection(grid3x3(), { cx: 200, cy: 40 }, 'sideways'), null);
});
