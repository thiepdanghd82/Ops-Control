/**
 * rfqColors — tiny observable store for per-RFQ text color overrides.
 *
 * Used by both Cost Breakdown (Summarize) and Quote History tables so the
 * right-click → color bar choice sticks across tabs and page reloads. Keyed
 * by the RFQ number string (whatever the user sees in the RFQ NO column);
 * value is a CSS color string, or null/undefined to clear.
 *
 * Persisted to localStorage; listeners are notified on every set so React
 * components subscribed via useRfqColors re-render in sync.
 */
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'ops.rfqColors.v1';

/** Palette shown in the context menu color bar (matches macOS Finder tags). */
export const RFQ_COLOR_PALETTE = [
  { key: 'red', color: '#ef4444', label: 'Red' },
  { key: 'orange', color: '#f97316', label: 'Orange' },
  { key: 'yellow', color: '#eab308', label: 'Yellow' },
  { key: 'green', color: '#22c55e', label: 'Green' },
  { key: 'blue', color: '#3b82f6', label: 'Blue' },
  { key: 'purple', color: '#a855f7', label: 'Purple' },
  { key: 'gray', color: '#64748b', label: 'Gray' },
];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let state = load();
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function getRfqColor(rfq) {
  if (!rfq) return null;
  return state[rfq] || null;
}

export function setRfqColor(rfq, color) {
  if (!rfq) return;
  // Replace the whole object so useSyncExternalStore's identity check fires.
  if (color) state = { ...state, [rfq]: color };
  else {
    const { [rfq]: _drop, ...rest } = state;
    state = rest;
  }
  persist();
  emit();
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

/** React hook — returns the current colors map and re-renders on changes. */
export function useRfqColors() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
