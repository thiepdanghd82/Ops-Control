# Rollback Runbook — Ops Control v1.5.10 Go-Live

**Date**: 2026-05-22 | **Go-live**: 2026-05-30 | **Site**: CCL Design Vietnam, Yen Phong
**Audience**: bilingual (engineer steps in English; operator-facing in Vietnamese)

> **Role clarification (2026-05-25 discovery — see `docs/cutover/SYSADMIN_DISCOVERY_NOTE_2026-05-25.md`)**: At CCL Vietnam Yen Phong, "Sysadmin" is a functional role held by the Lead Engineer (Đặng Thế Thiệp, `+84965191991`, `thiepdt@cclind.com`). Wherever this runbook references "Sysadmin", read as "Lead Engineer executing sysadmin function". Backup Engineer (Trần Thị Hương, `+84988749869`, `huongtt@cclind.com`) covers BOTH engineering + sysadmin scopes during Lead unreachable incidents.

> ⚠️ **First-time go-live**. There is NO prior version of Ops Control in production at Yen Phong. "Rollback" therefore means TWO different things:
>
> - **Runbook A — Software rollback within v1.5.x**: revert prod from a bad v1.5.10 patch to a prior `releases/<ts>/` snapshot. Useful when v1.5.10 had a deploy regression that ships within hours, not days.
> - **Runbook B — Operational fallback to manual Excel**: when v1.5.x is unusable AND software rollback won't help (DB corruption, disk fault, server hardware failure). Factory falls back to the pre-Ops-Control manual workflow on macOS + Windows + Excel.

---

# RUNBOOK A — Software rollback within v1.5.x

## A.1 When to invoke

Invoke Runbook A when ALL of the following are true:

1. `/health` returns 500 or non-200 for ≥10 minutes continuously
2. Recent deploy (within last 6 hours) is the suspected cause
3. A prior `releases/<ts>/` snapshot exists from before the bad deploy
4. The DATA (`server/data/`) is intact (NOT corrupted)
5. SQLite integrity check passes on a fresh backup file

If any of (3), (4), (5) is false → escalate to Runbook B (operational fallback).

## A.2 Decision authority

| Role          | Authority                                                                           |
| ------------- | ----------------------------------------------------------------------------------- |
| Sysadmin      | Can execute Runbook A immediately during an active Sev-1 incident in business hours |
| Lead Engineer | Must approve before A executed outside business hours                               |
| Plant Manager | Informed within 5 minutes of decision; not a gate but must be looped in             |

## A.3 Engineer steps (Windows production at 10.102.3.61)

**Pre-condition**: `deploy.ps1` snapshot patch from D-5 must be in place. Without it, no snapshot exists and Runbook A is impossible.

```powershell
# 1. SSH to prod
ssh user@10.102.3.61

# 2. List available snapshots (newest first)
dir C:\opt\ops-control\releases | sort Name -Descending

# 3. Identify snapshot to roll back to (most recent BEFORE the bad deploy)
$PREV = "20260530-110000"  # adjust per actual timestamp
Write-Host "Rolling back to: $PREV"

# 4. Stop the NSSM service (announces 503 to all clients for ~30s)
nssm stop ops-control

# 5. Take an emergency backup of the BAD state (forensic, in case rollback fails too)
$BAD_TS = Get-Date -Format yyyyMMdd-HHmmss
robocopy C:\opt\ops-control C:\opt\ops-control\releases\BAD-$BAD_TS /E /XD releases data node_modules /R:1

# 6. Restore prior snapshot in place (EXCLUDES releases/, data/, node_modules/)
robocopy C:\opt\ops-control\releases\$PREV C:\opt\ops-control /E /XD releases data node_modules /MIR

# 7. Verify package.json reverted
type C:\opt\ops-control\package.json | findstr version

# 8. Re-run preflight (must exit 0)
cd C:\opt\ops-control
node scripts\preflight-env.js
$LASTEXITCODE  # must be 0

# 9. Start the NSSM service
nssm start ops-control

# 10. Wait 5 seconds, verify /health
sleep 5
curl http://localhost:3000/health
# expect: {"ok":true, ...}

# 11. Tail logs for 30 seconds — look for "🔐 TOTP boot probe OK"
nssm get ops-control AppStdout
# OR: Get-EventLog -LogName Application -Source "ops-control" -Newest 20
```

## A.4 Engineer steps (Linux equivalent, for future migration)

```bash
ssh user@<linux-host>
sudo systemctl stop ops-control

ls /opt/ops-control/releases   # pick previous snapshot
PREV=20260530-110000           # immediately before bad deploy
cd /opt/ops-control

# Restore in-place (snapshot mirrors same subtree shape)
cp -R releases/$PREV/server releases/$PREV/client releases/$PREV/scripts ./
cp releases/$PREV/package.json releases/$PREV/package-lock.json ./

sudo systemctl start ops-control
journalctl -u ops-control -n 30   # confirm clean boot
```

## A.5 Data files NOT rolled back (important)

`server/data/` accumulates across releases. Rollback does NOT touch:

- `server/data/Library/` (Materials, Rates, MachineProfiles, Users, etc.)
- `server/data/ops.db` (live SQLite)
- `server/data/Backup/`

If the bad deploy corrupted DATA (rare — usually requires explicit destructive admin action), Runbook A is insufficient. Restore from nightly backup per `npm run verify-backup` and the recovery section of CLAUDE.md ("All data gone after a restore").

## A.6 Verification post-rollback

| Check                     | Pass criterion         | Action if fail                                                    |
| ------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `/health` HTTP 200        | JSON `{"ok":true,...}` | Re-investigate; if still down 5 min, escalate to Runbook B        |
| `/ready` `db_ok=true`     | SQLite probe ok        | Investigate ops.db permissions; restart NSSM                      |
| Quote History page loads  | 66+ quotes visible     | Permission group issue; verify users.json                         |
| Operator can save a quote | Round-trip ok          | Check audit_log for write attempt + error                         |
| 2FA login works           | TOTP code accepted     | `OPS_TOTP_KEY` mismatch — check `.env` matches pre-rollback value |

## A.7 Operator-facing announcement (Vietnamese)

Post in Zalo group "OpsControl GoLive 2026-05-30" and broadcast verbally to floor supervisor:

> 🔵 **THÔNG BÁO** — Hệ thống Ops Control đang được phục hồi về phiên bản trước. **Vui lòng dừng nhập liệu mới trong 5–10 phút.**
>
> 1. IT đang chạy lệnh rollback. Hệ thống sẽ tạm ngắt ~30 giây.
> 2. Khi `/health` trả OK, anh chị sẽ nhận thông báo "Hệ thống đã phục hồi" trong nhóm Zalo.
> 3. QA sẽ test 1 quote đã save trước outage — nếu hiển thị đúng số liệu, mọi người tiếp tục nhập.
> 4. **Quan trọng**: dữ liệu anh chị đã nhập TRƯỚC outage không bị mất; những gì đang dở giữa chừng cần nhập lại sau khi phục hồi.
>
> Câu hỏi gấp: gọi **Lead Engineer Đặng Thế Thiệp `+84965191991`** hoặc **Backup Engineer Trần Thị Hương `+84988749869`** (sysadmin function backup per 2026-05-25 discovery).

## A.8 Retention

`deploy.ps1` keeps 5 most-recent `releases/<ts>/` snapshots. Older are pruned. Disk fill at 5 × ~150 MB = ~750 MB — manageable.

---

# RUNBOOK B — Operational fallback to manual Excel

## B.1 When to invoke

Invoke Runbook B when ANY of the following is true:

1. Runbook A executed but `/health` still 500 after rollback
2. SQLite database is corrupted and last backup is unusable
3. Server hardware failed and no spare provisioned
4. Network/LAN failure isolating server from operator subnet for >30 minutes
5. Lead Engineer + Backup Engineer (Hương — sysadmin function backup) both unreachable + on-floor engineer cannot diagnose within 15 minutes

## B.2 Decision authority

| Role          | Authority                                                                               |
| ------------- | --------------------------------------------------------------------------------------- |
| Plant Manager | Must explicitly authorize Runbook B (it stops the new system and reverts ops to manual) |
| Sysadmin      | Can recommend; cannot unilaterally invoke                                               |
| Lead Engineer | Briefs plant manager with options + ETA                                                 |

## B.3 Pre-conditions (must be in place BEFORE go-live)

Per the 8-Day Cutover Plan D-5 deliverables, these files MUST exist before D-0:

| File                                  | Location                        | Owner            | Purpose                   |
| ------------------------------------- | ------------------------------- | ---------------- | ------------------------- |
| `Fallback_Quote_Manual_v1.0.xlsx`     | `\\server\OpsControl\Fallback\` | Sales Lead       | Quote entry during outage |
| `Fallback_WorkOrder_Manual_v1.0.xlsx` | `\\server\OpsControl\Fallback\` | Production Lead  | WO tracking during outage |
| `scripts/import-fallback-xlsx.js`     | Repo `scripts/`                 | Lead Engineer    | Re-import after recovery  |
| Paper copies of both xlsx             | Supervisor desk per shift       | Floor supervisor | LAN-down fallback         |

If any of these is missing on D-0 → Runbook B is NOT executable. Plant manager must decide between (a) wait for engineer fix even if hours long, or (b) operate "blind" without records (NOT recommended).

## B.4 Operator workflow during outage (Vietnamese)

Post in Zalo group + announce verbally to floor supervisor + broadcast over factory PA:

> 🔴 **MẤT HỆ THỐNG OPS CONTROL — KÍCH HOẠT QUY TRÌNH TẠM**
>
> ### Tại Văn phòng (Sales + NPI + CS)
>
> 1. **Supervisor** mở folder LAN `\\server\OpsControl\Fallback\` → mở `Fallback_Quote_Manual_v1.0.xlsx`
>    - Nếu LAN cũng mất: lấy bản giấy ở bàn supervisor
> 2. Mỗi quote mới: thêm 1 hàng với cột:
>    - **RFQ-ID** (đánh số tay tiếp theo dãy đã có)
>    - **Customer** (tên end-customer)
>    - **CCL_PN** (mã sản phẩm CCL)
>    - **MOQ** (số lượng tối thiểu mỗi tier)
>    - **Quote Date** (ngày hôm nay)
>    - **Sales-Rep** (tên anh/chị)
>    - **Notes** (link tới spec file nếu có)
> 3. Work order: ghi tay vào `Fallback_WorkOrder_Manual_v1.0.xlsx` — stage chuyển sang `Production` ngay (skip Pre-Press auto-routing)
> 4. Báo IT: số quote + WO đã ghi tay, để IT chuẩn bị re-import
>
> ### Tại Kiosk MES (4 máy ngoài xưởng)
>
> 1. Operator ghi giấy: WO-ID, Op-ID, Start time, Pause/Resume, Complete time, Reason code (nếu pause)
> 2. Cuối shift, supervisor key vào hệ thống sau khi recovery
> 3. **TUYỆT ĐỐI KHÔNG** đoán số liệu — nếu chưa rõ giờ start/stop, ghi "??" và để supervisor giải quyết sau
>
> ### Tại Production floor
>
> 1. Tiếp tục chạy theo Schedule đã in ra TRƯỚC outage (ở văn phòng trưởng ca có bản cứng)
> 2. Nếu cần biết status của WO mới: gọi office; office tra `Fallback_WorkOrder_Manual_v1.0.xlsx`
>
> ### Báo khi recovery
>
> 1. Khi `http://10.102.3.61:3000/health` xanh trở lại VÀ IT báo "OK to resume":
>    - **KHÔNG** nhập lại tay từng dòng — chờ IT chạy script import
>    - Tiếp tục ghi vào Excel cho đến khi IT bảo dừng
>    - IT sẽ import file Excel vào hệ thống + báo lại "đã import xong, từ giờ nhập trực tiếp"

## B.5 Engineer recovery procedure (after outage resolved)

```bash
# 1. SSH to prod (or whatever surface is now functional)
ssh user@<host>

# 2. Take fresh DB backup before importing fallback data
cd /opt/ops-control
npm run backup:run

# 3. Copy the operator-edited xlsx files from shared LAN to local
scp user@<file-server>:/OpsControl/Fallback/Fallback_Quote_Manual_*.xlsx ./tmp/
scp user@<file-server>:/OpsControl/Fallback/Fallback_WorkOrder_Manual_*.xlsx ./tmp/

# 4. Dry-run the import (does NOT write to DB; prints what would be written)
node scripts/import-fallback-xlsx.js --dry-run \
  --quotes=./tmp/Fallback_Quote_Manual_*.xlsx \
  --workorders=./tmp/Fallback_WorkOrder_Manual_*.xlsx

# 5. Review output — fix any rejected rows in the xlsx, repeat dry-run

# 6. Commit the import
node scripts/import-fallback-xlsx.js --commit \
  --quotes=./tmp/Fallback_Quote_Manual_*.xlsx \
  --workorders=./tmp/Fallback_WorkOrder_Manual_*.xlsx

# 7. Verify in UI: Quote History should show the new quotes; Work Orders tab the new WOs

# 8. Audit log inspection — every imported row should have:
sqlite3 server/data/ops.db "SELECT COUNT(*) FROM audit_log WHERE event LIKE 'QUOTE_SAVE' AND ts > datetime('now', '-1 hour')"

# 9. Archive the operator xlsx files for forensic trail
mkdir -p server/data/Library/FallbackRuns/
mv ./tmp/Fallback_*.xlsx server/data/Library/FallbackRuns/$(date +%Y%m%d-%H%M%S)/

# 10. Broadcast "OK to resume direct entry" in Zalo group
```

## B.6 Operator-facing recovery announcement (Vietnamese)

> 🟢 **HỆ THỐNG OPS CONTROL ĐÃ PHỤC HỒI** — chuyển từ quy trình tạm sang nhập trực tiếp.
>
> 1. IT đã import dữ liệu Excel tạm vào hệ thống — kiểm tra Quote History thấy quote/WO của anh chị xuất hiện đầy đủ chưa.
> 2. Nếu **THIẾU** quote/WO nào: báo IT NGAY (gọi Lead Engineer Đặng Thế Thiệp `+84965191991` hoặc Zalo nhóm "OpsControl GoLive").
> 3. Nếu **DƯ** quote/WO (import nhầm trùng): cũng báo IT NGAY.
> 4. **TỪ GIỜ**, nhập trực tiếp vào hệ thống — KHÔNG dùng Excel `Fallback_*` nữa.
> 5. IT sẽ archive file Excel tạm; anh chị không cần xóa.
> 6. Cảm ơn anh chị đã kiên nhẫn trong thời gian outage.

## B.7 Risks of Runbook B that Plant Manager must accept

| Risk                                                 | Probability | Impact                          | Mitigation                                                                               |
| ---------------------------------------------------- | ----------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| Operator forgets a quote during outage panic         | Medium      | Lost revenue + customer trust   | Paper copies + supervisor checkpoint each hour                                           |
| Re-import script rejects rows (typos, wrong columns) | Medium      | Supervisor manual fix 1-2 hours | Dry-run before commit; reject report makes errors visible                                |
| Two operators write same RFQ-ID in xlsx              | Low         | Conflict at re-import           | RFQ-ID column has validation per Excel template; supervisor reconciles                   |
| WO status during outage is uncertain                 | High        | Production schedule slippage    | Production runs from pre-outage printed schedule; new WOs queue until recovery           |
| Kiosk scan data lost (no paper backup of every scan) | Medium      | Operations log incomplete       | Operator writes critical scans on paper at supervisor desk                               |
| Customer asks for quote during outage                | High        | Sales delay 1-2 hours           | Sales team quotes verbally + emails confirmation; rate sheet on paper at supervisor desk |

## B.8 Communication plan during outage

| Audience                 | Channel                             | Timing                    | Message                                                |
| ------------------------ | ----------------------------------- | ------------------------- | ------------------------------------------------------ |
| Floor operators          | PA + Zalo group + supervisor verbal | Immediate                 | "Switch to Fallback xlsx"                              |
| Plant Manager            | Phone + email                       | Within 5 min              | "Sev-1 outage detected at HH:MM; ETA HH:MM"            |
| Top-5 customers          | Sales Lead phone + WhatsApp         | Within 30 min             | "Brief system maintenance; quotes ETA HH:MM"           |
| Project Lotus contractor | Lead Engineer email                 | Within 1 hour             | "Incident report; engineer engaged; ETA HH:MM"         |
| All staff                | Email + Zalo broadcast              | Hourly during outage      | Status update + ETA                                    |
| Customers (recovery)     | Sales Lead email                    | Within 30 min of recovery | "System back online; quotes resume normal turn-around" |

---

# CROSS-RUNBOOK REFERENCES

## Backup recovery (Runbook A or B depends on cause)

For "all data gone after a restore" or "SQLite corrupted":

```bash
ssh user@<host>
# 1. Stop service
nssm stop ops-control  # or: systemctl stop ops-control

# 2. Locate latest verified backup
ls -lt /opt/ops-control/server/data/Backup/SQLite/ | head -5

# 3. Verify integrity before restoring
cd /opt/ops-control
npm run verify-backup server/data/Backup/SQLite/ops_20260530_020000.sqlite

# 4. Replace live DB
cp server/data/Backup/SQLite/ops_20260530_020000.sqlite server/data/ops.db.NEW
mv server/data/ops.db server/data/ops.db.BAD-$(date +%Y%m%d-%H%M%S)
mv server/data/ops.db.NEW server/data/ops.db

# 5. Restore Library tarball if needed
cd server/data/
tar xzf Backup/Library/library_20260530.tar.gz
# Verify all expected subdirectories present

# 6. Re-start
nssm start ops-control

# 7. Verify /health + a sample query
curl http://localhost:3000/health
```

## TOTP / 2FA lockout (separate from rollback but ops will ask)

If all users locked out after restore:

```bash
cd /opt/ops-control
# Option A (preferred): restore .env that was paired with the restored DB
# Option B: re-enroll every user
OPS_TOTP_KEY=$(npm run preflight | grep TOTP) node scripts/reset-totp.js
# Users prompted for new QR on next login
```

Full TOTP rotation playbook is in CLAUDE.md "TOTP key rotation runbook".

## All admin/sys users lost access (chicken-and-egg)

```bash
ssh user@<host>
cd /opt/ops-control
node scripts/recover-sys-user.js
# Type CONFIRM-RECOVER at prompt
# Choose [1] reset existing OR [2] create "recovery-sys" user
# Script prints temp pwd ONCE — copy it
```

## Bare-metal restore (disk dies, fresh box)

See CLAUDE.md section "Bare-metal restore — disk dies / fresh box". Summary:

1. Install Node 24 on new box
2. Rsync off-site backup to `/opt/ops-control/`
3. Restore `.env` from secure backup (CRITICAL: must include `OPS_TOTP_KEY` from prior install)
4. `npm install --production`
5. `NODE_ENV=production npm run preflight` (must pass)
6. `systemctl enable --now ops-control` (or NSSM equivalent)
7. Tail logs for `🔐 TOTP boot probe OK`

**RPO target**: 24h (nightly backup) — actual depends on backup being enabled per P0-1.
**RTO target**: ~2h hot-spare (NOT provisioned for Yen Phong), ~6h cold (fresh box).

---

# DECISION FLOWCHART (for Sev-1 outage at Yen Phong)

```
                  Sev-1 detected: /health 500 or unreachable
                              │
                              ▼
                Wait 10 min — auto-recovery? (NSSM restart)
                              │
                  ┌───────────┴───────────┐
                YES                       NO
                  │                       │
        Resume normal              Diagnose: recent deploy?
                              ┌───────────┴───────────┐
                            YES                       NO
                              │                       │
                  Snapshot exists for             SQLite integrity ok?
                  previous version?          ┌───────────┴───────────┐
                  ┌────────┴────────┐      YES                       NO
                YES                NO        │                       │
                  │                │   Server hardware ok?    DB corrupted → RUNBOOK B
                  ▼                ▼        ┌───────┴───────┐
              RUNBOOK A      RUNBOOK B    YES              NO
              (rollback)     (manual)      │                │
                                    Network ok?    Hardware → RUNBOOK B
                                    ┌───┴───┐
                                  YES      NO
                                    │       │
                              Engineer    Network →
                              triage      RUNBOOK B
                              30 min
                              ↓
                          Fix or
                          RUNBOOK B
```

---

# OWNER ASSIGNMENTS

| Section                   | Owner                                                 | Backup                                                                    |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| A.1-A.7 Software rollback | Sysadmin                                              | Lead Engineer                                                             |
| B.3 Pre-conditions met    | Lead Engineer (D-5 deliverables)                      | Sales Lead (xlsx templates)                                               |
| B.4 Operator workflow     | Floor supervisor (each shift)                         | Sales Lead office-side                                                    |
| B.5 Re-import             | Lead Engineer                                         | Backup Engineer                                                           |
| B.6-B.7 Communication     | Plant Manager (authority) + Sales Lead (execution)    | Lead Engineer (technical narrative)                                       |
| Backup recovery           | Sysadmin                                              | Lead Engineer                                                             |
| TOTP rotation             | Lead Engineer                                         | Backup Engineer (Hương — can execute per CLAUDE.md TOTP rotation runbook) |
| Sys-user recovery         | Sysadmin (with OS shell)                              | —                                                                         |
| Bare-metal restore        | Lead Engineer (joint engineering + sysadmin function) | Backup Engineer (Hương — escalates to vendor if hardware fault)           |

---

# POST-INCIDENT REVIEW

After ANY rollback or fallback event:

1. Within 24h: Lead Engineer + Sysadmin + Plant Manager 30-min retro
2. Within 48h: incident report in `docs/incidents/2026-MM-DD-<short-title>.md` covering:
   - What happened (timeline)
   - Root cause
   - Detection (how + when)
   - Resolution (Runbook A or B; commands run)
   - Customer impact
   - Lessons learned
3. Within 7 days: action items committed to MES-3.5 backlog
4. Quarterly: review all incidents + adjust runbooks

---

**End of Rollback Runbook. Companion documents:**

- `GO-LIVE-AUDIT-REPORT-v1.2-20260522.md` — full findings + executive summary
- `8-DAY-CUTOVER-PLAN-20260522.md` — sequenced D-8 to D+7 actions
- `CLAUDE.md` "Recovery playbook" section — older detailed runbooks
