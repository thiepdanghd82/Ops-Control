// @ts-check
/**
 * Plate cost (Print Design Layout) — pure formula + DDL lookups.
 *
 * The Print Design Layout tab shows a computed "Plate cost $" per Henry's
 * formula, and since S-LAYOUT-TOOLCOST that same cost is what a process row
 * assigned to the plate is charged (layoutToolCost.js → calcEngine):
 *
 *   Letter Press : PB * ((W+40)/1000) * ((L+40)/1000) * C  +  (C * F)
 *   Flexo        : PB * ((W+40)/1000) * ((L+40)/1000) * C  +  7.5
 *   Silk screen  : PB * C                       (no geometry)
 *   else / thiếu : null → UI hiện "—"
 *
 * where PB = plate base cost XLOOKUP'd from the `plate_base_cost` DDL section
 * by print type, C = # No of colors, W = Web Width TD (mm), L = Sheet Length
 * MD (mm), F = the operator-entered Film LP cost (USD per color). Print-type
 * matching is whitespace/case-insensitive so "Silkscreen" (dropdown) resolves
 * to "Silk screen" (table key).
 */

import { parseLocaleNumber } from '../utils/format.js';

// Default seed for the plate_base_cost DDL section (VN). Letter Press / Flexo
// / Silk screen plate base + the reserved "Film cost" row (the Letter-press
// film-per-color suggestion).
export const DEFAULT_PLATE_BASE = {
  'Letter Press': 80,
  Flexo: 340,
  'Silk screen': 110,
  'Film cost': 5,
};

// Reserved row inside plate_base_cost holding the film-per-color suggestion —
// NOT a print type, so it is skipped by the base-cost lookup.
const FILM_COST_KEY = 'Film cost';

/** Normalize a print type for matching: NFKC, lowercase, strip ALL whitespace. */
export function normPrintType(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '');
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Plate base cost for a print type from the DDL section (normalized match,
 * skipping the reserved "Film cost" row). Fallback 0 when the section or key
 * is missing.
 */
export function getPlateBaseCost(lib, printType) {
  const tbl = lib?.ddl?.plate_base_cost;
  if (!tbl || typeof tbl !== 'object') return 0;
  const target = normPrintType(printType);
  if (!target) return 0;
  const filmKey = normPrintType(FILM_COST_KEY);
  for (const [k, v] of Object.entries(tbl)) {
    const nk = normPrintType(k);
    if (nk === filmKey) continue; // never resolve the film row as a print type
    if (nk === target) return num(v);
  }
  return 0;
}

/** The reserved "Film cost" value (Letter-press film-per-color suggestion). Fallback 0. */
export function getPlateFilmCost(lib) {
  const tbl = lib?.ddl?.plate_base_cost;
  if (!tbl || typeof tbl !== 'object') return 0;
  const filmKey = normPrintType(FILM_COST_KEY);
  for (const [k, v] of Object.entries(tbl)) {
    if (normPrintType(k) === filmKey) return num(v);
  }
  return 0;
}

/**
 * Pure Plate-cost formula. Returns a finite number, or null when inputs are
 * insufficient (→ UI shows "—"). `plateBase` is resolved by the caller via
 * getPlateBaseCost(lib, pt). The Letter-press film term uses the operator's
 * `filmLp` (Film LP cost $, per color).
 * @param {{pt?:string, colors?:*, webW?:*, sheetL?:*, filmLp?:*}} inputs
 * @param {{plateBase?:*}} [lookup]
 * @returns {number|null}
 */
export function computePlateCost({ pt, colors, webW, sheetL, filmLp } = {}, { plateBase } = {}) {
  const C = num(colors);
  const PB = num(plateBase);
  const norm = normPrintType(pt);
  if (!norm || PB <= 0 || C <= 0) return null;

  // Geometry term (Letter Press + Flexo). Needs W and L > 0.
  const geometry = () => {
    const W = num(webW);
    const L = num(sheetL);
    if (W <= 0 || L <= 0) return null;
    return PB * ((W + 40) / 1000) * ((L + 40) / 1000) * C;
  };

  if (norm === normPrintType('Letter Press')) {
    const g = geometry();
    if (g == null) return null;
    return g + C * num(filmLp);
  }
  if (norm === normPrintType('Flexo')) {
    const g = geometry();
    if (g == null) return null;
    return g + 7.5;
  }
  if (norm === normPrintType('Silk screen')) {
    return PB * C; // Silk screen: no geometry, no film
  }
  // Indigo6800 / anything else → blank
  return null;
}

// ── Print 1–4 (2026-10-05) ────────────────────────────────────────────────
// A layout can carry four plates, as it carries four cutters, for a job
// printed in more than one way — each process row then takes its own plate.
// Print 1 keeps the fields every quote already stores, with pl_plate_cost
// (held but unused until now — empty on every saved quote) as its override;
// Prints 2–4 live in pl_plates[0..2]. The web width and sheet length are
// shared: the four plates belong to one layout.

/** Plates per layout. */
export const PLATE_COUNT = 4;

const PLATE_FIELDS = ['print_type', 'num_colors', 'film_lp_cost', 'plate_cost'];

/**
 * Plate i's inputs (i = 0 is Print 1).
 * @returns {{print_type:*, num_colors:*, film_lp_cost:*, plate_cost:*}}
 */
export function plateAt(state, i) {
  const s = state || {};
  const src =
    i === 0
      ? Object.fromEntries(PLATE_FIELDS.map((f) => [f, s['pl_' + f]]))
      : (Array.isArray(s.pl_plates) && s.pl_plates[i - 1]) || {};
  return Object.fromEntries(PLATE_FIELDS.map((f) => [f, src[f] ?? '']));
}

/**
 * The [field, value] pair onField needs to set one field of plate i: Print 1's
 * own field, or a fresh copy of pl_plates with plate i changed.
 */
export function plateFieldPatch(state, i, field, value) {
  if (i === 0) return ['pl_' + field, value];
  const cur = Array.isArray(state?.pl_plates) ? state.pl_plates.map((p) => ({ ...p })) : [];
  while (cur.length < i) cur.push({});
  cur[i - 1] = { ...cur[i - 1], [field]: value };
  return ['pl_plates', cur];
}

/**
 * Plate i's cost as the Layout tab shows it and its process row is charged:
 * the override when one is entered, else the formula. One function for both,
 * so the screen and the price cannot disagree. `auto` is null for a print type
 * the formula does not price (Indigo); a non-numeric override costs 0.
 * @returns {{cost:number|null, auto:number|null, overridden:boolean}}
 */
export function plateCostAt(state, i, lib) {
  const s = state || {};
  const p = plateAt(s, i);
  const auto = computePlateCost(
    {
      pt: p.print_type,
      colors: p.num_colors,
      webW: s.web_width_td,
      sheetL: s.sheet_length,
      filmLp: p.film_lp_cost,
    },
    { plateBase: getPlateBaseCost(lib, p.print_type) }
  );
  const overridden = String(p.plate_cost).trim() !== '';
  if (!overridden) return { cost: auto, auto, overridden };
  const n = parseLocaleNumber(p.plate_cost);
  return { cost: Number.isFinite(n) ? n : 0, auto, overridden };
}

/** Tool-cost source id of plate i — Print 1 keeps 'plate', which saved rows reference. */
export function plateSourceId(i) {
  return i === 0 ? 'plate' : `plate-${i}`;
}
