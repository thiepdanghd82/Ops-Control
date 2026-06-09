import { useState, useEffect, useCallback, useMemo } from 'react';
import { EMPTY_FILTER } from '../lib/quoteFilters.js';

// Filter state with built-in debounce so typing does not re-run
// `applyQuoteFilters` on every keystroke. `filter` is the raw value
// (drives the input value); `debouncedFilter` is what the consumer
// feeds into `applyQuoteFilters`.
//
// State lives in-memory only — tab switch clears (intentional v1
// scope). URL sync + sessionStorage persistence deferred to v2.

const DEBOUNCE_MS = 300;

const isActive = (f) =>
  !!(f.query || f.dateFrom || f.dateTo || f.customer || f.part || f.sale);

export function useQuoteFilters(initial) {
  const [filter, setFilter] = useState(() => ({ ...EMPTY_FILTER, ...(initial || {}) }));
  const [debouncedFilter, setDebouncedFilter] = useState(filter);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedFilter(filter), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [filter]);

  const setField = useCallback((name, value) => {
    setFilter((prev) => ({ ...prev, [name]: value }));
  }, []);

  const clearField = useCallback((name) => {
    setFilter((prev) => ({ ...prev, [name]: EMPTY_FILTER[name] }));
  }, []);

  const clearAll = useCallback(() => {
    setFilter({ ...EMPTY_FILTER });
  }, []);

  // hasActiveFilter reflects RAW filter (not debounced) so the Clear-all
  // button appears immediately when the user starts typing.
  const hasActiveFilter = useMemo(() => isActive(filter), [filter]);

  return { filter, debouncedFilter, setField, clearField, clearAll, hasActiveFilter };
}
