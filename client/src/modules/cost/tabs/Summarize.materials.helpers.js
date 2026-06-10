/**
 * Pure helpers for the Summarize tab's two new materials-aggregation
 * columns (DRAW_MATERIALS + QUOTE_MATERIALS). Lives in `.js` so vanilla
 * node:test can import without the JSX loader — same pattern as
 * ColumnsToggle.helpers / CalcLeadTimeNotice.helpers.
 *
 * Active-set contract (Sprint S-ALT-MAT, PR #39/40/41):
 *   - Standard quote: `state.materials` is a LIVE MIRROR of the active
 *     set (`materials_main` or `materials_alt`), kept in sync by the
 *     SET_MATERIALS_ACTIVE reducer. Reading `state.materials` always
 *     returns whatever set the operator currently picked.
 *   - Complex quote: per-subproduct `subproducts[i].materials` mirrors
 *     `subproducts[i].materials_main|_alt` the same way.
 *   - We intentionally DO NOT dedupe across sub-products. Operator wants
 *     visibility into what's literally in the BOM — duplicate row
 *     entries across sub-products (e.g. "Mat-A, Mat-A, Mat-B") signal
 *     real production parallelism, not a stale render.
 */

function nonEmpty(s) {
  return typeof s === 'string' && s.length > 0;
}

/**
 * Join `drw_material` strings from every material row of a quote.
 * Standard quote walks `state.materials`; Complex quote walks every
 * `subproducts[i].materials`.
 *
 * @param {object|null|undefined} state - Persisted quote state
 * @returns {string} comma-separated material identifiers, '' if none
 */
export function collectDrwMaterials(state) {
  if (!state || typeof state !== 'object') return '';
  if (Array.isArray(state.subproducts) && state.subproducts.length > 0) {
    return state.subproducts
      .flatMap((sp) => (Array.isArray(sp?.materials) ? sp.materials : []))
      .map((m) => m && m.drw_material)
      .filter(nonEmpty)
      .join(', ');
  }
  return (Array.isArray(state.materials) ? state.materials : [])
    .map((m) => m && m.drw_material)
    .filter(nonEmpty)
    .join(', ');
}

/**
 * Join `desc` (Quote materials — operator-typed material identifier
 * sent to customer) from every material row. Same Std-vs-Cpx
 * branching as collectDrwMaterials.
 *
 * @param {object|null|undefined} state
 * @returns {string}
 */
export function collectQuoteMaterials(state) {
  if (!state || typeof state !== 'object') return '';
  if (Array.isArray(state.subproducts) && state.subproducts.length > 0) {
    return state.subproducts
      .flatMap((sp) => (Array.isArray(sp?.materials) ? sp.materials : []))
      .map((m) => m && m.desc)
      .filter(nonEmpty)
      .join(', ');
  }
  return (Array.isArray(state.materials) ? state.materials : [])
    .map((m) => m && m.desc)
    .filter(nonEmpty)
    .join(', ');
}
