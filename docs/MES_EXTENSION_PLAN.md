# Ops Control → Full MES — Extension Plan

> Companion to `README FIRST/ARCHITECTURE.md`. This document describes how Ops Control v1.3
> evolves from "Pricing + Planning + MES backbone" into a full Manufacturing Execution System
> for CCL Design Vietnam printing operations (Flexo, Die-cut Flatbed, Die-cut Rotary).
>
> **Status:** Discovery / draft. Replaces an earlier external "Brady MES" architecture
> document that incorrectly assumed Ops Control was an Excel rule book and proposed a Java/
> Spring/Postgres greenfield. Per ADR-0001 we stay on the existing Node + better-sqlite3 +
> React + Electron stack.

---

## 1. Goals

Extend Ops Control v1.3 with the missing capabilities of a full MES, without breaking the
v1.2/v1.3 compatibility promise:

1. **Production Control with full Work-Order lifecycle** — not just routing reference data.
2. **Real-time machine telemetry + OEE** for Flexo and Die-cut lines.
3. **Shop-floor execution UI** (kiosk + tablet) usable by line operators.
4. **Lot / batch traceability** (genealogy from raw material to shipped product).
5. **Pre-press workflow + customer approval portal** (artwork vault, version lock, e-sign).
6. **Quality Control with SPC + NCR + CAPA**, beyond today's Sample Tracker.
7. **Mobile app for warehouse picking + QC inspection.**

In scope for the printing technologies CCL actually runs today: **FLEXO**, **DIE_CUT_FLATBED**,
**DIE_CUT_ROTARY** (with inline detection). Other technologies (Offset, Digital, Screen) are
out of scope for now but the data model must remain extensible.

---

## 2. What Ops Control v1.3 already has

This is the foundation we build on, **not** something we re-invent.

### 2.1 Domains in place

| Domain     | SAP analogue | Notable capabilities present                                                                                   |
| ---------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| `costing`  | CO           | Standard + Complex pricing, Print Area, Ink calc, Master Cylinder admin, Gallus calc engine                    |
| `library`  | MM           | Materials (NPI + Sourcing), Rates, Finance, DDL, Manufacturing Structure, Routing Operations, Machine Profiles |
| `planning` | PP           | Order Entry, WIP Tracker, Capacity Planning, BOM Explosion, Material Check                                     |
| `sales`    | SD           | RFQ Tracker, Quote History, Quote Analysis, Formal Quotation, Released Quotation                               |
| `quality`  | QM           | Sample Tracking                                                                                                |
| `security` | SU/HR        | bcrypt + AES-256-GCM TOTP + JWT cookie, lockout, audit log, approvals                                          |
| `basis`    | BC           | Settings, Backup/Restore + scheduled, Smart/Thin sync, Notifications, Import wizard, Health                    |
| `mes`      | MES/PLM      | IFS Inventory mirror, Machine Technical, Hardware Devices, Connection Mode                                     |

### 2.2 Schema in place (`server/db/schema.sql`)

- `materials`, `bom`, `routing_operations`, `ifs_inventory`
- `quotes`, `quote_versions` (with state hashing for diff/undo)
- `rfq_tracker`, `sample_tracker`
- `audit_log` (Sprint 30, replaces audit_log.json)
- `_migration_state` (per-dataset shadow-write tracker)

### 2.3 Platform layer in place

`auth`, `audit`, `cache` (ETag + SWR + persistent snapshot), `sync` (Smart/Thin),
`i18n`, `ui-kit`, `http` (validate, rateLimit, siteAccess, errorEnvelope), `storage`
(atomic writes, lockfiles, SQLite shadow-write coordinator), `observability`.

### 2.4 AI agent layer in place (`.claude/`)

Slash commands: `/spec`, `/plan`, `/build`, `/test`, `/review`, `/deploy`, `/debug`, `/simplify`.
10 specialised agents (frontend, backend, architect, reviewer, test-engineer, security-auditor,
qa, pm, ui-ux, copywriter). Mandatory rules incl. `security.md`. Skills + references.

> The MES extension reuses the same `.claude/` workflow. We do not introduce a parallel agent
> stack.

---

## 3. Gap analysis — what is missing for full MES

For each missing capability we record (a) the gap, (b) the domain to extend,
(c) net-new schema, (d) net-new routes, (e) effort class.

### 3.1 Production Control — Work Order lifecycle ⛔ MAJOR GAP

**Today:** `routing_operations` table holds master data (per-part operation reference). There
is no `work_order` table, no operation execution, no state machine, no shop-floor dispatch.

**Needed:** full WO lifecycle as in IFS / SAP PP:
`CREATED → RELEASED → SCHEDULED → IN_PROGRESS → COMPLETED → QC_RELEASED → CLOSED`,
plus `ON_HOLD` and `CANCELLED`.

**Domain:** extend `domains/planning` (PP) — sits naturally between Order Entry and Capacity.

**Schema additions** (new tables, all in main SQLite DB):

```sql
CREATE TABLE IF NOT EXISTS work_order (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,           -- WO-2026-04-00123
  sales_order_id  INTEGER,                        -- FK to sales tracker (nullable for internal jobs)
  rfq_no          TEXT,                           -- denormalized for fast lookup
  ccl_pn          TEXT NOT NULL,                  -- product number
  customer        TEXT NOT NULL,
  qty_planned     REAL NOT NULL,
  qty_completed   REAL NOT NULL DEFAULT 0,
  uom             TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 5,     -- 1=highest..9
  due_date        TEXT NOT NULL,
  status          TEXT NOT NULL,
  released_at     TEXT,
  closed_at       TEXT,
  raw_json        TEXT NOT NULL,                  -- v1.3 convention
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by      TEXT NOT NULL,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_wo_status ON work_order(status, due_date);
CREATE INDEX IF NOT EXISTS idx_wo_pn ON work_order(ccl_pn);
CREATE INDEX IF NOT EXISTS idx_wo_customer ON work_order(customer);

CREATE TABLE IF NOT EXISTS work_order_op (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id       INTEGER NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  seq                 INTEGER NOT NULL,
  op_type             TEXT NOT NULL,              -- PRE_PRESS, FLEXO, DIE_CUT_FLATBED, DIE_CUT_ROTARY, LAMINATE, PACK, OUTSOURCE
  work_centre_no      TEXT NOT NULL,              -- joins routing_operations.work_centre_no
  status              TEXT NOT NULL,              -- PENDING, DISPATCHED, SETUP, RUNNING, PAUSED, DONE, ACCEPTED
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
CREATE INDEX IF NOT EXISTS idx_woop_wc ON work_order_op(work_centre_no, planned_start);
```

**Routes** (in `domains/planning/server/routes/workOrder.js`):

| Verb  | Path                                             | Purpose                         |
| ----- | ------------------------------------------------ | ------------------------------- |
| POST  | `/api/planning/work-orders`                      | Create WO header (planner role) |
| GET   | `/api/planning/work-orders/:id`                  | Detail incl. operations         |
| GET   | `/api/planning/work-orders?status=&q=&from=&to=` | Paged search                    |
| PATCH | `/api/planning/work-orders/:id`                  | Edit header                     |
| POST  | `/api/planning/work-orders/:id/release`          | CREATED → RELEASED              |
| POST  | `/api/planning/work-orders/:id/cancel`           | → CANCELLED                     |
| POST  | `/api/planning/work-orders/:id/operations`       | Add operation                   |
| POST  | `/api/planning/operations/:id/start`             | Operator start                  |
| POST  | `/api/planning/operations/:id/pause`             | + reasonCode                    |
| POST  | `/api/planning/operations/:id/resume`            |                                 |
| POST  | `/api/planning/operations/:id/complete`          | + good/scrap counts             |
| POST  | `/api/planning/operations/:id/scan`              | barcode/QR                      |
| GET   | `/api/planning/dispatch-list?machineId=`         | Shop floor dispatch             |

**Effort:** ★★★★ (large, ~3 sprints) — biggest single gap.

---

### 3.2 Real-time machine telemetry + OEE ⛔ MAJOR GAP

**Today:** No machine event ingestion. Operations are reference data only.

**Needed:** event stream from machines (or operator scans) → minute-level OEE → dashboards.

**Domain:** extend `domains/mes` (MES/PLM) — its mandate already includes Machine Technical
and Hardware Devices.

**Schema additions:**

```sql
CREATE TABLE IF NOT EXISTS production_event (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at   TEXT NOT NULL,                    -- ISO 8601 UTC
  machine_code  TEXT NOT NULL,
  operation_id  INTEGER REFERENCES work_order_op(id),
  event_type    TEXT NOT NULL,                    -- START, STOP, COUNT, DEFECT, REASON_CODE
  reason_code   TEXT,
  count_delta   REAL,
  payload_json  TEXT,
  source        TEXT NOT NULL                     -- OPC_UA, MQTT, MANUAL, KIOSK
);
CREATE INDEX IF NOT EXISTS idx_pe_machine_time ON production_event(machine_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pe_op ON production_event(operation_id);

CREATE TABLE IF NOT EXISTS oee_minute (
  bucket_min       TEXT NOT NULL,                 -- 'YYYY-MM-DDTHH:MM:00Z'
  machine_code     TEXT NOT NULL,
  planned_minutes  REAL NOT NULL,
  run_minutes      REAL NOT NULL,
  setup_minutes    REAL NOT NULL,
  down_minutes     REAL NOT NULL,
  total_count      REAL NOT NULL,
  good_count       REAL NOT NULL,
  scrap_count      REAL NOT NULL,
  availability     REAL,
  performance      REAL,
  quality          REAL,
  oee              REAL,
  PRIMARY KEY (bucket_min, machine_code)
);
CREATE INDEX IF NOT EXISTS idx_oee_machine_bucket ON oee_minute(machine_code, bucket_min DESC);

CREATE TABLE IF NOT EXISTS reason_code (
  code            TEXT PRIMARY KEY,
  label_en        TEXT NOT NULL,
  label_vn        TEXT,
  category        TEXT NOT NULL,                  -- SETUP, BREAK, MAINTENANCE, MATERIAL, QUALITY, OTHER
  applies_to      TEXT NOT NULL,                  -- comma-list of WC types: FLEXO,DIE_CUT_ROTARY,...
  active          INTEGER NOT NULL DEFAULT 1
);
```

> SQLite has no first-class time-series engine. For our scale (≤300 users, ~50 machines, ~10
> events/sec sustained per machine) the table approach + indexes is sufficient. If volume grows
> we can migrate to DuckDB or split telemetry into a satellite SQLite file. ADR to be written.

**Routes** (`domains/mes/server/routes/`):

| Verb | Path                                                      | Purpose                                         |
| ---- | --------------------------------------------------------- | ----------------------------------------------- |
| POST | `/api/mes/events/bulk`                                    | Edge gateway pushes events (machine token auth) |
| GET  | `/api/mes/oee/current?machine=`                           | Current minute snapshot                         |
| GET  | `/api/mes/oee/timeseries?machine=&from=&to=&granularity=` | minute / hour / day                             |
| GET  | `/api/mes/oee/plant-summary`                              | Rollup for plant manager dashboard              |
| GET  | `/api/mes/reason-codes`                                   | Reason-code catalog by WC type                  |

**OEE calculation engine:** pure JS, in `domains/mes/server/domain/oeeEngine.js`. Triggered on
event ingest (synchronous compute for this minute) + nightly batch backfill.

**Edge gateway:** new app under `apps/edge-gateway/` (Node.js Electron-less, runs on a small
industrial PC at the line). Connects via OPC UA (`node-opcua` library) and/or MQTT (`mqtt.js`)
to machines, normalizes to `production_event` shape, posts to `/api/mes/events/bulk`. Buffers
to local SQLite when WAN is down (24h cap). See §6 for technology-specific signal mapping.

**Effort:** ★★★★ (large, ~2 sprints for OEE engine + 1 sprint for edge gateway).

---

### 3.3 Shop-floor execution UI ⛔ MAJOR GAP

**Today:** All UI is admin/planner-style. No touch-first kiosk for line operators.

**Needed:** PWA that runs on a touchscreen PC or tablet at each line, paired with one machine.
Big buttons, single-hand operation, offline-tolerant.

**Domain:** extend `domains/planning/client/` with new pages, OR ship as a separate app
`apps/kiosk/` reusing platform/ui-kit. **Recommended:** separate app — different UX
constraints, different deployment cadence, different security posture (machine-bound token).

**Routes:** consumed via existing `/api/planning/...` and `/api/mes/...`.

**New deliverable:** `apps/kiosk/` (Vite + React, PWA manifest, IndexedDB queue).

**Effort:** ★★★ (medium, ~2 sprints incl. UX research with operators).

---

### 3.4 Lot / batch traceability 🟡 MODERATE GAP

**Today:** `ifs_inventory` has `lot_no` per row but no genealogy walker, no link from a
finished-goods lot back to which raw material lots fed it.

**Needed:** add a `stock_movement` ledger and a `lot_link` table (parent-child), then a
recursive CTE to walk genealogy in either direction.

**Domain:** extend `domains/library` (MM) for inventory movements, OR `domains/mes` for the
lot-link layer. **Recommended:** library for movements (it owns master data + inventory
mirror); mes for the link layer (it deals with execution events anyway).

**Schema additions:**

```sql
CREATE TABLE IF NOT EXISTS stock_movement (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at     TEXT NOT NULL,
  movement_type   TEXT NOT NULL,                 -- RECEIPT, ISSUE, TRANSFER, ADJUST, RETURN, PRODUCE
  part_no         TEXT NOT NULL,
  lot_no          TEXT,
  from_location   TEXT,
  to_location     TEXT,
  quantity        REAL NOT NULL,
  uom             TEXT NOT NULL,
  ref_type        TEXT,                          -- WO, PO, RMA
  ref_id          TEXT,
  performed_by    TEXT NOT NULL,
  scan_device     TEXT,
  notes           TEXT,
  raw_json        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sm_occurred ON stock_movement(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sm_lot ON stock_movement(part_no, lot_no);
CREATE INDEX IF NOT EXISTS idx_sm_ref ON stock_movement(ref_type, ref_id);

CREATE TABLE IF NOT EXISTS lot_link (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_part_no  TEXT NOT NULL,
  parent_lot_no   TEXT NOT NULL,
  child_part_no   TEXT NOT NULL,
  child_lot_no    TEXT NOT NULL,
  via_op_id       INTEGER REFERENCES work_order_op(id),
  consumed_qty    REAL,
  produced_qty    REAL,
  recorded_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ll_parent ON lot_link(parent_part_no, parent_lot_no);
CREATE INDEX IF NOT EXISTS idx_ll_child ON lot_link(child_part_no, child_lot_no);
```

**Genealogy query:** recursive CTE in `domains/library/server/services/genealogy.js`. Cap depth
at 10. Bidirectional (forward: where did this lot end up; backward: what fed this lot).

**Effort:** ★★ (small, ~1 sprint).

---

### 3.5 Pre-press workflow + customer approval 🟡 MODERATE GAP

**Today:** `domains/costing` includes Print Area + Design Tools + Master Cylinder, focused on
tooling specifications not on artwork lifecycle. There is no artwork file vault, no version
lock, no customer approval portal.

**Needed:** new sub-area `domains/library/server/services/artwork.js` (vault) + a small
external-facing approval portal under `apps/portal/` (already has CCL Design Vietnam customer
relationships, so an external app makes sense).

**Schema additions:**

```sql
CREATE TABLE IF NOT EXISTS artwork_file (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ccl_pn              TEXT NOT NULL,
  customer            TEXT NOT NULL,
  current_version     INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'DRAFT',
  raw_json            TEXT NOT NULL,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_aw_pn ON artwork_file(ccl_pn);

CREATE TABLE IF NOT EXISTS artwork_version (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id          INTEGER NOT NULL REFERENCES artwork_file(id) ON DELETE CASCADE,
  version             INTEGER NOT NULL,
  storage_path        TEXT NOT NULL,             -- relative path under data/products-layout/
  size_bytes          INTEGER NOT NULL,
  mime_type           TEXT,
  uploaded_by         TEXT,
  uploaded_at         TEXT NOT NULL,
  preflight_json      TEXT,                      -- preflight report
  approved_at         TEXT,
  approved_by         TEXT,
  customer_approved_at TEXT,
  customer_approved_by TEXT,
  signature_blob      BLOB,                      -- e-sign hash chain
  locked              INTEGER NOT NULL DEFAULT 0,
  UNIQUE (artwork_id, version)
);
```

**Approval portal** (`apps/portal/`): magic-link OTP login (no Keycloak — keep it simple),
PDF.js-based proof viewer, comment pin-on-PDF, approve/reject with hash chain. Sends events
back via `/api/approvals/...`.

**Effort:** ★★★ (medium, ~2 sprints — preflight engine + portal UX is the long pole).

---

### 3.6 Quality Control — SPC + NCR + CAPA 🟡 MODERATE GAP

**Today:** `domains/quality` ships only Sample Tracking. No inspection plans, no SPC charts,
no formal Non-Conformance / Corrective-Action workflow.

**Needed:** add inspection plans → inspections → results → SPC. NCR + CAPA as a separate
process backed by audit log + state machine.

**Domain:** extend `domains/quality`.

**Schema additions:**

```sql
CREATE TABLE IF NOT EXISTS inspection_plan (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ccl_pn          TEXT NOT NULL,
  stage           TEXT NOT NULL,                 -- IQC, IPQC, OQC
  version         INTEGER NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  raw_json        TEXT NOT NULL,
  UNIQUE (ccl_pn, stage, version)
);

CREATE TABLE IF NOT EXISTS inspection_item (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id         INTEGER NOT NULL REFERENCES inspection_plan(id) ON DELETE CASCADE,
  seq             INTEGER NOT NULL,
  characteristic  TEXT NOT NULL,
  data_type       TEXT NOT NULL,                 -- VARIABLE, ATTRIBUTE
  uom             TEXT,
  spec_target     REAL,
  spec_lower      REAL,
  spec_upper      REAL,
  method          TEXT,
  frequency_json  TEXT
);

CREATE TABLE IF NOT EXISTS inspection (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id         INTEGER NOT NULL,
  ref_type        TEXT NOT NULL,                 -- LOT, OPERATION, BATCH
  ref_id          TEXT NOT NULL,
  inspector       TEXT NOT NULL,
  performed_at    TEXT NOT NULL,
  result          TEXT NOT NULL                  -- PASS, FAIL, CONDITIONAL
);

CREATE TABLE IF NOT EXISTS inspection_result (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id   INTEGER NOT NULL REFERENCES inspection(id) ON DELETE CASCADE,
  item_id         INTEGER NOT NULL,
  measured_value  REAL,
  attribute_pass  INTEGER,
  notes           TEXT,
  attachments_json TEXT
);

CREATE TABLE IF NOT EXISTS ncr (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,           -- NCR-2026-04-0123
  source          TEXT NOT NULL,                  -- INSPECTION, CUSTOMER, INTERNAL
  ref_type        TEXT,
  ref_id          TEXT,
  defect_code     TEXT NOT NULL,
  description     TEXT,
  disposition     TEXT,                           -- REWORK, USE_AS_IS, SCRAP, RETURN_VENDOR
  status          TEXT NOT NULL,                  -- OPEN, INVESTIGATING, CLOSED
  opened_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at       TEXT
);

CREATE TABLE IF NOT EXISTS capa (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  triggered_by_ncr_id         INTEGER REFERENCES ncr(id),
  problem_statement           TEXT NOT NULL,
  root_cause                  TEXT,
  action_plan                 TEXT,
  owner                       TEXT,
  due_date                    TEXT,
  status                      TEXT NOT NULL,
  effectiveness_review_at     TEXT
);
```

**SPC computation:** scheduled job (every 5 min via existing `basis` scheduler) recomputes
control limits from the last 25 subgroups; Western Electric Rules detection emits a
`qc.spc.violation` event → `audit_log` + push notification through existing `notifications`.

**Effort:** ★★★ (medium, ~2 sprints — SPC engine is non-trivial).

---

### 3.7 Mobile app for warehouse + QC 🟡 MODERATE GAP

**Today:** Web + Electron desktop. No mobile.

**Needed:** React Native (Expo) sharing components with platform/ui-kit where possible, for
two flows: Warehouse picking and QC inspection.

**Domain:** new app `apps/mobile/`. Reuses domain server APIs.

**Effort:** ★★★ (medium-large, ~2 sprints — RN/Expo setup + scanner integration).

---

### 3.8 Costing engine — technology-specific rules 🟢 SMALL GAP

**Today:** Standard + Complex pricing exist; Print Area and Ink calc encode some flexo
rules. The engine is mature but not modelled around the FLEXO / DIE_CUT_FLATBED /
DIE_CUT_ROTARY taxonomy with explicit per-technology rule sets and inline detection.

**Needed:** restructure (refactor, do not rewrite) `domains/costing/server/domain/` so the
engine emits cost lines tagged with `op_type` and runs through a strategy:

- Flexo: substrate + plate (with reuse window) + ink + setup matrix + run rate + scrap
- Flatbed: die amortization + setup vs complexity + hits/min run + scrap
- Rotary: solid vs flexible die + run m/min + inline collapse rule

Each line should record a `rule_id` + `inputs` (which it already does for explainability) so
auditors can trace.

**Domain:** extend `domains/costing/server/domain/` — preserve existing Standard/Complex
inputs UX, add internal strategy.

**Effort:** ★★ (small, ~1 sprint refactor + tests).

---

## 4. Sprint roadmap (proposed)

Fits the existing v1.3 sprint cadence. Targets 2-week sprints.

| Sprint     | Theme                             | Deliverables                                                                 |
| ---------- | --------------------------------- | ---------------------------------------------------------------------------- |
| **MES-1**  | Production Control core           | `work_order` + `work_order_op` schema + API + planner UI list/detail/release |
| **MES-2**  | Shop-floor execution + dispatch   | `apps/kiosk/` MVP, start/pause/complete flows, reason codes                  |
| **MES-3**  | Telemetry + OEE                   | `production_event` ingest, `oee_minute` engine, plant dashboard widget       |
| **MES-4**  | Edge gateway                      | `apps/edge-gateway/` with OPC UA + MQTT, offline buffer, machine sim test    |
| **MES-5**  | Lot traceability                  | `stock_movement` + `lot_link` + genealogy CTE + library UI                   |
| **MES-6**  | QC plans + inspections            | `inspection_plan` + `inspection` + `inspection_result` + tablet UI           |
| **MES-7**  | SPC + NCR/CAPA                    | SPC engine + chart UI + NCR/CAPA workflow                                    |
| **MES-8**  | Pre-press vault + portal          | `artwork_file` + `artwork_version` + `apps/portal/` MVP                      |
| **MES-9**  | Costing technology rules refactor | Strategy split + 6 parameterized tests + reproducibility test                |
| **MES-10** | Mobile app                        | `apps/mobile/` warehouse + QC flows                                          |
| **MES-11** | Hardening                         | Performance tuning, DR drill on new tables, audit coverage                   |
| **MES-12** | Pilot rollout                     | 2 lines (1 flexo + 1 inline rotary) live with KPI tracking                   |

Sprint duration assumption: 2 weeks. Total ≈ 24 weeks ≈ 6 months for full MES Phase 1
(matches the IMPLEMENTATION.md timeline at lower cost since we reuse Ops Control).

---

## 5. ADRs to write (or update)

| ADR  | Title                                                          | Why now                                                    |
| ---- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| 0006 | Time-series data on SQLite (no Postgres/Timescale)             | Justify `oee_minute` design choice                         |
| 0007 | Edge gateway as separate Node app, not Electron                | Electron is for end-user UI, not headless                  |
| 0008 | Reuse magic-link OTP for customer portal (no Keycloak)         | Stay on existing auth stack                                |
| 0009 | Mobile app via React Native (Expo), not PWA-only               | Hardware scanner integration needs native bridge           |
| 0010 | Costing strategy split refactor — preserve UX, internal change | Communicate to costing users this is a non-breaking change |

---

## 6. Technology-specific rules to encode (FLEXO / Die-cut)

This section preserves the substantive specs from the earlier (now-misdirected) Brady MES
IMPLEMENTATION.md §9.6, mapped to Ops Control's reality.

### 6.1 Flexo

Inputs (already collected by Standard/Complex pricing UI today): substrate class, web width
(mm), repeat (mm), color count, ink type (UV/Water/Solvent), die required.

Cost categories that costing engine emits, each with `rule_id`:

- `flexo.substrate` — `(repeat × web × density × qty × (1 + setup_scrap + run_scrap)) × price`
- `flexo.plates` — `colors × plate_unit_cost`, amortize via `plate_asset.last_used_at` within
  a configurable reuse window (default 90 days)
- `flexo.ink` — `colors × coverage% × qty × repeat_area × ink_yield_g_per_m² × ink_price_per_kg`
- `flexo.setup_time` — lookup from setup matrix (colors × web-width × has_die)
- `flexo.run_time` — `qty × repeat_mm / (run_speed_mpm × 1000 × 60)` minutes; lookup
  `run_speed_mpm` by substrate × colors
- `flexo.makeready_scrap` — substrate cost during setup minutes
- `flexo.run_scrap` — `qty × run_scrap_pct` (typ. 2–4% UV flexo on PE)
- `flexo.color_sequence_premium` — extra cleaning if dark→light

### 6.2 Die-cut, Flatbed

Inputs: sheet size, knife meters, ups, die status (existing/new).

- `flatbed.die` — new SKU charges full `new_die_cost`; existing reuses amortized
  `die_unit_cost / lifetime_hits × qty`
- `flatbed.setup_time` — `setup_base + complexity × knife_meters`
- `flatbed.run_time` — `qty / hits_per_minute`; `hits_per_minute = f(thickness, complexity)`
- `flatbed.makeready_scrap` — `setup_sheets × sheet_cost`
- `flatbed.run_scrap` — `qty × flatbed_scrap_pct` (typ. 1–2%)
- `flatbed.operator_cost` — run_time × labor × `labor_persons` (default 1, 2 for large)
- maintenance ticket auto-created when `cumulative_hits / lifetime_hits > 0.85`

### 6.3 Die-cut, Rotary

Inputs: web width, repeat, die type (`ROTARY_SOLID` or `ROTARY_FLEXIBLE`), inline boolean.

- `rotary.die_solid` — full `solid_die_unit_cost` for new SKU; amortize over expected reuse
- `rotary.die_flexible` — flexible die unit cost only; magnetic cylinder is a fixed asset
  (already in `machine_rate.rate_per_hour` of the rotary work centre)
- `rotary.setup_time` — `setup_base + (web_width_class × 5)`; less if same die as previous op
- `rotary.run_time` — `qty × repeat_mm / (rotary_speed_mpm × 1000 × 60)`
- `rotary.makeready_scrap`, `rotary.run_scrap` — typ. 0.5–1.5%
- **Inline rule:** if previous op is FLEXO and `inline=true` and same machine, suppress
  `rotary.run_time` line, add small `flexo.inline_die_premium` to the FLEXO line
- **Schedule hint:** when `die_id` differs from previous op's die_id, planning emits a
  `DIE_CHANGE` setup penalty

### 6.4 OEE telemetry signal map

| WC type         | Counter                         | Speed    | State                      | Quality                         | Notes                                                   |
| --------------- | ------------------------------- | -------- | -------------------------- | ------------------------------- | ------------------------------------------------------- |
| FLEXO           | impressions OR meters           | m/min    | running/setup/stop/fault   | inline reject (BST/AVT)         | web break = reason code                                 |
| DIE_CUT_FLATBED | hits                            | hits/min | running/setup/stop/loading | reject sheets via operator scan | sheet feeder jam = dedicated reason code                |
| DIE_CUT_ROTARY  | meters (mirror flexo if inline) | m/min    | running/setup/stop/fault   | reject from die failure         | when inline with flexo, share OEE — do not double-count |

### 6.5 Reason code seed (insert via migration)

- `WEB_BREAK` (FLEXO, ROTARY)
- `INK_VISCOSITY_ADJUST` (FLEXO)
- `COLOR_REGISTRATION` (FLEXO)
- `PLATE_DAMAGE` (FLEXO)
- `ANILOX_CLEAN` (FLEXO)
- `SHEET_FEEDER_JAM` (FLATBED)
- `DIE_DAMAGE` (FLATBED, ROTARY)
- `DIE_CHANGE` (FLATBED, ROTARY)
- `STRIP_BREAK` (ROTARY)
- `MAGNETIC_CYLINDER_SLIP` (ROTARY)
- `CUSTOMER_HOLD`, `MATERIAL_OUT`, `SHIFT_CHANGE`, `MEAL_BREAK` (all)

---

## 7. Dependencies & decisions to confirm

1. **OPC UA library**: `node-opcua` (~600KB, MIT, well maintained). Approve.
2. **MQTT client**: `mqtt.js` (~50KB). Approve.
3. **PDF preflight**: do we use `pdf-lib` + custom checks, or shell out to Ghostscript? Ghostscript
   is heavier but better at color/font validation. Decision needed Sprint MES-8.
4. **Customer portal hosting**: same Express server (different mount path) or separate process?
   Recommendation: separate process so a portal compromise doesn't expose internal API surface.
5. **Performance budget for OEE**: with ~50 machines × 60 events/min × 24h = 4.32M rows/day,
   SQLite is fine but we should partition `production_event` by month after 90 days. Decision
   needed Sprint MES-3.
6. **Pilot machines**: which two specific machines for MES-12?

---

## 8. What this plan deliberately does NOT do

To stay aligned with ADR-0001 ("on-prem, small-LAN, no Postgres/Redis"):

- ❌ Does NOT introduce Postgres, Kafka, Redis, MinIO, Keycloak, Camunda, Kubernetes.
- ❌ Does NOT split into microservices. Stays as one Node + SQLite app with bounded contexts
  (the existing v1.3 layout).
- ❌ Does NOT replace the existing AI agent layer in `.claude/`. Reuses slash commands,
  rules, agents.
- ❌ Does NOT migrate existing JSON-on-disk data — those datasets stay file-backed until the
  v1.2 → v1.3 migration plan completes them in its own cadence.

---

## 9. Relationship to earlier Brady MES docs

In April 2026 an external "Brady MES" architecture bundle was drafted (4 files: a `.docx`
solution architecture, an `IMPLEMENTATION.md`, an `OPS-CONTROL-IMPORTER.md`, a Spring Boot
skeleton). It assumed Brady = greenfield Java/Postgres/Kafka MES, and that "Ops Control v1.2"
was an Excel pricing workbook to be imported.

That assumption is wrong. This document supersedes those for our reality:

| Earlier doc                            | Status under this plan                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brady-mes-solution-architecture.docx` | KEEP — useful as a reference for what a generic full MES looks like; cite when Steering asks why we make certain choices                                                                |
| `brady-mes-IMPLEMENTATION.md`          | DEPRECATED — Java/Spring stack does not match ADR-0001. Salvage §1.1a (technology scope), §6.1 (state machine), §9.6 (technology rules), §11.2 (QC schema) — already incorporated above |
| `brady-mes-OPS-CONTROL-IMPORTER.md`    | RETIRED — built on a wrong premise (Excel workbook). Replaced by §3 + §4 of this plan                                                                                                   |
| `brady-mes-skeleton/` (Spring Boot)    | RETIRE — does not match v1.3 stack                                                                                                                                                      |
| `brady-mes-PROMPTING-GUIDE.md`         | KEEP, ADAPT — replace task-prompt examples with sprint-prompt examples that target this plan                                                                                            |

---

## 10. Next steps

1. Approve this plan with maintainer (Thiep) — 1 day.
2. Open ADR-0006 through 0010 (§5) — 2 days.
3. Schedule MES-1 sprint kick-off; assign owner.
4. Update `CHANGELOG.md` with `v1.4.0-mes-extension` placeholder section.
5. Update `.claude/rules/project-structure.md` to include the new `apps/kiosk/`,
   `apps/edge-gateway/`, `apps/portal/`, `apps/mobile/` deployment shells.
6. Convert §6 reason-code seed list into a Flyway-equivalent SQLite migration script under
   `scripts/migrations/`.
7. Run `/spec` slash command on Sprint MES-1 to generate the formal PRD before implementation.

---

> **Document owner:** Thiep Dang · **Status:** Draft 0.1 · **Last updated:** 2026-04-30
