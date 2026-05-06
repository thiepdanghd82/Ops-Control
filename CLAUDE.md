# Ops Control — Agent Playbook

> **Sprints 1.5–1.7 (Apr 27–28, 2026) — SAP/IFS-grade hardening pass.**
>
> **Sprint 1.5 — SAP/IFS user provisioning.** `must_change_password` flag + admin "Generate Provisioning Card" flow (server-generated 12-char temp pwd, one-shot modal with print + copy, A6-card print stylesheet) + Settings → Connection Mode "Re-run setup wizard" button. Login screen Carbon redesign + EN/VN flag toggle on Hardware/Mode tabs + bilingual decision Legend.
>
> **Sprint 1.6 — MOQ overrides + i18n + Remember-me.** Setup LM (Materials tab) and Setup H (Process tab) now route writes to the active MOQ tier (Standard + Complex), so editing MOQ 2 no longer clobbers MOQ 1's base. 75+ new i18n keys + 9 tabs wired (Quote History, Pricing breakdown, RFQ Tracker, all 6 Planning tabs). Remember-me checkbox actually works: server 30-day TTL + cookie maxAge match + client localStorage/sessionStorage routing + persisted preference.
>
> **Sprint 1.7 — Audit hardening (IBM principal review).** Top-5 fixes: (1) `deploy.sh`/`deploy.ps1` MERGE remote .env instead of clobbering everything but OPS_TOTP_KEY (was silently disabling backups + CORS) + preflight gate before service restart; (2) `pruneOldBackups` wired into `runBackupCycle` + `BACKUP_FAILED` audit always emits regardless of webhook; (3) `totpVerifyRateLimit` on /totp/verify, /totp/enroll, /totp/secret + writeRateLimit on /auth/change-pwd (closes brute-force OTP); (4) deploy snapshots → `releases/<ts>/` for rollback (5-snapshot retention) + 3 new DR runbook sections in this file ("admin lockout", "rollback bad deploy", "bare-metal restore") + `scripts/recover-sys-user.js` console-only recovery; (5) `/auth/users/:id/session-ttl` switched to `updateUsers()` wrapper (closes lost-update race). Bug fixes alongside: Dashboard reads via `loadQuotes()` not direct SQL (was all-zero KPIs when default file backend); HelpTab `FlexBilingual` defensive coercion (was crashing React #31 on entries with `formulas[].name = bi(...)`); FileUploadZone Drawing fetch shows error inline instead of silent catch + server `/api/layout/:filename` uses path-traversal check (was `safeFn` stripping `(`, `)`, `#`).
>
> **Sprints 11 + 13 hardening landed 2026-04-25.** 1,578 tests pass (981 server + 587 client + 10 desktop).
>
> **Sprint 11 — Safety Rails:** JSON schema validation on Library/_ (P0-1), optimistic locking on
> quotes (P0-2), Windows deploy scripts (P1-3), TOTP key preservation across deploys (P2-1), CSRF
> was already in place from Phase 9H.4 (verified — audit false-flagged), `_saved_at` server-
> authoritative timestamp, rate-limit on reset-pwd, assets/_ 404 regression test,
> `npm run preflight` env validator, ESLint warning on new `style={{...}}` usage.
>
> **Sprint 12 — Code Quality refactors DEFERRED.** PrintAreaCalc/Settings splits (28h+) and 5x
> inline-style migrations (12h) are too large for one session without regression risk. The ESLint
> warning on inline-styles prevents NEW additions. Top-5 offenders documented in
> `client/eslint.config.js` ignores list — pull one off as each tab is touched.
>
> **Sprint 13 — Observability & Ops:** /health, /ready, /metrics + client-error/web-vitals telemetry
> all already in place (Phase 10H + 9N.3, verified). Soft-delete + Trash for quotes
> (`DELETE /api/quotes/:id` → soft, `?purge=1` → sys-only hard, `POST /api/quotes/:id/restore`).
> Backup verifier `npm run verify-backup` (recognises both directory + snapshot formats).
> Full TOTP rotation runbook in this file. i18n DEFERRED (operators are EN-fluent).
>
> **Sprint 14 — Design Tools (engineer cylinder + layout designer):** new sidebar tab "Design Tools"
> with 3 nested tab levels (toolset → press → Print/Cut). Gallus calculator fully implemented
> from `Gallus_Design_Calculator_RL.xlsx` with K-aware formula fix (lesson 15). 4 other presses
> (Letter Press, Brotech, HP Indigo, Silkscreen) ship as stubs with checklist for buildout.
> Bidirectional Pricing handoff: "Apply to Pricing (Std/Cpx)" pushes designed values into the
> active quote; "Print/Cut Design sync" buttons in Pricing Layout pull saved records back.
> Server library at `Library/DesignTools/designs.json` with audit-logged save/list/delete.
> sessionStorage persistence keeps the working draft across tab switches. Trash UI in
> QuoteHistory for soft-deleted quotes (Sprint 13 API + Sprint 14 UI).
> **Sprint 10 go-live audit ran on 2026-04-22.** 410/410 tests pass.
> 12/12 self-test smoke checks pass under headless Chrome (no console
> errors, no page errors, no nav failures, no aria-missing tabs). Any
> new code path MUST preserve this bar — see the "Go-live readiness"
> section below for the audit findings + "Lessons learned" for the
> patterns that kept biting us.
>
> **Sprint history — newest first** (SHA-discipline per Lesson 0):
>
> **S-INVENTORY-1b Cohort 3 — Smart KPI tiles unify with Dashboard (S-DESIGN-1) shipped 2026-05-06 (SHA: `<COHORT-3-SHA>`).** `shouldShowDelta` (hide when prev=0 or |Δ|<1%), `hasSparklineData` (≥4 non-null+non-zero gate), `toneOfGM` thresholds, polarity-aware Delta (higher_better/lower_better/neutral), `qa-kpi-v2` + `qa-kpi-tone-good/warn/bad/neutral` rail classes, `qa-delta-neutral` pill, `.qa-kpi { ::before }` rail redesign with hover lift. HomePage tile redesign deferred to S-INVENTORY-1c (Cohort 4 entangled with S-HOME chain).
>
> **S-INVENTORY-1b Cohort 2 — Reports tab redesign (S-RESP-1 + S-QA-CONSOL) shipped 2026-05-06 (SHA: `d4f5894`).** Period picker (7-chip toolbar + Custom range modal), responsive container queries (4-up @1400, 6-up @2000), fluid typography, sticky filterbar with IntersectionObserver, A4 landscape print stylesheet. Breakdown panel consolidation (4 stacked tables → 1 pivot + GmStackBar) bundled per data-layer entanglement (`applyFilters` range refactor). Smart KPI tile redesign deferred to Cohort 3.
>
> **S-INVENTORY-1a Cohort 6 — DesignTools / Gallus calibration shipped 2026-05-06 (SHA: `190be0b`).** ShotLayoutViz algo version stamp + closure invariant + even-gap distribution + dimension chains + zoom/pan; gallus engine `bleed_mm` parameter + `effectiveL`/`effectivePw` (lesson 22); GallusCalc legacy pill fix + auto-E badge; Layout default sub-tab `'cut'` → `'print'` in StandardCalc + ComplexCalc (S-LAYOUT-DEFAULT, 2026-05-05). 109/109 gallusEngine tests pass; 5/5 closure invariant guards pass.
>
> **S-INVENTORY-1a Cohort 1 — reason-codes admin CRUD + perms migration shipped 2026-05-06 (SHA: `d61c8e7`).** Server-only `/v2/reason-codes` POST/PATCH/disable/enable with role gate, RFC-7807 errors, audit emit, and idempotent groups.json migration for the new admin tab. UI deferred to S-INVENTORY-1c (entangled with S-HOME chain). Endpoints dormant on main until UI ships — no client calls these yet.

## Deployment topology (CRITICAL)

There are **two runtime surfaces** that can serve the UI. Which one the user is viewing determines what you must do after a code change.

| Surface                          | URL                                                | Source it serves                    | After-edit action                |
| -------------------------------- | -------------------------------------------------- | ----------------------------------- | -------------------------------- |
| **Vite dev**                     | `http://localhost:5173` (or 5175 when auto-bumped) | `client/src/**` live, via HMR       | Nothing — HMR picks it up        |
| **Prod server (local)**          | `http://localhost:3000`                            | `client/dist/**` (pre-built bundle) | `cd client && npm run build`     |
| **Prod server (remote Windows)** | `http://10.102.3.61:3000`                          | `client/dist/**` on THAT machine    | Build **+** deploy to the remote |

The Vite dev server (`npm run dev`, defined as `client-dev` in `.claude/launch.json`) is the only surface that auto-refreshes. The node production server (`server/index.js`) serves whatever bundle is physically in `client/dist/` at request time — it does NOT watch source files.

## After every UI/client-code change — MANDATORY checklist

**This is not optional. On 2026-04-23 Cost→summarize and Cost→quote-history
crashed with `'text/html' is not a valid JavaScript MIME type` because a
build+server-restart step was skipped. Follow every step below or the
user sees stale-chunk errors.**

1. **Identify the surface from the URL in the screenshot:**
   - `:5173` / `:5175` → Vite dev, HMR handles it. No action.
   - `:3000` on `localhost` → prod bundle; **must rebuild + restart**.
   - `:3000` on `10.102.3.61` (remote Windows) → rebuild **and** deploy.

2. **Tests first** — a broken build wastes everyone's time:

   ```bash
   cd "3. PROJECTS/Ops Control/client" && npm test
   ```

   Then server tests:

   ```bash
   cd "3. PROJECTS/Ops Control" && npm test
   ```

   Both must pass before proceeding.

3. **Rebuild the client:**

   ```bash
   cd "3. PROJECTS/Ops Control/client" && npm run build
   ```

   The bundle hash (e.g. `index-BZT3rIjg.js`) MUST change when source
   changed. If it didn't, the source isn't actually in the build.

4. **If server code (`server/**`) was touched, RESTART the node process:\*\*

   ```bash
   OLDPID=$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null)
   kill $OLDPID 2>/dev/null; sleep 1
   cd "3. PROJECTS/Ops Control" && node server/index.js > /tmp/ops-server.log 2>&1 &
   sleep 2
   ```

   Confirm it's serving:

   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/
   ```

   (expect `200`)

5. **Self-check the deployed bundle matches the source.** Pick a
   unique string from your edit (a new comment, class name, or field
   name) and grep the built bundle — it MUST be present:

   ```bash
   grep -l "<new-identifier>" "3. PROJECTS/Ops Control/client/dist/assets/"*.js
   ```

   And the OLD behaviour string must be GONE:

   ```bash
   grep -l "<old-identifier>" "3. PROJECTS/Ops Control/client/dist/assets/"*.js  # should print nothing
   ```

6. **Verify stale-chunk protection is intact** (crash-prevention regression
   guard — added 2026-04-23):

   ```bash
   curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3000/assets/THIS-DOES-NOT-EXIST.js
   ```

   Expect `404` (NOT 200). If this returns 200 the server is falling
   back to `index.html` for missing chunks, which causes the MIME-type
   crash. See `server/index.js` — there must be a route for
   `/assets/*` that returns 404 **before** the SPA catch-all.

7. **If remote, deploy:**

   ```bash
   cd "3. PROJECTS/Ops Control" && ./deploy.sh user@10.102.3.61
   ```

   Confirm deploy target the first time each session.

8. **Only AFTER all 7 checks pass, tell the user to reload** (one
   normal `Cmd+R` is enough now that the server sets `no-cache` on
   `index.html` + `immutable` on `/assets/*`). If they still see a
   crash, the ErrorBoundary's auto-reload kicks in once automatically;
   a second crash means the NEW bundle is broken — investigate, don't
   just ask for another reload.

## Playwright e2e (MES-2.8, 2026-05-01)

The kiosk PWA has a Playwright suite at `apps/kiosk/tests/e2e/` driving
chromium against the planner server with an isolated `DATA_DIR` +
SQLite path.

- Run all specs: `npm run test:e2e`
- Headed (debugging): `npm run test:e2e:headed`
- One-time chromium binary install: `npx playwright install chromium`
- Reports land in `playwright-report/` (gitignored); failures attach
  screenshots + traces in `test-results/`.
- Pre-condition: `npx playwright install chromium` must run once on
  the dev box (Playwright won't auto-download). The `webServer` block
  in `apps/kiosk/playwright.config.js` boots an isolated server with
  the MES feature flag pre-enabled via `_globalSetup.js`, so no
  manual flag-flip is needed.
- Chromium-only this sprint; cross-browser deferred to MES-3.

## Common failure mode to avoid

> "I edited the source, HMR refreshed my preview, I claimed the change is live."

That's only true on the dev surface. If the user is on `:3000` (local or remote), the preview you verified with Claude Preview tools is **not** the surface they see. Always cross-check the URL in their screenshots.

## Stale-chunk crash recovery (2026-04-23 incident)

**Symptom**: browser console shows
`'text/html' is not a valid JavaScript MIME type. Strict MIME type checking is enforced for module scripts per HTML spec.`
and the affected tab renders the ErrorBoundary fallback with
`Cost → <tab-id> crashed`.

**Root cause**: browser holds an old `index.js` referencing chunk hashes that no longer exist in `client/dist/`. The old `express.static` fallthrough returned `index.html` for any unknown path, so the browser loaded HTML when it expected JS and choked on the `text/html` content type.

**Fix in place**:

1. `server/index.js` has a `/assets/*` 404 route BEFORE the SPA catch-all. Unknown chunks now return a real 404.
2. `components/Shared/ErrorBoundary.js` detects the three common chunk-load error messages and force-reloads the page once per session (guarded via `sessionStorage['ops_chunk_reload_done']` so a genuine bug can't melt the browser in a loop).
3. `server/index.js` sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` and `no-cache` on `index.html` so the browser can safely trust hashed chunks and always revalidate the entry point.

**What to do when it happens again**: run step 6 of the checklist above. If the 404 check is failing, one of those three defences has been removed — restore it.

## Backend changes

Server code in `server/**` is served by `node server/index.js`. It doesn't auto-restart on file changes unless the user has set up nodemon. After editing server code:

- Ask the user to restart the node process, OR
- On the remote Windows server, the systemd/service equivalent needs restarting after `./deploy.sh` pushes the new code.

## Key files

- `client/src/components/Layout/Sidebar.jsx` — left-side navigation shell
- `client/src/services/printAreaCore.js` — Print Area Calculator pure algorithm (framework-free, has its own Jest tests)
- `client/src/modules/cost/tabs/PrintAreaCalc.jsx` — Print Area Calculator UI
- `client/src/help/content.js` — **Help system source of truth** (see "Help system" below)
- `client/src/modules/help/HelpTab.jsx` — in-app Help tab component
- `scripts/help/build-user-guide.mjs` — builds the Word user guide from content.js
- `server/index.js` — node server entry point (serves `client/dist` + API routes)
- `deploy.sh` — Linux SSH deploy → systemd; `deploy.ps1` is the Windows counterpart (NSSM service) and was the script used for `10.102.3.61`. Both share the same .env-merge + snapshot + preflight gate; DATA_DIR is `.env`-driven on both since Sprint S-P0-FIX-1 (2026-05-03, SHA: `e75cac9`)
- `.claude/launch.json` — defines `client-dev` and `ops-control` preview targets

## Help system

Centralized, searchable in-app help with a Word-export mirror.

**Single source of truth:** `client/src/help/content.js`. Every tab has one entry keyed by its tab ID (matches the Sidebar + router). Both the in-app Help tab and the Word user guide read from here, so they can never drift.

**Where it lives in the UI:** SYSTEM → Help in the sidebar (below Metrics). `F1` anywhere in the app deep-links to the entry for the current tab.

**Workflow for editing help:**

1. Edit `client/src/help/content.js` — add/update the entry for the affected tab.
2. If you added a screenshot reference, capture a PNG and drop it at `client/public/help/screenshots/<id>.png`. 16:10 aspect, 1280×800 recommended.
3. Rebuild the Word file so operators who download it see the new content:
   ```bash
   cd "3. PROJECTS/Ops Control" && node scripts/help/build-user-guide.mjs
   ```
   Output goes to `client/public/help/OpsControl_UserGuide.docx` AND is mirrored to `4. CLAUDE OUTPUT/OpsControl_UserGuide.docx` for review.
4. `npm run build` + deploy as usual (the `.docx` is a static asset served from `client/dist/help/`).

**Capturing screenshots:** the app is behind auth, so programmatic capture via Claude Preview isn't possible. After logging in:

- Navigate to the tab.
- Use OS screenshot tool (Cmd+Shift+4 on macOS) OR a browser screenshot extension.
- Save as `<tab-id>.png` in the screenshots folder.
- Re-run the guide build script.

**Missing screenshots** are handled gracefully — the in-app Help hides the `<img>` on error, and the Word export prints `[Screenshot pending: <name>]` as a placeholder. Shipping without screenshots is acceptable; adding them later is an additive improvement.

**Word generators run automatically on `npm run build`** via the `prebuild` hook (see `client/package.json`). `scripts/help/build-all-docs.mjs` orchestrates the User Guide + Pricing Legend generators. Any new doc should be added to that script so a prod build always ships fresh offline docs.

## Authorization model (Sprint S1-S3, 2026-04-24)

Three-layer permission system, SAP-inspired. Every access decision goes through `permissionService.resolveTabAccess(user, tabId) → 'hidden' | 'read' | 'edit'`.

| Layer                   | Field                                                                                             | Purpose                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ | ---------------------------------- |
| **1. Role**             | `user.role` (sys/admin/cost/user/viewonly)                                                        | Coarse write + admin gate. `sys` = god mode (bypasses all tab checks). |
| **2. Department**       | `user.department` (sales / cs / npi / purchasing / production / quality / finance / leader / ops) | Informational + default-group suggestion. Does NOT enforce on its own. |
| **3. Permission Group** | `user.permission_group_id` → `Library/PermissionGroups/groups.json`                               | Per-tab access matrix (`tab_permissions: { tabId: 'hidden'             | 'read' | 'edit' }`). THE enforcement layer. |

**Client enforcement** — `AccessProvider` loads groups on login, exposes `useAccess().access(tabId)`. `Sidebar.jsx` filters hidden tabs; `<AccessGate tabId=…>` wraps every tab-level component (in `CostModule.jsx`) and renders a forbidden card (`hidden`) or read-only fieldset (`read`).

**Server enforcement (defense-in-depth)** — `requireTabAccess(tabId)` middleware on every write endpoint. A curl user bypassing the client gets a `403 permission_denied { tab, required, current }`. Protected endpoints:

- `POST /api/save-all` → `requireBodyTabAccess(SAVE_ALL_TAB_MAP)` — rejects whole request if any body key's tab is not 'edit'
- `POST /api/quotes` → checks `standard` or `complex` based on quote type
- `POST/DELETE /api/shared/rfq-tracker/{audit,attachments}` → `rfq-tracker`
- `POST/DELETE /api/shared/sample-tracking/{audit,attachments}` → `sample-tracking`

**When adding a new tab**:

1. Add its id + label to `_tab_catalog` in `Library/PermissionGroups/groups.json`
2. If the tab has a write endpoint, apply `requireTabAccess('<tab-id>')` in the route
3. Wrap any new tab component render with `<AccessGate tabId="<tab-id>">` (already done centrally in `CostModule.jsx` for all cost tabs — only needed if the tab lives outside CostModule)

**Seed groups** (non-removable system group + 7 defaults):

- `all_access` (sys-gated fallback), `leader_default`, `sales_default`, `cs_default`, `npi_default`, `purchasing_default`, `production_default`, `quality_default`.
  Operators can Duplicate + Customize any seed; admins manage in **Settings → Account Control → Permission Groups**.

**Audit events logged** (via `audit()` → `server/data/Library/Users/audit_log.json`):

- `PG_CREATE`, `PG_UPDATE`, `PG_DELETE` — group lifecycle
- `DEPARTMENT_CHANGE`, `PERMISSION_GROUP_CHANGE` — per-user reassignment (auto-revokes active sessions so the new matrix kicks in on next login)
- `PG_CHANGE_REVOKE` — how many sessions were killed

**Users without `permission_group_id`** fall back to `edit` on every tab (backward-compat — existing quotes work unchanged). Migration is opt-in per user via the Users sub-tab dropdown.

## Go-live readiness (Sprint 10 audit, 2026-04-22)

Senior-auditor review ran across 9 dimensions — code quality, UI/UX consistency, accessibility, security, performance, i18n, error handling, deployment, tests. Full report at `4. CLAUDE OUTPUT/self-test-report.json`.

**Verdict: 72/100 — CONDITIONAL GO-LIVE.** Three P1 issues fixed this sprint:

| #    | Issue                                                                                          | Fix                                                                                                                                              | Files touched                                                                    |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| P1-1 | Sub-tab bars had no `role="tab"` / `aria-selected` — blind and keyboard-only operators blocked | Added ARIA roles + labels to StandardCalc, ComplexCalc, InkCalculator sub-tabs; TabBarOverflow now sets `role="tablist"` + Home/End keyboard nav | `StandardCalc.jsx`, `ComplexCalc.jsx`, `InkCalculator.jsx`, `TabBarOverflow.jsx` |
| P2-3 | No focus-visible ring on any button — keyboard users couldn't see where focus landed           | Global `:where(button, a, input, ...):focus-visible` rule added in `tokens.css`; 2 px outline in brand colour, dark-mode aware                   | `tokens.css`                                                                     |
| P2-4 | 28 raw `console.*` calls leaked internal state to prod bundle                                  | Added `utils/logger.js` with DEV-only `log/warn` + always-on `err`; `utils/apiTry.js` helper wraps API calls with toast + logger                 | `utils/logger.js`, `utils/apiTry.js`, `deadCode.lint.test.js`                    |

**Deferred to Sprint+1 (non-blocking, documented)**:

- Component-size refactor: PrintAreaCalc (1,971 L) + Settings (1,727 L) exceed the 500-L threshold. Performance OK under normal load; monitor on prod.
- i18n: ~40% of calc-tab strings still hardcoded (table headers, placeholders). Operators speak English; Vietnamese translations are nice-to-have.
- Windows remote deploy script. Linux `deploy.sh` works; bat-file in next cycle.
- Component memoization review: PrintAreaCalc has 18 `useCallback` but 1 `useMemo`; Settings has inline arrow functions triggering child re-renders.

**Known operational risks** (ops must know these):

- **TOTP key mismatch at boot locks out all users.** If the server restarts with a different `OPS_TOTP_KEY` env than last boot, all user 2FA secrets become undecryptable. Recovery: `npm run reset-totp` (re-enrolls every user). Deploy scripts (`deploy.sh`/`deploy.ps1`) now preserve the existing key across deploys (Sprint 11 P2-1); `npm run preflight` fails the pipeline if prod env is missing it.
- **Admin can delete all users / data without soft-delete.** `costApi.js` deletes are hard; backup is the only recovery. Always take a backup before any admin bulk action. Sprint 13 will add soft-delete + Trash tab.
- **~~`dataSync.js` caches legacy `window._VARNAME = {...}` files without schema validation.~~** **FIXED Sprint 11 P0-1.** Critical Library files (PermissionGroups, MachineProfiles, Rate tables) now validate via `server/services/librarySchema.js`; unknown keys are stripped in strict mode for auth-critical data. Rows failing schema are dropped with stderr log. Treat `Library/` as a trust boundary: even trusted operators can drop a malformed xlsx export, and schema validation keeps the server running.

## Lessons learned (patterns that kept biting us)

These are patterns this codebase specifically tripped on — save future sessions from re-learning them.

0. **Sprint claims in CLAUDE.md require commit SHAs.** Every "Sprint S-XXX shipped" or "landed" claim MUST cite the commit SHA on `main` that proves the work was committed. Format: `Sprint S-XXX shipped YYYY-MM-DD (SHA: <abc1234>)`. Date alone is insufficient — the S-INVENTORY-1 audit (2026-05-06) found that working-tree CLAUDE.md edits drifted ahead of code (e.g., Sprint S-RESP-1 referenced as shipped in Lesson 27 while the implementation sat uncommitted on local branches for days). SHA-tied claims are verifiable in 1 second via `git show <SHA>`; date-only claims must be cross-checked against a tree snapshot. Verification command (run pre-commit on any CLAUDE.md edit):
   ```bash
   grep -nE "shipped|landed [0-9]" CLAUDE.md | grep -v "SHA:" | grep -v "tests pass\b" || echo "PASS: all ship claims have SHAs"
   ```
   Some pre-import-commit lessons (S-FLEXO-1, S-COLLAPSE, S-PROJFIX) reference sprints whose code came in via the bulk `a8b559f chore: initial git repo` snapshot; those keep date-only references because pointing to the bulk SHA adds no forensic value.
1. **Dev vs prod surfaces serve different bundles.** `:5173/5175` (Vite HMR) auto-refreshes from source; `:3000` serves the dist bundle and NEEDS a rebuild. When a user reports "I don't see the change", always ask the URL first.
2. **Orphan-module lint is enforced.** New utility files must either be imported somewhere or added to `KNOWN_ORPHANS` in `deadCode.lint.test.js`. The lint runs as part of `npm test` and will fail CI.
3. **The xlsx training manuals drift from code.** When a user asks about formulas documented in `Use guide/CCL_Pricing_Training_EN_v3.3.xlsx`, trust `services/calcEngine.js` — not the xlsx. The 14 Sprint-9 audit corrections are all code-vs-xlsx drifts.
4. **Emoji characters in i18n regex need care.** Sidebar nav items render as `"◇Pricing (Std)"` (icon glued to label, no space). When matching, use `text.replace(/^[^a-zA-Z]+/, '').trim()` to strip icon prefixes, or allow the icon in the regex.
5. **Self-check harness is reusable** — run `node scripts/help/self-check.mjs` anytime to smoke-check every main tab. Requires demo user (`demo / demo1234`, role=user, TOTP off). It catches regex drift, console errors, page crashes, and aria-missing sub-tabs. Renamed from `self-test.mjs` in v1.3 GA so the `node --test` glob doesn't try to run it as a unit test.
6. **Inline `style={{...}}` is discouraged.** ESLint flags new inline-style usage as a warning (Sprint 11 quick win). The 5 worst offenders (PrintAreaCalc, Settings, InkCalculator, SubProductRow, Dashboard) are temporarily excluded while Sprint 12 migrates them. Don't add new inline styles — use a CSS class or hoist the literal to a `const` outside the render. This both improves theme/dark-mode support and keeps CSS cacheable across renders.
7. **Sub-agent claims need cross-validation.** Background-spawned audit agents will sometimes flag false-positives with very specific line numbers (e.g. "stored XSS in costApi.js:856"). Spot-check at least the P0 claims with `grep -n` before quoting them in user-facing reports — `dangerouslySetInnerHTML` audit caught one such hallucination during the 2026-04 audit.
8. **Schema-validate Library/\* on read, not on write.** `server/services/librarySchema.js` provides hand-rolled (zero-dep) row validators for permission groups, machine profiles, and rate tables. Strict mode strips unknown keys for auth-critical data; passthrough keeps them for forward-compat reads. Add a schema entry for any NEW Library file driving auth or pricing.
9. **Optimistic locking is opt-in.** `quotesStore.upsertQuote` checks `_version` only when the caller sends it. Server-to-server mutators (approval transitions, audit-log appends) omit it intentionally. The client tracks `activeQuoteVersion` alongside `activeQuoteId` in CalcContext and bumps it after each successful save. 409 responses carry `current` so the UI can show reload-vs-overwrite without a round-trip.
10. **Big shared modal primitives reduce drift fast.** Migrating 16 modals to `components/Shared/Modal.jsx` (with size/severity/responsive variants) collapsed ~1500 lines of one-off CSS + JS. Future dialogs MUST use this primitive — no more `.foo-modal-scrim` from scratch. Pattern: `<Modal open size="md" severity="info"><Modal.Header title="…"/><Modal.Body>…</Modal.Body><Modal.Footer><button className="op-btn op-btn-primary">…</button></Modal.Footer></Modal>`. Drawer-style side panels (RFQTracker, SampleTracking) are a different UX — Sprint+ should add `<Drawer>` primitive separately.
11. **Responsive design with `clamp()` + container queries beats media-query soup.** Prefer `font-size: clamp(min, fluid, max)`, `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`, and `@container (max-width: 500px)` over `@media`. Form grids that adapt to **modal width** (not viewport width) work consistently regardless of where they render.
12. **Migrating callbacks must be kind-aware in shared components.** `ProcessFlowChart` had a hidden bug where edit callbacks hardcoded `cplxState`/`setCplxField`. When generalising a component for multiple state slices, add a `kind` prop and route ALL state writes through `kind === 'std' ? setStdField : setCplxField`. Test by editing in both calculator types in the same session.
13. **Adding new SERVER routes requires `kill + restart` of the :3000 node process.** The "After every UI/client-code change" checklist Step 4 covers this but it's easy to miss when you "only edited a route file". Symptom: client calls the new endpoint, server returns generic Express 404 ("Not Found"), and you think the route is broken when actually the old process never loaded it. Always restart node after touching `server/**`. Verify with: `pgrep -fl "node.*server/index.js"` then check the start time vs your edit time.
14. **`upsertQuote` is insert-or-update by ID** — passing a never-seen id creates a NEW row, not an error. When writing routes that mutate "an existing quote" (trash, restore, transition), explicitly `getQuoteById(id)` first and return 404 if missing. Without that guard, the route silently creates ghost records (the bug fixed alongside Sprint 13 soft-delete).
15. **Excel-source formulas may have systemic bugs** — Sprint 14d audit found `Gallus_Design_Calculator_RL.xlsx` divides production stride by RAW pitch instead of (pitch − K). The xlsx Legend even documents K as "vùng cylinder không in" (unusable plate zone) but its formula treats K as a Film % display metric, not a constraint. When porting a spreadsheet calc to code: validate the formula against the physical model, not just the cell text. Helper signature `(pitch, L, G, K = 0)` keeps legacy K=0 callers green while new callers opt-in to physically correct math.
16. **Suggest cylinder via `Math.round`, not `Math.ceil`** — for plate cylinder (where over-pitch fattens the gap by full tooth-pitch increments), nearest-integer is always operationally better than ceiling. `Math.ceil(85.0016)=86` produces a +3.17 mm pitch overshoot when 85T would only undershoot by 0.005 mm. Ceiling is only correct when over-target is a HARD constraint (rare for plate cyl; sometimes true for die-cut step matching).
17. **Never round values pushed through cross-tab sync** — operators specifically want raw float precision when pulling a saved design (e.g. min_gap_md = 7.225, not 7.23). The 0.005 mm rounding can land outside the calc's tolerance band on the receiving side. Rounding only at DISPLAY time (`.toFixed(3)`) is fine; rounding the underlying value persisted/transferred breaks the round-trip.
18. **Sub-tab unmount loses local state — use sessionStorage, not Context, for working drafts** — Pricing tabs use sidebar-level `activeTab` to swap lazy components, so each tab unmounts on switch. `useState(makeDefault())` resets every remount. The `usePersistentInputs` hook in DesignTools/ wraps useState + sessionStorage with merge-over-defaults rehydration so a schema bump (new field added later) doesn't crash old persisted state. Use sessionStorage for drafts (clear on browser close), localStorage for cross-session prefs (e.g. compass-card open/closed), server-side history for retrievable records.
19. **Bidirectional handoff: `pendingQuote` + `'rfq-sync'`** — both StandardCalc.jsx and ComplexCalc.jsx have a useEffect that watches `pendingQuote.type === 'rfq-sync'` and merges `pendingQuote.data` into stdState/cplxState top-level fields. When adding a NEW push source (Sprint 14e: Design Tools "Apply to Pricing"), reuse this contract; don't invent a new type. Adding a new type requires ALL receivers to handle it, easy to miss one and silently break the flow.
20. **Soft-delete UX needs a Trash bin** — server soft-delete by itself is invisible to operators; without a Trash UI they can't restore. Sprint 13 added the API; Sprint 13 UI (post-Sprint 14) added the modal in QuoteHistory. Pattern: button in tab header → modal → list of trashed records with Restore + (sys-only) Purge. `?trashed=1` query on the list endpoint is the bin source.
21. **Standard's `aliasMap={{ end_cu: 'project' }}` lies about which state field stores End Customer** — `client/src/modules/cost/tabs/StandardCalc/CalcHeader.jsx` aliases the End Customer input to `state.project` to preserve legacy quote shape. Quote History reading `s.project` for the "Project" column (Sprint S-PROJFIX 2026-04-29 fix) silently displayed End Customer text instead. The canonical Project lives in `state.project_name`. ALWAYS read `s.project_name` for project data and `s.end_cu || s.project` for End Customer to handle both Standard (alias) and Complex (no alias) quotes consistently.
22. **Bleed margin is non-optional for flexo cylinder selection** — Sprint S-FLEXO-1 (2026-04-29) added `bleed_mm` to `gallusEngine.createGallusInputs()` defaulting to 2 mm/side. Trim spec ≠ print footprint: a 60 mm Pw with 2 mm bleed actually prints at 64 mm. Cylinder ranking uses `effectiveL()` and `effectivePw()` so N_down + n_across reflect the print footprint, not the trim. Tests covering K-aware regressions (Sprint 14d) had to be updated to set `bleed_mm: 0` explicitly to preserve their original test intent.
23. **Z_die without `print_z` reference is unverifiable** — Sprint S-FLEXO-1 added a Z_die ↔ print_z multiple check inside `validateInputs`. Print cylinder Z is only known AFTER `rankPrintCylinders` runs and the operator's top-1 emerges, so GallusCalc passes `{ ...inputs, print_z: top5[0]?.z }` to validateInputs. When you add validations that depend on calc output, do the same — don't accept a partial input shape and silently skip the check.
24. **Magnetic die min lane gap is 1.5 mm, not 1.0 mm** — Sprint S-FLEXO-1 changed `HARD_MIN_GAP_MM` from 1.0 to 1.5 (rotary magnetic blade width 0.7 + 0.3 mm tolerance/side). Laser dies can take 0.3 mm; flat dies need 2.0 mm. The new `DIE_MIN_GAP_MM` lookup table makes this configurable per die-cut technology. Older audits that asserted "lane_gap 1.0 mm is OK" were physically wrong — chips kẹt giữa lanes on long runs.
25. **Native modules + paths with spaces = `electron-builder` fails on rebuild** — `/Volumes/Macintosh Data/...` breaks node-gyp's makefile generation for `node-hid` + `serialport` (see node-gyp issue #65). Use `--config.npmRebuild=false` to skip rebuild during `electron-builder` (existing native binaries from `npm install` are reused). The DMG ships fine because the binaries packaged into `app.asar.unpacked/node_modules/**` were already compiled at install time. Don't fix this with workspace move unless the user has time to relocate the project tree.
26. **Sidebar collapse persistence key matters per-feature** — Sprint S-COLLAPSE (2026-04-29) added section-level collapse via `localStorage` key `opsctl.sidebar.section-collapsed.v1`. The mini-collapse (240px ↔ 64px rail) used different keys in v1.3. Don't reuse one key for two semantically different collapse states or operators lose either preference when the other one toggles.
27. **Fluid container + container queries beat viewport media queries for cards/grids** — KPI tiles và breakdown panels phải responsive theo CONTAINER width (sidebar collapse/expand, panel resize) chứ không phải viewport. Pattern: wrap với `container-type: inline-size`, dùng `@container (min-width: …)`. Cho root container, dùng `max-width: min(2400px, calc(100vw - 48px))` thay vì hard cap `1440px` — màn 27"/4K/ultrawide không còn dải trắng 400-600px mỗi bên. Browser baseline yêu cầu Chrome 105+/Safari 16+ (đủ cho Electron 41 + web access trình duyệt mới). **Reference impl**: QuoteAnalysis + Dashboard (Sprint S-RESP-1 shipped 2026-05-06, SHA: `d4f5894`). Khi sprint sau touch Cost Breakdown / Quote History / Settings, pull pattern này theo (giống approach Sprint 12 inline-style migration). Companion patterns: fluid typography via `clamp(min, vw-component, max)` cho KPI numbers, sticky filterbar via `position: sticky` + IntersectionObserver toggle `.is-pinned` class (Carbon Tearsheet pattern), print rules `@page { size: A4 landscape }` để report fit landscape khi Cmd+P.

## Recovery playbook

### "All users are locked out of 2FA"

```bash
# On the server where the bad OPS_TOTP_KEY was set:
cd "3. PROJECTS/Ops Control"
# Option A (preferred): restore the previous OPS_TOTP_KEY from .env backup
# Option B: re-enroll every user
OPS_TOTP_KEY=$(new_key) node scripts/reset-totp.js
# Users will be prompted to scan a new QR on next login.
```

### TOTP key rotation runbook (Sprint 13)

**The default policy is: NEVER rotate `OPS_TOTP_KEY`.** Every encrypted
2FA secret in `Library/totp/secrets.json` is keyed against this value;
rotating it without a coordinated re-enrollment locks every user out.
When in doubt, leave it alone — `deploy.sh`/`deploy.ps1` automatically
preserve the existing key across deploys.

**When rotation is genuinely required** (suspected key disclosure,
compliance mandate, post-incident hygiene):

1. **Schedule a maintenance window** (≥30 minutes). Notify all users
   via Slack/Teams that they'll need to re-enroll their authenticator
   apps. Without this notice, users see "Invalid code" with no
   explanation.

2. **Capture the OLD key** before changing anything:

   ```bash
   ssh user@host "grep OPS_TOTP_KEY /opt/ops-control/.env"
   # Store this somewhere safe in case rollback is needed.
   ```

3. **Generate the NEW key**:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Must be exactly 64 hex chars. Server's preflight rejects shorter.

4. **Stop the server** to prevent in-flight TOTP verifications from
   landing on a half-rotated state:

   ```bash
   ssh user@host "systemctl stop ops-control"   # Linux
   # OR: nssm stop ops-control                   # Windows
   ```

5. **Wipe the encrypted secrets file**:

   ```bash
   ssh user@host "mv /opt/ops-control/server/data/Library/totp/secrets.json{,.before-rotation}"
   ```

   The `.before-rotation` backup lets you roll back if step 6 fails.

6. **Update `.env`** with the new key:

   ```bash
   ssh user@host "sed -i 's|^OPS_TOTP_KEY=.*|OPS_TOTP_KEY=$NEW_KEY|' /opt/ops-control/.env"
   ssh user@host "chmod 600 /opt/ops-control/.env"
   ```

7. **Start the server** + verify boot probe:

   ```bash
   ssh user@host "systemctl start ops-control && journalctl -u ops-control -n 20"
   # Look for: "🔐  TOTP boot probe OK — 0 user(s) enrolled, key fp …"
   ```

   The probe says 0 enrolled because the secrets file was wiped.

8. **First user to log in** re-enrolls automatically — login-with-2FA
   sees `enrollment_required: true` and shows the QR-code dialog. They
   scan + verify, server stores the new encrypted secret, login completes.

9. **Confirm rotation success** after first 5 users have re-enrolled:

   ```bash
   curl -s http://host:3000/health
   ssh user@host "ls -la /opt/ops-control/server/data/Library/totp/secrets.json"
   # Size should grow as users re-enroll. If it stays 0, the boot probe
   # is fine but writes are failing — check disk perms.
   ```

10. **Roll back if needed** (within 1 hour, before users re-enroll):
    ```bash
    ssh user@host "systemctl stop ops-control"
    ssh user@host "mv /opt/ops-control/server/data/Library/totp/secrets.json.before-rotation /opt/ops-control/server/data/Library/totp/secrets.json"
    ssh user@host "sed -i 's|^OPS_TOTP_KEY=.*|OPS_TOTP_KEY=$OLD_KEY|' /opt/ops-control/.env"
    ssh user@host "systemctl start ops-control"
    ```
    After users have re-enrolled with the new key, rollback is no
    longer safe — those users would lose access on the old key.

**Audit trail:** Every TOTP enrollment + verification is logged to the
audit log (`PG_CHANGE_REVOKE`, `LOGIN_TOTP_OK`, `TOTP_ENROLL`). Use
this to confirm post-rotation that all expected users re-enrolled
within the maintenance window.

### "All data gone after a restore"

Backups are at `server/data/Library/**/*.backup.*` and `Backup & restore/`. Restore is OVERWRITE, not merge — the audit trail for who triggered it lives in `server/logs/`.

### "npm run build fails at prebuild"

The prebuild hook runs Word-doc generators. If any fails, the build aborts. Check `scripts/help/build-all-docs.mjs` — common failure is missing `docx` dep (install: `npm install --save-dev docx`) or a corrupt `client/src/help/content.js`.

### "All admin / sys users lost access" (Sprint 1.7)

Web UI requires an existing sys session to mint a sys user — chicken-and-egg if every sys/admin account is deactivated, deleted, or locked. Console-only escape hatch:

```bash
ssh user@server
cd /opt/ops-control            # or wherever DATA_DIR points
node scripts/recover-sys-user.js
# Type CONFIRM-RECOVER at the prompt
# Choose [1] reset existing user OR [2] create "recovery-sys" user
# Script prints temp pwd ONCE — copy it before closing the terminal
```

The new (or reset) account is `role=sys`, `must_change_password=true`, `2FA cleared`. Login forces a pwd change immediately. Audit row `SYS_RECOVERY` is appended for forensic trace; review it weekly.

**Filesystem prerequisite**: `chmod 600 server/data/Library/Users/users.json` so only the deploy user can run the script. Anyone with shell access to the data dir can mint a sys user — that's by design (otherwise recovery is impossible) but means the OS account is the trust boundary.

### "Bad deploy — need to roll back" (Sprint 1.7)

`deploy.sh` now snapshots the live `/opt/ops-control` to `/opt/ops-control/releases/<timestamp>/` BEFORE rsyncing the new release. To roll back:

```bash
ssh user@server
sudo systemctl stop ops-control
ls /opt/ops-control/releases   # pick the previous snapshot
PREV=20260427-101530           # eg. immediately before the bad deploy
cd /opt/ops-control
# Restore in-place — the snapshot mirrors the same subtree shape
cp -R releases/$PREV/server releases/$PREV/client releases/$PREV/scripts ./
cp releases/$PREV/package.json releases/$PREV/package-lock.json ./
sudo systemctl start ops-control
journalctl -u ops-control -n 30   # confirm clean boot
```

`server/data/` is intentionally NOT versioned (data accumulates across releases — never want to time-travel it). If the bad deploy corrupted data, restore from the nightly SQLite backup at `server/data/Backup/` per "All data gone after a restore" above.

Retention: deploy.sh keeps the **5 most recent snapshots**. Disk fill is unlikely with 5 × ~150 MB.

### "Bare-metal restore — disk dies / fresh box" (Sprint 1.7)

When the server hardware/disk is gone:

```bash
# 1. Provision the new box (same OS family, same Node version per CLAUDE.md).
# 2. Install Node 20.x + npm.
# 3. Pull the off-site backup. By default deploy.sh / backup-offsite.sh
#    syncs nightly to the rsync target in OPS_BACKUP_OFFSITE_DEST.
sudo mkdir -p /opt/ops-control
sudo chown $USER /opt/ops-control
rsync -avz user@offsite:/var/backups/ops-control/latest/ /opt/ops-control/

# 4. Restore the .env (this MUST include OPS_TOTP_KEY from the previous
#    install — see TOTP key rotation runbook above).
cp /opt/ops-control/.env.backup /opt/ops-control/.env
chmod 600 /opt/ops-control/.env

# 5. Install deps + run preflight.
cd /opt/ops-control
npm install --production
NODE_ENV=production npm run preflight   # MUST pass

# 6. Start the service.
sudo systemctl enable --now ops-control
journalctl -u ops-control -f             # watch for "🔐 TOTP boot probe OK"
```

**RPO** (Recovery Point Objective): 24h (nightly backup). For tighter RPO, increase `OPS_BACKUP_SCHEDULE` frequency or add inotify-driven WAL shipping.
**RTO** (Recovery Time Objective): ~2h on a pre-provisioned hot-spare (just rsync + start), ~6h cold (fresh box install).

Document the off-site target machine, its credentials, and the restore drill checklist in `MAINTAINERS.md` — update it whenever the off-site rotates. Quarterly drill: time the full sequence, fix any documentation gap revealed.

## MES-3 Backlog

> 10 follow-up tickets surfaced during Sprint MES-2 build phase + post-tag e2e harness hotfix. Two P1s (KIOSK-003 + KIOSK-006b) must lead MES-3 sprint scope to close data-integrity and deploy-automation gaps. KIOSK-008 is the sprint-exit smoke blocker that landed too late for the v1.4.1 tag — investigate first thing in MES-3 since it likely unblocks the Playwright suite with a small fix.

### Recommended MES-3 v1 scope (4 tickets)

KIOSK-003 (P1, L), KIOSK-006b (P1, S), KIOSK-002 (P2, M), KIOSK-004 (P2, M). Total ~3 weeks of work assuming MES-2 pace. Closes both P1s + the operationally-visible reason-code admin gap + the Vitest coverage gap on kiosk components.

### MES-3.5 polish scope (20 tickets)

MES-3-FIX-1 (P2, S), MES-3-FIX-2 (P3, S), MES-3-FIX-3 (P3, S), MES-3-FIX-4 (P2, S), MES-3-FIX-6 (P3, S), MES-3-FIX-7 (P3, S), MES-3-FIX-8 (P2, S), MES-3-FIX-9 (P3, XS), MES-3-FIX-10 (P3, S), MES-3-FIX-11 (P3, M), MES-3-FIX-12 (P3, S), MES-3-FIX-13 (P2, S), MES-3-FIX-14 (P2, S), MES-3-FIX-15 (P2, S), MES-3-FIX-16 (P3, S), KIOSK-001 (P3, S), KIOSK-005a (P3, S), KIOSK-006a (P3, L), KIOSK-007 (P3, M), KIOSK-008 (P2, S). Total ~3 weeks. Wraps RFC-7807 compliance fix + Accept-endpoint contract test + audit detail JSON normalization + dev-host Node ABI sync + 10 v1.4.3 audit follow-ups (FIX-6..15) + branded icons + dedicated audit endpoint + health dashboard + Playwright DOM port + sprint-exit smoke blocker.

> **Numbering note**: MES-3-FIX-5 (Cost Engineer preset 403 / Create-user form modules.cost gap) was raised verbally in the v1.4.3 verify session but never filed; reserved for future ticket entry. v1.4.3 audit (2026-05-02) added FIX-6 through FIX-15.

KIOSK-008 should be tackled FIRST in MES-3.5 because it's the gating fix for the Playwright happy-path spec — until it's resolved, the e2e harness (otherwise structurally fixed by the post-tag hotfix at commit `0bb9c93`) can't actually report green.

### Tickets

For each, write 5 fields: ID, title, source, acceptance, effort, priority.

#### MES-3-FIX-1 — wo-terminal-edit body.status field collision

- **Source**: MES-2.3 helper-extraction roll-back; latent bug discovered when respondError() destructure shadowed RFC-7807 reserved status field with the BmesError payload's wo.status string.
- **Acceptance**: rename BmesError payload field from `status` to `wo_status`, lift respondError() in workOrderV2.js per Patch N2 protocol (run all 40 MES-1.4 contract tests pre/post; halt on any fail), add 1 new test asserting body.status is integer 409 (not string state name).
- **Effort**: S (~50 LOC + 1 new test)
- **Priority**: P2 (RFC-7807 compliance gap; operationally invisible because no current client reads body.status, but technically non-compliant wire format)

#### MES-3-FIX-2 — acceptOperation.contract.test.js coverage

- **Source**: B-ship of Accept button (2026-05-02) added /accept route to operationV2.js but didn't ship a contract test. Harness wiring fixed inline same branch (FIX D — `_operationsHarness.js` now passes a stub `auth` middleware so router construction doesn't throw on the new role-gated route); test file still net-new.
- **Acceptance**: write `domains/planning/tests/integration/contracts/acceptOperation.contract.test.js` asserting (a) DONE → ACCEPTED transition returns 200 with updated op shape including planned_start, (b) audit emit OP_ACCEPT with wo_id in detail JSON (verify via `/audit/timeline?wo_id=`), (c) idempotent re-POST with same Idempotency-Key returns 200 without double-writing audit, (d) state-machine rejects non-DONE → ACCEPTED transitions with 409 + RFC-7807 body.
- **Effort**: S (~80 LOC, ~5 tests)
- **Priority**: P3 (manual UI verify covered happy path on this ship; coverage gap matters for KIOSK-003 cascade work in MES-3 which will need the harness already fixed)

#### MES-3-FIX-3 — Normalize LOGIN\_\* audit detail to valid JSON

- **Source**: STEP 1 verify of Accept-button branch (2026-05-02) — guarded `json_valid(detail)` in audit timeline query exposed the underlying problem: `LOGIN_OK` writes `detail=''` and `LOGIN_FAIL` writes plain-text reasons (e.g. `"bad password"`). Violates audit_log convention that `detail` MUST be valid JSON for `json_extract` filters to work. Read-side guard mitigates but doesn't fix.
- **Acceptance**: grep `server/routes/auth*` + `server/services/auth*` for every `audit('LOGIN_OK', ...)` / `audit('LOGIN_FAIL', ...)` callsite; replace with `audit('LOGIN_OK', JSON.stringify({ user_id, ip }))` and `audit('LOGIN_FAIL', JSON.stringify({ user_id, ip, reason }))`. Backfill optional (don't rewrite history). Add lint test asserting every `audit(...)` second arg is either omitted or a JSON.stringify call (regex-based).
- **Effort**: S (~30 LOC + 1 lint test)
- **Priority**: P3 (read-side guard already prevents prod 500; matters for forensic-replay tooling that expects uniform JSON shape)

#### MES-3-FIX-4 — Switch host Node to v24 to match Electron ABI

- **Source**: STEP 1 verify (2026-05-02) — `desktop:dev` rebuilds `better-sqlite3` against Electron's bundled Node 24 (NODE_MODULE_VERSION 145), then host CLI Node 20 (NODE_MODULE_VERSION 115) can't load the binary. Every alternation between `desktop:dev` and `npm test` triggers `npm rebuild`. Documented as CLAUDE.md lesson 25 at file-system level (paths-with-spaces); ABI mismatch is a separate, more subtle root cause.
- **Acceptance**: document as CLAUDE.md lesson 27 ("Electron + CLI Node version sync"); update bare-metal restore section to specify Node 24; add `.nvmrc` at repo root with `24`; install fnm/nvm guidance in MAINTAINERS.md or `docs/onboarding.md`.
- **Effort**: S (docs + 1 `.nvmrc` commit)
- **Priority**: P2 (rebuild churn between `desktop:dev` and `npm test` happens daily on this branch; promoting eliminates the per-context-switch friction)

#### MES-3-FIX-6 — Idempotency-Key cache per-button-instance for Accept

- **Source**: v1.4.3 audit F-04 (P3). `client/src/modules/planning/v2/api.js:145` comment claims "retry naturally generates new key" but defeats idempotency contract — fast double-click creates 2 distinct UUIDs, server cannot dedupe, state-machine guard catches second click as 409 (confusing UX).
- **Acceptance**: cache `pendingKey` in a ref keyed by `opId` in `WorkOrderOpsTable`, clear on success or 4xx error. Replay same key on retry within window. Update api.js comment to reflect new behaviour.
- **Effort**: S (~10 LOC + 1 test asserting double-click within 1s sends same key)
- **Priority**: P3 (race window narrow because optimistic flip hides button quickly; UX papercut not data-corrupting)

#### MES-3-FIX-7 — Surface RFC-7807 body fields in Accept error inline

- **Source**: v1.4.3 audit F-05 (P3). `WorkOrderOpsTable.jsx:34` `setError(e.message)` discards `e.body`'s `allowed_from` + `from`. Planner sees bare detail string instead of "DONE expected, op is now CANCELLED" type guidance.
- **Acceptance**: extend error display to surface `body.allowed_from` + `body.from` when present, fallback to `e.message`.
- **Effort**: S (~5 LOC)
- **Priority**: P3

#### MES-3-FIX-8 — Apply requireTabAccess('work-orders') to /accept + workOrderV2 batch

- **Source**: v1.4.3 audit F-06 (originally P3, promoted P2). New `/accept` route follows existing `workOrderV2.js` convention of skipping `requireTabAccess` (deferred Sprint SU per file comment), but accumulating new mutation routes without tab-access middleware is technical debt vs CLAUDE.md "Server enforcement (defense-in-depth)" pattern.
- **Acceptance**: audit ALL mutation routes in `domains/planning/server/routes/operationV2.js` + `workOrderV2.js` + any v2 router; add `requireTabAccess('work-orders')` after the role gate consistently. CSRF + role + state-machine guards remain; tab-access is the additional defense layer.
- **Effort**: S (~15-20 LOC across files)
- **Priority**: P2 (promoted from P3 because each new mutation route adds inconsistency surface; batch fix in dedicated permission-audit sprint)

#### MES-3-FIX-9 — Extract csrfHeaders helper from services/api.js

- **Source**: v1.4.3 audit F-08 (P3). `client/src/modules/planning/v2/api.js:17-43` duplicates `readCsrfCookie()` + `csrfHeaders()` inline (acknowledged in file comment). Hotfix-time inline was correct under deploy pressure; future drift risk.
- **Acceptance**: export `csrfHeaders` from `client/src/services/api.js`, import in v2 `api.js`, remove the duplicate.
- **Effort**: XS (~10 LOC change)
- **Priority**: P3

#### MES-3-FIX-10 — Extract loadOpOr404 helper for operation routes

- **Source**: v1.4.3 audit F-09 (P3). `/accept` route in `operationV2.js:288-309` inlines integer-parse + `repo.findOpById` + RFC-7807 envelope work. Different middleware chain from `preludeForMutation` (no kiosk-machine check) but the parse/find/error trio could be shared.
- **Acceptance**: extract `loadOpOr404(req, res)` helper consumable by both kiosk and planner mutation routes.
- **Effort**: S (~15 LOC refactor + tests)
- **Priority**: P3

#### MES-3-FIX-11 — Refresh Help system for MES-1/2 v2 work-orders surface

- **Source**: v1.4.3 audit F-10 (P3). `client/src/help/content.js:5920-5970` `work-orders` entry describes pre-MES-1 imagined flow ("Generate Work Orders → print routing cards"). MES-1 v2 surface (Create / Release / Cancel modals, Audit Timeline, Accept button) undocumented in user-facing help.
- **Acceptance**: rewrite `work-orders` entry per MES-1 v2 actual UI; add Accept-button section. Capture screenshots per CLAUDE.md screenshot capture protocol. Re-run `node scripts/help/build-user-guide.mjs` to refresh `OpsControl_UserGuide.docx`.
- **Effort**: M (~80 LOC + screenshot capture, manual)
- **Priority**: P3

#### MES-3-FIX-12 — Document canonical source-of-truth for dual-storage entities

- **Source**: v1.4.3 audit F-11 (P3). Cross-list of JSON `Library/` vs SQLite tables shows 4 overlaps: `IFS_Inventory` ↔ `ifs_inventory`, `RFQTracker` ↔ `rfq_tracker`, `Routing_Operations` ↔ `routing_operations`, `SampleTracking` ↔ `sample_tracker`. Pattern may be intentional (read-from-both, write-to-one) but no audit memo documents canonical source per pair.
- **Acceptance**: add `docs/dual-storage-audit.md` enumerating each pair, the canonical source, the read fallback chain, and any sync mechanism. Cross-link from CLAUDE.md.
- **Effort**: S (~1 hour investigation + docs)
- **Priority**: P3

#### MES-3-FIX-13 — kiosk OpDetail optimistic-revert with snapshot fallback

- **Source**: v1.4.3 audit, `stash@{0}` portion. `apps/kiosk/src/routes/OpDetail.jsx` replaces `refresh()` fallback with `prev` snapshot. Refresh pulls `/dispatch` which only lists DISPATCHED ops, so non-DISPATCHED op orphans the UI on bad optimistic state. Snapshot is authoritative. Related to KIOSK-008 investigation.
- **Acceptance**: pop relevant portion of `stash@{0}`, ship as standalone fix branch.
- **Effort**: S (~5 LOC, already drafted)
- **Priority**: P2 (kiosk UX bug, KIOSK-008-adjacent)

#### MES-3-FIX-14 — server HSTS gate for embedded desktop HTTP-only mode

- **Source**: v1.4.3 audit, `stash@{0}` portion. `server/index.js` HSTS + `upgrade-insecure-requests` gate behind `OPS_ALLOW_SAME_ORIGIN` env. Safari WebKit upgrades `127.0.0.1:3100` asset URLs to `https` → bricks embedded kiosk.
- **Acceptance**: pop relevant portion of `stash@{0}`, ship as desktop hardening branch.
- **Effort**: S (~12 LOC, already drafted)
- **Priority**: P2 (Safari-specific but desktop kiosks affected)

#### MES-3-FIX-15 — desktop kiosk-key persistence + better-sqlite3 12 bump

- **Source**: v1.4.3 audit, `stash@{1}`. Without kiosk-key persistence fix, every Electron restart invalidates kiosk pairings. better-sqlite3 12 bump aligns with Electron Node 24 ABI (related to MES-3-FIX-4).
- **Acceptance**: pop `stash@{1}`, ship as desktop branch alongside Electron Node 24 alignment work.
- **Effort**: S (changes already drafted)
- **Priority**: P2 (operationally felt — kiosks unpair on app restart)

#### MES-3-FIX-16 — Extend seed:mes to populate orders entity for BOMExplosion verify path

- **Source**: v1.5.0 SHIP-FIRST UI verify session (2026-05-02). `scripts/seed-mes-fixtures.js` only creates rows in `work_order` (the MES v2 entity); the older `orders` entity that BOMExplosion / MaterialCheck / WorkOrdersLegacy read from stays empty after seed. Manual W3 (All-Orders Stacked BOM breakdown) walkthrough was UNVERIFIABLE on a freshly-seeded dev box because BOMExplosion `useEffect` `planningApi.getOrders` returns `[]` → no orders to explode → empty stacked view.
- **Acceptance**: extend `scripts/seed-mes-fixtures.js` to also `POST /api/planning/orders` (or write directly to the orders backing store) for each fixture, using a real ccl_pn that has both BOM + routing rows in `Library/`. Pick top candidate `80644500` (10 routing ops, 9 BOM rows, mixed Hours + Units/Hour modes — ideal for cross-feature verify). Fixture should remain idempotent (skip if order already exists for that productCode).
- **Effort**: S (~30 LOC + 1 lookup helper for "find a real PN with both"; reuse the cross-reference script from the audit session)
- **Priority**: P3 (verify-path enhancement, not a feature regression; W1 + W2 + W4 still verifiable on real data; W3 only blocks if dev box is fresh AND operator hasn't manually entered orders)

#### KIOSK-001 — Real branded PWA icons

- **Source**: MES-2.6a placeholder icons (Carbon-blue squares with white "K", zlib-encoded inline)
- **Acceptance**: 192/512/180 px PNGs from CCL Vietnam brand; replace placeholders in apps/kiosk/public/; verify Lighthouse PWA audit ≥90 on the kiosk shell; document brand-asset source in MAINTAINERS.md
- **Effort**: S (asset swap + Lighthouse run)
- **Priority**: P3 (operators don't care about icon aesthetics; PWA install prompt looks more polished with branded icons)

#### KIOSK-002 — Reason-code admin CRUD UI

- **Source**: PRD §16 R5 deferral; MES-2 ships seed-only with 8 reason codes; MES-2.6b GET /v2/reason-codes endpoint already exposes the data
- **Acceptance**: Library/ tab "Reason Codes" with create/edit/disable (no hard delete — sets active=0); audit emit per CRUD action (REASON_CODE_CREATE / UPDATE / DISABLE); EN+VN parity enforced; pause endpoint validates against active=1 only (already does in MES-2.4)
- **Effort**: M (~250 LOC: tab + 3 modals + API + i18n)
- **Priority**: P2 (operators currently must SQL-edit Library/ to add a 9th code; per-line filtering still deferred to MES-4)

#### KIOSK-003 — WO-level lifecycle cascade

- **Source**: PRD §16 Q3; MES-2 doesn't implement WO-level cascade when all ops reach ACCEPTED, nor does WO_CANCEL cascade to op CANCELLED status
- **Acceptance**: composite ticket — (a) op state machine adds CANCELLED state + edge `* → CANCELLED` on event 'wo_cancel', (b) workOrderService.cancelWorkOrder cascades to set all child ops to CANCELLED in same db.transaction, (c) when all ops on a WO transition to ACCEPTED, WO automatically transitions to its next state per FR (review with Thiep before implementing), (d) audit emit for every cascade write
- **Effort**: L (~400 LOC + ~30 tests)
- **Priority**: P1 (data-integrity gap; planner can currently cancel a WO with running ops, leaving op rows in inconsistent state)

#### KIOSK-004 — Vitest harness for kiosk components

- **Source**: MES-2.6a/b deferral; agent's KIOSK-004 acknowledgment in commit body
- **Acceptance**: Vitest config in apps/kiosk/; unit tests for ReasonPicker (8-tile render + select), DispatchList (sort order + empty state + last_pulse_at staleness), OpDetail (6 status branches + optimistic dispatch), ConnBadge (3-state transitions), queue.js (enqueue + flush + exp-backoff + cap), api.js (RFC-7807 parser + 401 recovery)
- **Effort**: M (~300 LOC + ~50 tests)
- **Priority**: P2 (Playwright covers happy-path + offline; unit gaps are error-state edges and component-level invariants)

#### KIOSK-005a — Dedicated /v2/audit/queue-evict endpoint

- **Source**: MES-2.6b deferral; localStorage 'opskiosk.evicted_count' is the only forensic trail until this lands
- **Acceptance**: kiosk POSTs evicted entries on next online via dedicated endpoint; server writes QUEUE_EVICT audit row per entry with kiosk_session_jti + original Idempotency-Key + age-at-eviction; localStorage counter clears on successful upload; rate-limited (10 entries / minute / kiosk)
- **Effort**: S (~80 LOC server + ~30 LOC kiosk)
- **Priority**: P3 (current console.warn + counter is acceptable for low-volume; matters more once kiosks scale to 50+)

#### KIOSK-006a — Kiosk health dashboard

- **Source**: agent's MES-3 backlog
- **Acceptance**: planner SYSTEM › Kiosk Health tab; per-kiosk view of last_seen, replay rate (count idempotency_ledger entries with same key in last 24h), permanent failure count (from kiosk-side queue + KIOSK-005a audit), latency p50/p95 from /dispatch sampling; sparkline charts for last 24h activity
- **Effort**: L (~500 LOC: tab + chart lib integration + 3 server queries + i18n)
- **Priority**: P3 (operationally useful but not blocking; ops can debug via raw audit_log queries today)

#### KIOSK-006b — groups.json idempotent migration script

- **Source**: MES-2.7 gap; server/data/Library/PermissionGroups/groups.json is gitignored (operator runtime data); MES-2.7 added 'kiosk-admin' tab catalog row + 7 group entries on dev only — production deploy doesn't propagate
- **Acceptance**: scripts/migrations/2026-XX-kiosk-admin-perms.js runs on first boot post-MES-2 deploy; reads existing groups.json; idempotent merge — adds kiosk-admin to \_tab_catalog if missing, sets kiosk-admin: edit on all_access + leader_default groups, sets hidden on the other 6 seed groups; preserves existing operator customizations; logs "kiosk-admin perms seeded" on first run, no-op on subsequent runs
- **Effort**: S (~80 LOC script + 10 LOC mountPlanning hook)
- **Priority**: P1 (otherwise admins assigned to non-default groups can't see kiosk-admin tab post-deploy until ops manually edits groups.json)

#### KIOSK-007 — Playwright DOM port of wo-create-flow.timed.test.js

- **Source**: MES-2.8 deferral
- **Acceptance**: rewrite domains/planning/tests/e2e/wo-create-flow.timed.test.js as DOM Playwright spec (apps/kiosk/tests/e2e isn't the right home; create domains/planning/tests/playwright/ or shared apps/desktop-tests/); verify ≤4 click budget for WO release flow; deprecate the Node-based contract smoke once Playwright spec is green for 7 days
- **Effort**: M (~150 LOC port + ~30 LOC fixture extension)
- **Priority**: P3 (current Node smoke catches ~80% of regressions; full DOM coverage is nice-to-have)

#### KIOSK-008 — Playwright happy-path: op-btn-pause disabled in SETUP state

- **Source**: Sprint-exit smoke after the post-v1.4.1 e2e harness hotfix (commit `0bb9c93`). All 3 specs now progress past fixture setup, render the kiosk PWA, and reach OpDetail — but fail at the Pause assertion with `getByTestId('op-btn-pause')` in DOM but `element is not enabled` after 232 Playwright retries.
- **Hypothesis** (unverified, MES-3 should confirm): the kiosk OpDetail.jsx state-branch mapping (DISPATCHED → "Start", SETUP → "Begin Run", RUNNING → "Pause") requires TWO transitions before Pause is enabled (DISPATCHED → SETUP via "Start" tap, then SETUP → RUNNING via "Begin Run" tap or implicit /scan). The happy-path spec at `apps/kiosk/tests/e2e/kiosk-happy-path.spec.js:31` likely taps "Start" once and immediately attempts "Pause", missing the "Begin Run" step. If true, fix is a 1-line spec adjustment OR a UX decision to auto-advance SETUP → RUNNING on first Start tap (not a 2-tap sequence).
- **Acceptance**: investigate root cause (spec bug vs product UX); if spec bug, add the missing "Begin Run" tap and re-verify happy-path wallclock stays under 60s; if product UX issue, decide whether to auto-advance SETUP → RUNNING on dispatch acceptance (changes state-machine semantics — review with product owner). Either fix path lands a green 3/3 e2e suite.
- **Effort**: S (likely 1-3 LOC spec fix; investigation 30-60 min)
- **Priority**: P2 (gates the e2e suite from reporting green; once fixed, the harness investment from MES-2.8 + the post-tag hotfix becomes operationally usable for ongoing regression testing)
