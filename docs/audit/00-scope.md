# Phase 0 — Discovery & Scope

**Audit branch**: `audit/pre-go-live-v1.2` (cut from `feature/order-entry-fg-sync-and-import` @ commit `0aacb3c`)
**Audit date**: 2026-05-03
**Auditor**: Senior QA / Tech Lead / DevOps Architect
**Target**: Ops Control v1.5.0 (root) — Web + Desktop + Kiosk PWA + Planning domain

---

## 1. Tech Stack

### Frontend

| Surface                        | Framework                | Version         | Build      |
| ------------------------------ | ------------------------ | --------------- | ---------- |
| `client/` (main web UI)        | React + react-router-dom | 19.2.4 / 6.30.3 | Vite 8.0.4 |
| `apps/kiosk/` (shop-floor PWA) | React                    | 19.2.4          | Vite 8.0.4 |

### Backend

| Component              | Tech                                          | Version                      |
| ---------------------- | --------------------------------------------- | ---------------------------- |
| HTTP                   | Express                                       | 4.21                         |
| Auth                   | argon2 + bcryptjs (legacy)                    | 0.44 / 2.4.3                 |
| DB (primary)           | better-sqlite3 (server)                       | 12.9                         |
| DB (desktop bundle)    | better-sqlite3 (Electron)                     | **11.3** ← version drift     |
| Storage backend toggle | env `OPS_DATA_BACKEND`                        | `file` (default) \| `sqlite` |
| File parsing           | `@e965/xlsx` (xlsx fork), `multer`, `exceljs` | —                            |
| Doc generation         | `docx` (Word user guide via `prebuild` hook)  | 9.6                          |

### Desktop

- Electron 41.3 + electron-builder 26.8 + electron-updater 6.3
- macOS (arm64 / x64) + Windows targets

### Tooling

- ESLint 10.2 + Prettier 3.8 + Husky 9.1 + commitlint 20.5 + lint-staged 16.4
- Jest 29.7 (root only — see §5 caveat) + `node --test` (server / domains / desktop)
- Playwright 1.55 (kiosk e2e)
- Puppeteer-core 24.42 (likely for `scripts/help/self-check.mjs`)

### CI / CD

- `.github/workflows/ci.yml` — audit → lint → test job chain on push to `main`/`release/**`/`sprint/**` and PRs to `main`
- Husky hooks: `commit-msg` + `pre-commit` (+ generated `_/` shim)
- Deployment scripts: `deploy.sh` (Linux SSH), `deploy.ps1` (Windows), `deploy.bat` (Windows legacy), `INSTALL.command`, `START_SERVER.command`/`.bat`

---

## 2. Workspace Structure

```
ops-control/                        ← root package "ops-control" v1.5.0
├── client/                         ← main React SPA, "client" v1.3.0 ⚠ version drift
├── apps/kiosk/                     ← Vite PWA, "@ops-control/kiosk" v0.1.0
├── desktop/                        ← Electron shell, "ops-control-desktop" v1.3.0 ⚠
├── domains/planning/               ← Planning bounded context (server + tests + shared)
├── server/                         ← Express HTTP + repositories + services
├── scripts/                        ← 40 ops/deployment/preflight scripts
├── docs/                           ← Architecture, security, audit history, sprint logs
├── README FIRST/                   ← Onboarding folder (CHANGELOG, README, etc.)
├── Use guide/                      ← Operator-facing docs (xlsx training manuals)
├── Backup & restore/               ← Backup/restore tooling
├── _legacy/                        ← Quarantined legacy code (excluded from tests)
└── desktop/dist + client/dist      ← Build artefacts
```

**File count**: 439 source files (`.js`, `.jsx`) under `client/src`, `server`, `domains`, `apps/kiosk/src`, `desktop/main.js` — excluding tests/legacy/dist/node_modules.

---

## 3. Modules & Endpoints

### Frontend modules

- **Cost** (`client/src/modules/cost/`) — 89 files. Tabs: Standard/Complex calc, MaterialLibrary, InkCalculator, PrintAreaCalc, DesignTools, Dashboard, QuoteAnalysis, Summarize, FormalQuotation, QuoteHistory, PendingApprovalsInbox, RFQTracker, SampleTracking, IFSInventory, Settings, Help, AdminMetrics, AuditLog, KioskAdmin, Messages, plus 7 library tabs.
- **Planning** (`client/src/modules/planning/`) — Order Entry, BOM Explosion, Material Check, Capacity Planning, Work Orders Legacy + v2.
- **Home** (`client/src/modules/home/`) — operator dashboard (untracked, this branch).
- **Help** (`client/src/help/`) — `content.js` is **6 056 LOC** of help registry (single source for in-app help + Word user guide).

### Backend route surface

**238 endpoint definitions** across 8 main route files:

| Route file                      | Endpoints | Notes                                                                    |
| ------------------------------- | --------: | ------------------------------------------------------------------------ |
| `server/routes/costApi.js`      |        69 | Largest — flagged for extraction in `docs/COSTAPI_EXTRACTION_ROADMAP.md` |
| `server/routes/shared.js`       |        64 | Quotes / dashboard / common reads                                        |
| `server/routes/chat.js`         |        15 | Internal messaging                                                       |
| `server/routes/planning.js`     |        13 | Planning module HTTP layer                                               |
| `server/routes/import.js`       |        11 | Bulk import flows                                                        |
| `server/routes/importWizard.js` |         8 | Step-wise import                                                         |
| `server/routes/sync.js`         |         3 | Multi-client sync                                                        |
| `server/routes/events.js`       |         2 | Server-sent events                                                       |

Plus `domains/planning/server/routes/*` (operationV2, workOrderV2, etc. — Sprint MES-1/2/3 work).

---

## 4. Code-Smell Inventory

### Files > 1 000 LOC (16 source files; node_modules excluded)

|   LOC | File                                                              | Risk                                                       |
| ----: | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| 6 056 | `client/src/help/content.js`                                      | Acceptable — pure data registry                            |
| 2 913 | `server/routes/costApi.js`                                        | 🟠 Extraction planned (docs/COSTAPI_EXTRACTION_ROADMAP.md) |
| 2 468 | `client/src/modules/cost/tabs/DesignTools/presses/GallusCalc.jsx` | 🟡 Calc UI                                                 |
| 2 367 | `server/routes/shared.js`                                         | 🟠 Mixed concerns                                          |
| 2 265 | `client/src/modules/cost/tabs/Settings.jsx`                       | 🟠 Flagged in CLAUDE.md (Sprint 12 deferred refactor)      |
| 2 087 | `client/src/modules/cost/tabs/PrintAreaCalc.jsx`                  | 🟠 Flagged in CLAUDE.md                                    |
| 1 721 | `client/src/services/printAreaCore.js`                            | 🟡 Pure algorithm with own tests                           |
| 1 701 | `client/src/modules/cost/tabs/StandardCalc/CalcLegend.jsx`        | 🟡                                                         |
| 1 634 | `client/src/modules/cost/tabs/RFQTracker.jsx`                     | 🟡                                                         |
| 1 548 | `client/src/modules/cost/tabs/SampleTracking.jsx`                 | 🟡                                                         |
| 1 462 | `server/services/authService.js`                                  | 🟠 Auth — high blast radius                                |
| 1 390 | `client/src/services/calcEngine.js`                               | 🟡 Pricing source-of-truth (CLAUDE.md lesson 3)            |
| 1 276 | `…/DesignTools/presses/gallusEngine.js`                           | 🟡 Pure engine                                             |
| 1 248 | `client/src/modules/cost/tabs/StandardCalc/CalcLayout.jsx`        | 🟡                                                         |
| 1 123 | `server/index.js`                                                 | 🟠 Entry point — concerns mixing                           |
| 1 019 | `desktop/main.js`                                                 | 🟡 Electron shell                                          |

**Total source files > 500 LOC**: ~30 (full list in scratch). Sprint 12 component-size refactor deferred per CLAUDE.md "Known operational risks".

### TODO / FIXME / HACK / XXX scan

**Only 2 TODOs found across 439 source files** — comment hygiene is exceptional. Both in `client/src/services/pdfVectorInk.js`:

- L265: `// TODO Phase 2: distinguish evenodd vs nonzero fill rule.`
- L384: `// RENDERING holes visible. See TODO above.`

No `FIXME`, `HACK`, or `XXX` markers. Suggests deliberate hygiene policy.

---

## 5. Test Coverage — ⚠ Material Finding

### Test execution baseline (all green)

| Surface                                 | Runner                               |     Count |      Pass |
| --------------------------------------- | ------------------------------------ | --------: | --------: |
| Server (root `npm test` step 2)         | `node --test`                        |       668 |       668 |
| Domains (`node --test domains`)         | `node --test`                        |       285 |       285 |
| Scripts (`node --test scripts`)         | `node --test`                        |        45 |        45 |
| **Server total**                        | `node --test server scripts domains` |   **998** |   **998** |
| Client (`cd client && node --test src`) | `node --test`                        |       594 |       594 |
| Desktop license                         | `node --test`                        |         8 |         8 |
| Desktop manifest                        | `node --test build-manifest.test.js` |         2 |         2 |
| **Grand total**                         | —                                    | **1 602** | **1 602** |

Plus Playwright kiosk e2e (3 specs — KIOSK-008 currently red per CLAUDE.md MES-3 backlog).

### 🟠 MAJOR — Jest coverage threshold is dead config

`package.json` defines:

```json
"coverageThreshold": {
  "global": { "lines": 70, "branches": 60, "functions": 70, "statements": 70 }
}
```

But `testPathIgnorePatterns` excludes EVERY real source directory:

```
['/node_modules/', '/Backup & restore/', '/client/', '/server/',
 '/scripts/', '/_legacy/', '/desktop/', '/domains/', '<rootDir>/apps/kiosk/tests/e2e/']
```

Jest discovers **0 test files**. `npm test` runs `jest --passWithNoTests` (passes vacuously) then chains `node --test` for the real work. The 70 % threshold therefore guards nothing.

**Why this matters**: A reviewer reading `package.json` infers a 70 % coverage gate. There is no gate. Real coverage of `client/src` and `server/` has never been measured by any tool wired into CI.

**Suggested action (P1, post-go-live)**: Either delete the `coverageThreshold` block (honest signal), or migrate to `c8` / `nyc` running over the `node --test` runners. Acceptable to defer — not a blocker since 1 602 tests exist and pass.

---

## 6. Environment & Secrets

### `.env` health

- `.env` exists in repo root with **only** `OPS_KIOSK_KEY` set.
- `.env.example` is comprehensive (full template, comments, generation hints for `OPS_TOTP_KEY`).
- `.gitignore` correctly covers `.env`, `.env.local`, `.env.*.local`, `**/totp_secrets.enc.broken-*`, `**/totp_secrets.enc.corrupt-*`.
- No `.env` in git history (verified by checkout — file present but tracked? Will verify in Phase 1).

### Required vars per `.env.example` (partial sample)

- `PORT`, `DATA_DIR`, `NODE_ENV`
- `OPS_CORS_ORIGINS` (must be set in prod or fallback is same-origin)
- `OPS_TOTP_KEY` (32-byte hex; CLAUDE.md "TOTP boot probe" runbook depends on this)
- `OPS_DATA_BACKEND` (`file` default, `sqlite` opt-in)
- `OPS_KIOSK_KEY` (kiosk pairing — set)

---

## 7. WIP State (not-yet-committed work on parent branch)

**27 modified files + 9 new paths** carried over from `feature/order-entry-fg-sync-and-import`. Substantial UI redesign from prior session:

### New files (untracked)

- `client/src/components/Layout/{ModuleLanding.jsx,ModuleLanding.css,sectionDefs.js}` — ERPAG-style landing pages
- `client/src/modules/cost/tabs/Dashboard.css` — Enterprise Dashboard scrollable layout
- `client/src/modules/home/` — Home/operator dashboard
- `docs/{erpag-survey,reports}/` — research artefacts
- `server/routes/planning.coerceDueDate.test.js`, `server/services/getProducts.test.js` — new tests

### Modified (highlights)

- `client/src/components/Layout/{Sidebar,TopBar}.{jsx,css}` — section nav redesign + topbar relocation
- `client/src/modules/cost/tabs/{Dashboard,QuoteAnalysis,PrintAreaCalc}.jsx` — title strip, KPI redesign, pivot consolidation
- `server/{routes/shared.js, routes/planning.js, repositories/*, services/*}` — month/year filter, planning store, dashboard stats
- `client/src/i18n/{strings.js,domains/basis.js}` — new keys for range/full-year/12m hint

**Audit implication**: This audit covers the working tree as it stands (the code about to ship), not the last tagged commit `0aacb3c` (v1.5.0). Findings will reference the actual files.

---

## 8. Existing Audit Material (cross-reference, not redundant)

The repo already contains substantial pre-existing audit + readiness documents. This audit **does not duplicate them** — it rechecks the claims and surfaces what they missed.

| Doc                                      | Date       | Status                               |
| ---------------------------------------- | ---------- | ------------------------------------ |
| `docs/GO_LIVE_READINESS.md`              | TBD        | Will reconcile in Phase 4            |
| `docs/GO_LIVE_GUIDE.md`                  | TBD        | Operator-facing — Phase 4            |
| `docs/ENTERPRISE_HARDENING.md`           | TBD        | Sprint 11–13 hardening trail         |
| `docs/SECURITY.md`                       | TBD        | Threat model — Phase 1.2 cross-check |
| `docs/COVERAGE_BASELINE.md`              | TBD        | Compare against §5 finding           |
| `docs/audit-2026-04-17/`                 | 2026-04-17 | Prior audit cycle                    |
| `docs/reports/` (this branch, untracked) | 2026-05-03 | Recent ERPAG survey                  |
| `CLAUDE.md` (Go-live readiness section)  | 2026-04-22 | Self-reported 72/100 conditional GO  |

---

## 9. Phase 0 Findings Summary

| ID   | Severity      | Finding                                                                                                                                                                                | Phase         |
| ---- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| F0-1 | 🟠 MAJOR      | Jest `coverageThreshold` is dead config (`testPathIgnorePatterns` excludes every source dir, Jest discovers 0 files)                                                                   | Re-confirmed  |
| F0-2 | 🟡 MINOR      | Sub-package version drift: root `1.5.0` vs `client` `1.3.0` vs `desktop` `1.3.0` vs kiosk `0.1.0`. CHANGELOG tracks root only.                                                         | Doc-time      |
| F0-3 | 🟡 MINOR      | `desktop/` pins `better-sqlite3@11.3` while server pins `12.9`. Different ABI runtimes are expected (lesson 25 + FIX-15) but version drift across same dep deserves a note.            | Cross-check   |
| F0-4 | 🟡 MINOR      | 6 source files > 2 000 LOC, 2 over 2 500. Refactor backlog real (Sprint 12 deferred) but not blocking.                                                                                 | Already known |
| F0-5 | 🟢 (positive) | Comment hygiene exceptional: 2 TODOs total, 0 FIXME/HACK/XXX. Suggests strict review discipline.                                                                                       | —             |
| F0-6 | 🟡 MINOR      | Audit branch cut with **27 modified + 9 untracked paths** (UI redesign from prior session). Audit covers working tree, not tagged HEAD. Operator should commit this WIP before deploy. | Phase 4       |

**No 🔴 BLOCKER discovered in Phase 0.**

---

## 10. Phase 0 Stats

- **Workspace size**: 439 source files, ~50 000 LOC client + server (rough est., excluding `content.js`)
- **Test surface**: 1 602 unit + 3 e2e (1 red per CLAUDE.md backlog)
- **Endpoint surface**: 238 routes
- **Time spent**: Phase 0 wall-clock ≈ 20 min (parallel discovery + docs)

---

## ✋ CHECKPOINT — Phase 0

Phase 0 complete. **No blockers found**, one MAJOR (`F0-1` Jest coverage gap) and three MINORs.

Awaiting confirmation before starting **Phase 1 — Static Code Audit** (ESLint/Prettier/`tsc --noEmit`/`madge`/`npm audit` × 3 packages, secret-scan, SQL/XSS risk grep, dependency drift, DB layer review).

If you want me to dig deeper on any Phase 0 item before proceeding, say so. Otherwise reply **"go phase 1"** and I'll continue.
