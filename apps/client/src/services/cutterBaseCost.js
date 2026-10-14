// @ts-check
/**
 * Cutter Base Cost — polymorphic value + pure resolver.
 *
 * A cutter_cost[toolType] value is EITHER:
 *   • flat  : a number / numeric string (today's shape, unchanged), OR
 *   • tiered: { tiers: [{ upto_m, cost }, ...] } — cost by circumference (m),
 *     ascending by upper bound, with the LAST tier upto_m: null (catch-all
 *     "above"). The existing sync (reconcileToolLife / renameToolLifeKey /
 *     deleteObjectKey) is value-agnostic, so a {tiers} object rides along.
 *
 * DATA + EDITOR + RESOLVER ONLY — nothing consumes this yet. A future
 * getCutterBaseCost(lib, toolType, circumferenceM) would call
 * resolveCutterBaseCost, fed by the Cutting layout's magnetic-cylinder
 * circumference. Golden calcEngine unaffected.
 *
 * Boundary rule: UPPER-INCLUSIVE — a tier matches when
 *   upto_m == null (catch-all)  OR  circumferenceM <= upto_m.
 * So Magnetic Rotary { 1.5:150, 2:120, 4:80, ∞:60 } gives
 *   x≤1.5→150, 1.5<x≤2→120, 2<x≤4→80, x>4→60.
 * At EXACTLY 4.0 m this returns 80 (the 2–4 band owns 4.0) — Henry-confirmed 2026-08-18.
 */

// Default seed for Magnetic Rotary (only applied when its value is blank).
export const DEFAULT_MAGNETIC_ROTARY = {
  tiers: [
    { upto_m: 1.5, cost: 150 },
    { upto_m: 2, cost: 120 },
    { upto_m: 4, cost: 80 },
    { upto_m: null, cost: 60 },
  ],
};

const numOr0 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** True iff the entry is a tiered bracket list ({ tiers: [...] }). */
export function isTiered(entry) {
  return !!entry && typeof entry === 'object' && Array.isArray(entry.tiers);
}

/** Flat value → a single catch-all tiered entry (editor starting point). */
export function toTiered(flatValue) {
  return { tiers: [{ upto_m: null, cost: numOr0(flatValue) }] };
}

/** Tiered entry → flat value = the catch-all (or last) tier's cost. */
export function toFlat(entry) {
  if (!isTiered(entry)) return entry;
  const tiers = entry.tiers;
  const catchAll = tiers.find((t) => t && t.upto_m == null);
  const src = catchAll || tiers[tiers.length - 1];
  return numOr0(src && src.cost);
}

/** Sort tiers ascending by upper bound; null/non-finite (catch-all/incomplete) last. */
export function normalizeTiers(tiers) {
  const arr = (Array.isArray(tiers) ? tiers : []).filter((t) => t && typeof t === 'object');
  const upper = (t) => {
    if (t.upto_m == null) return Infinity;
    const u = Number(t.upto_m);
    return Number.isFinite(u) ? u : Infinity;
  };
  return [...arr].sort((a, b) => upper(a) - upper(b));
}

/**
 * Resolve a cutter base cost for a circumference (metres).
 *   • flat entry (number / numeric string) → the number.
 *   • tiered entry → FIRST band (ascending) where upto_m == null OR x <= upto_m.
 *   • malformed / no match → 0.
 * Guards NaN/undefined; an unknown circumference (NaN) resolves to the catch-all.
 */
export function resolveCutterBaseCost(entry, circumferenceM) {
  if (entry == null) return 0;
  if (!isTiered(entry)) {
    const n = Number(entry);
    return Number.isFinite(n) ? n : 0;
  }
  const x = Number(circumferenceM);
  for (const t of normalizeTiers(entry.tiers)) {
    if (t.upto_m == null) return numOr0(t.cost); // catch-all
    const u = Number(t.upto_m);
    if (Number.isFinite(u) && x <= u) return numOr0(t.cost); // upper-inclusive
    // non-finite upper bound (incomplete tier) → skip
  }
  return 0;
}

// ── Editor helpers (pure; tier-list ops, no live reorder while typing) ──

/** Immutable patch of one tier field. */
export function setTierField(tiers, idx, field, value) {
  return (Array.isArray(tiers) ? tiers : []).map((t, i) =>
    i === idx ? { ...t, [field]: value } : t
  );
}

/** Insert a new blank (non-catch-all) tier just before the catch-all. */
export function addTier(tiers) {
  const arr = Array.isArray(tiers) ? [...tiers] : [];
  const at = arr.findIndex((t) => t && t.upto_m == null);
  const fresh = { upto_m: '', cost: '' };
  if (at === -1) arr.push(fresh);
  else arr.splice(at, 0, fresh);
  return arr;
}

/** Remove a tier by index (the catch-all is never given a remove control). */
export function removeTier(tiers, idx) {
  return (Array.isArray(tiers) ? tiers : []).filter((_, i) => i !== idx);
}
