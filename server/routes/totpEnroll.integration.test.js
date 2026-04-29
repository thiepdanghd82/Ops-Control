/**
 * Regression test — atomic TOTP enrollment endpoint.
 *
 * Covers the fix for the "stuck with stale secret" footgun: the legacy
 * flow was client → POST /totp/secret (save) → POST /totp/verify (check).
 * A wrong code left the secret persisted on disk with no way to re-enroll
 * except a CLI reset. The new /totp/enroll verifies BEFORE writing, so a
 * bad code is a true no-op.
 *
 * Four tests:
 *   1. Wrong code → ok:false, nothing on disk
 *   2. Correct code → ok:true, secret persisted, session finalized
 *   3. Replay on a finalized session → 409 (already enrolled)
 *   4. Non-enrollment session (already verified) → 403 (use rotation path)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-totp-enroll-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
fs.writeFileSync(seedUsersPath, JSON.stringify([{
  id: 1, username: 'Administrator', role: 'sys',
  pwd_bcrypt: '$2b$10$dummyBcryptNeverVerified',
  lastPwdChange: new Date().toISOString(),
  permissions: { canDeleteQuote: true },
  full_name: 'Admin', english_name: 'Admin', id_no: '', email: '', phone: '',
}], null, 2));

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const { createSession, loadTotpSecrets } = await import('../services/authService.js');

let server, baseUrl;
test.before(() => new Promise((resolve) => {
  server = app.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => new Promise((resolve) => server.close(resolve)));

function genSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += alphabet[parseInt(bits.substring(i, i + 5), 2)];
  return out;
}

function currentCode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const kb = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) kb.push(parseInt(bits.substring(i, i + 8), 2));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = crypto.createHmac('sha1', Buffer.from(kb)).update(msg).digest();
  const off = h[19] & 0xf;
  return String((h.readUInt32BE(off) & 0x7fffffff) % 1000000).padStart(6, '0');
}

async function postEnroll(token, body) {
  const res = await fetch(`${baseUrl}/api/totp/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': `ops_session=${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('wrong code does NOT persist a secret (atomicity)', async () => {
  const token = createSession(1, { totpVerified: false, totpEnrollmentPending: true });
  const secret = genSecret();
  const r = await postEnroll(token, { username: 'Administrator', secret, code: '000000' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, false);
  assert.equal(Object.keys(loadTotpSecrets()).length, 0, 'disk must remain empty after bad code');
});

test('correct code persists secret and finalizes session', async () => {
  const token = createSession(1, { totpVerified: false, totpEnrollmentPending: true });
  const secret = genSecret();
  const r = await postEnroll(token, { username: 'Administrator', secret, code: currentCode(secret) });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const disk = loadTotpSecrets();
  assert.equal(disk.Administrator, secret, 'secret must be stored exactly as submitted');

  // Same session should now pass /auth/me (totp_verified flipped).
  const me = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { 'Cookie': `ops_session=${token}` },
  });
  assert.equal(me.status, 200, 'session must be fully authenticated after atomic enroll');
});

test('second enroll on an already-enrolled account → 409', async () => {
  const token = createSession(1, { totpVerified: false, totpEnrollmentPending: true });
  const secret = genSecret();
  const r = await postEnroll(token, { username: 'Administrator', secret, code: currentCode(secret) });
  assert.equal(r.status, 409, 'must refuse re-enroll via enrollment endpoint');
});

test('fully-verified session cannot use /enroll (must use rotation path)', async () => {
  const token = createSession(1, { totpVerified: true, totpEnrollmentPending: false });
  const secret = genSecret();
  const r = await postEnroll(token, { username: 'Administrator', secret, code: currentCode(secret) });
  assert.equal(r.status, 403);
});
