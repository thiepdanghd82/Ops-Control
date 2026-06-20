# C-4 BACKUP DRILL + BIT-ROT CRON DEPLOY RUNBOOK (Hương operates)

## Combined runbook · Runbook gộp

**Deadline · Hạn**: 2026-07-31 (D-30) — backup drill validates RTO < 6h
**Operator · Người vận hành**: Hương (backup engineer, B-3 SPOF reduction)
**Henry's role · Vai trò Henry**: observer + Q&A only (Hương MUST drive — knowledge transfer is the point)
**Combined scope · Phạm vi gộp**:

- C-4 backup drill (restore SERVER DMG from off-site rsync to hot-spare, time RTO)
- M-5b bit-rot cron deployment (Hương installs the monthly cron + verifies first baseline)

**Why combined · Tại sao gộp**: Two birds, one drill day:

1. R6 retention control deployed (PR #193 bit-rot cron) → completes Phase 3 Track B
2. Hương learns operational surface end-to-end → reduces B-3 SPOF (Henry as only ops expert)

---

## 📋 Pre-drill checklist · Checklist trước drill

> Henry verifies 48h before drill date · Henry kiểm tra 48h trước

- [ ] Hot-spare Mac mini provisioned (per `C4_HOTSPARE_PROCUREMENT.md` Step 5)
- [ ] Off-site rsync target reachable + nightly backup verified ≤ 24h old
- [ ] Primary SERVER SQLite + Library/\* current
- [ ] PR #193 (bit-rot cron) merged + on main
- [ ] `scripts/bitrot-check.mjs` + `server/db/bitrotCheck.js` present in latest SERVER DMG
- [ ] Drill date booked: 4h window (08:00-12:00 Hai Duong time, low operator load)
- [ ] Hương informed + has read this runbook + has questions answered
- [ ] Backup notepad + pen to log timestamps + observations
- [ ] Henry's calendar blocked (4h, observe-only mode)

---

## 🎯 Drill objectives · Mục tiêu drill

1. **Validate RTO ≤ 6h** for full SERVER replacement (cold start from off-site backup)
2. **Validate RPO ≤ 24h** (data loss bounded by last successful nightly backup)
3. **Hương completes the drill solo** (Henry observes, answers questions, does NOT execute commands)
4. **Bit-rot cron deployed + baseline manifest written** on primary SERVER
5. **Document any gaps** in runbook (operator-perspective improvements)

---

## ⏱️ Drill timeline · Lịch trình drill

| Time (Hai Duong) | Block · Phần                                                               | Owner | Output                                           |
| ---------------- | -------------------------------------------------------------------------- | ----- | ------------------------------------------------ |
| 08:00-08:15      | Pre-drill briefing (Henry reads objectives, Hương asks questions)          | Henry | Both aligned                                     |
| 08:15-09:30      | **Block 1 — Backup restore drill** (cold-start from off-site to hot-spare) | Hương | Hot-spare serving traffic                        |
| 09:30-09:45      | RTO logged + Q&A on restore gaps                                           | Both  | Time recorded                                    |
| 09:45-10:45      | **Block 2 — Bit-rot cron deploy on primary SERVER**                        | Hương | Cron installed + first baseline manifest written |
| 10:45-11:00      | Verify cron via manual `node scripts/bitrot-check.mjs --json`              | Hương | OK status confirmed                              |
| 11:00-11:30      | **Block 3 — Failover rehearsal** (switch primary off, route to hot-spare)  | Hương | Hot-spare actually used                          |
| 11:30-12:00      | Debrief + runbook updates + Henry-Hương Q&A                                | Both  | Runbook improvements filed                       |

---

## 🔧 Block 1 — Backup restore drill · Phục hồi backup

### Scenario · Kịch bản

"Primary SERVER Mac mini died at 02:00 last night. Off-site backup at 02:00 contains the latest data. Restore service onto hot-spare Mac mini and resume operator traffic."

### Steps · Bước

#### 1.1 Confirm off-site backup current (Hương executes, Henry observes)

```bash
# SSH to off-site rsync target
ssh user@offsite-backup-host

# Check most recent backup directory
ls -lt /var/backups/ops-control/ | head -5

# Verify size + integrity
ls -lh /var/backups/ops-control/latest/
du -sh /var/backups/ops-control/latest/server/data/Library/Quotes/quotes.db
```

**Acceptance**: latest snapshot ≤ 24h old, SQLite file present, size sane (>50MB after 5y ops).

#### 1.2 Pull backup to hot-spare

```bash
# From hot-spare Mac mini (assume IP 10.102.3.62, hostname ops-control-hotspare.local)
ssh henry@10.102.3.62

# Stop any running Ops Control on hot-spare (if app is open)
killall "Ops Control"

# Pull backup via rsync
mkdir -p ~/Library/Application\ Support/ops-control-desktop/
rsync -avz user@offsite-backup-host:/var/backups/ops-control/latest/server/data/ \
  ~/Library/Application\ Support/ops-control-desktop/data/

# Verify file count + sizes
ls -la ~/Library/Application\ Support/ops-control-desktop/data/Library/Quotes/
```

**Acceptance**: quotes.db, ddl_sites.json, mat.json, etc. all present; counts match primary.

#### 1.3 Update hot-spare role + start app

```bash
# Confirm hot-spare config.json has BUILD_ROLE = 'server'
cat ~/Library/Application\ Support/ops-control-desktop/config.json | grep buildRole
# Expected: "buildRole": "server"

# If not, edit (use TextEdit if Hương more comfortable)
# Set: "buildRole": "server", "mode": "embedded", "remoteUrl": ""

# Launch Ops Control SERVER app
open /Applications/Ops\ Control\ SERVER.app

# Wait for embedded Express to start (10-30 sec)
# Verify health endpoint
curl -sS http://localhost:3100/health
# Expected: {"status":"ok",...}
```

**Acceptance**: /health returns 200 OK; can login with last-known admin credentials; Quote History shows the restored quotes.

#### 1.4 Restore network identity (allow operator CLIENT apps to find hot-spare)

> Note: For drill, we don't actually flip DNS — too disruptive. Instead, manually point ONE test CLIENT (Henry's laptop) at hot-spare IP and verify end-to-end.

```bash
# From Henry's CLIENT machine (drill purposes only)
# Settings → Connection Mode → Server URL → http://10.102.3.62:3100
# Save + restart CLIENT app

# Verify CLIENT can login + load quotes from hot-spare
```

**Acceptance**: CLIENT app on Henry's laptop successfully loads quotes from hot-spare; one full quote save round-trip works.

#### 1.5 Log RTO

| Metric          | Value                |
| --------------- | -------------------- |
| Start time      | \***\*\_\_\*\***     |
| End time        | \***\*\_\_\*\***     |
| **Elapsed**     | \***\*\_\_\*\***     |
| **Target ≤ 6h** | [ ] MET [ ] MISS     |
| Gaps observed   | **\*\***\_\_**\*\*** |

---

## 🔧 Block 2 — Bit-rot cron deploy · Triển khai cron bit-rot

### Scenario · Kịch bản

"Phase 3 Track B M-5b complete. Deploy the monthly bit-rot check cron on the primary SERVER (NOT hot-spare — hot-spare runs only during failover). First run writes baseline manifest; subsequent monthly runs detect silent corruption."

### Steps · Bước

#### 2.1 SSH to primary SERVER (Hương executes)

```bash
ssh henry@10.102.3.61   # Or whoever the SERVER admin is

# Confirm latest DMG installed (PR #193 merged → bit-rot files present)
ls /Applications/Ops\ Control\ SERVER.app/Contents/Resources/app/scripts/bitrot-check.mjs
ls /Applications/Ops\ Control\ SERVER.app/Contents/Resources/app/server/db/bitrotCheck.js

# Both files MUST exist. If not, install latest SERVER DMG first.
```

#### 2.2 Test bit-rot script manually (writes baseline)

```bash
# Navigate to app dir
cd /Applications/Ops\ Control\ SERVER.app/Contents/Resources/app/

# First run — writes baseline manifest
node scripts/bitrot-check.mjs

# Expected output:
# [bitrot-check] BASELINE WRITTEN — N rows tracked at /Users/.../Library/Application Support/ops-control-desktop/data/Library/bitrot-manifest.json

# Verify manifest written
ls -la ~/Library/Application\ Support/ops-control-desktop/data/Library/bitrot-manifest.json
cat ~/Library/Application\ Support/ops-control-desktop/data/Library/bitrot-manifest.json | head -20
```

**Acceptance**: manifest file exists; first-line shows {"created_at":..., "last_run_at":..., "rows":{...}}.

#### 2.3 Test second run (should report OK + no drift)

```bash
node scripts/bitrot-check.mjs

# Expected output:
# [bitrot-check] OK — N/N rows verified, 0 newly aged into baseline
```

**Acceptance**: exit code 0; "OK" status.

#### 2.4 Install cron entry (monthly on day 1 at 03:00)

```bash
# Open crontab for editing (macOS uses launchd, but cron still works for simple cases)
crontab -e

# Add line:
0 3 1 * * cd /Applications/Ops\ Control\ SERVER.app/Contents/Resources/app/ && /usr/local/bin/node scripts/bitrot-check.mjs --json >> ~/bitrot-check.log 2>&1

# Save + exit (vim: Esc :wq Enter)

# Verify cron installed
crontab -l | grep bitrot
```

**Acceptance**: crontab shows the new line. (Or, if Hai Duong uses launchd, install equivalent launchd plist — runbook should note which.)

#### 2.5 Test cron execution (simulate by running command identical to cron line)

```bash
cd /Applications/Ops\ Control\ SERVER.app/Contents/Resources/app/ && \
  /usr/local/bin/node scripts/bitrot-check.mjs --json >> ~/bitrot-check.log 2>&1

# Inspect log
cat ~/bitrot-check.log
```

**Acceptance**: log contains JSON output with `"ok":true`.

#### 2.6 Document monthly review procedure

> Add to ops calendar: 1st of every month, ~09:00, Hương:
>
> 1. `cat ~/bitrot-check.log | tail -1 | jq -e '.ok'` → if false, alert Henry
> 2. If drift detected: STOP — do NOT take fresh backup (would propagate drift). Follow recovery in `RETENTION_20Y_STRATEGY.md`.

---

## 🔧 Block 3 — Failover rehearsal · Diễn tập failover

### Scenario · Kịch bản

"Stop primary SERVER. Within 15 minutes, hot-spare must serve traffic. Then restore primary, switch back, verify zero data loss."

### Steps · Bước

#### 3.1 Stop primary

```bash
# On primary SERVER (Hương executes)
# Quit Ops Control SERVER app via macOS menu
# OR
ssh henry@10.102.3.61 "killall 'Ops Control'"

# Verify primary is down
curl -sS http://10.102.3.61:3100/health
# Expected: connection refused
```

#### 3.2 Verify hot-spare is responsive

```bash
curl -sS http://10.102.3.62:3100/health
# Expected: {"status":"ok",...}
```

#### 3.3 Test quote save on hot-spare

> Henry's CLIENT (already pointed at hot-spare from Block 1.4) saves a new test quote.

**Acceptance**: quote saved + visible in Quote History on hot-spare; quote_id assigned.

#### 3.4 Restore primary + sync delta

```bash
# Restart primary
ssh henry@10.102.3.61
open /Applications/Ops\ Control\ SERVER.app

# Verify health
curl -sS http://10.102.3.61:3100/health

# IMPORTANT: data on hot-spare is now ahead of primary (test quote from 3.3 not on primary)
# Sync hot-spare → primary one-way to capture the delta
# (Production switchback procedure is more nuanced; for drill, document the gap)
```

**Acceptance**: primary running; **note the data-delta** between hot-spare and primary; document procedure for production switchback (may require manual quote re-export OR rsync-back protocol).

---

## 📝 Drill debrief checklist · Checklist tổng kết

After Block 3 completes, Henry + Hương spend 30 min on:

- [ ] Hương summarizes: did anything in this runbook feel ambiguous or under-documented?
- [ ] RTO target (≤6h) met or missed? If missed, what slowed?
- [ ] Failover-switchback data-delta: is the production procedure documented? Or filed as gap?
- [ ] Hương rates own confidence to repeat solo in case of real incident: 1-10
- [ ] Bit-rot cron: deployed + tested + monthly review on Hương's calendar?
- [ ] Any P0/P1 issues found → file MES-3-FIX-NN ticket each
- [ ] Update this runbook with operator-perspective improvements
- [ ] Update `project_golive` memory: C-4 ✅ DONE if RTO met + Hương confident; otherwise PENDING with gap list

---

## 🚦 Outcome decision · Quyết định kết quả

| Outcome                                               | Action                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| RTO ≤ 6h + Hương confidence ≥ 7 + bit-rot deployed    | ✅ C-4 CLOSED; R6 retention control complete                     |
| RTO ≤ 6h but Hương confidence < 7                     | 🟡 C-4 CLOSED-WITH-CAVEATS; schedule 2nd drill before D-7        |
| RTO > 6h                                              | 🟡 C-4 PENDING; identify bottleneck, fix, re-drill within 7 days |
| Critical procedure gap (e.g. data-delta sync unclear) | 🟡 C-4 PENDING; document missing procedure, drill again post-fix |
| Hot-spare hardware failure during drill               | 🔴 ESCALATE; file `S-HOTSPARE-DEFECT`, return for replacement    |

---

## Cross-reference

- `docs/ops/C4_HOTSPARE_PROCUREMENT.md` — hot-spare purchase prereq
- `docs/retention/RETENTION_20Y_STRATEGY.md` — R6 bit-rot control specification
- `server/db/bitrotCheck.js` — bit-rot detection module (M-5b)
- `scripts/bitrot-check.mjs` — CLI wrapper for cron
- `CLAUDE.md` Recovery playbook — "Bare-metal restore" runbook (cross-validate with this drill's findings)
- [project_golive memory] — C-4 + B-3 SPOF tracking
