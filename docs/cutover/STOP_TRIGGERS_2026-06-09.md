# STOP Triggers — Ops Control v1.5.10 Go-Live 2026-06-09

> Pre-commitment document. Lead Engineer self-binds to these triggers
> BEFORE cutover stress applies. If any trigger fires, HALT and
> rollback per Runbook A/B. Do NOT proceed under schedule pressure.
>
> **Status**: SIGNED — binding for Đặng Thế Thiệp during 2026-06-08
> to 2026-06-16 (D-1 through D+7 parallel-run end).

## Authority context

Plant Manager đã giao toàn quyền quyết định cho Lead Engineer cho cutover
này. Concentration of authority + execution = elevated personal
accountability. This document is pre-commitment to NOT abuse that
authority under pressure.

## STOP triggers — any 1 fires = HALT

### Technical triggers (engineer detects)

| #   | Trigger                                                                                                                                | Action                                                                                  | Recovery target                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| T1  | D-1 UAT P0 found, cannot fix in 2h                                                                                                     | HALT cutover. Slip 3-5 days.                                                            | Email Plant Manager within 1h.                          |
| T2  | D-0 06:00 `/health` fails continuously 15 min after restart                                                                            | HALT. Execute Runbook A rollback to v1.5.9.                                             | Restore service within 30 min.                          |
| T3  | D-0 first quote save returns data corruption signature (NaN, undefined, blank fields)                                                  | HALT all save operations. Investigate calcEngine before allowing resume.                | Confirm root cause within 1h.                           |
| T4  | D+1..D+3 parallel-run delta Excel-vs-system >5% on >3 quotes                                                                           | Halt active use. Switch to Excel-only until investigated.                               | Diff analysis within 4h.                                |
| T5  | Backup không run trên prod tối D-1 (`server/data/Backup/SQLite/` file >24h cũ)                                                         | HALT cutover. Backup MUST be running before any new data lands.                         | Sysadmin fix within 2h.                                 |
| T6  | Backup Engineer (Trần Thị Hương) unreachable >2h during active outage window WHEN Lead Engineer also unreachable (double-failure case) | HALT. Operate fallback xlsx per Runbook B. Plant Manager escalation via direct channel. | Recovery contingent on either Lead OR Backup reachable. |

### Operational triggers (anh self-detect)

| #   | Trigger                                                                       | Action                                                                          |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| O1  | Anh fatigue level: 6h sleep deficit cumulative over 3 days                    | Mandatory 12h rest before continuing. Delegate to backup engineer if available. |
| O2  | Anh stressed về go/no-go decision và cảm thấy "không chắc"                    | SLEEP. Decide sau 8h rest. Stress-of-the-moment decisions = bad decisions.      |
| O3  | Operator confidence visibly low at webinar D-1 (<14/20 understand the new UI) | Schedule additional 30-min walk-through D-0 06:30 before go-live.               |

### Compliance triggers

| #   | Trigger                                                                          | Action                                                    |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| C1  | Customer reports PDF tamper-detection warning unexpectedly                       | HALT new quote sends. Investigate watermark + HMAC logic. |
| C2  | Audit log shows unauthorized access pattern (e.g. ops_test_user trying to login) | HALT + emergency lockout. Confirm Issue #69 closure.      |

## Decision quality protocol

Before EVERY go/no-go decision in cutover week, ask:

1. **Reversibility**: nếu sai, recover được trong <1h không?
2. **Blast radius**: ai bị ảnh hưởng nếu sai? (chỉ mình anh / operators / customers)
3. **Sleep test**: nếu ngủ qua đêm rồi quyết lại, kết quả có khác không?

3 questions sai → DECIDE SLOWER. Nếu 3/3 đúng → proceed.

## Rollback decision tree

```
Trigger fires
     │
     ▼
Can fix in < 1h?
     │
   ┌─┴─┐
  YES   NO
   │     │
   ▼     ▼
 Fix +  HALT
 verify  │
   │     ▼
   │   Slip schedule
   │     │
   │     ▼
   │   Email PM + Sales Lead + customers
   │     │
   ▼     ▼
 Continue  New go-live date 3-5 days later
```

## Audit trail

When ANY trigger fires:

1. Timestamp + trigger ID logged to `docs/incidents/YYYY-MM-DD-<short>.md`
2. Email Plant Manager within 1h of HALT decision (per delegated authority terms)
3. Sales Lead notified for customer comms within 2h
4. Within 7 days: post-mortem document committed to repo

## Sign-off

- **Lead Engineer**: Đặng Thế Thiệp
- **Date signed**: 2026-05-25 (re-signed post-discovery; original 2026-05-24)
- **Authority basis**: Plant Manager verbal delegation 2026-05-24
- **Binding period**: 2026-06-08 (D-1) through 2026-06-16 (D+7 end of parallel run)
- **Decision**: AGREE all 11 triggers + T6 updated per Option B (sysadmin discovery)
- **T6 amendment reason**: Sysadmin = Lead Engineer (same person, no separate role at CCL Vietnam). Original T6 ("sysadmin unreachable") was tautological with implicit Lead-unreachable trigger. Amended T6 captures the actual failure mode: double-failure (both Lead AND Backup Engineer Hương unreachable) — Plant Manager direct-channel escalation is the only remaining recovery path.
- **Backup Engineer confirmed**: Trần Thị Hương (huongtt@cclind.com, +84988749869), SSH/NSSM/cron skills confirmed via phone 2026-05-25.

---

**Companion docs**:

- `docs/cutover/READINESS_AUDIT_D-6_2026-05-24.md` — original risk source
- `docs/cutover/SCHEDULE_DECISION_2026-05-24.md` — 2026-06-09 schedule
- `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` — Runbook A + B
- `docs/cutover/D-1_FINAL_CHECKLIST_2026-06-08.md` — 12-point go/no-go
