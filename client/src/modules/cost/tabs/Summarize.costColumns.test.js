import test from 'node:test';
import assert from 'node:assert/strict';
import { costColumnsFromResult, costColumnsGap, marginsAt } from './Summarize.costColumns.js';

/**
 * Quote 214 tier 1 (RFQ-2026-S0066), read out of the live store on 2026-09-22.
 * Real numbers rather than invented ones, because the bug was a ~5% shortfall
 * that looked entirely plausible — a fixture chosen to be round would not have
 * caught it either.
 */
const Q214 = {
  s_mat_cost: 0.012643930066015798,
  overhead: 0.005851793754538852, // RUN-ONLY — what the export used to read
  labor_cost: 0.001106085693536674, // RUN-ONLY
  bd_overhead: 0.006582887087872185, // setup included
  bd_labor: 0.0015319456935366739, // setup included
  bd_setup_mach: 0.0007310933333333333,
  bd_setup_labor: 0.00042586,
  tooling: 0.0032261805555555555,
  packing_ship: 0.0005466666666666667,
  s_ttl: 0.024531610069646877,
};

const close = (a, b, eps = 1e-12) => Math.abs(a - b) < eps;

test('the five cost cells sum to G.Total', () => {
  const c = costColumnsFromResult(Q214);
  const sum = c.s_mat_cost + c.overhead + c.labor_cost + c.tooling + c.pack_ship;
  assert.ok(
    close(sum, c.g_ttl_cost),
    `columns must decompose G.Total — got ${sum}, expected ${c.g_ttl_cost}`
  );
});

test('reading the run-only pair instead is short by exactly the setup cluster', () => {
  // The bug, reproduced. Not a hypothetical: this is what every exported row
  // looked like until 2026-09-22.
  const wrong =
    Q214.s_mat_cost + Q214.overhead + Q214.labor_cost + Q214.tooling + Q214.packing_ship;
  const shortfall = Q214.s_ttl - wrong;
  assert.ok(
    close(shortfall, Q214.bd_setup_mach + Q214.bd_setup_labor, 1e-9),
    'the gap must be the setup cluster, nothing else'
  );
  assert.ok(shortfall > 0, 'and it under-reports rather than over-reports');
});

test('overhead and labor carry setup, so they are not the run-only fields', () => {
  const c = costColumnsFromResult(Q214);
  assert.notEqual(c.overhead, Q214.overhead, 'overhead must not be the run-only field');
  assert.notEqual(c.labor_cost, Q214.labor_cost, 'labor must not be the run-only field');
  assert.equal(c.overhead, Q214.bd_overhead);
  assert.equal(c.labor_cost, Q214.bd_labor);
});

test('overhead + labor equals the KPI strip PROCESS bucket', () => {
  // The strip computes PROCESS as overhead + labor_cost + setup_mach + setup_labor
  // (kpiBuckets.js, MES-3-FIX-47). The export must land on the same number, or
  // the two screens disagree about the same quote.
  const c = costColumnsFromResult(Q214);
  const stripProcess = Q214.overhead + Q214.labor_cost + Q214.bd_setup_mach + Q214.bd_setup_labor;
  assert.ok(
    close(c.overhead + c.labor_cost, stripProcess, 1e-9),
    'export PROCESS must match the KPI strip'
  );
});

test('gap is 0 on a quote with no extra-cost terms', () => {
  assert.ok(close(costColumnsGap(Q214), 0));
});

test('gap reports the terms that have no column, rather than hiding them', () => {
  // s_ttl also includes vat_loss + proc_extra_vat + proc_extra (calcEngine:1142)
  // and the export has a column for none of them. All three are zero on all 148
  // live quotes, so this is a latent limitation, not a live defect — and this
  // test is how it stays visible instead of arriving as a fresh bug report.
  const withVat = { ...Q214, s_ttl: Q214.s_ttl + 0.004, vat_loss: 0.004 };
  assert.ok(
    close(costColumnsGap(withVat), 0.004, 1e-9),
    'a term with no column must surface in the gap'
  );
});

test('a missing or malformed result yields zeros instead of NaN', () => {
  for (const bad of [undefined, null, 'nope', 42]) {
    const c = costColumnsFromResult(bad);
    for (const [k, v] of Object.entries(c)) {
      assert.ok(Number.isFinite(v), `${k} must be finite for input ${String(bad)}`);
    }
  }
  assert.equal(costColumnsGap(undefined), 0);
});

test('non-finite fields read as 0 rather than poisoning the row', () => {
  const c = costColumnsFromResult({ s_mat_cost: NaN, bd_overhead: undefined, s_ttl: 5 });
  assert.equal(c.s_mat_cost, 0);
  assert.equal(c.overhead, 0);
  assert.equal(c.g_ttl_cost, 5);
});

// ── marginsAt (2026-09-30): the same three margins at any price ──
// Henry asked for VA / Contr / GM at the TARGET price beside the selling-price
// ones. Both go through this one function so the two sets cannot disagree
// about what a margin is (Lesson 48).
const R = {
  s_mat_cost: 0.5,
  tooling: 0.1,
  packing_ship: 0.05,
  labor_cost: 0.08, // run-only on a result (Lesson 21)
  bd_setup_labor: 0.02,
  s_ttl: 0.9,
};

test('marginsAt: VA, Contr (all labor) and GM, derived by hand at price 1', () => {
  const m = marginsAt(R, 1);
  assert.ok(Math.abs(m.va - (1 - 0.65)) < 1e-12); // 0.5 + 0.1 + 0.05
  assert.ok(Math.abs(m.contr - (1 - 0.75)) < 1e-12); // + 0.08 run + 0.02 setup labor
  assert.ok(Math.abs(m.gm - (1 - 0.9)) < 1e-12);
});

test('marginsAt: the target row on screen — subtotal 0.01187 at target 0.035 reads GM 66.1%', () => {
  const m = marginsAt({ s_ttl: 0.01187 }, 0.035);
  assert.equal(+(m.gm * 100).toFixed(1), 66.1);
});

test('marginsAt: no price, a blank price or a string price does not invent margins', () => {
  for (const p of [0, null, undefined, '', -1, 'abc']) {
    assert.deepEqual(marginsAt(R, p), { va: null, contr: null, gm: null }, String(p));
  }
  assert.ok(Math.abs(marginsAt(R, '1').gm - 0.1) < 1e-12, 'a numeric string is a price');
});

test('marginsAt: a missing result yields no margins rather than throwing', () => {
  assert.deepEqual(marginsAt(null, 1), { va: null, contr: null, gm: null });
});
