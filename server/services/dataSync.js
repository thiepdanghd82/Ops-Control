/**
 * Data Sync Service
 * Reads shared data from COST V1.0's data/Library/ directory
 * Parses .js files (window._CCL_*_DATA = ...) into JSON
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateRows, rateRowSchema } from './librarySchema.js';
import { atomicWriteFileSync } from './atomicWrite.js';

const __filename_ds = fileURLToPath(import.meta.url);
const __dirname_ds = path.dirname(__filename_ds);

let DATA_DIR = process.env.DATA_DIR || path.join(__dirname_ds, '..', 'data');
if (!path.isAbsolute(DATA_DIR)) {
  DATA_DIR = path.resolve(path.join(__dirname_ds, '..', '..'), DATA_DIR);
}
const LIBRARY_DIR = path.join(DATA_DIR, 'Library');

// Cache with TTL + file mtime invalidation
const cache = new Map();
const CACHE_TTL = 5 * 60_000; // 5 minutes

function getFileMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  // Check if any source file was modified since cache was set
  if (entry.files && entry.files.length > 0) {
    for (const { path: fp, mtime } of entry.files) {
      if (getFileMtime(fp) !== mtime) return null; // file changed, invalidate
    }
  }
  return entry.data;
}

function setCache(key, data, sourceFiles = []) {
  const files = sourceFiles.map((fp) => ({ path: fp, mtime: getFileMtime(fp) }));
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL, files });
}

/**
 * Read a JSON file directly
 */
function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

// ─── Public API ───

// ── NPI Parts List (registry dataset 'npi-parts', STORAGE_JS_AOA) ──
// Read/serve path for the NPI Parts tab. Distinct from the bundled static
// snapshot the viewer used pre-import — that snapshot is now only the SEED
// source for the live Library file (first-read, idempotent).

const NPI_PARTS_FILE = path.join(LIBRARY_DIR, 'NpiParts', 'npi_parts_data.js');

// Bundled seed source, built by scripts/build-npi-parts-snapshot.mjs and
// shipped in client/dist via Vite's public/ copy. Dev falls back to public/.
function npiPartsSeedPath() {
  const candidates = [
    path.join(__dirname_ds, '..', '..', 'client', 'dist', 'npi-parts', 'parts-snapshot.json'),
    path.join(__dirname_ds, '..', '..', 'client', 'public', 'npi-parts', 'parts-snapshot.json'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// Convert a {columns, rows:[{header:val}]} snapshot into the JS-AoA file body
// (window._CCL_NPIPARTS_DATA={headers,rows:[[...]]};). Pure — unit-tested.
export function buildNpiPartsSeedContent(snap) {
  const headers = Array.isArray(snap?.columns) ? snap.columns : [];
  const rowsAoO = Array.isArray(snap?.rows) ? snap.rows : [];
  const rows = rowsAoO.map((r) => headers.map((h) => (r == null ? '' : (r[h] ?? ''))));
  return `window._CCL_NPIPARTS_DATA=${JSON.stringify({ headers, rows })};`;
}

/**
 * Seed the live NPI Parts library file from the bundled snapshot IF it doesn't
 * exist yet. Idempotent (no-op when the file is present, so an operator import
 * is never clobbered). `seedPath` is injectable for tests.
 */
export function seedNpiPartsIfAbsent(filePath = NPI_PARTS_FILE, seedPath = npiPartsSeedPath()) {
  if (fs.existsSync(filePath)) return false;
  if (!seedPath || !fs.existsSync(seedPath)) return false;
  try {
    const snap = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    atomicWriteFileSync(filePath, buildNpiPartsSeedContent(snap));
    return true;
  } catch (e) {
    console.warn('[dataSync] NPI Parts seed failed:', e.message);
    return false;
  }
}

/**
 * NPI Parts List for the viewer. Returns the shape the tab consumes:
 * { columns: string[], rows: Array<{header: value}>, row_count, generated_at }.
 * Seeds from the bundled snapshot on first read; cached with mtime invalidation.
 */
export function getNpiParts() {
  const cached = getCached('npiParts');
  if (cached) return cached;

  seedNpiPartsIfAbsent(NPI_PARTS_FILE);

  let headers = [];
  let rows = [];
  let generated_at = null;
  if (fs.existsSync(NPI_PARTS_FILE)) {
    try {
      const content = fs.readFileSync(NPI_PARTS_FILE, 'utf-8');
      const eqIdx = content.indexOf('=');
      let jsonStr = content.slice(eqIdx + 1).trim();
      if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1).trim();
      const parsed = JSON.parse(jsonStr);
      headers = Array.isArray(parsed.headers) ? parsed.headers : [];
      rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      generated_at = new Date(getFileMtime(NPI_PARTS_FILE)).toISOString();
    } catch (e) {
      console.warn('[dataSync] NPI Parts parse failed:', e.message);
    }
  }
  const objs = rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  const result = { columns: headers, rows: objs, row_count: objs.length, generated_at };
  setCache('npiParts', result, [NPI_PARTS_FILE]);
  return result;
}

/**
 * Get Work Centers (from Rate data)
 */
export function getWorkCenters() {
  const cached = getCached('workCenters');
  if (cached) return cached;

  const filePath = path.join(LIBRARY_DIR, 'Rate', 'rate_sites.json');
  if (!fs.existsSync(filePath)) {
    // Fallback to single rate.json
    const fallback = path.join(LIBRARY_DIR, 'Rate', 'rate.json');
    if (fs.existsSync(fallback)) {
      const data = readJsonFile(fallback);
      const wcs = [...new Set(data.map((r) => r.workcenter))].sort();
      setCache('workCenters', wcs, [fallback]);
      return wcs;
    }
    return [];
  }

  const sitesData = readJsonFile(filePath);
  // Collect unique work centers across all sites. Each site's rows are
  // validated so a corrupt rate_sites.json can't inject arbitrary
  // workcenter names (they drive dropdowns all over Pricing).
  const wcSet = new Set();
  for (const [siteKey, site] of Object.entries(sitesData)) {
    if (!Array.isArray(site)) continue;
    const { rows } = validateRows(site, rateRowSchema, {
      source: `Rate/rate_sites.json[${siteKey}]`,
      silent: false,
    });
    rows.forEach((r) => wcSet.add(r.workcenter));
  }
  const wcs = [...wcSet].sort();
  setCache('workCenters', wcs, [filePath]);
  return wcs;
}

/**
 * Clear all caches (call after data import)
 */
export function clearCache() {
  cache.clear();
}
