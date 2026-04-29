/**
 * useAutoRefresh — auto-refresh polling hook for multi-user tabs.
 *
 * Why: with N users on LAN, server data changes underneath open tabs.
 * Without polling, a user's tab shows stale list until they navigate
 * away and back. Naive setInterval wastes CPU + bandwidth when tab
 * is hidden / user is on lunch.
 *
 * Features:
 *   - Configurable interval (default 30s)
 *   - Pauses when document.hidden (visibilitychange API)
 *   - Stops when component unmounts (cleanup)
 *   - Returns last-refresh timestamp + manual refresh function
 *   - Skips overlapping calls (in-flight guard)
 *   - Optional connectivity gate (skip when offline)
 *
 * Usage:
 *   const { lastRefreshedAt, refresh, isRefreshing } = useAutoRefresh(
 *     fetchQuoteList,
 *     { intervalMs: 30000 }
 *   );
 *
 *   <button onClick={refresh} disabled={isRefreshing}>↻ Refresh</button>
 *   <small>Updated {lastRefreshedAt.toLocaleTimeString()}</small>
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export function useAutoRefresh(fetchFn, options = {}) {
  const {
    intervalMs = 30000,
    enabled = true,
    runOnMount = false,
    pauseWhenHidden = true,
    skipWhenOffline = true,
  } = options;

  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Use ref to avoid re-creating the timer when fetchFn identity changes
  const fetchRef = useRef(fetchFn);
  useEffect(() => { fetchRef.current = fetchFn; }, [fetchFn]);

  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    if (skipWhenOffline && typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }
    inFlightRef.current = true;
    setIsRefreshing(true);
    setError(null);
    try {
      await fetchRef.current();
      setLastRefreshedAt(new Date());
    } catch (err) {
      setError(err);
    } finally {
      inFlightRef.current = false;
      setIsRefreshing(false);
    }
  }, [skipWhenOffline]);

  useEffect(() => {
    if (!enabled) return undefined;

    let timer = null;
    const tick = async () => {
      // Skip when tab hidden (saves CPU + server load when user not looking)
      if (pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
        return;
      }
      await refresh();
    };

    // Optional initial fetch
    if (runOnMount) {
      tick();
    }

    timer = setInterval(tick, intervalMs);

    // Resume immediately when tab becomes visible (don't wait for next tick)
    const onVis = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        tick();
      }
    };
    if (pauseWhenHidden && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
    }

    return () => {
      if (timer) clearInterval(timer);
      if (pauseWhenHidden && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [enabled, intervalMs, pauseWhenHidden, runOnMount, refresh]);

  return { lastRefreshedAt, refresh, isRefreshing, error };
}

/**
 * Format last-refresh time as "Updated 2 mins ago" / "just now"
 */
export function formatLastRefresh(date) {
  if (!date) return 'never';
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hour = Math.floor(min / 60);
  return `${hour}h ago`;
}
