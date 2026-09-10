# Dry-Run Cutover Checklist — D-2 (2026-06-07)

> Full backup → restore → off-site verify cycle, executed against a
> STAGING environment that mirrors prod. Validates the rollback runbook
> end-to-end so D-0 isn't the first time the procedure runs. Catches
> stale credentials, missed env vars, broken cron, off-site rsync
> failure — all the things that bite in production at 03:00.
>
> **Owner**: Lead Engineer (anh Thiệp) + Backup Engineer (Hương).
> **Estimated time**: 2-3 hours including failure-injection drills.
> **Output**: signed checklist + GO / NO-GO decision for D-0 go-live.

---

## Pre-conditions

| Item                              | Required state                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------- |
| Prod box `10.102.3.61`            | Live, NSSM `ops-control` SERVICE_RUNNING                                          |
| Mac DMG SERVER on Lead's Mac      | Live (parallel run setup for D-6 UAT)                                             |
| Staging copy of prod data         | Snapshot taken D-3 evening, restored to a separate box OR sandbox dir             |
| Off-site target                   | Configured per `OPS_OFFSITE_TARGET` in prod `.env`; reachable via rsync from prod |
| Backup engineer Hương             | Available + briefed (per D-14 walk-through PR #86)                                |
| `release/<ts>/` snapshot dir      | At least 1 historical snapshot present (from prior deploy via PR #77 deploy.sh)   |
| `releases/$PREV/` rollback target | Identified — typically the immediate-prior snapshot before today                  |
| HR call done                      | PM direct contact recorded in `BACKUP_ENGINEER_BRIEF` (not `<TBD>` anymore)       |

If ANY pre-condition fails → halt + resolve before running the dry-run.

---

## Test sequence — 6 phases

### Phase 1 — Pre-state inventory (15 min)

Capture baseline so post-dry-run comparison is meaningful.

- [ ] On prod box, capture current state:

  ```powershell
  # Quote count + audit log size
  sqlite3 C:\opt\ops-control\server\data\ops.db `
    "SELECT COUNT(*) AS quotes, (SELECT COUNT(*) FROM audit_log) AS audits FROM quotes WHERE deleted_at IS NULL"

  # TOTP enrollment count (does NOT export secrets — count only)
  sqlite3 C:\opt\ops-control\server\data\ops.db `
    "SELECT COUNT(*) AS totp_enrolled FROM users WHERE totp_secret IS NOT NULL"

  # Latest backup file age
  $latest = Get-ChildItem C:\opt\ops-control\server\data\Backup\SQLite\ |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  Write-Host "Latest backup: $($latest.Name) age=$([Math]::Round(((Get-Date) - $latest.LastWriteTime).TotalHours, 1))h"

  # `releases/` retention count
  (Get-ChildItem C:\opt\ops-control\releases -Directory).Count

  # /health response
  curl http://localhost:3000/health
  ```

- [ ] Record numbers in the **Pre-state** column of the verdict table below
- [ ] Snapshot `OPS_TOTP_KEY` from `.env` (DO NOT log to file, just confirm
      the 64-hex string is present) — needed to verify it survives the
      cycle

### Phase 2 — Manual backup trigger + verify (20 min)

Per PR #74 `OPS_BACKUP_SCHEDULE` scheduler + `npm run backup:run` + `verify-backup`.

- [ ] Hương executes from her workstation via SSH:

  ```bash
  ssh -i ~/.ssh/huong_prod_2026 user@10.102.3.61
  cd C:\opt\ops-control
  npm run backup:run
  ```

- [ ] Expected output:
  - `[backup] Starting backup cycle...`
  - `[backup] SQLite backup written to ...sqlite (NNN bytes)`
  - `[backup] Library tarball written to ...tar.gz (NNN bytes)`
  - `[backup] TOTP secrets EXCLUDED from tarball (--exclude=Library/Users/totp_secrets*)`
  - `[backup] BACKUP_OK audit emitted`
  - `[backup] runBackupCycle complete in NNN ms`
- [ ] Hương verifies the new backup files landed:

  ```powershell
  Get-ChildItem C:\opt\ops-control\server\data\Backup\SQLite\ |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 Name, LastWriteTime, Length
  # Expected: top file timestamp = within 60 sec; size > 1 MB
  ```

- [ ] Hương runs verify-backup against the new SQLite file:

  ```powershell
  $latest = (Get-ChildItem C:\opt\ops-control\server\data\Backup\SQLite\ |
             Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  cd C:\opt\ops-control
  npm run verify-backup -- $latest
  # Expected: prints "OK" with integrity_check + foreign_key_check passing
  ```

- [ ] Audit log shows the BACKUP_OK event:

  ```powershell
  sqlite3 C:\opt\ops-control\server\data\ops.db `
    "SELECT ts, event, json_extract(detail, '$.size') AS size FROM audit_log WHERE event LIKE 'BACKUP_%' ORDER BY ts DESC LIMIT 5"
  ```

**STOP if**: Backup creation fails OR verify-backup reports CANTOPEN /
NOTADB → triage immediately. T5 STOP trigger would fire at D-1 if backup
isn't reliable.

### Phase 3 — Off-site sync verification (20 min)

- [ ] Trigger off-site rsync per the configured `OPS_OFFSITE_TARGET`:

  ```bash
  cd /opt/ops-control
  # If using cron-baked off-site script:
  ./scripts/backup-offsite.sh
  # OR direct rsync to test:
  rsync -avz --dry-run server/data/Backup/ <offsite-user>@<offsite-host>:/var/backups/ops-control/
  ```

- [ ] Verify destination received the file:

  ```bash
  ssh <offsite-user>@<offsite-host> "ls -lt /var/backups/ops-control/latest/ | head -5"
  # Expected: top entry from today, size matches local backup
  ```

- [ ] **Verify the off-site backup is openable** — not just transferred:

  ```bash
  # On Lead's Mac, pull the off-site copy back + sanity-check it
  scp <offsite-user>@<offsite-host>:/var/backups/ops-control/latest/ops.sqlite /tmp/offsite-test.sqlite
  sqlite3 /tmp/offsite-test.sqlite "SELECT COUNT(*) FROM quotes WHERE deleted_at IS NULL"
  # Expected: same count as Phase 1 prod snapshot
  rm /tmp/offsite-test.sqlite
  ```

**STOP if**: Off-site rsync fails OR remote count doesn't match → RPO
violation (24h target). Fix BEFORE D-0.

### Phase 4 — Simulated restore (30 min)

Restore the just-taken backup into a STAGING dir (NOT prod). Validates
that the backup file is actually usable, not just "exists".

- [ ] On Lead's Mac (or staging Win box):

  ```bash
  mkdir -p /tmp/dry-run-restore/server/data
  cp <latest-backup>.sqlite /tmp/dry-run-restore/server/data/ops.db

  # Restore the Library tarball
  tar xzf <latest-library-backup>.tar.gz -C /tmp/dry-run-restore/server/data/

  # Restore .env (capture from prod, do NOT log)
  scp user@10.102.3.61:/opt/ops-control/.env /tmp/dry-run-restore/.env
  chmod 600 /tmp/dry-run-restore/.env
  ```

- [ ] Start a STAGING server on a non-conflicting port:

  ```bash
  cd /tmp/dry-run-restore
  OPS_PORT=3099 DATA_DIR=server/data NODE_ENV=production node /opt/ops-control/server/index.js &
  STAGING_PID=$!
  sleep 5
  ```

- [ ] Verify staging /health:

  ```bash
  curl http://localhost:3099/health
  # Expected: {"ok":true,"ts":...,...}
  ```

- [ ] Verify quote count matches:

  ```bash
  curl -s http://localhost:3099/api/quotes | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
  # Expected: same as Phase 1
  ```

- [ ] **Verify TOTP secrets still decrypt** — this is the most fragile
      piece per Lesson 30 / TOTP rotation runbook:

  ```bash
  # Login attempt with a known operator account via curl:
  curl -X POST http://localhost:3099/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"<known_username>","password":"<known_pwd>"}'
  # Expected: 200 with totp_required:true
  # If returns 500 with crypto error → OPS_TOTP_KEY mismatch between
  # restored .env and the encrypted secrets in restored DB. Catastrophic.
  ```

- [ ] Kill staging server:

  ```bash
  kill $STAGING_PID
  rm -rf /tmp/dry-run-restore
  ```

**STOP if**: Quote count mismatch OR TOTP decrypt fail → restore proc
broken. CANNOT proceed to D-0 without a working restore path.

### Phase 5 — Rollback drill via `releases/<ts>/` snapshot (30 min)

Simulates the Sprint 1.7 rollback runbook (CLAUDE.md "Bad deploy — need
to roll back" section). Tests that `deploy.sh`/`deploy.ps1` snapshots
are actually usable for restoring a prior version.

- [ ] On STAGING box (NOT prod — copy of prod is fine for this drill):
  - Pick the most recent `releases/<ts>/` snapshot
  - Stop NSSM service
  - Execute the rollback command sequence from CLAUDE.md "Bad deploy"
    section verbatim
  - Restart NSSM
  - Verify `/health` returns 200
  - Verify package.json version is the snapshot version (not current)
- [ ] Hương executes this solo (Lead silent observer per agenda Block 5
      live-drill model) — first time she runs the procedure in real
      hands-on context
- [ ] Lead grades:
  - [ ] Hương correctly identified the right snapshot dir
  - [ ] NSSM stop before restore (not after — order matters)
  - [ ] `robocopy /MIR` excluded `releases\`, `data\`, `node_modules\`
        (per the Windows rollback runbook in CLAUDE.md)
  - [ ] Preflight ran + exited 0 BEFORE service start
  - [ ] Total time to working `/health` 200: under 15 min

**Restore prod state after drill**: re-deploy the current release on top
of the drill state so the box returns to its actual current version.

### Phase 6 — STOP-trigger drills (20 min)

Walk through 3 STOP-trigger scenarios verbally. No actual execution —
this is the "talk-through" portion to ensure Hương knows the procedure
without coaching.

For each trigger, Hương narrates:

- What signal she sees
- First action she takes
- Who she notifies + via what channel
- When she escalates vs. self-fixes

- [ ] **T2 — `/health` fails continuously 15 min after D-0 restart**:
      Hương narrates Runbook A invoke criteria + steps A.1-A.7
- [ ] **T5 — Backup file >24h old on prod**:
      Hương narrates `npm run backup:run` manual trigger + audit
      check + Lead escalation if fails
- [ ] **T6 — Both Lead + Hương double-unreachable during outage**:
      Hương narrates the sealed-envelope `OPS-EMERGENCY-PM-CONTACT`
      protocol + Plant Manager handoff

**STOP if**: Hương cannot narrate any one of these confidently → she's
not ready for D-0 standby. Schedule additional walk-through D-1 morning.

---

## Failure-injection bonus (optional, 30 min if time)

Inject 3 controlled failures to make sure the system handles them:

- [ ] **Stop NSSM**: run a quote save → expect HTTP 502 from CLIENT;
      restart NSSM → save resumes
- [ ] **Corrupt latest backup**: rename `.sqlite` → `.sqlite.bad`, run
      `npm run verify-backup` → expect FAIL with clear error; restore
      filename → re-verify passes
- [ ] **Block port 3000 in Windows firewall** for 60 sec: CLIENT shows
      "Failed to fetch"; unblock → CLIENT auto-recovers within 30 sec
      polling cycle

---

## Verdict + sign-off

### State comparison table

| Metric                     | Pre-state (Phase 1) | Post-restore (Phase 4) | Match? |
| -------------------------- | ------------------- | ---------------------- | ------ |
| Active quote count         |                     |                        | ☐      |
| Audit log row count        |                     |                        | ☐      |
| TOTP enrolled users        |                     |                        | ☐      |
| Latest backup age (h)      |                     | N/A                    | N/A    |
| `releases/` snapshot count |                     |                        | ☐      |
| `/health` returns 200      | ☐ Yes ☐ No          | ☐ Yes ☐ No             |        |

### Overall result (check one)

- [ ] **PASS** — all 6 phases green. Cutover procedure validated end-to-end.
      **DECISION: GO** for D-0 go-live 2026-06-30.
- [ ] **PARTIAL** — phases 1-N pass, phase \<X\> partial. Specific issue:
      `__________________________________________________________`
      → triage with Lead + decide whether to delay D-0 by 1 day or proceed.
- [ ] **FAIL** — blocker on phase \<X\>. Recovery plan:
      `__________________________________________________________`
      → **DECISION: NO-GO**. Slip D-0 per `docs/cutover/SLIP_PROPOSAL_2026-05-24.md`.

### Sign-off

- Lead Engineer: `__________________` Date: `____________`
- Backup Engineer (Hương): `__________________` Date: `____________`
- Plant Manager (informed of result): `__________________` Date: `____________`

---

## Post-drill cleanup

- [ ] Remove `/tmp/dry-run-restore/` artifacts
- [ ] Confirm prod box state matches Phase 1 baseline (no drill artifacts left)
- [ ] Update `docs/cutover/HUONG_WALKTHROUGH_AGENDA_D-14.md` State-snapshot
      with "Dry-run cutover" row flipped to ✅ DONE
- [ ] Commit + push a forensic record similar to `SYSADMIN_DISCOVERY_NOTE_2026-05-25.md`:
      `docs/cutover/DRY_RUN_RESULT_2026-06-07.md` capturing the verdict
      table + any issues surfaced + their resolution

---

## STOP triggers specific to D-2 dry run

If ANY of these fire during the drill, **DECISION: NO-GO** for D-0
unless resolved within 24 hours:

| #    | Trigger                                                     | Action                                       |
| ---- | ----------------------------------------------------------- | -------------------------------------------- |
| D2-1 | Backup creation fails AT ALL during Phase 2                 | HALT D-0; root-cause first                   |
| D2-2 | `verify-backup` reports CANTOPEN / NOTADB on a fresh backup | HALT D-0; restore subsystem broken           |
| D2-3 | Off-site rsync fails OR remote count mismatch               | HALT D-0; RPO violated                       |
| D2-4 | Restored DB shows ≥1% quote count loss vs prod baseline     | HALT D-0; restore procedure unreliable       |
| D2-5 | TOTP login fails on staging restored DB                     | HALT D-0; OPS_TOTP_KEY rotation needed first |
| D2-6 | `releases/<ts>/` rollback drill takes >15 min OR breaks     | HALT D-0; rollback path unreliable           |
| D2-7 | Hương cannot narrate any one of T2/T5/T6 confidently        | Schedule extra walk-through D-1 AM           |

---

## Companion files

- `docs/cutover/8-DAY-CUTOVER-PLAN-20260522.md` — D-2 work block context
- `docs/cutover/STOP_TRIGGERS_2026-06-30.md` — 11 halt criteria for D-0
- `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` — Runbook A + B (full procedure)
- `docs/cutover/BACKUP_ENGINEER_BRIEF_2026-06-30.md` — Hương's standby scope
- `docs/cutover/HUONG_WALKTHROUGH_AGENDA_D-14.md` — onboarding agenda (cross-link "Block 5 live drill")
- `CLAUDE.md` Recovery playbook section — Linux + Windows rollback procedures

---

**Document version**: 1.0 (created 2026-05-26 D-14)
**Owner**: Lead Engineer (Đặng Thế Thiệp) + Backup Engineer (Trần Thị Hương)
**Audience**: Lead + Hương joint session at prod box
**Execution window**: D-2 (2026-06-07, Sunday) AM ICT — 6 days before go-live
**Status**: PENDING — to be executed
