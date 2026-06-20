#!/usr/bin/env node
/**
 * CLI wrapper around server/db/bitrotCheck.js — Phase 3 M-5b
 * (Track B) of Debug Playbook (2026-06-20). Closes retention R6
 * control (bit-rot detection on rows older than backup retention).
 *
 * Wire as monthly cron (per RETENTION_20Y_STRATEGY.md):
 *
 *   # Linux crontab:
 *   0 3 1 * * cd /opt/ops-control && node scripts/bitrot-check.mjs --json \\
 *     | jq -e '.ok' > /dev/null \\
 *     || /usr/local/bin/alert "bit-rot detected on $(hostname)"
 *
 *   # Windows NSSM equivalent: Task Scheduler monthly trigger
 *   # running PowerShell wrapper that runs node + checks exit code.
 *
 * Exit codes:
 *   0 = clean OR first-run baseline written
 *   1 = drift detected (alert)
 *   2 = infra error (DB unreachable, manifest unwritable)
 *
 * Usage:
 *   node scripts/bitrot-check.mjs              # human-readable
 *   node scripts/bitrot-check.mjs --json       # machine-readable
 *   node scripts/bitrot-check.mjs --age 90     # check rows > 90d (default 30)
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const ageIdx = args.indexOf('--age');
const ageDays = ageIdx >= 0 ? Number(args[ageIdx + 1]) || 30 : 30;

let runBitrotCheck;
try {
  ({ runBitrotCheck } = await import(resolve(ROOT, 'server/db/bitrotCheck.js')));
} catch (e) {
  const msg = `[bitrot-check] cannot load bitrotCheck module: ${e.message}`;
  console.error(jsonOut ? JSON.stringify({ ok: false, error: 'module-load', message: msg }) : msg);
  process.exit(2);
}

let result;
try {
  result = runBitrotCheck({ ageDays });
} catch (e) {
  const msg = `[bitrot-check] runBitrotCheck threw: ${e.message}`;
  console.error(jsonOut ? JSON.stringify({ ok: false, error: 'runtime', message: msg }) : msg);
  process.exit(2);
}

if (jsonOut) {
  console.log(JSON.stringify(result));
} else if (result.firstRun) {
  console.log(
    `[bitrot-check] BASELINE WRITTEN — ${result.total} rows tracked at ${result.manifestPath}`
  );
} else if (result.ok) {
  console.log(
    `[bitrot-check] OK — ${result.checked}/${result.total} rows verified, ${result.missingFromManifest.length} newly aged into baseline`
  );
} else {
  console.error(
    `[bitrot-check] DRIFT DETECTED — ${result.drift.length} row(s) changed since baseline:`
  );
  for (const d of result.drift.slice(0, 10)) {
    console.error(
      `  - quote_id=${d.quoteId} saved_at=${d.savedAt} expected=${d.expectedSha.slice(0, 12)}… actual=${d.actualSha.slice(0, 12)}…`
    );
  }
  if (result.drift.length > 10) {
    console.error(`  ...and ${result.drift.length - 10} more (see --json for full list)`);
  }
  console.error('');
  console.error('Recovery (per docs/retention/RETENTION_20Y_STRATEGY.md):');
  console.error('  1. STOP — do NOT take fresh backup (would propagate drift)');
  console.error('  2. Inspect drift row IDs above + cross-reference application logs');
  console.error('  3. Restore affected rows from last good backup (per quote_id)');
  console.error('  4. Re-run bitrot-check after restore — must report OK');
  console.error('  5. If recurring: investigate storage hardware (RAID scrub, SMART check)');
}

process.exit(result.ok ? 0 : 1);
