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
import { getDb, getDbPath } from './connection.js';

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
  const existing = fs.readdirSync(dir).filter(f => f.startsWith(`ops_${today}`));
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

    // Retention prune
    const retentionDays = Number(process.env.OPS_BACKUP_RETENTION_DAYS || 30);
    const cutoffMs = Date.now() - retentionDays * 86400000;
    let pruned = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith('ops_') || !f.endsWith('.sqlite')) continue;
      const fp = path.join(dir, f);
      try {
        if (fs.statSync(fp).mtimeMs < cutoffMs) { fs.unlinkSync(fp); pruned++; }
      } catch { /* best-effort */ }
    }

    return { ok: true, file: fname, size_mb: sizeMb, pruned_old: pruned };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
