import fs from 'fs';
import path from 'path';

/**
 * Merge restorable data-backup JSON snapshots from several directories into a
 * single list, newest-first.
 *
 * The manual "Create Data Backup" flow writes to <DATA_DIR>/Backup/
 * PackageBackups/Data, while the nightly scheduler writes its full-data
 * snapshots to <DATA_DIR>/Backup/Data. Both carry the same
 * restoreFromSnapshot-compatible JSON shape, so the Restore picker lists from
 * BOTH — otherwise operators see "No backups" even when several auto snapshots
 * exist. (Surfaced 2026-06-29 hardware verify.)
 *
 * @param {string[]} dirs  directories to scan, in preference order (a filename
 *                         seen in an earlier dir wins — its entry is kept and
 *                         the later duplicate skipped).
 * @returns {{filename:string,size:number,date:string}[]} deduped, sorted desc by date.
 */
export function collectDataBackups(dirs) {
  const seen = new Set();
  const files = [];
  for (const dir of dirs || []) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue; // missing dir → contributes nothing
    }
    for (const f of entries) {
      if (!f.endsWith('.json') || f.startsWith('.') || seen.has(f)) continue;
      seen.add(f);
      try {
        const stat = fs.statSync(path.join(dir, f));
        files.push({
          filename: f,
          size: stat.size,
          date: new Date(stat.mtimeMs).toISOString().slice(0, 19).replace('T', ' '),
        });
      } catch {
        /* skip unreadable entry */
      }
    }
  }
  // `date` is "YYYY-MM-DD HH:MM:SS" → lexical sort == chronological.
  files.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return files;
}
