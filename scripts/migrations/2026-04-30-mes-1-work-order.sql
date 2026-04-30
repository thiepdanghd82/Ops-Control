-- ═══════════════════════════════════════════════════════════════════
-- Migration 2026-04-30 · Sprint MES-1 · Work Order tables
-- ═══════════════════════════════════════════════════════════════════
-- Reference copy of the DDL also present in server/db/schema.sql.
-- For fresh installs, schema.sql runs at boot via init.js and creates
-- everything below — no manual action needed.
--
-- For upgrading an EXISTING production DB that predates Sprint MES-1,
-- run this file once:
--     sqlite3 path/to/ops.db < scripts/migrations/2026-04-30-mes-1-work-order.sql
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
-- + INSERT OR IGNORE. Re-running on a populated DB is a no-op.
--
-- DOWN (manual):
--     DROP TABLE work_order_op;
--     DROP TABLE work_order;
--     DELETE FROM _migration_state WHERE dataset='work_order';
-- (Take a backup snapshot first — `npm run backup` or copy ops.db
--  from deploy.sh's releases/<ts>/ retention.)

CREATE TABLE IF NOT EXISTS work_order (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  sales_order_id  INTEGER,
  rfq_no          TEXT,
  ccl_pn          TEXT NOT NULL,
  customer        TEXT NOT NULL,
  qty_planned     REAL NOT NULL,
  qty_completed   REAL NOT NULL DEFAULT 0,
  uom             TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 5
                    CHECK (priority BETWEEN 1 AND 9),
  due_date        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN (
                    'CREATED','RELEASED','SCHEDULED','IN_PROGRESS','ON_HOLD',
                    'COMPLETED','QC_RELEASED','CLOSED','CANCELLED'
                  )),
  released_at     TEXT,
  closed_at       TEXT,
  raw_json        TEXT NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by      TEXT NOT NULL,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_wo_status   ON work_order(status, due_date);
CREATE INDEX IF NOT EXISTS idx_wo_pn       ON work_order(ccl_pn);
CREATE INDEX IF NOT EXISTS idx_wo_customer ON work_order(customer);

CREATE TABLE IF NOT EXISTS work_order_op (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id       INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  seq                 INTEGER NOT NULL,
  op_type             TEXT NOT NULL CHECK (op_type IN (
                        'PRE_PRESS','FLEXO','DIE_CUT_FLATBED','DIE_CUT_ROTARY',
                        'LAMINATE','PACK','OUTSOURCE'
                      )),
  work_centre_no      TEXT NOT NULL,
  status              TEXT NOT NULL,
  planned_start       TEXT,
  planned_end         TEXT,
  actual_start        TEXT,
  actual_end          TEXT,
  setup_minutes_plan  REAL,
  run_minutes_plan    REAL,
  good_count          REAL NOT NULL DEFAULT 0,
  scrap_count         REAL NOT NULL DEFAULT 0,
  notes               TEXT,
  raw_json            TEXT NOT NULL,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (work_order_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_woop_status ON work_order_op(status);
CREATE INDEX IF NOT EXISTS idx_woop_wc     ON work_order_op(work_centre_no, planned_start);

INSERT OR IGNORE INTO _migration_state (dataset, mode) VALUES ('work_order', 'sqlite');
