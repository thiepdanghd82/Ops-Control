import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteMessage, isAdminOverride } from './messageActions.js';

const msg = (over = {}) => ({ author_id: 7, created_at: '2026-09-17T10:00:00.000Z', ...over });
const ADMIN = { isAdmin: true };

test('own message → can recall', () => {
  assert.equal(canDeleteMessage(msg(), 7), true);
});

test('own message stays recallable however old — there is no time limit', () => {
  assert.equal(canDeleteMessage(msg({ created_at: '2019-01-01T00:00:00.000Z' }), 7), true);
});

test("someone else's message → ordinary user cannot recall", () => {
  assert.equal(canDeleteMessage(msg({ author_id: 9 }), 7), false);
  assert.equal(canDeleteMessage(msg({ author_id: 9 }), 7, { isAdmin: false }), false);
});

test("someone else's message → admin can recall", () => {
  assert.equal(canDeleteMessage(msg({ author_id: 9 }), 7, ADMIN), true);
});

test('already a tombstone → nobody can recall again, admin included', () => {
  const dead = msg({ deleted_at: '2026-09-17T10:01:00.000Z' });
  assert.equal(canDeleteMessage(dead, 7), false);
  assert.equal(canDeleteMessage(dead, 7, ADMIN), false);
});

test('string vs number ids still compare equal', () => {
  assert.equal(canDeleteMessage(msg({ author_id: '7' }), 7), true);
  assert.equal(canDeleteMessage(msg(), '7'), true);
});

test('no message at all → false, no throw', () => {
  assert.equal(canDeleteMessage(null, 7), false);
  assert.equal(canDeleteMessage(undefined, 7, ADMIN), false);
});

test('null author AND null viewer must NOT match — Number(null) is 0', () => {
  // The trap this guard exists for: without the explicit null checks,
  // Number(null) === Number(null) is 0 === 0, and an anonymous viewer
  // would be handed a recall button on an authorless row.
  assert.equal(canDeleteMessage(msg({ author_id: null }), null), false);
  assert.equal(canDeleteMessage(msg({ author_id: null }), 7), false);
  assert.equal(canDeleteMessage(msg(), null), false);
});

test('an authorless row is not recallable even by an admin', () => {
  // Admin override widens WHO may act, not WHAT may be acted on.
  assert.equal(canDeleteMessage(msg({ author_id: null }), 7, ADMIN), false);
});

test('isAdminOverride distinguishes recalling your own from someone else`s', () => {
  assert.equal(isAdminOverride(msg(), 7), false);
  assert.equal(isAdminOverride(msg({ author_id: 9 }), 7), true);
  assert.equal(isAdminOverride(msg({ author_id: '7' }), 7), false, 'mixed id types');
});

test('isAdminOverride is false rather than throwing on missing data', () => {
  assert.equal(isAdminOverride(null, 7), false);
  assert.equal(isAdminOverride(msg({ author_id: null }), 7), false);
  assert.equal(isAdminOverride(msg(), null), false);
});
