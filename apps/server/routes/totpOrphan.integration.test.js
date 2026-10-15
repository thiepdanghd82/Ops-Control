/**
 * TOTP seeds go with their account (2026-10-15).
 *
 * DELETE /api/auth/users/:id removed the user but left the TOTP seed, so
 * the boot probe counted it as an enrolled user and the seed waited for
 * anyone re-creating the username. The delete now removes the seed, and
 * the boot probe names leftover seeds instead of counting them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-totp-orphan-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const usersDir = path.join(tmp, 'Library', 'Users');
fs.mkdirSync(usersDir, { recursive: true });
fs.writeFileSync(
  path.join(usersDir, 'users.json'),
  JSON.stringify([
    { id: 1, username: 'Administrator', role: 'sys', pwd_bcrypt: 'x', permissions: {} },
    { id: 2, username: 'Leaver', role: 'user', pwd_bcrypt: 'x', permissions: {} },
  ])
);

// Seed the store before the server boots so its probe sees a leftover.
const auth = await import('../services/authService.js');
auth.init(tmp);
const B32 = (c) => c.repeat(32);
auth.saveTotpSecrets({ Administrator: B32('A'), leaver: B32('B'), oldtimer: B32('C') });

const warned = [];
const origWarn = console.warn;
console.warn = (...a) => warned.push(a.join(' '));
const { default: app } = await import('../index.js');
console.warn = origWarn;
const { initSchema } = await import('../db/init.js');
initSchema();

let server, baseUrl;
test.before(
  () =>
    new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    })
);
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('the boot probe names a seed with no account', () => {
  assert.ok(
    warned.some((w) => w.includes('TOTP seed(s) with no account') && w.includes('oldtimer')),
    `boot warnings were: ${warned.join(' | ')}`
  );
  assert.deepEqual(auth.findOrphanTotpUsernames(auth.loadTotpSecrets()), ['oldtimer']);
});

test("deleting a user removes that user's seed and nothing else", async () => {
  const sys = auth.createSession(1, { totpVerified: true });
  const res = await fetch(`${baseUrl}/api/auth/users/2`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${sys}` },
  });
  assert.equal(res.status, 200);
  const left = auth.loadTotpSecrets();
  assert.equal(left.leaver, undefined, 'case-insensitive match on the deleted username');
  assert.equal(left.Administrator, B32('A'));
  assert.equal(left.oldtimer, B32('C'), 'an older orphan is left to the maintenance script');
});
