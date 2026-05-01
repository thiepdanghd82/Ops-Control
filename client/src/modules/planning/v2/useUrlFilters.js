/**
 * useUrlFilters — Sprint MES-1.5 URL ⇄ state sync for list-page filters.
 *
 * The app has no router (D2). Filters survive browser refresh by living
 * in `window.location.search`. `setFilter(key, value)` updates the
 * mirror state AND `window.history.replaceState` so the URL stays in
 * sync but doesn't pollute the back-button stack.
 *
 * Resets `page` to 1 when any non-pagination filter changes — operators
 * always expect "I changed the filter, give me page 1".
 *
 * TODO(router-migration): when the app adopts a real router, swap this
 * for the router's native query-string sync.
 */
import { useCallback, useState } from 'react';

const DEFAULTS = { status: '', q: '', from: '', to: '', page: 1, pageSize: 50 };

function readFromUrl() {
  if (typeof window === 'undefined') return { ...DEFAULTS };
  const sp = new URLSearchParams(window.location.search);
  return {
    status: sp.get('status') || '',
    q: sp.get('q') || '',
    from: sp.get('from') || '',
    to: sp.get('to') || '',
    page: Math.max(1, parseInt(sp.get('page') || '1', 10) || 1),
    pageSize: [25, 50, 100].includes(parseInt(sp.get('pageSize'), 10))
      ? parseInt(sp.get('pageSize'), 10)
      : 50,
  };
}

function writeToUrl(filters) {
  if (typeof window === 'undefined') return;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (k === 'page' && v === 1) continue;
    if (k === 'pageSize' && v === 50) continue;
    if (v !== '' && v != null) sp.set(k, String(v));
  }
  const qs = sp.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState({}, '', url);
}

export function useUrlFilters() {
  const [filters, setFilters] = useState(readFromUrl);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key !== 'page' && key !== 'pageSize') next.page = 1;
      writeToUrl(next);
      return next;
    });
  }, []);

  return [filters, setFilter];
}
