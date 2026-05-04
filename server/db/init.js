/**
 * Initialize the SQLite schema. Idempotent: re-runs CREATE TABLE IF NOT
 * EXISTS, so re-running on a populated DB is a no-op.
 *
 * Usage:
 *   node server/db/init.js                    # init at default path
 *   OPS_DB_PATH=/tmp/ops.db node server/db/init.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { getDb, getDbPath } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initSchema() {
  const db = getDb();
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(sql);
  applyAdditiveMigrations(db);
  return db;
}

// SQLite's `ALTER TABLE ... ADD COLUMN` is not idempotent — re-running
// after the column exists raises "duplicate column name". For tables
// that already exist on a production DB (i.e. an upgrade path), we add
// columns here behind a pragma-driven existence check. New columns are
// also declared inline in schema.sql so fresh installs skip this path.
function applyAdditiveMigrations(db) {
  // MES-2.1 — six op-status timestamps + paused-reason-code on work_order_op.
  const woopCols = new Set(
    db
      .prepare("SELECT name FROM pragma_table_info('work_order_op')")
      .all()
      .map((r) => r.name)
  );
  for (const col of [
    'started_at',
    'paused_at',
    'paused_reason_code',
    'completed_at',
    'accepted_at',
    'last_pulse_at',
  ]) {
    if (!woopCols.has(col)) {
      db.exec(`ALTER TABLE work_order_op ADD COLUMN ${col} TEXT`);
    }
  }
}

// Run directly: node server/db/init.js
// Use pathToFileURL so paths containing spaces (e.g. "/Volumes/Macintosh Data/...")
// produce URL-encoded comparisons that match import.meta.url.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbPath = getDbPath();
  console.log(`Initializing SQLite at ${dbPath}`);
  initSchema();
  const db = getDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all();
  console.log(`Tables: ${tables.map((t) => t.name).join(', ')}`);
  console.log('OK');
}
