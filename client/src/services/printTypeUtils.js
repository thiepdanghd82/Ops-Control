// @ts-check
/**
 * MES-3-FIX-33 — Indigo subtype gating.
 *
 * The CCL Vietnam library lists specific Indigo press subtypes
 * (`Indigo6800`, `Indigo7800`, etc.), NOT the bare `Indigo` literal.
 * Pre-fix code did `ink.print_type === 'Indigo'` in 4 places
 * (calcEngine.calcInk, CalcInks.jsx, ComplexCalc/SubProductRow.jsx ×3),
 * so every operator quote that picked the actual library workcenter
 * fell through to the non-Indigo branch:
 *
 *   • CLICKS column disabled (gated `print_type !== 'Indigo'`)
 *   • coverage_override input disabled
 *   • calcInk used the non-Indigo formula which needs ink_cover_val > 0;
 *     Indigo entries have no `coverage` lib row → run_s = 0 →
 *     `fmtN(0) === '—'` displayed
 *
 * This helper centralises the check so a new subtype (Indigo Vmax /
 * IndigoXXX) automatically opts in without hunting every callsite.
 *
 * @param {string|null|undefined} printType
 * @returns {boolean}
 */
export function isIndigoPrintType(printType) {
  if (!printType) return false;
  return String(printType).startsWith('Indigo');
}
