/**
 * Integration test — Clear Data password step-up (POST /api/import/:slug/clear).
 *
 * Every bulk-wipe requires the caller's ACCOUNT PASSWORD, enforced server-side
 * so a curl user can't bypass the client modal. Missing/wrong password →
 * HTTP 200 { ok:false, code:'bad_password' } (NOT 401 — a 401 trips the
 * client's global session-expired logout), dataset UNCHANGED, DATASET_CLEAR_DENIED
 * audit. Correct password → wiped + DATASET_CLEAR audit. requireRole(4) still
 * gates first (non-admin → 403 before the password check).
 *
 * ISOLATED DATA_DIR (Lesson 33): writes users + Library files; NEVER the live dir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-import-clear-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const ADMIN_PWD = 'adminPass123!';
const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
fs.writeFileSync(
  seedUsersPath,
  JSON.stringify(
    [
      { id: 1, username: 'Administrator', role: 'admin', pwd_bcrypt: 'x', full_name: 'Admin' },
      { id: 2, username: 'operator', role: 'user', pwd_bcrypt: 'y', full_name: 'Operator' },
    ],
    null,
    2
  )
);

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const { createSession, bcryptHash, loadUsers, saveUsers, getAuditLog } =
  await import('../services/authService.js');

{
  const users = loadUsers();
  users.find((u) => u.id === 1).pwd_bcrypt = await bcryptHash(ADMIN_PWD);
  saveUsers(users);
}

const LIB = path.join(tmp, 'Library');
const DATASETS = [
  {
    slug: 'bom',
    file: ['Manufacturing_Structures', 'mfg_structures_data.js'],
    varName: 'window._CCL_MFG_DATA',
  },
  {
    slug: 'routing',
    file: ['Routing_Operations', 'routing_ops_data.js'],
    varName: 'window._CCL_ROP_DATA',
  },
  {
    slug: 'inventory',
    file: ['IFS_Inventory', 'inventory_data.js'],
    varName: 'window._CCL_INV_DATA',
  },
  {
    slug: 'npi-parts',
    file: ['NpiParts', 'npi_parts_data.js'],
    varName: 'window._CCL_NPIPARTS_DATA',
  },
];

function dsPath(ds) {
  return path.join(LIB, ...ds.file);
}
function seed(ds) {
  const p = dsPath(ds);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${ds.varName}={"headers":["h"],"rows":[["a"],["b"]]};`);
}
function rowCount(ds) {
  try {
    const c = fs.readFileSync(dsPath(ds), 'utf-8');
    const m = c.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
    return m ? JSON.parse(m[1]).rows.length : -1;
  } catch {
    return -1;
  }
}
function auditHasFor(event, slug) {
  return getAuditLog(1000).some((r) => r.event === event && String(r.detail || '').includes(slug));
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

// Bearer auth (skips the double-submit CSRF check — header auth isn't
// CSRF-vulnerable), same as the reset-2fa integration test.
async function postClear(token, slug, body) {
  const res = await fetch(`${baseUrl}/api/import/${slug}/clear`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

for (const ds of DATASETS) {
  test(`[${ds.slug}] MISSING password → ok:false bad_password, data intact, DENIED audit`, async () => {
    seed(ds);
    const token = createSession(1, { totpVerified: true });
    const r = await postClear(token, ds.slug, {});
    assert.equal(r.status, 200, 'NOT 401 — must not trip global logout');
    assert.equal(r.body.ok, false);
    assert.equal(r.body.code, 'bad_password');
    assert.equal(rowCount(ds), 2, 'dataset untouched');
    assert.ok(auditHasFor('DATASET_CLEAR_DENIED', ds.slug), 'DATASET_CLEAR_DENIED audited');
  });

  test(`[${ds.slug}] WRONG password → ok:false bad_password, data intact`, async () => {
    seed(ds);
    const token = createSession(1, { totpVerified: true });
    const r = await postClear(token, ds.slug, { password: 'not-the-password' });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.code, 'bad_password');
    assert.equal(rowCount(ds), 2, 'dataset untouched on wrong password');
  });

  test(`[${ds.slug}] CORRECT password → wiped + DATASET_CLEAR audit`, async () => {
    seed(ds);
    assert.equal(rowCount(ds), 2, 'precondition: 2 rows');
    const token = createSession(1, { totpVerified: true });
    const r = await postClear(token, ds.slug, { password: ADMIN_PWD });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true, 'cleared');
    assert.equal(rowCount(ds), 0, 'dataset wiped to 0 rows');
    assert.ok(auditHasFor('DATASET_CLEAR', ds.slug), 'DATASET_CLEAR audited');
  });
}

test('role gate: a non-admin (role=user) is rejected BEFORE the password check (403), data intact', async () => {
  const ds = DATASETS[0];
  seed(ds);
  const userToken = createSession(2, { totpVerified: true }); // role=user
  // Even with the CORRECT admin password in the body, the role gate rejects first.
  const r = await postClear(userToken, ds.slug, { password: ADMIN_PWD });
  assert.equal(r.status, 403, 'requireRole(4) rejects non-admin');
  assert.equal(rowCount(ds), 2, 'dataset untouched by a non-admin attempt');
});
