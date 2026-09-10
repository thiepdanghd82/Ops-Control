# D-1 Pre-flight Audit — 2026-06-08

> Engineer-driven re-check of D-6 audit's 8 P0 + 13 P1 findings.
> Closures vs main HEAD `f33d5c8` as of 2026-06-08 morning.
>
> **Scaffold prefilled from PROMPT chain merge history.** Engineer
> re-verifies prod-side rows during 13:00-15:00 D-1 self-check.

> **Role clarification (2026-05-25 discovery)**: At CCL Vietnam Yen Phong, "Sysadmin" is a functional role held by the Lead Engineer (Đặng Thế Thiệp), not a separate person. Wherever this audit references "sysadmin Part B" or "sysadmin work", read as "Lead Engineer Part B" or "Lead Engineer work (sysadmin function)". Backup Engineer (Trần Thị Hương) covers BOTH engineering + sysadmin scope during incidents when Lead unreachable.

## P0 closures (8 total)

| #    | Finding                                    | Closed by                                         | Verify                                                                              |
| ---- | ------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P0-1 | Backup scheduler activation                | PR #74 + sysadmin Part B on prod (D-8)            | `ssh user@10.102.3.61 ls -lt server/data/Backup/SQLite/ \| head -3` shows file <24h |
| P0-2 | Off-site backup provisioning               | PR #74 .env block + sysadmin Part B cron (D-8)    | `OPS_OFFSITE_DRY_RUN=1 ./scripts/backup-offsite.sh` exits 0                         |
| P0-3 | UAT sign-off                               | D-1 morning UAT joint session (today 08:00-12:00) | `docs/uat/runs/2026-06-08-export-uat-summary.md` exists + PASS verdict              |
| P0-4 | CI green — Node 22 bump (MES-3-FIX-36)     | PR #68                                            | `gh run list --workflow=ci.yml --branch=main --limit=1`                             |
| P0-5 | BL-1 BOM scrap factor                      | **DEFERRED to v1.5.11** (scope-down)              | Planning module behind `OPS_FEATURE_PLANNING=0` flag; verify env var unset on prod  |
| P0-6 | Day-0 migration playbook                   | PR #72                                            | `docs/MIGRATION-DAY-0.md` exists                                                    |
| P0-7 | Training refresh                           | D-1 webinar 16:30 today                           | Attendance roster signed ≥18/20                                                     |
| P0-8 | Audit emit gap (quote save + library save) | PR #70                                            | `grep -c 'QUOTE_SAVE\|LIBRARY_SAVE' server/routes/costApi.js` ≥ 3                   |

## P1 closures (13 total)

| #     | Finding                                                        | Closed by                                    | Verify                                                                      |
| ----- | -------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| P1-1  | Kiosk OpDetail optimistic-revert snapshot                      | DEFERRED to MES-3 (MES-3-FIX-13 outstanding) | `stash@{4}` audit OR live fix verified; non-blocking for cutover            |
| P1-2  | deploy.ps1 snapshot patch                                      | PR #71                                       | `grep -c 'robocopy.*releases' deploy.ps1` ≥ 1                               |
| P1-3  | Fallback xlsx templates + import script (Runbook B executable) | PR #73                                       | `ls docs/cutover/templates/Fallback_*.xlsx scripts/import-fallback-xlsx.js` |
| P1-4  | Windows installer rebuilt from v1.5.10                         | PROMPT 9 Step 4 (engineer on Win host)       | `dir desktop\dist-electron\OpsControl-Server-v1.5.10*.exe`                  |
| P1-5  | Provision 13 ops + delete ops_test_user                        | D-7 sysadmin work (operator session)         | `users.json` shows 20 active + no `ops_test_user` row                       |
| P1-6  | PII handling policy (VN Decree 13/2023)                        | PR #75                                       | `ls docs/legal/pii-handling-vn.md`                                          |
| P1-7  | Data retention policy (Law on Acc. Art. 41)                    | PR #75                                       | `ls docs/legal/data-retention-policy.md`                                    |
| P1-8  | TOTP secrets excluded from backup tarball                      | PR #74                                       | `grep -c "exclude.*totp_secrets" server/services/backupScheduler.js` ≥ 1    |
| P1-9  | (audit identifier unused / merged into P1-1 cascade)           | —                                            | —                                                                           |
| P1-10 | (audit identifier unused / merged into P1-2 cascade)           | —                                            | —                                                                           |
| P1-11 | `OPS_KIOSK_KEY=` block in `.env.example`                       | PR #68                                       | `grep -c "OPS_KIOSK_KEY" .env.example` ≥ 1                                  |
| P1-12 | OPS_AUDIT_RETENTION configurable                               | PR #74 (.env block) + sysadmin Part B        | `grep -c "OPS_AUDIT_RETENTION" .env.example` ≥ 1                            |
| P1-13 | `Data for import/README.md`                                    | DEFERRED (post-go-live operator doc)         | Operator import flow self-documenting via Day-0 playbook §2                 |

## BL findings (baseline, non-P0/P1)

| #    | Finding                                  | Closed by                                        | Verify                                                            |
| ---- | ---------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| BL-1 | BOM scrap factor mis-mapped 81% of rows  | DEFERRED to v1.5.11 (P0-5 cascade)               | Planning behind `OPS_FEATURE_PLANNING=0`                          |
| BL-4 | No smoke quote validation for calcEngine | PR #76 (scaffold) + D-6 PM operator-fill session | `docs/uat/smoke-quotes/2026-06-09-baseline.md` exists with values |

## Outstanding findings (snapshot at D-1 morning)

Operator + engineer verify before 17:00 ICT go/no-go meeting:

- [ ] P0-3 UAT verdict (depends on morning session outcome)
- [ ] P0-7 Webinar attendance count (depends on afternoon session)
- [ ] P1-4 Win EXE upload (depends on PROMPT 9 Step 4 + 5)
- [ ] P1-5 Operator account count + ops_test_user deletion on prod (verify via SSH)
- [ ] BL-4 Smoke quote baseline values (depends on D-6 PM operator-fill session)

## Verdict

- [ ] All 8 P0 closed → GO criteria #1 met
- [ ] 1+ P0 open → flag in go/no-go meeting (PM has final ship authority)

## Companion docs

- Source: `docs/cutover/READINESS_AUDIT_D-6_2026-05-24.md`
- Closure tracker: this file
- Final checklist: `docs/cutover/D-1_FINAL_CHECKLIST_2026-06-29.md`
- UAT D-1 summary: `docs/uat/runs/2026-06-08-export-uat-summary.md`
- 8-day cutover plan: `docs/cutover/8-DAY-CUTOVER-PLAN-20260522.md`
- Schedule decision: `docs/cutover/SCHEDULE_DECISION_2026-05-24.md`
- Rollback runbook: `docs/cutover/ROLLBACK-RUNBOOK-20260522.md`
