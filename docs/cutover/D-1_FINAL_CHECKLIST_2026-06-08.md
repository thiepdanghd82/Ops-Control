# D-1 Final Readiness Checklist — 2026-06-08

> 12-point go/no-go gate per `docs/cutover/8-DAY-CUTOVER-PLAN-20260522.md` §"Success criteria".
> Engineer ticks each item during 16:30-17:00 prep before go/no-go meeting.
> Plant Manager makes final ship decision.

## Criteria

| #   | Criterion                                         | Target                                                        | Verify by                                                  | Status  |
| --- | ------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- | ------- |
| 1   | CI green on main                                  | All 7 jobs pass OR known pre-existing fails only              | GitHub Actions runs page                                   | `<P/F>` |
| 2   | UAT sign-off committed                            | `docs/uat/runs/2026-06-08-*.md` exists with PASS              | `git log docs/uat/runs/`                                   | `<P/F>` |
| 3   | Plant Manager sign-off                            | Email received                                                | Sales Lead inbox                                           | `<P/F>` |
| 4   | Backup running on prod                            | File <24h old                                                 | `ssh user@10.102.3.61 ls server/data/Backup/SQLite/`       | `<P/F>` |
| 5   | Off-site backup verified                          | rsync round-trip OK                                           | `OPS_OFFSITE_DRY_RUN=1 ./scripts/backup-offsite.sh`        | `<P/F>` |
| 6   | v1.5.10 tag + both installers built               | tag exists + DMG + EXE on `/updates/`                         | `git tag --list v1.5.10` + dist listing                    | `<P/F>` |
| 7   | Operator training attendance                      | ≥18/20 attended webinar                                       | Signed roster                                              | `<P/F>` |
| 8   | All 20 user accounts + ops_test_user deleted      | `users.json` shows 20 active                                  | `ssh user@10.102.3.61 grep -c '"username"' .../users.json` | `<P/F>` |
| 9   | Cheat-sheets at every kiosk + workstation         | Visual confirmation                                           | On-site engineer photo                                     | `<P/F>` |
| 10  | Stash list empty on all boxes                     | `git stash list` empty (except `keep/stash-0-anti-flash-ink`) | Engineering sweep                                          | `<P/F>` |
| 11  | Multi-tier export P0 verified end-to-end on prod  | Materials!E5 differs MOQ1 vs MOQ2                             | UAT SCN6 evidence + D-1 smoke                              | `<P/F>` |
| 12  | Audit emit verified for quote save + library save | `audit_log` shows new event types                             | SQL query post-smoke-quote                                 | `<P/F>` |

## Go/no-go decision

- [ ] 12/12 PASS → **GO**
- [ ] 11/12 PASS, miss is P2/P3 (cosmetic) → **GO with note**
- [ ] 1+ critical FAIL → **NO-GO** — escalate to Plant Manager for date-slip decision

## Sign-off

- **Lead Engineer**: **\*\*\*\***\_\_\_\_**\*\*\*\*** Time: 2026-06-08 17:00 ICT
- **Plant Manager (final ship authority)**: **\*\*\*\***\_\_\_\_**\*\*\*\*** Time: \***\*\_\_\_\_\*\***
- **Backup Engineer (Trần Thị Hương — incident standby confirmed)**: **\*\*\*\***\_\_\_\_**\*\*\*\*** Time: \***\*\_\_\_\_\*\***
- **Sales Lead (customer comms confirmed)**: **\*\*\*\***\_\_\_\_**\*\*\*\*** Time: \***\*\_\_\_\_\*\***

## If GO: D-0 handoff (2026-06-09 06:00 ICT)

Per `docs/cutover/8-DAY-CUTOVER-PLAN-20260522.md` D-0 section:

- 06:00 server cold-start probe + `/health` + `/ready` + `/metrics`
- 06:30 first quote walk-through with sales operator
- 09:00 manual midday backup trigger
- 12:00 shift change handoff (EN role → remote on-call)
- 14:00 deep probe + parallel-run discrepancy review
- 17:00 EOS backup verification + Day-0 incident log commit
- 22:00 verify off-site rsync

**Sev-1 SLA**: on-floor engineer responds <2 min; if 30 min outage = revert to Excel for that shift.

## If NO-GO: escalation procedure

1. Document fail reason + impact in this file
2. Email Plant Manager + Sales Lead + Project Lotus contractor within 30 min
3. Propose new go-live date (suggest +3 to +5 days based on fail severity)
4. Reschedule customer comms via Sales Lead

## Companion references

- `docs/cutover/SCHEDULE_DECISION_2026-05-24.md` — 2026-06-09 schedule decision
- `docs/cutover/READINESS_AUDIT_D-6_2026-05-24.md` — original audit (P0/P1 baseline)
- `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` — Runbook A + B
- `docs/MIGRATION-DAY-0.md` — Day-0 prod deploy 7-step playbook
- `docs/uat/runs/2026-06-08-export-uat-summary.md` — UAT D-1 results
