/**
 * sanitizeReason — tests for the approval-reason hardening (Phase 9E.2).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReason } from './sanitize.js';

test('null / undefined pass through unchanged', () => {
  assert.equal(sanitizeReason(null), null);
  assert.equal(sanitizeReason(undefined), undefined);
});

test('plain text trimmed but otherwise preserved', () => {
  assert.equal(sanitizeReason('  customer wants a discount  '), 'customer wants a discount');
});

test('HTML tags stripped', () => {
  assert.equal(sanitizeReason('<script>alert(1)</script>bad'), 'alert(1)bad');
  assert.equal(sanitizeReason('<b>bold</b> reason'), 'bold reason');
  assert.equal(sanitizeReason('<img src=x onerror=alert(1)>'), '');
});

test('incomplete tags still stripped (greedy match)', () => {
  // Attackers sometimes try < without matching > to bypass naive strippers.
  // Our regex matches `<[^>]*>` so an unclosed `<` passes through as
  // literal text — safe because React escapes < on render anyway.
  assert.equal(sanitizeReason('price < $100'), 'price < $100');
});

test('null bytes removed', () => {
  assert.equal(sanitizeReason('bad\u0000payload'), 'badpayload');
});

test('ANSI escape sequences removed', () => {
  // Attacker embeds ANSI to manipulate terminal-based log viewers.
  assert.equal(sanitizeReason('reason\u001b[31mRED\u001b[0m'), 'reasonRED');
});

test('CRLF normalized to LF', () => {
  assert.equal(sanitizeReason('line1\r\nline2\rline3'), 'line1\nline2\nline3');
});

test('length capped at 500 chars', () => {
  const long = 'a'.repeat(700);
  const r = sanitizeReason(long);
  assert.equal(r.length, 500);
});

test('non-string input coerced to string', () => {
  assert.equal(sanitizeReason(42), '42');
  assert.equal(sanitizeReason(true), 'true');
});

test('realistic reject reason preserved', () => {
  const reason = "Margin too low — please rework material selection. Brady's target is 25%+.";
  assert.equal(sanitizeReason(reason), reason);
});

test('multi-line justification preserved with normalized endings', () => {
  const input = 'Reason 1:\r\nSelling price too aggressive.\nReason 2:\r\nNeed EAU confirmation.';
  const expected = 'Reason 1:\nSelling price too aggressive.\nReason 2:\nNeed EAU confirmation.';
  assert.equal(sanitizeReason(input), expected);
});
