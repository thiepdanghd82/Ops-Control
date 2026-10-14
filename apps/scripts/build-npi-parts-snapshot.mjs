#!/usr/bin/env node
// @ts-check
/**
 * build-npi-parts-snapshot — one-shot xlsx → JSON exporter for the
 * static NPI Parts List viewer (Phase 6 Option C, v1.6 read-only mode).
 *
 * Source: NPI Quote part list.xlsx (~25k rows × 64 cols, Henry's
 * production reference data at CCL Vietnam).
 *
 * Output: client/public/data/npi-parts.json (bundled into the DMG so
 * the viewer works offline — embedded mode operators in factories
 * with flaky WAN still get the lookup).
 *
 * Transformations:
 *   - Header keys trimmed (some xlsx cells have leading/trailing spaces).
 *   - Excel serial dates (RFQ date / Quoted date / Week) converted to
 *     ISO YYYY-MM-DD strings (operator-readable + sortable).
 *   - Fully-null rows dropped (xlsx had ~ trailing empty rows).
 *   - Cell whitespace trimmed for string values.
 *   - Output: { generated_at, source_file, source_mtime, row_count,
 *              columns: [...], rows: [...] } so the viewer can validate
 *              the snapshot age + drift-detect on rebuild.
 *
 * Usage:
 *   node scripts/build-npi-parts-snapshot.mjs [path-to-xlsx]
 *
 * Default source path matches the Cost Ref data convention in Henry's
 * `2. TEMPLATES/Cost Ref data/NPI/` directory. Override via CLI arg
 * for ad-hoc rebuilds from a newer xlsx.
 */

import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const DEFAULT_SRC =
  '/Volumes/Macintosh Data/Claude-Cowork/2. TEMPLATES/Cost Ref data/NPI/NPI Quote part list.xlsx';
// Path picked to AVOID Vite's `/data` proxy that routes to Express :3000
// (see client/vite.config.js server.proxy). Snapshot is pure static
// asset, so served straight from Vite/Express static layer.
const OUT_PATH = resolve(ROOT, 'client/public/npi-parts/parts-snapshot.json');

const SRC = process.argv[2] || DEFAULT_SRC;

// Excel epoch starts 1900-01-01. Serial 1 = 1900-01-01. But Excel has the
// famous Lotus-1-2-3 1900 leap-year bug — Feb 29 1900 is treated as real
// → serials above 60 are off by 1. The standard fix is to subtract 25569
// (days from 1900-01-01 to 1970-01-01 with the leap bug baked in) and
// multiply by ms/day.
function excelSerialToISO(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return null;
  const ms = (n - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const DATE_COLS = new Set(['RFQ date', 'Quoted date', 'Week']);

function normaliseRow(raw) {
  const out = {};
  let hasAny = false;
  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const key = rawKey.trim();
    if (!key) continue;
    let val = rawVal;
    if (typeof val === 'string') {
      val = val.trim();
      if (val === '') val = null;
    }
    if (val == null) {
      out[key] = null;
      continue;
    }
    if (DATE_COLS.has(key) && typeof val === 'number') {
      out[key] = excelSerialToISO(val);
    } else {
      out[key] = val;
    }
    hasAny = true;
  }
  return hasAny ? out : null;
}

function main() {
  console.log(`[npi-parts] Reading ${SRC} …`);
  const wb = XLSX.readFile(SRC);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`[npi-parts] Raw rows: ${rawRows.length} (sheet "${sheetName}")`);

  const rows = [];
  for (const r of rawRows) {
    const cleaned = normaliseRow(r);
    if (cleaned) rows.push(cleaned);
  }
  console.log(`[npi-parts] Non-empty rows: ${rows.length}`);

  // Canonical column order = trimmed keys from first row (header order).
  const columns = Object.keys(rawRows[0] || {})
    .map((k) => k.trim())
    .filter(Boolean);

  const stat = statSync(SRC);
  const payload = {
    generated_at: new Date().toISOString(),
    source_file: SRC,
    source_mtime: stat.mtime.toISOString(),
    source_size_bytes: stat.size,
    row_count: rows.length,
    columns,
    rows,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(payload));
  const outSize = statSync(OUT_PATH).size;
  const mb = (outSize / 1024 / 1024).toFixed(2);
  console.log(
    `[npi-parts] Wrote ${OUT_PATH} (${mb} MB, ${rows.length} rows × ${columns.length} cols)`
  );
}

main();
