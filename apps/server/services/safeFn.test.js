/**
 * Tests for `safeFn` — the one-line sanitizer every user-supplied
 * filename passes through before `path.join(...)` in download/delete/
 * backup routes.
 *
 * Coverage:
 *   - character-class whitelist (only `\w \s \- \.`)
 *   - length cap (200 chars)
 *   - dot-only rejection (defense against `path.join(root, '..')` escape)
 *   - idempotence
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-safefn-'));
process.env.DATA_DIR = tmp;
process.env.NODE_ENV = 'test';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const { init, safeFn } = await import('./authService.js');
init(tmp);

test('safeFn replaces slashes / backslashes with underscore', () => {
  assert.equal(safeFn('a/b'), 'a_b');
  assert.equal(safeFn('a\\b'), 'a_b');
  assert.equal(safeFn('..\\..\\etc\\passwd'), '.._.._etc_passwd');
});

test('safeFn caps at 200 chars', () => {
  const long = 'x'.repeat(500);
  assert.equal(safeFn(long).length, 200);
});

test('safeFn keeps underscores, dashes, dots, word chars', () => {
  assert.equal(safeFn('quote_2026-04-22.json'), 'quote_2026-04-22.json');
});

test('safeFn rejects dot-only names (path-traversal defense)', () => {
  // Bare `..` resolves outside the jail via path.join — unacceptable
  // even though the surrounding code only reads directories (EISDIR).
  // Return a placeholder so callers still produce a valid path that
  // points INSIDE their intended dir.
  assert.equal(safeFn('..'), '_');
  assert.equal(safeFn('.'), '_');
  assert.equal(safeFn('...'), '_');
  assert.equal(safeFn('....'), '_');
});

test('safeFn rejects empty / whitespace-only / null', () => {
  assert.equal(safeFn(''), '_');
  assert.equal(safeFn('   '), '_');
  assert.equal(safeFn(null), '_');
  assert.equal(safeFn(undefined), '_');
});

test('safeFn composed with path.join stays inside intended root', () => {
  const root = '/app/data';
  for (const bad of ['..', '.', '...', '/etc', '../etc/passwd', '..\\..\\etc']) {
    const resolved = path.resolve(path.join(root, safeFn(bad)));
    // Escape means the resolved absolute path is shorter than root or
    // isn't a descendant of it. A FILE literally named `.._etc_passwd`
    // inside root is fine — that's still inside the jail.
    assert.ok(
      resolved === root || resolved.startsWith(root + path.sep),
      `safeFn(${JSON.stringify(bad)}) → ${resolved} escaped root ${root}`
    );
  }
});

test('safeFn idempotence — passing the cleaned form yields the same output', () => {
  const names = ['quote.json', 'a_b-c.d', 'name with spaces.txt'];
  for (const n of names) assert.equal(safeFn(safeFn(n)), safeFn(n));
});
