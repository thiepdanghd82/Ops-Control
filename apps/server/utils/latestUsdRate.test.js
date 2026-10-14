import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLatestUsdRate } from './latestUsdRate.js';

const q = (id, saved_at, usd_rate, extra = {}) => ({
  id,
  saved_at,
  state: { usd_rate, rfq_number: `RFQ-${id}` },
  ...extra,
});

test('picks the newest quote that has a rate', () => {
  const out = pickLatestUsdRate([
    q(1, '2026-09-01T00:00:00Z', 26000),
    q(2, '2026-09-20T00:00:00Z', 26090),
    q(3, '2026-09-10T00:00:00Z', 26323),
  ]);
  assert.equal(out.rate, 26090);
  assert.equal(out.quote_id, 2);
  assert.equal(out.rfq_number, 'RFQ-2');
});

test('skips newer quotes that carry no usable rate', () => {
  // The case that makes this more than a sort: 59 of the 149 live quotes
  // have no rate, so the newest quote is very often not the answer.
  const out = pickLatestUsdRate([
    q(1, '2026-09-01T00:00:00Z', 26000),
    q(2, '2026-09-22T00:00:00Z', 0),
    q(3, '2026-09-21T00:00:00Z', ''),
    q(4, '2026-09-20T00:00:00Z', null),
    q(5, '2026-09-19T00:00:00Z', undefined),
  ]);
  assert.equal(out.rate, 26000, 'falls through every unusable one to the newest that works');
  assert.equal(out.quote_id, 1);
});

test('reads a rate stored as a string, which is what the store holds', () => {
  assert.equal(pickLatestUsdRate([q(1, '2026-09-01T00:00:00Z', '26090')]).rate, 26090);
  assert.equal(pickLatestUsdRate([q(1, '2026-09-01T00:00:00Z', ' 26090 ')]).rate, 26090);
});

test('a trashed quote never supplies the rate', () => {
  const out = pickLatestUsdRate([
    q(1, '2026-09-01T00:00:00Z', 26000),
    q(2, '2026-09-22T00:00:00Z', 99999, { deleted_at: '2026-09-22T01:00:00Z' }),
  ]);
  assert.equal(out.rate, 26000, 'a rate from a quote somebody deleted must not be inherited');
});

test('negative, zero and non-numeric are all "no rate"', () => {
  for (const bad of [-1, 0, 'abc', {}, [], NaN, Infinity]) {
    assert.equal(pickLatestUsdRate([q(1, '2026-09-01T00:00:00Z', bad)]), null, String(bad));
  }
});

test('no quote with a rate yields null, not a zero', () => {
  // null means "nothing to inherit", which is what keeps the old blank-field
  // block in place on a fresh install. A 0 would read as a real answer.
  assert.equal(pickLatestUsdRate([]), null);
  assert.equal(pickLatestUsdRate([q(1, '2026-09-01T00:00:00Z', 0)]), null);
});

test('a malformed or missing saved_at sorts oldest instead of throwing', () => {
  const out = pickLatestUsdRate([q(1, 'not-a-date', 11111), q(2, '2026-09-01T00:00:00Z', 26000)]);
  assert.equal(out.rate, 26000);
  // and it is still selectable when it is the only candidate
  assert.equal(pickLatestUsdRate([q(1, 'not-a-date', 11111)]).rate, 11111);
});

test('junk input does not throw', () => {
  for (const bad of [undefined, null, 'nope', 42, {}]) {
    assert.equal(pickLatestUsdRate(bad), null);
  }
  assert.equal(pickLatestUsdRate([null, undefined, {}, { state: null }]), null);
});
