/**
 * Data Sync Service
 * Reads shared data from COST V1.0's data/Library/ directory
 * Parses .js files (window._CCL_*_DATA = ...) into JSON
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  validateRows,
  rateRowSchema,
  machineProfileSchema,
  safeParseJson,
} from './librarySchema.js';

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
  } catch { return 0; }
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
  const files = sourceFiles.map(fp => ({ path: fp, mtime: getFileMtime(fp) }));
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL, files });
}

/**
 * Parse a .js data file that contains: window._VARNAME={...} or window._VARNAME=[...]
 * Format is {headers: [...], rows: [[...],...]} — converts to array of objects
 * Returns array of objects with header keys
 */
function parseJsDataFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  // Find first '=' and parse everything after it
  const eqIdx = content.indexOf('=');
  if (eqIdx === -1) throw new Error(`Cannot parse JS data file: ${filePath}`);

  let jsonStr = content.slice(eqIdx + 1).trim();
  // Remove trailing semicolon if present
  if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1).trim();

  const parsed = JSON.parse(jsonStr);

  // If format is {headers: [], rows: [[]]} → convert to array of objects
  if (parsed && parsed.headers && Array.isArray(parsed.rows)) {
    return parsed.rows.map(row =>
      Object.fromEntries(parsed.headers.map((h, i) => [h, row[i] ?? '']))
    );
  }

  // Otherwise return as-is (already array of objects)
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Read a JSON file directly
 */
function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

// ─── Public API ───

/**
 * Get IFS Inventory data (all parts)
 */
export function getInventory() {
  const cached = getCached('inventory');
  if (cached) return cached;

  const invDir = path.join(LIBRARY_DIR, 'IFS_Inventory');
  const result = {};

  // Load each JS data file
  const files = {
    inventory: 'inventory_data.js',
    finishedGoods: 'finished_good_data.js',
    rawMaterials: 'raw_materials_data.js'
  };

  const sourcePaths = [];
  for (const [key, filename] of Object.entries(files)) {
    const filePath = path.join(invDir, filename);
    if (fs.existsSync(filePath)) {
      sourcePaths.push(filePath);
      try {
        result[key] = parseJsDataFile(filePath);
      } catch (e) {
        console.warn(`Failed to parse ${filename}:`, e.message);
        result[key] = [];
      }
    }
  }

  setCache('inventory', result, sourcePaths);
  return result;
}

/**
 * Get Manufacturing Structures (BOM data)
 */
export function getManufacturingStructures() {
  const cached = getCached('mfgStructures');
  if (cached) return cached;

  const filePath = path.join(LIBRARY_DIR, 'Manufacturing_Structures', 'mfg_structures_data.js');
  if (!fs.existsSync(filePath)) return [];

  const data = parseJsDataFile(filePath);
  setCache('mfgStructures', data, [filePath]);
  return data;
}

/**
 * Get BOM for a specific part number.
 *
 * IFS exports purely numeric Part Nos as JS numbers (e.g. 80640087)
 * but every caller passes a string (WO.ccl_pn / order.productCode are
 * always strings). String-coerce both sides — same pattern that
 * unbroke WorkOrderPrintable's BOM filter (CLAUDE.md lesson #21
 * "Number-vs-string PN comparison").
 */
export function getBOMForPart(partNo) {
  const target = String(partNo);
  const structures = getManufacturingStructures();
  return structures.filter(s =>
    String(s['Parent Part No'] ?? s['parent_part_no'] ?? '') === target
  );
}

/**
 * Get Routing Operations
 */
export function getRoutingOperations() {
  const cached = getCached('routingOps');
  if (cached) return cached;

  const filePath = path.join(LIBRARY_DIR, 'Routing_Operations', 'routing_ops_data.js');
  if (!fs.existsSync(filePath)) return [];

  const data = parseJsDataFile(filePath);
  setCache('routingOps', data, [filePath]);
  return data;
}

/**
 * Get Routing for a specific part number.
 * Same number-vs-string coercion as getBOMForPart — IFS routing rows
 * also store purely numeric Part Nos as JS numbers.
 */
export function getRoutingForPart(partNo) {
  const target = String(partNo);
  const operations = getRoutingOperations();
  return operations.filter(op =>
    String(op['Part No'] ?? op['part_no'] ?? '') === target
  );
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
      const wcs = [...new Set(data.map(r => r.workcenter))].sort();
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
    rows.forEach(r => wcSet.add(r.workcenter));
  }
  const wcs = [...wcSet].sort();
  setCache('workCenters', wcs, [filePath]);
  return wcs;
}

/**
 * Get Products (from IFS Finished Goods)
 *
 * Finished Goods raw rows use IFS field names — `Catalog No`, `Catalog Desc`,
 * `Association No` — NOT the `Part No` / `Part Description` shape used by
 * generic Inventory rows. Earlier mapping silently produced empty strings
 * for every product, breaking the Order Entry autocomplete. Fallback chain
 * preserves any legacy callers that happen to feed Inventory-shaped rows.
 *
 * `customer` carries the English short form (`Association No`); planning
 * uses it for auto-fill when an operator picks a product code.
 */
export function getProducts() {
  const cached = getCached('products');
  if (cached) return cached;

  // Dedupe by partNo — IFS Finished Goods rows are price-list entries
  // (one row per Site × Agreement × Customer), so the same Catalog No
  // can appear 5–10 times. Operator autocomplete cares about unique
  // products, not raw rows. First occurrence wins (preserves the row
  // order from the upstream xlsx export).
  const inv = getInventory();
  const seen = new Set();
  const products = [];
  for (const fg of (inv.finishedGoods || [])) {
    const partNo = String(
      fg['Catalog No'] ?? fg['catalog_no'] ?? fg['Part No'] ?? fg['part_no'] ?? ''
    );
    if (!partNo || seen.has(partNo)) continue;
    seen.add(partNo);
    products.push({
      partNo,
      description:
        fg['Catalog Desc'] ?? fg['catalog_desc'] ?? fg['Part Description'] ?? fg['description'] ?? '',
      customer: fg['Association No'] ?? fg['association_no'] ?? fg['Name'] ?? fg['name'] ?? '',
      type: fg['Type'] ?? fg['type'] ?? '',
      uom: fg['UOM'] ?? fg['uom'] ?? '',
    });
  }

  setCache('products', products); // inherits invalidation from inventory cache
  return products;
}

/**
 * Clear all caches (call after data import)
 */
export function clearCache() {
  cache.clear();
}
