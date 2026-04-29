// @ts-check
/**
 * Audit log router — sys-only.
 *
 * v1.3 P3.1 / O2 — converted to factory pattern per ADR-0011 so the
 * router unit-tests in isolation against stubbed `tailAudit` /
 * `auditRowCount`. Live mount in `server/index.js` injects the real
 * implementations from `repositories/auditStore.js`.
 *
 *   GET /api/audit
 *     ?event=<UPPER_SNAKE>  filter by action name
 *     ?user=<id|username>   filter by actor
 *     ?from=<ISO>           lower bound of `ts`
 *     ?to=<ISO>             upper bound
 *     ?limit=<int>          max rows, capped at 10000
 *
 *   → 200 { ok: true, data: { rows: [], total: number } }
 *   → 401 by `auth` middleware
 *   → 403 by role check (sys only)
 */

import express from 'express';
import {
  authMiddleware as defaultAuth,
  requireRole as defaultRequireRole,
} from '../../../middleware/auth.js';
import {
  tailAudit as defaultTailAudit,
  auditRowCount as defaultAuditRowCount,
} from '../../../repositories/auditStore.js';

/**
 * @param {object} [deps]
 * @param {import('express').RequestHandler} [deps.auth]
 * @param {(level: number) => import('express').RequestHandler} [deps.requireRole]
 * @param {(limit: number, filter: object) => any[]} [deps.tailAudit]
 * @param {() => number | null} [deps.auditRowCount]
 */
export function createAuditRouter(deps = {}) {
  const auth = deps.auth || defaultAuth;
  const requireRole = deps.requireRole || defaultRequireRole;
  const tailAudit = deps.tailAudit || defaultTailAudit;
  const auditRowCount = deps.auditRowCount || defaultAuditRowCount;

  const router = express.Router();

  router.get('/', auth, requireRole(5), (req, res) => {
    try {
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 10000));
      const eventFilter = (req.query.event || '').toString().trim() || undefined;
      const userFilter = (req.query.user || '').toString().trim() || undefined;
      const fromIso = (req.query.from || '').toString().trim();
      const toIso = (req.query.to || '').toString().trim();

      let rows = tailAudit(limit, { event: eventFilter, user: userFilter });
      if (fromIso) rows = rows.filter((r) => r.ts && r.ts >= fromIso);
      if (toIso) rows = rows.filter((r) => r.ts && r.ts <= toIso);

      res.json({
        ok: true,
        data: { rows, total: auditRowCount() ?? rows.length },
      });
    } catch (err) {
      res.status(500).json({
        error: { message: err?.message || 'audit query failed' },
      });
    }
  });

  return router;
}

// Default export — pre-wired router using the real auth + audit store.
// Existing `app.use('/api/audit', auditRouter)` callers keep working
// without ever calling the factory directly.
const router = createAuditRouter();
export default router;
