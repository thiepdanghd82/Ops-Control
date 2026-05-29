// @ts-check
/**
 * Integration test for license-status router.
 * Run: node --test server/domains/security/routes/license.test.js
 *
 * Mounts the router on a fresh Express app, stubs auth middleware so
 * we can drive role into req.user directly without going through the
 * full session machinery, then asserts shape + access control.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPrivateKey, sign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { invalidateLicenseCache, TIERS } from '../../../services/licenseService.js';
import { createLicenseRouter } from './license.js';

const SIGNED_FIELDS = [
  'version',
  'installation_id',
  'customer',
  'tier',
  'max_users',
  'issued_at',
  'expires_at',
  'features',
];
const norm = (v) => (Array.isArray(v) ? [...v].sort().join(',') : (v ?? ''));
const canonicalize = (p) => SIGNED_FIELDS.map((k) => `${k}=${norm(p[k])}`).join('|');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-lic-int-test-'));
const licPath = path.join(tmpDir, 'license.json');

const devPriv = createPrivateKey(
  fs.readFileSync(path.resolve('scripts/license/dev-private.pem'), 'utf8')
);

function writeLic(overrides = {}) {
  const payload = {
    version: 2,
    installation_id: 'a'.repeat(64),
    customer: 'Test Plant',
    tier: 'M',
    max_users: TIERS.M,
    issued_at: '2026-04-29T00:00:00Z',
    expires_at: '2027-04-29T00:00:00Z',
    features: ['costing'],
    ...overrides,
  };
  const signature = sign(null, Buffer.from(canonicalize(payload)), devPriv).toString('base64');
  fs.writeFileSync(licPath, JSON.stringify({ ...payload, signature }));
}

// Inject a stub auth that reads x-test-role header. Real production
// auth middleware (cookie + session lookup) is bypassed for tests.
function buildApp({ countActiveUsers }) {
  const app = express();
  const stubAuth = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'Authentication required' });
    req.user = { user: { role }, role };
    next();
  };
  app.use('/api/license', createLicenseRouter({ countActiveUsers, auth: stubAuth }));
  return app;
}

async function request(app, path, headers = {}) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  invalidateLicenseCache();
  process.env.OPS_LICENSE_FILE = licPath;
  delete process.env.OPS_ALLOW_UNLICENSED;
});

describe('license/status integration', () => {
  test('unauth → 401', async () => {
    writeLic();
    const app = buildApp({ countActiveUsers: () => 5 });
    const r = await request(app, '/api/license/status');
    assert.equal(r.status, 401);
  });

  test('user role → 403 (admin/sys only)', async () => {
    writeLic();
    const app = buildApp({ countActiveUsers: () => 5 });
    const r = await request(app, '/api/license/status', { 'x-test-role': 'user' });
    assert.equal(r.status, 403);
  });

  test('admin sees tier + seats remaining', async () => {
    writeLic({ tier: 'M', max_users: 20 });
    const app = buildApp({ countActiveUsers: () => 7 });
    const r = await request(app, '/api/license/status', { 'x-test-role': 'admin' });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.tier, 'M');
    assert.equal(r.body.max_users, 20);
    assert.equal(r.body.active_users, 7);
    assert.equal(r.body.seats_remaining, 13);
  });

  test('invalid license → 402', async () => {
    if (fs.existsSync(licPath)) fs.unlinkSync(licPath);
    invalidateLicenseCache();
    const app = buildApp({ countActiveUsers: () => 0 });
    const r = await request(app, '/api/license/status', { 'x-test-role': 'admin' });
    assert.equal(r.status, 402);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error, 'missing');
  });

  test('seats_remaining clamps at 0 when over cap', async () => {
    writeLic({ tier: 'S', max_users: TIERS.S });
    const app = buildApp({ countActiveUsers: () => 99 });
    const r = await request(app, '/api/license/status', { 'x-test-role': 'sys' });
    assert.equal(r.status, 200);
    assert.equal(r.body.seats_remaining, 0);
  });
});
