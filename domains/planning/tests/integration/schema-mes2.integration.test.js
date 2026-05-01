/**
 * MES-2.1 schema bootstrap tests — ACs 2.1.1 through 2.1.5 (+ supporting
 * ACs that don't have explicit IDs in the PRD: reason_code seed shape,
 * idempotent-rerun, _migration_state row).
 *
 * Runner:
 *   node --test domains/planning/tests/integration/schema-mes2.integration.test.js
 *
 * Each test runs against a fresh SQLite file at $TMPDIR. The DB is
 * recreated via _resetForTests() so per-test state cannot leak.
 */
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as connection from '../../../../server/db/connection.js';
import { initSchema } from '../../../../server/db/init.js';
import {
  DEFAULT_REASON_CODES,
  seedReasonCodes,
  validateReasonCodeIntegrity,
} from '../../server/seedReasonCodes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

let tmpDir;

function freshDb() {
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-mes2-schema-'));
  process.env.OPS_DB_PATH = path.join(tmpDir, 'ops.db');
  return initSchema();
}

after(() => {
  connection._resetForTests();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('MES-2.1 schema bootstrap', () => {
  describe('AC-2.1.1 — work_order_op extensions', () => {
    test('6 new TEXT columns present + nullable', () => {
      const db = freshDb();
      const cols = db
        .prepare("SELECT name, type, [notnull] AS nn FROM pragma_table_info('work_order_op')")
        .all();
      const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
      for (const col of [
        'started_at',
        'paused_at',
        'paused_reason_code',
        'completed_at',
        'accepted_at',
        'last_pulse_at',
      ]) {
        assert.ok(byName[col], `column ${col} present`);
        assert.equal(byName[col].type, 'TEXT', `column ${col} is TEXT`);
        assert.equal(byName[col].nn, 0, `column ${col} is nullable`);
      }
    });

    test('paused_reason_code has no SQL-level FK (validated at service layer)', () => {
      const db = freshDb();
      const fks = db.prepare("SELECT * FROM pragma_foreign_key_list('work_order_op')").all();
      const pausedFk = fks.find((f) => f.from === 'paused_reason_code');
      assert.equal(pausedFk, undefined, 'no FK on paused_reason_code per Lesson 13');
    });
  });

  describe('AC-2.1.2 — reason_code seed', () => {
    test('8 default codes seeded with EN+VN labels', () => {
      const db = freshDb();
      const rows = db
        .prepare(
          'SELECT code, label_en, label_vn, category, sort_order FROM reason_code ORDER BY sort_order'
        )
        .all();
      assert.equal(rows.length, 8, '8 rows seeded');
      const codes = rows.map((r) => r.code);
      assert.deepEqual(codes, [
        'MACHINE_DOWN',
        'MATERIAL_SHORT',
        'OPERATOR_BREAK',
        'QUALITY_HOLD',
        'SETUP_CHANGEOVER',
        'SHIFT_END',
        'MAINTENANCE_PLANNED',
        'OTHER',
      ]);
      for (const r of rows) {
        assert.ok(r.label_en && r.label_en.trim().length > 0, `${r.code} label_en non-empty`);
        assert.ok(r.label_vn && r.label_vn.trim().length > 0, `${r.code} label_vn non-empty`);
      }
    });

    test('category CHECK rejects bogus value', () => {
      const db = freshDb();
      assert.throws(
        () =>
          db
            .prepare(
              `INSERT INTO reason_code (code, label_en, label_vn, category)
               VALUES ('BOGUS','x','y','garbage')`
            )
            .run(),
        /CHECK constraint failed/
      );
    });

    test('default seed list shape matches schema.sql exactly', () => {
      const db = freshDb();
      const rows = db
        .prepare(
          'SELECT code, label_en, label_vn, category, sort_order FROM reason_code ORDER BY sort_order, code'
        )
        .all();
      const expected = [...DEFAULT_REASON_CODES]
        .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
        .map((r) => ({
          code: r.code,
          label_en: r.label_en,
          label_vn: r.label_vn,
          category: r.category,
          sort_order: r.sort_order,
        }));
      assert.deepEqual(rows, expected);
    });
  });

  describe('AC-2.1.3 — kiosk_pairing table', () => {
    test('required columns + 2 indexes present', () => {
      const db = freshDb();
      const cols = new Set(
        db
          .prepare("SELECT name FROM pragma_table_info('kiosk_pairing')")
          .all()
          .map((r) => r.name)
      );
      for (const c of [
        'id',
        'token_hash',
        'machine_code',
        'issued_by_user_id',
        'issued_at_utc',
        'expires_at_utc',
        'redeemed_at_utc',
        'revoked_at_utc',
        'session_jti',
        'last_seen_at_utc',
      ]) {
        assert.ok(cols.has(c), `kiosk_pairing.${c} present`);
      }
      const indexes = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type='index' AND tbl_name='kiosk_pairing'
             AND name IN ('idx_kiosk_pairing_machine','idx_kiosk_pairing_jti')`
        )
        .all()
        .map((r) => r.name)
        .sort();
      assert.deepEqual(indexes, ['idx_kiosk_pairing_jti', 'idx_kiosk_pairing_machine']);
    });

    test('token_hash is UNIQUE', () => {
      const db = freshDb();
      const insert = db.prepare(
        `INSERT INTO kiosk_pairing (token_hash, machine_code, issued_by_user_id, issued_at_utc, expires_at_utc)
         VALUES (?, ?, 1, '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z')`
      );
      insert.run('hash-a', 'M1');
      assert.throws(() => insert.run('hash-a', 'M2'), /UNIQUE constraint failed/);
    });
  });

  describe('AC-2.1.4 — op_status_event table', () => {
    test('required columns + 2 indexes present', () => {
      const db = freshDb();
      const cols = new Set(
        db
          .prepare("SELECT name FROM pragma_table_info('op_status_event')")
          .all()
          .map((r) => r.name)
      );
      for (const c of [
        'id',
        'op_id',
        'from_status',
        'to_status',
        'actor_user_id',
        'kiosk_session_jti',
        'idempotency_key',
        'payload_json',
        'created_at_utc',
      ]) {
        assert.ok(cols.has(c), `op_status_event.${c} present`);
      }
      const indexes = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type='index' AND tbl_name='op_status_event'
             AND name IN ('idx_op_event_idem','idx_op_event_op_time')`
        )
        .all()
        .map((r) => r.name)
        .sort();
      assert.deepEqual(indexes, ['idx_op_event_idem', 'idx_op_event_op_time']);
    });

    test('idempotency_key partial-unique index allows multiple NULLs', () => {
      const db = freshDb();
      // Need a parent op_id for the FK; create a WO + op first.
      db.prepare(
        `INSERT INTO work_order
          (code, ccl_pn, customer, qty_planned, uom, priority, due_date, status, raw_json, created_by)
         VALUES ('WO-X','PN','C',1,'EA',5,'2026-12-31','CREATED','{}','t')`
      ).run();
      const woId = db.prepare("SELECT id FROM work_order WHERE code='WO-X'").get().id;
      db.prepare(
        `INSERT INTO work_order_op
           (work_order_id, seq, op_type, work_centre_no, status, raw_json)
         VALUES (?, 10, 'FLEXO','WC1','PENDING','{}')`
      ).run(woId);
      const opId = db.prepare('SELECT id FROM work_order_op WHERE work_order_id=?').get(woId).id;
      const insert = db.prepare(
        `INSERT INTO op_status_event (op_id, from_status, to_status, idempotency_key)
         VALUES (?, ?, ?, ?)`
      );
      insert.run(opId, 'PENDING', 'DISPATCHED', null);
      insert.run(opId, 'DISPATCHED', 'SETUP', null); // second NULL allowed
      insert.run(opId, 'SETUP', 'RUNNING', 'k-1');
      assert.throws(() => insert.run(opId, 'RUNNING', 'PAUSED', 'k-1'), /UNIQUE constraint failed/);
    });
  });

  describe('AC-2.1.4b — idempotency_ledger table', () => {
    test('required columns + index present', () => {
      const db = freshDb();
      const cols = new Set(
        db
          .prepare("SELECT name FROM pragma_table_info('idempotency_ledger')")
          .all()
          .map((r) => r.name)
      );
      for (const c of [
        'key',
        'request_hash',
        'response_status',
        'response_body',
        'created_at_utc',
      ]) {
        assert.ok(cols.has(c), `idempotency_ledger.${c} present`);
      }
      const idx = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_idem_created'")
        .get();
      assert.ok(idx, 'idx_idem_created present');
    });
  });

  describe('AC-2.1.5 — idempotent re-run', () => {
    test('initSchema twice on same DB preserves data and table count', () => {
      const db = freshDb();
      db.prepare(
        `INSERT INTO kiosk_pairing (token_hash, machine_code, issued_by_user_id, issued_at_utc, expires_at_utc)
         VALUES ('h-keep','M-keep',1,'2026-05-01T00:00:00Z','2026-05-02T00:00:00Z')`
      ).run();

      const beforeRows = db.prepare('SELECT COUNT(*) AS n FROM kiosk_pairing').get().n;
      const beforeTables = db
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'")
        .get().n;

      initSchema(); // second run

      const afterRows = db.prepare('SELECT COUNT(*) AS n FROM kiosk_pairing').get().n;
      const afterTables = db
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'")
        .get().n;

      assert.equal(afterRows, beforeRows, 'kiosk_pairing data preserved');
      assert.equal(afterTables, beforeTables, 'table count unchanged');

      // Reason codes still 8 (INSERT OR IGNORE preserves existing).
      const reasonCount = db.prepare('SELECT COUNT(*) AS n FROM reason_code').get().n;
      assert.equal(reasonCount, 8);
    });

    test('applyAdditiveMigrations is no-op when columns already present', () => {
      const db = freshDb();
      // First initSchema already ran inside freshDb; second run exercises
      // the column-existence guard. No throw = pass.
      assert.doesNotThrow(() => initSchema());
    });
  });

  describe('_migration_state', () => {
    test('kiosk row present after init', () => {
      const db = freshDb();
      const row = db
        .prepare("SELECT dataset, mode FROM _migration_state WHERE dataset='kiosk'")
        .get();
      assert.deepEqual(row, { dataset: 'kiosk', mode: 'sqlite' });
    });
  });

  describe('standalone migration mirror', () => {
    test('scripts/migrations/2026-05-01-mes-2-kiosk.sql exists with expected DDL + DOWN', () => {
      const file = path.join(REPO_ROOT, 'scripts/migrations/2026-05-01-mes-2-kiosk.sql');
      assert.ok(fs.existsSync(file), 'standalone migration file exists');
      const contents = fs.readFileSync(file, 'utf-8');
      assert.match(contents, /CREATE TABLE IF NOT EXISTS reason_code\b/);
      assert.match(contents, /CREATE TABLE IF NOT EXISTS kiosk_pairing\b/);
      assert.match(contents, /CREATE TABLE IF NOT EXISTS op_status_event\b/);
      assert.match(contents, /CREATE TABLE IF NOT EXISTS idempotency_ledger\b/);
      assert.match(contents, /ALTER TABLE work_order_op ADD COLUMN started_at\b/);
      assert.match(contents, /-- DOWN \(manual\):/);
      assert.match(contents, /INSERT OR IGNORE INTO _migration_state .*'kiosk'/);
    });
  });

  describe('seedReasonCodes / validateReasonCodeIntegrity', () => {
    test('seedReasonCodes is a no-op when seeds already present', () => {
      const db = freshDb();
      const r = seedReasonCodes(db);
      assert.equal(r.inserted, 0);
      assert.equal(r.total, 8);
    });

    test('seedReasonCodes restores deleted rows', () => {
      const db = freshDb();
      db.prepare("DELETE FROM reason_code WHERE code='OTHER'").run();
      const r = seedReasonCodes(db);
      assert.equal(r.inserted, 1);
      const row = db.prepare("SELECT code FROM reason_code WHERE code='OTHER'").get();
      assert.equal(row.code, 'OTHER');
    });

    test('validateReasonCodeIntegrity returns empty list on healthy DB', () => {
      const db = freshDb();
      assert.deepEqual(validateReasonCodeIntegrity(db), []);
    });

    test('validateReasonCodeIntegrity flags missing default code', () => {
      const db = freshDb();
      db.prepare("DELETE FROM reason_code WHERE code='QUALITY_HOLD'").run();
      const issues = validateReasonCodeIntegrity(db);
      assert.ok(
        issues.some((i) => i.includes('QUALITY_HOLD')),
        'flags QUALITY_HOLD missing'
      );
    });

    test('validateReasonCodeIntegrity flags blank label_vn', () => {
      const db = freshDb();
      db.prepare("UPDATE reason_code SET label_vn='' WHERE code='OTHER'").run();
      const issues = validateReasonCodeIntegrity(db);
      assert.ok(
        issues.some((i) => i.includes('OTHER') && i.includes('label_vn')),
        'flags blank label_vn'
      );
    });
  });
});
