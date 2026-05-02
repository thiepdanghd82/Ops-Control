/**
 * Operation REST routes (v2) — Sprint MES-2.5.
 *
 * 8 endpoints under `/api/planning/v2/operations/*`:
 *   GET    /dispatch?machine_code=X            (no idem; safe to retry)
 *   POST   /:id/start                          (idem required, body={})
 *   POST   /:id/start_run                      (idem required, body={}) — manual SETUP→RUNNING
 *   POST   /:id/pause                          (idem required, body={reason_code})
 *   POST   /:id/resume                         (idem required, body={})
 *   POST   /:id/complete                       (idem required, body={good_count?, scrap_count?, notes?})
 *   POST   /:id/scan                           (idem required, body={barcode, client_at?})
 *   POST   /:id/accept                         (planner-only, idem required) — DONE→ACCEPTED sign-off
 *
 * Auth: every endpoint behind requireKioskSession. Mutations also gated
 * by the idempotency middleware (which short-circuits on cache hit so
 * the service layer is never called twice for the same key+body).
 *
 * Op→kiosk binding check: op.work_centre_no must equal req.kioskSession
 * .machine_code. The work-centre IS the machine in this schema; there's
 * no separate "dispatched to" column. Mismatch → 403
 * urn:ops:kiosk-machine-mismatch (not 404 — the op exists, the kiosk
 * just isn't authorised to mutate it).
 *
 * Service errors (BmesError) are translated to RFC-7807 by URN:
 *   op-not-found              → 404
 *   op-invalid-transition     → 409 (passes from/event/allowed_from/reason)
 *   reason-code-unknown       → 422
 *   op-reason-required        → 400
 *   op-ctx-required           → 500 (should never bubble — service asserts before any DB hit)
 */
import { Router } from 'express';
import { respondError } from '../lib/rfc7807.js';
import { BmesError } from '../errors.js';

const STATUS_BY_TYPE = {
  'urn:ops:op-not-found': 404,
  'urn:ops:op-invalid-transition': 409,
  'urn:ops:reason-code-unknown': 422,
  'urn:ops:op-reason-required': 400,
  'urn:ops:op-ctx-required': 500,
};

function serializeOp(op) {
  if (!op) return null;
  return {
    id: op.id,
    wo_id: op.work_order_id,
    wo_code: op.wo_code,
    seq: op.seq,
    op_type: op.op_type,
    work_centre_no: op.work_centre_no,
    status: op.status,
    started_at: op.started_at,
    paused_at: op.paused_at,
    paused_reason_code: op.paused_reason_code,
    completed_at: op.completed_at,
    last_pulse_at: op.last_pulse_at,
    good_count: op.good_count,
    scrap_count: op.scrap_count,
  };
}

function handleServiceError(res, e) {
  if (e instanceof BmesError) {
    return respondError(res, {
      status: STATUS_BY_TYPE[e.type] || 500,
      type: e.type,
      ...(e.payload || {}),
    });
  }
  console.error('[operationV2] unexpected error:', e);
  return respondError(res, {
    status: 500,
    type: 'urn:ops:internal-error',
    detail: 'internal_error',
  });
}

// Mirrors workOrderV2.js — kept inline so RFC-7807 envelope is uniform
// across MES-1 + MES-2 routers (the project-wide requireRole emits a
// legacy {error} shape).
const ROLE_LEVELS = { viewonly: 1, user: 2, cost: 3, admin: 4, sys: 5 };
function requireRoleAtLeast(level) {
  return (req, res, next) => {
    const role = req.user?.user?.role || req.user?.role;
    if ((ROLE_LEVELS[role] || 0) < level) {
      return respondError(res, {
        status: 403,
        type: 'urn:ops:insufficient-role',
        required_level: level,
        current_role: role || null,
      });
    }
    next();
  };
}

export function createOperationV2Router({
  db,
  repo,
  service,
  requireKioskSession,
  idempotencyMiddleware,
  auth,
}) {
  const router = Router();

  // ── GET /dispatch ─────────────────────────────────────────────
  router.get('/dispatch', requireKioskSession, (req, res) => {
    const machineCode = String(req.query.machine_code || '');
    if (!machineCode) {
      return respondError(res, {
        status: 400,
        type: 'urn:ops:validation',
        errors: [{ field: 'machine_code', code: 'required' }],
      });
    }
    if (machineCode !== req.kioskSession.machine_code) {
      return respondError(res, {
        status: 403,
        type: 'urn:ops:kiosk-machine-mismatch',
        kiosk_machine: req.kioskSession.machine_code,
        requested_machine: machineCode,
      });
    }
    // Sort: priority DESC, due_date ASC, op.id ASC — deterministic so
    // the kiosk's "next op" picker doesn't shuffle on tied priorities.
    // MES-2.6b: rows include WO qty_planned + due_date + priority so
    // the dispatch list renders without a second WO fetch.
    const items = db
      .prepare(
        `SELECT op.id, op.work_order_id, wo.code AS wo_code, op.seq, op.op_type,
                op.work_centre_no, op.status, op.started_at, op.paused_at,
                op.paused_reason_code, op.completed_at, op.last_pulse_at,
                op.good_count, op.scrap_count,
                wo.priority, wo.due_date, wo.qty_planned, wo.customer
         FROM work_order_op op
         JOIN work_order wo ON wo.id = op.work_order_id
         WHERE op.work_centre_no = ?
           AND op.status IN ('PENDING','DISPATCHED','SETUP','PAUSED')
         ORDER BY wo.priority DESC, wo.due_date ASC, op.id ASC
         LIMIT 200`
      )
      .all(machineCode)
      .map((r) => ({
        ...serializeOp(r),
        priority: r.priority,
        due_date: r.due_date,
        qty_planned: r.qty_planned,
        customer: r.customer,
      }));
    res.json({ items, server_time: new Date().toISOString(), cursor: null });
  });

  // ── shared mutation prelude ───────────────────────────────────
  // Loads op, runs the kiosk-machine binding check, builds the ctx
  // for the service. Returns either { op, ctx } or null if it already
  // sent a 404/403 response.
  function preludeForMutation(req, res) {
    const opId = Number(req.params.id);
    if (!Number.isFinite(opId) || opId <= 0) {
      respondError(res, {
        status: 400,
        type: 'urn:ops:validation',
        errors: [{ field: 'id', code: 'integer' }],
      });
      return null;
    }
    const op = repo.findOpById(opId);
    if (!op) {
      respondError(res, { status: 404, type: 'urn:ops:op-not-found', op_id: opId });
      return null;
    }
    if (op.work_centre_no !== req.kioskSession.machine_code) {
      respondError(res, {
        status: 403,
        type: 'urn:ops:kiosk-machine-mismatch',
        op_id: opId,
        op_machine: op.work_centre_no,
        kiosk_machine: req.kioskSession.machine_code,
      });
      return null;
    }
    const ctx = {
      kiosk_session_jti: req.kioskSession.jti,
      idempotency_key: req.idempotencyKey,
    };
    return { op, ctx, opId };
  }

  // ── POST /:id/start ───────────────────────────────────────────
  router.post('/:id/start', requireKioskSession, idempotencyMiddleware, (req, res) => {
    const p = preludeForMutation(req, res);
    if (!p) return;
    try {
      const updated = service.start(p.opId, p.ctx);
      res.status(200).json({ op: serializeOp(updated) });
    } catch (e) {
      handleServiceError(res, e);
    }
  });

  // ── POST /:id/start_run ───────────────────────────────────────
  // Manual SETUP→RUNNING (operator-tapped "Begin Run" tile, no scan).
  // Companion to /scan: same final state, different audit signal.
  router.post('/:id/start_run', requireKioskSession, idempotencyMiddleware, (req, res) => {
    const p = preludeForMutation(req, res);
    if (!p) return;
    try {
      const updated = service.start_run(p.opId, p.ctx);
      res.status(200).json({ op: serializeOp(updated) });
    } catch (e) {
      handleServiceError(res, e);
    }
  });

  // ── POST /:id/pause ───────────────────────────────────────────
  router.post('/:id/pause', requireKioskSession, idempotencyMiddleware, (req, res) => {
    const p = preludeForMutation(req, res);
    if (!p) return;
    const reasonCode = req.body?.reason_code;
    try {
      const updated = service.pause(p.opId, reasonCode, p.ctx);
      res.status(200).json({ op: serializeOp(updated) });
    } catch (e) {
      handleServiceError(res, e);
    }
  });

  // ── POST /:id/resume ──────────────────────────────────────────
  router.post('/:id/resume', requireKioskSession, idempotencyMiddleware, (req, res) => {
    const p = preludeForMutation(req, res);
    if (!p) return;
    try {
      const updated = service.resume(p.opId, p.ctx);
      res.status(200).json({ op: serializeOp(updated) });
    } catch (e) {
      handleServiceError(res, e);
    }
  });

  // ── POST /:id/complete ────────────────────────────────────────
  router.post('/:id/complete', requireKioskSession, idempotencyMiddleware, (req, res) => {
    const p = preludeForMutation(req, res);
    if (!p) return;
    const payload = {
      good_count: req.body?.qty_done ?? req.body?.good_count,
      scrap_count: req.body?.scrap_count,
      notes: req.body?.notes,
    };
    try {
      const updated = service.complete(p.opId, payload, p.ctx);
      res.status(200).json({ op: serializeOp(updated) });
    } catch (e) {
      handleServiceError(res, e);
    }
  });

  // ── POST /:id/scan ────────────────────────────────────────────
  router.post('/:id/scan', requireKioskSession, idempotencyMiddleware, (req, res) => {
    const p = preludeForMutation(req, res);
    if (!p) return;
    const barcode = req.body?.barcode;
    if (typeof barcode !== 'string' || !barcode) {
      return respondError(res, {
        status: 400,
        type: 'urn:ops:validation',
        errors: [{ field: 'barcode', code: 'required' }],
      });
    }
    try {
      const r = service.scan(p.opId, barcode, p.ctx);
      res.status(200).json({
        op: serializeOp(r.op),
        scan_event_id: r.scan_event_id,
        auto_transitioned: r.auto_transitioned,
      });
    } catch (e) {
      handleServiceError(res, e);
    }
  });

  // ── POST /:id/accept ──────────────────────────────────────────
  // Planner sign-off (DONE→ACCEPTED). Cookie auth + role≥user (level 2);
  // ctx carries actor_user_id (NOT kiosk_session_jti — this isn't a kiosk
  // action). No machine_code check — planner can accept any op regardless
  // of which kiosk reported it.
  router.post('/:id/accept', auth, requireRoleAtLeast(2), idempotencyMiddleware, (req, res) => {
    const opId = Number(req.params.id);
    if (!Number.isFinite(opId) || opId <= 0) {
      return respondError(res, {
        status: 400,
        type: 'urn:ops:validation',
        errors: [{ field: 'id', code: 'integer' }],
      });
    }
    const op = repo.findOpById(opId);
    if (!op) {
      return respondError(res, { status: 404, type: 'urn:ops:op-not-found', op_id: opId });
    }
    const userId = req.user?.user?.id ?? req.user?.id;
    const ctx = { actor_user_id: userId, idempotency_key: req.idempotencyKey };
    try {
      const updated = service.accept(opId, ctx);
      res.status(200).json({ op: serializeOp(updated) });
    } catch (e) {
      handleServiceError(res, e);
    }
  });

  return router;
}
