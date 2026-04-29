/**
 * Tests for migrate-quote-va.js — the one-time migration that recomputes
 * canonical va / gm / contribution on historical quotes.
 *
 * Runner: node --test scripts/migrate-quote-va.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recomputeFromResult, migrateQuotes } from './migrate-quote-va.js';

test('recomputeFromResult: canonical VA formula (mat + tooling + packing)', () => {
  const r = { s_mat_cost: 0.025, tooling: 0.001, packing_ship: 0.003, labor_cost: 0.004, s_ttl: 0.04, sp: 0.05 };
  const out = recomputeFromResult(r);
  // va = 1 - (0.025 + 0.001 + 0.003) / 0.05 = 1 - 0.58 = 0.42
  assert.ok(Math.abs(out.va - 0.42) < 1e-9);
  // contribution = 1 - (0.025 + 0.001 + 0.003 + 0.004) / 0.05 = 1 - 0.66 = 0.34
  assert.ok(Math.abs(out.contribution - 0.34) < 1e-9);
  // gm = 1 - 0.04 / 0.05 = 0.2
  assert.ok(Math.abs(out.gm - 0.2) < 1e-9);
});

test('recomputeFromResult: returns null when breakdown fields are missing', () => {
  assert.equal(recomputeFromResult({ va: 0.5 }), null);
  assert.equal(recomputeFromResult({ s_mat_cost: 0.1 }), null); // missing tooling + packing
  assert.equal(recomputeFromResult(null), null);
  assert.equal(recomputeFromResult('not an object'), null);
});

test('recomputeFromResult: falls back to state.selling_price when result.sp missing', () => {
  const r = { s_mat_cost: 0.01, tooling: 0, packing_ship: 0, s_ttl: 0.02 };
  const out = recomputeFromResult(r, 0.05);
  assert.ok(Math.abs(out.va - 0.8) < 1e-9);
});

test('recomputeFromResult: zero / negative sp returns null', () => {
  const r = { s_mat_cost: 0.01, tooling: 0, packing_ship: 0, sp: 0 };
  assert.equal(recomputeFromResult(r), null);
  const r2 = { s_mat_cost: 0.01, tooling: 0, packing_ship: 0, sp: -1 };
  assert.equal(recomputeFromResult(r2), null);
});

test('recomputeFromResult: contribution null when labor_cost missing (gm still set)', () => {
  const r = { s_mat_cost: 0.01, tooling: 0, packing_ship: 0, s_ttl: 0.02, sp: 0.05 };
  const out = recomputeFromResult(r);
  assert.ok(out.va != null);
  assert.equal(out.contribution, null);
  assert.ok(out.gm != null);
});

test('migrateQuotes: skips null result', () => {
  const { next, report } = migrateQuotes([{ id: 1, type: 'standard', result: null }]);
  assert.equal(report.skipped, 1);
  assert.equal(report.updated, 0);
  assert.deepEqual(next[0], { id: 1, type: 'standard', result: null });
});

test('migrateQuotes: skips thin result ({gm, va, s_ttl} only)', () => {
  const q = { id: 2, type: 'standard', result: { gm: 0.1, va: 0.5, s_ttl: 0.03 } };
  const { next, report } = migrateQuotes([q]);
  assert.equal(report.skipped, 1);
  assert.equal(report.updated, 0);
  assert.equal(next[0].result.va, 0.5);
});

test('migrateQuotes: updates divergent VA (old formula: 1 - mat/sp)', () => {
  // Old bug: saved va = 1 - 0.025/0.05 = 0.5. Canonical: 1 - (0.025+0.001+0.003)/0.05 = 0.42.
  const q = {
    id: 43, type: 'standard',
    result: { s_mat_cost: 0.025, tooling: 0.001, packing_ship: 0.003, labor_cost: 0.004, s_ttl: 0.04, sp: 0.05, va: 0.5, gm: 0.2, contribution: 0.5 },
  };
  const { next, report } = migrateQuotes([q]);
  assert.equal(report.updated, 1);
  assert.ok(Math.abs(next[0].result.va - 0.42) < 1e-9);
  assert.ok(Math.abs(next[0].result.contribution - 0.34) < 1e-9);
  // gm was already correct (0.2) and delta is below threshold → not listed.
  assert.ok(report.changes[0].diffs.va);
  assert.ok(report.changes[0].diffs.contribution);
});

test('migrateQuotes: idempotent — second run produces no changes', () => {
  const q = {
    id: 43, type: 'standard',
    result: { s_mat_cost: 0.025, tooling: 0.001, packing_ship: 0.003, labor_cost: 0.004, s_ttl: 0.04, sp: 0.05, va: 0.5, gm: 0.2, contribution: 0.5 },
  };
  const first = migrateQuotes([q]);
  const second = migrateQuotes(first.next);
  assert.equal(second.report.updated, 0, 're-run should be a no-op');
  assert.equal(second.report.unchanged, 1);
});

test('migrateQuotes: leaves already-canonical quotes untouched', () => {
  const q = {
    id: 1, type: 'standard',
    result: { s_mat_cost: 0.025, tooling: 0.001, packing_ship: 0.003, labor_cost: 0.004, s_ttl: 0.04, sp: 0.05, va: 0.42, gm: 0.2, contribution: 0.34 },
  };
  const { next, report } = migrateQuotes([q]);
  assert.equal(report.unchanged, 1);
  assert.equal(report.updated, 0);
  assert.equal(next[0].result.va, 0.42); // unchanged reference-wise OK
});

test('migrateQuotes: sub-threshold rounding delta does NOT trigger rewrite', () => {
  const q = {
    id: 1, type: 'standard',
    result: { s_mat_cost: 0.025, tooling: 0.001, packing_ship: 0.003, labor_cost: 0.004, s_ttl: 0.04, sp: 0.05, va: 0.4202, gm: 0.2, contribution: 0.34 },
  };
  const { report } = migrateQuotes([q]);
  // Canonical 0.42 vs stored 0.4202 → delta 0.0002 < 0.0005 threshold.
  assert.equal(report.unchanged, 1);
});
