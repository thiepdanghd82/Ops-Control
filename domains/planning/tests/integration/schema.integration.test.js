/**
 * MES-1 schema bootstrap tests — ACs 1.1.1 through 1.1.8.
 *
 * Runner:
 *   node --test domains/planning/tests/integration/schema.integration.test.js
 *
 * Each test runs against a temporary SQLite file at $TMPDIR. The DB is
 * recreated per test via _resetForTests() so CHECK-constraint failures
 * don't leak state between cases.
 */
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as connection from '../../../../server/db/connection.js';
import { initSchema } from '../../../../server/db/init.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

let tmpDir;

function freshDb() {
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mes1-schema-'));
  process.env.OPS_DB_PATH = path.join(tmpDir, 'ops.db');
  return initSchema();
}

const validWorkOrderRow = (overrides = {}) => ({
  code: 'WO-2026-04-00001',
  ccl_pn: 'PN-1',
  customer: 'Acme',
  qty_planned: 100,
  uom: 'EA',
  priority: 5,
  due_date: '2026-05-30',
  status: 'CREATED',
  raw_json: '{}',
  created_by: 'tester',
  ...overrides,
});

function insertWO(db, overrides = {}) {
  const r = validWorkOrderRow(overrides);
  db.prepare(
    `INSERT INTO work_order
      (code, ccl_pn, customer, qty_planned, uom, priority,
       due_date, status, raw_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    r.code,
    r.ccl_pn,
    r.customer,
    r.qty_planned,
    r.uom,
    r.priority,
    r.due_date,
    r.status,
    r.raw_json,
    r.created_by
  );
}

function insertWOOp(db, woId, overrides = {}) {
  const row = {
    seq: 10,
    op_type: 'FLEXO',
    work_centre_no: 'WC-FX-01',
    status: 'PENDING',
    raw_json: '{}',
    ...overrides,
  };
  db.prepare(
    `INSERT INTO work_order_op
      (work_order_id, seq, op_type, work_centre_no, status, raw_json)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(woId, row.seq, row.op_type, row.work_centre_no, row.status, row.raw_json);
}

after(() => {
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('MES-1 schema bootstrap', () => {
  describe('tables and indexes are present', () => {
    test('AC-1.1.1 — work_order + work_order_op tables exist', () => {
      const db = freshDb();
      const tables = db
        .prepare(
          `SELECT name FROM sqlite_master
          WHERE type='table' AND name IN ('work_order','work_order_op')
          ORDER BY name`
        )
        .all()
        .map((r) => r.name);
      assert.deepEqual(tables, ['work_order', 'work_order_op']);
    });

    test('AC-1.1.7 — all 5 expected indexes exist', () => {
      const db = freshDb();
      const expected = [
        'idx_wo_status',
        'idx_wo_pn',
        'idx_wo_customer',
        'idx_woop_status',
        'idx_woop_wc',
      ];
      const placeholders = expected.map(() => '?').join(',');
      const present = db
        .prepare(
          `SELECT name FROM sqlite_master
          WHERE type='index' AND name IN (${placeholders})
          ORDER BY name`
        )
        .all(...expected)
        .map((r) => r.name);
      assert.deepEqual(present.sort(), [...expected].sort());
    });
  });

  describe('CHECK constraints reject bogus rows', () => {
    test('AC-1.1.2 — work_order status="BOGUS" raises CHECK', () => {
      const db = freshDb();
      assert.throws(
        () => insertWO(db, { code: 'WO-1', status: 'BOGUS' }),
        /CHECK constraint failed/
      );
    });

    test('AC-1.1.3 — work_order_op op_type="UNKNOWN" raises CHECK', () => {
      const db = freshDb();
      insertWO(db, { code: 'WO-A' });
      const wo = db.prepare(`SELECT id FROM work_order WHERE code='WO-A'`).get();
      assert.throws(() => insertWOOp(db, wo.id, { op_type: 'UNKNOWN' }), /CHECK constraint failed/);
    });

    test('AC-1.1.4 — work_order priority=10 raises CHECK', () => {
      const db = freshDb();
      assert.throws(() => insertWO(db, { code: 'WO-2', priority: 10 }), /CHECK constraint failed/);
    });

    test('AC-1.1.4 — work_order priority=0 raises CHECK', () => {
      const db = freshDb();
      assert.throws(() => insertWO(db, { code: 'WO-3', priority: 0 }), /CHECK constraint failed/);
    });
  });

  describe('re-running schema.sql is idempotent', () => {
    test('AC-1.1.5 — initSchema twice on same DB preserves state', () => {
      const db = freshDb();
      insertWO(db, { code: 'WO-IDEM' });

      const beforeRows = db.prepare(`SELECT COUNT(*) AS n FROM work_order`).get().n;
      const beforeTables = db
        .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`)
        .get().n;

      initSchema(); // second run on the same DB

      const afterRows = db.prepare(`SELECT COUNT(*) AS n FROM work_order`).get().n;
      const afterTables = db
        .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`)
        .get().n;

      assert.equal(afterRows, beforeRows, 'data preserved across re-run');
      assert.equal(afterTables, beforeTables, 'table count unchanged');
    });
  });

  describe('_migration_state row is registered', () => {
    test('AC-1.1.6 — row {dataset:"work_order", mode:"sqlite"} present', () => {
      const db = freshDb();
      const row = db
        .prepare(`SELECT dataset, mode FROM _migration_state WHERE dataset='work_order'`)
        .get();
      assert.deepEqual(row, { dataset: 'work_order', mode: 'sqlite' });
    });
  });

  describe('standalone migration file mirror', () => {
    test('AC-1.1.8 — scripts/migrations/2026-04-30-mes-1-work-order.sql is present + has DOWN annotation', () => {
      const file = path.join(REPO_ROOT, 'scripts/migrations/2026-04-30-mes-1-work-order.sql');
      assert.ok(fs.existsSync(file), 'standalone migration file exists');
      const contents = fs.readFileSync(file, 'utf-8');
      assert.match(contents, /CREATE TABLE IF NOT EXISTS work_order\b/);
      assert.match(contents, /CREATE TABLE IF NOT EXISTS work_order_op\b/);
      assert.match(contents, /-- DOWN \(manual\):/);
      assert.match(contents, /INSERT OR IGNORE INTO _migration_state/);
    });
  });
});
