import test from 'node:test';
import assert from 'node:assert/strict';
import { getKpiBuckets } from './kpiBuckets.js';

test('null result → null buckets', () => {
  assert.equal(getKpiBuckets(null), null);
  assert.equal(getKpiBuckets(undefined), null);
});

test('FIX-47 regression — TTL.MAT does NOT double-count ink', () => {
  // Synthetic result matching calcEngine.js field shape.
  // s_mat_cost = materials + inks (already aggregated per calcEngine.js:766).
  // bd_ink_setup + bd_ink_run mirror the same s_ink_* values that are
  // already inside s_mat_cost. Pre-fix code summed all three →
  // ink-subcost double-counted.
  const r = {
    s_mat_cost: 0.7,
    bd_ink_setup: 0.05,
    bd_ink_run: 0.25,
    bd_setup_mach: 0,
    bd_setup_labor: 0,
    overhead: 0.1,
    labor_cost: 0.05,
    tooling: 0,
    packing_ship: 0.01,
    s_ttl: 0.86,
  };
  const b = getKpiBuckets(r);
  assert.equal(b.ttl_mat, 0.7, 'TTL.MAT = s_mat_cost only (not +bd_ink_*)');
});

test('PROCESS includes setup mach + setup labor + overhead + labor', () => {
  const r = {
    s_mat_cost: 0,
    bd_setup_mach: 0.02,
    bd_setup_labor: 0.03,
    overhead: 0.05,
    labor_cost: 0.04,
    tooling: 0.01, // tooling exposed separately, NOT in process
    packing_ship: 0,
    s_ttl: 0,
  };
  const b = getKpiBuckets(r);
  assert.equal(b.process, 0.02 + 0.03 + 0.05 + 0.04);
  assert.equal(b.tooling, 0.01, 'tooling exposed but separate from process');
});

test('Sum invariant — buckets approximately reconcile to subtotal', () => {
  // Sum invariant from calcEngine.js:
  //   s_ttl = s_mat_cost
  //         + (bd_setup_mach + bd_setup_labor + overhead + labor_cost)
  //         + tooling + packing_ship + extras + vat_loss
  // For a quote with no extras/vat_loss, the sum of the 4 visible
  // buckets + tooling should equal subtotal.
  const r = {
    s_mat_cost: 0.7,
    bd_setup_mach: 0.02,
    bd_setup_labor: 0.03,
    overhead: 0.1,
    labor_cost: 0.05,
    tooling: 0.04,
    packing_ship: 0.01,
    s_ttl: 0.95, // 0.7 + 0.2 + 0.04 + 0.01
  };
  const b = getKpiBuckets(r);
  const sum = b.ttl_mat + b.process + b.tooling + b.pack_ship;
  assert.equal(sum, 0.95, 'sum reconciles to subtotal when no extras/vat');
  assert.equal(b.subtotal, 0.95);
});

test('NaN/undefined fields coerced to 0', () => {
  const r = { s_mat_cost: NaN, overhead: undefined, packing_ship: 'bogus', s_ttl: null };
  const b = getKpiBuckets(r);
  assert.equal(b.ttl_mat, 0);
  assert.equal(b.process, 0);
  assert.equal(b.pack_ship, 0);
  assert.equal(b.subtotal, 0);
});

test('Operator-reported numbers from RFQ ARBHBB000790 (2026-05-26)', () => {
  // Reverse-engineered from the screenshot: SUBTOTAL=0.95131,
  // PROCESS=0.22181 displayed, PACK&SHIP=0.00450, TTL.MAT pre-fix
  // displayed as 1.06949. After fix the TTL.MAT should drop to
  // s_mat_cost which leaves the sum closer to 0.95131.
  // Synthetic numbers chosen so:
  //   - pre-fix TTL.MAT = s_mat_cost + bd_ink_setup + bd_ink_run = 1.06949
  //   - bd_ink_setup + bd_ink_run ≈ 0.345 (Indigo coverage subcost)
  //   - s_mat_cost = 0.72449
  const r = {
    s_mat_cost: 0.72449,
    bd_ink_setup: 0.00511,
    bd_ink_run: 0.33989,
    bd_setup_mach: 0,
    bd_setup_labor: 0,
    overhead: 0.18,
    labor_cost: 0.04181,
    tooling: 0,
    packing_ship: 0.0045,
    s_ttl: 0.95131,
  };
  const b = getKpiBuckets(r);
  const preFixTtlMat = (r.s_mat_cost || 0) + (r.bd_ink_setup || 0) + (r.bd_ink_run || 0);
  assert.equal(Number(preFixTtlMat.toFixed(5)), 1.06949, 'sanity — reproduces pre-fix display');
  assert.equal(b.ttl_mat, 0.72449, 'post-fix TTL.MAT matches s_mat_cost only');
  // Magnitude check: post-fix display drops by exactly ink-subcost.
  // 1.06949 − 0.72449 = 0.345 = bd_ink_setup + bd_ink_run.
  const drop = preFixTtlMat - b.ttl_mat;
  assert.ok(
    Math.abs(drop - (r.bd_ink_setup + r.bd_ink_run)) < 1e-9,
    `drop=${drop} should equal bd_ink_setup+bd_ink_run`
  );
});
