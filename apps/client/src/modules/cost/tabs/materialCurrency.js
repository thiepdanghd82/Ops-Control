/**
 * Currency on a material-library price.
 *
 * The NPI price column used to be headed `USD / M²`, so the number was USD by
 * assertion and anything a supplier quoted in đồng had to be converted by hand
 * before it could be typed in. The live library shows what that cost: one row
 * carries the literal string `6900 vnđ / roll` in the price field (which
 * `Number()` turns into NaN, so it prices at $0 in a quote), and another was
 * entered as 2.45 with `giá 64000d/m2` noted beside it — a hand division by
 * 26122 that nobody can audit later.
 *
 * So a row now records WHICH currency its price is in, and the conversion
 * happens once, at pick time, against the quote's own USD rate.
 *
 * `calcEngine` is untouched and stays currency-blind on purpose: everything
 * downstream of the pick keeps working in the quote's currency, exactly as
 * before. This module is the only place that knows đồng exists.
 */

/** The only two the operator may choose. Order is the dropdown order. */
export const CURRENCIES = ['USD', 'VND'];

/** Rows written before this field existed are USD — that is what the old column header promised. */
export const DEFAULT_CURRENCY = 'USD';

export function normalizeCurrency(value) {
  const v = String(value ?? '')
    .trim()
    .toUpperCase();
  return CURRENCIES.includes(v) ? v : DEFAULT_CURRENCY;
}

/**
 * Convert a library row's price into the quote's currency (USD).
 *
 * @param {object} row       a material-library row: { price, currency }
 * @param {number|string} usdRate  the quote's `usd_rate` (VND per USD)
 * @returns {{ok: boolean, usd: number, reason: string}}
 *
 * `ok:false` means DO NOT write a price. It is deliberately not "fall back to
 * 0": a silent zero is how 50 rows whose price field holds prose ("Change to
 * FLD", "no more production") already price at nothing, and that failure is
 * invisible until someone reads the margin.
 */
export function priceInUsd(row, usdRate) {
  const text = String(row?.price ?? '').trim();
  // Blank must be checked BEFORE Number(): `Number('')` is 0, not NaN, so an
  // empty price would otherwise sail through as a perfectly valid $0 — the
  // exact silent-zero this function exists to prevent. 403 live rows are blank.
  if (text === '') return { ok: false, usd: 0, reason: 'price_empty' };
  const raw = Number(text);
  if (!Number.isFinite(raw)) return { ok: false, usd: 0, reason: 'price_not_numeric' };
  if (raw < 0) return { ok: false, usd: 0, reason: 'price_negative' };

  if (normalizeCurrency(row?.currency) === 'USD') {
    return { ok: true, usd: raw, reason: 'usd' };
  }

  const rate = Number(usdRate);
  // 61 of the 132 live quotes carry no usable rate (50 absent, 11 zero), so
  // this branch is reached in practice, not theoretically. Refusing sends the
  // operator to the RFQ tab; dividing by zero would write Infinity.
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, usd: 0, reason: 'no_usd_rate' };
  }
  return { ok: true, usd: raw / rate, reason: 'converted' };
}
