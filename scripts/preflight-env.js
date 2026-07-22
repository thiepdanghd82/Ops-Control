#!/usr/bin/env node
/**
 * preflight-env.js — CI / pre-deploy environment validation
 *
 * Run this BEFORE every prod deploy to catch missing secrets early.
 * Mirrors the checks in server/index.js's production-mode block so
 * the deploy pipeline fails at build-time rather than at container
 * boot (which, on a systemd unit, restarts forever and takes the
 * whole fleet down).
 *
 * Usage (in CI):
 *   NODE_ENV=production node scripts/preflight-env.js
 *
 * Exits 0 when safe to deploy, non-zero with a clear message otherwise.
 * Sprint 11 quick-win (P2-1 companion).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env first (non-fatal if missing — CI passes env vars directly).
// We intentionally don't import dotenv here to keep this script
// zero-dep: reading .env manually is 8 lines and avoids pulling in
// node_modules on a cold CI agent.
function loadEnvFile() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const txt = fs.readFileSync(envPath, 'utf-8');
  for (const line of txt.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    if (!(k in process.env)) {
      process.env[k] = trimmed.slice(eq + 1).replace(/^['"]|['"]$/g, '');
    }
  }
}

loadEnvFile();

const env = process.env.NODE_ENV || 'development';
const errors = [];

function check(name, condition, hint) {
  if (!condition) errors.push(`${name} — ${hint}`);
}

// ── Required in production ──────────────────────────────────────
if (env === 'production') {
  check(
    'OPS_TOTP_KEY',
    process.env.OPS_TOTP_KEY && process.env.OPS_TOTP_KEY.length === 64,
    'must be a 64-char hex string. Generate with: ' +
      `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))". ` +
      'LOSING THIS VALUE LOCKS ALL USERS OUT OF 2FA.'
  );

  // OPS_KIOSK_KEY requirement removed 2026-07-22 with the Kiosk PWA.

  // Sprint S-EXPORT-MVP-2 — HMAC key for quote xlsx export tamper
  // detection. Same shape + preservation semantics as OPS_TOTP_KEY +
  // OPS_KIOSK_KEY. Losing it doesn't break customer-facing exports
  // (visible sheets still open + read fine; _Audit + _Schema are
  // forensic-only) but any pre-loss export can no longer be HMAC-
  // verified, so the MVP-3 re-importer refuses them. Routine
  // compliance unaffected; fraud detection breaks.
  check(
    'OPS_EXPORT_HMAC_KEY',
    process.env.OPS_EXPORT_HMAC_KEY && /^[0-9a-fA-F]{64}$/.test(process.env.OPS_EXPORT_HMAC_KEY),
    'must be a 64-char hex string. Generate with: ' +
      `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))". ` +
      'LOSING THIS VALUE INVALIDATES TAMPER-DETECTION ON ALL PRE-LOSS QUOTE EXPORTS.'
  );

  // Sprint S-D21-LICENSE-FIX 2026-06-09 — Ed25519 SPKI PEM bake or env-inject.
  // Without it licenseService rejects all validation; server boots but operators
  // see LICENSE_INVALID on every request. Preflight-gate so missing key fails
  // boot loudly instead of silent runtime lockout. SPKI PEM shape check
  // (-----BEGIN PUBLIC KEY-----...-----END PUBLIC KEY-----) — strict enough
  // to catch typos / truncation, permissive enough to accept any valid Ed25519
  // public key.
  check(
    'OPS_LICENSE_PUBKEY',
    process.env.OPS_LICENSE_PUBKEY &&
      process.env.OPS_LICENSE_PUBKEY.includes('BEGIN PUBLIC KEY') &&
      process.env.OPS_LICENSE_PUBKEY.includes('END PUBLIC KEY'),
    'must be a valid SPKI PEM block ' +
      '(-----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----). ' +
      'Source: prod-public.pem from offline license keypair. ' +
      'LOSING THIS VALUE LOCKS OUT ALL USERS — every license validation fails.'
  );

  const corsSet = (process.env.OPS_CORS_ORIGINS || '').trim();
  check(
    'OPS_CORS_ORIGINS',
    corsSet || process.env.OPS_ALLOW_SAME_ORIGIN === '1',
    'set to comma-separated origins, OR set OPS_ALLOW_SAME_ORIGIN=1 if client + API are same-origin.'
  );

  check(
    'PORT / OPS_PORT',
    Number(process.env.OPS_PORT || process.env.PORT || 3000) > 0,
    'must be a valid TCP port.'
  );
}

// ── Optional but recommended ────────────────────────────────────
if (env === 'production' && !process.env.OPS_DB_PATH) {
  console.warn(
    '  ⚠  OPS_DB_PATH not set — defaulting to server/data/ops.db. ' +
      'Point this at a persistent volume for prod.'
  );
}

// ── Report ──────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`\n❌  preflight-env failed (NODE_ENV=${env}):\n`);
  for (const e of errors) console.error(`    • ${e}`);
  console.error('\n    See .env.example for the full required-var list.\n');
  process.exit(1);
}

console.log(`✅  preflight-env passed (NODE_ENV=${env})`);
