# Hương Walk-Through Agenda — D-14 (2026-06-16)

> Lead Engineer (Đặng Thế Thiệp) walks Backup Engineer (Trần Thị Hương)
> through repo + runbook + sysadmin scope. Target: 60 min single session,
> Hương's office or screen-share, before lunch ideally (07:30-08:30 OR
> 14:00-15:00 ICT).
>
> Companion: `BACKUP_ENGINEER_BRIEF_2026-06-30.md` (the binding scope doc).
> This file = operational agenda for the actual session.
>
> **Date refresh (D-21 audit 2026-06-09)**: go-live re-baselined to
> 2026-06-30. Real D-14 = **2026-06-16** (this session). State-snapshot
> table below describes work completed AS OF 2026-05-25 (D-15 in the
> original 2026-06-09 schedule); items remain done — only the cutover
> calendar moved. Block 5 prod-box readiness now sits at real D-7 =
> 2026-06-23 deadline.

---

## State snapshot — what is ready by D-15 evening (2026-05-25)

| Item                               | Status                | Notes                                                                        |
| ---------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| Backup scheduler activated         | ✅ DONE               | PR #74 — `OPS_BACKUP_SCHEDULE` honored + TOTP excluded from tarball          |
| STOP triggers documented           | ✅ DONE               | PR #78 — 11 triggers (T1-T6, O1-O3, C1-C2)                                   |
| BACKUP_ENGINEER_BRIEF              | ✅ DONE               | PR #78 — Hương contact filled; PM contact still `<TBD>` per HR call          |
| Sysadmin discovery cascade         | ✅ DONE               | PRs #80/#81/#82/#83 — Lead Engineer = Sysadmin = same person documented      |
| Mac DMG SERVER + CLIENT            | ✅ DONE               | Built + smoke-tested; license pubkey shipped in bundle                       |
| Win EXE CLIENT                     | ⚠️ FIELD TEST PENDING | Built locally; checklist at `docs/cutover/WIN_EXE_FIELD_TEST_D-7.md` for D-7 |
| BL-4 smoke-quote baseline helper   | ✅ DONE               | PR #84 — `scripts/cutover/dump-baseline-numbers.mjs`                         |
| Settings reset-pwd button (broken) | ✅ FIXED              | PR #85 — hidden; admins use Provisioning Card flow                           |
| Prod box `10.102.3.61` provisioned | ⚠️ NOT YET            | Dev currently runs on Lead's Mac; affects Block 5 drill                      |
| HR call for PM direct contact      | ⏳ SCHEDULED          | 2026-05-25 Monday AM (today) — fill BRIEF via amendment PR                   |
| MAC_INSTALL_GUIDE.md               | ✅ DONE               | `docs/cutover/MAC_INSTALL_GUIDE.md` — install + Gatekeeper + troubleshooting |

---

## Pre-session checklist (Lead does day-before, evening D-15)

- [ ] Confirm Hương availability + time slot via Zalo
- [ ] Update `BACKUP_ENGINEER_BRIEF.md` sign-off date once session booked
- [ ] **CRITICAL** — provision SSH key for Hương BEFORE session:

  ```bash
  # On Lead's Mac
  ssh-keygen -t ed25519 -f ~/.ssh/huong_prod_2026 -C "huong@cclvn-prod"
  # → produces huong_prod_2026 (private) + huong_prod_2026.pub (public)

  # SCP public key to prod box
  scp ~/.ssh/huong_prod_2026.pub user@10.102.3.61:~/

  # SSH to prod + add to authorized_keys
  ssh user@10.102.3.61
  cat ~/huong_prod_2026.pub >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
  rm ~/huong_prod_2026.pub
  exit
  ```

  Then USB-stick the PRIVATE key file (`huong_prod_2026`) to Hương during the session — DO NOT email/Zalo the private key.

- [ ] Print 1 paper copy of `STOP_TRIGGERS_2026-06-30.md` for Hương reference
- [ ] Open laptop with repo at HEAD ready for screen-share
- [ ] Notepad ready (Hương's first day notes)
- [ ] **OPTIONAL**: prepare sealed envelope OPS-EMERGENCY-PM-CONTACT (only if HR call done — else handoff at D-2 per BRIEF line 65)

---

## Agenda (60 min recommended)

### Block 1 — Opening + context (5 min)

**Time**: 0-5 min

**Lead says**:

> "Cảm ơn Hương đã đồng ý. Lý do anh cần Hương: anh là single point of failure cho cả engineering + sysadmin role. Plant Manager đã giao toàn quyền decision nhưng anh cần backup nếu down. Cutover go-live 2026-06-30, anh cần Hương standby từ D-1 (06-29) đến D+7 (07-07). Today walkthrough cover hết những thứ Hương cần biết để tự execute runbook nếu anh unreachable."

**Show Hương** (2 min read):

- `docs/cutover/SYSADMIN_DISCOVERY_NOTE_2026-05-25.md` — section "Risk profile" (SPOF table) + "Going forward — For Hương"

**Confirm**:

- [ ] Hương understands SPOF context
- [ ] Hương confirms availability D-1 → D+7
- [ ] Hương phone + Zalo working `+84988749869`

### Block 2 — Repo + key docs tour (10 min)

**Time**: 5-15 min

**Lead opens** (screen-share):

1. **Repo structure** (3 min) — `tree -L 2 -I node_modules`
   - `server/` = Node.js backend (Express + SQLite)
   - `client/` = React SPA (admin UI)
   - `desktop/` = Electron wrapper (Mac SERVER + Win CLIENT)
   - `apps/kiosk/` = PWA (shop-floor terminals)
   - `domains/planning/` = MES module (work orders, dispatch)
   - `scripts/` = ops scripts (preflight, backup, recovery)
   - `docs/cutover/` = THE folder Hương lives in during incidents

2. **Top 5 docs Hương MUST know** (5 min):

   | Priority | Doc                                     | When to read               |
   | -------- | --------------------------------------- | -------------------------- |
   | 1        | `STOP_TRIGGERS_2026-06-30.md`           | NOW (memorize 11 triggers) |
   | 2        | `ROLLBACK-RUNBOOK-20260522.md`          | When `/health` 500 ≥10 min |
   | 3        | `MIGRATION-DAY-0.md`                    | D-1 night + D-0 morning    |
   | 4        | `BACKUP_ENGINEER_BRIEF_2026-06-30.md`   | Reference card             |
   | 5        | `CLAUDE.md` "Recovery playbook" section | When totally stuck         |

3. **Vietnamese announcements quick-find** (2 min):
   - `ROLLBACK-RUNBOOK.md` Section A.7 + B.4 + B.6 = pre-written Zalo broadcasts
   - Copy-paste directly into Zalo "OpsControl GoLive 2026-06-30" group

### Block 3 — Engineering scope (10 min)

**Time**: 15-25 min

**Lead demonstrates**:

1. **Git ops** (3 min)
   - `git pull origin main` (refresh)
   - `git log --oneline -10` (recent activity)
   - `git status` (working tree)
   - `gh pr list` (open PRs)
   - `gh pr view <N>` (PR details)

2. **Read JavaScript** (3 min) — show Hương the 3 places she might need to look:
   - `server/routes/costApi.js` = quote save/load logic
   - `client/src/services/calcEngine.js` = pricing math
   - `server/services/backupScheduler.js` = backup cron

   Hương does NOT need to debug — just READ to understand what an error message references.

3. **Test commands** (4 min)
   - `npm test` (server tests)
   - `npm run preflight` (env validation BEFORE deploy)
   - `npm run verify-backup <file>` (validate backup file integrity)

   Run 1 command together so Hương sees output format.

### Block 4 — Sysadmin scope (20 min — BIGGEST section)

**Time**: 25-45 min

**Critical** — this is the post-discovery addition. Hương MUST be able to execute these solo.

#### 4.1 — SSH to prod (3 min)

```bash
# Hand Hương the private key file (USB)
# She places at ~/.ssh/huong_prod_2026
chmod 600 ~/.ssh/huong_prod_2026

# Test SSH
ssh -i ~/.ssh/huong_prod_2026 user@10.102.3.61
# Should prompt for passphrase (if you set one) then login
```

**Hương executes this LIVE during session.** If fails → debug now, not during real incident.

#### 4.2 — NSSM service commands (3 min)

Windows prod uses NSSM. Commands run via SSH session OR direct RDP if needed:

```powershell
# Check status
nssm status ops-control
# Expected: SERVICE_RUNNING

# Restart (graceful)
nssm restart ops-control
# Wait 5 sec, then verify
Start-Sleep 5; nssm status ops-control

# Stop (only during rollback or maintenance)
nssm stop ops-control

# Start
nssm start ops-control
```

**Hương executes `nssm status ops-control` LIVE during session.**

#### 4.3 — `.env` mgmt (3 min)

**SHOW Hương** the prod `.env` location:

```bash
ssh -i ~/.ssh/huong_prod_2026 user@10.102.3.61
ls C:\opt\ops-control\.env
type C:\opt\ops-control\.env | findstr OPS_
```

**Lead explicitly warns** — 4 untouchable keys (touch = production outage):

> "Hương: KHÔNG đụng 4 keys sau. Touch = ALL operators locked out, exports unverifiable, kiosks dead, license invalid. Recovery rất phức tạp (CLAUDE.md Recovery playbook). Chỉ đụng nếu Lead giao explicit."

| Untouchable key       | What breaks if touched                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| `OPS_TOTP_KEY`        | 2FA broken for all 20 operators (TOTP rotation runbook required to recover)       |
| `OPS_EXPORT_HMAC_KEY` | Customer xlsx tamper-detection broken; MVP-3 re-import refuses pre-rotation files |
| `OPS_LICENSE_PUBKEY`  | License validation fails → admin cannot create users (saw this 2026-05-25)        |
| `OPS_KIOSK_KEY`       | All kiosk pairings invalidated; operators on shop floor lose terminal access      |

Show the 4 env keys Hương CAN safely change:

| Key                   | When to change             | Default                  |
| --------------------- | -------------------------- | ------------------------ |
| `OPS_BACKUP_SCHEDULE` | Adjust backup frequency    | `daily`                  |
| `OPS_BACKUP_HOUR`     | Adjust backup time         | `2` (2am)                |
| `OPS_AUDIT_RETENTION` | Audit log retention (days) | `3650` (10yr per VN law) |
| `OPS_OFFSITE_TARGET`  | Off-site rsync destination | depends on setup         |

#### 4.4 — Backup activation + verification (4 min)

> **Status as of D-15 (2026-05-25)**: scheduler activated via PR #74 (`server/services/backupScheduler.js` honoring `OPS_BACKUP_SCHEDULE` + `OPS_BACKUP_HOUR`; TOTP secrets excluded from tarball via `--exclude='Library/Users/totp_secrets*'`). Manual trigger + verifier are the operator-facing entry points; cron itself is engineer-installed.

```powershell
# Manual backup trigger (use during incident or test) — Windows PowerShell
cd C:\opt\ops-control
npm run backup:run

# Verify backup file landed (last 3 files, newest first)
Get-ChildItem C:\opt\ops-control\server\data\Backup\SQLite\ |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 3 Name, LastWriteTime, Length
# Top file should be <60 sec old

# Verify backup file integrity (run before restoring)
$latest = (Get-ChildItem C:\opt\ops-control\server\data\Backup\SQLite\ |
           Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
npm run verify-backup -- $latest
# Should print "OK" or specific failure reason
```

**Hương executes `npm run backup:run` LIVE.** If fails → debug now.

#### 4.5 — Health endpoints (3 min)

```bash
# From prod box (or remote curl)
curl http://localhost:3000/health
# Expected: {"ok":true,"ts":...,...}

curl http://localhost:3000/ready
# Expected: {"db_ok":true,...}

curl http://localhost:3000/metrics
# Expected: Prometheus-format metrics
```

**Show Hương** what a healthy response looks like AND what a failing response looks like (em can demo by temporarily stopping NSSM — but ONLY in dev/staging, NEVER prod).

#### 4.6 — Cron / scheduled backup verification (4 min)

Scheduler runs inside the Node process (no Windows Task Scheduler row to inspect). Check via the most-recent backup file age:

```powershell
# Most-recent backup file age — should be <24h
$latest = Get-ChildItem C:\opt\ops-control\server\data\Backup\SQLite\ |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
$ageHours = ((Get-Date) - $latest.LastWriteTime).TotalHours
Write-Host "Latest backup: $($latest.Name) - age: $([Math]::Round($ageHours, 1)) hours"
# Expected: < 24

# Cross-check audit log for last BACKUP_OK / BACKUP_FAILED event
sqlite3 C:\opt\ops-control\server\data\ops.db `
  "SELECT ts, event FROM audit_log WHERE event LIKE 'BACKUP_%' ORDER BY ts DESC LIMIT 5"
```

**STOP trigger T5 reminder**: nếu file >24h → HALT cutover, anh + Hương debug immediately.

### Block 5 — Live drill (10 min)

**Time**: 45-55 min

**Scenario**: "Lead unreachable. /health returns 500. You investigate + recover."

> **Prod-readiness note**: drill MUST target a prod box reachable at `10.102.3.61` with NSSM `ops-control` service installed. If prod hasn't been provisioned yet (currently dev runs from Lead's Mac), pivot Block 5 to a **talk-through** — Hương narrates each step out loud; Lead validates verbal answers. Schedule a separate post-prod-stand-up live drill before D-7.

**Hương executes solo** (Lead silent observer):

1. SSH to prod
2. `curl http://localhost:3000/health` → record response
3. `nssm status ops-control` → record
4. `nssm restart ops-control` → wait 5s
5. `Start-Sleep 5; curl http://localhost:3000/health` → record
6. If still 500: open `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` → A.1 invoke criteria → check if A applicable
7. If A criteria met: walk through A.3 steps verbally (don't execute — this is drill)
8. Open Zalo group + paste Section A.7 announcement template

**Lead grades** (silently):

- [ ] Hương correctly invoked SSH
- [ ] Hương correctly diagnosed via curl + nssm status
- [ ] Hương correctly applied "wait 10 min before invoke A" rule
- [ ] Hương correctly read A.7 Vietnamese announcement
- [ ] Time to "Zalo announcement ready" < 5 min

If any step fails → re-do that step with Lead coaching.

### Block 6 — Q&A + handoff (5 min)

**Time**: 55-60 min

**Lead asks Hương**:

1. "Nếu Lead unreachable + Hương cũng unreachable, làm gì?" → Answer: Plant Manager opens OPS-EMERGENCY-PM-CONTACT envelope per T6 amended trigger.

2. "Khi nào KHÔNG được execute Runbook A?" → Answer: when DATA corrupted OR no snapshot exists OR Lead Engineer explicitly says no in non-business hours.

3. "Backup file landed nhưng `npm run verify-backup` fails. Làm gì?" → Answer: ESCALATE to Lead immediately, do NOT proceed to restore from corrupted backup.

**Handoff items**:

- [ ] Sealed envelope OPS-EMERGENCY-PM-CONTACT (if prepared) — Lead hands to Hương
- [ ] Confirm Zalo notification format anh sẽ dùng cho cutover week
- [ ] Schedule next touchpoint:
  - D-7 (Tue 2026-06-02) — Win EXE built verification
  - D-1 (Mon 2026-06-08) — Final preflight together
- [ ] Update `BACKUP_ENGINEER_BRIEF.md` lines 72-74 with session date

---

## Optional Block 7 — Extended sysadmin (if time + Hương interest, 15 extra min)

**Time**: 60-75 min (only if booked 75-min slot)

For Hương who wants deeper sysadmin knowledge:

1. **Releases snapshot dir** (`/opt/ops-control/releases/`)
   - Show structure: `<timestamp>/server/ + client/ + scripts/`
   - 5-snapshot retention
   - Used by Runbook A rollback

2. **`scripts/recover-sys-user.js`** (chicken-and-egg recovery)
   - When ALL admin/sys users locked out
   - Console-only escape hatch
   - Hương types `CONFIRM-RECOVER` at prompt
   - New temp password printed ONCE

3. **`scripts/preflight-env.js`**
   - Run BEFORE every prod deploy
   - Validates all required env keys present + correct format
   - Exits non-zero if any check fails
   - Wired into `deploy.ps1` as gate

4. **Audit log inspection**

   ```bash
   sqlite3 C:\opt\ops-control\server\data\ops.db \
     "SELECT ts, event, user_id, detail FROM audit_log ORDER BY ts DESC LIMIT 20"
   ```

   - All operator actions logged
   - Forensic trail during incidents

---

## Cheat sheet — Top 10 commands Hương memorizes

Print this section + tape to Hương's workstation:

```
=== Top 10 Commands — Hương On-Call Cheat ===

# SSH to prod
ssh -i ~/.ssh/huong_prod_2026 user@10.102.3.61

# Service status
nssm status ops-control

# Service restart (graceful)
nssm restart ops-control

# Health check
curl http://localhost:3000/health

# Manual backup
cd C:\opt\ops-control && npm run backup:run

# Verify backup integrity
npm run verify-backup <file.sqlite>

# Latest backup file (PowerShell)
Get-ChildItem C:\opt\ops-control\server\data\Backup\SQLite\ | Sort-Object LastWriteTime -Desc | Select-Object -First 3

# Tail recent logs
nssm get ops-control AppStdout

# View recent audit events
sqlite3 C:\opt\ops-control\server\data\ops.db "SELECT ts, event, user_id FROM audit_log ORDER BY ts DESC LIMIT 10"

# Emergency recovery (admin lockout)
node scripts\recover-sys-user.js
```

---

## Top 5 incident scenarios — 1-line response

| Scenario                                        | Hương first action                                    |
| ----------------------------------------------- | ----------------------------------------------------- |
| `/health` 500 sau deploy                        | Wait 10 min auto-recovery → if persists, NSSM restart |
| Backup file >24h old                            | STOP cutover (T5), `npm run backup:run` manually      |
| `ops_test_user` login attempt in audit log      | STOP (C2), lockout account immediately                |
| Customer reports xlsx PDF tamper warning        | STOP (C1), HALT quote sends, escalate to Lead         |
| Lead Engineer unreachable >15 min during outage | Hương takes over per Runbook A; notify Plant Manager  |

---

## Phone tree + escalation

```
INCIDENT DETECTED
        │
        ▼
Try Lead Engineer (Đặng Thế Thiệp +84965191991 / Zalo)
        │
   ┌────┴────┐
 RESPOND   NO RESPONSE >15 min
   │          │
   ▼          ▼
Lead drives  Hương executes per Runbook A
              │
              ▼
              Notify Plant Manager
              (via Sales Lead until envelope handoff complete,
               then via OPS-EMERGENCY-PM-CONTACT envelope)
              │
              ▼
              Continue per ROLLBACK-RUNBOOK
```

---

## Post-session — Lead Engineer follow-ups

After Hương session done:

1. **Update `BACKUP_ENGINEER_BRIEF.md`** lines 72-74 with actual session date
2. **Commit** the BRIEF update via amendment PR (conventional commit: `docs(release): log hương walk-through session 2026-05-26`)
3. **Confirm to Plant Manager** that backup engineer onboarding complete
4. **Pre-D-7 touchpoint** scheduled with Hương (verify Win EXE OR pivot Mac-only)
5. **Pre-D-1 final session** scheduled (review STOP triggers + pre-flight audit together)

---

## Open risks Hương should know

| Risk                                                                   | Mitigation                                                                                          |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Win EXE not built by D-7                                               | Mac-only first go-live (~7 Mac operators); Win operators wait D+1..D+7 patch                        |
| Prod box at `10.102.3.61` not yet provisioned (dev runs on Lead's Mac) | Block 5 live drill pivots to talk-through; schedule post-prod-standup drill before D-7              |
| PM contact `<TBD>` in BACKUP_BRIEF until HR call done                  | Sales Lead is interim escalation channel (per BRIEF line 67)                                        |
| Hương's SSH key never tested before D-1                                | Live drill (Block 5) is the test — fail-fast catch in session                                       |
| Mac DMG Apple Gatekeeper warning on operator first-launch              | `docs/cutover/MAC_INSTALL_GUIDE.md` — operator one-pager with `xattr` bypass + System Settings flow |
| 20 operator accounts (13 still pending provision)                      | Lead schedules provision session per Sprint 1.5 flow before D-1                                     |

Hương should be aware of these but NOT responsible for fixing — Lead drives.

---

## Final reminder

**Hương's role is BACKUP, not PRIMARY.** Lead Engineer remains decision authority. Hương:

- **CAN** execute rollback if Lead unreachable >15 min during outage
- **CAN** notify Plant Manager + Sales Lead + customers if Lead incapacitated
- **CANNOT** make schedule slip decisions without Lead approval
- **CANNOT** deploy new code to prod

When in doubt → wait for Lead. Better to be 10 min late than to ship a bad rollback.

---

**Session end. Lead Engineer thanks Hương. Schedule next touchpoint.**

**Companion docs (Hương opens AFTER session for self-study)**:

- `docs/cutover/SYSADMIN_DISCOVERY_NOTE_2026-05-25.md` — why she covers BOTH scopes
- `docs/cutover/STOP_TRIGGERS_2026-06-30.md` — 11 triggers
- `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` — Runbook A + B
- `docs/MIGRATION-DAY-0.md` — Day-0 playbook
- `CLAUDE.md` Recovery playbook section — older detailed runbooks (TOTP rotation, sys-user recovery, bare-metal restore)
