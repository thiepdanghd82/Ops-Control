/**
 * Atomic file writes via tmp-file + rename pattern.
 *
 * Why: plain fs.writeFileSync truncates the target BEFORE writing new content.
 * If the process dies mid-write (power loss, OOM, disk full) the target is
 * left empty or truncated — data loss. Two concurrent writers also race.
 *
 * Pattern: write to "${target}.tmp.${pid}.${rand}", fsync, then rename.
 * POSIX rename is atomic on the same filesystem: readers either see the old
 * complete file or the new complete file, never a partial one.
 *
 * Caveat: only atomic if tmp and target are on the SAME filesystem (they
 * share the same directory here, so guaranteed).
 *
 * Accepts both strings and Buffers — delegates to fs.writeFileSync for the
 * tmp write so encoding handling stays consistent with Node's stdlib.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function atomicWriteFileSync(targetPath, data, encoding) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tmp = path.join(
    dir,
    `.${base}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`
  );
  try {
    // Write payload. For strings, pass encoding (defaults to utf-8). For
    // Buffers, encoding is ignored by writeFileSync — safe to always pass.
    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(tmp, data);
    } else {
      fs.writeFileSync(tmp, data, encoding || 'utf-8');
    }
    // Flush OS buffers to disk before rename so the rename-atomicity guarantee
    // also covers "disk content survives a crash right after rename".
    const fd = fs.openSync(tmp, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, targetPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}
