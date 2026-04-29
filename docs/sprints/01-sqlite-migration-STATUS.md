# SQLite Migration — Execution Status

**Date:** 2026-04-17
**Executor:** Claude (session-bounded)
**State:** ✅ **Phase 1 complete — SQLite populated, file backend still primary**

---

## What was done

1. **Pre-flight**
   - Snapshot: `server/data/.pre-sqlite-20260417_231938/` (46 MB full copy of `Library/`)
   - Marker file: `server/data/.migration-marker` → `SNAPSHOT_DIR=.pre-sqlite-20260417_231938`

2. **Dependency**
   - `better-sqlite3@11.x` installed

3. **DB infrastructure**
   - `server/db/schema.sql` — typed tables for BOM, Routing, IFS Inventory (3 kinds), Materials (NPI + Sourcing) + `_migration_state` tracker
   - `server/db/connection.js` — singleton w/ WAL, busy_timeout=5000, foreign_keys=on
   - `server/db/init.js` — idempotent schema applier

4. **Migration**
   - `scripts/migrate-to-sqlite.js` — supports `--dry-run`, `--commit`, `--dataset=X`, `--force`
   - Every dataset inserted inside a single transaction — abort = `ROLLBACK`
   - Row count + SHA256 checksum verified against source after commit
   - **Migrated datasets** (production `server/data/ops.db`, 116 MB):
     | Dataset | Rows | Source checksum | DB checksum | Match |
     |---|---|---|---|---|
     | bom | 19,539 | `287c58c5…` | `287c58c5…` | ✓ |
     | routing | 37,391 | `32657166…` | `32657166…` | ✓ |
     | inventory (inventory kind) | 8,696 | — | — | ✓ |
     | inventory (finished_goods) | 4,092 | — | — | ✓ |
     | inventory (raw_materials) | 2,127 | — | — | ✓ |
     | materials (npi) | 2,687 | — | — | ✓ |
     | materials (sourcing) | 2,234 | — | — | ✓ |

5. **Repository layer**
   - `server/repositories/index.js` — picks backend by `OPS_DATA_BACKEND` env var
   - `server/repositories/backends/fileBackend.js` — delegates to `dataSync.js` (zero behavior change)
   - `server/repositories/backends/sqliteBackend.js` — reads from ops.db, **per-dataset fallback to file backend** if SQLite table is empty

6. **Parity verifier**
   - `scripts/verify-parity.js` — loads every dataset from both backends, compares count + sorted-row SHA256
   - Latest run: **7/7 datasets parity-match, 0 drift**

7. **Wired into 2 HTTP routes**
   - `GET /api/shared/bom` now reads via `repo.listBom()`
   - `GET /api/shared/routing` → `repo.listRouting()`
   - Default env (`OPS_DATA_BACKEND=file` or unset) = pre-migration behavior

---

## What is NOT done (intentional)

- **Writes**: `/api/import/*` still writes only to JS files. SQLite goes stale whenever a new dataset is uploaded. Fix: add shadow-write in `writeJsDataFile()` so imports hit both stores.
- **Not-yet-wired routes**: `/api/shared/inventory`, `/api/shared/products`, etc. still call `dataSync.js` directly. Can be flipped per-route when ready.
- **Datasets still file-only**: quotes, trackers (RFQ/Sample), finance, ink_calc, DDL, rates. These benefit less from indexed queries; schema design deferred.
- **Cutover**: `OPS_DATA_BACKEND` defaults to `file`. Flip to `sqlite` only after a week of shadow-write observation.

---

## How to run / test

```bash
# Re-run dry-run on current source files
cd "server/data/../.." && node scripts/migrate-to-sqlite.js --dry-run

# Parity check (expects both backends to match)
node scripts/verify-parity.js

# Start server with SQLite backend
OPS_DATA_BACKEND=sqlite npm run dev:server

# Start with file backend (default)
npm run dev:server
```

---

## Rollback procedure

### Full rollback (worst case)
```bash
cd "server/data"
# 1. stop server
# 2. ensure OPS_DATA_BACKEND unset or =file in env
# 3. delete ops.db + WAL files
rm -f ops.db ops.db-shm ops.db-wal
# 4. original JS files were never modified — nothing to restore
```

The Library snapshot at `server/data/.pre-sqlite-20260417_231938/` exists as a **belt-and-suspenders** safety net but should not be needed because no JS file was overwritten.

### Code rollback
Revert these commits:
- `server/db/**` (new dir)
- `server/repositories/**` (new dir)
- `scripts/migrate-to-sqlite.js`, `scripts/verify-parity.js` (new files)
- `server/routes/shared.js` (only 2 route handlers changed to use `repo.*` — trivial revert)
- `package.json` — remove `better-sqlite3` dep

No production code behavior changes when `OPS_DATA_BACKEND` is unset.

---

## What still needs a real sprint

1. **Shadow-write on imports** — update `server/routes/import.js` to also call `sqliteBackend.upsertXxx()` so ops.db stays current. 1-2 days.
2. **Migrate transactional datasets** (quotes + trackers) — schema design + code changes on `/save-all` path. 3-4 days.
3. **Wire remaining /api/shared routes** through `repo.*`. 0.5 day.
4. **Per-dataset cutover** (shadow-read then sqlite-only). 2 days observation.
5. **Auto-backup ops.db** (`.backup` command daily). 0.5 day.
6. **DELETE the file fallback path** once confident. 0.5 day + 14 days observation.
7. **Retention/vacuum schedule** for WAL growth. 0.5 day.

These items are documented in [01-sqlite-migration.md](./01-sqlite-migration.md) week-2 plan.

---

## Verification evidence

### Parity checker output
```
Dataset             File rows   DB rows     File cksum       DB cksum         Match
─────────────────── ─────────── ─────────── ──────────────── ──────────────── ─────
bom                       19539       19539 287c58c5c9b2df55 287c58c5c9b2df55   ✓
routing                   37391       37391 326571669623a8a3 326571669623a8a3   ✓
inventory                  8696        8696 376b41a7b8794706 376b41a7b8794706   ✓
finishedGoods              4092        4092 3177fa040a99c1ef 3177fa040a99c1ef   ✓
rawMaterials               2127        2127 a8a4609a231b23f6 a8a4609a231b23f6   ✓
materialsNpi               2687        2687 4637233660701934 4637233660701934   ✓
materialsSourcing          2234        2234 79713ae0356d60be 79713ae0356d60be   ✓

All datasets parity-match.
```

### Byte-level spot check
```
BOM first-3 sorted rows equal: true
Materials first-3 sorted rows equal: true
BOM row #10000 byte-equal: true
```

### Client test suite
```
ℹ tests 85
ℹ pass 85
ℹ fail 0
```

---

## Files changed

**New:**
- `server/db/schema.sql`
- `server/db/connection.js`
- `server/db/init.js`
- `server/repositories/index.js`
- `server/repositories/backends/fileBackend.js`
- `server/repositories/backends/sqliteBackend.js`
- `scripts/migrate-to-sqlite.js`
- `scripts/verify-parity.js`
- `server/data/ops.db` (data file, 116 MB)
- `server/data/.pre-sqlite-20260417_231938/` (safety snapshot, 46 MB, can delete after 30 days)

**Modified:**
- `package.json` + `package-lock.json` (better-sqlite3 dep)
- `server/routes/shared.js` — `/bom` and `/routing` handlers call `repo.*`

**Not modified:**
- Any `server/data/Library/*.js` or `*.json` source file
- Any client-side code
- Any `calcEngine.js`, `dataSync.js` internals (only imported by new code)
