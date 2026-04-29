// @ts-check
/**
 * SQLite-backed audit log store (Sprint 30).
 *
 * Replaces the prior in-memory ring buffer + `audit_log.json` file that
 * authService.js maintained. Reasons for the change:
 *   - 500-row hard cap dropped older entries — no SOX/compliance
 *     retention.
 *   - Full-array rewrite to JSON on every 2s debounce = write
 *     amplification that scales with history length.
 *   - No query support (can't filter by user, event, or date range).
 *   - In-memory state died with the Node process — horizontal scale
 *     would split audit history across instances.
 *
 * Design: single-table insert + tail SELECT. Indices on
 * (ts DESC), (event, ts DESC), (user, ts DESC). All reads return rows
 * in descending-ts order so consumers see newest-first without sorting.
 *
 * Fail-open: every operation swallows DB errors and returns a sane
 * default. Audit logging must NEVER block an HTTP response or cause a
 * user-visible failure — the whole point is observability, not a
 * blocking gate.
 */
import fs from 'node:fs';
import { getDb, getDbPath } from '../db/connection.js';

/** @typedef {{ ts: string, event: string, user?: string, ip?: string, detail?: string }} AuditRow */

/** @returns {boolean} true if the SQLite DB is available + usable. */
function dbReady() {
  try {
    const p = getDbPath();
    return !!p && fs.existsSync(p);
  } catch { return false; }
}

/**
 * Insert one audit row. No-op if the DB is unavailable (fail-open).
 * Statement prepare happens per-call rather than cached at module
 * level — better-sqlite3 keeps its own internal prepare cache keyed
 * on SQL text, so the cost is a map lookup, and per-call prepare
 * survives test-harness `connection._resetForTests()` cleanly.
 *
 * @param {AuditRow} row
 * @returns {boolean} true if written, false if skipped or failed.
 */
export function appendAudit(row) {
  if (!dbReady()) return false;
  try {
    getDb()
      .prepare('INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)')
      .run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
    return true;
  } catch (err) {
    console.warn('  ⚠️  audit DB insert failed:', err?.message || err);
    return false;
  }
}

/**
 * Read the N most-recent audit rows (newest first).
 * @param {number} limit
 * @param {{ event?: string, user?: string }} [filter]
 * @returns {AuditRow[]} empty array if DB unavailable or on error.
 */
export function tailAudit(limit, filter = {}) {
  if (!dbReady()) return [];
  try {
    const db = getDb();
    const n = Math.max(1, Math.min(limit | 0, 10000));
    if (filter.event) {
      return db.prepare('SELECT ts, event, user, ip, detail FROM audit_log WHERE event = ? ORDER BY id DESC LIMIT ?')
        .all(filter.event, n);
    }
    if (filter.user) {
      return db.prepare('SELECT ts, event, user, ip, detail FROM audit_log WHERE user = ? ORDER BY id DESC LIMIT ?')
        .all(filter.user, n);
    }
    return db.prepare('SELECT ts, event, user, ip, detail FROM audit_log ORDER BY id DESC LIMIT ?').all(n);
  } catch (err) {
    console.warn('  ⚠️  audit DB read failed:', err?.message || err);
    return [];
  }
}

/**
 * Row count (for migration parity / observability). Returns null when
 * DB unavailable so callers can distinguish "0 rows" from "offline".
 * @returns {number | null}
 */
export function auditRowCount() {
  if (!dbReady()) return null;
  try {
    const row = getDb().prepare('SELECT COUNT(*) as n FROM audit_log').get();
    return row && typeof row.n === 'number' ? row.n : 0;
  } catch { return null; }
}

/**
 * Bulk insert (used by backfill script to import legacy audit_log.json).
 * Runs inside a single transaction for throughput — 500 rows go in
 * under 10ms on a warm DB.
 * @param {AuditRow[]} rows
 * @returns {number} rows actually inserted.
 */
export function bulkAppendAudit(rows) {
  if (!dbReady() || !Array.isArray(rows) || rows.length === 0) return 0;
  try {
    const db = getDb();
    const ins = db.prepare('INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)');
    const tx = db.transaction((rs) => {
      for (const r of rs) ins.run(r.ts || '', r.event || '', r.user || '-', r.ip || '-', r.detail || '');
    });
    tx(rows);
    return rows.length;
  } catch (err) {
    console.warn('  ⚠️  audit bulk insert failed:', err?.message || err);
    return 0;
  }
}
