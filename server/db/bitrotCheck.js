// @ts-check
/**
 * Bit-rot detection — Phase 3 M-5b (Track B) of Debug Playbook
 * (2026-06-20). Complements M-5a boot probe with a periodic
 * row-level integrity check that catches corruption SQLite's
 * structural integrity_check misses: silent data-bit flips inside
 * row contents (which still parse as valid JSON / valid SQLite row
 * structurally but produce different sha256 than save-time).
 *
 * Algorithm (per Re-evaluation R6 control + retention strategy doc):
 *   1. For each quote row older than 30 days (i.e. older than the
 *      backup retention window):
 *      - Compute sha256(raw_json)
 *   2. Compare each row's sha256 against the stored manifest at
 *      <DATA_DIR>/Library/bitrot-manifest.json
 *   3. On first run: write manifest = baseline; subsequent runs
 *      detect drift (a row that hashed differently than before)
 *   4. Result: { ok, total, checked, drift: [{quoteId, expectedSha,
 *      actualSha, savedAt}], firstRun, missingRows }
 *
 * Why 30-day age cutoff:
 *   Rows newer than 30 days are still within backup retention; if
 *   corrupted you can restore. Rows OLDER than 30 days are the bit-rot
 *   risk surface — corruption sau D+30 = no clean source.
 *
 * Wire as monthly cron (per Re-evaluation R6):
 *   0 3 1 * * cd /opt/ops-control && node scripts/bitrot-check.mjs --json \\
 *     | jq -e '.ok' > /dev/null || alert "bit-rot detected on $(hostname)"
 *
 * First-run UX:
 *   No manifest yet → write baseline + log "BASELINE WRITTEN, N rows
 *   tracked from <date>". Operator does NOT need to do anything;
 *   subsequent runs auto-detect drift against this baseline.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve as pathResolve } from 'node:path';

import { getDb, getDbPath } from './connection.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the canonical sha256 for a quote row. Uses raw_json which
 * is the on-save persisted shape (NOT a re-serialized view) so a
 * harmless format change in app code doesn't invalidate baselines.
 *
 * @param {string} rawJson
 * @returns {string}
 */
export function hashRow(rawJson) {
  return createHash('sha256').update(rawJson).digest('hex');
}

/**
 * Resolve manifest path. Defaults to sibling of ops.db at
 * <DATA_DIR>/Library/bitrot-manifest.json. Override via
 * OPS_BITROT_MANIFEST env var.
 *
 * @returns {string}
 */
export function getManifestPath() {
  if (process.env.OPS_BITROT_MANIFEST) {
    return pathResolve(process.env.OPS_BITROT_MANIFEST);
  }
  const dbPath = getDbPath();
  const dataDir = dirname(dbPath);
  return join(dataDir, 'Library', 'bitrot-manifest.json');
}

/**
 * Load existing manifest OR return null when first-run.
 *
 * @returns {{ created_at: string, last_run_at: string, rows: Record<string, { sha256: string, saved_at: string }> } | null}
 */
function loadManifest() {
  const path = getManifestPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    // Corrupted manifest itself — treat as missing so caller can
    // re-baseline; alert separately.
    return null;
  }
}

function writeManifest(manifest) {
  const path = getManifestPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Walk quote rows older than `ageDays` (default 30). Returns the row
 * subset eligible for bit-rot tracking.
 *
 * @param {number} ageDays
 * @returns {Array<{ id: number, saved_at: string, raw_json: string }>}
 */
function collectOldRows(ageDays = 30) {
  const cutoff = new Date(Date.now() - ageDays * MS_PER_DAY).toISOString();
  const db = getDb();
  return db
    .prepare(
      'SELECT id, saved_at, raw_json FROM quotes WHERE saved_at IS NOT NULL AND saved_at < ? ORDER BY id'
    )
    .all(cutoff);
}

/**
 * Run the check. Returns structured result + WRITES manifest on first
 * run OR updates last_run_at on subsequent runs. NEVER overwrites
 * existing per-row baselines (that would mask drift).
 *
 * @param {{ ageDays?: number }} [opts]
 * @returns {{
 *   ok: boolean,
 *   firstRun: boolean,
 *   total: number,
 *   checked: number,
 *   drift: Array<{ quoteId: number, savedAt: string, expectedSha: string, actualSha: string }>,
 *   missingFromManifest: Array<{ quoteId: number, savedAt: string, sha: string }>,
 *   manifestPath: string
 * }}
 */
export function runBitrotCheck(opts = {}) {
  const ageDays = opts.ageDays ?? 30;
  const manifestPath = getManifestPath();
  const oldRows = collectOldRows(ageDays);

  const existing = loadManifest();

  if (!existing) {
    // First-run: write baseline manifest, no drift to report
    const now = new Date().toISOString();
    const rows = {};
    for (const r of oldRows) {
      rows[String(r.id)] = { sha256: hashRow(r.raw_json), saved_at: r.saved_at };
    }
    writeManifest({ created_at: now, last_run_at: now, rows });
    return {
      ok: true,
      firstRun: true,
      total: oldRows.length,
      checked: oldRows.length,
      drift: [],
      missingFromManifest: [],
      manifestPath,
    };
  }

  // Subsequent run: compare each row's current hash vs baseline
  const drift = [];
  const missingFromManifest = [];
  let checked = 0;
  const newRowsToAddToManifest = {};
  for (const r of oldRows) {
    const actualSha = hashRow(r.raw_json);
    const baseline = existing.rows[String(r.id)];
    if (!baseline) {
      // Row exists in DB but not in manifest — could be a new quote
      // that just crossed the 30-day age threshold. Add to manifest
      // so next run treats this as baseline.
      newRowsToAddToManifest[String(r.id)] = { sha256: actualSha, saved_at: r.saved_at };
      missingFromManifest.push({ quoteId: r.id, savedAt: r.saved_at, sha: actualSha });
      continue;
    }
    checked++;
    if (baseline.sha256 !== actualSha) {
      drift.push({
        quoteId: r.id,
        savedAt: r.saved_at,
        expectedSha: baseline.sha256,
        actualSha,
      });
    }
  }

  // Update last_run_at + augment manifest with newly-aged rows (only).
  // Existing row baselines NEVER mutated — drift is the alarm signal.
  const updated = {
    ...existing,
    last_run_at: new Date().toISOString(),
    rows: { ...existing.rows, ...newRowsToAddToManifest },
  };
  writeManifest(updated);

  return {
    ok: drift.length === 0,
    firstRun: false,
    total: oldRows.length,
    checked,
    drift,
    missingFromManifest,
    manifestPath,
  };
}
