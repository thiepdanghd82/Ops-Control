// @ts-check
/**
 * Per-tier row resolver. S-EXPORT-MVP-1.5 persists per-tier breakdown
 * under `quote.result.tiers[N].rows.<section>` (Std) and
 * `quote.result.subproducts[spi].tiers[N].rows.<section>` (Cpx). The
 * top-level `result.rows` mirrors the active tier (legacy callers).
 *
 * Per-tier xlsx exports MUST consume the tier-indexed payload — otherwise
 * every file in a multi-tier zip carries the same active-tier numbers
 * regardless of which MOQ the filename advertises. This module is the
 * single, audited entry point for sheets 03/04/05/08.
 */

/**
 * Resolve a Std quote's row breakdown for the requested tier + section.
 * Falls back to the active-tier mirror for legacy quotes that pre-date
 * the per-tier payload.
 *
 * @param {object} result      quote.result
 * @param {number} tierIdx     requested tier index
 * @param {string} section     one of 'materials_main' | 'materials_alt' | 'inks' | 'processes'
 * @returns {Array|null}       row array (possibly empty) or null when nothing was persisted
 */
export function pickStdTierRows(result, tierIdx, section) {
  if (!result || typeof result !== 'object') return null;
  const tierRows = result.tiers?.[tierIdx]?.rows;
  if (tierRows && Array.isArray(tierRows[section])) return tierRows[section];
  const mirror = result.rows?.[section];
  return Array.isArray(mirror) ? mirror : null;
}

/**
 * Resolve a Cpx quote's row breakdown for a given subproduct + tier +
 * section. Mirrors the same fallback chain as `pickStdTierRows`.
 *
 * @param {object} result
 * @param {number} spi         subproduct index
 * @param {number} tierIdx
 * @param {string} section
 * @returns {Array|null}
 */
export function pickCpxTierRows(result, spi, tierIdx, section) {
  if (!result || typeof result !== 'object') return null;
  const sp = result.subproducts?.[spi];
  if (!sp) return null;
  const tierRows = sp.tiers?.[tierIdx]?.rows;
  if (tierRows && Array.isArray(tierRows[section])) return tierRows[section];
  const mirror = sp.rows?.[section];
  return Array.isArray(mirror) ? mirror : null;
}

/**
 * Sum `setup_cost` / `run_cost` from a row array. Used to derive
 * subtotals for non-active tiers (the `result.bd_*` aggregates are
 * active-tier only). Total = sum(setup) + sum(run); rows missing either
 * field contribute 0 for that bucket.
 *
 * @param {Array|null} rows
 * @returns {{ setup: number, run: number, total: number, hasAny: boolean }}
 */
export function sumRowCosts(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { setup: 0, run: 0, total: 0, hasAny: false };
  }
  let setup = 0;
  let run = 0;
  let any = false;
  for (const row of rows) {
    if (!row) continue;
    const s = Number(row.setup_cost);
    const r = Number(row.run_cost);
    if (Number.isFinite(s)) {
      setup += s;
      any = true;
    }
    if (Number.isFinite(r)) {
      run += r;
      any = true;
    }
  }
  return { setup, run, total: setup + run, hasAny: any };
}

/**
 * Convenience: read `quote.state.active_moq_idx`, defaulting to 0.
 * @param {object} quote
 * @returns {number}
 */
export function getActiveIdx(quote) {
  return Number(quote?.state?.active_moq_idx) || 0;
}

/**
 * MOQ value for the requested tier — used by the [active-tier] footnote
 * so operators see which MOQ each label refers to.
 *
 * @param {object} quote
 * @param {number} tierIdx
 * @returns {number|null}
 */
export function getTierMoq(quote, tierIdx) {
  const state = quote?.state || {};
  if (tierIdx === 0) {
    const n = Number(state.moq);
    return Number.isFinite(n) ? n : null;
  }
  const em = (state.extra_moqs || [])[tierIdx - 1];
  const n = Number(em?.moq);
  return Number.isFinite(n) ? n : null;
}
