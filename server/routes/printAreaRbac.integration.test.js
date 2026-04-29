/**
 * Runtime test — print-area routes enforce the view-only block.
 *
 * Context: /api/shared/print-area{,/upload,/:sku} handlers previously
 * gated only on authMiddleware (any authenticated user), which meant a
 * view-only account could create, overwrite, delete, and upload
 * artwork files. Sprint 3 added `requireWriter` to each mutating path.
 * This test locks that down against regressions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-pa-rbac-it-'));
process.env.DATA_DIR = tmp;
process.env.OPS_DB_PATH = path.join(tmp, 'ops.db');
process.env.NODE_ENV = 'test';
process.env.OPS_REQUIRE_2FA_ROLES = '';
process.env.OPS_TOTP_KEY = crypto.randomBytes(32).toString('hex');

// Seed two users: one writer (role=cost) and one view-only.
const seedUsersPath = path.join(tmp, 'Library', 'Users', 'users.json');
fs.mkdirSync(path.dirname(seedUsersPath), { recursive: true });
fs.writeFileSync(seedUsersPath, JSON.stringify([
  { id: 1, username: 'writer', role: 'cost',
    pwd_bcrypt: '$2b$10$dummy', lastPwdChange: new Date().toISOString(),
    permissions: {}, full_name: 'W', english_name: 'W', id_no: '', email: '', phone: '' },
  { id: 2, username: 'viewer', role: 'viewonly',
    pwd_bcrypt: '$2b$10$dummy', lastPwdChange: new Date().toISOString(),
    permissions: {}, full_name: 'V', english_name: 'V', id_no: '', email: '', phone: '' },
], null, 2));

const { default: app } = await import('../index.js');
const { initSchema } = await import('../db/init.js');
initSchema();
const { createSession } = await import('../services/authService.js');

let server, baseUrl;
test.before(() => new Promise((resolve) => {
  server = app.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));
test.after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, pathStr, token, body) {
  const res = await fetch(`${baseUrl}${pathStr}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const validJob = { sku: 'RBAC-TEST-001', width_mm: 50, height_mm: 30 };

test('writer role CAN create a print-area job', async () => {
  const t = createSession(1); // writer
  const r = await call('POST', '/api/shared/print-area', t, validJob);
  assert.equal(r.status, 200, `body: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.job?.sku, validJob.sku);
});

test('viewonly role is REJECTED on POST /print-area', async () => {
  const t = createSession(2); // viewer
  const r = await call('POST', '/api/shared/print-area', t, { ...validJob, sku: 'RBAC-TEST-002' });
  assert.equal(r.status, 403);
  assert.match(JSON.stringify(r.body).toLowerCase(), /view\s*only/);
});

test('viewonly role is REJECTED on DELETE /print-area/:sku', async () => {
  const t = createSession(2);
  const r = await call('DELETE', `/api/shared/print-area/${validJob.sku}`, t);
  assert.equal(r.status, 403);
});

test('unauthenticated caller gets 401 on mutating print-area endpoints', async () => {
  // Hit POST without Authorization header at all.
  const res = await fetch(`${baseUrl}/api/shared/print-area`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validJob),
  });
  assert.equal(res.status, 401);
});
