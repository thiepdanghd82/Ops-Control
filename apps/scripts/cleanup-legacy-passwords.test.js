/**
 * Tests for cleanup-legacy-passwords.js. Pure logic — covers the three
 * classifications (cleaned / clean / atRisk) + safety contract (never
 * drop pwd from a row lacking pwd_bcrypt).
 *
 * Runner: node --test scripts/cleanup-legacy-passwords.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupUsers } from './cleanup-legacy-passwords.js';

test('cleanupUsers: drops pwd when bcrypt present', () => {
  const users = [{ username: 'alice', pwd: 'plain', pwd_bcrypt: '$2b$12$xxx' }];
  const { next, report } = cleanupUsers(users);
  assert.equal(next[0].pwd, undefined);
  assert.equal(next[0].pwd_bcrypt, '$2b$12$xxx');
  assert.deepEqual(report.cleaned, ['alice']);
});

test('cleanupUsers: leaves row alone when only pwd (no bcrypt) — no lockout', () => {
  const users = [{ username: 'bob', pwd: 'plain' /* no bcrypt */ }];
  const { next, report } = cleanupUsers(users);
  assert.equal(next[0].pwd, 'plain', 'pwd MUST remain — user has no other auth');
  assert.deepEqual(report.atRisk, ['bob']);
  assert.deepEqual(report.cleaned, []);
});

test('cleanupUsers: already-clean row pass-through', () => {
  const users = [{ username: 'carol', pwd_bcrypt: '$2b$12$yyy' /* no pwd */ }];
  const { next, report } = cleanupUsers(users);
  assert.equal(next[0].pwd_bcrypt, '$2b$12$yyy');
  assert.deepEqual(report.clean, ['carol']);
});

test('cleanupUsers: empty pwd string counts as no pwd', () => {
  const users = [{ username: 'dave', pwd: '', pwd_bcrypt: '$2b$12$zzz' }];
  const { next, report } = cleanupUsers(users);
  assert.deepEqual(report.clean, ['dave']);
  assert.deepEqual(report.cleaned, []);
});

test('cleanupUsers: preserves unrelated fields during cleanup', () => {
  const users = [
    {
      username: 'eve',
      pwd: 'plain',
      pwd_bcrypt: '$2b$12$h',
      role: 'admin',
      lastLogin: '2026-04-01',
      permissions: { canDeleteQuote: true },
    },
  ];
  const { next } = cleanupUsers(users);
  assert.equal(next[0].role, 'admin');
  assert.equal(next[0].lastLogin, '2026-04-01');
  assert.deepEqual(next[0].permissions, { canDeleteQuote: true });
  assert.equal(next[0].pwd, undefined);
});

test('cleanupUsers: mixed set classifies each row independently', () => {
  const users = [
    { username: 'alice', pwd: 'plain', pwd_bcrypt: '$2b$12$a' },
    { username: 'bob', pwd: 'plain' },
    { username: 'carol', pwd_bcrypt: '$2b$12$c' },
    { username: 'dave', pwd: 'plain', pwd_bcrypt: '$2b$12$d' },
  ];
  const { report } = cleanupUsers(users);
  assert.deepEqual(report.cleaned.sort(), ['alice', 'dave']);
  assert.deepEqual(report.atRisk, ['bob']);
  assert.deepEqual(report.clean, ['carol']);
});

test('cleanupUsers: non-array input returned unchanged', () => {
  const { next, report } = cleanupUsers(null);
  assert.equal(next, null);
  assert.equal(report.cleaned.length, 0);
});

test('cleanupUsers: malformed rows (non-object) pass through', () => {
  const users = [null, 'string', 42, { username: 'eve', pwd: 'x', pwd_bcrypt: 'y' }];
  const { next, report } = cleanupUsers(users);
  assert.equal(next[0], null);
  assert.equal(next[1], 'string');
  assert.equal(next[2], 42);
  assert.equal(next[3].pwd, undefined);
  assert.deepEqual(report.cleaned, ['eve']);
});
