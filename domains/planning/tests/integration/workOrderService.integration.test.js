/**
 * MES-1.3 — workOrderService integration tests.
 *
 * In-memory better-sqlite3 + factory-DI'd repo + codeGen + audit. Covers
 * lifecycle, atomicity (audit failure rolls back status), release pre-
 * conditions, terminal-state guards, list filters, PATCH forbidden-fields,
 * and audit event-detail shapes (5 codes from PRD §9).
 *
 * Runner:
 *   node --test domains/planning/tests/integration/workOrderService.integration.test.js
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { createWorkOrderRepo } from '../../server/repositories/workOrderRepo.js';
import { createWoCodeGenerator } from '../../server/services/woCodeGenerator.js';
import { createWorkOrderService } from '../../server/services/workOrderService.js';
import { BmesError } from '../../server/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../server/db/schema.sql'),
  'utf-8'
);

function setup({ auditOverride } = {}) {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  const repo = createWorkOrderRepo(db);
  const codeGen = createWoCodeGenerator(db);
  const auditCalls = [];
  const realAudit = (row) => {
    auditCalls.push(row);
    db.prepare('INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)').run(
      row.ts,
      row.event,
      row.user || '-',
      row.ip || '-',
      row.detail || ''
    );
  };
  const audit = auditOverride || realAudit;
  const svc = createWorkOrderService({ db, repo, codeGen, audit });
  return { db, repo, codeGen, svc, auditCalls };
}

const VALID_INPUT = (overrides = {}) => ({
  ccl_pn: 'PN-1',
  customer: 'Acme',
  qty_planned: 100,
  uom: 'EA',
  due_date: '2026-06-30',
  ...overrides,
});

const VALID_OP = (overrides = {}) => ({
  op_type: 'FLEXO',
  work_centre_no: 'WC-FX-01',
  ...overrides,
});

describe('WorkOrderService — happy-path lifecycle', () => {
  test('AC-1.3.1, 1.3.2, 1.3.8 — create → addOp → release → audit trail intact', () => {
    const { db, svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    assert.match(wo.code, /^WO-\d{4}-\d{2}-\d{5}$/);
    assert.equal(wo.status, 'CREATED');
    assert.equal(wo.created_by, 'planner1');

    const op = svc.attachOperation(wo.id, VALID_OP(), 'planner1');
    assert.equal(op.work_order_id, wo.id);
    assert.equal(op.seq, 10);
    assert.equal(op.op_type, 'FLEXO');
    assert.equal(op.status, 'PENDING');

    const released = svc.releaseWorkOrder(wo.id, 'planner1', 'go');
    assert.equal(released.status, 'RELEASED');
    assert.ok(released.released_at);

    const audits = db
      .prepare("SELECT event, user, detail FROM audit_log WHERE event LIKE 'WO_%' ORDER BY id ASC")
      .all();
    assert.deepEqual(
      audits.map((a) => a.event),
      ['WO_CREATE', 'WO_OP_ADD', 'WO_RELEASE']
    );
    for (const a of audits) assert.equal(a.user, 'planner1');

    const create = JSON.parse(audits[0].detail);
    assert.equal(create.wo_id, wo.id);
    assert.equal(create.code, wo.code);
    assert.equal(create.ccl_pn, 'PN-1');

    const release = JSON.parse(audits[2].detail);
    assert.equal(release.from, 'CREATED');
    assert.equal(release.to, 'RELEASED');
    assert.equal(release.ops_count, 1);
    assert.equal(release.notes, 'go');
  });

  test('AC-1.3.8 — WO_CANCEL audit detail carries reason', () => {
    const { db, svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    svc.cancelWorkOrder(wo.id, 'customer pulled order', 'planner1');
    const cancel = db.prepare("SELECT detail FROM audit_log WHERE event='WO_CANCEL'").get();
    const detail = JSON.parse(cancel.detail);
    assert.equal(detail.reason, 'customer pulled order');
    assert.equal(detail.from, 'CREATED');
    assert.equal(detail.to, 'CANCELLED');
  });

  test('AC-1.3.8 — WO_UPDATE audit detail carries before/after diff', () => {
    const { db, svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT({ priority: 5 }), 'planner1');
    svc.updateHeader(wo.id, { priority: 8, customer: 'Acme Corp' }, 'planner1');
    const upd = db.prepare("SELECT detail FROM audit_log WHERE event='WO_UPDATE'").get();
    const detail = JSON.parse(upd.detail);
    assert.deepEqual(detail.changes.priority, { from: 5, to: 8 });
    assert.deepEqual(detail.changes.customer, { from: 'Acme', to: 'Acme Corp' });
  });
});

describe('WorkOrderService — atomicity (AC-1.3.3)', () => {
  test('audit insert failure rolls back the status update', () => {
    let firstCall = true;
    const auditOverride = (row) => {
      // Allow the WO_CREATE + WO_OP_ADD writes to succeed; only fail on WO_RELEASE.
      if (row.event === 'WO_RELEASE') throw new Error('audit boom');
      // Mirror the realAudit's SQL insert so create/addOp see audit_log rows.
      // We capture the db handle from a closure below.
      auditCallsBoom.push(row);
      dbBoom
        .prepare('INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)')
        .run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
      // suppress unused
      void firstCall;
    };
    const auditCallsBoom = [];
    const harness = setup({ auditOverride });
    const dbBoom = harness.db;

    const wo = harness.svc.createWorkOrder(VALID_INPUT(), 'planner1');
    harness.svc.attachOperation(wo.id, VALID_OP(), 'planner1');

    const before = harness.repo.findById(wo.id);
    const auditCountBefore = dbBoom.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;

    assert.throws(() => harness.svc.releaseWorkOrder(wo.id, 'planner1'), /audit boom/);

    const after = harness.repo.findById(wo.id);
    const auditCountAfter = dbBoom.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;

    assert.equal(after.status, before.status, 'WO status must be unchanged');
    assert.equal(after.released_at, before.released_at, 'released_at must be unchanged');
    assert.equal(auditCountAfter, auditCountBefore, 'no orphan audit_log row written');
  });
});

describe('WorkOrderService — release pre-condition (AC-1.3.4)', () => {
  test('release on WO with 0 ops throws wo-no-operations BEFORE mutation', () => {
    const { svc, repo, db } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    const auditCountBefore = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;

    let err;
    try {
      svc.releaseWorkOrder(wo.id, 'planner1');
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof BmesError);
    assert.equal(err.type, 'urn:ops:wo-no-operations');

    const after = repo.findById(wo.id);
    assert.equal(after.status, 'CREATED', 'status unchanged on pre-condition fail');
    const auditCountAfter = db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n;
    assert.equal(auditCountAfter, auditCountBefore, 'no audit row on pre-condition fail');
  });

  test('release succeeds once an op is attached', () => {
    const { svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    svc.attachOperation(wo.id, VALID_OP(), 'planner1');
    const released = svc.releaseWorkOrder(wo.id, 'planner1');
    assert.equal(released.status, 'RELEASED');
  });
});

describe('WorkOrderService — terminal-state guards (AC-1.3.9)', () => {
  test('cancel on COMPLETED WO throws wo-invalid-transition with allowed_from of 5', () => {
    const { svc, repo } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    svc.attachOperation(wo.id, VALID_OP(), 'planner1');
    // Push the WO through to COMPLETED via direct repo updates (no shop-floor
    // endpoints in MES-1) — we only need to land it in COMPLETED for the guard.
    repo.updateStatus(wo.id, 'RELEASED', new Date().toISOString());
    repo.updateStatus(wo.id, 'SCHEDULED', new Date().toISOString());
    repo.updateStatus(wo.id, 'IN_PROGRESS', new Date().toISOString());
    repo.updateStatus(wo.id, 'COMPLETED', new Date().toISOString());

    let err;
    try {
      svc.cancelWorkOrder(wo.id, 'too late', 'planner1');
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof BmesError, 'expected BmesError');
    assert.equal(err.type, 'urn:ops:wo-invalid-transition');
    assert.equal(err.payload.from, 'COMPLETED');
    assert.equal(err.payload.to, 'CANCELLED');
    assert.deepEqual([...err.payload.allowed_from].sort(), [
      'CREATED',
      'IN_PROGRESS',
      'ON_HOLD',
      'RELEASED',
      'SCHEDULED',
    ]);
  });

  test('updateHeader on CANCELLED WO throws wo-terminal-edit', () => {
    const { svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    svc.cancelWorkOrder(wo.id, 'oops', 'planner1');

    let err;
    try {
      svc.updateHeader(wo.id, { customer: 'Beta' }, 'planner1');
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof BmesError);
    assert.equal(err.type, 'urn:ops:wo-terminal-edit');
    assert.equal(err.payload.status, 'CANCELLED');
  });

  test('attachOperation on CANCELLED WO throws wo-terminal-edit', () => {
    const { svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    svc.cancelWorkOrder(wo.id, 'oops', 'planner1');

    assert.throws(
      () => svc.attachOperation(wo.id, VALID_OP(), 'planner1'),
      (e) => e instanceof BmesError && e.type === 'urn:ops:wo-terminal-edit'
    );
  });
});

describe('WorkOrderService — list filters (AC-1.3.7)', () => {
  test('list({status:RELEASED}) returns only RELEASED + correct total', () => {
    const { svc, repo } = setup();
    // Seed: 5 WOs across statuses
    const created = [];
    for (let i = 0; i < 5; i++) {
      const wo = svc.createWorkOrder(VALID_INPUT({ ccl_pn: `PN-${i}` }), 'planner1');
      created.push(wo);
    }
    // 2 released, 1 cancelled, 2 stay CREATED
    svc.attachOperation(created[0].id, VALID_OP(), 'planner1');
    svc.releaseWorkOrder(created[0].id, 'planner1');
    svc.attachOperation(created[1].id, VALID_OP(), 'planner1');
    svc.releaseWorkOrder(created[1].id, 'planner1');
    svc.cancelWorkOrder(created[2].id, 'oops', 'planner1');

    const released = svc.listWorkOrders({ status: 'RELEASED' });
    assert.equal(released.total, 2);
    assert.equal(released.items.length, 2);
    for (const item of released.items) assert.equal(item.status, 'RELEASED');

    const all = svc.listWorkOrders({});
    assert.equal(all.total, 5);
    assert.equal(all.limit, 50);
    assert.equal(all.offset, 0);

    // operations_count exposed on list rows
    const released0 = released.items.find((r) => r.id === created[0].id);
    assert.equal(released0.operations_count, 1);

    // sanity: repo + svc totals agree
    assert.equal(repo.list({ status: 'RELEASED' }).total, 2);
  });

  test("list with q='Acme' matches customer LIKE", () => {
    const { svc } = setup();
    svc.createWorkOrder(VALID_INPUT({ customer: 'Acme' }), 'planner1');
    svc.createWorkOrder(VALID_INPUT({ customer: 'Beta Inc' }), 'planner1');
    const r = svc.listWorkOrders({ q: 'Acme' });
    assert.equal(r.total, 1);
    assert.equal(r.items[0].customer, 'Acme');
  });
});

describe('WorkOrderService — forbidden-fields PATCH guard', () => {
  test("updateHeader({status:'X'}) → wo-forbidden-fields", () => {
    const { svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    let err;
    try {
      svc.updateHeader(wo.id, { status: 'RELEASED' }, 'planner1');
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof BmesError);
    assert.equal(err.type, 'urn:ops:wo-forbidden-fields');
    assert.deepEqual(err.payload.forbidden_fields, ['status']);
  });

  test('updateHeader rejects multiple forbidden fields together', () => {
    const { svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    let err;
    try {
      svc.updateHeader(wo.id, { code: 'FAKE', qty_completed: 99 }, 'planner1');
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof BmesError);
    assert.deepEqual([...err.payload.forbidden_fields].sort(), ['code', 'qty_completed']);
  });
});

describe('WorkOrderService — cancel reason validation', () => {
  test('cancel without reason throws wo-reason-required', () => {
    const { svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    assert.throws(
      () => svc.cancelWorkOrder(wo.id, '', 'planner1'),
      (e) => e instanceof BmesError && e.type === 'urn:ops:wo-reason-required'
    );
    assert.throws(
      () => svc.cancelWorkOrder(wo.id, undefined, 'planner1'),
      (e) => e instanceof BmesError && e.type === 'urn:ops:wo-reason-required'
    );
  });

  test('cancel with >500-char reason throws wo-reason-required', () => {
    const { svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    assert.throws(
      () => svc.cancelWorkOrder(wo.id, 'x'.repeat(501), 'planner1'),
      (e) => e instanceof BmesError && e.type === 'urn:ops:wo-reason-required'
    );
  });
});

describe('WorkOrderService — code-collision guard', () => {
  test('explicit duplicate code throws wo-code-collision', () => {
    const { svc } = setup();
    const code = 'WO-2026-05-99999';
    svc.createWorkOrder(VALID_INPUT({ code }), 'planner1');
    assert.throws(
      () => svc.createWorkOrder(VALID_INPUT({ code }), 'planner1'),
      (e) => e instanceof BmesError && e.type === 'urn:ops:wo-code-collision'
    );
  });
});

describe('WorkOrderService — getDetail', () => {
  test('returns header + operations sorted by seq asc', () => {
    const { svc } = setup();
    const wo = svc.createWorkOrder(VALID_INPUT(), 'planner1');
    svc.attachOperation(wo.id, VALID_OP({ seq: 30 }), 'planner1');
    svc.attachOperation(wo.id, VALID_OP({ seq: 10, op_type: 'PRE_PRESS' }), 'planner1');
    svc.attachOperation(wo.id, VALID_OP({ seq: 20, op_type: 'DIE_CUT_ROTARY' }), 'planner1');
    const detail = svc.getDetail(wo.id);
    assert.equal(detail.id, wo.id);
    assert.deepEqual(
      detail.operations.map((o) => o.seq),
      [10, 20, 30]
    );
  });

  test('getDetail on missing id throws wo-not-found', () => {
    const { svc } = setup();
    assert.throws(
      () => svc.getDetail(99999),
      (e) => e instanceof BmesError && e.type === 'urn:ops:wo-not-found'
    );
  });
});
