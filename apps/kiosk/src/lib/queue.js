// Offline mutation queue — Sprint MES-2.6b.
// IndexedDB-backed FIFO with sequential flush, exp-backoff per record,
// 24h-or-500-entry cap (oldest evicted first), and a small pub-sub for
// the connectivity badge.
import { openDB } from 'idb';
import { rawFetch } from './api.js';

const DB_NAME = 'opskiosk';
const DB_VERSION = 1;
const STORE = 'queue';
const MAX_ENTRIES = 500;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 60000];

let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        const s = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        s.createIndex('created_at', 'created_at');
      },
    });
  }
  return dbPromise;
}

const listeners = new Set();
export const onQueueEvent = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = (type, payload) =>
  listeners.forEach((fn) => {
    try {
      fn({ type, ...payload });
    } catch {
      /* swallow */
    }
  });

let flushing = false; // single-flight lock

export async function enqueue({ method, url, body, idempotency_key, op_id, kind }) {
  const d = await db();
  const id = await d.add(STORE, {
    method,
    url,
    body,
    idempotency_key,
    op_id,
    kind,
    created_at: Date.now(),
    next_retry_at: 0,
    attempts: 0,
    permanent: false,
  });
  emit('queued', { count: await d.count(STORE), op_id, kind });
  await capAndPrune();
  return id;
}

async function capAndPrune() {
  const d = await db();
  const cutoff = Date.now() - MAX_AGE_MS;
  let evicted = 0;
  // Age-based prune: drop everything older than 24h regardless of perm/perm-fail.
  let cur = await d.transaction(STORE, 'readwrite').store.index('created_at').openCursor();
  while (cur && cur.value.created_at < cutoff) {
    await cur.delete();
    evicted++;
    cur = await cur.continue();
  }
  // Cap-based prune: oldest-first if we're over MAX_ENTRIES.
  let count = await d.count(STORE);
  if (count > MAX_ENTRIES) {
    cur = await d.transaction(STORE, 'readwrite').store.index('created_at').openCursor();
    while (cur && count > MAX_ENTRIES) {
      await cur.delete();
      evicted++;
      count--;
      cur = await cur.continue();
    }
  }
  if (evicted > 0) {
    try {
      const prev = Number(localStorage.getItem('opskiosk.evicted_count') || '0');
      localStorage.setItem('opskiosk.evicted_count', String(prev + evicted));
    } catch {
      /* private mode */
    }
    console.warn(`[kiosk queue] evicted ${evicted} stale record(s)`);
    emit('evicted', { count: evicted });
  }
}

export async function counts() {
  const d = await db();
  const all = await d.getAll(STORE);
  return {
    pending: all.filter((r) => !r.permanent).length,
    permanent: all.filter((r) => r.permanent).length,
    total: all.length,
  };
}

export async function flushNext() {
  if (flushing) return 'busy';
  flushing = true;
  try {
    const d = await db();
    // Oldest non-permanent record whose next_retry_at has passed.
    const all = await d.getAll(STORE);
    const candidates = all
      .filter((r) => !r.permanent && (r.next_retry_at || 0) <= Date.now())
      .sort((a, b) => a.created_at - b.created_at);
    if (candidates.length === 0) return 'idle';
    const rec = candidates[0];
    const result = await rawFetch(rec.method, rec.url, {
      body: rec.body,
      idemKey: rec.idempotency_key,
    });
    if (result.ok || (result.status === 409 && result.body?.replayed)) {
      await d.delete(STORE, rec.id);
      emit('flushed', { op_id: rec.op_id, replayed: !!result.replayed });
      return 'sent';
    }
    if (result.networkError) {
      const next = BACKOFF_MS[Math.min(rec.attempts, BACKOFF_MS.length - 1)];
      await d.put(STORE, { ...rec, attempts: rec.attempts + 1, next_retry_at: Date.now() + next });
      return 'network_fail';
    }
    // Other 4xx (e.g. 422 reason-code-unknown, 409 invalid-transition):
    // permanent failure. Keep the record so the operator sees the toast,
    // but don't retry automatically.
    await d.put(STORE, { ...rec, permanent: true, last_problem: result.problem });
    emit('permanent_fail', { op_id: rec.op_id, problem: result.problem });
    return 'permanent_fail';
  } finally {
    flushing = false;
  }
}

export async function flushAll() {
  for (let i = 0; i < MAX_ENTRIES; i++) {
    const r = await flushNext();
    if (r === 'idle' || r === 'busy' || r === 'permanent_fail' || r === 'network_fail') return r;
  }
  return 'idle';
}

let driverStarted = false;
export function startOnlineFlushDriver() {
  if (driverStarted || typeof window === 'undefined') return;
  driverStarted = true;
  const tick = () => {
    if (navigator.onLine) flushAll().catch(() => {});
  };
  window.addEventListener('online', tick);
  setInterval(tick, 30_000);
  tick();
}
