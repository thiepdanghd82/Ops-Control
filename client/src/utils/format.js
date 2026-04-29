// @ts-check
/**
 * Shared formatting helpers for cost module.
 * Previously duplicated inside component files (ComplexCalc, StandardCalc,
 * CalcMaterials…) where they were redefined on every render.
 */

const EMDASH = '\u2014';

/**
 * Convert any value to a finite number; non-numeric or NaN returns fallback.
 * Replaces the scattered `parseFloat(v) || 0` idiom which has two bugs:
 *   1. parseFloat("") → NaN → 0 (ok) but parseFloat("abc") → NaN → 0 silently
 *   2. parseFloat("0") → 0 is falsy, so `|| 0` is fine; but for `|| fallback`
 *      where fallback !== 0, the literal 0 gets replaced — a common bug.
 * safeNum avoids both: explicit isFinite check, fallback only on non-numeric.
 */
export function safeNum(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Locale-safe parseFloat for user input typed in mixed US/VN format.
 * Replaces raw `parseFloat(e.target.value)` at sites where we don't
 * (or can't) route through the DecimalInput component — library admin
 * tables, MOQ/rate grids, RFQ fields.
 *
 * Handles:
 *   "1234.56"   → 1234.56  (US decimal, no separator)
 *   "1,234.56"  → 1234.56  (US full: "," thousands, "." decimal)
 *   "1.234,56"  → 1234.56  (VN full: "." thousands, "," decimal)
 *   "8,5"       → 8.5      (VN short: "," decimal, no thousands) ← the
 *                            scenario where raw parseFloat silently drops
 *                            the decimal ("8,5" → 8)
 *   "0,2342"    → 0.2342   (VN typing in vi-VN locale where `type="number"`
 *                            strips the "." — documented in DecimalInput.jsx)
 *   ""          → NaN      (empty — caller decides fallback)
 *   "abc"       → NaN      (unparseable)
 *
 * Heuristic for tie-breaking: when BOTH "." and "," are present, the
 * one appearing LATER in the string is treated as the decimal separator
 * (the earlier one is stripped as a thousands grouping). When only one
 * of the two is present, it's treated as decimal — even if it looks
 * like thousands — because ambiguity favors the user's typed intent.
 *
 * @param {string | number | null | undefined} v
 * @returns {number} NaN when unparseable; finite number otherwise.
 */
export function parseLocaleNumber(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === '.' || s === ',') return NaN;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let normalized;
  if (hasDot && hasComma) {
    // Whichever comes last wins as decimal; strip the other as thousands.
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastComma > lastDot) {
      // VN: "." thousands, "," decimal.
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US: "," thousands, "." decimal.
      normalized = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Single "," → treat as decimal (VN short form).
    normalized = s.replace(',', '.');
  } else {
    // Single "." or no separator → pass through.
    normalized = s;
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export function fmtN(v, d = 5) {
  if (v == null || isNaN(v) || v === 0) return EMDASH;
  return Number(v).toFixed(d);
}

export function pct(v) {
  if (v == null || isNaN(v)) return EMDASH;
  return (v * 100).toFixed(1) + '%';
}

/** Gross-margin color thresholds (>=20% green, >=10% amber, else red). */
export function gmClr(v) {
  if (v == null) return '#94a3b8';
  if (v >= 0.20) return '#16a34a';
  if (v >= 0.10) return '#d97706';
  return '#dc2626';
}

/** Integer with thousand separators; em-dash for null/zero/NaN. */
export function fmtInt(v) {
  if (v == null || isNaN(v) || v === 0) return EMDASH;
  return Number(v).toLocaleString('en-US');
}
