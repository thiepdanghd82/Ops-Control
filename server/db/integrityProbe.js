// @ts-check
/**
 * SQLite integrity probe — Phase 3 M-5a (Track B) of Debug Playbook
 * (2026-06-20). Closes Enterprise Re-evaluation M-5 finding:
 * bit-rot / WAL corruption / partial write detection at boot.
 *
 * SQLite's PRAGMA integrity_check walks all pages, validates indices,
 * checks foreign-key references, and reports any structural damage.
 * Returns the string "ok" on a healthy DB, or a list of error strings
 * on corruption. Runs in O(N) of total pages (~30 MB DB → < 1s).
 *
 * Wired into server/index.js boot probe (after TOTP probe, before
 * middleware setup). On failure: BLOCK boot + log alert + point to
 * recovery runbook. Opt-out via OPS_SKIP_INTEGRITY_PROBE=1 (emergency
 * override — same pattern as OPS_SKIP_NATIVE_OVERLAY_CHECK).
 *
 * Rationale (per Re-evaluation R-4 + M-5):
 *   Backup retention is 30 days. Silent corruption sau 8 năm = no clean
 *   restore source. Detecting at boot every restart = max 1-day window
 *   between corruption + alarm (assuming nightly restart cycle). On
 *   24/7 production, schedule periodic re-check (M-5b cron).
 */

import { getDb, getDbPath } from './connection.js';
import fs from 'node:fs';

/**
 * Run PRAGMA integrity_check and return structured result.
 *
 * @returns {{ ok: boolean, dbPath: string, dbExists: boolean, errors: string[], elapsedMs: number, skipped?: boolean }}
 */
export function verifyDbIntegrity() {
  const dbPath = getDbPath();
  const dbExists = !!dbPath && fs.existsSync(dbPath);

  if (process.env.OPS_SKIP_INTEGRITY_PROBE === '1') {
    return { ok: true, dbPath, dbExists, errors: [], elapsedMs: 0, skipped: true };
  }

  // No DB file yet — first-boot scenario. Return ok (probe is meant
  // to catch corruption of EXISTING data, not absence of data).
  if (!dbExists) {
    return { ok: true, dbPath, dbExists: false, errors: [], elapsedMs: 0 };
  }

  const t0 = Date.now();
  let rows;
  try {
    const db = getDb();
    // PRAGMA integrity_check returns rows of { integrity_check: <string> }.
    // Single "ok" row on healthy; list of error strings on corrupt.
    rows = db.prepare('PRAGMA integrity_check').all();
  } catch (e) {
    return {
      ok: false,
      dbPath,
      dbExists: true,
      errors: [`PRAGMA integrity_check threw: ${e instanceof Error ? e.message : String(e)}`],
      elapsedMs: Date.now() - t0,
    };
  }

  const elapsedMs = Date.now() - t0;
  // Normalise: each row is { integrity_check: 'ok' } OR a real error
  // string. We surface anything that isn't exactly 'ok' as an error.
  const errors = rows
    .map((r) => (r && typeof r.integrity_check === 'string' ? r.integrity_check : String(r)))
    .filter((s) => s !== 'ok');

  return { ok: errors.length === 0, dbPath, dbExists: true, errors, elapsedMs };
}

/**
 * Boot-time helper: run verifyDbIntegrity and either log success or
 * print a structured alert pointing at the recovery runbook. Returns
 * the result so the caller (server/index.js boot block) can decide
 * whether to abort startup.
 *
 * Print format matches the TOTP boot probe convention (✅/🚨/⚠️).
 */
export function logBootIntegrityProbe() {
  const result = verifyDbIntegrity();
  if (result.skipped) {
    console.warn(
      '  ⚠️   DB integrity probe SKIPPED via OPS_SKIP_INTEGRITY_PROBE=1 — emergency override.'
    );
    return result;
  }
  if (!result.dbExists) {
    console.log(`  📂  DB integrity probe — no DB file yet at ${result.dbPath} (first boot OK)`);
    return result;
  }
  if (result.ok) {
    console.log(`  🗄️   DB integrity probe OK — ${result.dbPath} (${result.elapsedMs}ms)`);
    return result;
  }
  // FAIL
  console.error('  🚨  DB INTEGRITY PROBE FAILED — corruption detected. BLOCKING boot.');
  console.error(`       File:    ${result.dbPath}`);
  console.error(`       Elapsed: ${result.elapsedMs}ms`);
  console.error('       Errors (first 5):');
  for (const e of result.errors.slice(0, 5)) console.error(`         - ${e}`);
  console.error('');
  console.error('       Recovery (per docs/retention/RETENTION_20Y_STRATEGY.md + CLAUDE.md');
  console.error('       "All data gone after a restore" playbook):');
  console.error('       1. STOP — do NOT continue boot, do NOT take a new backup');
  console.error('          (would propagate corruption to off-site rsync)');
  console.error('       2. Capture ops.db to forensic copy:');
  console.error('          cp ' + result.dbPath + ' ' + result.dbPath + '.corrupted-$(date +%s)');
  console.error('       3. Restore from last good nightly backup');
  console.error('       4. Run probe on restored DB to confirm clean');
  console.error('       5. Emergency boot allowed via OPS_SKIP_INTEGRITY_PROBE=1');
  console.error('          (only if you accept reading from corrupted DB)');
  return result;
}
