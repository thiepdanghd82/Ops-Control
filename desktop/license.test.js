/**
 * License Ed25519 verify tests — Sprint v1.3 P1.3.
 * Run with: node --test desktop/license.test.js
 *
 * Doesn't import desktop/license.js (it requires Electron's `app`
 * module). Instead duplicates canonicalize + verify in pure Node.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPublicKey, createPrivateKey, sign, verify, generateKeyPairSync,
} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SIGNED_FIELDS = [
  'version', 'installation_id', 'customer', 'tier', 'max_users',
  'issued_at', 'expires_at', 'features',
];
const norm = (v) => Array.isArray(v) ? [...v].sort().join(',') : (v ?? '');
function canonicalize(payload) {
  return SIGNED_FIELDS.map((k) => `${k}=${norm(payload[k])}`).join('|');
}
function signLicense(payload, privKey) {
  return {
    ...payload,
    signature: sign(null, Buffer.from(canonicalize(payload)), privKey).toString('base64'),
  };
}
function verifyLicense(license, pubKey) {
  const { signature, ...payload } = license;
  return verify(null, Buffer.from(canonicalize(payload)), pubKey, Buffer.from(signature, 'base64'));
}

const devPriv = createPrivateKey(
  fs.readFileSync(path.join(__dirname, '..', 'scripts', 'license', 'dev-private.pem'), 'utf8'),
);
const devPub = createPublicKey(
  fs.readFileSync(path.join(__dirname, '..', 'scripts', 'license', 'dev-public.pem'), 'utf8'),
);

const baseLicense = () => ({
  version: 2,
  installation_id: 'a'.repeat(64),
  customer: 'CCL Test',
  tier: 'M',
  max_users: 20,
  issued_at: '2026-04-29T00:00:00Z',
  expires_at: '2027-04-29T00:00:00Z',
  features: ['costing', 'library'],
});

test('valid license verifies OK with paired pubkey', () => {
  const lic = signLicense(baseLicense(), devPriv);
  assert.equal(verifyLicense(lic, devPub), true);
});

test('tampered field fails verification', () => {
  const lic = signLicense(baseLicense(), devPriv);
  lic.max_users = 50;
  assert.equal(verifyLicense(lic, devPub), false);
});

test('tampered signature (middle byte) fails verification', () => {
  const lic = signLicense(baseLicense(), devPriv);
  const sig = lic.signature.split('');
  sig[20] = sig[20] === 'A' ? 'B' : 'A';
  lic.signature = sig.join('');
  assert.equal(verifyLicense(lic, devPub), false);
});

test('signature from a different keypair fails', () => {
  const { privateKey: otherPriv } = generateKeyPairSync('ed25519');
  const lic = signLicense(baseLicense(), otherPriv);
  assert.equal(verifyLicense(lic, devPub), false);
});

test('canonicalisation is order-independent on array fields', () => {
  const a = signLicense({ ...baseLicense(), features: ['library', 'costing'] }, devPriv);
  const b = signLicense({ ...baseLicense(), features: ['costing', 'library'] }, devPriv);
  assert.equal(a.signature, b.signature);
});

test('all 3 tiers (S/M/L) sign + verify', () => {
  for (const tier of ['S', 'M', 'L']) {
    const max = { S: 15, M: 20, L: 50 }[tier];
    const lic = signLicense({ ...baseLicense(), tier, max_users: max }, devPriv);
    assert.equal(verifyLicense(lic, devPub), true, `tier ${tier} should verify`);
  }
});
