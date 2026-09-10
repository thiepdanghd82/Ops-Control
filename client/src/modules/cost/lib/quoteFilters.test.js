import test from 'node:test';
import assert from 'node:assert/strict';
import { applyQuoteFilters, quoteAccessor, EMPTY_FILTER } from './quoteFilters.js';

// Summarize-style flat rows (already projected from quote.state).
const summarizeRows = [
  {
    id: '1-1',
    saved_at: '2026-06-01T08:00:00Z',
    direct_cu: 'Samsung',
    direct_cu_pn: 'DA64-05837A',
    end_cu_pn: 'EU-001',
    project: 'WhiteGoods',
    sale_owner: 'Alice',
    npi_owner: 'Bob',
    trade_mode: 'FOB',
    description: 'fridge label',
  },
  {
    id: '2-1',
    saved_at: '2026-06-05T10:00:00Z',
    direct_cu: 'Panasonic',
    direct_cu_pn: 'PN-100',
    end_cu_pn: 'EU-002',
    project: 'Audio',
    sale_owner: 'Charlie',
    npi_owner: 'Diana',
    trade_mode: 'CIF',
    description: 'speaker label',
  },
  {
    id: '3-1',
    saved_at: '2026-06-09T12:00:00Z',
    direct_cu: 'Sony',
    direct_cu_pn: 'SO-200',
    end_cu_pn: 'EU-003',
    project: 'Camera',
    sale_owner: 'Eve',
    npi_owner: 'Frank',
    trade_mode: 'EXW',
    description: 'lens label',
  },
];

test('empty filter returns full row set', () => {
  const out = applyQuoteFilters(summarizeRows, EMPTY_FILTER);
  assert.equal(out.length, 3);
  assert.equal(out, summarizeRows);
});

test('global query matches direct_cu_pn (contains, case-insensitive)', () => {
  const out = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, query: 'da64' });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '1-1');
});

test('global query matches sale_owner — REGRESSION for Summarize miss', () => {
  // Pre-shared-infra: Summarize global search did NOT include sale_owner.
  // This test guards against re-introducing that bug.
  const out = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, query: 'charlie' });
  assert.equal(out.length, 1);
  assert.equal(out[0].sale_owner, 'Charlie');
});

test('date range inclusive at both ends', () => {
  const out = applyQuoteFilters(summarizeRows, {
    ...EMPTY_FILTER,
    dateFrom: '2026-06-01',
    dateTo: '2026-06-09',
  });
  assert.equal(out.length, 3);
});

test('date range one-sided: only dateFrom', () => {
  const out = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, dateFrom: '2026-06-05' });
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((r) => r.id),
    ['2-1', '3-1']
  );
});

test('date range one-sided: only dateTo', () => {
  const out = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, dateTo: '2026-06-05' });
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((r) => r.id),
    ['1-1', '2-1']
  );
});

test('customer scope matches direct_cu (case-insensitive)', () => {
  const out = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, customer: 'sony' });
  assert.equal(out.length, 1);
  assert.equal(out[0].direct_cu, 'Sony');
});

test('customer scope matches end_cu when populated', () => {
  const rows = [
    { id: 'a', direct_cu: 'X', end_cu: 'BoschOEM', project: 'FOO' },
    { id: 'b', direct_cu: 'Y', end_cu: 'OtherCo', project: 'FOO' },
  ];
  const out = applyQuoteFilters(rows, { ...EMPTY_FILTER, customer: 'bosch' });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'a');
});

test('customer scope fallback end_cu || project — S-PROJFIX regression', () => {
  // Standard quote aliases End Customer into state.project (Lesson 21).
  // When end_cu is empty, filter MUST fall through to project so Standard
  // quotes remain searchable by their End Customer text.
  const rows = [
    { id: 'std', direct_cu: 'Acme', end_cu: '', project: 'WaltonWorks' },
    { id: 'cpx', direct_cu: 'Acme', end_cu: 'TrueEndCu', project: 'WaltonWorks' },
  ];
  const out = applyQuoteFilters(rows, { ...EMPTY_FILTER, customer: 'walton' });
  // Std passes via project fallback; Cpx fails because end_cu wins and lacks 'walton'.
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'std');
});

test('part scope matches direct_cu_pn', () => {
  const out = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, part: 'pn-100' });
  assert.equal(out.length, 1);
  assert.equal(out[0].direct_cu_pn, 'PN-100');
});

test('part scope matches end_cu_pn', () => {
  const out = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, part: 'eu-002' });
  assert.equal(out.length, 1);
  assert.equal(out[0].end_cu_pn, 'EU-002');
});

test('sale scope matches sale_owner', () => {
  const out = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, sale: 'alice' });
  assert.equal(out.length, 1);
  assert.equal(out[0].sale_owner, 'Alice');
});

test('sale scope matches npi_owner fallback (Option B — sale+npi combined)', () => {
  // Box label "Sale" but scope union of sale_owner + npi_owner.
  // Test BOTH the npi_owner field AND the quote-level fallback via accessor.
  const out = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, sale: 'diana' });
  assert.equal(out.length, 1);
  assert.equal(out[0].npi_owner, 'Diana');
});

test('NPI quote-level fallback via quoteAccessor — regression', () => {
  // Raw quote with NPI Owner only at top level (not in state) — adapter
  // must merge state.npi_owner || quote.npi_owner so filter sees it.
  const rawQuotes = [
    { id: 7, saved_at: '2026-06-09T00:00:00Z', npi_owner: 'TopLevelOwner', state: {} },
    { id: 8, saved_at: '2026-06-09T00:00:00Z', state: { npi_owner: 'StateOwner' } },
  ];
  const out = applyQuoteFilters(rawQuotes, { ...EMPTY_FILTER, sale: 'toplevel' }, quoteAccessor);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 7);
});

test('2 filters AND-combine: customer + date range', () => {
  const out = applyQuoteFilters(summarizeRows, {
    ...EMPTY_FILTER,
    customer: 'samsung',
    dateFrom: '2026-06-01',
    dateTo: '2026-06-03',
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '1-1');
});

test('4 filters AND-combine: customer + part + sale + query', () => {
  const out = applyQuoteFilters(summarizeRows, {
    ...EMPTY_FILTER,
    customer: 'panasonic',
    part: 'pn-100',
    sale: 'charlie',
    query: 'speaker',
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].id, '2-1');
});

test('case-insensitive text scope across all filters', () => {
  const upper = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, query: 'SAMSUNG' });
  const lower = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, query: 'samsung' });
  const mixed = applyQuoteFilters(summarizeRows, { ...EMPTY_FILTER, query: 'SaMsUnG' });
  assert.equal(upper.length, 1);
  assert.equal(lower.length, 1);
  assert.equal(mixed.length, 1);
  assert.equal(upper[0].id, lower[0].id);
  assert.equal(lower[0].id, mixed[0].id);
});

test('quoteAccessor returns null for null/undefined quote', () => {
  assert.equal(quoteAccessor(null), null);
  assert.equal(quoteAccessor(undefined), null);
});

test('quoteAccessor projects raw quote into flat shape with S-PROJFIX intact', () => {
  const q = {
    id: 42,
    saved_at: '2026-06-09T00:00:00Z',
    label: 'V12',
    npi_owner: 'QuoteOwner',
    state: {
      direct_cu: 'CCL',
      end_cu: '',
      project: 'AliasedEndCu',
      direct_cu_pn: 'P1',
      end_cu_pn: 'E1',
      sale_owner: 'Sales',
      ccl_pn: 'C-1',
      rfq_number: 'RFQ-1',
    },
  };
  const r = quoteAccessor(q);
  assert.equal(r.saved_at, q.saved_at);
  assert.equal(r.direct_cu, 'CCL');
  assert.equal(r.end_cu, '');
  assert.equal(r.project, 'AliasedEndCu');
  assert.equal(r.npi_owner, 'QuoteOwner'); // quote-level fallback wins when state empty
  assert.equal(r.label, 'V12');
});

test('empty filter object (not EMPTY_FILTER constant) still works', () => {
  // Caller might pass {} — should be treated as no filter.
  const out = applyQuoteFilters(summarizeRows, {});
  assert.equal(out.length, 3);
});

test('non-array items returns []', () => {
  assert.deepEqual(applyQuoteFilters(null, EMPTY_FILTER), []);
  assert.deepEqual(applyQuoteFilters(undefined, EMPTY_FILTER), []);
});
