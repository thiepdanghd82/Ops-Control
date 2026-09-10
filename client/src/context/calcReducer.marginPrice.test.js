/**
 * Margin→price back-solve write path (Cost Breakdown price↔margin inversion).
 *
 * The Cost Breakdown tab plans its writes with priceSolver.planTierPriceWrite
 * and dispatches them through the EXISTING reducer actions. This test proves
 * the planned actions land in the correct slice (Std vs Cpx — MES-3-FIX-53),
 * write the right price/target field, carry the USD↔VND mirror, and never
 * clobber an operator-entered price during auto-seed.
 *
 *   node --test src/context/calcReducer.marginPrice.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcReducer } from './calcReducer.js';
import { planTierPriceWrite, isEmptyPrice } from '../services/priceSolver.js';

function initialState() {
  return {
    isDirty: false,
    stdState: {
      _schema_version: 3,
      moq: 500,
      selling_price: 0,
      selling_price_vnd: 0,
      target: null,
      target_vnd: null,
      extra_moqs: [
        { moq: 1000, price: 0, eau: 5000, price_vnd: 0, target: null, target_vnd: null },
      ],
    },
    cplxState: {
      _shape_version: 4,
      moq: 500,
      selling_price: 0,
      selling_price_vnd: 0,
      target: null,
      target_vnd: null,
      extra_moqs: [
        { moq: 2000, price: 0, eau: null, price_vnd: 0, target: null, target_vnd: null },
      ],
    },
  };
}

function run(state, actions) {
  return actions.reduce((s, a) => calcReducer(s, a), state);
}

test('Std Selling edit (tier 0) writes stdState.selling_price + VND mirror', () => {
  const actions = planTierPriceWrite({
    kind: 'std',
    table: 'selling',
    tierIdx: 0,
    usd: 0.141,
    rate: 25000,
  });
  const s = run(initialState(), actions);
  assert.equal(s.stdState.selling_price, 0.141);
  assert.equal(s.stdState.selling_price_vnd, 3525);
  assert.equal(s.isDirty, true);
  // Cpx slice untouched.
  assert.equal(s.cplxState.selling_price, 0);
});

test('Std Selling edit (tier>0) writes stdState.extra_moqs[i].price + price_vnd', () => {
  const actions = planTierPriceWrite({
    kind: 'std',
    table: 'selling',
    tierIdx: 1,
    usd: 0.13,
    rate: 25000,
  });
  const s = run(initialState(), actions);
  assert.equal(s.stdState.extra_moqs[0].price, 0.13);
  assert.equal(s.stdState.extra_moqs[0].price_vnd, 3250);
});

test('Std Target edit (tier 0) writes stdState.target + target_vnd', () => {
  const actions = planTierPriceWrite({
    kind: 'std',
    table: 'target',
    tierIdx: 0,
    usd: 0.1005,
    rate: 25000,
  });
  const s = run(initialState(), actions);
  assert.equal(s.stdState.target, 0.1005);
  assert.equal(s.stdState.target_vnd, 2513);
});

test('Cpx Selling edit (tier 0) writes cplxState.selling_price (NOT stdState) + VND mirror', () => {
  const actions = planTierPriceWrite({
    kind: 'cpx',
    table: 'selling',
    tierIdx: 0,
    usd: 0.2,
    rate: 25000,
  });
  const s = run(initialState(), actions);
  assert.equal(s.cplxState.selling_price, 0.2);
  assert.equal(s.cplxState.selling_price_vnd, 5000);
  // Std slice untouched (MES-3-FIX-53 — no cross-slice bleed).
  assert.equal(s.stdState.selling_price, 0);
});

test('Cpx Target edit (tier>0) writes cplxState.extra_moqs[i].target + target_vnd', () => {
  const actions = planTierPriceWrite({
    kind: 'cpx',
    table: 'target',
    tierIdx: 1,
    usd: 0.1005,
    rate: 25000,
  });
  const s = run(initialState(), actions);
  assert.equal(s.cplxState.extra_moqs[0].target, 0.1005);
  assert.equal(s.cplxState.extra_moqs[0].target_vnd, 2513);
  assert.equal(s.stdState.extra_moqs[0].target, null);
});

test('auto-seed guard — a manual (non-empty) price is NOT eligible, so it is never overwritten', () => {
  // Simulate the tab: seed ONLY when isEmptyPrice(current) is true.
  const state = initialState();
  state.stdState.selling_price = 0.18; // operator-entered
  const current = state.stdState.selling_price;
  assert.equal(isEmptyPrice(current), false, 'manual price is not empty → skip seed');
  // If the tab respected the guard it would dispatch nothing; prove the guard.
  const seedActions = isEmptyPrice(current)
    ? planTierPriceWrite({ kind: 'std', table: 'selling', tierIdx: 0, usd: 0.141, rate: 25000 })
    : [];
  const s = run(state, seedActions);
  assert.equal(s.stdState.selling_price, 0.18); // unchanged
});

test('auto-seed applies only to an empty tier', () => {
  const state = initialState(); // selling_price = 0 → empty
  assert.equal(isEmptyPrice(state.stdState.selling_price), true);
  const seedActions = planTierPriceWrite({
    kind: 'std',
    table: 'selling',
    tierIdx: 0,
    usd: 0.141,
    rate: 25000,
  });
  const s = run(state, seedActions);
  assert.equal(s.stdState.selling_price, 0.141);
});
