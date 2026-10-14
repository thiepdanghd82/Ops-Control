/**
 * smartCache — renderer-side wrapper around the Electron smart-client engine
 * (desktop/smart-client.js + desktop/native/cache.js). Active only in
 * mode === 'smart'; passes through to direct HTTP otherwise.
 *
 * Exposes 3 capabilities:
 *
 *   1. cacheFirstList(table, fetchHttp) — read from local SQLite cache,
 *      fall back to HTTP, repopulate cache on success. Returns instantly
 *      from cache while a background HTTP refresh runs (stale-while-
 *      revalidate). Tables must match smart-client's SYNC_TABLES.
 *
 *   2. enqueueOrSend({ method, url, body, headers }) — when offline,
 *      drop the request into the SQLite outbox so smart-client can replay
 *      it once the network returns. When online, fetch immediately.
 *
 *   3. useSyncStatus() — React hook returning { online, pending,
 *      lastSyncAt, remoteUrl } from the smart-client broadcast channel.
 *
 * Stale-while-revalidate trade-off: UI renders instantly with cached
 * data even if it's slightly stale. Background HTTP completes within
 * ms-to-seconds and triggers a re-render via callback. Network failures
 * silently fall back to cached data. Acceptable for master-data tables
 * (materials, machines) — NOT for write-receipts or live counters.
 */

import { useState, useEffect } from 'react';
import desktop from './desktopBridge';

// Tables the smart-client engine pulls into local cache. Wrapper rejects
// list() requests for any other table since they wouldn't be populated.
const SYNCABLE = new Set([
  'customers',
  'products',
  'machine_profiles',
  'rate_tables',
  'permission_groups',
  'library_inks',
  'library_materials',
]);

function isSmartMode(modeHint) {
  // Caller can pass mode if they already know it (avoids an extra IPC).
  // Otherwise we're conservative and default to disabled — smart UI is
  // opt-in per call.
  return modeHint === 'smart';
}

/**
 * Cache-first list read. Resolves with `{ rows, source }` where source
 * is 'cache' (offline or fast-path) or 'http' (live fetch).
 *
 * The fetcher you pass should return an array of rows. We hand each row
 * to the cache via cacheUpsert so future reads hit. Row id is inferred
 * from `row.id || row._id || row.code || row.name`.
 */
export async function cacheFirstList(table, fetchHttp, opts = {}) {
  const { mode = 'embedded' } = opts;
  if (!desktop.cache.available || !isSmartMode(mode) || !SYNCABLE.has(table)) {
    // No cache layer — straight pass-through.
    const rows = await fetchHttp();
    return { rows, source: 'http' };
  }

  // Read cache snapshot synchronously-ish (one IPC). May return [] on
  // first run (cache empty before first pull completes).
  const cached = await desktop.cache.list(table).catch(() => []);

  // Fire HTTP refresh in background but don't block on it. If we have
  // cached rows, return them immediately; otherwise await HTTP.
  const refresh = (async () => {
    try {
      const fresh = await fetchHttp();
      if (Array.isArray(fresh)) {
        // Repopulate cache. Best-effort — failures don't bubble up.
        for (const row of fresh) {
          const id = row?.id || row?._id || row?.code || row?.name;
          if (id != null) {
            desktop.cache.upsert(table, String(id), row).catch(() => {});
          }
        }
      }
      return fresh;
    } catch {
      return null; // network failure — caller already has cached rows
    }
  })();

  if (cached && cached.length > 0) {
    // Stale-while-revalidate: return cached immediately, let refresh
    // run async. Caller can subscribe via the optional onRefresh
    // callback to update UI when fresh rows land.
    if (typeof opts.onRefresh === 'function') {
      refresh.then((fresh) => {
        if (fresh) opts.onRefresh(fresh);
      });
    }
    return { rows: cached, source: 'cache' };
  }

  const fresh = await refresh;
  return { rows: fresh || [], source: fresh ? 'http' : 'cache-empty' };
}

/**
 * Send a write OR enqueue it for later. Returns either the fetch Response
 * (when sent live) or `{ queued: true, id, queued_at }` when dropped into
 * the outbox. Caller should treat the queued case as a soft-success: the
 * mutation will be retried by smart-client when the network comes back.
 */
export async function enqueueOrSend(
  { method, url, body, headers },
  { mode = 'embedded', online } = {}
) {
  if (!desktop.cache.available || !isSmartMode(mode)) {
    // Pass through to fetch. Caller handles errors.
    return fetch(url, {
      method,
      headers: headers || (body ? { 'Content-Type': 'application/json' } : {}),
      body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      credentials: 'include',
    });
  }

  // If we know we're offline, queue immediately without trying network.
  if (online === false) {
    const result = await desktop.cache.queueWrite({ method, url, body, headers });
    return { queued: true, ...result };
  }

  // Try live first; on network failure, queue.
  try {
    const res = await fetch(url, {
      method,
      headers: headers || (body ? { 'Content-Type': 'application/json' } : {}),
      body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      credentials: 'include',
    });
    return res;
  } catch (err) {
    // Network-layer failure (DNS, connection refused, abort) — queue it.
    const result = await desktop.cache.queueWrite({ method, url, body, headers });
    return { queued: true, queueReason: err.message, ...result };
  }
}

/**
 * React hook for sync status. Subscribes to smart-client broadcasts
 * + does an initial pull. Returns:
 *
 *   { online: boolean|null, pending: number, lastSyncAt: number, remoteUrl: string }
 *
 * `online === null` means we haven't received a status update yet.
 */
export function useSyncStatus() {
  const [status, setStatus] = useState({
    online: null,
    pending: 0,
    lastSyncAt: 0,
    remoteUrl: '',
  });

  useEffect(() => {
    if (!desktop.cache.available) return undefined;
    let cancelled = false;
    // Initial fetch — broadcasts only fire on change, so without this
    // first read we'd render stale defaults until something changes.
    desktop.cache
      .syncStatus()
      .then((s) => {
        if (!cancelled && s) setStatus((prev) => ({ ...prev, ...s }));
      })
      .catch(() => {});
    const off = desktop.cache.onSyncStatus((s) => {
      if (!cancelled && s) setStatus(s);
    });
    return () => {
      cancelled = true;
      if (typeof off === 'function') off();
    };
  }, []);

  return status;
}
