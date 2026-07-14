/**
 * rfqTableView — pure sort + filter + search pipeline for the RFQ Tracking
 * table. Display-only: never mutates the source rows, never touches the
 * server. Extracted from RfqTracking.jsx so the logic is unit-testable
 * (the repo uses vanilla node:test, no React test harness).
 *
 * Row edits are keyed by a STABLE `_rid` (see assignRids / applyEditByRid),
 * NOT the paginated/sorted display index — sort + filter reorder the visible
 * rows, so editing by index would hit the wrong source row.
 *
 * Column type contract (from RfqTracking.COLUMNS):
 *   'text' → case-insensitive; 'num' → numeric; 'pct' → fraction stored,
 *   filtered as % (×100); 'date' → ISO 'YYYY-MM-DD' string.
 */

export function isBlank(v) {
  return v == null || String(v).trim() === '';
}

// Non-blank value compare by column type (blanks handled by the caller).
export function compareValues(a, b, type) {
  if (type === 'num' || type === 'pct') {
    const na = Number(a);
    const nb = Number(b);
    if (na < nb) return -1;
    if (na > nb) return 1;
    return 0;
  }
  if (type === 'date') {
    const sa = String(a).slice(0, 10);
    const sb = String(b).slice(0, 10);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}

/**
 * Stable sort by { key, dir }. Blank/empty values ALWAYS sort last, in both
 * directions. Returns a new array of the SAME row references (no clone) so
 * `_rid` identity survives.
 */
export function applySort(rows, sort, columnsByKey) {
  if (!sort || !sort.key || !sort.dir) return rows;
  const col = columnsByKey?.[sort.key];
  const type = col ? col.type : 'text';
  const dir = sort.dir === 'desc' ? -1 : 1;
  return rows
    .map((r, i) => [r, i])
    .sort((A, B) => {
      const a = A[0][sort.key];
      const b = B[0][sort.key];
      const ab = isBlank(a);
      const bb = isBlank(b);
      if (ab && bb) return A[1] - B[1];
      if (ab) return 1; // blank last — ignore dir
      if (bb) return -1;
      const base = compareValues(a, b, type);
      return base !== 0 ? dir * base : A[1] - B[1];
    })
    .map((x) => x[0]);
}

// Tri-state header click: (none|other) → asc → desc → none.
export function cycleSort(current, key) {
  if (!current || current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return null; // was desc → clear
}

// A per-column filter value is "active" if it would actually narrow the set.
export function isFilterActive(fv) {
  if (fv == null) return false;
  if (Array.isArray(fv)) return fv.length > 0;
  if (typeof fv === 'object') return Object.values(fv).some((x) => String(x ?? '').trim() !== '');
  return String(fv).trim() !== '';
}

export function anyFilterActive(filters) {
  return Object.values(filters || {}).some(isFilterActive);
}

/**
 * Does one value pass one column filter?
 *   - array fv       → enum multi-select (exact membership of the string value)
 *   - {min,max} fv   → numeric range (pct compared as ×100); blanks excluded
 *   - {from,to} fv   → date range on the ISO 'YYYY-MM-DD' prefix; blanks excluded
 *   - string fv      → case-insensitive "contains"
 */
export function matchFilter(value, fv, type) {
  if (!isFilterActive(fv)) return true;
  if (Array.isArray(fv)) {
    return fv.includes(String(value ?? '').trim());
  }
  if (fv && typeof fv === 'object' && ('min' in fv || 'max' in fv)) {
    if (isBlank(value)) return false;
    let n = Number(value);
    if (!Number.isFinite(n)) return false;
    if (type === 'pct') n *= 100;
    const min = String(fv.min ?? '').trim();
    const max = String(fv.max ?? '').trim();
    if (min !== '' && n < Number(min)) return false;
    if (max !== '' && n > Number(max)) return false;
    return true;
  }
  if (fv && typeof fv === 'object' && ('from' in fv || 'to' in fv)) {
    if (isBlank(value)) return false;
    const s = String(value).slice(0, 10);
    const from = String(fv.from ?? '').trim();
    const to = String(fv.to ?? '').trim();
    if (from !== '' && s < from) return false;
    if (to !== '' && s > to) return false;
    return true;
  }
  return String(value ?? '')
    .toLowerCase()
    .includes(String(fv).toLowerCase());
}

export function applyColumnFilters(rows, filters, columnsByKey) {
  const active = Object.entries(filters || {}).filter(([, fv]) => isFilterActive(fv));
  if (active.length === 0) return rows;
  return rows.filter((row) =>
    active.every(([key, fv]) => {
      const col = columnsByKey?.[key];
      return matchFilter(row[key], fv, col ? col.type : 'text');
    })
  );
}

export function applyGlobalSearch(rows, search, searchKeys) {
  const q = String(search ?? '')
    .trim()
    .toLowerCase();
  if (!q) return rows;
  const terms = q.split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    const text = (searchKeys || [])
      .map((k) => r[k])
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return terms.every((t) => text.includes(t));
  });
}

// Full pipeline order: global search → per-column filters → sort.
export function buildView(rows, { search, searchKeys, filters, sort, columnsByKey } = {}) {
  let out = applyGlobalSearch(rows, search, searchKeys);
  out = applyColumnFilters(out, filters, columnsByKey);
  out = applySort(out, sort, columnsByKey);
  return out;
}

// Distinct non-blank values for a column (enum multi-select options).
export function distinctValues(rows, key) {
  const set = new Set();
  for (const r of rows || []) {
    const v = String(r[key] ?? '').trim();
    if (v !== '') set.add(v);
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

// ── Stable-id helpers (edit by _rid, never by display index) ──────
export function assignRids(rows, seed = 0) {
  let n = seed;
  return (rows || []).map((r) => (r && r._rid != null ? r : { ...r, _rid: `r${n++}` }));
}

export function applyEditByRid(rows, rid, key, value) {
  return (rows || []).map((r) => (r._rid === rid ? { ...r, [key]: value } : r));
}

export function deleteByRid(rows, rid) {
  return (rows || []).filter((r) => r._rid !== rid);
}

export function replaceByRid(rows, rid, nextRow) {
  return (rows || []).map((r) => (r._rid === rid ? { ...nextRow, _rid: rid } : r));
}

// Strip the in-memory-only `_rid` before persisting to the server.
export function stripRids(rows) {
  return (rows || []).map((r) => {
    if (!r || r._rid == null) return r;
    const { _rid: _drop, ...rest } = r;
    void _drop;
    return rest;
  });
}
