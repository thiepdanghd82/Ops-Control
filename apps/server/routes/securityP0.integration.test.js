/**
 * Regression tests for the 2026-10-15 security fixes (audit run-1, P0 items 1-3).
 *
 *  1. GET /data/* serves only the Products layout tree; GET /api/lib/* is
 *     sys-only and never serves Library/Users.
 *  2. A password-only (preauth) session cannot read a TOTP seed, and cannot
 *     complete its own 2FA by verifying another user's code.
 *  3. POST /api/auth/verify-pwd needs a session, checks only the caller's own
 *     password, and shares login's per-username lockout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-security-p0-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const usersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(usersPath), { recursive: true });
const seedUser = (id, username, role) => ({
  id,
  username,
  role,
  pwd_bcrypt: '$2b$10$dummyBcryptNeverVerified',
  lastPwdChange: new Date().toISOString(),
  permissions: {},
  full_name: username,
  english_name: username,
  id_no: '',
  email: '',
  phone: '',
});
fs.writeFileSync(
  usersPath,
  JSON.stringify(
    [
      seedUser(1, 'Administrator', 'sys'),
      seedUser(2, 'boss', 'admin'),
      seedUser(3, 'viewer', 'viewonly'),
    ],
    null,
    2
  )
);
fs.mkdirSync(path.join(tmp, 'Library', 'Rate'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'Library', 'Rate', 'rate.json'), JSON.stringify({ ok: 1 }));
fs.mkdirSync(path.join(tmp, 'Products layout'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'Products layout', 'logo.png'),
  Buffer.from([0x89, 0x50, 0x4e, 0x47])
);

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const { createSession, bcryptHash, updateUsers, saveTotpSecrets, checkLoginLockout } =
  await import('../services/authService.js');

const PASSWORDS = {
  Administrator: 'Sys-Pass-2026!',
  boss: 'Boss-Pass-2026!',
  viewer: 'View-Pass-2026!',
};
const hashes = {};
for (const [name, pw] of Object.entries(PASSWORDS)) hashes[name] = await bcryptHash(pw);
await updateUsers(async (users) => {
  for (const u of users) u.pwd_bcrypt = hashes[u.username];
});

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
test.after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, urlPath, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* binary body */
  }
  return { status: res.status, body: json };
}

function genSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const b of crypto.randomBytes(20)) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5)
    out += alphabet[parseInt(bits.substring(i, i + 5), 2)];
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

// ── 1. /data/* and /api/lib/* ──────────────────────────────────────────

test('/data/* refuses credential, database and other non-layout files', async () => {
  const viewer = createSession(3, { totpVerified: true });
  for (const p of [
    '/data/Library/Users/users.json',
    '/data/Library/Users/sessions.json',
    '/data/ops.db',
    '/data/Library/Rate/rate.json',
  ]) {
    const r = await call('GET', p, viewer);
    assert.equal(r.status, 403, `${p} must be forbidden`);
  }
});

test('/data/* still serves the Products layout tree', async () => {
  const viewer = createSession(3, { totpVerified: true });
  const r = await call('GET', '/data/Products%20layout/logo.png', viewer);
  assert.equal(r.status, 200);
});

test('/api/lib/* is sys-only and never serves Library/Users', async () => {
  const viewer = createSession(3, { totpVerified: true });
  const sys = createSession(1, { totpVerified: true });
  assert.equal((await call('GET', '/api/lib/Rate/rate.json', viewer)).status, 403);
  assert.equal((await call('GET', '/api/lib/Users/users.json', sys)).status, 403);
  assert.equal((await call('GET', '/api/lib/users/users.json', sys)).status, 403);
  const ok = await call('GET', '/api/lib/Rate/rate.json', sys);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { ok: 1 });
});

// ── 2. TOTP seed and verify binding ────────────────────────────────────

test('a password-only session cannot read any TOTP seed', async () => {
  const secret = genSecret();
  saveTotpSecrets({ boss: secret, viewer: genSecret() });
  const preauth = createSession(2, { totpVerified: false });
  assert.equal((await call('GET', '/api/totp/secret/boss', preauth)).status, 401);
  assert.equal((await call('GET', '/api/totp/secret/viewer', preauth)).status, 401);
  const full = createSession(2, { totpVerified: true });
  const r = await call('GET', '/api/totp/secret/boss', full);
  assert.equal(r.status, 200);
  assert.equal(r.body.secret, secret);
});

test("verifying another user's code never completes the caller's own 2FA", async () => {
  const viewerSecret = genSecret();
  saveTotpSecrets({ boss: genSecret(), viewer: viewerSecret });
  const preauth = createSession(2, { totpVerified: false });
  const r = await call('POST', '/api/totp/verify', preauth, {
    username: 'viewer',
    code: currentCode(viewerSecret),
  });
  assert.equal(r.status, 403);
  assert.notEqual(
    (await call('GET', '/api/auth/users', preauth)).status,
    200,
    'session must stay preauth'
  );
});

test('verifying your own code still completes 2FA', async () => {
  const bossSecret = genSecret();
  saveTotpSecrets({ boss: bossSecret });
  const preauth = createSession(2, { totpVerified: false });
  const r = await call('POST', '/api/totp/verify', preauth, {
    username: 'boss',
    code: currentCode(bossSecret),
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal((await call('GET', '/api/auth/me', preauth)).status, 200);
});

// ── 3. verify-pwd ──────────────────────────────────────────────────────

test('verify-pwd requires a session', async () => {
  const r = await call('POST', '/api/auth/verify-pwd', null, {
    role: 'sys',
    password: PASSWORDS.Administrator,
  });
  assert.equal(r.status, 401);
});

test("verify-pwd checks only the caller's own password", async () => {
  const viewer = createSession(3, { totpVerified: true });
  const other = await call('POST', '/api/auth/verify-pwd', viewer, {
    role: 'sys',
    password: PASSWORDS.Administrator,
  });
  assert.equal(other.body.ok, false, "another account's password must not verify");
  const own = await call('POST', '/api/auth/verify-pwd', viewer, { password: PASSWORDS.viewer });
  assert.equal(own.body.ok, true);
});

test('verify-pwd failures count toward the login lockout', async () => {
  const viewer = createSession(3, { totpVerified: true });
  for (let i = 0; i < 5; i++) {
    await call('POST', '/api/auth/verify-pwd', viewer, { password: `wrong-${i}` });
  }
  assert.equal(checkLoginLockout('viewer').allowed, false);
  const r = await call('POST', '/api/auth/verify-pwd', viewer, { password: PASSWORDS.viewer });
  assert.equal(r.body.ok, false, 'a locked account must not verify even with the right password');
});
