/**
 * verifyLicenseObject unit tests — pure in-memory license verification used by
 * the License Manager upload flow. Signs with a runtime-ephemeral keypair.
 * Run: node --test server/services/licenseVerifyObject.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyLicenseObject } from './licenseService.js';

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

const ID = 'f'.repeat(64);
function signed(overrides = {}) {
  const p = {
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
  return { ...p, signature: sign(null, Buffer.from(canonicalize(p)), testPriv).toString('base64') };
}

describe('verifyLicenseObject', () => {
  test('valid signed license → ok with normalized license', () => {
    const r = verifyLicenseObject(signed());
    assert.equal(r.ok, true);
    assert.equal(r.license.installation_id, ID);
    assert.equal(r.license.tier, 'M');
    assert.equal(r.license.max_users, 20);
  });
  test('malformed input → malformed', () => {
    assert.equal(verifyLicenseObject(null).reason, 'malformed');
    assert.equal(verifyLicenseObject([]).reason, 'malformed');
  });
  test('trial rejected as not-distributable', () => {
    assert.equal(verifyLicenseObject({ ...signed(), isTrial: true }).reason, 'trial-not-distributable');
  });
  test('tampered customer → bad-signature', () => {
    const l = signed();
    l.customer = 'EVIL';
    assert.equal(verifyLicenseObject(l).reason, 'bad-signature');
  });
  test('tier/max_users mismatch → tier-mismatch', () => {
    const l = signed();
    l.max_users = 99;
    assert.equal(verifyLicenseObject(l).reason, 'tier-mismatch');
  });
  test('bad installation_id format → bad-installation-id', () => {
    // sign a payload whose id is non-hex; canonicalize over the bad id so the
    // signature itself is valid, proving the id-format gate runs independently.
    assert.equal(verifyLicenseObject(signed({ installation_id: 'short' })).reason, 'bad-installation-id');
  });
  test('expired license → expired', () => {
    assert.equal(verifyLicenseObject(signed({ expires_at: '2020-01-01T00:00:00Z' })).reason, 'expired');
  });
  test('different keypair → bad-signature', () => {
    const { privateKey: other } = generateKeyPairSync('ed25519');
    const p = {
      version: 2,
      installation_id: ID,
      customer: 'X',
      tier: 'M',
      max_users: 20,
      issued_at: '2026-06-04T00:00:00Z',
      expires_at: '2027-06-09T00:00:00Z',
      features: ['costing'],
    };
    const forged = { ...p, signature: sign(null, Buffer.from(canonicalize(p)), other).toString('base64') };
    assert.equal(verifyLicenseObject(forged).reason, 'bad-signature');
  });
});
