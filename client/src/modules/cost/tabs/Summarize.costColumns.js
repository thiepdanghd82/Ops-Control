/**
 * Summarize.costColumns — the five cost cells of an exported row, and the
 * total they are supposed to decompose.
 *
 * Extracted so the decomposition can be ASSERTED. It was wrong from the day
 * the columns shipped and nothing caught it, because a column that is merely
 * too small looks exactly like a column that is right.
 *
 * `result.overhead` and `result.labor_cost` are RUN-ONLY — calcEngine.js:1229
 * subtracts `setup_mach_total` / `setup_labor_total` back out of them. Exporting
 * those left Material + Overhead + Labor + Tooling/pcs + Pack&Ship short of
 * G.Total by exactly the setup cluster, with no column anywhere holding it.
 * Measured 2026-09-22: every one of the 148 live quotes carries a non-zero
 * setup cluster, so every exported row was short, by up to 8.76/pc.
 *
 * `bd_overhead` / `bd_labor` are the same figures with setup left in, and
 * `bd_overhead + bd_labor` is exactly the PROCESS bucket the KPI strip shows —
 * the same defect MES-3-FIX-47 fixed there, which the CSV kept.
 *
 * KNOWN RESIDUAL GAP, recorded rather than papered over. `s_ttl` is
 * `s_mat_cost + overhead + labor_cost + vat_loss + proc_extra_vat + tooling +
 * proc_extra + packing_ship` (calcEngine.js:1142), and the export has no column
 * for `vat_loss`, `proc_extra_vat` or `proc_extra`. All three are zero on all
 * 148 live quotes, so the five columns do sum today — but a quote that ever
 * carries one of them will be short again, and by design rather than by
 * accident. `costColumnsGap()` exists so that case is visible instead of
 * surfacing as another "the export is wrong" report.
 */

const num = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Map a calcAll / aggregateComplex result onto the row's cost cells.
 *
 * @param {object} result
 * @returns {{s_mat_cost:number, overhead:number, labor_cost:number,
 *            tooling:number, pack_ship:number, g_ttl_cost:number}}
 */
export function costColumnsFromResult(result) {
  const r = result && typeof result === 'object' ? result : {};
  return {
    s_mat_cost: num(r.s_mat_cost),
    // Setup INCLUDED — see the file header for why the run-only pair is wrong.
    overhead: num(r.bd_overhead),
    labor_cost: num(r.bd_labor),
    tooling: num(r.tooling),
    pack_ship: num(r.packing_ship),
    g_ttl_cost: num(r.s_ttl),
  };
}

/**
 * What the five cells fail to account for: `s_ttl` minus their sum.
 *
 * 0 on every quote that exists today. Non-zero only when a quote carries
 * `vat_loss`, `proc_extra_vat` or `proc_extra`, none of which has a column.
 *
 * @param {object} result
 * @returns {number}
 */
export function costColumnsGap(result) {
  const c = costColumnsFromResult(result);
  return c.g_ttl_cost - (c.s_mat_cost + c.overhead + c.labor_cost + c.tooling + c.pack_ship);
}
