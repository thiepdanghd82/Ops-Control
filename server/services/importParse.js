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

function stripBOM(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
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
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
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
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
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
      if (field === '') {
        inQuotes = true;
        continue;
      }
      // Stray quote — just append.
      field += ch;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
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
  const headers = rows[0].map((h) => String(h ?? '').trim());
  const data = rows.slice(1).filter((r) => r.some((c) => c != null && String(c).trim() !== ''));
  return { headers, rows: data, delimiter };
}

export function parseCSVFile(filePath, opts = {}) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseCSVContent(content, opts);
}

// Max leading rows to scan when hunting for the real header row (skip
// banner/title rows). RFQ Master headers are row 0, so this is a safety net.
const HEADER_SCAN_ROWS = 5;

/**
 * Pick the header row inside a sheet's array-of-arrays.
 *
 * With a `scorer` (headers → matched-canonical count) we scan the first few
 * rows and pick the one that looks most like the dataset's header row —
 * skipping leading banner/title rows (e.g. a "Dashboard" sheet whose row 0 is
 * a single title cell). Without a scorer we keep the legacy row-0 contract so
 * explicit-sheet / single-sheet imports are byte-unchanged.
 *
 * Returns { headers: string[], headerIdx: number }.
 */
function pickHeaderRow(aoa, scorer) {
  const row0 = (aoa[0] || []).map((h) => String(h ?? '').trim());
  if (!scorer) return { headers: row0, headerIdx: 0 };

  const scan = Math.min(HEADER_SCAN_ROWS, aoa.length);
  let bestIdx = 0;
  let bestScore = -1;
  let bestHeaders = row0;
  for (let i = 0; i < scan; i++) {
    const cells = (aoa[i] || []).map((h) => String(h ?? '').trim());
    const nonEmpty = cells.filter(Boolean).length;
    if (nonEmpty === 0) continue;
    // Alias-match count dominates; non-empty cell count breaks ties so a
    // real header row (many matches) always beats a banner row (0 matches).
    const score = scorer(cells) * 1000 + nonEmpty;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
      bestHeaders = cells;
    }
  }
  return { headers: bestHeaders, headerIdx: bestIdx };
}

/**
 * Parse an Excel file. Returns the data of the chosen sheet plus the full
 * sheet list so the UI can offer a picker.
 *
 * Sheet selection precedence:
 *   1. `opts.sheet` (explicit) — honored verbatim (single-sheet path, legacy).
 *   2. Multi-sheet workbook + `opts.scoreHeaders` — auto-pick the sheet whose
 *      header row best matches the dataset (highest matched-canonical count;
 *      tie → most non-empty data rows → first). This fixes "grabbed the first
 *      sheet (Dashboard) instead of the data sheet (RFQ Master)".
 *   3. Otherwise — first sheet (legacy).
 *
 * `opts.scoreHeaders(headers) → number` is injected by the caller (the wizard
 * passes a dataset-aware matcher) so this module stays free of dataset
 * knowledge. When present, `meta.sheetScores` reports every sheet's score.
 */
export async function parseExcelFile(filePath, opts = {}) {
  const XLSX = await import('xlsx');
  // xlsx ESM build (xlsx.mjs) has no fs wired → readFile throws
  // "Cannot access file"; read bytes + XLSX.read(buffer) instead.
  const workbook = XLSX.read(fs.readFileSync(filePath), { cellDates: false, cellNF: false });
  const sheets = workbook.SheetNames || [];
  if (sheets.length === 0) throw new Error('Excel file has no sheets');

  const scorer = typeof opts.scoreHeaders === 'function' ? opts.scoreHeaders : null;
  const aoaOf = (name) =>
    XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true });

  let wantSheet;
  let sheetScores = null;
  if (opts.sheet && sheets.includes(opts.sheet)) {
    // Explicit override always wins (legacy single-sheet path).
    wantSheet = opts.sheet;
  } else if (sheets.length > 1 && scorer) {
    // Score every sheet by dataset-header match; pick the best.
    const cache = new Map();
    sheetScores = sheets.map((name) => {
      const aoa = aoaOf(name);
      cache.set(name, aoa);
      const { headers, headerIdx } = pickHeaderRow(aoa, scorer);
      const matched = headers.length ? scorer(headers) : 0;
      const dataRows = aoa
        .slice(headerIdx + 1)
        .filter((r) => r.some((c) => c != null && String(c).trim() !== '')).length;
      return { sheet: name, matched, total: headers.length, dataRows };
    });
    const ranked = [...sheetScores].sort(
      (a, b) =>
        b.matched - a.matched ||
        b.dataRows - a.dataRows ||
        sheets.indexOf(a.sheet) - sheets.indexOf(b.sheet)
    );
    // Only trust the auto-pick if it matched at least one column; otherwise
    // fall back to the first sheet (nothing looked like the dataset).
    wantSheet = ranked[0] && ranked[0].matched > 0 ? ranked[0].sheet : sheets[0];
    workbook.__aoaCache = cache; // reuse below
  } else {
    wantSheet = sheets[0];
  }

  const aoa = workbook.__aoaCache?.get(wantSheet) || aoaOf(wantSheet);
  if (aoa.length === 0) {
    return { headers: [], rows: [], meta: { sheets, sheet: wantSheet, sheetScores } };
  }
  // Header-row detection only when a scorer is available (multi-sheet
  // auto-pick path). Explicit/single-sheet stay on the legacy row-0 contract.
  const { headers, headerIdx } = scorer
    ? pickHeaderRow(aoa, scorer)
    : { headers: (aoa[0] || []).map((h) => String(h ?? '').trim()), headerIdx: 0 };
  const rows = aoa
    .slice(headerIdx + 1)
    .map((r) => Array.from({ length: headers.length }, (_, i) => r[i] ?? ''))
    .filter((r) => r.some((c) => c != null && String(c).trim() !== ''));
  return { headers, rows, meta: { sheets, sheet: wantSheet, sheetScores } };
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
