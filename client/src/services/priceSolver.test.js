import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARGIN_POLICY,
  solveMetric,
  defaultPriceFromEval,
  priceFields,
  planTierPriceWrite,
  isEmptyPrice,
  belowFloor,
} from './priceSolver.js';

const TOL = 1e-6;

// Price-independent metric: metric(p) = 1 − cost/p (monotone increasing).
const indep = (cost) => (p) => (p > 0 ? 1 - cost / p : null);

// Price-dependent VAT: a cost term that is a fraction k of price, so
// metric(p) = 1 − (base + k·p)/p = 1 − base/p − k. The naive algebra
// p = base/(1−target) is WRONG here; only a numeric solve is exact.
const withVat = (base, k) => (p) => (p > 0 ? 1 - (base + k * p) / p : null);

test('solveMetric — round-trips the metric at the returned price (price-independent)', () => {
  const f = indep(0.1);
  const p = solveMetric(f, 0.25);
  assert.ok(p != null);
  assert.ok(Math.abs(f(p) - 0.25) <= TOL);
  assert.ok(Math.abs(p - 0.1 / 0.75) < 1e-4); // analytic 0.13333…
});

test('solveMetric — round-trips a PRICE-DEPENDENT (VAT) cost, where naive algebra drifts', () => {
  const base = 0.1;
  const k = 0.05; // 5% of price is VAT loss
  const f = withVat(base, k);
  const p = solveMetric(f, 0.25);
  assert.ok(p != null);
  assert.ok(Math.abs(f(p) - 0.25) <= TOL, 'numeric solve is exact');
  // The naive (algebra) price ignores k and lands off-target — proves why we
  // must solve numerically against the forward calc.
  const naive = base / (1 - 0.25);
  assert.ok(Math.abs(f(naive) - 0.25) > 1e-3, 'naive algebra drifts');
});

test('solveMetric — higher target needs a higher price (monotonic)', () => {
  const f = indep(0.1);
  const p25 = solveMetric(f, 0.25);
  const p40 = solveMetric(f, 0.4);
  assert.ok(p40 > p25);
});

test('solveMetric — unsolvable → null (cost base ≤ 0, target ≥ 100%, non-finite)', () => {
  assert.equal(solveMetric(indep(0), 0.25), null); // metric = 1 at every price
  assert.equal(solveMetric(indep(-0.2), 0.25), null); // margin always > 100%
  assert.equal(solveMetric(indep(0.1), 1), null); // 100% unreachable
  assert.equal(solveMetric(indep(0.1), 1.2), null); // > 100%
  assert.equal(solveMetric(indep(0.1), NaN), null);
  assert.equal(
    solveMetric(() => null, 0.25),
    null
  ); // evaluator can't compute
});

test('defaultPriceFromEval — GM binds in the normal case (boundBy = gm)', () => {
  // gm cost 0.10 → 0.1333; contr 0.09 → 0.12; va 0.07 → 0.10. GM is highest.
  const evalAll = (p) => ({
    gm: indep(0.1)(p),
    contribution: indep(0.09)(p),
    va: indep(0.07)(p),
  });
  const d = defaultPriceFromEval(evalAll);
  assert.equal(d.boundBy, 'gm');
  assert.ok(Math.abs(d.price - 0.1 / 0.75) < 1e-4);
  // At the default, GM is exactly 25% and the secondary floors hold.
  assert.ok(Math.abs(evalAll(d.price).gm - 0.25) <= 1e-4);
  assert.ok(evalAll(d.price).contribution >= 0.25 - 1e-6);
  assert.ok(evalAll(d.price).va >= 0.3 - 1e-6);
});

test('defaultPriceFromEval — VA-30 floor binds higher than GM-25 (boundBy = va, price raised)', () => {
  // gm cost 0.10 → p_gm 0.13333; va cost 0.10 → p_va 0.10/0.70 = 0.142857 (higher)
  const evalAll = (p) => ({
    gm: indep(0.1)(p),
    contribution: indep(0.05)(p),
    va: indep(0.1)(p),
  });
  const d = defaultPriceFromEval(evalAll);
  assert.equal(d.boundBy, 'va');
  assert.ok(d.price > 0.1 / 0.75, 'raised above the GM-25 price');
  assert.ok(Math.abs(d.price - 0.1 / 0.7) < 1e-4);
  // GM at the raised price is comfortably above 25%.
  assert.ok(evalAll(d.price).gm > 0.25);
});

test('defaultPriceFromEval — none solvable → null', () => {
  const evalAll = () => ({ gm: 1, va: 1, contribution: 1 });
  assert.equal(defaultPriceFromEval(evalAll), null);
});

test('MARGIN_POLICY — the tunable floors', () => {
  assert.equal(MARGIN_POLICY.primary, 'gm');
  assert.equal(MARGIN_POLICY.gm, 0.25);
  assert.equal(MARGIN_POLICY.contr, 0.25);
  assert.equal(MARGIN_POLICY.va, 0.3);
});

test('priceFields — correct USD/VND field per table + tier', () => {
  assert.deepEqual(priceFields('selling', 0), { usd: 'selling_price', vnd: 'selling_price_vnd' });
  assert.deepEqual(priceFields('selling', 2), { usd: 'price', vnd: 'price_vnd' });
  assert.deepEqual(priceFields('target', 0), { usd: 'target', vnd: 'target_vnd' });
  assert.deepEqual(priceFields('target', 3), { usd: 'target', vnd: 'target_vnd' });
});

test('planTierPriceWrite — Std tier 0 selling → SET_STD_FIELD + VND mirror', () => {
  const a = planTierPriceWrite({
    kind: 'std',
    table: 'selling',
    tierIdx: 0,
    usd: 0.141,
    rate: 25000,
  });
  assert.deepEqual(a, [
    { type: 'SET_STD_FIELD', payload: { field: 'selling_price', value: 0.141 } },
    { type: 'SET_STD_FIELD', payload: { field: 'selling_price_vnd', value: 3525 } },
  ]);
});

test('planTierPriceWrite — Std tier>0 selling → SET_EXTRA_MOQ (idx tier-1) price + price_vnd', () => {
  const a = planTierPriceWrite({
    kind: 'std',
    table: 'selling',
    tierIdx: 1,
    usd: 0.2,
    rate: 25000,
  });
  assert.deepEqual(a, [
    { type: 'SET_EXTRA_MOQ', payload: { idx: 0, field: 'price', value: 0.2 } },
    { type: 'SET_EXTRA_MOQ', payload: { idx: 0, field: 'price_vnd', value: 5000 } },
  ]);
});

test('planTierPriceWrite — Cpx target tier>0 → SET_CPLX_EXTRA_MOQ target + target_vnd', () => {
  const a = planTierPriceWrite({
    kind: 'cpx',
    table: 'target',
    tierIdx: 2,
    usd: 0.1005,
    rate: 25000,
  });
  assert.deepEqual(a, [
    { type: 'SET_CPLX_EXTRA_MOQ', payload: { idx: 1, field: 'target', value: 0.1005 } },
    { type: 'SET_CPLX_EXTRA_MOQ', payload: { idx: 1, field: 'target_vnd', value: 2513 } },
  ]);
});

test('planTierPriceWrite — no rate → no VND mirror action', () => {
  const a = planTierPriceWrite({ kind: 'std', table: 'selling', tierIdx: 0, usd: 0.141, rate: 0 });
  assert.equal(a.length, 1);
  assert.equal(a[0].payload.field, 'selling_price');
});

test('isEmptyPrice — only positive numbers are non-empty', () => {
  for (const v of [null, undefined, '', 0, '0', NaN, -1]) assert.equal(isEmptyPrice(v), true);
  for (const v of [0.1, '0.2', 5]) assert.equal(isEmptyPrice(v), false);
});

test('belowFloor — flags any metric under its floor', () => {
  assert.equal(belowFloor({ gm: 0.25, contribution: 0.25, va: 0.3 }), false);
  assert.equal(belowFloor({ gm: 0.24, contribution: 0.25, va: 0.3 }), true); // GM under
  assert.equal(belowFloor({ gm: 0.5, contribution: 0.2, va: 0.4 }), true); // Contr under
  assert.equal(belowFloor({ gm: 0.5, contribution: 0.5, va: 0.29 }), true); // VA under
  assert.equal(belowFloor(null), false);
  assert.equal(belowFloor({ gm: null, contribution: null, va: null }), false);
});
