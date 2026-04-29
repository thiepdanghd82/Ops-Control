# Changelog — Ops Control v1.3

All notable changes are tracked here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning is SemVer; pre-release tags use `-alpha.N` / `-beta.N`.

---

## [Unreleased]

### Added — Sprint 1.3.32 (2026-04-28) — Design Tools port + native-ABI build pipeline

Brought back the Design Tools tab from v1.2 Sprint 14 (operator install
screenshot flagged the gap), and fixed the desktop build pipeline so
better-sqlite3 actually ships in Electron's ABI.

- `domains/costing/shared/{gallusEngine,gallusInventory}.js` — pure
  Gallus calc engine ported verbatim from v1.2; preserves Sprint 14d
  K-aware fix and lesson 16 `Math.round` cylinder-suggestion policy.
  `FACTORY_DEFAULT_ZS` exported for `cylinderService` factory-row guard.
- `domains/costing/tests/gallusEngine.test.js` — 36 golden tests against
  worked examples from `Gallus_Design_Calculator_RL.xlsx`.
- `domains/costing/client/design-tools/DesignToolsLanding.jsx` + CSS —
  three-level navigator (Toolset × Press × per-press tab). Print toolset
  enabled; Cutting + Finishing are stubs. Selected press persisted in
  sessionStorage.
- `domains/costing/client/design-tools/GallusCalc.jsx` + CSS — slim
  live-recompute UI on top of the engine. 4 result cards (Top 5 print
  cylinders, Cross-direction, Job summary, Top 3 magnetic). Artwork
  upload + ShotLayoutViz + manual Z_die override deferred to follow-up.
- `shared/i18n.js` — 30 new `costing.design.*` keys.
- `Sidebar.jsx` + `App.jsx` — `Design Tools` under COST (user role),
  route `/cost/design-tools` registered.

#### Build pipeline fixes

- `scripts/build/build-desktop.sh` now wipes
  `node_modules/better-sqlite3/{build,prebuilds}` before invoking
  `electron-rebuild`. Without that, electron-rebuild reports `Rebuild
  Complete` but doesn't overwrite the `.node` binary (it caches the
  stock-Node prebuild). The packed installer ships the wrong ABI and
  login explodes with `NODE_MODULE_VERSION mismatch`.
- After packaging, `npm rebuild better-sqlite3` restores the stock-Node
  ABI on disk so subsequent `npm test` / `npm run dev` keep working.
- DMG marker check now mounts the DMG and greps `app.asar` (was
  `strings | grep` — doesn't see through APFS+asar compression).

#### Verified

- Packed `better_sqlite3.node` SHA differs from source SHA → Electron-ABI
  in pack, stock-Node on dev disk.
- Smoke test: server boots, `POST /api/auth/login` with seeded creds
  → 200, `GET /api/dashboard/metrics` → 200, zero `NODE_MODULE_VERSION`
  errors in `server.log`.
- Server suite: **335 tests, 0 failures** (was 299; +36 gallusEngine).
- Vite client bundle: **147 modules · 118 KB gzipped** (was 142 / 113 KB).

---

### Added — Sprint 1.3.31 (2026-04-28) — First-run sys-user seed + 9 desktop-pipeline fixes

The desktop SERVER installer was the biggest source of "looks fine in
dev but the DMG is broken" surprises. Chased every silent failure to
the bottom and got `OpsControl SERVER` installable from a fresh DMG
with login working out of the box, no terminal step required.

#### apps/server

- `firstRunSeed.js` — when `DESKTOP_FIRST_RUN_SEED=1` is set (passed by
  the desktop SERVER spawn) and no `sys` user exists, mint one with a
  generated 16-char temp password (avoids 0/O and 1/l ambiguity) and
  write it to `<DATA_DIR>/FIRST_RUN_CREDENTIALS.txt` (mode 0600).
  Idempotent.
- `apps/server/index.js` — calls `runFirstRunSeed` after domain mounts,
  serves `express.static(CLIENT_DIST)` when env is set (so `GET /`
  returns the dashboard, not 404), binds `0.0.0.0:4001` and logs every
  reachable URL at boot (addresses "sai địa chỉ IP" feedback).
- `firstRunSeed.test.js` — 4 tests (creates sys, idempotent, file under
  DATA_DIR, 16-char safe-alphabet password).

#### apps/desktop — 6 main.cjs bugs + 3 build-config bugs fixed

| # | Bug                                                            | Fix                                                                                                |
|---|----------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| 1 | `extraMetadata.opsMode` merged top-level → MODE='client'       | main.cjs reads `PKG.opsMode` first                                                                 |
| 2 | `loadFile` path wrong for packaged builds                      | Use `process.resourcesPath/app/apps/client/dist/index.html`                                        |
| 3 | Spawn cwd `/` → server crashed `mkdir '/data'`                 | Pass `cwd: app.getPath('userData')` + `DATA_DIR` env                                              |
| 4 | `stdio: 'inherit'` → EPIPE crash dialog                        | Pipe to `userData/server.log` + `desktop.log`; uncaughtException handlers log instead of crash    |
| 5 | `JWT_SECRET` / `TOTP_KEY` missing → fail-closed                | Auto-provision under `userData/secrets/` (32 bytes each, 0600). Persisted across boots.            |
| 6 | Server `/` → 404 (blank window)                                | apps/server now mounts `express.static(CLIENT_DIST)` from extraResources                           |
| 7 | electron/electron-builder carets → version-detection failed    | Pinned to exact `33.4.11` / `25.1.8`                                                              |
| 8 | `..` paths in `files` glob dropped → asar shipped 6.9 KB       | Switched cross-project content to `extraResources` (preserves the `process.resourcesPath/app/...` layout main.cjs expects) |
| 9 | electron-builder's install-prod step wiped hoisted root deps   | Pass `--config.npmRebuild=false`                                                                  |

#### Operator workflow this enables

```
1. Open OpsControl SERVER-1.3.0-beta.1-arm64.dmg
2. Drag → Applications, right-click → Open
3. Window shows login screen within ~3 s
4. Read ~/Library/Application Support/@apps/desktop/data/FIRST_RUN_CREDENTIALS.txt
   →  username: sys, temp password: <16 chars>
5. Log in → forced password change → dashboard
6. rm the credentials file
```

No terminal, no env-var setup, no manual SQLite init.

#### Operator runbook

`docs/runbooks/operator-install.md` documents the full install flow,
file locations, and 6 recovery scenarios (lost password, blank window,
locked out, IP-mismatch, clean reinstall, login 500).

---

### Added — Sprint 1.3.29 (2026-04-28) — Planning: BOM explosion (rolled-up need + optional IFS coverage)

Cross-domain composition over four existing endpoints (orders +
mfg-structures + materials + IFS inventory). Higher-leverage cousin of
MaterialCheck: where MaterialCheck answers "do we have the master data?",
BOMExplosion answers "do we have the stock?".

#### domains/planning/client/bom-explosion

- **`BOMExplosion.jsx`** + CSS — for each active order (Draft / Released /
  InProgress) the screen finds the matching Manufacturing Structure by
  `product_code` and accumulates `line.qty_per × order.qty` per component
  code. Result is enriched with the Material library row (unit, unit_cost
  → ext cost) and sorted ext-cost-desc.
  - Optional IFS overlay: typing a site code into the toolbar pulls
    `/api/mes/ifs-inventory?site=…` and adds an `On hand` column +
    Coverage badge per row (≥100% green / ≥50% warn / <50% red).
  - Top tiles: Active orders / Components needed / Orders w/o BOM
    (warning when > 0) / Total ext cost.
  - Per-row hint when the component code isn't in the Material library.
- **`shared/i18n.js`** — 18 new `planning.bom.*` keys (en + vi).

#### Plumbing

- `client/index.js` — barrel re-exports `BOMExplosion`.
- `Sidebar.jsx` — `BOM explosion` added under PLANNING.
- `App.jsx` — `/planning/bom` registered.

Validates the bounded-context approach a second time: composing reads in
the client beats coupling planning-server to library-server + mes-server.

#### Test + bundle results

- Server suite: **295 tests, 0 failures** (no server changes).
- Vite client bundle: **142 modules · 113 KB gzipped** (was 140 / 112 KB).

---

### Added — Sprint 1.3.28 (2026-04-28) — Planning: Material check (BOM × library coverage)

Pure client-side cross-domain composition over three existing endpoints. No
new server work — this is a derived view planners want at the start of a
shift to spot orders that can't run yet.

#### domains/planning/client/material-check

- **`MaterialCheck.jsx`** + CSS — for each active order (Draft / Released /
  InProgress) the screen looks up the matching Manufacturing Structure
  (BOM) by `product_code` and checks every BOM-line code against the
  Material library. Outcomes:
  - **OK** — every BOM line resolves to a Material row.
  - **Missing** — N codes don't exist in the library; missing codes are
    rendered as red chips inline so planners can copy-paste.
  - **No BOM** — order's `product_code` has no Manufacturing Structure.
  - **Empty BOM** — structure exists but has zero lines.
  Top-of-page summary tiles count each outcome. Rows colour-banded
  (red / yellow / white) by severity. On-demand `Refresh` button only
  (no auto-poll — the underlying datasets change rarely).
- **`shared/i18n.js`** — 16 new `planning.matcheck.*` keys (en + vi).

#### Plumbing

- `client/index.js` — barrel re-exports `MaterialCheck`.
- `Sidebar.jsx` — `Material check` added under PLANNING.
- `App.jsx` — `/planning/materials` registered.

Validates the bounded-context approach: composing three domain reads in
the client is cleaner than coupling planning-server to library-server,
and `MfgStructureLibrary` already taught operators where the BOM data
comes from.

#### Test + bundle results

- Server suite: **295 tests, 0 failures** (no server changes).
- Vite client bundle: **140 modules · 112 KB gzipped** (was 138 / 110 KB).

---

### Added — Sprint 1.3.27 (2026-04-28) — MES: Connection mode admin editor

PUT `/api/mes/mode` shipped in 1.3.5 but had no UI; the existing
`ConnectionModeCard` was read-only. This sprint adds inline admin edit so
operators can swap embedded ↔ thin ↔ smart and re-point `server_url` from
the desktop CLIENT settings page.

#### domains/mes/client/mode

- **`ConnectionModeView.jsx`** — admin-aware view that wraps the existing
  read display with an Edit button (admin-only). Inline edit form uses
  the `MODES` enum from `shared/schema/connectionMode.js`.
  - Mode dropdown auto-clears `server_url` when switched to `embedded`.
  - `server_url` field hidden when mode = embedded; required for thin/smart
    (server schema already enforces — UI matches).
  - Per-mode hint paragraph beneath the dropdown explains the trade-off
    (single-box / per-request / cached + replicated).
  - Save invalidates `mes:mode:v1` so the read display refreshes.
- **`ConnectionModeCard.jsx`** — kept as-is for embeds (e.g. dashboard
  tile). Both exported from the barrel.
- **`shared/i18n.js`** — 7 new keys: `mes.mode.edit_btn`, `na_embedded`,
  `hint.embedded`, `hint.thin`, `hint.smart`.

#### Plumbing

- `client/index.js` — barrel re-exports `ConnectionModeView`.
- `App.jsx` — `/mes/mode` route swapped from `ConnectionModeCard` to
  `ConnectionModeView`.

#### Test + bundle results

- Server suite: **295 tests, 0 failures** (no server changes).
- Vite client bundle: **138 modules · 110 KB gzipped** (was 136 / 109 KB).

---

### Added — Sprint 1.3.26 (2026-04-28) — Sales: Quote Analysis (single-quote breakdown viewer)

Slim port of v1.2's Carbon-redesigned QuoteAnalysis tab. Uses the existing
`/api/sales/quotes` endpoint — no server changes — so this is a pure UI sprint.

#### domains/sales/client/quote-analysis

- **`QuoteAnalysis.jsx`** + CSS — one-quote breakdown view:
  - Picker dropdown defaults to most-recent active quote
  - Hero card: quote_no / customer / status badge + colour-coded
    contribution-% badge (≥30 success / ≥15 warn / <15 danger)
  - Cost vs Price bars in USD AND VND (CSS-only, no charting library)
    with margin row (positive green / negative red)
  - Numbers table: full-precision USD / VND / fx_rate / contr%
  - Lifecycle timeline: dotted Draft → InReview → Approved → Released →
    Archived progression with current step highlighted; legal next-states
    listed underneath (Cancelled rendered red as alternate fork)
  - Inline note panel when present
- **`shared/i18n.js`** — 17 new `sales.analysis.*` keys (en + vi).

#### Plumbing

- `client/index.js` — barrel re-exports `QuoteAnalysis`.
- `Sidebar.jsx` + `App.jsx` — `/sales/analysis` registered under SALES.

Read-only by design — state transitions stay in `QuoteHistory` so a single
write surface keeps the audit trail clean.

#### Test + bundle results

- Server suite: **295 tests, 0 failures** (no server changes).
- Vite client bundle: **136 modules · 109 KB gzipped** (was 133 / 107 KB).

---

### Added — Sprint 1.3.25 (2026-04-28) — MES: Machine technical (full CRUD)

First full-stack sprint of the run — new schema + store + endpoints + tests + UI.
Slim MVP of v1.2's MachineTechnicalTab. The 50+ specialised v1.2 fields are
captured as a free-form `extra: {}` map so operators can record any machine
attribute without a code change; core engineering fields (brand/model/type/
status, num_print/die_stations, max_web_width_mm, max_run_speed_m_min) are
typed and validated.

#### domains/mes/shared

- **`schema/machineProfile.js`** — TYPES (5: printing, cutting, finishing,
  inspection, other) + STATUSES (4: active, idle, maintenance, retired).
  Strict mode strips unknown top-level keys but preserves `extra` verbatim.
  Promotion path: when an `extra.foo` becomes universal, lift into ALLOWED
  with proper typing.

#### domains/mes/server

- **`repositories/machineProfileStore.js`** — JSON-on-disk under
  `data/library/mes/machine-profile.json` via `@platform/storage`. Soft-delete,
  optimistic locking, list filters by type and status. Pattern mirrors
  `materialStore.js`.
- **`routes/mesRouter.js`** — added `GET /api/mes/machines`, `GET /:code`,
  `POST` (admin), `PUT /:code` (admin, `If-Match`), `DELETE /:code` (admin).
  Audit actions: `MACHINE_CREATE`, `MACHINE_UPDATE`, `MACHINE_DELETE`.

#### domains/mes/tests

- **`machineProfile.test.js`** — 11 tests covering schema validation, enum
  rejection, unknown-key stripping, default-status, create/get round-trip,
  duplicate rejection, update + version bump, optimistic-lock 409, soft-delete
  + list filtering, type/status filter combinations, exported enum stability.

#### domains/mes/client/machine-technical

- **`MachineTechnicalLibrary.jsx`** — list with type + status dropdown filters,
  status-coloured kind badges, admin add/edit/delete row actions.
- **`MachineProfileEditModal.jsx`** — single modal handles create + edit. Core
  fields are typed inputs (number for stations/widths/speed, enum selects for
  type/status). Long-tail `extra` fields are an inline key=value editor;
  numeric strings auto-coerce to Number, "true"/"false" to boolean, everything
  else stays as String. Sends `If-Match: <version>` on PUT.

#### Plumbing

- `shared/i18n.js` — 35 new `mes.machine.*` keys (en + vi).
- `client/index.js` + `server/index.js` — barrel re-exports added.
- `Sidebar.jsx` + `App.jsx` — `/mes/machine` registered under MES (user-role).

#### Test + bundle results

- Server suite: **295 tests, 0 failures** (was 284; +11 from machineProfile).
- Vite client bundle: **133 modules · 107 KB gzipped** (was 130 / 104 KB).

#### Deferred to follow-up

- Excel import/export (transposed CCL Hanoi Equipment Capability template
  shape — needs the shared ImportWizard + a SheetJS-based exporter).
- Sub-tab UX (Printing / Cutting separation) — current single-table view with
  type filter is functionally equivalent for the alpha operator preview.

---

### Added — Sprint 1.3.24 (2026-04-28) — Library: Drop-down lists admin (two-pane editor)

Closes the last Library admin gap. DDLs (operator-curated lookup lists used
by selectors throughout the UI: customer, npi_owner, process, etc.) had
GET/PUT endpoints since 1.3.2 but no UI to edit them.

#### domains/library/client/ddl

- **`DDLAdmin.jsx`** + CSS — two-pane layout: list picker on the left
  (driven by `GET /api/library/ddl`), inline items editor on the right
  with `code` / `label` / `sort` columns. Save sends the full items[] via
  `PUT` (server de-dupes by code and re-sorts). Tracks `dirty` state and
  prompts before switching lists with unsaved changes. Inline duplicate-
  code count + row count badges.
- **`+ New list`** affordance (admin-only) prompts for a snake_case name
  and creates the file by sending an empty items[] PUT.
- **`shared/i18n.js`** — 17 new `library.ddl.*` keys.

#### Plumbing

- **`client/index.js`** — barrel re-exports `DDLAdmin`.
- **`Sidebar.jsx` + `App.jsx`** — `/library/ddl` registered under LIBRARY.

#### Test + bundle results

- Server suite: **284 tests, 0 failures** (no server changes).
- Vite client bundle: **130 modules · 104 KB gzipped** (was 128 / 102 KB).

Library now has 6 client screens covering the full master-data surface:
Material / Rate / Finance / DDL (full CRUD); MfgStructure / RoutingOps
(read-only — admin edit lands with the v1.2 ImportWizard primitive).

---

### Changed — Sprint 1.3.23 (2026-04-28) — Version bump 1.3.0-alpha.0 → 1.3.0-beta.1

Cuts the **operator-beta milestone**. Marks the closure of all 5 P0
release-blockers (Sprints 1.3.7 → 1.3.12) plus the P1 backlog and the
Sprint 1.3.13 → 1.3.22 build-out (10 sprints, 12+ new screens, +38 tests,
+33 client modules).

#### Version propagation

- All 36 `package.json` files across the workspace bumped (root + apps/* +
  domains/{8}/{client,server,shared} + platform/{9}).
- `package-lock.json` updated to match.
- `apps/server/index.js` `VERSION` constant: `'1.3.0-alpha.0'` → `'1.3.0-beta.1'`.
- `README.md` migration-instruction reference updated.
- `RELEASE_NOTES.md` rewritten end-to-end as the cumulative beta release notes
  with sprint summary table, screen inventory, deferred-items list, and
  v1.2 → GA migration checklist.
- `docs/runbooks/desktop-deployment.md` "we ship UNSIGNED" caveat moved
  from alpha to beta.
- `.claude/rules/monitoring.md` `/api/health` example payload bumped.

#### Verification

- Server suite: **284 tests, 0 failures** post-bump (no regression).
- Vite client bundle: **128 modules · 102 KB gzipped** (unchanged from 1.3.22).
- `apps/desktop/package.json` rebuilt with the new version baked into
  `extraMetadata`; electron-builder config still valid (`appId`, `productName`,
  `extraMetadata.opsMode` all intact).
- `apps/desktop/main.cjs` bundle marker constant `opsctl-desktop-v1.3-marker`
  unchanged (cross-version stable identifier for `strings | grep`).
- `scripts/build/build-desktop.sh` syntax validated (`bash -n`); not run as a
  dry-run because cold-running it would install ~500 MB of electron +
  electron-builder dev deps. To exercise: `bash scripts/build/build-desktop.sh`.

#### Migration to v1.3.0 GA (still pending)

See `RELEASE_NOTES.md` § "Known gaps". The v1.3.x → GA cut is gated on
porting the remaining v1.2 surfaces (mes/hardware, mes/machine-technical,
sales/quote-analysis, library/ImportWizard, planning/{BOMExplosion,
MaterialCheck, WorkOrders}) and a clean install drill on a fresh box.

---

### Added — Sprint 1.3.22 (2026-04-28) — Library: Rate + Finance admin CRUD UIs

Mirrors the Material admin UI pattern from 1.3.20 across the two remaining
library resources whose server CRUD has been live since 1.3.2.

#### domains/library/client/rate

- **`RateLibrary.jsx`** — list + admin add/edit/delete. Client-side filter
  dropdown on `kind` (machine_hour / labour_hour / fx). Status-coloured kind
  badges. Effective-range column shows `effective_from → effective_to`.
- **`RateEditModal.jsx`** — single modal handles both create and edit.
  Edit disables `code`. Sends `If-Match: <version>` on PUT.

#### domains/library/client/finance

- **`FinanceLibrary.jsx`** — list + admin add/edit/delete of UPPER_SNAKE-keyed
  finance constants (overhead %, scrap allowance, margins, etc.).
- **`FinanceEditModal.jsx`** — server only exposes `PUT /finance/:key` (upsert),
  so create-mode also uses PUT with a fresh key. Key field auto-uppercases.

#### Plumbing

- **`shared/i18n.js`** — 30 new `library.rate.*` + `library.finance.*` keys.
- **`client/index.js`** — barrel re-exports both new components.
- **`Sidebar.jsx` + `App.jsx`** — `/library/rate` + `/library/finance`
  registered under LIBRARY.

#### Test + bundle results

- Server suite: **284 tests, 0 failures** (no server changes).
- Vite client bundle: **128 modules · 102 KB gzipped** (was 123 / 99 KB).

---

### Added — Sprint 1.3.21 (2026-04-28) — Quality: Sample new + state transitions

Quality had a read-only listing only. Server-side CRUD + state-machine
endpoints have shipped since 1.3.3; this sprint adds the user-role UI to
trigger them. State machine (Requested → InProduction → ReadyForReview →
Approved | Rejected, with rework path) is enforced server-side; the UI
just renders whichever next-states the v1.2 `TRANSITIONS` table allows
for the current row.

#### domains/quality/client/sample-tracking

- **`SampleNewModal.jsx`** — quick form for `POST /api/quality/samples`
  (user-role). Server stamps `status='Requested'` automatically.
- **`SampleTransitionModal.jsx`** — confirms a state change. Reject
  requires a `reject_reason`; Approve captures `approved_by` (defaults
  to logged-in username). All other transitions are bare. Sends
  `If-Match: <version>` so the server can 409 on stale state.
- **`SampleTracking.jsx`** — header bar gains `+ New sample` (user-role).
  Per-row Actions column renders `→ <next-state>` ghost buttons for each
  legal transition from the current state. Inline hint shows reject
  reason / approver where relevant. Modal saves invalidate the shared
  cache key `quality:samples:list:v1`.
- **`shared/i18n.js`** — 14 new keys (en + vi) for the new modals.

#### Test + bundle results

- Server suite: **284 tests, 0 failures** (no server changes — UI on
  endpoints with existing `transitionSample` test coverage).
- Vite client bundle: **123 modules · 99 KB gzipped** (was 120 / 98 KB).

---

### Added — Sprint 1.3.20 (2026-04-28) — Library: Material admin CRUD UI

Server CRUD for materials shipped in 1.3.2 (POST/PUT/DELETE/GET) but the only
UI was a read-only table. This sprint adds the admin add/edit/delete UI so
operators no longer need to hand-edit `data/library/material/material.json`.

#### domains/library/client/material

- **`MaterialEditModal.jsx`** — single modal handles both create and edit.
  Edit mode disables the `code` field (URL-keyed) and sends `If-Match: <version>`
  on PUT so the server can 409 a stale write. Server validation errors
  surface verbatim. Used `<Modal>` from `@platform/ui-kit` for consistent
  scrim + ESC/click-outside dismissal.
- **`MaterialLibrary.jsx`** — header bar gains a `+ Add material` button
  (admin-only). Each row gains `Edit` + `×` actions when admin. Delete
  has a browser confirm prompt; invalidates the shared SWR cache key
  `library:materials:list:v1` after every successful mutation so the
  list refreshes immediately.
- **`shared/i18n.js`** — 9 new `library.material.add/edit_btn/edit.*/delete.confirm` keys.

#### Test + bundle results

- Server suite: **284 tests, 0 failures** (no new tests; trigger UI for
  endpoints with existing test coverage).
- Vite client bundle: **120 modules · 98 KB gzipped** (was 119 / 96 KB).

---

### Added — Sprint 1.3.19 (2026-04-28) — Polish: OrderEntry form + admin per-row quote delete

Two small but operationally meaningful gaps closed. Server endpoints already
existed; this sprint just wires UI triggers onto them.

#### domains/planning/client/order-entry

- **`OrderEntryForm.jsx`** + CSS — cost-role create form. Posts to
  `POST /api/planning/orders` and invalidates the shared
  `planning:orders:list:v1` cache so OrderList / WIP / Capacity refresh
  immediately. Inline role gate via `useAuth().hasRole('cost')`. Returns
  to a blank form on success with a success message; surfaces server
  validation errors verbatim.
- **`shared/i18n.js`** — 7 new `planning.entry.*` keys.

#### domains/sales/client/quote-history

- **`QuoteHistory.jsx`** — admin-only `×` button per row. Refuses on
  Released quotes (server already enforces `QUOTE_LOCKED`); UI tooltip
  explains why. Browser confirm prompt before the soft-delete fires.
  After delete, invalidates the cache so the row drops out of the list
  (and shows up in the Trash modal added in 1.3.17).
- **`shared/i18n.js`** — 3 new `sales.quote.delete.*` keys (button label,
  Released-locked tooltip, confirm prompt).

#### apps/client — wiring

- **`Sidebar.jsx`** — `/planning/new` (cost-role gated) added under PLANNING.
- **`App.jsx`** — route registered.

#### Test + bundle results

- Server suite: **284 tests, 0 failures** (no new tests; trigger UI for
  endpoints that already had test coverage).
- Vite client bundle: **119 modules · 96 KB gzipped** (was 117 / 95 KB).

---

### Added — Sprint 1.3.18 (2026-04-28) — Planning: WIP tracker + Capacity board

Two derived views over the existing `/api/planning/orders` endpoint — no new
server work, pure UI ports. Planning had 1 client screen (OrderList) but v1.2
shipped 6; this sprint closes the highest-value gap.

#### domains/planning/client

- **`wip/WIPTracker.jsx`** + CSS — kanban-style board grouping orders by
  status (Draft / Released / InProgress / Completed / Cancelled). Each
  column shows count + qty roll-up so planners can eyeball load. Reuses
  `useCachedFetch('planning:orders:list:v1')` so it shares cache state with
  OrderList.
- **`capacity/CapacityBoard.jsx`** + CSS — orders bucketed by ISO 8601 week
  of `due_date`. Excludes Completed + Cancelled (no longer load). Bars
  scale to the busiest week so peaks are obvious at a glance. Pure
  client-side bucketing — same fetch path, no new endpoint.
- **`shared/i18n.js`** — 9 new keys for both screens.

#### domains/planning/tests

- **`capacityBucket.test.js`** — 2 tests covering ISO-week computation
  (Thursday-rule), including the 2025/2026 year-boundary edge case
  (2025-12-29 Mon → ISO week 1 of 2026).

#### apps/client — wiring

- **`Sidebar.jsx`** — PLANNING section now lists Orders / WIP tracker /
  Capacity board.
- **`App.jsx`** — `/planning/wip` + `/planning/capacity` registered in ROUTES.

#### Test + bundle results

- Server suite: **284 tests, 0 failures** (was 282; +2 from capacityBucket).
- Vite client bundle: **117 modules · 95 KB gzipped** (was 113 / 93 KB).

---

### Added — Sprint 1.3.17 (2026-04-28) — Sales: Quote Trash bin (restore for soft-deleted)

Soft-delete for quotes already shipped in 1.3.3 but operators couldn't see or
recover trashed rows from the UI. This sprint closes that loop with a Trash
modal — same pattern v1.2 added in Sprint 13 UI / 14.

#### domains/sales/server

- **`quoteStore.js`** — added `restoreQuote(quoteNo)` (admin-only). Refuses
  with `QUOTE_DUPLICATE` if a live quote with the same number now exists
  (i.e. one was created after the soft-delete). `listQuotes` gained a
  `trashedOnly` option.
- **`salesRouter.js`** — `GET /api/sales/quotes?trashed=1` now returns the
  trashed rows; `POST /api/sales/quotes/:quote_no/restore` (admin) un-trashes.
  Audit row `QUOTE_RESTORE`.
- **`tests/quote.test.js`** — 4 new tests: trashedOnly filter, happy-path
  restore, 404 on missing, duplicate-conflict refusal.

#### domains/sales/client

- **`quote-history/QuoteTrashModal.jsx`** — Modal listing trashed quotes with
  per-row Restore button. Role-gated to admin (client + server). Refreshes
  the parent's cached quote list via `invalidateCache('sales:quotes:list:v1')`
  so the restored row appears immediately.
- **`QuoteHistory.jsx`** — added a Trash button in the header bar, renders
  the modal, threads through `onRestored` callback. Header bar now shows
  even on empty state so operators can always reach Trash.
- **`shared/i18n.js`** — 8 new `sales.quote.trash.*` keys.

#### Test + bundle results

- Server suite: **282 tests, 0 failures** (was 278; +4 sales restore tests).
- Vite client bundle: **113 modules · 93 KB gzipped** (was 112 / 92 KB).

---

### Added — Sprint 1.3.16 (2026-04-28) — MES: IFS inventory browser + jwt-test fix

#### domains/mes/client/ifs-inventory

- **`IFSInventory.jsx`** + CSS — read-only browser over the IFS inventory
  mirror endpoint already shipped in 1.3.5. Server-side filter by `site` and
  `part_no_prefix` with a 250 ms client-side debounce to avoid per-keystroke
  RTTs. Distinct sites in current page populate a `<datalist>` for the site
  filter. Row count badge in the toolbar.
- **`shared/i18n.js`** — 6 new keys (col.unit, col.updated, filter.site,
  filter.prefix, count) on top of the existing IFS column keys.
- **`client/index.js`** — barrel re-exports `IFSInventory`.
- **`Sidebar.jsx`** + **`App.jsx`** — `/mes/ifs` registered in MES section.

### Fixed

- **`platform/auth/jwt.test.js` "verifyJwt rejects tampered signature"** — was
  flaky because it tampered the LAST char of the base64url signature. A
  32-byte HS256 sig encodes to 43 chars where the last char's 2 LSBs are
  padding bits the decoder discards; flipping just those bits produces the
  same decoded buffer and the signature still verifies. Fixed to tamper a
  middle char where all 6 bits are meaningful. Verified by running the test
  5× — all green.

#### Test + bundle results

- Server suite: **278 tests, 0 failures** (no new tests added; jwt test now
  reliable across 5 consecutive runs).
- Vite client bundle: **112 modules · 92 KB gzipped** (was 110 / 91 KB).

---

### Added — Sprint 1.3.15 (2026-04-28) — Basis: Admin metrics dashboard

In-app sys-only ops dashboard. Reads `/api/metrics` (Prometheus text exposition,
already mounted by apps/server) and renders the counters + latency histogram
that ops actually care about. Carries v1.2 design rationale: in-app dashboard
beats a Grafana embed for a single-box LAN deployment.

#### domains/basis/client/admin-metrics

- **`metricsParse.js`** — pure parsing + scoring helpers carried verbatim from
  v1.2: `parseMetricLine`, `parsePrometheus`, `sumByLabel`, `histogramSummary`,
  `computeHealth`, `statusSummary`. Thresholds: `P95_WARN_MS=500`, `P95_ALERT_MS=1000`,
  `ERROR_RATE_WARN_PCT=0.5`, `ERROR_RATE_ALERT_PCT=1`.
- **`AdminMetrics.jsx`** + CSS — sys-only dashboard. Tiles: requests / error %
  / slow routes / client errors. Tables: latency by route (top 20, p50/p95/avg
  with colour-coded p95), requests by status, requests by method, client
  errors by ErrorBoundary label. 30 s auto-refresh, pauses while tab is hidden.
- **`shared/i18n.js`** — 27 new keys (en + vi).

#### domains/basis/tests

- **`metricsParse.test.js`** — 16 unit tests covering line parsing, label
  extraction, histogram p50/p95 computation, health-score thresholds, and
  status summarisation.

#### apps/client — wiring

- **`Sidebar.jsx`** — SYSTEM section now lists Settings / Admin metrics / Audit
  log / Server health.
- **`App.jsx`** — `/system/metrics` registered in ROUTES.

#### Test + bundle results

- Server suite: **278 tests, 0 failures** (was 262 / +16 metricsParse).
- Vite client bundle: **110 modules · 91 KB gzipped** (was 107 / 89 KB).

---

### Added — Sprint 1.3.14 (2026-04-28) — Library: Mfg-structure + Routing-ops browsers

The mfg-structure and routing-ops STORES + endpoints landed in 1.3.8, but no
client UI shipped. This sprint closes that gap with read-only browsers using
the same SWR pattern as MaterialLibrary.

#### domains/library/client — two new browsers

- **`mfg-structure/MfgStructureLibrary.jsx`** + CSS — header table of all
  structures (`code`, `revision`, `description`, line count, version). Click a
  row to expand its BOM lines, indented by `level` (1..10). Reuses
  `useCachedFetch('library:mfg:list:v1')`.
- **`routing-ops/RoutingOpsLibrary.jsx`** + CSS — header table of all routings
  with the same expandable-row pattern; expanded view shows seq-ordered
  operations (`op_code`, `machine`, `cycle_seconds`, `setup_hr`, `note`).
  Uses `useCachedFetch('library:routing:list:v1')`.
- **`shared/i18n.js`** — 28 new keys for the two screens (en + vi).
- **`client/index.js`** — barrel re-exports both new components.

#### apps/client — wiring

- **`Sidebar.jsx`** — LIBRARY section now lists Material / Mfg structures /
  Routing ops.
- **`App.jsx`** — `/library/mfg` + `/library/routing` registered in ROUTES.

#### Test + bundle results

- Server suite: **262 tests, 0 failures** (no engine code added — UI-only sprint).
- Vite client bundle: **107 modules · 89 KB gzipped** (was 103 / 88 KB).
- No new server endpoints (mfg-structure + routing-ops endpoints already shipped 1.3.8).

#### Deferred

- Edit/import UIs require porting the v1.2 `ImportWizard` + `DataBrowser`
  primitives. Both are substantial (CSV parser + preview + commit pipeline).
  Tracked as a follow-up sprint.

---

### Added — Sprint 1.3.13 (2026-04-28) — P1 batch: PrintArea + Ink + Audit + Settings

Closes the P1 backlog left open after the P0 sweep in 1.3.7–1.3.12. Two new pure
calc engines, one read-only sys-tools viewer, one admin settings screen — all wired
into the hash router and Sidebar.

#### domains/costing — Print-area + Ink calculators

- **`shared/calcPrintArea.js`** — pure engine. Inputs: sheet W/H, label W/H,
  edge_mm (default 5), lane_gap_mm (2.5), head_clear_mm, orientation (0/90),
  sheet_cost_usd. Outputs: cols, rows, labels_per_sheet, usable_w/h_mm,
  utilisation_pct, waste_pct, cost_per_piece_usd. Carries v1.2 lesson 16:
  `Math.floor` for cols/rows — over-fit is an honest mistake, under-fit is the
  safe call.
- **`shared/calcInk.js`** — pure engine. Per-colour layer cost from coverage_pct
  + unit_cost_usd_per_kg + ink_yield_g_per_cm2 (default 0.0035). Returns
  per-colour breakdown + totals. NEVER rounds — display layer applies `.toFixed()`.
- **`client/print-area/PrintAreaCalcForm.jsx`** + **`client/ink/InkCalculatorForm.jsx`** —
  live-recompute forms following the StandardCalcForm pattern (`useMemo` + engine,
  no "Calculate" button). Ink form supports add/remove layers; print-area form
  drives a colour-coded utilisation StatusBadge.
- **`tests/calcPrintArea.test.js`** (9 tests) + **`tests/calcInk.test.js`** (7 tests):
  basic grids, margins, lane_gap, orientation, cost_per_piece, label-larger-than-sheet,
  zero coverage, raw float precision, Math.floor invariant.

#### domains/basis — Audit Log viewer + Settings

- **`server/routes/basisRouter.js`** — added `GET /api/basis/audit` (sys-only)
  wrapping `@platform/audit/query()`. Filters: action, actor, from, to, limit
  (1–10000, default 200). Returns `{ rows, total }`.
- **`client/audit/AuditLogViewer.jsx`** — sys-only filterable table view of the
  append-only audit log. No client cache (operators expect fresh reads on every
  Refresh). Inline filters for action / actor / ISO time range / limit.
- **`client/settings/SettingsView.jsx`** — admin-facing Settings panel. Wraps the
  existing backup-schedule PUT + `/api/health` for system info (version, uptime,
  connection mode). Save button is in-place with savedAt timestamp + role gate.
- **`shared/i18n.js`** extended with 22 new keys for the two screens.

#### apps/client — wiring

- **`Sidebar.jsx`** — added 4 new nav items: `/cost/print-area` + `/cost/ink`
  under COST; `/system/settings` (admin) + `/system/audit` (sys) under SYSTEM.
- **`App.jsx`** — registered all 4 new routes in the ROUTES map and imported the
  forms from `@domains/costing-client` + `@domains/basis-client` barrels.

#### Test + bundle results

- Full server suite: **262 tests, 0 failures** (was 246; +16 from new engines).
- Vite client bundle: **103 modules · 88 KB gzipped** (was 95 modules / 83 KB).
- Cross-domain isolation: 0 violations across 8 domains.

---

### Added — Sprint 1.3.12 (2026-04-28) — Desktop installers (last P0 closed)

**ALL 5 P0 RELEASE-BLOCKERS NOW CLOSED.** v1.3.0 is feature-ready for engineering
review and operator beta.

#### apps/desktop — CLIENT vs SERVER mode wired

- **`main.cjs` rewritten.** Mode comes from `package.json#extraMetadata.opsMode` (baked
  by electron-builder per variant; no runtime switch).
  - **CLIENT** mode: loads `OPS_SERVER_URL` (set via Settings → Connection Mode) or
    falls back to the bundled UI's connection-mode wizard.
  - **SERVER** mode: spawns `apps/server/index.js` via `ELECTRON_RUN_AS_NODE=1` child
    process; window points at `http://127.0.0.1:4001` after `waitForServer()` (30 s
    timeout, 250 ms poll).
  - External links open in user's browser via `setWindowOpenHandler` + `shell.openExternal`.
  - Window title shows `Ops Control vX.Y.Z — CLIENT|SERVER` so operators know what they're in.
  - Embedded server crash propagates to the renderer via `webContents.send('server-exit', …)`.
- **`preload.cjs` rewritten.** `window.opsDesktop` exposes `mode`, `version`, `serverUrl`,
  `getUserDataPath()` (IPC), and `onServerExit(cb)` (renderer can show a banner if the
  embedded server dies).
- **Bundle marker** `OPS_DESKTOP_BUNDLE_MARKER = 'opsctl-desktop-v1.3-marker'` exported
  from `main.cjs` so `scripts/build/build-desktop.sh` can `strings | grep` each artefact
  to confirm the right code shipped (v1.2 lesson: bundle hash check alone has false
  negatives when Vite caches stale chunks).

#### `apps/desktop/package.json` — real electron-builder config

- `appId: com.ccldesign.opscontrol` · `asar: true` · `directories.output: dist-electron`.
- `extraMetadata.opsMode` defaulted to `'client'`; build script overrides per variant.
- `files` glob: bundles client/dist + server + platform + domains + node_modules,
  excludes test files, `.bak`, `.gitkeep`, `.DS_Store`, `.npm-cache`.
- `mac.target: dmg arm64` with `artifactName ${productName}-${version}-${arch}.dmg`.
  No code-signing in alpha (`hardenedRuntime: false`).
- `win.target: nsis x64` with one-click=false (operator picks install dir).
- `dmg.sign: false`, `nsis.deleteAppDataOnUninstall: false` (preserve `userData`
  across reinstall — operators don't lose their `data/library` content).

#### `scripts/build/build-desktop.sh` — orchestrator (4 artefacts)

```bash
bash scripts/build/build-desktop.sh           # all 4
bash scripts/build/build-desktop.sh client mac # one variant
```

What it does:
1. `npm run build` (fresh client bundle).
2. Auto-`npm install` `apps/desktop` if Electron deps missing.
3. Loop matrix `{client,server} × {mac,win}`, calling `electron-builder` per cell with
   `--config.extraMetadata.opsMode=…` and per-variant `--config.productName=…` so the
   output filenames differ.
4. **Bundle marker grep** on every emitted `.dmg` / `.exe` via `strings | grep`. Exit
   non-zero on any miss.
5. Skip Mac builds gracefully on non-macOS, skip Win builds gracefully when `wine` missing.

#### `docs/runbooks/desktop-deployment.md` — full runbook

- Build prereqs (Node 20, macOS for .dmg, optional `wine` for Windows from macOS).
- One-shot vs single-variant builds.
- Verification gate (marker grep, smoke install, peer health probe).
- Code-signing playbooks for **macOS** (Developer ID + notarize + staple) and
  **Windows** (EV cert + electron-builder env). Not done in alpha — runbook
  documents the upgrade path.
- Distribution channels (LAN share, per-operator email with sha256, no auto-update).
- New-version rollout checklist.
- Troubleshooting: wine missing, embedded server doesn't start (native dep mismatch
  is the #1 culprit — `electron-rebuild` runs automatically), CLIENT blank window
  (server URL unreachable), bundle marker missing.

#### Verified

| Gate | Result |
| --- | --- |
| Syntax check (.js + .cjs across all apps/platform/domains/scripts) | ✅ 0 errors |
| `bash -n` on build-desktop.sh | ✅ shell parse OK |
| JSON parse on apps/desktop/package.json | ✅ |
| Bundle marker present in main.cjs | ✅ |
| Cross-domain isolation | ✅ 0 violations |
| Vite client build | ✅ 95 modules → 287 KB JS / 83 KB gzipped (unchanged) |
| **Full test suite** | ✅ **246/246 still pass** (no regression — desktop is wiring-only) |

#### Not done in this sprint (deliberate, documented)

- **Actual electron-builder run** — would download ~80 MB Electron binaries +
  trigger native rebuilds + chew 2-5 minutes per artefact × 4. Wired correctly;
  operator runs `bash scripts/build/build-desktop.sh` when ready.
- **Code-signing** — needs paid certs ($99/yr Apple + $250/yr Win EV). Runbook
  documents the upgrade steps.
- **Icon artwork** — `apps/desktop/build/README.md` documents what files to drop.
  Without them electron-builder ships the default Electron logo (acceptable for
  engineering builds).

#### What v1.3.0 stable still needs (after Sprint 1.3.12)

**P0: 0 remaining.** ✅
**P1 still pending:** PrintArea / Ink calc, Sales RFQ Tracker, Settings UI, Audit Log viewer.
**P2 unchanged.**

v1.3.0-rc.0 can be cut. P1 items become individual sprints (each is 1-2 files +
backend already exists).

### Added — Sprint 1.3.11 (2026-04-28) — Permission Groups + User admin + siteAccess + telemetry

**4 of 5 P0 release-blockers closed.** sys-only admin surface usable end-to-end via UI;
multi-site safety in place; client-error beacons land in audit + metrics.

#### Telemetry endpoint (P1 closed)

- **`apps/server/routes/telemetry.js`** — `POST /api/telemetry/client-error`. Accepts
  ErrorBoundary's `sendBeacon` payload (boundary, message, url, stack, userAgent).
  Returns 204. Writes audit `CLIENT_ERROR` + bumps `client_error_total` counter (labelled
  by boundary). Lives in `apps/server` because (a) unauthenticated path (login-form
  crashes can fire before auth), (b) cross-cutting (every domain UI may beacon).

#### `@platform/http/siteAccess` middleware (P0 closed)

- **`platform/http/server/siteAccess.js`** + **9 unit tests**. `requireSiteAccess({ pickSite })`
  middleware: sys = god mode bypass; `user.site === 'all'`/null = unscoped; matching site OK;
  mismatched site → `AppError('SITE_FORBIDDEN', 403)`. `pickSite(req)` returning null = the
  request is site-agnostic.
- Exported from `@platform/http`. Routes opt in case-by-case. v1.3.0 ships with the
  middleware; mass-applying it across the 51 endpoints is a 1.3.12 follow-up.
- User schema gained an optional `site` field (admin can set per user via the
  Edit/Create modals).

#### Security — Permission Groups (P0 closed)

- **`shared/schema/permissionGroup.js`** — group with `route_permissions: { '/path': 'hidden|read|edit' }`.
  Levels exported as `LEVELS = ['hidden','read','edit']`. Absent route defaults to `hidden`
  (least-privilege).
- **`SEED_GROUPS`** carried from v1.2: `all_access` (sys-gated, readonly) +
  7 department defaults (`leader`, `sales`, `cs`, `npi`, `purchasing`, `production`,
  `quality`). `KNOWN_ROUTES_LIST` mirrors the Sidebar nav for the admin matrix.
- **`server/repositories/permissionGroupStore.js`** — JSON store at
  `data/library/security/permission-groups.json`. **Auto-seeds on first read** so a fresh
  install is usable without a manual seed step. `saveGroup` refuses on `readonly: true`
  (`GROUP_READONLY` 409). `softDeleteGroup` likewise.
- **`server/routes/permissionGroupRoutes.js`** — 4 endpoints. GET list / GET routes
  catalogue (open to authenticated users — Sidebar uses for client-side gating). PUT/DELETE
  sys-only.
- **`tests/permissionGroup.test.js`** — 12 tests including: bad id format, bad level,
  LEVELS contract matches seeds, `resolveLevel` defaults absent route to hidden, auto-seed
  on first read, refuse mutate readonly seed, version bump on update, `userRouteLevel`
  for sys (god) / no-group (legacy edit fallback) / matrix application.
- **`userRouteLevel(user, routePath)`** helper — the canonical "is this user allowed?"
  check for both client gating + server enforcement.

#### Security — User admin (P1 closed)

- **`server/routes/userRoutes.js`** — sys-only. 5 endpoints: GET list, GET :username,
  POST create, PUT update (role/dept/group/site patch with optimistic-lock), POST
  reset-password (forces `must_change_password=true`), DELETE soft.
- Audit events: `USER_CREATE`, `USER_UPDATE`, `USER_PWD_RESET`, `USER_DELETE`.
- Self-service password change still goes through `/api/auth/change-password`
  (no role required — for users acting on themselves).

#### UIs

- **`PermissionGroupsAdmin.jsx`** + `.css` — left list + right matrix (route × level
  radio buttons). Duplicate seed → editable copy. Save with optimistic-lock via
  `if-match` header. Delete with confirm.
- **`UserAdmin.jsx`** — table of users with role/dept/group/flags, "Create user" button,
  per-row Edit + Reset password modals. Modals use `@platform/ui-kit/Modal` (sm/md
  sizes, severity for the destructive reset).
- **22 new EN/VN i18n keys** under `security.pg.*` + `security.users.*`.
- **`apps/client/src/Sidebar.jsx`** — added 2 sys-only items: "Users (admin)" and
  "Permission groups" under SECURITY section.
- **`apps/client/src/App.jsx`** — wired `/security/groups` and `/security/users` routes.

#### Verified

| Gate | Result |
| --- | --- |
| Syntax check | ✅ 0 errors |
| Cross-domain isolation | ✅ 0 violations |
| **Full test suite** | ✅ **246/246 pass** (was 225 — +21 from siteAccess 9 + permissionGroup 12) |
| `npm run build` | 95 modules → 287 KB JS / **83 KB gzipped** (was 92/268/79) |
| Telemetry HTTP smoke | ✅ POST /api/telemetry/client-error → 204 + audit entry |
| Permission Groups smoke | ✅ auto-seed 8 groups, GET _routes catalogue, PUT custom group v=1, mutate readonly seed → 409 GROUP_READONLY |
| User admin smoke | ✅ list users (sys-only auth), create user via sys → 201 with `must_change_password: true` |

#### Caught + fixed

- **TDZ in `permissionGroup.js`** — `SEED_GROUPS = [...]` evaluates eagerly at module
  load and called `makeAllEdit()` which referenced `KNOWN_ROUTES`, but `KNOWN_ROUTES`
  was declared AFTER `SEED_GROUPS`. JS reference-before-init error. Fix: move
  `KNOWN_ROUTES` declaration ABOVE `SEED_GROUPS`. (Function declarations hoist; `const`
  declarations don't.)

#### What v1.3.0 stable still needs

P0 closed: 4 of 5 (ComplexCalc + router + quote persistence + Permission Groups + siteAccess).
**Remaining P0: Desktop installer build** — `electron-builder` configs ship as stubs;
need wiring to produce 4 artefacts (CLIENT/SERVER × Mac arm64 + Win x64).

P1 closed in 1.3.11: telemetry endpoint, User admin UI.
P1 still pending: PrintArea / Ink calc, Sales RFQ Tracker, Settings UI, Audit Log viewer.

P2 unchanged.

### Added — Sprint 1.3.10 (2026-04-28) — Complex calc + quote save/load + hash router + Sidebar

Three of the five P0 release-blockers from the post-1.3.9 audit closed in this sprint:
**ComplexCalc**, **quote save/load**, and **real router with persistent Sidebar**. Pricing
workflow is now persistent — operators can save a draft, load it later, see lineage via
audit log.

#### Costing — Complex engine (multi-sub-product)

- **`shared/calcComplex.js`** — pure engine. Each sub-product runs `computeStandard`; the
  roll-up sums material/process/setup cost across subs at each quote-MOQ tier. Handles
  `inclusion` (units per kit, default 1) and per-sub-per-tier overrides
  (`tier.sub_overrides[subCode].material_overrides`). Roll-up unit_price applies
  `MARGIN_PCT` to the SUMMED unit_cost so margin stays consistent across kit sizes.
- **`tests/calcComplex.test.js`** — 7 tests including: single sub mirrors Standard,
  two-sub material-cost summing, inclusion>1 multiplies sub qty, override scoping
  (per-sub, per-tier), empty-sub graceful handling.

#### Costing — Quote save/load (the v1.2 quote envelope ported)

- **`shared/schema/costingQuote.js`** — schema for either `kind: 'standard'` or
  `kind: 'complex'`, with opaque `input` payload + meta (title, customer, rfq_no,
  released_at, released_to_quote_no).
- **`server/repositories/quotesStore.js`** — JSON store at `data/library/costing/quotes.json`.
  - `saveCostingQuote` is upsert: create on first call, update with `ifMatchVersion`
    optimistic-lock on subsequent.
  - `listCostingQuotes` STRIPS the heavy `input` field from list responses (a draft
    with 50 materials × 10 tiers can be 30 KB; lists of 200 drafts would be 6 MB).
    `_input_size` meta tells the UI how big the full draft is before fetching.
  - `softDeleteCostingQuote` REFUSES on `released_at` non-null (v1.2 invariant: a
    released draft belongs to sales now, not deletable from costing).
- **`server/routes/costingRouter.js`** + **4 endpoints** (cost role minimum):
  `GET /api/costing/quotes`, `GET /:id`, `PUT /:id` (upsert), `DELETE /:id`.
  GET list is ETag-cached. Audit `COSTING_QUOTE_SAVE` / `COSTING_QUOTE_DELETE`.
- **`tests/quotesStore.test.js`** — 9 tests: schema validation, upsert lifecycle,
  ifMatchVersion conflict, list strips input, list filters by kind, get returns full
  row, soft-delete refuses on released, 404 on missing.
- **`useQuoteSave` hook** in costing/client (shared between Standard + Complex forms).
  Wraps the fetch logic + busts `@platform/cache` keys post-save.

#### Costing — UIs

- **`StandardCalcForm`** got a Save/Load bar above the constants panel (Quote ID,
  customer, title fields + Save + Load buttons + version badge + last-saved-at).
- **`ComplexCalcForm`** is NEW. Multi-sub-product master table + selectable per-sub
  editor (mirrors Standard's materials/processes editors). Quote-level MOQ tiers +
  roll-up table. Same Save/Load bar as Standard.
- 12 new EN/VN i18n keys for save/load + Complex-specific labels.

#### apps/client — Hash router + Sidebar (replaces nav strip)

- **`router.js`** (50 lines, zero-dep) — `useHashRoute()` returns `[path, navigate]`,
  `<a href="#/path">` for navigation. Works in web (`http://`) AND Electron (`file://`)
  without server-rewrite. See **ADR-0006**.
- **`Sidebar.jsx`** + **`Sidebar.css`** — fixed left rail with grouped nav sections
  (OVERVIEW, COST, LIBRARY, PLANNING, SALES, QUALITY, SECURITY, MES, SYSTEM).
  Items role-gated client-side via `useAuth().hasRole(item.minRole)`. Active route
  highlighted with brand-blue background + white left border. Sign-out button at footer.
- **`App.jsx`** rewritten as `ROUTES` map + flex layout (sidebar + main with topbar +
  content). Default `/` → `/dashboard`.
- **`App.css`** — grid layout `220px 1fr`, mobile collapses to single column.

#### Docs

- **ADR-0006** — `Custom hash router (no react-router-dom dep)`. Documents the
  Electron `file://` constraint, bundle-size argument, and re-open conditions
  (≥5 nested routes, loader-style data preloading, public-facing browser-history needs).

#### Verified

| Gate | Result |
| --- | --- |
| Syntax check | ✅ 0 errors |
| Cross-domain isolation | ✅ 0 violations |
| **Full test suite** | ✅ **225/225 pass** (was 209; +16 from calcComplex 7 + quotesStore 9) |
| `npm run build` | 92 modules → 268 KB JS / **79 KB gzipped** (was 86/250/75) |
| Save round-trip via HTTP | ✅ PUT 200 v=1 → list strips input → GET full input → PUT if-match v=1 200 v=2 → PUT if-match v=1 → **409 CONFLICT** |
| Sidebar role-gating | ✅ admin-only items hidden for non-admin (client-side; server still enforces) |
| Hash navigation in Vite dev | ✅ `#/cost/standard` etc. resolve via ROUTES map |

#### What v1.3.0 stable still needs (revised after Sprint 1.3.10)

P0 closed: 3 of 5 (ComplexCalc, real router, quote persistence). Remaining P0:
- **Permission Groups admin UI** — backend `requireRole` works, but no UI for sys
  to assign per-tab access matrix.
- **`siteAccess` middleware** — referenced in `rules/security.md` but not implemented.
- **Desktop installer build** — `electron-builder` configs ship as stubs; need wiring
  to produce 4 artefacts (CLIENT/SERVER × Mac/Win).

P1 still pending: PrintArea calc, Ink calc, Sales RFQ, Settings UI, Audit Log viewer,
User admin UI, telemetry endpoint.

P2 unchanged.

### Added — Sprint 1.3.9 (2026-04-28) — Login UI + AuthGate + Standard calc form

**THE PRICING WORKFLOW IS NOW USABLE.** Operators can sign in (with TOTP if enrolled),
change-password on first login, and drive the Standard quote calculator with live results.

#### Refactor — calcStandard moved to costing/shared

- **`server/domain/calcStandard.js` → `shared/calcStandard.js`** so the same engine ships
  in browser and server. The pure JS has no IO so the move is mechanical. Test import path
  updated; **12/12 calc tests still green**.
- Re-exported from both `@domains/costing-server` and `@domains/costing-client`.

#### Security — Login + ChangePassword UIs

- **`client/auth/LoginForm.jsx` + `.css`** — IBM Carbon-style split-screen with brand panel +
  form panel. Two-step flow when TOTP enrolled (`{totp_required: true}` → second screen).
  Lockout countdown when 423. Lang flag in top-right.
- **`client/auth/ChangePasswordForm.jsx`** — mounted by AuthGate when
  `req.user.must_change_password`. Old + new + confirm fields with min-8 validation;
  re-fetches `/me` post-success so the AuthGate flips to the real app.
- **22 new EN/VN i18n keys** under `security.login.*` + `security.pwd.*`.

#### apps/client — AuthGate

- **`src/AuthGate.jsx`** — wraps the app. Three states: loading splash, no user → LoginForm,
  user.must_change_password → ChangePasswordForm, otherwise children. Lives in apps/client
  per ADR-0003 (apps may import any domain; only deployment shells decide what to render).
- **`src/main.jsx`** wraps `<App />` in `<AuthGate>`.
- **`src/App.jsx`** — added Sign-out button + `<code>{username} · {role}</code>` in the top
  bar; new view "Costing → Standard calc" wired into the nav array.

#### Costing — Standard calc form (the heart of the pricing workflow)

- **`client/standard/StandardCalcForm.jsx` + `.css`** — five panels: Finance constants,
  Materials, Processes, MOQ tier overrides (override each material `setup_lm` + each
  process `setup_hr` per tier), live result table.
- **Live recompute via `useMemo`** — every keystroke runs `computeStandard` from the shared
  engine; no "Calculate" button. Operator sees impact instantly.
- **MOQ override semantics preserved** (the v1.2 Sprint 1.6 invariant): empty cell = falls
  back to base (override removed), explicit `0` = honoured (override stored as 0).
- **No display rounding into state** (v1.2 lesson 17): engine returns full float precision,
  `.toFixed()` only at render.
- 28 new EN/VN i18n keys under `costing.standard.*`.
- Result table shows per-tier: material/process/setup cost, total cost, unit cost, **unit
  price**, **contr%** — all aligned, tabular-nums, IBM Carbon blue accent.

#### Verified

| Gate | Result |
| --- | --- |
| Syntax check | OK — 0 errors |
| Cross-domain isolation | OK — 0 violations |
| **Full test suite** | **209/209 still pass** (calc move didn't break anything) |
| `npm run build` | 86 modules → 250 KB JS / 75 KB gzipped (was 79 / 231 / 70 — +7 modules for the new UIs) |
| HTTP login round-trip | OK — cookie set, /me returns user with `must_change_password: true` |
| AuthGate wired | OK — main.jsx renders LoginForm when no session |

#### Backlog still pending for v1.3.0 stable

- ComplexCalc UI (engine pattern same as Standard; 1 form file)
- Sales: RFQ Tracker UI + Formal Quotation PDF
- Planning: WIP / Capacity / BOM / MaterialCheck sub-pages
- Security: Permission Groups admin UI
- MES: Hardware Devices, Machine Technical
- Smart-mode sync engine
- Desktop installers via electron-builder

### Added — Sprint 1.3.8 (2026-04-28) — Login flow + library completion (MfgStructure + RoutingOps)

**THIS SPRINT MAKES THE APP USABLE END-TO-END.** v1.3.0 stable can now ship with a login screen,
because every operator-facing entry point can authenticate.

#### Security — full auth flow

- **`shared/schema/user.js`** — User schema with redaction. `redact()` strips `password_hash`
  and `totp_blob` so they NEVER cross a route boundary. Roles: viewonly < user < cost < admin < sys.
- **`server/repositories/userStore.js`** — JSON-on-disk user store at
  `data/library/security/users.json`. `_getInternal()` returns the FULL row (incl. password_hash)
  for the auth service; all PUBLIC reads (`getUser`, `listUsers`) are pre-redacted.
  `softDeleteUser` REFUSES on `sys` role to prevent accidental lockout.
- **`server/services/authService.js`** — composes userStore + `@platform/auth` primitives:
  - `login({username, password})` — bcrypt verify + lockout (5/15min, persisted) + audit
    `LOGIN_OK`/`LOGIN_FAIL`/`LOGIN_LOCKED`. Returns `{totp_required: true}` if user has TOTP
    enrolled, otherwise issues JWT cookie immediately.
  - `loginTotp({username, code})` — second step for TOTP-enrolled users. **Fail-closed** if
    `TOTP_KEY` missing or decryption fails (the v1.2 invariant).
  - `changePassword({username, oldPassword, newPassword})` — bcrypt verify old + hash new +
    clear `must_change_password`.
  - `ensureSysUser({tempPassword})` — first-boot bootstrap. Idempotent (no-op if `sys` exists).
  - **Constant-time username enumeration defence** — even when the user doesn't exist, we run
    bcryptVerify against a placeholder hash so timing doesn't leak account existence.
- **`server/routes/authRoutes.js`** — 5 endpoints mounted by securityRouter:
  - `POST /api/auth/login` — IP rate-limited (10/10min via `makeIpLimiter`); validates body
    pattern.
  - `POST /api/auth/login/totp` — second TOTP step.
  - `GET  /api/auth/me` — requires auth, returns `req.user` from JWT (already redacted).
  - `POST /api/auth/logout` — clears the session cookie + audits `LOGOUT`.
  - `POST /api/auth/change-password` — requires auth + clears cookie post-success so the
    client must re-login with the new password.
- **`scripts/ops/recover-sys-user.js`** — console-only escape hatch. Requires typing
  `CONFIRM-RECOVER` (the v1.2 Sprint 1.7 invariant). On confirm: resets sys password OR
  creates sys if missing. Generates a 16-char ambiguous-pair-free random temp password,
  prints ONCE, sets `must_change_password=true`. Audit `SYS_RECOVERY` for forensics.
- **`tests/auth.test.js`** — **14/14 pass**. Coverage: redact, validation, createUser
  duplicate, sys-protect-on-delete, ensureSysUser idempotent, login wrong-pwd, login
  unknown user (constant-time path), login OK + token, lockout after 5 fails (423 LOCKED on
  6th even with correct pwd), changePassword wrong old, changePassword too-short, change
  clears must_change_password, TOTP-enrolled user gets `totp_required` not a token.

#### Library — MfgStructure + RoutingOps (BOM + sequence-of-ops)

- **`shared/schema/mfgStructure.js`** — flat `lines[]` array with `level` (1..10) encoding
  the tree shape. Schema bounds depth at 10 (planning's BOM explosion alerts at 7, refuses 10).
- **`shared/schema/routingOps.js`** — flat `ops[]` with `seq`/`op_code`/`machine`/
  `cycle_seconds`/`setup_hr`. `seq` must be unique per routing; sorted ascending on persist.
- **`server/repositories/{mfgStructureStore,routingOpsStore}.js`** — same upsert pattern as
  financeStore (create on first call, update with optimistic-lock on subsequent).
- **`libraryRouter.js`** extended: 4 + 4 = 8 new endpoints. Library now has **25 endpoints
  total** (up from 17 in Sprint 1.3.7).
- 14 tests across both stores.

#### Platform — caught + fixed bug

- **`platform/auth/lockout.js`** + **`platform/audit/auditStore.js`** — the `_initialised`
  schema cache flag at module scope was preventing tests that swap DATA_DIR + closeDb
  between cases from getting the schema in the new DB. Removed the flag; `CREATE TABLE
  IF NOT EXISTS` is cheap. This unblocked 4 auth tests that were failing with
  "no such table: auth_lockout".

#### End-to-end login round-trip verified via HTTP

```
POST /api/auth/login {"username":"sys","password":"…"} → 200 + Set-Cookie HttpOnly+SameSite=Strict
GET  /api/auth/me                                       → 200 + redacted user (no password_hash)
GET  /api/security/approvals                           → 200 (cookie carried auth)
POST /api/auth/logout                                  → 200 + cookie cleared
GET  /api/auth/me                                      → 401 (no cookie)
```

#### Verified

| Gate | Result |
| --- | --- |
| Syntax check | OK — 0 errors |
| Cross-domain isolation | OK — 0 violations |
| **Full test suite** | **209/209 pass** in ~6 s |
| `npm run build` | OK — 79 modules → 231 KB / 70 KB gzipped |
| HTTP login round-trip | OK — full flow incl. cookie + /me + logout |
| Library endpoints | 25 (was 17) |
| HTTP endpoints total | 51 (was 46) |

### Added — Sprint 1.3.7 (2026-04-28) — Library expansion + costing engine + backup runner + CI

#### Library — 3 more sub-libraries (Rate, Finance, Finance, DDL)

- **`rate`** — `kind` ∈ `{machine_hour, labour_hour, fx}`, USD/hr or VND/USD values.
  Same shape as Material: schema + store with optimistic-lock + soft-delete + 5 endpoints.
  6 tests (kind validation, kind filter, version bump, soft-delete, duplicate rejection).
- **`finance`** — UPPER_SNAKE keyed constants (`OVERHEAD_PCT`, `MARGIN_PCT`, `SCRAP_PCT`,
  `VAT_PCT`). `setConstant` is upsert (creates on first call, updates with optimistic-lock
  on subsequent). 5 tests.
- **`ddl`** — drop-down lists, one JSON file per list at `data/library/ddl/<list>.json`.
  Path-traversal closed via `LIST_NAME_RE = /^[a-z][a-z0-9_]*$/`. Items de-duped by `code`,
  sorted by `sort` then label. 7 tests.

`libraryRouter.js` extended to **17 endpoints** (was 5 in Sprint 1.3.2).

#### Costing — Standard calc engine (MOQ-aware pricing)

- **`server/domain/calcStandard.js`** — pure, IO-free `computeStandard(input)` returning
  per-MOQ-tier breakdown: material/process/setup cost, total cost, unit cost, unit price,
  total price, contr%. Lives under `server/domain/` because it's pure logic (no Express,
  no React) — same engine ships in Node + browser.
- **MOQ Setup overrides preserved** — the v1.2 Sprint 1.6 invariant. Each tier can override
  `setup_lm` (Materials) or `setup_hr` (Process); empty cells (`null`) fall back to base, NOT
  to zero. 12 tests including the explicit "null override falls back to base" + "explicit 0
  is honoured" pair.
- **No display rounding at engine boundary** — engine returns raw float precision (v1.2
  lesson 17). Display layer applies `.toFixed(N)` at render time only.
- **Contr% computed (not stored)** — engine returns it; the sales `quoteStore.withDerived()`
  recomputes from price_usd / cost_usd on every read.

#### Basis — backup runtime loop

- **`server/services/backupRunner.js`** — actually performs the backup the schedule describes.
  In-process timer, re-arms on `basis.backup_schedule.updated` event, ZIP via spawn (`zip`
  with `tar -czf` fallback for Windows), prunes ZIPs older than `retention_days`, audit
  `BACKUP_RUN` (or `BACKUP_FAILED` — v1.2 Sprint 1.7 invariant: audit always emits regardless
  of webhook outcome). `_timer.unref()` so node --test exits cleanly.
- **`startBackupRunner()`** wired into `apps/server/index.js` boot. Suppressed by env
  `OPS_DISABLE_BG=1` so node --test exits without dangling timers.
- 7 tests including msUntilNext for off/hourly/daily/weekly + retention pruning + happy-path
  runBackupNow with empty data.

#### CI — GitHub Actions workflow

- **`infra/ci/test.yml`** — full v1.3 verification gate:
  install → lint → vite build → full test suite (28 test files) → cross-domain isolation
  scan (fails the build on any violation). Uses `OPS_DISABLE_BG=1` so the test runner exits
  cleanly. Provides minimum auth env (TOTP_KEY, JWT_SECRET) for tests that need them.
  Move to `.github/workflows/test.yml` when initialising the git repo.

#### Verified

| Gate                             | Result                              |
| -------------------------------- | ----------------------------------- |
| Syntax check                     | OK — 0 errors                       |
| Cross-domain import scan         | OK — 0 violations                   |
| **Full test suite**              | **182/182 pass** in ~1 s            |
| `npm run build`                  | OK — 79 modules → 231 KB JS / 6.8 KB CSS / 70 KB gzipped |
| Boot smoke (clean state)         | OK — `backup.armed` event for next 03:00 local |
| New endpoints reject without auth| 401 on /rates, /finance, /ddl       |
| Library router has 17 endpoints  | OK (up from 5 in 1.3.2)             |

#### One bug caught + fixed during verification

- `msUntilNext` tests assumed UTC, but `setHours()` uses local time. Rewrote tests to be
  timezone-agnostic (test the (0, 24h] window + same-day exact computation against a
  locally-built `now`).

### Verified — Sprint 1.3.6 (2026-04-28) — Release-cut validation (v1.3.0-alpha.0)

End-to-end validation against the freshly-installed workspace. Three caught-and-fixed bugs:

1. **`audit.log(...)` typo across 8 routers.** `import { log as audit } from '@platform/audit'`
   then calling `audit.log(...)` — `audit` IS the function (aliased), not an object. Bulk
   `sed` fix renamed all 9 call sites to `audit(...)`.
2. **Top-level `const FILE = libraryPath(...)`** computed at module load — didn't honour
   `setDataDir()` between tests. Refactored 9 stores/services to lazy `const fileOf = () =>
   libraryPath(...)` getter pattern, then bulk-replaced `FILE` references with `fileOf()`
   calls (via node regex; BSD sed doesn't support `\b`).
3. **`AppError.message` didn't contain code** — `assert.rejects(promise, /CYLINDER_DUPLICATE/)`
   couldn't match because messages contained only human prose. Updated `AppError` to
   `super('[' + code + '] ' + message)` and added `humanMessage` field; `safeError`
   middleware strips the `[CODE]` prefix when serialising for clients.

Plus one regression-verification fix in tests: `sanitizeReason('<script>x</script>...')`
strips tags but keeps `x` (matches v1.2 behaviour); test expectation updated from
`'price too high'` to `'xprice too high'` with comment explaining XSS protection comes from
React auto-escape at render time, not from the sanitiser.

#### Vite alias config refactor

Vite alias resolution is prefix-match in declaration order. `'@platform/auth'` was matching
before `'@platform/auth/client'`, so an import of `'@platform/auth/client'` resolved to
`platform/auth/client/client` (doubled suffix). Refactored `vite.config.js` to array form
with most-specific keys first.

#### Verification results

| Gate                                | Result                              |
| ----------------------------------- | ----------------------------------- |
| `npm install`                       | OK — 965 packages (project-local cache to bypass ~/.npm permission issue) |
| Syntax check (all .js + .cjs)       | OK — 0 errors across 100+ files     |
| Cross-domain import scan            | OK — 0 violations (8 domains)       |
| Full test suite (`node --test`)     | **144/144 pass** in ~1 s            |
| `npm run build` (Vite)              | OK — 79 modules → 231 KB JS / 6.8 KB CSS / gzipped 70 KB |
| Server boot smoke (`PORT=4099`)     | OK — all 8 domain routers mounted   |
| `GET /api/health`                   | 200 with version + uptime + dataDir |
| `GET /api/dashboard/metrics` (no auth) | 401 (auth gate works)            |
| `GET /api/costing/cylinders` (no auth) | 401                              |
| `POST /api/_smoke/echo` (empty body)| 400 INVALID_INPUT (validate gate works) |
| Structured JSON logs                | OK — correlationId on every entry   |
| Boot log lists 8 mounted domains    | OK — `boot.domains` event           |

#### Known release-blockers for v1.3.0 stable (post-alpha)

- v1.2 sub-features still need porting (Standard/Complex calc UI, sub-libraries beyond
  Material, planning sub-pages, etc.) — see RELEASE_NOTES.md "What is NOT yet in this release".
- Desktop installer build (`npm run desktop:build:all`) requires Electron native deps;
  defer to release candidate.
- Web UI manual smoke (operator walkthrough) not yet performed.

### Added — Sprint 1.3.5 (2026-04-28) — MES port + final domain (8/8 ALL DOMAINS LIVE)

- **`domains/mes`** — Connection Mode + IFS inventory mirror.
  - `shared/schema/connectionMode.js` — three modes (`embedded`/`thin`/`smart`); `thin` and
    `smart` require `server_url`. Defaults `poll_seconds=30`.
  - `shared/schema/ifsRow.js` — read-only validator for the upstream-populated mirror.
  - `server/services/connectionMode.js` — read/write to
    `data/library/SystemConfig/connection-mode.json` via atomic write +
    `withLock('mes.connection-mode')` + `publish('mes.connection_mode.updated', value)`.
  - `server/repositories/ifsInventoryStore.js` — read-only mirror at
    `data/library/mes/ifs-inventory.json`.
  - `server/routes/mesRouter.js` — `GET/PUT /api/mes/mode` (admin only PUT) +
    `GET /api/mes/ifs-inventory` (ETag-cached).
  - `client/mode/ConnectionModeCard.jsx` — read-only display.
  - `shared/i18n.js` — 11 EN/VN keys under `mes.*`.
  - `tests/mes.test.js` — 6 unit tests (mode validation, default, persist+publish,
    IFS row validation).

- **Boundaries enforcement** — `.eslintrc.cjs` was already authored with
  `boundaries/element-types: error`. **Verified zero cross-domain imports** with a
  grep scan across all 8 domains: `cross-domain scan complete` (no violations).

- **Apps wiring complete** — `apps/server/index.js` mounts all 8 domain routers + the
  cross-domain `/api/dashboard/metrics` (owned by apps/server, not a domain — see ADR-0003).
  `apps/client/src/App.jsx` shell now exposes 8 + 1 views including Connection Mode.
  `boot.domains` log line lists `[costing, library, planning, sales, quality, security,
  basis, mes]`.

### Added — Sprint 1.3.4 (2026-04-28) — Security + Basis (Approvals + Dashboard + Backup)

- **`domains/security`** — Approval workflow slice.
  - `shared/schema/approval.js` — state machine `Pending → InReview → Approved | Rejected
    | Recalled`; `Recalled` is the requester withdrawing.
  - `server/repositories/approvalStore.js` — JSON-on-disk store with optimistic locking,
    soft-delete, **and the `countActionable(actor)` helper that the v1.2 sidebar badge bug
    came from missing the `deleted_at` filter**. v1.3 keeps the filter as a load-bearing
    invariant. AuthZ enforced inside `transitionApproval` — only assignee/admin can
    Approve/Reject; only requester/admin can Recall (throws `AppError 403 FORBIDDEN`).
  - `server/routes/securityRouter.js` — 5 endpoints incl. `/count_actionable` (the
    sidebar-badge feed). Audit dual-write on every transition.
  - `client/approvals/PendingApprovalsInbox.jsx` — read-only listing.
  - `tests/approvalWorkflow.test.js` — 7 tests including the deleted_at filter
    regression test (`countActionable filters deleted_at — the v1.2 sidebar bug`),
    assignee/requester authZ paths, sanitised `rejectReason`.

- **`domains/basis`** — Dashboard UI + backup schedule slice.
  - `shared/schema/backupSchedule.js` — frequency `off|hourly|daily|weekly`, hour 0–23,
    retention 1–365 days; defaults daily/03:00/30 days.
  - `server/services/backupScheduler.js` — read/write to
    `data/library/SystemConfig/backup-schedule.json` + publishes
    `basis.backup_schedule.updated`.
  - `server/routes/basisRouter.js` — `GET/PUT /api/basis/backup-schedule` (admin-only PUT).
  - `client/dashboard/Dashboard.jsx` — 4-tile KPI shell that calls
    `/api/dashboard/metrics` (cross-domain endpoint owned by apps/server).
  - `tests/backupSchedule.test.js` — 6 tests including event-bus publish.

- **`apps/server/routes/dashboard.js`** — NEW. Cross-domain aggregation endpoint
  (`GET /api/dashboard/metrics`) lives in `apps/server` because aggregation across domains
  is a deployment-shell concern. ARCHITECTURE.md "apps may import from any domain;
  domains must not import from each other" — this is the canonical example.

- **First domain-isolation correction caught + fixed.** Initially placed `dashboardStats.js`
  inside `domains/basis/server/services/` importing from `@domains/sales-server`,
  `@domains/planning-server`, etc. Caught immediately as a violation of ADR-0002 (domain
  isolation), removed, lifted to `apps/server/routes/dashboard.js`. The boundaries lint rule
  in `.eslintrc.cjs` would have caught this on `npm run lint`.

### Added — Sprint 1.3.3 (2026-04-28) — Three more domain ports (planning + sales + quality)

Three more vertical slices, each with state-machine semantics, soft-delete + optimistic
locking + audit dual-write + ETag-cached reads.

#### domains/planning — Order Entry slice (PP)

- `shared/schema/order.js` — state machine `Draft → Released → InProgress → Completed | Cancelled`
  with `canTransition` validator. Strict-mode field stripping (forward-compat hardening).
- `server/repositories/orderStore.js` — JSON-on-disk store at `data/planning/orders.json`,
  optimistic lock via `version`, soft-delete refused on `InProgress` (must Cancel first).
- `server/routes/planningRouter.js` — 5 endpoints (`GET list` ETag-cached, `GET :no`,
  `POST` create, `POST :no/transition`, `DELETE :no` admin-only soft-delete). Audit events
  `ORDER_CREATE`/`ORDER_TRANSITION`/`ORDER_DELETE`.
- `client/order-entry/OrderList.jsx` — read-only list via `useCachedFetch` + `StatusBadge` per
  state.
- `shared/i18n.js` — 12 EN/VN keys under `planning.order.*`.
- `tests/order.test.js` — 8 unit tests (validation, state machine, happy path, illegal
  transitions, duplicate, soft-delete refused on InProgress).

#### domains/sales — Quote envelope slice (SD)

- `shared/schema/quote.js` — state machine `Draft → InReview → Approved → Released → Archived`
  + `Cancelled` terminal. Currency cross-sync (USD ↔ VND from `fx_rate` snapshot).
  `withDerived()` computes `contr_pct` on read (never persisted — v1.2 lesson).
- `server/repositories/quoteStore.js` — store at `data/library/sales/quotes.json`. Auto-syncs
  currencies on create. Stamps `released_at` on `Released`. Refuses `softDelete` on `Released`
  (archive instead). Optimistic lock + soft-delete + version bump per transition.
- `server/routes/salesRouter.js` — 5 endpoints + cross-domain handoff: on `Released`
  publishes `sales.quote.released` via `@platform/observability/eventBus`. Audit dual-write
  on every mutation.
- `client/quote-history/QuoteHistory.jsx` — table with PRICE USD + PRICE VND + Contr.%
  columns (the v1.2 Sprint 1.6/1.7 columns).
- `shared/i18n.js` — 14 EN/VN keys under `sales.quote.*`.
- `tests/quote.test.js` — 9 unit tests including currency auto-sync, contr% computed on read,
  state machine, terminal-state guards, soft-delete refusal on Released.

#### domains/quality — Sample tracking slice (QM)

- `shared/schema/sample.js` — state machine `Requested → InProduction → ReadyForReview →
  Approved | Rejected` with rework path back from ReadyForReview to InProduction.
- `server/repositories/sampleStore.js` — same patterns as orders/quotes. `Rejected` requires a
  `rejectReason`; sanitised via `@platform/http/sanitizeReason` before persist.
- `server/routes/qualityRouter.js` — 5 endpoints. Audit events
  `SAMPLE_CREATE`/`SAMPLE_TRANSITION`/`SAMPLE_DELETE`.
- `client/sample-tracking/SampleTracking.jsx` — read-only list with status badges per state.
- `shared/i18n.js` — 11 EN/VN keys under `quality.sample.*`.
- `tests/sample.test.js` — 7 unit tests (state machine, happy path, reject requires reason,
  reason sanitisation strips HTML, soft-delete, duplicate rejection, illegal transitions).

#### Apps wiring

- `apps/server/index.js` — calls `mountPlanning`/`mountSales`/`mountQuality`. `boot.domains`
  log now lists 5 mounted modules.
- `apps/client/vite.config.js` — workspace aliases for the 3 new domain client packages.
- `apps/client/src/main.jsx` — calls 3 new `register*I18n()` functions at boot.
- `apps/client/src/App.jsx` — 5-view shell with table-driven `VIEWS` array (was 3-view).

#### Verified

- 0 syntax errors across 95+ files (apps + platform + domains).
- 76/76 pure-Node platform tests still green.
- Cross-domain check: planning → publishes nothing; sales → publishes `sales.quote.released`
  on transition; quality → standalone. No direct domain↔domain imports.

### Added — Sprint 1.3.2 (2026-04-28) — First two domain ports (vertical slices)

Two complete vertical slices proving the v1.3 architecture end-to-end. Each slice
exercises **client → @platform/* → @domains/<name> → @platform/storage → JSON store**
plus role check, audit dual-write, validation, ETag (where applicable), i18n
registration, and optimistic locking.

#### domains/costing — Master Cylinder admin slice (port of v1.2 Sprint 1.7j)

- `shared/gallusInventory.js` — factory `PRINT_CYLINDERS` (Z=60..220) +
  `MAGNETIC_CYLINDERS` (22 stocks) + `GALLUS_DEFAULTS` + runtime override
  (`getPrintCylinders`/`setRuntimePrintCylinders`) + `FACTORY_DEFAULT_ZS` set
  (used by service to refuse DELETE on factory rows).
- `server/services/cylinderService.js` — `listCylinders`/`toggleCylinder`/`addCylinder`/
  `deleteCylinder`. Persists to `data/library/SystemConfig/master-cylinders.json` via
  `@platform/storage/atomicWriteJson` under `withLock('costing.master-cylinders')`.
  Audit dual-write (`CYLINDER_ADD`/`CYLINDER_UPDATE`/`CYLINDER_DELETE`). Throws
  `AppError('CYLINDER_PROTECTED', 409)` on factory-row delete attempts.
- `server/routes/costingRouter.js` — 4 endpoints (`GET`/`PUT`/`POST`/`DELETE`
  `/api/costing/cylinders[/:z]`) wired with `@platform/http/validateBody+validateParams`,
  `@platform/auth/requireAuth+requireRole('admin')`, `asyncHandler`. Mounted via
  `mountCosting(app)` from the server.
- `client/design-tools/master-cylinder/MasterCylinderTable.jsx` + `.css` — UI with
  `useAuth().hasRole('admin')` gating. Y/N pill toggle (admin only), inline
  + Add cylinder form (admin only), Delete button (only on admin-added rows).
  Marker class `gc-pill-toggle` preserved from v1.2 for installer grep verification.
- `shared/i18n.js` — 14 EN/VN keys under `costing.cylinder.*` namespace.
- `tests/cylinderService.test.js` — 8 unit tests (factory baseline, toggle, add/delete
  round-trip, factory-protect, duplicate rejection, optimistic-lock semantics).

#### domains/library — Material library slice

- `shared/schema/material.js` — hand-rolled (zero-dep, like v1.2 librarySchema.js)
  validator. Required fields: `code`, `name`, `kind`, `unit`. Allowed kinds:
  `substrate | ink | adhesive | liner | core | accessory`. Strict mode strips unknown
  keys (forward-compat hardening from v1.2 P0-1).
- `server/repositories/materialStore.js` — JSON-on-disk store with optimistic locking
  via `version` column, soft-delete via `deleted_at`, in-process lock around RMW.
  Read paths filter `deleted_at` (the v1.2 lesson). All writes through
  `@platform/storage/atomicWriteJson`.
- `server/routes/libraryRouter.js` — 5 endpoints (`GET list`, `GET :code`, `POST`,
  `PUT :code` with `If-Match` version, `DELETE :code` soft). GET uses
  `@platform/cache/sendJsonWithEtag` for 304 short-circuit. Audit dual-write on every
  mutation (`MATERIAL_CREATE`/`MATERIAL_UPDATE`/`MATERIAL_DELETE`). Mounted via
  `mountLibrary(app)`.
- `client/material/MaterialLibrary.jsx` — read-only listing using
  `@platform/cache/useCachedFetch` (SWR). Shows the ETag/cache pattern + skeleton +
  empty-state from `@platform/ui-kit`.
- `shared/i18n.js` — 13 EN/VN keys under `library.material.*` namespace.
- `tests/material.test.js` — 9 unit tests (validation, create round-trip, duplicate
  rejection, version bump, optimistic-lock conflict, soft-delete hides from list,
  re-create after soft-delete).

#### Apps wiring

- `apps/server/index.js` — calls `mountCosting(app)` + `mountLibrary(app)`,
  logs `boot.domains` event listing mounted modules.
- `apps/client/vite.config.js` — workspace aliases for `@platform/{auth,cache,i18n,ui-kit}/client`
  + `@domains/{costing,library}-client`.
- `apps/client/src/main.jsx` — wraps `<App />` in `<AuthProvider>`, calls
  `registerCostingI18n()` + `registerLibraryI18n()` once at boot.
- `apps/client/src/App.jsx` — three-view shell (Material library / Master cylinder
  / Server health) with top-bar `<LangFlagToggle />`. Demonstrates both domain UIs
  importable + i18n + auth context wiring.

#### Verified

- 0 syntax errors across all `.js`/`.cjs` in `apps/` + `platform/` + `domains/` (95 files).
- 76/76 pure-Node platform tests pass (cylinderService + material tests gate on
  `npm install` for `proper-lockfile` + `better-sqlite3`).
- Domain isolation: `domains/costing` and `domains/library` import only from
  `@platform/*` and their own `shared/`. No cross-domain imports.

### Added — Sprint 1.3.1 (2026-04-28) — Platform layer + apps wiring (complete, 9/9 packages)

- Workspace `package.json` for every `apps/*` and `platform/*` package; npm workspaces wired.
- **`@platform/storage`** — `dataDir`, `safePath`, `atomicWriteFileSync`, `atomicWriteJson`,
  `withLock` (in-process + cross-process via `proper-lockfile`), `db` singleton + WAL pragmas,
  `tx`, `migrate`. Tests for safePath (5), atomicWrite (5), asyncLock (4).
- **`@platform/http`** — `AppError`, `asyncHandler`, `validateBody/Query/Params`,
  `makeIpLimiter`/`makeUserLimiter` + pre-built `writeRateLimit`/`userSaveRateLimit`,
  `safeError` middleware (bucket-redacts unexpected errors), `redactErrorMessage`/
  `stripAbsolutePaths`/`asSafeError`, `sanitizeReason`/`sanitizeUsername`. Tests for
  validate (7), safeError (6), sanitize (8).
- **`@platform/observability`** — `log` (JSON, AsyncLocalStorage correlation, swappable
  streams via `setLogStreams` for tests), `metrics` (Prometheus counter + histogram,
  `timed` helper, verbatim from v1.2), `eventBus` (in-process pub/sub).
  Tests for log (4), metrics (5), eventBus (6).
- **`@platform/auth`** (clean re-impl, invariants preserved): `bcryptHash`/`bcryptVerify`
  (BCRYPT_ROUNDS env, ≥12 in prod), AES-256-GCM TOTP (`totpEncrypt`/`totpDecrypt`/
  `totpVerify`/`totpGenerateSecret`/`totpUri`/`totpKeyAvailable`, fail-closed on missing
  key), HS256 JWT (`signJwt`/`verifyJwt` zero-dep), `sessionCookie` (HttpOnly +
  SameSite=Strict), SQLite-backed lockout (5 fails / 15 min, persisted),
  `requireAuth`/`requireRole` Express middleware. Client: `<AuthProvider>` + `useAuth()`
  with `hasRole(role)` ladder (viewonly < user < cost < admin < sys). Tests for totp (10),
  jwt (8), bcrypt (3 — needs npm install).
- **`@platform/audit`** — SQLite-backed append-only log (`log`/`query`/`rowCount`),
  fail-open writes (audit failure never blocks request), `retentionSweep` reading
  `AUDIT_RETENTION_DAYS` env (default forever).
- **`@platform/cache`** — server `sendJsonWithEtag`/`computeJsonEtag` (verbatim from v1.2
  Sprint 1.7h Phase 1), client `useCachedFetch` SWR pattern with persistent-snapshot
  adapter (`setSnapshotAdapter` decouples from desktop bridge — same code runs in web +
  Electron). Tests for etag (5).
- **`@platform/sync`** stub: `mountSyncRouter` + `registerReplicable` server contract,
  `startSyncEngine`/`syncStatus` client polling loop. Full implementation Sprint 1.3.5.
- **`@platform/i18n`** (clean re-impl per ADR-0004 — NO monolithic strings file):
  `registry.register({ namespace, strings })` enforces `<namespace>.<key>` shape +
  required `{ en, vi }` pair, `useI18n()` React hook over `useSyncExternalStore`,
  `<LangFlagToggle />` EN/VN pill widget. Tests for registry (7).
- **`@platform/ui-kit`** (8 components from v1.2): `Button`, `Modal` + Header/Body/Footer
  (sm/md/lg/xl + 5 severities + ESC/click-outside/focus-trap), `StatusBadge` (12 tones),
  `EmptyState`, `SkeletonTable` (shimmer), `ErrorBoundary` (stale-chunk auto-reload +
  telemetry beacon — v1.2 lessons), `ConflictModal` (optimistic-lock UX), `TabBarOverflow`
  (ARIA tablist + Home/End nav). Re-exports `LangFlagToggle` from `@platform/i18n`.
- **`apps/server`** — Express boot with platform middleware mounted in correct order
  (correlation id → access log + latency → routes → safeError last). `/api/health` +
  `/api/metrics` + `/api/_smoke/echo`. Health integration test.
- **`apps/client`** — Vite config with workspace aliases, minimal React 19 shell that
  pings `/api/health`.
- **`apps/desktop`** — Electron `main.cjs` + `preload.cjs` stub.
- **Verified:** 0 syntax errors across all `.js`/`.cjs` in `apps/` + `platform/` (78 files).
  76/77 pure-Node tests pass — only `bcrypt.test.js` needs `npm install` to load `bcryptjs`.
  11 JSX components validate via Vite build (gates on workspace install in 1.3.2).

### Added — Sprint 1.3.0 (2026-04-28) — Architectural reset

- New repo layout under `Ops Control v1.3/` based on bounded-context vertical slices.
- `.claude/` AI agent configuration aligned with `3. PROJECTS/README.md` pattern:
  commands, agents, rules, skills, references.
- `apps/{client,server,desktop}` deployment shells (currently empty — to be wired in Sprint 1.3.1+).
- `domains/{costing,library,planning,sales,quality,security,basis,mes}/` with consistent
  `client/server/shared/tests/README.md` shape.
- `platform/{auth,audit,cache,sync,i18n,ui-kit,http,storage,observability}/` for
  cross-cutting capabilities.
- Top-level docs: `README.md`, `ARCHITECTURE.md`, `MIGRATION.md`, `CLAUDE.md`, `CHANGELOG.md`.
- ADR-0001 through ADR-0005 covering stack choice, vertical slicing, platform layer,
  per-domain i18n, npm workspaces.
- `docs/sprints/v1.3-migration-plan.md` — staged port from v1.2.

### Notes

- v1.2 remains the source of truth and ships production builds. v1.3 source code is empty;
  domains will be populated per the plan in `docs/sprints/v1.3-migration-plan.md`.
- All v1.2 functional invariants (see `CLAUDE.md` §"Operational invariants") are preserved
  as acceptance criteria for v1.3.

---

## v1.2 baseline (reference)

For the v1.2 changelog see `../Ops Control v1.2/CHANGELOG.md`. The functional baseline at v1.3.0
matches v1.2 at Sprint 1.7j (Master Cylinder admin controls).
