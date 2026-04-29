/**
 * useAbortableFetch — reusable wrapper for the AbortController pattern
 * repeated across Dashboard, QuoteHistory, IFSInventory, PendingApprovals,
 * Summarize, RFQTracker, SampleTracking (Sprints AI/AJ/AN).
 *
 * Callers pass a `fetcher(signal) => Promise<data>`. The hook:
 *   - creates a fresh AbortController every refresh,
 *   - aborts the previous controller automatically,
 *   - aborts on unmount,
 *   - swallows AbortError (not a real failure),
 *   - surfaces other errors via onError.
 *
 * Returns `{ data, setData, loading, error, refresh, abort }`.
 * Callers decide how to render loading / error / empty states.
 * `setData` is exposed so tabs that do optimistic local mutation
 * after a write (e.g. RFQTracker saveData → setData(newList)) can
 * keep a single source of truth instead of maintaining a parallel
 * useState.
 *
 * Why a hook vs a utility: the abortRef + cleanup effect contract is
 * subtle and easy to get wrong (e.g., forgetting to abort on unmount).
 * Centralizing it removes 10+ line of boilerplate per callsite and
 * makes it trivial to add consistent telemetry (request duration,
 * cancel rate) in one place later.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} fetcher
 * @param {unknown[]} deps  reactive inputs — refresh fires on change
 * @param {{ enabled?: boolean, onError?: (err: Error) => void }} opts
 * @returns {{ data: T|null, setData: (v: T|null) => void, loading: boolean, error: Error|null, refresh: () => void, abort: () => void }}
 */
export function useAbortableFetch(fetcher, deps = [], opts = {}) {
  const { enabled = true, onError } = opts;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  // Keep the latest fetcher + onError in refs so identity changes
  // (new arrow-function each render) don't force an effect re-run —
  // `deps` is the contract for when to refetch, not the callback shape.
  const fetcherRef = useRef(fetcher);
  const onErrorRef = useRef(onError);
  fetcherRef.current = fetcher;
  onErrorRef.current = onError;

  const refresh = useCallback(() => {
    if (!enabled) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(() => fetcherRef.current(ctrl.signal))
      .then((result) => {
        if (ctrl.signal.aborted) return;
        setData(result);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (ctrl.signal.aborted) return;
        setError(err);
        if (typeof onErrorRef.current === 'function') {
          try { onErrorRef.current(err); } catch { /* never crash */ }
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  }, [enabled]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!enabled) { setLoading(false); return undefined; }
    refresh();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, setData, loading, error, refresh, abort };
}
