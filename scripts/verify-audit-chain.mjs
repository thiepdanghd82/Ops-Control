#!/usr/bin/env node
/**
 * Verify the hash chain integrity of audit_log.json.
 *
 * Phase 2.2 of Debug Playbook (2026-06-20). CLI wrapper around
 * server/services/auditChain.js verifyChain. Reads audit_log.json
 * from --path arg OR defaults to
 *   <DATA_DIR>/Library/Users/audit_log.json
 *
 * Exit codes:
 *   0 — chain intact (or legacy log with no CHAIN_INIT yet)
 *   1 — chain broken (tampering / insertion / deletion / reorder)
 *   2 — file unreadable or malformed JSON
 *
 * Usage:
 *   node scripts/verify-audit-chain.mjs
 *   node scripts/verify-audit-chain.mjs --path /tmp/audit_log.json
 *   node scripts/verify-audit-chain.mjs --json   # machine-readable
 *
 * Wire into:
 *   - Nightly cron: `0 2 * * * node /opt/ops-control/scripts/verify-audit-chain.mjs || alert`
 *   - Server startup probe (optional — adds ~50ms to boot for 10k entries)
 *   - Pre-rotate-keys gate (run before TOTP/HMAC key rotation to capture
 *     a verified chain snapshot in case rotation needs forensic review)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const { verifyChain } = await import(resolve(ROOT, 'server/services/auditChain.js'));

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const pathIdx = args.indexOf('--path');
const pathArg = pathIdx >= 0 ? args[pathIdx + 1] : null;

const dataDir = process.env.DATA_DIR || join(ROOT, 'server', 'data');
const auditPath = pathArg || join(dataDir, 'Library', 'Users', 'audit_log.json');

let raw;
try {
  raw = readFileSync(auditPath, 'utf8');
} catch (e) {
  const out = { ok: false, error: 'unreadable', path: auditPath, message: e.message };
  console.error(
    jsonOut ? JSON.stringify(out) : `[verify-audit-chain] cannot read ${auditPath}: ${e.message}`
  );
  process.exit(2);
}

let rows;
try {
  rows = JSON.parse(raw);
} catch (e) {
  const out = { ok: false, error: 'malformed', path: auditPath, message: e.message };
  console.error(
    jsonOut ? JSON.stringify(out) : `[verify-audit-chain] malformed JSON: ${e.message}`
  );
  process.exit(2);
}

if (!Array.isArray(rows)) {
  const out = { ok: false, error: 'shape', path: auditPath, message: 'rows must be an array' };
  console.error(
    jsonOut ? JSON.stringify(out) : `[verify-audit-chain] expected array, got ${typeof rows}`
  );
  process.exit(2);
}

const result = verifyChain(rows);

if (jsonOut) {
  console.log(JSON.stringify({ ...result, path: auditPath, totalRows: rows.length }));
} else if (result.ok) {
  if (result.chainStart === -1) {
    console.log(
      `[verify-audit-chain] OK — ${rows.length} pre-chain rows, no CHAIN_INIT yet (legacy log)`
    );
    console.log(`  ${result.message || ''}`);
  } else {
    console.log(
      `[verify-audit-chain] OK — ${rows.length} total rows, ${result.chainLength} chained from index ${result.chainStart}`
    );
  }
} else {
  console.error(`[verify-audit-chain] FAIL — chain broken at index ${result.breakIndex}`);
  console.error(`  ${result.message}`);
  if (result.chainStart >= 0) {
    console.error(
      `  Chain genesis was at index ${result.chainStart}, ${result.chainLength} entries verified before break`
    );
  }
}

process.exit(result.ok ? 0 : 1);
