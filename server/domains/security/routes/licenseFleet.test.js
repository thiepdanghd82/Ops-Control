// @ts-check
/**
 * License Manager fleet router — integration tests.
 * Run: node --test server/domains/security/routes/licenseFleet.test.js
 *
 * Stubs auth via x-test-role header, signs licenses with a runtime-ephemeral
 * keypair (no committed key) and points the verifier at its public half via
 * OPS_LICENSE_PUBKEY.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { generateKeyPairSync, sign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createLicenseFleetRouter } from './licenseFleet.js';

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

const { privateKey: testPriv, publicKey: testPub } = generateKeyPairSync('ed25519');
process.env.OPS_LICENSE_PUBKEY = testPub.export({ format: 'pem', type: 'spki' }).toString();

const ID = 'd'.repeat(64);
const ID2 = 'e'.repeat(64);

function signLicense(overrides = {}) {
  const payload = {
    version: 2,
    installation_id: ID,
    customer: 'CCL Test',
    tier: 'M',
    max_users: 20,
    issued_at: '2026-06-04T00:00:00Z',
    expires_at: '2027-06-09T00:00:00Z',
    features: ['costing'],
    ...overrides,
  };
  return { ...payload, signature: sign(null, Buffer.from(canonicalize(payload)), testPriv).toString('base64') };
}

let dir;
let auditRows;

function buildApp() {
  const app = express();
  app.use(express.json());
  const stubAuth = (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'auth required' });
    req.user = { user: { role, username: `u-${role}` }, role };
    next();
  };
  const auditSink = (event, user, ip, detail) => auditRows.push({ event, user, detail });
  app.use(
    '/api/license/fleet',
    createLicenseFleetRouter({ dataDir: dir, auth: stubAuth, audit: auditSink })
  );
  return app;
}

async function req(app, method, p, { role, body } = {}) {
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${p}`, {
      method,
      headers: { 'content-type': 'application/json', ...(role ? { 'x-test-role': role } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-fleet-int-'));
  auditRows = [];
});

describe('B1 heartbeat', () => {
  test('unauth → 401', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/heartbeat', { body: { installation_id: ID } });
    assert.equal(r.status, 401);
  });
  test('any authenticated role records heartbeat', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      body: { installation_id: ID, hostname: 'op-mac', status: { type: 'trial', isTrial: true } },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.recorded, true);
    assert.equal(r.body.pending_license, null);
  });
  test('bad installation_id → 400', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/heartbeat', {
      role: 'user',
      body: { installation_id: 'nope' },
    });
    assert.equal(r.status, 400);
  });
});

describe('B2 fleet list (sys-only)', () => {
  test('non-sys → 403', async () => {
    const r = await req(buildApp(), 'GET', '/api/license/fleet', { role: 'admin' });
    assert.equal(r.status, 403);
  });
  test('sys sees machines from heartbeats', async () => {
    const app = buildApp();
    await req(app, 'POST', '/api/license/fleet/heartbeat', { role: 'user', body: { installation_id: ID, hostname: 'op-mac' } });
    const r = await req(app, 'GET', '/api/license/fleet', { role: 'sys' });
    assert.equal(r.status, 200);
    assert.equal(r.body.fleet.length, 1);
    assert.equal(r.body.fleet[0].installation_id, ID);
  });
});

describe('B2 upload (sys-only, verify before queue)', () => {
  test('non-sys → 403', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', { role: 'admin', body: { license: signLicense() } });
    assert.equal(r.status, 403);
  });
  test('valid signed license → queued + audit ok', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: signLicense(), installation_id: ID },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.queued, true);
    const ev = auditRows.find((a) => a.event === 'LICENSE_UPLOAD');
    assert.ok(ev && JSON.parse(ev.detail).ok === true);
  });
  test('tampered license → 422 bad-signature', async () => {
    const lic = signLicense();
    lic.max_users = 50; // breaks signature
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', { role: 'sys', body: { license: lic } });
    assert.equal(r.status, 422);
    assert.equal(r.body.reason, 'tier-mismatch'); // caught before sig (max_users≠tier ceiling)
  });
  test('signature-tampered (valid tier) → 422 bad-signature', async () => {
    const lic = signLicense();
    lic.customer = 'EVIL'; // re-canonicalize differs → sig invalid, tier still M/20
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', { role: 'sys', body: { license: lic } });
    assert.equal(r.status, 422);
    assert.equal(r.body.reason, 'bad-signature');
  });
  test('installation-mismatch vs expected target → 422', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: signLicense({ installation_id: ID }), installation_id: ID2 },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.reason, 'installation-mismatch');
  });
  test('trial license rejected (not distributable)', async () => {
    const r = await req(buildApp(), 'POST', '/api/license/fleet/upload', {
      role: 'sys',
      body: { license: { ...signLicense(), isTrial: true } },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.reason, 'trial-not-distributable');
  });
});

describe('B3 distribution', () => {
  test('uploaded license is delivered on next heartbeat, then cleared after confirm', async () => {
    const app = buildApp();
    await req(app, 'POST', '/api/license/fleet/upload', { role: 'sys', body: { license: signLicense(), installation_id: ID } });

    // heartbeat from the target machine → pending license delivered
    const hb1 = await req(app, 'POST', '/api/license/fleet/heartbeat', { role: 'user', body: { installation_id: ID, hostname: 'op-mac' } });
    assert.ok(hb1.body.pending_license, 'pending license should be delivered');
    assert.equal(hb1.body.pending_license.installation_id, ID);

    // client confirms applied
    const dist = await req(app, 'POST', '/api/license/fleet/distributed', { role: 'user', body: { installation_id: ID } });
    assert.equal(dist.body.distributed, true);
    assert.ok(auditRows.find((a) => a.event === 'LICENSE_DISTRIBUTED'));

    // subsequent heartbeat → no pending
    const hb2 = await req(app, 'POST', '/api/license/fleet/heartbeat', { role: 'user', body: { installation_id: ID, hostname: 'op-mac' } });
    assert.equal(hb2.body.pending_license, null);
  });
});
