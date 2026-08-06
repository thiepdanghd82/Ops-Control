/* eslint-disable react-refresh/only-export-components --
   Co-locates the provider + useWindowManager hook, same pattern as
   CostLibContext / LibraryPicker. */
/**
 * WindowManagerContext — React glue over the pure windowManagerReducer.
 *
 * Lightweight on purpose: this module does NOT import react-rnd or any
 * window chrome, so it can be mounted in the shell unconditionally
 * without shipping the drag/resize lib to classic (flag-OFF) users —
 * that weight lives only in the lazily-loaded <WindowLayer>.
 *
 * When `enabled` is false the provider is an inert passthrough: it holds
 * an empty store, never touches localStorage, and exposes no-op handlers
 * so consumers (App shell) can call useWindowManager() unconditionally.
 */
import { createContext, useContext, useReducer, useEffect, useMemo, useCallback } from 'react';
import {
  windowManagerReducer,
  initialWindowState,
  WM_ACTIONS as A,
} from './windowManagerReducer.js';
import {
  isSingleton,
  isLandingTab,
  isFixedTab,
  serializeLayout,
  deserializeLayout,
  focusedTabId as selectFocusedTabId,
} from './windowLogic.js';
import { TAB_COMPONENTS, tabTitle } from '../modules/cost/CostModule.jsx';

const LS_KEY = 'ops_window_layout_v1';

const WindowManagerContext = createContext(null);

export function useWindowManager() {
  const v = useContext(WindowManagerContext);
  if (!v) throw new Error('useWindowManager must be used inside <WindowManagerProvider>');
  return v;
}

// A tab is renderable (not stale) if it's home, a landing grid, or a
// registered lazy tab. Used to drop stale ids on hydrate.
function isKnownTab(tabId) {
  return tabId === 'home' || isLandingTab(tabId) || Object.hasOwn(TAB_COMPONENTS, tabId);
}

function openAction(tabId, rect) {
  return {
    type: A.OPEN,
    payload: {
      tabId,
      title: tabTitle(tabId),
      singleton: isSingleton(tabId),
      fixed: isFixedTab(tabId),
      rect,
    },
  };
}

// Lazy init: hydrate from localStorage. First-ever enable (no key) seeds
// a Home window so the desktop isn't blank; an explicitly-empty saved
// layout stays empty (user closed everything → sidebar relaunches).
function initEnabled() {
  let stored = null;
  try {
    stored = localStorage.getItem(LS_KEY);
  } catch {
    stored = null;
  }
  if (stored == null) {
    return windowManagerReducer(initialWindowState(), openAction('home'));
  }
  try {
    const hydrated = deserializeLayout(JSON.parse(stored), isKnownTab);
    if (hydrated) return hydrated;
  } catch {
    /* corrupt JSON → fall through to empty */
  }
  return initialWindowState();
}

export function WindowManagerProvider({ enabled, children }) {
  // Hydrate from localStorage in the reducer init. The flag can start
  // false (runtime-config still fetching) and flip true later; the App
  // remounts this provider via a `key` on that transition, so init runs
  // with the resolved `enabled` — no setState-in-effect needed.
  const [store, dispatch] = useReducer(windowManagerReducer, enabled, (en) =>
    en ? initEnabled() : initialWindowState()
  );

  // Persist layout on change (only when enabled). MOVE/RESIZE commit on
  // drag/resize STOP so this fires at bounded rate. The first write after
  // mount re-serializes the just-hydrated store (no clobber).
  useEffect(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(serializeLayout(store)));
    } catch {
      /* private mode */
    }
  }, [enabled, store]);

  const openWindow = useCallback((tabId, rect) => {
    if (!tabId) return;
    dispatch(openAction(tabId, rect));
  }, []);
  const focusWindow = useCallback((id) => dispatch({ type: A.FOCUS, payload: { id } }), []);
  const minimizeWindow = useCallback((id) => dispatch({ type: A.MINIMIZE, payload: { id } }), []);
  const maximizeWindow = useCallback((id) => dispatch({ type: A.MAXIMIZE, payload: { id } }), []);
  const restoreWindow = useCallback((id) => dispatch({ type: A.RESTORE, payload: { id } }), []);
  const closeWindow = useCallback((id) => dispatch({ type: A.CLOSE, payload: { id } }), []);
  const moveWindow = useCallback(
    (id, x, y) => dispatch({ type: A.MOVE, payload: { id, x, y } }),
    []
  );
  const resizeWindow = useCallback(
    (id, w, h, x, y) => dispatch({ type: A.RESIZE, payload: { id, w, h, x, y } }),
    []
  );

  const focusedTabId = useMemo(() => selectFocusedTabId(store), [store]);

  const value = useMemo(
    () => ({
      enabled: !!enabled,
      windows: store.windows,
      focusedTabId,
      openWindow,
      focusWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      closeWindow,
      moveWindow,
      resizeWindow,
    }),
    [
      enabled,
      store.windows,
      focusedTabId,
      openWindow,
      focusWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      closeWindow,
      moveWindow,
      resizeWindow,
    ]
  );

  return <WindowManagerContext.Provider value={value}>{children}</WindowManagerContext.Provider>;
}
