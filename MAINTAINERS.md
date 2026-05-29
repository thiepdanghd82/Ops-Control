# Ops Control — Maintainer Runbook

Last updated: 2026-04-19 (Sprint 35, reflects work through Sprint 34).
Audience: engineers + ops taking the codebase to the next phase.
Companion docs: [`DESIGN.md`](DESIGN.md) (visual language), [`docs/audit-2026-04-17/AUDIT_ROADMAP.md`](docs/audit-2026-04-17/AUDIT_ROADMAP.md) (original audit scope), [`CLAUDE.md`](CLAUDE.md) (dev workflow for AI-assisted sprints).

---

## 1. Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│ React client (Vite, code-split per tab)                         │
│  ├─ App.jsx ──▶ AuthProvider ──▶ CalcProvider ──▶ AppBootstrap  │
│  │                                                              │
│  ├─ modules/cost       19 tabs (StandardCalc, ComplexCalc, …)   │
│  ├─ modules/planning   6 tabs (OrderEntry, WorkOrders, …)       │
│  ├─ context/                                                    │
│  │   ├─ CalcContext.jsx  (Provider + hook)                      │
│  │   ├─ calcReducer.js   (pure reducer + typed action creators) │
│  │   └─ calcHistory.js   (undo/redo wrapper)                    │
│  └─ services/                                                   │
│      ├─ calcEngine.js    (pure costing formulas)                │
│      ├─ inkCalcCore.js   (ink formula engine)                   │
│      ├─ stdMigration.js  (std state schema v1)                  │
│      └─ cplxMigration.js (cplx state schema v2)                 │
└─────────────────────────────────────────────────────────────────┘
         │ fetch /api/*
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ Express server (single Node process)                            │
│  ├─ routes/                                                     │
│  │   ├─ costApi.js   /api/auth, /api/save-all, /api/quotes      │
│  │   ├─ shared.js    /api/shared/* (dashboard, approvals)       │
│  │   ├─ planning.js  /api/planning/*                            │
│  │   └─ chat.js      /api/chat/*                                │
│  ├─ middleware/    auth, CSRF, rate-limit, siteAccess           │
│  ├─ repositories/  quotesStore (file + SQLite shadow), approval │
│  ├─ services/      authService, atomicWrite, notifications      │
│  └─ utils/         asyncLock, csvSafe, metrics, sanitize        │
└─────────────────────────────────────────────────────────────────┘
         │ JSON files + SQLite (shadow)
         ▼
  server/data/Library/*  ← source of truth today; SQLite mirror
                           ready for promotion per Sprint 7.x plan.
```

**Key invariants**

- **Pure calc engine**: `calcEngine.js` + `inkCalcCore.js` take `(state, lib)` and return numbers. No React, no fetch, no mutation of inputs. Testable in Node.
- **Single-process backend**: `asyncLock` is in-process. Horizontal scale requires swapping to `proper-lockfile` or Redis mutex — see Sprint 17 advice #7.
- **File-based persistence** with SQLite mirror. `quotesStore.upsertQuote` is the atomic write seam.

---

## 2. Scripts inventory

All scripts sit under [`scripts/`](scripts/). Run from repo root.

| Script                                                                   | Purpose                                                                                                                                  | Idempotent | Backup?                 |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------- |
| [`scripts/migrate-quote-va.js`](scripts/migrate-quote-va.js)             | Recompute canonical `va` / `contribution` / `gm` on stored quote results. Applied Sprint 9 + Sprint 21 (after engine formula alignment). | ✅         | `*.pre-va-migration-*`  |
| [`scripts/backfill-quote-results.js`](scripts/backfill-quote-results.js) | Upgrade thin-schema result (`{gm, va, s_ttl}`) to full breakdown via calcAll. Applied Sprint 15 for 9 historical quotes.                 | ✅         | `*.pre-backfill-*`      |
| [`scripts/backfill-audit-log.js`](scripts/backfill-audit-log.js)         | **Sprint 30** — import legacy `audit_log.json` into SQLite `audit_log` table. Idempotent with `--force-reimport` escape hatch.           | ✅         | N/A (append-only table) |
| [`scripts/migrate-planning-data.js`](scripts/migrate-planning-data.js)   | Planning module migration (pre-existing, untouched by Sprint 1-34).                                                                      | —          | —                       |
| [`scripts/check-perf-budget.js`](scripts/check-perf-budget.js)           | Fail if any built chunk exceeds its budget. Wired into `npm run verify`. Smoke tests (Sprint 27) verify the CLI exit code contract.      | ✅         | N/A                     |

Each script has a sibling `.test.js` with full unit coverage. Dry-run mode is the default; apply with `--apply` (or `--dry-run` flag toggle per script — check `--help`).

---

## 3. Test layout

| Layer               | Location                                                      | Runner               | Count (Sprint 25) |
| ------------------- | ------------------------------------------------------------- | -------------------- | ----------------- |
| Engine pure         | `client/src/services/*.test.js`                               | `node --test`        | 100+              |
| Engine golden       | `client/src/services/*.golden.test.js`                        | `node --test`        | 22                |
| Reducer contract    | `client/src/context/spFieldReducer.test.js`                   | `node --test`        | 10                |
| Migrations          | `client/src/services/*Migration.test.js`, `scripts/*.test.js` | `node --test`        | 27                |
| UI utils            | `client/src/utils/*.test.js`                                  | `node --test`        | 40+               |
| Server HTTP         | `server/http.integration.test.js`                             | `node --test`        | 25                |
| Server repo/service | `server/repositories/*.test.js`, `server/services/*.test.js`  | `node --test` + Jest | 200+              |
| Perf budget         | `scripts/check-perf-budget.test.js`                           | `node --test`        | 10                |

**Running tests**

```sh
cd client && npm test              # client-side (uses quoted glob — see note below)
cd client && npm run typecheck     # @ts-check pass
cd client && npm run analyze       # Sprint 32 — emit dist/bundle-stats.{html,json}
cd ..     && npm test              # server (Jest + node --test)
cd ..     && npm run perf-budget   # post-build bundle budget gate
cd ..     && npm run verify        # build + perf-budget + tests (end-to-end gate)
```

**Why the glob is quoted** (`'src/**/*.test.js'`): bash's default `**` doesn't recurse past 1 level. Quoted glob lets Node's test runner do the expansion — catches depth-3 files like `components/Shared/ErrorBoundary.test.js`. If you drop the quotes, tests at depth ≥3 will silently skip.

---

## 4. Schema versions

### Standard state — `_schema_version: 1` ([`stdMigration.js`](client/src/services/stdMigration.js))

| Version       | Changes                                                                                                       | Date      |
| ------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| v0 (implicit) | Pre-Sprint 18 shape: no version marker                                                                        | —         |
| v1            | Stamps version + `_mid` back-fill on materials + numeric defaults (`active_moq_idx`, `num_moq`, `extra_moqs`) | Sprint 18 |

### Complex state — `_shape_version: 2` ([`cplxMigration.js`](client/src/services/cplxMigration.js))

| Version | Changes                                                                           |
| ------- | --------------------------------------------------------------------------------- |
| v1      | Legacy: FG-prefix heuristic for assembly, no explicit BOM                         |
| v2      | Adds `is_assembly: boolean` per SP + `bom[]` + `tooling_alloc[]` + version marker |

### Stored `result` shape (Sprint 14)

Saved quote `result` now includes the full money breakdown (29 fields via `serializeResultForPersist`). Pre-Sprint 14 quotes had only `{gm, va, s_ttl}` — all historical rows were backfilled by `scripts/backfill-quote-results.js` (Sprint 15).

### Migration flow at load

```
LOAD_QUOTE action
   │
   ├─ std  → upgradeStdState(state)  → stamps v1, ensures _mid, fills defaults
   └─ cplx → upgradeCplxState(state) → stamps v2, derives bom/is_assembly
```

Migrations are **idempotent** and **additive**. Short-circuit via reference equality when already at current version.

---

## 5. Formula canonical definitions

Sprint 21-22 aligned engine + UI to a single convention. Before then, four variants coexisted (stored `va` used `g_mat_cost`, UI recomputed with `s_mat_cost`, Contribution mixed full-vs-run labor, `gm_after_sga` used `g_ttl` while `gm` used `s_ttl`). Current canonical:

```
VA%           = 1 − (s_mat_cost + tooling + packing_ship) / sp_price
Contribution% = 1 − (s_mat_cost + tooling + packing_ship + run_labor_only) / sp_price
GM%           = 1 − s_ttl / sp_price
gm_after_sga  = 1 − (s_ttl + sga) / sp_price
```

Where `run_labor_only = labor_cost_internal − setup_labor_total`. Setup labor lives separately in `bd_setup_labor`.

**Display convention**: `s_mat_cost` bundles raw material + ink. The Cost Breakdown UI uses `matCostExcludingInk()` + `inkCostTotal()` so columns sum to subtotal (Sprint 16). `s_mat_cost` is NOT split at the engine — only at display.

**Why this matters**: any change to these formulas shifts every reported margin. Only modify with Finance sign-off. Golden tests in [`calcEngine.golden.test.js`](client/src/services/calcEngine.golden.test.js) lock each variant.

---

## 6. Perf budgets

Defined in [`scripts/check-perf-budget.js`](scripts/check-perf-budget.js). Rationale: ERP dashboards die from first-paint latency more than compute cost. Budgets enforce Sprint 24's build baseline + ~20% headroom.

| Chunk prefix      | Budget              | Sprint 24 actual | Headroom |
| ----------------- | ------------------- | ---------------- | -------- |
| `index` (shell)   | 290 kB              | 242 kB           | 17%      |
| `ComplexCalc`     | 100 kB              | 75 kB            | 25%      |
| `StandardCalc`    | 100 kB              | 71 kB            | 29%      |
| `Settings`        | 55 kB               | 44 kB            | 20%      |
| `CalcContext`     | 50 kB               | 36 kB            | 28%      |
| `InkCalculator`   | 50 kB               | 30 kB            | 40%      |
| `MaterialLibrary` | 40 kB               | 22 kB            | 45%      |
| Any other chunk   | 200 kB (global cap) | Max 19 kB        | —        |

Warn at 90% of budget. Wired into `npm run verify` — `npm run build` must land under budget before tests run.

---

## 7. Concurrency model

**Writes are serialized per-resource via `withLock(key, fn)`** ([`server/utils/asyncLock.js`](server/utils/asyncLock.js)). Keys in use:

- `quotes` — all quote array mutations ([`upsertQuote`](server/repositories/quotesStore.js), Sprint 11)
- `quote:${id}` — approval transitions ([`shared.js`](server/routes/shared.js), Phase 6.2)
- `notifications` — chat + notification appends

**Sprint 34 — dual-layer mutex**:

1. In-process Promise chain (default, zero-I/O) — protects single-Node deployments.
2. Cross-process `proper-lockfile` — activated via `OPS_MULTI_INSTANCE=1`. Serializes across pm2 cluster workers, Docker replicas, blue-green overlapping deploys. Lock files live in `$DATA_DIR/locks/`, sanitized keys, 30s stale timeout, retries with exponential backoff.

Safety guards: file-lock failures (disk full, permission) log a warning and degrade to in-process-only — caller contract still honored per-process. Key sanitization strips `:` `/` so `quote:123` can't escape the lock directory.

**/save-all** ([`routes/costApi.js:1075+`](server/routes/costApi.js)) writes N datasets sequentially; Sprint 13 isolated each per-dataset failure so a bad write in one dataset doesn't abort the rest. Response now carries `saved_keys[]` + `failed_datasets[]` for retry-ability.

**Race fix** (Sprint 11): client used to do `GET history → mutate → POST full array`. Two concurrent saves → lost updates. Replaced with `POST /api/quotes` + `PATCH /api/quotes/:id` — server does read-modify-write under the `quotes` lock. Integration test in [`http.integration.test.js`](server/http.integration.test.js) fires 8 parallel POSTs and verifies all 8 ids land.

**LibFinance conflict** (Sprint 33): `handleSgaReloadAfterConflict` now merges fresh server values + user's touched-site edits via `touchedSitesRef`. A `useEffect` re-syncs `sgaDraft` when the finance context changes externally while preserving unsaved touched-site edits — closes the silent-overwrite path that bypassed 409 protection.

---

## 8. Error boundaries (Sprint 17)

Reusable class in [`components/Shared/ErrorBoundary.js`](client/src/components/Shared/ErrorBoundary.js). Props:

- `label`: shown in fallback UI
- `resetKey`: auto-reset when value changes (pass active-tab id)
- `onError`: telemetry hook (future)
- `fallback`: optional custom renderer

Deployed at:

- **Top of app tree** ([`App.jsx`](client/src/App.jsx)) — catches layout / providers / AppBootstrap
- **Per Cost tab** ([`CostModule.jsx`](client/src/modules/cost/CostModule.jsx)) with `resetKey={activeTab}`
- **Per Planning tab** ([`PlanningModule.jsx`](client/src/modules/planning/PlanningModule.jsx))
- **Chat drawer** — silent fallback (`() => null`) so chat crash doesn't degrade quoting UI

File is `.js` not `.jsx` (React.createElement instead of JSX) so `node --test` can import for pure-logic regression tests.

---

## 9. Typed action creators (Sprint 20)

Sprint 2 + Sprint 4 shipped payload-key-mismatch bugs ( `{spi, mi}` vs `{spIdx, idx}`, bare-number payload). Sprint 20 closed the loop at author-time:

Callers MUST use creators from [`calcReducer.js`](client/src/context/calcReducer.js):

```js
import { setSpMaterialField, removeSubProduct } from 'context/calcReducer';

dispatch(setSpMaterialField({ spIdx, idx, field: 'width', value: 100 }));
dispatch(removeSubProduct({ idx: 2 }));
```

Raw `dispatch({ type: 'SET_SP_MATERIAL_FIELD', payload: { spi, mi } })` is rejected at `@ts-check` time. If a new action needs adding, define the creator + `@typedef` together.

---

## 9a. Keyboard shortcuts

Cost engineers spend hours a day in StandardCalc / ComplexCalc. The app already wires the important shortcuts — this section documents them so new users discover them without reading source.

| Keys                                     | Scope                          | Action                                                          |
| ---------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| `Ctrl/Cmd + S`                           | StandardCalc, ComplexCalc      | Save current quote (prompts "new version" vs "update existing") |
| `Ctrl/Cmd + Z`                           | App-wide (except input fields) | Undo last state mutation (40-step history, Sprint 5.4)          |
| `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` | App-wide (except input fields) | Redo                                                            |
| `Esc`                                    | Modals                         | Close modal (standard React modal convention)                   |

Inside text inputs, the browser's native text-undo wins — the app yields so `Ctrl+Z` in a field behaves as expected. Outside inputs, state history engages.

See [`calcHistory.js`](client/src/context/calcHistory.js) for the undo/redo reducer wrapper and [`CalcContext.jsx`](client/src/context/CalcContext.jsx) for the global key handler.

## 10. Observed but deferred

Tracked here so future sprints can pick them up without a fresh audit.
Items closed in Sprints 26-34 moved to the Sprint 1-34 summary table (§12).

| Priority | Item                                                                                                                                | Sprint notes         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| P3       | Password field `pwd` (legacy plaintext) cleanup for non-logging-in users                                                            | Sprint 8 agent       |
| P3       | Rate persistence architecture — per-record endpoints instead of full-array /save-all                                                | Sprint 17 advice #6  |
| P2       | Audit log UI viewer — endpoint supports filter (event, user, since) but no built-in Settings-tab UI binds to it yet                 | Sprint 33 scoped out |
| P2       | Keyboard-first quoting shortcuts (Ctrl+S save, Tab navigation through calc grids)                                                   | Sprint 17 advice #16 |
| P2       | Multi-site tenancy proper — per-site data isolation                                                                                 | Sprint 17 strategic  |
| P3       | API versioning strategy — `/api/v1/` prefix for future breaking changes                                                             | —                    |
| P3       | Bundle analyzer-driven shrink of `index.js` shell (241 kB / 290 kB budget, 83%) — tool exists (Sprint 32), actual refactor deferred | —                    |

---

## 11. Operational runbooks

### "A quote shows wrong margin after a save"

1. Open the quote. Note `ccl_pn`, `id`, and displayed `va` / `gm`.
2. Check the stored result: `jq '.[] | select(.id == N)' server/data/Library/QuoteHistory/quote_history.json`
3. Verify against canonical (§5). If stored differs from canonical computed from breakdown fields → run `node scripts/migrate-quote-va.js --dry-run` to diff + `--apply` when confirmed.
4. Backup `.pre-va-migration-*` is created automatically.

### "Historical quote has no breakdown (thin result)"

1. `node scripts/backfill-quote-results.js --dry-run`
2. If reasonable, `--apply`. Backup `.pre-backfill-*` preserves pre-state.

### "CI fails on perf-budget"

1. `npm run perf-budget` locally — see which chunk overflowed.
2. `cd client && npm run analyze` — emits `dist/bundle-stats.html` treemap. Open to see what's heavy inside the offending chunk.
3. If legitimate growth (new feature): raise budget in [`scripts/check-perf-budget.js`](scripts/check-perf-budget.js), commit with rationale.
4. If regression (accidental dep pull-in): use the JSON output `dist/bundle-stats.json` to diff against a prior baseline.

### "Two admins editing SGA rate collide (409)" — closed Sprint 33

Admin sees conflict banner. Click "Reload server values" — untouched sites pull fresh from server; sites the user typed into keep their local edits. Info banner lists which sites were preserved vs refreshed. Then Save.

### "Audit log missing old entries after Sprint 30 cutover"

1. Verify the SQLite table populated: `sqlite3 $OPS_DB_PATH 'SELECT COUNT(*) FROM audit_log;'`
2. If 0 and `server/data/Library/Users/audit_log.json` has rows: `node scripts/backfill-audit-log.js --dry-run` then `--apply` (no flag).
3. Check backfill ran: `node scripts/backfill-audit-log.js` — the "already populated" guard should now short-circuit.

### "Deploy multi-instance (pm2 cluster / Docker replicas)"

1. Set env `OPS_MULTI_INSTANCE=1` for every worker.
2. Ensure shared `DATA_DIR` across workers (NFS, shared volume, etc.).
3. `withLock` calls automatically acquire `proper-lockfile` at `$DATA_DIR/locks/` — first-come serialization across workers.
4. Verify with `ls $DATA_DIR/locks/` — should see `*.lock` files appear during concurrent activity.
5. To revert to single-node: unset `OPS_MULTI_INSTANCE`. `locks/` directory stays behind but is harmless (new writes bypass it).

### "VN user's decimal input silently dropped"

Closed Sprint 28-29. Every on-change handler that previously did `parseFloat(e.target.value)` now uses `parseLocaleNumber` from [`client/src/utils/format.js`](client/src/utils/format.js). If a new PR reintroduces the raw pattern, `node --test client/src/utils/noRawParseFloat.lint.test.js` fails — guard runs as part of `npm test`.

---

## 12. Sprint 1-34 summary

Changes applied to the codebase, in execution order:

| #   | Theme         | Key deliverable                                                                          |
| --- | ------------- | ---------------------------------------------------------------------------------------- |
| 1-4 | Bug hunt      | Fixed 2 P0 dispatch bugs (SET*SP*\*\_FIELD keys, REMOVE_SUBPRODUCT shape), VA formula P1 |
| 5-6 | Bug hunt      | InkCalculator negative-width; Summarize VA/Contribution alignment                        |
| 7   | Library audit | Clean — no real bugs                                                                     |
| 8   | Security      | `toCsvBytes` CSV injection fix                                                           |
| 9   | Data          | 50 quotes VA migration                                                                   |
| 10  | Architecture  | Extract `calcReducer` to pure module — close test-replica loophole                       |
| 11  | Architecture  | `upsertQuote` + `/api/quotes` endpoints — lost-update race fix                           |
| 12  | Observability | Approval audit log SGA context; snapshot-read error surfacing                            |
| 13  | Architecture  | `/save-all` per-dataset isolation                                                        |
| 14  | Persistence   | Save full result breakdown — anti-drift                                                  |
| 15  | Data          | 9 legacy quotes backfilled to full schema                                                |
| 16  | UI            | Ink display convention — columns sum to subtotal                                         |
| 17  | Reliability   | `ErrorBoundary` across 4 surfaces                                                        |
| 18  | Architecture  | Std schema versioning (`_schema_version: 1`)                                             |
| 19  | Type safety   | `@ts-check` on 8 core modules + `tsconfig.json`                                          |
| 20  | Type safety   | Typed action creators for SP family                                                      |
| 21  | Tests         | Golden fixtures — caught bugs #2+#3 in engine VA / Contribution / gm_after_sga           |
| 22  | Tests         | Expanded golden (multi-tier MOQ, SGA snapshot, SP ref)                                   |
| 23  | Tests         | Extract ink core + 14 golden scenarios                                                   |
| 24  | Tests         | HTTP lifecycle golden — login → POST → parallel race proof                               |
| 25  | Gate          | Perf budget checker wired into `npm run verify`                                          |
| 26  | Docs          | This file (MAINTAINERS.md)                                                               |
| 27  | Gate          | Perf-budget CLI smoke tests (exit-code regression guard)                                 |
| 28  | UI/i18n       | `parseLocaleNumber` helper — VN locale "8,5" ≠ 8 bug                                     |
| 29  | Lint          | Rollout `parseLocaleNumber` to 17 call sites + grep-regression gate                      |
| 30  | Data layer    | Audit log SQLite migration + dual-write + backfill script                                |
| 31  | API           | Audit filter endpoint (event substring / user exact / since ISO)                         |
| 32  | Tooling       | `npm run analyze` — rollup-plugin-visualizer HTML+JSON treemap                           |
| 33  | UI            | LibFinance multi-admin conflict merge — touched-site preservation + info banner          |
| 34  | Scaling       | Dual-layer asyncLock — opt-in `OPS_MULTI_INSTANCE=1` file-lock for cluster mode          |

**End state (Sprint 34)**: 683 tests, 100% pass. Perf budget: `743.8 kB total, all under budget`. Typecheck: clean. Golden scenarios: 31 + HTTP lifecycle 9 + audit-log 5 + lock multi-instance 6. Lint gates: no-raw-parseFloat, perf-budget-smoke.

---

## 13. Who to contact

- Product owner: Đặng Thế Thiệp (Henry Dang)
- For architectural changes: review [`docs/audit-2026-04-17/AUDIT_ROADMAP.md`](docs/audit-2026-04-17/AUDIT_ROADMAP.md) first — some 2026 audit items may still be open.
- For formula changes: Finance sign-off required. Update both `calcEngine.js` + golden tests in the same PR.
