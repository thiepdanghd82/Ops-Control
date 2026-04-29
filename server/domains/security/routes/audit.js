// @ts-check
/**
 * Audit log router — sys-only.
 *
 * v1.3 P3.1 — extracted from `server/index.js` Sprint S-AUDIT block as
 * the proof-of-concept domain split. Future security-domain routes
 * (users, permission groups) land in sibling files in this folder.
 *
 *   GET /api/audit
 *     ?event=<UPPER_SNAKE>  filter by action name
 *     ?user=<id|username>   filter by actor
 *     ?from=<ISO>           lower bound of `ts`
 *     ?to=<ISO>             upper bound
 *     ?limit=<int>          max rows, capped at 10000
 *
 *   → 200 { ok: true, data: { rows: [], total: number } }
 *   → 401 / 403 enforced by authMiddleware + requireRole(5)
 */

import express from 'express';
import { authMiddleware, requireRole } from '../../../middleware/auth.js';
import { tailAudit, auditRowCount } from '../../../repositories/auditStore.js';

const router = express.Router();

router.get('/', authMiddleware, requireRole(5), (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 200, 10000));
    const eventFilter = (req.query.event || '').toString().trim() || undefined;
    const userFilter = (req.query.user || '').toString().trim() || undefined;
    const fromIso = (req.query.from || '').toString().trim();
    const toIso = (req.query.to || '').toString().trim();

    let rows = tailAudit(limit, { event: eventFilter, user: userFilter });
    // Date filter applied post-fetch since the audit_log SQLite index is
    // (ts DESC) and the user/event filters already used their respective
    // indexes; range scan within the limited result set is cheap.
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

export default router;
