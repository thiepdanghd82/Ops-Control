/**
 * Integration test — SYS-only per-user 2FA reset (Sprint S-2FA-RESET).
 *
 * POST /api/auth/users/:id/reset-2fa
 *   - SYS-only (roleLevel >= 5); step-up requires the caller's own password.
 *   - Removes the TARGET's TOTP secret, revokes their sessions, audits
 *     TOTP_RESET_BY_SYS, and leaves target.totp_required untouched.
 *   - No self-reset via this route.
 *   - Wrong/absent password → HTTP 200 { ok:false, code:'bad_password' } (NOT
 *     401 — a 401 would trip the client's global session-expired logout).
 *   - Old DELETE /totp/secret/:username now emits a TOTP_SECRET_DELETED audit.
 *
 * ISOLATED DATA_DIR per Lesson 33 / prod-data-safety — this writes users +
 * totp secrets; NEVER the live dir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-reset2fa-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const SYS_PWD = 'sysPass123!';
const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
fs.writeFileSync(
  seedUsersPath,
  JSON.stringify(
    [
      {
        id: 1,
        username: 'Administrator',
        role: 'sys',
        pwd_bcrypt: '$2b$10$placeholderReplacedInSetup',
        lastPwdChange: new Date().toISOString(),
        full_name: 'Admin',
      },
      {
        id: 2,
        username: 'operator',
        role: 'user',
        pwd_bcrypt: '$2b$10$placeholderNeverVerified',
        lastPwdChange: new Date().toISOString(),
        full_name: 'Operator',
        totp_required: true,
      },
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
  getSessionUser,
  getAuditLog,
} = await import('../services/authService.js');

// Give the SYS user a real hash so the step-up checkPassword works.
{
  const users = loadUsers();
  users.find((u) => u.id === 1).pwd_bcrypt = await bcryptHash(SYS_PWD);
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

function seedTargetSecret() {
  saveTotpSecrets({ operator: 'JBSWY3DPEHPK3PXP' });
}
function hasOperatorSecret() {
  return Object.keys(loadTotpSecrets()).some((k) => k.toLowerCase() === 'operator');
}
function auditHas(event) {
  return getAuditLog(500).some((r) => r.event === event);
}
// Use Authorization: Bearer (legacy header-auth) rather than the ops_session
// cookie so the double-submit CSRF check is skipped (header auth is not
// CSRF-vulnerable — see checkCsrf). Mirrors real non-exempt POST callers.
async function postReset(token, id, body) {
  const res = await fetch(`${baseUrl}/api/auth/users/${id}/reset-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('SYS resets another user → secret removed, audit, sessions revoked, totp_required kept', async () => {
  seedTargetSecret();
  const targetToken = createSession(2, { totpVerified: true });
  assert.ok(getSessionUser(targetToken), 'target session live before reset');
  const sysToken = createSession(1, { totpVerified: true });

  const r = await postReset(sysToken, 2, { password: SYS_PWD });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.secret_removed, true);
  assert.equal(hasOperatorSecret(), false, 'target secret entry removed');
  assert.ok(auditHas('TOTP_RESET_BY_SYS'), 'audit row written');
  assert.equal(getSessionUser(targetToken), null, 'target sessions revoked');
  assert.equal(loadUsers().find((u) => u.id === 2).totp_required, true, 'totp_required unchanged');
});

test('non-SYS caller → 403', async () => {
  seedTargetSecret();
  const userToken = createSession(2, { totpVerified: true }); // role=user
  const r = await postReset(userToken, 1, { password: 'whatever' });
  assert.equal(r.status, 403);
  assert.equal(hasOperatorSecret(), true, 'secret untouched on 403');
});

test('SYS cannot reset own 2FA via this route → 403', async () => {
  const sysToken = createSession(1, { totpVerified: true });
  const r = await postReset(sysToken, 1, { password: SYS_PWD });
  assert.equal(r.status, 403);
});

test('unknown target id → 404', async () => {
  const sysToken = createSession(1, { totpVerified: true });
  const r = await postReset(sysToken, 9999, { password: SYS_PWD });
  assert.equal(r.status, 404);
});

test('wrong password → 200 ok:false bad_password, secret untouched', async () => {
  seedTargetSecret();
  const sysToken = createSession(1, { totpVerified: true });
  const r = await postReset(sysToken, 2, { password: 'WRONG-PASSWORD' });
  assert.equal(r.status, 200, 'NOT 401 — must not trip global logout');
  assert.equal(r.body.ok, false);
  assert.equal(r.body.code, 'bad_password');
  assert.equal(hasOperatorSecret(), true, 'secret untouched on bad step-up');
});

test('absent password → same bad_password branch (secret untouched)', async () => {
  seedTargetSecret();
  const sysToken = createSession(1, { totpVerified: true });
  const r = await postReset(sysToken, 2, {});
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.code, 'bad_password');
  assert.equal(hasOperatorSecret(), true);
});

test('old DELETE /totp/secret/:username now emits an audit row', async () => {
  seedTargetSecret();
  const sysToken = createSession(1, { totpVerified: true });
  const res = await fetch(`${baseUrl}/api/totp/secret/operator`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${sysToken}` },
  });
  assert.equal(res.status, 200);
  assert.equal(hasOperatorSecret(), false, 'secret removed by DELETE');
  assert.ok(auditHas('TOTP_SECRET_DELETED'), 'DELETE now audited');
});
