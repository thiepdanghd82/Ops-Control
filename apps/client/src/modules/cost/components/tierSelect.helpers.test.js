import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTierIdx, planTierViewSync } from './tierSelect.helpers.js';

// ── clampTierIdx ────────────────────────────────────────────────────

test('clampTierIdx: an in-range index is returned unchanged', () => {
  assert.equal(clampTierIdx(0, 3), 0);
  assert.equal(clampTierIdx(2, 3), 2);
});

test('clampTierIdx: an index past the last tier lands on the last one', () => {
  // The case that matters: a tier is deleted on another sub-tab while this
  // one is open. tiers[stale] is undefined, which renders a blank card rather
  // than throwing — the silent kind of wrong.
  assert.equal(clampTierIdx(5, 3), 2);
  assert.equal(clampTierIdx(1, 1), 0);
});

test('clampTierIdx: no tiers yields 0 rather than -1', () => {
  assert.equal(clampTierIdx(0, 0), 0);
  assert.equal(clampTierIdx(3, 0), 0);
});

test('clampTierIdx: negative and non-finite inputs read as 0', () => {
  assert.equal(clampTierIdx(-1, 3), 0);
  assert.equal(clampTierIdx(NaN, 3), 0);
  assert.equal(clampTierIdx(undefined, 3), 0);
  assert.equal(clampTierIdx(1, NaN), 0);
});

// ── planTierViewSync ────────────────────────────────────────────────

test('planTierViewSync: aligned view needs no change', () => {
  assert.equal(planTierViewSync({ idx: 0, seenActive: 0 }, 0), null);
  assert.equal(planTierViewSync({ idx: 2, seenActive: 2 }, 2), null);
});

test('planTierViewSync: a manual pick is left alone', () => {
  // The whole point of seenActive. The operator chose MOQ 3 while the quote's
  // active tier is still 0; idx !== seenActive is NOT a reason to re-sync, or
  // following would fight every pick the moment it was made.
  assert.equal(planTierViewSync({ idx: 2, seenActive: 0 }, 0), null);
});

test('planTierViewSync: the active tier moving pulls the view with it', () => {
  assert.deepEqual(planTierViewSync({ idx: 2, seenActive: 0 }, 1), { idx: 1, seenActive: 1 });
  assert.deepEqual(planTierViewSync({ idx: 0, seenActive: 0 }, 3), { idx: 3, seenActive: 3 });
});

test('planTierViewSync: a missing or malformed view initialises to active', () => {
  assert.deepEqual(planTierViewSync(undefined, 2), { idx: 2, seenActive: 2 });
  assert.deepEqual(planTierViewSync(null, 0), { idx: 0, seenActive: 0 });
});

test('planTierViewSync: a non-finite active index reads as 0', () => {
  assert.deepEqual(planTierViewSync({ idx: 1, seenActive: 1 }, undefined), {
    idx: 0,
    seenActive: 0,
  });
});

test('planTierViewSync: re-syncing twice to the same active is idempotent', () => {
  const first = planTierViewSync({ idx: 2, seenActive: 0 }, 1);
  assert.equal(planTierViewSync(first, 1), null, 'a settled view must stop re-syncing');
});
