-- ═══════════════════════════════════════════════════════════════════
-- Migration 2026-05-01 · Sprint MES-2 · Shop-floor kiosk + dispatch
-- ═══════════════════════════════════════════════════════════════════
-- Reference copy of the DDL also present in server/db/schema.sql.
-- For fresh installs, schema.sql runs at boot via init.js and creates
-- everything below — no manual action needed.
--
-- For upgrading an EXISTING production DB that was last booted on
-- Sprint MES-1, run this file once:
--     sqlite3 path/to/ops.db < scripts/migrations/2026-05-01-mes-2-kiosk.sql
--
-- The CREATE TABLE / CREATE INDEX statements use IF NOT EXISTS and are
-- idempotent. The ALTER TABLE statements at the bottom are NOT
-- idempotent in SQLite — re-running raises "duplicate column name".
-- Production boots run them via init.js's applyAdditiveMigrations()
-- which guards on pragma_table_info; this manual file omits the guard
-- because operators run it once.
--
-- DOWN (manual):
--     DROP TABLE idempotency_ledger;
--     DROP TABLE op_status_event;
--     DROP TABLE kiosk_pairing;
--     DROP TABLE reason_code;
--     -- Drop the 6 work_order_op columns:
--     -- SQLite < 3.35 cannot DROP COLUMN; recreate the table:
--     -- BEGIN;
--     --   CREATE TABLE work_order_op_old AS SELECT * FROM work_order_op;
--     --   DROP TABLE work_order_op;
--     --   <re-run the MES-1 CREATE TABLE work_order_op>
--     --   INSERT INTO work_order_op (...all MES-1 cols...) SELECT ... FROM work_order_op_old;
--     --   DROP TABLE work_order_op_old;
--     -- COMMIT;
--     DELETE FROM _migration_state WHERE dataset='kiosk';
-- (Take a backup snapshot first — `npm run backup` or copy ops.db
--  from deploy.sh's releases/<ts>/ retention.)

CREATE TABLE IF NOT EXISTS reason_code (
  code             TEXT PRIMARY KEY,
  label_en         TEXT NOT NULL,
  label_vn         TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('downtime','quality','planned','other')),
  active           INTEGER NOT NULL DEFAULT 1,
  sort_order       INTEGER NOT NULL DEFAULT 100,
  created_at_utc   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS kiosk_pairing (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash         TEXT NOT NULL UNIQUE,
  machine_code       TEXT NOT NULL,
  issued_by_user_id  INTEGER NOT NULL,
  issued_at_utc      TEXT NOT NULL,
  expires_at_utc     TEXT NOT NULL,
  redeemed_at_utc    TEXT,
  revoked_at_utc     TEXT,
  session_jti        TEXT UNIQUE,
  last_seen_at_utc   TEXT
);
CREATE INDEX IF NOT EXISTS idx_kiosk_pairing_machine ON kiosk_pairing(machine_code, redeemed_at_utc);
CREATE INDEX IF NOT EXISTS idx_kiosk_pairing_jti     ON kiosk_pairing(session_jti);

CREATE TABLE IF NOT EXISTS op_status_event (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id              INTEGER NOT NULL REFERENCES work_order_op(id) ON DELETE CASCADE,
  from_status        TEXT NOT NULL,
  to_status          TEXT NOT NULL,
  actor_user_id      INTEGER,
  kiosk_session_jti  TEXT,
  idempotency_key    TEXT,
  payload_json       TEXT,
  created_at_utc     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_op_event_idem    ON op_status_event(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_op_event_op_time ON op_status_event(op_id, created_at_utc DESC);

CREATE TABLE IF NOT EXISTS idempotency_ledger (
  key              TEXT PRIMARY KEY,
  request_hash     TEXT NOT NULL,
  response_status  INTEGER NOT NULL,
  response_body    TEXT NOT NULL,
  created_at_utc   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_idem_created ON idempotency_ledger(created_at_utc);

INSERT OR IGNORE INTO reason_code (code, label_en, label_vn, category, sort_order) VALUES
  ('MACHINE_DOWN',       'Machine down',         'Máy hỏng',           'downtime', 10),
  ('MATERIAL_SHORT',     'Material shortage',    'Thiếu vật tư',       'downtime', 20),
  ('OPERATOR_BREAK',     'Operator break',       'Nghỉ giải lao',      'planned',  30),
  ('QUALITY_HOLD',       'Quality hold',         'Giữ kiểm tra CL',    'quality',  40),
  ('SETUP_CHANGEOVER',   'Setup / changeover',   'Setup / chuyển job', 'planned',  50),
  ('SHIFT_END',          'Shift end',            'Hết ca',             'planned',  60),
  ('MAINTENANCE_PLANNED','Planned maintenance',  'Bảo trì có kế hoạch','planned',  70),
  ('OTHER',              'Other (note required)','Khác (cần ghi chú)', 'other',    99);

INSERT OR IGNORE INTO _migration_state (dataset, mode) VALUES ('kiosk', 'sqlite');

-- The 6 work_order_op columns. Run ONCE on MES-1 production DBs.
ALTER TABLE work_order_op ADD COLUMN started_at         TEXT;
ALTER TABLE work_order_op ADD COLUMN paused_at          TEXT;
ALTER TABLE work_order_op ADD COLUMN paused_reason_code TEXT;
ALTER TABLE work_order_op ADD COLUMN completed_at       TEXT;
ALTER TABLE work_order_op ADD COLUMN accepted_at        TEXT;
ALTER TABLE work_order_op ADD COLUMN last_pulse_at      TEXT;
