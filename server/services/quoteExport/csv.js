// @ts-check
/**
 * CSV serialization for the quote-export pipeline (format: 'csv').
 *
 * Reuses the exact same 11-sheet workbook the xlsx path builds, then
 * serializes each VISIBLE worksheet to a values-only CSV and bundles them
 * into a .zip (via the existing buildZip). The hidden forensic sheets
 * (_Audit / _Schema) are excluded — a CSV export is the human-readable
 * calc surface, not the tamper-resistance envelope.
 *
 * RFC 4180 escaping (double-quote wrap on `" , \r \n`, embedded `"` doubled)
 * + a UTF-8 BOM prefix per Sprint S-D15 lesson so Excel on a Vietnamese /
 * Windows locale decodes `×`, `₫`/VND, and accented text without mojibake.
 */

/** UTF-8 BOM — makes Excel auto-detect UTF-8 (VN locale × / VND decode). */
export const BOM = '﻿';

/**
 * Coerce an ExcelJS cell value to a plain string for CSV.
 * Handles formula results, rich text, hyperlinks, dates, null.
 * @param {*} v
 * @returns {string}
 */
function cellToString(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((rt) => (rt && rt.text) || '').join('');
    if (v.result != null) return cellToString(v.result); // formula → computed result
    if (typeof v.text === 'string') return v.text; // hyperlink / shared string
    if (typeof v.hyperlink === 'string') return v.hyperlink;
    return '';
  }
  return String(v);
}

/**
 * RFC 4180 escape a single cell value.
 * @param {*} value
 * @returns {string}
 */
export function csvEscapeCell(value) {
  const s = cellToString(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A worksheet is exportable to CSV iff it is not hidden and not one of the
 * underscore-prefixed forensic sheets (_Audit / _Schema).
 * @param {import('exceljs').Worksheet} ws
 * @returns {boolean}
 */
export function isVisibleSheet(ws) {
  if (!ws) return false;
  if (ws.state === 'hidden' || ws.state === 'veryHidden') return false;
  if (typeof ws.name === 'string' && ws.name.startsWith('_')) return false;
  return true;
}

/**
 * Serialize one worksheet to an RFC-4180 CSV string (no BOM — the caller
 * prepends it). Merged non-master cells emit empty so a merged banner value
 * isn't repeated across its span.
 * @param {import('exceljs').Worksheet} ws
 * @returns {string}
 */
export function sheetToCsv(ws) {
  if (!ws) return '';
  const maxCol = ws.columnCount || 0;
  const lines = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells = [];
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      const isSlave = cell.isMerged && cell.master && cell.master.address !== cell.address;
      cells.push(csvEscapeCell(isSlave ? '' : cell.value));
    }
    lines.push(cells.join(','));
  });
  return lines.join('\r\n');
}

/**
 * Filesystem-safe `<NN-sheet-name>.csv` from a sheet name ("03 Materials"
 * → "03-Materials.csv").
 * @param {string} sheetName
 * @returns {string}
 */
export function csvFileName(sheetName) {
  const safe = String(sheetName || 'sheet')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '-');
  return `${safe}.csv`;
}

/**
 * Build the zip entries for one workbook: one `{filename, buffer}` per
 * visible sheet, each a BOM-prefixed UTF-8 CSV. `prefix` folders the files
 * (used per-tier in a multi-tier zip).
 * @param {import('exceljs').Workbook} wb
 * @param {{prefix?: string}} [opts]
 * @returns {Array<{filename: string, buffer: Buffer}>}
 */
export function workbookToCsvEntries(wb, opts = {}) {
  const prefix = opts.prefix || '';
  const entries = [];
  for (const ws of wb.worksheets) {
    if (!isVisibleSheet(ws)) continue;
    const name = csvFileName(ws.name);
    const buffer = Buffer.from(BOM + sheetToCsv(ws), 'utf8');
    entries.push({ filename: prefix ? `${prefix}/${name}` : name, buffer });
  }
  return entries;
}
