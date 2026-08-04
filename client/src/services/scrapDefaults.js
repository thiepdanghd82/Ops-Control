/**
 * Per-workcenter default process SCRAP%.
 *
 * Policy (2026-07): a fresh process row seeds scrap = 0 (no scrap). The ONLY
 * workcenter with a non-zero default is FQC, which defaults to 10%. The match
 * is case-insensitive on the workcenter string. Everything else = 0.
 *
 * Pure + React-free so it unit-tests under node:test (same convention as
 * printTypeUtils.js / layoutFieldSync.js). Shared by both the Standard
 * (CalcProcesses.jsx) and Complex (SubProductRow.jsx) workcenter-set paths.
 */

/** Workcenters that carry a non-zero default scrap fraction. Keyed UPPER-case. */
export const WORKCENTER_SCRAP_DEFAULTS = { FQC: 0.1 };

/**
 * Default scrap fraction for a workcenter — 0.10 for FQC (case-insensitive),
 * else 0.
 * @param {string} wc
 * @returns {number} fraction (0.10, not 10)
 */
export function defaultScrapForWorkcenter(wc) {
  if (!wc) return 0;
  const key = String(wc).trim().toUpperCase();
  return WORKCENTER_SCRAP_DEFAULTS[key] ?? 0;
}

/**
 * Decide the scrap_pct to write when a process row's WORKCENTER changes.
 *
 * Auto-fills the new workcenter's default ONLY while the current scrap is still
 * at an auto/default value — i.e. 0/empty, or exactly the PREVIOUS workcenter's
 * auto default (so FQC→10 auto-fills, then changing away resets 10→0). A value
 * the operator typed by hand is NEVER clobbered.
 *
 * @param {string} prevWc  workcenter before the change
 * @param {string} nextWc  workcenter after the change
 * @param {number|null|undefined} currentScrap  row's current scrap_pct fraction
 * @returns {{changed: boolean, value: number}}  changed=false → leave as-is
 */
export function resolveScrapOnWorkcenterChange(prevWc, nextWc, currentScrap) {
  const nextDefault = defaultScrapForWorkcenter(nextWc);
  const prevDefault = defaultScrapForWorkcenter(prevWc);
  const cur = currentScrap == null ? 0 : Number(currentScrap) || 0;

  // "Untouched" = still 0/empty, or still sitting on the prior workcenter's
  // auto default. Anything else is an operator-typed value → keep it.
  const isAtDefault = cur === 0 || cur === prevDefault;
  if (!isAtDefault) return { changed: false, value: cur };
  if (cur === nextDefault) return { changed: false, value: cur };
  return { changed: true, value: nextDefault };
}

/**
 * Reset every process row's scrap to its workcenter default — 0 for all, 0.10
 * for FQC. Used on COPY so a copied quote starts fresh under the same policy as
 * a brand-new RFQ.
 *
 * This is a DELIBERATE full reset: unlike resolveScrapOnWorkcenterChange (which
 * preserves an operator-typed scrap), Copy overwrites EVERY row regardless of
 * the source value. Clones — never mutates the input rows.
 *
 * @param {Array<object>} processes
 * @returns {Array<object>} new array (empty if input is not an array)
 */
export function resetProcessesScrap(processes) {
  if (!Array.isArray(processes)) return [];
  return processes.map((row) =>
    row ? { ...row, scrap_pct: defaultScrapForWorkcenter(row.workcenter) } : row
  );
}
