/**
 * Import Type Coercion
 *
 * Robust string → typed-value parsing for CSV/XLSX imports. Operators
 * paste data from IFS dumps, vendor quotes, and Vietnamese-locale
 * spreadsheets — so the parser must handle:
 *   - thousand separators (comma OR dot, locale-dependent)
 *   - decimal commas (VN: "1,5" → 1.5)
 *   - leading/trailing whitespace, NBSP
 *   - Excel date serials (numeric days since 1899-12-30)
 *   - dd/mm/yyyy + dd-mm-yyyy + ISO
 *   - boolean Y/N, Yes/No, 1/0, Có/Không, True/False
 *
 * Each helper returns a `{ ok, value, raw, reason? }` shape so the
 * preview step can flag bad cells without throwing.
 */

const NBSP = /\u00A0/g;
// eslint-disable-next-line no-misleading-character-class -- zero-width sequences are intentional sanitization (escaped via \uXXXX)
const ZERO_WIDTH = /[\u200B\u200C\u200D\uFEFF]/g;

export function trimCell(v) {
  if (v == null) return '';
  return String(v).replace(NBSP, ' ').replace(ZERO_WIDTH, '').trim();
}

export function coerceString(v) {
  const s = trimCell(v);
  return { ok: true, value: s, raw: v };
}

/**
 * Coerce to number. Handles:
 *   - "1,234.56"  → 1234.56  (US thousand separator)
 *   - "1.234,56"  → 1234.56  (EU thousand separator)
 *   - "1,5"       → 1.5      (VN decimal comma)
 *   - "  3.14  "  → 3.14
 *   - "$1,000"    → 1000     (currency stripped)
 *   - "10%"       → 10       (percent suffix stripped — caller divides if needed)
 */
export function coerceNumber(v, opts = {}) {
  const { allowEmpty = true, defaultValue = null } = opts;
  const s = trimCell(v);
  if (s === '') {
    if (allowEmpty) return { ok: true, value: defaultValue, raw: v, empty: true };
    return { ok: false, value: null, raw: v, reason: 'empty' };
  }
  // Strip currency symbols, percent, plus sign, parentheses (negative).
  let cleaned = s
    .replace(/[$€£¥₫]/g, '')
    .replace(/%$/, '')
    .trim();
  let negative = false;
  if (/^\(.*\)$/.test(cleaned)) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);

  // Detect locale: if BOTH "," and "." present, the LAST one is decimal.
  // If only "," present and it's followed by exactly 1-2 digits and only
  // appears once → decimal comma (VN style). Otherwise treat "," as
  // thousand sep.
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // EU: "1.234,56"
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US: "1,234.56"
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = cleaned.split(',');
    if (
      parts.length === 2 &&
      parts[1].length > 0 &&
      parts[1].length <= 3 &&
      /^\d+$/.test(parts[0]) &&
      /^\d+$/.test(parts[1])
    ) {
      // Could be "1,5" (decimal) or "1,234" (thousand).
      // Heuristic: if integer part ≤ 3 digits AND fractional part ≤ 2 digits → decimal.
      // Otherwise (e.g. "1,234") → thousand separator.
      if (parts[0].length <= 3 && parts[1].length <= 2) {
        cleaned = parts.join('.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  // Strip remaining spaces (some users type "1 234").
  cleaned = cleaned.replace(/\s+/g, '');

  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    return { ok: false, value: null, raw: v, reason: `not_a_number: ${s}` };
  }
  return { ok: true, value: negative ? -n : n, raw: v };
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30); // 1899-12-30 (accounts for Excel's 1900 leap-year bug)

/**
 * Coerce to ISO 8601 date (YYYY-MM-DD). Returns string, not Date object.
 * Heuristic order:
 *   1. Already ISO ("YYYY-MM-DD" or "YYYY-MM-DDTHH...") → strip time, return.
 *   2. Pure number → Excel serial day count.
 *   3. "dd/mm/yyyy" or "dd-mm-yyyy" or "dd.mm.yyyy" → parsed.
 *   4. "mm/dd/yyyy" — only if first part > 12 (rules out dd/mm).
 *   5. Date.parse fallback — if it returns valid, take ISO date portion.
 */
export function coerceDate(v, opts = {}) {
  const { allowEmpty = true } = opts;
  const s = trimCell(v);
  if (s === '') {
    if (allowEmpty) return { ok: true, value: null, raw: v, empty: true };
    return { ok: false, value: null, raw: v, reason: 'empty' };
  }
  // ISO short
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (isoMatch) {
    return { ok: true, value: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`, raw: v };
  }
  // Excel serial
  if (/^\d+(\.\d+)?$/.test(s)) {
    const days = Number(s);
    if (days > 25569 - 1000 && days < 60000) {
      // ~1898 to ~2064 — sane range
      const ms = EXCEL_EPOCH + days * 86400 * 1000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        return { ok: true, value: d.toISOString().slice(0, 10), raw: v };
      }
    }
  }
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const dmyMatch = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (dmyMatch) {
    let [, d, m, y] = dmyMatch;
    let dd = Number(d),
      mm = Number(m),
      yyyy = Number(y);
    if (yyyy < 100) yyyy += yyyy < 50 ? 2000 : 1900;
    if (dd > 12 && mm <= 12) {
      // Definitely dd/mm
    } else if (mm > 12 && dd <= 12) {
      // Actually mm/dd — swap
      [dd, mm] = [mm, dd];
    }
    // Default to dd/mm (international + VN convention)
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const iso = `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
      // Sanity-check by re-parsing
      const dt = new Date(iso + 'T00:00:00Z');
      if (!isNaN(dt.getTime())) return { ok: true, value: iso, raw: v };
    }
  }
  // Native parse fallback
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return { ok: true, value: dt.toISOString().slice(0, 10), raw: v };
  }
  return { ok: false, value: null, raw: v, reason: `bad_date: ${s}` };
}

/**
 * Coerce to boolean. Returns true/false/null (null = unrecognised, with reason).
 */
export function coerceBoolean(v, opts = {}) {
  const { allowEmpty = true } = opts;
  const s = trimCell(v).toLowerCase();
  if (s === '') {
    if (allowEmpty) return { ok: true, value: null, raw: v, empty: true };
    return { ok: false, value: null, raw: v, reason: 'empty' };
  }
  if (['y', 'yes', 'true', 't', '1', 'có', 'co', 'on', 'enabled', 'active'].includes(s)) {
    return { ok: true, value: true, raw: v };
  }
  if (['n', 'no', 'false', 'f', '0', 'không', 'khong', 'off', 'disabled', 'inactive'].includes(s)) {
    return { ok: true, value: false, raw: v };
  }
  return { ok: false, value: null, raw: v, reason: `bad_boolean: ${s}` };
}

/**
 * Generic coerce by named type. The single entry-point used by the pipeline.
 *
 * type:
 *   'string' (default), 'number', 'integer', 'date', 'boolean'
 */
export function coerce(value, type = 'string', opts = {}) {
  switch ((type || 'string').toLowerCase()) {
    case 'number':
    case 'float':
    case 'decimal':
      return coerceNumber(value, opts);
    case 'integer':
    case 'int': {
      const r = coerceNumber(value, opts);
      if (!r.ok || r.value == null) return r;
      const n = Math.trunc(r.value);
      return { ...r, value: n };
    }
    case 'date':
      return coerceDate(value, opts);
    case 'boolean':
    case 'bool':
      return coerceBoolean(value, opts);
    case 'string':
    default:
      return coerceString(value);
  }
}
