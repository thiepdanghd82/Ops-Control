import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteMessage, DELETE_WINDOW_MS } from './messageActions.js';

const T0 = Date.parse('2026-09-17T10:00:00.000Z');
const msg = (over = {}) => ({ author_id: 7, created_at: '2026-09-17T10:00:00.000Z', ...over });

test('own message inside the window → can delete', () => {
  assert.equal(canDeleteMessage(msg(), 7, T0 + 60_000), true);
});

test("someone else's message → cannot delete, however fresh", () => {
  assert.equal(canDeleteMessage(msg({ author_id: 9 }), 7, T0 + 1_000), false);
});

test('already a tombstone → cannot delete again (server answers 410)', () => {
  assert.equal(canDeleteMessage(msg({ deleted_at: '2026-09-17T10:01:00.000Z' }), 7, T0), false);
});

test('one second past the window → cannot delete', () => {
  assert.equal(canDeleteMessage(msg(), 7, T0 + DELETE_WINDOW_MS + 1_000), false);
});

test('exactly at the window boundary → cannot delete (server uses > , so === is refused here too)', () => {
  // Server: `ageMs(created) > EDIT_WINDOW_MS` rejects. At exactly the
  // boundary the server still ALLOWS. We refuse one millisecond early
  // rather than offer a button whose answer depends on network latency.
  assert.equal(canDeleteMessage(msg(), 7, T0 + DELETE_WINDOW_MS), false);
});

test('just inside the window → can delete', () => {
  assert.equal(canDeleteMessage(msg(), 7, T0 + DELETE_WINDOW_MS - 1), true);
});

test('string vs number ids still compare equal', () => {
  assert.equal(canDeleteMessage(msg({ author_id: '7' }), 7, T0 + 1_000), true);
  assert.equal(canDeleteMessage(msg(), '7', T0 + 1_000), true);
});

test('no message at all → false, no throw', () => {
  assert.equal(canDeleteMessage(null, 7, T0), false);
  assert.equal(canDeleteMessage(undefined, 7, T0), false);
});

test('null author AND null viewer must NOT match — Number(null) is 0', () => {
  // The trap this guard exists for: without the explicit null check,
  // Number(null) === Number(null) is 0 === 0, and an anonymous viewer
  // would be handed a delete button on an authorless row.
  assert.equal(canDeleteMessage(msg({ author_id: null }), null, T0), false);
  assert.equal(canDeleteMessage(msg({ author_id: null }), 7, T0), false);
  assert.equal(canDeleteMessage(msg(), null, T0), false);
});

test('unparseable created_at → false rather than NaN-comparing to true', () => {
  assert.equal(canDeleteMessage(msg({ created_at: 'not a date' }), 7, T0), false);
  assert.equal(canDeleteMessage(msg({ created_at: undefined }), 7, T0), false);
});

test('window constant matches the server contract (15 minutes)', () => {
  assert.equal(DELETE_WINDOW_MS, 15 * 60 * 1000);
});
