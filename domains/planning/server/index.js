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

  // Mount BEFORE the legacy /api/planning router (registration order =
  // Express match order). Legacy planning has no /v2/ children, so this
  // ordering is belt-and-suspenders against future drift.
  app.use('/api/planning/v2', auth, router);
  app.use('/api/v1/planning/v2', auth, router);
  return true;
}
