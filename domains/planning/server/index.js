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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { authMiddleware as defaultAuthMiddleware } from '../../../server/middleware/auth.js';
import { getDb } from '../../../server/db/connection.js';
import { createWorkOrderRepo } from './repositories/workOrderRepo.js';
import { createWoCodeGenerator } from './services/woCodeGenerator.js';
import { createWorkOrderService } from './services/workOrderService.js';
import { createKioskTokenService } from './services/kioskTokenService.js';
import { createWorkOrderV2Router } from './routes/workOrderV2.js';
import { createKioskV2Router } from './routes/kiosksV2.js';
import { readFeatureFlag } from './featureFlag.js';
import { validateReasonCodeIntegrity } from './seedReasonCodes.js';

/**
 * Resolve OPS_KIOSK_KEY for kiosk JWT signing. Mirrors the OPS_TOTP_KEY
 * pattern from Sprint 1.7: in dev, auto-generate + persist to .env so
 * the developer never sees a "missing key" surprise; in production,
 * throw loud — preflight already enforces this, but the boot-time check
 * is belt + braces.
 */
function resolveKioskKey() {
  const fromEnv = process.env.OPS_KIOSK_KEY;
  if (fromEnv && fromEnv.length === 64) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'OPS_KIOSK_KEY missing or wrong length (need 64 hex chars). ' +
        'Set it in .env or via the deploy pipeline. Preflight (npm run preflight) ' +
        'enforces this — re-run it before deploying.'
    );
  }
  if (fromEnv) {
    console.warn(
      `[planning] OPS_KIOSK_KEY present but length=${fromEnv.length} (expected 64); ignoring.`
    );
  }
  const generated = crypto.randomBytes(32).toString('hex');
  process.env.OPS_KIOSK_KEY = generated;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let body = '';
    if (fs.existsSync(envPath)) body = fs.readFileSync(envPath, 'utf-8');
    if (!/^OPS_KIOSK_KEY=/m.test(body)) {
      const sep = body && !body.endsWith('\n') ? '\n' : '';
      fs.appendFileSync(envPath, `${sep}OPS_KIOSK_KEY=${generated}\n`);
      console.warn('[planning] dev-mode: wrote auto-generated OPS_KIOSK_KEY to .env');
    }
  } catch (e) {
    console.warn(
      `[planning] dev-mode: could not persist OPS_KIOSK_KEY (${e.message}); continuing in-memory only.`
    );
  }
  return generated;
}

/**
 * Validate machine_code by lookup in Library/MachineProfiles/profiles.json.
 * Read-on-each-call is cheap (the file is <50KB; OS file cache absorbs
 * repeats) and avoids stale-cache bugs when an admin adds a new machine.
 */
function buildMachineCodeValidator() {
  const file = path.resolve(process.cwd(), 'server/data/Library/MachineProfiles/profiles.json');
  return (code) => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
      return profiles.some((p) => p && (p.id === code || p.code === code));
    } catch {
      return false;
    }
  };
}

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

  // MES-2.1 — surface reason_code drift at boot. Warn-only; the kiosk
  // surface (MES-2.5+) gracefully degrades when codes are missing
  // (operator can't pause-with-reason until fixed) but the WO surface
  // is unaffected, so we don't gate the mount on this.
  const issues = validateReasonCodeIntegrity(db);
  if (issues.length > 0) {
    console.warn('[planning] reason_code integrity warnings:\n  - ' + issues.join('\n  - '));
  }

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

  // ─── MES-2.3 Kiosk pairing ────────────────────────────────────
  // Mount BEFORE the parent /v2 auth handler so POST /redeem can be
  // reached without a user session (the pairing token IS the credential).
  // Per-route guards inside kiosksRouter apply auth to the planner +
  // sys endpoints. No-op when the kiosk key can't be resolved (in dev
  // we'd have auto-generated; in prod we throw, which surfaces to the
  // process supervisor — no silent degradation).
  const kioskKey = resolveKioskKey();
  const kioskService = createKioskTokenService({ secret: kioskKey, audit });
  const kioskRouter = createKioskV2Router({
    db,
    service: kioskService,
    validateMachineCode: buildMachineCodeValidator(),
    authMiddleware: auth,
  });
  app.use('/api/planning/v2/kiosks', kioskRouter);
  app.use('/api/v1/planning/v2/kiosks', kioskRouter);

  // Mount BEFORE the legacy /api/planning router (registration order =
  // Express match order). Legacy planning has no /v2/ children, so this
  // ordering is belt-and-suspenders against future drift.
  app.use('/api/planning/v2', auth, router);
  app.use('/api/v1/planning/v2', auth, router);
  return true;
}
