# D-6 Readiness Audit — 2026-05-24 (Sunday)

**Audit time**: 2026-05-24 morning (D-6) | **Go-live**: 2026-05-30 (D-0) | **Days remaining**: 6
**Audit scope**: cross-check current `main` (`0e6edaf`) vs the 8-Day Cutover Plan + GO-LIVE-AUDIT-REPORT P0/P1 findings.
**Method**: read-only static check; no commands run on prod.

---

## 🚨 EXECUTIVE SUMMARY

**Verdict: 🔴 SCHEDULE DRIFT — D-7 AND D-6 PLAN ITEMS NEARLY 100% UNDONE.**

The 8-day cutover plan is now **~2 days behind schedule**. PRs that shipped 2026-05-23 to 2026-05-24 (#58, #61, #62, #63, #64) addressed adjacent concerns (multi-tier export, runtime dep audit, sprint history docs, cutover doc filing) — but **none of the 8 P0 audit findings were closed**, and **none of the D-6 deliverables exist**.

**Critical**: Rollback Runbook A + B are **both currently NON-EXECUTABLE** because their pre-conditions (D-5 deliverables) are not in place AND D-7 prerequisites (snapshot infra, audit emit, CI green) are also missing.

If go-live proceeds on schedule (2026-05-30) without compressing the missed work into D-5/D-4, the system ships with: no working backup, no automated audit emit on quote save, no operator account provisioning, no rollback path, and a CI safety net that has been red for >2 weeks.

**Risk classification**: **NO-GO trajectory unless ≥3 D-7/D-6 P0 items close by Tue 2026-05-26 EOD.**

---

## D-7 (Saturday 2026-05-23) — STATUS: ❌ ~10% complete

| Plan item                                               | Status                                                       | Evidence                                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Bump CI Node 20 → 24 (closes MES-3-FIX-36, P0-4)        | ❌ NOT DONE                                                  | `.github/workflows/ci.yml:20,40,58` still `node-version: '20'`                                      |
| Add `cd apps/kiosk && npm ci` for vitest (MES-3-FIX-37) | ❌ NOT DONE                                                  | No kiosk leg present in `test-server` job                                                           |
| Add `OPS_KIOSK_KEY=` block to `.env.example` (P1-11)    | ❌ NOT DONE                                                  | Only OPS_TOTP_KEY + OPS_EXPORT_HMAC_KEY mentioned                                                   |
| Run `npm run fix` for 122 ESLint errors                 | ❌ NOT DONE (assumed — cannot verify lint state without run) | —                                                                                                   |
| Cherry-pick `stash@{4}` kiosk OpDetail revert (P1-1)    | ❌ NOT DONE                                                  | `stash@{4}` still in list; `OpDetail.jsx:97` still uses `refresh()` not `prev` snapshot             |
| Drop stale stashes `{3}` + `{5}`                        | ❌ NOT DONE                                                  | Both still present                                                                                  |
| Create `keep/stash-0-anti-flash-ink` branch             | ❌ NOT DONE                                                  | Branch absent                                                                                       |
| Open PR #56 to main                                     | ⚠️ SUBSTITUTED                                               | PR #58 shipped (multi-tier export — was the implicit prerequisite); but other D-7 items NOT bundled |
| Add `audit('QUOTE_SAVE', ...)` post-upsertQuote (P0-8a) | ❌ NOT DONE                                                  | `costApi.js:2345` only emits `emitDataChange`, no `audit()`                                         |
| Add per-key audit emit in `/save-all` success (P0-8b)   | ❌ NOT DONE                                                  | `costApi.js:~2160` only emits `emitDataChange` per dataset                                          |
| Add 3 audit tests                                       | ❌ NOT DONE                                                  | (cascade from P0-8a + P0-8b)                                                                        |
| Run `npm test` on Node 24                               | ⚠️ UNVERIFIED                                                | Pre-existing CI broken; local not verifiable here                                                   |

**Risk gate FAILED**: "CI green on PR #56. If still red, halt before D-6 and triage." → CI is still red (per yesterday's session: 4/8 pre-existing fails). **Per plan we should have halted before D-6.**

---

## D-6 (Sunday 2026-05-24, TODAY) — STATUS: ❌ 0% complete

| Plan item                                                                        | Status      | Evidence                                |
| -------------------------------------------------------------------------------- | ----------- | --------------------------------------- |
| Write `docs/MIGRATION-DAY-0.md` (closes P0-6)                                    | ❌ NOT DONE | File absent                             |
| Owner-of-record per Library entity                                               | ❌ NOT DONE | (no docs deliverable)                   |
| Write `Data for import/README.md` (closes P1-13)                                 | ❌ NOT DONE | File absent                             |
| Tag `data-seed-2026-05-30` snapshot                                              | ❌ NOT DONE | `git tag --list` empty for this pattern |
| 3 reference smoke quotes + `docs/uat/smoke-quotes/2026-05-30-baseline.md` (BL-4) | ❌ NOT DONE | Directory absent                        |
| Diff calcEngine output vs Excel >0.5% delta check                                | ❌ NOT DONE | (cascade from above)                    |

**Risk gate FAILED**: "≥1 smoke quote produces numbers matching Excel within 0.5%." → No smoke quote runs exist.

---

## D-5 (Monday 2026-05-25, TOMORROW) — PRE-CONDITIONS MISSING

D-5 work cannot fully execute because:

| Plan item                                      | Pre-condition                     | Status                                                                      |
| ---------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `Fallback_Quote_Manual_v1.0.xlsx` template     | (none — net new)                  | ❌ Does not exist                                                           |
| `Fallback_WorkOrder_Manual_v1.0.xlsx` template | (none — net new)                  | ❌ Does not exist                                                           |
| `scripts/import-fallback-xlsx.js` (P1-3)       | (none — net new)                  | ❌ Does not exist                                                           |
| `deploy.ps1` snapshot patch (P1-2)             | Windows host access               | ❌ No `robocopy.*releases` block in deploy.ps1                              |
| Provision 13 more user accounts (P1-5)         | Sprint 1.5 provisioning-card flow | ⚠️ FLOW EXISTS but 13 accounts not provisioned (7/20 today)                 |
| DELETE `ops_test_user` from prod (P1-5)        | (none)                            | ❌ `ops_test_user role=sys` STILL in `server/data/Library/Users/users.json` |
| Snapshot+rollback drill on staging Win box     | `deploy.ps1` snapshot patch       | ⛔ BLOCKED on prerequisite                                                  |

**Impact**: Without Fallback xlsx + import script, **Rollback Runbook B is non-executable**. The Runbook itself states: "If any of these is missing on D-0 → Runbook B is NOT executable."

Without `deploy.ps1` snapshot patch, **Rollback Runbook A is non-executable** on prod (Windows). The Runbook itself states: "Pre-condition: deploy.ps1 snapshot patch from D-5 must be in place. Without it, no snapshot exists and Runbook A is impossible."

---

## D-4 (Tuesday 2026-05-26) — DEPENDENCY CHAIN

D-4 backup activation + off-site depends on:

- `npm run backup:run` script — ❌ NOT in `package.json` (D-7 deliverable, not done)
- `OPS_BACKUP_SCHEDULE=1 OPS_BACKUP_HOUR=2 ...` in prod `.env` — cannot verify (no prod access from audit); local `.env` has zero backup env vars
- `OPS_OFFSITE_TARGET` provisioning + cron — outside repo scope

Currently most recent SQLite backup is `manual-PRIMARY-20260522_144256.sqlite` from D-8. **No Library tarball directory exists** (`server/data/Backup/Library/` missing entirely). Backup verifier (`npm run verify-backup`) exists but has nothing recent to verify.

---

## D-3 to D-1 — Cascade failures

- **D-3 UAT day 1**: SCN1-5 cannot run because Quote Export pipeline (which UAT validates) ships in v1.5.10 — pre-conditions for prod deploy include CI green + audit emit + .env.example complete. None done.
- **D-2 UAT day 2 + v1.5.10 tag**: depends on D-3 sign-off + D-7 PR #56 merge. PR #56 hasn't been opened in the form the plan describes.
- **D-1 prod deploy + webinar + cheat-sheets**: training material refresh (P0-7) — `OpsControl_UserGuide.docx` last regenerated unknown; webinar not scheduled; cheat-sheets not designed.

---

## ROLLBACK READINESS — both runbooks non-executable today

### Runbook A (software rollback) — 🔴 BLOCKED

- ❌ `releases/` directory does not exist on prod (no snapshot infra; depends on `deploy.ps1` patch from D-5)
- ❌ `npm run backup:run` script not in `package.json` (referenced in Runbook A.4 verification + B.5 step 2)
- ✅ `scripts/recover-sys-user.js` exists (Runbook A admin recovery intact)

### Runbook B (operational fallback) — 🔴 BLOCKED

- ❌ `Fallback_Quote_Manual_v1.0.xlsx` does not exist anywhere in repo
- ❌ `Fallback_WorkOrder_Manual_v1.0.xlsx` does not exist
- ❌ `scripts/import-fallback-xlsx.js` does not exist
- ❌ Paper copies cannot be printed (no template to print from)

**Operator workflow during outage** (Section B.4 in runbook) tells supervisor to open `\\server\OpsControl\Fallback\Fallback_Quote_Manual_v1.0.xlsx` — **file does not exist**, so the runbook step is impossible.

---

## ACCESSIBILITY CHECK — operators cannot easily find cutover docs

- ❌ `README FIRST/*.md` does NOT reference `docs/cutover/*` — operators browsing repo won't discover the new docs
- ❌ Existing `docs/GO_LIVE_GUIDE.md` (Apr 27, v1.2) does NOT cross-reference the 3 cutover docs — anyone using the older guide as entry point misses the cutover pack
- ❌ No README or index file in `docs/cutover/` itself — anyone landing there sees 3 unsorted files
- ✅ Sprint history entry in CLAUDE.md (S-CUTOVER-DOCS-FILED) documents the trio for engineers

**Recommendation** (zero-risk doc edits): add 2-line cross-reference at top of `docs/GO_LIVE_GUIDE.md` and create `docs/cutover/README.md` with reading order.

---

## GREEN ITEMS — what IS in good shape

Not all is doom. These items are correctly in place:

| Item                                                                 | Status                                             |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| Multi-tier export P0 fix (PR #58) — the original trigger for go-live | ✅ Shipped, tested                                 |
| Runtime dep regression guard (PR #61, S-DEP-AUDIT)                   | ✅ Shipped — protects future against exceljs class |
| 3 cutover docs in repo (`docs/cutover/`)                             | ✅ Filed                                           |
| CLAUDE.md sprint history per Lesson 0 (PR #62 + #64 backfill)        | ✅ Complete                                        |
| Working tree clean                                                   | ✅                                                 |
| `scripts/recover-sys-user.js` (admin lockout recovery)               | ✅ Exists                                          |
| `scripts/preflight-env.js` (deploy gate)                             | ✅ Exists                                          |
| Multi-tier P0 verified in code (tierRows.js)                         | ✅                                                 |
| Engineer has bilingual coverage + on-floor coordination plan         | ✅ Documented                                      |

---

## RECOMMENDED ACTIONS (priority order, for engineer Mon 2026-05-25 onwards)

### 🔴 P0 — Must close by Tuesday 2026-05-26 EOD (D-4)

These 4 are foundational; without them, the rest cascades:

1. **CI Node 20 → 24 + kiosk vitest leg** (~1h). Closes MES-3-FIX-36 + 37 + restores CI signal. After merge: green CI on next PR. Without this, all subsequent PR safety net = manual review only.

2. **Audit emit for quote save + /save-all** (~3h, 30 LOC + 3 tests). Closes P0-8a + P0-8b. Forensic + compliance — operator cannot answer "who changed material cost?" without this.

3. **`OPS_KIOSK_KEY=` block in `.env.example`** (5 min). Closes P1-11. Without this, fresh prod deploy fails preflight with no doc hint.

4. **Delete `ops_test_user` + provision 13 more operators** (~3h). Closes P1-5 backdoor + makes go-live actually usable by 20 operators.

### 🟠 P1 — Must close by Wednesday 2026-05-27 EOD (D-3)

5. **`deploy.ps1` snapshot patch** (~2h, 30 LOC PowerShell). Closes P1-2. Without this, Runbook A is impossible.

6. **`scripts/import-fallback-xlsx.js` + 2 Fallback xlsx templates** (~6h). Closes P1-3. Without this, Runbook B is impossible.

7. **`docs/MIGRATION-DAY-0.md`** (~4h). Closes P0-6. Day-0 sysadmin checklist.

8. **3 reference smoke quotes baseline doc** (~4h). Closes BL-4. Without this, can't tell if calcEngine regressed during cutover migration.

9. **Backup scheduler activation on prod**: requires SSH access. Adds `.env` keys + verifies cron fires. Closes P0-1.

### 🟡 P2 — Nice-to-have before D-1

10. **Cross-reference cutover docs from `docs/GO_LIVE_GUIDE.md` + create `docs/cutover/README.md`** (~30 min). Zero risk; improves operator discoverability.

11. **Off-site backup provisioning** — out of repo scope (USB/NAS provisioning at Yen Phong).

12. **Refresher webinar slides** (D-1 morning material).

### Out-of-scope — defer to v1.5.11

- Planning module re-enable (BL-1 BOM scrap)
- Code-signing (P2-7)
- Mega-file refactor (P2-10)
- Audit tamper-evidence (P2-13)

---

## SCHEDULE COMPRESSION — engineer effort estimate

| Day                  | Original plan effort | Now-required effort (carrying drift) | Pad %    |
| -------------------- | -------------------- | ------------------------------------ | -------- |
| Mon 2026-05-25 (D-5) | 8h                   | 16h                                  | +100%    |
| Tue 2026-05-26 (D-4) | 7h                   | 10h                                  | +43%     |
| Wed 2026-05-27 (D-3) | 7h                   | 9h                                   | +28%     |
| Thu 2026-05-28 (D-2) | 7h                   | 9h                                   | +28%     |
| Fri 2026-05-29 (D-1) | 7h                   | 7h                                   | 0%       |
| **Total D-5 → D-1**  | **36h**              | **51h**                              | **+42%** |

**Reality check**: 51h over 5 days = ~10h/day sustained, weekend overtime probable. With only 1 named engineer (Đặng Thế Thiệp per plan) + unnamed backup, this is **above sustainable pace**.

**Two options for plant manager**:

1. **Authorize evening + Saturday work** for Mon-Wed (Thu-Fri must stay sustainable for cutover-day energy)
2. **Slip go-live by 3-5 days** (to 2026-06-02 or 2026-06-04) — buys breathing room; trade-off is customer notification rework + parallel-run window slides

---

## VERIFICATION REQUIRED ON PROD (sysadmin to confirm)

Static audit cannot verify these from repo state. Sysadmin must check:

- [ ] `npm audit --omit=dev` clean on `package-lock.json`
- [ ] `.env` on prod box has all required keys
- [ ] CI workflow ACTUALLY runs (vs being a stub)
- [ ] Backup files exist at `server/data/Backup/SQLite/` on prod (locally we see only 2 files, oldest May 4)
- [ ] `scripts/recover-sys-user.js` permissions correct (chmod 600 users.json)
- [ ] Off-site target writable from prod

---

## RECOMMENDED IMMEDIATE NEXT ACTIONS

For engineer (Đặng Thế Thiệp) Monday 2026-05-25 morning:

1. **08:00-09:00**: open PR with CI Node 24 bump + .env.example OPS_KIOSK_KEY + delete ops_test_user (all 3 are 1-hour combined; admin-merge with `--admin` flag per established pattern). Unblocks CI signal + closes 2 P0/P1 items.
2. **09:00-12:00**: write audit emit for `POST /api/quotes` + `/save-all` + 3 tests. PR + admin-merge. Closes P0-8.
3. **13:00-15:00**: write `docs/MIGRATION-DAY-0.md` from the audit's 7-step checklist. Commit to `docs/`.
4. **15:00-17:00**: SSH to prod, set `.env` backup keys, run `npm run backup:run` manually (write the npm script as part of step 2 PR), verify backup file lands. Closes P0-1.
5. **17:00-18:00**: provision 13 operator accounts via Sprint 1.5 flow. Closes P1-5.

Tuesday 2026-05-26 (D-4):

1. **AM**: write `scripts/import-fallback-xlsx.js` + 2 Fallback xlsx templates + dry-run test
2. **PM**: patch `deploy.ps1` snapshot block + run rollback drill on staging Win

After Tuesday EOD: **re-audit. If P0 count >0, escalate to plant manager for date-slip decision Wed morning.**

---

## CROSS-REFERENCES

- `8-DAY-CUTOVER-PLAN-20260522.md` — original day-by-day plan
- `GO-LIVE-AUDIT-REPORT-v1.2-20260522.md` — 8 P0 + 13 P1 source
- `ROLLBACK-RUNBOOK-20260522.md` — Runbook A + B pre-conditions
- `CLAUDE.md` Sprint history — recent PRs (#58 / #61 / #62 / #63 / #64) confirmed merged
- `CLAUDE.md` MES-3 Backlog — FIX-36/37/38/39 still OPEN

---

**End of D-6 readiness audit.** Read-only deliverable. No commits made by this audit. Decisions remain with Lead Engineer + Plant Manager.
