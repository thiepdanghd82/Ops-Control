/**
 * backupScheduler.js — In-process daily backup cron (v1.3 P0).
 *
 * IBM 3-2-1 backup rule: 3 copies, 2 media, 1 off-site.
 * This module covers the LOCAL portion (3 copies on local disk).
 * Off-site rsync is a separate cron job (scripts/backup-offsite.sh).
 *
 * Activation: set OPS_BACKUP_SCHEDULE=1 (default OFF for dev).
 *
 * Schedule: daily at OPS_BACKUP_HOUR (default 02:00) + on-demand via
 * /api/admin/backup/run.
 *
 * What it backs up:
 *   1. ops.db → server/data/Backup/SQLite/ops_YYYYMMDD_HHMMSS.sqlite
 *      (uses better-sqlite3's online db.backup() — no lock on live DB)
 *   2. Library/* → server/data/Backup/Library/library_YYYYMMDD.tar.gz
 *      (gzipped tarball of entire Library folder — atomic snapshot)
 *
 * Self-verification after each backup:
 *   - Open the .sqlite, run PRAGMA integrity_check; fail → alert
 *   - Count rows in critical tables (quotes, materials, ifs_inventory)
 *   - Compare row counts vs live DB; >10% drop → flag suspicious
 *
 * Retention: prune backups older than OPS_BACKUP_RETENTION_DAYS (30d).
 *
 * Failure handling: log error to audit + emit to OPS_BACKUP_WEBHOOK
 * (Slack/Teams) if configured.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { backupOpsDb } from '../db/backup.js';
import { getDb, getDbPath } from '../db/connection.js';
// Sprint 1.7 — wire pruning + audit-always so a missing webhook can't
// silently swallow backup failures, and so the local backup directory
// doesn't grow without bound.
import { pruneOldBackups, getRetentionSettings, getBackupRoot } from '../utils/backupPath.js';
import { audit } from './authService.js';

let _timer = null;
let _lastRun = null;
let _lastError = null;

// Sprint 1.7b — admin-editable schedule, persisted to a JSON config file
// so changes via Settings → Backup survive process restart. Read on
// startup; env vars are the fallback for first boot / fresh installs.
function configPath() {
  const dataRoot = path.dirname(getDbPath());
  return path.join(dataRoot, 'Library', 'SystemConfig', 'backup-schedule.json');
}

function readPersistedConfig() {
  try {
    const txt = fs.readFileSync(configPath(), 'utf-8');
    const j = JSON.parse(txt);
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

function writePersistedConfig(cfg) {
  const p = configPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, p);
}

function effectiveSettings() {
  const persisted = readPersistedConfig() || {};
  // env fallback when persisted file is absent
  const enabled =
    persisted.enabled != null
      ? persisted.enabled === true
      : process.env.OPS_BACKUP_SCHEDULE === '1';
  const hour =
    persisted.hour != null
      ? Math.max(0, Math.min(23, parseInt(persisted.hour, 10) || 2))
      : parseInt(process.env.OPS_BACKUP_HOUR, 10) || 2;
  const retentionDays =
    persisted.retentionDays != null
      ? Math.max(1, parseInt(persisted.retentionDays, 10) || 30)
      : parseInt(process.env.OPS_BACKUP_RETENTION_DAYS, 10) || 30;
  return { enabled, hour, retentionDays };
}

/**
 * Compute milliseconds until next 02:00 (or whatever hour is configured).
 */
function msUntilNext(hour = 2) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

function backupDir() {
  const dataRoot = path.dirname(getDbPath());
  return path.join(dataRoot, 'Backup');
}

/**
 * Create gzipped tarball of Library/* using system tar (cross-platform
 * via Node's built-in spawn). Works on macOS + Windows (with bundled tar).
 */
function tarLibrary() {
  const dataRoot = path.dirname(getDbPath());
  const libDir = path.join(dataRoot, 'Library');
  if (!fs.existsSync(libDir)) return { ok: false, error: 'Library not found' };

  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.join(backupDir(), 'Library');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `library_${ts}.tar.gz`);

  try {
    // Skip if today's tarball exists
    if (fs.existsSync(outFile)) {
      return { ok: true, skipped: true, file: outFile };
    }
    // Skip Users folder TOTP secrets aren't useful in backup context
    // (encrypted with same key — restore won't break, but document why)
    execSync(`tar czf "${outFile}" -C "${dataRoot}" Library`, {
      stdio: 'pipe',
      timeout: 60_000,
    });
    const size = fs.statSync(outFile).size;
    return { ok: true, file: outFile, sizeBytes: size, sizeMB: +(size / 1024 / 1024).toFixed(2) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Verify a SQLite backup by opening it + integrity check + row counts.
 * Returns row counts for critical tables so caller can alert on suspicious drop.
 */
async function verifyBackup(backupPath) {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(backupPath, { readonly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check;').get();
    if (integrity?.integrity_check !== 'ok') {
      return { ok: false, error: `integrity_check: ${integrity?.integrity_check || 'unknown'}` };
    }
    const tables = ['quotes', 'materials', 'ifs_inventory', 'rfq_tracker', 'sample_tracker'];
    const counts = {};
    for (const t of tables) {
      try {
        counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
      } catch (_) {
        counts[t] = null; // table might not exist in older backups
      }
    }
    return { ok: true, integrity: 'ok', counts };
  } finally {
    db.close();
  }
}

/**
 * Compare backup row counts vs live DB. Return suspicious drops (>10%).
 */
function compareToLive(backupCounts) {
  const live = getDb();
  const drops = {};
  for (const [table, backupCount] of Object.entries(backupCounts)) {
    if (backupCount == null) continue;
    try {
      const liveCount = live.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      const drop = liveCount - backupCount;
      if (liveCount > 0 && drop / liveCount > 0.1) {
        drops[table] = {
          backup: backupCount,
          live: liveCount,
          dropPct: +((drop * 100) / liveCount).toFixed(1),
        };
      }
    } catch (_) {
      /* ignore */
    }
  }
  return drops;
}

/**
 * Send alert via webhook (Slack-compatible JSON) if configured.
 */
async function alertWebhook(payload) {
  const url = process.env.OPS_BACKUP_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[backup] webhook alert failed:', err.message);
  }
}

/**
 * Execute one backup cycle: SQLite + Library + verify.
 * Returns summary that can be returned by API or logged.
 */
export async function runBackupCycle({ force = false } = {}) {
  const start = Date.now();
  const summary = { startedAt: new Date().toISOString(), steps: [] };

  // Step 1: SQLite backup
  let sqliteResult;
  try {
    sqliteResult = await backupOpsDb({ force });
    summary.steps.push({ name: 'sqlite', ...sqliteResult });
  } catch (err) {
    summary.steps.push({ name: 'sqlite', ok: false, error: err.message });
    summary.ok = false;
    _lastError = err.message;
    // Sprint 1.7 — always emit BACKUP_FAILED to the audit log even when
    // OPS_BACKUP_WEBHOOK is unset. Previously a 30-day backup outage was
    // invisible outside `console.error` if the webhook env var wasn't
    // configured (audit finding §7).
    audit('BACKUP_FAILED', '-', '-', `sqlite: ${err.message}`);
    await alertWebhook({ text: `🚨 Ops Control backup FAILED (sqlite): ${err.message}` });
    return summary;
  }

  // Step 2: Library tarball
  const libResult = tarLibrary();
  summary.steps.push({ name: 'library', ...libResult });

  // Step 3: Verify the SQLite backup if just created.
  // `sqliteResult.path` is the absolute path (added in backup.js 2026-05-08
  // alongside the legacy `file` basename). Fall back to `file` only as a
  // defensive last resort — any caller that still relies on basename will
  // hit the same SQLITE_CANTOPEN we are fixing here.
  if (sqliteResult?.path && !sqliteResult.skipped) {
    try {
      const verify = await verifyBackup(sqliteResult.path);
      summary.steps.push({ name: 'verify', ...verify });
      if (verify.ok && verify.counts) {
        const drops = compareToLive(verify.counts);
        if (Object.keys(drops).length > 0) {
          summary.steps.push({ name: 'sanity-check', ok: false, drops });
          await alertWebhook({
            text: `⚠️ Ops Control backup row-count anomaly`,
            attachments: [{ text: JSON.stringify(drops, null, 2) }],
          });
        }
      }
      if (!verify.ok) {
        await alertWebhook({ text: `🚨 Ops Control backup verify FAILED: ${verify.error}` });
      }
    } catch (err) {
      summary.steps.push({ name: 'verify', ok: false, error: err.message });
    }
  }

  // Sprint 1.7 — Step 4: prune old backups so the local backup directory
  // doesn't grow forever. Audit finding §2: pruneOldBackups was wired in
  // backupPath.js but never called by the scheduler. Retention defaults
  // 30 days OR keep the 10 most-recent, whichever is more (so a quiet
  // month doesn't wipe the only backups on disk).
  try {
    const dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(path.dirname(getDbPath()), '..');
    const backupRoot = getBackupRoot(dataDir);
    const retention = getRetentionSettings();
    const pruned = pruneOldBackups({ backupRoot, ...retention });
    summary.steps.push({ name: 'prune', ok: true, ...pruned, ...retention });
  } catch (err) {
    // Pruning failure is non-fatal — the backup itself succeeded — but
    // we surface it so an admin notices before the disk fills.
    summary.steps.push({ name: 'prune', ok: false, error: err.message });
    audit('BACKUP_FAILED', '-', '-', `prune: ${err.message}`);
  }

  summary.durationMs = Date.now() - start;
  summary.ok = summary.steps.every((s) => s.ok !== false);
  _lastRun = summary;
  if (!summary.ok) {
    _lastError = summary.steps
      .filter((s) => !s.ok)
      .map((s) => s.error)
      .join('; ');
    // Sprint 1.7 — emit a single BACKUP_FAILED audit row summarising the
    // step that failed, even when no webhook is configured.
    audit('BACKUP_FAILED', '-', '-', _lastError || 'cycle returned non-ok');
  }

  console.log(`[backup] cycle ${summary.ok ? '✓' : '✗'} ${summary.durationMs}ms`);
  return summary;
}

/**
 * Start the scheduler. Idempotent — calling twice does nothing.
 * Sprint 1.7b — reads effective settings (persisted JSON > env fallback)
 * so admin edits via Settings → Backup take effect after `setSchedule()`
 * calls `stopBackupScheduler()` + `startBackupScheduler()`.
 */
export function startBackupScheduler() {
  if (_timer) return { already: true };
  const { enabled, hour } = effectiveSettings();
  if (!enabled) {
    console.log('[backup] scheduler disabled (settings.enabled=false)');
    return { skipped: true };
  }

  const tick = async () => {
    try {
      await runBackupCycle();
    } catch (err) {
      console.error('[backup] tick error:', err);
    }
    // Schedule next run in 24h regardless of success
    _timer = setTimeout(tick, 24 * 60 * 60 * 1000);
  };

  // First run scheduled for next HH:00
  const ms = msUntilNext(hour);
  _timer = setTimeout(tick, ms);
  console.log(
    `[backup] scheduler started — next run in ${(ms / 1000 / 60).toFixed(0)} minutes (target ${hour}:00)`
  );
  return { ok: true, nextRunMs: ms };
}

export function stopBackupScheduler() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

export function getStatus() {
  const eff = effectiveSettings();
  // Compute next-run preview (independent of timer state) so the UI can
  // show "Next backup at 02:00 in ~7h 32m" even right after a restart.
  const nextRunMs = eff.enabled ? msUntilNext(eff.hour) : null;
  const nextRunAt = nextRunMs != null ? new Date(Date.now() + nextRunMs).toISOString() : null;
  return {
    running: _timer != null,
    enabled: eff.enabled,
    hour: eff.hour,
    retentionDays: eff.retentionDays,
    nextRunAt,
    nextRunMs,
    lastRun: _lastRun,
    lastError: _lastError,
    persistedAt: configPath(),
  };
}

/**
 * Sprint 1.7b — admin-editable schedule. Persists to a JSON config file
 * inside the data dir, then restarts the timer so the change takes
 * effect immediately. Validates inputs before persisting so a bogus
 * payload from the UI (eg. hour=99) can't brick the scheduler.
 */
export function setSchedule({ enabled, hour, retentionDays } = {}) {
  const next = readPersistedConfig() || {};
  if (typeof enabled === 'boolean') next.enabled = enabled;
  if (hour != null) {
    const h = parseInt(hour, 10);
    if (!Number.isFinite(h) || h < 0 || h > 23) {
      throw new Error(`Invalid hour: ${hour} (expected 0-23)`);
    }
    next.hour = h;
  }
  if (retentionDays != null) {
    const r = parseInt(retentionDays, 10);
    if (!Number.isFinite(r) || r < 1 || r > 3650) {
      throw new Error(`Invalid retentionDays: ${retentionDays} (expected 1-3650)`);
    }
    next.retentionDays = r;
  }
  next.updatedAt = new Date().toISOString();
  writePersistedConfig(next);
  // Re-arm the timer so the new schedule kicks in without a server restart.
  stopBackupScheduler();
  const startResult = startBackupScheduler();
  audit(
    'BACKUP_SCHEDULE_CHANGE',
    '-',
    '-',
    `enabled=${effectiveSettings().enabled} hour=${effectiveSettings().hour} retentionDays=${effectiveSettings().retentionDays}`
  );
  return { ok: true, status: getStatus(), startResult };
}
