# Backup Engineer Brief — Ops Control v1.5.12 Cutover

> Brief template for the backup/standby engineer Lead Engineer (Đặng Thế Thiệp)
> identifies as on-call partner during 2026-06-30 go-live + D+1..D+7 parallel run.
>
> **Date refresh (D-21 audit 2026-06-09)**: go-live re-baselined from 2026-06-09
> to **2026-06-30**. D-1 = 2026-06-29 (Mon), D+7 end of parallel run = 2026-07-07.

## Coverage window

- **D-1 prep (Mon 2026-06-29)**: standby phone, available within 2h call
- **D-0 go-live (Tue 2026-06-30)**: ideally co-located OR screen-share from 06:00-12:00 ICT
- **D+1..D+3 (Wed-Fri 2026-07-01..03)**: rotating on-call with Lead Engineer
- **D+4..D+7 (Sat-Tue 2026-07-04..07)**: light on-call (parallel run end)

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
   - `docs/cutover/STOP_TRIGGERS_2026-06-30.md`
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
  - Phone: `<TBD — pending HR call 2026-05-25 Monday AM>` (fill via amendment PR after HR confirms)
  - Email: `<TBD — pending HR call 2026-05-25 Monday AM>`
  - **Escape hatch (D-1 Lead Engineer briefing → Backup Engineer)**: PM phone/email recorded on physical card stored in sealed envelope labeled `OPS-EMERGENCY-PM-CONTACT-2026-06-30` at Lead Engineer's workstation, opened by Backup Engineer ONLY during T6 double-failure incident OR when Lead Engineer incapacitated. Lead Engineer prepares envelope D-2 (2026-06-28) after HR contact captured; physical handoff to Hương during D-1 prep session.
  - **Backup channel**: until envelope handoff complete, Backup Engineer routes PM escalation through Sales Lead (whose contact she already has access to via her existing CCL Vietnam directory).
- **Sysadmin**:
  - Phone: `+84965191991 (= Lead Engineer Đặng Thế Thiệp; no separate sysadmin role exists)`
  - Email: `thiepdt@cclind.com (= Lead Engineer)`

## Sign-off

- Lead Engineer briefed Backup on: `TBD - pending Hương Zalo confirm walk-through date (target D-14 2026-06-16)`
- Backup Engineer name: `Trần Thị Hương`
- Backup Engineer acknowledged scope: `2026-05-25 (via phone, confirmed accept role + SSH/NSSM/cron skills present)`
