/**
 * Integration test — the off-site mirror routes (Settings → Backup).
 *
 *   GET  /api/admin/backup-mirror      config + health + mounted targets
 *   PUT  /api/admin/backup-mirror      { dest, auto } — destination validated
 *   POST /api/admin/backup-mirror/run  starts a run in the background
 *
 * Admin+ only, like the backup schedule. ISOLATED DATA_DIR per Lesson 33.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mirror-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const usersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(usersPath), { recursive: true });
fs.writeFileSync(
  usersPath,
  JSON.stringify([
    { id: 1, username: 'Administrator', role: 'sys', pwd_bcrypt: 'x', full_name: 'Admin' },
    { id: 2, username: 'operator', role: 'user', pwd_bcrypt: 'x', full_name: 'Op' },
  ])
);

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const { createSession, getAuditLog } = await import('../services/authService.js');

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

// Bearer auth skips the double-submit CSRF check (see reset2fa test).
async function call(method, route, token, body) {
  const res = await fetch(`${baseUrl}/api${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const sys = () => createSession(1, { totpVerified: true });
const op = () => createSession(2, { totpVerified: true });
const audited = (event) => getAuditLog(500).some((r) => r.event === event);

test('a non-admin is refused on all three routes', async () => {
  assert.equal((await call('GET', '/admin/backup-mirror', op())).status, 403);
  assert.equal((await call('PUT', '/admin/backup-mirror', op(), { dest: tmp })).status, 403);
  assert.equal((await call('POST', '/admin/backup-mirror/run', op())).status, 403);
});

test('before a destination is set: GET reports none, run is refused', async () => {
  const g = await call('GET', '/admin/backup-mirror', sys());
  assert.equal(g.status, 200);
  assert.equal(g.body.config.dest, null);
  assert.ok(Array.isArray(g.body.targets));
  const r = await call('POST', '/admin/backup-mirror/run', sys());
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'not_configured');
});

test('a destination inside the data folder is refused', async () => {
  const r = await call('PUT', '/admin/backup-mirror', sys(), {
    dest: path.join(tmp, 'Library'),
    auto: true,
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'inside_data');
});

test('set a destination, run, and the card reads a fresh success', async () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mirror-dest-'));
  const put = await call('PUT', '/admin/backup-mirror', sys(), { dest, auto: true });
  assert.equal(put.status, 200);
  assert.equal(put.body.config.dest, dest);
  assert.ok(audited('BACKUP_MIRROR_CONFIG'));

  const run = await call('POST', '/admin/backup-mirror/run', sys());
  assert.equal(run.status, 200);
  assert.equal(run.body.started, true);

  let g;
  for (let i = 0; i < 100; i++) {
    g = await call('GET', '/admin/backup-mirror', sys());
    if (!g.body.running) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(g.body.running, false);
  assert.equal(g.body.health.tone, 'ok', JSON.stringify(g.body.health));
  assert.ok(fs.existsSync(path.join(dest, 'ops-control-mirror', 'data', 'ops.db')));
  assert.ok(
    !fs.existsSync(path.join(dest, 'ops-control-mirror', 'data', 'Library', 'Users', 'users.json')),
    'credentials stay home'
  );
  assert.ok(audited('BACKUP_MIRROR_RUN'));
});
