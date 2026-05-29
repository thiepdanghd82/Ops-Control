/**
 * auditRetention.js — daily rotation for audit_log.json (v1.3 P0).
 *
 * Why: audit_log.json grows forever (every login, save, approval, group
 * change appended). At 200 events/day × 1 year = 73K rows. JSON file
 * load + write becomes slow when > 50 MB. Disk fills silently.
 *
 * Strategy:
 *   1. Daily at 03:00 (1h after backup): scan audit_log.json
 *   2. Move events older than RETENTION_DAYS (default 30) to archive
 *      file `audit_log_archive/audit_YYYYMM.json.gz` (per month)
 *   3. Keep active log small + fast
 *   4. Delete archive files older than ARCHIVE_RETENTION_MONTHS (12)
 *
 * Active log: server/data/Library/Users/audit_log.json
 * Archive:    server/data/Library/Users/audit_log_archive/audit_YYYYMM.json.gz
 *
 * Activation: set OPS_AUDIT_RETENTION=1 (default OFF for dev).
 *
 * Observability: stats logged every cycle (rotated count, archive size).
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { atomicWriteFileSync } from './atomicWrite.js';

const RETENTION_DAYS = Number(process.env.OPS_AUDIT_RETENTION_DAYS) || 30;
const ARCHIVE_MONTHS = Number(process.env.OPS_AUDIT_ARCHIVE_MONTHS) || 12;

let _timer = null;
let _lastRun = null;

function auditPath() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'server', 'data');
  return path.join(dataDir, 'Library', 'Users', 'audit_log.json');
}

function archiveDir() {
  return path.join(path.dirname(auditPath()), 'audit_log_archive');
}

/** Read audit log array. Returns [] if missing/corrupt. */
function readAudit() {
  const p = auditPath();
  if (!fs.existsSync(p)) return [];
  try {
    const txt = fs.readFileSync(p, 'utf8');
    if (!txt.trim()) return [];
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : arr.events || arr.entries || [];
  } catch (err) {
    console.warn('[audit-retention] read failed:', err.message);
    return [];
  }
}

/** Group events by YYYY-MM month (string). */
function groupByMonth(events) {
  const groups = {};
  for (const ev of events) {
    const ts = ev.ts || ev.timestamp || ev.t || ev.at;
    if (!ts) continue;
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    (groups[key] = groups[key] || []).push(ev);
  }
  return groups;
}

/**
 * Append events to monthly archive file (gzipped JSON array). Merges
 * with existing entries — read, extend, rewrite — atomic via tmpfile.
 */
function appendToArchive(monthKey, newEvents) {
  fs.mkdirSync(archiveDir(), { recursive: true });
  const file = path.join(archiveDir(), `audit_${monthKey}.json.gz`);

  let existing = [];
  if (fs.existsSync(file)) {
    try {
      const buf = fs.readFileSync(file);
      const json = zlib.gunzipSync(buf).toString('utf8');
      existing = JSON.parse(json);
      if (!Array.isArray(existing)) existing = [];
    } catch (err) {
      console.warn(`[audit-retention] archive ${monthKey} corrupt — overwriting:`, err.message);
      existing = [];
    }
  }

  const merged = [...existing, ...newEvents];
  const buf = zlib.gzipSync(JSON.stringify(merged), { level: 9 });
  fs.writeFileSync(file, buf);
  return { file, totalEvents: merged.length, sizeBytes: buf.length };
}

/** Prune archive files older than ARCHIVE_MONTHS. */
function pruneOldArchives() {
  const dir = archiveDir();
  if (!fs.existsSync(dir)) return { pruned: 0 };
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - ARCHIVE_MONTHS);
  const cutoffKey = `${cutoff.getFullYear()}${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
  let pruned = 0;
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^audit_(\d{6})\.json\.gz$/);
    if (!m) continue;
    if (m[1] < cutoffKey) {
      try {
        fs.unlinkSync(path.join(dir, f));
        pruned++;
      } catch (_) {
        /* swallow */
      }
    }
  }
  return { pruned };
}

/**
 * Execute one rotation cycle.
 * Returns summary: { rotated, kept, archives, pruned, durationMs }
 */
export function runRotationCycle() {
  const start = Date.now();
  const cutoffMs = Date.now() - RETENTION_DAYS * 86400_000;
  const all = readAudit();
  if (all.length === 0) {
    return {
      ok: true,
      rotated: 0,
      kept: 0,
      archives: 0,
      pruned: 0,
      durationMs: Date.now() - start,
    };
  }

  const oldEvents = [];
  const keepEvents = [];
  for (const ev of all) {
    const ts = ev.ts || ev.timestamp || ev.t || ev.at;
    const tsMs = ts ? new Date(ts).getTime() : null;
    if (tsMs != null && tsMs < cutoffMs) {
      oldEvents.push(ev);
    } else {
      keepEvents.push(ev);
    }
  }

  if (oldEvents.length === 0) {
    return {
      ok: true,
      rotated: 0,
      kept: keepEvents.length,
      archives: 0,
      pruned: 0,
      durationMs: Date.now() - start,
    };
  }

  // Group + write to per-month archives
  const grouped = groupByMonth(oldEvents);
  const archives = [];
  for (const [monthKey, events] of Object.entries(grouped)) {
    try {
      const r = appendToArchive(monthKey, events);
      archives.push({ monthKey, ...r });
    } catch (err) {
      console.warn(`[audit-retention] archive ${monthKey} failed:`, err.message);
    }
  }

  // Rewrite active log with kept events only
  atomicWriteFileSync(auditPath(), JSON.stringify(keepEvents, null, 2), 'utf8');

  const pruneResult = pruneOldArchives();

  const summary = {
    ok: true,
    rotated: oldEvents.length,
    kept: keepEvents.length,
    archives: archives.length,
    archiveDetails: archives,
    pruned: pruneResult.pruned,
    durationMs: Date.now() - start,
    runAt: new Date().toISOString(),
  };
  _lastRun = summary;
  console.log(
    `[audit-retention] rotated ${summary.rotated} events → ${summary.archives} archives, kept ${summary.kept}, pruned ${summary.pruned} old archives in ${summary.durationMs}ms`
  );
  return summary;
}

function msUntilHour(hour = 3) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

export function startAuditRetention() {
  if (_timer) return { already: true };
  if (process.env.OPS_AUDIT_RETENTION !== '1') {
    console.log('[audit-retention] disabled (set OPS_AUDIT_RETENTION=1 to enable)');
    return { skipped: true };
  }
  const hour = Number(process.env.OPS_AUDIT_HOUR) || 3;
  const tick = () => {
    try {
      runRotationCycle();
    } catch (err) {
      console.error('[audit-retention] cycle err:', err);
    }
    _timer = setTimeout(tick, 24 * 60 * 60 * 1000);
  };
  const ms = msUntilHour(hour);
  _timer = setTimeout(tick, ms);
  console.log(
    `[audit-retention] scheduler armed — next run in ${(ms / 1000 / 60).toFixed(0)} minutes (target ${hour}:00)`
  );
  return { ok: true, nextRunMs: ms };
}

export function stopAuditRetention() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

export function getStatus() {
  return {
    enabled: process.env.OPS_AUDIT_RETENTION === '1',
    retentionDays: RETENTION_DAYS,
    archiveMonths: ARCHIVE_MONTHS,
    running: _timer != null,
    lastRun: _lastRun,
  };
}
