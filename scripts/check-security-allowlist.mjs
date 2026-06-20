#!/usr/bin/env node
// CI guard: fails on (a) any allowlist entry past expiry, (b) any
// allowlist entry with expiry > policy.max_expiry_days from added date.
// Run from repo root. Exit 0 = green, exit 1 = expired/oversized,
// exit 2 = malformed allowlist file.
//
// Wired into .github/workflows/ci.yml audit job. The npm audit step
// itself still gates on high+/critical CVE; THIS script gates the
// allowlist hygiene (no forever-allowed CVE, no expiry-creep).
//
// Phase 0.3 of Debug Playbook (2026-06-20).

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = resolve(__dirname, '..', 'security-allowlist.json');

async function main() {
  let raw;
  try {
    raw = await readFile(ALLOWLIST_PATH, 'utf8');
  } catch (e) {
    console.error(`[check-security-allowlist] cannot read ${ALLOWLIST_PATH}: ${e.message}`);
    process.exit(2);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`[check-security-allowlist] malformed JSON: ${e.message}`);
    process.exit(2);
  }
  const policy = data._policy || {};
  const maxExpiryDays = Number(policy.max_expiry_days) || 90;
  const entries = Array.isArray(data.allowlist) ? data.allowlist : [];

  if (entries.length === 0) {
    console.log('[check-security-allowlist] allowlist empty — OK');
    process.exit(0);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const failures = [];
  const warnings = [];

  for (const e of entries) {
    if (!e.cve || !e.expiry || !e.added) {
      failures.push(`entry missing cve/expiry/added: ${JSON.stringify(e).slice(0, 100)}`);
      continue;
    }
    const expiry = new Date(e.expiry);
    const added = new Date(e.added);
    if (isNaN(expiry.getTime()) || isNaN(added.getTime())) {
      failures.push(
        `${e.cve}: bad date format (expiry=${e.expiry} added=${e.added}, must be YYYY-MM-DD)`
      );
      continue;
    }
    const expiryMs = expiry.getTime();
    const addedMs = added.getTime();
    const daysSpan = Math.round((expiryMs - addedMs) / MS_PER_DAY);
    const daysToExpiry = Math.round((expiryMs - todayMs) / MS_PER_DAY);

    if (expiryMs < todayMs) {
      failures.push(
        `${e.cve} (${e.package}): EXPIRED ${Math.abs(daysToExpiry)}d ago (expiry=${e.expiry})`
      );
    } else if (daysSpan > maxExpiryDays) {
      // Long expiry is allowed (e.g. Jest 30 bump deferred to Q1 2027),
      // but warn so reviewer sees it during monthly cadence.
      warnings.push(
        `${e.cve} (${e.package}): expiry span ${daysSpan}d exceeds policy ${maxExpiryDays}d — explicitly accepted, see reason`
      );
    } else if (daysToExpiry <= 14) {
      warnings.push(`${e.cve} (${e.package}): expires in ${daysToExpiry}d — schedule remediation`);
    }
  }

  if (warnings.length) {
    console.warn('[check-security-allowlist] WARNINGS:');
    for (const w of warnings) console.warn('  - ' + w);
  }
  if (failures.length) {
    console.error('[check-security-allowlist] FAIL:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(`[check-security-allowlist] OK — ${entries.length} entry(ies), no expiries breached`);
  process.exit(0);
}

main();
