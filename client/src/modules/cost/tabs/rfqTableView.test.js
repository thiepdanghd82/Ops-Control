/**
 * rfqTableView — pure sort/filter/search pipeline + edit-by-rid tests.
 *   node --test client/src/modules/cost/tabs/rfqTableView.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySort,
  cycleSort,
  matchFilter,
  applyColumnFilters,
  buildView,
  distinctValues,
  assignRids,
  applyEditByRid,
  deleteByRid,
  stripRids,
  isBlank,
  isPctBad,
  rowNeedsReason,
  rowsNeedingReason,
} from './rfqTableView.js';

// Column model subset (mirrors RfqTracking.COLUMNS types)
const COLS = {
  customer: { key: 'customer', type: 'text' },
  moq: { key: 'moq', type: 'num' },
  gm: { key: 'gm', type: 'pct' },
  rfq_date: { key: 'rfq_date', type: 'date' },
  npi_stage: { key: 'npi_stage', type: 'text' },
};

const ROWS = () => [
  {
    _rid: 'a',
    customer: 'Netgear',
    moq: 1000,
    gm: -0.2777,
    rfq_date: '2026-01-05',
    npi_stage: '6. Quoted',
  },
  {
    _rid: 'b',
    customer: 'LG',
    moq: 20000,
    gm: 0.3,
    rfq_date: '2026-01-08',
    npi_stage: '6. Quoted',
  },
  { _rid: 'c', customer: 'apple', moq: 500, gm: 0.1, rfq_date: '2026-02-01', npi_stage: '1. New' },
  { _rid: 'd', customer: '', moq: '', gm: '', rfq_date: '', npi_stage: '' }, // blanks
];

// ── Sort ──────────────────────────────────────────────────────────
test('sort text asc/desc is case-insensitive; blanks last both ways', () => {
  const asc = applySort(ROWS(), { key: 'customer', dir: 'asc' }, COLS).map((r) => r._rid);
  assert.deepEqual(asc, ['c', 'b', 'a', 'd'], 'apple < LG < Netgear, blank last');
  const desc = applySort(ROWS(), { key: 'customer', dir: 'desc' }, COLS).map((r) => r._rid);
  assert.deepEqual(desc, ['a', 'b', 'c', 'd'], 'reverse but blank STILL last');
});

test('sort num + pct numeric; blanks last', () => {
  const num = applySort(ROWS(), { key: 'moq', dir: 'asc' }, COLS).map((r) => r._rid);
  assert.deepEqual(num, ['c', 'a', 'b', 'd'], '500 < 1000 < 20000, blank last');
  const pct = applySort(ROWS(), { key: 'gm', dir: 'asc' }, COLS).map((r) => r._rid);
  assert.deepEqual(pct, ['a', 'c', 'b', 'd'], '-0.2777 < 0.1 < 0.3, blank last');
});

test('sort date chronological; blanks last', () => {
  const d = applySort(ROWS(), { key: 'rfq_date', dir: 'asc' }, COLS).map((r) => r._rid);
  assert.deepEqual(d, ['a', 'b', 'c', 'd']);
  const dd = applySort(ROWS(), { key: 'rfq_date', dir: 'desc' }, COLS).map((r) => r._rid);
  assert.deepEqual(dd, ['c', 'b', 'a', 'd'], 'desc but blank last');
});

test('sort none returns original order', () => {
  assert.deepEqual(
    applySort(ROWS(), null, COLS).map((r) => r._rid),
    ['a', 'b', 'c', 'd']
  );
});

test('cycleSort tri-state asc → desc → none', () => {
  assert.deepEqual(cycleSort(null, 'moq'), { key: 'moq', dir: 'asc' });
  assert.deepEqual(cycleSort({ key: 'moq', dir: 'asc' }, 'moq'), { key: 'moq', dir: 'desc' });
  assert.equal(cycleSort({ key: 'moq', dir: 'desc' }, 'moq'), null);
  // switching column starts fresh at asc
  assert.deepEqual(cycleSort({ key: 'moq', dir: 'desc' }, 'customer'), {
    key: 'customer',
    dir: 'asc',
  });
});

// ── Filter ────────────────────────────────────────────────────────
test('text contains (case-insensitive)', () => {
  assert.equal(matchFilter('Netgear', 'net', 'text'), true);
  assert.equal(matchFilter('LG', 'net', 'text'), false);
});

test('num range min/max; pct entered as %', () => {
  assert.equal(matchFilter(1000, { min: '600', max: '5000' }, 'num'), true);
  assert.equal(matchFilter(20000, { min: '600', max: '5000' }, 'num'), false);
  assert.equal(matchFilter('', { min: '600', max: '' }, 'num'), false, 'blank excluded from range');
  // gm fraction 0.3 → 30% within [10,40]%
  assert.equal(matchFilter(0.3, { min: '10', max: '40' }, 'pct'), true);
  assert.equal(matchFilter(-0.2777, { min: '0', max: '' }, 'pct'), false, '-27.77% < 0%');
});

test('date from/to range on ISO prefix', () => {
  assert.equal(matchFilter('2026-01-08', { from: '2026-01-01', to: '2026-01-31' }, 'date'), true);
  assert.equal(matchFilter('2026-02-01', { from: '2026-01-01', to: '2026-01-31' }, 'date'), false);
});

test('enum multi-select membership', () => {
  assert.equal(matchFilter('6. Quoted', ['6. Quoted', '1. New'], 'text'), true);
  assert.equal(matchFilter('9. Lost', ['6. Quoted', '1. New'], 'text'), false);
});

test('applyColumnFilters AND-combines across columns', () => {
  const out = applyColumnFilters(
    ROWS(),
    { customer: 'e', npi_stage: ['6. Quoted'] }, // "e" in Netgear; stage quoted
    COLS
  ).map((r) => r._rid);
  assert.deepEqual(out, ['a'], 'Netgear(6.Quoted) only — LG lacks "e", apple wrong stage');
});

test('distinctValues excludes blanks, sorted', () => {
  assert.deepEqual(distinctValues(ROWS(), 'npi_stage'), ['1. New', '6. Quoted']);
});

// ── Pipeline (search → filter → sort) ─────────────────────────────
test('buildView composes global search + filters + sort', () => {
  const rows = ROWS();
  const view = buildView(rows, {
    search: 'e', // Netgear, apple (both contain "e")
    searchKeys: ['customer'],
    filters: { moq: { min: '400', max: '2000' } }, // apple 500, Netgear 1000
    sort: { key: 'moq', dir: 'desc' },
    columnsByKey: COLS,
  });
  assert.deepEqual(
    view.map((r) => r._rid),
    ['a', 'c'],
    'Netgear(1000) before apple(500), desc'
  );
});

// ── Edit by stable _rid (CRITICAL trap) ───────────────────────────
test('edit-by-rid mutates the right source row while sorted/filtered', () => {
  const rows = ROWS();
  // Active sort makes display order != source order.
  const view = buildView(rows, { sort: { key: 'moq', dir: 'asc' }, columnsByKey: COLS });
  assert.deepEqual(
    view.map((r) => r._rid),
    ['c', 'a', 'b', 'd']
  );
  // The row at display index 0 is 'c' (apple). Editing 'a' by rid must hit 'a'.
  const next = applyEditByRid(rows, 'a', 'customer', 'CHANGED');
  assert.equal(next.find((r) => r._rid === 'a').customer, 'CHANGED');
  assert.equal(next.find((r) => r._rid === 'c').customer, 'apple', 'sibling untouched');
  // source array identity of untouched rows preserved (only 'a' replaced)
  assert.equal(
    next.find((r) => r._rid === 'b'),
    rows.find((r) => r._rid === 'b')
  );
});

test('assignRids adds _rid only to rows missing it', () => {
  const withRids = assignRids([{ customer: 'X' }, { _rid: 'keep', customer: 'Y' }]);
  assert.equal(withRids[0]._rid, 'r0');
  assert.equal(withRids[1]._rid, 'keep');
});

test('deleteByRid + stripRids', () => {
  const rows = ROWS();
  assert.deepEqual(
    deleteByRid(rows, 'b').map((r) => r._rid),
    ['a', 'c', 'd']
  );
  const stripped = stripRids([{ _rid: 'x', customer: 'Z' }]);
  assert.deepEqual(stripped, [{ customer: 'Z' }]);
  assert.equal('_rid' in stripped[0], false);
});

test('isBlank contract', () => {
  assert.equal(isBlank(''), true);
  assert.equal(isBlank(null), true);
  assert.equal(isBlank('  '), true);
  assert.equal(isBlank(0), false);
  assert.equal(isBlank('x'), false);
});

test('isPctBad flags fractions below the margin threshold (blank never flagged)', () => {
  // GM < 0
  assert.equal(isPctBad(0, -0.2777), true, 'GM -27.77% is bad');
  assert.equal(isPctBad(0, 0), false, 'GM exactly 0% is ok (not < 0)');
  assert.equal(isPctBad(0, 0.15), false, 'GM 15% ok');
  // Contr < 0.25
  assert.equal(isPctBad(0.25, 0.1), true, 'Contr 10% is bad');
  assert.equal(isPctBad(0.25, 0.25), false, 'Contr exactly 25% ok');
  assert.equal(isPctBad(0.25, 0.3), false, 'Contr 30% ok');
  // VA < 0.30
  assert.equal(isPctBad(0.3, 0.2), true, 'VA 20% is bad');
  assert.equal(isPctBad(0.3, 0.3), false, 'VA exactly 30% ok');
  // blanks / non-numeric never flagged
  assert.equal(isPctBad(0.3, ''), false);
  assert.equal(isPctBad(0, null), false);
  assert.equal(isPctBad(0.25, 'abc'), false);
  assert.equal(isPctBad(null, -1), false, 'no threshold → never bad');
});

test('rowNeedsReason: Rejected/Cancel need a Notes/Reason; others never do', () => {
  assert.equal(rowNeedsReason({ sale_stage: 'Rejected', notes: '' }), true);
  assert.equal(rowNeedsReason({ sale_stage: 'Cancel', notes: '   ' }), true, 'whitespace = blank');
  assert.equal(rowNeedsReason({ sale_stage: 'Rejected', notes: 'no budget' }), false, 'filled ok');
  assert.equal(rowNeedsReason({ sale_stage: 'Cancel', notes: 'dup RFQ' }), false);
  assert.equal(rowNeedsReason({ sale_stage: 'Approved', notes: '' }), false, 'Approved no reason');
  assert.equal(
    rowNeedsReason({ sale_stage: 'Other-custom', notes: '' }),
    false,
    'custom no reason'
  );
  assert.equal(rowNeedsReason({ sale_stage: '', notes: '' }), false, 'blank stage no reason');
  assert.equal(rowNeedsReason({}), false);
});

test('rowsNeedingReason returns only the offending rows', () => {
  const rows = [
    { _rid: 'a', sale_stage: 'Rejected', notes: '' }, // offender
    { _rid: 'b', sale_stage: 'Rejected', notes: 'reason' }, // ok
    { _rid: 'c', sale_stage: 'Approved', notes: '' }, // ok
    { _rid: 'd', sale_stage: 'Cancel', notes: '' }, // offender
  ];
  assert.deepEqual(
    rowsNeedingReason(rows).map((r) => r._rid),
    ['a', 'd']
  );
  assert.deepEqual(rowsNeedingReason([]), []);
});
