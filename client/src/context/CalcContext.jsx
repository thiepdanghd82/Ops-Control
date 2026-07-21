/* eslint-disable react-refresh/only-export-components -- This file
   co-locates the Provider component with the `useCalc` hook. Splitting
   them would require updating 15+ import sites and the only downside is
   slightly less precise Fast Refresh during dev — not worth the churn. */
/**
 * CalcContext — wires the pure `calcReducer` (see calcReducer.js) into
 * React via useReducer + history/undo + global keyboard shortcuts, and
 * exposes convenience dispatchers + a `useCalc()` hook to consumers.
 *
 * Keeping the reducer + action types in a pure module (calcReducer.js)
 * means unit tests + dispatch-contract tests import the REAL reducer
 * instead of a hand-written replica — catches key-mismatch drift
 * immediately.
 */
import { createContext, useContext, useReducer, useCallback, useEffect, useMemo } from 'react';
import {
  withHistory,
  initialHistory,
  canUndo as canUndoH,
  canRedo as canRedoH,
  HISTORY_ACTIONS,
} from './calcHistory.js';
import { CALC_ACTIONS as A, calcReducer, createInitialState } from './calcReducer.js';

const CalcContext = createContext(null);

export function useCalc() {
  const ctx = useContext(CalcContext);
  if (!ctx) throw new Error('useCalc must be used within CalcProvider');
  return ctx;
}

// ── Provider ──
// Sprint 5.4 wires undo/redo via withHistory around calcReducer.
// Consumers continue reading state fields directly from `useCalc()`
// (stdState, cplxState, isDirty, …) because the provider surfaces
// history.present; the history stack lives behind the scenes.
const historyReducer = withHistory(calcReducer, { limit: 40 });

export function CalcProvider({ children }) {
  const [history, dispatch] = useReducer(historyReducer, createInitialState(), initialHistory);
  const state = history.present;

  // Convenience dispatchers
  const setStdField = useCallback(
    (field, value) => dispatch({ type: A.SET_STD_FIELD, payload: { field, value } }),
    []
  );
  const setStdState = useCallback(
    (updates) => dispatch({ type: A.SET_STD_STATE, payload: updates }),
    []
  );
  const setMaterialField = useCallback(
    (idx, field, value) => dispatch({ type: A.SET_MATERIAL_FIELD, payload: { idx, field, value } }),
    []
  );
  const setInkField = useCallback(
    (idx, field, value) => dispatch({ type: A.SET_INK_FIELD, payload: { idx, field, value } }),
    []
  );
  const setProcessField = useCallback(
    (idx, field, value) => dispatch({ type: A.SET_PROCESS_FIELD, payload: { idx, field, value } }),
    []
  );
  const setCplxField = useCallback(
    (field, value) => dispatch({ type: A.SET_CPLX_FIELD, payload: { field, value } }),
    []
  );
  // Multi-drawing dispatchers — atomic list + active + singular mirror.
  const setStdDrawings = useCallback(
    (kind, files, active) =>
      dispatch({ type: A.SET_STD_DRAWINGS, payload: { kind, files, active } }),
    []
  );
  const setSpDrawings = useCallback(
    (spIdx, kind, files, active) =>
      dispatch({ type: A.SET_SP_DRAWINGS, payload: { spIdx, kind, files, active } }),
    []
  );

  // Sprint 11 P0-2: `version` is the server's `_version` for this quote.
  // Tracked here (not inside qState) so subsequent PATCH calls include
  // it for optimistic-locking checks. Callers that don't know the
  // version pass 0 / undefined — the server treats that as opt-out and
  // merges without the conflict check.
  // Phase 3 — `action` carries the operator's intent ('copy' | 'load').
  // 'copy' resets activeQuoteId so the next save creates a new record
  // and marks pricing_snapshot._synthesized so the next save re-freezes
  // against the current master library. Callers omitting action default
  // to 'load' (BC for every pre-Phase-3 caller).
  const loadQuote = useCallback(
    (quoteType, qState, id, version = 0, action = 'load') =>
      dispatch({
        type: A.LOAD_QUOTE,
        payload: { quoteType, state: qState, id, version, action },
      }),
    []
  );
  const resetStd = useCallback(() => dispatch({ type: A.RESET_STD }), []);
  const resetCplx = useCallback(() => dispatch({ type: A.RESET_CPLX }), []);
  const markClean = useCallback(() => dispatch({ type: A.MARK_CLEAN }), []);
  const setPendingQuote = useCallback(
    (id, type, action, data) =>
      dispatch({ type: A.SET_PENDING_QUOTE, payload: { id, type, action, data } }),
    []
  );
  const clearPendingQuote = useCallback(() => dispatch({ type: A.CLEAR_PENDING_QUOTE }), []);

  // Sprint 5.4: undo/redo hooks + global keyboard shortcuts.
  // Ctrl/Cmd+Z → undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) → redo. When the
  // focus is in an input / textarea / select / contenteditable, we
  // yield to the browser's native text-field undo; otherwise we rewind
  // app state.
  const undo = useCallback(() => dispatch({ type: HISTORY_ACTIONS.UNDO }), []);
  const redo = useCallback(() => dispatch({ type: HISTORY_ACTIONS.REDO }), []);
  const resetHistory = useCallback(() => dispatch({ type: HISTORY_ACTIONS.RESET }), []);
  const canUndo = canUndoH(history);
  const canRedo = canRedoH(history);

  useEffect(() => {
    function isEditableTarget(t) {
      if (!t) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return !!t.isContentEditable;
    }
    function onKey(e) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      if (isEditableTarget(e.target)) return; // let the field handle it
      if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if (key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const value = useMemo(
    () => ({
      ...state,
      dispatch,
      setStdField,
      setStdState,
      setMaterialField,
      setInkField,
      setProcessField,
      setCplxField,
      setStdDrawings,
      setSpDrawings,
      loadQuote,
      resetStd,
      resetCplx,
      markClean,
      setPendingQuote,
      clearPendingQuote,
      // Sprint 5.4 — history API
      undo,
      redo,
      resetHistory,
      canUndo,
      canRedo,
    }),
    [
      state,
      setStdField,
      setStdState,
      setMaterialField,
      setInkField,
      setProcessField,
      setCplxField,
      setStdDrawings,
      setSpDrawings,
      loadQuote,
      resetStd,
      resetCplx,
      markClean,
      setPendingQuote,
      clearPendingQuote,
      undo,
      redo,
      resetHistory,
      canUndo,
      canRedo,
    ]
  );

  return <CalcContext.Provider value={value}>{children}</CalcContext.Provider>;
}
