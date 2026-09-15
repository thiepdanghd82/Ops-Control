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
const { sign, verify, generateKeyPairSync } = require('node:crypto');

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

// Rotation 2026-06-04: sign with a runtime-ephemeral keypair so no signing
// key is ever committed to the repo. These tests exercise the canonicalize +
// Ed25519 sign/verify roundtrip, which is key-agnostic.
const { privateKey: testPriv, publicKey: testPub } = generateKeyPairSync('ed25519');

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
  const lic = signLicense(baseLicense(), testPriv);
  assert.equal(verifyLicense(lic, testPub), true);
});

test('tampered field fails verification', () => {
  const lic = signLicense(baseLicense(), testPriv);
  lic.max_users = 50;
  assert.equal(verifyLicense(lic, testPub), false);
});

test('tampered signature (middle byte) fails verification', () => {
  const lic = signLicense(baseLicense(), testPriv);
  const sig = lic.signature.split('');
  sig[20] = sig[20] === 'A' ? 'B' : 'A';
  lic.signature = sig.join('');
  assert.equal(verifyLicense(lic, testPub), false);
});

test('signature from a different keypair fails', () => {
  const { privateKey: otherPriv } = generateKeyPairSync('ed25519');
  const lic = signLicense(baseLicense(), otherPriv);
  assert.equal(verifyLicense(lic, testPub), false);
});

test('canonicalisation is order-independent on array fields', () => {
  const a = signLicense({ ...baseLicense(), features: ['library', 'costing'] }, testPriv);
  const b = signLicense({ ...baseLicense(), features: ['costing', 'library'] }, testPriv);
  assert.equal(a.signature, b.signature);
});

test('all 3 tiers (S/M/L) sign + verify', () => {
  for (const tier of ['S', 'M', 'L']) {
    const max = { S: 15, M: 20, L: 50 }[tier];
    const lic = signLicense({ ...baseLicense(), tier, max_users: max }, testPriv);
    assert.equal(verifyLicense(lic, testPub), true, `tier ${tier} should verify`);
  }
});

// ─── Installation-ID display formatter ────────────────────────────────
// Re-implement here so this file stays loadable without electron `app`.
// Mirrors the helper exported from desktop/license.js.
function formatInstallationIdForDisplay(id) {
  if (typeof id !== 'string' || id.length !== 64) return id;
  return id.match(/.{1,16}/g).join(' ');
}

test('installation-ID formatter chunks 64-hex into 4×16 with single-space separators', () => {
  const id = 'ef3981e1734fee79b03cea1de206168cdfa333a7484854a041135691385a3103';
  const out = formatInstallationIdForDisplay(id);
  assert.equal(out, 'ef3981e1734fee79 b03cea1de206168c dfa333a7484854a0 41135691385a3103');
  // CRITICAL invariant — the canonical form is recovered by stripping
  // whitespace. If the formatter ever introduces a hyphen or other
  // non-whitespace char, the signing pipeline breaks (real incident:
  // operator emailed back an ID with a wrap-hyphen → sig mismatch).
  assert.equal(out.replace(/\s/g, ''), id);
});

test('installation-ID formatter passes through non-64-char inputs unchanged', () => {
  assert.equal(formatInstallationIdForDisplay(''), '');
  assert.equal(formatInstallationIdForDisplay('short'), 'short');
  assert.equal(formatInstallationIdForDisplay(null), null);
});

// ─── Installation-ID resolver (cache + stable fingerprint) ────────────
// Sprint S-LICENSE-IDSTABLE: regression tests for the "same machine, two
// different Installation IDs" bug. This imports the REAL pure module
// (no electron) so it exercises the shipping code, not a re-implementation.
const { computeFingerprint, resolveInstallationId, HEX64 } = require('./installationId');
const { createHash } = require('node:crypto');
const sha = (s) => createHash('sha256').update(s).digest('hex');

// In-memory deps harness. machineIdSeq is consumed one value per
// resolve/compute call (last value repeats); null simulates a REG.exe failure.
function harness({ initialCache = null, machineIdSeq = [null], fallbackParts = [] } = {}) {
  const seq = Array.isArray(machineIdSeq) ? [...machineIdSeq] : [machineIdSeq];
  const state = { cache: initialCache, writes: 0, i: 0, logs: [] };
  const deps = {
    readCache: () => state.cache,
    writeCache: (id) => {
      state.cache = id;
      state.writes += 1;
    },
    getMachineId: () => {
      const v = state.i < seq.length ? seq[state.i] : seq[seq.length - 1];
      state.i += 1;
      return v;
    },
    getFallbackParts: () => fallbackParts,
    log: (m) => state.logs.push(m),
  };
  return { deps, state };
}

test('computeFingerprint prefers machine-id and matches sha256(raw) byte-for-byte', () => {
  const r = computeFingerprint({
    machineId: 'WIN-GUID-1234',
    fallbackParts: ['h', 'win32', 'x64', 'cpu'],
  });
  assert.equal(r.source, 'machine-id');
  assert.equal(r.id, sha('WIN-GUID-1234')); // backward-compat with pre-fix hashing
});

test('computeFingerprint falls back joining parts with "|" (byte-compat with old code)', () => {
  const fb = ['HOST', 'win32', 'x64', 'Intel(R) Core'];
  const r = computeFingerprint({ machineId: null, fallbackParts: fb });
  assert.equal(r.source, 'fallback');
  assert.equal(r.id, sha('HOST|win32|x64|Intel(R) Core'));
});

test('REGRESSION: cache hit returns the same ID even when machine-id later fails', () => {
  const guid = 'WIN-MACHINE-GUID-1234';
  const fb = ['HOST', 'win32', 'x64', 'Intel'];
  const { deps, state } = harness({ machineIdSeq: [guid, null], fallbackParts: fb });

  // Boot 1: REG works → canonical ID computed + cached.
  const first = resolveInstallationId(deps);
  assert.equal(first, sha(guid));
  assert.equal(state.writes, 1);

  // Boot 2: REG.exe fails (AV/EDR/timeout). Pre-fix this returned the fallback
  // hash → "installation-mismatch". Now the cache pins the identity.
  const second = resolveInstallationId(deps);
  assert.equal(second, sha(guid), 'must NOT flip to the fallback fingerprint');
  assert.notEqual(second, sha(fb.join('|')));
  assert.equal(state.writes, 1, 'no second write — cache is authoritative');
});

test('fallback-sourced ID is NOT cached; a later good machine-id read becomes authoritative', () => {
  const guid = 'GOOD-GUID';
  const fb = ['HOST', 'win32', 'x64', 'Intel'];
  const { deps, state } = harness({ machineIdSeq: [null, guid], fallbackParts: fb });

  // Boot 1: REG unavailable → fallback returned live, NOT cached.
  const first = resolveInstallationId(deps);
  assert.equal(first, sha(fb.join('|')));
  assert.equal(state.writes, 0);
  assert.equal(state.cache, null);

  // Boot 2: REG now works → canonical ID computed + cached.
  const second = resolveInstallationId(deps);
  assert.equal(second, sha(guid));
  assert.equal(state.writes, 1);

  // Boot 3: cache hit forever after.
  assert.equal(resolveInstallationId(deps), sha(guid));
  assert.equal(state.writes, 1);
});

test('corrupt cache is ignored and recomputed', () => {
  const { deps } = harness({
    initialCache: 'not-valid-hex',
    machineIdSeq: ['G'],
    fallbackParts: ['a', 'b', 'c', 'd'],
  });
  const id = resolveInstallationId(deps);
  assert.equal(id, sha('G'));
  assert.ok(HEX64.test(id));
});

test('cache value is normalized (trim + lowercase) on hit and skips recompute', () => {
  const raw = `  ${'AB'.repeat(32)}\n`; // 64 hex chars, upper-case, padded
  const { deps, state } = harness({
    initialCache: raw,
    machineIdSeq: ['SHOULD-NOT-BE-READ'],
    fallbackParts: [],
  });
  const id = resolveInstallationId(deps);
  assert.equal(id, 'ab'.repeat(32));
  assert.equal(state.i, 0, 'machine-id source must not be consulted on a cache hit');
  assert.equal(state.writes, 0);
});

test('readCache throwing is swallowed → recompute', () => {
  const { deps } = harness({ machineIdSeq: ['G'], fallbackParts: ['a', 'b', 'c', 'd'] });
  deps.readCache = () => {
    throw new Error('EACCES');
  };
  assert.equal(resolveInstallationId(deps), sha('G'));
});

test('writeCache throwing is swallowed → still returns the computed ID', () => {
  const { deps } = harness({ machineIdSeq: ['G'], fallbackParts: ['a', 'b', 'c', 'd'] });
  deps.writeCache = () => {
    throw new Error('EROFS');
  };
  assert.equal(resolveInstallationId(deps), sha('G'));
});

test('getMachineId throwing is treated as unavailable → fallback (not cached)', () => {
  const fb = ['HOST', 'win32', 'x64', 'Intel'];
  const { deps, state } = harness({ fallbackParts: fb });
  deps.getMachineId = () => {
    throw new Error('REG.exe blocked');
  };
  assert.equal(resolveInstallationId(deps), sha(fb.join('|')));
  assert.equal(state.writes, 0);
});
