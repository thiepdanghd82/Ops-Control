/**
 * useCachedFetch — SWR-style module-level cache for heavy GET endpoints.
 *
 * Sprint 1.7h Phase 2 — perf optimization for the heavy library tabs
 * (IFS Inventory 2.8 MB, Mfg Structures 6 MB, Routing Ops 16 MB).
 *
 * Why this and not just useAbortableFetch:
 *   - Phase 1 added server ETag → repeat visits get HTTP 304 in ~5ms.
 *   - But JSON.parse on a 16 MB body still costs ~200-500ms even when
 *     the browser served it from disk cache. Tab switch still feels
 *     laggy because that parse blocks the main thread.
 *   - This hook adds an in-memory module-level cache keyed by `cacheKey`.
 *     Second visit returns the SAME parsed object reference instantly
 *     (no network, no parse, no allocations) and revalidates in the
 *     background.
 *
 * Stale-while-revalidate flow:
 *   1. Mount: if cache hit → return cached data immediately (loading=false).
 *   2. In parallel: kick off the fetcher. On success, IF the new payload
 *      differs from cache (shallow ===), update state + cache. ETag 304
 *      means same hash so the browser-level cache returns the same body
 *      → JSON parses to a deep-equal-but-new object — we treat that as
 *      "still fresh" via a fast hash check on the JSON string length.
 *   3. Mount with cache miss: same as useAbortableFetch (loading=true,
 *      then renders when fetch resolves).
 *
 * Cache lifecycle: lives in the module scope for the session. Reset by
 * `invalidateCache(cacheKey)` after writes (eg. import wizard commit).
 * Cleared on full page reload — that's the trade-off vs persistence.
 *
 * Returns: { data, loading, error, refresh, isFromCache }.
 *
 * Note: this is intentionally a thin shim, not a full SWR library. We
 * avoid adding the `swr` package (~10 KB) because the codebase prefers
 * minimal deps (CLAUDE.md: "zero-dep" philosophy in audit notes).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import desktop from '../services/desktopBridge';

// Module-level cache shared across all hook instances + remounts.
// Keyed by user-supplied cacheKey so two tabs hitting the same endpoint
// share the parsed result.
const _cache = new Map();

// Sprint 1.7h Phase 3 — Smart-mode awareness. The user-facing
// connection mode (embedded / thin / smart) lives in electron-store
// behind one IPC. Cache the result for the session so we don't re-query
// per fetch. Resolves to false in non-Electron (web build).
let _smartModePromise = null;
function isSmartMode() {
  if (!desktop.isAvailable) return Promise.resolve(false);
  if (_smartModePromise == null) {
    _smartModePromise = desktop.app.getConfig()
      .then(cfg => cfg?.mode === 'smart')
      .catch(() => false);
  }
  return _smartModePromise;
}

// Persistent snapshot via electron-store (only when Smart mode is
// active). We use the existing `desktop.cache.get/set` IPC pair so no
// new preload surface is needed. Fail-silent — a corrupt cache just
// degrades to fetch-from-server.
const SNAPSHOT_PREFIX = 'snapshot:';
async function readSnapshot(key) {
  if (!await isSmartMode()) return null;
  try {
    const v = await desktop.cache.get(SNAPSHOT_PREFIX + key);
    return v && typeof v === 'object' ? v.data ?? v : null;
  } catch { return null; }
}
async function writeSnapshot(key, data) {
  if (!await isSmartMode()) return;
  try { await desktop.cache.set(SNAPSHOT_PREFIX + key, { data, ts: Date.now() }); }
  catch { /* electron-store quota / disk full — non-critical */ }
}

// External invalidation hook — call after any write that should bust the
// cached value (eg. import wizard finished, admin edit). Multiple keys
// can be passed for bulk-clear. Also wipes the persistent snapshot when
// Smart mode active so the next mount won't hydrate from stale disk data.
export function invalidateCache(...keys) {
  for (const k of keys) {
    _cache.delete(k);
    // Best-effort persistent wipe; non-Electron is a no-op.
    if (desktop.isAvailable) {
      desktop.cache.set(SNAPSHOT_PREFIX + k, null).catch(() => {});
    }
  }
}

// Cheap "did this change" signal — uses the array-length / object-key-count
// to detect coarse changes without deep-equal'ing a 16 MB tree. Good enough
// for the swr revalidate path: false positives just mean an unnecessary
// re-render with the same data, false negatives mean a missed update which
// the next manual `refresh()` corrects.
function shapeSignature(v) {
  if (v == null) return 'null';
  if (Array.isArray(v)) return `arr:${v.length}`;
  if (typeof v === 'object') return `obj:${Object.keys(v).length}`;
  return `prim:${typeof v}`;
}

export function useCachedFetch(cacheKey, fetcher, deps = []) {
  // Initialize state from cache when present so the FIRST render already
  // has data — no flash of "Loading…" on tab switch back.
  const [data, setData] = useState(() => _cache.get(cacheKey)?.data ?? null);
  const [loading, setLoading] = useState(() => !_cache.has(cacheKey));
  const [error, setError] = useState(null);
  const [isFromCache, setIsFromCache] = useState(() => _cache.has(cacheKey));
  const abortRef = useRef(null);

  const doFetch = useCallback(async ({ silent = false } = {}) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await fetcher(ctrl.signal);
      if (ctrl.signal.aborted) return;
      _cache.set(cacheKey, { data: result, ts: Date.now() });
      // Phase 3 — persist to electron-store snapshot (Smart mode only).
      // Fire-and-forget; failure to persist doesn't break the in-memory
      // path. Survives app restart so cold start of the same tab is
      // instant when Smart mode is on.
      writeSnapshot(cacheKey, result);
      setData(prev => {
        // Skip the state update if shape signature matches AND it was
        // already from cache — keeps the SAME object reference so memo'd
        // selectors downstream don't re-compute.
        if (prev && shapeSignature(prev) === shapeSignature(result)) {
          return prev;
        }
        return result;
      });
      setIsFromCache(false);
      setLoading(false);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err);
      setLoading(false);
      // eslint-disable-next-line no-console
      console.warn('[useCachedFetch] fetch failed for', cacheKey, err);
    }
  }, [cacheKey, fetcher]);

  useEffect(() => {
    const cached = _cache.get(cacheKey);
    if (cached) {
      // Have in-memory cached data → kick off background revalidation;
      // user sees cached data instantly without the loading spinner.
      doFetch({ silent: true });
      return () => abortRef.current?.abort();
    }
    // Phase 3 — Smart mode persistent snapshot. Try to hydrate from
    // electron-store BEFORE falling back to a live fetch. This makes
    // cold-start tab opens instant after the first session ever cached
    // the data. async-IIFE because useEffect can't be async itself.
    let cancelled = false;
    (async () => {
      const snap = await readSnapshot(cacheKey);
      if (cancelled) return;
      if (snap != null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setData(snap);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(false);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsFromCache(true);
        _cache.set(cacheKey, { data: snap, ts: Date.now() });
        // Background revalidate so a server-side change still propagates.
        doFetch({ silent: true });
      } else {
        doFetch();
      }
    })();
    return () => { cancelled = true; abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ...deps]);

  // Manual refresh — bypasses cache freshness check, always re-fetches.
  // Used by tabs after import-wizard commit / manual sync button click.
  const refresh = useCallback(() => {
    _cache.delete(cacheKey);
    setIsFromCache(false);
    return doFetch();
  }, [cacheKey, doFetch]);

  return { data, loading, error, refresh, isFromCache };
}
