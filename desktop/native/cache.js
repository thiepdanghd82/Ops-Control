/**
 * Smart-client local cache — SQLite trên máy trạm.
 *
 * Mục đích kép:
 *
 *   1. **Read cache** — master data (Library, Customers, Products,
 *      MachineProfiles, RateTables) hiếm khi đổi nhưng UI đọc liên
 *      tục. Cache local giúp app render < 50 ms thay vì round-trip
 *      tới Tier 2 (~150-300 ms qua LAN, hơn nữa qua WAN/VPN).
 *
 *   2. **Write queue** — khi user lưu quote nhưng mất mạng, ta enqueue
 *      vào bảng `outbox` rồi trả về OK ngay. Background worker
 *      (smart-client.js) sẽ flush queue khi mạng quay lại.
 *
 * Schema giữ tối thiểu — KHÔNG copy toàn bộ schema của Tier 2 sang.
 * Chỉ cache những bảng cần đọc offline. Source of truth vẫn là
 * Tier 2 (`server/data/ops.db`).
 *
 * File DB: <userData>/cache.db (per-user, không share giữa account
 * Windows trên cùng máy).
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

let Database = null;
try {
  Database = require('better-sqlite3');
} catch (err) {
  // better-sqlite3 chưa rebuild cho Electron ABI hiện tại — IPC handler
  // sẽ throw có ý nghĩa thay vì crash.
}

let db = null;

function ensureDb() {
  if (db) return db;
  if (!Database) throw new Error('better-sqlite3 not available — run electron-builder install-app-deps');

  const cacheDir = path.join(app.getPath('userData'), 'cache');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const dbPath = path.join(cacheDir, 'cache.db');
  db = new Database(dbPath);

  // WAL = giảm contention khi reader song song với background sync writer.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS master_cache (
      table_name TEXT NOT NULL,
      row_id     TEXT NOT NULL,
      payload    TEXT NOT NULL,    -- JSON
      saved_at   INTEGER NOT NULL,
      PRIMARY KEY (table_name, row_id)
    );

    CREATE INDEX IF NOT EXISTS idx_master_cache_saved_at
      ON master_cache(saved_at);

    -- Outbox cho write queue. mỗi row = 1 hành động chưa sync.
    -- method/url/body giữ y nguyên dạng REST để smart-client.js
    -- chỉ cần fetch() lại khi có mạng.
    CREATE TABLE IF NOT EXISTS outbox (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      method      TEXT NOT NULL,    -- POST/PUT/DELETE
      url         TEXT NOT NULL,    -- /api/...
      body        TEXT,             -- JSON, null nếu DELETE
      headers     TEXT,             -- JSON object
      created_at  INTEGER NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      last_error  TEXT,
      status      TEXT NOT NULL DEFAULT 'pending'  -- pending|done|failed
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_status_created
      ON outbox(status, created_at);

    -- Sync metadata: high-water mark cho mỗi table master.
    CREATE TABLE IF NOT EXISTS sync_state (
      table_name  TEXT PRIMARY KEY,
      last_pulled_at INTEGER NOT NULL,
      last_saved_at  INTEGER NOT NULL  -- _saved_at từ Tier 2
    );
  `);

  return db;
}

// ─── KV API (cache nhỏ — config, current user, last route) ──────────
function kvGet(key) {
  const row = ensureDb().prepare('SELECT value FROM kv WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch (_) { return row.value; }
}

function kvSet(key, value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  ensureDb().prepare(`
    INSERT INTO kv (key, value, saved_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, saved_at = excluded.saved_at
  `).run(key, json, Date.now());
  return { ok: true };
}

// ─── Master cache (Library/Customers/Products/...) ──────────────────
function cacheUpsert(tableName, rowId, payload) {
  const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
  ensureDb().prepare(`
    INSERT INTO master_cache (table_name, row_id, payload, saved_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(table_name, row_id)
    DO UPDATE SET payload = excluded.payload, saved_at = excluded.saved_at
  `).run(tableName, String(rowId), json, Date.now());
}

function cacheGet(tableName, rowId) {
  const row = ensureDb()
    .prepare('SELECT payload FROM master_cache WHERE table_name = ? AND row_id = ?')
    .get(tableName, String(rowId));
  if (!row) return null;
  try { return JSON.parse(row.payload); } catch (_) { return null; }
}

function cacheList(tableName) {
  const rows = ensureDb()
    .prepare('SELECT row_id, payload FROM master_cache WHERE table_name = ? ORDER BY row_id')
    .all(tableName);
  return rows.map((r) => {
    try { return JSON.parse(r.payload); } catch (_) { return null; }
  }).filter(Boolean);
}

// ─── Outbox / write queue ───────────────────────────────────────────
function enqueue({ method, url, body, headers }) {
  const r = ensureDb().prepare(`
    INSERT INTO outbox (method, url, body, headers, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    method,
    url,
    body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body)),
    headers ? JSON.stringify(headers) : null,
    Date.now(),
  );
  return { id: r.lastInsertRowid, queued_at: Date.now() };
}

function listPending(limit = 100) {
  return ensureDb().prepare(`
    SELECT * FROM outbox WHERE status = 'pending'
    ORDER BY created_at ASC LIMIT ?
  `).all(limit);
}

function markDone(id) {
  ensureDb().prepare(`UPDATE outbox SET status = 'done' WHERE id = ?`).run(id);
}

function markFailed(id, error) {
  ensureDb().prepare(`
    UPDATE outbox
       SET attempts = attempts + 1,
           last_error = ?,
           status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END
     WHERE id = ?
  `).run(String(error).slice(0, 500), id);
}

function pendingCount() {
  return ensureDb()
    .prepare(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'`)
    .get().n;
}

// ─── Sync state ─────────────────────────────────────────────────────
function getSyncState(tableName) {
  return ensureDb()
    .prepare('SELECT * FROM sync_state WHERE table_name = ?')
    .get(tableName) || null;
}

function setSyncState(tableName, lastSavedAt) {
  ensureDb().prepare(`
    INSERT INTO sync_state (table_name, last_pulled_at, last_saved_at)
    VALUES (?, ?, ?)
    ON CONFLICT(table_name) DO UPDATE SET
      last_pulled_at = excluded.last_pulled_at,
      last_saved_at  = excluded.last_saved_at
  `).run(tableName, Date.now(), lastSavedAt);
}

// ─── IPC ────────────────────────────────────────────────────────────
function register(ipcMain, log) {
  // Wrap every handler so a missing native binding (better-sqlite3 not
  // rebuilt for this Electron ABI) returns a graceful default instead
  // of rejecting the IPC call. The renderer's badge / cache layer then
  // degrades to "no-cache" mode (engine still pings + broadcasts online
  // status) instead of being stuck in the initial "connecting" placeholder.
  const safe = (label, fn, fallback) => (...args) => {
    try { return fn(...args); }
    catch (err) {
      log.warn(`[cache.${label}] unavailable:`, err.message);
      return typeof fallback === 'function' ? fallback() : fallback;
    }
  };
  ipcMain.handle('ops:cache.get',        safe('get',        (_e, key) => kvGet(key), null));
  ipcMain.handle('ops:cache.set',        safe('set',        (_e, key, value) => kvSet(key, value), { ok: false }));
  ipcMain.handle('ops:cache.queueWrite', safe('queueWrite', (_e, op) => enqueue(op), { ok: false, queued: false }));
  ipcMain.handle('ops:cache.list',       safe('list',       (_e, t) => cacheList(String(t)), []));
  ipcMain.handle('ops:cache.read',       safe('read',       (_e, t, id) => cacheGet(String(t), String(id)), null));
  ipcMain.handle('ops:cache.upsert',     safe('upsert',     (_e, t, id, p) => { cacheUpsert(String(t), String(id), p); return { ok: true }; }, { ok: false }));
  ipcMain.handle('ops:cache.syncStatus', safe('syncStatus', () => {
    // Prefer smart-client's live state (knows online/offline + lastSyncAt).
    // Falls back to cache-only stats if smart-client isn't loaded (eg in
    // embedded mode the engine never starts — badge is hidden anyway).
    try {
      const sc = require('../smart-client.js');
      if (typeof sc.getStatus === 'function') return sc.getStatus();
    } catch { /* not running */ }
    return { pending: pendingCount(), online: undefined };
  }, { pending: 0, online: undefined }));
  ipcMain.handle('ops:cache.triggerSync', async () => {
    try {
      const { triggerSync } = require('../smart-client.js');
      return await triggerSync();
    } catch (err) {
      log.warn('[cache] triggerSync not wired:', err.message);
      return { ok: false, error: err.message };
    }
  });
}

module.exports = {
  register,
  // export internal API cho smart-client.js dùng
  kvGet, kvSet,
  cacheUpsert, cacheGet, cacheList,
  enqueue, listPending, markDone, markFailed, pendingCount,
  getSyncState, setSyncState,
};
