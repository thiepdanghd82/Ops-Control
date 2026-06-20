/**
 * CostSummaryBar visibility predicate (Sprint S-SUMBAR-HIDE / 2026-06-19).
 *
 * Henry's 4-screenshot request: hide the persistent TIER/EAU/TTL.MAT/
 * PROCESS/PACK&SHIP/SUBTOTAL/SELL/TARGET/VA/CONTR/GM strip on the
 * tabs where it either duplicates content shown below (Cost Breakdown
 * has Selling/unit + Target/unit tables; Summarize has the big tier
 * dashboard) or is unrelated to the tab's purpose (Balancing shows
 * per-process throughput; Legend is read-only formula reference).
 *
 * Pattern: KEEP on data-entry tabs (operator edits → live margin
 * feedback drives "am I making money?" decisions); HIDE on
 * analysis/reference tabs (already showing the same info, or noise).
 *
 * Tab IDs grep-verified against SUB_TABS in StandardCalc.jsx:67-77 +
 * ComplexCalc.jsx:51-59 (per Lesson 7 — B3e burned a sprint by
 * guessing 'machine-technical' instead of the canonical 'lib-machine-
 * tech'; here Cpx uses 'summary' singular while Std uses 'summarize',
 * so a single shared Set would silently miss Cpx Summary).
 *
 * Pure / React-free / no side effects so node:test can lock the
 * predicate without booting React.
 */

/** Std sub-tab ids where the strip is HIDDEN (Pricing Worksheet Std). */
export const STD_SUMMARY_BAR_HIDE = new Set([
  'breakdown', // Cost Breakdown — duplicates Selling/unit + Target/unit tables
  'balancing', // Balancing — per-process throughput grid; strip is noise
  'summarize', // Summarize — duplicates the big tier dashboard below
  'legend', // Legend — read-only formula reference; strip is noise
]);

/** Cpx sub-tab ids where the strip is HIDDEN (Pricing Worksheet Cpx). */
export const CPX_SUMMARY_BAR_HIDE = new Set([
  'breakdown', // Cost Breakdown — same rationale as Std
  'summary', // Summarize — note: Cpx uses 'summary' (singular), NOT 'summarize'
]);

/**
 * @param {string|undefined} activeSubTab  current sub-tab id
 * @param {'std' | 'cpx'} kind             which calculator's tabset
 * @returns {boolean}                      true → mount the bar; false → omit
 *
 * Unknown / undefined activeSubTab → default SHOW (safe fallback;
 * matches the "always-on" behavior any future tab would inherit
 * if added to SUB_TABS without an explicit hide decision).
 */
export function shouldShowSummaryBar(activeSubTab, kind) {
  const hide = kind === 'cpx' ? CPX_SUMMARY_BAR_HIDE : STD_SUMMARY_BAR_HIDE;
  return !hide.has(activeSubTab);
}
