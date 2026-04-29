#!/usr/bin/env node
/**
 * Migrate typed reference data from JS/JSON files → SQLite.
 *
 * Scope (phase 1):
 *   - bom              ← Library/Manufacturing_Structures/mfg_structures_data.js
 *   - routing          ← Library/Routing_Operations/routing_ops_data.js
 *   - inventory        ← Library/IFS_Inventory/{inventory,finished_good,raw_materials}_data.js
 *   - materials        ← Library/MaterialCost/{npi_materials,sourcing_db}.json
 *
 * Flags:
 *   --dry-run           parse + count + checksum, NO db writes
 *   --commit            same as above, then atomically insert
 *   --dataset=X         limit to one dataset (bom | routing | inventory | materials)
 *   --force             allow re-running on a non-empty table (drops + reinserts)
 *
 * Exit codes:
 *   0   success
 *   1   source parse error
 *   2   parity mismatch (count or checksum)
 *   3   db error
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, getDbPath, computeRowsChecksum } from '../server/db/connection.js';
import { initSchema } from '../server/db/init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'server', 'data', 'Library');

// ─── argv parsing ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const COMMIT = args.includes('--commit');
const FORCE = args.includes('--force');
const datasetArg = args.find(a => a.startsWith('--dataset='));
const ONLY_DATASET = datasetArg ? datasetArg.slice('--dataset='.length) : null;

if (!DRY_RUN && !COMMIT) {
  console.error('Usage: node scripts/migrate-to-sqlite.js --dry-run | --commit [--dataset=X] [--force]');
  process.exit(2);
}

// ─── parsers ──────────────────────────────────────────────────────
function parseJsDataFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const eqIdx = content.indexOf('=');
  if (eqIdx === -1) throw new Error(`Cannot parse: ${filePath}`);
  let jsonStr = content.slice(eqIdx + 1).trim();
  if (jsonStr.endsWith(';')) jsonStr = jsonStr.slice(0, -1).trim();
  const parsed = JSON.parse(jsonStr);
  if (parsed && parsed.headers && Array.isArray(parsed.rows)) {
    return parsed.rows.map(row =>
      Object.fromEntries(parsed.headers.map((h, i) => [h, row[i] ?? '']))
    );
  }
  return Array.isArray(parsed) ? parsed : [parsed];
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ─── dataset loaders ──────────────────────────────────────────────
// Each returns array of objects {field: value, …}.

function loadBom() {
  const fp = path.join(LIB, 'Manufacturing_Structures', 'mfg_structures_data.js');
  if (!fs.existsSync(fp)) return [];
  return parseJsDataFile(fp);
}

function loadRouting() {
  const fp = path.join(LIB, 'Routing_Operations', 'routing_ops_data.js');
  if (!fs.existsSync(fp)) return [];
  return parseJsDataFile(fp);
}

function loadInventory() {
  const subs = [
    { kind: 'inventory', file: 'inventory_data.js' },
    { kind: 'finished_goods', file: 'finished_good_data.js' },
    { kind: 'raw_materials', file: 'raw_materials_data.js' },
  ];
  const all = [];
  for (const { kind, file } of subs) {
    const fp = path.join(LIB, 'IFS_Inventory', file);
    if (!fs.existsSync(fp)) continue;
    const rows = parseJsDataFile(fp);
    for (const r of rows) all.push({ ...r, _kind: kind });
  }
  return all;
}

function loadMaterials() {
  const all = [];
  const npiFp = path.join(LIB, 'MaterialCost', 'npi_materials.json');
  const srcFp = path.join(LIB, 'MaterialCost', 'sourcing_db.json');
  if (fs.existsSync(npiFp)) {
    for (const r of readJsonFile(npiFp)) all.push({ ...r, _kind: 'npi' });
  }
  if (fs.existsSync(srcFp)) {
    for (const r of readJsonFile(srcFp)) all.push({ ...r, _kind: 'sourcing' });
  }
  return all;
}

function loadQuotes() {
  const fp = path.join(LIB, 'QuoteHistory', 'quote_history.json');
  if (!fs.existsSync(fp)) return [];
  const data = readJsonFile(fp);
  return Array.isArray(data) ? data : [];
}

function loadRfqTracker() {
  const fp = path.join(LIB, 'RFQTracker', 'rfq_tracker.json');
  if (!fs.existsSync(fp)) return [];
  const data = readJsonFile(fp);
  return Array.isArray(data) ? data : [];
}

function loadSampleTracker() {
  const fp = path.join(LIB, 'SampleTracking', 'sample_tracking.json');
  if (!fs.existsSync(fp)) return [];
  const data = readJsonFile(fp);
  return Array.isArray(data) ? data : [];
}

// ─── row mappers: source object → DB columns ───────────────────────
// Each returns [fieldList, valueList, rawJson] — the raw_json column
// preserves the original untouched row so repo reads can reconstruct
// the exact shape DataBrowser expects.

function toBomCols(r) {
  const raw = JSON.stringify(r);
  return {
    cols: {
      parent_part:      r['Parent Part No'] ?? null,
      parent_desc:      r['Parent Part Description'] ?? null,
      component_part:   r['Component Part'] ?? null,
      component_desc:   r['Component Part Description'] ?? null,
      qty_per_assembly: numOrNull(r['Qty Per Assembly']),
      scrap:            numOrNull(r['Component Scrap']),
      scrap_pct:        numOrNull(r['Scrap Factor (%)']),
      uom:              r['UOM'] ?? null,
      pitch:            numOrNull(r['Pitch']),
      cavity:           intOrNull(r['Cavity']),
      color_nums:       intOrNull(r['Color Nums']),
      structure_type:   r['Structure Type'] ?? null,
      alternative_no:   r['Alternative No'] ?? null,
      effectivity:      r['Structure Effectivity'] ?? null,
      planner:          r['Planner'] ?? null,
      raw_json:         raw,
    },
  };
}

function toRoutingCols(r) {
  const raw = JSON.stringify(r);
  return {
    cols: {
      part_no:             r['Part No'] ?? null,
      part_desc:           r['Part Description'] ?? null,
      operation_no:        intOrNull(r['Operation No']),
      operation_desc:      r['Operation Description'] ?? null,
      work_centre_no:      r['Work Centre No'] ?? null,
      work_centre_desc:    r['Work Centre Desc'] ?? null,
      mach_setup_time:     numOrNull(r['Mach Setup Time']),
      labour_setup_time:   numOrNull(r['Labour Setup Time']),
      mach_run_factor:     numOrNull(r['Mach Run Factor']),
      labour_run_factor:   numOrNull(r['Labour Run Factor']),
      factor_unit:         r['Factor Unit'] ?? null,
      setup_crew_size:     intOrNull(r['Setup Crew Size']),
      crew_size:           intOrNull(r['Crew Size']),
      alternative:         r['Alternative'] ?? null,
      routing_revision:    r['Routing Revision'] ?? null,
      routing_type:        r['Routing Type'] ?? null,
      efficiency_factor:   numOrNull(r['Efficiency Factor']),
      site:                r['Site'] ?? null,
      state:               r['State'] ?? null,
      raw_json:            raw,
    },
  };
}

function toInventoryCols(r) {
  const raw = JSON.stringify(r);
  const { _kind, ...rest } = r;
  // IFS files use heterogeneous headers per kind; extract common ones,
  // fall back to raw_json for everything else.
  return {
    cols: {
      kind:         _kind,
      part_no:      rest['Part No'] ?? rest['Part'] ?? null,
      part_desc:    rest['Part Description'] ?? rest['Description'] ?? null,
      qty_on_hand:  numOrNull(rest['Qty On Hand'] ?? rest['Qty'] ?? rest['Quantity']),
      uom:          rest['UOM'] ?? rest['Unit'] ?? null,
      location:     rest['Location'] ?? rest['Location No'] ?? null,
      lot_no:       rest['Lot/Batch'] ?? rest['Lot No'] ?? rest['Lot'] ?? null,
      raw_json:     JSON.stringify(rest),
    },
  };
}

// Coerce any value to a SQLite-bindable scalar (string/number/null).
// Objects (e.g. nested `result` payload on some quotes) → JSON string.
function scalarOr(v) {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function toQuoteCols(r) {
  const raw = JSON.stringify(r);
  const state = r.state && typeof r.state === 'object' ? r.state : {};
  return {
    cols: {
      id:            intOrNull(r.id),
      type:          scalarOr(r.type),
      rfq_number:    scalarOr(state.rfq_number ?? state.rfq_no),
      ccl_pn:        scalarOr(state.ccl_pn),
      direct_cu:     scalarOr(state.direct_cu),
      end_cu:        scalarOr(state.end_cu),
      npi_owner:     scalarOr(r.npi_owner ?? state.npi_owner),
      sale_owner:    scalarOr(r.sale_owner ?? state.sale_owner),
      saved_at:      scalarOr(r.saved_at),
      version:       scalarOr(r.version),
      label:         scalarOr(r.label),
      result:        scalarOr(r.result),
      state_json:    JSON.stringify(state),
      raw_json:      raw,
    },
  };
}

function toRfqTrackerCols(r) {
  return {
    cols: {
      rfq_no:     r.rfq_no ?? r.rfq_number ?? null,
      customer:   r.customer ?? null,
      product:    r.product ?? null,
      stage:      r.stage ?? null,
      owner:      r.owner ?? r.npi_owner ?? null,
      result:     r.result ?? null,
      raw_json:   JSON.stringify(r),
    },
  };
}

function toSampleTrackerCols(r) {
  return {
    cols: {
      part_no:        r.part_no ?? r.ccl_pn ?? null,
      customer:       r.customer ?? r.direct_cu ?? null,
      overall_status: r.overall_status ?? null,
      raw_json:       JSON.stringify(r),
    },
  };
}

function toMaterialCols(r) {
  const { _kind, ...rest } = r;
  return {
    cols: {
      kind:      _kind,
      code:      rest.code ?? rest.material ?? null,
      name:      rest.name ?? rest.req ?? null,
      price:     numOrNull(rest.price ?? rest.exw ?? rest.dap),
      type:      rest.type ?? null,
      thick:     rest.thick ?? null,
      color:     rest.color ?? null,
      surface:   rest.surface ?? null,
      adhesive:  rest.adhesive ?? null,
      moq:       rest.moq != null ? String(rest.moq) : null,
      lt:        rest.lt != null ? String(rest.lt) : null,
      supplier:  rest.supplier ?? null,
      note:      rest.note ?? rest.status ?? null,
      date:      rest.date ?? rest.month ?? null,
      raw_json:  JSON.stringify(rest),
    },
  };
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v) {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
}

// ─── dataset config ────────────────────────────────────────────────
const DATASETS = {
  bom: {
    table: 'bom',
    loader: loadBom,
    mapper: toBomCols,
  },
  routing: {
    table: 'routing_operations',
    loader: loadRouting,
    mapper: toRoutingCols,
  },
  inventory: {
    table: 'ifs_inventory',
    loader: loadInventory,
    mapper: toInventoryCols,
  },
  materials: {
    table: 'materials',
    loader: loadMaterials,
    mapper: toMaterialCols,
  },
  quotes: {
    table: 'quotes',
    loader: loadQuotes,
    mapper: toQuoteCols,
  },
  rfq_tracker: {
    table: 'rfq_tracker',
    loader: loadRfqTracker,
    mapper: toRfqTrackerCols,
  },
  sample_tracker: {
    table: 'sample_tracker',
    loader: loadSampleTracker,
    mapper: toSampleTrackerCols,
  },
};

// ─── run ─────────────────────────────────────────────────────────
function processDataset(name, cfg) {
  console.log(`\n── ${name} ──`);
  let rows;
  try {
    rows = cfg.loader();
  } catch (err) {
    console.error(`  ✖  parse error: ${err.message}`);
    process.exit(1);
  }
  console.log(`  source rows: ${rows.length}`);

  // Checksum on raw JSON of each row (pre-DB, independent of schema)
  const rawJsons = rows.map(r => JSON.stringify(r));
  const srcChecksum = computeRowsChecksum(rawJsons);
  console.log(`  source checksum: ${srcChecksum.slice(0, 16)}…`);

  if (DRY_RUN) return { dataset: name, rows: rows.length, srcChecksum };

  const db = getDb();
  initSchema();

  // Guard: if target table already has data and --force not set, bail.
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM ${cfg.table}`).get().n;
  if (existing > 0 && !FORCE) {
    console.error(`  ✖  table ${cfg.table} has ${existing} rows already. Re-run with --force to drop + reinsert.`);
    process.exit(3);
  }

  // Build insert statement from first-row mapper output
  const mapped0 = cfg.mapper(rows[0] || {});
  const colNames = Object.keys(mapped0.cols);
  const placeholders = colNames.map(c => `@${c}`).join(', ');
  const insertSql = `INSERT INTO ${cfg.table} (${colNames.join(', ')}) VALUES (${placeholders})`;
  const insert = db.prepare(insertSql);

  // Atomic insert: everything in one TX. Abort on any error.
  const insertAll = db.transaction((rows) => {
    if (existing > 0) db.prepare(`DELETE FROM ${cfg.table}`).run();
    let n = 0;
    for (const r of rows) {
      const { cols } = cfg.mapper(r);
      insert.run(cols);
      n++;
    }
    return n;
  });

  let inserted;
  try {
    inserted = insertAll(rows);
  } catch (err) {
    console.error(`  ✖  insert failed — transaction rolled back: ${err.message}`);
    process.exit(3);
  }
  console.log(`  inserted: ${inserted}`);

  // Verify row count parity
  const dbCount = db.prepare(`SELECT COUNT(*) AS n FROM ${cfg.table} ${cfg.table === 'ifs_inventory' || cfg.table === 'materials' ? '' : ''}`).get().n;
  if (dbCount !== rows.length) {
    console.error(`  ✖  PARITY FAIL: expected ${rows.length}, got ${dbCount}`);
    process.exit(2);
  }

  // Verify raw_json checksum parity
  const dbRows = db.prepare(`SELECT raw_json FROM ${cfg.table}`).all();
  const dbChecksum = computeRowsChecksum(dbRows.map(r => r.raw_json));

  // For inventory/materials, source has _kind embedded which the DB
  // raw_json strips. Recompute source checksum without _kind for
  // apples-to-apples.
  let expectedChecksum = srcChecksum;
  if (name === 'inventory' || name === 'materials') {
    expectedChecksum = computeRowsChecksum(rows.map(r => {
      const { _kind, ...rest } = r; return JSON.stringify(rest);
    }));
  }

  if (dbChecksum !== expectedChecksum) {
    console.error(`  ✖  CHECKSUM FAIL: src=${expectedChecksum.slice(0, 16)}…, db=${dbChecksum.slice(0, 16)}…`);
    process.exit(2);
  }
  console.log(`  db checksum:     ${dbChecksum.slice(0, 16)}… (match)`);

  // Record in _migration_state
  db.prepare(`
    INSERT INTO _migration_state (dataset, mode, last_sync, row_count, checksum, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(dataset) DO UPDATE SET
      mode=excluded.mode,
      last_sync=excluded.last_sync,
      row_count=excluded.row_count,
      checksum=excluded.checksum,
      updated_at=excluded.updated_at
  `).run(name, 'shadow-write', inserted, dbChecksum);

  return { dataset: name, rows: rows.length, srcChecksum, dbChecksum, inserted };
}

// ─── main ─────────────────────────────────────────────────────────
console.log(`DB path: ${getDbPath()}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'COMMIT'}${FORCE ? ' + FORCE' : ''}`);

const datasets = ONLY_DATASET ? [ONLY_DATASET] : Object.keys(DATASETS);
const results = [];
for (const name of datasets) {
  if (!DATASETS[name]) {
    console.error(`Unknown dataset: ${name}`);
    process.exit(2);
  }
  results.push(processDataset(name, DATASETS[name]));
}

console.log('\n── summary ──');
for (const r of results) {
  console.log(`  ${r.dataset.padEnd(10)}  rows=${r.rows}  checksum=${r.srcChecksum.slice(0, 16)}…`);
}
console.log('\nOK');
