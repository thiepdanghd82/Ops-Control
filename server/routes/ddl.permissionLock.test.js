/**
 * DDL permission + audit + anti-clobber (_rev) — integration tests.
 * Run: node --test server/routes/ddl.permissionLock.test.js
 *
 * Covers: non-admin DDL save → 403; admin save → 200 + ddl_rev + DDL_SAVE audit
 * with diff; stale _rev → 409; correct _rev → 200.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-ddl-perm-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';

const PWD = 'Secret123!pass';
const { bcryptHash, getAuditLog } = await import('../services/authService.js');
const hash = await bcryptHash(PWD);
fs.mkdirSync(path.join(tmp, 'Library', 'Users'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'Library', 'Users', 'users.json'),
  JSON.stringify([
    { id: 1, username: 'boss', role: 'admin', pwd_bcrypt: hash },
    { id: 2, username: 'eng', role: 'cost', pwd_bcrypt: hash },
  ])
);
// seed an initial DDL so there's an old state to diff against
fs.mkdirSync(path.join(tmp, 'Library', 'DDL'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'Library', 'DDL', 'ddl_sites.json'),
  JSON.stringify({ VN: { trade_mode: ['DOM'], die_cut: ['RDC350-12'] } })
);

const { default: app } = await import('../index.js');

let server, base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server && server.close());

async function login(username) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PWD, installation_id: 'web' }),
  });
  const b = await r.json();
  return { token: b.token, csrf: b.csrf_token };
}
async function saveAll(sess, body) {
  const r = await fetch(`${base}/api/save-all`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${sess.token}`,
      'X-CSRF-Token': sess.csrf,
      Cookie: `ops_csrf=${sess.csrf}`,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function loadDdl(sess) {
  const r = await fetch(`${base}/api/shared/ddl`, {
    headers: { Authorization: `Bearer ${sess.token}` },
  });
  return r.json();
}

test('non-admin (cost) DDL save → 403', async () => {
  const eng = await login('eng');
  const r = await saveAll(eng, { ddlSitesDB: { VN: { trade_mode: ['DOM', 'EXP'] } } });
  assert.equal(r.status, 403);
  assert.match(r.body.msg || '', /admin/i);
});

test('admin DDL save → 200 + ddl_rev + DDL_SAVE audit with diff', async () => {
  const boss = await login('boss');
  const load = await loadDdl(boss);
  assert.ok(load._rev, '_rev present on load');
  const next = { VN: { trade_mode: ['DOM', 'EXP'], die_cut: ['RDC350-12'] } };
  const r = await saveAll(boss, { ddlSitesDB: next, _ddlRev: load._rev });
  assert.equal(r.status, 200);
  assert.ok(r.body.ddl_rev, 'response carries new ddl_rev');
  assert.notEqual(r.body.ddl_rev, load._rev, 'rev changed after edit');
  // audit
  const rows = getAuditLog(50, {}).filter((x) => x.event === 'DDL_SAVE');
  assert.ok(rows.length >= 1, 'DDL_SAVE emitted');
  const detail = JSON.parse(rows[rows.length - 1].detail);
  assert.deepEqual(detail.sites_changed, ['VN']);
  assert.ok(detail.sections_changed.VN.includes('trade_mode'), 'trade_mode flagged changed');
});

test('admin DDL save with STALE _rev → 409', async () => {
  const boss = await login('boss');
  const r = await saveAll(boss, {
    ddlSitesDB: { VN: { trade_mode: ['X'] } },
    _ddlRev: 'staleffffffffffff',
  });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'ddl_conflict');
  assert.ok(r.body.current_rev, 'server returns current_rev for the client');
});

test('admin DDL save with CURRENT _rev → 200 (reload then save works)', async () => {
  const boss = await login('boss');
  const load = await loadDdl(boss);
  const r = await saveAll(boss, {
    ddlSitesDB: { VN: { trade_mode: ['DOM', 'EXP', 'TRANSIT'] } },
    _ddlRev: load._rev,
  });
  assert.equal(r.status, 200);
});
