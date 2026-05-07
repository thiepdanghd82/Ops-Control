// S-INK-IO (2026-05-05) — minimal client-side CSV import/export.
// Used by InkCalculator to round-trip Anilox DB + Mesh Spec.
// Excel reads/writes CSV natively, so this covers the operator's
// "CSV/Excel" ask without bundling a 700 kB xlsx parser into the client.

// columns: [{ key, header, type? }] where type ∈ 'number' | 'string' (default 'string')

function escapeCell(v) {
  if (v == null) return '';
  const s = String(v);
  // Quote if contains comma, quote, or newline; escape inner quotes by doubling.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows, columns) {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const v = row[c.key];
        if (c.type === 'number' && (v === '' || v == null)) return '';
        return escapeCell(v);
      })
      .join(','),
  );
  return [header, ...lines].join('\r\n');
}

export function downloadCSV(filename, csvText) {
  const BOM = '﻿'; // so Excel detects UTF-8 (preserves ± and µ glyphs)
  const blob = new Blob([BOM + csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Parse one CSV row, respecting double-quote escaping.
function parseRow(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Split CSV text into rows, supporting quoted multi-line cells.
function splitRows(text) {
  const rows = [];
  let cur = '';
  let inQuote = false;
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') {
        cur += '""';
        i++;
        continue;
      }
      inQuote = !inQuote;
      cur += ch;
    } else if (!inQuote && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (cur.length > 0) rows.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) rows.push(cur);
  return rows;
}

// Returns { rows, headers, skipped } — skipped is the count of rows
// the parser dropped (blank lines or all-empty cells). Header matching
// is case-insensitive; unknown headers are ignored. Numeric columns
// coerce to Number; blank cells become 0 (matches existing UI default).
export function parseCSV(text, columns) {
  const lines = splitRows(text);
  if (lines.length === 0) return { rows: [], headers: [], skipped: 0 };
  const headerCells = parseRow(lines[0]).map((s) => s.trim());
  const headerLC = headerCells.map((h) => h.toLowerCase());
  const colIdx = {};
  for (const c of columns) {
    const target = c.header.toLowerCase();
    const idx = headerLC.indexOf(target);
    if (idx !== -1) colIdx[c.key] = idx;
  }
  const rows = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    if (cells.every((c) => c.trim() === '')) {
      skipped++;
      continue;
    }
    const row = {};
    for (const c of columns) {
      const idx = colIdx[c.key];
      const raw = idx == null ? '' : (cells[idx] ?? '').trim();
      if (c.type === 'number') {
        const n = Number(raw);
        row[c.key] = Number.isFinite(n) ? n : 0;
      } else {
        row[c.key] = raw;
      }
    }
    rows.push(row);
  }
  return { rows, headers: headerCells, skipped };
}

// Open a native file picker, resolve with the file's text content.
// Returns null if the user cancels (no file chosen).
export function pickCSVFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, text: String(reader.result || '') });
      reader.onerror = () => resolve(null);
      reader.readAsText(f, 'utf-8');
    };
    input.click();
  });
}
