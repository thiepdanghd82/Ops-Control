import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENCIES, DEFAULT_CURRENCY, normalizeCurrency, priceInUsd } from './materialCurrency.js';

test('only USD and VND are offered', () => {
  assert.deepEqual(CURRENCIES, ['USD', 'VND']);
  assert.equal(DEFAULT_CURRENCY, 'USD');
});

test('rows written before the field existed read as USD', () => {
  // 3060 live rows have no `currency` key. The old column header said
  // "USD / M²", so that is what they are.
  assert.equal(normalizeCurrency(undefined), 'USD');
  assert.equal(normalizeCurrency(''), 'USD');
});

test('normalizeCurrency accepts case and spacing, rejects anything else', () => {
  assert.equal(normalizeCurrency('vnd'), 'VND');
  assert.equal(normalizeCurrency(' Vnd '), 'VND');
  assert.equal(
    normalizeCurrency('EUR'),
    'USD',
    'a third currency is not selectable, so it is not honoured'
  );
  assert.equal(normalizeCurrency('VN'), 'USD');
});

test('a USD row passes its number straight through', () => {
  assert.deepEqual(priceInUsd({ price: '2.45', currency: 'USD' }, 26122), {
    ok: true,
    usd: 2.45,
    reason: 'usd',
  });
});

test('a USD row ignores the rate entirely — even a missing one', () => {
  assert.equal(priceInUsd({ price: 3.35 }, 0).ok, true);
  assert.equal(priceInUsd({ price: 3.35 }, undefined).usd, 3.35);
});

test('a VND row converts against the quote rate', () => {
  // The real row: 64000 đ/m² at the rate Henry divided by, giving the 2.45 he
  // typed in by hand.
  const r = priceInUsd({ price: 64000, currency: 'VND' }, 26122);
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'converted');
  assert.ok(Math.abs(r.usd - 2.45) < 0.001, `expected ≈2.45, got ${r.usd}`);
});

test('a VND row with no usable rate REFUSES rather than writing 0 or Infinity', () => {
  for (const rate of [0, -1, undefined, null, '', 'abc', NaN]) {
    const r = priceInUsd({ price: 64000, currency: 'VND' }, rate);
    assert.equal(r.ok, false, `rate ${JSON.stringify(rate)} must refuse`);
    assert.equal(r.reason, 'no_usd_rate');
    assert.equal(r.usd, 0);
  }
});

test('prose in the price field refuses — it must not price at $0', () => {
  // 50 live rows look like this.
  for (const p of ['Change to FLD', 'no more production', '6900 vnđ / roll', 'used 385T-J1']) {
    const r = priceInUsd({ price: p, currency: 'USD' }, 26122);
    assert.equal(r.ok, false, `${p} must refuse`);
    assert.equal(r.reason, 'price_not_numeric');
  }
});

test('an empty price refuses — Number("") is 0, not NaN', () => {
  // 403 live rows have a blank price. Checking Number() alone would have let
  // every one of them through as a valid $0.
  for (const p of ['', '   ', null, undefined]) {
    const r = priceInUsd({ price: p }, 26122);
    assert.equal(r.ok, false, `${JSON.stringify(p)} must refuse`);
    assert.equal(r.reason, 'price_empty');
  }
  assert.equal(priceInUsd({}, 26122).reason, 'price_empty', 'a row with no price key at all');
});

test('a negative price refuses', () => {
  assert.equal(priceInUsd({ price: -5 }, 26122).reason, 'price_negative');
});
