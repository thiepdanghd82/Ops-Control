# FIX 6 — WIP CLASSIFICATION REPORT

**Generated:** 2026-05-04
**Branch:** `fix/pre-go-live-p0` (12 commits ahead of main: 6 audit phase docs + STEP A + 5 Step B fixes)
**Snapshot anchor:** `wip-snapshot-20260504-082812` (git tag) + `/tmp/wip-backup-20260504-082812.tar.gz` (4.4 MB)
**Total WIP:** 42 entries (27 modified + 15 untracked)
**LOC churn:** ~2,214 ins / 775 del across modified files
**Sensitive scan:** ✓ no `.env*`, `.pem`, `.key`, secrets, `.swp`, `.bak`, `.DS_Store`, `~` patterns
**Group D (sensitive):** ⊘ empty — no red-flag files found

---

## Why are these here?

The branch `fix/pre-go-live-p0` was cut from the working tree of branch `feature/order-entry-fg-sync-and-import` (per session-start git context), which itself was downstream of an earlier UI redesign session. Two pre-existing themes of work were in progress when the audit pivot landed:

1. **B1 — Pre-audit UI redesign** (Sprint S-HOME 2026-05-03 + Dashboard/QuoteAnalysis pro re-skin + ERPAG-style ModuleLanding pattern)
2. **B2 — Order Entry FG sync & Excel import** (the branch name; multer-based bulk import + IFS Finished Goods catalog mapping fix)

Plus 6 verify-artifact screenshots saved to disk during Step B fix verification (Group A) and 6 ERPAG-survey research PNGs + assessment doc (Group B3).

---

## Group A — Tied to Step B P0 work (audit verify artifacts)

| #   | File                                                | Status | LOC/Size | Reason                            | Proposed action                                           |
| --- | --------------------------------------------------- | ------ | -------- | --------------------------------- | --------------------------------------------------------- |
| 1   | `docs/audit/screenshots/p0-f2-1-locale-en.png`      | ??     | 376 KB   | Fix 3 (F2-1) locale switch verify | **Commit** to `docs/audit/screenshots/` as audit-evidence |
| 2   | `docs/audit/screenshots/p0-f2-1-locale-vi.png`      | ??     | 374 KB   | Fix 3 (F2-1) locale switch verify | **Commit** ↑                                              |
| 3   | `docs/audit/screenshots/p0-f2-1-login-error-en.png` | ??     | 392 KB   | Fix 3 (F2-1) unified error verify | **Commit** ↑                                              |
| 4   | `docs/audit/screenshots/p0-f2-1-login-error-vi.png` | ??     | 392 KB   | Fix 3 (F2-1) unified error verify | **Commit** ↑                                              |
| 5   | `docs/audit/screenshots/p0-fix4-login-en.png`       | ??     | 376 KB   | Fix 4 (F3-3/F3-4) a11y verify     | **Commit** ↑                                              |
| 6   | `docs/audit/screenshots/p0-fix4-login-vi.png`       | ??     | 375 KB   | Fix 4 (F3-3/F3-4) a11y verify     | **Commit** ↑                                              |

**Subtotal:** 6 files, ~2.3 MB. Single commit:
`docs(audit-evidence): step b f2-1 + f3-3/f3-4 verify screenshots`

**Alternative:** delete (already documented textually in `STEP-B-fix-summary.md`). Decision is your call — value of keeping = future audit references can re-look without re-running Puppeteer; cost = 2.3 MB of binary diff in git history.

---

## Group B — Pre-audit feature work (separate-branch candidates)

### B1 — UI redesign (Sprint S-HOME + Dashboard/QuoteAnalysis pro reskin)

Cohesive feature: ERPAG-style sidebar (sections only) → click section → `ModuleLanding` shows tab cards → click card → tab opens. Plus Dashboard month/year picker + scroll fix + QuoteAnalysis professional redesign + new HomePage operator dashboard.

| #   | File                                             | Status | LOC delta           | Tier                                   |
| --- | ------------------------------------------------ | ------ | ------------------- | -------------------------------------- |
| 1   | `client/src/App.jsx`                             | M      | (small wiring)      | Core                                   |
| 2   | `client/src/components/Layout/Sidebar.jsx`       | M      | (sections-only nav) | Core                                   |
| 3   | `client/src/components/Layout/Sidebar.css`       | M      | (sections styling)  | Core                                   |
| 4   | `client/src/components/Layout/TopBar.jsx`        | M      | +127                | Core                                   |
| 5   | `client/src/components/Layout/TopBar.css`        | M      | +44                 | Core                                   |
| 6   | `client/src/components/Layout/ModuleLanding.jsx` | ??     | 81                  | Core (NEW component)                   |
| 7   | `client/src/components/Layout/ModuleLanding.css` | ??     | 110                 | Core                                   |
| 8   | `client/src/components/Layout/sectionDefs.js`    | ??     | 156                 | Core (data-driven sections)            |
| 9   | `client/src/i18n/strings.js`                     | M      | +26                 | i18n                                   |
| 10  | `client/src/i18n/domains/basis.js`               | M      | +6                  | i18n                                   |
| 11  | `client/src/modules/cost/CostModule.jsx`         | M      | +43                 | Wiring (landing route)                 |
| 12  | `client/src/modules/cost/tabs/Dashboard.jsx`     | M      | +484 ⚠ massive      | Dashboard redesign                     |
| 13  | `client/src/modules/cost/tabs/Dashboard.css`     | ??     | 235                 | Dashboard redesign                     |
| 14  | `client/src/modules/cost/tabs/QuoteAnalysis.jsx` | M      | +406 ⚠ massive      | QA redesign                            |
| 15  | `client/src/modules/cost/tabs/QuoteAnalysis.css` | M      | +306                | QA redesign                            |
| 16  | `client/src/modules/cost/tabs/PrintAreaCalc.jsx` | M      | +12                 | Small (likely incidental)              |
| 17  | `client/src/modules/home/HomePage.jsx`           | ??     | 325                 | Sprint S-HOME (NEW operator dashboard) |
| 18  | `client/src/modules/home/HomePage.css`           | ??     | 502                 | Sprint S-HOME                          |
| 19  | `client/src/modules/planning/PlanningModule.jsx` | M      | +42                 | Wiring (landing route)                 |
| 20  | `server/repositories/dashboardStats.js`          | M      | +52                 | Server-side for Dashboard redesign     |

**Subtotal:** 20 files, ~3,000 LOC.
**Proposed action:** create `feature/ui-redesign-home-erpag-landing` branch off `main`, cherry-pick or simple checkout these 20 files there, commit as a multi-step sprint (suggest 3-4 commits per natural feature seam).

⚠ **Risk:** Files 12 (Dashboard.jsx +484) and 14 (QuoteAnalysis.jsx +406) are the largest single-file diffs. Worth a dedicated review pass on those alone before merge.

### B2 — Order Entry FG sync & Excel import (current branch name's actual feature)

Cohesive feature: optional `orderNumber` (server auto-generates `ORD-{nextId}`) + multer Excel-import endpoint + IFS Finished Goods `Catalog No`/`Catalog Desc` mapping fix + number/string PN coercion.

| #   | File                                                    | Status | LOC delta | Tier                                    |
| --- | ------------------------------------------------------- | ------ | --------- | --------------------------------------- |
| 1   | `client/src/modules/planning/tabs/OrderEntry.jsx`       | M      | +358      | Core                                    |
| 2   | `client/src/modules/planning/tabs/OrderEntry.css`       | M      | +131      | Core                                    |
| 3   | `client/src/modules/planning/tabs/BOMExplosion.jsx`     | M      | +101      | Adjacent                                |
| 4   | `client/src/modules/planning/tabs/CapacityPlanning.jsx` | M      | +7        | Touch-up                                |
| 5   | `client/src/modules/planning/tabs/MaterialCheck.jsx`    | M      | +5        | Touch-up                                |
| 6   | `client/src/modules/planning/tabs/WorkOrdersLegacy.jsx` | M      | +5        | Touch-up                                |
| 7   | `client/src/utils/fieldMap.js`                          | M      | +8        | FG field mapping                        |
| 8   | `client/src/services/api.js`                            | M      | +31       | Excel-import client wrapper             |
| 9   | `server/repositories/index.js`                          | M      | +9        | Repo wiring                             |
| 10  | `server/routes/planning.js`                             | M      | +233      | multer + Excel import                   |
| 11  | `server/routes/shared.js`                               | M      | +26       | Shared helper                           |
| 12  | `server/services/dataSync.js`                           | M      | +55       | Number-vs-string PN fix (CLAUDE.md L21) |
| 13  | `server/services/planningStore.js`                      | M      | +3        | Auto orderNumber gen                    |
| 14  | `server/routes/planning.coerceDueDate.test.js`          | ??     | 58        | Test for due-date coercion              |
| 15  | `server/services/getProducts.test.js`                   | ??     | 91        | Test for FG catalog mapping             |

**Subtotal:** 15 files, ~1,120 LOC.
**Proposed action:** the branch name `feature/order-entry-fg-sync-and-import` already describes this work. Move these 15 files to that branch (or a fresh `feature/order-entry-fg-sync-and-import-v2` cut from `main`), commit as 2-3 logical commits (route+server, client UI, tests).

### B3 — Research/exploration artifacts

| #   | File                                          | Status | Size            | Tier                       |
| --- | --------------------------------------------- | ------ | --------------- | -------------------------- |
| 1   | `docs/erpag-survey/costing.png`               | ??     | 448 KB          | ERPAG market survey        |
| 2   | `docs/erpag-survey/product-details.png`       | ??     | 194 KB          | ERPAG market survey        |
| 3   | `docs/erpag-survey/products-and-services.png` | ??     | 581 KB          | ERPAG market survey        |
| 4   | `docs/erpag-survey/warehouse-management.png`  | ??     | 355 KB          | ERPAG market survey        |
| 5   | `docs/erpag-survey/work-orders.png`           | ??     | 415 KB          | ERPAG market survey        |
| 6   | `docs/reports/ops-control-v1.2-assessment.md` | ??     | 6.3 KB / 84 LOC | ERPAG migration assessment |

**Subtotal:** 6 files, ~2 MB.
**Proposed action:** these are **research notes** that don't belong on a P0 hotfix branch. Three options:

- (a) Commit to `main` directly via `docs(research): erpag survey + migration assessment` — they're additive, low-risk, and the assessment.md references the screenshots
- (b) Move to a `docs/erpag-research` branch
- (c) Leave on disk as "in-progress research" — they survive between branches via the working tree

Recommend **(a)** — commit straight to main is fine for additive docs/research.

---

## Group C — Cruft (delete candidates)

⊘ **Empty.** Sensitive scan + manual file inspection found:

- No tmp paths leaked
- No `.DS_Store` / `.swp` / `.bak` / `~` files
- No `node_modules` artifacts in tracked space
- No build outputs (dist/, .cache/) escaped gitignore
- No experimentation scratchpads

Every file has clear provenance to one of the 3 themes (Step B verify, UI redesign, Order Entry feature).

---

## Group D — Sensitive (RED FLAG)

⊘ **Empty.** No `.env*`, `*secret*`, `*credential*`, `*.pem`, `*.key`, DB dumps, or PII log files found in WIP.

---

## Summary by group

| Group                         | Files | LOC/Size                 | Disposition                                                                         |
| ----------------------------- | ----- | ------------------------ | ----------------------------------------------------------------------------------- |
| **A** Step B verify artifacts | 6     | ~2.3 MB binary           | COMMIT to current branch (or delete)                                                |
| **B1** UI redesign sprint     | 20    | ~3,000 LOC               | MOVE to `feature/ui-redesign-home-erpag-landing`                                    |
| **B2** Order Entry FG sync    | 15    | ~1,120 LOC               | MOVE to `feature/order-entry-fg-sync-and-import` (matches current branch base name) |
| **B3** ERPAG research         | 6     | ~2 MB binary + 84 LOC md | COMMIT to `main` as additive research docs                                          |
| **C** Cruft                   | 0     | —                        | (none)                                                                              |
| **D** Sensitive               | 0     | —                        | (none)                                                                              |
| **Total**                     | 47\*  | —                        | —                                                                                   |

\*Total slightly higher than 42 because B1 + B2 untracked sub-files were broken out of dir-level entries (e.g. `client/src/modules/home/` → 2 files, `docs/erpag-survey/` → 5 files).

---

## Recommended execution order (when approved)

1. **A first** (low risk, single commit on current branch) — keeps working tree state visible for B-disposition decisions
2. **B3 next** (commit to main is clean; doesn't entangle with feature work)
3. **B2 then** (move to feature branch matching current branch name; preserves Excel-import sprint as-was)
4. **B1 last** (largest, most complex; do after A+B2+B3 prove the migration mechanics work)

After all 4 dispositions: `git status` on `fix/pre-go-live-p0` should be clean, ready for Fix 7 + STEP D.

---

## NEXT — explicit approval gate

**Reply with one of:**

- `approve A only, hold B + decide later` — minimal first move; commit screenshots, leave 36 other files in WIP
- `approve A + B3` — also commit research docs to main
- `approve A + B2` — also move Order Entry feature; postpone UI redesign
- `approve all (A + B1 + B2 + B3)` — full disposition in this turn
- `adjust: <X>` — change a classification (e.g. "move PrintAreaCalc.jsx out of B1, it's a separate fix")
- `delete A instead of commit` — drop 2.3 MB of screenshots since text doc covers it
- `revert: full stop, restore stash` — back out, re-evaluate

⚠️ Until you reply with explicit approval, **zero destructive operations will run**. Snapshot tag + tarball remain in place.
