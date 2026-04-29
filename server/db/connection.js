/**
 * SQLite connection singleton for Ops Control.
 *
 * Single database file at server/data/ops.db. Opened lazily on first
 * getDb() call so unit tests / scripts can override the path via
 * OPS_DB_PATH env var before the first connection is made.
 *
 * PRAGMAs applied at connection time:
 *   journal_mode = WAL     — concurrent readers, single writer
 *   synchronous = NORMAL   — fsync on checkpoint, not every commit.
 *                            Faster than FULL, still crash-safe when
 *                            combined with WAL's shadow-paging.
 *   busy_timeout = 5000    — wait 5s instead of failing on SQLITE_BUSY
 *   foreign_keys = ON
 *   temp_store = MEMORY    — temp tables in RAM (we only have ~50 MB data)
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let _db = null;
let _dbPath = null;

export function getDbPath() {
  if (_dbPath) return _dbPath;
  if (process.env.OPS_DB_PATH) {
    _dbPath = path.resolve(process.env.OPS_DB_PATH);
  } else {
    const dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(__dirname, '..', 'data');
    _dbPath = path.join(dataDir, 'ops.db');
  }
  return _dbPath;
}

export function getDb() {
  if (_db) return _db;
  const p = getDbPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  _db = new Database(p);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('busy_timeout = 5000');
  _db.pragma('foreign_keys = ON');
  _db.pragma('temp_store = MEMORY');
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Test hook: drop the cached path + connection so the next getDb()
 * call re-reads OPS_DB_PATH from the environment. Production never
 * calls this — the path is stable at boot.
 */
export function _resetForTests() {
  closeDb();
  _dbPath = null;
}

/**
 * Create a parity checksum for a set of row-JSON strings.
 * Sorts the rows so insertion order doesn't affect the checksum —
 * what we care about is "same set of rows", not "same order".
 */
export function computeRowsChecksum(rawJsons) {
  const hash = crypto.createHash('sha256');
  const sorted = [...rawJsons].sort();
  for (const j of sorted) hash.update(j).update('\n');
  return hash.digest('hex');
}
