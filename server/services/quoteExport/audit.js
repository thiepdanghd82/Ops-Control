// @ts-check
/**
 * `_Audit` hidden metadata sheet (MVP-2 Item A).
 *
 * Ten key/value cells in cols A (label) + B (value), bilingual labels
 * are intentionally NOT used here — this is forensic metadata read by
 * the MVP-3 importer + auditors, not operator-facing. English-only
 * keeps the parse contract stable across i18n drift.
 *
 * Sheet visibility = 'hidden' (operator can right-click → unhide in
 * Excel, but sheet protection in protect.js prevents edit after unhide,
 * so HMAC catches forge attempts via _Schema mutation).
 *
 * The 10 cells (row order is locked — MVP-3 importer reads by row idx):
 *   1  quote_id
 *   2  version            (quote._version)
 *   3  saved_at           (quote.saved_at; ISO-8601)
 *   4  saved_by           (operator who last saved; may be '-')
 *   5  exported_at        (now in ISO-8601 UTC)
 *   6  exported_by        (user who triggered export)
 *   7  variant            ('customer' | 'internal')
 *   8  engine_sha         (process.env.OPS_BUILD_SHA, 8-char short; '-' if absent)
 *   9  library_fingerprint  (sha256 of lib JSON if available; '-' otherwise)
 *   10 payload_sha256     (sha256 of _Schema's decoded gzipped payload)
 */

const AUDIT_SHEET_NAME = '_Audit';

/**
 * @param {import('exceljs').Workbook} wb
 * @param {object} ctx
 * @param {object} ctx.quote
 * @param {'customer'|'internal'} ctx.variant
 * @param {string} ctx.exportedBy
 * @param {string} [ctx.engineSha]
 * @param {string} [ctx.libraryFingerprint]
 * @param {string} ctx.payloadSha256  hex digest of decoded payload bytes
 * @param {Date|string} [ctx.now]
 */
export function buildAuditSheet(wb, ctx) {
  const sheet = wb.addWorksheet(AUDIT_SHEET_NAME, { state: 'hidden' });
  sheet.getColumn('A').width = 24;
  sheet.getColumn('B').width = 80;

  const now = ctx.now ? new Date(ctx.now) : new Date();
  const exportedAt = now.toISOString();
  const rows = [
    ['quote_id', String(ctx.quote?.id ?? '-')],
    ['version', String(ctx.quote?._version ?? 1)],
    ['saved_at', String(ctx.quote?.saved_at ?? '-')],
    ['saved_by', String(ctx.quote?.saved_by ?? '-')],
    ['exported_at', exportedAt],
    ['exported_by', String(ctx.exportedBy || '-')],
    ['variant', String(ctx.variant)],
    ['engine_sha', String(ctx.engineSha || '-').slice(0, 8)],
    ['library_fingerprint', String(ctx.libraryFingerprint || '-')],
    ['payload_sha256', String(ctx.payloadSha256 || '-')],
  ];
  rows.forEach(([k, v], i) => {
    const r = i + 1;
    sheet.getCell(`A${r}`).value = k;
    sheet.getCell(`B${r}`).value = v;
  });
  return sheet;
}

/**
 * Read the 10 metadata cells back into a flat object. Used by verify.js
 * + MVP-3 importer to round-trip the audit data without parsing each
 * cell at the callsite.
 *
 * @param {import('exceljs').Workbook} wb
 * @returns {Record<string, string> | null}  null if _Audit absent
 */
export function readAuditSheet(wb) {
  const sheet = wb.getWorksheet(AUDIT_SHEET_NAME);
  if (!sheet) return null;
  const keys = [
    'quote_id',
    'version',
    'saved_at',
    'saved_by',
    'exported_at',
    'exported_by',
    'variant',
    'engine_sha',
    'library_fingerprint',
    'payload_sha256',
  ];
  const out = {};
  keys.forEach((k, i) => {
    const v = sheet.getCell(`B${i + 1}`).value;
    out[k] = v == null ? '-' : String(v);
  });
  return out;
}

export const _internal = { AUDIT_SHEET_NAME };
