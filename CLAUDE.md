# Ops Control — Agent Playbook

# Agent working principles (read first)

> Behavioral guardrails for any agent (Claude Code / Antigravity) working in this repo.
> Distilled from Andrej Karpathy's notes on LLM coding pitfalls + battle-tested community
> practice, adapted to this project's existing conventions. These govern _how_ you work;
> the sprint history, lessons, checklists, and recovery playbooks in `CLAUDE.md` govern
> _what_ the system is and the exact steps to follow.

## Precedence

If anything here conflicts with `.agents/AUTO_EXECUTE.md`, another instruction file, or the
specific task you were given, **surface the conflict and ask** — do not silently pick a
side. In particular: the checkpoint-pause rule in principle 4 overrides any blanket
"run everything unattended" directive **unless** Henry has explicitly invoked
`.agents/AUTO_EXECUTE.md` for an approved upgrade in this session (see that file's dormant/opt-in
header).

---

## A. The four core principles

### 1. Think before coding

- State assumptions explicitly. If something is uncertain, ask rather than guess.
- When a request has more than one reasonable interpretation, present them — don't
  silently choose one and run with it.
- Push back when a simpler path exists, or when the request looks inconsistent with the
  codebase.
- When confused, name exactly what's unclear and stop. (Same spirit as Lesson 1 —
  "always ask which URL/surface first" before claiming a change is live.)

### 2. Simplicity first

- Write the minimum code that solves the stated problem. No features beyond what was
  asked, no abstractions for single-use code, no "flexibility" nobody requested.
- If 200 lines could be 50, rewrite it. Test: would a senior engineer call this
  overcomplicated?
- This does **not** loosen the rigor this repo already requires. Tests, defense-in-depth
  auth checks (`requireTabAccess`), schema validation on `Library/*` (Lesson 8), and the
  mandatory post-change checklist are **not** speculative — they stay. Simplicity is
  about the _shape of the solution_, never about skipping verification.
- Do NOT adopt a heavyweight end-to-end framework that "owns" the whole process — it
  hides bugs in the process itself. Prefer small, composable modes (Part B).

### 3. Surgical changes

- Touch only what the task requires. Don't "improve" adjacent code, comments, or
  formatting. Match the existing style even if you'd personally do it differently.
- Remove only the orphans **your** change created (now-unused imports/vars/functions) —
  consistent with the orphan-module lint in `deadCode.lint.test.js` (Lesson 2). Do not
  delete pre-existing dead code unless asked; mention it instead.
- Every changed line should trace directly back to the task.

### 4. Goal-driven execution with checkpoints

- Turn imperative tasks into verifiable goals: "write a test that reproduces the bug,
  then make it pass" beats "fix the bug"; "ensure tests pass before and after" beats
  "refactor X".
- For multi-step work, state a short plan with a verify step per phase:

  ```
  1. [Step] -> verify: [check]
  2. [Step] -> verify: [check]
  3. [Step] -> verify: [check]
  ```

  and **pause at each checkpoint** for confirmation before moving on. Do not execute the
  whole plan in one unattended pass (unless running under an explicitly-invoked
  `.agents/AUTO_EXECUTE.md` session).

- Definition of Done for any code change includes the existing
  **"After every UI/client-code change — MANDATORY checklist"** in `CLAUDE.md` (tests
  green -> rebuild -> restart node if `apps/server/**` was touched -> bundle self-check ->
  stale-chunk 404 guard) **and** a cited commit SHA per Lesson 0.

---

## B. Working modes (lightweight, on-demand)

Every non-trivial task follows one spine: **Research → Plan → Execute → Review → Ship.**
Pick the focused loop that fits. Keep modes small and composable.

- **ALIGN — before any non-trivial change.** Grill Henry first: ask pointed questions
  about scope, edge cases, and which modules are touched, until the decision tree is
  resolved. Don't start coding until aligned. (This is principle 1 made active.)
- **DIAGNOSE — for bugs / regressions.** reproduce → minimise → hypothesise →
  instrument → fix → **regression-test**. Write the regression test BEFORE the fix.
  This matches how bugs actually surface here (hardware test → specific RFQ repro →
  narrow root cause; see Lessons + the MES-3-FIX entries).
- **TDD — for features / fixes with testable behavior.** red → green → refactor, one
  vertical slice at a time. Consistent with the repo's "tests first" checklist step.
- **ZOOM-OUT — unfamiliar code.** Explain the section in the context of the whole
  system before editing it (e.g. how a calcEngine field flows to exporter + UI).
- **HANDOFF — end of a long session / context running low.** Write a compact handoff
  note: what's done, what's left, open questions, and the relevant commit SHAs, so the
  next session resumes cleanly.

## C. Keep a shared language: CONTEXT.md

This codebase is dense with domain jargon (`bd_mat_setup`/`bd_mat_run`, MOQ tiers,
Indigo subtypes, kiss-cut, anilox, alt-materials "mirror", print-vs-cut canonical
fields, …). Maintain a short `CONTEXT.md` glossary at repo root so the agent decodes
terms consistently and names new code with the same words. Update it whenever a new term
or a hard-won decision appears — same habit as the SHA-tied lessons in `CLAUDE.md`.

## When to skip the rigor

Trivial edits (a typo, an obvious one-liner) don't need the full plan-and-checkpoint
flow. Use judgment — the goal is fewer costly mistakes on real work, not ceremony on
simple tasks.

> **Sprint history** (mọi sprint, mới nhất trước, kèm SHA) nằm ở
> [docs/history/SPRINT_HISTORY.md](docs/history/SPRINT_HISTORY.md). Thêm mục mới ở đầu file đó;
> `npm run check:sha` kiểm tra SHA (Lesson 0).

## Deployment topology (CRITICAL)

There are **two runtime surfaces** that can serve the UI. Which one the user is viewing determines what you must do after a code change.

| Surface                          | URL                                                | Source it serves                         | After-edit action                 |
| -------------------------------- | -------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| **Vite dev**                     | `http://localhost:5173` (or 5175 when auto-bumped) | `apps/client/src/**` live, via HMR       | Nothing — HMR picks it up         |
| **Prod server (local)**          | `http://localhost:3000`                            | `apps/client/dist/**` (pre-built bundle) | `cd apps/client && npm run build` |
| **Prod server (remote Windows)** | `http://10.102.3.61:3000`                          | `apps/client/dist/**` on THAT machine    | Build **+** deploy to the remote  |

The Vite dev server (`npm run dev`, defined as `client-dev` in `.claude/launch.json`) is the only surface that auto-refreshes. The node production server (`apps/server/index.js`) serves whatever bundle is physically in `apps/client/dist/` at request time — it does NOT watch source files.

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

2b. **Security review — automatic, every iteration.** After tests are green and before rebuilding or
committing, run the `security-audit` skill (`.agents/skills/security-audit/SKILL.md`) in guidance mode
on this iteration's diff. Henry does not need to ask. Scope, skip rules and the blocking gate
(confirmed Critical/High must be fixed first) are in `.agents/rules/security-review.md`.

3. **Rebuild the client:**

   ```bash
   cd "3. PROJECTS/Ops Control/client" && npm run build
   ```

   The bundle hash (e.g. `index-BZT3rIjg.js`) MUST change when source
   changed. If it didn't, the source isn't actually in the build.

4. **If server code (`apps/server/**`) was touched, RESTART the node process:\*\*

   ```bash
   OLDPID=$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null)
   kill $OLDPID 2>/dev/null; sleep 1
   cd "3. PROJECTS/Ops Control" && node apps/server/index.js > /tmp/ops-server.log 2>&1 &
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
   crash. See `apps/server/index.js` — there must be a route for
   `/assets/*` that returns 404 **before** the SPA catch-all.

7. **If remote, deploy:**

   ```bash
   cd "3. PROJECTS/Ops Control" && ./tools/deploy/deploy.sh user@10.102.3.61
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

## CI signal — required vs advisory (Sprint CI-TRUST, 2026-07-21)

The point of CI is a **trustworthy** red/green: a clean PR goes deterministically
green, and only a GENUINE regression turns a check red. Chronic red +
admin-merge is the anti-pattern — it makes real breakage look "pre-existing"
and get merged. The split below keeps the signal honest without hiding
failures.

**REQUIRED (must be green — a red here is a real regression, do NOT merge):**

- **Client tests** (`cd apps/client && npm test`) — 1525+ vanilla node:test.
- **Server tests** (`npm test`) — runs `node --test` + desktop
  license/manifest. The `node --test` glob uses **`--test-concurrency=1`**
  (serialized) to eliminate the MES-3-FIX-52 runner deserialize race between
  parallel worker children — ~2.7× slower but deterministic. The one chronic
  skip is `backupCode.integration.test.js` "per-entry ETIMEDOUT is isolated"
  (`test.skip`, MES-3-FIX-51 — fs.cpSync monkey-patch pollution; backup
  partial-failure still covered by hardware + parallel integration tests).
- **Lint + format** — `npm run lint -- --max-warnings 413` (`ci.yml:76`; ratcheted 435 → 413 by
  #281 and ONLY ever downward — lower it as tickets close, never raise it to absorb a new
  warning). **Local under-reports by ~60**: `eslint-plugin-react-hooks` is installed twice and
  the root's 7.1.1 implements `react-hooks/set-state-in-effect` while `apps/client/`'s 7.0.1 does
  not, and the job runs `npm ci` at the root ONLY. So a clean local run means little; the cap
  is CI's. Hiding `apps/client/node_modules` does NOT simulate this — it breaks config resolution
  and yields tens of thousands of bogus problems (measured 2026-09-22). **It misses ERRORS too** (measured 2026-09-28): `apps/client/**` is linted with `apps/client/eslint.config.js`, whose `@eslint/js` resolves to `apps/client/node_modules` (9.39.4) locally and to the root's 10.0.1 on CI. 10's recommended set adds `no-unassigned-vars`, `no-useless-assignment` and `preserve-caught-error`, all errors, so a dead store passes locally and fails CI — #280's error and #436's. A local run that means something forces those three on (`--rule 'no-useless-assignment: error'` and the other two), after reproducing a known hit. +
  `format:check`. Deterministic — a NEW error or crossing the warning cap
  fails it. Never raise the cap to hide new warnings.
- **Commit messages** / **Commit-msg hook smoke** — Conventional Commits.
  The full convention lives in **CONTRIBUTING.md §5**, and `.gitmessage`
  (enabled by `npm install`) carries it as a template so you see the closed
  scope list while writing. Both are generated from / checked against
  `commitlint.config.js` by `apps/scripts/commit-convention.test.js`, so they
  cannot drift — CONTRIBUTING.md was teaching two invalid scopes until
  2026-09-15. The usual trip-ups: scope `costing` not `pricing`,
  `apps/server` not `server`, lowercase subject, no trailing period,
  body wrapped at 120 (never a single-line `-m`), and no `#NNN` reference in
  the body — commitlint can read that paragraph as a footer, capped at 100,
  so write `PR NNN`.
- **Runtime deps declared**, **Router has sibling tests**, **Die-cut test
  coverage**, **Build artefacts** — structural guards; a red here is real.
  Build runs `perf-budget` (bundle-size gate). Its budgets were re-baselined
  to the v1.6 build 2026-07-21 (they were v1.3.0-GA stale — the overage stayed
  hidden while `build` was skipped under red lint). The gate stays ENFORCED
  at the new honest level; **MES-3-FIX-62** tracks the real reduction
  (lazy-load PlanningModule / code-split the shell — PlanningModule no longer exists, see the ticket's 2026-09-30 note) — lower the budgets back
  as that lands. Never raise a perf budget to hide a genuine size regression;
  re-baseline only for legitimate multi-version growth, with a reduction ticket.
  **Re-baselined again 2026-09-25 for the shell only**: `index` had reached
  539,910 of 540,000 bytes — two months of ordinary growth, the i18n waves
  among it, had used the whole July headroom — and a 248-byte money-path fix
  could not land. Raised to 550,000 (+1.9%); MES-3-FIX-62 is still the reduction.
  **Since 2026-10-01 the shell is gated as a PATH, not a file**: `FIRST_PAINT_BUDGET`
  (585,000) covers index.html's scripts and modulepreloads plus every chunk they
  import statically — lazy chunks are not on it. The `index` file alone hid both
  directions: lazy-loading chat cut the path by 29,977 bytes while `index` moved
  2,321, because a split-off i18n chunk merged into it. A missing `index.html` on
  the real build fails the gate rather than skipping it.

**ADVISORY (non-blocking — reports in logs, never fails the required set):**

- **Vulnerability scan** (`npm audit`) — the npm-audit STEPS carry
  `continue-on-error: true` (`.github/workflows/ci.yml`) so the check stays
  GREEN while still running + printing findings in the step logs (the
  `Security allowlist hygiene` step is NOT advisory — it still blocks). The
  outstanding advisories (multer high GHSA-72gw-mp4g-v24j + uuid/exceljs
  moderate) are verified non-exploitable in our gated topology and scheduled
  for the post-freeze dep bump (**MES-3-FIX-59**, parent **MES-3-FIX-39**).
  Drop the per-step `continue-on-error` once MES-3-FIX-59 lands and
  `npm audit --omit=dev` returns 0 high — then a NEW vuln blocks again.

**Rule:** only the advisory vuln-scan may be non-blocking. Never silence a
lint/test failure to get green — fix it or file a ticket + skip the specific
flaky case WITH the ticket reference (MES-3-FIX-51 pattern), never a blanket
mute. Cross-link: MES-3-FIX-39 / -51 / -52 / -59.

## Common failure mode to avoid

> "I edited the source, HMR refreshed my preview, I claimed the change is live."

That's only true on the dev surface. If the user is on `:3000` (local or remote), the preview you verified with Claude Preview tools is **not** the surface they see. Always cross-check the URL in their screenshots.

## Stale-chunk crash recovery (2026-04-23 incident)

**Symptom**: browser console shows
`'text/html' is not a valid JavaScript MIME type. Strict MIME type checking is enforced for module scripts per HTML spec.`
and the affected tab renders the ErrorBoundary fallback with
`Cost → <tab-id> crashed`.

**Root cause**: browser holds an old `index.js` referencing chunk hashes that no longer exist in `apps/client/dist/`. The old `express.static` fallthrough returned `index.html` for any unknown path, so the browser loaded HTML when it expected JS and choked on the `text/html` content type.

**Fix in place**:

1. `apps/server/index.js` has a `/assets/*` 404 route BEFORE the SPA catch-all. Unknown chunks now return a real 404.
2. `components/Shared/ErrorBoundary.js` detects the three common chunk-load error messages and force-reloads the page once per session (guarded via `sessionStorage['ops_chunk_reload_done']` so a genuine bug can't melt the browser in a loop).
3. `apps/server/index.js` sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` and `no-cache` on `index.html` so the browser can safely trust hashed chunks and always revalidate the entry point.

**What to do when it happens again**: run step 6 of the checklist above. If the 404 check is failing, one of those three defences has been removed — restore it.

## Backend changes

Server code in `apps/server/**` is served by `node apps/server/index.js`. It doesn't auto-restart on file changes unless the user has set up nodemon. After editing server code:

- Ask the user to restart the node process, OR
- On the remote Windows server, the systemd/service equivalent needs restarting after `./tools/deploy/deploy.sh` pushes the new code.

## Key files

- `apps/client/src/components/Layout/Sidebar.jsx` — left-side navigation shell
- `apps/client/src/services/printAreaCore.js` — Print Area Calculator pure algorithm (framework-free, has its own Jest tests)
- `apps/client/src/modules/cost/tabs/PrintAreaCalc.jsx` — Print Area Calculator UI
- `apps/client/src/help/content.js` — **Help system source of truth** (see "Help system" below)
- `apps/client/src/modules/help/HelpTab.jsx` — in-app Help tab component
- `apps/scripts/help/build-user-guide.mjs` — builds the Word user guide from content.js
- `apps/server/index.js` — node server entry point (serves `apps/client/dist` + API routes)
- `deploy.sh` — Linux SSH deploy → systemd; `deploy.ps1` is the Windows counterpart (NSSM service) and was the script used for `10.102.3.61`. Both share the same .env-merge + snapshot + preflight gate; DATA_DIR is `.env`-driven on both since Sprint S-P0-FIX-1 (2026-05-03, SHA: `e75cac9`)
- `.claude/launch.json` — defines `client-dev` and `ops-control` preview targets

## Help system

Centralized, searchable in-app help with a Word-export mirror.

**Single source of truth:** `apps/client/src/help/content.js`. Every tab has one entry keyed by its tab ID (matches the Sidebar + router). Both the in-app Help tab and the Word user guide read from here, so they can never drift.

**Where it lives in the UI:** SYSTEM → Help in the sidebar (below Metrics). `F1` anywhere in the app deep-links to the entry for the current tab.

**Workflow for editing help:**

1. Edit `apps/client/src/help/content.js` — add/update the entry for the affected tab.
2. If you added a screenshot reference, capture a PNG and drop it at `apps/client/public/help/screenshots/<id>.png`. 16:10 aspect, 1280×800 recommended.
3. Rebuild the Word file so operators who download it see the new content:
   ```bash
   cd "3. PROJECTS/Ops Control" && node apps/scripts/help/build-user-guide.mjs
   ```
   Output goes to `apps/client/public/help/OpsControl_UserGuide.docx` AND is mirrored to `4. CLAUDE OUTPUT/OpsControl_UserGuide.docx` for review.
4. `npm run build` + deploy as usual (the `.docx` is a static asset served from `apps/client/dist/help/`).

**Capturing screenshots:** the app is behind auth, so programmatic capture via Claude Preview isn't possible. After logging in:

- Navigate to the tab.
- Use OS screenshot tool (Cmd+Shift+4 on macOS) OR a browser screenshot extension.
- Save as `<tab-id>.png` in the screenshots folder.
- Re-run the guide build script.

**Missing screenshots** are handled gracefully — the in-app Help hides the `<img>` on error, and the Word export prints `[Screenshot pending: <name>]` as a placeholder. Shipping without screenshots is acceptable; adding them later is an additive improvement.

**Word generators run automatically on `npm run build`** via the `prebuild` hook (see `apps/client/package.json`). `apps/scripts/help/build-all-docs.mjs` orchestrates the User Guide + Pricing Legend generators. Any new doc should be added to that script so a prod build always ships fresh offline docs.

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
- **~~`dataSync.js` caches legacy `window._VARNAME = {...}` files without schema validation.~~** **FIXED Sprint 11 P0-1.** Critical Library files (PermissionGroups, MachineProfiles, Rate tables) now validate via `apps/server/services/librarySchema.js`; unknown keys are stripped in strict mode for auth-critical data. Rows failing schema are dropped with stderr log. Treat `Library/` as a trust boundary: even trusted operators can drop a malformed xlsx export, and schema validation keeps the server running.

## Lessons learned (patterns that kept biting us)

Danh sách lesson (đánh số, dùng chung với comment "Lesson N" trong code) nằm ở
`.agents/rules/lessons-learned.md` và được nạp tự động:

@.agents/rules/lessons-learned.md

## Recovery playbook

Các runbook khôi phục (HMAC key, 2FA/TOTP key rotation, mất quyền admin, rollback deploy Mac/Windows,
bare-metal restore) nằm ở [docs/operations/RECOVERY_PLAYBOOK.md](docs/operations/RECOVERY_PLAYBOOK.md).

## MES-3 Backlog

Xem [docs/plans/mes/MES-3_BACKLOG.md](docs/plans/mes/MES-3_BACKLOG.md).
