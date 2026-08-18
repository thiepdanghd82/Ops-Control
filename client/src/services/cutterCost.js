// @ts-check
/**
 * Cutter cost — pure calc for the Cutting Design Layout "Cutter cost 1~4"
 * fields (Std). Per Henry's "Dao cắt" spec (confirmed 2026-08-18):
 *
 *   perim_m       = (Wmm*2 + Lmm*2) / 1000           // part perimeter, metres
 *   circumference = perim_m * cavity                  // cavity = Cut Total/Shot
 *   base          = cutter_cost[type]   (flat number, OR tiered → resolved by circumference)
 *   addon         = cutter_addon[type]  (0 default; Etching 40 / Carving 77)
 *
 *   PERIMETER types {Knife/Wood, Etching/Pinnacle Die, Carving/NC Die, Magnetic Rotary}:
 *       cost = circumference * base + addon
 *   FLAT types (everything else — e.g. Jig&Fixture 45, CNC 45):
 *       cost = base + addon
 *
 * Nothing rolls into the quote TOTAL yet (golden calcEngine unchanged) — this
 * only feeds the layout display + summary. Future work: wire into process /
 * tooling cost once Henry defines how it maps.
 */
import { resolveCutterBaseCost } from './cutterBaseCost.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;

/** Normalise a tool-type string for matching (case + all whitespace). */
export function normType(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Tool types whose cutter cost is perimeter-based (× circumference). */
export const PERIMETER_TYPES = new Set([
  'knife/wood',
  'etching/pinnacledie',
  'carving/ncdie',
  'magneticrotary',
]);

/** True iff the tool type uses the perimeter × base formula (else flat). */
export function isPerimeterType(type) {
  return PERIMETER_TYPES.has(normType(type));
}

/** Part perimeter × cavity, in metres (the spec's "chu vi"). */
export function circumferenceM({ widthMm, lengthMm, cavity } = {}) {
  const perim = (num(widthMm) * 2 + num(lengthMm) * 2) / 1000;
  return perim * num(cavity);
}

/** Raw cutter_cost DDL entry for a type (number | {tiers} | undefined). */
function rawBaseEntry(lib, type) {
  return lib && lib.ddl && lib.ddl.cutter_cost ? lib.ddl.cutter_cost[type] : undefined;
}

/** Base cost resolved for a circumference (tiered → band, flat → number). */
export function getCutterBaseCost(lib, type, circM) {
  return resolveCutterBaseCost(rawBaseEntry(lib, type), circM);
}

/** Additive constant for a type (cutter_addon DDL; 0 default). */
export function getCutterAddon(lib, type) {
  const v = lib && lib.ddl && lib.ddl.cutter_addon ? lib.ddl.cutter_addon[type] : undefined;
  return num(v);
}

/**
 * Compute the cutter cost for a selected type. Returns a rounded number, or
 * '' (blank) when it can't / shouldn't compute:
 *   • no type selected,
 *   • perimeter type with missing product size or cavity,
 *   • flat type with no base configured and no addon.
 */
export function computeCutterCost(type, dims, lib) {
  const t = String(type == null ? '' : type).trim();
  if (!t) return '';
  const d = dims || {};
  const circ = circumferenceM(d);
  const base = getCutterBaseCost(lib, t, circ);
  const addon = getCutterAddon(lib, t);

  if (isPerimeterType(t)) {
    const w = num(d.widthMm);
    const l = num(d.lengthMm);
    const cav = num(d.cavity);
    if (w <= 0 || l <= 0 || cav <= 0) return ''; // not enough geometry yet
    return round2(circ * base + addon);
  }
  // Flat type: blank when nothing is configured (base entry empty AND no addon).
  const raw = rawBaseEntry(lib, t);
  const rawBlank = raw == null || raw === '';
  if (rawBlank && addon === 0) return '';
  return round2(base + addon);
}
