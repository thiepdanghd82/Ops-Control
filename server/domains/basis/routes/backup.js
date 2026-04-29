// @ts-check
/**
 * Backup schedule router — admin-only basis-domain endpoints.
 *
 * v1.3 P3.1 / F1. Third domain router extracted from costApi.js
 * (after security/audit and security/license/status). Owns:
 *
 *   GET  /api/basis/backup/schedule      — current schedule status
 *   PUT  /api/basis/backup/schedule      — update enabled/hour/retentionDays
 *   POST /api/basis/backup/run-now       — kick a backup cycle right now
 *
 * Legacy v1.2 paths (`/admin/backup-schedule*`) MUST stay live until
 * client UI is migrated — the costApi.js entries are kept in place by
 * NOT removing them in this PR. Server/index.js mounts BOTH so they
 * coexist without collision.
 *
 * Factory pattern (`createBackupRouter({...})`) for testability —
 * `auth`, `requireAdmin`, `audit`, `clientIp`, `rateLimit`, and the
 * scheduler module itself are injected so unit tests can stub each.
 */

import express from 'express';

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.auth
 * @param {(req: any) => boolean} deps.isAdminPlus       — role gate (admin or sys)
 * @param {(action: string, user: string, ip: string, detail: string) => void} deps.audit
 * @param {(req: any) => string} deps.clientIp
 * @param {import('express').RequestHandler} deps.writeRateLimit
 * @param {import('express').RequestHandler} deps.validateBody
 * @param {() => Promise<any>} deps.loadScheduler         — async import of services/backupScheduler.js
 */
export function createBackupRouter({
  auth,
  isAdminPlus,
  audit,
  clientIp,
  writeRateLimit,
  validateBody,
  loadScheduler,
}) {
  const router = express.Router();

  // GET /schedule — current status
  router.get('/schedule', auth, async (req, res) => {
    if (!isAdminPlus(req.user)) return res.status(403).json({ error: 'Forbidden — admin only' });
    try {
      const mod = await loadScheduler();
      res.json({ ok: true, status: mod.getStatus() });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // PUT /schedule — update
  const validateScheduleBody = validateBody({
    enabled: { type: 'boolean' },
    hour: { type: 'number' },
    retentionDays: { type: 'number' },
  });

  router.put('/schedule', auth, validateScheduleBody, async (req, res) => {
    if (!isAdminPlus(req.user)) return res.status(403).json({ error: 'Forbidden — admin only' });
    try {
      const mod = await loadScheduler();
      const r = mod.setSchedule(req.body || {});
      const u = req.user?.user || req.user || {};
      audit('BACKUP_SCHEDULE_UPDATE', u.username, clientIp(req),
        `enabled=${req.body?.enabled} hour=${req.body?.hour} retentionDays=${req.body?.retentionDays}`);
      res.json(r);
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // POST /run-now — kick a backup cycle
  router.post('/run-now', auth, writeRateLimit, async (req, res) => {
    if (!isAdminPlus(req.user)) return res.status(403).json({ error: 'Forbidden — admin only' });
    try {
      const mod = await loadScheduler();
      const summary = await mod.runBackupCycle({ force: true });
      const u = req.user?.user || req.user || {};
      audit('BACKUP_RUN_NOW', u.username, clientIp(req),
        `ok=${summary.ok} duration=${summary.durationMs}ms`);
      res.json({ ok: true, summary });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
}

export default createBackupRouter;
