/**
 * Quotes store — single entry point for quote-history CRUD, with
 * file + SQLite shadow-write.
 *
 * Why this module (Sprint 7.2): previously the `/save-all` handler,
 * the atomic approval endpoint, and the GET-quotes endpoint each
 * opened `quote_history.json` directly. That made it impossible to
 * flip the backend without touching every call-site. Pulling the
 * read/write into one place gives us:
 *   1. A single place to add SQLite shadow-write (no more drift risk).
 *   2. A single place to swap the read-path when Sprint 7.3 cutover
 *      lands — flip one env check here and every caller follows.
 *   3. A testable seam (loadQuotes / saveQuotes) instead of inline IO.
 *
 * Today, file remains the source of truth. saveQuotes writes the
 * JSON first, then mirrors into SQLite best-effort. A failed mirror
 * never fails the write; the next save or a `/save-all` will catch up.
 */
import fs from 'fs';
import path from 'path';
import { atomicWriteFileSync } from '../services/atomicWrite.js';
import { getDataDir } from '../services/authService.js';
import sqliteBackend from './backends/sqliteBackend.js';
import { getDb, getDbPath } from '../db/connection.js';
import { withLock } from '../utils/asyncLock.js';

/**
 * Which backend should serve read requests for quotes?
 *
 * Priority: `OPS_BACKEND_QUOTES` (per-dataset override) → `OPS_DATA_BACKEND`
 * (master switch) → 'file' (safe default). Writes always hit the JSON
 * file + shadow SQLite until Sprint 7.4 removes the file fallback.
 *
 * Read every call — env can flip at runtime via an ops push, no need
 * to restart the server to switch from shadow-read to sqlite-primary.
 */
function readBackendName() {
  const override = (process.env.OPS_BACKEND_QUOTES || '').toLowerCase();
  if (override === 'sqlite' || override === 'file') return override;
  const master = (process.env.OPS_DATA_BACKEND || 'file').toLowerCase();
  return master === 'sqlite' ? 'sqlite' : 'file';
}

/**
 * Sprint 7.4: strict mode. Once ops has 14 days of parity-green
 * observation they set `OPS_QUOTES_STRICT_SQLITE=1` to disable the
 * file-fallback on reads. In strict mode:
 *   - `loadQuotes` reads ONLY SQLite. If SQLite is unavailable the
 *     function throws so ops sees the outage loudly rather than
 *     silently serving stale file data.
 *   - `getQuoteById` does the same.
 *   - Writes still hit the JSON file for rollback safety — a hard
 *     remove of file writes is deferred to a later sprint, after
 *     strict reads have been stable for another observation window.
 *
 * Default OFF so pre-cutover deployments get the permissive
 * fallback behavior Sprint 7.1/7.3 wired.
 */
function isStrictSqlite() {
  return process.env.OPS_QUOTES_STRICT_SQLITE === '1' && readBackendName() === 'sqlite';
}

function loadQuotesFromSqliteStrict() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    const err = new Error(`strict-sqlite: ops.db missing at ${dbPath}`);
    err.code = 'OPS_DB_MISSING';
    throw err;
  }
  const conn = getDb();
  try {
    const rows = conn.prepare('SELECT raw_json FROM quotes').all();
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.raw_json);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    const wrapped = new Error(`strict-sqlite: read failed — ${err.message}`);
    wrapped.code = err.code || 'OPS_DB_READ_FAILED';
    throw wrapped;
  }
}

function quoteHistoryPath() {
  // Test escape hatch — lets unit tests point loadQuotes / saveQuotes
  // at a tmp file without touching prod data.
  const override = process.env.OPS_QUOTE_HISTORY_FILE;
  if (override) {
    try {
      fs.mkdirSync(path.dirname(override), { recursive: true });
    } catch {
      /* noop */
    }
    return override;
  }
  return path.join(getDataDir(), 'Library', 'QuoteHistory', 'quote_history.json');
}

function loadQuotesFromFile() {
  const p = quoteHistoryPath();
  try {
    if (!fs.existsSync(p)) return [];
    const txt = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Return the quote list. Source depends on `OPS_BACKEND_QUOTES` /
 * `OPS_DATA_BACKEND`; see `readBackendName`. Never throws — a missing
 * / corrupt source yields []. Callers that want to MUTATE the list
 * must call `saveQuotes` to persist; this returns a fresh array.
 *
 * When the SQLite backend is selected but its table is empty (e.g.
 * right after a deploy before /save-all has run), `sqliteBackend`
 * transparently falls back to the file list. The fallback is
 * Sprint-7.3 opt-in and will be removed in 7.4 once observation
 * confirms SQLite never legitimately empties.
 */
export function loadQuotes() {
  if (isStrictSqlite()) {
    // Fail-loud read path — Sprint 7.4 cutover. Throwing surfaces
    // SQLite outages in the API response instead of silently serving
    // stale file data; ops reverses via `unset OPS_QUOTES_STRICT_SQLITE`.
    return loadQuotesFromSqliteStrict();
  }
  const backend = readBackendName();
  if (backend === 'sqlite') {
    try {
      const list = sqliteBackend.listQuotes();
      if (Array.isArray(list)) return list;
    } catch (err) {
      console.warn('  ⚠️  loadQuotes(sqlite) failed, falling back to file:', err.message);
    }
  }
  return loadQuotesFromFile();
}

/**
 * Persist the full quote list. Writes JSON atomically (tmp → fsync →
 * rename), then shadow-writes into SQLite. Returns:
 *   { file: true, sqlite: { ok, written, deleted, skipped, reason? } }
 *
 * The return value is informational — saveQuotes throws on file-write
 * failure (the authoritative store must succeed) but swallows SQLite
 * failures (the mirror is opportunistic until Sprint 7.3 cutover).
 */
export function saveQuotes(quotes) {
  const list = Array.isArray(quotes) ? quotes : [];
  const p = quoteHistoryPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  atomicWriteFileSync(p, JSON.stringify(list, null, 2));
  let sqlite;
  try {
    sqlite = sqliteBackend.upsertQuotesBulk(list);
  } catch (err) {
    sqlite = { ok: false, reason: err?.message || 'sqlite-exception' };
  }
  if (sqlite && !sqlite.ok) {
    // Dual-backend drift is a known-and-acceptable state during
    // shadow-write. Log loudly enough that Ops notices, but never
    // fail the caller — the file write above already landed.
    console.warn(`  ⚠️  quotes shadow-write: ${sqlite.reason || 'non-ok'}`);
  }
  return { file: true, sqlite };
}

/**
 * Atomically add a new quote or update an existing one by id. Serialized
 * under the `quotes` lock key so two concurrent writers can't read-modify-
 * write the same list and clobber each other — the lost-update race that
 * shipped when the client did "GET full history, mutate, POST full history"
 * via /save-all.
 *
 * Behavior:
 *   - If `quote.id` is a number that matches an existing row, that row is
 *     REPLACED (shallow) with the incoming payload. `saved_at` is refreshed
 *     to the current ISO timestamp unless the caller provided one.
 *   - If `quote.id` is missing or doesn't match, a fresh id = max(id)+1 is
 *     assigned and the quote is APPENDED.
 *   - Caller receives the persisted quote (with its final id + saved_at).
 *   - Malformed payloads (non-object, no state) throw before writing.
 *
 * Returns: the persisted quote object.
 */
/**
 * Error raised when an upsert's expected `_version` doesn't match the
 * server's current version for that quote. Callers should map this to
 * HTTP 409 Conflict so the client can reload + re-edit.
 *
 * Sprint 11 P0-2 — optimistic locking. Before this check, two users
 * saving the same quote concurrently silently overwrote each other's
 * work. Now the second save sees the version bumped by the first and
 * fails explicitly with the server's current state in `.current` so
 * the client can show a diff-or-overwrite dialog.
 */
export class VersionConflictError extends Error {
  constructor({ id, expected, actual, current }) {
    super(`Version conflict on quote #${id}: expected v${expected}, server is at v${actual}`);
    this.name = 'VersionConflictError';
    this.code = 'VERSION_CONFLICT';
    this.quoteId = id;
    this.expectedVersion = expected;
    this.actualVersion = actual;
    this.current = current; // the server's current quote, so client can re-render
  }
}

export async function upsertQuote(quote) {
  // Async so sync input-validation throws surface as rejected promises —
  // callers can `await upsertQuote(bad)` and `catch` uniformly instead
  // of mixing try/catch + .catch() styles.
  if (!quote || typeof quote !== 'object' || Array.isArray(quote)) {
    throw new Error('upsertQuote: payload must be a plain object');
  }
  return withLock('quotes', () => {
    const list = loadQuotesFromFile();
    const incoming = { ...quote };
    if (!incoming.saved_at) incoming.saved_at = new Date().toISOString();
    // Server-authoritative timestamp — distinct from client-provided
    // `saved_at` which can be spoofed. Audit trail / forensic queries
    // should prefer `_saved_at`. Stamped on every write so the value
    // reflects the ACTUAL moment the server persisted.
    incoming._saved_at = new Date().toISOString();
    let next;
    const hasId = typeof incoming.id === 'number' && Number.isFinite(incoming.id);
    const existingIdx = hasId ? list.findIndex((q) => q && q.id === incoming.id) : -1;
    if (existingIdx >= 0) {
      // Optimistic locking: if the caller sent `_version`, require it
      // to match the server's current version. Omitted version means
      // the caller opted out (for legacy callers + server-to-server
      // mutations like approval transitions); don't force the check on
      // them — only on explicit opt-in.
      const existing = list[existingIdx];
      const serverVersion = Number(existing._version) || 0;
      if (incoming._version != null) {
        const expected = Number(incoming._version);
        if (expected !== serverVersion) {
          throw new VersionConflictError({
            id: existing.id,
            expected,
            actual: serverVersion,
            current: existing,
          });
        }
      }
      // Replace in place. Merge so fields the caller didn't send (e.g.
      // version counter added by another subsystem) survive. Bump
      // `_version` so next save from this or another client sees the
      // new state.
      const merged = {
        ...existing,
        ...incoming,
        _version: serverVersion + 1,
      };
      next = list.map((q, i) => (i === existingIdx ? merged : q));
      saveQuotes(next);
      return merged;
    }
    const maxId = list.reduce((mx, q) => Math.max(mx, q && typeof q.id === 'number' ? q.id : 0), 0);
    const assigned = {
      ...incoming,
      id: hasId ? incoming.id : maxId + 1,
      _version: 1,
    };
    next = [...list, assigned];
    saveQuotes(next);
    return assigned;
  });
}

/**
 * Find one quote by id. Uses `sqliteBackend.getQuoteById` for an
 * indexed lookup when backend=sqlite; otherwise scans the file list.
 */
export function getQuoteById(id) {
  const n = Number.isFinite(+id) ? +id : null;
  if (n == null) return null;
  if (isStrictSqlite()) {
    // Strict path — direct SELECT, no file fallback. Raises on DB
    // outage (callers can 5xx; not found returns null).
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      const err = new Error(`strict-sqlite: ops.db missing at ${dbPath}`);
      err.code = 'OPS_DB_MISSING';
      throw err;
    }
    const row = getDb().prepare('SELECT raw_json FROM quotes WHERE id = ?').get(n);
    if (!row) return null;
    try {
      return JSON.parse(row.raw_json);
    } catch {
      return null;
    }
  }
  const backend = readBackendName();
  if (backend === 'sqlite') {
    try {
      const hit = sqliteBackend.getQuoteById(n);
      if (hit) return hit;
    } catch (err) {
      console.warn('  ⚠️  getQuoteById(sqlite) failed, falling back to file:', err.message);
    }
  }
  return loadQuotesFromFile().find((q) => q && q.id === n) || null;
}

/**
 * Observability helper — returns the effective backend + quick row
 * counts for both sides. Non-throwing. Consumed by the admin health
 * endpoint in Sprint 7.3 so ops can verify parity without running
 * verify-parity.js manually.
 *
 * Note: `sqliteBackend.listQuotes()` silently falls back to the file
 * list when its table is empty (shadow-read safety net). For a
 * truthful "count in SQLite" we probe the DB directly via the shared
 * connection. If the DB file is missing we return a nullable count
 * rather than conflate with "empty table".
 */
export function quotesBackendStatus() {
  const backend = readBackendName();
  const file = loadQuotesFromFile();
  let sqlite = null;
  let sqliteReason = null;
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    sqliteReason = 'db-file-missing';
  } else {
    try {
      // Direct SELECT avoids the sqliteBackend's file-fallback, so we
      // see the TRUE row count of the mirror — not the fallback.
      sqlite = getDb().prepare('SELECT COUNT(*) as n FROM quotes').get().n;
    } catch (err) {
      sqliteReason = err?.message || 'count-failed';
    }
  }
  return {
    effective_backend: backend,
    file_count: file.length,
    sqlite_count: sqlite,
    sqlite_reason: sqliteReason,
    in_sync: sqlite != null && sqlite === file.length,
  };
}
