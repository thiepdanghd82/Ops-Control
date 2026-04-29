/**
 * useBomQtyFlag — Sprint 4.4 feature flag for multiplying BOM qty into
 * Complex aggregation.
 *
 * Default OFF so legacy quotes keep identical numbers until Finance signs
 * off on the qty semantics. When ON:
 *   - Assembly-path aggregate respects the v2 `is_assembly` flag (not
 *     just FG-prefix).
 *   - Sum-fallback weights each SP's cost by its BOM qty entry.
 *
 * Stored in `localStorage.ops_bom_qty` (value "1" = on, anything else =
 * off). A custom window event `ops-bom-qty-change` syncs React state
 * across sibling components (same tab); the standard 'storage' event
 * covers other tabs.
 *
 * Shape: returns `[enabled, toggle]` so callers can show a toggle UI
 * or just read the flag.
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'ops_bom_qty';
const EVT = 'ops-bom-qty-change';

function readFlag() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useBomQtyFlag() {
  const [enabled, setEnabled] = useState(readFlag);

  useEffect(() => {
    const onChange = () => setEnabled(readFlag());
    window.addEventListener(EVT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const toggle = useCallback((nextValue) => {
    const next = typeof nextValue === 'boolean' ? nextValue : !readFlag();
    try {
      if (next) localStorage.setItem(KEY, '1');
      else localStorage.removeItem(KEY);
    } catch {
      // Storage quota / private-mode — toggle state still flips for the
      // current tab; caller sees the change via setEnabled below.
    }
    window.dispatchEvent(new Event(EVT));
    setEnabled(next);
  }, []);

  return [enabled, toggle];
}
