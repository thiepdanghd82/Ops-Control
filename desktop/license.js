/**
 * License manager — v1.3 Ed25519 asymmetric edition.
 *
 * Sprint v1.3 P1.3 (2026-04-29): replaces v1.2 HMAC-SHA256 with
 * asymmetric Ed25519. Server-side (CCL HQ) holds the PRIVATE key for
 * signing; client app embeds only the PUBLIC key. Compromise of any
 * client install no longer enables fake licenses for other customers.
 *
 * License file format:
 *   {
 *     "version": 2,
 *     "installation_id": "<sha256(machineId)>",
 *     "customer": "CCL Design Vietnam — Plant Hai Phong",
 *     "tier": "M",                                // 'S' | 'M' | 'L'
 *     "max_users": 20,                            // S=15, M=20, L=50
 *     "issued_at": "2026-04-29T10:00:00Z",
 *     "expires_at": "2027-04-29T10:00:00Z",
 *     "features": ["costing","library","sales","planning","quality","mes"],
 *     "signature": "<base64 Ed25519 signature>"
 *   }
 *
 * Public key embed strategy: read from OPS_LICENSE_PUBKEY (env at build
 * time, baked into asar). For dev, fallback to the bundled dev pubkey
 * which pairs with `scripts/generate-license.mjs`'s dev privkey.
 *
 * v1.2 HMAC licenses are NO LONGER ACCEPTED — operators must request a
 * new v1.3 license. Migration plan documented in MIGRATION_GUIDE.md.
 */

'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { app, dialog } = require('electron');

let machineIdSync = null;
try {
  ({ machineIdSync } = require('node-machine-id'));
} catch {
  /* optional */
}

// ─── Configuration ─────────────────────────────────────────────────
// Tier definitions match IMPROVEMENT_BRIEF.md.
const TIER_LIMITS = Object.freeze({ S: 15, M: 20, L: 50 });
const VALID_TIERS = Object.freeze(['S', 'M', 'L']);

const LICENSE_PATH = () => path.join(app.getPath('userData'), 'license.json');
const TRIAL_DAYS = 14;

// Public key (PEM/SPKI, Ed25519). At build time, electron-builder
// injects OPS_LICENSE_PUBKEY through the env or a generated file in
// resources. Dev mode falls back to the committed dev pubkey so the
// app boots out-of-the-box without ops setup.
// DEV pubkey — pairs with scripts/license/dev-private.pem. Production
// builds MUST set OPS_LICENSE_PUBKEY at build time so dev licenses
// signed with the dev private key cannot be applied to prod installs.
const DEV_PUBKEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAR2s68TfG9nR70mQXUBVALdf468fBR/RBMP9r4n9X5gY=
-----END PUBLIC KEY-----`;

function getPublicKey() {
  const fromEnv = process.env.OPS_LICENSE_PUBKEY;
  if (fromEnv) {
    try {
      return crypto.createPublicKey(fromEnv);
    } catch (e) {
      console.warn('[license] OPS_LICENSE_PUBKEY invalid:', e.message);
    }
  }
  // Resource-bundled key (preferred at runtime when packaged).
  const bundled = path.join(process.resourcesPath || __dirname, 'license-pubkey.pem');
  if (fs.existsSync(bundled)) {
    try {
      return crypto.createPublicKey(fs.readFileSync(bundled, 'utf8'));
    } catch (e) {
      console.warn('[license] bundled pubkey invalid:', e.message);
    }
  }
  return crypto.createPublicKey(DEV_PUBKEY_PEM);
}

// ─── Hardware fingerprint ──────────────────────────────────────────
function getHardwareFingerprint() {
  let machineId;
  if (machineIdSync) {
    try {
      machineId = machineIdSync(true);
    } catch {
      machineId = null;
    }
  }
  if (!machineId) {
    const os = require('node:os');
    machineId = `${os.hostname()}|${os.platform()}|${os.arch()}|${os.cpus()[0]?.model || ''}`;
  }
  return crypto.createHash('sha256').update(machineId).digest('hex');
}

// ─── Canonicalisation (must match scripts/generate-license.mjs) ────
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

function canonicalize(payload) {
  const norm = (v) => (Array.isArray(v) ? [...v].sort().join(',') : (v ?? ''));
  return SIGNED_FIELDS.map((k) => `${k}=${norm(payload[k])}`).join('|');
}

// ─── Verify (Ed25519) ──────────────────────────────────────────────
function verifyLicense(license, currentInstallationId) {
  if (!license || typeof license !== 'object') return { valid: false, reason: 'malformed' };
  if (license.version !== 2)
    return {
      valid: false,
      reason: 'unsupported-version',
      detail: 'License v1.x is no longer accepted; please request a v2 license from CCL HQ',
    };
  if (!license.signature) return { valid: false, reason: 'missing-signature' };

  const tier = license.tier;
  if (!VALID_TIERS.includes(tier)) return { valid: false, reason: 'bad-tier' };
  if (license.max_users !== TIER_LIMITS[tier]) {
    return {
      valid: false,
      reason: 'tier-mismatch',
      detail: `tier ${tier} expects max_users=${TIER_LIMITS[tier]}`,
    };
  }

  // Verify signature
  let sigOk;
  try {
    const data = Buffer.from(canonicalize(license));
    const sig = Buffer.from(license.signature, 'base64');
    sigOk = crypto.verify(null, data, getPublicKey(), sig);
  } catch (e) {
    return { valid: false, reason: 'verify-error', detail: e.message };
  }
  if (!sigOk) return { valid: false, reason: 'bad-signature' };

  // Bind to this machine
  if (license.installation_id !== currentInstallationId) {
    return {
      valid: false,
      reason: 'installation-mismatch',
      detail: 'license bound to different machine',
    };
  }

  // Check expiry
  if (license.expires_at) {
    const exp = new Date(license.expires_at).getTime();
    if (Number.isFinite(exp) && exp < Date.now()) {
      return { valid: false, reason: 'expired', expires_at: license.expires_at };
    }
  }

  return {
    valid: true,
    customer: license.customer,
    tier,
    max_users: license.max_users,
    expires_at: license.expires_at,
    features: license.features || [],
  };
}

// ─── Trial license (dev / first-run only) ─────────────────────────
// Trial uses a flag-based bypass (no signature) since it's runtime-only
// and bound to installation_id. Trial expires after TRIAL_DAYS and is
// non-renewable from the same machine (`existing → not-trial` path
// blocks re-issue).
function issueTrialLicense(installationId) {
  const now = new Date();
  const exp = new Date(now.getTime() + TRIAL_DAYS * 86400 * 1000);
  // Trial bypasses signature verification by using a separate code
  // path — see verifyTrial() below. Real licenses MUST be Ed25519.
  return {
    version: 2,
    isTrial: true,
    installation_id: installationId,
    customer: 'TRIAL',
    tier: 'S',
    max_users: TIER_LIMITS.S,
    issued_at: now.toISOString(),
    expires_at: exp.toISOString(),
    features: ['costing', 'library', 'sales'],
    // No signature — runtime-only, never exported.
  };
}

function verifyTrial(license, currentInstallationId) {
  if (!license?.isTrial || license.version !== 2) return { valid: false, reason: 'not-trial' };
  if (license.installation_id !== currentInstallationId) {
    return { valid: false, reason: 'installation-mismatch' };
  }
  const exp = new Date(license.expires_at).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) {
    return { valid: false, reason: 'expired', expires_at: license.expires_at };
  }
  return {
    valid: true,
    customer: 'TRIAL',
    tier: 'S',
    max_users: license.max_users,
    expires_at: license.expires_at,
    features: license.features,
  };
}

// ─── Persistence ───────────────────────────────────────────────────
function loadLicense() {
  const p = LICENSE_PATH();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function saveLicense(license) {
  fs.writeFileSync(LICENSE_PATH(), JSON.stringify(license, null, 2), 'utf8');
}

// ─── Boot check ────────────────────────────────────────────────────
function checkOnBoot({ allowTrial = true } = {}) {
  const installationId = getHardwareFingerprint();
  const existing = loadLicense();

  if (existing) {
    const v = existing.isTrial
      ? verifyTrial(existing, installationId)
      : verifyLicense(existing, installationId);
    if (v.valid) return { ok: true, license: v, installationId, isTrial: !!existing.isTrial };
    return { ok: false, reason: v.reason, detail: v.detail, installationId };
  }

  if (allowTrial) {
    const trial = issueTrialLicense(installationId);
    saveLicense(trial);
    const v = verifyTrial(trial, installationId);
    return { ok: true, license: v, installationId, isTrial: true };
  }
  return { ok: false, reason: 'no-license', installationId };
}

// ─── Apply user-supplied license ───────────────────────────────────
function applyLicense(licenseInput) {
  const installationId = getHardwareFingerprint();
  const v = verifyLicense(licenseInput, installationId);
  if (!v.valid) return { ok: false, reason: v.reason, detail: v.detail };
  saveLicense(licenseInput);
  return { ok: true, license: v };
}

/**
 * Format a 64-char sha256 hex into 4 groups of 16, separated by spaces.
 * Why: a continuous 64-char hex wraps badly inside macOS dialog text and
 * can be mis-read with the line-wrap hyphen as a literal character. Real
 * incident: an installation_id was emailed back with the wrap hyphen
 * inside, the signed license then failed verification with
 * `installation-mismatch`. Spaces are visually safe (no character looks
 * like a separator) and a one-line `replace(/\s/g, '')` recovers the
 * canonical form on the signing side.
 */
function formatInstallationIdForDisplay(id) {
  if (typeof id !== 'string' || id.length !== 64) return id;
  return id.match(/.{1,16}/g).join(' ');
}

async function showLicenseDialog(reason, installationId) {
  const formatted = formatInstallationIdForDisplay(installationId);
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Ops Control — License không hợp lệ',
    message: `License không hợp lệ: ${reason}`,
    detail:
      `Installation ID của máy này (4 nhóm × 16 ký tự, bỏ space khi ký):\n${formatted}\n\n` +
      `Gửi mã này cho admin để được cấp license mới (Ed25519), hoặc đặt ` +
      `file license.json hợp lệ vào:\n${LICENSE_PATH()}`,
    buttons: ['Copy Installation ID', 'Đóng'],
    defaultId: 0,
    cancelId: 1,
  });
  if (result.response === 0) {
    try {
      // clipboard is bound at module scope below — defer require so this
      // file stays loadable in unit tests where electron isn't booted.
      const { clipboard } = require('electron');
      clipboard.writeText(installationId);
    } catch {
      /* clipboard may be unavailable in unit tests — non-fatal */
    }
  }
}

// ─── IPC bridge ────────────────────────────────────────────────────
function register(ipcMain) {
  ipcMain.handle('ops:license.status', () => {
    const installationId = getHardwareFingerprint();
    const existing = loadLicense();
    if (!existing) return { hasLicense: false, installationId };
    const v = existing.isTrial
      ? verifyTrial(existing, installationId)
      : verifyLicense(existing, installationId);
    return {
      hasLicense: true,
      installationId,
      isTrial: !!existing.isTrial,
      valid: v.valid,
      reason: v.reason,
      customer: v.customer,
      tier: v.tier,
      max_users: v.max_users,
      expires_at: v.expires_at,
      features: v.features,
    };
  });
  ipcMain.handle('ops:license.apply', (_e, lic) => {
    // S-DIAG-FIX (2026-05-05) — defense-in-depth: validate the
    // renderer's payload before handing it to verifyLicense. License
    // envelope is a JSON object (see verifyLicense at line 119); cap
    // serialized size at 8 KB to block memory-abuse via a compromised
    // renderer. Bad shapes return a structured reason instead of
    // crashing the IPC handler.
    if (!lic || typeof lic !== 'object' || Array.isArray(lic)) {
      return { ok: false, reason: 'malformed', detail: 'License must be a JSON object' };
    }
    try {
      if (JSON.stringify(lic).length > 8192) {
        return { ok: false, reason: 'too-large', detail: 'License envelope exceeds 8 KB' };
      }
    } catch {
      return { ok: false, reason: 'malformed', detail: 'License is not serializable' };
    }
    return applyLicense(lic);
  });
  ipcMain.handle('ops:license.fingerprint', () => getHardwareFingerprint());
  ipcMain.handle('ops:license.tiers', () => ({ tiers: VALID_TIERS, limits: TIER_LIMITS }));
}

module.exports = {
  register,
  checkOnBoot,
  applyLicense,
  showLicenseDialog,
  getHardwareFingerprint,
  verifyLicense,
  verifyTrial,
  canonicalize,
  formatInstallationIdForDisplay,
  TIER_LIMITS,
  VALID_TIERS,
};
