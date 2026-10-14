/**
 * uploadGuard — translate multer middleware errors into clean JSON instead of
 * letting them bubble to Express's default handler (a bare 500 "Internal
 * server error"). The common case is LIMIT_FILE_SIZE: an over-limit upload
 * (e.g. a 24 MB BOM export vs a 10 MB cap) should tell the operator the file
 * is too large, not throw a cryptic 500.
 */

'use strict';

/**
 * Map a multer error to a response shape, or null when there is no error.
 * Pure — unit-testable without spinning up Express/multer.
 *
 * @param {Error|null} err  the error multer passed to its callback
 * @param {number} maxMb    the configured size limit, for the message
 * @returns {{status:number, body:object}|null}
 */
export function uploadErrorResponse(err, maxMb) {
  if (!err) return null;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 413,
      body: { ok: false, error: 'file_too_large', limit_mb: maxMb },
    };
  }
  // Any other multer error (bad field, too many files, fileFilter reject) →
  // a generic 400 rather than a 500.
  return { status: 400, body: { ok: false, error: 'upload_failed' } };
}

/**
 * Wrap `upload.single(field)` so multer errors become clean JSON responses.
 * Drop-in replacement for `upload.single('file')` in a route chain.
 */
export function uploadSingle(upload, field, maxMb) {
  const mw = upload.single(field);
  return (req, res, next) => {
    mw(req, res, (err) => {
      const r = uploadErrorResponse(err, maxMb);
      if (r) return res.status(r.status).json(r.body);
      next();
    });
  };
}
