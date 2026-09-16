import test from 'node:test';
import assert from 'node:assert/strict';
import { todayISO, todayMonthISO, yearOf, yearOptions } from './materialDate.js';

test('todayISO uses LOCAL date, not UTC', () => {
  // 2026-09-16 00:30 local. Under UTC+7 the UTC date is still the 15th, so
  // toISOString() would stamp yesterday — the PR #296 bug, one field over.
  const d = new Date(2026, 8, 16, 0, 30, 0);
  assert.equal(todayISO(d), '2026-09-16');
});

test('todayISO pads single-digit month and day', () => {
  assert.equal(todayISO(new Date(2026, 0, 5)), '2026-01-05');
});

test('todayMonthISO is YYYY-MM', () => {
  assert.equal(todayMonthISO(new Date(2026, 8, 16)), '2026-09');
});

test('yearOf reads every shape the library actually contains', () => {
  assert.equal(yearOf('2026-09-16'), '2026', 'ISO — 2115 of 3059 NPI rows');
  assert.equal(yearOf('2026.09.16'), '2026', 'dotted, leading year');
  assert.equal(yearOf('16.09.2026'), '2026', 'European — year trails');
  assert.equal(yearOf('9.2026'), '2026');
  assert.equal(yearOf('2026-09'), '2026', 'Sourcing month shape');
});

test('yearOf refuses text that is not a date — these must not become options', () => {
  for (const junk of ['Old', 'DAP', 'Old info', '', null, undefined]) {
    assert.equal(yearOf(junk), '', `${JSON.stringify(junk)} is not a year`);
  }
});

test('yearOf will not read a stray 4-digit run as a year', () => {
  assert.equal(yearOf('0916'), '', 'no plausible century');
  assert.equal(yearOf('MOQ 5350'), '', 'a quantity is not a year');
});

test('yearOptions returns real years, newest first, no junk', () => {
  const rows = [
    { date: '2026-09-16' },
    { date: '2025-01-02' },
    { date: 'Old' },
    { date: '16.09.2026' }, // same year, different shape — must dedupe
    { date: '' },
    {},
  ];
  assert.deepEqual(yearOptions(rows, 'date'), ['2026', '2025']);
});

test('yearOptions survives a null row list', () => {
  assert.deepEqual(yearOptions(null, 'date'), []);
});
