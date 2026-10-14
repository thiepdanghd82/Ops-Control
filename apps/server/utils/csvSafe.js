/**
 * CSV export helpers shared by the Dashboard export route (and any
 * future CSV exporters). Extracted to a module so the logic can be
 * unit-tested without spinning up the HTTP layer.
 *
 * Two concerns:
 *   1. CSV injection — cells whose first non-whitespace char is
 *      =, +, -, or @ are evaluated as formulas by Excel. Prefixing
 *      with an apostrophe forces literal interpretation. We match
 *      leading whitespace (including \t, \r, \n, NBSP) because Excel
 *      strips those before interpreting the formula prefix.
 *   2. RFC 4180 quoting — cells containing commas, quotes, or
 *      newlines must be wrapped in double quotes and embedded quotes
 *      doubled.
 *
 * Also exports a helper to prepend the UTF-8 BOM — without it, Excel
 * on Windows reads CSV as ANSI and corrupts Vietnamese diacritics.
 */

const CSV_INJECTION_RE = /^[\s\u00A0\t\r\n]*[=+\-@]/;
const CSV_QUOTE_NEEDED_RE = /[",\n\r]/;

export function escapeCsvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (CSV_INJECTION_RE.test(s)) s = "'" + s;
  if (CSV_QUOTE_NEEDED_RE.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsvRow(cells) {
  return cells.map(escapeCsvCell).join(',');
}

export function toCsvDocument(rows) {
  // CRLF line endings + UTF-8 BOM match Excel/Numbers expectations.
  return '\uFEFF' + rows.map(toCsvRow).join('\r\n');
}
