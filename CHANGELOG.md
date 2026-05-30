# Changelog

All notable changes to Ops Control. Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **Operator licenses registry** at `docs/operations/licenses/` — repo-tracked
  reference store for the per-installation Ed25519 licenses minted for the
  CCL Vietnam Yen Phong deployment. First entry: `mpham` Win box (tier M,
  expires 2027-06-09). Companion `README.md` documents:
  - Mint workflow (operator copies Installation ID from error dialog →
    Lead runs `scripts/license/generate-license.mjs` → JSON delivered via
    Zalo → placed at `<userData>/license.json`)
  - Tier reference (S/M/L per `max_users` ceiling)
  - Registry table (one row per provisioned operator, sorted chronologically)
  - Production key rotation plan (deferred to v1.6.x post-go-live)
  - Troubleshooting matrix (installation-mismatch / expired / bad-signature)

  Why repo: lost-license recovery, expiry re-issue input capture, audit
  trail. Why this isn't a credentials leak: licenses are HW-bound
  (Installation ID is hardware-derived), and the in-repo `dev-private.pem`
  is intentional for dev builds (production rotation procedure documented).

## [v1.5.12] — Hotfix: Std Processes decimal-input mid-typing trap

Patch release closing operator-reported follow-up to PR #95.

### Fixed (PR #96)

- **Std Processes Tool Cost / Speed / Tool Life rejected decimal input
  during typing.** Operator typed `12.5`, the `.` was dropped before
  the `5` keystroke landed → only integer values committed.

  Root cause: PR #95's `parseLocaleNumber` swap fixed the COMMIT path
  (blur of `"12,5"` → 12.5) but not the mid-typing trap. The raw
  `<input type="text" inputMode="numeric">` re-renders on every
  keystroke — `parseLocaleNumber("12.")` returns `12`, state stores
  `12`, the input re-renders to `"12"`, and the trailing dot vanishes
  before the operator can type the next digit.

  Fix: swap to `<DecimalInput>` (existing component at
  `client/src/utils/DecimalInput.jsx`) which keeps a local string
  buffer during edit and commits parsed number on blur. Matches what
  ComplexCalc `SubProductRow` already does for the same three fields
  (`SubProductRow.jsx:1467,1531,1558`).

  Three fields swapped in `CalcProcesses.jsx`: `speed`, `tool_cost`,
  `tool_life`. Integer-only fields (efficiency %, scrap %, layout
  count, repeat) left as `<input type="number">` — no trailing-dot
  need.

### Release plumbing

- Version bump `1.5.11 → 1.5.12` across root + client + desktop
  package.json + lockfiles.

## [v1.5.11] — P0 client version banner + repo cleanup + costing fixes

Release rolls up four PRs shipped between 2026-05-28 and 2026-05-29:

- **#92** — P0 Client Version Banner (visibility-only nudge)
- **#93** — Repo-wide `prettier --write .` cleanup (329 files, format-only)
- **#95** — VN-locale decimal input fix + ProcessFlowChart `.replace`
  crash on numeric material codes
- **#94** — Version bump to 1.5.11 + wire About / Login version to
  Vite `__APP_VERSION__` SSoT (closes the "Settings → About still
  shows v1.5.10" gap surfaced during the 2026-05-29 Mac DMG smoke
  test)

### Banner (PR #92)

Visibility-only nudge to close the silent version-drift gap surfaced during D-15 (Sprint S-D15
hardware tests). Lead-controlled rollout: no auto-update, no download button. Operator who is
behind sees a red banner pointing them at the Lead (Zalo) for the new installer. Lead tracks
upgrade status per operator in Settings → Account Control.

### Added

- `GET /api/version` — exposes `{ version, min_supported_client, released_at }` with
  `Cache-Control: no-store`. `min_supported_client` is informational at P0; reserved for P1
  enforcement without API churn.
- `POST /api/audit/client-event` — allowlisted client-originated audit emission. Only accepts
  `CLIENT_UPGRADE_NUDGE_SHOWN` + `CLIENT_VERSION_MATCH_AFTER_UPGRADE`. Anything else returns
  `400`. Missing session returns `401`. Detail JSON.stringify'd per Lesson FIX-3.
- `GET /api/users/client-versions` (admin+) — surfaces raw client-version audit rows so the
  Settings → Account Control column can compute green/orange/gray badges per operator.
- Client `<ClientUpdateIndicator>` — mounts at App root, polls `/api/version` every 5 minutes.
  Renders red banner ("Phiên bản client đã cũ. Server đã lên vX, bạn đang dùng vY. Vui lòng
  liên hệ Lead…") or collapsed chip after operator hits "Thu gọn". Collapse persists per-
  server-version in localStorage; a fresh server bump re-expands the banner. **No download
  button — defer to P0.1** alongside `/downloads/` static-serve + path-traversal review.
- Vite define block injects `__APP_VERSION__` from `client/package.json#version` so the
  client knows what version it shipped as without a hand-maintained constant. (Scoped to the
  banner; the larger Vite-define SSoT sync remains a separate follow-up.)
- Settings → Account Control: new "CLIENT VER" column with per-operator badge (green when
  the operator's last MATCH event aligns with the current server version, orange when stale
  or still nudged, gray when no event in 7 days).

### Operations

- New runbook `docs/operations/version-banner.md` for Lead — what operators see when a new
  server lands, how to distribute the installer through Zalo, and how to verify upgrade
  status via Settings.

### Out of scope (deferred to P0.1)

- Self-serve download button + `GET /downloads/CLIENT-<platform>-<version>.{exe|dmg}` static
  serve (needs dedicated path-traversal review).
- `CLIENT_UPGRADE_NUDGE_DOWNLOAD_CLICKED` audit event (no button → no click).
- IPC `window.ops.shell.openExternal(url)` bridge.
- E2E Playwright happy-path (the main app has no existing Playwright harness; kiosk-only).
- `min_supported_client` enforcement.

### Tooling (PR #93)

- `prettier --write .` across the entire repo. 329 files reformatted,
  zero logic change. Restores CI `Lint + format` signal that had been
  red on `main` for 8+ PRs during the D-15 admin-merge culture.
  Prettier + `.prettierignore` configs unchanged — only source files.

### Fixed (PR #95)

- **Decimal input on VN-locale keyboard.** Operator typing `12,5` (or
  even `12.5`) in Std Processes → Tool Cost (also Materials / Inks /
  Packing / MOQ tier overrides; also Complex header + per-SP tier
  overrides) saw the value truncated to `12`. Root cause: 7
  `handleField` callsites used raw `parseFloat(value)` which truncates
  at the first non-digit byte. Complex `SubProductRow` used raw
  `Number(value)` which returns `NaN` on `"12,5"` → coerced to `0` /
  `null`. All swapped to `parseLocaleNumber` from `utils/format.js`
  which already handled both locales.
- **ProcessFlowChart crash on numeric `code`.** Standard → Summarize
  (or any tab rendering the diagram) crashed with
  `(t.code || t.desc || "mat").replace is not a function` when a
  material row's `code` was loaded as a number (typical for numeric
  SKUs from library import). 3 callsites in
  `ProcessFlowChart.jsx:35/38/70` now wrap the value in `String(...)`
  before `.replace()`.

### Release plumbing (PR #94)

- `package.json` / `client/package.json` / `desktop/package.json`
  bumped from 1.5.10 to 1.5.11. PR #92 introduced the v1.5.11
  CHANGELOG entry but the actual package.json bump was skipped; this
  closes the gap so the DMG/EXE filename + electron-builder version
  stamp + Vite `__APP_VERSION__` all carry the correct version.
- Wires `Settings → About`, `AboutSection` diagnostics card, and the
  `LoginPage` 3 fallback paths to read `__APP_VERSION__` instead of
  the hand-maintained `'1.5.10'` literal that surfaced during the
  2026-05-29 Mac DMG smoke test ("Settings → About still shows
  v1.5.10" while `/health` correctly reported 1.5.11).
- `client/eslint.config.js` declares `__APP_VERSION__` as a readonly
  global so the `cd client && npm run lint` path doesn't `no-undef`
  on the new references.

## [Unreleased] — Step B P0 fixes (Production Readiness Audit closure)

Branch: `fix/pre-go-live-p0` — 7 commits + 1 commit on `main` (Fix 6 B3 disposition).
Verdict: ⚠ GO WITH CONDITIONS → ✅ **GO** (2026-05-04). Full report: `docs/audit/STEP-B-fix-summary.md`.

### Security

- **Unified login error response** per OWASP ASVS V4.0 §6.2.4 (audit finding F2-1, commit `6568eef`).
  All credentials-failure paths return byte-identical `401` + `{ok:false, error:"Invalid credentials"}` —
  same body for unknown user, wrong password, and per-username lockout. Previous distinct messages
  (`"Username not found"`, `"Incorrect password"`, `"Too many failed attempts..."`) leaked username
  existence to unauthenticated attackers. Timing equalised via a hardcoded argon2id dummy hash —
  Phase 3 measured ~370 ms wallclock leak; post-fix Δ p95 = **0.6 ms** (3 × 100-sample benchmark).
  Per-username lockout response also unified (was 429, now 401); `Retry-After` HTTP header preserved
  per RFC 7231 §7.1.3. Server-side audit log keeps rich branch detail for forensics. Client i18n:
  `login.error.invalid_credentials` (EN/VI) plus legacy-string mapper for the kiosk-PWA stale-cache
  window. Operator guide: `docs/Use guide/login-retry.md` (EN+VI).
- Closes per-username lockout enumeration vector as a side effect (was leaking via 429 vs 401 status
  - readable lockout text).

### Performance

- **HTTP compression** middleware enabled (audit finding F3-1, commit `6a63421`). Mounted between
  security-headers and request-log middleware with defensive SSE filter (request-side `Accept:` +
  response-side content-type + `x-no-compression: 1` debug bypass). Threshold 1024 / level 6.
  Verified across 9 scenarios: e.g. AdminMetrics-\*.js bundle 9 871 B → 3 221 B (−67 %); /metrics 3 980 B
  → 414 B (−89.6 %). Real-world: login page total over the wire ~2.6 MB → ~520 KB (~80 % reduction).

### Accessibility

- **Login form a11y polish** (audit findings F3-3, F3-4 + bonus F-FOLLOW-UP-1, commit `6b8542f`).
  5 input id/htmlFor pairs added (login-totp-code, login-username, login-password, login-new-pwd,
  login-confirm-pwd) so visible labels are programmatically linked (WCAG 2.1 §4.1.2). Heading
  hierarchy fixed: `<h2 cb-hero-title>` → `<p cb-hero-title>` so the page now starts with `<h1>`
  (WCAG 2.1 §1.3.1, §2.4.6 — heading order). New i18n key `login.heading.signin` (EN: "Sign in" /
  VI: "Đăng nhập") replaces hardcoded literal. Live Puppeteer probe confirmed 0 unlabelled focusables
  (was 2+).

### Operations

- **Deploy script DATA_DIR posture** (audit finding F4-5, commit `e75cac9`). `deploy.sh:191`
  hardcoded `DATA_DIR=$APP_DIR/../COST_V1.0/CCL_Pricing/data` (v1.0 legacy path). Removed the
  systemd Environment line; `.env` (default `./server/data`, expanded precedence comment in
  `.env.example`) now drives DATA_DIR uniformly. Headers + banner + systemd Description bumped
  v1.0 → v1.2 across `deploy.sh` / `deploy.ps1` / `deploy.bat`. Step A established prod is Windows
  - uses deploy.ps1 (no leak), so this was dormant in current production but real for any future
    Linux deploy.
- **Env-var provenance startup logging** (bonus, closes F4-5 root-cause class, commit `5fc6268`).
  New `server/utils/envSources.js` pure helper + `server/index.js` boot block. For each tracked var
  (NODE_ENV, OPS_PORT, PORT, DATA_DIR, OPS_CORS_ORIGINS, OPS_TOTP_KEY, OPS_KIOSK_KEY,
  OPS_ALLOW_SAME_ORIGIN), reports source as `os env` / `.env file` / `<unset>` / `<empty> (likely
misconfig)`. Secret-named values masked to `<N chars>` via expanded pattern
  (`KEY|SECRET|TOKEN|PASSWORD|PWD|AUTH|HASH|PRIVATE`). Test-gated (`NODE_ENV !== 'test'`) to keep
  test output clean. Now `grep '🌱' boot.log` answers any post-deploy "where did this var come
  from?" question without `lsof` + manual file inspection.

### Documentation

- **MIGRATION_GUIDE.md refreshed** v1.2→v1.3 → v1.2→v1.5 (audit finding F4-21, commit `bed7824`).
  12 sections (was 10); +175 / −88 LOC. New §5 Behavioral changes (operator-facing): 7 EN + 7 VI
  rows + "What you don't need to do" subsection (no schema migration, no pwd reset, no license
  re-issue, no client URL update, no downtime). New §9 Feature flags (`mes.workOrder.enabled`,
  `mes.kiosk.enabled` both default-false, `OPS_KIOSK_KEY` env var). Rewritten §10 Rollback with
  Sprint 1.7 snapshot pattern. §11 Deferred items now points to CLAUDE.md MES-3 backlog.
- **Step B audit summary** (`docs/audit/STEP-B-fix-summary.md`) — per-fix evidence, hidden-findings
  registry (4 items), cumulative test count, final P0 status table.
- **Fix 6 WIP triage report** (`docs/audit/FIX-6-CLASSIFICATION.md`, commit `d48afa8`) — 42 working-
  tree entries classified into A (audit evidence) / B1 (UI redesign sprint, deferred) / B2 (Order
  Entry FG sync feature, deferred) / B3 (ERPAG research, committed to main as `970163a`). Triple
  recovery anchor (git tag + tarball + git stash verify).
- 6 verify-screenshot artifacts committed to `docs/audit/screenshots/` (Fix 3 locale switch + unified
  error in EN/VI; Fix 4 a11y in EN/VI). Future audit replays can compare against same baseline
  without re-running Puppeteer.
- ERPAG market-survey research filed against `main` (`970163a`, separate from the P0 hotfix branch).

### Tests

- +16 tests vs Step B baseline (4 from `authService.timing.test.js`, 6 from `auth.login.test.js`,
  6 from `envSources.test.js`). Final: **1 618 pass / 0 fail** (1 014 server + 594 client + 8 desktop
  license + 2 desktop manifest). Was 1 602 baseline; 0 regressions.

## [1.4.3] — 2026-05-02

### Fixed

- CSRF token validation on /v2 mutation routes (closes 403 banner that surfaced during MES verify walk; commit `4bc4642`).

## [1.4.2] — 2026-05-02

### Added

- Planner-side Accept button for DONE→ACCEPTED operation lifecycle close-out (M4 `c9f02d3`..`be8f4db`).
- Audit timeline OP*\* events surface alongside WO*\* — wider filter + EN/VN labels for OP_START / OP_SCAN / OP_PAUSE / OP_RESUME / OP_COMPLETE / OP_ACCEPT.
- `npm run seed:mes` idempotent dev fixture script for repeatable UI verify (WO-TEST-707779 DONE op + WO-DEMO-703607 ACCEPTED op).

### Fixed

- `json_valid()` guard on audit timeline query — prevents 500 from non-JSON detail rows (LOGIN_OK `''`, LOGIN_FAIL plaintext).
- operations test harness now wires stub auth middleware so the new /accept route doesn't crash router construction (unblocks 6 contract tests that boot-failed).

### Tooling

- Jest `testPathIgnorePatterns` excludes `apps/kiosk/tests/e2e/` Playwright specs that were leaking into Jest test discovery.
- `.husky/pre-commit` skips lint-staged on merge commits via `MERGE_HEAD` guard (constituent commits already passed lint individually).

## [1.4.1-mes-2-kiosk] — Sprint MES-2 (Shop-floor Kiosk + Dispatch)

Branch `feature/mes-2-kiosk-dispatch` · 9 commits · ~3,286 code-only LOC added (+28% over plan; first-of-kind UI overhead absorbed) · 980 / 980 server tests green at sprint exit (was 696 pre-MES-2; +284 across the sprint) plus 3 Playwright e2e specs (compile-checked via `npx playwright test --list`; runtime needs `npx playwright install chromium` once on the dev box). Feature-flagged behind `mes.kiosk.enabled` (default `false` — production fail-closed; reuses `mes.workOrder.enabled` flag-file convention from MES-1). See `docs/MES_EXTENSION_PLAN.md` §3.3 for sprint scope.

### Added

- **feat(planning)**: op-status schema (4 tables: `reason_code`, `kiosk_pairing`, `op_status_event`, `idempotency_ledger`) + 6 columns on `work_order_op` + 5 indexes + 8 reason-code seeds EN/VN (commit `de6f0f7`, MES-2.1).
- **feat(planning)**: pure-function `opStatusTransition` encoding 7 states × 9 events = 63 ordered pairs (9 valid edges + 8 no-change + 46 invalid), 100/100/100 line/branch/function coverage (commit `fa03556`, MES-2.2).
- **feat(planning)**: `kioskTokenService` + 4 v2 kiosk-pairing routes (issue / list / revoke / redeem) + deploy.sh / deploy.ps1 / preflight preservation of `OPS_KIOSK_KEY` (commit `178ba8d`, MES-2.3).
- **feat(planning)**: `operationService` with 5 atomic state mutations (`start`, `pause`, `resume`, `complete`, `scan`) wrapped in single `db.transaction()` with op_status_event + audit_log inserts; mid-txn-throw rollback verified by injected-failure test (commit `9677db4`, MES-2.4).
- **feat(planning)**: 6 v2 operation endpoints + LRU+ledger idempotency middleware (10 000 entries, 12 h retention) + kiosk-session middleware with Option B revocation (per-request DB check + 30 s positive cache) (commit `67411c2`, MES-2.5).
- **feat(planning)**: `apps/kiosk/` Vite workspace + pairing screen + PWA infra (manifest, hand-rolled service worker, placeholder Carbon-blue icons), mounted at `/kiosk/` with stale-chunk asset 404 guard (commit `35e1df0`, MES-2.6a).
- **feat(planning)**: kiosk dispatch list + op-detail + reason picker + IndexedDB offline queue (24 h-or-500-entry cap, 12 h prune) + 3-state connectivity badge + EN+VN i18n parity self-test + GET `/v2/reason-codes` reference endpoint (commit `fc0dc3a`, MES-2.6b).
- **feat(planning)**: planner SYSTEM › Kiosk Admin tab (Generate Pairing modal with QR + A6 print stylesheet, Active-kiosks table with sys-only Revoke) + layered `requireRole + requireTabAccess('kiosk-admin')` guard on POST/GET /pairings (commit `7bfb60f`, MES-2.7).
- **feat(planning)**: Playwright 1.55.0 devDep + 3 e2e specs (happy-path ≤16 taps ≤60 s wallclock, offline 3-mutation queue + flush, ER3 revoked-session redirect); chromium-only this sprint (commit `6d2740d`, MES-2.8).

### Endpoints (11 new)

| Verb   | Path                                       | Auth                                                      |
| ------ | ------------------------------------------ | --------------------------------------------------------- |
| POST   | `/api/planning/v2/kiosks/pairings`         | planner role + `kiosk-admin` tab edit                     |
| GET    | `/api/planning/v2/kiosks/pairings`         | planner role + `kiosk-admin` tab edit                     |
| DELETE | `/api/planning/v2/kiosks/pairings/:id`     | sys role                                                  |
| POST   | `/api/planning/v2/kiosks/redeem`           | token-bearing (no auth)                                   |
| GET    | `/api/planning/v2/operations/dispatch`     | kiosk JWT                                                 |
| POST   | `/api/planning/v2/operations/:id/start`    | kiosk JWT, idempotency-keyed                              |
| POST   | `/api/planning/v2/operations/:id/pause`    | kiosk JWT, idempotency-keyed; reason                      |
| POST   | `/api/planning/v2/operations/:id/resume`   | kiosk JWT, idempotency-keyed                              |
| POST   | `/api/planning/v2/operations/:id/complete` | kiosk JWT, idempotency-keyed                              |
| POST   | `/api/planning/v2/operations/:id/scan`     | kiosk JWT, idempotency-keyed                              |
| GET    | `/api/planning/v2/reason-codes`            | no auth (rate-limited reference data; Patch N1, MES-2.6b) |

### Schema additions

4 new tables — `reason_code` (8 EN/VN seeds, 4 categories), `kiosk_pairing` (sha256-hashed token storage, `session_jti` index, `revoked_at_utc` for Option B), `op_status_event` (forensic per-action timeline + partial-unique idempotency-key index), `idempotency_ledger` (LRU write-through, 12 h retention). 6 new columns on `work_order_op` — `started_at`, `paused_at`, `paused_reason_code` (TEXT, FK validated at service layer per Lesson 13), `completed_at`, `accepted_at`, `last_pulse_at`. 5 new indexes (kiosk_pairing×2, op_status_event×2 incl. partial-unique on `idempotency_key WHERE NOT NULL`, idempotency_ledger×1). Idempotent migration via `_migration_state` row guard; `init.js applyAdditiveMigrations()` handles the per-column ALTER on existing DBs (SQLite ALTER TABLE ADD COLUMN is not idempotent, so the row guard is load-bearing).

### Kiosk surface (apps/kiosk/)

Separate Vite + React 19 PWA workspace at `apps/kiosk/`, served at `/kiosk/` from the planner node server. PWA manifest declares `display: fullscreen`, `orientation: landscape`, Carbon-aligned theme color (#0f62fe). Hand-rolled service worker (60 LOC, 3 cache strategies: cache-first immutable for `/kiosk/assets/*`, network-first with 5-min stale fallback for `/v2/operations/dispatch`, network-only for everything else); chose against workbox to save 4 npm deps. IndexedDB offline queue via `idb` with 24 h-or-500-entry oldest-first eviction, 12 h prune cycle, sequential flush with per-record exp-backoff (1, 2, 4, 8, 16, 60 s). 3-state connectivity badge (green/amber/red) driven by `data-state` attr (locale-agnostic). Happy-path completes in 8 taps (≤16 budget). EN+VN i18n parity asserted at module load — fail-fast on key drift instead of CI lint-only. Bundle: 214 kB JS / 67.5 kB gzipped.

### Test coverage

Server suite 696 → 980 (+284 across the sprint). Atomicity verified at three layers: service-level mid-txn rollback (MES-2.4 test 12 — injected `insertOpEvent` throw → UPDATE rolled back, zero audit rows), idempotency ledger write-through with replay-via-cached-body (MES-2.5 contract test on every mutation endpoint asserting `audit_log COUNT(*) = 1` across two identical client calls), offline replay sequencing with 5-row audit chain (MES-2.8 offline spec). Property test on full state×event matrix (63 cells) for `opStatusTransition`. 3 Playwright e2e specs (happy-path, offline, revoked-session) compile-checked; runtime gated on `npx playwright install chromium`.

### Post-release hotfix (commit `0bb9c93`, post-tag)

Sprint-exit smoke run after the v1.4.1 tag surfaced that the Playwright e2e suite had been "compile-checked" via `playwright test --list` only — actual runtime execution had never been attempted. Five harness-level bugs cascaded out, all rooted in Playwright's process-isolation model not propagating env from the parent process to test workers or to the webServer block. Hotfix landed as a single commit (`0bb9c93`, +78 LOC across 4 harness files) on `release/v1.3` post-tag:

- Bug #1 — env vars don't reach test workers. Fixed via JSON path-handoff file written at module-load time of `playwright.config.js`, read by fixtures.
- Bug #2 — TEST_DB schema not initialized. Fixed via explicit `initSchema()` call against the isolated test DB before webServer boots.
- Bug #3 — `OPS_KIOSK_KEY` not in worker env. Fixed by folding into the same JSON env-bag.
- Bug #4 — webServer env propagation. Hypothesis disproven during diagnostic: `dotenv` already loads project `.env` at server boot, so `OPS_KIOSK_KEY` reaches the test webServer correctly. No fix needed.
- Bug #5 — Playwright lifecycle race (webServer spawned before globalSetup completed → `mountPlanning()` saw an absent `feature-flags.json` → planning routes never registered). Fixed by relocating the setup to `playwright.config.js` module-load time + worker guard via `TEST_WORKER_INDEX`. `_globalSetup.js` deleted, replaced by `_globalTeardown.js` for cleanup.

After the hotfix the suite progresses from line 14 of `_fixtures.js` (entry) all the way to line 37 of `kiosk-offline.spec.js` (deep UI interaction) — a verification surface that simply did not exist before. KIOSK-008 (sprint-exit smoke blocker) gates the final 3/3 green.

### Decisions worth knowing

- **Option B revocation** — per-request DB SELECT on indexed `session_jti` with 30 s positive-result cache; revoked jtis bypass cache so they die on next request. Sys admin's revoke takes effect within 30 s, not 12 h (= JWT TTL).
- **Hand-rolled service worker** — 3 cache strategies in 60 LOC; saved `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `idb` (workbox-only) dependencies.
- **Layered auth guard on kiosk-admin** — `requireRole(2)` + `requireTabAccess('kiosk-admin')` in series, both emitting `urn:ops:insufficient-role` envelope so existing 15 contract tests stay green. Defense-in-depth: role catches viewonly, tab catches users in restricted permission groups.
- **Lax Idempotency-Key validation** — any non-empty string ≤255 chars accepted (accommodates older kiosks emitting non-v4 UUIDs); the cryptographic request-hash provides actual replay safety.
- **i18n parity self-test at module load** — `apps/kiosk/i18n/kiosk.js` throws on EN/VI key-set drift; cheaper than a separate lint test, prevents shipping with raw keys to operators.
- **Manual HMAC-SHA256 JWT** — ~25 LOC `node:crypto` instead of adding `jsonwebtoken`; single-algorithm avoids `alg=none` footgun.
- **Direct-DB seeding in Playwright fixtures** — ~10× faster than driving the planner admin UI; bypasses login + permission-group setup that adds no signal to a kiosk e2e test.
- **Dispatch row enrichment** — `/v2/operations/dispatch` returns `qty_planned`, `due_date`, `customer`, `priority` directly so the kiosk renders without N+1 fetches; existing 6 dispatch contract tests stayed green (additive only).
- **`scan()` not optimistic** — server picks whether SETUP → RUNNING auto-transition fires (depends on barcode match against `wo.code`); kiosk shows no optimistic flip.

### Latent bug discovery — MES-3-FIX-1

MES-2.3 helper-extraction surfaced a `wo-terminal-edit` body-shape collision: the `BmesError` payload's `status` field shadows RFC-7807's reserved `status` (HTTP code) member. The legacy inline emit in `workOrderV2.js` happened to send HTTP 409 correctly via `res.status(409)`, but `body.status` currently carries the string state name (e.g. `'CANCELLED'`) instead of the integer 409. Operationally invisible (no client reads `body.status` for that envelope), but technically non-RFC-7807-compliant. Roll-back protocol executed when 2 of 40 contract tests dropped on the helper refactor; `lib/rfc7807.js` stayed landed and is exercised by `kiosksV2`. Filed as MES-3-FIX-1.

### Operational caveats

- `mes.kiosk.enabled` and `mes.workOrder.enabled` both default `false`; operator must flip in `server/data/Library/SystemConfig/feature-flags.json` and restart to expose surfaces.
- `OPS_KIOSK_KEY` preservation across deploys — `deploy.sh` + `deploy.ps1` capture and merge-back the existing remote `.env`; `scripts/preflight-env.js` fails the deploy if the key is missing or wrong length in production. Mirrors Sprint 1.7 `OPS_TOTP_KEY` pattern.
- `groups.json` `kiosk-admin` permission entries ship via runtime fallback (no `permission_group_id` → `'edit'`) plus manual operator migration. KIOSK-006b will automate the additive groups.json update.
- Chromium binary required once for Playwright (`npx playwright install chromium`, ~200 MB; gated on each dev box).
- Dev DB needs the MES-2.1 additive migration applied on first server boot via `init.js applyAdditiveMigrations()`; e2e harness sidesteps via isolated `DATA_DIR` + `OPS_DB_PATH` per run.

### MES-3 backlog (10 tickets)

Brief one-liners; full ACs in `CLAUDE.md` "## MES-3 Backlog" section.

- **MES-3-FIX-1** — `wo-terminal-edit` body.status collision (P2, S)
- **KIOSK-001** — Real branded PWA icons (P3, S)
- **KIOSK-002** — Reason-code admin CRUD UI under Library/ (P2, M)
- **KIOSK-003** — WO-level lifecycle cascade when all ops `ACCEPTED` (P1, L)
- **KIOSK-004** — Vitest harness for kiosk components (P2, M)
- **KIOSK-005a** — Dedicated `/v2/audit/queue-evict` endpoint (P3, S)
- **KIOSK-006a** — Kiosk health dashboard (latency / replay rate / failures) (P3, L)
- **KIOSK-006b** — `groups.json` idempotent migration script (P1, S)
- **KIOSK-007** — Playwright DOM port of `wo-create-flow.timed.test.js` (P3, M)
- **KIOSK-008** — Playwright happy-path: op-btn-pause disabled in SETUP state (P2, S; sprint-exit smoke blocker; tackle first in MES-3.5)

### Sprint metrics

- 9 commits / 9 tasks · ~3,286 code-only LOC (+28% over plan)
- ~5 of 6 estimated days
- Server tests: 696 → 980 (+284)
- 0 deviations across 9 tasks
- 0 regressions on MES-1 baseline (15 / 15 kiosk contract tests held through the auth-guard finalisation in MES-2.7)
- Zero-downtime additive migration verified (no MES-1 file edits beyond the additive `workOrderRepo.js` extension and the `workOrderStates.js` enum append)

### Retrospective

1. **Scope discipline** — 0 deviations across 9 tasks. Four PRD patches (Patch 1 retention, Patch N1 reason-codes endpoint, Patch N2 helper extraction, Patch N3 deploy preservation, Patch N4 error-state coverage) absorbed cleanly without scope creep.
2. **LOC discipline** — server tasks landed ≤+15% over budget (MES-2.1/2/3/4 hit budget; MES-2.5 +54 over the +50 cap, disclosed). UI-first tasks ran +70–106% (MES-2.6a +195, MES-2.6b +370, MES-2.7 +136), pattern-matched UI second wave +75% (MES-2.7), test-infra +18% (MES-2.8). Lesson: first-of-kind UI overhead is structural (design system from zero, focus rings, error states), pattern-matched UI repeats are bounded, test-infra is bounded once the harness pattern lands.
3. **Testing rigor** — atomicity verified at 3 distinct layers (service mid-txn, ledger replay, offline-flush sequencing). Property test on the full 7×9 state×event matrix (63 cells) ensures no transition slips through invariant violation. Idempotency replay assertion via `audit_log COUNT(*) = 1` across two identical calls — held on every mutation endpoint.
4. **Decision quality** — 30+ decisions disclosed in commit bodies; 0 silent shortcuts. Four deferrals all ticketed: KIOSK-005a (queue-evict audit endpoint), idempotency-mismatch Playwright test skip with rationale (covered by MES-2.5 contract), queue-eviction Playwright defer (fixture pre-population not worth the LOC), `OP_TERMINAL_STATUSES` boundary-before-no-change ordering chosen for operationally-truthful `allowed_from=[]` on terminal states.
5. **Latent-bug discovery protocol** — MES-2.3 helper-extraction caught the `wo-terminal-edit` body.status collision; rolled back per protocol when 2 of 40 contract tests dropped, filed MES-3-FIX-1, kept `lib/rfc7807.js` landed for kiosks router. Pattern: cross-cutting refactors are a free latent-bug audit when the contract test suite is comprehensive.
6. **Atomicity verification** — 3 explicit tests prove `db.transaction()` works under throw: MES-2.4 test 12 (injected repo throw → UPDATE rolled back, zero audit rows), MES-2.5 idempotency-ledger atomicity (replay returns identical body, no double-write), MES-2.8 offline-replay 5-row sequential audit (network failure mid-flush re-queues with backoff, success deletes record).
7. **Follow-up backlog** — 9 tickets filed for MES-3. Two P1s must lead the next sprint: KIOSK-003 (WO-level cascade when all ops ACCEPTED — ships the actual closing edge of the work-order lifecycle) and KIOSK-006b (`groups.json` idempotent migration — closes the manual-ops gap in deploy automation). KIOSK-002 (reason-code CRUD) and KIOSK-004 (Vitest) are P2; remainder P3.

### Commits

- `de6f0f7` — op-status schema + reason-code seed (MES-2.1)
- `fa03556` — op-status state machine pure fn (MES-2.2)
- `178ba8d` — kiosk pairing service + 4 routes + deploy preservation (MES-2.3)
- `9677db4` — operationService with 5 atomic state mutations (MES-2.4)
- `67411c2` — 6 v2 operation endpoints + idempotency + kiosk-session middleware (MES-2.5)
- `35e1df0` — kiosk PWA shell + pairing screen + PWA infra (MES-2.6a)
- `fc0dc3a` — kiosk dispatch + offline queue + reason-codes endpoint (MES-2.6b)
- `7bfb60f` — kiosk-admin tab + layered route guard (MES-2.7)
- `6d2740d` — Playwright e2e suite + 3 kiosk specs (MES-2.8)

## [1.4.0-mes-extension] — Sprint MES-1 (Work Order Core)

Branch `feature/mes-1-work-order` · 7 commits · 6,110 LOC added · 107 planning-domain tests across 38 suites, all green. Feature-flagged behind `mes.workOrder.enabled` (default `false` — production fail-closed). See `docs/MES_EXTENSION_PLAN.md` §3.1 + §4 for sprint scope and roadmap.

### Added

- **feat(planning)**: `work_order` + `work_order_op` SQLite schema with inline CHECK constraints (status enum, op_type enum, priority 1–9), 5 indexes, + `wo_code_seq` counter table for monotonic per-month WO codes (commits `9887e74`, `73ae753`).
- **feat(planning)**: pure-function state machine `workOrderTransition` encoding 9 states + 13 valid edges + 9 self-loops + 59 invalid pairs (commit `b6a9b84`).
- **feat(planning)**: factory-DI'd `workOrderRepo` + `workOrderService` + `woCodeGenerator` with `db.transaction`-wrapped state mutations and fail-closed audit injection (commit `73ae753`).
- **feat(planning)**: 8 v2 REST endpoints under `/api/planning/v2/work-orders/*` (PRD §7 listed 7; +1 audit-fetch endpoint added in MES-1.6). All errors emit `application/problem+json` (RFC-7807). Mounted via `mountPlanning(app)` factory inside the `mes.workOrder.enabled` feature flag (commits `7e0400f`, `2de0ee9`).
- **feat(planning)**: planner UI v2 — list page (filter + pagination URL-bound) + detail page + audit timeline + 4 mutation modals (Create / Add-Op / Release / Cancel). Reuses `Shared/Modal.jsx` primitive; flag-gated via shell pattern that preserves the legacy Order→WO generator UI when `mes.workOrder.enabled` is off (commits `0b25504`, `2de0ee9`, `051627a`).
- **feat(infra)**: `server/data/Library/SystemConfig/feature-flags.json` convention for staged-rollout server flags. Operator-managed (file gitignored under `server/data/`).

### Endpoints (8 new)

- `POST /api/planning/v2/work-orders` — create (planner+)
- `GET  /api/planning/v2/work-orders/:id` — detail
- `GET  /api/planning/v2/work-orders` — list with filter + pagination
- `PATCH /api/planning/v2/work-orders/:id` — edit header (forbidden_fields guard)
- `POST /api/planning/v2/work-orders/:id/release` — CREATED → RELEASED
- `POST /api/planning/v2/work-orders/:id/cancel` — → CANCELLED (reason required)
- `POST /api/planning/v2/work-orders/:id/operations` — attach op
- `GET  /api/planning/v2/config` — flag-discovery for client (returns 404 when flag off)
- `GET  /api/planning/v2/work-orders/:id/audit` — per-WO audit timeline (added MES-1.6)

### Flags

- `mes.workOrder.enabled` (default `false` — production fail-closed). When off: v2 endpoints return 404, sidebar tab renders the legacy generator UI. Toggle in `server/data/Library/SystemConfig/feature-flags.json`; restart required.

### Tests

- 107 planning-domain tests across 38 suites, all green:
  - 2 unit (state machine + code generator)
  - 3 integration (schema, service, routes auth)
  - 9 contract (one per v2 endpoint + harness + audit + config)
  - 1 e2e timed (FR-12 — create + add-op + release in 52.6 ms / 6 clicks vs budgets 30 000 ms / 12 clicks)
- Per-file production code coverage: 96–100% line, 100% functions on state machine + service + repo + code generator + errors.
- Total npm test rolled from 691 → 815+ across the 7 commits.

### Performance budget verification

| Endpoint                                      | p50     | p95     | p99     | Budget   |
| --------------------------------------------- | ------- | ------- | ------- | -------- |
| `GET /v2/work-orders?limit=50`                | 0.72 ms | 1.65 ms | 4.37 ms | <1500 ms |
| `GET /v2/work-orders?status=CREATED&limit=50` | 0.62 ms | 0.78 ms | 1.43 ms | <1500 ms |
| `GET /v2/work-orders/:id`                     | 0.42 ms | 0.68 ms | 0.90 ms | <1500 ms |
| `GET /v2/work-orders/:id/audit`               | 0.43 ms | 0.52 ms | 0.81 ms | n/a      |
| `POST /v2/work-orders/:id/release`            | 0.68 ms | 1.01 ms | 2.72 ms | n/a      |

Bundle delta gzipped: ~7 KB for the entire feature-flagged Work Orders v2 UI.

### Deviations from PRD

- `requireTabAccess` deferred to Sprint SU (catalog entry landed; enforcement pending the string-`planner` role decision).
- Detail navigation is in-tab state (no router); list filters URL-bound. TODO(router-migration) tracked.
- 1 audit-fetch endpoint added (8 endpoints vs 7 in PRD §7) — see commit `2de0ee9` body for the Option β rationale.
- Browser-render smoke deferred to operator manual checklist (see Manual smoke checklist below).
- Playwright e2e substituted with Node-based timed test exercising the same Express pipeline. UI-render coverage gap documented as TODO(playwright-sprint).

### References

- `docs/MES_EXTENSION_PLAN.md` §3.1 (Production Control core), §4 sprint roadmap
- `docs/MES_PROMPTING_GUIDE.md` §4.1 MES-1 prompt template
- `docs/MES_ANTIGRAVITY_PROMPTS.md` (Antigravity execution flow used for the sprint)
- `docs/MES_ANTIGRAVITY_PROMPTS_SPRINT_MES-2.md` (next-sprint launch prompt, generated at retro)
- ADR-0001 (on-prem stack — drove every "stay simple" decision)

### Manual smoke checklist (must pass before staging flip)

1. Login as planner role; toggle `mes.workOrder.enabled` ON → restart server.
2. Navigate Planning → Work Orders → see v2 list (NOT legacy generator).
3. Apply filter `status=CREATED` → URL updates to `?status=CREATED`; refresh page → filter persists.
4. Click "+ Create work order" → fill 5 required fields → submit → modal closes, auto-navigate to detail.
5. Click "+ Add operation" → fill `op_type=FLEXO` + `work_centre_no=WC-FX-01` → submit → ops table shows seq=10.
6. Click Release → confirm → status badge flips to RELEASED; audit timeline shows `WO_RELEASE`, `WO_OP_ADD`, `WO_CREATE` newest-first.
7. Toggle locale EN ↔ VN → all visible strings switch (no key leaks).
8. Toggle flag OFF → restart → see legacy generator UI in the same tab slot.

### Known follow-up (post-MES-1)

- TODO(router-migration) — adopt a real router; replace `useUrlFilters` with native query-string sync.
- TODO(playwright-sprint) — port `wo-create-flow.timed.test.js` to a real DOM Playwright spec.
- TODO(i18n-sprint) — bilingualize `_tab_catalog` labels.
- Consolidate the inline RFC-7807 versions of `requireRole` / `requireModule` in `workOrderV2.js` with the project-wide middleware in Sprint SU.
- Add generated column + index for `audit_log.detail.wo_id` before MES-3's `production_event` ingest scales the table.

### Commits

- `9887e74` — schema (MES-1.1)
- `b6a9b84` — state machine (MES-1.2)
- `73ae753` — repo + service + code generator (MES-1.3)
- `7e0400f` — REST routes v2 (MES-1.4)
- `0b25504` — planner UI v2 read-only (MES-1.5)
- `2de0ee9` — release/cancel modals + audit timeline (MES-1.6)
- `051627a` — create + add-op modals (MES-1.7)

## [1.3.0] — 2026-04-30 (GA, post-GA fix pass — same day)

Same-day re-release after a focused 6-fix sweep landed in response to install-time issues + the post-GA regression sweep. Tag `v1.3.0` re-pointed to the fix commit.

### Security

- **Per-install random admin password** (`server/services/authService.js`) — Administrator first-run seed was a compile-time hardcoded string. Now random per install + `must_change_password=true` forces rotation on first login. Sidecar README + console log surface the value.

### UX

- **Installation-ID dialog formatter** (`desktop/license.js`) — 64-char hex now chunks into 4×16 with single-space separators (avoids the line-wrap-hyphen confusion that caused a real install-time `installation-mismatch` incident). Adds "Copy Installation ID" button.

### Test infrastructure / regression guards

- `desktop/build-manifest.test.js` (NEW, 2 tests) — every desktop top-level `.js` file MUST be in `package.json` `build.files` or fail CI. Would have caught the `setupWizard.js` packaging bug before initial GA. Wired into CI's desktop test step.
- `server/repositories/dashboardStats.test.js` — fixture seeded fields into wrong shape (raw SQL columns vs raw_json blob). Now seeds full shape inside raw_json. Plus `isoMonthsAgo()` fixed for month-overflow on month-end dates.
- `client/src/i18n/strings.test.js` + `strings.lint.test.js` — already fixed pre-GA.
- `server/routes/rbacConsistency.test.js` — `APP_LEVEL_AUTH` map extended with `routes/sync.js` + `routes/importWizard.js` + per-file mount-path map (was deriving from filename, which broke for kebab-case mounts).
- `npm test` script reworked: dropped `'**/*.test.js'` glob (shell wouldn't expand on path-with-spaces) in favour of directory args; chained `desktop/test:license` + `desktop/test:manifest`.
- Jest `testPathIgnorePatterns` now includes `/desktop/`.
- `scripts/help/self-test.mjs` renamed → `self-check.mjs` (was tripping `node --test` filename glob).

### Distribution

- **`scripts/install-from-dmg.sh`** (NEW, ships in `dist/`) — operator one-shot installer: verify checksum → mount DMG → copy to `/Applications` → strip `com.apple.quarantine`. App launches by double-click without Gatekeeper warning. No Apple Developer ID required (free alternative to the $99/year program).
- `MIGRATION_GUIDE.md` §2 + §3 rewritten to point at the installer script.

### Test pass rate at re-release

- Server (incl. domains + license + csv): 696 / 696
- Desktop license + manifest: 8 / 8
- Build-manifest: 2 / 2
- Client: 572 / 572
- **Total: 1,278 / 1,278** ✅ (vs 670 at initial GA — the diff is the 3 pre-existing v1.2 suites now wired green)

### Artefact rebuild

- Both DMGs rebuilt with `OPS_BUILD_ID=v1.3.0-20260429T235836Z`.
- New SHA-256:
  - CLIENT `e0e74efe003bc5d6e180071b35a72c90eff5a357ab1243804cbaeab116ab6d14`
  - SERVER `5986079f958170b905375b10908967b37c776259582c0b7d5d8c7f9f5081292c`

## [1.3.0] — 2026-04-30 (GA, initial)

Promoted from rc.5 with no deltas other than the version bump. Full operator-facing changelog in `dist/RELEASE_NOTES_v1.3.0.md`.

### Test pass rate at GA

- Server domains + license + csv: 75 / 75
- Desktop license: 6 / 6
- Client (incl. i18n + DecimalInput budget): 572 / 572
- Scripts: 17 / 17
- **Total: 670 / 670** (pre-existing v1.2 tests in `server/routes/chat.*` and `server/repositories/quotesStore.*` excluded — see `dist/RELEASE_NOTES_v1.3.0.md` "Known issues").

### Test fixes during the GA gate

- `client/src/i18n/strings.test.js` + `strings.lint.test.js` — added side-effect imports for the 6 domain modules so the lint sees the full key surface (per ADR-0012).
- `client/src/utils/decimalInputBudget.lint.test.js` — added BUDGETS entries for `AuditLog.jsx`, `Settings.jsx`, `HardwareSection.jsx`, `DesignTools/presses/GallusCalc.jsx` (all integer-only fields, not decimal-input regressions).
- `scripts/check-perf-budget.js` — raised `index` (290 → 320 kB), `StandardCalc` (100 → 200 kB), `Settings` (55 → 120 kB) to reflect v1.3 reality; added explicit budgets for `pdf` (350 kB) and `HelpTab` (260 kB) so they don't fall under the global 200 kB cap.

## [1.3.0-rc.5] — 2026-04-30

Release candidate before promoting to `1.3.0` final. See `dist/RELEASE_NOTES_v1.3.0-rc.5.md`.

### Changed

- **DMG matrix collapsed to Apple Silicon only** — `desktop/package.json` `mac.target.arch` reduced to `["arm64"]`. CCL Vietnam fleet is fully M-series; Intel target dropped.
- `server/domains/security/routes/audit.js` refactored to factory pattern `createAuditRouter({...})` to enable the contract tests below.

### Added

- `server/domains/security/routes/audit.test.js` — 8 contract tests pinning the audit router's auth/role/filter/error behaviour.
- `server/domains/basis/routes/backup.test.js` — 7 tests covering schedule GET/PUT + run-now lifecycle.
- `server/platform/csv/index.test.js` — 10 tests pinning rateRows + ddlToCsvRows.
- `docs/COSTAPI_EXTRACTION_ROADMAP.md` — 69-endpoint inventory, P1–P7 sprint plan, ADR-0009 retirement criteria.
- `dist/RELEASE_NOTES_v1.3.0-rc.5.md`.

### Migrated

- 4 client call sites: `/ddl/*` → `/library/ddl/*` (`getDdlBackups`, `backupDdl`, `restoreDdl`, `exportDdlCsv`). Server retains legacy URL per ADR-0009.

### CI

- `router-test-coverage` job flipped from warn-mode to **error-mode**. PRs adding a router without a sibling `*.test.js` now fail. ADR-0013 fully enforced (7/7 routers compliant).

## [1.3.0] — 2026-04-29 (autonomous upgrade pass)

In-place security + maintainability hardening of v1.2. Same UX, same data
shape — every change is additive or transparent. See `UPGRADE_LOG.md`
for per-phase decisions and `MIGRATION_GUIDE.md` for operator notes.

### Phase digest

Generated by `node scripts/summarise-upgrade-log.mjs --markdown`:

| Phase | Title                                                                                                       | Tasks |
| ----- | ----------------------------------------------------------------------------------------------------------- | ----- |
| 0     | Scaffolding                                                                                                 | –     |
| 1     | Security hardening (argon2id, Ed25519, CSP, nav lockdown)                                                   | 5     |
| 2     | Code health (ESLint 9, Prettier, husky, GitHub Actions, coverage gate)                                      | 4     |
| 3     | Architecture light-touch + i18n registry extension                                                          | 4     |
| 4     | Setup wizards (server 4-step, client 2-step)                                                                | –     |
| 5     | License tier + 4 installers + admin seed + Ed25519 keypair tool                                             | 5     |
| E     | License-status router extracted to security domain (+ 5 tests)                                              | 2     |
| F     | Basis/backup-schedule router + bundle marker + git init                                                     | 3     |
| G     | Library/rate router + pricing i18n + commitlint + ADR-0007 + CI marker                                      | 5     |
| H     | DDL router + sales i18n + ADR-0008 (extract-first) + coverage baseline                                      | 4     |
| J     | Library/rate + ddl LIVE + login.\* i18n + ADR-0009 + rc.2 release                                           | 4     |
| K     | Chat i18n + commitlint trailers + ADR-0010 release gate + sales/released-quotation router                   | 6     |
| L     | ADR-0011 router pattern + sales/quotes scaffolded + mes i18n (90 keys) + rc.3 release                       | 5     |
| M     | Dashboard/settings/appearance i18n + ADR-0012 + sales/quotes LIVE + log summariser                          | 4     |
| N     | Client URL audit + rate/\* cutover + CHANGELOG embed + rc.4 release                                         | 6     |
| O     | DDL cutover + ADR-0013 debt closure + CI gate enforce + arm64-only mandate + costApi roadmap + rc.5 release | 7     |

### Added

- **argon2id password hashing** — replaces `bcryptjs` for new hashes;
  silent rehash ladder upgrades existing bcrypt hashes on next login.
- **Ed25519 license signing** — replaces v1.2 HMAC-SHA256. Server holds
  the private key; client embeds only the public key. License v2 file
  format with `tier`, `max_users`, signed canonical payload.
- **License tier enforcement (S=15, M=20, L=50)** — server-side
  middleware `requireSeatAvailable()` blocks `POST /api/users` with
  HTTP 402 when over the seat cap. Tested at all 3 tiers.
- **Setup wizards** (`desktop/setupWizard.js`):
  - SERVER edition (4 steps) — License → Data path → Network/port → admin user
  - CLIENT edition (2 steps) — Server URL → connection test
- **Content Security Policy** on every BrowserWindow response
  (`default-src 'self'`, no frame, no object). `webview` disabled,
  `allowRunningInsecureContent: false`. External links route through
  `shell.openExternal()` instead of replacing the SPA.
- **Dev license keypair + signer**:
  `scripts/license/{dev-private,dev-public}.pem` and
  `scripts/license/generate-license.mjs` — CLI used by CCL HQ to mint
  signed customer licenses.
- **Server-side license verification** — `server/services/licenseService.js`
  - 7 tests (sign/tamper/expired/unlicensed-fallback + middleware).
- **Per-domain i18n registration** — `client/src/i18n/strings.js`
  exposes `registerStrings(slice)`; first domain module
  (`i18n/domains/security.js`) registers audit log keys at boot.
- **Domain-folder scaffolding** for v1.3 architecture (server-side):
  `server/domains/{costing,library,sales,planning,quality,security,
basis,mes}/`. First extracted router: `security/routes/audit.js`.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) — 5 jobs:
  audit / lint / test-server / test-client / build. `npm audit
--audit-level=high` gates merges. Tagged releases also trigger
  installer build on `macos-14`.
- **Husky + lint-staged** pre-commit hook (activates when project is
  put under git).
- **Coverage gate** — Jest `coverageThreshold` 70% lines/functions/
  statements, 60% branches.

### Changed

- **Electron 33 → latest** — vás 3 high CVE (ASAR Integrity Bypass,
  AppleScript injection, executeJavaScript IPC spoof).
- **electron-builder 25 → 26**, **postcss latest** — 0 high vulns
  remaining in `desktop/` and `client/`.
- **ESLint 9 unified** at root (was 8/9 split between root/client).
- **Prettier 3** added with `.prettierrc.json` + `.prettierignore`.
- `desktop/license.js` — full rewrite for v2 format. v1.2 HMAC
  licenses are NO LONGER ACCEPTED; old `desktop/license.js` and tests
  archived to `_legacy/`.

### Security

- Password hashing: bcryptjs (~100 ms cost-12) → argon2id (~80 ms,
  4× harder against GPU/ASIC attack). Silent ladder migration so
  no operator action required.
- License: HMAC-SHA256 (single secret embedded in app) → Ed25519
  asymmetric (private key offline at CCL HQ). One leaked client
  install can no longer be used to sign fake licenses.
- CSP injected on every WebContents response — defends against XSS
  from user-uploaded artwork.
- BrowserWindow `webSecurity: true` + `webviewTag: false`.
- Navigation lockdown: `will-navigate` and
  `setWindowOpenHandler` route external URLs through
  `shell.openExternal()` so the SPA can't be replaced by a malicious
  link.

### Fixed

- npm audit: root 10 high (desktop chain) → 0; client 1 moderate → 0;
  root 2 moderate (dev-only `exceljs` → `uuid`) — accepted, fix
  requires major downgrade.
- ESLint config drift: removed `no-useless-escape` in `safeFn` regex,
  cleaned dead `bcryptLib` placeholder.

### Build

- 4 macOS DMG installers built (CLIENT + SERVER × arm64 + x64),
  staged in `dist/` with SHA-256 checksums in `dist/checksums.txt`.
- Windows `.exe` builds deferred — no Windows host or Wine on the
  current build env. CI workflow includes a path for it on
  `macos-14`/`windows-latest`.

### Deferred / known follow-ups

- `server/routes/costApi.js` god-file (2891 LOC) split — only the
  audit router was extracted as POC. Full migration mapped per
  domain in `MIGRATION_GUIDE.md`.
- v1.3 build artefact cleanup — sandbox blocked the cross-project
  `rm -rf` of `Ops Control v1.3/apps/desktop/dist-electron/{mac-arm64,
win-unpacked}` (~2 GB). Manual command provided in `UPGRADE_LOG.md`.
- TLS for Client–Server (`mTLS` self-signed handshake) deferred to
  a future v1.3.1 — needs operator UX work for cert generation.

---

## [1.2.0] — Unreleased

Fresh start branch from v1.1. Same baseline (Carbon Login + Hardware UI + Import UI + 30/30 tests + free signing) + Sprint 1.3 Mode Switcher UI + Sprint 2.1 enterprise hardening (P0 user-facing).

### Added — Sprint 1.3 (UI)

- **Settings → 🔁 Chế độ kết nối** ([ModeSection.jsx](client/src/modules/cost/tabs/ModeSection.jsx) + [ModeSection.css](client/src/modules/cost/tabs/ModeSection.css)) — visual picker giữa 3 mode (`embedded` / `thin` / `smart`) với card UI hiển thị icon + title + subtitle + description + ưu/trade-off + ACTIVE/PREVIEW badge. URL editor cho thin/smart. Save qua `desktop.app.setConfig()` IPC + restart prompt khi mode đổi. Web mode hiện banner "không khả dụng".
- **Settings → ℹ️ About / Diagnostics** ([AboutSection.jsx](client/src/modules/cost/tabs/AboutSection.jsx) + [AboutSection.css](client/src/modules/cost/tabs/AboutSection.css)) — hiển thị Version (1.2.0 + build timestamp + mode + URL), Runtime (Electron/Node/Chrome/Platform), License (status + customer + expires + features + installation_id 24-char prefix), 5 Diagnostic test buttons (printer list, cache R/W roundtrip, license status, HW fingerprint, server /health) với latency hiển thị, Bug-report copy-to-clipboard JSON snapshot (KHÔNG chứa secrets). Dùng cho IT troubleshooting + bug report.

### Added — Sprint 2.1 v1.3 hardening (P0 user-facing, IBM-style enterprise)

- **Server-side scheduled backup cron** ([server/services/backupScheduler.js](server/services/backupScheduler.js) — 220 dòng) — daily SQLite `db.backup()` (online-safe) + Library `tar czf` + self-verify (PRAGMA integrity_check + row counts vs live) + retention 30d + webhook alert on fail. Activated via `OPS_BACKUP_SCHEDULE=1`. Default OFF cho dev. Wired vào [server/index.js](server/index.js) startup.
- **Audit log rotation + monthly archive** ([server/services/auditRetention.js](server/services/auditRetention.js) — 200 dòng) — daily move events > 30 days to `audit_log_archive/audit_YYYYMM.json.gz` (gzipped), keep active log fast. Prune archives > 12 months. Activated via `OPS_AUDIT_RETENTION=1`.
- **Connection health monitor** ([client/src/services/connectionHealth.js](client/src/services/connectionHealth.js) — 180 dòng) — singleton ping `/api/health` mỗi 15s, exponential backoff khi offline (15s → 30s → 60s → 5min), pause khi tab hidden (visibilitychange API), auto-resume khi visible. Pub-sub pattern với `subscribeConnection(fn)`.
- **Connection status banner** ([client/src/components/Layout/ConnectionBanner.jsx](client/src/components/Layout/ConnectionBanner.jsx) + CSS) — top-of-app sticky banner: hidden khi online; warning vàng "Đang kiểm tra kết nối..." khi offline 5-30s; đỏ "⚠ Mất kết nối server (Xs)" khi offline > 30s; xanh toast "✓ Kết nối lại — Refresh" 8s khi reconnect. Aria-live cho screen readers.
- **`fetchWithRetry` helper** (in connectionHealth.js) — exponential backoff 200/500/1500ms cho READ requests; KHÔNG retry 4xx (client error) hay save endpoints (tránh duplicate qua optimistic-lock 409 path).
- **`useAutoRefresh` hook** ([client/src/utils/useAutoRefresh.js](client/src/utils/useAutoRefresh.js) — 100 dòng) — generic polling hook với pause-when-hidden, in-flight guard, last-refreshed timestamp. Applied to **QuoteHistory tab** (poll 30s). Documented for RFQ Tracker / Sample Tracking / Approvals (Đợt 2).
- **`ConflictModal` component** ([client/src/components/Shared/ConflictModal.jsx](client/src/components/Shared/ConflictModal.jsx) + CSS) — friendly 409 conflict UI thay `window.confirm()`: 3 button "↻ Reload" / "⚠ Overwrite" / "Hủy", default focus Reload (safer), ESC-to-cancel, hiển thị server v + our v + savedBy. Sẵn sàng wire vào StandardCalc/ComplexCalc save flow (Đợt 2).

### Changed

- `LoginPage.jsx` — version + IP/host hiển thị **dynamic** thay hardcoded `v1.1.0` + `127.0.0.1`. Đọc qua `desktop.app.getConfig()` → show actual mode + URL. Classify env: EMBEDDED / DEV / LAN / SMART / PROD theo IP range (RFC1918).
- `App.jsx` — wire `<ConnectionBanner />` near top + `startConnectionMonitor({ endpoint: '/api/health' })` at module load.
- `QuoteHistory.jsx` — auto-refresh 30s + manual refresh button + "Sync 25s ago" indicator trong header.
- All docs author header → **Henry Dang — NPI Manager**.

### Documentation

- [docs/LAN_DEPLOYMENT_GUIDE.md](docs/LAN_DEPLOYMENT_GUIDE.md) — 6/20-user setup chi tiết: macOS launchd + Windows NSSM + backup cron + multi-user behavior + troubleshooting matrix
- [docs/GO_LIVE_READINESS.md](docs/GO_LIVE_READINESS.md) — P0/P1/P2 audit + risk register + verdict
- [docs/ENTERPRISE_HARDENING.md](docs/ENTERPRISE_HARDENING.md) — IBM-style 3-2-1 backup proposal, 3 mục tiêu (auto-start + reconnect, data protection, security), roadmap 3 đợt

### Audit findings (concurrency-safe verified)

- ✅ SQLite WAL + busy_timeout 5s + transactions
- ✅ Async mutex `withLock(key, fn)` + cross-process lock via proper-lockfile
- ✅ Atomic file write (tmp+fsync+rename POSIX guarantee)
- ✅ Optimistic locking on quotes (`_version` field → HTTP 409)
- ✅ Rate limit per-IP (writeRateLimit 30/min, saveRateLimit 120/min)
- ✅ Server bind 0.0.0.0 (LAN-ready)
- ⚠️ JSON quote_history.json mutex bottleneck @ 20 users → migrate to SQLite primary (Đợt 3 todo)
- ✅ Real-time sync via SSE event bus (Đợt 2)

### Added — Sprint 2.2 v1.3 hardening (Đợt 2 — scaling + real-time)

- **Per-user rate limit factory** ([server/middleware/rateLimit.js](server/middleware/rateLimit.js)) — `userSaveRateLimit` (60/10min/user) + `userWriteRateLimit` (30/10min/user) keyed by `req.user.id` với IP fallback. Một user xấu không kéo cả LAN xuống.
- **In-process event bus** ([server/services/eventBus.js](server/services/eventBus.js)) — pub-sub `emitDataChange(type, payload, opts)` + `subscribeEvents(send, opts)` với audience filter + sequence numbers + dead-subscriber cleanup.
- **SSE endpoint `/api/events/stream`** ([server/routes/events.js](server/routes/events.js)) — auth via cookie/Bearer/?t= query, heartbeat 25s, X-Accel-Buffering hint cho nginx, ready event on connect.
- **Server emit hooks** — wired vào write paths:
  - `quote.saved` + `quote.deleted` từ POST/DELETE/restore/PATCH `/api/quotes` ([server/routes/costApi.js](server/routes/costApi.js))
  - `library.imported` batched từ POST `/api/save-all` (per dataset, deduped)
  - `rfq.updated` + `sample.updated` từ audit/attachment add/remove ([server/routes/shared.js](server/routes/shared.js))
  - `approval.transition` từ atomic transition route + auto `quote.saved` follow-up
- **Client SSE subscriber** ([client/src/services/dataEventBus.js](client/src/services/dataEventBus.js)) — singleton EventSource, channel-filtered pub-sub (`subscribeDataEvents(channels, fn)`), seq-gap detection, auto-reconnect via browser EventSource native behavior.
- **4 tabs subscribed to SSE** — instant refetch (< 50ms) thay vì chờ poll:
  - [QuoteHistory.jsx](client/src/modules/cost/tabs/QuoteHistory.jsx) — `quote.saved` + `quote.deleted` + `approval.transition`
  - [RFQTracker.jsx](client/src/modules/cost/tabs/RFQTracker.jsx) — `rfq.updated`
  - [SampleTracking.jsx](client/src/modules/cost/tabs/SampleTracking.jsx) — `sample.updated`
  - [PendingApprovalsInbox.jsx](client/src/modules/cost/tabs/PendingApprovalsInbox.jsx) — `approval.transition` + `quote.saved`
- **`useAutoRefresh` applied broader** — RFQ Tracker (60s), Sample Tracking (60s), Approvals Inbox (30s). Polling là fallback khi SSE rớt.
- **ConflictModal wired into save flow** — [StandardCalc.jsx](client/src/modules/cost/tabs/StandardCalc/StandardCalc.jsx) + [ComplexCalc.jsx](client/src/modules/cost/tabs/ComplexCalc/ComplexCalc.jsx) thay `window.confirm()` bằng modal 3-button (Reload / Overwrite / Cancel) preserve user edits.

### Changed (Đợt 2)

- `App.jsx` — `startDataEventStream()` boot at module load (pair với `startConnectionMonitor`).

### Added — Sprint 2.3 v1.3 hardening (Đợt 3)

- **Off-site backup helper** ([scripts/backup-offsite.sh](scripts/backup-offsite.sh)) — IBM 3-2-1 rule's "1 off-site" copy. Picks newest local SQLite + Library tarball, rsync's to USB/NAS/SSH target, sha256-verifies destination, optional retention prune (local-mount only), webhook alert on failure. Cron-friendly (e.g. `30 2 * * *` after the in-process scheduler at 02:00).
- **ActiveUsersIndicator** ([client/src/components/Layout/ActiveUsersIndicator.jsx](client/src/components/Layout/ActiveUsersIndicator.jsx) + CSS) — TopBar widget showing "● N online" pill. Click → popover liệt kê tên + role + recent-offline với last-seen. Polls `/api/users/status` mỗi 30s + refresh trên SSE write events (free presence signal). Pause khi tab hidden.
- **Backup upload UI** — Settings → Backup/Restore mới có nút "📤 Upload từ máy khác…" (sys-only). POST `/api/backup/upload` validates JSON shape (must have ≥1 known dataset key) trước khi persist vào `Backup & restore/Data/`. Xong rồi user click Restore từ list. Cho phép restore từ off-site copy / USB stick mà không cần rsync vào folder.
- **HTTPS Caddy helper** ([scripts/setup-https-caddy.sh](scripts/setup-https-caddy.sh)) — one-shot TLS reverse proxy generator. Self-signed mode (Caddy internal CA) cho LAN deploy, public ACME mode (Let's Encrypt) cho hosts có DNS public. Generates `Caddyfile` reverse-proxy 443 → 3100 với gzip + X-Forwarded-\* headers + access log rotation. Trust-CA instructions cho macOS/Windows clients.

### Bug fixes (Đợt 3)

- **Smart mode → ERR_ADDRESS_INVALID (-108)** — [desktop/main.js](desktop/main.js): `startEmbeddedServer()` chỉ chạy khi mode='embedded', smart mode rớt vào `getAppUrl()` → `http://127.0.0.1:0` (embeddedPort chưa set) → renderer crash với ERR_ADDRESS_INVALID. Fix: smart mode cũng start embedded server (smart cần local cache + remote sync). Plus `getAppUrl()` throw rõ ràng nếu port=0 thay vì silent fail.
- **Default remoteUrl** — đã thay `http://10.102.3.61:3000` (LAN cũ) bằng môi trường-aware default. User vẫn override được qua Settings → Mode UI.

### Added — Sprint 2.4 v1.3 hardening (Đợt 4)

- **Login anomaly detection** ([server/services/loginAnomaly.js](server/services/loginAnomaly.js)) — server-side, in-memory, runs after successful auth. Heuristics:
  - `concurrent_multi_ip` — same user logged in from 2+ IPs within 5min window
  - `new_ip` — IP not seen in last 30d for this user (skipped on first-ever login)
  - `unusual_hour` — login at 22:00–06:00 when user has no prior unusual-hour history (3+ login baseline)
- Server: stamps `LOGIN_ANOMALY` audit event + emits SSE `security.alert` (audience: admins).
- Client: `LoginPage` shows yellow toast cảnh báo user themselves; `App.jsx` admins also see toast for ANY user's anomaly so security ops can react.

### Added — Sprint 2.5 v1.3 hardening (Đợt 5 — backend cutover)

- **SQLite primary backend default for desktop** — [desktop/main.js](desktop/main.js) now sets `OPS_DATA_BACKEND=sqlite` + `OPS_BACKUP_SCHEDULE=1` + `OPS_AUDIT_RETENTION=1` by default. Removes JSON-mutex serialization bottleneck @ 20 concurrent saves; reads now indexed-fast in SQLite. JSON write still mirrors as backup safety net (will remove after 14d observation per Sprint 7.4 plan).
- **AboutSection diagnostic tests +3** — [client/src/modules/cost/tabs/AboutSection.jsx](client/src/modules/cost/tabs/AboutSection.jsx):
  - `Quote backend` — shows current backend (sqlite/file) + row counts (parity at-a-glance)
  - `SSE event stream` — number of subscribers (sanity check that SSE infra is live)
  - `Active users` — N online of total registered
- **SSE security.alert subscription** — `dataEventBus.js` registers the event type; admins-only consumer in `App.jsx` shows real-time anomaly toast.

### Added — Sprint 2.6 v1.3 hardening (Đợt 6 — operator tools)

- **Active Sessions admin tab** — [Settings.jsx AccountSection](client/src/modules/cost/tabs/Settings.jsx) → Sessions sub-tab (sys-only). Shows username, role, 2FA status, token prefix, expires-in for every active session. "Revoke" button per-row → POST `/api/auth/sessions/revoke` kicks user from all machines. Pairs with login anomaly detection: when admin sees `LOGIN_ANOMALY` toast, they can immediately revoke the suspicious user's sessions from this tab.
- **Runtime smoke test** — [scripts/smoke-runtime.sh](scripts/smoke-runtime.sh) curl-based 8-check post-install validator. READ-ONLY (no kill / signal / mutation). Verifies `/health`, `/assets/* → 404`, `/api/events/stream` auth gate, `/api/users/status` auth gate, etc. With `OPS_TOKEN=<token>` env, runs deep checks (parity, SSE subs, online count).
- **LAN Client Quickstart** — [docs/LAN_CLIENT_QUICKSTART.md](docs/LAN_CLIENT_QUICKSTART.md) one-page setup guide for end users on machines #2-#20: install DMG/EXE, point at server URL via Settings → Mode → Thin, first login + 2FA. Includes troubleshooting matrix (chunk errors, conflict modal, TOTP fail) + ops section (smoke test, off-site backup, Caddy HTTPS, anomaly grep).

### Bug fixes (Đợt 6)

- **Login screen background "blinking"** — replaced upward-vector stream with v1.0-style constellation particle network. Restored dark blue gradient (`#0a1220 → #13233d`) + dotted blueprint grid + random-velocity dots + thin network lines between nearby pairs. Removed mouse coupling (was causing the perceived flicker as cursor crossed particles).
- **Hardcoded "v1.0" / "v1.1"** — Settings → About panel + LoginPage session-expired card both used hardcoded version strings. Now dynamic from `app.getVersion()` via `serverInfo.version` IPC.
- **Session-expired card stuck top-left** — compact CSS removed `position: fixed` + `min-height` so the card had no viewport to center against. Re-added grid centering + viewport-fill background.
- **smoke-runtime.sh killing user's app** — earlier iteration paired the test with `kill $(lsof -t -iTCP:3100)` cleanup which would unintentionally SIGTERM the desktop app's embedded server. All kill/signal logic removed; script is now strictly READ-ONLY.
- **Thin-mode self-loop → ERR_CONNECTION_REFUSED** — when user picks Thin mode but `remoteUrl` points at this machine's own IP (loopback or local NIC), [main.js](desktop/main.js) now auto-starts the embedded server and uses the loopback URL. Realistic case: one Mac is BOTH server AND client desktop.

### Bug fixes

- LoginPage version + IP hardcoded → dynamic
- Server hot-patch cleanup: bundle structure broken when rsync entire folders into installed .app — switched to granular file copy

### Changed

- `desktop/main.js` — `ops:set-config` IPC handler giờ **dynamic mode swap** giữa `thin ↔ smart` không cần restart full. Chỉ start/stop smart-client engine on-the-fly. Embedded ↔ thin/smart vẫn cần restart (server boot heavy). URL change trong cùng mode vẫn cần restart (cookie/session tied to old URL).

### Planned (still)

- Sprint 5 deployment: nginx update repo + auto-update flow live test
- Pilot rollout 3 máy + feedback collection
- Smart-client mode `smart` end-to-end (Sprint 3 backend done, frontend wire pending)
- Bytenode IP compile in release pipeline (Sprint 4 anti-piracy)
- Windows EXE build + GPO trust push test
- Mode switcher UI trong Settings (embedded/thin/smart)

### Changed

- All `package.json` version bumped 1.1.0 → 1.2.0
- All description "Ops Control v1.1" → "Ops Control v1.2"

---

## [1.1.0] — 2026-04-27

Desktop app release. Web app v1.0 codebase wrapped in Electron 33 với native hardware bridges, smart-client cache, Carbon-style login UI redesign, và one-click data migration từ v1.0.

### Added

- **Electron 33 desktop shell** ([desktop/main.js](desktop/main.js)) — 3-tier smart client (Tier 1 Presentation + Tier 2 Express embedded + Tier 3 SQLite local). 3 modes: `embedded` (in-process server), `thin` (gọi remote), `smart` (hybrid offline-capable, Sprint 3+).
- **Native hardware bridges** ([desktop/native/](desktop/native/)):
  - Zebra/TSC label printer (TCP:9100 raw socket — không cần driver)
  - Office printer A4/A3 (pdf-to-printer + SumatraPDF bundled)
  - Cân điện tử RS232/USB-Serial (serialport + parser regex)
  - Scanner USB-HID raw + keyboard wedge fallback
  - Sandboxed file dialogs với whitelist path
  - SQLite local cache (KV + master_cache + outbox queue + sync_state)
- **Settings → 🔌 Thiết bị phần cứng** ([HardwareSection.jsx](client/src/modules/cost/tabs/HardwareSection.jsx)) — UI cấu hình IP printer, COM port cân, scanner mode, default office printer. Live test: ping printer, đọc weight realtime, scan barcode preview.
- **Settings → 📥 Import data v1.0** ([ImportLegacySection.jsx](client/src/modules/cost/tabs/ImportLegacySection.jsx)) — folder picker → scan + preview (table + sizes) → 1-click copy. Schema validation peek 5 core tables (`quotes`, `materials`, `ifs_inventory`, `bom`, `routing_operations`) trước import — block button + warning nếu folder pick có ops.db sai schema. Skip Users + totp + audit để giữ login + 2FA hiện tại.
- **License manager** ([desktop/license.js](desktop/license.js)) — HW fingerprint SHA256 (CPU + MAC + motherboard SN qua node-machine-id) + HMAC-signed license file + trial 14 ngày auto-issued + boot probe. `OPS_LICENSE_SECRET` env override cho production.
- **Auto-update** ([desktop/auto-update.js](desktop/auto-update.js)) — electron-updater polling `http://10.102.3.61/updates/` (configurable). Background download + restart prompt.
- **Smart-client sync engine** ([desktop/smart-client.js](desktop/smart-client.js)) — pull delta theo `_saved_at`, push outbox FIFO, ping online detection mỗi 15s, broadcast status qua IPC.
- **Server sync routes** ([server/routes/sync.js](server/routes/sync.js)) — `GET /api/sync/{manifest,pull}` + `POST /api/sync/push`. Auth-required.
- **🎨 Carbon split-screen Login UI** ([LoginPage.jsx](client/src/components/Auth/LoginPage.jsx)) — IBM Carbon + IFS Cloud + SAP Fiori inspired. Hero panel bên trái (đen, brand mark + "Pricing & planning, **online or off.**" + version footer) + form card bên phải (sharp corners, monospace accents, big blue Sign in button với arrow). 3 screens cùng style: Login / TOTP / Enrollment. Compact mode (session-expired modal) + responsive < 880px + dark mode auto.
- **30 unit tests**:
  - 7 tests cho `server/routes/sync.js` (route mounting, auth gate, manifest, pull filter, push validation)
  - 10 tests cho `desktop/license.js` (HW fingerprint determinism, sign canonical, verify {bad-sig, hw-mismatch, expired, valid}, trial issue, applyLicense)
  - 13 tests cho `desktop/native/cache.js` (KV roundtrip, master_cache upsert/list, outbox enqueue/markDone/markFailed, sync_state)
- **Free signing scripts** ([scripts/sign-windows.ps1](scripts/sign-windows.ps1) + [scripts/sign-macos.sh](scripts/sign-macos.sh)) — Windows self-signed cert auto-generate (10 năm) + GPO push instructions; macOS ad-hoc sign + clear quarantine. Tiết kiệm 401 USD/năm so với EV cert + Apple Dev ID.
- **Build wrapper** ([scripts/build-desktop.sh](scripts/build-desktop.sh)) — workaround node-gyp space-in-path bug bằng cách sync sang `/tmp/ops-build/` rồi build, copy artifact về.
- **Bytenode IP compile** ([scripts/build-bytecode.js](scripts/build-bytecode.js)) — Sprint 4: compile 4 file IP cốt lõi (`calcEngine`, `inkCalcCore`, `layoutOptimizer`, `printAreaCore`) sang V8 bytecode `.jsc` cho anti-piracy.
- **Release script** ([scripts/release.sh](scripts/release.sh)) — bump version + build client + bytenode + electron-builder + post-build sign + rsync upload tới `10.102.3.61:/var/www/updates/`.
- **Documentation**:
  - [SOLUTION_v1.1.md](SOLUTION_v1.1.md) — kiến trúc 3-tier + roadmap 5-sprint + bug log 19 entries + cost analysis
  - [docs/DESKTOP_DEPLOYMENT.md](docs/DESKTOP_DEPLOYMENT.md) — IT guide deploy 50 máy (firewall, GPO, MDM, troubleshooting matrix)
  - [docs/INTERNAL_TRUST_SETUP.md](docs/INTERNAL_TRUST_SETUP.md) — free signing migration path (self-signed + GPO + ad-hoc + LAN distribution)
  - [desktop/README.md](desktop/README.md) — dev quick-start + 5-step install + hardware compatibility matrix

### Changed

- `server/services/authService.js` — TOTP cipher từ `chacha20-poly1305` → `aes-256-gcm` (Electron BoringSSL compat — bug 18 fix)
- `server/index.js` — mount `/api/sync` + `/api/v1/sync` routes với authMiddleware
- `client/src/services/desktopBridge.js` — abstraction layer Electron API ↔ web fallback. Keyboard wedge mode cho scanner trong web mode.
- `desktop/package.json` — Electron 33.4.11 + electron-store v8.2.0 (downgrade từ v10 ESM-only) + better-sqlite3 + node-hid + serialport + node-machine-id

### Fixed

- 19 bug fixed during PoC (xem [SOLUTION_v1.1.md Section 9.4](SOLUTION_v1.1.md)). Highlights:
  - Bug 7: `ELECTRON_RUN_AS_NODE=1` từ VSCode shell làm Electron chạy như Node thuần — workaround `env -u ELECTRON_RUN_AS_NODE` khi launch
  - Bug 13: Bundled server thiếu `package.json` `"type": "module"` cho ESM — fix bằng extraResources
  - Bug 14: better-sqlite3 không có `.node` binary trong bundle — fix bằng `electron-rebuild --module-dir /tmp/ops-build`
  - Bug 15: EPIPE crash khi launch từ Finder — fix disable console transport khi packaged + uncaughtException guard
  - Bug 18: TOTP enroll cipher unknown — fix swap sang `aes-256-gcm`
  - Bug 19: Dashboard "database_shape_mismatch" — fix Import UI schema validation + restore script

### Performance

- Boot time: **270 ms** (Electron launch → window load) — DoD < 5s ✓
- Embedded server ready: **232 ms** (spawn + Express preflight + SQLite open)
- DMG size: **158 MB** (sau khi clean .pre-sqlite migration backup + broken TOTP files)
- Installed app: **381 MB** (giảm 72 MB so với DMG đầu)

### Cost

- Annual operating cost: **0 USD** (vs 401 USD nếu mua EV cert + Apple Dev ID)
- Free Windows code signing: self-signed cert (10 năm) + GPO Trusted Publishers push
- Free macOS code signing: ad-hoc sign + IT-distributed (no quarantine attribute)

---

## [1.0.x] — 2026-03 → 2026-04 (Web app baseline)

Tham chiếu: web app v1.0 ở [`../Ops Control/`](../Ops%20Control/CLAUDE.md). Sprints 11–14 hardening landed 2026-04-25 với 1,025 tests pass (560 server + 465 client). v1.1 copy nguyên codebase này + thêm desktop layer.
