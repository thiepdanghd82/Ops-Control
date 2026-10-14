import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rowsForExport,
  quoteKeyOf,
  orderBySelection,
  toggleQuoteSelection,
  pinSelected,
} from './Summarize.exportRows.js';

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

// ─── orderBySelection — ticked quotes float to the top ─────────────
// The table runs to 138 rows, so a tick three screens down is invisible:
// the counter says "3 rows selected" while two are on screen and the
// operator cannot check the set before writing the file.

// Two tiers each for three quotes, in the order the table shows them.
const TABLE = [row(1, 1), row(1, 2), row(2, 1), row(2, 2), row(3, 1), row(3, 2)];

test('orderBySelection: a ticked quote moves to the top', () => {
  assert.deepEqual(ids(orderBySelection(TABLE, new Set(['3-1']))), [
    '3-1',
    '3-2',
    '1-1',
    '1-2',
    '2-1',
    '2-2',
  ]);
});

// Grouped by quote, not by row: rowsForExport already expands a ticked
// tier to every tier of its quote, so floating only the ticked row would
// put two of a quote's tiers on top and the rest below while the file
// gets them all — the screen would be lying about the export.
test('orderBySelection: the ticked row brings its sibling tiers with it', () => {
  const out = orderBySelection(TABLE, new Set(['2-2']));
  assert.deepEqual(ids(out).slice(0, 2), ['2-1', '2-2'], 'both tiers, in table order');
});

test('orderBySelection: quotes queue in the order they were ticked', () => {
  const sel = new Set();
  sel.add('3-1'); // ticked first
  sel.add('1-2'); // then this one
  assert.deepEqual(ids(orderBySelection(TABLE, sel)), ['3-1', '3-2', '1-1', '1-2', '2-1', '2-2']);
});

test('orderBySelection: re-ticking sends a quote to the BACK of the queue', () => {
  const sel = new Set(['1-1']);
  sel.add('2-1');
  sel.delete('1-1');
  sel.add('1-1'); // ticked again, so it is the newest pick
  assert.deepEqual(ids(orderBySelection(TABLE, sel)).slice(0, 4), ['2-1', '2-2', '1-1', '1-2']);
});

test('orderBySelection: unticked rows keep the order they arrived in', () => {
  assert.deepEqual(ids(orderBySelection(TABLE, new Set(['2-1']))).slice(2), [
    '1-1',
    '1-2',
    '3-1',
    '3-2',
  ]);
});

test('orderBySelection: no selection returns the SAME array — no reshuffle', () => {
  assert.equal(orderBySelection(TABLE, new Set()), TABLE);
  assert.equal(orderBySelection(TABLE, []), TABLE);
  assert.equal(orderBySelection(TABLE, null), TABLE);
});

// A row ticked while visible, then hidden by the search box, stays in
// `selected` by design. It names no visible quote, so it must float
// nothing rather than throw or reorder at random.
test('orderBySelection: a ticked id that is no longer on screen floats nothing', () => {
  assert.equal(orderBySelection(TABLE, new Set(['99-1'])), TABLE);
  assert.deepEqual(ids(orderBySelection(TABLE, new Set(['99-1', '2-1']))).slice(0, 2), [
    '2-1',
    '2-2',
  ]);
});

test('orderBySelection: never drops or duplicates a row', () => {
  const out = orderBySelection(TABLE, new Set(['3-2', '1-1']));
  assert.equal(out.length, TABLE.length);
  assert.deepEqual(new Set(ids(out)).size, TABLE.length);
});

test('orderBySelection: tolerates junk input', () => {
  assert.deepEqual(orderBySelection(null, new Set(['1-1'])), []);
  assert.deepEqual(orderBySelection([], new Set(['1-1'])), []);
});

// The whole point: what the screen shows on top is what the file gets.
test('orderBySelection + rowsForExport agree on the export set and its order', () => {
  const sel = new Set(['3-1', '1-2']);
  const ordered = orderBySelection(TABLE, sel);
  assert.deepEqual(ids(rowsForExport(ordered, sel)), ['3-1', '3-2', '1-1', '1-2']);
});

// ─── toggleQuoteSelection — a tick selects the QUOTE ───────────────
// Reported from the running app: 5 ticks, 7 rows floated, two of them
// sitting un-ticked in the middle of the selection. They were the sibling
// tiers of quote #27 and quote #104, which rowsForExport was exporting
// anyway — the checkbox was telling the operator something the file did
// not do.

test('toggleQuoteSelection: ticking one tier ticks every tier of that quote', () => {
  const next = toggleQuoteSelection(TABLE, new Set(), '1-1');
  assert.deepEqual([...next].sort(), ['1-1', '1-2']);
});

test('toggleQuoteSelection: un-ticking one tier un-ticks the whole quote', () => {
  const on = toggleQuoteSelection(TABLE, new Set(), '2-1');
  const off = toggleQuoteSelection(TABLE, on, '2-2');
  assert.equal(off.size, 0, 'clicking either tier clears both');
});

test('toggleQuoteSelection: other quotes are untouched', () => {
  let sel = toggleQuoteSelection(TABLE, new Set(), '1-1');
  sel = toggleQuoteSelection(TABLE, sel, '3-2');
  assert.deepEqual([...sel].sort(), ['1-1', '1-2', '3-1', '3-2']);
  sel = toggleQuoteSelection(TABLE, sel, '1-2');
  assert.deepEqual([...sel].sort(), ['3-1', '3-2']);
});

// The tier hidden by the search box must be ticked too, or clearing the
// filter reveals an un-ticked sibling of a quote the operator believes is
// fully selected.
test('toggleQuoteSelection: reaches tiers the current filter is hiding', () => {
  const visibleOnly = [row(1, 1)]; // tier 2 filtered out of view
  const next = toggleQuoteSelection(TABLE, new Set(), '1-1');
  assert.equal(next.has('1-2'), true, 'ticked from the full row set, not the visible one');
  assert.equal(toggleQuoteSelection(visibleOnly, new Set(), '1-1').has('1-2'), false);
});

test('toggleQuoteSelection: an unresolvable row still toggles itself', () => {
  const next = toggleQuoteSelection(TABLE, new Set(), 'ghost-9');
  assert.deepEqual([...next], ['ghost-9']);
  assert.equal(toggleQuoteSelection(TABLE, next, 'ghost-9').size, 0);
});

test('toggleQuoteSelection: never mutates the selection it was given', () => {
  const before = new Set(['1-1']);
  toggleQuoteSelection(TABLE, before, '3-1');
  assert.deepEqual([...before], ['1-1']);
});

// ─── pinSelected — the basket survives the next search ─────────────
// An operator searches an RFQ, ticks it, searches the next, ticks that.
// The earlier picks used to vanish, leaving "NO ROWS SELECTED" over a
// table whose selection was still alive in memory.

test('pinSelected: a ticked row the filter dropped comes back', () => {
  const visible = [row(3, 1), row(3, 2)]; // search matched quote 3 only
  const out = pinSelected(TABLE, visible, new Set(['1-1', '1-2']));
  assert.deepEqual(ids(out), ['1-1', '1-2', '3-1', '3-2']);
});

test('pinSelected: a ticked row the filter KEPT is not duplicated', () => {
  const visible = [row(1, 1), row(1, 2)];
  const out = pinSelected(TABLE, visible, new Set(['1-1', '1-2']));
  assert.deepEqual(ids(out), ['1-1', '1-2']);
});

test('pinSelected: no selection returns the visible rows untouched', () => {
  const visible = [row(2, 1)];
  assert.equal(pinSelected(TABLE, visible, new Set()), visible);
});

test('pinSelected: tolerates junk input', () => {
  assert.deepEqual(pinSelected(null, null, new Set(['1-1'])), []);
  assert.deepEqual(ids(pinSelected(TABLE, [], new Set(['2-2']))), ['2-2']);
});

// The whole reported workflow, end to end.
test('tick quote 1, search away to quote 3, tick that: both baskets visible and exported', () => {
  let sel = toggleQuoteSelection(TABLE, new Set(), '1-2');
  const afterSearch = [row(3, 1), row(3, 2)]; // the new search result
  sel = toggleQuoteSelection(TABLE, sel, '3-1');
  const shown = orderBySelection(pinSelected(TABLE, afterSearch, sel), sel);
  assert.deepEqual(ids(shown), ['1-1', '1-2', '3-1', '3-2'], 'earlier pick first, newest behind');
  assert.equal(
    shown.every((r) => sel.has(r.id)),
    true,
    'no un-ticked row among the selection'
  );
  assert.deepEqual(ids(rowsForExport(shown, sel)), ['1-1', '1-2', '3-1', '3-2']);
});
