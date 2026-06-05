// @ts-check
/**
 * licenseService — server-side license verification + tier enforcement.
 *
 * Sprint v1.3 P5.1. Companion to `desktop/license.js` but independent
 * (the server runs as a forked node process with its own license check).
 * Reads `OPS_LICENSE_FILE` env (defaults to `<DATA_DIR>/license.json`)
 * and verifies the Ed25519 signature against `OPS_LICENSE_PUBKEY`.
 *
 * Responsibilities:
 *   - Verify license on boot; expose `getLicense()` for routes.
 *   - Enforce `max_users` on `POST /api/users` (rejects with 402).
 *   - Expose `getActiveUserCount()` for diagnostics in admin UI.
 *
 * Fail-open during early dev: if no license file is present and
 * `OPS_ALLOW_UNLICENSED=1`, the server logs a warning and runs at
 * tier S limits. This is intentional for `npm run dev` flows; the
 * desktop SERVER installer ALWAYS sets a license via setupWizard.
 */

import { createPublicKey, verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// KEY ROTATION 2026-06-04: embedded PRODUCTION public key (label "prod",
// SHA-256 fp 044e1ad7…), mirror of desktop/license.js EMBEDDED_PUBKEY_PEM.
// Replaces the old on-disk scripts/license/dev-public.pem fallback — the old
// dev keypair's PRIVATE half had been committed to the public repo and is
// considered permanently disclosed. The matching private key lives OFFLINE
// only and is never committed. Old-key licenses no longer verify here.
const EMBEDDED_PUBKEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAS3dNNf/Srcj2KxqswutJU0WHjPujy4imTKkZys379GE=
-----END PUBLIC KEY-----`;

const TIER_LIMITS = Object.freeze({ S: 15, M: 20, L: 50 });
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

let cachedLicense = null;

function loadPublicKey() {
  const envKey = process.env.OPS_LICENSE_PUBKEY;
  if (envKey) {
    try {
      return createPublicKey(envKey);
    } catch (e) {
      console.warn('[license] OPS_LICENSE_PUBKEY invalid:', e.message);
    }
  }
  // Embedded production key — mirror of desktop/license.js. No on-disk
  // fallback: the old scripts/license/dev-public.pem was retired in the
  // 2026-06-04 rotation and removed from the repo.
  try {
    return createPublicKey(EMBEDDED_PUBKEY_PEM);
  } catch (e) {
    console.warn('[license] embedded pubkey load failed:', e.message);
    return null;
  }
}

function licensePath() {
  if (process.env.OPS_LICENSE_FILE) return process.env.OPS_LICENSE_FILE;
  const dataDir = process.env.OPS_DATA_DIR || path.resolve(process.cwd(), 'server/data');
  return path.join(dataDir, 'license.json');
}

/**
 * Read + verify the license. Returns:
 *   { ok: true, license: {customer, tier, max_users, expires_at, features} }
 *   { ok: false, reason, detail? }
 *
 * Cached on first call; restart server to re-read.
 */
export function getLicense() {
  if (cachedLicense) return cachedLicense;
  const p = licensePath();

  if (!fs.existsSync(p)) {
    if (process.env.OPS_ALLOW_UNLICENSED === '1') {
      console.warn('[license] no license file at', p, '— tier S fallback (dev only)');
      cachedLicense = {
        ok: true,
        license: {
          customer: 'UNLICENSED',
          tier: 'S',
          max_users: TIER_LIMITS.S,
          expires_at: null,
          features: ['costing'],
          isUnlicensed: true,
        },
      };
      return cachedLicense;
    }
    cachedLicense = { ok: false, reason: 'missing' };
    return cachedLicense;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    cachedLicense = { ok: false, reason: 'parse-error', detail: e.message };
    return cachedLicense;
  }

  if (raw.isTrial && raw.version === 2) {
    // Trial: no signature, validate format + expiry only.
    const exp = new Date(raw.expires_at).getTime();
    if (!Number.isFinite(exp) || exp < Date.now()) {
      cachedLicense = { ok: false, reason: 'trial-expired' };
      return cachedLicense;
    }
    cachedLicense = {
      ok: true,
      license: {
        customer: 'TRIAL',
        tier: raw.tier || 'S',
        max_users: raw.max_users || TIER_LIMITS.S,
        expires_at: raw.expires_at,
        features: raw.features || [],
        isTrial: true,
      },
    };
    return cachedLicense;
  }

  if (raw.version !== 2 || !raw.signature) {
    cachedLicense = { ok: false, reason: 'unsupported-format' };
    return cachedLicense;
  }
  if (!TIER_LIMITS[raw.tier]) {
    cachedLicense = { ok: false, reason: 'bad-tier' };
    return cachedLicense;
  }
  if (raw.max_users !== TIER_LIMITS[raw.tier]) {
    cachedLicense = { ok: false, reason: 'tier-mismatch' };
    return cachedLicense;
  }

  const pub = loadPublicKey();
  if (!pub) {
    cachedLicense = { ok: false, reason: 'no-pubkey' };
    return cachedLicense;
  }
  let sigOk;
  try {
    const { signature, ...payload } = raw;
    sigOk = verify(null, Buffer.from(canonicalize(payload)), pub, Buffer.from(signature, 'base64'));
  } catch (e) {
    cachedLicense = { ok: false, reason: 'verify-error', detail: e.message };
    return cachedLicense;
  }
  if (!sigOk) {
    cachedLicense = { ok: false, reason: 'bad-signature' };
    return cachedLicense;
  }

  if (raw.expires_at) {
    const exp = new Date(raw.expires_at).getTime();
    if (Number.isFinite(exp) && exp < Date.now()) {
      cachedLicense = { ok: false, reason: 'expired', expires_at: raw.expires_at };
      return cachedLicense;
    }
  }

  cachedLicense = {
    ok: true,
    license: {
      customer: raw.customer,
      tier: raw.tier,
      max_users: raw.max_users,
      expires_at: raw.expires_at,
      features: raw.features || [],
    },
  };
  return cachedLicense;
}

/** Force re-read on next getLicense() call — for tests + `apply` flow. */
export function invalidateLicenseCache() {
  cachedLicense = null;
}

/**
 * Verify an in-memory license object (NOT from disk, NOT cached). Used by the
 * License Manager fleet upload flow to validate an operator-supplied signed
 * license BEFORE queuing it for distribution. Checks format + tier + Ed25519
 * signature against the embedded production pubkey + expiry. Does NOT bind to
 * this server's hardware (the license targets a DIFFERENT machine); the caller
 * is responsible for matching `installation_id` to the intended target.
 *
 * Trials are explicitly rejected — only real signed licenses are distributable.
 *
 * @returns {{ok:true, license:object} | {ok:false, reason:string, detail?:string}}
 */
export function verifyLicenseObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'malformed' };
  }
  if (raw.isTrial) return { ok: false, reason: 'trial-not-distributable' };
  if (raw.version !== 2 || !raw.signature) return { ok: false, reason: 'unsupported-format' };
  if (!TIER_LIMITS[raw.tier]) return { ok: false, reason: 'bad-tier' };
  if (raw.max_users !== TIER_LIMITS[raw.tier]) return { ok: false, reason: 'tier-mismatch' };
  if (!/^[0-9a-f]{64}$/i.test(String(raw.installation_id || ''))) {
    return { ok: false, reason: 'bad-installation-id' };
  }
  const pub = loadPublicKey();
  if (!pub) return { ok: false, reason: 'no-pubkey' };
  let sigOk;
  try {
    const { signature, ...payload } = raw;
    sigOk = verify(null, Buffer.from(canonicalize(payload)), pub, Buffer.from(signature, 'base64'));
  } catch (e) {
    return { ok: false, reason: 'verify-error', detail: e.message };
  }
  if (!sigOk) return { ok: false, reason: 'bad-signature' };
  if (raw.expires_at) {
    const exp = new Date(raw.expires_at).getTime();
    if (Number.isFinite(exp) && exp < Date.now()) {
      return { ok: false, reason: 'expired', detail: raw.expires_at };
    }
  }
  return {
    ok: true,
    license: {
      installation_id: raw.installation_id,
      customer: raw.customer,
      tier: raw.tier,
      max_users: raw.max_users,
      expires_at: raw.expires_at,
      features: raw.features || [],
    },
  };
}

/**
 * Express middleware: rejects user-creation requests when the customer
 * is at their tier seat limit. Plug into `POST /api/users` AFTER auth.
 *
 * Counts users excluding `deleted_at IS NOT NULL` (soft-deleted) and
 * `role === 'sys'` (sys recovery accounts don't count against the seat
 * cap — protects the recovery path from being blocked by license).
 */
export function requireSeatAvailable({ countActiveUsers }) {
  return (req, res, next) => {
    const lic = getLicense();
    if (!lic.ok) {
      return res.status(402).json({
        error: 'LICENSE_INVALID',
        reason: lic.reason,
        detail: lic.detail,
      });
    }
    const active = typeof countActiveUsers === 'function' ? Number(countActiveUsers()) : 0;
    if (active >= lic.license.max_users) {
      return res.status(402).json({
        error: 'LICENSE_LIMIT_EXCEEDED',
        tier: lic.license.tier,
        max_users: lic.license.max_users,
        active_users: active,
        message:
          `License tier ${lic.license.tier} cho phép tối đa ${lic.license.max_users} user. ` +
          `Hiện đã có ${active} user. Liên hệ CCL HQ để nâng cấp tier.`,
      });
    }
    next();
  };
}

export const TIERS = TIER_LIMITS;
