// @ts-check
/**
 * withHistory — wrap a reducer with undo/redo history (Sprint 5.4).
 *
 * Design:
 *   - past[]    = previous states (oldest first, newest last)
 *   - present   = the current state consumers read via `state`
 *   - future[]  = states popped by UNDO; REDO pops from here
 *
 * Bypass actions (no history push, and they CLEAR future):
 *   - LOAD_QUOTE / RESET_STD / RESET_CPLX / MARK_CLEAN
 *   - SET_ACTIVE_QUOTE_ID / SET_PENDING_QUOTE / CLEAR_PENDING_QUOTE
 *   These are boundary-like operations — stepping back through a
 *   quote load would be confusing. History clears so the loaded
 *   quote becomes a new starting point.
 *
 * No-op detection: if the wrapped reducer returns the same reference
 * for `present`, we don't push. This avoids history bloat from SET_*
 * actions that no-op (e.g. re-typing the same value).
 *
 * Cap: history.past and history.future bounded by `limit` (default 40).
 * When past exceeds the cap, drop the oldest; same for future.
 *
 * Why wrap + extract `.present`?
 *   Consumers of useCalc() continue to read state fields directly.
 *   The provider surfaces the same shape as before, so no call-site
 *   needs to update. Undo/redo become new hooks alongside dispatch.
 */

// Actions that break the undo chain. Listed as a Set for O(1) lookup.
const HISTORY_BOUNDARY_ACTIONS = new Set([
  'LOAD_QUOTE',
  'RESET_STD',
  'RESET_CPLX',
  'MARK_CLEAN',
  'SET_ACTIVE_QUOTE_ID',
  'SET_PENDING_QUOTE',
  'CLEAR_PENDING_QUOTE',
]);

export const HISTORY_ACTIONS = {
  UNDO: 'HISTORY_UNDO',
  REDO: 'HISTORY_REDO',
  RESET: 'HISTORY_RESET', // future use — manual history wipe without touching state
};

function bounded(arr, limit) {
  return arr.length <= limit ? arr : arr.slice(arr.length - limit);
}

export function withHistory(baseReducer, { limit = 40 } = {}) {
  return function historyReducer(history, action) {
    const { past, present, future } = history;

    if (action.type === HISTORY_ACTIONS.UNDO) {
      if (past.length === 0) return history;
      const previous = past[past.length - 1];
      return {
        past: past.slice(0, -1),
        present: previous,
        future: bounded([present, ...future], limit),
      };
    }
    if (action.type === HISTORY_ACTIONS.REDO) {
      if (future.length === 0) return history;
      const next = future[0];
      return {
        past: bounded([...past, present], limit),
        present: next,
        future: future.slice(1),
      };
    }
    if (action.type === HISTORY_ACTIONS.RESET) {
      return { past: [], present, future: [] };
    }

    // Delegate to base reducer.
    const nextPresent = baseReducer(present, action);

    // Boundary actions clear the undo chain.
    if (HISTORY_BOUNDARY_ACTIONS.has(action.type)) {
      return { past: [], present: nextPresent, future: [] };
    }

    // No-op: don't push.
    if (nextPresent === present) return history;

    return {
      past: bounded([...past, present], limit),
      present: nextPresent,
      future: [],
    };
  };
}

/** Convenience: build the initial history wrapper around an initial state. */
export function initialHistory(initial) {
  return { past: [], present: initial, future: [] };
}

export function canUndo(history) {
  return history.past.length > 0;
}
export function canRedo(history) {
  return history.future.length > 0;
}
