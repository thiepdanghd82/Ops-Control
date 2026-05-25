# Backup Engineer Brief — Ops Control v1.5.10 Cutover

> Brief template for the backup/standby engineer Lead Engineer (Đặng Thế Thiệp)
> identifies as on-call partner during 2026-06-09 go-live + D+1..D+7 parallel run.

## Coverage window

- **D-1 prep (Mon 2026-06-08)**: standby phone, available within 2h call
- **D-0 go-live (Tue 2026-06-09)**: ideally co-located OR screen-share from 06:00-12:00 ICT
- **D+1..D+3 (Wed-Fri 2026-06-10..12)**: rotating on-call with Lead Engineer
- **D+4..D+7 (Sat-Tue 2026-06-13..16)**: light on-call (parallel run end)

## Skills needed

- Bilingual EN + VN ideal (operator-facing during incidents)
- Read JavaScript / Node.js / Electron source
- Git + GitHub CLI familiar
- SSH access setup beforehand (request from Lead Engineer)

## Pre-cutover prep (30-min session)

Lead Engineer walks through:

1. Repo structure overview — `server/`, `client/`, `desktop/`, `apps/kiosk/`
2. Key docs:
   - `docs/cutover/READINESS_AUDIT_D-6_2026-05-24.md`
   - `docs/cutover/ROLLBACK-RUNBOOK-20260522.md`
   - `docs/cutover/STOP_TRIGGERS_2026-06-09.md`
   - `CLAUDE.md` Recovery playbook section
3. Prod box access: SSH key on `10.102.3.61`, NSSM service name `ops-control`
4. Backup runbook: how to invoke `npm run backup:run` if Lead unavailable
5. Rollback runbook: how to execute `releases/<ts>/` restore via deploy.ps1 path

## Roles during incident

| Scenario              | Lead Engineer           | Backup Engineer                                      |
| --------------------- | ----------------------- | ---------------------------------------------------- |
| /health 500 < 5 min   | Diagnose + fix          | Monitor + record timeline                            |
| /health 500 ≥ 5 min   | Lead executes rollback  | Backup notifies operators + Plant Manager            |
| Lead unreachable      | —                       | Backup takes over per Runbook A steps                |
| Data corruption found | Lead investigates       | Backup pulls latest backup file + verifies integrity |
| Operator confusion    | Lead clarifies via Zalo | Backup answers other operators in parallel           |

## Authority delegation

Lead Engineer retains all go/no-go authority. Backup Engineer:

- CAN: execute rollback if Lead unreachable >15 min during outage
- CAN: notify Plant Manager + Sales Lead + customers if Lead incapacitated
- CANNOT: make schedule slip decisions without Lead approval
- CANNOT: deploy new code to prod

## Contact info

- **Lead Engineer (Đặng Thế Thiệp)**:
  - Mobile: `+84965191991`
  - Zalo: `+84965191991`
  - Email: `thiepdt@cclind.com`
- **Backup Engineer (TO BE NAMED)**:
  - Mobile: `+84988749869`
  - Zalo: `+84988749869`
  - Email: `huongtt@cclind.com`
- **Plant Manager**:
  - Phone: `N/A - direct channel with Lead Engineer (Lead handles PM comms)`
  - Email: `N/A - direct channel with Lead Engineer`
- **Sysadmin**:
  - Phone: `+84965191991 (= Lead Engineer Đặng Thế Thiệp; no separate sysadmin role exists)`
  - Email: `thiepdt@cclind.com (= Lead Engineer)`

## Sign-off

- Lead Engineer briefed Backup on: `TBD - pending Hương Zalo confirm walk-through date (target D-14 2026-05-26)`
- Backup Engineer name: `Trần Thị Hương`
- Backup Engineer acknowledged scope: `2026-05-25 (via phone, confirmed accept role + SSH/NSSM/cron skills present)`
