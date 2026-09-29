// @ts-check
/**
 * Pure tier enumeration — mirrors client/src/services/calcEngine.js
 * enumerateTiers() output shape but DOES NOT recompute KPIs (per task
 * decision 1: NO calcEngine on server).
 *
 * Returns:
 *   [{ idx, label, moq, eau, sellingPrice }, ...]
 *
 * The first entry (idx=0) is the base tier; subsequent entries come
 * from state.extra_moqs[].
 */

/**
 * @param {object} state
 * @returns {{idx:number, label:string, moq:number|null, eau:number|null, sellingPrice:number|null}[]}
 */
export function enumerateTiers(state) {
  if (!state || typeof state !== 'object') return [];
  const out = [
    {
      idx: 0,
      label: 'MOQ 1',
      moq: numOrNull(state.moq),
      eau: numOrNull(state.annual_qty),
      sellingPrice: priceOrNull(state.selling_price),
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
      // The app stores a tier's price as `price` (SET_EXTRA_MOQ / SET_CPLX_EXTRA_MOQ);
      // `selling_price` / `sp` stay as fallbacks for older exporter-shaped data.
      sellingPrice: priceOrNull(em.price ?? em.selling_price ?? em.sp),
    });
  }
  return out;
}

/**
 * The margins of one tier: the top-level result for the active tier, else the per-tier
 * KPIs the client persists at save (`result.tier_kpis`, since 2026-09-29). A quote saved
 * before then has no per-tier KPIs, so a non-active tier reads nulls and prints dashes
 * until it is saved again.
 * @param {object} quote
 * @param {number} tierIdx
 * @returns {{gm:number|null, va:number|null, contribution:number|null}}
 */
export function tierMargins(quote, tierIdx) {
  const state = (quote && quote.state) || {};
  const result = (quote && quote.result) || {};
  const activeIdx = Number(state.active_moq_idx) || 0;
  const src =
    tierIdx === activeIdx
      ? result
      : (Array.isArray(result.tier_kpis) ? result.tier_kpis : []).find(
          (k) => k && k.idx === tierIdx
        ) || {};
  return {
    gm: priceOrNull(src.gm),
    va: priceOrNull(src.va),
    contribution: priceOrNull(src.contribution),
  };
}

/**
 * A price, or null when none is set. Unlike numOrNull, a missing or blank value is
 * null rather than 0 — `Number(null)` and `Number('')` are both 0, which exported a
 * tier with no price as a price of 0.
 */
function priceOrNull(v) {
  if (v == null || v === '') return null;
  return numOrNull(v);
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
