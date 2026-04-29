/**
 * Robust CSV/Excel parser for the Import Wizard.
 *
 * Improvements over the legacy parser in routes/import.js:
 *   - Strips UTF-8 BOM at file head.
 *   - Auto-detects delimiter (comma / semicolon / tab / pipe).
 *   - Preserves CRLF/LF inside quoted fields.
 *   - Excel: list ALL sheets so the wizard lets the operator pick.
 *
 * Output shape:
 *   { headers: string[], rows: string[][], meta: { sheets?, sheet?, delimiter?, encoding? } }
 */

import fs from 'fs';
import path from 'path';

const BOM = '﻿';

function stripBOM(s) {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function detectDelimiter(sample) {
  // Sample = first ~4 KB of the file. Score each candidate by counting
  // its occurrences ON THE FIRST LINE (header line is the most reliable
  // signal — it's always present and never quoted in IFS exports).
  const firstLine = sample.split(/\r?\n/, 1)[0] || '';
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) { bestCount = count; best = c; }
  }
  return best;
}

/**
 * Parse CSV content. Handles quoted fields with embedded delimiters and
 * newlines, doubled quotes ("") for escaping, and CRLF/LF line endings.
 *
 * Returns { headers, rows, delimiter }. Empty rows (all blank) are dropped.
 */
export function parseCSVContent(content, opts = {}) {
  let text = stripBOM(String(content));
  // Normalise CRLF → LF for the row tokenizer; we'll handle multi-line
  // quoted fields manually.
  const delimiter = opts.delimiter || detectDelimiter(text.slice(0, 4096));

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }
    // Not in quotes
    if (ch === '"') {
      // Toggle into quotes only if field is empty (start-of-field) OR
      // the previous char was the delimiter (lenient — some IFS dumps
      // emit `Cell1,"hello, world",Cell3`).
      if (field === '') { inQuotes = true; continue; }
      // Stray quote — just append.
      field += ch;
      continue;
    }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\n') {
      row.push(field); field = '';
      // Drop trailing \r (we treat \n as end-of-line; \r before it is part of CRLF)
      if (row.length === 1 && row[0] === '') {
        // Empty line — skip
      } else {
        // Trim a trailing \r from the last cell (CRLF case)
        const last = row.length - 1;
        if (typeof row[last] === 'string' && row[last].endsWith('\r')) {
          row[last] = row[last].slice(0, -1);
        }
        rows.push(row);
      }
      row = [];
      continue;
    }
    field += ch;
  }
  // Final flush
  if (field !== '' || row.length > 0) {
    row.push(field);
    const last = row.length - 1;
    if (typeof row[last] === 'string' && row[last].endsWith('\r')) {
      row[last] = row[last].slice(0, -1);
    }
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [], delimiter };
  }
  const headers = rows[0].map(h => String(h ?? '').trim());
  const data = rows.slice(1).filter(r => r.some(c => c != null && String(c).trim() !== ''));
  return { headers, rows: data, delimiter };
}

export function parseCSVFile(filePath, opts = {}) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseCSVContent(content, opts);
}

/**
 * Parse an Excel file. Returns the data of the chosen sheet (default:
 * first sheet) plus the full sheet list so the UI can offer a picker.
 */
export async function parseExcelFile(filePath, opts = {}) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.readFile(filePath, { cellDates: false, cellNF: false });
  const sheets = workbook.SheetNames || [];
  if (sheets.length === 0) throw new Error('Excel file has no sheets');
  const wantSheet = opts.sheet && sheets.includes(opts.sheet) ? opts.sheet : sheets[0];
  const sheet = workbook.Sheets[wantSheet];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (aoa.length === 0) {
    return { headers: [], rows: [], meta: { sheets, sheet: wantSheet } };
  }
  const headers = (aoa[0] || []).map(h => String(h ?? '').trim());
  const rows = aoa.slice(1)
    .map(r => Array.from({ length: headers.length }, (_, i) => r[i] ?? ''))
    .filter(r => r.some(c => c != null && String(c).trim() !== ''));
  return { headers, rows, meta: { sheets, sheet: wantSheet } };
}

/**
 * Convenience: parse any uploaded file by extension. Returns
 * { headers, rows, meta }. `meta.sheets` is non-empty for Excel inputs.
 */
export async function parseUploadedFile(file, opts = {}) {
  const ext = path.extname(file.originalname || file.name || '').toLowerCase();
  if (ext === '.csv' || ext === '.txt') {
    const { headers, rows, delimiter } = parseCSVFile(file.path, opts);
    return { headers, rows, meta: { sheets: [], sheet: null, delimiter, format: 'csv' } };
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const r = await parseExcelFile(file.path, opts);
    return { headers: r.headers, rows: r.rows, meta: { ...r.meta, format: 'xlsx' } };
  }
  throw Object.assign(new Error(`Unsupported file extension: ${ext}`), { status: 400 });
}
