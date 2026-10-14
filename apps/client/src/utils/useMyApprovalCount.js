/**
 * useMyApprovalCount — polls the approval inbox count for the current
 * session. Used by the Sidebar badge so reviewers see when new items
 * land in their queue without reloading the page.
 *
 * Polling behaviour (Sprint 6.5):
 *   - Initial fetch on mount.
 *   - 30s interval thereafter (matches existing team-online heartbeat
 *     cadence — one pulse per 30s is cheap against the 5MB quote file).
 *   - Re-fetches immediately when the tab regains focus so returning
 *     from a meeting doesn't show a stale count.
 *   - Listens for the custom `ops-approvals-changed` window event so
 *     an approval action in this tab (e.g. pressing Approve in the
 *     inbox) refreshes the badge right away rather than waiting for
 *     the next poll tick.
 *   - Silent on error: returns the last known count so a flaky
 *     request doesn't flash the badge to 0.
 *
 * Returns `{ count, refresh }`. Consumers render `count > 0`.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { sharedApi } from '../services/api';

const POLL_MS = 30_000;

export function useMyApprovalCount({ enabled = true } = {}) {
  const [count, setCount] = useState(0);
  // Track the in-flight AbortController so a second `refresh()` (focus
  // event + interval firing at the same time) cancels the stale one.
  // Also aborted on unmount so a late response can't setState on a
  // dead hook instance.
  const abortRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await sharedApi.getMyApprovalCount({ signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const n = Number.isFinite(+r?.count) ? +r.count : 0;
      setCount(n);
    } catch (e) {
      // AbortError = superseded by a newer refresh or the hook
      // unmounted; not a real failure. Other errors are silent so a
      // transient network blip doesn't flicker the badge to 0.
      if (e?.name === 'AbortError') return;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    // Initial fetch mirrors the long-standing AuthContext pattern —
    // React 19's stricter rule flags this but the alternative
    // (subscribe + defer setState) adds complexity for no behavior win.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const id = setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    const onExternalChange = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('ops-approvals-changed', onExternalChange);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('ops-approvals-changed', onExternalChange);
      abortRef.current?.abort();
    };
  }, [refresh, enabled]);

  return { count, refresh };
}
