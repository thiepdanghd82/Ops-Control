import test from 'node:test';
import assert from 'node:assert/strict';
import {
  todayISO,
  todayMonthISO,
  yearOf,
  yearOptions,
  dateSortKey,
  sortByDate,
} from './materialDate.js';

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

// ─── Sorting the Update Date column ────────────────────────────────
// Shapes + counts measured on the live NPI library (3061 rows).

test('dateSortKey: every shape actually in the library', () => {
  assert.deepEqual(
    [
      '2022-10-01', // 2116 rows
      '2026-04-15',
      '2023-07', // YYYY-MM
      '7.2023', // 15 rows — month.year, no day
      '2023', // bare year
      '26.05.2025 (add 20% on 1.4.2026)', // date + pricing note
      '26.09.2024 (add 15% on 1.4.2026)',
    ].map(dateSortKey),
    [20221001, 20260415, 20230700, 20230700, 20230000, 20250526, 20240926]
  );
});

test('dateSortKey: a cell with no date returns null — including the note-only rows', () => {
  for (const v of ['Old', 'DAP', 'Old info', '', '   ', null, undefined, '(add 15% on 1.4.2026)']) {
    assert.equal(dateSortKey(v), null, JSON.stringify(v));
  }
});

// The anchor is the whole point: an unanchored "first date in the string"
// rule reads `(add 15% on 1.4.2026)` as 2026-04-01 and files a row that
// carries NO update date among the newest ones.
test('dateSortKey: a date inside a note is not the update date', () => {
  assert.equal(dateSortKey('(add 15% on 1.4.2026)'), null);
  assert.equal(dateSortKey('add 15% on 1.4.2026'), null);
  assert.equal(dateSortKey('26.05.2025 (add 20% on 1.4.2026)'), 20250526, 'leading date wins');
});

test('dateSortKey: a stray number run cannot pass as a year', () => {
  assert.equal(dateSortKey('0916'), null);
  assert.equal(dateSortKey('1899-01-01'), null);
});

const ROWS = [
  { name: 'b', date: '2024-06-18' },
  { name: 'old1', date: 'Old' },
  { name: 'a', date: '2022-10-01' },
  { name: 'dap', date: 'DAP' },
  { name: 'c', date: '2026-04-15' },
  { name: 'old2', date: 'Old info' },
];

test('sortByDate desc: newest first', () => {
  assert.deepEqual(
    sortByDate(ROWS, 'desc').map((r) => r.name),
    ['c', 'b', 'a', 'old1', 'dap', 'old2']
  );
});

test('sortByDate asc: oldest first', () => {
  assert.deepEqual(
    sortByDate(ROWS, 'asc').map((r) => r.name),
    ['a', 'b', 'c', 'old1', 'dap', 'old2']
  );
});

test('undated rows stay at the BOTTOM in BOTH directions, in their original order', () => {
  for (const dir of ['asc', 'desc']) {
    assert.deepEqual(
      sortByDate(ROWS, dir)
        .slice(-3)
        .map((r) => r.name),
      ['old1', 'dap', 'old2'],
      dir
    );
  }
});

test('sortByDate does not mutate the caller array', () => {
  const before = ROWS.map((r) => r.name);
  sortByDate(ROWS, 'asc');
  assert.deepEqual(
    ROWS.map((r) => r.name),
    before
  );
});

test('sortByDate: same date keeps insertion order (stable)', () => {
  const tied = [
    { name: 'first', date: '2025-01-01' },
    { name: 'second', date: '2025-01-01' },
    { name: 'third', date: '2025-01-01' },
  ];
  for (const dir of ['asc', 'desc']) {
    assert.deepEqual(
      sortByDate(tied, dir).map((r) => r.name),
      ['first', 'second', 'third'],
      dir
    );
  }
});

test('sortByDate tolerates junk input', () => {
  assert.deepEqual(sortByDate(null, 'asc'), []);
  assert.deepEqual(sortByDate(undefined, 'asc'), []);
  assert.equal(sortByDate([], 'asc').length, 0);
  // A hole or a null row must not throw. Note `Array.prototype.sort` hoists
  // literal `undefined` elements to the end itself, before the comparator is
  // ever called — so the pair comes back reordered, and that is the spec, not
  // this helper. Real rows are objects, so it never comes up in the table.
  assert.deepEqual(sortByDate([undefined, null], 'asc'), [null, undefined]);
});
