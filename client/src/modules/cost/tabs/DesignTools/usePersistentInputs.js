/**
 * usePersistentInputs — useState that auto-persists to sessionStorage.
 *
 * Sprint 14e — Design Tools tabs unmount when the operator switches
 * to another sidebar tab (CostModule.jsx swaps the lazy component on
 * activeTab change). Plain `useState(createInputs())` resets every
 * remount, throwing away in-progress designs. This hook hydrates from
 * sessionStorage on first mount and writes back on every change so
 * a tab switch round-trips cleanly.
 *
 * Why session, not local: working drafts shouldn't outlive the
 * browser session — operators expect a fresh state next morning.
 * Save-to-server (history) is the right place for cross-session
 * recall, NOT background storage.
 *
 * Robust to JSON parse failures + localStorage quota: any error
 * collapses to the default state without crashing the tab.
 */
import { useEffect, useState } from 'react';

export default function usePersistentInputs(key, makeDefault) {
  const [state, setState] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return makeDefault();
      const saved = JSON.parse(raw);
      // Merge over defaults so a schema bump (new fields added later)
      // doesn't leave the persisted state missing keys — the defaults
      // backfill them.
      return { ...makeDefault(), ...saved };
    } catch {
      return makeDefault();
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* quota / private mode — UX still works without persistence */
    }
  }, [key, state]);

  return [state, setState];
}
