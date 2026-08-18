// @ts-check
/**
 * Cutter Base Cost — polymorphic value resolver + editor helpers.
 * DATA/RESOLVER only; golden calcEngine unaffected. Runner:
 *   node --test src/services/cutterBaseCost.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCutterBaseCost,
  isTiered,
  toTiered,
  toFlat,
  normalizeTiers,
  setTierField,
  addTier,
  removeTier,
  DEFAULT_MAGNETIC_ROTARY,
} from './cutterBaseCost.js';

// ── resolve: flat ────────────────────────────────────────────────

test('flat number / numeric string returns as-is; malformed → 0', () => {
  assert.equal(resolveCutterBaseCost(150, 3), 150);
  assert.equal(resolveCutterBaseCost('150', 3), 150);
  assert.equal(resolveCutterBaseCost('45.5', 99), 45.5);
  assert.equal(resolveCutterBaseCost('', 3), 0);
  assert.equal(resolveCutterBaseCost(null, 3), 0);
  assert.equal(resolveCutterBaseCost(undefined, 3), 0);
  assert.equal(resolveCutterBaseCost('abc', 3), 0);
});

// ── resolve: tiered (Magnetic Rotary bands, upper-exclusive) ──────

test('tiered resolves each band, upper-exclusive; catch-all above', () => {
  const e = DEFAULT_MAGNETIC_ROTARY;
  assert.equal(resolveCutterBaseCost(e, 0.5), 150); // x<1.5
  assert.equal(resolveCutterBaseCost(e, 1.5), 120); // 1.5≤x<2 (boundary → next band)
  assert.equal(resolveCutterBaseCost(e, 2), 80); // 2≤x<4
  assert.equal(resolveCutterBaseCost(e, 3.9), 80);
  assert.equal(resolveCutterBaseCost(e, 4), 60); // exactly 4 → catch-all (upper-exclusive)
  assert.equal(resolveCutterBaseCost(e, 10), 60);
});

test('catch-all always matches (huge / unknown circumference)', () => {
  assert.equal(resolveCutterBaseCost({ tiers: [{ upto_m: null, cost: 60 }] }, 9999), 60);
  assert.equal(resolveCutterBaseCost(DEFAULT_MAGNETIC_ROTARY, NaN), 60); // unknown x → catch-all
  assert.equal(resolveCutterBaseCost(DEFAULT_MAGNETIC_ROTARY, undefined), 60);
});

test('tiered malformed / no matching band → 0', () => {
  assert.equal(resolveCutterBaseCost({ tiers: [] }, 3), 0);
  assert.equal(resolveCutterBaseCost({ tiers: [{ upto_m: 2, cost: 80 }] }, 10), 0); // no catch-all, 10≥2
});

test('resolve is order-robust — unsorted tiers still band correctly', () => {
  const unsorted = {
    tiers: [
      { upto_m: null, cost: 60 },
      { upto_m: 4, cost: 80 },
      { upto_m: 1.5, cost: 150 },
    ],
  };
  assert.equal(resolveCutterBaseCost(unsorted, 0.5), 150);
  assert.equal(resolveCutterBaseCost(unsorted, 3), 80);
  assert.equal(resolveCutterBaseCost(unsorted, 5), 60);
});

test('normalizeTiers sorts ascending with catch-all last', () => {
  const sorted = normalizeTiers(DEFAULT_MAGNETIC_ROTARY.tiers.slice().reverse());
  assert.deepEqual(
    sorted.map((t) => t.upto_m),
    [1.5, 2, 4, null]
  );
});

// ── converters ───────────────────────────────────────────────────

test('isTiered / toTiered / toFlat round-trip', () => {
  assert.equal(isTiered(150), false);
  assert.equal(isTiered('150'), false);
  assert.equal(isTiered({ tiers: [] }), true);
  assert.equal(isTiered(toTiered(150)), true);
  // flat → tiered starts with one catch-all carrying the flat value
  assert.deepEqual(toTiered(150), { tiers: [{ upto_m: null, cost: 150 }] });
  assert.deepEqual(toTiered(''), { tiers: [{ upto_m: null, cost: 0 }] });
  // tiered → flat takes the catch-all cost
  assert.equal(toFlat(DEFAULT_MAGNETIC_ROTARY), 60);
  assert.equal(toFlat(toTiered(150)), 150);
  // non-tiered passes through
  assert.equal(toFlat(45), 45);
});

// ── editor tier ops ──────────────────────────────────────────────

test('setTierField patches immutably', () => {
  const tiers = [
    { upto_m: 1.5, cost: 150 },
    { upto_m: null, cost: 60 },
  ];
  const next = setTierField(tiers, 0, 'cost', '175');
  assert.equal(next[0].cost, '175');
  assert.equal(tiers[0].cost, 150); // original untouched
  assert.equal(next[1], tiers[1]); // other row shared
});

test('addTier inserts a blank tier before the catch-all; removeTier drops by index', () => {
  const tiers = [
    { upto_m: 1.5, cost: 150 },
    { upto_m: null, cost: 60 },
  ];
  const added = addTier(tiers);
  assert.equal(added.length, 3);
  assert.deepEqual(added[1], { upto_m: '', cost: '' }); // inserted before catch-all
  assert.equal(added[2].upto_m, null); // catch-all stays last
  const removed = removeTier(added, 1);
  assert.deepEqual(
    removed.map((t) => t.upto_m),
    [1.5, null]
  );
});

test('addTier with no catch-all appends', () => {
  const added = addTier([{ upto_m: 1.5, cost: 150 }]);
  assert.equal(added.length, 2);
  assert.deepEqual(added[1], { upto_m: '', cost: '' });
});
