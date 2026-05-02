// @ts-check
/**
 * Released-quotation router — sales-domain finalised quotations.
 *
 * v1.3 K2. Seventh domain extraction. Owns the file-system-backed
 * "released quotation" lifecycle:
 *
 *   GET    /api/sales/quotations           — list released quotation files
 *   GET    /api/sales/quotations/:name     — fetch one by filename
 *   POST   /api/sales/quotations           — append a new one
 *
 * Legacy URLs (kept dual-mounted per ADR-0009):
 *   GET    /api/released-quotations
 *   GET    /api/released-quotation/:name
 *   POST   /api/save-quotation
 *
 * Factory-injected deps so the router unit-tests in isolation against
 * a tmpdir without needing a real authService + DATA_DIR.
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.auth
 * @param {(reqUser: any) => boolean} [deps.canWrite]   — viewonly check
 * @param {() => string} deps.getLibDir
 * @param {(name: string) => string} deps.safeFn
 * @param {(p: string, def?: any) => any} deps.readJson
 * @param {(p: string, data: any) => void} deps.writeJson
 * @param {import('express').RequestHandler} [deps.saveRateLimit]
 */
export function createReleasedQuotationRouter({
  auth,
  canWrite,
  getLibDir,
  safeFn,
  readJson,
  writeJson,
  saveRateLimit,
}) {
  const router = express.Router();
  const noopLimit = (_req, _res, next) => next();
  const limit = saveRateLimit || noopLimit;

  // GET / — list released quotation files (newest first)
  router.get('/', auth, (req, res) => {
    const dir = path.join(getLibDir(), 'ReleasedQuotation');
    try {
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
        .sort()
        .reverse()
        .map((f) => {
          const stat = fs.statSync(path.join(dir, f));
          return { filename: f, size: stat.size, modified: stat.mtimeMs / 1000 };
        });
      res.json({ ok: true, files });
    } catch {
      res.json({ ok: true, files: [] });
    }
  });

  // GET /:name — fetch one quotation by filename
  router.get('/:name', auth, (req, res) => {
    const fname = safeFn(decodeURIComponent(req.params.name));
    const fpath = path.join(getLibDir(), 'ReleasedQuotation', fname);
    if (!fs.existsSync(fpath)) return res.status(404).json({ error: 'not found' });
    res.json(readJson(fpath));
  });

  // POST / — append a new released quotation
  router.post('/', auth, limit, (req, res) => {
    if (canWrite && !canWrite(req.user)) {
      return res.status(403).json({ ok: false, msg: 'View Only' });
    }
    const pl = req.body;
    if (!pl || typeof pl !== 'object' || Array.isArray(pl)) {
      return res.status(400).json({ ok: false, error: 'Payload must be a JSON object' });
    }
    if (pl.ref_no != null && (typeof pl.ref_no !== 'string' || pl.ref_no.length > 128)) {
      return res.status(400).json({ ok: false, error: 'ref_no must be a string ≤128 chars' });
    }
    const ref = safeFn((pl.ref_no || 'QUOT').replace(/\//g, '_').replace(/ /g, '-'));
    const ts = new Date().toISOString().replace(/[:.T]/g, '').slice(0, 15);
    const fname = `${ref}_${ts}.json`;
    pl._saved_at = new Date().toISOString();
    pl._filename = fname;
    writeJson(path.join(getLibDir(), 'ReleasedQuotation', fname), pl);
    res.json({ ok: true, filename: fname, saved_at: pl._saved_at });
  });

  return router;
}

export default createReleasedQuotationRouter;
