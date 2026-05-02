// Idempotent demo-data seeder for MES UI verify scenarios.
// Lands two work orders with full lifecycle audit so a developer can run
// `npm run dev` then `npm run seed:mes` and walk through the MES audit
// timeline + Accept-button flows without manual data entry.
//
// Idempotency: skip whole WO if its `code` already exists. Re-running
// is safe; operator-edited fixtures survive untouched.
//
// Target DB resolution:
//   1. OPS_DB_PATH env var (explicit override)
//   2. DATA_DIR env var (matches dev:server resolution)
//   3. Default: ~/Library/Application Support/ops-control-desktop/data/ops.db
//      (the Electron user-data path the desktop app uses at runtime)
import path from 'path';
import os from 'os';
import fs from 'fs';

import { initSchema } from '../server/db/init.js';
import { getDb, _resetForTests } from '../server/db/connection.js';
import { mountPlanning as _mountPlanningTouch } from '../domains/planning/server/index.js';
import { createWorkOrderRepo } from '../domains/planning/server/repositories/workOrderRepo.js';
import { createWoCodeGenerator } from '../domains/planning/server/services/woCodeGenerator.js';
import { createWorkOrderService } from '../domains/planning/server/services/workOrderService.js';
import { createOperationService } from '../domains/planning/server/services/operationService.js';

void _mountPlanningTouch; // import-only to ensure schema-init parity if mountPlanning ever adds tables

const FIXTURES = [
  {
    code: 'WO-TEST-707779',
    customer: 'Beta Verify Co',
    ccl_pn: 'PN-TEST-V11',
    qty_planned: 250,
    uom: 'EA',
    due_date: '2026-12-31',
    op: { seq: 10, op_type: 'FLEXO', work_centre_no: 'gallus-em340' },
    finalOpStatus: 'DONE',
  },
  {
    code: 'WO-DEMO-703607',
    customer: 'Acme Demo Customer',
    ccl_pn: 'PN-DEMO-001',
    qty_planned: 500,
    uom: 'EA',
    due_date: '2026-12-31',
    op: { seq: 10, op_type: 'FLEXO', work_centre_no: 'brotech-bw350' },
    finalOpStatus: 'ACCEPTED',
  },
];

function resolveDbPath() {
  if (process.env.OPS_DB_PATH) return path.resolve(process.env.OPS_DB_PATH);
  if (process.env.DATA_DIR) return path.join(path.resolve(process.env.DATA_DIR), 'ops.db');
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'ops-control-desktop',
    'data',
    'ops.db'
  );
}

function buildAudit(db) {
  const stmt = db.prepare(
    'INSERT INTO audit_log (ts, event, user, ip, detail) VALUES (?, ?, ?, ?, ?)'
  );
  return (row) => stmt.run(row.ts, row.event, row.user || '-', row.ip || '-', row.detail || '');
}

function seedOne(fixture, { db, repo, woService, opService }) {
  const existing = db.prepare('SELECT id, status FROM work_order WHERE code = ?').get(fixture.code);
  if (existing) {
    return { code: fixture.code, action: 'skipped', wo_id: existing.id, status: existing.status };
  }

  // Run the entire lifecycle inside one transaction so a partial-write
  // failure can't leave a half-seeded WO. Each service call is itself
  // transactional, but better-sqlite3 nests transactions as savepoints,
  // so wrapping the whole sequence preserves atomicity at fixture grain.
  const created = db.transaction(() => {
    const wo = woService.createWorkOrder(
      {
        code: fixture.code,
        ccl_pn: fixture.ccl_pn,
        customer: fixture.customer,
        qty_planned: fixture.qty_planned,
        uom: fixture.uom,
        due_date: fixture.due_date,
      },
      'seed:mes-fixtures'
    );

    const op = woService.attachOperation(
      wo.id,
      {
        op_type: fixture.op.op_type,
        work_centre_no: fixture.op.work_centre_no,
        seq: fixture.op.seq,
      },
      'seed:mes-fixtures'
    );

    woService.releaseWorkOrder(wo.id, 'seed:mes-fixtures');

    // PENDING → DISPATCHED has no service method (planner dispatch flow
    // is unimplemented; ops auto-listed at PENDING by the kiosk dispatch
    // endpoint). Service layer can't produce DISPATCHED, so we update
    // raw — schema CHECK on `status` still validates the literal.
    repo.updateOpStatus(op.id, 'DISPATCHED', {}, new Date().toISOString());

    const kioskCtx = { kiosk_session_jti: 'seed:mes-fixtures' };
    opService.start(op.id, kioskCtx); // OP_START
    opService.scan(op.id, fixture.code, kioskCtx); // OP_SCAN + auto SETUP→RUNNING
    opService.pause(op.id, 'OPERATOR_BREAK', kioskCtx); // OP_PAUSE
    opService.resume(op.id, kioskCtx); // OP_RESUME
    opService.complete(op.id, { good_count: fixture.qty_planned, scrap_count: 0 }, kioskCtx); // OP_COMPLETE

    if (fixture.finalOpStatus === 'ACCEPTED') {
      // Planner sign-off context — actor_user_id 0 = system seed
      opService.accept(op.id, { actor_user_id: 0 }); // OP_ACCEPT
    }

    return { wo_id: wo.id, op_id: op.id };
  })();

  return { code: fixture.code, action: 'created', ...created, status: fixture.finalOpStatus };
}

function main() {
  const dbPath = resolveDbPath();
  console.log(`[seed:mes] target DB: ${dbPath}`);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  process.env.OPS_DB_PATH = dbPath;
  _resetForTests();
  initSchema();
  const db = getDb();

  const repo = createWorkOrderRepo(db);
  const codeGen = createWoCodeGenerator(db);
  const audit = buildAudit(db);
  const woService = createWorkOrderService({ db, repo, codeGen, audit });
  const opService = createOperationService({ db, repo, audit });

  const results = [];
  for (const f of FIXTURES) {
    const r = seedOne(f, { db, repo, woService, opService });
    results.push(r);
    if (r.action === 'created') {
      console.log(
        `[seed:mes] ${r.code}: created (wo_id=${r.wo_id}, op_id=${r.op_id}, op=${r.status})`
      );
    } else {
      console.log(
        `[seed:mes] ${r.code}: already present, skipped (wo_id=${r.wo_id}, wo=${r.status})`
      );
    }
  }

  // Verify after write — fail fast if anything didn't take.
  console.log('\n[seed:mes] verify:');
  const summary = db
    .prepare(
      `SELECT wo.code AS wo_code, wo.status AS wo_status,
              op.id AS op_id, op.status AS op_status
         FROM work_order wo
         JOIN work_order_op op ON op.work_order_id = wo.id
        WHERE wo.code IN (?, ?)
        ORDER BY wo.id`
    )
    .all('WO-TEST-707779', 'WO-DEMO-703607');

  if (summary.length !== 2) {
    console.error(`[seed:mes] FAIL: expected 2 WO+op rows, got ${summary.length}`);
    process.exit(1);
  }

  const auditCountStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM audit_log
      WHERE json_valid(detail)
        AND CAST(json_extract(detail, '$.op_id') AS INTEGER) = ?`
  );
  for (const row of summary) {
    const auditCount = auditCountStmt.get(row.op_id).n;
    console.log(
      `  ${row.wo_code}: wo=${row.wo_status}, op=${row.op_status}, audit_rows_for_op=${auditCount}`
    );
  }

  // Sanity: WO-TEST-707779 should expose ≥5 OP_* events (start/scan/pause/
  // resume/complete); WO-DEMO-703607 should expose ≥6 (above + accept).
  // Existing rows from prior sessions count too — we don't delete history.
  const expected = {
    'WO-TEST-707779': { op_status: 'DONE', min_audit: 5 },
    'WO-DEMO-703607': { op_status: 'ACCEPTED', min_audit: 6 },
  };
  for (const row of summary) {
    const ex = expected[row.wo_code];
    if (!ex) continue;
    if (row.op_status !== ex.op_status) {
      console.error(
        `[seed:mes] FAIL: ${row.wo_code} op_status=${row.op_status}, expected ${ex.op_status}`
      );
      process.exit(1);
    }
    const auditCount = auditCountStmt.get(row.op_id).n;
    if (auditCount < ex.min_audit) {
      console.error(
        `[seed:mes] FAIL: ${row.wo_code} audit_rows_for_op=${auditCount}, expected ≥${ex.min_audit}`
      );
      process.exit(1);
    }
  }

  console.log('\n[seed:mes] OK');
  db.close();
}

main();
