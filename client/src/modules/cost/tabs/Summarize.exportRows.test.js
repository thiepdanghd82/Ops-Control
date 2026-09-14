import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsForExport, quoteKeyOf } from './Summarize.exportRows.js';

// Summarize flattens a quote into one row per MOQ tier: id = `${quoteId}-${tier}`.
const row = (quoteId, tier) => ({ id: `${quoteId}-${tier}`, quote_id: quoteId, tier });
const ids = (rows) => rows.map((r) => r.id);

const sheet = [row(190, 1), row(190, 2), row(190, 3), row(191, 1), row(191, 2), row(192, 1)];

test('no selection exports everything visible, unchanged', () => {
  assert.deepEqual(ids(rowsForExport(sheet, new Set())), ids(sheet));
  assert.deepEqual(ids(rowsForExport(sheet, [])), ids(sheet));
  assert.deepEqual(ids(rowsForExport(sheet, null)), ids(sheet));
});

test('selecting one tier exports every tier of that RFQ', () => {
  // This is the bug: the operator ticked MOQ 2 and got a one-row file.
  assert.deepEqual(ids(rowsForExport(sheet, new Set(['190-2']))), ['190-1', '190-2', '190-3']);
});

test('rows stay in on-screen order, and other quotes are not pulled in', () => {
  const out = rowsForExport(sheet, new Set(['191-2', '190-3']));
  assert.deepEqual(ids(out), ['190-1', '190-2', '190-3', '191-1', '191-2']);
  assert.ok(!ids(out).includes('192-1'));
});

test('a hidden tier stays hidden — the export never writes what is filtered out', () => {
  // The operator filtered MOQ 2 away; selecting MOQ 1 must not resurrect it.
  const filtered = sheet.filter((r) => r.id !== '190-2');
  assert.deepEqual(ids(rowsForExport(filtered, new Set(['190-1']))), ['190-1', '190-3']);
});

test('a selection that matches nothing visible falls back to the visible set', () => {
  assert.deepEqual(ids(rowsForExport(sheet, new Set(['999-1']))), ids(sheet));
});

test('quoteKeyOf prefers quote_id and tolerates rows without one', () => {
  assert.equal(quoteKeyOf({ id: '190-2', quote_id: 190 }), 'q:190');
  assert.equal(quoteKeyOf({ id: '190-2' }), 'id:190');
  assert.equal(quoteKeyOf({ id: 'RFQ-2026-S0054-11' }), 'id:RFQ-2026-S0054');
  assert.equal(quoteKeyOf({}), 'id:');
  assert.equal(quoteKeyOf(null), 'id:');
});

test('quote_id 0 is a real id, not a missing one', () => {
  assert.equal(quoteKeyOf({ id: '0-1', quote_id: 0 }), 'q:0');
});

test('junk input is safe', () => {
  assert.deepEqual(rowsForExport(undefined, new Set(['a'])), []);
  assert.deepEqual(rowsForExport([], new Set(['a'])), []);
  assert.deepEqual(ids(rowsForExport([null, row(1, 1)], new Set(['1-1']))), ['1-1']);
});
