// @ts-check
/**
 * Filename builders for exported quote workbooks. Pattern per spec §3:
 *
 *   1 tier:   Quote_{RFQ}_{customer}_MOQ{N}_{variant}_v{ver}_{YYYYMMDD}.xlsx
 *   ZIP:      Quote_{RFQ}_{customer}_v{ver}_{YYYYMMDD}.zip
 *
 * `customer` + `RFQ` come from quote.state — both can carry spaces,
 * accents, or odd punctuation, so sanitize() conservatively keeps only
 * `[A-Za-z0-9-]`, collapsing other chars to `_`.
 */

/**
 * Conservative slug — keeps Latin alnum + dash; everything else becomes
 * underscore; collapses runs; trims edges; caps at 50 chars to keep the
 * full filename under typical filesystem 255-byte limit when combined.
 *
 * @param {string|null|undefined} raw
 * @param {string} [fallback='-']
 * @returns {string}
 */
export function sanitize(raw, fallback = '-') {
  const s = String(raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip Vietnamese diacritics
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 50);
  return s || fallback;
}

/**
 * YYYYMMDD from a Date or ISO string. UTC to keep filenames stable
 * regardless of where the server runs.
 *
 * @param {Date|string} [d]
 * @returns {string}
 */
export function yyyymmdd(d) {
  const dt = d ? new Date(d) : new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * @param {object} args
 * @param {string} [args.rfq]         RFQ number / label
 * @param {string} [args.customer]    Customer name
 * @param {number|string} args.tierLabel  Operator-visible tier identity (e.g. 1, '500')
 * @param {'customer'|'internal'} args.variant
 * @param {number} args.version       quote._version
 * @param {Date|string} [args.now]    Override for tests
 * @returns {string}
 */
export function build1TierName({ rfq, customer, tierLabel, variant, version, now }) {
  const r = sanitize(rfq, 'NoRFQ');
  const c = sanitize(customer, 'NoCust');
  const t = sanitize(String(tierLabel), '0');
  const v = String(version || 1);
  return `Quote_${r}_${c}_MOQ${t}_${variant}_v${v}_${yyyymmdd(now)}.xlsx`;
}

/**
 * @param {object} args
 * @param {string} [args.rfq]
 * @param {string} [args.customer]
 * @param {number} args.version
 * @param {Date|string} [args.now]
 * @returns {string}
 */
export function buildZipName({ rfq, customer, version, now }) {
  const r = sanitize(rfq, 'NoRFQ');
  const c = sanitize(customer, 'NoCust');
  const v = String(version || 1);
  return `Quote_${r}_${c}_v${v}_${yyyymmdd(now)}.zip`;
}
