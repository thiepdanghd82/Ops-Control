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
import { fileURLToPath } from 'url';
import { getDb, getDbPath } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function initSchema() {
  const db = getDb();
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(sql);
  return db;
}

// Run directly: node server/db/init.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = getDbPath();
  console.log(`Initializing SQLite at ${dbPath}`);
  initSchema();
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(`Tables: ${tables.map(t => t.name).join(', ')}`);
  console.log('OK');
}
