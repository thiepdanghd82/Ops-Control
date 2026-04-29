/**
 * safeError — redact internal details from error messages before they
 * cross the HTTP boundary.
 *
 * Why: audit flagged that `res.status(500).json({ error: err.message })`
 * surfaces SQLite column/table names, absolute file paths, and
 * filesystem errno codes. That drip-feed helps an attacker map our
 * schema + layout without needing a dedicated probe.
 *
 * Usage:
 *   try { ... }
 *   catch (err) {
 *     logErr(req, 'dashboard', err);  // full detail goes to server log
 *     res.status(500).json({ error: redactErrorMessage(err) });
 *   }
 *
 * Redaction rules are conservative — we prefer "bucketed category"
 * over "strip specific token" because the latter is brittle. When in
 * doubt we return the generic bucket and rely on req.id correlation
 * for debugging.
 */

// ── Bucketing ────────────────────────────────────────────────────────
//
// Each rule matches a common error shape and returns the user-safe
// replacement. Order matters — more specific matches first.

const RULES = [
  // SQLite — column / table / constraint
  { re: /\bno such (table|column)\b/i,                repl: 'database_shape_mismatch' },
  { re: /\bSQLITE_CONSTRAINT\b|\bUNIQUE constraint failed\b/i, repl: 'database_constraint_violation' },
  { re: /\bSQLITE_BUSY\b|\bdatabase is locked\b/i,    repl: 'database_busy' },
  { re: /\bSQLITE_READONLY\b/i,                       repl: 'database_readonly' },
  { re: /\bSQLITE_CORRUPT\b|\bfile is not a database\b/i, repl: 'database_unavailable' },
  // Filesystem — ENOENT, EACCES, EEXIST etc
  { re: /\bENOENT\b/i,                                repl: 'file_not_found' },
  { re: /\bEACCES\b|\bEPERM\b/i,                      repl: 'permission_denied' },
  { re: /\bEEXIST\b/i,                                repl: 'file_already_exists' },
  { re: /\bEISDIR\b|\bENOTDIR\b/i,                    repl: 'path_type_mismatch' },
  { re: /\bENOSPC\b/i,                                repl: 'disk_full' },
  // Network / timeouts — common when filesystem is fronted by a cloud
  // file provider (iCloud Drive, OneDrive, Dropbox) whose daemon is
  // offline. Happens on macOS with `com.apple.fileprovider.fpfs#P` xattr.
  { re: /\bETIMEDOUT\b/i,                             repl: 'remote_unavailable' },
  { re: /\bECONNREFUSED\b|\bECONNRESET\b/i,           repl: 'remote_unreachable' },
  // Cross-filesystem rename — `fs.renameSync` throws EXDEV when source
  // and destination are on different volumes. Classic macOS gotcha
  // (/tmp on system disk, user data on a data volume). Actionable
  // bucket so the handler can fall back to copy+unlink.
  { re: /\bEXDEV\b/i,                                 repl: 'cross_device_move' },
  // Upload / multer
  { re: /\bLIMIT_FILE_SIZE\b/i,                       repl: 'file_too_large' },
  { re: /\bLIMIT_UNEXPECTED_FILE\b/i,                 repl: 'unexpected_upload_field' },
  // JSON / parse
  { re: /\bUnexpected token\b.*\bin JSON\b/i,         repl: 'invalid_json_payload' },
  { re: /\bUnexpected end of JSON input\b/i,          repl: 'invalid_json_payload' },
];

/**
 * Return a short, user-safe error code suitable for 5xx/4xx response
 * bodies. If no rule matches, returns 'internal_error' — callers that
 * want to preserve a specific message should mark the error with
 * `err.safe = true`, in which case we pass `err.message` through
 * (still scrubbed for paths).
 */
export function redactErrorMessage(err) {
  if (!err) return 'internal_error';
  const raw = String(err.message || err);

  // Opt-in passthrough for messages we've already vetted as safe.
  // Still strip absolute paths on the way out so a future refactor
  // that forgets to remove them doesn't leak filesystem layout.
  if (err.safe === true) {
    return stripAbsolutePaths(raw);
  }

  for (const { re, repl } of RULES) {
    if (re.test(raw)) return repl;
  }
  return 'internal_error';
}

/**
 * Replace absolute paths with `<path>` placeholders. Conservative —
 * only targets POSIX `/...` and Windows `C:\...` shapes at word
 * boundaries; leaves relative paths, URLs, and project-root-relative
 * strings alone.
 */
export function stripAbsolutePaths(s) {
  return String(s)
    // Windows: drive letter + backslash
    .replace(/\b[A-Z]:\\[^\s'"]+/gi, '<path>')
    // POSIX: leading slash (not preceded by ./, //, ://, letter, digit,
    // or another slash) with at least one segment. Keeps relative
    // paths like `./data/x` and URLs like `https://...` intact.
    .replace(/(?<![./\w:])\/(?:[\w.-]+\/)+[\w.-]+/g, '<path>');
}

/**
 * Log the full error with request-id correlation. The server-side log
 * keeps the raw message; the client only sees the redacted bucket.
 *
 * @param {import('express').Request|null} req
 * @param {string} context  short label for where it happened
 * @param {unknown} err
 */
export function logErr(req, context, err) {
  const id = req?.id || '-';
  const msg = err?.stack || err?.message || String(err);
  console.error(`[error:${context}] req=${id} ${msg}`);
}

/**
 * Build an error whose `.message` passes through `redactErrorMessage`
 * unchanged (after path scrubbing). Use this when you want the USER to
 * see a specific, actionable message rather than a generic bucket.
 *
 * Good candidates: "file X was quarantined, restore skipped", "N of M
 * subtrees failed: <names>", "backup filename format not recognized".
 *
 * Bad candidates: raw stack traces, SQL excerpts, or anything containing
 * a secret. `safe=true` still scrubs absolute paths, but trust the
 * caller to write a message they'd be happy seeing in a bug report.
 *
 *   throw asSafeError('All 3 subtrees failed; first: design-md (timeout)');
 *   // client receives exactly that string instead of 'internal_error'
 */
export function asSafeError(message) {
  const err = new Error(String(message));
  err.safe = true;
  return err;
}
