# Sprint 01 — SQLite Migration (Optimal Plan)

**Duration:** 10 working days (2 calendar weeks)
**Owner:** Backend engineer + 1 QA for verification
**Risk tier:** 🔴 High — lose data = lose supplier pricing + quote history
**Status:** DRAFT — awaiting stakeholder sign-off

---

## 1. Goal

Replace the `.js` file-as-database pattern with SQLite at `server/data/ops.db` **without** losing a single row of production data and **without** breaking any existing API endpoint.

## 2. Why now

| Current pain                                                                      | Impact today                                  | After SQLite                             |
| --------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `Routing_Operations/routing_ops_data.js` = 17 MB, parsed on every request         | ~200ms cold read per tab load                 | <5ms indexed query                       |
| Two users hit `POST /save-all` simultaneously → last-write-wins, silent data loss | Happens ~monthly based on audit log           | Transaction isolation, `BEGIN IMMEDIATE` |
| No schema — any field drift is silent                                             | Already caused `ddlSites` vs `ddlSitesDB` bug | `CREATE TABLE` enforces shape            |
| No partial recovery if write fails mid-way through `/save-all`'s 14 files         | Manual restore from `Backup/Data/auto_*.json` | Atomic TX → all-or-nothing               |
| Can't query: "materials updated in last 7 days" without full-file scan            | Reports are manual                            | SQL `WHERE updated_at > ?`               |
| Files grow unbounded (17 MB today → 50 MB in 2 years)                             | Server memory pressure                        | Pagination on demand                     |

## 3. Non-goals (out of scope)

- ❌ **Auth data** (`users.json`, `sessions.json`, `audit_log.json`, `totp_secrets.enc`) — stay as JSON. Auth doesn't need SQL and keeping it file-based lets us recover if the DB is corrupted.
- ❌ **Products layout/** images — binary files, stay on disk.
- ❌ **Backup snapshots** — continue writing JSON backups daily. These are the dual-run safety net.
- ❌ **Client-side code changes** — none. Same `/api/*` contracts.

## 4. Architecture decision

### 4.1 Library choice: `better-sqlite3`

| Option                   | Rejected?   | Reason                                                                                                                                                 |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `better-sqlite3`         | ✅ Selected | Sync API matches existing code style (everything is `fs.readFileSync`). No callback/promise refactor. Compiled for Node, ~10× faster than node-sqlite3 |
| `sqlite3` (node-sqlite3) | ❌          | Async callbacks require rewriting every handler                                                                                                        |
| `knex`/`drizzle`         | ❌          | ORM overhead + learning curve; we don't need it for 8 tables                                                                                           |
| `SQLite via WASM`        | ❌          | Dev experience hit for marginal portability gain                                                                                                       |

### 4.2 Rollout model: **shadow-write → shadow-read → cutover**

Single backend switch `process.env.OPS_DATA_BACKEND` with values:

- `file` (default, current) — read & write JS files only
- `shadow-write` — primary path reads JS; on write, ALSO insert into SQLite. JS is source of truth.
- `shadow-read` — primary path reads SQLite; on miss, fall back to JS. Writes go to BOTH.
- `sqlite` (target) — read & write SQLite only. JS files become backups.

**Daily rotation during week 2**:

- Day 6 AM: promote 1 dataset (materials) from `shadow-write` → `shadow-read`. Monitor 24h.
- Day 7: next dataset (BOM). Etc.
- Day 10: flip to `sqlite` mode. JS files kept untouched for 14 more days as emergency rollback.

### 4.3 Schema design: modest normalization, preserve list shape

Principle: the client's `DataBrowser` expects `{ headers: [...], rows: [[...]] }`. Rather than reshape everything, keep a `headers` column + `data_json` per-row as fallback, while **extracting the fields we actually query** into typed columns.

```sql
-- Reference data (read-heavy, infrequent writes)
CREATE TABLE materials (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT,
  price           REAL,
  uom             TEXT,
  supplier        TEXT,
  thickness       REAL,
  color           TEXT,
  surface         TEXT,
  adhesive        TEXT,
  moq             INTEGER,
  lead_time_days  INTEGER,
  date_updated    TEXT,
  raw_json        TEXT NOT NULL,      -- full original row for forward-compat
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_materials_type ON materials(type);
CREATE INDEX idx_materials_supplier ON materials(supplier);

CREATE TABLE bom (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_part         TEXT NOT NULL,
  parent_desc         TEXT,
  component_part      TEXT NOT NULL,
  component_desc      TEXT,
  qty_per_assembly    REAL,
  scrap               REAL,
  scrap_pct           REAL,
  uom                 TEXT,
  structure_type      TEXT,
  alternative_no      TEXT,
  effectivity         TEXT,
  planner             TEXT,
  pitch               REAL,
  cavity              INTEGER,
  color_nums          INTEGER,
  raw_json            TEXT NOT NULL,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_part, component_part, alternative_no)
);
CREATE INDEX idx_bom_parent ON bom(parent_part);
CREATE INDEX idx_bom_component ON bom(component_part);
CREATE INDEX idx_bom_planner ON bom(planner);

CREATE TABLE routing_operations (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  part_no                 TEXT NOT NULL,
  part_desc               TEXT,
  operation_no            INTEGER NOT NULL,
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
  routing_type            TEXT,             -- "Manufacturing" | "Repair"
  efficiency_factor       REAL,
  site                    TEXT,
  state                   TEXT,             -- "Buildable" | "Tentative"
  raw_json                TEXT NOT NULL,
  updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(part_no, operation_no, alternative, routing_revision, routing_type)
);
CREATE INDEX idx_routing_part ON routing_operations(part_no);
CREATE INDEX idx_routing_wc ON routing_operations(work_centre_no);

CREATE TABLE ifs_inventory (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  kind              TEXT NOT NULL,        -- 'inventory' | 'finished_goods' | 'raw_materials'
  part_no           TEXT NOT NULL,
  part_desc         TEXT,
  qty_on_hand       REAL,
  uom               TEXT,
  location          TEXT,
  lot_no            TEXT,
  raw_json          TEXT NOT NULL,
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_inv_kind_part ON ifs_inventory(kind, part_no);

-- Rate tables: one row per (site, workcenter)
CREATE TABLE rates (
  site            TEXT NOT NULL,
  workcenter      TEXT NOT NULL,
  machine_rate    REAL,
  labor_rate      REAL,
  crew            INTEGER,
  speed_uom       TEXT,
  overhead        REAL,
  raw_json        TEXT NOT NULL,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site, workcenter)
);

-- DDL (per-site drop-down lists). Stored as JSON doc per site — small,
-- infrequently queried, and shape varies section to section.
CREATE TABLE ddl (
  site        TEXT PRIMARY KEY,
  data_json   TEXT NOT NULL,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transactional data: quotes + versioning
CREATE TABLE quotes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  rfq_no       TEXT,
  ccl_pn       TEXT,
  direct_cu    TEXT,
  end_cu       TEXT,
  calc_type    TEXT NOT NULL,             -- 'standard' | 'complex'
  site         TEXT,
  state_json   TEXT NOT NULL,             -- entire stdState or cplxState
  summary_json TEXT,                      -- denormalized per-tier summary for fast list view
  created_by   INTEGER,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_quotes_rfq ON quotes(rfq_no);
CREATE INDEX idx_quotes_ccl ON quotes(ccl_pn);
CREATE INDEX idx_quotes_updated ON quotes(updated_at DESC);

CREATE TABLE quote_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  state_json  TEXT NOT NULL,
  saved_by    INTEGER,
  saved_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  note        TEXT
);
CREATE INDEX idx_qv_quote ON quote_versions(quote_id, version DESC);

-- Trackers
CREATE TABLE rfq_tracker (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  rfq_no       TEXT,
  customer     TEXT,
  product      TEXT,
  stage        TEXT,
  owner        TEXT,
  result       TEXT,
  raw_json     TEXT NOT NULL,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sample_tracker (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  part_no        TEXT,
  customer       TEXT,
  overall_status TEXT,
  raw_json       TEXT NOT NULL,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Finance, InkCalc: stored as JSON docs (schema too fluid, aggregations done client-side)
CREATE TABLE finance (
  year       INTEGER PRIMARY KEY,
  data_json  TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE ink_calc (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  data_json  TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migration tracking
CREATE TABLE _migration_state (
  dataset     TEXT PRIMARY KEY,
  mode        TEXT NOT NULL,   -- 'file' | 'shadow-write' | 'shadow-read' | 'sqlite'
  last_sync   DATETIME,
  row_count   INTEGER,
  checksum    TEXT             -- SHA256 of ordered raw_json concat, for drift detection
);
```

**WAL mode enabled at connection time**: `PRAGMA journal_mode = WAL` gives us concurrent readers + single writer without the default locking penalty.

### 4.4 Repository abstraction

Insert a thin repository layer between route handlers and the data backend:

```
server/
├── data/
│   ├── ops.db                    ← new
│   └── Library/*.js              ← kept during dual-run
├── repositories/                 ← new dir
│   ├── index.js                  ← picks backend by env var
│   ├── backends/
│   │   ├── fileBackend.js        ← wraps current dataSync.js logic
│   │   └── sqliteBackend.js      ← new
│   ├── materialsRepo.js
│   ├── bomRepo.js
│   ├── routingRepo.js
│   ├── quotesRepo.js
│   └── ...
└── services/
    └── dataSync.js               ← becomes thin wrapper that delegates to repo
```

Each repo exports the same methods regardless of backend:

```js
// repositories/materialsRepo.js
export function listMaterials() {
  return backend.listMaterials();
}
export function upsertMaterials(rows) {
  return backend.upsertMaterials(rows);
}
export function getMaterialByCode(code) {
  return backend.getMaterialByCode(code);
}
```

Route handlers import from `repositories/`, never from file paths. Swapping backends = flip env var.

---

## 5. Day-by-day plan

### Week 1 — Foundation + shadow-write

| Day   | Deliverable                                                                                                                                           | Exit criteria                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **1** | `better-sqlite3` dep added; `server/db/init.js` creates `ops.db` with full DDL; repository skeleton (materials, bom, routing) with file backend wired | `node scripts/init-db.js` creates empty DB with all tables. All existing tests still green.                                |
| **2** | Migration script `scripts/migrate-to-sqlite.js` for Materials + IFS Inventory. Dry-run mode prints insert count + SHA256 checksum without writing DB  | Dry-run matches source file row count exactly. Checksum stable across 3 runs.                                              |
| **3** | Same for BOM + Routing Operations. Shadow-write wired: `upsertMaterials` writes to BOTH file AND SQLite when mode=`shadow-write`                      | `POST /api/import/materials` writes to `materials_data.js` + `materials` table. Both have identical row count + checksums. |
| **4** | Shadow-write for Rate tables, DDL, Trackers, Quotes. Atomic TX wrapper for `/save-all` (only around the SQLite side)                                  | `POST /save-all` touches all 14 datasets; SQLite transaction rolls back on any write error.                                |
| **5** | `scripts/verify-parity.js` script: walks every dataset, compares row count + SHA256 checksum between file vs DB; emits HTML report with drift rows    | Report shows 0 drift on fresh data. Seed 10 known-bad rows → report flags them.                                            |

**End of week 1 gate:** Stakeholder (user + Hana) signs off on the parity report. If drift > 0 rows, sprint pauses until resolved.

### Week 2 — Shadow-read + cutover

| Day    | Deliverable                                                                                                                                                                            | Exit criteria                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **6**  | Materials dataset: flip mode=`shadow-read`. All Material Cost tab reads come from SQLite. Writes still dual-write. 24h monitoring of `/api/ping` library_sizes + error logs            | 24h with 0 elevated errors, response time /api/shared/materials < 50ms (currently ~200ms).  |
| **7**  | Same rotation: BOM → shadow-read. Mfg Structures tab served from SQLite.                                                                                                               | Zero regression in Mfg Structures tab. Cost engineer signs off after running 3 test quotes. |
| **8**  | Routing Operations → shadow-read. Quotes table → shadow-read (read list from SQLite, load state_json when opening).                                                                    | Quote History tab loads 500 quotes in < 500ms.                                              |
| **9**  | Remaining datasets: Rates, DDL, Trackers, Finance, InkCalc → shadow-read. Full regression: run all saved quotes through the calc engine, compare totals against pre-migration snapshot | 0 quote delta > $0.001/unit.                                                                |
| **10** | Flip env var to `sqlite` mode. Disable shadow-write for speed. File backend kept loaded but unused. Remove `_CCL_*_DATA` file refreshes from `/save-all`. Announce to team.            | Production running on SQLite for 4 hours with no rollback event.                            |

**Post-sprint (Week 3 observation)**: file backend stays loaded as fallback for 14 more days. Any critical issue → flip `OPS_DATA_BACKEND=file` and JS files catch writes again. Day 24: delete the fallback code.

---

## 6. Migration script details

Key risk: the JS files are parsed via regex (`parseJsDataFile` in `dataSync.js`) — not standard JSON. One malformed row = skipped row + silent data loss.

**Guardrails in `scripts/migrate-to-sqlite.js`**:

1. Parse source file → count rows
2. Insert into SQLite inside ONE transaction
3. After commit, count rows in DB
4. SHA256 checksum of `JSON.stringify(rows.sort())` on BOTH sides
5. If count differs OR checksum differs → `ROLLBACK` + exit 1 + write diff report to `logs/migrate_diff_<dataset>_<ts>.json`
6. Only on parity match, update `_migration_state` row

```bash
node scripts/migrate-to-sqlite.js --dataset=materials --dry-run
# DRY RUN: 2687 rows would be inserted
# Checksum file: a3f8…
# Checksum db:   (dry-run)

node scripts/migrate-to-sqlite.js --dataset=materials --commit
# Inserting 2687 rows…  [done in 340ms]
# Checksum file: a3f8…
# Checksum db:   a3f8…
# ✅ Parity match. _migration_state updated.
```

---

## 7. Rollback plan (per-day)

| Day         | How to roll back                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-5         | Just set `OPS_DATA_BACKEND=file`. SQLite was write-shadow only; discard `ops.db`.                                                                                                       |
| 6-9         | Same env flip. Shadow-write was active → JS files have current data. No rollback data loss.                                                                                             |
| 10          | Shadow-write turned off. Rollback needs the `auto_*.json` backup from the hour before cutover + re-run migration from fresh. Worst case: 1 hour of quote edits replayed from audit log. |
| Post-day 10 | JS files no longer updated. Full rollback = restore JS files from SQLite via `scripts/export-sqlite-to-files.js` (write this on day 9 as insurance).                                    |

---

## 8. Verification strategy

1. **Row-count parity check** — daily cron during sprint: compare source count vs DB count per dataset. Alerts on Slack if drift > 0.
2. **Checksum drift check** — SHA256 of sorted-rows JSON. Detects reordering/silent mutation.
3. **Quote recalc regression** — load every saved quote pre-migration, snapshot `calcAll` output. Post-migration, reload same quotes, diff outputs. Any field delta > 0.001 → block cutover.
4. **Synthetic load test** — simulate 5 concurrent `/save-all` calls with different payloads. Verify no row loss + transactions isolated.
5. **Corruption fuzzer** — inject malformed rows in one JS file, run migration. Migration must reject + report, never silently drop.

Scripts go in `scripts/verify/` and produce HTML reports in `logs/verify/*.html`.

---

## 9. Risk register

| Risk                                                      | Probability | Impact    | Mitigation                                                                                |
| --------------------------------------------------------- | ----------- | --------- | ----------------------------------------------------------------------------------------- |
| Migration script misses rows due to malformed regex parse | Med         | High      | Parity check blocks cutover; dry-run compares counts                                      |
| Quote state_json blob too large for SQLite TEXT column    | Low         | Med       | SQLite TEXT is unlimited in practice (supports up to 1 GB). Confirm largest quote < 1 MB. |
| Concurrent writes exceed WAL capacity under peak load     | Low         | High      | `PRAGMA busy_timeout = 5000`; stress test on day 9                                        |
| `better-sqlite3` native build fails on some OS at deploy  | Med         | Med       | Pre-build + cache in node_modules; document manual rebuild step                           |
| SQLite DB file corruption (disk issue)                    | Very Low    | Very High | Daily `.backup` to `Backup/ops_db_<date>.sqlite`; retain 30 days                          |
| Cutover day 10 hits an unknown bug → user can't save      | Low         | Very High | Keep shadow-write enabled for 24h post-cutover; 1-flip env var rollback ready             |
| Reporting queries get slow on 100k+ quotes                | Low         | Med       | Indexes listed above; add FTS5 virtual table later if needed                              |
| Silent duplicate primary keys during migration            | Low         | High      | UNIQUE constraints will raise; migration aborts; operator fixes source then re-runs       |

---

## 10. Cost & resources

- **Engineer time**: 10 working days, 1 senior backend eng.
- **Dependencies**: `better-sqlite3@11.x` (~4 MB node-gyp build).
- **Storage**: `ops.db` ≈ 40-60 MB at go-live (smaller than current JS files after compression).
- **Downtime during cutover**: < 60 seconds (restart server to flip env var).
- **User training**: none required — API contracts unchanged.

---

## 11. Definition of done

- [ ] All 10 datasets running on `OPS_DATA_BACKEND=sqlite` for 7 continuous days with no rollback.
- [ ] Cold-start tab load times: Mfg Structures < 500ms (was ~2s), Routing Ops < 500ms.
- [ ] `scripts/verify-parity.js` returns 0 drift across all datasets.
- [ ] All saved quotes load + recalc to identical totals as pre-migration snapshot.
- [ ] 5-user concurrent `/save-all` test: 0 row loss.
- [ ] Daily `.backup` of `ops.db` running and retention pruning.
- [ ] Rollback runbook tested (flip env var + verify JS files are current).
- [ ] `docs/ARCHITECTURE.md` updated with new data layer.

---

## 12. Open questions for sign-off

1. **Do we keep the JS files indefinitely as read-only mirror?** Pros: easy disaster recovery; Cons: extra write, drift risk. Recommend: yes, for 30 days post-cutover, then stop.
2. **Who owns `scripts/verify-parity.js` run schedule?** Proposal: cron daily during sprint, weekly post-cutover.
3. **Should we take this opportunity to add a Quote `version` column + expose version history UI?** Adds 2 days. Not required for migration but zero-cost to add while we're already reshaping quotes table.
4. **SSE vs polling for real-time quote updates?** Deferred — not required for SQLite migration, but SQLite makes it cheap later.

---

## 13. What I (Claude) can do without additional sign-off

Groundwork that doesn't touch production data:

- [x] This plan doc
- [ ] Write `server/db/init.js` + full DDL file (ready to run but not wired in)
- [ ] Write `scripts/migrate-to-sqlite.js` in dry-run-only mode (reads JS files, prints stats, no DB write)
- [ ] Write `scripts/verify-parity.js` skeleton
- [ ] Draft repository interface (`repositories/*Repo.js` method signatures) without implementation

Say the word and I'll scaffold those artifacts into the repo so the sprint team hits the ground running. Everything above is **read-only** relative to production data.

---

**Next step:** review this plan with Hana + Cost team, approve or redline, then decide whether to scaffold the groundwork (my next offer) or run the actual sprint end-to-end (needs dedicated engineer + 2-week calendar block).
