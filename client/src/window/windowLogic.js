// @ts-check
/**
 * windowLogic — pure, framework-free helpers for the in-app window
 * manager (Phase 1). No React, no DOM, so node:test imports it directly.
 *
 * Two concerns live here:
 *   1. Singleton classification — which sidebar tabs may open multiple
 *      windows vs open-once-then-focus. Stateful / fixed-sessionStorage-
 *      key tabs are singletons; pure browse/read views may duplicate.
 *   2. Layout (de)serialization for localStorage persistence, with a
 *      stale-tabId filter so a persisted window whose tab no longer
 *      exists is dropped instead of rendering an "unknown tab" panel.
 */

// Base z-index for windows. Sits well below the shared Modal overlay
// (z-index 9500) so a window's own dialogs + global portals stay on top.
export const WINDOW_Z_BASE = 1000;

// Default float rect for a freshly opened window (content-area units).
export const DEFAULT_WINDOW_W = 900;
export const DEFAULT_WINDOW_H = 620;
export const MIN_WINDOW_W = 320;
export const MIN_WINDOW_H = 200;

/**
 * Tabs that are safe to open as MULTIPLE independent windows — pure
 * browse/read surfaces with no fixed writable sessionStorage key that a
 * second instance would stomp. Everything NOT in this set (and every
 * unknown tab) is treated as a SINGLETON (open-once → focus existing),
 * which is the fail-safe against sessionStorage-key collisions and
 * shared-quote confusion.
 *
 * Per review decision (2026-08-06): quote-history + rfq-tracking are
 * SINGLETON (audit-safe) despite being browse-ish — they hold fixed
 * sessionStorage view/handoff keys.
 */
export const MULTI_INSTANCE_TABS = new Set([
  'home',
  'dashboard',
  'lib-inventory',
  'lib-mat',
  'lib-rate',
  'lib-ddl',
  'lib-finance',
  'lib-machine-tech',
  'lib-mfg',
  'lib-rop',
  'npi-parts-list',
  'rfq-tracker',
  'sample-tracking',
  'quote-analysis',
  'approvals-inbox',
  'ink-calc',
  'print-area',
  'metrics',
  'audit-log',
  'help',
]);

/** `landing:<sectionId>` panels are pure grids — always multi-instance. */
export function isLandingTab(tabId) {
  return typeof tabId === 'string' && tabId.startsWith('landing:');
}

/**
 * A tab is a singleton unless it's an explicit multi-instance browse tab
 * or a landing grid. Unknown tabIds default to singleton (fail-safe).
 */
export function isSingleton(tabId) {
  if (isLandingTab(tabId)) return false;
  return !MULTI_INSTANCE_TABS.has(tabId);
}

const VALID_STATES = new Set(['normal', 'min', 'max']);

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Serialize the live store to the persisted layout shape. `prevRect`,
 * `title` and `singleton` are intentionally dropped from most records —
 * title + singleton are recomputed on hydrate; prevRect is only kept for
 * a currently-maximized window so RESTORE after reload returns to the
 * prior float rect.
 */
export function serializeLayout(store) {
  const windows = Array.isArray(store?.windows) ? store.windows : [];
  return {
    v: 1,
    windows: windows.map((w) => {
      const rec = {
        id: w.id,
        tabId: w.tabId,
        x: num(w.x, 0),
        y: num(w.y, 0),
        w: num(w.w, DEFAULT_WINDOW_W),
        h: num(w.h, DEFAULT_WINDOW_H),
        z: num(w.z, WINDOW_Z_BASE),
        state: VALID_STATES.has(w.state) ? w.state : 'normal',
      };
      if (w.state === 'max' && w.prevRect) rec.prevRect = { ...w.prevRect };
      return rec;
    }),
    zTop: num(store?.zTop, WINDOW_Z_BASE),
    counter: num(store?.counter, windows.length),
  };
}

/**
 * Rebuild a store from a persisted layout. `isKnownTab(tabId)` decides
 * whether a window's tab still exists — records that fail are dropped
 * silently (stale-tabId fallback). Returns null when the input is
 * unusable or every window was dropped, so the caller can fall back to a
 * default layout instead of an empty desktop.
 */
export function deserializeLayout(raw, isKnownTab) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.windows)) return null;
  const known = typeof isKnownTab === 'function' ? isKnownTab : () => true;
  const seen = new Set();
  const windows = [];
  for (const w of raw.windows) {
    if (!w || typeof w.tabId !== 'string' || !w.tabId) continue;
    if (!known(w.tabId)) continue;
    const id = typeof w.id === 'string' && w.id ? w.id : `win-${windows.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const rec = {
      id,
      tabId: w.tabId,
      x: num(w.x, 0),
      y: num(w.y, 0),
      w: Math.max(MIN_WINDOW_W, num(w.w, DEFAULT_WINDOW_W)),
      h: Math.max(MIN_WINDOW_H, num(w.h, DEFAULT_WINDOW_H)),
      z: num(w.z, WINDOW_Z_BASE),
      state: VALID_STATES.has(w.state) ? w.state : 'normal',
      singleton: isSingleton(w.tabId),
      prevRect: w.prevRect && typeof w.prevRect === 'object' ? { ...w.prevRect } : null,
    };
    windows.push(rec);
  }
  if (windows.length === 0) return null;
  const maxZ = windows.reduce((m, w) => Math.max(m, w.z), WINDOW_Z_BASE);
  const counter = num(raw.counter, windows.length);
  return { windows, zTop: Math.max(num(raw.zTop, maxZ), maxZ), counter };
}

/**
 * The tabId of the currently focused window — the highest-z window that
 * is not minimized. Drives the sidebar highlight, WarningBar, doc title,
 * and F1 help target when the window manager is on.
 */
export function focusedTabId(store) {
  const win = focusedWindow(store);
  return win ? win.tabId : null;
}

export function focusedWindow(store) {
  const windows = Array.isArray(store?.windows) ? store.windows : [];
  let best = null;
  for (const w of windows) {
    if (w.state === 'min') continue;
    if (!best || w.z > best.z) best = w;
  }
  return best;
}
