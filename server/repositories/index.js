/**
 * Repository layer: routes read data via backend-neutral helpers so we
 * can swap file ↔ SQLite without touching handlers.
 *
 * Backend is picked by env var OPS_DATA_BACKEND:
 *   'file'    (default)  — parses .js/.json files via dataSync.js. Safe
 *                          fallback — always works even if ops.db missing.
 *   'sqlite'             — reads from server/data/ops.db. Fast, indexed.
 *                          Falls back to file backend per-dataset if the
 *                          sqlite table is empty (mid-migration safety net).
 *
 * Writes are NOT yet routed through here — /api/import/* still updates
 * JS files directly. A later phase will introduce shadow-write to keep
 * SQLite in sync with imports.
 */
import fileBackend from './backends/fileBackend.js';
import sqliteBackend from './backends/sqliteBackend.js';

// Master switch — default 'file'. Setting 'sqlite' flips all datasets
// unless an OPS_BACKEND_<NAME> env override says otherwise.
const BACKEND_NAME = (process.env.OPS_DATA_BACKEND || 'file').toLowerCase();

// Per-dataset granular override — lets ops flip one dataset at a time
// for phased rollout. Value is either 'file' or 'sqlite'. Invalid /
// missing values fall back to BACKEND_NAME.
const DATASET_ENV = {
  bom: 'OPS_BACKEND_BOM',
  routing: 'OPS_BACKEND_ROUTING',
  inventory: 'OPS_BACKEND_INVENTORY',
  finished_goods: 'OPS_BACKEND_FINISHED_GOODS',
  raw_materials: 'OPS_BACKEND_RAW_MATERIALS',
  materials_npi: 'OPS_BACKEND_MATERIALS_NPI',
  materials_sourcing: 'OPS_BACKEND_MATERIALS_SOURCING',
  quotes: 'OPS_BACKEND_QUOTES',
  rfq_tracker: 'OPS_BACKEND_RFQ_TRACKER',
  sample_tracker: 'OPS_BACKEND_SAMPLE_TRACKER',
};

function backendFor(dataset) {
  const envName = DATASET_ENV[dataset];
  const override = envName ? (process.env[envName] || '').toLowerCase() : '';
  const chosen = override === 'sqlite' || override === 'file' ? override : BACKEND_NAME;
  return chosen === 'sqlite' ? sqliteBackend : fileBackend;
}

// Log backend resolution once at module load. Helps ops spot typo
// overrides (e.g. OPS_BACKEND_QUOTE=sqlite missing the plural `s`).
const _summary = {};
for (const ds of Object.keys(DATASET_ENV)) {
  const envName = DATASET_ENV[ds];
  const override = (process.env[envName] || '').toLowerCase();
  const effective = override === 'sqlite' || override === 'file' ? override : BACKEND_NAME;
  _summary[ds] =
    effective +
    (override && override !== effective ? ` (ignored invalid "${process.env[envName]}")` : '');
}
if (
  process.env.OPS_DEBUG_BACKEND === '1' ||
  BACKEND_NAME === 'sqlite' ||
  Object.values(_summary).some((v) => v !== BACKEND_NAME)
) {
  console.log('[repositories] backend resolution:', _summary);
}

export function getBackendName() {
  return BACKEND_NAME;
}
export function getBackendSummary() {
  return { master: BACKEND_NAME, datasets: { ..._summary } };
}

// Public read API. Each method picks its backend from per-dataset env
// overrides so ops can flip one dataset at a time during cutover.
export function listBom() {
  return backendFor('bom').listBom();
}
export function listRouting() {
  return backendFor('routing').listRouting();
}
export function listInventory() {
  return backendFor('inventory').listInventory();
}
export function listFinishedGoods() {
  return backendFor('finished_goods').listFinishedGoods();
}
export function listRawMaterials() {
  return backendFor('raw_materials').listRawMaterials();
}
export function listMaterialsNpi() {
  return backendFor('materials_npi').listMaterialsNpi();
}
export function listMaterialsSourcing() {
  return backendFor('materials_sourcing').listMaterialsSourcing();
}

// Composite: returns { inventory, finishedGoods, rawMaterials } — matches
// the shape dataSync.getInventory() returns so /api/shared/inventory
// callers get identical response.
export function listInventoryAll() {
  return {
    inventory: listInventory(),
    finishedGoods: listFinishedGoods(),
    rawMaterials: listRawMaterials(),
  };
}

// Per-part filters. In file backend these walk the array in-memory;
// sqlite backend could use indexed `WHERE part_no = ?` but the results
// are bucketed via raw_json reconstruction, so we keep it backend-
// agnostic: just filter the full list. Still O(n) but n < 40k and
// these endpoints are rarely called (quote detail views only).
export function listBomForPart(partNo) {
  return listBom().filter((r) => r['Parent Part No'] === partNo || r['parent_part_no'] === partNo);
}

export function listRoutingForPart(partNo) {
  return listRouting().filter((r) => r['Part No'] === partNo || r['part_no'] === partNo);
}

export function listQuotes() {
  return backendFor('quotes').listQuotes();
}
export function listRfqTracker() {
  return backendFor('rfq_tracker').listRfqTracker();
}
export function listSampleTracker() {
  return backendFor('sample_tracker').listSampleTracker();
}
