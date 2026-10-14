/**
 * useSpMoqScalingFlag — Sprint 8 B.4 feature flag (audit §2.2).
 *
 * OFF (default): each SP computes at its own `ship_qty` if set, else
 * activeMoq. Historical behavior preserves every saved quote's number.
 *
 * ON: when an SP is referenced as material by another SP (multi-level
 * BOM), its own `ship_qty` is ignored and it is re-computed at the
 * parent activeMoq. This fixes the under-amortized setup/tooling bug
 * where a child priced for MOQ=100 was being rolled up into an
 * assembly at MOQ=1000 — setup was 10× too high per unit.
 *
 * Stored in `localStorage.ops_sp_moq_scaling` (`"1"` = on). Matches
 * the pattern used by `useBomQtyFlag`. Default off until Finance
 * signs off on the number change.
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'ops_sp_moq_scaling';
const EVT = 'ops-sp-moq-scaling-change';

function readFlag() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useSpMoqScalingFlag() {
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
      /* storage quota / private-mode — UI still flips for current tab */
    }
    window.dispatchEvent(new Event(EVT));
    setEnabled(next);
  }, []);

  return [enabled, toggle];
}
