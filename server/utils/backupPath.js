/**
 * Backup-path whitelist + quota helpers (Phase 9F.1).
 *
 * Prior to 9F the /import/backup endpoint accepted an arbitrary
 * `destPath` from the (admin-authed) caller. A path like
 *   "/safe/../../../etc/passwd.bak"
 * resolved OUTSIDE the project tree, and the code called
 *   fs.mkdirSync(..., {recursive: true})
 * to create any parent directory as side-effect. Combined with the
 * copyFileSync below, that let an admin write dataset contents
 * anywhere the server process had write permission — including
 * host paths that are not meant to be touched. Even though the
 * endpoint is admin-gated, least-privilege says no endpoint should
 * be able to escape the intended data root.
 *
 * New policy:
 *   - All backups land under <DATA_DIR>/Backup/Data/ (or a
 *     custom subdirectory under that root).
 *   - destPath may be:
 *       (a) omitted → default folder + timestamp filename
 *       (b) a relative path → resolved INSIDE BACKUP_ROOT
 *       (c) a sub-directory — we still name the file with defaultName
 *   - Absolute paths, paths containing `..` after normalization, paths
 *     targeting files outside BACKUP_ROOT, and paths using the `~`
 *     home expansion are REJECTED with a 400.
 *   - Quota: if adding this file would push the Backup dir past
 *     BACKUP_QUOTA_BYTES, the request fails with 507 Insufficient
 *     Storage. Default 500 MB; configurable via OPS_BACKUP_QUOTA_MB.
 *
 * Functions here are pure apart from `getDirectoryBytes` (filesystem
 * walk). They are unit-tested against a tmp dir in backupPath.test.js.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { atomicWriteFileSync } from '../services/atomicWrite.js';

export const BACKUP_SUBDIR = path.join('Backup', 'Data');
export const DEFAULT_QUOTA_MB = 500;

export function getBackupRoot(dataDir) {
  return path.join(dataDir, BACKUP_SUBDIR);
}

export function getQuotaBytes() {
  const raw = process.env.OPS_BACKUP_QUOTA_MB;
  const mb = raw != null && raw !== '' ? Number(raw) : DEFAULT_QUOTA_MB;
  const safe = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_QUOTA_MB;
  return safe * 1024 * 1024;
}

/**
 * Resolve a caller-supplied destPath into an absolute path that is
 * guaranteed to live under `backupRoot`. Returns `{ ok: true, target }`
 * on success, `{ ok: false, error }` on whitelist rejection.
 *
 * @param {string} backupRoot       — absolute path, e.g. <DATA>/Backup/Data
 * @param {string} defaultFileName  — used when destPath is empty or a dir
 * @param {string|undefined} destPath — caller input; may be undefined
 */
export function resolveBackupTarget({ backupRoot, defaultFileName, destPath }) {
  if (typeof backupRoot !== 'string' || !path.isAbsolute(backupRoot)) {
    return { ok: false, error: 'backupRoot must be an absolute path' };
  }
  if (!defaultFileName || /[/\\]/.test(defaultFileName)) {
    return { ok: false, error: 'defaultFileName must be a plain name, no separators' };
  }

  // No destPath → drop default filename into the backup root.
  const raw = typeof destPath === 'string' ? destPath.trim() : '';
  if (!raw) {
    return { ok: true, target: path.join(backupRoot, defaultFileName) };
  }

  // Home-directory expansion is not allowed — it pointed outside the
  // data root in the old behavior. Users who need a different backup
  // root should change OPS_BACKUP_QUOTA_MB / restructure DATA_DIR.
  if (raw.startsWith('~')) {
    return { ok: false, error: 'destPath must not use ~ expansion' };
  }
  if (path.isAbsolute(raw)) {
    return { ok: false, error: 'destPath must be relative to the backup root' };
  }

  // Normalize + resolve inside the root. `path.resolve` collapses `..`
  // segments; the startsWith check catches any escape attempt
  // (e.g. "../../etc/passwd" resolves to outside backupRoot).
  const candidate = path.resolve(backupRoot, raw);
  const rootResolved = path.resolve(backupRoot);
  const withSep = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (candidate !== rootResolved && !candidate.startsWith(withSep)) {
    return { ok: false, error: 'destPath escapes the backup root' };
  }

  // If the resolved candidate is a directory or ends with a separator,
  // drop the default filename into it. Otherwise the candidate IS
  // the final file path.
  const endsWithSep = raw.endsWith('/') || raw.endsWith('\\');
  let isDir = false;
  try { isDir = fs.statSync(candidate).isDirectory(); } catch { /* not an existing dir */ }
  const target = (isDir || endsWithSep)
    ? path.join(candidate, defaultFileName)
    : candidate;

  // Double-check — composing the filename mustn't escape root either.
  const targetResolved = path.resolve(target);
  if (targetResolved !== rootResolved && !targetResolved.startsWith(withSep)) {
    return { ok: false, error: 'destPath escapes the backup root' };
  }

  return { ok: true, target: targetResolved };
}

/**
 * Recursive size of every regular file under `dir`. Returns 0 if the
 * directory doesn't exist yet. Symlinks are followed (lstat would skip
 * them — we want the "effective" disk use).
 */
export function getDirectoryBytes(dir) {
  let total = 0;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return 0; }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      total += getDirectoryBytes(p);
    } else if (ent.isFile()) {
      try { total += fs.statSync(p).size; } catch { /* ignore */ }
    }
  }
  return total;
}

/**
 * Will writing `incomingBytes` push the backup root over quota?
 * Returns `{ ok: true }` if within limit, `{ ok: false, error, used, quota }`
 * otherwise.
 */
export function checkQuota(backupRoot, incomingBytes) {
  const quota = getQuotaBytes();
  const used = getDirectoryBytes(backupRoot);
  if (used + incomingBytes > quota) {
    return {
      ok: false,
      error: `Backup quota exceeded: ${(used / 1024 / 1024).toFixed(1)} MB used + ${(incomingBytes / 1024 / 1024).toFixed(1)} MB incoming > ${(quota / 1024 / 1024).toFixed(0)} MB limit`,
      used, quota,
    };
  }
  return { ok: true, used, quota };
}

/**
 * Compute SHA-256 of a regular file and write it beside the file as
 * `<filePath>.sha256` (hex digest, newline-terminated). Used after
 * every backup write so a later restore can verify integrity against
 * silent disk corruption / partial copies.
 *
 * Returns `{ ok: true, hex, sidecar }` on success, `{ ok: false, error }`
 * on read failure.
 */
export function writeBackupChecksum(filePath) {
  try {
    const hash = crypto.createHash('sha256');
    const buf = fs.readFileSync(filePath);
    hash.update(buf);
    const hex = hash.digest('hex');
    const sidecar = filePath + '.sha256';
    // Format matches `sha256sum` CLI so ops can verify with standard tools:
    //   sha256sum -c file.sha256
    // Atomic write so a crash mid-write can't leave a truncated sidecar
    // that later reports "sidecar_parse" when we try to verify.
    atomicWriteFileSync(sidecar, `${hex}  ${path.basename(filePath)}\n`);
    return { ok: true, hex, sidecar };
  } catch (err) {
    return { ok: false, error: err?.message || 'checksum_failed' };
  }
}

/**
 * Verify a backup file against its `.sha256` sidecar. Returns:
 *   { ok: true, hex }          — file matches sidecar
 *   { ok: false, reason: 'no_sidecar' }      — sidecar missing
 *   { ok: false, reason: 'sidecar_parse' }   — sidecar unreadable
 *   { ok: false, reason: 'mismatch', expected, actual }
 *   { ok: false, reason: 'read_failed', error }
 *
 * Sidecar format matches `sha256sum` CLI: "<hex>  <basename>\n".
 * We accept trailing whitespace / CRLF for portability.
 */
export function verifyBackupChecksum(filePath) {
  const sidecar = filePath + '.sha256';
  let raw;
  try { raw = fs.readFileSync(sidecar, 'utf-8'); }
  catch { return { ok: false, reason: 'no_sidecar' }; }
  const first = raw.split(/\r?\n/, 1)[0] || '';
  const m = first.match(/^([a-f0-9]{64})\b/i);
  if (!m) return { ok: false, reason: 'sidecar_parse' };
  const expected = m[1].toLowerCase();
  try {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    const actual = hash.digest('hex');
    if (actual !== expected) {
      return { ok: false, reason: 'mismatch', expected, actual };
    }
    return { ok: true, hex: actual };
  } catch (err) {
    return { ok: false, reason: 'read_failed', error: err?.message || String(err) };
  }
}

/**
 * Retention policy: delete backup files older than `keepDays` days,
 * while ALWAYS keeping at least `keepMin` newest files so a long pause
 * in writes doesn't wipe history. Matching `.sha256` sidecars are
 * deleted alongside their parent.
 *
 * Scans only top-level entries of `backupRoot` — subdirectories are
 * left alone. Returns `{ ok, scanned, deleted, kept, errors }`.
 *
 * Never throws: a stat/unlink failure on any single file is logged to
 * the `errors` array and pruning continues.
 *
 * @param {object} opts
 * @param {string} opts.backupRoot  absolute path
 * @param {number} [opts.keepDays=30]  files older than this are candidates
 * @param {number} [opts.keepMin=10]   always keep at least N newest
 */
export function pruneOldBackups({ backupRoot, keepDays = 30, keepMin = 10 } = {}) {
  const result = { ok: true, scanned: 0, deleted: 0, kept: 0, errors: [] };
  let entries;
  try { entries = fs.readdirSync(backupRoot, { withFileTypes: true }); }
  catch { return result; }  // dir doesn't exist yet — nothing to prune

  // Gather regular backup files (exclude .sha256 sidecars — they trail
  // their parent and get deleted when the parent is deleted).
  const files = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (ent.name.endsWith('.sha256')) continue;
    const p = path.join(backupRoot, ent.name);
    try {
      const st = fs.statSync(p);
      files.push({ path: p, name: ent.name, mtimeMs: st.mtimeMs });
      result.scanned++;
    } catch (err) {
      result.errors.push({ path: p, error: err?.message || 'stat_failed' });
    }
  }

  // Sort newest → oldest so slice(0, keepMin) always keeps the N
  // most recent regardless of age.
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const protectedMin = new Set(files.slice(0, keepMin).map(f => f.path));

  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const f of files) {
    if (protectedMin.has(f.path)) { result.kept++; continue; }
    if (f.mtimeMs >= cutoff) { result.kept++; continue; }
    // Eligible for deletion. Remove sidecar first (best-effort) then
    // the file itself — so a crash in-between leaves a file without
    // a dangling sidecar, which is harmless.
    const sidecar = f.path + '.sha256';
    try { if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar); }
    catch (err) { result.errors.push({ path: sidecar, error: err?.message || 'unlink_sidecar_failed' }); }
    try {
      fs.unlinkSync(f.path);
      result.deleted++;
    } catch (err) {
      result.errors.push({ path: f.path, error: err?.message || 'unlink_failed' });
    }
  }
  if (result.errors.length) result.ok = false;
  return result;
}

/** Resolve retention settings from env with sane defaults. */
export function getRetentionSettings() {
  const days = Number(process.env.OPS_BACKUP_RETENTION_DAYS);
  const min  = Number(process.env.OPS_BACKUP_RETENTION_MIN);
  return {
    keepDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : 30,
    keepMin:  Number.isFinite(min)  && min  > 0 ? Math.floor(min)  : 10,
  };
}
