/**
 * Sprint S-P0-FIX-7 — describeEnvSources() unit tests.
 *
 * Pure function, easy assertions. 6 cases covering:
 *   1. var present in OS env before dotenv → labeled "os env"
 *   2. var added by dotenv (not in OS env before) → labeled ".env file"
 *   3. var unset → labeled "<unset>"
 *   4. var empty string → labeled "<empty> (likely misconfig)"
 *   5. secret-named var → value masked to "<N chars>"
 *   6. expanded mask covers PWD / AUTH / HASH / PRIVATE
 *
 *   node --test server/utils/envSources.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEnvSources, SENSITIVE_PATTERN } from './envSources.js';

const TEST_VAR = 'OPS_FIX7_TEST_VAR';

test.afterEach(() => {
  // Tests touch process.env; clean up after each.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('OPS_FIX7_')) delete process.env[k];
  }
});

test('describeEnvSources: var present in OS env before dotenv → labeled "os env"', () => {
  process.env[TEST_VAR] = 'os-value';
  const before = new Set(Object.keys(process.env));
  // dotenv has nothing to do — value already there
  const lines = describeEnvSources(before, [TEST_VAR]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /OPS_FIX7_TEST_VAR: os-value \(from os env\)/);
});

test('describeEnvSources: var added by dotenv (not in OS env before) → labeled ".env file"', () => {
  const before = new Set(Object.keys(process.env)); // snapshot BEFORE
  process.env[TEST_VAR] = 'dotenv-value'; // simulate dotenv injecting it
  const lines = describeEnvSources(before, [TEST_VAR]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /OPS_FIX7_TEST_VAR: dotenv-value \(from \.env file\)/);
});

test('describeEnvSources: var unset → "<unset>"', () => {
  const before = new Set(Object.keys(process.env));
  const lines = describeEnvSources(before, [TEST_VAR]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /OPS_FIX7_TEST_VAR: <unset>/);
});

test('describeEnvSources: empty-string var → "<empty> (likely misconfig)"', () => {
  process.env[TEST_VAR] = ''; // operator typed `OPS_FIX7_TEST_VAR=` in .env
  const before = new Set(Object.keys(process.env));
  const lines = describeEnvSources(before, [TEST_VAR]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /OPS_FIX7_TEST_VAR: <empty> \(likely misconfig\)/);
});

test('describeEnvSources: secret-named var → masked as "<N chars>"', () => {
  const SECRET_VAR = 'OPS_FIX7_SECRET_KEY';
  process.env[SECRET_VAR] = 'super-secret-64-char-thing-that-must-not-leak-to-the-startup-log';
  const before = new Set(Object.keys(process.env));
  const lines = describeEnvSources(before, [SECRET_VAR]);
  assert.equal(lines.length, 1);
  // Must NOT contain the actual secret value
  assert.doesNotMatch(lines[0], /super-secret/);
  // Must contain the length hint
  assert.match(lines[0], /OPS_FIX7_SECRET_KEY: <\d+ chars> \(from os env\)/);
});

test('describeEnvSources: expanded mask covers PWD / AUTH / HASH / PRIVATE', () => {
  // Each variant must trigger the mask path
  const cases = [
    'OPS_FIX7_ADMIN_PWD',
    'OPS_FIX7_BASIC_AUTH',
    'OPS_FIX7_PWD_HASH',
    'OPS_FIX7_PRIVATE_KEY_PEM',
  ];
  for (const name of cases) {
    process.env[name] = 'sensitive-' + name;
  }
  const before = new Set(Object.keys(process.env));
  const lines = describeEnvSources(before, cases);
  for (let i = 0; i < cases.length; i++) {
    assert.doesNotMatch(lines[i], /sensitive-/, `${cases[i]} value leaked`);
    assert.match(lines[i], /<\d+ chars>/, `${cases[i]} should show length hint`);
  }

  // Negative control: a non-sensitive name passes through unmasked
  process.env.OPS_FIX7_PUBLIC_URL = 'https://ops.example.com';
  const lines2 = describeEnvSources(before, ['OPS_FIX7_PUBLIC_URL']);
  assert.match(lines2[0], /https:\/\/ops\.example\.com/, 'public values must NOT be masked');

  // Sanity check the exported pattern itself
  assert.ok(SENSITIVE_PATTERN.test('FOO_KEY'));
  assert.ok(SENSITIVE_PATTERN.test('FOO_PWD'));
  assert.ok(SENSITIVE_PATTERN.test('FOO_AUTH'));
  assert.ok(SENSITIVE_PATTERN.test('FOO_HASH'));
  assert.ok(SENSITIVE_PATTERN.test('FOO_PRIVATE'));
  assert.ok(!SENSITIVE_PATTERN.test('CORS_ORIGINS'));
  assert.ok(!SENSITIVE_PATTERN.test('PUBLIC_URL'));
});
