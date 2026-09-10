/**
 * Reducer routing for per-MOQ packing/shipping override — sprint
 * S-PACK-SHIP-PER-TIER step 2. Writes 10 pack/ship fields routed by
 * `active_moq_idx`:
 *   tier 0 → top-level `state[field]` (mirrors SET_STD_FIELD / SET_CPLX_FIELD)
 *   tier>0 → `extra_moqs[idx-1].packing[field]` (sparse — only overridden keys)
 *
 * Henry's invariants (Q3 + dễ-vỡ case + immutability):
 *   - empty string / null → delete the key (revert to base on next read)
 *   - explicit 0 → key present with value 0 (real override; NOT swallowed)
 *   - new object refs at every level so React sees the change
 *
 *   node --test src/context/calcReducer.packingTier.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcReducer, CALC_ACTIONS as A } from './calcReducer.js';

// Minimal initial state — only the slices the reducer touches for
// packing-tier routing are required. `extra_moqs` carries two tiers so
// the isolation test can prove no spillover.
function initialState({ activeIdx = 0, extra_moqs = null } = {}) {
  return {
    isDirty: false,
    stdState: {
      _schema_version: 3,
      container_cost: 5,
      pcs_per_bag: 100,
      other_ship: 50,
      shipping_cost: 200,
      active_moq_idx: activeIdx,
      extra_moqs: extra_moqs ?? [{ moq: 2000, packing: { pcs_per_bag: 200 } }, { moq: 5000 }],
    },
    cplxState: {
      _shape_version: 4,
      container_cost: 5,
      pcs_per_bag: 100,
      other_ship: 50,
      shipping_cost: 200,
      active_moq_idx: activeIdx,
      extra_moqs: extra_moqs ?? [{ moq: 2000, packing: { pcs_per_bag: 200 } }, { moq: 5000 }],
    },
  };
}

// ── Std ──

test('SET_STD_TIER_PACKING_FIELD [tier 0]: routes to top-level state field', () => {
  const prev = initialState({ activeIdx: 0 });
  const next = calcReducer(prev, {
    type: A.SET_STD_TIER_PACKING_FIELD,
    payload: { field: 'container_cost', value: 9 },
  });
  assert.equal(next.stdState.container_cost, 9, 'top-level updated');
  // extra_moqs untouched — no phantom packing[*] write.
  assert.deepEqual(next.stdState.extra_moqs, prev.stdState.extra_moqs);
  assert.equal(next.isDirty, true);
});

test('SET_STD_TIER_PACKING_FIELD [tier 1]: writes extra_moqs[0].packing only', () => {
  const prev = initialState({ activeIdx: 1 });
  const next = calcReducer(prev, {
    type: A.SET_STD_TIER_PACKING_FIELD,
    payload: { field: 'container_cost', value: 9 },
  });
  // Tier 0 (top-level) untouched.
  assert.equal(next.stdState.container_cost, 5, 'top-level base preserved');
  // Tier 1 packing updated; pre-existing pcs_per_bag preserved.
  assert.equal(next.stdState.extra_moqs[0].packing.container_cost, 9);
  assert.equal(next.stdState.extra_moqs[0].packing.pcs_per_bag, 200, 'pre-existing key preserved');
  // Tier 2 untouched.
  assert.equal(next.stdState.extra_moqs[1].packing, undefined, 'tier 2 still has no packing');
});

test('SET_STD_TIER_PACKING_FIELD [tier 1, empty string]: deletes key (revert to base)', () => {
  const prev = initialState({ activeIdx: 1 });
  // Pre-condition: tier 1 has packing.pcs_per_bag = 200.
  assert.equal(prev.stdState.extra_moqs[0].packing.pcs_per_bag, 200);
  const next = calcReducer(prev, {
    type: A.SET_STD_TIER_PACKING_FIELD,
    payload: { field: 'pcs_per_bag', value: '' },
  });
  // Key REMOVED, not set to 0.
  assert.ok(
    !('pcs_per_bag' in next.stdState.extra_moqs[0].packing),
    'pcs_per_bag key deleted on empty input'
  );
});

test('SET_STD_TIER_PACKING_FIELD [tier 1, null]: deletes key (revert to base)', () => {
  const prev = initialState({ activeIdx: 1 });
  const next = calcReducer(prev, {
    type: A.SET_STD_TIER_PACKING_FIELD,
    payload: { field: 'pcs_per_bag', value: null },
  });
  assert.ok(!('pcs_per_bag' in next.stdState.extra_moqs[0].packing), 'null also deletes');
});

test('SET_STD_TIER_PACKING_FIELD [tier 1, explicit 0]: stores key with value 0', () => {
  // Henry's dễ-vỡ case at the reducer layer. "0" is a real override
  // (operator confirmed "no other ship for this tier"), NOT a synonym
  // for "revert". Must NOT be swallowed by truthiness checks.
  const prev = initialState({ activeIdx: 1 });
  const next = calcReducer(prev, {
    type: A.SET_STD_TIER_PACKING_FIELD,
    payload: { field: 'other_ship', value: 0 },
  });
  assert.ok(
    'other_ship' in next.stdState.extra_moqs[0].packing,
    'other_ship key MUST exist (not deleted)'
  );
  assert.equal(next.stdState.extra_moqs[0].packing.other_ship, 0, 'value is 0');
});

test('SET_STD_TIER_PACKING_FIELD: immutable — new refs at every level', () => {
  const prev = initialState({ activeIdx: 1 });
  const prevExtras = prev.stdState.extra_moqs;
  const prevEm = prev.stdState.extra_moqs[0];
  const prevPacking = prev.stdState.extra_moqs[0].packing;
  const next = calcReducer(prev, {
    type: A.SET_STD_TIER_PACKING_FIELD,
    payload: { field: 'shipping_cost', value: 400 },
  });
  assert.notEqual(next, prev, 'state ref new');
  assert.notEqual(next.stdState, prev.stdState, 'stdState ref new');
  assert.notEqual(next.stdState.extra_moqs, prevExtras, 'extra_moqs ref new');
  assert.notEqual(next.stdState.extra_moqs[0], prevEm, 'extra_moqs[0] ref new');
  assert.notEqual(next.stdState.extra_moqs[0].packing, prevPacking, 'packing ref new');
  // Sanity: prev still has its original packing keys (no in-place mutation).
  assert.equal(prevPacking.pcs_per_bag, 200, 'prev.packing untouched');
  assert.equal(prevPacking.shipping_cost, undefined, 'prev.packing did not gain key');
});

test('SET_STD_TIER_PACKING_FIELD [tier 1, new tier without packing key]: creates packing object', () => {
  const prev = initialState({ activeIdx: 2 }); // tier 2 lacks `packing` key
  const next = calcReducer(prev, {
    type: A.SET_STD_TIER_PACKING_FIELD,
    payload: { field: 'shipping_cost', value: 500 },
  });
  assert.deepEqual(next.stdState.extra_moqs[1].packing, { shipping_cost: 500 });
  // Tier 1 (already had packing) untouched.
  assert.deepEqual(next.stdState.extra_moqs[0].packing, { pcs_per_bag: 200 });
});

// ── Cpx (parallel) ──

test('SET_CPLX_TIER_PACKING_FIELD [tier 0]: routes to top-level cplxState field', () => {
  const prev = initialState({ activeIdx: 0 });
  const next = calcReducer(prev, {
    type: A.SET_CPLX_TIER_PACKING_FIELD,
    payload: { field: 'container_cost', value: 9 },
  });
  assert.equal(next.cplxState.container_cost, 9);
  assert.deepEqual(next.cplxState.extra_moqs, prev.cplxState.extra_moqs);
  assert.equal(next.isDirty, true);
});

test('SET_CPLX_TIER_PACKING_FIELD [tier 1]: writes cplxState.extra_moqs[0].packing only', () => {
  const prev = initialState({ activeIdx: 1 });
  const next = calcReducer(prev, {
    type: A.SET_CPLX_TIER_PACKING_FIELD,
    payload: { field: 'container_cost', value: 9 },
  });
  assert.equal(next.cplxState.container_cost, 5, 'top-level base preserved');
  assert.equal(next.cplxState.extra_moqs[0].packing.container_cost, 9);
  assert.equal(next.cplxState.extra_moqs[0].packing.pcs_per_bag, 200);
  assert.equal(next.cplxState.extra_moqs[1].packing, undefined);
});

test('SET_CPLX_TIER_PACKING_FIELD [tier 1, empty]: deletes key', () => {
  const prev = initialState({ activeIdx: 1 });
  const next = calcReducer(prev, {
    type: A.SET_CPLX_TIER_PACKING_FIELD,
    payload: { field: 'pcs_per_bag', value: '' },
  });
  assert.ok(!('pcs_per_bag' in next.cplxState.extra_moqs[0].packing));
});

test('SET_CPLX_TIER_PACKING_FIELD [tier 1, explicit 0]: stores value 0', () => {
  const prev = initialState({ activeIdx: 1 });
  const next = calcReducer(prev, {
    type: A.SET_CPLX_TIER_PACKING_FIELD,
    payload: { field: 'other_ship', value: 0 },
  });
  assert.ok('other_ship' in next.cplxState.extra_moqs[0].packing);
  assert.equal(next.cplxState.extra_moqs[0].packing.other_ship, 0);
});

test('SET_CPLX_TIER_PACKING_FIELD: immutable — new refs', () => {
  const prev = initialState({ activeIdx: 1 });
  const prevPacking = prev.cplxState.extra_moqs[0].packing;
  const next = calcReducer(prev, {
    type: A.SET_CPLX_TIER_PACKING_FIELD,
    payload: { field: 'shipping_cost', value: 400 },
  });
  assert.notEqual(next.cplxState, prev.cplxState);
  assert.notEqual(next.cplxState.extra_moqs, prev.cplxState.extra_moqs);
  assert.notEqual(next.cplxState.extra_moqs[0], prev.cplxState.extra_moqs[0]);
  assert.notEqual(next.cplxState.extra_moqs[0].packing, prevPacking);
  assert.equal(prevPacking.shipping_cost, undefined, 'prev.packing did not gain key');
});
