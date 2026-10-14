import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeFromSeed, noticeStillApplies, rateNoticeKey } from './usdRateSeed.js';

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

// ── rateNoticeKey (2026-09-30) ──
// The dialog stays mounted while hidden, so its rate input is initialised
// from a null notice (0). A key that changed only with the rate never
// remounted it when the dialog OPENED, and the operator met an empty box
// under "Taken from your most recent quote". The key must change on open.
test('rateNoticeKey: opening the dialog changes the key, so the input re-initialises', () => {
  const n = { rate: 26090, rfq_number: 'RFQ-2026-S0081', saved_at: '2026-09-30T01:00:00Z' };
  assert.notEqual(rateNoticeKey(n, false), rateNoticeKey(n, true));
});

test('rateNoticeKey: a different inherited rate is a different key while open', () => {
  assert.notEqual(rateNoticeKey({ rate: 26090 }, true), rateNoticeKey({ rate: 26341 }, true));
});

test('rateNoticeKey: reopening after Go back remounts again (typing is not kept)', () => {
  const n = { rate: 26090 };
  const seq = [false, true, false, true].map((open) => rateNoticeKey(n, open));
  assert.notEqual(seq[0], seq[1]);
  assert.notEqual(seq[1], seq[2]);
});

test('rateNoticeKey: no notice is the closed key whatever the open flag', () => {
  assert.equal(rateNoticeKey(null, true), rateNoticeKey(null, false));
});
