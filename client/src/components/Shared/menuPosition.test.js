import test from 'node:test';
import assert from 'node:assert/strict';
import { placeMenu, clampMenu } from './menuPosition.js';

// Fixed viewport for deterministic math (no window in node).
const VW = 1000;
const VH = 800;
const MW = 200;
const MH = 120;
const base = { menuW: MW, menuH: MH, margin: 8, vw: VW, vh: VH };

test('placeMenu — opens below/right at the cursor when there is room', () => {
  const { left, top } = placeMenu({ x: 100, y: 100, ...base });
  assert.equal(left, 100);
  assert.equal(top, 100);
});

test('placeMenu — flips UP near the bottom edge', () => {
  const { top } = placeMenu({ x: 100, y: 780, ...base });
  // 780 + 120 = 900 > 800 → flip above: 780 - 120 = 660.
  assert.equal(top, 660);
});

test('placeMenu — flips LEFT near the right edge', () => {
  const { left } = placeMenu({ x: 950, y: 100, ...base });
  // 950 + 200 = 1150 > 1000 → flip left: 950 - 200 = 750.
  assert.equal(left, 750);
});

test('placeMenu — clamps to the right/bottom max on overflow', () => {
  const { left, top } = placeMenu({ x: 5000, y: 5000, ...base });
  // Flipped then clamped to [margin, vp - size - margin].
  assert.equal(left, VW - MW - 8); // 792
  assert.equal(top, VH - MH - 8); // 672
});

test('placeMenu — clamps to the left/top margin for negative coords', () => {
  const { left, top } = placeMenu({ x: -50, y: -80, ...base });
  assert.equal(left, 8);
  assert.equal(top, 8);
});

test('placeMenu — menu taller than the viewport pins to top margin (never negative)', () => {
  const { top } = placeMenu({ x: 40, y: 40, menuW: 200, menuH: 300, margin: 8, vw: 400, vh: 80 });
  // 40 + 300 > 80 → flip to -260 → clamp → max(8, min(-260, 80-300-8)) = 8.
  assert.equal(top, 8);
  assert.ok(top >= 0);
});

test('clampMenu — clamps independently on all four edges', () => {
  assert.deepEqual(clampMenu({ left: -100, top: -100, ...base }), { left: 8, top: 8 });
  assert.deepEqual(clampMenu({ left: 9999, top: 9999, ...base }), {
    left: VW - MW - 8,
    top: VH - MH - 8,
  });
  assert.deepEqual(clampMenu({ left: 300, top: 300, ...base }), { left: 300, top: 300 });
});

test('clampMenu — box larger than viewport pins to margin, never negative', () => {
  const r = clampMenu({ left: 500, top: 500, menuW: 900, menuH: 900, margin: 8, vw: 400, vh: 400 });
  assert.equal(r.left, 8);
  assert.equal(r.top, 8);
});
