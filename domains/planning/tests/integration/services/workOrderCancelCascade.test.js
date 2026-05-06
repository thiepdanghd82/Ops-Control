/**
 * MES-3-V1 (KIOSK-003 b+d) — workOrderService.cancelWorkOrder cascade tests.
 *
 * In-memory better-sqlite3, factory-DI'd repo + audit (mirrors
 * workOrderService.integration.test.js). Validates:
 *
 *   1. Cascade cancels every non-terminal child op atomically.
 *   2. ACCEPTED ops are NOT touched (cascade contract).
 *   3. Each cascaded op produces:
 *        - a work_order_op row with status='CANCELLED'
 *        - an op_status_event row (forensic replay)
 *        - an OP_CANCEL_CASCADE audit row carrying { wo_id, op_id, from, to, reason }
 *   4. The parent WO produces a single WO_CANCEL audit row carrying
 *      cascaded_op_count.
 *   5. Idempotent re-cancel returns the same shape but writes ZERO new
 *      audit rows or op_status_event rows.
 *   6. WO already in a non-cancellable terminal state (COMPLETED) throws
 *      urn:ops:wo-invalid-transition without touching child ops.
 *   7. Audit ordering — cascade rows precede the WO_CANCEL row so a
 *      chronological replay reads "ops cancelled, then WO cancelled."
 *
 * Runner:
 *   node --test domains/planning/tests/integration/services/workOrderCancelCascade.test.js
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { createWorkOrderRepo } from '../../../server/repositories/workOrderRepo.js';
import { createWoCodeGenerator } from '../../../server/services/woCodeGenerator.js';
import { createWorkOrderService } from '../../../server/services/workOrderService.js';
import { BmesError } from '../../../server/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../../server/db/schema.sql'),
  'utf-8'
);

function setup() {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  const repo = createWorkOrderRepo(db);
  const codeGen = createWoCodeGenerator(db);
  const audit = (row) =>
    db
      .prepare('INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)')
      .run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
  const svc = createWorkOrderService({ db, repo, codeGen, audit });
  return { db, repo, svc };
}

// Helper: create a WO with N ops and force each op into a specific status
// via the repo (operationService isn't on the test path).
function createWoWithOpStatuses(svc, repo, statuses) {
  const wo = svc.createWorkOrder(
    {
      ccl_pn: 'PN-CASCADE',
      customer: 'Acme',
      qty_planned: 100,
      uom: 'EA',
      due_date: '2026-12-31',
    },
    'planner1'
  );
  // Push WO to RELEASED so the cancel guard accepts it (CREATED also accepts,
  // but RELEASED is closer to a real cascade scenario where ops are alive).
  repo.updateStatus(wo.id, 'RELEASED', new Date().toISOString());

  const ops = [];
  for (let i = 0; i < statuses.length; i++) {
    const op = svc.attachOperation(
      wo.id,
      { op_type: 'FLEXO', work_centre_no: `WC-${i}` },
      'planner1'
    );
    if (statuses[i] !== 'PENDING') {
      // Force the op to the desired state without going through the kiosk
      // happy path. Tests-only shortcut.
      repo.updateOpStatus(op.id, statuses[i], {}, new Date().toISOString());
    }
    ops.push(op);
  }
  return { wo, ops: ops.map((o) => repo.findOpById(o.id)) };
}

describe('cancelWorkOrder cascade — happy path', () => {
  test('cancels all 4 non-terminal ops; ACCEPTED is preserved; WO closes', () => {
    const { db, repo, svc } = setup();
    const { wo, ops } = createWoWithOpStatuses(svc, repo, [
      'PENDING',
      'DISPATCHED',
      'RUNNING',
      'DONE',
      'ACCEPTED',
    ]);

    const result = svc.cancelWorkOrder(wo.id, 'customer pulled order', 'planner1');

    assert.equal(result.status, 'CANCELLED');
    assert.ok(result.closed_at, 'closed_at populated by repo.updateStatus');
    assert.equal(result.cascaded_ops.length, 4, '4 non-terminal ops cascaded');

    // Each cascaded op carries prev_status + new_status; ordering matches
    // op insertion (seq ASC).
    const cascadedPrev = result.cascaded_ops.map((c) => c.prev_status);
    assert.deepEqual(cascadedPrev, ['PENDING', 'DISPATCHED', 'RUNNING', 'DONE']);
    for (const c of result.cascaded_ops) {
      assert.equal(c.new_status, 'CANCELLED');
    }

    // DB state: 4 ops CANCELLED, 1 op still ACCEPTED.
    const after = ops.map((o) => repo.findOpById(o.id));
    assert.deepEqual(
      after.map((o) => o.status),
      ['CANCELLED', 'CANCELLED', 'CANCELLED', 'CANCELLED', 'ACCEPTED']
    );

    // Audit: 4 OP_CANCEL_CASCADE + 1 WO_CANCEL.
    const cascadeRows = db
      .prepare("SELECT detail FROM audit_log WHERE event = 'OP_CANCEL_CASCADE' ORDER BY id ASC")
      .all();
    assert.equal(cascadeRows.length, 4);
    for (const r of cascadeRows) {
      const d = JSON.parse(r.detail);
      assert.equal(d.wo_id, wo.id);
      assert.equal(d.to, 'CANCELLED');
      assert.equal(d.event, 'wo_cancel');
      assert.equal(d.reason, 'customer pulled order');
    }

    const woRow = db.prepare("SELECT detail FROM audit_log WHERE event = 'WO_CANCEL'").get();
    const wd = JSON.parse(woRow.detail);
    assert.equal(wd.cascaded_op_count, 4);
    assert.equal(wd.reason, 'customer pulled order');
    assert.equal(wd.from, 'RELEASED');
    assert.equal(wd.to, 'CANCELLED');
  });

  test('cascade writes one op_status_event row per cancelled op', () => {
    const { db, repo, svc } = setup();
    const { wo } = createWoWithOpStatuses(svc, repo, ['PENDING', 'RUNNING', 'PAUSED']);
    svc.cancelWorkOrder(wo.id, 'pulled', 'planner1');

    const events = db
      .prepare(
        `SELECT op_id, from_status, to_status, payload_json
         FROM op_status_event ORDER BY id ASC`
      )
      .all();
    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map((e) => e.to_status),
      ['CANCELLED', 'CANCELLED', 'CANCELLED']
    );
    assert.deepEqual(
      events.map((e) => e.from_status),
      ['PENDING', 'RUNNING', 'PAUSED']
    );
    for (const e of events) {
      const p = JSON.parse(e.payload_json);
      assert.equal(p.event, 'wo_cancel');
      assert.equal(p.wo_id, wo.id);
      assert.equal(p.reason, 'pulled');
    }
  });

  test('audit ordering — cascade rows precede the WO_CANCEL row', () => {
    const { db, repo, svc } = setup();
    const { wo } = createWoWithOpStatuses(svc, repo, ['PENDING', 'RUNNING']);
    svc.cancelWorkOrder(wo.id, 'pulled', 'planner1');

    const rows = db
      .prepare(
        `SELECT event FROM audit_log
         WHERE event IN ('OP_CANCEL_CASCADE', 'WO_CANCEL')
         ORDER BY id ASC`
      )
      .all();
    // Both OP_CANCEL_CASCADE rows come first, then the WO_CANCEL row last.
    assert.deepEqual(
      rows.map((r) => r.event),
      ['OP_CANCEL_CASCADE', 'OP_CANCEL_CASCADE', 'WO_CANCEL']
    );
    // Code-locality: woRow id > cascadeRow id (id is autoincrement).
    void wo; // referenced for symmetry; nothing else to assert against wo here.
  });
});

describe('cancelWorkOrder cascade — idempotency', () => {
  test('re-cancel on already-CANCELLED WO returns same shape, ZERO new audit rows', () => {
    const { db, repo, svc } = setup();
    const { wo } = createWoWithOpStatuses(svc, repo, ['PENDING', 'RUNNING']);
    svc.cancelWorkOrder(wo.id, 'first reason', 'planner1');

    const auditCountBefore = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
    const eventCountBefore = db.prepare('SELECT COUNT(*) AS n FROM op_status_event').get().n;

    const second = svc.cancelWorkOrder(wo.id, 'second attempt', 'planner1');

    assert.equal(second.status, 'CANCELLED');
    assert.deepEqual(second.cascaded_ops, [], 'idempotent: no new cascade');

    const auditCountAfter = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
    const eventCountAfter = db.prepare('SELECT COUNT(*) AS n FROM op_status_event').get().n;
    assert.equal(auditCountAfter, auditCountBefore, 'no new audit row written');
    assert.equal(eventCountAfter, eventCountBefore, 'no new op_status_event row written');
  });
});

describe('cancelWorkOrder cascade — terminal-state guard', () => {
  test('cancel on COMPLETED WO throws + leaves child ops untouched', () => {
    const { db, repo, svc } = setup();
    const { wo, ops } = createWoWithOpStatuses(svc, repo, ['RUNNING', 'PENDING']);

    // Force WO to COMPLETED via repo (operations stay in their seeded state).
    repo.updateStatus(wo.id, 'SCHEDULED', new Date().toISOString());
    repo.updateStatus(wo.id, 'IN_PROGRESS', new Date().toISOString());
    repo.updateStatus(wo.id, 'COMPLETED', new Date().toISOString());

    const auditCountBefore = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
    const opStatusesBefore = ops.map((o) => repo.findOpById(o.id).status);

    let err;
    try {
      svc.cancelWorkOrder(wo.id, 'too late', 'planner1');
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof BmesError);
    assert.equal(err.type, 'urn:ops:wo-invalid-transition');
    assert.equal(err.payload.from, 'COMPLETED');

    // No mutation: ops AND audit both unchanged.
    const opStatusesAfter = ops.map((o) => repo.findOpById(o.id).status);
    assert.deepEqual(opStatusesAfter, opStatusesBefore);
    const auditCountAfter = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
    assert.equal(auditCountAfter, auditCountBefore);
  });

  test('reason validation — empty / too long / non-string rejected before any DB hit', () => {
    const { db, repo, svc } = setup();
    const { wo } = createWoWithOpStatuses(svc, repo, ['PENDING']);
    const auditCountBefore = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;

    for (const bad of ['', undefined, null, 123, 'x'.repeat(501)]) {
      assert.throws(
        () => svc.cancelWorkOrder(wo.id, bad, 'planner1'),
        (e) => e instanceof BmesError && e.type === 'urn:ops:wo-reason-required'
      );
    }
    const auditCountAfter = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
    assert.equal(auditCountAfter, auditCountBefore, 'rejects pre-DB');
  });
});

describe('cancelWorkOrder cascade — atomicity', () => {
  test('audit failure inside cascade rolls back EVERY op + WO update', () => {
    // Custom audit that throws on the SECOND OP_CANCEL_CASCADE row — so the
    // first op's update has already happened when we boom; only an atomic
    // db.transaction will roll it back.
    const db = new Database(':memory:');
    db.exec(SCHEMA_SQL);
    const repo = createWorkOrderRepo(db);
    const codeGen = createWoCodeGenerator(db);
    let cascadeCount = 0;
    const audit = (row) => {
      if (row.event === 'OP_CANCEL_CASCADE') {
        cascadeCount += 1;
        if (cascadeCount === 2) throw new Error('audit boom on 2nd cascade');
      }
      db.prepare('INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)').run(
        row.ts,
        row.event,
        row.user || '-',
        row.ip || '-',
        row.detail || ''
      );
    };
    const svc = createWorkOrderService({ db, repo, codeGen, audit });

    const { wo, ops } = createWoWithOpStatuses(svc, repo, ['PENDING', 'RUNNING', 'DONE']);
    const opStatusesBefore = ops.map((o) => repo.findOpById(o.id).status);
    const woStatusBefore = repo.findById(wo.id).status;

    assert.throws(() => svc.cancelWorkOrder(wo.id, 'pulled', 'planner1'), /audit boom/);

    // ALL ops + WO must be unchanged. No partial cascade.
    const opStatusesAfter = ops.map((o) => repo.findOpById(o.id).status);
    assert.deepEqual(opStatusesAfter, opStatusesBefore, 'no op state change');
    assert.equal(repo.findById(wo.id).status, woStatusBefore, 'no WO status change');
  });
});
