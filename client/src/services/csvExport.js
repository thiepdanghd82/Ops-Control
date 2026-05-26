// @ts-check
/**
 * CSV helpers — pure, dependency-free.
 *
 * Why this exists: Summarize tab had inline CSV building that
 * mis-escaped fields with embedded double-quotes or newlines (only
 * wrapped fields containing literal `,`). A Description like
 * `Body sticker "BX" 60mm, gold` produced broken rows on import.
 *
 * RFC 4180 quoting:
 *   - Wrap field in `"…"` when it contains `,`, `"`, `\n`, or `\r`.
 *   - Double any embedded `"` (`a"b` → `"a""b"`).
 *   - null / undefined → empty string.
 *   - Numbers → toString (no thousand-sep, raw float so the
 *     consumer can re-format).
 */

export function csvEscape(value) {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (s.length === 0) return '';
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * UTF-8 BOM. Prepended to CSV so Excel on Vietnamese / Windows
 * locales detects UTF-8 encoding and renders `×` / `Đ` / etc.
 * correctly. Without it, Excel falls back to the system code page
 * (often Windows-1252) and a UTF-8 `×` (0xC3 0x97) gets shown as
 * `Ã—` or `√ó` depending on the misread. macOS Numbers + LibreOffice
 * also honor the BOM. Cost: +3 bytes per file.
 */
const UTF8_BOM = '﻿';

/**
 * Build a CSV string from an array of records + column key list.
 *
 * The output starts with a UTF-8 BOM so spreadsheet apps that
 * default to legacy code pages still decode it correctly.
 *
 * @param {Array<Object>} rows
 * @param {Array<string>} cols column keys (used as header row + field lookup)
 * @returns {string} CSV text with header row, '\n' line terminator
 */
export function buildCsv(rows, cols) {
  const header = cols.map(csvEscape).join(',');
  const body = rows.map((r) => cols.map((c) => csvEscape(r?.[c])).join(','));
  return UTF8_BOM + [header, ...body].join('\n');
}

/**
 * Save CSV text to a file the user picks. Uses the File System Access
 * API (Chromium 86+, Electron 13+ renderer) for a native Save dialog.
 * Falls back to the legacy `<a download>` anchor when the API is
 * unavailable (older browsers, some embedded contexts).
 *
 * Returns the picked filename on success, null on user cancellation,
 * or rejects on I/O error (the caller decides whether to flash).
 *
 * @param {string} csvText
 * @param {string} suggestedName e.g. `summarize_2026-05-26.csv`
 * @returns {Promise<string|null>}
 */
export async function saveCsv(csvText, suggestedName) {
  // Prefer native Save dialog when supported (Electron desktop falls
  // here — Chromium 41+ renderer ships the API). User picks folder +
  // filename + extension; file written synchronously via the handle.
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'CSV file',
            accept: { 'text/csv': ['.csv'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(csvText);
      await writable.close();
      return handle.name || suggestedName;
    } catch (err) {
      // User cancelled the dialog → return null, do NOT fall back to
      // legacy download (that would surprise the user with a double
      // save). Re-throw on real I/O errors so caller can flash.
      if (err && (err.name === 'AbortError' || err.code === 20)) return null;
      throw err;
    }
  }

  // Legacy fallback — browser-default Downloads folder. No path
  // picker available; the filename is set via the `download` attr but
  // the browser may still rename on collision.
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Safari has time to start the download stream.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return suggestedName;
}
