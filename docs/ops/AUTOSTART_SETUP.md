# Auto-start Setup for Ops Control SERVER · Cài SERVER tự khởi động

## Purpose · Mục đích

Wire the Ops Control SERVER (Mac mini OR Windows workstation at site) to:

1. **Auto-start at OS login** — after a power outage + reboot, the SERVER comes back online without operator action
2. **Auto-restart on crash** — if the process exits unexpectedly, the OS relaunches it (with crash-loop throttle)

Mitigates C-4 BCP gap post no-hotspare decision (`C4_HOTSPARE_PROCUREMENT.md` 2026-06-21): RTO is now Orange (14-22 days for hardware replacement), so eliminating soft failure modes (process crash, accidental quit, post-reboot manual launch) is high-leverage.

> **⚠️ Out of scope for v1**: LAN-loss watchdog (curl `/health`, restart on no-response). The SERVER does NOT need to restart when LAN drops — SQLite is local, Express keeps serving, CLIENTs reconnect when LAN restores. Restarting on LAN loss would actually be WORSE (drops in-flight requests + brief total unavailability). Add a watchdog later only if operators report silent-hang behavior in practice.

---

## 🍎 macOS install (LaunchAgent) · Cài cho macOS

**Prereq · Yêu cầu trước**:

- Ops Control SERVER DMG đã cài tại `/Applications/Ops Control SERVER.app`
- Auto-login đã bật ở `System Settings → Users & Groups → Automatic Login` (cần thiết để LaunchAgent chạy sau khi reboot — LaunchAgent KHÔNG chạy ở loginwindow trước khi user login)

**Install · Cài**:

```bash
cd /path/to/Ops-Control
sh scripts/ops-autostart/install-macos.sh
```

Output:

```
✓ LaunchAgent installed: ~/Library/LaunchAgents/com.ccldesign.opscontrol-server.plist

Verify:
  launchctl list | grep com.ccldesign.opscontrol-server

Logs:
  ~/Library/Logs/ops-control-server.out.log
  ~/Library/Logs/ops-control-server.err.log
```

**Verify · Kiểm tra**:

```bash
# Check agent registered
launchctl list | grep com.ccldesign.opscontrol-server
# Expected: "12345  0  com.ccldesign.opscontrol-server" (PID may vary; second column 0 = healthy)

# Check app actually running
pgrep -fl "Ops Control SERVER"
# Expected: PID + path

# Check health endpoint reachable
curl -sS http://localhost:3100/health
# Expected: {"status":"ok",...}

# Test auto-restart by killing the app
killall "Ops Control"
sleep 35  # ThrottleInterval is 30s
pgrep -fl "Ops Control SERVER"
# Expected: a NEW PID (different from before kill)
```

**Uninstall · Gỡ**:

```bash
sh scripts/ops-autostart/uninstall-macos.sh
```

---

## 🪟 Windows install (Task Scheduler) · Cài cho Windows

**Prereq · Yêu cầu trước**:

- Ops Control SERVER Setup .exe đã cài (default: `%LOCALAPPDATA%\Programs\Ops Control\`)
- Auto-login đã bật: `netplwiz` → uncheck "Users must enter a user name and password to use this computer" (cần thiết để Task Scheduler trigger AtLogon sau khi reboot)

> **Why not a Windows Service?** Electron apps require a GUI session — they fail in Session 0 (the service session). Task Scheduler "At log on" trigger is the correct pattern for a desktop SERVER role. NSSM would be appropriate only if we were running a headless `node server/index.js` instead of the Electron-wrapped server.

**Install · Cài**:

PowerShell as the user who will run the SERVER (NOT necessarily admin):

```powershell
cd C:\path\to\Ops-Control
powershell -ExecutionPolicy Bypass -File scripts\ops-autostart\install-windows.ps1
```

Output:

```
Using app path: C:\Users\<user>\AppData\Local\Programs\Ops Control\Ops Control.exe

✓ Scheduled task installed: OpsControlServer
  State: Ready
  Trigger: AtLogon (any user)
  Restart on failure: 3 attempts, 1-minute interval
```

**Verify · Kiểm tra**:

```powershell
# Check task registered
Get-ScheduledTask -TaskName OpsControlServer
# Expected: State = Ready

# Trigger manually + check process
Start-ScheduledTask -TaskName OpsControlServer
Start-Sleep -Seconds 5
Get-Process "Ops Control" -ErrorAction SilentlyContinue
# Expected: process listed with PID + StartTime

# Check health endpoint reachable
Invoke-RestMethod http://localhost:3100/health
# Expected: status = "ok"

# Test auto-restart by killing the app
Stop-Process -Name "Ops Control" -Force
Start-Sleep -Seconds 65  # restart-on-failure interval is 1 minute
Get-Process "Ops Control" -ErrorAction SilentlyContinue
# Expected: process restarted (StartTime is recent)
```

**Override install path** (if installed to non-default location):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\ops-autostart\install-windows.ps1 -AppPath "D:\OpsControl\Ops Control.exe"
```

**Uninstall · Gỡ**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\ops-autostart\uninstall-windows.ps1
```

---

## 🧪 End-to-end BCP test · Test thực tế

After installing on the production SERVER machine, run this 4-step drill before depending on it:

### Test 1 — Process crash → auto-restart

1. Confirm Ops Control SERVER running + reachable
2. Force-kill the process (`killall` on Mac, `Stop-Process -Force` on Win)
3. Wait the throttle interval (30s Mac, 60s Win)
4. ✅ Process should restart automatically; new PID; `curl /health` returns 200

### Test 2 — Clean quit → does NOT restart

1. Quit Ops Control SERVER via menu Cmd+Q (Mac) or close window normally (Win)
2. Wait 60s
3. ✅ Process should stay dead; relaunch manually via the auto-start mechanism (`launchctl start` or `Start-ScheduledTask`) OR by opening the app

(This distinction matters: operator can stop the SERVER for maintenance without the OS fighting back.)

### Test 3 — Reboot → auto-start

1. With Ops Control SERVER running, restart the Mac/Win box
2. Wait for OS boot + auto-login
3. ✅ Within ~30-60 seconds of desktop appearing, Ops Control SERVER should be running automatically; `curl /health` returns 200

### Test 4 — Power outage simulation (optional, riskier)

1. With Ops Control SERVER running, hard-cut power (unplug)
2. Wait ~30s, restore power
3. After Mac/Win boots + auto-logins, verify SERVER comes back automatically
4. Run a quote-save round-trip from a CLIENT to confirm data integrity not affected by the unclean shutdown

If Test 4 reveals SQLite corruption (rare but possible on unclean shutdown), the M-5a integrity probe (PR #192) at SERVER boot will catch it + log to stderr. Combined with M-5b bit-rot detection (PR #193), data-loss risk is bounded.

---

## 📋 Operator handover checklist · Bàn giao cho operator

Before considering the SERVER box production-ready, confirm:

- [ ] App installed (SERVER DMG / Setup.exe)
- [ ] LaunchAgent / Scheduled task installed (this guide)
- [ ] Auto-login enabled on OS
- [ ] Tests 1-3 passed (Test 4 optional)
- [ ] Operator-facing escalation contact pinned: who to call if SERVER is unreachable for >10 minutes?
- [ ] M-5a integrity probe verified in boot logs
- [ ] Off-site backup rsync working (separate runbook)
- [ ] Bit-rot cron deployed (per `C4_DRILL_RUNBOOK.md` Block 2)

---

## Cross-reference

- `scripts/ops-autostart/com.ccldesign.opscontrol-server.plist` — macOS LaunchAgent template
- `scripts/ops-autostart/install-macos.sh` + `uninstall-macos.sh` — macOS install/uninstall
- `scripts/ops-autostart/OpsControlServer.Task.xml` — Windows Task Scheduler template
- `scripts/ops-autostart/install-windows.ps1` + `uninstall-windows.ps1` — Windows install/uninstall
- `docs/ops/C4_HOTSPARE_PROCUREMENT.md` — no-hotspare decision (why this mitigation matters)
- `docs/ops/C4_DRILL_RUNBOOK.md` — companion BCP drill (combine auto-start verify with Test 1-3 above into the drill day)
- CLAUDE.md "Recovery playbook" — Linux systemctl equivalent for the prod 10.102.3.61 Windows server
