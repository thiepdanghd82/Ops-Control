/**
 * SQLite backend — reads from ops.db, reconstructs original row shape
 * from the raw_json column. Each row-object returned matches what
 * parseJsDataFile() would return, so downstream code (DataBrowser,
 * calc engine) works without modification.
 *
 * Safety net: if the queried table is empty (e.g. migration not run
 * yet for this dataset), fall back to file backend transparently.
 * This makes it safe to flip OPS_DATA_BACKEND=sqlite even if only
 * some datasets are migrated.
 *
 * Sprint 7.1 adds write surface for the quotes table so /save-all can
 * shadow-write into SQLite while the JSON file remains the source of
 * truth. Writes are transactional; read methods still fall back to
 * file when the DB is absent or empty.
 */
import { getDb, getDbPath } from '../../db/connection.js';
import fs from 'fs';
import fileBackend from './fileBackend.js';

// Lazy db init — only open the file when first queried. Allows the
// module to load even when ops.db doesn't exist yet. Reset per-process
// on every call in test runs that wipe the db file; in prod the
// cached `dbReady` short-circuits on the happy path.
let dbReady = null;
function db() {
  if (dbReady !== null) return dbReady;
  const fp = getDbPath();
  if (!fs.existsSync(fp)) { dbReady = false; return false; }
  try {
    dbReady = getDb();
    // Sanity: verify _migration_state exists (schema initialized).
    dbReady.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migration_state'").get();
  } catch (err) {
    console.warn('[sqliteBackend] failed to open ops.db, falling back to file:', err.message);
    dbReady = false;
  }
  return dbReady;
}

/** Test hook: clears the module-scope cache so a new OPS_DB_PATH can
 *  be picked up. Not called from production code. */
export function _resetDbReadyForTests() {
  dbReady = null;
}

// ── Column extraction for quotes (Sprint 7.1) ────────────────────────
//
// Mirrors the shape produced by `scripts/migrate-to-sqlite.js:toQuoteCols`.
// Keeping one source of truth for that mapping would require importing
// from a script directory, which has an awkward dev-dependency story;
// the duplication here is small and the migration script is audited
// to match.
function scalarOrJson(v) {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function quoteColumnsFor(q) {
  const raw = JSON.stringify(q);
  const state = q && typeof q.state === 'object' ? q.state : {};
  return {
    id:          Number.isFinite(+q?.id) ? +q.id : null,
    type:        scalarOrJson(q?.type),
    rfq_number:  scalarOrJson(state.rfq_number ?? state.rfq_no),
    ccl_pn:      scalarOrJson(state.ccl_pn),
    direct_cu:   scalarOrJson(state.direct_cu),
    end_cu:      scalarOrJson(state.end_cu),
    npi_owner:   scalarOrJson(q?.npi_owner ?? state.npi_owner),
    sale_owner:  scalarOrJson(q?.sale_owner ?? state.sale_owner),
    saved_at:    scalarOrJson(q?.saved_at),
    version:     scalarOrJson(q?.version),
    label:       scalarOrJson(q?.label),
    result:      scalarOrJson(q?.result),
    state_json:  JSON.stringify(state),
    raw_json:    raw,
  };
}

const QUOTE_INSERT_SQL = `
  INSERT OR REPLACE INTO quotes
    (id, type, rfq_number, ccl_pn, direct_cu, end_cu, npi_owner, sale_owner,
     saved_at, version, label, result, state_json, raw_json, updated_at)
  VALUES
    (@id, @type, @rfq_number, @ccl_pn, @direct_cu, @end_cu, @npi_owner, @sale_owner,
     @saved_at, @version, @label, @result, @state_json, @raw_json, CURRENT_TIMESTAMP)
`;

// Whitelist of allowed tables + optional `kind` partitions. Any call
// with a table/kind not in this map throws — prevents SQL injection
// regressions if a future caller accidentally passes user input.
const ALLOWED_QUERIES = {
  bom:                 { kinds: null },
  routing_operations:  { kinds: null },
  ifs_inventory:       { kinds: new Set(['inventory', 'finished_goods', 'raw_materials']) },
  materials:           { kinds: new Set(['npi', 'sourcing']) },
  quotes:              { kinds: null },
  rfq_tracker:         { kinds: null },
  sample_tracker:      { kinds: null },
};

function rowsFromTable(table, kind = null) {
  const spec = ALLOWED_QUERIES[table];
  if (!spec) throw new Error(`[sqliteBackend] table not allowed: ${table}`);
  if (kind != null) {
    if (!spec.kinds || !spec.kinds.has(kind)) {
      throw new Error(`[sqliteBackend] kind not allowed for ${table}: ${kind}`);
    }
  }
  const conn = db();
  if (!conn) return null;   // signal caller to fall back
  const rows = kind != null
    ? conn.prepare(`SELECT raw_json FROM ${table} WHERE kind = ?`).all(kind)
    : conn.prepare(`SELECT raw_json FROM ${table}`).all();
  if (rows.length === 0) return null;   // empty → fall back to file
  // Preserve raw-json shape: parse back into the same object shape
  // parseJsDataFile would produce.
  return rows.map(r => {
    try { return JSON.parse(r.raw_json); }
    catch { return {}; }
  });
}

export default {
  listBom() {
    return rowsFromTable('bom') ?? fileBackend.listBom();
  },
  listRouting() {
    return rowsFromTable('routing_operations') ?? fileBackend.listRouting();
  },
  listInventory() {
    return rowsFromTable('ifs_inventory', 'inventory') ?? fileBackend.listInventory();
  },
  listFinishedGoods() {
    return rowsFromTable('ifs_inventory', 'finished_goods') ?? fileBackend.listFinishedGoods();
  },
  listRawMaterials() {
    return rowsFromTable('ifs_inventory', 'raw_materials') ?? fileBackend.listRawMaterials();
  },
  listMaterialsNpi() {
    return rowsFromTable('materials', 'npi') ?? fileBackend.listMaterialsNpi();
  },
  listMaterialsSourcing() {
    return rowsFromTable('materials', 'sourcing') ?? fileBackend.listMaterialsSourcing();
  },
  listQuotes() {
    return rowsFromTable('quotes') ?? fileBackend.listQuotes();
  },
  /**
   * Fetch a single quote by id. Returns the parsed raw_json or null
   * when the row is absent. Falls back to the file backend only if
   * the DB is missing entirely — a quote that exists on file but
   * not in SQLite during shadow-write lag should resolve here so
   * the approval endpoint doesn't 404 spuriously.
   */
  getQuoteById(id) {
    const conn = db();
    if (!conn) {
      const list = fileBackend.listQuotes() || [];
      return list.find(q => q && q.id === id) || null;
    }
    try {
      const row = conn.prepare('SELECT raw_json FROM quotes WHERE id = ?').get(id);
      if (row) {
        try { return JSON.parse(row.raw_json); } catch { /* corrupt row — fall back */ }
      }
    } catch { /* fall through to file */ }
    const list = fileBackend.listQuotes() || [];
    return list.find(q => q && q.id === id) || null;
  },
  /**
   * Shadow-write a single quote into SQLite. Best-effort: returns
   * `{ ok: true }` on success, `{ ok: false, reason }` when the DB
   * isn't available or the insert threw. Never throws upstream —
   * callers expect this to be opportunistic.
   */
  upsertQuote(quote) {
    const conn = db();
    if (!conn) return { ok: false, reason: 'db-unavailable' };
    if (!quote || !Number.isFinite(+quote.id)) {
      return { ok: false, reason: 'missing-id' };
    }
    try {
      const stmt = conn.prepare(QUOTE_INSERT_SQL);
      stmt.run(quoteColumnsFor(quote));
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err?.message || 'upsert-failed' };
    }
  },
  /**
   * Replace the entire quotes set inside a transaction. Matches the
   * semantics of /save-all (the JSON file write is a full rewrite of
   * quote_history, so SQLite should match). Quotes missing an id are
   * skipped with a warning.
   *
   * Returns `{ ok, written, deleted, skipped, reason? }`. On a DB
   * error the caller can log + move on — the JSON file is still the
   * source of truth.
   */
  upsertQuotesBulk(quotes) {
    const conn = db();
    if (!conn) return { ok: false, written: 0, deleted: 0, skipped: 0, reason: 'db-unavailable' };
    const list = Array.isArray(quotes) ? quotes : [];
    const valid = list.filter(q => q && Number.isFinite(+q.id));
    const skipped = list.length - valid.length;
    const keepIds = new Set(valid.map(q => +q.id));
    try {
      const insert = conn.prepare(QUOTE_INSERT_SQL);
      // DELETE-then-upsert semantics wrapped in a single transaction.
      // The DELETE removes quotes no longer in the file (file is the
      // authoritative set for Sprint 7.1). If valid is empty (user
      // cleared all quotes) we still want the DELETE to run.
      const runTxn = conn.transaction((rowsToWrite, ids) => {
        let deleted = 0;
        if (ids.size === 0) {
          deleted = conn.prepare('DELETE FROM quotes').run().changes;
        } else {
          // SQLite param limits: chunk the NOT IN to stay well under
          // the 999-variable default cap. For Ops Control's <1k quotes
          // we never hit it, but defensive coding.
          const CHUNK = 500;
          const idArr = [...ids];
          let kept = [];
          for (let i = 0; i < idArr.length; i += CHUNK) {
            kept = idArr.slice(i, i + CHUNK);
            const placeholders = kept.map(() => '?').join(',');
            if (i === 0) {
              // First chunk drives the DELETE; subsequent chunks only
              // matter if we split the NOT-IN set, which is never the
              // case under 500 rows.
              const stmt = conn.prepare(`DELETE FROM quotes WHERE id NOT IN (${placeholders})`);
              deleted = stmt.run(...kept).changes;
            }
          }
        }
        for (const r of rowsToWrite) insert.run(quoteColumnsFor(r));
        return { deleted };
      });
      const { deleted } = runTxn(valid, keepIds);
      return { ok: true, written: valid.length, deleted, skipped };
    } catch (err) {
      return {
        ok: false, written: 0, deleted: 0, skipped,
        reason: err?.message || 'bulk-upsert-failed',
      };
    }
  },
  listRfqTracker() {
    // Empty SQLite table is legitimate here (tracker starts empty).
    // Distinguish "table exists with 0 rows" (legit) from "table missing
    // entirely" (fall back) by checking schema first.
    const conn = db();
    if (!conn) return fileBackend.listRfqTracker();
    const has = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rfq_tracker'").get();
    if (!has) return fileBackend.listRfqTracker();
    const rows = conn.prepare('SELECT raw_json FROM rfq_tracker').all();
    return rows.map(r => { try { return JSON.parse(r.raw_json); } catch { return {}; } });
  },
  listSampleTracker() {
    const conn = db();
    if (!conn) return fileBackend.listSampleTracker();
    const has = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sample_tracker'").get();
    if (!has) return fileBackend.listSampleTracker();
    const rows = conn.prepare('SELECT raw_json FROM sample_tracker').all();
    return rows.map(r => { try { return JSON.parse(r.raw_json); } catch { return {}; } });
  },
};
