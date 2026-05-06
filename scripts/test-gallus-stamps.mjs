#!/usr/bin/env node
// Sprint S-LAYOUT-VIZ-1 — algo version stamp + closure invariant guards.
// Run: node --test scripts/test-gallus-stamps.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankPrintCylinders,
  jobSummary,
  crossDirection,
  createGallusInputs,
  GALLUS_ALGO_VERSION,
} from '../client/src/modules/cost/tabs/DesignTools/presses/gallusEngine.js';

const baseInputs = (overrides) => ({
  ...createGallusInputs(),
  L: 63.5,
  Pw: 252.75,
  W: 270,
  E: 5,
  K: 9.9,
  G: 4.6375,
  G_min: 2,
  G_max: 8,
  bleed_mm: 2,
  parts_md: 4,
  parts_td: 1,
  only_available: false,
  ...overrides,
});

test('GALLUS_ALGO_VERSION exported and matches v2.0-even-gap', () => {
  assert.equal(GALLUS_ALGO_VERSION, 'v2.0-even-gap');
});

test('every ranked row carries _algo_v stamp', () => {
  const rows = rankPrintCylinders(baseInputs());
  assert.ok(rows.length > 0, 'should produce at least one row');
  for (const r of rows) {
    assert.equal(r._algo_v, GALLUS_ALGO_VERSION, `Z=${r.z} missing or stale _algo_v: ${r._algo_v}`);
  }
});

test('jobSummary carries _algo_v stamp', () => {
  const inputs = baseInputs({ web_length_m: 1000, n_colors: 4, plate_cost: 80 });
  const ranked = rankPrintCylinders(inputs);
  const top = ranked.find((r) => r.status === 'OK');
  assert.ok(top, 'expected an OK cylinder');
  const cross = crossDirection(inputs);
  const summary = jobSummary(top, cross, inputs);
  assert.ok(summary, 'jobSummary should produce a value');
  assert.equal(summary._algo_v, GALLUS_ALGO_VERSION);
});

test('engine closure invariant unchanged: K + N×L_eff + N×gap === pitch', () => {
  const inputs = baseInputs();
  const rows = rankPrintCylinders(inputs);
  const L_eff = inputs.L + 2 * inputs.bleed_mm;
  for (const r of rows.filter((x) => x.status === 'OK')) {
    const closure = inputs.K + r.n_down * L_eff + r.n_down * r.actual_gap;
    assert.ok(
      Math.abs(closure - r.pitch) < 1e-3,
      `Z=${r.z}: closure ${closure.toFixed(3)} ≠ pitch ${r.pitch}`
    );
  }
});

test('bleed=0 still produces correct closure (regression for non-bleed jobs)', () => {
  const inputs = baseInputs({ bleed_mm: 0, K: 0, parts_md: 4, G: 4.0 });
  const rows = rankPrintCylinders(inputs);
  for (const r of rows.filter((x) => x.status === 'OK')) {
    const closure = r.n_down * inputs.L + r.n_down * r.actual_gap;
    assert.ok(
      Math.abs(closure - r.pitch) < 1e-3,
      `Z=${r.z}: closure ${closure.toFixed(3)} ≠ pitch ${r.pitch}`
    );
  }
});
