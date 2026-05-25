# Sysadmin Discovery Note — 2026-05-25

> Forensic record of a single-line discovery during D-15 Monday morning
> backup engineer onboarding that triggered a 3-PR cascade
> (PR #80 / #81 / #82) updating 11 cutover docs.

## Discovery context

| Field            | Value                                                               |
| ---------------- | ------------------------------------------------------------------- |
| Date             | 2026-05-25 (Monday, D-15 to go-live 2026-06-09)                     |
| Time (ICT)       | ~08:42 ICT (during Backup Engineer Hương onboarding call)           |
| Reported by      | Lead Engineer Đặng Thế Thiệp (`thiepdt@cclind.com`, `+84965191991`) |
| Audit context    | Agent walking through BACKUP_ENGINEER_BRIEF placeholder fills       |
| Trigger question | "Anh có số sysadmin không, hay cần gọi IT manager?"                 |
| Reply            | "Sysadmin là Lead Engineer luôn, Đặng Thế Thiệp"                    |

## The discovery

**At CCL Vietnam Yen Phong factory, there is NO separate sysadmin role.**
The Lead Engineer (Đặng Thế Thiệp) handles ALL of:

- Application engineering (calc engine, UI, server code)
- Sysadmin (SSH to prod box `10.102.3.61`, NSSM service mgmt, `.env` mgmt, cron/backup activation)
- DevOps (CI/CD, electron-builder, DMG/EXE packaging)
- Go/no-go decision authority (delegated by Plant Manager 2026-05-24)

The cutover documents (8-Day Plan, GO-LIVE-AUDIT-REPORT, ROLLBACK-RUNBOOK, MIGRATION-DAY-0)
were drafted earlier in the cycle assuming a typical 3-tier separation
(Eng + Ops + Mgmt) common in larger CCL Design sites — but at the Yen
Phong startup factory, all 3 are one person.

## Risk profile (elevated)

**Single Point of Failure (SPOF) across 4 roles**:

| Role               | Owner (current) | Backup                                                |
| ------------------ | --------------- | ----------------------------------------------------- |
| Lead Engineer      | Đặng Thế Thiệp  | Trần Thị Hương (confirmed 2026-05-25 via phone)       |
| Sysadmin           | Đặng Thế Thiệp  | Trần Thị Hương (per discovery — SSH/NSSM/cron skills) |
| DevOps             | Đặng Thế Thiệp  | none formalized                                       |
| Decision authority | Đặng Thế Thiệp  | none (Plant Manager retains override authority)       |

Backup Engineer Hương covers BOTH engineering + sysadmin scope during
Lead unreachable incidents. This concentrates the on-call burden on 2
people for a critical go-live week (8 days D-1 → D+7).

## Cascade response (3 PRs)

**PR #80 — Critical contradictions** (commit `690cbe4`, merged D-15 ~09:00 ICT):

1. `BACKUP_ENGINEER_BRIEF_2026-06-09.md` line 63-65: PM contact changed from "N/A direct channel" → `<TBD>` + sealed-envelope escape hatch `OPS-EMERGENCY-PM-CONTACT-2026-06-09` + Sales Lead interim channel (audit caught: original "N/A" left Hương with no PM escalation path during double-unreachable incident)
2. `STOP_TRIGGERS_2026-06-09.md` line 27: T5 recovery wording "Sysadmin fix within 2h" → "Lead Engineer (sysadmin function) fix within 2h"
3. `D-1_FINAL_CHECKLIST_2026-06-08.md` line 34: Sign-off slot "Sysadmin (prod ready)" → "Backup Engineer (Trần Thị Hương — incident standby confirmed)"

**PR #81 — Forward-looking docs alignment** (commit `c67af4b`, merged D-15 ~10:00 ICT):

5 files updated with header disclaimers + inline tags:

- `D-1_PREFLIGHT_AUDIT_2026-06-08.md` (4 sysadmin refs)
- `MIGRATION-DAY-0.md` (8 sysadmin refs — disclaimer at top + 3 inline edits)
- `.env.example` (1 ref — line 102)
- `docs/legal/data-retention-policy.md` (1 ref — line 25)
- `docs/legal/pii-handling-vn.md` (1 ref — line 85)

Strategy: keep "Sysadmin" as functional role-name in runbooks for
readability (Hương follows step-by-step) while making Lead Engineer =
Sysadmin equivalence explicit for incident escalation + audit trail.

**PR #82 — Win EXE build runbook** (commit `ac9ee7f`, merged D-15 ~10:30 ICT):

Separate from sysadmin cascade — captures the Windows CLIENT build
sequence as standalone reference doc for D-15 → D-7 action.

**PR #83 (this PR) — Forensic note + ROLLBACK-RUNBOOK placeholder fill**:

Closes cascade with forensic record (this file) + final placeholder
fills in ROLLBACK-RUNBOOK-20260522.md.

## Going forward — implications

### For Hương (Backup Engineer)

Her scope is BROADER than initially briefed:

- **Engineering scope**: code review, git operations, runbook execution (Runbook A + B)
- **Sysadmin scope**: SSH to `10.102.3.61`, NSSM service start/stop, `.env` mgmt, backup activation, off-site cron verification

The 30-min walk-through (target D-14 2026-05-26) MUST cover BOTH scopes.
Consider extending to 60 min if Hương needs sysadmin-specific commands
walk-through.

### For Plant Manager

Acknowledge SPOF risk. Default decision pattern during incidents:

1. Lead Engineer reachable → Lead drives
2. Lead unreachable + Hương reachable → Hương drives per runbook
3. Lead + Hương both unreachable → Plant Manager invokes sealed envelope
   `OPS-EMERGENCY-PM-CONTACT-2026-06-09` + escalates per Runbook B

### For v1.5.11 (post-cutover)

Consider recruiting 2nd backup engineer to reduce SPOF concentration.
Candidates should have minimum: SSH + git + NSSM + read JavaScript. Not
required: deep calcEngine knowledge (Lead Engineer keeps domain expertise).

## Audit trail anchors

- `docs/cutover/MONDAY_MORNING_BRIEF_2026-05-25.md` — operational state during discovery
- `docs/cutover/STOP_TRIGGERS_2026-06-09.md` — sign-off section documents discovery + amendment
- `docs/cutover/BACKUP_ENGINEER_BRIEF_2026-06-09.md` — Hương onboarding pack
- `CLAUDE.md` Sprint history — to be added in future sprint entry (S-SYSADMIN-DISCOVERY)
- Commit log:
  - `4386aba` 2026-05-25 ~08:50 — first cascade response (Blockers 2+3 owner)
  - `61704ea` 2026-05-25 ~09:00 — STOP triggers sign-off with T6 amendment
  - `690cbe4` 2026-05-25 ~09:30 — PR #80 critical contradictions
  - `c67af4b` 2026-05-25 ~10:00 — PR #81 forward-looking alignment
  - `ac9ee7f` 2026-05-25 ~10:30 — PR #82 Win EXE build runbook
  - (PR-3 SHA TBD) — this forensic note + RUNBOOK fills

## Sign-off

- **Recorded by**: Lead Engineer Đặng Thế Thiệp
- **Recording date**: 2026-05-27 (D-13)
- **Discovery date**: 2026-05-25 (D-15)
- **Status**: BINDING — referenced by all subsequent cutover ops + post-mortems
- **Retention**: indefinite (audit trail material)
