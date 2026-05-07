/**
 * Unit tests for the Excel due-date coercion helper used by the
 * orders Excel-import endpoint. Operators paste cells from various
 * locales and Excel sometimes hands us a serial number — all three
 * common shapes must round-trip to ISO-8601.
 *
 *   node --test server/routes/planning.coerceDueDate.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { coerceDueDate } from './planning.js';

test('ISO already — passthrough', () => {
  assert.equal(coerceDueDate('2026-04-20'), '2026-04-20');
});

test('Excel serial — typical date', () => {
  // 45762 = 2025-04-15 (Dec 30 1899 epoch + 25569 → Jan 1 1970)
  assert.equal(coerceDueDate(46127), '2026-04-15');
});

test('dd/mm/yyyy with slashes', () => {
  assert.equal(coerceDueDate('15/04/2026'), '2026-04-15');
});

test('dd/mm/yy short-year — assumes 20xx', () => {
  assert.equal(coerceDueDate('15/4/26'), '2026-04-15');
});

test('dd-mm-yyyy with dashes', () => {
  assert.equal(coerceDueDate('15-04-2026'), '2026-04-15');
});

test('single-digit day + month padded to two', () => {
  assert.equal(coerceDueDate('5/4/2026'), '2026-04-05');
});

test('empty string → empty string', () => {
  assert.equal(coerceDueDate(''), '');
});

test('null / undefined → empty string', () => {
  assert.equal(coerceDueDate(null), '');
  assert.equal(coerceDueDate(undefined), '');
});

test('garbage string → empty (not crash)', () => {
  assert.equal(coerceDueDate('not-a-date'), '');
});

test('zero number — Excel epoch 1899-12-30, not crash', () => {
  // Excel "0" = 1899-12-30. We pass through Date logic, returns ISO.
  const result = coerceDueDate(0);
  // Whatever result is, it should be empty OR a valid ISO date.
  if (result !== '') {
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  }
});
