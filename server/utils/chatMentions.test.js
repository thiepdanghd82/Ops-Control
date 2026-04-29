/**
 * chatMentions — Phase 10A.3 tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMentions, sanitizeChatBody } from './chatMentions.js';

const users = [
  { id: 1, username: 'hana' },
  { id: 2, username: 'sonia' },
  { id: 3, username: 'finance_dir_alice' },
];

test('parseMentions: single @user', () => {
  const r = parseMentions('hey @hana look', users);
  assert.deepEqual(r.mentionIds, [1]);
});

test('parseMentions: multiple + case-insensitive', () => {
  const r = parseMentions('@Hana and @SONIA', users);
  assert.deepEqual(r.mentionIds.sort(), [1, 2]);
});

test('parseMentions: unknown user ignored', () => {
  const r = parseMentions('@ghost and @hana', users);
  assert.deepEqual(r.mentionIds, [1]);
});

test('parseMentions: underscore + dot + hyphen allowed in username', () => {
  const r = parseMentions('CC @finance_dir_alice', users);
  assert.deepEqual(r.mentionIds, [3]);
});

test('parseMentions: email-like text does NOT double-fire', () => {
  const r = parseMentions('email: hana@example.com', users);
  // The @example part is not a known user.
  assert.deepEqual(r.mentionIds, []);
});

test('parseMentions: empty body', () => {
  const r = parseMentions('', users);
  assert.deepEqual(r.mentionIds, []);
});

test('parseMentions: deduplicates same user mentioned twice', () => {
  const r = parseMentions('@hana @hana @hana', users);
  assert.deepEqual(r.mentionIds, [1]);
});

// ── sanitizeChatBody ──

test('sanitize strips HTML tags', () => {
  assert.equal(sanitizeChatBody('<b>hi</b> <script>alert(1)</script>'), 'hi alert(1)');
});

test('sanitize strips null bytes + ANSI escapes', () => {
  assert.equal(sanitizeChatBody('ok\u0000\u001b[31mred\u001b[0m'), 'okred');
});

test('sanitize normalizes CRLF to LF', () => {
  assert.equal(sanitizeChatBody('line1\r\nline2\rline3'), 'line1\nline2\nline3');
});

test('sanitize caps at 1000 chars', () => {
  const r = sanitizeChatBody('a'.repeat(1500));
  assert.equal(r.length, 1000);
});

test('sanitize trims whitespace', () => {
  assert.equal(sanitizeChatBody('  hi  '), 'hi');
});

test('sanitize null/undefined → empty', () => {
  assert.equal(sanitizeChatBody(null), '');
  assert.equal(sanitizeChatBody(undefined), '');
});

test('sanitize preserves realistic chat content', () => {
  const msg = 'Hey @sonia — can we discuss RFQ-123? See finance report at $50k.';
  assert.equal(sanitizeChatBody(msg), msg);
});
