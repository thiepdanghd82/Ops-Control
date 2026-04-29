/**
 * quoteShape — Phase 9M.1 tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuote, filterQuoteHistory } from './quoteShape.js';

// ── validateQuote ──

test('valid minimal quote passes', () => {
  const r = validateQuote({ id: 1, type: 'standard', state: { moq: 100 } });
  assert.equal(r.ok, true);
});

test('valid legacy quote without type passes', () => {
  const r = validateQuote({ id: 2, state: {} });
  assert.equal(r.ok, true);
});

test('missing id allowed (draft)', () => {
  const r = validateQuote({ state: { moq: 100 } });
  assert.equal(r.ok, true);
});

test('null rejected (not an object)', () => {
  assert.equal(validateQuote(null).ok, false);
  assert.equal(validateQuote(undefined).ok, false);
  assert.equal(validateQuote('oops').ok, false);
});

test('array rejected (not a plain object)', () => {
  assert.equal(validateQuote([1, 2]).ok, false);
});

test('non-number id rejected', () => {
  assert.equal(validateQuote({ id: 'abc' }).ok, false);
});

test('unknown type rejected', () => {
  assert.equal(validateQuote({ id: 1, type: 'invoice' }).ok, false);
});

test('state as string rejected', () => {
  const r = validateQuote({ id: 1, state: 'garbage' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'state_not_object');
});

test('state.approval as string rejected', () => {
  const r = validateQuote({ id: 1, state: { approval: 'pending' } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'approval_not_object');
});

test('over-long string field rejected', () => {
  const r = validateQuote({ id: 1, rfq_number: 'x'.repeat(1000) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'rfq_number_invalid');
});

test('non-string ccl_pn rejected', () => {
  const r = validateQuote({ id: 1, ccl_pn: 12345 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'ccl_pn_invalid');
});

test('oversized state rejected', () => {
  const bigString = 'x'.repeat(3 * 1024 * 1024); // 3 MB
  const r = validateQuote({ id: 1, state: { blob: bigString } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'state_too_large');
});

test('valid complex quote with full state passes', () => {
  const q = {
    id: 42,
    type: 'complex',
    rfq_number: 'RFQ-2024-001',
    ccl_pn: 'T3000042',
    direct_cu: 'Brady',
    state: {
      moq: 10000,
      approval: { status: 'pending_sales', history: [] },
      subproducts: [{ materials: [], inks: [], processes: [] }],
    },
  };
  assert.equal(validateQuote(q).ok, true);
});

// ── filterQuoteHistory ──

test('filterQuoteHistory splits valid from invalid', () => {
  const arr = [
    { id: 1, state: {} },
    null,
    { id: 2, state: 'bad' },
    { id: 3, type: 'standard', state: {} },
  ];
  const { valid, dropped } = filterQuoteHistory(arr);
  assert.equal(valid.length, 2);
  assert.equal(dropped.length, 2);
  assert.equal(valid[0].id, 1);
  assert.equal(valid[1].id, 3);
  assert.equal(dropped[0].reason, 'quote_not_object');
  assert.equal(dropped[1].reason, 'state_not_object');
});

test('filterQuoteHistory rejects non-array input', () => {
  const r = filterQuoteHistory('nope');
  assert.equal(r.valid.length, 0);
  assert.equal(r.dropped[0].reason, 'not_an_array');
});

test('filterQuoteHistory caps at MAX_QUOTES', () => {
  const huge = new Array(60_000).fill({ id: 1, state: {} });
  const r = filterQuoteHistory(huge);
  assert.equal(r.valid.length, 0);
  assert.equal(r.dropped[0].reason, 'too_many_quotes');
});

test('filterQuoteHistory returns empty arrays for empty input', () => {
  const r = filterQuoteHistory([]);
  assert.equal(r.valid.length, 0);
  assert.equal(r.dropped.length, 0);
});
