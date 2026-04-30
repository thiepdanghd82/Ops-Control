-- ═══════════════════════════════════════════════════════════════════
-- Ops Control SQLite schema
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase-1 scope: typed reference data with UNIQUE constraints + indexes.
-- Each row keeps `raw_json` = stringified original row, so even if schema
-- extraction misses a field the repo can fall back to the raw payload
-- and downstream code keeps working.
--
-- Not migrated in phase 1: quotes / trackers / finance / ink_calc /
-- DDL / rates. Those stay JSON-file-backed and get migrated later.

-- Materials (NPI + Sourcing stored together, differentiated by `kind`).
CREATE TABLE IF NOT EXISTS materials (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,       -- 'npi' | 'sourcing'
  code            TEXT,
  name            TEXT,
  price           REAL,
  type            TEXT,
  thick           TEXT,
  color           TEXT,
  surface         TEXT,
  adhesive        TEXT,
  moq             TEXT,
  lt              TEXT,
  supplier        TEXT,
  note            TEXT,
  date            TEXT,
  raw_json        TEXT NOT NULL,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_materials_kind ON materials(kind);
CREATE INDEX IF NOT EXISTS idx_materials_name ON materials(name);
CREATE INDEX IF NOT EXISTS idx_materials_supplier ON materials(supplier);

-- BOM / Manufacturing Structures.
-- UNIQUE key spans parent + component + alt so duplicates surface on
-- import instead of silently overwriting.
CREATE TABLE IF NOT EXISTS bom (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_part         TEXT,
  parent_desc         TEXT,
  component_part      TEXT,
  component_desc      TEXT,
  qty_per_assembly    REAL,
  scrap               REAL,
  scrap_pct           REAL,
  uom                 TEXT,
  pitch               REAL,
  cavity              INTEGER,
  color_nums          INTEGER,
  structure_type      TEXT,
  alternative_no      TEXT,
  effectivity         TEXT,
  planner             TEXT,
  raw_json            TEXT NOT NULL,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bom_parent ON bom(parent_part);
CREATE INDEX IF NOT EXISTS idx_bom_component ON bom(component_part);
CREATE INDEX IF NOT EXISTS idx_bom_planner ON bom(planner);

-- Routing Operations.
-- UNIQUE includes Routing Type (Manufacturing vs Repair) — the audit
-- found 1335 "dup" rows that are actually legit M/R pairs.
CREATE TABLE IF NOT EXISTS routing_operations (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  part_no                 TEXT,
  part_desc               TEXT,
  operation_no            INTEGER,
  operation_desc          TEXT,
  work_centre_no          TEXT,
  work_centre_desc        TEXT,
  mach_setup_time         REAL,
  labour_setup_time       REAL,
  mach_run_factor         REAL,
  labour_run_factor       REAL,
  factor_unit             TEXT,
  setup_crew_size         INTEGER,
  crew_size               INTEGER,
  alternative             TEXT,
  routing_revision        TEXT,
  routing_type            TEXT,
  efficiency_factor       REAL,
  site                    TEXT,
  state                   TEXT,
  raw_json                TEXT NOT NULL,
  updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_routing_part ON routing_operations(part_no);
CREATE INDEX IF NOT EXISTS idx_routing_wc ON routing_operations(work_centre_no);
CREATE INDEX IF NOT EXISTS idx_routing_type ON routing_operations(routing_type);

-- IFS Inventory: 3 logical datasets (inventory / finished_goods /
-- raw_materials) merged into one table, partitioned by `kind`.
CREATE TABLE IF NOT EXISTS ifs_inventory (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kind              TEXT NOT NULL,
  part_no           TEXT,
  part_desc         TEXT,
  qty_on_hand       REAL,
  uom               TEXT,
  location          TEXT,
  lot_no            TEXT,
  raw_json          TEXT NOT NULL,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inv_kind_part ON ifs_inventory(kind, part_no);

-- Quotes (Standard + Complex saved quotes, from quote_history.json).
-- state_json = full payload preserved as a JSON string. Typed columns
-- are just indexes for list-view filtering; the app itself only needs
-- `raw_json` (and `state_json` which is a nested view of the state).
CREATE TABLE IF NOT EXISTS quotes (
  id             INTEGER PRIMARY KEY,      -- matches existing quote id
  type           TEXT,                     -- 'standard' | 'complex'
  rfq_number     TEXT,
  ccl_pn         TEXT,
  direct_cu      TEXT,
  end_cu         TEXT,
  npi_owner      TEXT,
  sale_owner     TEXT,
  saved_at       TEXT,
  version        TEXT,
  label          TEXT,
  result         TEXT,
  state_json     TEXT,                     -- the `state` sub-object
  raw_json       TEXT NOT NULL,            -- entire quote row
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_quotes_ccl ON quotes(ccl_pn);
CREATE INDEX IF NOT EXISTS idx_quotes_rfq ON quotes(rfq_number);
CREATE INDEX IF NOT EXISTS idx_quotes_saved ON quotes(saved_at DESC);

-- Quote version history. Each save of an existing quote appends a row.
-- Retention handled in app code (prune when per-quote count > 20).
-- Enables diff-two-versions UI and undo-to-previous workflow.
CREATE TABLE IF NOT EXISTS quote_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id    INTEGER NOT NULL,
  version_num INTEGER NOT NULL,
  state_json  TEXT NOT NULL,            -- snapshot of quote state
  saved_at    TEXT NOT NULL,
  saved_by    TEXT,                     -- username
  state_hash  TEXT NOT NULL,            -- SHA256 hex for dedup
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_qv_quote ON quote_versions(quote_id, version_num DESC);
CREATE INDEX IF NOT EXISTS idx_qv_hash ON quote_versions(quote_id, state_hash);

-- RFQ tracker + Sample tracker — currently empty arrays but schema
-- ready so shadow-write on save-all can start populating.
CREATE TABLE IF NOT EXISTS rfq_tracker (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rfq_no      TEXT,
  customer    TEXT,
  product     TEXT,
  stage       TEXT,
  owner       TEXT,
  result      TEXT,
  raw_json    TEXT NOT NULL,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rfq_stage ON rfq_tracker(stage);
CREATE INDEX IF NOT EXISTS idx_rfq_owner ON rfq_tracker(owner);

CREATE TABLE IF NOT EXISTS sample_tracker (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  part_no         TEXT,
  customer        TEXT,
  overall_status  TEXT,
  raw_json        TEXT NOT NULL,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sample_status ON sample_tracker(overall_status);

-- Migration state tracking — one row per dataset, lets verify-parity.js
-- and /api/ping see which datasets have been migrated.
CREATE TABLE IF NOT EXISTS _migration_state (
  dataset     TEXT PRIMARY KEY,
  mode        TEXT NOT NULL,              -- 'file' | 'shadow-write' | 'shadow-read' | 'sqlite'
  last_sync   DATETIME,
  row_count   INTEGER,
  checksum    TEXT,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log (Sprint 30) — append-only security/compliance trail.
-- Pre-Sprint-30 lived in audit_log.json (single file, 500-row ring
-- buffer, full-array rewrite on each append). SQLite table removes
-- the row cap, supports WHERE filters (by user, event, time range)
-- and avoids write amplification. authService.audit() dual-writes
-- to this table AND the file during cutover; when the file writer
-- is dropped, `audit_log.json` becomes a frozen historical record.
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  event      TEXT NOT NULL,
  user       TEXT,
  ip         TEXT,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user, ts DESC);

-- ═══════════════════════════════════════════════════════════════════
-- Sprint MES-1 (2026-04-30) — Work Order header + operations.
-- Production Control core. State machine guarded by inline CHECK on
-- `status` + the pure workOrderTransition() function in
-- domains/planning/server/domain/. See PRD §6/§8.
-- CHECKs are inlined because SQLite has no ALTER TABLE … ADD CONSTRAINT.

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
