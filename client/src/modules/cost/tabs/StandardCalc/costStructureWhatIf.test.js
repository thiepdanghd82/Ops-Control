/**
 * costStructureWhatIf — pure recompute helper for the Cost Breakdown what-if.
 * DISPLAY-ONLY: no quote state, no reducer, no server. These tests pin the
 * per-metric membership + the all-active == canonical invariant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOGGLEABLE_KEYS,
  buildBuckets,
  recomputeKpi,
  isBucketActive,
} from './costStructureWhatIf.js';

// Fixture WITH proc_extra folded into s_ttl (extra = 7) so we prove the anchor
// approach stays exact even though no toggleable row surfaces "extra".
//   ink = 2+3 = 5 ; matExcl = 25-5 = 20 ; overheadFull = 12+3 = 15
//   laborFull = 6+4 = 10 ; runLabor = 6 ; tooling = 10 ; packing = 8 ; vat = 2
//   s_ttl = 25+15+10+10+8+2 + 7(extra) = 77
const R = {
  s_mat_cost: 25,
  bd_ink_setup: 2,
  bd_ink_run: 3,
  overhead: 12,
  bd_setup_mach: 3,
  labor_cost: 6,
  bd_setup_labor: 4,
  tooling: 10,
  packing_ship: 8,
  vat_loss: 2,
  s_ttl: 77,
};
const PRICE = 100;
// Canonical (calcEngine): va=1-(25+10+8)/100; contr=1-(43+6)/100; gm=1-77/100
const CANON = { va: 0.57, contribution: 0.51, gm: 0.23 };
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('all-active recompute === canonical va/contr/gm EXACTLY (incl. proc_extra)', () => {
  const k = recomputeKpi(R, {}, PRICE);
  assert.ok(close(k.va, CANON.va), 'va');
  assert.ok(close(k.contribution, CANON.contribution), 'contr');
  assert.ok(close(k.gm, CANON.gm), 'gm anchored to s_ttl (77), not bucket sum (70)');
});

test('uncheck Overhead → GM rises by (overhead+setup_mach)/price; VA & Contr UNCHANGED', () => {
  const k = recomputeKpi(R, { overhead: false }, PRICE);
  assert.ok(close(k.va, CANON.va), 'VA unchanged');
  assert.ok(close(k.contribution, CANON.contribution), 'Contr unchanged');
  assert.ok(close(k.gm, CANON.gm + 15 / PRICE), 'GM +0.15');
});

test('uncheck Labor → Contr drops run labor, GM drops full labor; VA unchanged', () => {
  const k = recomputeKpi(R, { labor: false }, PRICE);
  assert.ok(close(k.va, CANON.va), 'VA unchanged');
  assert.ok(close(k.contribution, CANON.contribution + 6 / PRICE), 'Contr +run labor 6');
  assert.ok(close(k.gm, CANON.gm + 10 / PRICE), 'GM +full labor 10');
});

test('uncheck Material → all three change', () => {
  const k = recomputeKpi(R, { material: false }, PRICE);
  assert.ok(close(k.va, CANON.va + 20 / PRICE), 'VA +matExcl 20');
  assert.ok(close(k.contribution, CANON.contribution + 20 / PRICE), 'Contr +20');
  assert.ok(close(k.gm, CANON.gm + 20 / PRICE), 'GM +20');
});

test('uncheck Ink → all three change by ink amount only', () => {
  const k = recomputeKpi(R, { ink: false }, PRICE);
  assert.ok(close(k.va, CANON.va + 5 / PRICE));
  assert.ok(close(k.contribution, CANON.contribution + 5 / PRICE));
  assert.ok(close(k.gm, CANON.gm + 5 / PRICE));
});

test('price <= 0 → null guards', () => {
  for (const p of [0, -5, null, undefined]) {
    const k = recomputeKpi(R, {}, p);
    assert.deepEqual(k, { va: null, contribution: null, gm: null });
  }
});

test('GM bucket sum === s_ttl when proc_extra is 0 (spec invariant)', () => {
  const noExtra = { ...R, s_ttl: 70 }; // 25+15+10+10+8+2, no extra
  const b = buildBuckets(noExtra);
  const gmSum = TOGGLEABLE_KEYS.reduce((s, k) => s + b[k].gm, 0);
  assert.ok(close(gmSum, noExtra.s_ttl), 'Σ active GM buckets == s_ttl');
  // and all-active still equals canonical
  assert.ok(close(recomputeKpi(noExtra, {}, PRICE).gm, 1 - 70 / PRICE));
});

test('buildBuckets: per-metric membership (overhead/labor/vat zero where excluded)', () => {
  const b = buildBuckets(R);
  assert.deepEqual({ va: b.overhead.va, contr: b.overhead.contr }, { va: 0, contr: 0 });
  assert.equal(b.labor.va, 0, 'labor not in VA');
  assert.equal(b.labor.contr, 6, 'labor Contr = run-only');
  assert.equal(b.labor.gm, 10, 'labor GM = full');
  assert.deepEqual({ va: b.vat.va, contr: b.vat.contr }, { va: 0, contr: 0 });
  assert.equal(b.vat.gm, 2);
});

test('isBucketActive: default active; false turns off; reset (empty mask) all active', () => {
  assert.equal(isBucketActive({}, 'material'), true);
  assert.equal(isBucketActive(null, 'material'), true);
  assert.equal(isBucketActive({ material: false }, 'material'), false);
  assert.equal(isBucketActive({ material: true }, 'material'), true);
  for (const k of TOGGLEABLE_KEYS) assert.equal(isBucketActive({}, k), true);
});

test('purity: recomputeKpi does not mutate inputs', () => {
  const mask = { overhead: false };
  const rCopy = JSON.parse(JSON.stringify(R));
  recomputeKpi(R, mask, PRICE);
  assert.deepEqual(mask, { overhead: false }, 'mask untouched');
  assert.deepEqual(R, rCopy, 'r untouched');
});
