/**
 * Single-session takeover — integration tests (SAP-style).
 * Run: node --test server/routes/auth.singleSession.test.js
 *
 * Drives the real app: login machine A → machine B gets 409 → force takeover
 * → A is kicked (401 reason=session-revoked) → stale auto-enter → flag off.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-single-session-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = ''; // no TOTP wall — sessions auth immediately
delete process.env.OPS_SINGLE_SESSION; // default ON

const PWD = 'Secret123!pass';
const { bcryptHash } = await import('../services/authService.js');
const hash = await bcryptHash(PWD);
fs.mkdirSync(path.join(tmp, 'Library', 'Users'), { recursive: true });
// one user per scenario so sessions don't bleed across tests
const NAMES = ['alice', 'bob', 'carol', 'dave', 'erin'];
fs.writeFileSync(
  path.join(tmp, 'Library', 'Users', 'users.json'),
  JSON.stringify(
    NAMES.map((n, i) => ({ id: 200 + i, username: n, role: 'user', pwd_bcrypt: hash })),
    null,
    2
  )
);

const { default: app } = await import('../index.js');
const authSvc = await import('../services/authService.js');

let server, baseUrl;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());
test.beforeEach(() => {
  authSvc._resetRateLimit?.();
  authSvc._resetLoginLockouts?.();
});

async function login({ username, install, host, force }) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      password: PWD,
      installation_id: install,
      hostname: host,
      force: !!force,
    }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('1) first login OK; 2) second machine → 409 conflict', async () => {
  const a = await login({ username: 'alice', install: 'mac-A', host: 'Mac-A' });
  assert.equal(a.status, 200);
  assert.ok(a.body.token);

  const b = await login({ username: 'alice', install: 'win-B', host: 'PC-B' });
  assert.equal(b.status, 409);
  assert.equal(b.body.error, 'session_conflict');
  assert.equal(b.body.conflict.hostname, 'Mac-A');
  assert.ok(b.body.conflict.last_activity);
});

test('3) force takeover → 200; 4) kicked machine → 401 reason=session-revoked', async () => {
  const a = await login({ username: 'bob', install: 'mac-A', host: 'Mac-A' });
  assert.equal(a.status, 200);
  const tokenA = a.body.token;

  const conflict = await login({ username: 'bob', install: 'win-B', host: 'PC-B' });
  assert.equal(conflict.status, 409);

  const b = await login({ username: 'bob', install: 'win-B', host: 'PC-B', force: true });
  assert.equal(b.status, 200);
  assert.ok(b.body.token);

  // machine A's token now revoked → protected route returns the reason
  const kicked = await fetch(`${baseUrl}/api/license/status`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(kicked.status, 401);
  const kbody = await kicked.json().catch(() => ({}));
  assert.equal(kbody.reason, 'session-revoked');
});

test('5) same machine re-login is NOT a conflict (same installation_id)', async () => {
  const a = await login({ username: 'carol', install: 'mac-A', host: 'Mac-A' });
  assert.equal(a.status, 200);
  // same machine logs in again (e.g. second tab) → no 409
  const again = await login({ username: 'carol', install: 'mac-A', host: 'Mac-A' });
  assert.equal(again.status, 200);
});

test('6) stale session → new machine enters directly (no 409) + revokes', async () => {
  const a = await login({ username: 'dave', install: 'mac-A', host: 'Mac-A' });
  assert.equal(a.status, 200);
  // Shrink the stale window so dave's just-created session counts as idle/dead.
  process.env.OPS_SESSION_STALE_SEC = '0';
  try {
    const b = await login({ username: 'dave', install: 'win-B', host: 'PC-B' });
    assert.equal(b.status, 200, 'stale conflict should auto-enter (no 409)');
  } finally {
    delete process.env.OPS_SESSION_STALE_SEC;
  }
});

test('7) force does NOT bypass a wrong password', async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'erin', password: 'WRONG', force: true, installation_id: 'x' }),
  });
  assert.equal(res.status, 401);
  const body = await res.json().catch(() => ({}));
  assert.equal(body.error, 'Invalid credentials');
});

test('8) OPS_SINGLE_SESSION=0 → second machine coexists (no 409)', async () => {
  process.env.OPS_SINGLE_SESSION = '0';
  try {
    const a = await login({ username: 'erin', install: 'mac-A', host: 'Mac-A' });
    assert.equal(a.status, 200);
    const b = await login({ username: 'erin', install: 'win-B', host: 'PC-B' });
    assert.equal(b.status, 200, 'flag off → no conflict');
  } finally {
    delete process.env.OPS_SINGLE_SESSION;
  }
});

test('9) cancel endpoint audits + returns ok', async () => {
  const res = await fetch(`${baseUrl}/api/auth/session-conflict-cancelled`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice' }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});
