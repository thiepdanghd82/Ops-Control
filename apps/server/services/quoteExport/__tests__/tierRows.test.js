// @ts-check
/**
 * Pure-helper unit tests for tierRows.js. Independent of ExcelJS so
 * they run fast and pin the resolution + fallback semantics.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickStdTierRows,
  pickCpxTierRows,
  sumRowCosts,
  getActiveIdx,
  getTierMoq,
} from '../tierRows.js';

test('pickStdTierRows: returns tier-indexed rows when present', () => {
  const result = {
    rows: { materials_main: [{ setup_cost: 1 }] },
    tiers: [
      { rows: { materials_main: [{ setup_cost: 1 }] } },
      { rows: { materials_main: [{ setup_cost: 2 }] } },
    ],
  };
  const rows0 = pickStdTierRows(result, 0, 'materials_main');
  const rows1 = pickStdTierRows(result, 1, 'materials_main');
  assert.equal(rows0[0].setup_cost, 1);
  assert.equal(rows1[0].setup_cost, 2);
});

test('pickStdTierRows: falls back to result.rows mirror when tiers absent (legacy)', () => {
  const result = { rows: { materials_main: [{ setup_cost: 1 }] } };
  const rows = pickStdTierRows(result, 0, 'materials_main');
  assert.equal(rows[0].setup_cost, 1);
});

test('pickStdTierRows: falls back to mirror when tier index out of range', () => {
  const result = {
    rows: { materials_main: [{ setup_cost: 9 }] },
    tiers: [{ rows: { materials_main: [{ setup_cost: 1 }] } }],
  };
  // Tier 5 doesn't exist → mirror
  assert.equal(pickStdTierRows(result, 5, 'materials_main')[0].setup_cost, 9);
});

test('pickStdTierRows: returns null when neither path exists', () => {
  assert.equal(pickStdTierRows({}, 0, 'materials_main'), null);
  assert.equal(pickStdTierRows(null, 0, 'materials_main'), null);
});

test('pickStdTierRows: returns null when section name unknown', () => {
  const result = { tiers: [{ rows: { materials_main: [] } }] };
  assert.equal(pickStdTierRows(result, 0, 'lasers'), null);
});

test('pickCpxTierRows: returns per-SP per-tier rows when present', () => {
  const result = {
    subproducts: [
      {
        rows: { inks: [{ setup_cost: 5 }] },
        tiers: [{ rows: { inks: [{ setup_cost: 5 }] } }, { rows: { inks: [{ setup_cost: 7 }] } }],
      },
    ],
  };
  assert.equal(pickCpxTierRows(result, 0, 0, 'inks')[0].setup_cost, 5);
  assert.equal(pickCpxTierRows(result, 0, 1, 'inks')[0].setup_cost, 7);
});

test('pickCpxTierRows: returns null for missing subproduct', () => {
  const result = { subproducts: [] };
  assert.equal(pickCpxTierRows(result, 3, 0, 'inks'), null);
});

test('pickCpxTierRows: falls back to subproduct.rows mirror when tiers missing', () => {
  const result = { subproducts: [{ rows: { inks: [{ setup_cost: 42 }] } }] };
  assert.equal(pickCpxTierRows(result, 0, 0, 'inks')[0].setup_cost, 42);
});

test('sumRowCosts: returns hasAny=false for null / empty', () => {
  assert.deepEqual(sumRowCosts(null), { setup: 0, run: 0, total: 0, hasAny: false });
  assert.deepEqual(sumRowCosts([]), { setup: 0, run: 0, total: 0, hasAny: false });
});

test('sumRowCosts: sums setup_cost + run_cost across rows', () => {
  const t = sumRowCosts([
    { setup_cost: 1, run_cost: 2 },
    { setup_cost: 0.5, run_cost: 1.5 },
  ]);
  assert.equal(t.setup, 1.5);
  assert.equal(t.run, 3.5);
  assert.equal(t.total, 5);
  assert.equal(t.hasAny, true);
});

test('sumRowCosts: skips rows without finite numbers', () => {
  const t = sumRowCosts([
    { setup_cost: 1, run_cost: 2 },
    { setup_cost: '—', run_cost: NaN },
    null,
    { setup_cost: 0.5 },
  ]);
  assert.equal(t.setup, 1.5);
  assert.equal(t.run, 2);
  assert.equal(t.hasAny, true);
});

test('getActiveIdx: defaults to 0 when absent', () => {
  assert.equal(getActiveIdx({}), 0);
  assert.equal(getActiveIdx({ state: {} }), 0);
  assert.equal(getActiveIdx({ state: { active_moq_idx: 2 } }), 2);
});

test('getTierMoq: tier 0 reads state.moq; later tiers read extra_moqs', () => {
  const q = {
    state: {
      moq: 500,
      extra_moqs: [{ moq: 1000 }, { moq: 5000 }],
    },
  };
  assert.equal(getTierMoq(q, 0), 500);
  assert.equal(getTierMoq(q, 1), 1000);
  assert.equal(getTierMoq(q, 2), 5000);
  assert.equal(getTierMoq(q, 99), null);
});

test('getTierMoq: returns null when state missing', () => {
  assert.equal(getTierMoq({}, 0), null);
  assert.equal(getTierMoq(null, 0), null);
});
