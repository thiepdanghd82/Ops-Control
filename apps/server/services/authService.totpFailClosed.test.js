/**
 * Sprint 40 regression guard — TOTP secrets fail-CLOSED contract.
 *
 * Before Sprint 40 the login path treated an unreadable totp_secrets
 * file as "nobody has 2FA" and issued fully-verified sessions. That
 * turned a key-derivation mistake (Sprint 38 pwd cleanup broke the
 * v1 admin-pwd-derived key) into a silent 2FA bypass for everyone.
 *
 * These tests pin the new contract:
 *   1. loadTotpSecrets returns the fail-CLOSED marker dict on
 *      decrypt failure (never `{}` which is indistinguishable from
 *      "no users enrolled").
 *   2. isTotpSecretsUnavailable recognizes the marker.
 *   3. A legitimately empty file returns plain `{}` (no marker).
 *
 * Runner: node --test server/services/authService.totpFailClosed.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  init as initAuth,
  loadTotpSecrets,
  saveTotpSecrets,
  isTotpSecretsUnavailable,
} from './authService.js';

function setupTmpDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-totp-failclosed-'));
  fs.mkdirSync(path.join(dir, 'Library', 'Users'), { recursive: true });
  // Seed a users.json with an Administrator having a bcrypt (so the
  // deployment looks "normal" and v1 fallback key derivation can run).
  fs.writeFileSync(
    path.join(dir, 'Library', 'Users', 'users.json'),
    JSON.stringify(
      [{ id: 1, username: 'Administrator', role: 'sys', pwd_bcrypt: '$2b$12$x', pwd: 'seed-pwd' }],
      null,
      2
    )
  );
  initAuth(dir);
  return dir;
}

test('loadTotpSecrets: missing file → plain {} (no marker)', () => {
  setupTmpDataDir();
  const out = loadTotpSecrets();
  assert.deepEqual(Object.keys(out), []);
  assert.equal(isTotpSecretsUnavailable(out), false, 'no file is NOT the same as unavailable');
});

test('loadTotpSecrets: valid file round-trips without marker', () => {
  // Temporarily unset OPS_TOTP_KEY for this test — the v2 fallback
  // derives a key from admin pwd. Then env-set path later if needed.
  const savedEnv = process.env.OPS_TOTP_KEY;
  delete process.env.OPS_TOTP_KEY;
  try {
    setupTmpDataDir();
    saveTotpSecrets({ alice: 'JBSWY3DPEHPK3PXP' });
    const out = loadTotpSecrets();
    assert.equal(isTotpSecretsUnavailable(out), false);
    assert.equal(out['alice'], 'JBSWY3DPEHPK3PXP');
  } finally {
    if (savedEnv) process.env.OPS_TOTP_KEY = savedEnv;
  }
});

test('loadTotpSecrets: corrupt file → marker dict (NOT plain empty)', () => {
  const dir = setupTmpDataDir();
  // Write garbage that parses as JSON but fails HMAC/AEAD. Use a v1
  // shape with a randomly-bogus mac so the HMAC check rejects.
  fs.writeFileSync(
    path.join(dir, 'Library', 'Users', 'totp_secrets.enc'),
    JSON.stringify({
      v: 1,
      salt: Buffer.alloc(16).toString('base64'),
      nonce: Buffer.alloc(12).toString('base64'),
      mac: Buffer.alloc(32, 0xab).toString('base64'),
      data: Buffer.alloc(32).toString('base64'),
    })
  );
  const out = loadTotpSecrets();
  assert.equal(
    isTotpSecretsUnavailable(out),
    true,
    'decrypt fail MUST return marker so login path can fail-CLOSED'
  );
  // Sanity: the old code returned `{}`. Make sure we have NOT regressed.
  assert.notDeepEqual(out, {}, 'must NOT be plain {} — that was the Sprint-40 bug');
});

test('loadTotpSecrets: unparseable JSON also returns marker', () => {
  const dir = setupTmpDataDir();
  fs.writeFileSync(path.join(dir, 'Library', 'Users', 'totp_secrets.enc'), 'not json at all {{{');
  const out = loadTotpSecrets();
  assert.equal(isTotpSecretsUnavailable(out), true);
});

test('isTotpSecretsUnavailable: only the marker returns true', () => {
  assert.equal(isTotpSecretsUnavailable({}), false);
  assert.equal(isTotpSecretsUnavailable({ alice: 'secret' }), false);
  assert.equal(isTotpSecretsUnavailable(null), false);
  assert.equal(isTotpSecretsUnavailable(undefined), false);
  const sym = Symbol.for('ops.totp.decrypt_failed');
  assert.equal(isTotpSecretsUnavailable({ [sym]: true }), true);
});

// ── v3 key-fingerprint tests (incident regression guards) ─────────
// These lock in the fix for the 2FA-outage incident: an
// OPS_TOTP_KEY change used to produce an opaque AEAD tag failure. v3
// adds a plaintext key fingerprint so the server can distinguish
// "wrong key" (admin can restore the old one) from "corrupt file"
// (restore from backup) without leaking the key.

test('v3: new saves include a key fingerprint; load with same key succeeds', async () => {
  const { getTotpKeyFingerprint } = await import('./authService.js');
  const savedEnv = process.env.OPS_TOTP_KEY;
  process.env.OPS_TOTP_KEY = 'a'.repeat(64); // 32 bytes of 0xaa
  try {
    const dir = setupTmpDataDir();
    saveTotpSecrets({ alice: 'JBSWY3DPEHPK3PXP' });
    const raw = JSON.parse(
      fs.readFileSync(path.join(dir, 'Library', 'Users', 'totp_secrets.enc'), 'utf-8')
    );
    assert.equal(raw.v, 3, 'new saves must be v3');
    assert.ok(raw.fp, 'v3 must include a fp field');
    // Fingerprint matches what the service reports for the current key
    const fpHex = getTotpKeyFingerprint();
    assert.equal(Buffer.from(raw.fp, 'base64').toString('hex'), fpHex);
    // Round-trip
    const out = loadTotpSecrets();
    assert.equal(out.alice, 'JBSWY3DPEHPK3PXP');
  } finally {
    if (savedEnv) process.env.OPS_TOTP_KEY = savedEnv;
    else delete process.env.OPS_TOTP_KEY;
  }
});

test('v3: key rotated → loadTotpSecrets returns fail-CLOSED marker (wrong key)', () => {
  const savedEnv = process.env.OPS_TOTP_KEY;
  process.env.OPS_TOTP_KEY = 'b'.repeat(64);
  try {
    const dir = setupTmpDataDir();
    saveTotpSecrets({ alice: 'JBSWY3DPEHPK3PXP' }); // saved with 'bb...'
    // Rotate the key — caller now has a DIFFERENT OPS_TOTP_KEY.
    process.env.OPS_TOTP_KEY = 'c'.repeat(64);
    const out = loadTotpSecrets();
    assert.equal(isTotpSecretsUnavailable(out), true, 'wrong key must trigger fail-CLOSED marker');
  } finally {
    if (savedEnv) process.env.OPS_TOTP_KEY = savedEnv;
    else delete process.env.OPS_TOTP_KEY;
  }
});

test('v3: corrupt data with matching fp → fail-CLOSED marker (separate path)', () => {
  const savedEnv = process.env.OPS_TOTP_KEY;
  process.env.OPS_TOTP_KEY = 'd'.repeat(64);
  try {
    const dir = setupTmpDataDir();
    saveTotpSecrets({ alice: 'JBSWY3DPEHPK3PXP' });
    const fp = path.join(dir, 'Library', 'Users', 'totp_secrets.enc');
    // Keep fp valid, scramble the AEAD tag to simulate bit-rot.
    const enc = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    enc.tag = Buffer.alloc(16, 0xff).toString('base64'); // valid length, wrong bytes
    fs.writeFileSync(fp, JSON.stringify(enc, null, 2));
    const out = loadTotpSecrets();
    assert.equal(isTotpSecretsUnavailable(out), true, 'AEAD tampering still fail-CLOSED');
  } finally {
    if (savedEnv) process.env.OPS_TOTP_KEY = savedEnv;
    else delete process.env.OPS_TOTP_KEY;
  }
});

// ── Sprint 41 — role-based enrollment enforcement ────────────────
// Regression guards for the 2FA-bypass incident: a sys user logging in
// when totp_secrets.enc is missing must NOT get a verified session.
// Instead, they must get an enrollment-pending session and be gated
// into the TOTP setup flow.

test('userMustHaveTotp: sys role required by default policy', async () => {
  const { userMustHaveTotp } = await import('./authService.js');
  const savedPolicy = process.env.OPS_REQUIRE_2FA_ROLES;
  delete process.env.OPS_REQUIRE_2FA_ROLES;
  try {
    assert.equal(userMustHaveTotp({ role: 'sys' }), true, 'sys is in default policy');
    assert.equal(userMustHaveTotp({ role: 'admin' }), true, 'admin is in default policy');
    assert.equal(userMustHaveTotp({ role: 'user' }), false, 'user NOT in default policy');
    assert.equal(userMustHaveTotp({ role: 'viewonly' }), false);
  } finally {
    if (savedPolicy !== undefined) process.env.OPS_REQUIRE_2FA_ROLES = savedPolicy;
  }
});

test('userMustHaveTotp: per-user totp_required overrides missing policy', async () => {
  const { userMustHaveTotp } = await import('./authService.js');
  const savedPolicy = process.env.OPS_REQUIRE_2FA_ROLES;
  process.env.OPS_REQUIRE_2FA_ROLES = ''; // disable role-based policy
  try {
    assert.equal(
      userMustHaveTotp({ role: 'user', totp_required: true }),
      true,
      'explicit per-user flag ALWAYS wins even when role policy is off'
    );
    assert.equal(
      userMustHaveTotp({ role: 'sys', totp_required: false }),
      false,
      'empty policy + no per-user flag → sys bypass allowed (test mode)'
    );
  } finally {
    if (savedPolicy !== undefined) process.env.OPS_REQUIRE_2FA_ROLES = savedPolicy;
    else delete process.env.OPS_REQUIRE_2FA_ROLES;
  }
});

test('userMustHaveTotp: OPS_REQUIRE_2FA_ROLES widens policy (compliance knob)', async () => {
  const { userMustHaveTotp } = await import('./authService.js');
  const savedPolicy = process.env.OPS_REQUIRE_2FA_ROLES;
  process.env.OPS_REQUIRE_2FA_ROLES = 'sys,admin,cost';
  try {
    assert.equal(userMustHaveTotp({ role: 'cost' }), true, 'cost widened into policy');
    assert.equal(userMustHaveTotp({ role: 'user' }), false);
  } finally {
    if (savedPolicy !== undefined) process.env.OPS_REQUIRE_2FA_ROLES = savedPolicy;
    else delete process.env.OPS_REQUIRE_2FA_ROLES;
  }
});

test('userMustHaveTotp: empty string "" means NO enforcement (test harness path)', async () => {
  const { userMustHaveTotp } = await import('./authService.js');
  const savedPolicy = process.env.OPS_REQUIRE_2FA_ROLES;
  process.env.OPS_REQUIRE_2FA_ROLES = '';
  try {
    // The "" case must NOT fall back to default — otherwise the
    // integration-test harness would lock out its own sys test user.
    assert.equal(
      userMustHaveTotp({ role: 'sys' }),
      false,
      'empty string disables the role policy (?? not ||)'
    );
  } finally {
    if (savedPolicy !== undefined) process.env.OPS_REQUIRE_2FA_ROLES = savedPolicy;
    else delete process.env.OPS_REQUIRE_2FA_ROLES;
  }
});

test('getTotpKeyFingerprint: stable for same key, differs for different keys', async () => {
  const { getTotpKeyFingerprint } = await import('./authService.js');
  const savedEnv = process.env.OPS_TOTP_KEY;
  try {
    setupTmpDataDir(); // initAuth so USERS_DIR is set
    process.env.OPS_TOTP_KEY = 'a'.repeat(64);
    const fp1 = getTotpKeyFingerprint();
    const fp2 = getTotpKeyFingerprint();
    assert.equal(fp1, fp2, 'same key → same fp');
    process.env.OPS_TOTP_KEY = 'b'.repeat(64);
    const fp3 = getTotpKeyFingerprint();
    assert.notEqual(fp1, fp3, 'different key → different fp');
    assert.equal(fp1.length, 32, '16 bytes → 32 hex chars');
  } finally {
    if (savedEnv) process.env.OPS_TOTP_KEY = savedEnv;
    else delete process.env.OPS_TOTP_KEY;
  }
});
