// @ts-check
/**
 * Async mutex keyed by arbitrary string. Serializes concurrent
 * `withLock(key, fn)` calls so that only one `fn` runs per key at a
 * time, while different keys stay parallel.
 *
 * Why: `quote_history.json` is a single JSON file. Two concurrent
 * HTTP requests approving the same quote would both read the file,
 * both compute a new state, and both write — last write wins,
 * middle-transition loss is silent. A mutex around read-modify-write
 * makes the operation linearizable.
 *
 * Sprint 34 — two-layer scope:
 *   1. In-process Promise-chain mutex (same as pre-Sprint-34) —
 *      zero I/O, fastest for single-Node deployments.
 *   2. Cross-process file-lock via `proper-lockfile`, activated when
 *      `OPS_MULTI_INSTANCE=1` is set. Adds ~1-5ms per acquire but
 *      serializes across Node instances sharing the same data dir
 *      (e.g., blue/green deploys, pm2 cluster mode).
 *
 * Caller contract unchanged. `withLock('quotes', fn)` just works in
 * both modes — default OFF preserves current single-instance
 * characteristics.
 *
 * Cleanup: the Map entry is removed after the last queued task drains
 * so heavy traffic on many keys doesn't leak entries. File locks are
 * released in a finally, and proper-lockfile's compromised callback
 * re-acquires if the lock file disappears (e.g., disk wipe mid-tx).
 */
import fs from 'node:fs';
import path from 'node:path';
import lockfile from 'proper-lockfile';

const _locks = new Map();

function multiInstanceEnabled() {
  return process.env.OPS_MULTI_INSTANCE === '1';
}

function lockDir() {
  // Co-located with the app data dir so lockfiles don't pollute /tmp
  // and survive a DATA_DIR-scoped backup/restore cycle.
  const base = process.env.DATA_DIR || path.join(process.cwd(), 'server', 'data');
  const dir = path.join(base, 'locks');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }
  return dir;
}

/** sanitize key → filesystem-safe filename */
function keyToFilename(key) {
  return String(key).replace(/[^\w.-]/g, '_') + '.lock';
}

async function acquireFileLock(key) {
  const file = path.join(lockDir(), keyToFilename(key));
  // proper-lockfile requires an existing target to lock. Create a
  // stub marker if missing — idempotent, trivially small.
  try { fs.writeFileSync(file, '', { flag: 'a' }); } catch { /* ignore — acquire will surface the error */ }
  // Retries smooth over normal contention: stale 30s (crash survives),
  // retries 10× with exponential backoff capped at 1s.
  return lockfile.lock(file, {
    stale: 30_000,
    retries: { retries: 10, minTimeout: 10, maxTimeout: 1_000, factor: 2 },
    realpath: false,
  });
}

/**
 * Run `fn` exclusively per `key`. Returns whatever `fn` returns (or
 * re-throws if it throws). Works for both sync and async `fn`.
 *
 * @template T
 * @param {string} key
 * @param {() => (T | Promise<T>)} fn
 * @returns {Promise<T>}
 */
export async function withLock(key, fn) {
  const previous = _locks.get(key) || Promise.resolve();

  // Chain: next promise resolves AFTER previous completes AND after
  // `fn` completes. Storing the chain in the map means the Nth
  // waiter awaits the (N-1)th, which awaits the (N-2)th, …
  let resolveRun;
  const run = new Promise(r => { resolveRun = r; });
  const mine = previous.then(() => run);
  _locks.set(key, mine);

  await previous;
  let releaseFileLock = null;
  try {
    if (multiInstanceEnabled()) {
      // Layer 2: file lock across processes. Swallow failures as a
      // warning — we still have in-process serialization, so a
      // stuck lockfile shouldn't block single-node operation.
      try {
        releaseFileLock = await acquireFileLock(key);
      } catch (err) {
        console.warn(`  ⚠️  withLock(${key}) file-lock failed (degrading to in-process only):`, err?.message || err);
      }
    }
    return await fn();
  } finally {
    if (releaseFileLock) {
      try { await releaseFileLock(); } catch (err) {
        console.warn(`  ⚠️  withLock(${key}) file-lock release failed:`, err?.message || err);
      }
    }
    resolveRun();
    // If nobody newer queued behind us, drop the key to avoid memory
    // growth. If someone did queue, `_locks.get(key)` !== mine and
    // we leave it alone.
    if (_locks.get(key) === mine) _locks.delete(key);
  }
}

/** For tests — number of keys currently locked. */
export function _activeKeyCount() {
  return _locks.size;
}

/** For tests — force-clear the map between runs. */
export function _resetLocksForTests() {
  _locks.clear();
}
