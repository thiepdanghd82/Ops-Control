/**
 * Work Order service — Sprint MES-1.3.
 *
 * Orchestrates `repo` + `codeGen` + `audit` + `workOrderTransition`.
 * Every state mutation runs inside a single `db.transaction(...)` together
 * with the audit_log insert, so an audit failure rolls back the status
 * update (PRD §4 atomicity NFR + AC-1.3.3).
 *
 * Audit dependency is injected (factory): the production wiring (MES-1.4)
 * passes a thin `db.prepare('INSERT INTO audit_log ...').run(...)` closure;
 * tests can pass a spy that throws on demand.  Reuse rationale: the
 * existing `server/repositories/auditStore.js::appendAudit()` is fail-open
 * (swallows errors) so we cannot wrap it for atomicity — see PR notes.
 */
import { workOrderTransition } from '../domain/workOrderTransition.js';
import { opStatusTransition } from '../domain/opStatusTransition.js';
import { WO_TERMINAL } from '../../shared/constants/workOrderStates.js';
import { HEADER_PATCHABLE_FIELDS } from '../repositories/workOrderRepo.js';
import { BmesError } from '../errors.js';

export function createWorkOrderService({ db, repo, codeGen, audit }) {
  function mustExist(id) {
    const wo = repo.findById(id);
    if (!wo) throw new BmesError('urn:ops:wo-not-found', { wo_id: id });
    return wo;
  }

  // Internal: write one audit_log row. Optional `ts` lets state-mutation
  // call sites share a single timestamp between the WO row and the audit
  // row (microsecond drift would otherwise be visible in incident replay).
  function emit(event, actor, detail, ts = new Date().toISOString()) {
    audit({ ts, event, user: actor, detail: JSON.stringify(detail) });
  }

  function createWorkOrder(input, actor) {
    const code = input.code ?? codeGen.generateCode();
    if (input.code && repo.existsByCode(input.code)) {
      throw new BmesError('urn:ops:wo-code-collision', { code: input.code });
    }
    const row = {
      code,
      sales_order_id: input.sales_order_id ?? null,
      rfq_no: input.rfq_no ?? null,
      ccl_pn: input.ccl_pn,
      customer: input.customer,
      qty_planned: input.qty_planned,
      uom: input.uom,
      priority: input.priority ?? 5,
      due_date: input.due_date,
      status: 'CREATED',
      created_by: actor,
    };
    row.raw_json = JSON.stringify(row);

    let wo;
    db.transaction(() => {
      wo = repo.insert(row);
      emit('WO_CREATE', actor, {
        wo_id: wo.id,
        code: wo.code,
        ccl_pn: wo.ccl_pn,
        customer: wo.customer,
        qty_planned: wo.qty_planned,
        due_date: wo.due_date,
      });
    })();
    return wo;
  }

  function getDetail(id) {
    const wo = mustExist(id);
    return { ...wo, operations: repo.findOpsByWorkOrder(id) };
  }

  function listWorkOrders(filters = {}) {
    return repo.list(filters);
  }

  function updateHeader(id, patch, actor) {
    const forbidden = Object.keys(patch).filter((k) => !HEADER_PATCHABLE_FIELDS.includes(k));
    if (forbidden.length > 0) {
      throw new BmesError('urn:ops:wo-forbidden-fields', { forbidden_fields: forbidden });
    }
    const before = mustExist(id);
    if (WO_TERMINAL.includes(before.status)) {
      throw new BmesError('urn:ops:wo-terminal-edit', { wo_id: id, status: before.status });
    }
    let after;
    db.transaction(() => {
      after = repo.updateHeader(id, patch, actor);
      const changed = {};
      for (const k of Object.keys(patch)) {
        if (HEADER_PATCHABLE_FIELDS.includes(k)) {
          changed[k] = { from: before[k], to: after[k] };
        }
      }
      emit('WO_UPDATE', actor, { wo_id: id, changes: changed });
    })();
    return after;
  }

  function transition(id, toStatus, actor, eventCode, extraDetail = {}) {
    const wo = mustExist(id);
    const t = workOrderTransition(wo.status, toStatus);
    if (!t.ok) {
      throw new BmesError(t.error.type, {
        wo_id: id,
        from: wo.status,
        to: toStatus,
        ...(t.error.allowed_from ? { allowed_from: [...t.error.allowed_from] } : {}),
      });
    }
    const ts = new Date().toISOString();
    let updated;
    db.transaction(() => {
      updated = repo.updateStatus(id, toStatus, ts);
      emit(
        eventCode,
        actor,
        { wo_id: id, code: wo.code, from: wo.status, to: toStatus, ...extraDetail },
        ts
      );
    })();
    return updated;
  }

  function releaseWorkOrder(id, actor, notes) {
    const wo = mustExist(id);
    if (repo.countOps(id) < 1) {
      throw new BmesError('urn:ops:wo-no-operations', { wo_id: id });
    }
    return transition(id, 'RELEASED', actor, 'WO_RELEASE', {
      ops_count: repo.countOps(id),
      ...(notes ? { notes } : {}),
    });
  }

  /**
   * Cancel a Work Order — MES-3-V1 (KIOSK-003 b+d) cascade behaviour.
   *
   * The single-transaction shape:
   *   1. validate `reason` (existing contract — 1..500 chars)
   *   2. load WO; 404 if missing
   *   3. idempotent return when wo.status is already 'CANCELLED' — no
   *      second cascade, no second audit row. The response shape mirrors
   *      a fresh cancel (carries `cascaded_ops`) so re-POST is invisible
   *      to clients downstream.
   *   4. workOrderTransition guard (existing — 409 from non-cancellable)
   *   5. inside one db.transaction:
   *        - for each non-terminal child op (status NOT IN {ACCEPTED,CANCELLED}):
   *            * opStatusTransition(op.status, 'wo_cancel') guard
   *            * repo.updateOpStatus(op.id, 'CANCELLED', {}, ts)
   *            * insertOpEvent (forensic replay)
   *            * audit OP_CANCEL_CASCADE
   *        - repo.updateStatus(wo.id, 'CANCELLED', ts)
   *        - audit WO_CANCEL with cascaded_op_count
   *   6. return wo + cascaded_ops list
   *
   * Atomicity (PRD §4): if ANY op transition fails, the whole transaction
   * rolls back. A WO with broken state-machine state in any child op
   * stays in its original status — operator + audit see no half-cancel.
   *
   * Skipped statuses on cascade:
   *   - ACCEPTED — operator already signed off; un-accepting is a separate
   *     business decision (deferred KIOSK-003 c).
   *   - CANCELLED — already there; no-op (also unreachable in practice
   *     because step 3's idempotent guard catches the re-cancel case).
   */
  function cancelWorkOrder(id, reason, actor) {
    if (typeof reason !== 'string' || reason.length === 0 || reason.length > 500) {
      throw new BmesError('urn:ops:wo-reason-required', { max_length: 500 });
    }
    const wo = mustExist(id);

    // Idempotent: a second cancel on an already-CANCELLED WO returns the
    // current row with cascaded_ops:[]. No new audit, no new state event.
    if (wo.status === 'CANCELLED') {
      return { ...wo, cascaded_ops: [] };
    }

    // Pre-flight WO transition guard. Throws urn:ops:wo-no-change for
    // self-loops (caught above) or urn:ops:wo-invalid-transition for
    // non-cancellable terminal states (COMPLETED/QC_RELEASED/CLOSED).
    const t = workOrderTransition(wo.status, 'CANCELLED');
    if (!t.ok) {
      throw new BmesError(t.error.type, {
        wo_id: id,
        from: wo.status,
        to: 'CANCELLED',
        ...(t.error.allowed_from ? { allowed_from: [...t.error.allowed_from] } : {}),
      });
    }

    const ts = new Date().toISOString();
    const ops = repo.findOpsByWorkOrder(id);
    const cascaded = [];
    let updatedWo;

    db.transaction(() => {
      for (const op of ops) {
        // Skip already-terminal ops. ACCEPTED stays as-is per cascade
        // contract; CANCELLED is unreachable here (idempotent guard caught
        // re-cancel) but the check is cheap defensive insurance.
        if (op.status === 'ACCEPTED' || op.status === 'CANCELLED') continue;

        const opT = opStatusTransition(op.status, 'wo_cancel');
        if (!opT.ok) {
          // Should be unreachable: wo_cancel is valid from every non-
          // terminal op status. If the state machine evolves and a non-
          // cascade-able state appears, fail loud + roll back the txn.
          throw new BmesError('urn:ops:op-invalid-transition', {
            wo_id: id,
            op_id: op.id,
            from: op.status,
            event: 'wo_cancel',
            ...(opT.error.allowed_from ? { allowed_from: [...opT.error.allowed_from] } : {}),
          });
        }

        repo.updateOpStatus(op.id, opT.to, {}, ts);
        // Forensic replay row — same shape operationService.runTransition
        // writes for kiosk-driven transitions. payload_json carries the
        // cascade-only fields a forensic auditor would need (wo_id, reason).
        repo.insertOpEvent({
          op_id: op.id,
          from_status: op.status,
          to_status: opT.to,
          actor_user_id: null,
          kiosk_session_jti: null,
          idempotency_key: null,
          payload_json: JSON.stringify({ event: 'wo_cancel', wo_id: id, reason }),
        });
        emit(
          'OP_CANCEL_CASCADE',
          actor,
          {
            wo_id: id,
            op_id: op.id,
            from: op.status,
            to: opT.to,
            event: 'wo_cancel',
            reason,
          },
          ts
        );
        cascaded.push({ op_id: op.id, prev_status: op.status, new_status: opT.to });
      }

      // Update the WO last so cascade rows precede the WO_CANCEL row in
      // audit order — chronological replay reads "ops cancelled, then WO
      // cancelled" instead of the inverse.
      updatedWo = repo.updateStatus(id, 'CANCELLED', ts);
      emit(
        'WO_CANCEL',
        actor,
        {
          wo_id: id,
          code: wo.code,
          from: wo.status,
          to: 'CANCELLED',
          reason,
          cascaded_op_count: cascaded.length,
        },
        ts
      );
    })();

    return { ...updatedWo, cascaded_ops: cascaded };
  }

  function attachOperation(woId, opInput, actor) {
    const wo = mustExist(woId);
    if (WO_TERMINAL.includes(wo.status)) {
      throw new BmesError('urn:ops:wo-terminal-edit', { wo_id: woId, status: wo.status });
    }
    const seq = opInput.seq ?? repo.maxSeq(woId) + 10;
    const row = {
      work_order_id: woId,
      seq,
      op_type: opInput.op_type,
      work_centre_no: opInput.work_centre_no,
      planned_start: opInput.planned_start ?? null,
      planned_end: opInput.planned_end ?? null,
      setup_minutes_plan: opInput.setup_minutes_plan ?? null,
      run_minutes_plan: opInput.run_minutes_plan ?? null,
      notes: opInput.notes ?? null,
    };
    row.raw_json = JSON.stringify(row);

    let op;
    db.transaction(() => {
      op = repo.addOperation(row);
      emit('WO_OP_ADD', actor, {
        wo_id: woId,
        op_id: op.id,
        seq: op.seq,
        op_type: op.op_type,
        work_centre_no: op.work_centre_no,
      });
    })();
    return op;
  }

  return {
    createWorkOrder,
    getDetail,
    listWorkOrders,
    updateHeader,
    releaseWorkOrder,
    cancelWorkOrder,
    attachOperation,
  };
}
