/**
 * Planning domain server-side mount factory — Sprint MES-1.4.
 *
 * `mountPlanning(app)` is the single entry-point the apps shell calls to
 * wire planning's v2 routes onto the Express app. Honors the
 * `mes.workOrder.enabled` feature flag — when off, the v2 routes are
 * NOT registered, so requests fall through to Express's default 404
 * handler (FR-11). The legacy `server/routes/planning.js` router stays
 * untouched — it keeps responding at `/api/planning/*` regardless of
 * this flag.
 *
 * Production wiring builds the audit closure here: a thin
 * `db.prepare(...).run(...)` that throws on failure (fail-closed),
 * which lets `workOrderService` roll back the status update inside
 * its single `db.transaction()` (PRD AC-1.3.3).
 */
import { authMiddleware as defaultAuthMiddleware } from '../../../server/middleware/auth.js';
import { getDb } from '../../../server/db/connection.js';
import { createWorkOrderRepo } from './repositories/workOrderRepo.js';
import { createWoCodeGenerator } from './services/woCodeGenerator.js';
import { createWorkOrderService } from './services/workOrderService.js';
import { createWorkOrderV2Router } from './routes/workOrderV2.js';
import { readFeatureFlag } from './featureFlag.js';

/**
 * @param {import('express').Express} app
 * @param {{ authMiddleware?: import('express').RequestHandler }} [opts]
 *   `authMiddleware` defaults to the project-wide cookie/JWT middleware.
 *   Tests inject a passthrough so they don't need a live session store.
 */
export function mountPlanning(app, opts = {}) {
  if (!readFeatureFlag('mes.workOrder.enabled')) return false;

  const auth = opts.authMiddleware || defaultAuthMiddleware;

  const db = getDb();
  const repo = createWorkOrderRepo(db);
  const codeGen = createWoCodeGenerator(db);
  const auditStmt = db.prepare(
    'INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)'
  );
  const audit = (row) =>
    auditStmt.run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
  const service = createWorkOrderService({ db, repo, codeGen, audit });
  const router = createWorkOrderV2Router({ service });

  // /v2/config — minimal flag-discovery endpoint for the client. Mounted
  // INSIDE the flag-on conditional, so flag off → endpoint absent → 404.
  // The client's useMesWorkOrderFlag() hook treats 404 as "flag off"
  // (fail-closed) and 200 + `{enabled: true}` as "flag on". Read-only,
  // cheap; a stale 5-min localStorage cache on the client is fine. The
  // prefix-level `auth` middleware already gates this; no extra guard.
  router.get('/config', (req, res) => {
    res.json({ enabled: true });
  });

  // /v2/work-orders/:id/audit — per-WO audit timeline (MES-1.6).
  // Returns the WO_* events for one work order, newest-first. Driven by
  // a JSON_EXTRACT filter on `detail.wo_id`; the audit_log
  // (event, ts DESC) index makes the WO_% prefix scan cheap. Limit
  // capped at 200 — any single WO will rarely exceed 50 events before
  // MES-2 lands op-level events. Returns 404 RFC-7807 when the WO id
  // is absent so the client can render its "not found" path.
  router.get('/work-orders/:id/audit', (req, res) => {
    const woId = Number(req.params.id);
    if (!Number.isFinite(woId)) {
      return res
        .status(400)
        .type('application/problem+json')
        .json({
          type: 'urn:ops:validation',
          status: 400,
          errors: [{ field: 'id', code: 'integer' }],
        });
    }
    if (!repo.findById(woId)) {
      return res
        .status(404)
        .type('application/problem+json')
        .json({ type: 'urn:ops:wo-not-found', status: 404, wo_id: woId });
    }
    const rows = db
      .prepare(
        `SELECT ts, event, user, ip, detail FROM audit_log
         WHERE event LIKE 'WO\\_%' ESCAPE '\\'
           AND CAST(json_extract(detail, '$.wo_id') AS INTEGER) = ?
         ORDER BY id DESC LIMIT 200`
      )
      .all(woId);
    res.json({ ok: true, rows });
  });

  // Mount BEFORE the legacy /api/planning router (registration order =
  // Express match order). Legacy planning has no /v2/ children, so this
  // ordering is belt-and-suspenders against future drift.
  app.use('/api/planning/v2', auth, router);
  app.use('/api/v1/planning/v2', auth, router);
  return true;
}
