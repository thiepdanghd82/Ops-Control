/**
 * Integration — System Control global sidebar visibility (Sprint S-SYSCTRL).
 *
 *   GET  /api/system/sidebar-visibility  — any authenticated user
 *   PUT  /api/system/sidebar-visibility  — SYS only (403 otherwise), validates
 *        ids against the toggleable catalog, persists, audits.
 *   GET  /api/runtime-config             — includes `sidebar`, tolerates a
 *        missing file (→ nothing hidden).
 *
 * ISOLATED DATA_DIR per CLAUDE.md Lesson 33 / prod-data-safety — NEVER the live
 * dir. Bearer auth so the double-submit CSRF check is skipped (header auth is
 * not CSRF-vulnerable).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-sidebar-vis-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
fs.writeFileSync(
  seedUsersPath,
  JSON.stringify(
    [
      { id: 1, username: 'Administrator', role: 'sys', pwd_bcrypt: '$2b$10$x', full_name: 'Admin' },
      { id: 2, username: 'operator', role: 'user', pwd_bcrypt: '$2b$10$x', full_name: 'Operator' },
    ],
    null,
    2
  )
);

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const { createSession, getAuditLog } = await import('../services/authService.js');
const { readSidebarVisibility } = await import('../services/sidebarVisibility.js');

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

const sysToken = () => createSession(1, { totpVerified: true });
const opToken = () => createSession(2, { totpVerified: true });

async function put(token, body) {
  const res = await fetch(`${baseUrl}/api/system/sidebar-visibility`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function get(token) {
  const res = await fetch(`${baseUrl}/api/system/sidebar-visibility`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const auditCount = (event) => getAuditLog(1000).filter((r) => r.event === event).length;

test('runtime-config includes `sidebar` and tolerates a missing file', async () => {
  const res = await fetch(`${baseUrl}/api/runtime-config`);
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.ok(j.sidebar, 'sidebar present');
  assert.deepEqual(
    j.sidebar,
    { hiddenTabs: [], hiddenSections: [] },
    'nothing hidden before any PUT'
  );
});

test('PUT as non-sys → 403, nothing persisted', async () => {
  const r = await put(opToken(), { hiddenTabs: ['rfq-tracking'], hiddenSections: [] });
  assert.equal(r.status, 403);
  assert.deepEqual(readSidebarVisibility(), { hiddenTabs: [], hiddenSections: [] });
});

test('PUT as sys with valid ids → 200, persists + audit row', async () => {
  const before = auditCount('SIDEBAR_VISIBILITY_UPDATE');
  const r = await put(sysToken(), {
    hiddenTabs: ['rfq-tracking', 'quote-analysis'],
    hiddenSections: ['tracking'],
  });
  assert.equal(r.status, 200);
  const stored = readSidebarVisibility();
  assert.deepEqual(sortMap(stored), {
    hiddenTabs: ['quote-analysis', 'rfq-tracking'],
    hiddenSections: ['tracking'],
  });
  assert.equal(auditCount('SIDEBAR_VISIBILITY_UPDATE'), before + 1, 'audit written');
});

test('PUT with an unknown tab id → 400, prior state untouched', async () => {
  const r = await put(sysToken(), { hiddenTabs: ['not-a-real-tab'], hiddenSections: [] });
  assert.equal(r.status, 400);
  // The valid PUT above must still be the persisted state.
  assert.deepEqual(readSidebarVisibility().hiddenSections, ['tracking']);
});

test('PUT rejects an always-on id (settings / system)', async () => {
  assert.equal(
    (await put(sysToken(), { hiddenTabs: ['settings'], hiddenSections: [] })).status,
    400
  );
  assert.equal((await put(sysToken(), { hiddenTabs: [], hiddenSections: ['system'] })).status, 400);
});

test('GET returns the persisted map for any authenticated user', async () => {
  const r = await get(opToken());
  assert.equal(r.status, 200);
  assert.deepEqual(sortMap(r.body), {
    hiddenTabs: ['quote-analysis', 'rfq-tracking'],
    hiddenSections: ['tracking'],
  });
  // Unauthenticated → 401.
  const anon = await fetch(`${baseUrl}/api/system/sidebar-visibility`);
  assert.equal(anon.status, 401);
});

test('runtime-config now reflects the persisted hidden map', async () => {
  const j = await (await fetch(`${baseUrl}/api/runtime-config`)).json();
  assert.deepEqual(sortMap(j.sidebar), {
    hiddenTabs: ['quote-analysis', 'rfq-tracking'],
    hiddenSections: ['tracking'],
  });
});

test('PUT empty arrays → clears (Show all / Reset)', async () => {
  const r = await put(sysToken(), { hiddenTabs: [], hiddenSections: [] });
  assert.equal(r.status, 200);
  assert.deepEqual(readSidebarVisibility(), { hiddenTabs: [], hiddenSections: [] });
});

function sortMap(m) {
  return {
    hiddenTabs: [...(m.hiddenTabs || [])].sort(),
    hiddenSections: [...(m.hiddenSections || [])].sort(),
  };
}
