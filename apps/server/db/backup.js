/**
 * SQLite backup helper for ops.db.
 *
 * Uses better-sqlite3's db.backup() API (online-safe: no lock on the
 * live DB). Output is a standalone `.sqlite` file that can be copied,
 * compressed, or opened directly by any SQLite tool.
 *
 * Retention: prune backups older than OPS_BACKUP_RETENTION_DAYS
 * (default 30d, matches the existing JSON backup retention in
 * costApi.js /save-all).
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { getDb, getDbPath } from './connection.js';
import { getRetentionSettings } from '../utils/backupPath.js';

function backupDir() {
  // Put ops.db backups alongside the existing JSON auto-backups so
  // operators see a unified "Backup" folder.
  const dbPath = getDbPath();
  const dataRoot = path.dirname(dbPath); // server/data
  return path.join(dataRoot, 'Backup', 'SQLite');
}

function timestampTag() {
  return new Date().toISOString().replace(/[:.T]/g, '').slice(0, 15);
}

export async function backupOpsDb({ force = false } = {}) {
  const src = getDbPath();
  if (!fs.existsSync(src)) return { ok: false, error: 'ops.db not found' };

  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });

  // One backup per day. If force=false and today's file exists, skip.
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const existing = fs.readdirSync(dir).filter((f) => f.startsWith(`ops_${today}`));
  if (existing.length > 0 && !force) {
    return { ok: true, skipped: true, reason: 'daily backup already taken' };
  }

  const fname = `ops_${today}_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.sqlite`;
  const dest = path.join(dir, fname);

  try {
    const db = getDb();
    // better-sqlite3: db.backup() returns a Promise that resolves when
    // the copy is done. Online-safe because SQLite uses WAL shadow
    // pages — no write block, no read block.
    await db.backup(dest);
    const sizeMb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);

    // Retention prune — see pruneSqliteBackups below for why the
    // sidecars matter.
    // Same resolver as the scheduler's prune steps, so a retention saved in
    // Settings governs SQLite backups too — this read the env var directly
    // and silently ignored the UI value.
    const { pruned } = pruneSqliteBackups(dir, {
      retentionDays: getRetentionSettings().keepDays,
    });

    // `file` is the basename (legacy callers); `path` is the absolute path
    // (added 2026-05-08 — verifyBackup needs the full path to call
    // `new Database(...)` from a child process whose cwd is APP_ROOT,
    // not the backup directory).
    return { ok: true, file: fname, path: dest, size_mb: sizeMb, pruned_old: pruned };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Delete expired `ops_*.sqlite` / `ops_*.sqlite.gz` backups, and never leave a sidecar behind.
 *
 * SQLite writes `<name>-shm` and `<name>-wal` beside a database. This prune
 * used to filter on `.endsWith('.sqlite')`, so every backup it deleted
 * abandoned both companions permanently — 136 orphans against 25 real
 * backups on the live box. Harmless for disk (2.8 MB), but it made the
 * directory report 205 files when only 25 were backups, which is exactly
 * the kind of number that sends someone chasing a bug that is not there.
 *
 * One rule covers both halves: **a sidecar with no parent `.sqlite` is
 * deleted**. A fresh prune therefore never orphans anything, and the
 * orphans already on disk are swept on the next cycle without a migration.
 *
 * Only `ops_*` files are ever touched — anything else in the directory
 * belongs to someone else.
 *
 * @param {string} dir  the SQLite backup directory
 * @param {{retentionDays?: number}} opts
 * @returns {{pruned: number, orphansSwept: number}}
 */
export function pruneSqliteBackups(dir, { retentionDays = 30 } = {}) {
  const result = { pruned: 0, orphansSwept: 0 };
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return result; // directory not created yet — nothing to do
  }

  const cutoffMs = Date.now() - retentionDays * 86400000;
  const rm = (p) => {
    try {
      fs.unlinkSync(p);
      return true;
    } catch {
      return false; // best-effort: a locked or already-gone file is not fatal
    }
  };

  // 1. Expired backups, each taking its own sidecars with it.
  for (const f of names) {
    if (!f.startsWith('ops_') || !(f.endsWith('.sqlite') || f.endsWith('.sqlite.gz'))) continue;
    const fp = path.join(dir, f);
    try {
      if (fs.statSync(fp).mtimeMs >= cutoffMs) continue;
    } catch {
      continue;
    }
    // Only the backup itself — the sweep below takes its sidecars, since
    // deleting the parent is precisely what orphans them. Doing it here
    // as well passed every test either way, which is how I noticed it was
    // two mechanisms for one rule.
    if (rm(fp)) result.pruned++;
  }

  // 2. Sidecars whose parent is gone. This covers BOTH halves: the ones
  //    just orphaned by step 1, and the 136 left behind by the older
  //    prune, which nothing else would ever remove.
  for (const f of names) {
    if (!f.startsWith('ops_')) continue;
    const suffix = f.endsWith('-shm') ? '-shm' : f.endsWith('-wal') ? '-wal' : null;
    if (!suffix) continue;
    if (fs.existsSync(path.join(dir, f.slice(0, -suffix.length)))) continue;
    if (rm(path.join(dir, f))) result.orphansSwept++;
  }

  return result;
}

/** Bytes a gzip file decompresses to; throws if it is truncated or corrupt (gunzip checks the CRC). */
async function gunzipLength(file) {
  let n = 0;
  await pipeline(
    fs.createReadStream(file),
    zlib.createGunzip(),
    new Writable({
      write(chunk, _enc, cb) {
        n += chunk.length;
        cb();
      },
    })
  );
  return n;
}

async function archiveIsComplete(gz, expectedSize) {
  try {
    return (await gunzipLength(gz)) === expectedSize;
  } catch {
    return false;
  }
}

/**
 * Gzip every `ops_*.sqlite` in `dir` except `keepName` (Henry, 2026-09-30).
 *
 * A daily backup is a full copy of ops.db — 180 MB on the live box, 33 MB gzipped —
 * so 30 days of plain copies is 5.4 GB where gzipped ones are about 1 GB. The newest
 * stays plain so it can be opened or restored at once; the scheduler calls this after
 * it has integrity-checked that newest one, so each run compresses yesterday's.
 *
 * Each archive is written to `.gz.tmp`, checked by decompressing it in full, renamed,
 * and given the source's mtime — the prune ages backups by mtime — and only then is
 * the source (and its sidecars) removed. An interrupted run leaves either the source
 * or a complete archive, never neither. Streams, so the event loop is not blocked.
 *
 * @param {string} dir  the SQLite backup directory
 * @param {string|null} keepName  basename to leave uncompressed (the newest backup)
 * @returns {Promise<{compressed: number, failed: string[]}>}
 */
export async function compressOlderSqliteBackups(dir, keepName) {
  const result = { compressed: 0, failed: [] };
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return result;
  }
  for (const f of names) {
    if (!f.startsWith('ops_') || !f.endsWith('.sqlite') || f === keepName) continue;
    const src = path.join(dir, f);
    const gz = src + '.gz';
    const tmp = gz + '.tmp';
    try {
      const st = fs.statSync(src);
      if (!(fs.existsSync(gz) && (await archiveIsComplete(gz, st.size)))) {
        await pipeline(
          fs.createReadStream(src),
          zlib.createGzip({ level: 6 }),
          fs.createWriteStream(tmp)
        );
        if (!(await archiveIsComplete(tmp, st.size))) throw new Error('archive check failed');
        fs.renameSync(tmp, gz);
      }
      fs.utimesSync(gz, st.atime, st.mtime);
      fs.unlinkSync(src);
      for (const sc of ['-shm', '-wal']) fs.rmSync(src + sc, { force: true });
      result.compressed++;
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      result.failed.push(`${f}: ${err.message}`);
    }
  }
  return result;
}
