/**
 * licenseService tests — tier enforcement + verify roundtrip.
 * Run: node --test server/services/licenseService.test.js
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getLicense,
  invalidateLicenseCache,
  requireSeatAvailable,
  TIERS,
} from './licenseService.js';

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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-lic-test-'));
const licPath = path.join(tmpDir, 'license.json');

// Rotation 2026-06-04: tests sign with a runtime-ephemeral keypair (no
// committed key) and point the verifier at its public half via
// OPS_LICENSE_PUBKEY, which licenseService.loadPublicKey() reads first.
const { privateKey: testPriv, publicKey: testPub } = generateKeyPairSync('ed25519');
process.env.OPS_LICENSE_PUBKEY = testPub.export({ format: 'pem', type: 'spki' }).toString();

function writeSignedLicense(overrides = {}) {
  const payload = {
    version: 2,
    installation_id: 'a'.repeat(64),
    customer: 'Test Customer',
    tier: 'M',
    max_users: TIERS.M,
    issued_at: '2026-04-29T00:00:00Z',
    expires_at: '2027-04-29T00:00:00Z',
    features: ['costing'],
    ...overrides,
  };
  const signature = sign(null, Buffer.from(canonicalize(payload)), testPriv).toString('base64');
  fs.writeFileSync(licPath, JSON.stringify({ ...payload, signature }, null, 2));
}

beforeEach(() => {
  invalidateLicenseCache();
  process.env.OPS_LICENSE_FILE = licPath;
  delete process.env.OPS_ALLOW_UNLICENSED;
});

describe('licenseService.getLicense', () => {
  test('valid M-tier license loads with max_users=20', () => {
    writeSignedLicense({ tier: 'M', max_users: 20 });
    const r = getLicense();
    assert.equal(r.ok, true);
    assert.equal(r.license.tier, 'M');
    assert.equal(r.license.max_users, 20);
  });
  test('tampered max_users (signature mismatch) → bad-signature', () => {
    writeSignedLicense({ tier: 'S', max_users: 15 });
    const raw = JSON.parse(fs.readFileSync(licPath, 'utf8'));
    raw.max_users = 50;
    fs.writeFileSync(licPath, JSON.stringify(raw));
    invalidateLicenseCache();
    const r = getLicense();
    assert.equal(r.ok, false);
    assert.ok(r.reason === 'bad-signature' || r.reason === 'tier-mismatch');
  });
  test('expired license → expired', () => {
    writeSignedLicense({ expires_at: '2020-01-01T00:00:00Z' });
    const r = getLicense();
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'expired');
  });
  test('missing file + OPS_ALLOW_UNLICENSED=1 → tier S fallback', () => {
    if (fs.existsSync(licPath)) fs.unlinkSync(licPath);
    process.env.OPS_ALLOW_UNLICENSED = '1';
    invalidateLicenseCache();
    const r = getLicense();
    assert.equal(r.ok, true);
    assert.equal(r.license.tier, 'S');
    assert.equal(r.license.isUnlicensed, true);
  });
});

describe('licenseService.requireSeatAvailable', () => {
  test('blocks at tier S limit', () => {
    writeSignedLicense({ tier: 'S', max_users: TIERS.S });
    const mw = requireSeatAvailable({ countActiveUsers: () => 15 });
    let nextCalled = false;
    let statusCode = null;
    let body = null;
    mw(
      {},
      {
        status(c) {
          statusCode = c;
          return this;
        },
        json(b) {
          body = b;
          return this;
        },
      },
      () => {
        nextCalled = true;
      }
    );
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 402);
    assert.equal(body.error, 'LICENSE_LIMIT_EXCEEDED');
    assert.equal(body.max_users, 15);
  });
  test('passes through under limit', () => {
    writeSignedLicense({ tier: 'M', max_users: TIERS.M });
    const mw = requireSeatAvailable({ countActiveUsers: () => 10 });
    let nextCalled = false;
    mw({}, {}, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });
  test('blocks when license invalid', () => {
    if (fs.existsSync(licPath)) fs.unlinkSync(licPath);
    invalidateLicenseCache();
    const mw = requireSeatAvailable({ countActiveUsers: () => 0 });
    let statusCode = null;
    mw(
      {},
      {
        status(c) {
          statusCode = c;
          return this;
        },
        json() {
          return this;
        },
      },
      () => {}
    );
    assert.equal(statusCode, 402);
  });
});
