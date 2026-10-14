/**
 * Copying a quote must not carry the previous RFQ's customer Target price.
 *
 * Reproduces what live data showed: quote 199 (RFQ-2026-S0057 / OP1) was
 * copied from 198 (RFQ-2026-S0059 / OP2). The operator retyped the sell
 * price and saved; the Target came along untouched — 0.1557 / 4062đ on both
 * rows — so the new RFQ carried a number its customer never gave.
 *
 * Opening a quote is the opposite case and must preserve it exactly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcReducer } from './calcReducer.js';
import { clearTargets } from '../services/copyResetTargets.js';

const blank = () => ({ isDirty: false, stdState: {}, cplxState: {} });

const load = (quoteType, state, action) =>
  calcReducer(blank(), {
    type: 'LOAD_QUOTE',
    payload: { quoteType, state, id: 7, version: 3, action },
  });

// The live pair, reduced to the fields that matter.
const Q198 = {
  rfq_number: 'RFQ-2026-S0059',
  selling_price: 0.1549,
  selling_price_vnd: 4041,
  target: 0.1557,
  target_vnd: 4062,
  usd_rate: 26090,
  extra_moqs: [{ moq: 10000, price: 0.14, price_vnd: 3653, target: 0.142, target_vnd: 3705 }],
};

test('copy clears the Target on the base tier AND every extra MOQ tier', () => {
  const s = load('std', Q198, 'copy').stdState;
  assert.equal(s.target, null, 'base target');
  assert.equal(s.target_vnd, null, 'base target VND mirror');
  assert.equal(s.extra_moqs[0].target, null, 'tier 2 target');
  assert.equal(s.extra_moqs[0].target_vnd, null, 'tier 2 target VND mirror');
});

test('copy leaves the sell price alone — it is ours, the target is the customer’s', () => {
  const s = load('std', Q198, 'copy').stdState;
  assert.equal(s.selling_price, 0.1549);
  assert.equal(s.selling_price_vnd, 4041);
  assert.equal(s.extra_moqs[0].price, 0.14);
  assert.equal(s.usd_rate, 26090, 'and the rate, or the VND mirrors break');
});

test('opening the SAME quote preserves the Target exactly', () => {
  for (const action of ['load', undefined]) {
    const s = load('std', Q198, action).stdState;
    assert.equal(s.target, 0.1557, `action=${action}`);
    assert.equal(s.target_vnd, 4062, `action=${action}`);
    assert.equal(s.extra_moqs[0].target, 0.142, `action=${action}`);
  }
});

test('complex quotes copy the same way', () => {
  const s = load('cplx', { ...Q198, subproducts: [] }, 'copy').cplxState;
  assert.equal(s.target, null);
  assert.equal(s.target_vnd, null);
  assert.equal(s.extra_moqs[0].target, null);
  assert.equal(load('cplx', { ...Q198, subproducts: [] }, 'load').cplxState.target, 0.1557);
});

// ── the helper on its own ──
test('clearTargets returns the SAME object when there is nothing to clear', () => {
  const clean = { target: null, target_vnd: null, extra_moqs: [{ moq: 1, target: null }] };
  assert.equal(clearTargets(clean), clean, 'no pointless re-render');
});

test('clearTargets tolerates a state with no tiers at all', () => {
  assert.deepEqual(clearTargets({ target: 0.2 }), { target: null, target_vnd: null });
  assert.equal(clearTargets(null), null);
  assert.equal(clearTargets(undefined), undefined);
});

test('clearTargets clears a 0 target too — 0 is a target, not "unset"', () => {
  const r = clearTargets({ target: 0, target_vnd: 0 });
  assert.equal(r.target, null);
  assert.equal(r.target_vnd, null);
});
