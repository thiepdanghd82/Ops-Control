// @ts-check
/**
 * DDL (drop-down list) library router — backup / restore / export CSV.
 *
 * v1.3 H1. Mirror of `library/routes/rate.js`. Same lifecycle, same
 * factory shape, different on-disk folder + CSV formatter.
 *
 *   GET  /api/library/ddl/backups
 *   POST /api/library/ddl/backups       — admin
 *   POST /api/library/ddl/restore       — admin
 *   POST /api/library/ddl/export-csv    — non-viewonly
 *
 * Diverges from rate.js only in:
 *   1. Folder name 'DDL' vs 'Rate'.
 *   2. Backup payload `data` is an object (sections), not an array.
 *   3. `ddlToCsvRows` formatter (different shape than `rateRows`).
 *   4. Response field `sections` instead of `rows` for CSV export.
 *
 * The bulk of the auth + validation + path handling is identical, so
 * a future refactor could lift to a generic `createBackupResourceRouter`
 * primitive in platform/. Holding off until 3 resources need it
 * (rate + ddl = 2; the rule of three says wait one more).
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';

export function createDdlRouter({
  auth,
  isAdminPlus,
  canWrite,
  getLibDir,
  safeFn,
  readJson,
  writeJson,
  atomicWriteFileSync,
  siteToCsvKey,
  ddlToCsvRows,
  toCsvBytes,
  validateBackupBody,
  validateRestoreBody,
}) {
  const router = express.Router();

  // GET /backups
  router.get('/backups', auth, (req, res) => {
    const site = req.query.site || '';
    const csvKey = site ? siteToCsvKey(String(site)) : '';
    const backupDir = path.join(getLibDir(), 'DDL', 'backups');
    const prefix = csvKey ? `ddl_${csvKey}_` : 'ddl_';
    try {
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
        .sort()
        .reverse();
      // Note: original /ddl/backups returns plain string array (no
      // size/date metadata) unlike /rate/backups. Preserve that
      // contract — UI relies on it. v1.3.x can add metadata after
      // confirming with QA that no client breaks.
      res.json({ ok: true, backups: files });
    } catch {
      res.json({ ok: true, backups: [] });
    }
  });

  router.post('/backups', auth, validateBackupBody, (req, res) => {
    if (!isAdminPlus(req.user)) return res.status(403).json({ ok: false, msg: 'Admin only' });
    const { site = 'VN', data = {} } = req.body || {};
    const csvKey = siteToCsvKey(site);
    const ts = new Date().toISOString().replace(/[:.T]/g, '').slice(0, 15);
    const fname = `ddl_${csvKey}_${ts}.json`;
    writeJson(path.join(getLibDir(), 'DDL', 'backups', fname), {
      site,
      savedAt: new Date().toISOString(),
      data,
    });
    res.json({ ok: true, filename: fname, site });
  });

  router.post('/restore', auth, validateRestoreBody, (req, res) => {
    if (!isAdminPlus(req.user)) return res.status(403).json({ ok: false, msg: 'Admin only' });
    const { filename, site = '' } = req.body || {};
    const fpath = path.join(getLibDir(), 'DDL', 'backups', safeFn(String(filename)));
    if (!fs.existsSync(fpath)) return res.status(404).json({ ok: false, error: 'Not found' });
    const bk = readJson(fpath);
    const data = bk?.data || bk;
    res.json({ ok: true, data, site, filename });
  });

  router.post('/export-csv', auth, (req, res) => {
    if (canWrite && !canWrite(req.user)) {
      return res.status(403).json({ ok: false, msg: 'View Only' });
    }
    const { site = 'VN', data: clientData } = req.body || {};
    const csvKey = siteToCsvKey(site);
    let data = clientData;
    if (!data) {
      const ds = readJson(path.join(getLibDir(), 'DDL', 'ddl_sites.json'), {});
      data = ds[site] || {};
    }
    const [headers, rows] = ddlToCsvRows(data);
    const csvBytes = toCsvBytes(headers, rows);
    atomicWriteFileSync(path.join(getLibDir(), 'DDL', `ddl_${csvKey}.csv`), csvBytes);
    const sections = Object.keys(data).filter((k) => k !== '_custom_sections');
    res.json({ ok: true, site, sections: sections.length, file: `ddl_${csvKey}.csv` });
  });

  return router;
}

export default createDdlRouter;
