/**
 * Tests for check-perf-budget.js — covers the decision logic without
 * touching disk. The disk-read side (loadChunks) is exercised by the
 * main() CLI path in smoke tests.
 *
 * Runner: node --test scripts/check-perf-budget.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBudgets, extractPrefix } from './check-perf-budget.js';

test('extractPrefix: strips Vite content hash', () => {
  assert.equal(extractPrefix('ComplexCalc-BscMztTy.js'), 'ComplexCalc');
  assert.equal(extractPrefix('index-DaaZlrCO.js'), 'index');
  assert.equal(extractPrefix('calcEngine.sga-AbCdEf12.js'), 'calcEngine.sga');
});

test('extractPrefix: no hash present → full name minus extension', () => {
  assert.equal(extractPrefix('vendor.js'), 'vendor');
  assert.equal(extractPrefix('no-hash-here.js'), 'no-hash-here');
});

test('checkBudgets: under-budget chunks land in ok[]', () => {
  const chunks = [{ name: 'index-AbCd1234.js', bytes: 100_000 }];
  const report = checkBudgets(
    chunks,
    [{ prefix: 'index', budget: 200_000, label: 'shell' }],
    300_000
  );
  assert.equal(report.ok.length, 1);
  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 0);
});

test('checkBudgets: over-budget chunk fails with over_by + pct', () => {
  const chunks = [{ name: 'ComplexCalc-XyZ12345.js', bytes: 120_000 }];
  const budgets = [{ prefix: 'ComplexCalc', budget: 100_000, label: 'cplx' }];
  const report = checkBudgets(chunks, budgets, 500_000);
  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0].over_by, 20_000);
  assert.ok(Math.abs(report.failures[0].pct - 1.2) < 1e-6);
});

test('checkBudgets: prefix-with-suffix falls back to base-prefix rule', () => {
  // Vite sometimes emits hashes containing a dash, so the extracted
  // prefix ends up as `index-C` instead of `index`. The matcher should
  // still apply the `index` budget rather than cascading to the global
  // cap (which would falsely fail the gate on routine code growth).
  const chunks = [{ name: 'index-C-GsyK1I.js', bytes: 240_000 }];
  const budgets = [{ prefix: 'index', budget: 290_000, label: 'shell' }];
  const report = checkBudgets(chunks, budgets, 200_000);
  assert.equal(
    report.failures.length,
    0,
    'index-with-dashed-hash should use the index budget, not the global cap'
  );
  assert.equal(report.ok.length, 1);
  assert.equal(report.ok[0].budget, 290_000);
});

test('checkBudgets: >=90% budget triggers warning (but not failure)', () => {
  const chunks = [
    { name: 'StandardCalc-AbCd1234.js', bytes: 92_000 }, // 92% of 100k
  ];
  const budgets = [{ prefix: 'StandardCalc', budget: 100_000, label: 'std' }];
  const report = checkBudgets(chunks, budgets, 500_000);
  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.ok.length, 0);
});

test('checkBudgets: 89% of budget → ok (just under warn threshold)', () => {
  const chunks = [{ name: 'StandardCalc-AbCd1234.js', bytes: 89_000 }];
  const budgets = [{ prefix: 'StandardCalc', budget: 100_000, label: 'std' }];
  const report = checkBudgets(chunks, budgets, 500_000);
  assert.equal(report.warnings.length, 0);
  assert.equal(report.ok.length, 1);
});

test('checkBudgets: chunk without explicit budget uses global cap', () => {
  const chunks = [{ name: 'RandomTab-AbCd1234.js', bytes: 250_000 }];
  const budgets = [{ prefix: 'ComplexCalc', budget: 100_000, label: 'cplx' }];
  // Global cap 200k → 250k chunk fails.
  const report = checkBudgets(chunks, budgets, 200_000);
  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0].label, '(global cap)');
  assert.equal(report.failures[0].budget, 200_000);
});

test('checkBudgets: total_bytes sums all chunks', () => {
  const chunks = [
    { name: 'a-Xyz12345.js', bytes: 1000 },
    { name: 'b-Xyz12345.js', bytes: 2500 },
    { name: 'c-Xyz12345.js', bytes: 500 },
  ];
  const report = checkBudgets(chunks, [], 10_000);
  assert.equal(report.total_bytes, 4000);
  assert.equal(report.chunk_count, 3);
});

test('checkBudgets: empty chunks input → zero counts, no failures', () => {
  const report = checkBudgets([], [], 1_000_000);
  assert.equal(report.failures.length, 0);
  assert.equal(report.warnings.length, 0);
  assert.equal(report.ok.length, 0);
  assert.equal(report.total_bytes, 0);
  assert.equal(report.chunk_count, 0);
});

test('checkBudgets: mixed set produces per-bucket classification', () => {
  const chunks = [
    { name: 'shell-X123456.js', bytes: 200_000 }, // fails (cap 180k)
    { name: 'warn-X123456.js', bytes: 95_000 }, // warn (95% of 100k)
    { name: 'fine-X123456.js', bytes: 10_000 }, // ok
  ];
  const budgets = [
    { prefix: 'shell', budget: 180_000, label: 's' },
    { prefix: 'warn', budget: 100_000, label: 'w' },
    { prefix: 'fine', budget: 100_000, label: 'f' },
  ];
  const report = checkBudgets(chunks, budgets, 500_000);
  assert.equal(report.failures.length, 1);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.ok.length, 1);
});
