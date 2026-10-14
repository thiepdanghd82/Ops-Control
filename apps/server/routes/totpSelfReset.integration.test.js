/**
 * Integration test — MES-3-FIX-61: self-service 2FA reset must re-verify.
 *
 * DELETE /api/totp/secret/:username
 *   - SELF path (caller===target): now requires a valid CURRENT TOTP code OR
 *     the caller's password. Missing/wrong → 401, secret UNTOUCHED, only a
 *     TOTP_SELF_RESET_FAIL audit (no success row).
 *   - SELF with valid code / password → secret removed + TOTP_SELF_RESET audit.
 *   - Admin+ resetting ANOTHER user → unchanged (no body needed) → TOTP_SECRET_DELETED.
 *   - Non-admin resetting another → 403.
 *
 * ISOLATED DATA_DIR per Lesson 33 / prod-data-safety — writes users + totp
 * secrets; NEVER the live dir. Uses Authorization: Bearer so the double-submit
 * CSRF check is skipped (header auth is not CSRF-vulnerable).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-totp-selfreset-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const OP_PWD = 'operatorPass123!';
const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
fs.writeFileSync(
  seedUsersPath,
  JSON.stringify(
    [
      { id: 1, username: 'Administrator', role: 'sys', pwd_bcrypt: '$2b$10$x', full_name: 'Admin' },
      { id: 2, username: 'operator', role: 'user', pwd_bcrypt: '$2b$10$x', full_name: 'Operator' },
      { id: 3, username: 'boss', role: 'admin', pwd_bcrypt: '$2b$10$x', full_name: 'Boss' },
    ],
    null,
    2
  )
);

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const {
  createSession,
  loadTotpSecrets,
  saveTotpSecrets,
  bcryptHash,
  loadUsers,
  saveUsers,
  getAuditLog,
} = await import('../services/authService.js');

{
  const users = loadUsers();
  users.find((u) => u.id === 2).pwd_bcrypt = await bcryptHash(OP_PWD);
  saveUsers(users);
}

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

// Base32 secret + matching current TOTP code (mirrors totpEnroll.integration).
function genSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
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

const OP_SECRET = genSecret();
function seedOperatorSecret() {
  saveTotpSecrets({ operator: OP_SECRET });
}
function hasOperatorSecret() {
  return Object.keys(loadTotpSecrets()).some((k) => k.toLowerCase() === 'operator');
}
function auditCount(event) {
  return getAuditLog(1000).filter((r) => r.event === event).length;
}
async function del(token, username, body) {
  const res = await fetch(`${baseUrl}/api/totp/secret/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('self-reset WITHOUT code/password → 401, secret untouched, fail-audit only', async () => {
  seedOperatorSecret();
  const before = auditCount('TOTP_SELF_RESET');
  const token = createSession(2, { totpVerified: true });
  const r = await del(token, 'operator'); // no body
  assert.equal(r.status, 401);
  assert.equal(hasOperatorSecret(), true, 'secret must remain');
  assert.equal(auditCount('TOTP_SELF_RESET'), before, 'no success audit row');
  assert.ok(auditCount('TOTP_SELF_RESET_FAIL') >= 1, 'fail audit written');
});

test('self-reset WITH wrong code → 401, secret untouched', async () => {
  seedOperatorSecret();
  const token = createSession(2, { totpVerified: true });
  const r = await del(token, 'operator', { code: '000000' });
  assert.equal(r.status, 401);
  assert.equal(hasOperatorSecret(), true);
});

test('self-reset WITH valid current TOTP code → 200, secret removed + audit', async () => {
  seedOperatorSecret();
  const before = auditCount('TOTP_SELF_RESET');
  const token = createSession(2, { totpVerified: true });
  const r = await del(token, 'operator', { code: currentCode(OP_SECRET) });
  assert.equal(r.status, 200);
  assert.equal(hasOperatorSecret(), false, 'secret removed');
  assert.equal(auditCount('TOTP_SELF_RESET'), before + 1, 'success audit written');
});

test('self-reset WITH valid password → 200, secret removed', async () => {
  seedOperatorSecret();
  const token = createSession(2, { totpVerified: true });
  const r = await del(token, 'operator', { password: OP_PWD });
  assert.equal(r.status, 200);
  assert.equal(hasOperatorSecret(), false);
});

test('admin+ resets ANOTHER user → unchanged (no body needed), TOTP_SECRET_DELETED', async () => {
  seedOperatorSecret();
  const before = auditCount('TOTP_SECRET_DELETED');
  const bossToken = createSession(3, { totpVerified: true }); // role=admin
  const r = await del(bossToken, 'operator'); // no re-verify for others
  assert.equal(r.status, 200);
  assert.equal(hasOperatorSecret(), false, 'admin removed target secret');
  assert.equal(auditCount('TOTP_SECRET_DELETED'), before + 1);
});

test('non-admin resets ANOTHER user → 403', async () => {
  const token = createSession(2, { totpVerified: true }); // role=user
  const r = await del(token, 'Administrator', { password: OP_PWD });
  assert.equal(r.status, 403);
});
