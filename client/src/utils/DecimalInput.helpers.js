/**
 * DecimalInput — pure helpers extracted so node --test can exercise
 * them without a JSX loader. The React component in DecimalInput.jsx
 * re-exports from here.
 *
 * Keep this file .js (not .jsx) so the `node --test 'src/**\/*.test.js'`
 * runner can import without any transform. See DecimalInput.test.js.
 */

// A valid partial-or-complete decimal: optional minus, digits, at most
// one dot, digits after. Empty and "-" alone count as in-progress.
export const DECIMAL_RE = /^-?(\d+\.?\d*|\.\d*)?$/;

export function toDisplay(v) {
  if (v == null || v === '' || Number.isNaN(v)) return '';
  // Treat 0 as "unset" for display purposes — user sees "—" placeholder
  // instead of a pre-filled 0. User typing "0" still shows it while
  // focused (handled via local state), so this only affects the idle
  // display for uninitialized or cleared fields.
  if (Number(v) === 0) return '';
  return String(v);
}

/**
 * Like toDisplay but pads to a fixed number of decimal places.
 * - 7.2  + decimals=3 → "7.200"
 * - 7.225+ decimals=3 → "7.225"  (already at the budget, no change)
 * - 7.2255+ decimals=3 → "7.226" (rounded for DISPLAY only — the
 *   underlying value upstream is untouched, see DecimalInput.jsx)
 *
 * Skips the toFixed step if `decimals` is null/undefined so the
 * default behaviour (trim trailing zeros) is preserved for callers
 * that don't opt in.
 */
export function toDisplayFixed(v, decimals) {
  const base = toDisplay(v);
  if (base === '') return base;
  if (decimals == null || !Number.isFinite(decimals) || decimals < 0) return base;
  const n = Number(v);
  if (!Number.isFinite(n)) return base;
  return n.toFixed(decimals);
}

/**
 * Normalize raw input (from typing OR paste) into a canonical decimal
 * string that DECIMAL_RE can validate. Two ambiguous inputs matter:
 *
 *   "1,234.56"  — US thousand separator + dot decimal → strip commas
 *   "0,1352"    — Euro/VN decimal comma (no dot)      → comma becomes dot
 *
 * Also trims surrounding whitespace — pastes from Excel / Google Sheets
 * commonly arrive with trailing "\r\n" or "\t" which would otherwise
 * fail DECIMAL_RE and look like silent rejection (the reported MAT PRICE
 * paste bug). thousandSep=true means the caller renders commas as
 * thousand separators on blur; we always strip them on input.
 */
export function normalizeDecimalInput(raw, thousandSep = false) {
  if (raw == null) return '';
  const trimmed = String(raw).trim();
  if (thousandSep) return trimmed.replace(/,/g, '');
  const commas = (trimmed.match(/,/g) || []).length;
  // Heuristic: multiple commas, or a comma combined with a dot → the
  // commas are thousand separators (strip all). Single comma and no
  // dot → treat as decimal separator (swap to ".").
  if (commas > 1 || (commas === 1 && trimmed.includes('.'))) {
    return trimmed.replace(/,/g, '');
  }
  return trimmed.replace(',', '.');
}

export function formatThousand(str) {
  if (str == null || str === '' || str === '-' || str === '.' || str === '-.') return str;
  const norm = String(str).replace(',', '.');
  const n = parseFloat(norm);
  if (Number.isNaN(n)) return str;
  const [intPart, decPart] = norm.split('.');
  const sign = intPart.startsWith('-') ? '-' : '';
  const intDigits = sign ? intPart.slice(1) : intPart;
  const formattedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${sign}${formattedInt}.${decPart}` : `${sign}${formattedInt}`;
}
