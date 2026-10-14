/**
 * useTheme — Phase 9J dark-mode hook.
 *
 * Three-state model:
 *   'system' (default) — follow prefers-color-scheme
 *   'light'            — force light regardless of OS
 *   'dark'             — force dark regardless of OS
 *
 * The active visible theme ('light'|'dark') is always derived, never
 * stored. Persistence stores the user's INTENT ('system'|'light'|'dark')
 * so the setting survives OS theme changes correctly.
 *
 * Why not just localStorage('dark'=true): storing a boolean loses the
 * "follow system" intent. A user who picked "system" should NOT be
 * overridden the next morning when their OS switched from dark to
 * light overnight.
 *
 * Applied to <html data-theme=...> so the CSS override in tokens.css
 * kicks in for every descendant. The same attribute is set in a
 * pre-paint inline script in index.html to avoid a flash of light on
 * page load — see 9J.5.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ops_theme_pref';
const VALID = new Set(['system', 'light', 'dark']);

export function readStoredPref() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID.has(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  // 'system' — consult OS.
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function applyToDom(active) {
  if (typeof document === 'undefined') return;
  if (active === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * React hook. Returns `{ pref, active, setPref }` where `pref` is the
 * user's stored intent and `active` is what's actually rendering.
 *
 * `setPref('system'|'light'|'dark')` persists + applies immediately.
 */
export function useTheme() {
  const [pref, setPrefState] = useState(() => readStoredPref());
  const [active, setActive] = useState(() => resolveTheme(readStoredPref()));

  /* eslint-disable react-hooks/set-state-in-effect --
     Theme resolution is a synchronization between an external input
     (pref stored in localStorage + prefers-color-scheme) and a
     React-owned `active` state that drives the UI. Running resolveTheme
     during render would call matchMedia twice per render; keeping it in
     an effect runs it once per pref change. The DOM mutation
     (applyToDom) MUST be paired with the state update since they both
     reflect the same external change; splitting them causes flicker. */
  // Apply the resolved theme on mount AND on every pref change.
  useEffect(() => {
    const resolved = resolveTheme(pref);
    setActive(resolved);
    applyToDom(resolved);
  }, [pref]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // When pref is 'system', listen for OS-level changes and swap live.
  // The media query's `change` event fires when the user flips their
  // OS theme without reloading our app.
  useEffect(() => {
    if (pref !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const resolved = mq.matches ? 'dark' : 'light';
      setActive(resolved);
      applyToDom(resolved);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((next) => {
    if (!VALID.has(next)) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* quota, private mode */
    }
    setPrefState(next);
  }, []);

  return { pref, active, setPref };
}
