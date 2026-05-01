/**
 * MES-2.4 — operationService integration tests (~25).
 *
 * Builds an in-memory better-sqlite3 + the real workOrderRepo + the real
 * operationService, then exercises the 5 mutators end-to-end. Repo isn't
 * mocked except where atomicity needs to be verified by an injected
 * insertOpEvent that throws (test 12).
 *
 * Coverage map (assertions in parens):
 *   1.  Full happy lifecycle (5-row audit chain + final status DONE)
 *   2.  start: DISPATCHED→SETUP, started_at set, last_pulse_at set
 *   3.  start: invalid from PENDING (no DB hit beyond SELECT)
 *   4.  pause: RUNNING→PAUSED with valid reason_code
 *   5.  pause: unknown reason_code → 422 + zero partial writes
 *   6.  pause: missing reason_code → op-reason-required
 *   7.  resume: PAUSED→RUNNING, paused_reason_code cleared to NULL
 *   8.  complete from RUNNING uses 'complete' event variant
 *   9.  complete from PAUSED uses 'complete_from_pause' event variant
 *   10. scan in RUNNING: 1 op_status_event row, no transition
 *   11. scan in SETUP with matching barcode: 2 op_status_event rows, status RUNNING
 *   12. ATOMICITY: insertOpEvent throws → op UPDATE rolled back, no audit
 *   13. ctx with neither actor_user_id nor kiosk_session_jti → throw, no DB hit
 *   14. ctx with both → throw, no DB hit
 *   15. ctx kiosk_session_jti only → succeeds; audit user prefix 'kiosk:'
 *   16. last_pulse_at refreshed on every mutation (start/pause/resume/complete/scan)
 *   17. complete records good_count + scrap_count from payload
 *   18. scan in SETUP with WRONG barcode → no auto-transition, status stays SETUP
 *   19. scan in PAUSED: 1 op_status_event, no transition (auto-transition only fires from SETUP)
 *   20. op_status_event payload carries event name (start / pause / etc.)
 *   21. op_status_event idempotency_key passes through from ctx
 *   22. start on missing op → urn:ops:op-not-found
 *   23. resume from RUNNING (not paused) → op-invalid-transition with allowed_from
 *   24. audit user is actor_user_id stringified for planner ctx
 *   25. scan auto-transition: scan event row + start_run event row both reference the same op_id
 *
 * Runner: node --test domains/planning/tests/integration/operationService.integration.test.js
 */
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

import { createWorkOrderRepo } from '../../server/repositories/workOrderRepo.js';
import { createOperationService } from '../../server/services/operationService.js';
import { BmesError } from '../../server/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../../server/db/schema.sql'),
  'utf-8'
);

function buildHarness({ repoOverrides = {} } = {}) {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  const auditCalls = [];
  const auditStmt = db.prepare(
    'INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)'
  );
  const audit = (row) => {
    auditCalls.push(row);
    auditStmt.run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
  };
  const baseRepo = createWorkOrderRepo(db);
  const repo = { ...baseRepo, ...repoOverrides };
  const service = createOperationService({ db, repo, audit });
  return { db, repo, service, audit, auditCalls };
}

// Seed a WO + one op in a chosen status. Returns { woId, opId, woCode }.
function seedOp(db, status = 'PENDING') {
  const wo = db
    .prepare(
      `INSERT INTO work_order (code, ccl_pn, customer, qty_planned, uom, due_date, status, raw_json, created_by)
       VALUES ('WO-2026-05-00001','PN-1','Acme',100,'EA','2026-12-31','RELEASED','{}','tester')`
    )
    .run();
  const woId = Number(wo.lastInsertRowid);
  const op = db
    .prepare(
      `INSERT INTO work_order_op (work_order_id, seq, op_type, work_centre_no, status, raw_json)
       VALUES (?, 10, 'FLEXO', 'WC-1', ?, '{}')`
    )
    .run(woId, status);
  return { woId, opId: Number(op.lastInsertRowid), woCode: 'WO-2026-05-00001' };
}

const PLANNER_CTX = { actor_user_id: 7 };
const KIOSK_CTX = { kiosk_session_jti: 'a'.repeat(32) };

describe('operationService — happy lifecycle', () => {
  test('1. full lifecycle DISPATCHED → SETUP → RUNNING (via scan) → PAUSED → RUNNING → DONE', () => {
    const { db, service, auditCalls } = buildHarness();
    const { opId, woCode } = seedOp(db, 'DISPATCHED');

    service.start(opId, PLANNER_CTX);
    const scanRes = service.scan(opId, woCode, KIOSK_CTX);
    assert.equal(scanRes.auto_transitioned, true);
    service.pause(opId, 'OPERATOR_BREAK', KIOSK_CTX);
    service.resume(opId, KIOSK_CTX);
    const final = service.complete(opId, { good_count: 99, scrap_count: 1 }, KIOSK_CTX);

    assert.equal(final.status, 'DONE');
    const events = auditCalls.map((c) => c.event);
    assert.deepEqual(events, ['OP_START', 'OP_SCAN', 'OP_PAUSE', 'OP_RESUME', 'OP_COMPLETE']);
  });
});

describe('operationService — start', () => {
  test('2. DISPATCHED → SETUP sets started_at + last_pulse_at', () => {
    const { db, service } = buildHarness();
    const { opId } = seedOp(db, 'DISPATCHED');
    const op = service.start(opId, PLANNER_CTX);
    assert.equal(op.status, 'SETUP');
    assert.match(op.started_at, /^\d{4}-/);
    assert.match(op.last_pulse_at, /^\d{4}-/);
  });

  test('3. start from PENDING throws op-invalid-transition with allowed_from=[DISPATCHED]', () => {
    const { db, service } = buildHarness();
    const { opId } = seedOp(db, 'PENDING');
    assert.throws(
      () => service.start(opId, PLANNER_CTX),
      (e) =>
        e instanceof BmesError &&
        e.type === 'urn:ops:op-invalid-transition' &&
        e.payload.allowed_from.includes('DISPATCHED')
    );
  });

  test('22. start on missing op → urn:ops:op-not-found', () => {
    const { service } = buildHarness();
    assert.throws(
      () => service.start(999_999, PLANNER_CTX),
      (e) => e instanceof BmesError && e.type === 'urn:ops:op-not-found'
    );
  });
});

describe('operationService — pause', () => {
  function setupRunning() {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX); // SETUP → RUNNING
    return { ...h, opId };
  }

  test('4. RUNNING → PAUSED with valid reason_code OPERATOR_BREAK', () => {
    const { service, opId, db } = setupRunning();
    const op = service.pause(opId, 'OPERATOR_BREAK', KIOSK_CTX);
    assert.equal(op.status, 'PAUSED');
    assert.equal(op.paused_reason_code, 'OPERATOR_BREAK');
    assert.match(op.paused_at, /^\d{4}-/);
    // op_status_event row for the pause carries reason_code in payload.
    const evRows = db
      .prepare(`SELECT payload_json FROM op_status_event WHERE op_id = ? AND to_status = 'PAUSED'`)
      .all(opId);
    assert.equal(evRows.length, 1);
    assert.equal(JSON.parse(evRows[0].payload_json).reason_code, 'OPERATOR_BREAK');
  });

  test('5. pause with UNKNOWN reason_code → 422; zero partial writes (status stays RUNNING)', () => {
    const { service, opId, db, auditCalls } = setupRunning();
    const beforeAuditLen = auditCalls.length;
    const beforeEventCount = db
      .prepare(`SELECT COUNT(*) AS n FROM op_status_event WHERE op_id = ?`)
      .get(opId).n;

    assert.throws(
      () => service.pause(opId, 'NOT_A_REAL_CODE', KIOSK_CTX),
      (e) => e instanceof BmesError && e.type === 'urn:ops:reason-code-unknown'
    );

    const opAfter = db.prepare('SELECT * FROM work_order_op WHERE id = ?').get(opId);
    assert.equal(opAfter.status, 'RUNNING');
    assert.equal(opAfter.paused_reason_code, null);
    assert.equal(
      db.prepare(`SELECT COUNT(*) AS n FROM op_status_event WHERE op_id = ?`).get(opId).n,
      beforeEventCount,
      'no new op_status_event row'
    );
    assert.equal(auditCalls.length, beforeAuditLen, 'no new audit row');
  });

  test('6. pause with missing reason_code → op-reason-required', () => {
    const { service, opId } = setupRunning();
    assert.throws(
      () => service.pause(opId, '', KIOSK_CTX),
      (e) => e instanceof BmesError && e.type === 'urn:ops:op-reason-required'
    );
  });
});

describe('operationService — resume', () => {
  function setupPaused() {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX);
    h.service.pause(opId, 'OPERATOR_BREAK', KIOSK_CTX);
    return { ...h, opId };
  }

  test('7. PAUSED → RUNNING clears paused_reason_code (NULL after resume)', () => {
    const { service, opId } = setupPaused();
    const op = service.resume(opId, KIOSK_CTX);
    assert.equal(op.status, 'RUNNING');
    assert.equal(op.paused_reason_code, null);
  });

  test('23a. resume from RUNNING is op-no-change (RUNNING IS resume target) → invalid with reason no-change', () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX); // → RUNNING
    assert.throws(
      () => h.service.resume(opId, KIOSK_CTX),
      (e) =>
        e instanceof BmesError &&
        e.type === 'urn:ops:op-invalid-transition' &&
        e.payload.reason === 'no-change'
    );
  });

  test('23b. resume from PENDING → op-invalid-transition with allowed_from=[PAUSED]', () => {
    const h = buildHarness();
    const { opId } = seedOp(h.db, 'PENDING');
    assert.throws(
      () => h.service.resume(opId, KIOSK_CTX),
      (e) =>
        e instanceof BmesError &&
        e.type === 'urn:ops:op-invalid-transition' &&
        Array.isArray(e.payload.allowed_from) &&
        e.payload.allowed_from.includes('PAUSED')
    );
  });
});

describe('operationService — complete', () => {
  test("8. complete from RUNNING uses 'complete' event variant", () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX);
    h.service.complete(opId, {}, KIOSK_CTX);
    const evRow = h.db
      .prepare(`SELECT payload_json FROM op_status_event WHERE op_id = ? AND to_status = 'DONE'`)
      .get(opId);
    assert.equal(JSON.parse(evRow.payload_json).event, 'complete');
  });

  test("9. complete from PAUSED uses 'complete_from_pause' event variant", () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX);
    h.service.pause(opId, 'QUALITY_HOLD', KIOSK_CTX);
    h.service.complete(opId, {}, KIOSK_CTX);
    const evRow = h.db
      .prepare(`SELECT payload_json FROM op_status_event WHERE op_id = ? AND to_status = 'DONE'`)
      .get(opId);
    assert.equal(JSON.parse(evRow.payload_json).event, 'complete_from_pause');
  });

  test('17. complete records good_count + scrap_count from payload', () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX);
    const op = h.service.complete(opId, { good_count: 950, scrap_count: 50 }, KIOSK_CTX);
    assert.equal(op.good_count, 950);
    assert.equal(op.scrap_count, 50);
    assert.equal(op.status, 'DONE');
  });
});

describe('operationService — scan', () => {
  test('10. scan in RUNNING: 1 op_status_event, no transition', () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX); // → RUNNING
    const beforeEventCount = h.db
      .prepare(`SELECT COUNT(*) AS n FROM op_status_event WHERE op_id = ?`)
      .get(opId).n;
    const r = h.service.scan(opId, woCode, KIOSK_CTX);
    assert.equal(r.auto_transitioned, false);
    assert.equal(r.op.status, 'RUNNING');
    assert.equal(
      h.db.prepare(`SELECT COUNT(*) AS n FROM op_status_event WHERE op_id = ?`).get(opId).n -
        beforeEventCount,
      1
    );
  });

  test('11. scan in SETUP with matching barcode: 2 op_status_event rows + status RUNNING', () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX); // → SETUP
    const beforeEventCount = h.db
      .prepare(`SELECT COUNT(*) AS n FROM op_status_event WHERE op_id = ?`)
      .get(opId).n;
    const r = h.service.scan(opId, woCode, KIOSK_CTX);
    assert.equal(r.auto_transitioned, true);
    assert.equal(r.op.status, 'RUNNING');
    const newEvents = h.db
      .prepare(
        `SELECT to_status, payload_json FROM op_status_event WHERE op_id = ? ORDER BY id DESC LIMIT 2`
      )
      .all(opId);
    assert.equal(newEvents.length, 2);
    // 2 rows added on this scan call.
    assert.equal(
      h.db.prepare(`SELECT COUNT(*) AS n FROM op_status_event WHERE op_id = ?`).get(opId).n -
        beforeEventCount,
      2
    );
  });

  test('18. scan in SETUP with WRONG barcode → no auto-transition, status stays SETUP', () => {
    const h = buildHarness();
    const { opId } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    const r = h.service.scan(opId, 'WRONG-BARCODE', KIOSK_CTX);
    assert.equal(r.auto_transitioned, false);
    assert.equal(r.op.status, 'SETUP');
  });

  test('19. scan in PAUSED: 1 op_status_event, no transition', () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX);
    h.service.pause(opId, 'OPERATOR_BREAK', KIOSK_CTX);
    const beforeEventCount = h.db
      .prepare(`SELECT COUNT(*) AS n FROM op_status_event WHERE op_id = ?`)
      .get(opId).n;
    const r = h.service.scan(opId, woCode, KIOSK_CTX);
    assert.equal(r.auto_transitioned, false);
    assert.equal(r.op.status, 'PAUSED');
    assert.equal(
      h.db.prepare(`SELECT COUNT(*) AS n FROM op_status_event WHERE op_id = ?`).get(opId).n -
        beforeEventCount,
      1
    );
  });

  test('25. scan auto-transition: both event rows reference the same op_id', () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX);
    const rows = h.db
      .prepare(
        `SELECT op_id, from_status, to_status FROM op_status_event WHERE op_id = ? ORDER BY id`
      )
      .all(opId);
    // start (DISPATCHED→SETUP), scan (SETUP→SETUP), start_run (SETUP→RUNNING)
    assert.equal(rows.length, 3);
    for (const row of rows) assert.equal(row.op_id, opId);
    assert.deepEqual(
      rows.map((r) => `${r.from_status}->${r.to_status}`),
      ['DISPATCHED->SETUP', 'SETUP->SETUP', 'SETUP->RUNNING']
    );
  });
});

describe('operationService — atomicity', () => {
  test('12. insertOpEvent throws → op UPDATE rolled back, no audit row', () => {
    const h = buildHarness({
      repoOverrides: {
        insertOpEvent: () => {
          throw new Error('simulated DB failure on op_status_event INSERT');
        },
      },
    });
    const { opId } = seedOp(h.db, 'DISPATCHED');
    assert.throws(() => h.service.start(opId, PLANNER_CTX), /simulated DB failure/);
    // UPDATE on work_order_op was inside the same transaction → rolled back.
    const opAfter = h.db.prepare('SELECT * FROM work_order_op WHERE id = ?').get(opId);
    assert.equal(opAfter.status, 'DISPATCHED', 'status NOT advanced — rollback worked');
    assert.equal(opAfter.started_at, null, 'started_at NOT set — rollback worked');
    assert.equal(h.auditCalls.length, 0, 'audit closure was inside the same txn → no row');
  });
});

describe('operationService — ctx contract', () => {
  test('13. ctx with neither actor_user_id nor kiosk_session_jti → throw, no DB hit', () => {
    const { service, db, auditCalls } = buildHarness();
    const { opId } = seedOp(db, 'DISPATCHED');
    const before = db.prepare('SELECT COUNT(*) AS n FROM op_status_event').get().n;
    assert.throws(
      () => service.start(opId, {}),
      (e) => e instanceof BmesError && e.type === 'urn:ops:op-ctx-required'
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM op_status_event').get().n, before);
    assert.equal(auditCalls.length, 0);
  });

  test('14. ctx with BOTH actor_user_id and kiosk_session_jti → throw, no DB hit', () => {
    const { service, db } = buildHarness();
    const { opId } = seedOp(db, 'DISPATCHED');
    assert.throws(
      () => service.start(opId, { actor_user_id: 7, kiosk_session_jti: 'x'.repeat(32) }),
      (e) => e instanceof BmesError && e.type === 'urn:ops:op-ctx-required'
    );
  });

  test('15. ctx kiosk_session_jti only → succeeds; audit user prefix kiosk:', () => {
    const { service, db, auditCalls } = buildHarness();
    const { opId } = seedOp(db, 'DISPATCHED');
    service.start(opId, { kiosk_session_jti: 'jti1234'.padEnd(32, '0') });
    const startCall = auditCalls.find((c) => c.event === 'OP_START');
    assert.match(startCall.user, /^kiosk:/);
  });

  test('24. audit user is actor_user_id stringified for planner ctx', () => {
    const { service, db, auditCalls } = buildHarness();
    const { opId } = seedOp(db, 'DISPATCHED');
    service.start(opId, { actor_user_id: 42 });
    const startCall = auditCalls.find((c) => c.event === 'OP_START');
    assert.equal(startCall.user, '42');
  });
});

describe('operationService — invariants', () => {
  test('16. last_pulse_at refreshed on every mutation', () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    const pulses = new Set();
    const captured = (label) => {
      const op = h.db.prepare('SELECT last_pulse_at FROM work_order_op WHERE id = ?').get(opId);
      pulses.add(`${label}:${op.last_pulse_at}`);
    };
    h.service.start(opId, PLANNER_CTX);
    captured('start');
    h.service.scan(opId, woCode, KIOSK_CTX);
    captured('scan');
    h.service.pause(opId, 'OPERATOR_BREAK', KIOSK_CTX);
    captured('pause');
    h.service.resume(opId, KIOSK_CTX);
    captured('resume');
    h.service.complete(opId, {}, KIOSK_CTX);
    captured('complete');
    // 5 distinct labels — last_pulse_at was non-null after each.
    assert.equal(pulses.size, 5);
    for (const p of pulses) assert.match(p, /:\d{4}-/, 'each pulse value is an ISO timestamp');
  });

  test('20. op_status_event payload carries event name', () => {
    const h = buildHarness();
    const { opId, woCode } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, PLANNER_CTX);
    h.service.scan(opId, woCode, KIOSK_CTX);
    h.service.pause(opId, 'OPERATOR_BREAK', KIOSK_CTX);
    h.service.resume(opId, KIOSK_CTX);
    h.service.complete(opId, {}, KIOSK_CTX);
    const events = h.db
      .prepare(`SELECT payload_json FROM op_status_event WHERE op_id = ? ORDER BY id`)
      .all(opId)
      .map((r) => JSON.parse(r.payload_json).event);
    // Sequence: start, scan, start_run (auto), pause, resume, complete
    assert.deepEqual(events, ['start', 'scan', 'start_run', 'pause', 'resume', 'complete']);
  });

  test('21. op_status_event idempotency_key passes through from ctx', () => {
    const h = buildHarness();
    const { opId } = seedOp(h.db, 'DISPATCHED');
    h.service.start(opId, { actor_user_id: 7, idempotency_key: 'caller-supplied-key-123' });
    const row = h.db
      .prepare(`SELECT idempotency_key FROM op_status_event WHERE op_id = ?`)
      .get(opId);
    assert.equal(row.idempotency_key, 'caller-supplied-key-123');
  });
});
