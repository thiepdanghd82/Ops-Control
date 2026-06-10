/**
 * Pure helpers for SnapshotPanel — lives in `.js` so vanilla node:test
 * can exercise the derivation logic without the JSX loader (same
 * pattern as ColumnsToggle.helpers / CalcLeadTimeNotice.helpers /
 * Summarize.materials.helpers).
 *
 * The component is presentation-only; ALL non-trivial branching
 * (tone mapping, status copy, count rollup, date format) lives here.
 */

/**
 * Map snapshot source → StatusBadge tone. Persisted = success (green);
 * synthesized = warning (amber, "you're looking at live rates, click
 * Save to freeze"); empty = neutral (gray, no pricing data captured).
 *
 * @param {string} source
 * @returns {'success'|'warning'|'neutral'}
 */
export function resolveSnapshotTone(source) {
  if (source === 'persisted') return 'success';
  if (source === 'synthesized') return 'warning';
  return 'neutral';
}

/**
 * Compact badge label shown next to the panel title. Keep these short
 * — ~10 chars max — they sit inside a sm StatusBadge pill.
 *
 * @param {string} source
 * @returns {string}
 */
export function resolveSnapshotBadgeLabel(source) {
  if (source === 'persisted') return 'Frozen';
  if (source === 'synthesized') return 'Live rates';
  return 'No snapshot';
}

/**
 * Sentence-form copy shown inside the expanded panel — operator-facing,
 * explains what the source flag means + what to do next.
 *
 * @param {string} source
 * @returns {string}
 */
export function resolveSnapshotStatusLabel(source) {
  if (source === 'persisted') {
    return '✓ Frozen at save time — calc uses these rates, not the live library';
  }
  if (source === 'synthesized') {
    return '⚠ Using current library rates — save to freeze a permanent snapshot';
  }
  return '— No pricing data has been captured for this quote';
}

/**
 * Count rolled-up snapshot entries for the side-by-side display. Each
 * count tolerates the snapshot being null / missing the relevant
 * cluster (defensive against pre-Phase-1 saved quotes that load with
 * a null snapshot before the migration heal runs).
 *
 * @param {object|null|undefined} snapshot
 * @returns {{materials: number, rates: number, coverage: number}}
 */
export function countSnapshotEntries(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { materials: 0, rates: 0, coverage: 0 };
  }
  const materials =
    snapshot.materials && typeof snapshot.materials === 'object'
      ? Object.keys(snapshot.materials).length
      : 0;
  const rates =
    snapshot.rates && typeof snapshot.rates === 'object'
      ? Object.keys(snapshot.rates).length
      : 0;
  const coverage = Array.isArray(snapshot.coverage) ? snapshot.coverage.length : 0;
  return { materials, rates, coverage };
}

/**
 * Format an ISO-8601 timestamp as `DD/MM/YYYY HH:mm` (Vietnamese-locale
 * friendly without forcing a locale dependency in node:test). Returns
 * `'—'` for null / undefined / invalid input so the dd cell never goes
 * blank.
 *
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function formatSnapshotDateTime(iso) {
  if (typeof iso !== 'string' || iso.length === 0) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/**
 * Convenience flag for the Pricing Worksheet copy-mode banner.
 * Operator just opened a quote via right-click → Copy, the LOAD_QUOTE
 * reducer reset activeQuoteId + flipped `_synthesized: true`. We don't
 * want to bother the operator on a fresh empty quote (no materials),
 * so gate on materials.length > 0 too.
 *
 * @param {object|null|undefined} state - stdState or cplxState
 * @param {string|number|null|undefined} activeQuoteId
 * @returns {boolean}
 */
export function isCopyMode(state, activeQuoteId) {
  if (activeQuoteId !== null && activeQuoteId !== undefined && activeQuoteId !== '') return false;
  if (!state || typeof state !== 'object') return false;
  const snap = state.pricing_snapshot;
  if (!snap || snap._synthesized !== true) return false;
  // Has user-meaningful data — materials OR subproducts populated.
  const hasMaterials = Array.isArray(state.materials) && state.materials.length > 0;
  const hasSubproducts = Array.isArray(state.subproducts) && state.subproducts.length > 0;
  return hasMaterials || hasSubproducts;
}
