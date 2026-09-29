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
