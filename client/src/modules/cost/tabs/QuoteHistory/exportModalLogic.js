// @ts-check
/**
 * Pure helpers for the Export modal.
 *
 * Lives in a separate `.js` so node:test can import + verify the
 * tier-resolution + validation rules without a JSX loader
 * (same pattern as materialActiveBadgeSummary.js, useAppConfig.js).
 */

/**
 * Tier descriptor surfaced to the modal UI. Mirrors the server's
 * enumerateTiers() shape (server/services/quoteExport/tierUtils.js) so
 * the displayed list matches what the export pipeline will iterate.
 *
 * @typedef {{idx:number, label:string, moq:number|null, eau:number|null}} TierInfo
 */

/**
 * Walk `quote.state` and build the per-tier descriptor list.
 *
 * Pre-MOQ-tiers quotes (no `extra_moqs` or empty array) yield exactly
 * one tier — the base. The modal hides the tier picker entirely in
 * that case (single-tier branch).
 *
 * @param {object|null|undefined} quote
 * @returns {TierInfo[]}
 */
export function buildTierList(quote) {
  const state = quote?.state || {};
  const out = [
    {
      idx: 0,
      label: 'MOQ 1',
      moq: numOrNull(state.moq),
      eau: numOrNull(state.annual_qty),
    },
  ];
  const extras = Array.isArray(state.extra_moqs) ? state.extra_moqs : [];
  for (let i = 0; i < extras.length; i++) {
    const em = extras[i] || {};
    out.push({
      idx: i + 1,
      label: `MOQ ${i + 2}`,
      moq: numOrNull(em.moq),
      eau: numOrNull(em.eau != null ? em.eau : state.annual_qty),
    });
  }
  return out;
}

/**
 * True when the quote has only one tier — the modal should hide the
 * tier picker block entirely and show a one-line summary instead.
 *
 * @param {TierInfo[]} tiers
 */
export function isSingleTier(tiers) {
  return Array.isArray(tiers) && tiers.length <= 1;
}

/**
 * Collapse the modal's selection state to the wire-level `tiers` field.
 *
 * Wire shape (matches server route):
 *   - 'all' when "All tiers" toggle is on, OR all individual checkboxes
 *     are selected (treat as equivalent — same exported artifact).
 *   - number[] of 0-based indices otherwise.
 *
 * @param {{allTiers: boolean, selected: Record<number, boolean>}} sel
 * @param {TierInfo[]} tiers
 * @returns {'all'|number[]}
 */
export function resolveSelectedTiers(sel, tiers) {
  if (sel.allTiers) return 'all';
  const idxs = tiers.map((t) => t.idx).filter((i) => sel.selected[i]);
  if (idxs.length === tiers.length) return 'all';
  return idxs;
}

/**
 * Modal-side validation: when is the Export button disabled?
 *
 * Single-tier quotes always pass (server will use the only tier).
 * Multi-tier: must have either allTiers checked OR at least one
 * individual tier selected.
 *
 * @param {{allTiers: boolean, selected: Record<number, boolean>}} sel
 * @param {TierInfo[]} tiers
 * @returns {boolean}
 */
export function canSubmit(sel, tiers) {
  if (isSingleTier(tiers)) return true;
  if (sel.allTiers) return true;
  for (const t of tiers) {
    if (sel.selected[t.idx]) return true;
  }
  return false;
}

/**
 * Map a QuoteExportError code → i18n key for the toast / banner text.
 *
 * Code → key mapping is centralized here so the modal + any future
 * trigger surface (e.g. context-menu Export) stay in sync.
 *
 * @param {string} code
 * @returns {string}  i18n key
 */
export function errorCodeToI18nKey(code) {
  switch (code) {
    case 'legacy_no_rows':
      return 'qexp.error.legacy_no_rows';
    case 'no-snapshot':
    case 'no_snapshot':
      return 'qexp.error.no_snapshot';
    case 'permission_denied':
      return 'qexp.error.permission';
    case 'NETWORK':
      return 'qexp.error.network';
    case 'ABORT':
      // ABORT is user-driven (modal close) — no toast needed; caller
      // should not surface it. Return generic just in case.
      return 'qexp.error.generic';
    default:
      return 'qexp.error.generic';
  }
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
