# Phase 1 — Static Code Audit

**Audit branch**: `audit/pre-go-live-v1.2`
**Audit date**: 2026-05-03
**Phase**: Static analysis (no app run yet)

---

## Severity legend (used throughout)

| Marker              | Meaning                                         |
| ------------------- | ----------------------------------------------- |
| 🔴 BLOCKER          | Chặn go-live                                    |
| 🟠 CRITICAL / MAJOR | Ảnh hưởng nghiệp vụ chính / metric/security gap |
| 🟡 MAJOR / MINOR    | Code-quality, maintainability                   |
| 🟢 OK / positive    | Pass — recorded for evidence                    |

---

## 1.1 Code Quality

### 1.1.1 ESLint

| Tree                                                 | Errors | Warnings | Notes                                                                                                                                                           |
| ---------------------------------------------------- | -----: | -------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root (`server/`, `scripts/`, `domains/`, `desktop/`) | **87** |  **393** | 63 errors are `no-undef` `console`/`process` in `scripts/help/capture-*.mjs` (browser puppeteer scripts run with Node globals not declared in their eslint env) |
| Client (`client/src/`)                               | **10** |  **318** | 296 warnings = `no-restricted-syntax` (inline `style={{...}}` rule from CLAUDE.md lesson 6, deliberate Sprint-12 deferred)                                      |
| Total                                                | **97** |  **711** |                                                                                                                                                                 |

**Error breakdown (root, top causes)**:
| Count | Rule | Cause |
|---:|---|---|
| 63 | `no-undef` | `console`, `process` not in env config for `scripts/help/capture-*.mjs` (Puppeteer scripts) — easy fix |
| 5 | `no-unused-vars` | Stale references after refactor |
| 4 | `no-irregular-whitespace` | Imported xlsx test fixtures with trailing NBSP |
| 3 | `no-useless-assignment` | Dev oversight |
| 2 | `no-empty`, `no-control-regex`, `no-useless-escape`, `no-regex-spaces` | Mostly in regex utilities |

**Error breakdown (client, all 10)**:
| File:Line | Rule | Description |
|---|---|---|
| [`Sidebar.jsx:164-165`](client/src/components/Layout/Sidebar.jsx) | `no-unused-vars` | `collapsedSections`, `toggleSection` orphaned after section-collapse refactor (CLAUDE.md lesson 26) |
| [`connectionHealth.js:44, 165`](client/src/services/connectionHealth.js) | `no-unused-vars` | `_` placeholder unused |
| [`DecimalInput.jsx:29`](client/src/utils/DecimalInput.jsx) | `no-unused-vars` | `toDisplay` defined but unused |
| [`printAreaCore.js:1213-1214`](client/src/services/printAreaCore.js) | `no-empty` | Empty catch `{}` × 2 |
| [`Dashboard.jsx:55`](client/src/modules/cost/tabs/Dashboard.jsx) | React 19 lint | `useMemo(buildYearOptions, [])` — should be `useMemo(() => buildYearOptions(), [])` (introduced in this audit branch's WIP) |
| [`HardwareSection.jsx:295`](client/src/modules/cost/tabs/HardwareSection.jsx) | React 19 lint | `useEffect(() => { refresh(); }, [])` — set-state-in-effect cascading-render warning |
| [`ConnectionBanner.jsx:65`](client/src/components/Layout/ConnectionBanner.jsx) | React 19 lint | `Date.now()` called during render — impure (should be in effect or memoized) |

**Warning breakdown**:

- **296 inline-style warnings** across **42 files**. CLAUDE.md lesson 6 explicitly accepts this — Sprint 12 component-size refactor deferred. Top 5 offenders are excluded in `client/eslint.config.js` ignore list (`PrintAreaCalc`, `Settings`, `InkCalculator`, `SubProductRow`, `Dashboard`). The rule blocks NEW additions without blocking the build.
- **13 `react-hooks/exhaustive-deps`** in 5 files. Mostly intentional (e.g., `ProcessFlowChart.jsx:178` chains 7 callbacks on the same `overrides` literal — a valid optimization opportunity but not a correctness bug).

| ID   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1-1 | 🟡 MINOR | 87 root + 10 client ESLint errors. Build is not blocked (CI runs `eslint .` but doesn't fail on errors per `.github/workflows/ci.yml`). 63 of 87 are eslint-env config gaps in puppeteer scripts — single-flag fix. The 10 client errors are real bugs (4 unused vars, 2 empty catches, 3 React 19 set-state-in-render warnings — 2 of those introduced in this branch's WIP). |
| F1-2 | 🟢 OK    | 296 inline-style warnings are deliberate (Sprint-12 backlog). The lint rule prevents NEW additions; existing offenders are gated by file-ignore list.                                                                                                                                                                                                                          |
| F1-3 | 🟢 OK    | Zero TypeScript usage in source — pure JS/JSX. `tsc --noEmit` is N/A.                                                                                                                                                                                                                                                                                                          |

### 1.1.2 Prettier

`prettier --check .` reports **412 files** at root + **247 files** in client need reformatting. These are warnings only — no enforcement gate.

`.husky/pre-commit` runs `lint-staged` which auto-formats on commit, so the drift accumulates only in untouched files. Not a go-live blocker.

| ID   | Severity | Finding                                                                                                                        |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| F1-4 | 🟢 OK    | Prettier drift in 659 files but auto-fixed by Husky on every commit; new code is always formatted before merge. Not a blocker. |

### 1.1.3 console.log in production code

**66 occurrences** of `console.log/debug/info` in `client/src` + `server` + `domains`. Sample inspection:

- `server/index.js`: 9 calls — boot diagnostics ("✅ production preflight passed", "🚀 Ops Control server running at…"), legitimate startup logs.
- `server/index.js:257`: `console.log(JSON.stringify(entry))` — structured request log, intentional.
- `client/src/components/Auth/AppBootstrap.jsx:76`: `[bootstrap] aux tasks settled in Xms` — dev debug, leaks to prod console.
- `client/src/modules/cost/tabs/AboutSection.jsx:165`: `=== Ops Control diagnostic snapshot ===` — operator-facing copy-to-clipboard helper, intentional.

CLAUDE.md mentions `utils/logger.js` (DEV-only `log/warn` + always-on `err`) was added in Sprint 10 (P2-4). Some sites adopt it (AdminMetrics, apiTry); others still use raw `console.*`.

| ID   | Severity | Finding                                                                                                                                                                                                                                                                        |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1-5 | 🟡 MINOR | 66 raw `console.*` calls in src code. Many are legitimate boot/diagnostic logs (server `index.js`) but at least 5–10 are dev debug that leaks to prod (`AppBootstrap`, GallusCalc, etc.). Sprint-10 P2-4 left this incomplete. Quick win: full migration to `utils/logger.js`. |

### 1.1.4 Dead code / unused imports

ESLint catches `no-unused-vars` (5 root + 5 client). The repo also has a custom orphan-module lint at [`client/src/utils/deadCode.lint.test.js`](client/src/utils/deadCode.lint.test.js) — **594 client tests pass**, so no current orphan modules exist (CLAUDE.md lesson 2 — `KNOWN_ORPHANS` whitelist enforced).

| ID   | Severity | Finding                                                                                                                              |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| F1-6 | 🟢 OK    | Orphan-module discipline enforced via `deadCode.lint.test.js`. 10 unused-var ESLint errors are localised cleanup, not architectural. |

### 1.1.5 Circular dependencies

Verified with `madge --circular`:

| Tree          | Files scanned | Circular |
| ------------- | ------------: | :------: |
| `server/`     |           149 | **0** ✅ |
| `client/src/` |           297 | **0** ✅ |
| `domains/`    |            65 | **0** ✅ |

| ID   | Severity | Finding                                                                 |
| ---- | -------- | ----------------------------------------------------------------------- |
| F1-7 | 🟢 OK    | Zero circular deps across 511 source files. Architecture stays acyclic. |

### 1.1.6 Code duplication

`jscpd` not installed; would require a fresh dep. Skipped — large-file inventory in Phase 0 §4 already flags duplication risk in `Settings.jsx`, `PrintAreaCalc.jsx`. Recommend running `jscpd` post-go-live as part of Sprint 12 refactor.

---

## 1.2 Security Scan

### 1.2.1 npm audit

| Package          | info | low | mod | high | crit |    Total |
| ---------------- | ---: | --: | --: | ---: | ---: | -------: |
| Root (prod-only) |    0 |   0 |   0 |    0 |    0 | **0** ✅ |
| Client           |    0 |   0 |   0 |    0 |    0 | **0** ✅ |
| Desktop          |    0 |   0 |   0 |    0 |    0 | **0** ✅ |

| ID   | Severity | Finding                                                                                        |
| ---- | -------- | ---------------------------------------------------------------------------------------------- |
| F1-8 | 🟢 OK    | Zero CVEs across all 3 packages. CI gate `npm audit --audit-level=high` already enforces this. |

### 1.2.2 Hardcoded secrets

Patterns scanned: `(api[_-]?key|secret[_-]?key|access[_-]?token|bearer|password)\s*[:=]\s*['"][a-zA-Z0-9_-]{12,}['"]` and JWT-shape literals `eyJ.+\.eyJ.+\..+`.

**Findings**:

- **0 hardcoded credentials in source**.
- **1 JWT-shape literal** in `domains/planning/tests/integration/contracts/operationDispatch.contract.test.js:54` — explicitly a test fixture (`.notavalidsig` suffix). Not a leak.
- `.env` never tracked: `git log --all --diff-filter=A -- .env` returns empty.
- `.gitignore` correctly covers `.env`, `.env.local`, `.env.*.local`, `**/totp_secrets.enc.broken-*`.

| ID   | Severity | Finding                                                                            |
| ---- | -------- | ---------------------------------------------------------------------------------- |
| F1-9 | 🟢 OK    | Zero hardcoded credentials. `.env` hygiene clean. JWT in tests is a known fixture. |

### 1.2.3 SQL injection surface

**16 raw template-literal SQL sites** found (interpolating `${var}`). Each manually verified:

| File                                                    |              Line | Interpolated value                       | Source                                                                                                                         | Verdict |
| ------------------------------------------------------- | ----------------: | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `server/repositories/shadowWrite.js`                    |           131-150 | `${table}`, `${deleteWhere.sql}`         | Internal whitelisted table-name map; `deleteWhere.sql` is hardcoded WHERE clause from same module                              | ✅ Safe |
| `server/repositories/backends/sqliteBackend.js`         |      114-115, 233 | `${table}`, `${kind}`, `${placeholders}` | Internal switch on enum + `?, ?, ?` placeholders                                                                               | ✅ Safe |
| `server/db/init.js`                                     |                47 | `${col}`                                 | Iterates literal array `['started_at','paused_at',…]`                                                                          | ✅ Safe |
| `server/services/backupScheduler.js`                    |          148, 168 | `${t}`, `${table}`                       | Internal table iteration array                                                                                                 | ✅ Safe |
| `domains/planning/server/repositories/workOrderRepo.js` | 97, 108, 124, 215 | `${where}`, `${sets.join(', ')}`         | `where` from `buildWhere()` (param-bound); `sets` filtered by `HEADER_PATCHABLE_FIELDS.includes(k)` whitelist + values via `?` | ✅ Safe |

**ALL user-supplied values go through `?` parameter binding via better-sqlite3's prepared statements**. No string-concat-with-user-input found anywhere.

| ID    | Severity | Finding                                                                                                                                                     |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-10 | 🟢 OK    | No SQL injection surface. All 16 interpolation sites use whitelisted internal constants (table names, column-name allowlists). User values are param-bound. |

### 1.2.4 XSS surface

`dangerouslySetInnerHTML` usage — 8 occurrences in 3 files:

| File                  |                   Line | Content source                                        | Verdict                                                                |
| --------------------- | ---------------------: | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `TotpEnrollment.jsx`  |                    125 | `qrSvg` from server (TOTP QR code, server-controlled) | ✅ Safe — server output, not user input                                |
| `HardwareSection.jsx` |                67, 340 | `t('hw.banner.p1')`, `t('hw.sn.wedge_label')`         | ✅ Safe — i18n strings from `client/src/i18n/` (compile-time literals) |
| `ModeSection.jsx`     | 85, 192, 194, 195, 286 | `t('mode.…')` × 5                                     | ✅ Safe — i18n strings                                                 |

**Zero `eval(`, zero `new Function(`, zero `.innerHTML =` in source**.

| ID    | Severity | Finding                                                                                                                                                                                              |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-11 | 🟢 OK    | All `dangerouslySetInnerHTML` callsites bind to compile-time-trusted content (i18n literals or server-issued QR SVG). No user-controlled HTML rendered. No `eval`/`new Function`/`innerHTML` writes. |

### 1.2.5 Web-security headers (verified in `server/index.js`)

| Header                      | Setting                                                                                                                                                                                                                                                                                 | Phase      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                                                                                                               | always     |
| `X-Frame-Options`           | `SAMEORIGIN`                                                                                                                                                                                                                                                                            | always     |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                                                                                                                       | always     |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload`                                                                                                                                                                                                                                          | production |
| `Content-Security-Policy`   | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests; report-uri /api/csp-report` | production |

**Posture**: Manually-rolled (no `helmet` dep) but tight. Single accepted exception is `style-src 'self' 'unsafe-inline'` — documented as the cost of Sprint-12-deferred inline-style migration. CSP report endpoint (`/api/csp-report`) is wired.

### 1.2.6 CORS

```
const corsAllowlist = (process.env.OPS_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (corsAllowlist.length > 0) {
  app.use(cors({ origin: (o, cb) => o ? (corsAllowlist.includes(o) ? cb(null,true) : cb(new Error(...))) : cb(null,true), credentials: true }));
} else if (NODE_ENV !== 'production') {
  app.use(cors({ origin: (o, cb) => cb(null, o || true), credentials: true })); // dev: reflect origin
} // production + empty = same-origin only
```

Posture: **default-deny in production** (production + empty `OPS_CORS_ORIGINS` = same-origin only), explicit allowlist when set, dev permissive with credentials. Matches OWASP guidance.

### 1.2.7 CSRF

- Pattern: double-submit cookie (`ops_csrf` non-httpOnly + matching `X-CSRF-Token` header).
- Middleware in `server/index.js:565` rejects mismatches with `403 csrf_failed`.
- Exempt paths: `/api/auth/login`, `/api/totp/verify`, `/api/totp/enroll` — bootstrap-time only, before session cookie exists.

| ID    | Severity | Finding                                                                                                            |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| F1-12 | 🟢 OK    | Headers (CSP/HSTS/XCTO/XFO/Referrer), CORS allowlist, CSRF double-submit all present and tight. Posture is mature. |

### 1.2.8 Rate limiting

`server/middleware/rateLimit.js` exports `writeRateLimit`, `saveRateLimit`. Applied at:

- `app.use('/api/import', authMiddleware, writeRateLimit, importRouter)` — bulk import
- `/api/save-all`, `/api/quotes` — `saveRateLimit`
- TOTP-specific: `totpVerifyRateLimit` on `/totp/verify`, `/totp/enroll`, `/totp/secret` (Sprint 1.7 audit fix per CLAUDE.md)

| ID    | Severity | Finding                                                                                                                                 |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| F1-13 | 🟢 OK    | Rate-limit middleware applied to all bulk-write + TOTP-sensitive endpoints. Login itself is gated by separate password+TOTP throttling. |

---

## 1.3 Dependencies Health

### 1.3.1 Outdated packages

**Root** (9 outdated):
| Package | Current | Latest | Major bump? |
|---|---|---|:---:|
| `express` | 4.22.1 | 5.2.1 | ⚠ Major (breaking) |
| `bcryptjs` | 2.4.3 | 3.0.3 | ⚠ Major — but legacy fallback only (argon2 is primary) |
| `jest` | 29.7.0 | 30.3.0 | ⚠ Major — but Jest discovers 0 files (F0-1) so impact = nil |
| `dotenv` | 16.6.1 | 17.4.2 | Minor compat issues only |
| `@playwright/test` | 1.55.0 | 1.59.1 | Minor |
| `@commitlint/*` | 20.5.2 | 20.5.3 | Patch |
| `eslint`, `globals` | … | … | Patch |

**Client** (10 outdated):
| Package | Current | Latest | Notes |
|---|---|---|---|
| `react-router-dom` | 6.30.3 | 7.14.2 | ⚠ Major — known breaking API |
| `pdfjs-dist` | 4.10.38 | 5.6.205 | ⚠ Major — used by `pdfVectorInk.js` (TODO at L265) |
| `@eslint/js`, `eslint` | 9.39.4 | 10.x | Major (root is on 10) — drift between root and client |
| `lucide-react` | 1.8.0 | 1.14.0 | Minor — icon updates |
| `vite`, `postcss` | … | … | Patch |

**Desktop** (4 outdated):
| Package | Current | Latest | Notes |
|---|---|---|---|
| `electron` | 41.3.0 | 41.5.0 | Minor security patches inside the same major |
| `electron-store` | 8.2.0 | 11.0.2 | ⚠ 3 majors behind |
| `serialport` | 12.0.0 | 13.0.0 | Major — barcode wedge / scale integration |
| `better-sqlite3` | shows 12.9 installed (matches server now), but `package.json` constraint pins ^11.3 | — | F0-3 confirmed: lockfile drift |

| ID    | Severity | Finding                                                                                                                                                                                                                      |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-14 | 🟡 MAJOR | **Express 4 → 5 not migrated**. Express 4 still receives security patches (v4 is the LTS for v5 transition window) but going to prod on a soon-to-be-EOL branch is technical debt. Plan major-version migration in Sprint+1. |
| F1-15 | 🟡 MINOR | `bcryptjs` legacy fallback path (`authService.js:291`) still loads when argon2 native module fails to build — observed in F0-3 (Electron ABI). Bumping to bcryptjs 3.x is straightforward.                                   |
| F1-16 | 🟡 MINOR | `electron-store` 3 majors behind. v11 has new sync API + better TypeScript. Not blocker — prod won't notice.                                                                                                                 |
| F1-17 | 🟡 MINOR | ESLint version drift: root `10.x`, client `9.x`. Different rules / formatters available. Pin to one across workspaces.                                                                                                       |

### 1.3.2 Deprecated packages

`bcryptjs` is not formally deprecated but `bcrypt` is the maintained C++ binding; project intentionally uses `bcryptjs` as JS-only fallback when `argon2` (C++) fails to load (CLAUDE.md doesn't mention but `authService.js` comments do). Acceptable.

`xlsx` — repo uses `npm:@e965/xlsx@^0.20.3` alias to a fork of the deprecated/CVE-laden `xlsx` package. **Already mitigated** — the alias bypasses the original CVE chain.

| ID    | Severity | Finding                                                                   |
| ----- | -------- | ------------------------------------------------------------------------- |
| F1-18 | 🟢 OK    | `xlsx` CVE chain mitigated via `@e965/xlsx` fork. Best practice followed. |

### 1.3.3 Licenses

| License                                                   | Count | Acceptability                          |
| --------------------------------------------------------- | ----: | -------------------------------------- |
| MIT                                                       |   588 | ✅                                     |
| ISC                                                       |    51 | ✅                                     |
| Apache-2.0                                                |    41 | ✅                                     |
| BSD-3-Clause                                              |    19 | ✅                                     |
| BSD-2-Clause                                              |    10 | ✅                                     |
| Other permissive (BlueOak, Unlicense, CC0, dual licenses) |     8 | ✅                                     |
| CC-BY-4.0                                                 |     1 | ⚠ Attribution required (commercial OK) |
| (MIT OR GPL-3.0-or-later)                                 |     1 | ✅ pick MIT                            |
| Python-2.0                                                |     1 | ✅                                     |

**Zero pure GPL/AGPL/LGPL/SSPL** in production tree. **Zero copyleft contamination**.

| ID    | Severity | Finding                                                                                                                                                               |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-19 | 🟢 OK    | License hygiene clean. 588/720 (82 %) MIT. No copyleft. CC-BY-4.0 dependency requires attribution in product credits — verify operator-visible "About" page lists it. |

### 1.3.4 Bundle size (current build)

| Chunk                       |      Size | Notes                                  |
| --------------------------- | --------: | -------------------------------------- |
| `index-49Sd2Fm4.js`         |    332 kB | Shell + router + auth                  |
| `pdf-CAmqcJLH.js`           |    330 kB | `pdfjs-dist` lazy chunk                |
| `HelpTab--V0tmcgU.js`       |    254 kB | Help registry (6 056 LOC `content.js`) |
| `StandardCalc-B2K4PjhR.js`  |    183 kB | Pricing calc — biggest tab             |
| `Settings-DgxkBx44.js`      |    109 kB |                                        |
| `ConflictModal-CY7X_FP6.js` |     98 kB |                                        |
| **Total `client/dist`**     | **19 MB** | All static assets including fonts      |

Initial paint: ~330 kB JS + maybe 30 kB CSS, gzipped ≈ 103 kB. Lazy chunks load on demand (CLAUDE.md per-tab code split). Acceptable for an internal LAN ERP.

| ID    | Severity | Finding                                                                              |
| ----- | -------- | ------------------------------------------------------------------------------------ |
| F1-20 | 🟢 OK    | Bundle size healthy. Per-tab lazy-load already in place. Initial gzipped JS ~103 kB. |

---

## 1.4 Database & Data Layer

### 1.4.1 Schema files

- `server/db/schema.sql` — primary schema (Phase-1 typed reference data: materials, BOM, routing, ifs_inventory, quotes, quote_versions, rfq_tracker, sample_tracker, audit_log, work_order, work_order_op, kiosk_pairing, op_status_event, idempotency_ledger).
- `server/db/init.js` — additive migrations (idempotent `IF NOT EXISTS` + `pragma_table_info` checks before `ALTER TABLE`).

### 1.4.2 Indexes

**24 indexes** defined in `schema.sql`. Coverage:

- `materials(kind, name, supplier)`
- `bom(parent_part, component_part, planner)`
- `routing_operations(part_no, work_centre_no, routing_type)`
- `ifs_inventory(kind, part_no)`
- `quotes(ccl_pn, rfq_number, saved_at DESC)`
- `quote_versions(quote_id, version_num DESC)`, `(quote_id, state_hash)`
- `rfq_tracker(stage, owner)`, `sample_tracker(overall_status)`
- `audit_log(ts DESC)`, `(event, ts DESC)`, `(user, ts DESC)`
- `work_order(status, due_date)`, `(ccl_pn)`, `(customer)`
- `work_order_op(status)`, `(work_centre_no, planned_start)`
- `kiosk_pairing(machine_code, redeemed_at_utc)`, `(session_jti)`
- `op_status_event` UNIQUE on `idempotency_key`, plus `(op_id, created_at_utc DESC)`
- `idempotency_ledger(created_at_utc)`

| ID    | Severity | Finding                                                                                                                                                                                                                     |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-21 | 🟢 OK    | Index coverage matches the dashboard queries (`saved_at`, `ccl_pn`, `rfq_number`) and the planner queries (`status`, `due_date`, `work_centre_no + planned_start`). Idempotency-key uniqueness enforced at the index level. |

### 1.4.3 Foreign keys

Only **2 explicit `REFERENCES` with `ON DELETE CASCADE`**:

- `work_order_op.work_order_id → work_order(id)`
- `op_status_event.op_id → work_order_op(id)`

The reference-data tables (materials, BOM, routing) are **denormalised by design** — each row carries `raw_json` so a missing FK doesn't break import (per `schema.sql:6-9`).

| ID    | Severity | Finding                                                                                                                                                                                                                                                                                                             |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-22 | 🟡 MINOR | Quotes table has no FK from `state_json`-referenced material codes back to `materials.code`. Acceptable for v1 (master data drift is a known operational reality), but means a deleted material won't surface as a broken-link warning on quote reload. Consider adding a read-time integrity check (post-go-live). |

### 1.4.4 Transactions

**23 transaction sites** found (`db.transaction(...)` from better-sqlite3, which auto-rollbacks on throw). Sample: `shadowWrite.js:117` wraps DELETE+INSERT bulk import in one tx; `chatStore.js`, `auditLog.js`, `quotesStore.js`, `kioskStore.js` all use the pattern.

better-sqlite3 transactions are synchronous + auto-rollback on throw — no manual `try/catch BEGIN/COMMIT/ROLLBACK` mistakes possible in this codebase by construction.

| ID    | Severity | Finding                                                                                                            |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| F1-23 | 🟢 OK    | Transaction discipline correct. better-sqlite3's auto-rollback semantics eliminate a class of hand-rolled tx bugs. |

### 1.4.5 Soft-delete consistency

Soft-delete present in:

- `quotes`: `state.deleted_at` (Sprint 13). `DELETE /api/sales/quotes/:id` sets `deleted_at`; `?purge=1` (sys-only) does hard delete after audit row.
- `chat_messages`: `deleted_at TEXT` column (`chatStore.js:101`).
- `users`: `deleted_at` filter in `server/index.js:593` for active-user count.

Hard-delete remains for:

- Reference-data refresh: `shadowWrite.js` does atomic `DELETE FROM <table> WHERE …` then bulk INSERT (whole-table replace pattern).
- `chatStore.js:448` — purge by `id` (purge tool, sys-only).

| ID    | Severity | Finding                                                                                                                                                                        |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1-24 | 🟢 OK    | Soft-delete implemented for user-mutable records (quotes, messages, users). Hard-delete reserved for atomic-replace operations (reference-data import). Pattern is consistent. |

### 1.4.6 Migration rollback

**No down-migration support found**. `server/db/init.js` is forward-only via additive `IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN`. There is no `migrate-down`, no schema-version table, no migration framework (knex/prisma/etc.).

Rollback strategy in CLAUDE.md "Bad deploy — need to roll back": **restore from `releases/<ts>/` snapshot**, not from a schema rollback. The 5-snapshot retention + nightly backup is the de facto undo path.

| ID    | Severity | Finding                                                                                                                                                                                                                                                                                                                                              |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1-25 | 🟡 MINOR | No down-migration framework. For an internal ERP with operator-controlled deploy windows + nightly snapshots, this is **acceptable** (rollback = restore snapshot), but every schema change becomes one-way unless paired with an explicit data-preserving rewrite plan. Document this explicitly in `docs/MIGRATION_GUIDE.md` — currently implicit. |

### 1.4.7 N+1 query risk

Quick grep for known anti-patterns: `db.prepare(...).get(...)` inside `for/forEach/map` loops. **6 sites found** — all in repository constructors (1× per call) or audit-log writers (1× per event). No request-time loop calling `prepare` + `get` per item.

The `dashboardStats.js` aggregator was specifically rewritten in 9F.3 to single-pass (CLAUDE.md) — verified with the recent `getOverview/getWinRate/...` `_metrics` shared-array pattern.

| ID    | Severity | Finding                                                                        |
| ----- | -------- | ------------------------------------------------------------------------------ |
| F1-26 | 🟢 OK    | No N+1 risk in request-path code. Aggregators use single-scan + reuse pattern. |

---

## 1.5 Phase 1 Findings Summary

### Counts by severity

| Severity   |                                                                                       Count |
| ---------- | ------------------------------------------------------------------------------------------: |
| 🔴 BLOCKER |                                                                                       **0** |
| 🟠 MAJOR   |                                     **2** (F1-1 ESLint debt × 87 errors, F1-14 Express 4→5) |
| 🟡 MINOR   | **8** (F1-5 console.log, F1-15..17 deps drift, F1-22 FK gap, F1-25 no down-migration, etc.) |
| 🟢 OK      |                                                                  **15** (positive evidence) |

### Top risks surfaced in Phase 1

1. **F1-14 — Express 4 → 5 deferred**. Active LTS is fine for now but plan migration before Express 4 EOL.
2. **F1-1 + F1-5 — ESLint + console.log debt**. 97 errors + 66 raw console calls. Not a blocker (build green) but a maturity gap. Quick-win cleanup (1–2 days work).
3. **F0-1 + F1-25 (cross-phase) — Coverage threshold dead config + no schema down-migration**. Both reflect "we trust process, not tooling" posture. Acceptable for internal LAN ERP, riskier as user count + data volume grows.

### What looks **mature**

- Headers (CSP/HSTS/XCTO/XFO/Referrer-Policy) all present, manually-rolled with documented rationale.
- CORS default-deny in production with explicit allowlist.
- CSRF double-submit cookie pattern.
- Rate-limit middleware on all write endpoints.
- 24 indexes, 23 transaction sites with auto-rollback.
- Zero CVEs across all 3 packages.
- Zero hardcoded credentials; `.env` never tracked.
- Zero circular dependencies across 511 source files.
- Zero `eval`/`new Function`/`innerHTML =` writes.
- xlsx CVE chain mitigated via `@e965/xlsx` fork.
- Soft-delete + audit-log + idempotency-key consistency.

---

## ✋ CHECKPOINT — Phase 1

Phase 1 complete. **No 🔴 BLOCKER.** 2× 🟠 MAJOR + 8× 🟡 MINOR + 15× 🟢 OK evidence.

The codebase is **structurally sound** (no circular deps, clean SQL surface, tight headers, zero CVEs). What's missing is **lint hygiene** (87 root ESLint errors — most are env-config nits + the 10 client errors are real bugs from this branch's WIP) and **migration tooling maturity** (no down-migrations).

Next phase (Phase 2 — Functional Testing) requires running the app under a Browser Agent and walking through critical flows (Login → Order Entry → BOM Explosion → Costing → Reports). This is a 45-min phase per your brief.

**Reply `go phase 2`** and I'll boot the dev server + start the functional walk. Or specify deeper inspection on any Phase 1 finding (e.g., "show me F1-5 in detail" or "fix F1-1 → 0 errors before moving on").
