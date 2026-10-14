<!-- Tách khỏi CLAUDE.md ngày 2026-10-14 (nguyên văn). -->

# MES-3 Backlog

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

#### MES-3-FIX-52 — Test runner deserialization race on server/http.integration.test.js

- **Source**: Surfaced during Sprint S-PACK-SHIP-PER-TIER step 4 verify (2026-06-16). Full server-side `node --test "server/**/*.test.js" "scripts/**/*.test.js" "domains/**/*.test.js"` reports `pass 1232 / fail 1` with the single failure listed as `server/http.integration.test.js` carrying `Error: Unable to deserialize cloned data due to invalid or unsupported version` at `node:internal/test_runner/runner:410:20`. **Reproduces in isolation = NO**: running the same file standalone gives 42/42 PASS in ~2.5s. The error is a Node test-runner IPC framing race between worker children when many parallel `node --test` subprocesses send results back over `MessageChannel`. Verified pre-existing on `main` (608d5f6) per Lesson 7: a fresh `git worktree add main` + identical command reproduces the same 1232/1 + same file/error before any Sprint S-PACK-SHIP-PER-TIER commit lands. Distinct from MES-3-FIX-51 (that one is `backupCode.integration.test.js` "per-entry ETIMEDOUT is isolated", fs.cpSync monkey-patch pollution — unrelated mechanism + unrelated file).
- **Acceptance**: (1) Reproduce reliably — try `node --test --test-concurrency=1 …` to confirm serialization eliminates it (would isolate to runner-internal worker pool). (2) Bisect Node version (24.x worktree vs CI Node 22) to see if behavior differs. (3) Either patch (likely upstream Node bug — file issue or vendor a runner shim) OR mark `server/http.integration.test.js` as `concurrency: false` via test-runner config. (4) Document the workaround in this lesson.
- **Effort**: M (1-2h reproduce + investigate Node test-runner internals + workaround)
- **Priority**: P3 — does NOT mask real failures (the same file is 42/42 in isolation; CI catches real http.integration regressions because the deserialization race is on the runner's RESULT channel, not on the test code path). Safe to defer.

#### MES-3-FIX-59 — Bump multer to ≥2.2.0 + revisit other npm-audit moderates (CLOSED 2026-09-20 — and the `≥2.2.0` in this title is itself wrong; see Status)

- **Source**: Phase A pre-go-live audit (2026-06-19), finding A4-01. `npm audit --omit=dev` reports 1 high + 2 moderate. **High**: `multer` `<2.2.0` — GHSA-72gw-mp4g-v24j (DoS via deeply nested field names, CVSS 7.5) + GHSA-3p4h-7m6x-2hcm (DoS via incomplete cleanup of aborted uploads, CVSS 5.3). Fix is `multer@2.2.0`. **Moderate**: `uuid <11.1.1` (GHSA-w5hq-g745-h8pq, missing buffer bounds check in v3/v5/v6 when `buf` is provided — we don't pass `buf`, so unreachable) — fix requires breaking-change bump of `exceljs` to ≥3.5.0. `exceljs` moderate is the cascade of the same uuid advisory.
- **Allowlist rationale (current state, pre-go-live)**: ZERO of the 3 advisories are practically exploitable in our auth-gated topology. Phase A audit verified all 8 multer instances (`server/routes/import.js:88-105`, `importWizard.js:100-105`, `costApi.js:3640-3650, 3788-3800`, `shared.js:968-972, 1721-1724, 1952-1956, 2164-2200`) sit BEHIND `requireRole(4)` / `requireTabAccess(...)` / `isSys(u)` gates — no anonymous upload surface. Size caps everywhere (10/15/30/50/200 MB) bound the abort-cleanup leak. The deep-nested fieldname DoS requires an authenticated sys/admin to attack their own server (the only operator with that role at CCL Hai Duong is Henry himself). For uuid, our code never invokes `uuid` with a pre-supplied `buf` — the advisory's exploit path is unreachable.
- **Why defer**: Pre-go-live runway is D-42 (cutover 2026-07-30). `multer@2.2.0` is a minor bump (no major API change in 2.x), BUT the 8 upload routes span RFQ attachments, sample attachments, print-area artwork, BOM imports, xlsm import, backup restore, machine-technical import — each has different field/file/limits config, so a regression on any one route blocks ops. Schedule for the **first maintenance sprint after the 2026-08-29 freeze-end** (NOT D+7 — the monitoring window from go-live to freeze-end is for stability soak, not dep churn). The `exceljs` uuid cascade is a separate breaking change (major version bump) and warrants its own scoped sprint.
- **Acceptance**: (1) `npm install multer@^2.2.0`; lockfile diff confined to multer + transitive deps. (2) Smoke each of the 8 upload routes on hardware DMG against rc1 baseline: BOM import (xlsm), RFQ attachment, sample-tracking attachment, print-area artwork upload, machine-technical import, backup restore, importWizard small-pass, costApi xlsx export-back. (3) `npm audit --omit=dev` returns 0 high after the bump. (4) Sprint history entry citing this ticket + closing SHA. (5) Optional: bundle `exceljs ≥3.5.0` upgrade in same sprint OR file separately depending on Sprint S-DEP-AUDIT-2 scope.
- **Effort**: S (bump + 8-route smoke ≈ half-day). Critical-path: the 8 upload routes are operator-facing; per-route smoke takes ~15 min each on DMG.
- **Priority**: P2 — non-exploitable in our deployed topology so go-live is unblocked. The CI "Vulnerability scan" job has been red across PRs #126-#172 (carried-forward baseline acknowledged at memory `project_golive.md` "Pre-existing CI red"); admin-merge culture is preserved because every PR in the window introduces ZERO new dep regressions. Cross-link: MES-3-FIX-39 (the original "CI vulnerability scan exits 1" parent ticket) — this is its narrowed actionable form post-Phase-A.
- **Status**: **CLOSED 2026-09-20** — `125735f` (PR #382, the bump) + `82a7ce5` (PR #383, the gates). The text above is left as written because **two of its claims were wrong, and that is the part worth keeping.** (1) It names `≥2.2.0` as the fix. True when filed; `npm audit` now puts the vulnerable range at **`<=2.2.0`** — 2.2.0 became the dinged version, and the repo sat on it for three months believing it was the remedy. A deferral that cites a specific fix version has an expiry date nobody sets. (2) It states that all 8 multer instances sit behind a gate. **`/api/backup/upload` and `/api/import-xlsm` do not** — they ran multer first and authenticated inside the handler, so the anonymous-upload surface the rationale denied existed was open the entire time. It was found by writing the automated sweep the ticket had said to do by hand, which took minutes (Lesson 49). The acceptance criterion "smoke each of the 8 routes on hardware DMG" is superseded by `server/routes/multerUpload.integration.test.js`, which sweeps all eight every run instead of once. `brace-expansion` (HIGH, transitive under `exceljs/archiver`) and `electron` 41.3.0 (3 HIGH advisories, and it ships) are the survivors and need their own ticket.

#### MES-3-FIX-60 — Desktop renderer: "Server connecting…" screen + retry-with-backoff instead of instant ERR_CONNECTION_REFUSED dialog (ADDRESSED 2026-07-01)

- **Source**: surfaced 2026-07-01 during a verify-loop DMG reinstall. `desktop/main.js` `createMainWindow()` called `mainWindow.loadURL(url).catch(dialog)` — the recovery dialog ("Không kết nối được tới http://127.0.0.1:3100 … Reset về Embedded + Restart") fired on the FIRST loadURL failure. Root cause of the incident: a double-launch (`launchctl bootstrap` + `open` in the same install step) briefly raced two instances for port 3100 / the shared `ops.db`, so one renderer hit ERR_CONNECTION_REFUSED (-102) before its embedded server bound. Normal LaunchAgent-only auto-start does NOT race (`startEmbeddedServer` already `await waitReady()` polls /health for 30s before `createMainWindow`), but the instant-dialog UX is alarming for a zero-touch box and also bites thin/remote mode when the LAN SERVER is briefly down.
- **Fix (this change)**: `createMainWindow` now first loads a calm "Đang kết nối máy chủ Ops Control… / Server connecting" screen (a self-contained `data:text/html` spinner — same data-URL pattern as the setup wizard), then polls `probeServer(url)` (`/health`, never throws) via a new `waitForServer(url, 60000)` with gentle backoff (400ms → cap 2s). On first `/health` OK → `loadURL(url)` the real app. Only after the 60s budget is spent (or a post-ready loadURL still fails) does it call the extracted `showConnectFailedDialog(url, err)` — the exact BUILD_ROLE-branched recovery dialog as before (server → "Reset về Embedded"; client → "Chạy lại setup wizard"), unchanged. No more scary dialog on a transient boot race.
- **Acceptance**: `node --check desktop/main.js` OK + eslint clean (done). Hardware: on a clean LaunchAgent auto-start the app shows the connecting screen briefly then the app (no dialog); if the server is genuinely down for >60s the recovery dialog still appears with the same buttons/behavior. **Install caveat learned**: during a manual reinstall, use LaunchAgent bootstrap OR `open` — NOT both — to avoid the two-instance / port-3100 / ops.db-lock race (the verify-loop skill install block already uses bootstrap only; the incident came from an extra `open`).
- **Effort**: S (~55 LOC in desktop/main.js: connectingScreenHtml + waitForServer + retry loop + extracted dialog). No test surface (Electron main IPC); verified via node --check + eslint + DMG smoke.
- **Priority**: P3 — UX hardening; the underlying connectivity paths are unchanged. Cross-link Lesson 37 (verify-loop install) + Sprint S-WIZARD-CORS (data-URL renderer pattern) + Sprint S-DESKTOP-HMAC (BUILD_ROLE dialog branching).

#### MES-3-FIX-61 — Legacy `DELETE /totp/secret/:username` still allows self-reset without a current TOTP code (CLOSED 2026-07-22, SHA: `03945d8` via PR #242)

- **Source**: S-2FA-RESET security follow-up (2026-07-01). The NEW `POST /auth/users/:id/reset-2fa` is SYS-only + step-up password + no-self-reset. But the pre-existing `DELETE /api/totp/secret/:username` (costApi.js ~1820) still gates only `roleLevel(caller) < 4 || caller === target` — so ANY authenticated user can delete THEIR OWN TOTP secret with zero re-verification (no current TOTP code, no password). On this auto-login + FileVault-off box, a stolen-but-idle session could disable 2FA on that account and re-enroll a fresh authenticator. Sprint S-2FA-RESET added an audit row to this endpoint but deliberately did NOT close the self-reset path (out of scope — filed here).
- **Acceptance**: pick one — (a) for the self path (`caller === target`) require a valid CURRENT TOTP code (or password step-up) in the body, verified server-side before deletion; OR (b) drop the self-reset branch entirely and route all resets through the SYS-only endpoint + `recover-sys-user.js`. Admin+ reset of OTHER users may stay as-is or also require step-up for symmetry with the new route. Keep the `TOTP_RESET*` audit. Tests: self-reset without code → 401/403; with valid code → ok; admin-resets-other → unchanged.
- **Effort**: S (~30 LOC + tests). **Priority**: P2 — genuine privilege-preservation gap on an auto-login box, but no UI invokes the legacy endpoint (curl-only), so not go-live-blocking. Close before broad multi-operator rollout. Cross-link Sprint S-2FA-RESET; use the new `reset-2fa` route (isSys + `checkPassword` step-up) as the reference pattern.
- **Fix** (option (a)): the self path now re-verifies before anything is deleted — a valid CURRENT TOTP code checked against the caller's own secret, OR the caller's password via `checkPassword`. Neither supplied or both wrong → **401 with the secret untouched** plus a `TOTP_SELF_RESET_FAIL` audit row, so a failed attempt leaves a trail. A re-verified self-reset removes the secret through the race-safe `updateTotpSecrets` helper (never a raw file op, mirroring the SYS `reset-2fa` route) and audits `TOTP_SELF_RESET`; admin+ resetting ANOTHER user is unchanged and keeps its existing `TOTP_SECRET_DELETED` row, so the two cases stay distinguishable in the log.
- **Status**: CLOSED 2026-07-22 (SHA: `03945d8` via PR #242). Found still marked OPEN on 2026-09-17 while triaging two 9-week-old stashes: `stash@{1}` held an independent WIP implementation of the SAME option (a), written 2026-07-13 and superseded by #242 nine days later. Compared line by line against `main` — `isSelf`, the code-or-password step-up, `TOTP_SELF_RESET_FAIL`, the distinct `TOTP_SELF_RESET` vs `TOTP_SECRET_DELETED` audit codes and the race-safe removal are all present — and the stash no longer applies (conflict at `costApi.js:1902`, the exact region #242 rewrote). Nothing in it is missing from main.

#### MES-3-FIX-62 — Reduce client bundle back under the pre-v1.6 perf budgets (shell code-split)

- **Source**: Sprint CI-TRUST (2026-07-21, P1-3). Making the chronic-red Lint job green unblocked the `build` job (it `needs: [lint, …]`, so it had been SKIPPED for a long stretch), which surfaced a hidden `perf-budget` overage: `index` (app shell) 458.8 kB / 320 kB v1.3 budget (146%), `HelpTab` 305 kB / 260 kB (120%), `StandardCalc` 196 kB / 200 kB (marginal). Root cause is legitimate multi-version growth (v1.3 → v1.6: alt-materials, snapshot, design tools, RFQ tracking, multi-drawing, lead-time) PLUS `App.jsx` eagerly importing BOTH `CostModule` and `PlanningModule` into the shell. Budgets were **re-baselined** to the honest v1.6 size + ~15% (`scripts/check-perf-budget.js`, gate stays ENFORCED) so CI is trustworthy now; this ticket is the real reduction.
- **Acceptance**: (1) Lazy-load `PlanningModule` (and any other rarely-first-paint surface) via `React.lazy` + `Suspense` so it leaves the `index` shell — operators land on Cost by default; Planning is a separate route. (2) Consider splitting the help `content.js` (6.8k LOC) so `HelpTab` loads its bilingual content on demand. (3) After each split, LOWER the corresponding budget in `check-perf-budget.js` back toward the v1.3 targets + comment the new honest number. (4) Verify `npm run build && npm run perf-budget` green at the tighter budgets; DMG smoke that Planning + Help still open. (5) No functional change — pure code-split.
- **Effort**: M (lazy-load wiring + re-measure + budget tightening + DMG smoke). **Priority**: P2 — post-go-live; the re-baseline already restored a trustworthy `build` gate, this reclaims first-paint. Cross-link Sprint CI-TRUST + the CI signal doc (required-vs-advisory).
- **Status note, 2026-09-30 — the first acceptance item is obsolete.** `PlanningModule` was removed outright by S-PLANNING-REMOVE (`5e386cc`, PR #245, 2026-07-22), which shrank the bundle by ~98 kB; `client/src/modules` now holds only `cost`, `help` and `home`. A session on 2026-09-29 read this ticket without checking and proposed "lazy-load PlanningModule" to Henry — a step that cannot be taken, which is why this note exists (Lesson 49: a ticket nobody re-checks decays). What is left: the shell (`index`) measured **532.7 of 550 kB (99.2%)** after #446, so the remaining levers are (2) loading the bilingual help content on demand and lazy-loading any first-paint surface that is not needed at first paint, measured chunk by chunk before choosing. Budgets move back down only as that lands.

#### MES-3-FIX-57 — `scripts/seed-admin.js` writes users.json to wrong path in dev workspace (missing `authService.init(DATA_DIR)`)

- **Source**: Surfaced 2026-06-17 during S-PRICING-COMBINED-P1 dev smoke. Ran `node scripts/seed-admin.js /tmp/seed.json` from repo root to reset the dev admin password; script reported `[seed-admin] sys user "administrator" reset. Seed file removed.` — but subsequent `curl -X POST /api/auth/login` returned `Invalid credentials`. Root cause via grep: seed-admin.js imports `{ updateUsers, bcryptHash } from '../server/services/authService.js'` and calls `updateUsers()` directly, but NEVER calls `authService.init(dataDir)` first. Inside authService, the path resolution chain is `USERS_DIR = path.join(LIB_DIR, 'Users')` where `LIB_DIR = path.join(dataDir, 'Library')` and `dataDir` is the arg to `init()`. With init never called, `USERS_DIR = ''` → `path.join('', 'users.json')` = `'users.json'` → relative to CWD. From repo root, that lands at `./users.json` (gitignored at line 54, so doesn't pollute commits) instead of `server/data/Library/Users/users.json` where the running server actually reads. Verified by `ls -lt ./users.json server/data/Library/Users/users.json` — seed-admin writes hit ONLY `./users.json` with fresh mtime; server data file untouched.
- **Why it works in production DMG**: the bundled Electron app's cwd happens to align with where authService expects to write (via the app role marker + electron's bootstrap). Dev cwd (`/Volumes/.../Ops-Control`) diverges from the data directory (`server/data/`), exposing the bug.
- **Acceptance**: (1) `scripts/seed-admin.js` calls `authService.init(DATA_DIR)` near the top of `main()` where `DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../server/data')` mirrors server/index.js boot-path resolution. (2) Add a smoke at the bottom: after `updateUsers()` succeeds, log the absolute path that was written (`console.log(\`[seed-admin] wrote: \${path.join(getDataDir(), 'Library/Users/users.json')}\`)`) so future dev-environment confusion surfaces immediately. (3) Bonus: parent server/index.js boot-path spawn (line 1285) suffers from a related race — child writes disk AFTER parent's in-memory cache loaded — but that's a separate issue (would need re-load-after-spawn or convert spawn to a sync in-process call). File only the init() fix here; the boot-race is its own MES-3-FIX-NN.
- **Effort**: XS (~5 LOC + smoke print + ticket). Test: run `node scripts/seed-admin.js path/to/seed.json` from repo root + verify `server/data/Library/Users/users.json` mtime advances + login curl returns 200.
- **Priority**: P3 — dev-only workflow bug; production DMG seed-admin works fine. Schedule alongside the next dev-environment cleanup pass (e.g. when MES-3-FIX-56 is picked up, since both touch developer-facing scripts).

#### MES-3-FIX-56 — Extract MaterialsSection / InksSection / ProcessesSection + dedup ~1,600 LOC from Cpx SubProductRow (Phase 3 of Std-tab consolidation)

- **Source**: Surfaced 2026-06-17 during Plan-agent audit before Sprint S-PRICING-COMBINED-P1 (the Combined sub-tab on Pricing Std). Key finding: Cpx's `SubProductRow.jsx` (~1,626 LOC) re-implements the same Materials + Inks + Processes rendering surface that already lives in `CalcMaterials.jsx` + `CalcInks.jsx` + `CalcProcesses.jsx` (collectively ~1,600 LOC). Row shapes are IDENTICAL between Std (`state.materials/inks/processes`) and Cpx (`state.subproducts[i].materials/inks/processes`); only the array path differs. Today both sides own separate JSX trees, separate cell formatters, separate picker wiring — duplication risk every time one side adds a column or fixes a bug (MES-3-FIX-40 ink `print_type` vs `print_type_list` confusion was a symptom of this drift). Phase 1 (PR shipping the Combined tab) intentionally uses composition (renders the 3 existing components stacked) to ship the operator surface fast without touching the duplication; Phase 2 retires the 3 originals when the soak period clears. Phase 3 = THIS ticket = the architectural fix.
- **Acceptance**: (1) Extract 3 new files `client/src/modules/cost/components/MaterialsSection.jsx` / `InksSection.jsx` / `ProcessesSection.jsx`, each accepting `{ kind: 'std' | 'sp', spi?: number }` props and routing dispatch through the kind-aware action choice (`kind === 'std' ? dispatch(SET_MATERIAL_FIELD) : dispatch(SET_SP_MATERIAL_FIELD)` — mirror-pattern per MES-3-FIX-53 / Sprint S-PACK-SHIP-PER-TIER lesson). (2) `CalcMaterials.jsx` / `CalcInks.jsx` / `CalcProcesses.jsx` thinned to ~10 LOC wrappers that mount `<MaterialsSection kind='std' />` etc. — preserves existing tab IDs + the `switch` in StandardCalc + the F1 routing + the 3 standalone help entries. (3) `SubProductRow.jsx` 3 inline blocks (Materials line ~648, Inks line ~1066, Processes line ~1341) replaced with the new shared components, dropping ~1,600 LOC. (4) `CalcCombined.jsx` (from Phase 1) optionally re-implemented to mount the Section components directly (cosmetic — composition pattern still works without the change). (5) `decimalInputBudget.lint.test.js` updated with budgets for the 3 new section files; old wrapper-file budgets lowered to 0. (6) Hardware-verified byte-identical rendering for Std (3 standalone tabs + combined tab) AND Cpx (multi-SP) on DMG. (7) Per-PR scope: one Section component per PR (3 PRs for extractions + 1 final PR wiring the deduped surface), mirrors S-SNAPSHOT 4-phase cadence operators already trust.
- **Effort**: M (3-4 days single sprint S-PRICING-SECTION-EXTRACT). Breakdown: extract Materials (1 day) → extract Inks (0.5 day) → extract Processes (0.5 day) → wire SubProductRow + verify Cpx byte-identical (1 day, biggest risk surface) → lint budget + help reconcile + DMG cycle (0.5 day).
- **Priority**: P2 — POST go-live (D-0 = 2026-07-21). Phase 1's composition approach already delivers operator surface; Phase 2 retires the duplicate tabs; the duplication only costs maintenance velocity, NOT operator experience. Schedule for the first sprint after the post-go-live soak period (proposed D+14 = 2026-08-04). Cross-link: Sprint S-PRICING-COMBINED-P1 audit + plan-agent report (in this CLAUDE.md history block above).

#### MES-3-FIX-55 — Desktop build scripts ship stale client/dist (build chain missing vite-build prereq)

- **Source**: surfaced 2026-06-17 during Sale-Owner-column hardware verify cycle. rc1 DMG (`72bd96e4…`) built from `sprint/sale-owner-col-position` baseline; Henry hardware-verified original column position (after NPI Owner). Then Henry requested column reorder; commit `5be2d1e` reordered the column on disk; `npm run build:server:mac` produced rc2 DMG (`07bfca25…`) WITHOUT rebuilding `client/dist`. Hardware verify of rc2: column still in OLD position. Diagnosed via `client/dist/assets/Summarize-*.js` mtime (08:20 = rc1 baseline, source edit was at 10:00+); manual `cd client && npm run build` → rc3 DMG (`a3909c08…`) with fresh bundle (hash `DhP-IwEK` vs rc1's `DYL2SEHc`) shipped reorder. **Root cause**: `scripts/build-mac-installers.mjs` + `scripts/build-windows-installers.mjs` only run electron-builder, which packages `client/dist` via the `extraResources` config block (`desktop/package.json`). No step in the chain triggers `vite build` — operator/CI must remember to rebuild client first. The trap is silent: build succeeds, DMG is byte-different (different role marker, different timestamps in zip metadata), self-checks pass — but UI changes don't ship.
- **Fix** (this branch, PR #159): inject a "Prebuild client bundle" step at the top of `main()` in BOTH installer scripts (Mac + Windows symmetry). Step runs `npm --prefix client run build` from repo root via existing `spawnP` helper; bails on non-zero exit per existing error-handling pattern. Skippable via `OPS_SKIP_CLIENT_REBUILD=1` env var (mirrors the existing `OPS_SKIP_NATIVE_OVERLAY_CHECK` emergency-override pattern from Lesson 28 / MES-3-FIX-19). Order: client rebuild → native overlay check → electron-builder loop. Client rebuild first because it's the most-likely-changed input and any failure should bail fast before the slower steps.
- **Tests**: no automated coverage — build scripts have no test surface in the repo. Hardware-verified by running `npm run build:server:mac` on this branch + confirming new console line "Prebuild: rebuilding client bundle (vite build)..." appears before the overlay check, and `client/dist/assets/Summarize-*.js` mtime advances per build (not stuck at the last manual `vite build`).
- **Effort**: XS (~10 LOC across 2 scripts + ticket + sprint history)
- **Priority**: P1 — surfaced during pre-go-live verify, will bite again during Day 8 cut-over rehearsal (2026-07-13) and Day 11 go-live (2026-07-21) when DMG cycles are tight. Fix now while context is fresh.

#### MES-3-FIX-54 — Login change-password silently fails for TOTP users + secondary Remember-me OFF token-read miss

- **Source**: surfaced 2026-06-17 during Sale-Owner-column verify session. Henry: "debug đổi pass ở ngoài màn login nhưng không được" (screenshot: Session Expired modal, Remember me checked, clicked "Change password" link, filled new password fields, clicked Sign in → "Sign in OK nhưng pass không đổi" — login succeeded but password didn't change). Root cause cross-verified per Lesson 7 (security-sensitive code, mandatory grep): `LoginPage.handleLogin` (pre-fix) POSTed `/api/auth/change-pwd` immediately after `await login()` regardless of `loginRes.totp_required`. For TOTP users, login() returns `{success: false, totp_required: true}` with a pre-TOTP session token; the change-pwd POST hits server with that token; `getSessionUser()` returns null (because `if (!s.totp_verified) return null` at `server/services/authService.js`) → 401. Client throws "Change password failed" + setError, but UI has already swapped to TOTP screen (LoginPage line 566 branch) which renders `totpError`, NOT `error` from login form. **Failure invisible**, user completes TOTP normally, enters app, password silently unchanged. **Secondary bug**: hand-rolled fetch in pre-fix handleLogin reads `localStorage.getItem('ops_token')` only. When Remember-me unchecked, `setToken` writes to sessionStorage (`api.js:65`) — hand-rolled fetch sees null token → 401 even in non-TOTP path. The existing `costApi.changePwd` helper (`api.js:504`) reads BOTH stores via `getToken()` (`api.js:34-42`) — unused by pre-fix LoginPage.
- **Fix** (hotfix branch `hotfix/login-change-pwd-totp-race`, PR #158): Approach A — defer change-pwd until after TOTP. New pure helper `client/src/components/Auth/loginChangePwdDispatcher.js` with `decideChangePwdDispatch({changeMode, oldPwd, newPwd}, loginResult)` returning 'noop' / 'change-now' / 'defer-until-totp' + `shouldDispatchAfterTotp(pending, verifyResult)` gate. `LoginPage.handleLogin` consults dispatcher: defer → stash `pendingPwdChange` in React state (NOT localStorage/sessionStorage — never persist new pwd). `LoginPage.runVerifyTOTP` (after verifyTOTP success) checks pending + dispatches via `costApi.changePwd` (replaces hand-rolled fetch, fixes secondary). Error surfaces inline on TOTP screen via `setTotpError` instead of silent swallow. `wrappedCancelTotp` clears pending so leaving TOTP doesn't silently apply old pending on next login. `wrappedCompleteTotpEnrollment` covers the rare first-login + must_change_password + enrollment-required path (dispatches after enrollment completes; errors surface via Toast since enrollment UI lacks error sink). New i18n keys `login.change.post_totp_failed` / `post_enroll_ok` / `post_enroll_failed` EN+VI parity. Server-side `/auth/change-pwd` TOTP gate UNCHANGED — Approach C (relax server) explicitly rejected per ticket spec to avoid weakening security (attacker with stolen pwd could rotate before TOTP cleanup).
- **Tests**: 14 vanilla node:test in `loginChangePwdDispatcher.test.js` mapping to spec items: A1 noop changeMode-off, A2 defer TOTP user (spec test 1), A3 change-now non-TOTP (spec test 2), A4 must_change_password+TOTP path (spec test 6), A5-A10 edge cases (null/undefined/conflict/precedence/no-trim), B1-B4 shouldDispatchAfterTotp gate. 1213/1213 client tests green (1199 baseline + 14). Bundle self-check via i18n strings — `post_totp_failed` + `post_enroll_failed` present in minified `index-*.js` confirming hotfix shipped.
- **Effort**: M (~80 LOC helper + ~140 LOC tests + ~80 LOC LoginPage edits + i18n + ticket)
- **Priority**: **P0 go-live blocker** — operators cannot rotate password from Login screen; only Settings → Change password works post-login. Hardware-verified on SERVER DMG before merge per Sprint S-D21 culture. `/security-review` on diff before merge per spec.

#### MES-3-FIX-53 — Cpx tier MOQ/EAU/Price writes to wrong state slice (CLOSED 2026-06-16, SHA: `6f3e0e8` via PR #155)

- **Source**: surfaced during Sprint S-PACK-SHIP-PER-TIER rc20 hardware verify (2026-06-16). Henry: "không tự convert price USD ↔ VND khi thêm MOQ, MOQ1 vẫn OK. chỉ bị ở Pricing (Cpx), Standard ok". Root cause: `ComplexCalc.jsx:1396` `updateExtraMoqWithRate` dispatched `SET_EXTRA_MOQ` for every Cpx tier input (moq / eau / price / price_vnd / target / target_vnd). The `SET_EXTRA_MOQ` reducer case (`calcReducer.js:516-520`) writes ONLY to `state.stdState.extra_moqs` — wrong slice for Cpx. **Visible symptom**: VND mirror never rendered (binding reads `cplxState.extra_moqs[i].price_vnd` which stayed undefined). **Hidden severity**: every keystroke went to stdState slice of an in-memory Cpx quote — DATA LOSS on save round-trip for Cpx tier price + EAU. Blame `449099d7` (PR #41, Sprint S-ALT-MAT, 2026-05-11) — pre-dates pack-ship sprint by 5 weeks; NOT introduced by it. DecimalInput's local string mirror masked the bug visually for the focused field session, so the issue went undetected for 36 days until pack-ship sprint's tier focus surfaced it.
- **Fix** (hotfix branch off main, separate from PR #154): new reducer action `SET_CPLX_EXTRA_MOQ` — mirror of `SET_EXTRA_MOQ` but targets `cplxState.extra_moqs` (clone-not-mutate: array new + element new). `ComplexCalc.jsx:1396` dispatches `SET_CPLX_EXTRA_MOQ` instead of `SET_EXTRA_MOQ`. Std's `SET_EXTRA_MOQ` contract untouched — 5 Std callsites in `CalcHeader.jsx` + `CalcMaterials.jsx` + `CalcProcesses.jsx` continue to use it. Pattern mirrors `SET_STD_TIER_PACKING_FIELD` / `SET_CPLX_TIER_PACKING_FIELD` split from Sprint S-PACK-SHIP-PER-TIER step 2.
- **Tests**: 12 red→green in `client/src/context/calcReducer.cplxExtraMoq.test.js`: slice routing (cplxState updated, stdState untouched), 6-field coverage (moq/eau/price/price_vnd/target/target_vnd), Std no-regress (SET_EXTRA_MOQ keeps targeting stdState), immutability (5 levels), legacy heal (cplxState without extra_moqs), and the severity-justifying DATA-LOSS round-trip test (operator types Cpx tier 1 price=0.2 + eau=80000 → `JSON.stringify(cplxState) → JSON.parse` → assert values survive on cplxState slice; this test fails RED pre-fix).
- **Effort**: S (~30 LOC reducer + ~150 LOC test + ticket); fix shipped post-DIAGNOSE in same session, hardware-verified rc22 → squash-merged.
- **Priority**: **P0 CLOSED** 2026-06-16 (SHA: `6f3e0e8` via PR #155). Data-integrity follow-up also CLOSED — see below.
- **Data-integrity follow-up — CLOSED 2026-06-16 (no affected data)**: Henry confirmed scope review. The risk window 2026-05-11 (PR #41 ship) → 2026-06-16 (#155 merge) contains **zero** saved Cpx multi-tier quotes (≥2 tier, with price entered at tier > 0). Reason: pre-go-live (CCL Vietnam Hai Duong D-0 = 2026-07-21), all activity is test-only; 7 production operators not yet on the system. Std + Cpx single-tier quotes never hit the buggy code path. **No audit, no back-fill, no remediation script needed.** Forward-fix via PR #155 is sufficient. If post-go-live operators ever surface a Cpx multi-tier quote with mysterious blank tier prices that pre-dates 6f3e0e8 install, reopen this ticket for one-off investigation — but the systematic data-integrity question is fully closed.

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
