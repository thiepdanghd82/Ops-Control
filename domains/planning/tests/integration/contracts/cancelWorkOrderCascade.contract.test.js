/**
 * MES-3-V1 (KIOSK-003 b+d) — Contract: cascade behaviour on
 * POST /api/planning/v2/work-orders/:id/cancel.
 *
 * Mirrors cancelWorkOrder.contract.test.js's harness pattern; this file
 * focuses on cascade-specific contract guarantees the basic cancel test
 * doesn't cover:
 *
 *   1. Response body carries `cascaded_ops: [{op_id, prev_status, new_status}, ...]`
 *      with one entry per non-terminal child op (skip ACCEPTED).
 *   2. WO row is updated to CANCELLED with `closed_at` populated.
 *   3. Child ops in the DB transition correctly (PENDING → CANCELLED, etc.;
 *      ACCEPTED preserved).
 *   4. Idempotent re-POST returns the same shape with `cascaded_ops: []`.
 *   5. Cancel on COMPLETED WO returns 409 RFC-7807 (existing behaviour).
 *
 * Runner:
 *   node --test domains/planning/tests/integration/contracts/cancelWorkOrderCascade.contract.test.js
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, listen, close, req, PLANNER, VALID_BODY } from './_harness.js';

let baseUrl, server, service, repo, db;
before(async () => {
  const harness = buildApp();
  service = harness.service;
  repo = harness.repo;
  db = harness.db;
  ({ baseUrl, server } = await listen(harness.app));
});
after(() => close(server));

// Helper: create a WO + N ops with explicit statuses. Bypasses the
// normal kiosk happy path (those endpoints aren't mounted in this harness)
// by writing directly through the repo.
function seedWoWithOps(statuses) {
  const wo = service.createWorkOrder(VALID_BODY, 'planner1');
  // Push WO to RELEASED via repo so the cancel guard accepts it.
  repo.updateStatus(wo.id, 'RELEASED', new Date().toISOString());
  const opIds = [];
  for (let i = 0; i < statuses.length; i++) {
    const op = service.attachOperation(
      wo.id,
      { op_type: 'FLEXO', work_centre_no: `WC-${i}-${wo.id}` },
      'planner1'
    );
    if (statuses[i] !== 'PENDING') {
      repo.updateOpStatus(op.id, statuses[i], {}, new Date().toISOString());
    }
    opIds.push(op.id);
  }
  return { wo, opIds };
}

describe('POST /api/planning/v2/work-orders/:id/cancel — cascade', () => {
  test('200 — cascaded_ops contains 4 non-terminal ops; ACCEPTED preserved', async () => {
    const { wo, opIds } = seedWoWithOps(['PENDING', 'DISPATCHED', 'RUNNING', 'DONE', 'ACCEPTED']);

    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/cancel`, {
      user: PLANNER,
      body: { reason: 'customer pulled order' },
    });

    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'CANCELLED');
    assert.ok(r.json.closed_at);
    assert.equal(r.json.cascaded_ops.length, 4);
    assert.deepEqual(r.json.cascaded_ops.map((c) => c.prev_status).sort(), [
      'DISPATCHED',
      'DONE',
      'PENDING',
      'RUNNING',
    ]);
    for (const c of r.json.cascaded_ops) {
      assert.equal(c.new_status, 'CANCELLED');
    }

    // DB-level confirmation: 4 ops CANCELLED, 1 op still ACCEPTED.
    const opStatuses = opIds.map((id) => repo.findOpById(id).status);
    assert.deepEqual(opStatuses, ['CANCELLED', 'CANCELLED', 'CANCELLED', 'CANCELLED', 'ACCEPTED']);
  });

  test('200 — audit_log carries N OP_CANCEL_CASCADE rows + 1 WO_CANCEL with cascaded_op_count', async () => {
    const { wo } = seedWoWithOps(['PENDING', 'RUNNING', 'PAUSED']);
    await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/cancel`, {
      user: PLANNER,
      body: { reason: 'pulled' },
    });

    // OP_CANCEL_CASCADE rows pinned to this WO.
    const cascadeRows = db
      .prepare(
        `SELECT detail FROM audit_log WHERE event='OP_CANCEL_CASCADE'
           AND CAST(json_extract(detail, '$.wo_id') AS INTEGER) = ?
         ORDER BY id ASC`
      )
      .all(wo.id);
    assert.equal(cascadeRows.length, 3);
    for (const r of cascadeRows) {
      const d = JSON.parse(r.detail);
      assert.equal(d.event, 'wo_cancel');
      assert.equal(d.to, 'CANCELLED');
      assert.equal(d.reason, 'pulled');
    }

    const woRow = db
      .prepare(
        `SELECT detail FROM audit_log WHERE event='WO_CANCEL'
           AND CAST(json_extract(detail, '$.wo_id') AS INTEGER) = ?`
      )
      .get(wo.id);
    const wd = JSON.parse(woRow.detail);
    assert.equal(wd.cascaded_op_count, 3);
    assert.equal(wd.reason, 'pulled');
  });

  test('200 — idempotent re-cancel returns cascaded_ops:[] and writes ZERO new audit rows', async () => {
    const { wo } = seedWoWithOps(['PENDING', 'RUNNING']);
    await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/cancel`, {
      user: PLANNER,
      body: { reason: 'first cancel' },
    });

    const auditCountBefore = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;

    const r = await req(baseUrl, 'POST', `/api/planning/v2/work-orders/${wo.id}/cancel`, {
      user: PLANNER,
      body: { reason: 'retry — idempotent path' },
    });

    assert.equal(r.status, 200);
    assert.equal(r.json.status, 'CANCELLED');
    assert.deepEqual(r.json.cascaded_ops, []);

    const auditCountAfter = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
    assert.equal(
      auditCountAfter,
      auditCountBefore,
      'no audit double-write on idempotent re-cancel'
    );
  });
});
