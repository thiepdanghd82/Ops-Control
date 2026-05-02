/**
 * Idempotency ledger + LRU cache — Sprint MES-2.5.
 *
 * Two-tier store: in-memory LRU (10 000 entries, fast hits) write-through to
 * SQLite `idempotency_ledger` (durable across restarts). The middleware
 * (middleware/idempotency.js) is the only caller; it consults the store
 * BEFORE the route handler runs, so an exact retry replays the cached
 * response byte-for-byte without touching the service layer.
 *
 * `request_hash` is sha256 over (method + canonical-url + canonical-stringify(body)).
 * canonical-stringify sorts object keys at every depth; arrays preserve
 * order; numbers serialize as JSON numbers (no normalisation beyond
 * JSON's own rules — that's enough for kiosk POSTs which have integer
 * counts and ISO strings, no floats with locale issues).
 *
 * Retention: rows older than 12 h are pruned by the nightly job wired in
 * mountPlanning() (per Patch 1; was 24 h in the original spec). Anything
 * a kiosk hasn't retried within 12 h is almost certainly a fire-and-
 * forget operator action that won't see a retry.
 */
import crypto from 'node:crypto';

const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 h (Patch 1)
const LRU_MAX = 10_000;

/**
 * Canonical JSON stringify — keys sorted alphabetically at every depth.
 * Numbers + strings + booleans + null serialize as JSON; arrays preserve
 * order. Reused by the hash function so two identical bodies submitted
 * with keys in different orders hash to the same value.
 */
export function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(value[k])}`).join(',')}}`;
}

export function requestHash(method, url, body) {
  const canonical = canonicalStringify(body ?? null);
  return crypto.createHash('sha256').update(`${method}\n${url}\n${canonical}`).digest('hex');
}

class LRU {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v); // move-to-back on touch (true LRU)
    return v;
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }
  size() {
    return this.map.size;
  }
}

export function createIdempotencyStore({
  db,
  maxAgeMs = MAX_AGE_MS,
  lruMax = LRU_MAX,
  now = () => Date.now(),
} = {}) {
  const lru = new LRU(lruMax);

  const selectStmt = db.prepare(
    `SELECT response_status, response_body, request_hash, created_at_utc
     FROM idempotency_ledger WHERE key = ?`
  );
  // INSERT OR REPLACE so a successful retry on a key whose ledger row
  // somehow drifted (e.g. server crash mid-write) just overwrites — the
  // hash check happens BEFORE put() so this never silently overwrites a
  // legitimate-but-different request.
  const upsertStmt = db.prepare(
    `INSERT OR REPLACE INTO idempotency_ledger
       (key, request_hash, response_status, response_body)
     VALUES (?, ?, ?, ?)`
  );
  const pruneStmt = db.prepare(
    `DELETE FROM idempotency_ledger
     WHERE created_at_utc < strftime('%Y-%m-%dT%H:%M:%fZ', ?, 'unixepoch')`
  );

  function get(key) {
    const cached = lru.get(key);
    if (cached) return cached;
    const row = selectStmt.get(key);
    if (!row) return null;
    // Lazy-expire: if older than maxAge, treat as miss (the prune job
    // sweeps the row eventually; we don't want to re-read it here as a
    // hit and then surprise the caller).
    if (Date.parse(row.created_at_utc) + maxAgeMs < now()) return null;
    const entry = {
      status: row.response_status,
      body: JSON.parse(row.response_body),
      request_hash: row.request_hash,
      created_at: row.created_at_utc,
    };
    lru.set(key, entry);
    return entry;
  }

  function put(key, { status, body, request_hash }) {
    const entry = { status, body, request_hash, created_at: new Date(now()).toISOString() };
    upsertStmt.run(key, request_hash, status, JSON.stringify(body));
    lru.set(key, entry);
  }

  function prune() {
    const cutoffSec = Math.floor((now() - maxAgeMs) / 1000);
    const r = pruneStmt.run(cutoffSec);
    return Number(r.changes);
  }

  function lruSize() {
    return lru.size();
  }

  return { get, put, prune, lruSize };
}
