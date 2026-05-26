/**
 * KPI bucket aggregator for the persistent CostSummaryBar at the top
 * of Standard + Complex calculators.
 *
 * One source of truth for the TTL.MAT / PROCESS / PACK&SHIP / SUBTOTAL
 * numbers shown on the top KPI strip. Pure function so it can be
 * unit-tested without JSX, and so the Std + Cpx aggregators feed it
 * the same `result` shape.
 *
 * FIX-47 (2026-05-26) — historical bug in CostSummaryBar:
 *
 *   PRE-FIX:
 *     TTL.MAT = s_mat_cost + bd_ink_setup + bd_ink_run
 *
 *   `s_mat_cost` already includes ink (calcEngine.js:766 →
 *   `s_mat_setup + s_mat_run + s_ink_setup + s_ink_run`), and
 *   `bd_ink_setup === s_ink_setup`, `bd_ink_run === s_ink_run`
 *   (calcEngine.js:921-922). The summation therefore added the ink
 *   subcost twice. Latent since the v1.2 → v1.3 bulk import; surfaced
 *   on quote ARBHBB000790 hardware check 2026-05-26 where operator's
 *   sanity-check `TTL.MAT + PROCESS + PACK&SHIP ≈ SUBTOTAL` did not
 *   hold (TTL.MAT was overstated by `s_ink_setup + s_ink_run` ≈ ink
 *   total).
 *
 *   POST-FIX:
 *     TTL.MAT = s_mat_cost  (already materials + inks)
 *
 * @typedef {Object} KpiBuckets
 * @property {number} ttl_mat   Total material spend (materials + inks).
 * @property {number} process   Manufacturing setup + run (mach + labor + overhead).
 * @property {number} tooling   Tooling amortized per unit (one-shot dies/plates).
 * @property {number} pack_ship Packing + ship-out per unit.
 * @property {number} subtotal  Persisted s_ttl from calcEngine (authoritative).
 *
 * Operator-visible columns in CostSummaryBar today: TTL.MAT / PROCESS
 * / PACK&SHIP / SUBTOTAL. Tooling stays computed here for future use
 * if a dedicated column gets added (Cost Breakdown tab already shows
 * tooling as its own bucket — exporter sheet 08 too).
 *
 * @param {Object|null} result calcEngine output (calcAll for Std,
 *   aggregateComplex for Cpx).
 * @returns {KpiBuckets|null} null when no result yet.
 */
export function getKpiBuckets(result) {
  if (!result) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // `s_mat_cost` already aggregates materials + inks (sales pricing,
  // pre-margin). Do not add `bd_ink_*` — that was the FIX-47 bug.
  const ttl_mat = num(result.s_mat_cost);
  // Manufacturing cluster mirrors Cost Breakdown tab + exporter sheet 08
  // "Manufacturing" 5-bucket roll-up. Setup machine + setup labor lines
  // were previously omitted from this column — they ARE part of s_ttl,
  // so the operator's "sum visible buckets = subtotal" check was off
  // when setups were non-zero (SS/Flexo quotes).
  const process =
    num(result.bd_setup_mach) +
    num(result.bd_setup_labor) +
    num(result.overhead) +
    num(result.labor_cost);
  return {
    ttl_mat,
    process,
    tooling: num(result.tooling),
    pack_ship: num(result.packing_ship),
    subtotal: num(result.s_ttl),
  };
}
