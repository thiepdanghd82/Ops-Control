# Sprint 2 Cutover & Fallback-Removal Checklist

**Status:** Sprints 2.1–2.5 complete. Sprint 2.6 awaits 14-day observation.

---

## Current state (end of session 2)

- ✅ ops.db populated with 7 datasets (74,839 total rows), parity-verified
- ✅ Shadow-write on all 5 import routes + clear endpoints
- ✅ All `/api/shared/*` routes through repository layer
- ✅ Quotes + RFQ tracker + Sample tracker migrated
- ✅ Per-dataset env override (`OPS_BACKEND_<NAME>=sqlite|file`)
- ✅ Daily SQLite backup wired into `/save-all` (118 MB snapshot, 30-day retention)
- ✅ Default env = `file` → zero production behavior change

---

## Cutover runbook (when ready)

### Phase A — Shadow observation (1–2 days)

No code change. Just monitor:

- `/api/ping` response — check `uptime_sec` + `memory_mb` stable
- Server log — `grep -c "shadowWrite.*failed"` = 0
- Parity check: `node scripts/verify-parity.js` daily — expect 0 drift

### Phase B — Per-dataset cutover (1 dataset/day)

Flip one dataset at a time via env, restart, monitor 24h:

```bash
export OPS_BACKEND_BOM=sqlite        # day 1
export OPS_BACKEND_ROUTING=sqlite    # day 2
export OPS_BACKEND_INVENTORY=sqlite  # day 3
# …etc. Keep other datasets on file backend until proven.
```

Rollback at any point: unset the env var, restart, done.

### Phase C — Master switch

After all per-dataset overrides are green for 3+ days:

```bash
export OPS_DATA_BACKEND=sqlite
# unset per-dataset overrides (master takes precedence)
```

### Phase D — Fallback removal (this sprint 2.6, deferred)

Only after `OPS_DATA_BACKEND=sqlite` has run **14 continuous days** with zero rollback event.

**What to remove:**

1. Delete `dataSync.js` functions that repo no longer needs:
   - `getManufacturingStructures()`, `getRoutingOperations()`, `getInventory()` — repo handles these
   - Keep: `getProducts()`, `getWorkCenters()`, `getBOMForPart()`, `getRoutingForPart()` (still used by non-repo callers)
2. Delete the `fileBackend` fallback chain inside `sqliteBackend.js`. If ops.db is missing in production, fail fast instead of silently serving stale data.
3. Delete `server/data/.pre-sqlite-20260417_231938/` snapshot (redundant — backup/SQLite/ serves that purpose now).
4. Optionally archive `server/data/Library/*.js` source files to `server/data/Library/.archive/` — still useful for audit/history but shouldn't be in hot path.

**DO NOT:**

- Delete `Backup/Data/auto_*.json` — those are independent from SQLite, part of broader backup chain.
- Remove `OPS_DATA_BACKEND` env var — keep for emergency rollback (default → `sqlite` after cutover).

---

## Observation period — what to watch

| Metric                           | Tool                                     | Target                     |
| -------------------------------- | ---------------------------------------- | -------------------------- |
| SQLite read latency p95          | `/api/ping` (add if needed)              | < 50 ms                    |
| Shadow-write failure rate        | `grep 'shadowWrite' server.log \| wc -l` | 0                          |
| Parity drift                     | `node scripts/verify-parity.js`          | 7/7 match                  |
| `/save-all` daily backup success | Check `Backup/SQLite/ops_*.sqlite`       | 1 new file per day         |
| ops.db file growth               | `du -h server/data/ops.db`               | < 200 MB (alerts > 500 MB) |
| WAL file size                    | `du -h server/data/ops.db-wal`           | < 64 MB (checkpoints auto) |
| Memory RSS                       | `/api/ping` `memory_mb`                  | < 300 MB baseline          |

---

## Rollback triggers

Flip back to file backend **immediately** if any of these:

1. **Any parity drift** — `verify-parity.js` reports ≠ 0 for any dataset
2. **Quote save fails** with SQLite errors in log
3. **Import drops rows** (shadow-write failures > 0)
4. **WAL file exceeds 100 MB** (checkpoint stuck)
5. **Memory leak** (`memory_mb` grows > 500 MB without new load)

Rollback command:

```bash
# Stop server
unset OPS_DATA_BACKEND
unset OPS_BACKEND_BOM OPS_BACKEND_ROUTING OPS_BACKEND_INVENTORY \
      OPS_BACKEND_FINISHED_GOODS OPS_BACKEND_RAW_MATERIALS \
      OPS_BACKEND_MATERIALS_NPI OPS_BACKEND_MATERIALS_SOURCING \
      OPS_BACKEND_QUOTES OPS_BACKEND_RFQ_TRACKER OPS_BACKEND_SAMPLE_TRACKER
# Start server
npm run dev:server
```

JS source files were never modified — file backend resumes transparently.

---

## Sprint 2.6 — Ready-to-execute script (after 14 days)

Save the following as `scripts/remove-sqlite-fallback.sh` when it's time:

```bash
#!/usr/bin/env bash
set -e
# Verify cutover has been running for ≥ 14 days
OPS_DB="server/data/ops.db"
if [ ! -f "$OPS_DB" ]; then echo "ops.db missing — aborting"; exit 1; fi
DB_AGE=$(( ($(date +%s) - $(stat -f %m "$OPS_DB")) / 86400 ))
if [ "$DB_AGE" -lt 14 ]; then
  echo "ops.db is only $DB_AGE days old — waiting for 14-day observation"; exit 1
fi
echo "✓ Observation period met ($DB_AGE days). Proceeding."
# Archive pre-migration snapshot
mv "server/data/.pre-sqlite-20260417_231938" "server/data/Backup/.archived-pre-sqlite" 2>/dev/null || true
# Mark fallback as removed in a tracking file for git log traceability
echo "$(date -Iseconds): fallback removed" > server/data/.fallback-removed
echo "✓ Fallback removal complete. Next: code PR to drop sqliteBackend fallbacks + unused dataSync methods."
```

**Not executed in this session.** Awaits observation data + stakeholder sign-off.
