/**
 * Operation-status service — Sprint MES-2.4.
 *
 * Orchestrates `repo` + `audit` + `opStatusTransition` (MES-2.2) the same
 * way `workOrderService` (MES-1.3) does for WO-level transitions: every
 * state mutation runs inside ONE `db.transaction()` together with the
 * op_status_event insert + audit_log insert, so any failure rolls the
 * whole tuple back (PRD §4 atomicity NFR).
 *
 * 5 public mutators (one per kiosk action):
 *   start   (DISPATCHED→SETUP)        — sets started_at
 *   pause   (RUNNING→PAUSED)          — sets paused_at + paused_reason_code (FK validated)
 *   resume  (PAUSED→RUNNING)          — clears paused_reason_code
 *   complete(RUNNING|PAUSED→DONE)     — picks 'complete' vs 'complete_from_pause' from current state
 *   scan    (records the scan event always; auto-fires start_run iff op is in SETUP and barcode matches wo.code)
 *
 * 5 audit event types (one per service method, NOT per transition):
 *   OP_START / OP_PAUSE / OP_RESUME / OP_COMPLETE / OP_SCAN
 *
 * ctx contract: { actor_user_id?: number, kiosk_session_jti?: string, idempotency_key?: string }
 *   — exactly one of actor_user_id or kiosk_session_jti must be present
 *     (validated synchronously before any DB hit).
 *   — idempotency_key is passed through to op_status_event as-is; uniqueness
 *     enforcement lives in the route-level middleware (MES-2.5).
 *
 * Decisions documented in MES-2.4 commit body:
 *   - scan() barcode matches wo.code (printed on travelers/labels), not op.id.
 *   - scan() with auto-transition writes 2 op_status_event rows
 *     (OP_SCAN no-status-change + START_RUN transition) but emits
 *     1 audit row (OP_SCAN — audit is method-keyed, not transition-keyed).
 */
import { opStatusTransition } from '../domain/opStatusTransition.js';
import { BmesError } from '../errors.js';

const nowIso = () => new Date().toISOString();

/**
 * @param {object} ctx
 * @returns {void} throws BmesError on bad ctx (synchronous, before any DB hit)
 */
function assertCtx(ctx) {
  const hasActor = ctx && ctx.actor_user_id != null;
  const hasKiosk =
    ctx && typeof ctx.kiosk_session_jti === 'string' && ctx.kiosk_session_jti.length > 0;
  if (hasActor === hasKiosk) {
    throw new BmesError('urn:ops:op-ctx-required', {
      detail:
        hasActor && hasKiosk
          ? 'ctx must have exactly one of actor_user_id or kiosk_session_jti, not both'
          : 'ctx must have one of actor_user_id or kiosk_session_jti',
    });
  }
}

const actorOf = (ctx) =>
  ctx.actor_user_id != null ? String(ctx.actor_user_id) : `kiosk:${ctx.kiosk_session_jti}`;

export function createOperationService({ db, repo, audit }) {
  function emit(event, actor, detail, ts = nowIso()) {
    audit({ ts, event, user: actor, detail: JSON.stringify(detail) });
  }

  function mustExist(opId) {
    const op = repo.findOpById(opId);
    if (!op) throw new BmesError('urn:ops:op-not-found', { op_id: opId });
    return op;
  }

  /**
   * Single-transaction state mutation. Runs the pure transition guard,
   * applies the caller's column-delta mutator, persists the new status
   * + last_pulse_at + the op_status_event row + the audit row — all
   * inside ONE db.transaction. Throws BmesError on guard failure;
   * never partial-writes.
   *
   * @param {object} op            already-loaded op row (caller may have done extra checks)
   * @param {string} eventType     one of OP_STATUS_EVENTS
   * @param {string} auditEvent    OP_START / OP_PAUSE / …
   * @param {(op, ts) => object} mutator  returns column→value delta
   * @param {object} ctx
   * @param {object} payload       extra fields to merge into op_status_event.payload_json
   */
  function runTransition(op, eventType, auditEvent, mutator, ctx, payload = {}) {
    const t = opStatusTransition(op.status, eventType, ctx);
    if (!t.ok) {
      throw new BmesError('urn:ops:op-invalid-transition', {
        op_id: op.id,
        from: op.status,
        event: eventType,
        ...(t.error.allowed_from ? { allowed_from: [...t.error.allowed_from] } : {}),
        ...(t.error.type === 'op-no-change' ? { reason: 'no-change' } : {}),
      });
    }
    const ts = nowIso();
    const deltas = mutator(op, ts) || {};
    let updatedOp;
    db.transaction(() => {
      updatedOp = repo.updateOpStatus(op.id, t.to, deltas, ts);
      repo.insertOpEvent({
        op_id: op.id,
        from_status: op.status,
        to_status: t.to,
        actor_user_id: ctx.actor_user_id ?? null,
        kiosk_session_jti: ctx.kiosk_session_jti ?? null,
        idempotency_key: ctx.idempotency_key ?? null,
        payload_json: JSON.stringify({ event: eventType, ...payload }),
      });
      emit(
        auditEvent,
        actorOf(ctx),
        { op_id: op.id, wo_id: op.work_order_id, from: op.status, to: t.to, event: eventType },
        ts
      );
    })();
    return updatedOp;
  }

  function start(opId, ctx) {
    assertCtx(ctx);
    const op = mustExist(opId);
    return runTransition(op, 'start', 'OP_START', (_o, ts) => ({ started_at: ts }), ctx);
  }

  function pause(opId, reasonCode, ctx) {
    assertCtx(ctx);
    if (typeof reasonCode !== 'string' || !reasonCode) {
      throw new BmesError('urn:ops:op-reason-required', { op_id: opId });
    }
    // FK validated OUTSIDE the transaction so a bad code never leaves a
    // partial write. (No status change, no event row, no audit row.)
    if (!repo.findReasonCode(reasonCode)) {
      throw new BmesError('urn:ops:reason-code-unknown', {
        op_id: opId,
        reason_code: reasonCode,
      });
    }
    const op = mustExist(opId);
    return runTransition(
      op,
      'pause',
      'OP_PAUSE',
      (_o, ts) => ({ paused_at: ts, paused_reason_code: reasonCode }),
      ctx,
      { reason_code: reasonCode }
    );
  }

  function resume(opId, ctx) {
    assertCtx(ctx);
    const op = mustExist(opId);
    // Resume clears paused_reason_code (the pause has ended); paused_at
    // is left in place as a forensic record of the most recent pause
    // start — operators reading the audit log can see the pause window
    // bracketed by paused_at + the OP_RESUME audit row's ts.
    return runTransition(op, 'resume', 'OP_RESUME', () => ({ paused_reason_code: null }), ctx);
  }

  function complete(opId, payload, ctx) {
    assertCtx(ctx);
    const op = mustExist(opId);
    // Pick the event variant from current state — opStatusTransition
    // distinguishes 'complete' (RUNNING→DONE) from 'complete_from_pause'
    // (PAUSED→DONE) so audit + op_status_event reflect the actual path.
    const eventType = op.status === 'PAUSED' ? 'complete_from_pause' : 'complete';
    return runTransition(
      op,
      eventType,
      'OP_COMPLETE',
      (_o, ts) => {
        const deltas = { completed_at: ts };
        if (payload && typeof payload.good_count === 'number')
          deltas.good_count = payload.good_count;
        if (payload && typeof payload.scrap_count === 'number')
          deltas.scrap_count = payload.scrap_count;
        return deltas;
      },
      ctx,
      payload || {}
    );
  }

  /**
   * Scan: always records an op_status_event row with to_status === from_status
   * (the scan IS the audit-worthy event regardless of state). If the op is
   * SETUP and the barcode matches wo.code, additionally fires the start_run
   * transition through runTransition — that path adds a second
   * op_status_event row + status change + last_pulse_at refresh; the OP_SCAN
   * audit row is emitted ONCE either way (audit is method-keyed).
   */
  function scan(opId, barcode, ctx) {
    assertCtx(ctx);
    const op = mustExist(opId);
    const ts = nowIso();
    const matched = typeof barcode === 'string' && barcode.length > 0 && op.wo_code === barcode;
    const willAutoTransition = op.status === 'SETUP' && matched;

    let scanEventId, finalOp;
    db.transaction(() => {
      scanEventId = repo.insertOpEvent({
        op_id: op.id,
        from_status: op.status,
        to_status: op.status,
        actor_user_id: ctx.actor_user_id ?? null,
        kiosk_session_jti: ctx.kiosk_session_jti ?? null,
        idempotency_key: ctx.idempotency_key ?? null,
        payload_json: JSON.stringify({
          event: 'scan',
          barcode,
          matched,
          auto_transition: willAutoTransition,
        }),
      });
      // Whether or not we transition, the kiosk just pinged — refresh
      // last_pulse_at so the operator-online indicator stays green.
      // (If we're about to transition, runTransition will also bump it,
      // which is harmless.)
      finalOp = repo.updateOpStatus(op.id, op.status, {}, ts);
      emit(
        'OP_SCAN',
        actorOf(ctx),
        {
          op_id: op.id,
          wo_id: op.work_order_id,
          barcode,
          matched,
          auto_transition: willAutoTransition,
        },
        ts
      );

      if (willAutoTransition) {
        // Same db.transaction, so this nested call is atomic with the
        // OP_SCAN row above. The transition writes its own audit row
        // (event=OP_START_RUN? No — runTransition would emit per the
        // auditEvent we pass; we DON'T pass OP_START because the
        // outer scan() already emitted OP_SCAN). For the auto-flow
        // we pass `null` mutator + skip the second audit by inlining
        // the work directly here instead of calling runTransition,
        // which would double-audit.
        const t = opStatusTransition(op.status, 'start_run', ctx);
        if (t.ok) {
          finalOp = repo.updateOpStatus(op.id, t.to, {}, ts);
          repo.insertOpEvent({
            op_id: op.id,
            from_status: op.status,
            to_status: t.to,
            actor_user_id: ctx.actor_user_id ?? null,
            kiosk_session_jti: ctx.kiosk_session_jti ?? null,
            // idempotency_key intentionally NOT reused — both rows would
            // collide on the partial-unique index. The scan event "owns"
            // the caller's idempotency_key; the auto-transition is a
            // side effect of that scan and gets a NULL key.
            idempotency_key: null,
            payload_json: JSON.stringify({ event: 'start_run', via: 'scan' }),
          });
        }
      }
    })();
    return { op: finalOp, scan_event_id: scanEventId, auto_transitioned: willAutoTransition };
  }

  return { start, pause, resume, complete, scan };
}
