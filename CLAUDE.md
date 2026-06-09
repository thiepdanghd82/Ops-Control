# Ops Control — Agent Playbook
# Agent working principles (read first)

> Behavioral guardrails for any agent (Claude Code / Antigravity) working in this repo.
> Distilled from Andrej Karpathy's notes on LLM coding pitfalls + battle-tested community
> practice, adapted to this project's existing conventions. These govern *how* you work;
> the sprint history, lessons, checklists, and recovery playbooks in `CLAUDE.md` govern
> *what* the system is and the exact steps to follow.

## Precedence

If anything here conflicts with `AUTO_EXECUTE.md`, another instruction file, or the
specific task you were given, **surface the conflict and ask** — do not silently pick a
side. In particular: the checkpoint-pause rule in principle 4 overrides any blanket
"run everything unattended" directive **unless** Henry has explicitly invoked
`AUTO_EXECUTE.md` for an approved upgrade in this session (see that file's dormant/opt-in
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
  about the *shape of the solution*, never about skipping verification.
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
  `AUTO_EXECUTE.md` session).
- Definition of Done for any code change includes the existing
  **"After every UI/client-code change — MANDATORY checklist"** in `CLAUDE.md` (tests
  green -> rebuild -> restart node if `server/**` was touched -> bundle self-check ->
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
> **Sprint S-D21-LEADTIME — Lead time & Notice sub-tab (Std + Cpx) shipped 2026-06-09 (SHA: `3bb680c` via PR #113).** Single PR adds a new sub-tab on Pricing (Std) [chèn TRƯỚC Legend, position 10/11] và Pricing (Cpx) [SAU Summarize, position 7/7 cuối list] — 1-row cover-sheet capture per-quote tooling cost + lead times + remark + process + material type. **Cross-tab sync**: Tooling cost cell (USD) READ-ONLY, auto-derive via `useMemo(() => sumToolingCostStd(stdState.processes), [stdState.processes])` ở `StandardCalc.jsx:289` + cross-SP variant ở `ComplexCalc.jsx:342`. Single source of truth stays in `processes[i].tool_cost` — no field cache, no drift. Operator chỉnh Tool Cost ở Processes tab → switch sang Lead time tab → cell live-update qua sub-tab unmount/remount (Lesson 18). **6 free-text cells** (`lt_material` / `lt_sample` / `lt_po` / `lt_remark` / `lt_process` / `lt_material_type`) — textarea với `field-sizing: content` (Chromium 123+/Electron 41+) + fallback `min-height: 4.5em`. **Responsive**: CSS Grid 7-col với `minmax()` per column + container query `@container (max-width: 900px)` → stack thành 7 cards (Lesson 11+27 — no viewport media queries). **Schema**: `lead_time: {6 empty strings}` thêm vào `createStdState` + `createEmptyStdState` + `createCplxState` (Cpx có 1 factory dùng chung init + RESET_CPLX, không tách `createEmptyCplxState`). KHÔNG bump shape version — default heal-on-read via `safeLeadTime()` helper (PR #110 pattern). **Helper extraction** (`CalcLeadTimeNotice.helpers.js`) — 4 pure functions (`sumToolingCostStd` / `sumToolingCostCpx` / `fmtUsd` / `safeLeadTime`) tested vanilla `node:test` (DesignSyncPicker pattern, no React testing infra in repo). `sumToolingCostCpx` delegate `sumToolingCostStd(sp.processes)` — DRY win cho hidden:true skip rule (single source of truth). 10 i18n keys EN+VN + Help system content.js entry với 3 procedures + 3 tips + relatedTabs links. **Tests**: 927/927 client (906→927, +21) including 19 helper unit + 2 round-trip round-tripping `lt_remark = 'multi\nline\ntext'` qua `JSON.parse(JSON.stringify(state))` để guard newline preservation. 1250/1250 server unchanged — xlsx exporter does NOT read `lead_time` (sheet 11-leadtime deferred, follow-up). Bundle delta +269 bytes (helper extraction + JSDoc + LEAD_TIME_KEYS freeze). Henry hardware-verified on Mac DMG SERVER 1.5.12 SHA `4ee6bf34...` — W1 cross-tab sync (Std + Cpx cross-SP) + W2 round-trip + W3 locale + W4 legacy quote load + W5 empty state ($0 → "—") all green. **CI-red pre-existing on merge** (per MES-3-FIX-36/37/38/39 + branch-caused commit-messages from initial `feat(pricing):` scope before PR title edit to `feat(costing):` — squash on main inherited correct scope, main history clean); green checks (client tests + commit-msg hook smoke + router siblings + runtime deps + vulnerability scan) all passed. **Out of scope**: xlsx exporter sheet 11-leadtime, per-SP lead-time table (Cpx operator quote-level only), component-level JSX interaction tests (repo dùng vanilla `node:test`, không có Jest/Vitest cho React) — raise tickets MES-3-FIX-XX cho từng item.
>
> **Sprint S-D21-PRE-GOLIVE — 3-PR pre-go-live polish bundle shipped 2026-06-09 (D-21 to CCL Vietnam Yen Phong go-live).**
> Three independent features bundled under the same hardware-test session on a freshly-rebuilt Mac DMG SERVER 1.5.12
> (SHA `0d5b3efa70f6a51c07d63139cb5480c8b83c3a5f9211bc2ce883a1fe640cedb7`). All 3 PRs admin-merged via squash to keep
> main moving (CI-red pre-existing per MES-3-FIX-36/37/38/39 backlog; none regressed on the green checks: client tests
> + commit messages + router siblings + runtime deps stayed green). Final client test count 883 → 904 (+21 quoteFilters
> cases); xlsx export 142/142 unchanged after the +1 column shift.
>
> - **PR #109 — Agent guardrails + skills + CONTEXT glossary shipped 2026-06-09 (SHA: `95be4d9`).** New
>   `AGENT_PRINCIPLES.md` (4 core principles: think-before-coding, simplicity, surgical changes, goal-driven +
>   checkpoints; 5 working modes: ALIGN, DIAGNOSE, TDD, ZOOM-OUT, HANDOFF) wired into CLAUDE.md via
>   `@AGENT_PRINCIPLES.md` import. New `CONTEXT.md` glossary for the project's dense jargon (`bd_mat_setup` /
>   `bd_mat_run`, MOQ tiers, Indigo subtypes, alt-materials "mirror", print vs cut canonical fields). `AUTO_EXECUTE.md`
>   header hardened — DORMANT by default + stale-content warning (original text targets v1.2→v1.3 upgrade, codebase at
>   v1.5.12 + close to go-live). 6 mattpocock skills installed under `.agents/skills/` (diagnose,
>   git-guardrails-claude-code, grill-with-docs, handoff, tdd, zoom-out) with `skills-lock.json` source-tracking.
>   Process-only change, no runtime code.
> - **PR #110 — Materials tab DRW column + rename Desc → Quote materials shipped 2026-06-09 (SHA: `5d89504`).** Operator
>   request: separate the engineering-drawing material identifier from the quoted material identifier on every material
>   row (Std + Cpx + per-SP), so the xlsx export to customer mirrors the same two columns. New text field
>   `drw_material` placed BEFORE `Quote materials` (formerly `Desc.`) on both `CalcMaterials.jsx` (Std) and
>   `SubProductRow.jsx` (Cpx). `drw_material: ''` added to default row template at 6 factory locations in `calcEngine.js`
>   (createStdState materials_main + mirror; createEmptyStdState ×2; createSubProduct ×2). Legacy quotes heal on next
>   save with default `''` — **Henry chose Option A: no schema-version bump** (STD_SHAPE_VERSION=3, CPLX_SHAPE_VERSION=4
>   unchanged). xlsx export `server/services/quoteExport/sheets/03-materials.js` gets new column at position 3 BEFORE
>   existing `desc`; banner span P→Q; subtotal label span A:C→A:D (`i<3` → `i<4`). desc column's label key switches
>   `mat.desc → mat.quote_materials` so the Materials sheet renames without touching the Inks sheet (which still uses
>   `mat.desc` for ink description — Inks DESC label stays "Description / Mô tả"). 2 new i18n keys: `mat.drw_material` +
>   `mat.quote_materials` (EN+VN). 5 xlsx test files updated for the +1 column shift in Materials sheet (rows /
>   subtotal / variant / multiTierRows / numFmt.regression); Inks sheet tests unchanged. calcEngine + validator + Inks
>   lookup + HMAC payload all unchanged (field is metadata only — zero pricing impact).
> - **PR #111 — Shared scoped filter bar for Quote History + Cost Breakdown shipped 2026-06-09 (SHA: `7e6cd4c`).** Both
>   tabs fetch the same `sharedApi.getQuotes()` payload with the same `quote.state` schema. Filter logic was duplicated
>   and drifted — **Summarize global search did NOT cover `sale_owner`** (operator regression), and neither tab had
>   Date / Customer / Part / Sale scoped boxes. This change extracts ONE pure filter engine + ONE shared filter-bar UI,
>   preserving the S-PROJFIX (Lesson 21) `end_cu || project` fallback and the NPI quote-level fallback
>   (`state.npi_owner || quote.npi_owner`). New infrastructure: `lib/quoteFilters.js` — pure `applyQuoteFilters()` with
>   caller-provided accessor (identity for Summarize already-flat rows; `quoteAccessor()` helper for raw QuoteHistory
>   quotes). AND-combines across global query + date range + customer + part + sale. 21 test cases cover S-PROJFIX
>   regression + NPI fallback + Summarize sale_owner miss + 4-filter combine + case-insensitive scopes.
>   `hooks/useQuoteFilters.js` — state with built-in 300ms debounce (raw filter drives input value; `debouncedFilter`
>   feeds `applyQuoteFilters`). State in-memory only — tab switch clears (intentional v1; URL sync + sessionStorage
>   persistence deferred to v2). `components/ScopedFilterBar.{jsx,css}` — 2-row filter UI (row 1: global search +
>   rightSlot for tab-specific actions like CSV button or pill filters; row 2: Date popover + 3 scoped text inputs +
>   Clear-all + N-of-M counter). Date popover uses native `<input type="date">` + 5 presets (Today / This week /
>   This month / Last 30 days / Clear) — **no new npm package**. Click-outside + Escape close popover. Tokens.css vars
>   for dark/light theme parity (Lesson 6). Summarize.jsx adds `end_cu: st.end_cu || ''` to row builder for S-PROJFIX
>   fallback. QuoteHistory.jsx pill buttons (All/Standard/Complex/Trash) move into ScopedFilterBar rightSlot;
>   `useEffect` resets page on `debouncedFilter` or `filterType` change. Pagination + sort + sync btn + 30s polling +
>   SSE push intact — filter state lives in hook outside `useAbortableFetch` tick so auto-refresh does NOT reset filter
>   input that operator is typing.
>
> **Tech debt + CI state — recorded 2026-06-04 (branch `fix/contribution-reconcile-audit-hardening`, PR #99).** Three CI checks are red on PR #99; classified by re-running each check locally + comparing against `main`'s CI on base commit `30db7d2`: (1) **Lint + format — PRE-EXISTING.** `eslint .` reports 5 errors (no-unused-vars + no-empty), all in files this branch never touched: `client/src/services/connectionHealth.js` (2× unused `_`), `client/src/services/printAreaCore.js` (2× empty block at 1310/1314), `client/src/utils/DecimalInput.jsx` (unused `toDisplay`). Red on `main` too → matches MES-3-FIX-38 backlog. NOT fixed (out of branch scope). (2) **Server tests — PRE-EXISTING.** `npm test` red on CI (Node 22) but green locally on Node 24 — full chain passes (jest no-tests + kiosk vitest 53/53 + `node --test` server/scripts/domains 1231/1231, exit 0). Red on `main` `30db7d2` too, so not branch-caused. Prime suspect: flaky `per-entry ETIMEDOUT is isolated` (`server/routes/backupCode.integration.test.js:113`) or a Node 22↔24 behaviour gap — needs a separate isolated investigation (reproduce under Node 22). NOT fixed. (3) **Commit messages — BRANCH-CAUSED but left as-is.** All 8 commits violate commitlint `body-max-line-length` (120) — bodies were written as single 186–521-char lines via `git commit -m`. Only fixable by rewording history → force-push, which the owner declined (admin-merge squash instead). **New convention going forward: wrap every commit-message body line at ≤120 chars** so the commit-messages check stays green without a force-push.
>
> **Sprint S-D15-COSTING-CUTOVER — 7-PR cutover sprint at D-15 shipped 2026-05-25 / 2026-05-26.** Closed 4 latent costing/UI bugs surfaced during operator hardware tests on the freshly-built Mac DMG SERVER 1.5.10, plus shipped operator-onboarding docs for go-live D-0 (2026-06-09). Sprint ran across two calendar days because each fix required a fresh DMG rebuild + operator hardware re-verify before merging — six builds total. Final test count 800 → 843 (+43 client tests across 4 new helper modules). All 7 PRs merged to `main` via admin-merge (pre-existing CI-red triggered by MES-3-FIX-36/37/38/39 backlog; none of the merged PRs regressed on the green checks: client tests + commit messages + router siblings + runtime deps all stayed green).
>
> - **PR #84 — BL-4 baseline-dump helper shipped 2026-05-25 (SHA: `a0f7ced`).** `scripts/cutover/dump-baseline-numbers.mjs` reads `quote.result` from the Mac DMG embedded SQLite + dumps the 11-field baseline (GM% / VA% / SP / s_ttl / bd_mat_setup / bd_mat_run / bd_ink_setup / bd_ink_run / bd_proc_setup / bd_proc_run / bd_pack) as paste-ready markdown for the D-6 smoke-quote template at `docs/uat/smoke-quotes/2026-06-09-baseline.md`. Field-name reconciliation table added to the template — operator's Excel mental model uses `bd_proc_setup` / `bd_proc_run` / `bd_pack` while calcEngine emits `bd_setup_mach + bd_setup_labor` / `bd_labor + bd_overhead` / `packing_ship`. `--list [--type std|cpx]` mode enumerates 25 newest quotes for picking. Read-only, safe while server is serving traffic.
> - **PR #85 — MES-3-FIX-43 — hide broken reset-pwd key icon shipped 2026-05-25 (SHA: `7a7e691`).** Operator clicked Settings → Account Control → Users → key icon (Reset password) and nothing happened. Root cause: `handleResetPwd` used `window.prompt()` which returns `null` in the Electron shell (Chromium disabled the API for security; the dialog never renders). Removed the button, the `handleResetPwd` handler, the `AcctIcon.key` SVG, and the `costApi.resetPwd` client wrapper. HelpTab content updated to point admins at the Provisioning Card flow (ID-card icon, same row — uses `confirm()` which works in Electron, generates a cryptographically random temp pwd, modal opens once with copy/print, `must_change_password=true` forces user to set their own on next login). Self-password change lives at SETTINGS → My Password sub-tab.
> - **PR #86 — Hương walk-through agenda D-14 shipped 2026-05-25 (SHA: `c265c29`).** `docs/cutover/HUONG_WALKTHROUGH_AGENDA_D-14.md` — 60-min operational agenda for Backup Engineer onboarding, companion to `BACKUP_ENGINEER_BRIEF_2026-06-09.md`. Six blocks: Opening + SPOF context (5 min), Repo + top-5 docs tour (10 min), Engineering scope git/test commands (10 min), Sysadmin scope live SSH/NSSM/`.env`/backup verification (20 min — biggest), Live drill `/health 500` (10 min, talk-through fallback if prod box not yet provisioned), Q&A + handoff (5 min). State-snapshot table at top tracks 10 readiness items by D-15 evening; untouchable-env-keys table expanded from 1 (TOTP only) to 4 (TOTP + EXPORT_HMAC + LICENSE_PUBKEY + KIOSK_KEY) — LICENSE_PUBKEY proven-blocker from earlier Mac DMG license-invalid incident. Windows path syntax (PowerShell `Get-ChildItem | Sort-Object` + `Start-Sleep`) replaces Unix mix throughout sysadmin section. Cheat sheet (Top 10 commands) + Top 5 incident scenarios + phone-tree ASCII diagram appended.
> - **PR #87 — COV OVR reset button + 3-state visual + MES-3-FIX-46 isIndigo narrow shipped 2026-05-26 (SHA: `799d42e`).** Two-bug combo on Inks tab COV OVR column. **(UX)** Operator who typed a manual override couldn't return to auto without clearing the field manually; couldn't distinguish at a glance whether a number was XLOOKUP'd or hand-typed. New pure helper `client/src/services/covOvrState.js` returns `{state, autoValue, displayPlaceholder, showReset}` for one of four states ('auto' / 'manual' / 'empty' / 'indigo'); shared between `CalcInks.jsx` (Std) and `SubProductRow.jsx` (Cpx). Reset (↻) button renders only in 'manual' state, writes `coverage_override = null` to fall through to auto via the existing `> 0` check at `calcEngine.js:440`. Auto-state placeholder gets italic gray styling; empty state shows `—`. **(FIX-46)** `isIndigoPrintType('Indigo(Primer)')` returned true via `.startsWith('Indigo')`, sweeping the paren-suffixed consumable subtypes (`Indigo(Primer)`, `Indigo(oil)`, `Indigo(Spot)`) into the click-charges path. These have dedicated rows in `lib.ddl.coverage` (400 / 400 / 176) and were designed to flow through the non-Indigo coverage formula. Narrowed regex to `=== 'Indigo'` OR `/^Indigo[\d ]/` (matches press subtypes `Indigo6800`/`Indigo7800`/`Indigo Vmax`, rejects paren variants). 18 new covOvrState tests + 4 new isIndigo regression tests covering all 3 paren variants + future-safe `Indigo(WHATEVER)`.
> - **PR #88 — MAC_INSTALL_GUIDE.md for D-6 UAT shipped 2026-05-26 (SHA: `d0ae523`).** `docs/cutover/MAC_INSTALL_GUIDE.md` — operator-facing one-pager for the 7 Mac operators (1 SERVER on Lead's Mac + 6 CLIENT on operator Macs). Covers SHA256 verification (cross-check vs Zalo broadcast), pre-install (quit previous + free port 3100), 3-step install (mount DMG → drag /Applications → handle Gatekeeper), Gatekeeper bypass both paths (System Settings → Privacy & Security → Open Anyway for operators + `xattr -dr com.apple.quarantine` one-liner for sysadmin), first-run wizard for SERVER + CLIENT roles, license activation flow (Installation ID → Zalo Lead → paste `.lic` key), login (temp pwd from Provisioning Card + TOTP enrollment), 7-row troubleshooting matrix covering issues hit during 2026-05-25 hardware test (Gatekeeper / Failed to fetch / License Invalid / Session expired / blank white screen / stuck on legacy "Lưu & tiếp tục" dialog / port in use), upgrade path (DMG drag-overwrite, data preservation), factory-reset commands (CLIENT-safe; SERVER warns to backup `~/Library/Application Support/ops-control-desktop/` first), operator quick-card (print + tape to monitor — launch path, server URL, login flow, escalation contacts +84965191991 / +84988749869).
> - **PR #89 — MES-3-FIX-47 — TTL.MAT double-counted ink + PROCESS missed setup cluster shipped 2026-05-26 (SHA: `e98c22c`).** P0 math-invariant bug on operator's RFQ ARBHBB000790: top KPI strip showed `TTL.MAT=1.06949` but `SUBTOTAL=0.95131` — impossible since TTL.MAT is a component of SUBTOTAL. Two latent bugs in `CostSummaryBar.jsx` since v1.2 bulk import (SHA `a8b559f`). **(1)** `TTL.MAT = s_mat_cost + bd_ink_setup + bd_ink_run` — `s_mat_cost` already aggregates inks (calcEngine.js:766 → `s_mat_setup + s_mat_run + s_ink_setup + s_ink_run`) and `bd_ink_setup === s_ink_setup` / `bd_ink_run === s_ink_run` (calcEngine.js:921-922). Sum double-counted ink subcost on EVERY Std + Cpx display since v1.2. **(2)** `PROCESS = overhead + labor_cost + tooling` — missed `bd_setup_mach + bd_setup_labor` (setup cluster); wrongly included `tooling` (operationally separate per exporter sheet 08 5-bucket roll-up + Cost Breakdown tab convention). Operator's "sum visible buckets ≈ subtotal" check failed on every SS/Flexo quote where setups are non-zero (Indigo quotes hid the bug because Indigo setups are 0). Fix: new pure helper `client/src/services/kpiBuckets.js` exposing `{ttl_mat, process, tooling, pack_ship, subtotal}` from a calcAll / aggregateComplex result. Post-fix sum invariant: `TTL.MAT + PROCESS + TOOLING + PACK&SHIP ≈ SUBTOTAL` for typical quotes. Persisted `quote.result.s_mat_cost` was always correct — only the display in this 1 shared component drifted; saved quotes reconcile automatically on reload. 6 new tests including operator-reported-numbers reproducer that asserts diff = ink subcost exactly.
> - **PR #90 — CSV export native picker + row selection + RFC 4180 + Production Size column + UTF-8 BOM shipped 2026-05-26 (SHA: `d9045bd`).** Three-stage operator-driven feature build on the Summarize tab CSV Export. **Stage 1**: native Save dialog via File System Access API (`window.showSaveFilePicker`, Chromium 86+ / Electron 13+) — operator picks folder + filename through macOS Save dialog instead of dumping to `~/Downloads/`. Falls back to legacy `<a download>` anchor when API unavailable. New pure helper `client/src/services/csvExport.js` with `buildCsv` + `saveCsv` + RFC 4180 `csvEscape` (doubles embedded `"`, wraps on `[",\n\r]`) — prior `exportCSV` only wrapped on literal `,`, embedded quotes/newlines leaked. **Stage 2**: per-row checkbox column + Select-All header with indeterminate state for partial selection. New `selected` Set state keyed by row `id` (`${quote_id}-${tier}`). Button label dynamic `CSV Export (N)` where N = selected-visible count or all-visible total. Selections persist across filter changes; export = `selected ∩ visible` so a row hidden by filter is never written to disk. Hint row under header shows `N row(s) selected (M more hidden by filter)` if applicable. **Stage 3 (operator follow-ups)**: (a) header alignment fix — initial commit added checkbox cell to data rows but not first header row; switched to `rowSpan={2}` on the select-all TH so it spans both column-label row + hint row, hint TH colSpan adjusted from `columns.length - 1` to `columns.length`. (b) Production Size column added before MOQ — operator screenshot of RFQ-2026-S0013 showed legacy `size` column rendering as `2x3` (canonical `part_width × part_length_md` placeholder); production dimensions actually live in `print_part_width × print_part_length_md`. New `production_size` field sourced from print*part*\* with fallback to canonical. (c) UTF-8 BOM (`﻿`, 3 bytes) prepended to CSV — Excel on Vietnamese / Windows locales detects UTF-8 and decodes `×` correctly (pre-fix showed `220√ó395` because UTF-8 `×` = `0xC3 0x97` mis-read as Windows-1252). (d) `size` column dropped from CSV cols — duplicate of `production_size` for most quotes, confusing on legacy rows. 15 new csvExport tests covering null/undefined/number/empty/comma/quote/newline/combination + BOM-presence + operator-style-row + RFC 4180 regression.
>
> **Sprint S-CUTOVER-DOCS-FILED — Cutover pack for v1.5.10 go-live shipped 2026-05-24 (SHA: `0ffaad9` via PR #63).** Committed 3 companion docs to `docs/cutover/` for the 2026-05-30 CCL Vietnam Yen Phong go-live: (1) `8-DAY-CUTOVER-PLAN-20260522.md` — sequenced D-8 → D-0 → D+7 plan with owners, time blocks, risk gates, 12-point success criteria checklist; (2) `GO-LIVE-AUDIT-REPORT-v1.2-20260522.md` — 8-agent pre-go-live audit (Security/Data/Deployment/Code/Testing/Biz/Ops/Audit) with EN+VN executive summary, 8 P0 findings table, decision matrix; (3) `ROLLBACK-RUNBOOK-20260522.md` — dual runbook (software rollback within v1.5.x via `releases/<ts>/` snapshots + operational Excel fallback when DB corrupted or hardware fails), bilingual operator Zalo announcements, Sev-1 decision flowchart, owner assignments. Plan + audit pair shaped the scope-down decision (defer Planning to v1.5.11 behind `OPS_FEATURE_PLANNING=0` flag — BL-1 BOM scrap factor mis-mapped on 81% of rows would cause 1-15% material-order errors); rollback runbook is operator-facing and survives indefinitely as incident-response material. Cross-references PR #58 (multi-tier export P0 fix + 1.5.10 ship) and PR #61 (runtime dep audit closing the exceljs/jszip latent breakage path).
>
> **Sprint S-DEP-AUDIT — Runtime dependency audit + CI regression guard shipped 2026-05-23 (SHA: `d63b43e` via PR #61, closes #60).** Closes Issue #60 (P1) raised after the PR #58 exceljs/jszip incident (4 days latent breakage: `exceljs` was in devDependencies, `jszip` was undeclared, both stripped by `npm install --omit=dev` in `build-desktop.sh` → packaged DMG crashed at first xlsx export). New `scripts/check-runtime-deps.js` (~180 LOC, zero deps) scans every `.js`/`.mjs`/`.cjs` file in `server/`, `domains/`, `scripts/` (matching `build-desktop.sh` extraResources scope; `.mjs` in `scripts/` skipped since build filter is `**/*.js` only), extracts bare-name imports (static `from`, `require()`, `await import()`), strips block + line comments first to ignore JSDoc `@param {import('pkg').T}` patterns, and classifies each package as P0 (missing entirely), P1 (devDeps-only, the exceljs class), or OK. New `runtime-deps` CI job in `.github/workflows/ci.yml` runs `node scripts/check-runtime-deps.js` on every PR — fails build if any P0/P1 detected. New `npm run check:deps` script for local invocation. **Audit findings on current main (1.5.10)**: 12/14 runtime imports clean (argon2 ✓ + bcryptjs ✓ + better-sqlite3 ✓ + compression ✓ + cors ✓ + dotenv ✓ + exceljs ✓ + express ✓ + jszip ✓ + multer ✓ + proper-lockfile ✓ + xlsx ✓; argon2 + xlsx caught via `await import()` dynamic-import scan after initial regex blind-spot). Two findings: (F-1) `bytenode` referenced by `scripts/build-bytecode.js` but absent from every `package.json` — closed by **deleting the script** (target paths `server/services/calcEngine.js` etc. were stale; files moved to `client/src/services/` years ago; never ran successfully — no `.jsc` or `.js.bak` artifacts anywhere in tree) + cleaning the bytecode step out of `scripts/release.sh` (was [3/6] "Bytenode compile IP files"; release.sh now [1/5]…[5/5]). (F-2) `puppeteer-core` only in devDeps but imported by 4 `scripts/help/*.mjs` operator dev tools — **no action needed** because `.mjs` files are stripped by `build-desktop.sh` `**/*.js` filter; placement in devDeps is correct. Full audit at `docs/RUNTIME_DEP_AUDIT_2026-05-23.md`. Script verified via canary regression test: synthetic `import nodemon from 'nodemon'` + `import jest from 'jest'` in a `server/` file caught as P1 with file:line attribution. Post-fix `npm run check:deps` exits 0 with message "All 12 runtime imports declared in root dependencies. Clean." `format:check` + `eslint` clean on all touched files; CI workflow yaml syntactically valid (job named `Runtime deps declared` lands between `Lint + format` and `Commit messages` for clearest PR status grouping).
>
> **Sprint S-EXPORT-MT-FIX — Multi-tier export P0 data-correctness fix shipped 2026-05-23 (SHA: `56d5b97` via PR #58, work dated 2026-05-20).** Closes a P0 bug surfaced during UAT prep: filenames in the multi-tier ZIP correctly stamped `MOQ{n}_internal_v{ver}` per tier but the **contents were identical** across all 4 xlsx files. Cause: sheets 03-materials / 04-inks / 05-processes / 08-cost-breakdown read `quote.result.rows.<section>` (the active-tier mirror) regardless of which tier they were generated for — `result.tiers[tierIdx].rows.<section>` persisted by S-EXPORT-MVP-1.5 was never consumed. Fix: new `tierRows.js` resolver module (`pickStdTierRows`, `pickCpxTierRows`, `sumRowCosts`, `getActiveIdx`, `getTierMoq`) routes every per-tier cell through the tier-indexed payload with fallback to the active mirror for legacy quotes. `index.js` now passes `tierIdx` to all 4 affected sheet builders. Subtotal rows: active tier keeps the rounding-free `result.bd_*` aggregate; non-active tier derives setup/run from per-tier row sums (matches cells, no drift). **Out of scope by architectural lock**: server-side calcEngine for labor/overhead/tooling — those buckets stay active-tier on non-active tier exports. The `[active-tier]` footnote (i18n key `cb.active_tier_footnote`, EN+VN+bilingual, placeholders `{active_moq}` and `{this_tier_moq}`) is now rendered on sheet 05 + 08 ONLY for non-active tier exports so operators can't conflate the per-tier row data with the active-tier aggregates. `formatMoq()` thousand-separates ≥1000. **Tests**: 14 new `tierRows.test.js` (pure helper edge cases — tier-index in/out of range, legacy fallback, Cpx subproduct missing, sumRowCosts NaN guards) + 12 new `multiTierRows.test.js` (cracks every xlsx in the zip via JSZip + ExcelJS, asserts Materials/Inks/Processes Setup Cost cells differ per tier, Cpx per-SP per-tier rendering, footnote presence/absence per lang variant, active-tier subtotal retains `bd_mat_*` precedence over row sum). Total +26 server tests; 816/816 server pass post-fix (was 790). Client unchanged 800/800. Bundle: also carries the uncommitted `desktop/main.js` from S-EXPORT-UAT-SETUP (loadUserEnv + will-download handler) since both must ship in the same 1.5.10 patch DMG.
>
> **Sprint S-EXPORT-UAT-SETUP — Desktop runtime config via `<userData>/.env` + HMAC key seed for 1.5.9 UAT shipped 2026-05-23 (SHA: `56d5b97` via PR #58, work dated 2026-05-20; bundled with S-EXPORT-MT-FIX in the 1.5.10 patch).** Closes the operational gap from S-EXPORT-MVP-2: the embedded server inside the packaged DMG requires `OPS_EXPORT_HMAC_KEY` at call time, but the v1.5.9 build had no mechanism to inject env vars without rebuilding (main.js set `OPS_TOTP_KEY` + `OPS_KIOSK_KEY` via electron-store but not the export HMAC). Added `loadUserEnv()` helper in `desktop/main.js` that reads `<app.getPath('userData')>/.env` (macOS: `~/Library/Application Support/ops-control-desktop/.env`) as KEY=VALUE pairs and merges into `process.env` BEFORE spawning the embedded server. OS env always wins (operator can override via `launchctl setenv`); the loader only fills in missing keys. Values are never logged — only the count of merged keys ("[main] userData/.env merged N key(s)"). Hand-rolled parser (no dotenv dep in main.js) handles `#` comments, blank lines, optional matching `"`/`'` quotes. Loader called as first line of `startEmbeddedServer()` so subsequent OPS_PORT/DATA_DIR/etc. defaulting respects any user-provided values. **Seeded for UAT 2026-05-20**: HMAC-FP `9edaa455` (sha256 first-8 of the operator-provided 64-hex key) written to `~/Library/Application Support/ops-control-desktop/.env` at mode 0600. Raw key NEVER persisted in repo/logs/commit messages. **DMG rebuild**: SERVER 1.5.9 (Apple Silicon arm64) at `desktop/dist-electron/Ops Control SERVER 1.5.9-arm64.dmg` (~210 MB, ad-hoc signed) carries the new loader; install replaces `/Applications/Ops Control 2.app`. **Verification path**: quit running app → mount new DMG + replace `.app` in /Applications → relaunch → Settings → About → Diagnostics → "License status" + "HW fingerprint" should remain green; export any quote (Quote History → Export → variant/lang/tier) → confirm no longer fails with `OPS_EXPORT_HMAC_KEY is missing`. **Follow-up**: if UAT passes, commit the main.js change + ship as a 1.5.10 patch release OR fold into the next minor release alongside Vite-define SSoT version sync. Recovery playbook section "OPS_EXPORT_HMAC_KEY lost or rotated mid-cycle" still applies — `<userData>/.env` becomes the ops-managed source of truth for desktop installs (mirrors the `.env` convention used by `server/index.js` on Linux/Windows server deploys).
>
> **Sprint S-EXPORT-MVP-2 — Quote xlsx tamper-resistance (`_Audit` + `_Schema` + HMAC + protection + watermark) shipped 2026-05-19 (SHA: `cc7efbd` via PR #49).** Closes the MVP-1 out-of-scope list with 5 forensic + tamper-resistance items. **Item A** — `_Audit` hidden sheet stamps 10 metadata cells (quote_id, version, saved_at/by, exported_at/by, variant, engine_sha 8-char short, library_fingerprint sha256, payload_sha256) for forensic trace. **Item B** — `_Schema` hidden sheet encodes the persisted `quote.state` as `gzip(canonicalStringify(state)) → base64 → 30000-char chunks`, with manifest `{chunks, sha256, alg: 'gzip+b64'}` in `A1` and HMAC reserved at `A2`. Canonical key ordering via sorted-keys replacer keeps the sha256 stable across save sessions. **Item C** — HMAC-SHA256 over the DECODED payload bytes (not base64 string) using server secret `OPS_EXPORT_HMAC_KEY` (32-byte hex). `crypto.timingSafeEqual` for verification. Symmetric chosen over Ed25519 because we're proving "came from THIS server install", not building a multi-party trust chain — same box signs + verifies. **Item D** — random 16-byte hex workbook password per export; ExcelJS lacks workbook-level open-password (Microsoft compound document format), so per-sheet `sheet.protect(password, {sort: true, autoFilter: true, formatCells: false, insertRows: false, …})` across ALL sheets including hidden `_Audit` + `_Schema`. Raw password discarded post-stamp; only `sha256(password)` persisted to audit log. **Item E** — customer-variant watermark cell at `AA1` (col 27, past the widest banner span at col S = 19) on every visible sheet: "CUSTOMER COPY" with `#F5E0E0` ARGB fill + dark-red bold italic text. `_Audit` + `_Schema` skipped. **verify.js** test-only round-trip helper (MVP-3 precursor) reads back `{state, audit, hmac, manifest}`, throws on missing `_Audit`. Scope clarified in JSDoc: HMAC catches `_Schema` tampering (chunk or A2 mutation) — does NOT catch visible-sheet edits (operator changing `Materials!E5` directly); MVP-3 re-import will catch via state-vs-cell diff. Tamper methodology: ExcelJS load → mutate → save round-trip, NOT `dd` byte-edit (xlsx is a ZIP — `dd` corrupts CRC before HMAC verify runs). Savvy-attacker test proves: re-minting manifest sha256 + stripping XOR sheet protection still fails HMAC because attacker lacks server key. **Environment**: `OPS_EXPORT_HMAC_KEY` added to `scripts/preflight-env.js` (must be 64-hex; mirrors `OPS_TOTP_KEY` / `OPS_KIOSK_KEY` pattern). `deploy.sh` + `deploy.ps1` capture + report `EXISTING_EXPORT_HMAC_KEY` from remote `.env`; whole-file merge preserves it automatically across deploys (Sprint 11 P2-1 pattern). **Audit emit**: per-tier `tier_audit[]` carries `{tier_idx, filename, wb_password_hash, schema_sha256, hmac}`; raw password NEVER logged. **Recovery playbook**: new section in CLAUDE.md ("OPS_EXPORT_HMAC_KEY lost or rotated mid-cycle") with impact matrix per surface — customer/internal xlsx still open + read fine post-loss (visible sheets unencrypted); MVP-3 re-import refuses pre-loss exports (HMAC verifies against new key); audit forensic trace intact. **Dev-only**: `includePassword: true` opt on `exportQuote()` surfaces per-tier `_devPassword` so `sample.gen.js` can print it for operator sheet-unprotect during Excel inspection — prod routes MUST NOT set this. Login-password reuse for workbook password explicitly REJECTED on 4 security grounds: server stores bcrypt(password) not plaintext; embedding credential in file = leak path; SOC2/GDPR/OWASP compliance breach; customer variant has no "logged-in user". 33 new tests (audit + schema + hmac + protect + watermark + verify integration); 7 existing test files patched with `process.env.OPS_EXPORT_HMAC_KEY ||= 'a'.repeat(64)` for pre-MVP-2 fixtures. 116/116 quoteExport tests + 784/785 server suite (1 pre-existing flaky `per-entry ETIMEDOUT is isolated`). Out of scope: MVP-3 (re-import + diff + apply flow), client export-button UI (next PR).
>
> **Sprint S-EXPORT-MVP-1.5 — Per-row Setup/Run/Total persistence (closes MES-3-FIX-41) shipped 2026-05-19 (SHA: `fc21c1a` via PR #48).** Bridges MVP-1 → MVP-2 by capturing per-row Material/Ink/Process cost breakdown into the persisted `quote.result` so xlsx exports render real numbers instead of em-dash. Architecture unchanged — calcEngine stays client-only; this PR exposes a 3-field subset (`setup_cost`, `run_cost`, `total` + optional `clicks` for Indigo) from `calcAll`'s existing `matResults / inkResults / procResults` arrays. New helpers in `calcEngine.js`: `calcRowBreakdown(state, lib)` extracts active-set rows + (when alt is non-empty) inactive-set rows via swap-and-recompute; `buildStdRowsPayload` walks all tiers via `buildTierState`; `buildCpxRowsPayload` walks per-SP per-tier via `applyCplxTierToSp`. Persisted shape — Std: `result.rows = {materials_main, materials_alt, inks, processes}` + `result.tiers = [{rows}, ...]`. Cpx: `result.subproducts = [{rows, tiers: [{rows}]}]`. Save paths in `StandardCalc.jsx` + `ComplexCalc.jsx` `buildQuoteData()` populate before POST (~50ms Std / ~150ms Cpx, synchronous). Schema migrations idempotent NOPs (std v2→v3, cpx v3→v4) — heal is on save, not on read. Pre-FIX-41 quotes return 422 `legacy_no_rows` (distinct from `no-snapshot`) so client UI can prompt re-save. Server sheets 03/04/05 read `result.rows.<sheet>[i]` (Std) or `result.subproducts[spi].rows.<sheet>[i]` (Cpx) — em-dash + footnote fallback for legacy; Cpx Materials/Inks/Processes now render per-SP sections (were empty in MVP-1). Indigo subtypes attach `clicks`; non-Indigo omit. 30 new tests (21 client + 9 server). Sum invariant verified: `Σ rows.materials_main[i].setup_cost === bd_mat_setup` per active tier. Sample regenerator (`sample.gen.js`) synthesizes evenly-split rows from `bd_*` aggregates when reading legacy `quote_history.json` entries so the manual deliverable produces representative xlsx without forcing operator re-save first.
>
> **Sprint S-EXPORT-MVP-1 — Quote xlsx export pipeline (10 sheets + variant + multi-tier zip) shipped 2026-05-19 (SHA: `bc1862d` via PR #47).** Server-side xlsx export for quote history. `POST /api/quotes/:id/export` emits a 10-sheet workbook (Cover, RFQ/MOQ, Layout, Materials, Inks, Processes, Balancing, Pack&Ship, Cost Breakdown, Summary) with customer vs internal variant column hiding (Ref Price hidden on customer Materials + Inks; Tool Cost + Tool Life hidden on customer Processes; Cost Breakdown rolls to 5 buckets), bilingual EN+VN labels (162 keys), and multi-tier ZIP bundling when ≥2 tiers requested. Filename pattern `Quote_<rfq>_<customer>_MOQ<n>_<variant>_v<ver>_<YYYYMMDD>.xlsx`; multi-tier zip mirrors. **No calcEngine on server** (locked decision): pipeline reads from persisted `quote.result` aggregates + `quote.state` inputs. Per-row Setup/Run/Total cells in Materials/Inks/Processes render as em-dash on MVP-1 quotes — gap tracked as MES-3-FIX-41 + closed in MVP-1.5 (PR #48). Permission gate split: export = `read` access (cost-user can export for review), import + apply-import = `edit` (MVP-3). Field-naming corrected from task spec (`quote.derived` → `quote.result` after empirical check on 66 existing quotes). Factory router pattern per ADR-0011 + dual-mount at `/api/quotes` and `/api/v1/quotes`. Audit emit on every export with detail JSON (`quote_id`, `version`, `variant`, `lang`, `tiers`, `kind`, `filename`, `size`). Bundled post-MVP-1 hardware-test fix: `applyStyle` shallow-clones `STYLES.num` so `08-cost-breakdown.js` percent-format mutation doesn't leak into every body-numeric cell across all 10 sheets (operator was seeing `4000000.0%` for MOQ etc.); added Subtotal row to Materials/Inks/Processes reading `bd_*` aggregates so operators see real total numbers even before per-row hydration; RFQ MOQ table KPI cols (Target GM / VA / Contr / GM%) switched to `numPct` preset + active-tier KPIs stamped from `quote.result`. 70 new tests (62 MVP-1 + 4 numFmt regression + 4 subtotal); server suite stayed green. Out of scope: MVP-2 (HMAC + `_Audit` + `_Schema` + workbook password + customer watermark), MVP-3 (re-import + apply flow), client export-button UI (separate PR). Sample workbooks in `4. CLAUDE OUTPUT/` for layout review.
>
> **Sprint S-INKS-LAYOUT-SYNC — Inks print_type dropdown + Width/Pitch sync from Layout shipped 2026-05-11 (SHA: `c7668ff` via PR #N).** Hardware re-test 2026-05-11 by Đặng Thế Thiệp surfaced 3 more bugs in the Inks tab after PR #43+#44+#45 landed: **(Bug C)** `CalcInks.jsx` + Cpx `SubProductRow.jsx` ink Print Type dropdown loaded options from `lib.ddl.print_type_list` (the Processes-tab Workcenter list — `SS(Sheet)`, `Indigo6800`, `Flexo(Gallus4C)`…) but `calcInk` looks up Coverage Table keyed by `lib.ddl.print_type` (`SS`, `Flexo`, `Indigo`, `Indigo(Primer)`…). Two distinct library lists separated by a single suffix → operator picked `Indigo6800` (only library option) → `covObj = find(c => c.pt === 'Indigo6800')` returned undefined → non-Indigo branch zeroed. Cascade also masked the FIX-33 fix from PR #45 on hardware until this dropdown was rewired. **(Bug D)** Rename "Base Mat" column → "Width" (mm) with bidirectional Layout sync: ink `width` field new, defaults to Layout `web_width_td`. Pitch (mm) column similarly upgraded — `ink.pitch_mm > 0` now overrides `calcPitch(st)` (was previously cosmetic-only; calc engine ignored it). Operator-typed override displays in violet bold (Print Design picker pattern). Legacy `ink.base_mat` string parsing kept as fallback chain after `ink.width`+`web_width_td` so pre-rename saved quotes still resolve. **(Bug E)** Hide redundant `print` panel from Library Drop-Down Lists UI (duplicated `print_type_list` semantics with parens/spacing drift — operator was hand-maintaining 2 partially-overlapping lists). Added `'print'` to `LibDDL.SKIP_KEYS`; underlying ddl_sites.json row preserved for forensic trail. 7 new tests (721 → 728): 4 width-resolution (layout sync / override / legacy parse / explicit priority) + 3 pitch override (default / override / NaN coerce). Closes MES-3-FIX-40. Operator hardware re-test required to confirm Indigo full-flow now produces non-zero costs.
>
> **Sprint S-NEW-QUOTE-FIX — empty-state defaults + Indigo subtype gating shipped 2026-05-11 (SHA: `360dd54` via PR #N).** Hardware re-test 2026-05-11 by Đặng Thế Thiệp on RFQ-2026-S0012 surfaced TWO bugs orthogonal to PR #44's Print/Cut sync: **(Bug A)** `createEmptyStdState()` (called by the "New" button via `RESET_STD`) defaulted `num_webs: 0 / parts_in_md: 0 / parts_web_across: 0`, diverging from `createStdState()`'s documented `1 / 1 / 1` invariant ("prevents /0 in derived math"). `calcQPA_LM` early-returns 0 when `!st.num_webs`, so `qpa_lm_raw = 0 → run_s = 0 → fmtN(0) === '—'`. Operator saw Run Material cost "—" on every row even with Mat Price populated; loaded quotes (Quote History → Copy) escaped because saved state had `num_webs = 1`. **(Bug B)** CCL Vietnam library only ships specific Indigo press subtypes (`Indigo6800`, `Indigo7800`); 4 callsites strict-equality-checked `print_type === 'Indigo'` (calcEngine.calcInk + CalcInks.jsx CLICKS/coverage gating + ComplexCalc/SubProductRow.jsx 3×). Every operator Indigo quote fell through to the non-Indigo formula which needs `ink_cover_val > 0` (none for Indigo subtypes) → run_s = 0 → CLICKS column disabled. Fix: align `createEmptyStdState` defaults with `createStdState` for the 3 geometry fields; new helper `isIndigoPrintType(printType)` in `client/src/services/printTypeUtils.js` does `String(s).startsWith('Indigo')` and is wired into all 4 callsites. 18 new tests (703 → 721): 11 helper edge cases + 4 calcMat empty-state guards + 3 calcInk Indigo subtype + Flexo regression guards. Node-side end-to-end simulation reproduces operator's exact RFQ-2026-S0012 flow: post-fix `qpa_lm_raw = 0.12125 / run_s = 0.132099 / layout_indigo_disp = 8 / Indigo run_s = 0.003700`. Closes MES-3-FIX-32 follow-up + MES-3-FIX-33.
>
> **Sprint S-LAYOUT-SYNC — Print → Cut lazy auto-mirror shipped 2026-05-11 (SHA: `5aa3381` via PR #44).** Root-causes the FIX-32 / FIX-34 trap that surfaced during the PR #43 hardware test. A fresh Std quote defaults to the Print sub-tab, so an operator who types "① Product Size Width TD = 462" only fills `print_part_width`; the canonical `part_width` (used by calcEngine + validator + layoutOptimizer + materials width fallback) stays at 0. Existing `PrintCutSizeMismatch` banner offers a "Sync to Cut" button but operators routinely miss it — 2 P1 bug tickets filed downstream of this one trap. Fix (Option C): pure helper `applyPrintToCutSync(prev, field, value)` in `client/src/services/layoutFieldSync.js` produces a patch that mirrors `print_part_*` writes into the canonical `part_*` field WHEN canonical is still 0. Wired into `SET_STD_FIELD` (Std) + `SET_SP_FIELD` (Cpx; same shared `AdvancedLayoutBlock` between Standard's CalcLayout + Complex's SubProductRow). No schema migration needed — both fields already existed (Sprint S-SPLIT 2026-04-24); only future writes change behavior. Once canonical is non-zero, auto-mirror stops so the existing divergence-detection banner takes over for the rare "print artwork vs die spec differ" case. 19 new tests (684 → 703): 11 pure-helper edge cases + 8 reducer integration tests covering Std + per-SP Cpx + preserve-canonical guard. Operator flow simulation confirms validator output flips from `lay-width: Part Width (TD) must be greater than 0 | lay-length: Part Length (MD) must be greater than 0` to clean. Closes MES-3-FIX-32 + MES-3-FIX-34. **MES-3-FIX-33 stays OPEN** — independent root cause (CalcInks per-row `print_type` field gates the CLICKS column; quote-level Design Process doesn't cascade down). FIX-32 + FIX-34 cascade was the dominant symptom; FIX-33's "Ink Setup/Run = —" reproducing also disappears after FIX-32 because Indigo formula needs `pitch > 0` (now satisfied via `sheet_length` + `min_gap_md` after operator fills Print sub-tab), so the residual FIX-33 surface is narrower than originally scoped.
>
> **Sprint S-ALT-MAT flag flip + cosmetic fix shipped 2026-05-11 (SHA: `7cbeb4f` via PR #43).** Hardware test 2026-05-11 by Đặng Thế Thiệp on quote `RFQ-2026-S0012` (build SHA256 `e3b8f800…b2d0`) verified alt-materials feature end-to-end: Std + Cpx toggle, copy, switch, edit, per-tier MOQ override, Quote History badge, save round-trip. All 9 functional tests PASSED. Feature default flipped from OFF to ON in `/api/runtime-config` — operator can still emergency-disable via `OPS_FEATURE_ALT_MATERIALS=0`/`false`/`off`/`no`; anything else (including absent env) leaves it ON. Bug 6 bundled (cosmetic regression — row-type dropdown rendered "Main.Mat" on the Alternative.Mat tab; helper `primaryRowTypeLabel(active)` in `client/src/services/altMaterialsLabels.js` now flips the displayed label to "Alt.Mat" while the underlying `row_type` data value stays `'Main.Mat'` so calcEngine classification + audit shape are unchanged). Closes MES-3-FIX-27 + MES-3-FIX-35. 3 unrelated calc-engine bugs surfaced during hardware test filed as MES-3-FIX-32 (Run material cost missing despite Layout filled), MES-3-FIX-33 (Indigo CLICKS column not enterable + ink calc broken), MES-3-FIX-34 (validator/display field mismatch). Operator confirmed via Maint.Mat ↔ Alternative.Mat toggle that these bugs reproduce identically on both material sets → pre-existing calc-engine gaps, NOT regressions from PR #A/#B/#C.
>
> **Sprint S-ALT-MAT — Alternative materials 3-PR series (PR #39 SHA: `c1e96be` / PR #40 SHA: `90efa9b` / PR #41 SHA: `449099d`), shipped 2026-05-11.** Pricing now supports a parallel "Alternative" material set per quote with a Maint.Mat / Alternative.Mat toggle. Calc engine reads the active set; legacy `state.materials` (Std) and `sp.materials` (Cpx) kept as a MIRROR of the active set so 15+ existing readers (calcAll, getActiveTierState, buildTierState, validators, ink base-mat lookups, QuoteHistory) stay green without callsite churn. Gated behind server env `OPS_FEATURE_ALT_MATERIALS` (default OFF) exposed to client via `GET /api/runtime-config` + `useFeatureFlag('alt_materials')` hook.
>
> - **PR #A — Std toggle + copy shipped 2026-05-11 (SHA: `c1e96be` via PR #39).** Schema gains `materials_main` / `materials_alt` / `materials_active` + legacy mirror. `stdMigration` v1→v2 lazy-maps old `materials` field → `materials_main`. Reducer adds `SET_MATERIALS_ACTIVE` + `COPY_MATERIALS` (structuredClone deep-clone). `<AltMaterialsToggle>` component (semantic radio + ARIA + popover + confirm modal + empty-state CTA). Server `emitAltMaterialsAuditAndStrip` emits `MATERIALS_COPY` + `MATERIALS_ACTIVE_SWITCH` on save (JSON.stringify per Lesson FIX-3); ephemeral `_alt_materials_op` signal stripped before persist. 22 new tests (608 → 630 total). `AppConfigContext` split into 3 files (`AppConfigContext.jsx` + `appConfigInternal.js` + `useAppConfig.js`) to satisfy react-refresh — react-refresh discipline lesson worth carrying forward.
> - **PR #B — Cpx per-subproduct shipped 2026-05-11 (SHA: `90efa9b` via PR #40).** Ports pattern to Complex. Each `cplxState.subproducts[spi]` carries own main/alt/active triple. `cplxMigration` v2→v3 with per-SP lazy migration + healing pass. Helper `getActiveSPMaterials(sp)` parallel to `getActiveMaterials(state)`. Reducer adds `SET_SP_MATERIALS_ACTIVE` + `COPY_SP_MATERIALS` (per-SP `_alt_materials_op`). `<AltMaterialsToggle>` rendered per-SP in `SubProductRow.jsx`. Server audit extended to loop subproducts + emit per-SP events with `sp_index` + `sp_code` in detail JSON. 19 new tests including Std reverse-regression guard (630 → 649). Zero new i18n keys / no new component — full reuse from PR #A.
> - **PR #C — Per-tier MOQ alt overrides + Quote History badge shipped 2026-05-11 (SHA: `449099d` via PR #41).** Field-level `_alt` suffix design (Option Y) — `extra_moqs[i].mat_setup_lm_alt`, `mat_rows_alt` (Std); `sp_mat_setup_lm_alt[spi]` (Cpx, per-SP branching per amendment A). Calc engine + UI handlers branch on `materials_active` for material-row tier overrides; ink/process/packing tier overrides remain shared (orthogonal). `_alt` fields default undefined → calc treats as no override → alt rows fall back to base `setup_lm`. **No schema migration needed** — backward compatible with PR #A/#B saved quotes. Quote History row gains `<MaterialActiveBadge>` (Main / Alt / Mixed (N alt / M main)) with 4 edge cases per amendment B (no SPs, 1 SP, all-same, mixed). 30 new tests (649 → 679). Bundle delta +2.6 kB (under +10 kB target).
>
> **Architectural decisions worth remembering**:
>
> - **Mirror approach** instead of clean-rewrite saved 15+ reader callsite changes. Reducer enforces `state.materials = active_set` on every write; calcAll + validators + QuoteHistory keep reading `state.materials` directly.
> - **No new feature flag for PR #C**: tier overrides + badge use existing `OPS_FEATURE_ALT_MATERIALS`. Std + Cpx + tier must release together so operators see a coherent feature, not partial.
> - **Pure helper extracted to `.js`**: `summariseMaterialActive` lives in `materialActiveBadgeSummary.js` separate from `MaterialActiveBadge.jsx` so node:test imports without JSX loader config. Same pattern as `useAppConfig.js` split in PR #A — react-refresh demands `.jsx` exports only components.
>
> **Hardware test gate (post-merge, NOT in PR series)**: set `OPS_FEATURE_ALT_MATERIALS=1` on prod `.env` + restart server. Operator verify Std + Cpx + per-tier override + badge end-to-end. If green, follow-up PR flips flag default to `true`. Until then, prod UI behavior unchanged from v1.5.2 baseline.
>
> **PR #22 — Phase 2 Day 1 regressions: printer.list + SSE + backup paths + verifyBackup shipped 2026-05-08 (SHA: `7e8de54`).** Hardware test on first official Mac DMG (v14, built post-PR-21) exposed 3+ pre-existing bugs not visible in dev mode:
>
> 1. `ops:printer.list` IPC returned "Operating System not supported" on macOS — `pdf-to-printer@5.6.0` is Windows-only despite README. Added macOS/Linux branch shelling to `lpstat -p`.
> 2. SSE event stream `/api/data-events/stream` returned HTTP 401 — handler used `req.cookies?.ops_session` but `cookie-parser` middleware was never mounted; replaced with `getTokenFromHeader(req)` mirroring chat.js's working pattern.
> 3. Settings → Backup/Restore path display showed `/Applications/OpsControl SERVER.app/Contents/Resources/app/Backup & restore/Data` (inside read-only .app bundle) — `PKG_BACKUP_DIR` constant in `costApi.js` was `__dirname`-based; replaced with lazy `getPkgBackupDir()` using `process.env.DATA_DIR`.
> 4. Backup cycle "Run now" failed with `unable to open database file` even though SQLite file was correctly written — `verifyBackup` received basename instead of absolute path, SQLite resolved against `process.cwd()` = `.app/Contents/Resources/app/`. Fix: `backupOpsDb` returns `{ file, path }`, `runBackupCycle` consumes `path`. See Lesson 30 for the general pattern.
>
> 4 fixes, 5 files (`desktop/native/printer.js`, `server/routes/events.js`, `server/routes/costApi.js`, `server/services/backupScheduler.js`, `server/db/backup.js`). Each fix independently low-risk; all four pass user hardware test on DMG v16. None of the bugs were regressions from earlier sprints — all pre-existing, only surfaced now because this was the first time the production-style packaged DMG was hardware-tested on macOS.
>
> **PR #20 — server `req` undefined in print-area catch block shipped 2026-05-08 (SHA: `be33a15`).** 1-char semantic fix (`_req` → `req` at server/routes/shared.js:1933). Husky lint-staged also reformatted ~1300 lines of pre-existing single-line catch blocks via prettier — purely stylistic, no behavior change. Same fix exists in PR #13 (sprint/inv-1d-server-infra) bundled with cohort-C WIP work; that PR remains deferred.
>
> **PR #19 — main CI lint plugin resolution (MES-3-FIX-17) shipped 2026-05-08 (SHA: `5a1a630`).** Added `eslint-plugin-react-hooks@^7.0.1` + `eslint-plugin-react-refresh@^0.5.2` to root devDeps so `npm run lint` from root resolves `client/eslint.config.js` correctly. Closes FIX-17. Side effect: lint now actually runs and exposes 24 pre-existing React-hooks rule violations across 11 client files — tracked as new backlog ticket MES-3-FIX-20.
>
> **PR #18 — Home page polish + auto-redirect + responsive (Lesson 27) + sidebar logo→Home shipped 2026-05-08 (SHA: `9a81c47`).** Cherry-picked auto-redirect logic from PR #11 (3 snippets in App.jsx — false→true auth transition watcher → setActiveTab('home')). HomePage.css refactored per Lesson 27: removed hard 1400px max-width, added container-type: inline-size + container queries, fluid clamp typography on greeting/clock/section titles. Sidebar logo wrapped as clickable button → onTabChange('home') for return-to-Home affordance after navigating away. Test verified: 6/6 pass on DMG v13 (SHA `628270e6`).
>
> **PR #16 — RFQ snapshot + Layout PDF + ABI overlay + build-role packaging shipped 2026-05-08 (SHA: `5e9d152`).** Bundles 10 fixes from PR #14 hardware-test session: extraResources better-sqlite3 ABI overlay (NMV 137→145), build-role.json packaging gap, Layout PDF preview (cherry-picked FileUploadZone improvements from draft PR #11 — blob URL conversion + 5th fullscreen toolbar icon), RFQ Tracker drawer snapshot pattern (insulates from auto-refresh) + parent SkeletonTable guard (prevents tree unmount), SampleTracking parity backport, ensureShape index-based merge (preserves user-edited text + required), stage-advance blocker chip. User hardware-tested DMG v10 (SHA `6fbcb66b`) — all 4 critical scenarios pass. Lesson 28 amended (host Node misdirection corrected) + Lesson 29 added (SkeletonTable parent unmount).
>
> **PR #15 — Lesson 28 docs (electron-builder Node ABI trap) shipped 2026-05-08 (SHA: `a8dca0a`).** Originally blamed host Node version; PR #16 amended after deeper investigation. Kept for audit trail.
>
> **PR #14 — Desktop hardening shipped 2026-05-08 (SHA: `130f969`).** Despite original title "kiosk-key persistence (mes-3-fix-15b)", actual content is 5 desktop fixes: F-LIC-1 license file path env, F-DRAW-6 PDF plugin enable, CSP frame-src blob: relax, window-open allowlist, new IPC `ops:shell.openExternalFile`, S-DIAG-FIX license validation hardening, MISSING preload license bridge added (was crashing About/Diagnostics), build-desktop.sh `domains/` packaging. **MES-3-FIX-15b kiosk-key persistence remains OPEN** — original title was wrong.
>
> **PR #10 — better-sqlite3 v12 bump (MES-3-FIX-15a) shipped 2026-05-08 (SHA: `3401f40`).** Required for Electron 41 (Node 24 ABI). Closes 15a portion of FIX-15.
>
> **PR #9 — Cohort 5 ReasonCodes UI shipped 2026-05-07 (SHA: `3a93a18`).** Library tab admin CRUD + i18n + permission gating.
>
> **S-INVENTORY-1c Cohort 5 — Reason codes admin UI (MES-3-V2 client) shipped 2026-05-07 (SHA: `b4ed580`).** `ReasonCodes.jsx` + `.css` Library tab with table + filter row, `ReasonCodeFormModal` (create/edit), `ReasonCodeDisableModal` (confirm), `reasonCodesApi.js` client wrapper. Wiring: CostModule lazy import + tab-map, sectionDefs libraries entry (`minRole='admin'`), ~36 `library.reasonCodes.*` i18n keys + `common.actions` + `nav.tab.reason_codes`, decimalInputBudget budget for `ReasonCodeFormModal`. Server endpoints from PR-3 (Cohort 1) no longer dormant.
>
> **S-INVENTORY-1c Cohort 4 — HomePage landing + module section grids (S-HOME) shipped 2026-05-07 (SHA: `e6434f4`).** New `HomePage.jsx` operator dashboard (greeting + 4 KPIs + my-queue + recent activity + quick actions) + reusable `ModuleLanding.jsx` section grid + `sectionDefs.js` shared metadata (COST_SECTIONS / PLANNING_SECTIONS + landing helpers). `CostModule.jsx` short-circuits `activeTab='home'` to HomePage and `activeTab='landing:<sid>'` to ModuleLanding. ~21 `home.*` i18n keys + `nav.tab.home`. Cohort 5 (ReasonCodes UI) deferred to PR-9 — entanglements rolled back from CostModule + strings + sectionDefs + decimalInputBudget lint.
>
> **S-INVENTORY-1b Cohort 3 — Smart KPI tiles unify with Dashboard (S-DESIGN-1) shipped 2026-05-06 (SHA: `fe49369`).** `shouldShowDelta` (hide when prev=0 or |Δ|<1%), `hasSparklineData` (≥4 non-null+non-zero gate), `toneOfGM` thresholds, polarity-aware Delta (higher_better/lower_better/neutral), `qa-kpi-v2` + `qa-kpi-tone-good/warn/bad/neutral` rail classes, `qa-delta-neutral` pill, `.qa-kpi { ::before }` rail redesign with hover lift. HomePage tile redesign deferred to S-INVENTORY-1c (Cohort 4 entangled with S-HOME chain).
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
25. **Native modules + paths with spaces = `electron-builder` fails on rebuild** — `/Volumes/Macintosh Data/...` breaks node-gyp's makefile generation for `node-hid` + `serialport` (see node-gyp issue #65). Use `--config.npmRebuild=false` to skip rebuild during `electron-builder` (existing native binaries from `npm install` are reused). The DMG ships fine **ONLY IF the host Node version matches Electron's bundled Node** — otherwise the install-time binaries have the wrong NODE_MODULE_VERSION and runtime fails. See Lesson 28 for the ABI trap. Don't fix this with workspace move unless the user has time to relocate the project tree.
26. **Sidebar collapse persistence key matters per-feature** — Sprint S-COLLAPSE (2026-04-29) added section-level collapse via `localStorage` key `opsctl.sidebar.section-collapsed.v1`. The mini-collapse (240px ↔ 64px rail) used different keys in v1.3. Don't reuse one key for two semantically different collapse states or operators lose either preference when the other one toggles.
27. **Fluid container + container queries beat viewport media queries for cards/grids** — KPI tiles và breakdown panels phải responsive theo CONTAINER width (sidebar collapse/expand, panel resize) chứ không phải viewport. Pattern: wrap với `container-type: inline-size`, dùng `@container (min-width: …)`. Cho root container, dùng `max-width: min(2400px, calc(100vw - 48px))` thay vì hard cap `1440px` — màn 27"/4K/ultrawide không còn dải trắng 400-600px mỗi bên. Browser baseline yêu cầu Chrome 105+/Safari 16+ (đủ cho Electron 41 + web access trình duyệt mới). **Reference impl**: QuoteAnalysis + Dashboard (Sprint S-RESP-1 shipped 2026-05-06, SHA: `d4f5894`). Khi sprint sau touch Cost Breakdown / Quote History / Settings, pull pattern này theo (giống approach Sprint 12 inline-style migration). Companion patterns: fluid typography via `clamp(min, vw-component, max)` cho KPI numbers, sticky filterbar via `position: sticky` + IntersectionObserver toggle `.is-pinned` class (Carbon Tearsheet pattern), print rules `@page { size: A4 landscape }` để report fit landscape khi Cmd+P.
28. **electron-builder DMG: native-module duplicate-binary trap — embedded server outside asar resolves WRONG copy** — Electron 41 has its own NMV (145), different from standalone Node 24 (NMV 137) and Node 20 (NMV 115). The bug: `desktop/package.json` `extraResources` copied root `../node_modules` → `app/node_modules`, putting host-CLI-rebuilt better-sqlite3 (NMV 137 or 115) where the embedded Express server resolves first. Meanwhile, `desktop/node_modules/better-sqlite3` rebuilt by `electron-rebuild` (NMV 145, correct for Electron) sits at `app.asar.unpacked/node_modules/` — only reachable by code INSIDE asar. Server code at `app/server/` (outside asar) — Node's resolver walks up and finds the wrong copy first. **Symptom**: app launches, renderer shows ERR_CONNECTION_REFUSED dialog. Server crash log: `compiled against NMV 137, requires NMV 145`. **Fix** (`desktop/package.json` `extraResources`): (a) add `!**/better-sqlite3/**` filter on `../node_modules` entry; (b) add new entry copying `desktop/node_modules/better-sqlite3` → `app/node_modules/better-sqlite3`. **Diagnostic** for any built DMG — both hashes must be identical: `shasum -a 256 "<App.app>/Contents/Resources/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node" "<App.app>/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node"`. **Host Node version is INCIDENTAL** — original Lesson 28 (PR #15 SHA `a8dca0a`) misattributed to host Node. Fix in PR #16 SHA `5e9d152`. PR #14 hardware-test DMGs v1+v2 both hit this; manual binary swap of `app/node_modules/.../better_sqlite3.node` ← `app.asar.unpacked/.../better_sqlite3.node` confirmed diagnosis on May 8 2026.
29. **`if (loading) return <Skeleton/>` in parent unmounts the entire tree on every refresh tick — kills drawer snapshot patterns** — `useAbortableFetch.refresh()` flips `loading=true` at the start of EVERY fetch (including 60s polling tick, not just initial load). If parent does `if (loading) return <SkeletonTable />` early-return, the kanban + open detail drawer get unmounted; when fetch resolves ~50ms later, tree REMOUNTS — drawer's `useState(() => structuredClone(row))` initializer runs again, replacing the user's optimistic-edit snapshot with a fresh clone of the (now refreshed) row. User sees flash + revert even when snapshot logic is 100% correct. **Fix**: gate skeleton on initial load only — `if (loading && rawData == null) return <SkeletonTable />`. Verified in RFQTracker.jsx + SampleTracking.jsx (PR #16 SHA `5e9d152`). **General rule**: in components with auto-refresh polling + persistent UI (drawers, modals, expanded rows), NEVER let the polling-driven `loading` flag drive an early-return. The skeleton state is for INITIAL data load only.
30. **SQLite `new Database(relativePath)` in packaged Electron resolves against `process.cwd()`, NOT module dir** — better-sqlite3's `new Database(path, ...)` uses Node's `fs.openSync` which interprets a relative path against current working directory. In packaged Electron apps, `process.cwd()` is set to `.app/Contents/Resources/app/` (the asar root) — a READ-ONLY signed bundle. If a code path passes just a basename or relative path (e.g. from a subprocess return that strips dirname), the open fails with the cryptic SQLite error `unable to open database file` (SQLITE_CANTOPEN, code 14). **Symptom**: backup cycle reports ✗ even though `db.backup()` succeeds and the target file is fully written + integrity-valid; the failing step is a downstream verifier doing `new Database(file, { readonly: true })`. **Fix**: always pass ABSOLUTE paths to `new Database()`. If a helper returns just a basename (legacy API), augment it to also return the absolute `path` and have callers consume `result.path`. **Diagnostic**: if you see SQLITE_CANTOPEN on a file that actually exists at `<userData>/data/Backup/SQLite/<name>`, check `process.cwd()` at the failing line — `.app/Contents/Resources/app/<basename>` would explain it. **Incident**: PR #22 (SHA: `7e8de54`) shipped fix where `backupOpsDb` now returns `{ file, path }` instead of `{ file }`, and `runBackupCycle` passes `sqliteResult.path` to `verifyBackup` instead of `sqliteResult.file`. **General rule**: audit any `new Database(...)`, `fs.openSync(...)`, `child_process.spawn` cwd-sensitive call in shipped server code — packaged Electron + relative paths is a footgun.

## Recovery playbook

### "OPS_EXPORT_HMAC_KEY lost or rotated mid-cycle" (Sprint S-EXPORT-MVP-2)

**Default policy**: do NOT rotate `OPS_EXPORT_HMAC_KEY` once production
quotes have been exported. Every signed xlsx becomes unverifiable on
key change. `deploy.sh` / `deploy.ps1` preserve the key automatically;
preflight refuses prod boot without it.

**Symptom (key missing on prod boot)**:

```
PREFLIGHT FAIL: OPS_EXPORT_HMAC_KEY — must be a 64-char hex string.
```

**Fix**: capture the existing key from a `.env` backup OR generate
a new one, set it on the box, restart:

```bash
ssh user@host
# Inspect backup
grep OPS_EXPORT_HMAC_KEY /opt/ops-control/releases/<prev>/.env  # if recoverable
# OR generate fresh (only if no backups exist)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Set in .env
sed -i 's|^OPS_EXPORT_HMAC_KEY=.*|OPS_EXPORT_HMAC_KEY='<key>'|' /opt/ops-control/.env
chmod 600 /opt/ops-control/.env
systemctl restart ops-control
```

**What if the key is genuinely lost (no backup, regenerated fresh)?**

| Surface affected                      | Impact                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer xlsx files (issued pre-loss) | **Still open + read fine.** Visible sheets are unencrypted; only sheet-edit-lock uses XOR. Customer never re-imports.                                                               |
| Internal xlsx files (issued pre-loss) | Same — still readable by humans + by spreadsheet tools.                                                                                                                             |
| Audit-log forensic trace              | Still intact: `wb_password_hash` + `schema_sha256` + `hmac` were logged per export. Auditors can match hash to xlsx file even without verifying signature.                          |
| MVP-3 re-import (when shipped)        | **Refuses pre-loss exports.** HMAC verify will fail because the new key produces a different digest. Operator must re-export from source quote, OR auditor falls back to audit log. |
| Post-loss exports                     | Work normally with the new key. Tamper detection resumes.                                                                                                                           |

Routine compliance (read + audit-trail review) survives key loss.
Fraud detection (HMAC verification of historical xlsx) does NOT —
file an incident memo if a key-loss event happens in a regulated
context. Treat the key with the same operational discipline as
`OPS_TOTP_KEY` + `OPS_KIOSK_KEY`.

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

### "Bad deploy — need to roll back" (Windows, P1-2 patch landed 2026-05-27)

`deploy.ps1` now snapshots live `<RemoteDir>` to `releases\<ts>\` before SCP upload (mirror of Linux `deploy.sh` pattern). To roll back:

```powershell
# 1. SSH to Windows prod
ssh user@10.102.3.61

# 2. List snapshots (newest first)
dir C:\opt\ops-control\releases | sort Name -Descending

# 3. Pick most recent snapshot BEFORE the bad deploy
$PREV = "20260527-110000"  # adjust per actual timestamp

# 4. Stop NSSM service
nssm stop ops-control

# 5. Take emergency backup of bad state
$BAD_TS = Get-Date -Format yyyyMMdd-HHmmss
robocopy C:\opt\ops-control C:\opt\ops-control\releases\BAD-$BAD_TS /E /XD releases data node_modules /R:1

# 6. Restore prior snapshot (EXCLUDES releases\, data\, node_modules\)
robocopy C:\opt\ops-control\releases\$PREV C:\opt\ops-control /E /XD releases data node_modules /MIR

# 7. Verify package.json reverted
type C:\opt\ops-control\package.json | findstr version

# 8. Re-run preflight
cd C:\opt\ops-control
node scripts\preflight-env.js
# Must exit 0

# 9. Start NSSM
nssm start ops-control

# 10. Verify /health
sleep 5
curl http://localhost:3000/health
```

Retention: 5 most recent snapshots, automatically pruned by `deploy.ps1`.

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

#### MES-3-FIX-15a — better-sqlite3 v12 bump (DONE)

- Source: PR #10, shipped 2026-05-08 (SHA: `3401f40`)
- Status: CLOSED

#### MES-3-FIX-15b — desktop kiosk-key persistence (OPEN)

- Source: original FIX-15, the second half. Without kiosk-key persistence fix, every Electron restart invalidates kiosk pairings.
- Acceptance: pop the original `stash@{1}` referenced in the v1.4.3 audit OR re-implement kiosk-key persistence. Ship as desktop branch.
- Effort: S
- Priority: P2

#### MES-3-FIX-16 — Extend seed:mes to populate orders entity for BOMExplosion verify path

- **Source**: v1.5.0 SHIP-FIRST UI verify session (2026-05-02). `scripts/seed-mes-fixtures.js` only creates rows in `work_order` (the MES v2 entity); the older `orders` entity that BOMExplosion / MaterialCheck / WorkOrdersLegacy read from stays empty after seed. Manual W3 (All-Orders Stacked BOM breakdown) walkthrough was UNVERIFIABLE on a freshly-seeded dev box because BOMExplosion `useEffect` `planningApi.getOrders` returns `[]` → no orders to explode → empty stacked view.
- **Acceptance**: extend `scripts/seed-mes-fixtures.js` to also `POST /api/planning/orders` (or write directly to the orders backing store) for each fixture, using a real ccl_pn that has both BOM + routing rows in `Library/`. Pick top candidate `80644500` (10 routing ops, 9 BOM rows, mixed Hours + Units/Hour modes — ideal for cross-feature verify). Fixture should remain idempotent (skip if order already exists for that productCode).
- **Effort**: S (~30 LOC + 1 lookup helper for "find a real PN with both"; reuse the cross-reference script from the audit session)
- **Priority**: P3 (verify-path enhancement, not a feature regression; W1 + W2 + W4 still verifiable on real data; W3 only blocks if dev box is fresh AND operator hasn't manually entered orders)

#### MES-3-FIX-17 — main CI Lint+format failure (eslint-plugin-react-hooks resolution)

- Source: discovered during PR #14 hardware-test session. Root npm run lint script invokes `eslint .` from repo root, which evaluates `client/eslint.config.js`; that file imports `eslint-plugin-react-hooks` which is in `client/package.json` but NOT in root `package.json`. Result: every PR's "Lint + format" check fails the same way.
- Acceptance: either (a) move `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` to root devDeps, OR (b) change root lint script to `cd client && npm run lint && cd .. && npx eslint server/ desktop/` (per-package).
- Effort: S
- Priority: P2 (blocks meaningful CI signal across all open PRs)

#### MES-3-FIX-18 — vite prebuild hook hardcoded path (CLOSED)

- Source: discovered during PR #14 hardware-test DMG builds. `scripts/help/build-go-live-docx.mjs` wrote ONLY to `OUT_DIR = path.join(ROOT, '..', '..', '4. CLAUDE OUTPUT')`, which resolves outside the worktree from non-canonical layouts (e.g. `/tmp/ops-build-pr14/` → `/private/4. CLAUDE OUTPUT/`, not writable without sudo) and crashed the prebuild hook.
- Fix: Go-Live generator now writes a canonical `client/public/help/OpsControl_GoLiveGuide_v1.2.docx` (always inside the worktree) AND optionally mirrors to `4. CLAUDE OUTPUT/` when the parent is writable. Skip is silent with a single log line; build never crashes. `OPS_DOCS_MIRROR_DIR` env override accepted for explicit targeting. User Guide + Pricing Legend generators were already try/catch-wrapped; only Go-Live needed the fix.
- Status: CLOSED 2026-05-09

#### MES-3-FIX-19 — build-script generalization for native module overlays (CLOSED)

- **Source**: discovered during PR #16 investigation. P3 preventive cleanup.
- **Fix**: `scripts/build-native-overlay-check.mjs` walks the `asarUnpack` patterns in `desktop/package.json`, expands scoped patterns by enumerating their scope dir, filters to packages that actually contain `*.node` binaries (skipping pure-JS siblings under broad scope patterns), and verifies each has a matching `extraResources` overlay entry. Wired as preflight in both `build-mac-installers.mjs` and `build-windows-installers.mjs` before electron-builder runs. Build aborts at config-check time instead of producing artifacts that crash with `ERR_DLOPEN_FAILED` on first launch. `OPS_SKIP_NATIVE_OVERLAY_CHECK=1` env var bypasses the gate for emergency builds.
- **Findings surfaced**: running the new check against current main reveals **2 missing overlays**: `node-hid` and `@serialport/bindings-cpp`. Neither is currently loaded from outside-asar code, so the trap is latent — but per Lesson 28 the fix is one `require()` away. Filed as MES-3-FIX-26 (separate ticket) for the actual overlay additions; this PR ships the detection infrastructure only.
- **Status**: CLOSED 2026-05-09

#### MES-3-FIX-20 — fix existing React-hooks rule violations exposed by FIX-17 (CLOSED)

- **Source**: surfaced after PR #19 merge (SHA `5a1a630`) on 2026-05-08. `eslint-plugin-react-hooks@7.x` exposed pre-existing violations once root lint resolution was fixed.
- **Phase 1 audit**: 16 active violations across 8 files (drifted from original 24/11 estimate as files were touched in interim PRs). Categorized: 12 (a) real bugs, 4 (b) intentional patterns, 0 (c) refactor. Plus 9 stale eslint-disable comments needing cleanup.
- **Phase 2 fixes**:
  - (a) `ProcessFlowChart.jsx`: `useMemo` wrap on `overrides` — single fix resolves 9 cascade violations and restores downstream memoization
  - (a) `ConnectionBanner.jsx`: state-driven 1Hz clock replaces `Date.now()` in render path (purity rule)
  - (a) `GallusCalc.jsx`: `set` wrapped in `useCallback` so `[set]` dep on `handleArtworkUpload` stays stable
  - (b) `PrintAreaCalc.jsx`: `eslint-disable-next-line` on the Library-hydration effect — adding `onFileSelected` to deps would TDZ since the const is declared after the effect (downgraded from Phase 1 (a) to (b) on discovery)
  - (b) `FileUploadZone.jsx` / `HardwareSection.jsx` / `AuditLog.jsx` / `QuoteAnalysis.jsx`: `eslint-disable-next-line` with documented justifications (mount-only fetches, applyFilters identity churn)
  - Bonus: 9 stale-disable comments removed (`useCachedFetch.js`, `main.jsx`, `AdminMetrics.jsx`, `DesignSyncPicker.jsx`, plus the misplaced ones in `AuditLog.jsx` and `FileUploadZone.jsx` that got re-placed)
- **Result**: 0 react-hooks violations, 0 stale-disable warnings. CI lint signal for this rule family is meaningfully green. Test suite: 607/608 pass (the 1 failure is the pre-existing PR #18 `home.go_to_home` i18n-key gap, unrelated).
- **Status**: CLOSED 2026-05-09

#### MES-3-FIX-21 — audit SQLite + cwd-sensitive callsites for absolute path usage (CLOSED)

- **Source**: discovered during PR #22 (SHA `7e8de54`) on 2026-05-08. Lesson 30 added.
- **Audit completed**: 2026-05-08 — 12 callsites reviewed across server/, scripts/, domains/. Result: 0 SUSPECT callsites. PR #22's verifyBackup was the only instance. All other `new Database(...)` calls pass absolute paths or use `:memory:`; the one `execSync` in production server code uses absolute paths + tar's `-C` flag; build scripts use `path.resolve(__dirname, ...)` consistently. **No further action needed**.
- **Status**: CLOSED 2026-05-08 (audit complete, codebase clean of Lesson 30 footgun)

#### MES-3-FIX-24 — User Guide generator: render `features` array (CLOSED)

- **Source**: discovered during PR #26 (SHA `09ec48c`) on 2026-05-09. Generator at `scripts/help/build-user-guide.mjs` only rendered tips + pitfalls; the features array was silently dropped from Word output.
- **Fix**: `scripts/help/build-user-guide.mjs` now renders `entry.features` between `whenToUse` and `preRequisites` as a "Features · Tính năng" bullet list, mirroring the bilingual `bullet()` helper used by `preRequisites`. Backfilled by removing the 3 duplicated tips PR #26 added to RFQ Tracker as workaround — feature bullets now have a single canonical home.
- **Status**: CLOSED 2026-05-09

#### MES-3-FIX-25 — commit message style: avoid Closes/PR/FIX trailers in body (CLOSED)

- **Source**: discovered during PR #28 (SHA `2dc04c5`) on 2026-05-09. commitlint's `footer-leading-blank` rule misfired on inline ticket references inside commit body.
- **Fix**: `commitlint.config.js` sets `footer-leading-blank: [0]` (was `[2, 'always']`). Authors can now write `Closes MES-3-FIX-N` or `Refs PR #N` inline mid-prose without that specific rule failure. Real footer trailers (with proper blank line) still pass — just no longer required.
- **Caveat — sibling trap**: empirical testing during the fix showed `footer-max-line-length` (default 100 chars) ALSO applies once the parser misclassifies a prose paragraph containing `Closes` as a footer. Body lines longer than 100 chars containing inline ticket refs can still fail. Mitigation: keep prose lines ≤ 100 chars OR avoid leading `Closes` in long body paragraphs. Filed as a follow-up if the friction recurs; the original rule (the common failure) is closed by this PR.
- **Status**: CLOSED 2026-05-09

#### MES-3-FIX-26 — add extraResources overlays for node-hid + @serialport/bindings-cpp (CLOSED)

- **Source**: surfaced by `build-native-overlay-check.mjs` preflight (MES-3-FIX-19) on 2026-05-09. Both packages appeared in `desktop/package.json` `asarUnpack` patterns and ship native `.node` binaries but lacked a corresponding `extraResources` overlay entry. Latent today — neither is loaded from outside-asar code — but per Lesson 28 the bug surfaces the moment any code at `app/server/` (or another outside-asar path) does `require('node-hid')` or `require('@serialport/bindings-cpp')`.
- **Fix**: added 2 explicit overlay entries mirroring the `better-sqlite3` shape and extended the root `../node_modules` filter with `!**/node-hid/**` and `!**/@serialport/bindings-cpp/**` exclusions. The FIX-19 preflight check now reports OK on all 3 native packages (better-sqlite3, node-hid, @serialport/bindings-cpp).
- **Status**: CLOSED 2026-05-09

#### MES-3-FIX-27 — Hardware-test gate for `OPS_FEATURE_ALT_MATERIALS` flip

- **Source**: deferred from Sprint S-ALT-MAT 3-PR series (PR #39 / #40 / #41 merged 2026-05-11). Feature flag default OFF on prod; flip to `true` only after operator hardware-test verifies the full alt-materials workflow end-to-end.
- **Acceptance**: (1) Set `OPS_FEATURE_ALT_MATERIALS=1` in prod `.env`, restart server. (2) Operator verify on real Mac SERVER + Win CLIENT install: Std toggle + copy + per-tier override + save round-trip; Cpx per-SP toggle + per-SP tier override + mixed-state save (SP-A main + SP-B alt at same MOQ tier); Quote History badge correct for 4 case types (no badge / single Main / single Alt / Mixed N/M). (3) Inspect `audit_log.json` after toggle + copy actions — verify `MATERIALS_ACTIVE_SWITCH` and `MATERIALS_COPY` events emit with correct JSON detail shape (quote_id, sp_index where applicable, direction, from/to, source_count, dest_count_before, user_id). (4) Diff Cost Breakdown numbers pre/post toggle on 2-3 fixture quotes — round-trip should produce identical output when toggle is back to original active set. (5) If all green, ship follow-up PR flipping `OPS_FEATURE_ALT_MATERIALS` default to `true` in `server/index.js` `runtime-config` endpoint + document in CLAUDE.md sprint history.
- **Effort**: S (operator session ~2 hours + 1-line code flip PR)
- **Priority**: P2 (gates the 3-PR series from being operator-visible on prod)

#### MES-3-FIX-28 — Audit log filter UI for MATERIALS\_\* events

- **Source**: deferred from PR #C scope (amendment C, 2026-05-11). PR #A/#B/#C all emit `MATERIALS_COPY` and `MATERIALS_ACTIVE_SWITCH` audit events via `emitAltMaterialsAuditAndStrip` in `server/routes/costApi.js`, but the audit timeline filter dropdown (`AuditLog.jsx`) doesn't expose them — admins must hand-query via `/api/audit?event=MATERIALS_COPY` or grep the raw log file.
- **Acceptance**: add `MATERIALS_COPY` + `MATERIALS_ACTIVE_SWITCH` entries to the event filter dropdown options in `client/src/modules/cost/tabs/AuditLog.jsx`. Verify timeline correctly filters when selected. Add display label + tooltip explaining what each event represents (per spec: "operator switched the active set" vs "operator copied between main/alt"). Add ability to filter by `quote_id` substring (some events carry it in JSON detail) for forensic tracing of a specific quote.
- **Effort**: S (~30 LOC + 1 test)
- **Priority**: P3 (operationally useful for compliance audits but not blocking — raw audit endpoint still works)

#### MES-3-FIX-29 — Tier override active-toggle mid-edit UX edge case

- **Source**: identified during PR #C Bước 3 design analysis but acknowledged as known limitation in v1. If operator is editing a per-MOQ Setup LM override field (focused input with pending value not yet blurred) and clicks the Maint.Mat ↔ Alternative.Mat toggle, the value gets dispatched on blur with the NEW active flag — landing in `mat_setup_lm_alt[i]` when the operator intended `mat_setup_lm[i]` (or vice versa).
- **Acceptance**: 1 of 2 approaches: (A) Add `onChange` blur-before-toggle in the DecimalInput component when a tier override is focused — toggle button click handler first commits the pending input via `.blur()` then dispatches `SET_MATERIALS_ACTIVE`. (B) Capture the active flag at TIME OF KEYSTROKE (not blur) into the input's local state, dispatch with captured flag on blur regardless of current `materials_active`. Option A simpler + matches React commit-on-blur convention; Option B more robust but adds local state to DecimalInput. Pick A; add 1 component test confirming toggle button click forces blur on focused tier-override input.
- **Effort**: S (~15 LOC + 1 component test)
- **Priority**: P3 (real but narrow — operator must do specific click sequence; standard React UX expectation is blur-then-toggle)

#### MES-3-FIX-30 — Quote History badge column header + filter

- **Source**: PR #C (SHA: `449099d`) delivered the badge as an inline pill next to the STD/CPX type tag with no dedicated column or filter. Operators reviewing 50+ saved quotes can't filter by Main/Alt/Mixed without scrolling and eyeballing each row.
- **Acceptance**: (1) Add `material_active` to `SORT_KEYS` in `QuoteHistory.jsx` mapping to `materialActiveBadgeSummary.summariseMaterialActive(q.state, q.type)?.kind ?? 'main'` so column can be sorted. (2) Add filter dropdown (above the table next to the existing search box) with options `All / Main / Alt / Mixed`. (3) Optional: dedicated column header showing the badge instead of crammed-in next to STD/CPX. (4) Wire filter state to `useMemo` filtering of the quotes list.
- **Effort**: S (~50 LOC + 2 tests for filter + sort)
- **Priority**: P3 (UX improvement, not gating workflow)

#### MES-3-FIX-31 — Ink + process tier overrides parity with material alt-mode

- **Source**: PR #C design decision (Option Y) — only material-row tier overrides (`mat_setup_lm`, `mat_rows`) got `_alt` variants. Ink + process + packing tier overrides remain shared between main/alt active states because they are orthogonal to which material set is active. **However**, in some operator workflows the alt material set drives different ink consumption (different substrate → different setup_kg) or different process speeds (different lamination time for alt face). Today those operators have to manually switch ink/process tier overrides each time they toggle materials.
- **Acceptance**: investigate whether enough operator workflows need ink/process tier overrides to track alt materials. If yes, extend Option Y to: `extra_moqs[i].ink_setup_kg_alt`, `ink_area_pct_alt`, `proc_setup_h_alt`, `ink_rows_alt`, `proc_rows_alt`, `sp_proc_setup_h_alt` (Cpx). Same calc engine branch pattern as material overrides. If no, document the limitation in help docs `complex` + `standard-material` entries so operators don't expect ink/process tier customization to auto-track.
- **Effort**: M (~100 LOC + ~10 tests if needed; alternatively S docs-only)
- **Priority**: P3 (deferred from PR #C explicitly; operator-driven scoping needed before code)

#### MES-3-FIX-32 — Run Material cost missing despite Layout filled (CLOSED)

- **Source**: hardware test 2026-05-11 by Đặng Thế Thiệp on quote `RFQ-2026-S0012` (Indigo, EAU 5000, MOQ 500). After filling Layout (Web Width 300, Sheet Length 480, Print Cav 2, Print Total/Shot 4, Bleed 3/3), TTL.MAT changed from 0.12493 → 0.20419 (Setup cascade triggered) but Run Material cost column remained "—" for all material rows. WEBS column in Materials also stayed "—" despite Layout's # Webs = 1.
- **Root cause** (identified 2026-05-11): a fresh Std quote defaults to the **Print** sub-tab. Operator types "① Product Size Width TD = 462" — input is bound to `print_part_width`, NOT the canonical `part_width` that calcEngine + validator + layoutOptimizer read. Sprint S-SPLIT 2026-04-24 split these intentionally for divergence detection, but the common-case operator (Print = Cut) trips the silent-failure trap. Existing `PrintCutSizeMismatch` banner offered a "Sync to Cut" button operators routinely missed.
- **Fix**: Sprint S-LAYOUT-SYNC (SHA: `5aa3381`) — pure helper `applyPrintToCutSync` in `client/src/services/layoutFieldSync.js` mirrors `print_part_*` writes into the canonical `part_*` field when canonical is 0. Wired into `SET_STD_FIELD` + `SET_SP_FIELD` reducers. Divergence detection preserved: once operator sets a different Cut value, auto-mirror stops and the existing banner takes over.
- **Status**: CLOSED 2026-05-11 (SHA: `5aa3381`)

#### MES-3-FIX-33 — Indigo CLICKS column not enterable + Ink calc broken (CLOSED)

- **Source**: hardware test 2026-05-11. Quote `RFQ-2026-S0012` (Design Process = Indigo) had CLICKS column showing "—" with cells unfocusable. SETUP / RUN / TOTAL columns also "—" despite INK PRICE manually entered (50/21/21/76).
- **Root cause** (identified 2026-05-11 after PR #44 hardware re-test): CCL Vietnam's Library only ships specific Indigo press subtypes (`Indigo6800`, `Indigo7800`). Operator's ink rows had `print_type = 'Indigo6800'`. 4 callsites strict-equality-checked `print_type === 'Indigo'` (calcEngine.js:417, CalcInks.jsx:160 + :161, ComplexCalc/SubProductRow.jsx:1099). Every Indigo-subtype quote fell through to the non-Indigo formula which requires `ink_cover_val > 0` (coverage row missing for Indigo subtypes) → `run_s = 0 → fmtN(0) === '—'`. CLICKS column gated on the same equality → disabled.
- **Fix**: new helper `isIndigoPrintType(printType)` in `client/src/services/printTypeUtils.js` doing `String(s).startsWith('Indigo')`. Wired into all 4 callsites. Sprint S-NEW-QUOTE-FIX (SHA: `360dd54`). Reproducer post-fix: `Indigo6800` ink → `layout_indigo_disp = 8`, `run_s = 0.003700` (was 0).
- **Status**: CLOSED 2026-05-11 (SHA: `360dd54`)

#### MES-3-FIX-34 — Material width validator vs display column mismatch (CLOSED)

- **Source**: hardware test 2026-05-11. Materials table WIDTH column displayed 300 for all rows but validator footer said "Material row N: Width must be greater than 0" for N=1..5. Field mismatch between display source (`material.width`?) and validator source (possibly derived `web_width`).
- **Root cause** (identified 2026-05-11): `validateMaterials(stdState.materials, 'Materials', num(stdState.part_width))` passes `part_width` as the `layoutWidth` fallback. Material row's UI fallback (`CalcMaterials.jsx:83 layoutWidth = st.web_width_td`) shows 300, but validator's fallback is `part_width` which stayed 0 due to the FIX-32 Print/Cut split trap. Two different effective-width fields surfaced from the same canonical-missing root cause.
- **Fix**: closed as cascade of Sprint S-LAYOUT-SYNC. Once `part_width` auto-mirrors from `print_part_width`, the validator's `layoutWidth` arg is non-zero → `mat-width-N` errors no longer fire. Verified via reducer-side simulation: `errs1.filter(e => e.id.startsWith('mat-width'))` returns `[]` after Print sub-tab fill.
- **Status**: CLOSED 2026-05-11 (SHA: `5aa3381`)

#### MES-3-FIX-35 — Alternative.Mat row label said "Main.MatN" (CLOSED)

- **Source**: hardware test 2026-05-11. Operator on Alternative.Mat tab saw row labels "Main.Mat1" through "Main.Mat5" instead of "Alt.MatN". Cosmetic only; calc was correct.
- **Fix**: bundled with flag-flip PR. Material-row label JSX now branches on `materials_active` via shared helper `primaryRowTypeLabel` in `client/src/services/altMaterialsLabels.js` and renders "Main.Mat" or "Alt.Mat" prefix accordingly. `row_type` data value remains stable as `'Main.Mat'` so calcEngine classification + audit JSON shape are unchanged.
- **Status**: CLOSED 2026-05-11 (SHA: `7cbeb4f`)

#### MES-3-FIX-40 — Inks tab: print_type dropdown wrong source + rename Base Mat → Width + Pitch override (CLOSED)

- **Source**: hardware re-test 2026-05-11 on RFQ-2026-S0012 (post PR #43+#44+#45). Operator screenshots showed Inks tab `Print Type` dropdown listing `Indigo6800`, `SS(Sheet)`, `Flexo(Gallus4C)`… (press machine subtypes) but Coverage Table keys are `Indigo`, `SS`, `Flexo`, `Indigo(Primer)`… (semantic ink types). Operator selected `Indigo6800` → Coverage lookup missed → non-Indigo branch zeroed Run cost.
- **Root cause**: Library has 3 related keys — `print_type` (semantic, ink-tab use), `print_type_list` (process workcenter list), `print` (deprecated/redundant). `CalcInks.jsx` + `SubProductRow.jsx` read `print_type_list` by mistake.
- **Fix**: (1) Ink dropdown source `print_type_list` → `print_type` (Std + Cpx). (2) Rename "Base Mat" → "Width" column with new numeric field `ink.width`; calcInk resolves width as `ink.width || st.web_width_td || legacy(ink.base_mat)`. (3) Pitch (mm) override: `calcInk` now honors `ink.pitch_mm > 0` (was cosmetic-only). (4) Hide redundant `print` panel from Library DDL UI via `LibDDL.SKIP_KEYS`.
- **Status**: CLOSED 2026-05-11 (SHA: `c7668ff`)

#### MES-3-FIX-36 — CI: client tests glob not expanded on Node 20

- **Source**: PR #43 CI run 25654201841 (2026-05-11). `node --test 'src/**/*.test.js'` returns "Could not find" because Node 20 doesn't auto-expand glob in `--test` arg; local Node 24 does. Pre-existing — script unchanged in PR #43, verified red on PRs #39/#40/#41/#42.
- **Acceptance**: bump `.github/workflows/ci.yml` Node version 20 → 22. OR change `client/package.json` test script to enumerate files via the `glob` package. Verify all 684 tests run + pass on CI.
- **Effort**: XS (1-line yaml change + retest)
- **Priority**: P1 (gates every PR; current admin-merge culture risky)

#### MES-3-FIX-37 — CI: kiosk JSX tests fail Jest parse

- **Source**: PR #43 CI run 25654201841. `apps/kiosk/src/**/*.test.{js,jsx}` fail with `Cannot use import statement outside a module` + `Support for the experimental syntax 'jsx' isn't currently enabled`. Pre-existing — KIOSK-004 Vitest config deferred, never landed.
- **Acceptance**: implement KIOSK-004 (Vitest config + unit tests). Close FIX-37 as duplicate of KIOSK-004 when done.
- **Effort**: M (defer to KIOSK-004 scope)
- **Priority**: P2 (gates Server tests CI)

#### MES-3-FIX-38 — CI: react-compiler lint violations across 10+ files

- **Source**: PR #43 CI run 25654201841. `npm run lint` reports 20+ errors from `eslint-plugin-react-compiler` rules: `Calling setState synchronously within an effect`, `Cannot create components during render`, `Cannot access refs during render`, `Cannot call impure function during render`. Pre-existing — PR #43's 16-line helper doesn't trigger any of these.
- **Acceptance**: triage each violation per MES-3-FIX-20 methodology — classify as (a) real bug, (b) intentional pattern needing `eslint-disable-next-line` with justification, (c) rule too strict → disable selectively. Document each decision.
- **Effort**: L (~200 LOC + investigation)
- **Priority**: P2 (gates Lint CI)

#### MES-3-FIX-39 — CI: vulnerability scan exit 1

- **Source**: PR #43 CI run 25654201841. Vulnerability scan job exits 1 with no detail in `--log-failed` output. Likely `npm audit` high-severity finding or Trivy config issue.
- **Acceptance**: read `.github/workflows/*.yml` to identify the tool, capture full output, either patch vuln (`npm audit fix`) or allowlist false-positive with rationale.
- **Effort**: S (~30 min)
- **Priority**: P3 (least critical of 4)

#### MES-3-FIX-41 — Quote Export: persist per-row Setup/Run/Total breakdown for xlsx export

- **Source**: Quote Export MVP-1 (PR #47, 2026-05-18) shipped 10-sheet xlsx pipeline but renders per-row Setup/Run/Total cells in Materials/Inks/Processes sheets as em-dash with Excel comments explaining the gap. Reason: server intentionally does NOT recompute via calcEngine (single source of truth lives in the client), and `quote.result` snapshot persisted today is aggregate-only (sp, s_ttl, gm, va, bd_mat_setup, bd_mat_run, bd_ink_setup, bd_ink_run, …) — no per-row breakdown survives the save. Customer variant cost-credibility is operationally weak: customers see total Mat cost ($0.20 / unit) but the "$0.05 setup + $0.10 run per row" derivation is missing. Internal variant is mostly fine because operators can mentally cross-check against PricingBreakdown UI.
- **Acceptance**: (1) Add `result.rows` block to persisted quote shape with stable keys: `{materials: [{mid, setup, run, total, webs, qpa_lm}], inks: [{mid, setup, run, total, clicks}], processes: [{pid, setup, run, total, run_h, run_kg}]}` (mid/pid stable across versions). (2) Client `saveQuote()` populates these from current calcEngine output before POST `/api/quotes`. (3) Server-side `calcAll()` REJECTED — keep calcEngine client-only (architectural invariant). (4) Per-tier `result.tiers[N].rows` for non-active tiers too (each tier reads from `getActiveTierState`/`buildTierState`). (5) Optional schema migration v3→v4 in `stdMigration` + `cplxMigration`: backfill `result.rows` lazily on first read by re-running calcEngine on legacy saved quotes (one-shot heal pass, idempotent). (6) `server/services/quoteExport/sheets/03-materials.js + 04-inks.js + 05-processes.js`: when `quote.result.rows.<sheet>[i]` present, render the real numbers; otherwise keep em-dash fallback for forward-compat with pre-FIX-41 quotes. (7) Cross-check: PricingBreakdown tab in client UI shows same numbers as exported xlsx for the same quote. (8) Tests: ≥10 new tests covering shape persist, multi-tier rows, legacy heal pass, exporter render path.
- **Effort**: M (~300 LOC client save-path + ~80 LOC exporter render + ~50 LOC migration + ~150 LOC tests)
- **Priority**: P2 (customer-variant credibility gap; internal variant works around with aggregate KPIs but operators have asked for full transparency since MVP-1 ship)
- **Bundle with**: MVP-2 (HMAC/\_Audit/\_Schema work) since `result.rows` is part of `payload_sha256` input — order matters for hash stability.
- **Status**: CLOSED 2026-05-19 via PR #48 (SHA: `fc21c1a`, MVP-1.5). `calcRowBreakdown` extracts per-row Setup/Run/Total from `calcAll`'s existing `matResults/inkResults/procResults`; `buildStdRowsPayload` / `buildCpxRowsPayload` walk all tiers + SPs. Save path in StandardCalc + ComplexCalc populates `result.rows` / `result.tiers[N].rows` / `result.subproducts[spi].rows`. Schema bumps idempotent: std v2→v3, cpx v3→v4. Server route returns 422 `legacy_no_rows` (distinct from `no-snapshot`) so pre-FIX-41 quotes prompt operator re-save. 30 new tests (21 client + 9 server). Sum invariant holds: `Σ rows.materials_main[i].setup_cost === bd_mat_setup`.

#### MES-3-FIX-48 — Quote Export: xlsx sheet 11-leadtime (render `lead_time` cover-sheet)

- **Source**: Sprint S-D21-LEADTIME (PR #113, 2026-06-09) shipped the Lead time & Notice sub-tab that captures per-quote `lead_time: {lt_material, lt_sample, lt_po, lt_remark, lt_process, lt_material_type}` + tooling-cost rollup into persisted state, but the xlsx exporter does NOT read `lead_time` — the data operators enter as of v1.5.12 never reaches the exported workbook. Explicitly deferred at ship ("sheet 11-leadtime deferred, follow-up").
- **Acceptance**: (1) New `server/services/quoteExport/sheets/11-leadtime.js` rendering the 6 free-text cells + tooling-cost total (USD) with EN+VN labels (mirror existing sheet label convention, ~6 i18n keys). (2) Wire into the workbook sheet list after sheet 10 (Summary). (3) Variant rule: lead times + remark on both customer + internal; tooling-cost total internal-only (parity with Processes sheet). (4) Reads persisted `quote.state.lead_time` (Std) + per-quote Cpx; em-dash fallback for pre-#113 legacy quotes with no `lead_time` block. (5) Tests: ≥6 covering populated / empty / legacy + multiline `lt_remark` round-trip in cell.
- **Effort**: S–M (~120 LOC sheet + ~40 LOC wiring/i18n + ~80 LOC tests)
- **Priority**: P2 (operators enter lead-time data on v1.5.12 that silently does not export — customer-facing quote gap before go-live D-0 2026-06-30)

#### MES-3-FIX-49 — Lead time & Notice: per-SP lead-time table for Complex quotes

- **Source**: Sprint S-D21-LEADTIME shipped lead-time capture at the quote level only; for Complex (Cpx) quotes the sub-tab records one cover-sheet shared across all sub-products. Multi-SP RFQs with genuinely different per-SP lead times (e.g. different material sourcing windows) cannot be represented. Deferred at ship ("per-SP lead-time table (Cpx operator quote-level only)").
- **Acceptance**: (1) Product decision FIRST (review with Thiep): does CCL Vietnam quote per-SP lead times, or is quote-level sufficient for go-live? If sufficient → close WONTFIX with rationale. (2) If per-SP needed: extend the Cpx SP factory in `createCplxState` with an optional `lead_time` block; render a per-SP row/table in the sub-tab; keep quote-level as default/rollup. (3) Heal-on-read, no shape bump (PR #110 `safeLeadTime()` pattern). (4) Exporter (FIX-48) renders a per-SP section when present. (5) Tests for per-SP persist + legacy quote-level fallback.
- **Effort**: M (~200 LOC if built; ~0 if product closes as quote-level-sufficient)
- **Priority**: P3 (no operator has reported the gap; confirm scope with owner before building — may be WONTFIX)

#### MES-3-FIX-50 — Document commitlint scope/type convention for contributors

- **Source**: Recurring per-sprint commit-message friction: S-D21-LEADTIME branched as `feat(pricing):` then had to retitle to `feat(costing):` (scope-enum has no `pricing`); the PR #99 tech-debt note records 8 commits that breached `body-max-line-length` 120 via single-line `-m` bodies, fixable only by force-push (owner declined). Rules live in `commitlint.config.js` but there is no contributor-facing cheatsheet, so the same mistakes recur each sprint and trip the commit-messages CI check.
- **Acceptance**: (1) Add a "Commit message convention" section to the canonical contributor doc (CONTRIBUTING.md or AGENT_PRINCIPLES.md) covering: allowed types; closed scope-enum (`costing` not `pricing`; `docs:` takes no scope); `header-max-length` 100; `body-max-line-length` 120 (wrap, never single-line `-m`); blank line before any trailer; avoid Closes/PR/FIX trailers in body (per FIX-25). (2) One good + one bad example. (3) Cross-link from the CLAUDE.md sprint-workflow section. (4) Doc-only, no code change.
- **Effort**: S (~1 doc section, ~30 min)
- **Priority**: P3 (process hygiene; cuts per-sprint CI-red commit-message churn before go-live and for post-go-live maintainers)

#### MES-3-FIX-51 — Test pollution flake on backupCode.integration.test.js:113

- **Source**: D-21 audit (2026-06-09) confirmed CI Server tests chronically red since 2026-06-04. Test `per-entry ETIMEDOUT is isolated` passes 10/10 in isolation on Node 22 but consistently fails in CI full-suite. Suspect: `fs.cpSync` monkey-patch (test re-patches basename `design-md` selectively, restore in `finally`) leaks state to downstream tests on Node 22+ runtime — possibly fs.cpSync API semantic change between Node 20→22 OR a polluting test earlier in suite captures the patched `fs.cpSync` as its own "real" reference and re-restores it in patched form.
- **Acceptance**: (1) Reproduce CI conditions locally — `nvm/fnm use 22` + `npm rebuild better-sqlite3` (binary NMV mismatch otherwise blocks full suite) + full server suite run. (2) Bisect to identify polluting test (likely earlier `fs.*` patcher OR shared `Backup & restore/Code/` filesystem state). (3) Refactor monkey-patch to module-level fixture using `test.before` / `test.after` hooks with explicit teardown verification (`assert.equal(fs.cpSync, realCpSync, 'cpSync was not restored')`). (4) Un-skip the test (remove `test.skip` + comment block in `server/routes/backupCode.integration.test.js`).
- **Effort**: M (1-2h reproduce + 1-2h root cause + 30 min fix)
- **Priority**: P2 — deferred post-go-live. CI safety net restored by SKIP; backup partial-failure coverage retained via hardware test + parallel integration tests in `server/db/backup.js` + `server/services/backupScheduler.js`. Un-skip MUST happen post-D+7 before next CI-red cycle accumulates more debt.

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
