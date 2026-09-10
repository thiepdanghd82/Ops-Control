// @ts-check
/**
 * Plate cost (Print Design Layout) — pure formula + DDL lookups.
 *
 * DISPLAY-ONLY: nothing here feeds calcEngine / cost / exporter. The Print
 * Design Layout tab shows a computed "Plate cost $" per Henry's formula:
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
