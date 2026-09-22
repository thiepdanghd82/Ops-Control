import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeFromSeed, noticeStillApplies } from './usdRateSeed.js';

test('a usable seed becomes a notice carrying its provenance', () => {
  const n = noticeFromSeed({
    rate: 26090,
    rfq_number: 'RFQ-2026-S0068',
    saved_at: '2026-09-22T03:42:00Z',
  });
  assert.equal(n.rate, 26090);
  assert.equal(n.rfq_number, 'RFQ-2026-S0068');
  assert.equal(n.saved_at, '2026-09-22T03:42:00Z');
});

test('nothing inheritable yields null, so nothing is seeded', () => {
  // The server answers { rate: null } on a fresh install. Seeding a 0 would
  // look like a real rate and silently zero both VND mirrors.
  for (const seed of [null, undefined, {}, { rate: null }, { rate: 0 }, { rate: -1 }]) {
    assert.equal(noticeFromSeed(seed), null, JSON.stringify(seed));
  }
});

test('a rate stored as a string still seeds', () => {
  assert.equal(noticeFromSeed({ rate: '26090' }).rate, 26090);
});

test('missing provenance degrades to empty strings rather than undefined', () => {
  const n = noticeFromSeed({ rate: 26090 });
  assert.equal(n.rfq_number, '');
  assert.equal(n.saved_at, '');
});

test('the notice applies while the box still holds the inherited rate', () => {
  const n = noticeFromSeed({ rate: 26090 });
  assert.equal(noticeStillApplies(n, 26090), true);
  assert.equal(noticeStillApplies(n, '26090'), true, 'the field holds strings');
  assert.equal(noticeStillApplies(n, ' 26090 '), true);
});

test('editing the rate retires the notice', () => {
  // Confirming a number you just typed is an alarm with no meaning, and it
  // is how people learn to click through the one that matters.
  const n = noticeFromSeed({ rate: 26090 });
  assert.equal(noticeStillApplies(n, 26500), false);
  assert.equal(noticeStillApplies(n, ''), false);
  assert.equal(noticeStillApplies(n, 0), false);
});

test('no notice never applies', () => {
  assert.equal(noticeStillApplies(null, 26090), false);
  assert.equal(noticeStillApplies(undefined, 26090), false);
});
