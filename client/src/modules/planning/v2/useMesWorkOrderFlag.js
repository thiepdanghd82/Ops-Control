/**
 * useMesWorkOrderFlag — Sprint MES-1.5 client-side flag discovery.
 *
 * Probes `GET /api/planning/v2/config`. If the endpoint is absent (404)
 * the server flag is OFF → fail-closed. If 200 + `{enabled: true}` the
 * flag is ON and the v2 UI renders. Caches the result in localStorage
 * for 5 minutes so a tab switch doesn't re-fetch every time.
 *
 * Auth note: `/v2/config` lives behind authMiddleware at the prefix
 * level; an unauthenticated probe gets 401 → fail-closed. The hook
 * therefore safe to call on any logged-in route.
 */
import { useEffect, useState } from 'react';

const CACHE_KEY = 'mes.workOrder.flag.cache';
const TTL_MS = 5 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.ts !== 'number' || Date.now() - parsed.ts > TTL_MS) return null;
    return !!parsed.enabled;
  } catch {
    return null;
  }
}

function writeCache(enabled) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ enabled: !!enabled, ts: Date.now() }));
  } catch {
    /* private mode — ignore */
  }
}

export function useMesWorkOrderFlag() {
  const cached = readCache();
  const [state, setState] = useState({
    loading: cached === null,
    enabled: cached === null ? false : cached,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (cached !== null) return; // already resolved from cache

    fetch('/api/planning/v2/config', { credentials: 'include' })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) {
          const body = await r.json().catch(() => ({}));
          const enabled = body?.enabled === true;
          writeCache(enabled);
          setState({ loading: false, enabled, error: null });
        } else {
          // 404 (flag off) / 401 / 5xx — all fail-closed.
          writeCache(false);
          setState({ loading: false, enabled: false, error: null });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, enabled: false, error: 'network' });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
