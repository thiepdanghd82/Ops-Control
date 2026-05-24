# 8-Day Cutover Plan — Ops Control v1.5.10

**Plan date**: 2026-05-22 (D-8) | **Go-live**: 2026-05-30 (D-0) | **Buffer**: D+1 (2026-05-31)
**Scope decision**: Ship **Sales + Costing + Quote Export + Kiosk MES + Library + Auth/Backup**. **Defer Planning** (Work Orders, BOM Explosion, Material Check) **to v1.5.11** behind `OPS_FEATURE_PLANNING=0` feature flag.
**Site**: CCL Design Vietnam, Yen Phong factory. 20 operators. Factory LAN.

> **Reading order**: 1) this plan, 2) `GO-LIVE-AUDIT-REPORT-v1.2-20260522.md` for findings rationale, 3) `ROLLBACK-RUNBOOK-20260522.md` for emergency procedures.

---

## OWNERS & ROLES

| Role            | Name                              | Coverage                                          | Languages      |
| --------------- | --------------------------------- | ------------------------------------------------- | -------------- |
| Lead Engineer   | Đặng Thế Thiệp                    | D-8 → D+7 (full window)                           | EN + VN native |
| Sysadmin / IT   | <to be named by Yen Phong>        | D-4 → D+3                                         | VN native      |
| Backup Engineer | <to be named D-4>                 | D-3 → D+7 on-call                                 | bilingual      |
| Sales Lead      | <to be named>                     | D-4 customer comms, D-0 onward operator interface | VN native      |
| Plant Manager   | <to be named>                     | D-2 sign-off                                      | VN native      |
| QA / Operator   | Đặng Thế Thiệp + 1 floor operator | D-3 to D-5 UAT execution                          | bilingual      |

**Daily standup**: 09:00 ICT (Zalo voice call) on D-8 through D-0; then 08:00 + 18:00 D+1 through D+7.

---

## DAY-BY-DAY PLAN

### D-8 — 2026-05-22 (Friday) — Audit + scope-down + plan socialisation

**Owner**: Lead Engineer | **Output**: this plan + audit report committed; scope-down email sent

| Time  | Action                                                                                   | Output                                       |
| ----- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| 14:00 | Run 8-agent pre-go-live audit (this audit)                                               | `GO-LIVE-AUDIT-REPORT-v1.2-20260522.md`      |
| 17:00 | Commit audit + plan + rollback docs to repo                                              | `git push origin fix/multi-tier-export-rows` |
| 18:00 | Send scope-down email to Plant Manager + Project Lotus contractor with executive summary | email sent                                   |

**Risk gate**: Audit report executive summary delivered to stakeholders by EOD.

---

### D-7 — 2026-05-23 (Saturday) — CI repair + audit emit + .env.example

**Owner**: Lead Engineer | **Output**: CI green on `fix/multi-tier-export-rows`

Morning (4h):

- [ ] Bump `.github/workflows/ci.yml` `node-version: '20'` → `'24'` everywhere (closes MES-3-FIX-36)
- [ ] Add `cd apps/kiosk && npm ci` before kiosk vitest leg in `test-server` job (closes MES-3-FIX-37)
- [ ] Add `OPS_KIOSK_KEY=` block to `.env.example` mirroring `OPS_TOTP_KEY` block (closes P1-11)
- [ ] Run `npm run fix` to auto-fix 122 ESLint errors; manually address 5-10 real ones (control-regex chars in `chatMentions.js`, `sanitize.js`; misleading char class in `importTypeCoerce.js`)
- [ ] Cherry-pick `stash@{4}` kiosk OpDetail revert hunk (NOT the server HSTS half — already in HEAD): `git checkout stash@{4} -- apps/kiosk/src/routes/OpDetail.jsx` → review → commit
- [ ] Drop stale stashes: `git stash drop stash@{3}` (superseded), `git stash drop stash@{5}` (would downgrade desktop 1.5.9→1.3.0)
- [ ] Cut protective branch for stash@{0}: `git stash branch keep/stash-0-anti-flash-ink stash@{0}` (does not pop — creates branch from stash base)
- [ ] Push branch; open PR #56 to `main`

Afternoon (3h):

- [ ] Add `audit('QUOTE_SAVE', cu.username, ip, JSON.stringify({id, type, version, label}))` post-`upsertQuote` in `server/routes/costApi.js:2317-2358` (closes P0-8a)
- [ ] Add per-key audit emit inside `/save-all` success branch at `server/routes/costApi.js:1851-2167` with summary `{key, before_row_count, after_row_count, removed_unknown_keys}` (closes P0-8b)
- [ ] Add 3 tests: quote save emits audit, library save emits audit, no double-emit
- [ ] Run `npm test` locally on Node 24 — expect 816+ server / 800+ client / 53 kiosk all green
- [ ] Push commit; wait for CI green on PR #56

**Risk gate**: CI green on PR #56. If still red, halt before D-6 and triage.

---

### D-6 — 2026-05-24 (Sunday) — Migration playbook + data provenance + smoke quotes

**Owner**: Lead Engineer + Sales Lead | **Output**: `docs/MIGRATION-DAY-0.md` + 3 smoke quotes + Library provenance doc

Morning (4h):

- [ ] Write `docs/MIGRATION-DAY-0.md` with 7-step checklist (closes P0-6):
  1. Take baseline backup on empty fresh install
  2. Rsync `Data for import/data/Library/* → server/data/Library/`
  3. `chmod 600` on Users/ + TOTP secrets
  4. `node scripts/migrate-to-sqlite.js --dry-run` for parity report
  5. `--commit` and verify SQLite tables populated
  6. Run `npm run preflight` (must pass)
  7. Manual smoke: Quote History loads ≥ N quotes, Materials tab shows ≥ N rows, Rate dropdown lists 7 sites
- [ ] Owner-of-record per Library entity:
  - MaterialCost: NPI lead
  - Rate: Finance lead
  - MachineProfiles: Production lead
  - PermissionGroups: sys
  - IFS_Inventory: NPI lead (mirror from IFS export)
- [ ] Add `Data for import/README.md` with IFS extract date + source query + columns expected + engineer who validated (closes P1-13)
- [ ] Tag current `server/data/Library/` snapshot: `git tag data-seed-2026-05-30` (for diff against future imports)

Afternoon (4h):

- [ ] Pick 3 reference quotes from operator's pre-system Excel set (1 Std Flexo, 1 Cpx Indigo subproduct, 1 multi-tier MOQ)
- [ ] Re-enter each in v1.5.10 staging build
- [ ] Capture expected output: GM%, VA, SP, MOQ break-points, BD*MAT*_, BD*INK*_, BD*PROC*\* aggregates
- [ ] Save under `docs/uat/smoke-quotes/2026-05-30-baseline.md`
- [ ] Diff calcEngine output vs expected — flag any >0.5% delta for engineer review (closes BL-4)

**Risk gate**: ≥1 smoke quote produces numbers matching Excel within 0.5%. If all 3 fail, calcEngine has regression — halt and triage. If 1 of 3 fails, deep-investigate that variant.

---

### D-5 — 2026-05-25 (Monday) — Fallback xlsx templates + import script + deploy.ps1 snapshot patch

**Owner**: Lead Engineer + Sysadmin | **Output**: fallback infrastructure + Windows rollback capability

Morning (4h):

- [ ] Create `Fallback_Quote_Manual_v1.0.xlsx` — clone xlsx workflow currently used by NPI team
- [ ] Create `Fallback_WorkOrder_Manual_v1.0.xlsx` — RFQ-ID, Customer, CCL_PN, MOQ, Status, Stage, Assigned-To, Date
- [ ] Place both on Yen Phong shared folder `\\server\OpsControl\Fallback\` with operator write perms
- [ ] Print 5 paper copies each, place at supervisor desk per shift

Afternoon (4h):

- [ ] Write `scripts/import-fallback-xlsx.js` (~150 LOC + 5 tests):
  - Read both xlsx via `xlsx` package (already in deps)
  - POST `/api/quotes` per row with `_version=0`
  - POST `/api/planning/v2/work-orders` per row (gated behind `OPS_FEATURE_PLANNING=1` — won't run on v1.5.10 by default; quote import always runs)
  - Print rejected rows for supervisor manual fix
- [ ] Dry-run test with 5 fake rows → confirm 5 quotes land in DB (closes P1-3)
- [ ] Patch `deploy.ps1` to snapshot Windows server before rsync (closes P1-2):
  ```powershell
  # Add before existing rsync block:
  $TS = Get-Date -Format yyyyMMdd-HHmmss
  ssh $Remote "if not exist C:\opt\ops-control\releases mkdir C:\opt\ops-control\releases"
  ssh $Remote "robocopy C:\opt\ops-control C:\opt\ops-control\releases\$TS /E /XD releases data node_modules /R:1"
  # Retention pass: keep 5 newest
  ssh $Remote "(Get-ChildItem C:\opt\ops-control\releases -Directory | Sort-Object Name -Descending | Select-Object -Skip 5) | Remove-Item -Recurse -Force"
  ```
- [ ] Test snapshot+rollback drill on staging Windows box (deliberately bad deploy → rollback in <10 min)
- [ ] Provision remaining 13 operator accounts via Sprint 1.5 provisioning-card flow (closes P1-5)
- [ ] **DELETE `ops_test_user`** from prod `users.json` (closes P1-5 god-mode backdoor)

**Risk gate**: Rollback drill completes in <10 min. Fallback xlsx import test passes for 5 fake rows.

---

### D-4 — 2026-05-26 (Tuesday) — Backup activation + off-site + customer comms + sign-off chase

**Owner**: Sysadmin + Sales Lead + Lead Engineer | **Output**: backup running, off-site provisioned, customers notified

Morning (4h):

- [ ] Sysadmin SSH to prod (`10.102.3.61`):
  - Verify `.env` has all 4 required keys (`OPS_TOTP_KEY`, `OPS_KIOSK_KEY`, `OPS_EXPORT_HMAC_KEY`, plus `OPS_DB_PATH`)
  - Add to `.env`:
    ```
    OPS_BACKUP_SCHEDULE=1
    OPS_BACKUP_HOUR=2
    OPS_BACKUP_RETENTION_DAYS=30
    OPS_AUDIT_RETENTION=1
    TZ=Asia/Ho_Chi_Minh
    OPS_DB_PATH=C:\opt\ops-control\data\ops.db
    ```
  - Add new npm script to `package.json` (already on D-7 PR or add now):
    ```json
    "backup:run": "node -e \"import('./server/services/backupScheduler.js').then(m=>m.runBackupCycle({force:true}).then(s=>{console.log(JSON.stringify(s,null,2)); process.exit(s.ok?0:2);}))\""
    ```
  - Run `NODE_ENV=production node scripts/preflight-env.js` → must exit 0 (closes P0-1 prereq)
  - Manual force backup: `npm run backup:run` → verify file at `server/data/Backup/SQLite/ops_<ts>.sqlite` + `server/data/Backup/Library/library_<date>.tar.gz`
  - Run `npm run verify-backup` → exit 0 (closes P0-1)
- [ ] Provision off-site backup (closes P0-2):
  - USB external drive (minimum) or NAS (preferred) physically at Yen Phong
  - Set `OPS_OFFSITE_TARGET=<path>`
  - Cron `30 2 * * *` runs `scripts/backup-offsite.sh`
  - Dry-run: `OPS_OFFSITE_DRY_RUN=1 ./scripts/backup-offsite.sh` shows correct target
- [ ] Add `--exclude='Library/Users/totp_secrets*'` to tar command in `backupScheduler.js:124-129` OR document in MAINTAINERS that restore requires same `OPS_TOTP_KEY` (closes P1-8). Print + safe-store the `OPS_TOTP_KEY` value in factory safe.
- [ ] Identify second engineer (backup on-call); brief on recovery playbook; share Zalo group (closes P1-9)

Afternoon (3h):

- [ ] Sales Lead sends pre-cutover email to all customers (closes part of P0 ops):
  > "Starting 2026-05-30, your quote PDFs will include enhanced tamper-protection features (digital watermark + integrity signature). Quote format remains the same; visual change is a small 'CUSTOMER COPY' label on each sheet. No action required."
- [ ] Email Plant Manager requesting sign-off on (a) go-live date, (b) Excel-fallback policy, (c) parallel-run plan (closes P1-10)
- [ ] Write `docs/legal/pii-handling-vn.md`: inventory all PII fields (`end_cu`, `direct_cu`, `npi_owner`, `sale_owner`), storage location, retention, access controls, data-subject contact (closes P1-6)
- [ ] Write `docs/legal/data-retention-policy.md`: 10-yr scope for cost/quote per Law on Accounting Art. 41, 5-yr for production per Civil Code 608/2015 (closes P1-7)

**Risk gate**: backup file <24h old on prod; off-site rsync round-trip verified; PII + retention docs committed.

---

### D-3 — 2026-05-27 (Wednesday) — UAT day 1 (functional)

**Owner**: QA + Lead Engineer | **Output**: UAT scenarios SCN1-SCN5 executed + signed

Morning (4h) — execute `docs/uat/uat-export-flow.md` scenarios on staging:

- [ ] SCN1 — Single-tier Std export, internal variant: customer-name field hidden, all rows compute correctly
- [ ] SCN2 — Single-tier Std export, customer variant: Ref Price + Tool Cost + Tool Life hidden, watermark visible
- [ ] SCN3 — Sheet protection cross-platform: Mac Excel, Win Excel, LibreOffice — wording acceptable on all
- [ ] SCN4 — Quote History → Copy → Save creates new quote with copied state intact
- [ ] SCN5 — TOTP enroll + login + lockout flow

Afternoon (3h):

- [ ] Triage findings; classify P0/P1/P2
- [ ] If 0 P0 found: continue to D-2
- [ ] If P0 found: halt + emergency fix; re-test before proceeding

**Risk gate**: SCN1-5 all PASS or have only documented P2 (cosmetic). Any unfixable P0 = NO-GO escalation.

---

### D-2 — 2026-05-28 (Thursday) — UAT day 2 (multi-tier + Cpx + reconciliation)

**Owner**: QA + Lead Engineer | **Output**: UAT SCN6-SCN8 + sign-off doc

Morning (4h):

- [ ] SCN6 — Multi-tier zip export: crack 4 xlsx files, confirm Materials!E5 numerically differs MOQ1 vs MOQ2 (proves `dedff4a` end-to-end) — closes P0-7 verification
- [ ] SCN7 — Complex (Cpx) export with 2 subproducts × 2 tiers: 4 per-SP per-tier matrix sections render
- [ ] SCN8 — Alt-Materials toggle: Std + Cpx + per-tier override; Quote History badge reflects state

Afternoon (3h):

- [ ] Commit `docs/uat/runs/2026-05-28-export-uat-summary.md` with: scenarios passed, bugs found, customer feedback, ship decision (closes P0-3)
- [ ] Plant Manager email sign-off received (closes P1-10)
- [ ] Bump version to `1.5.10` in root + client + desktop + UI strings
- [ ] Merge PR #56 to `main`
- [ ] Tag `v1.5.10`: `git tag -a v1.5.10 -m "v1.5.10 — go-live build (multi-tier export P0 + audit emit + CI fix)"`
- [ ] Push tag: `git push origin v1.5.10` → triggers CI build-installers job (Mac arm64)
- [ ] Manually build Windows installer on Windows host: `cd desktop && npx electron-builder --win --x64` (closes P1-4 — fresh Win installer with multi-tier fix)
- [ ] Upload BOTH installers + both `latest*.yml` to `<DATA_DIR>/../updates/` on prod box
- [ ] **`mkdir C:\opt\ops-control\updates`** if not exists (closes P2-8)

**Risk gate**: signed UAT artifact committed; v1.5.10 tag + both installers built + uploaded; plant manager sign-off email received.

---

### D-1 — 2026-05-29 (Friday) — Production deploy + training refresher + final checks

**Owner**: Sysadmin + Lead Engineer + Trainer | **Output**: prod is on v1.5.10; all 20 operators trained on changed UI

Morning (4h):

- [ ] **Take fresh full-DB backup BEFORE deploy**: `npm run backup:run` on prod
- [ ] Verify backup file <30 minutes old at expected path
- [ ] Run `deploy.ps1 user@10.102.3.61`:
  - Snapshot to `releases/<ts>/` (new patch from D-5)
  - rsync local working tree to remote
  - NSSM stop → swap → start
  - Run `npm run preflight` post-restart — must exit 0
- [ ] Verify `/health` returns 200 + `/ready` returns `db_ok=true`
- [ ] Pair all 4 kiosks (issue fresh tokens via planner → kiosk redeem)
- [ ] Smoke test on prod: 1 quote save (Std + Cpx) + 1 multi-tier export download → open in Excel, verify per-tier cells differ
- [ ] Regenerate `OpsControl_UserGuide.docx`: `node scripts/help/build-user-guide.mjs` → confirm published to `client/dist/help/`
- [ ] Print 20 cheat-sheets per shift (3 shifts × 20 ops × 1 page = 60 cheat-sheets), laminate, place at each kiosk + workstation

Afternoon (3h):

- [ ] **16:30 — Refresher webinar 30 min (EN+VN simultaneous, recorded)** (closes P0-7). Cover:
  - HomePage navigation (NEW — was Standard tab default)
  - Quote Export toolbar button (NEW)
  - Alt-Materials toggle on Std + Cpx (NEW)
  - Multi-tier MOQ break-points + export-per-tier (NEW)
  - KPI tile color coding + delta interpretation (CHANGED)
  - Sidebar mini-collapse (240px ↔ 64px rail) (CHANGED)
  - F1 = contextual help (REMINDER)
  - Connection-banner red = save will fail (REMINDER)
- [ ] Capture attendance roster with name + signature (Vietnamese labor-law due-diligence)
- [ ] Distribute Zalo group invite "OpsControl GoLive 2026-05-30" to all 20 operators + 2 engineers + sysadmin
- [ ] Pin Connection-banner test: deliberately stop ops-control NSSM for 30s on staging → operator confirms red banner appears + recovers green on restart

**STASH FREEZE STARTS 00:00 ICT 2026-05-29**: all `git stash` operations on prod tree + dev boxes used for hotfixes are BANNED through 23:59 ICT 2026-05-31. Verify pre-cutover: `git stash list` on every box = empty (or only documented `keep/stash-0-anti-flash-ink` reference branch).

**Risk gate**: prod on v1.5.10, `/health` green for ≥15 min, refresher webinar attendance ≥18/20 operators, sign-off email from plant manager on file.

---

### D-0 — 2026-05-30 (Saturday) — GO-LIVE

**Owner**: Everyone on-site at Yen Phong

| Time  | Lead Engineer (EN)                                                                   | VN Engineer (on-floor)                       | Sales Lead                                                    | Remote on-call       |
| ----- | ------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------- | -------------------- |
| 06:00 | Server cold-start probe, `/health` + `/ready` + `/metrics`                           | Onboarding 6:30 shift operators at kiosks    | Standby                                                       | Standby              |
| 06:30 | Tail `journalctl -u ops-control -f`                                                  | First quote walk-through with sales operator | Take customer calls                                           | —                    |
| 09:00 | Manual midday backup trigger: `npm run backup:run`; verify via audit_log             | Coffee break — collect operator pain points  | First customer-quote send                                     | Engineering check-in |
| 12:00 | Shift change handoff EN role to remote on-call (lunch); on-floor VN engineer remains | Lunch handoff                                | —                                                             | Take over EN role    |
| 14:00 | `/ready` deep probe; review parallel-run discrepancy log so far                      | Second-shift onboarding                      | Track quotes-sent count vs Excel                              | Standby              |
| 17:00 | EOS backup verification; commit Day-0 incident log                                   | Wrap-up retro with operators (15 min)        | EOS reconciliation: diff today's Excel records vs Ops Control | —                    |
| 22:00 | Verify off-site rsync completed (cron 02:30 next day)                                | Sleep                                        | —                                                             | Verify webhook fires |

**Severity classification + SLA**:

- **Sev-1** (server down / cannot save quotes): on-floor engineer responds <2 min; if unresolved in 10 min, page lead engineer; if still down at 30 min, **revert to Excel for that shift** (parallel-run is safety net)
- **Sev-2** (one screen crashes, one kiosk offline): on-floor engineer triages <5 min, others keep working
- **Sev-3** (cosmetic, slow but functional): file ticket, address in evening hotfix window

**Risk gate**: `/health` 200 continuously for 4 hours starting 06:30. Any Sev-1 = pause + triage. Any 30-min outage = consider rollback (see runbook).

---

### D+1 to D+7 — 2026-05-31 to 2026-06-05 — Parallel run + stabilisation

**7-day parallel run with Excel** (per Ops Readiness recommendation):

- Days D+1 to D+3 (Sat–Mon): operators enter EVERY quote/RFQ in BOTH Excel and Ops Control. EOS sales lead diffs the two sources.
- Days D+4 to D+5 (Tue–Wed): Ops Control = primary; Excel = shadow only.
- Days D+6 to D+7 (Thu–Fri): spot-check 20% of records nightly. Zero discrepancies for 48 consecutive hours = parallel run ends.
- **2026-06-06 (D+7+1, Saturday)**: formal cutover. Archive Excel masters as read-only.

Daily checks (D+1 to D+7):

- 08:00 sysadmin: `/health`, last backup, disk free, audit_log row count
- 12:00 lead engineer + on-floor engineer 15-min sync
- 18:00 EOS retro + parallel-run diff
- 22:00 verify off-site rsync

**STASH FREEZE ENDS 23:59 ICT 2026-05-31** (3-day window covers D-1 + D-0 + D+1).

---

## DEPENDENCIES + CRITICAL PATH

```
D-8 audit → D-7 CI green + audit emit + stash@{4} kiosk
         ↘ D-6 migration playbook + smoke quotes
                  ↘ D-5 fallback xlsx + import script + deploy.ps1 patch + users provisioned
                         ↘ D-4 backup activation + off-site + PII docs + customer comms
                                ↘ D-3 UAT day 1 (SCN1-5)
                                       ↘ D-2 UAT day 2 (SCN6-8) + v1.5.10 tag + installers built
                                              ↘ D-1 prod deploy + webinar
                                                     ↘ D-0 GO
```

**Critical path**: D-7 CI fix → D-3/D-2 UAT execution. If UAT discovers a P0 on D-3 or D-2, the schedule has 0 buffer days. Pre-mitigation: D-7 work must be done thoroughly so D-6 onward is execution, not debugging.

---

## SUCCESS CRITERIA (verify at D-1 EOD)

| #   | Criterion                                                  | Target                                 | Verify by                                            |
| --- | ---------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| 1   | CI green on `main`                                         | All 7 jobs pass                        | GitHub Actions runs page                             |
| 2   | UAT sign-off committed                                     | `docs/uat/runs/2026-05-28-*.md` exists | `git log docs/uat/runs/`                             |
| 3   | Plant manager sign-off                                     | Email received                         | Sales Lead inbox                                     |
| 4   | Backup running on prod                                     | File <24h old                          | `ssh user@10.102.3.61 ls server/data/Backup/SQLite/` |
| 5   | Off-site backup verified                                   | rsync round-trip ok                    | `OPS_OFFSITE_DRY_RUN=1 ./scripts/backup-offsite.sh`  |
| 6   | v1.5.10 tag + both installers built                        | tag exists + DMG + EXE on `/updates/`  | `git tag --list v1.5.10` + dist-electron listing     |
| 7   | Operator training attendance                               | ≥18/20 attended webinar                | Signed roster                                        |
| 8   | All 20 user accounts provisioned + `ops_test_user` deleted | `users.json` shows 20 active           | `cat server/data/Library/Users/users.json`           |
| 9   | Cheat-sheets at every kiosk + workstation                  | Visual confirmation                    | On-site engineer photo                               |
| 10  | Stash list empty on all boxes                              | `git stash list` empty                 | Engineering sweep D-1 EOD                            |
| 11  | Multi-tier export P0 verified end-to-end on prod           | Materials!E5 differs MOQ1 vs MOQ2      | UAT SCN6 evidence + D-1 smoke                        |
| 12  | Audit emit verified for quote save + library save          | `audit_log` shows new event types      | SQL query post-smoke-quote                           |

**Go/no-go meeting**: D-1 (2026-05-29) 17:00 ICT. 12-point checklist must be all ✅. Any ❌ = escalate to plant manager for go/no-go decision.

---

## REQUIRED RUNTIME ARTIFACTS (post-D-1, pre-D-0)

Captured to `docs/audit/PRE-GOLIVE-SMOKE-20260529.md`:

- `npm run preflight` output (must exit 0)
- `curl http://10.102.3.61:3000/health` JSON
- `curl http://10.102.3.61:3000/ready` JSON
- `curl http://10.102.3.61:3000/metrics | head -50`
- `npm run verify-backup <latest-backup-file>` output
- `ls -la server/data/Backup/SQLite/` + `Library/`
- `git tag --contains HEAD` (must include v1.5.10)
- Stash sweep: `for box in dev prod; do ssh user@$box "cd /opt/ops-control && git stash list"; done`
- NSSM status: `nssm status ops-control` (Windows)
- 1 smoke quote PDF + corresponding multi-tier ZIP (4 xlsx) verified by hand

---

**End of plan. Companion documents:**

- `GO-LIVE-AUDIT-REPORT-v1.2-20260522.md` — full findings
- `ROLLBACK-RUNBOOK-20260522.md` — emergency procedures (software + operational fallback)
