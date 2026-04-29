/**
 * Shadow-write helpers — keep ops.db in sync with JS/JSON file imports.
 *
 * Rule: file write is source of truth. SQLite write comes AFTER and
 * never blocks the caller. A failed shadow-write marks the dataset as
 * 'stale' in _migration_state so ops can trigger a resync via
 * migrate-to-sqlite.js --force.
 *
 * Bulk shape (full replace per dataset) matches import.js behavior:
 * every import rewrites the whole .js file. We do the same in SQLite —
 * BEGIN → DELETE → INSERT → COMMIT atomically. No append/merge logic.
 */
import fs from 'fs';
import { getDb, getDbPath, computeRowsChecksum } from '../db/connection.js';
import { initSchema } from '../db/init.js';

// Reuse the mappers from the migration script? No — keeping them inline
// here so this file has a single responsibility and migration script
// stays a CLI-only tool.

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function intOrNull(v) {
  const n = numOrNull(v);
  return n == null ? null : Math.trunc(n);
}

// ─── mappers (source row → DB row). Must match migrate-to-sqlite.js. ─
const MAPPERS = {
  bom(r) {
    return {
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
      raw_json:         JSON.stringify(r),
    };
  },
  routing(r) {
    return {
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
      raw_json:            JSON.stringify(r),
    };
  },
  inventory(r, kind) {
    return {
      kind,
      part_no:      r['Part No'] ?? r['Part'] ?? null,
      part_desc:    r['Part Description'] ?? r['Description'] ?? null,
      qty_on_hand:  numOrNull(r['Qty On Hand'] ?? r['Qty'] ?? r['Quantity']),
      uom:          r['UOM'] ?? r['Unit'] ?? null,
      location:     r['Location'] ?? r['Location No'] ?? null,
      lot_no:       r['Lot/Batch'] ?? r['Lot No'] ?? r['Lot'] ?? null,
      raw_json:     JSON.stringify(r),
    };
  },
  materials(r, kind) {
    return {
      kind,
      code:      r.code ?? r.material ?? null,
      name:      r.name ?? r.req ?? null,
      price:     numOrNull(r.price ?? r.exw ?? r.dap),
      type:      r.type ?? null,
      thick:     r.thick ?? null,
      color:     r.color ?? null,
      surface:   r.surface ?? null,
      adhesive:  r.adhesive ?? null,
      moq:       r.moq != null ? String(r.moq) : null,
      lt:        r.lt != null ? String(r.lt) : null,
      supplier:  r.supplier ?? null,
      note:      r.note ?? r.status ?? null,
      date:      r.date ?? r.month ?? null,
      raw_json:  JSON.stringify(r),
    };
  },
};

// ─── Core helper ──────────────────────────────────────────────────
/**
 * Replace all rows in `table` with a fresh set, atomically.
 * Optional `deleteFilter` narrows the delete scope — used for
 * ifs_inventory + materials where we only replace rows of the
 * matching `kind`, not the whole table.
 *
 * Returns { ok, rowsInserted, error? }. Never throws — callers stay
 * responsive even if DB is broken.
 */
function atomicReplace(table, rowsMapped, deleteWhere = null) {
  try {
    if (!fs.existsSync(getDbPath())) {
      return { ok: false, error: 'ops.db not found; skipping shadow-write' };
    }
    const db = getDb();
    initSchema(); // idempotent

    const colNames = Object.keys(rowsMapped[0] || {});
    if (colNames.length === 0) {
      // Empty import → just clear the table (or scope)
      if (deleteWhere) db.prepare(`DELETE FROM ${table} WHERE ${deleteWhere.sql}`).run(...deleteWhere.params);
      else db.prepare(`DELETE FROM ${table}`).run();
      updateState(table, 0, 'fresh');
      return { ok: true, rowsInserted: 0 };
    }

    const placeholders = colNames.map(c => `@${c}`).join(', ');
    const insertSql = `INSERT INTO ${table} (${colNames.join(', ')}) VALUES (${placeholders})`;
    const insert = db.prepare(insertSql);

    const runTx = db.transaction((rows) => {
      if (deleteWhere) db.prepare(`DELETE FROM ${table} WHERE ${deleteWhere.sql}`).run(...deleteWhere.params);
      else db.prepare(`DELETE FROM ${table}`).run();
      for (const r of rows) insert.run(r);
    });
    runTx(rowsMapped);

    const count = deleteWhere
      ? db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${deleteWhere.sql}`).get(...deleteWhere.params).n
      : db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

    updateState(datasetFromTable(table, deleteWhere), count, 'fresh');
    return { ok: true, rowsInserted: count };
  } catch (err) {
    console.warn(`[shadowWrite] ${table} failed:`, err.message);
    try { updateState(datasetFromTable(table, deleteWhere), 0, 'stale'); } catch {}
    return { ok: false, error: err.message };
  }
}

function datasetFromTable(table, deleteWhere) {
  if (table === 'bom') return 'bom';
  if (table === 'routing_operations') return 'routing';
  if (table === 'ifs_inventory') return `inventory_${deleteWhere?.kind || 'all'}`;
  if (table === 'materials') return `materials_${deleteWhere?.kind || 'all'}`;
  return table;
}

function updateState(dataset, rowCount, mode) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO _migration_state (dataset, mode, last_sync, row_count, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(dataset) DO UPDATE SET
        mode=excluded.mode,
        last_sync=excluded.last_sync,
        row_count=excluded.row_count,
        updated_at=excluded.updated_at
    `).run(dataset, mode, rowCount);
  } catch { /* state tracking is best-effort */ }
}

// ─── Public shadow-write functions (one per dataset) ──────────────
export function shadowWriteBom(rowObjects) {
  return atomicReplace('bom', rowObjects.map(MAPPERS.bom));
}

export function shadowWriteRouting(rowObjects) {
  return atomicReplace('routing_operations', rowObjects.map(MAPPERS.routing));
}

export function shadowWriteInventory(rowObjects, kind /* 'inventory' | 'finished_goods' | 'raw_materials' */) {
  if (!['inventory', 'finished_goods', 'raw_materials'].includes(kind)) {
    return { ok: false, error: `invalid inventory kind: ${kind}` };
  }
  return atomicReplace(
    'ifs_inventory',
    rowObjects.map(r => MAPPERS.inventory(r, kind)),
    { sql: 'kind = ?', params: [kind], kind }
  );
}

export function shadowWriteMaterials(rowObjects, kind /* 'npi' | 'sourcing' */) {
  if (!['npi', 'sourcing'].includes(kind)) {
    return { ok: false, error: `invalid materials kind: ${kind}` };
  }
  return atomicReplace(
    'materials',
    rowObjects.map(r => MAPPERS.materials(r, kind)),
    { sql: 'kind = ?', params: [kind], kind }
  );
}

// ─── Clear helpers (mirror DELETE /api/import/:slug) ──────────────
export function shadowClearBom()     { return atomicReplace('bom', []); }
export function shadowClearRouting() { return atomicReplace('routing_operations', []); }
export function shadowClearInventory(kind) {
  return atomicReplace('ifs_inventory', [], { sql: 'kind = ?', params: [kind], kind });
}
export function shadowClearMaterials(kind) {
  return atomicReplace('materials', [], { sql: 'kind = ?', params: [kind], kind });
}
