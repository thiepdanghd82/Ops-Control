// @ts-check
/**
 * Rate library router — backup / restore / export CSV.
 *
 * v1.3 G1. Fourth domain extraction (after security/audit, security/license,
 * basis/backup-schedule). Owns the operator-facing rate-table backup
 * lifecycle:
 *
 *   GET  /api/library/rate/backups               — list backup files (per site)
 *   POST /api/library/rate/backups               — admin: snapshot current rate table
 *   POST /api/library/rate/restore               — admin: load a backup (no commit; UI confirms)
 *   POST /api/library/rate/export-csv            — write CSV mirror of the live table
 *
 * Factory pattern (`createRateRouter({...})`) — every cross-cutting
 * concern is INJECTED so this file is unit-testable in isolation.
 *
 * Legacy path retained: costApi.js still serves `/api/rate/*` until the
 * client UI is migrated. Both surfaces work simultaneously.
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.auth
 * @param {(reqUser: any) => boolean} deps.isAdminPlus
 * @param {(reqUser: any) => boolean} [deps.canWrite]   — viewonly check
 * @param {() => string} deps.getLibDir
 * @param {(name: string) => string} deps.safeFn
 * @param {(p: string, def?: any) => any} deps.readJson
 * @param {(p: string, data: any) => void} deps.writeJson
 * @param {(p: string, data: Buffer | string) => void} deps.atomicWriteFileSync
 * @param {(site: string) => string} deps.siteToCsvKey
 * @param {(data: any[]) => [string[], any[][]]} deps.rateRows  — header + body for CSV
 * @param {(headers: string[], rows: any[][]) => Buffer} deps.toCsvBytes
 * @param {import('express').RequestHandler} deps.validateBody — already configured
 */
export function createRateRouter({
  auth,
  isAdminPlus,
  canWrite,
  getLibDir,
  safeFn,
  readJson,
  writeJson,
  atomicWriteFileSync,
  siteToCsvKey,
  rateRows,
  toCsvBytes,
  validateBackupBody,
  validateRestoreBody,
}) {
  const router = express.Router();

  // GET /backups — list backup files filtered by site
  router.get('/backups', auth, (req, res) => {
    const site = req.query.site || '';
    const csvKey = site ? siteToCsvKey(String(site)) : '';
    const backupDir = path.join(getLibDir(), 'Rate', 'backups');
    const prefix = csvKey ? `rate_${csvKey}_` : 'rate_';
    try {
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
        .sort()
        .reverse()
        .map((f) => {
          const stat = fs.statSync(path.join(backupDir, f));
          return {
            filename: f,
            size: stat.size,
            modified: stat.mtimeMs / 1000,
            date: new Date(stat.mtimeMs).toISOString().slice(0, 19).replace('T', ' '),
          };
        });
      res.json({ ok: true, files });
    } catch {
      res.json({ ok: true, files: [] });
    }
  });

  // POST /backups — admin snapshot
  router.post('/backups', auth, validateBackupBody, (req, res) => {
    if (!isAdminPlus(req.user)) return res.status(403).json({ ok: false, msg: 'Admin only' });
    const { site = 'VN', data = [] } = req.body || {};
    const csvKey = siteToCsvKey(site);
    const ts = new Date().toISOString().replace(/[:.T]/g, '').slice(0, 15);
    const fname = `rate_${csvKey}_${ts}.json`;
    writeJson(path.join(getLibDir(), 'Rate', 'backups', fname), {
      site,
      savedAt: new Date().toISOString(),
      data,
    });
    res.json({ ok: true, filename: fname, site });
  });

  // POST /restore — admin load (UI confirms before commit)
  router.post('/restore', auth, validateRestoreBody, (req, res) => {
    if (!isAdminPlus(req.user)) return res.status(403).json({ ok: false, msg: 'Admin only' });
    const { filename, site = '' } = req.body || {};
    const fpath = path.join(getLibDir(), 'Rate', 'backups', safeFn(String(filename)));
    if (!fs.existsSync(fpath)) return res.status(404).json({ ok: false, error: 'Not found' });
    const bk = readJson(fpath);
    const data = bk?.data || bk;
    res.json({ ok: true, data, site, filename });
  });

  // POST /export-csv — write CSV mirror (any non-viewonly user)
  router.post('/export-csv', auth, (req, res) => {
    if (canWrite && !canWrite(req.user)) {
      return res.status(403).json({ ok: false, msg: 'View Only' });
    }
    const { site = 'VN', data: clientData } = req.body || {};
    const csvKey = siteToCsvKey(site);
    let data = clientData;
    if (!data) {
      const rs = readJson(path.join(getLibDir(), 'Rate', 'rate_sites.json'), {});
      data = rs[site] || [];
    }
    const [headers, rows] = rateRows(data);
    const csvBytes = toCsvBytes(headers, rows);
    atomicWriteFileSync(path.join(getLibDir(), 'Rate', `rate_${csvKey}.csv`), csvBytes);
    res.json({ ok: true, site, rows: data.length, file: `rate_${csvKey}.csv` });
  });

  return router;
}

export default createRateRouter;
