# Mac Install Guide — Ops Control v1.5.10

> Operator-facing one-pager for installing Ops Control on macOS.
> Cover Apple Gatekeeper quarantine fix, install both DMG roles,
> common first-run errors. Print 1 paper copy per Mac operator and
> circulate via Zalo before D-6 (2026-06-03) UAT kickoff.
>
> **Target**: 7 Mac operators on CCL Vietnam Yen Phong shop floor.
> **DMG roles**: SERVER (1 install on Lead's Mac — port 3100 LAN host),
> CLIENT (6 installs on operator Macs — thin shell, connect to SERVER over LAN).

---

## What you receive

A USB stick (or shared Zalo file) with one or both DMGs:

| File                                  | Role   | Who installs                    |
| ------------------------------------- | ------ | ------------------------------- |
| `Ops Control SERVER 1.5.10-arm64.dmg` | SERVER | Lead Engineer's Mac (1 machine) |
| `Ops Control CLIENT 1.5.10-arm64.dmg` | CLIENT | All operator Macs (6 machines)  |

SHA256 fingerprints land in the Zalo announcement. Verify before
double-clicking:

```bash
shasum -a 256 "Ops Control SERVER 1.5.10-arm64.dmg"
shasum -a 256 "Ops Control CLIENT 1.5.10-arm64.dmg"
```

If the printed hex doesn't match the Zalo broadcast, STOP. Do not
install — the file may be corrupted or tampered. Re-download from
the canonical source.

---

## Pre-install — Quit any previous version

If a previous Ops Control build is running:

1. **Cmd+Q** the app window
2. If frozen — Activity Monitor → search "Ops Control" → Force Quit
3. Verify nothing left listening on port 3100 (SERVER role only):

   ```bash
   lsof -nP -iTCP:3100 -sTCP:LISTEN
   ```

   Should print nothing. If a PID still shows, `kill <PID>` then
   re-check.

---

## Install (3 minutes per Mac)

### Step 1 — Mount the DMG

Double-click `Ops Control <ROLE> 1.5.10-arm64.dmg`. A Finder window
opens showing the app icon + Applications shortcut.

### Step 2 — Drag the app into Applications

Drag `Ops Control.app` onto the `Applications` shortcut. If a previous
version exists, macOS will ask **Replace** — click Replace.

> Tip: the DMG mount auto-unmounts when the Finder window closes.
> If you double-click the app inside the DMG instead of the
> /Applications copy, the app will run from `/Volumes/...` and break
> on next reboot. Always drag to /Applications first.

### Step 3 — First launch — handle Apple Gatekeeper

This DMG is **ad-hoc signed** (not Apple-notarized — would cost $99/yr
Apple Developer Program enrollment, deferred). On first launch
macOS shows one of these dialogs:

#### Dialog A: "Ops Control" can't be opened because Apple cannot check it for malicious software

This is Gatekeeper blocking unsigned-by-Apple apps. To bypass:

**Option 1 — System Settings (recommended)**:

1. Click **Done** on the warning dialog
2. Open **System Settings** → **Privacy & Security**
3. Scroll to the bottom — you'll see _"Ops Control" was blocked from use because it is not from an identified developer._
4. Click **Open Anyway**
5. macOS prompts for password — enter it
6. Click **Open** in the follow-up confirmation

**Option 2 — Terminal one-liner (faster, for Lead Engineer or sysadmin only)**:

```bash
xattr -dr com.apple.quarantine "/Applications/Ops Control.app"
```

Then double-click the app — it launches normally. The `xattr` command
removes the quarantine flag that Gatekeeper checks; safe because you
verified the SHA256 above.

#### Dialog B: "Ops Control" is from an unidentified developer

Same fix as Dialog A. Either bypass via System Settings or use the
`xattr` command.

#### Dialog C: nothing happens / silent crash

Open Console.app → search "Ops Control" → look for the latest crash
log. Most common causes:

- Mac is x86_64 (Intel), DMG is `-arm64.dmg` (Apple Silicon only).
  Check `uname -m` — if it prints `x86_64`, ask Lead Engineer for an
  Intel build (or check whether Rosetta 2 is installed: should be
  prompted on first launch if so).
- Insufficient disk — Ops Control needs ~250 MB. Check **About This
  Mac** → Storage.

---

## First-run setup wizard

After Gatekeeper passes, Ops Control opens to a setup wizard:

### SERVER role wizard

1. **Step 1**: confirms the install role (should auto-show "SERVER").
   Click **Next**.
2. **Step 2**: shows the LAN IP + port the SERVER will listen on
   (typically `http://10.102.3.61:3100` or similar — depends on
   network). Note this URL — operator Macs will need it.
3. Click **Finish**. The server starts; Mac firewall may prompt
   "Allow incoming connections" → click **Allow**.

### CLIENT role wizard

1. **Step 1**: confirms role "CLIENT".
2. **Step 2** — Server URL. Type the SERVER URL captured during
   SERVER setup (e.g. `http://10.102.3.61:3100`). Click **Test
   connection**. Should show ✅ "Server v1.5.10 phản hồi OK" in green.
   - If shows ❌ "Failed to fetch": check the SERVER Mac is on the same
     LAN, the server process is running, the URL has `http://` prefix,
     and the colon + port is correct (not a dot).
3. Click **Finish**. The login screen appears.

---

## License activation

First launch on a new Mac shows **License Invalid** banner. To
activate:

1. Click on the banner → modal opens with **Installation ID** (a
   base64 string ~140 chars)
2. Copy the Installation ID
3. Send via Zalo to Lead Engineer with subject `LICENSE REQUEST —
<Operator Name> <Mac model>`
4. Lead Engineer runs license generator + replies with a `.lic`
   string
5. Paste the `.lic` content into the **Activation Key** field →
   click **Activate**
6. License banner disappears; you can now log in

---

## Login

Default credentials handed during D-1 prep session per
`docs/cutover/BACKUP_ENGINEER_BRIEF_2026-06-09.md`:

- **Username**: operator's username (per HR onboard list)
- **Password**: temp password from Provisioning Card (paper card given
  during D-1 prep)
- **TOTP code**: scanned from QR shown on first login (use Microsoft
  Authenticator OR Google Authenticator OR similar)

First login forces password change (`must_change_password=true`). Set
a strong personal password (min 12 chars, mixed case + digit). Write
it down once on paper, store in your wallet — there is no password
recovery short of a Lead Engineer reset via Provisioning Card.

---

## Common first-run issues

| Symptom                                                  | Cause                                                        | Fix                                                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Cannot be opened because Apple cannot check it"         | Gatekeeper quarantine flag                                   | Step 3 Dialog A above — System Settings → Privacy & Security → Open Anyway                                                                              |
| "Failed to fetch" on CLIENT setup                        | Wrong SERVER URL OR SERVER not running OR LAN issue          | Check the URL on SERVER Mac (Finder → /Applications/Ops Control.app → first-run shows the URL). Verify network with `ping <SERVER_IP>` from CLIENT Mac. |
| "License Invalid" persists after activation              | Lead Engineer used wrong Installation ID                     | Re-copy the Installation ID, send again. Don't truncate it — must be the full ~140-char base64 string.                                                  |
| "Session expired" right after login                      | Server time drift from client > 5 min                        | Run `sudo sntp -sS time.apple.com` on both Macs to resync. macOS Sonoma+ auto-syncs; older versions need manual.                                        |
| App opens but shows blank white screen                   | Renderer crashed — usually stale config from prior version   | Quit Ops Control. Run: `rm -rf "$HOME/Library/Application Support/ops-control-desktop/ops-control-config.json"`. Relaunch. Re-do wizard.                |
| Mac CLIENT setup stuck on legacy "Lưu & tiếp tục" dialog | `setup-done.json` marker from old install                    | Quit. Run: `rm "$HOME/Library/Application Support/ops-control-desktop/setup-done.json"`. Relaunch. The v1.3 wizard with "Test connection" will appear.  |
| "Port 3100 already in use" on SERVER launch              | Previous server process still running OR another app on port | Activity Monitor → Force Quit any "Ops Control" / "node". Or terminal: `lsof -ti:3100 \| xargs kill -9`                                                 |

---

## Verifying the install

After login, click **Cost → Standard** in the sidebar. You should see:

- ✅ Tabs: RFQ & MOQ Info / Layout / Materials / Inks / Processes / Balancing / Pack & Ship / Cost Breakdown / Summarize / Legend
- ✅ Top-right corner shows "online" green pill + your username
- ✅ Bottom-left sidebar shows "SYSTEM → Settings" if you're admin/sys

If any tab crashes with "Cost → <tab> crashed" — that's a stale-chunk
bug; quit + relaunch should auto-recover. If it persists, capture a
screenshot + escalate to Lead Engineer.

---

## Upgrade path (D+1 onwards)

When Lead Engineer ships a new DMG:

1. **Quit current Ops Control** (Cmd+Q)
2. Mount new DMG → drag-overwrite the app into `/Applications`
3. Re-run `xattr -dr com.apple.quarantine "/Applications/Ops Control.app"` if Gatekeeper warns again (each new DMG carries a fresh quarantine flag)
4. Relaunch

**Data is preserved across upgrades**:

- SERVER role keeps `~/Library/Application Support/ops-control-desktop/data/` — quotes, audit log, license, TOTP secrets all persist
- CLIENT role keeps `~/Library/Application Support/ops-control-desktop/ops-control-config.json` — server URL, theme pref

**License does NOT carry across machines.** Each Mac has a unique
Installation ID; re-running the license activation flow generates a
new `.lic` per machine.

---

## Reset everything (factory reset on this Mac)

If a Mac install is broken beyond troubleshooting and you want to
start fresh:

```bash
# 1. Quit Ops Control + verify no node listening
pkill -f "Ops Control"
sleep 2

# 2. Wipe app config + data (CLIENT — safe, no data loss because data lives on SERVER)
rm -rf "$HOME/Library/Application Support/ops-control-desktop/"

# 3. Wipe app preferences
defaults delete com.cclvn.opscontrol 2>/dev/null
rm -rf "$HOME/Library/Preferences/com.cclvn.opscontrol.plist"

# 4. Remove the app
rm -rf "/Applications/Ops Control.app"

# 5. Re-install from DMG per Step 1-3 above
```

**WARNING — DO NOT run step 2 on the SERVER Mac.** That folder
contains ALL quotes / audit log / TOTP secrets / license. Backup
first: `cp -R ~/Library/Application\ Support/ops-control-desktop ~/Desktop/ops-backup-$(date +%Y%m%d)`.

---

## Operator quick-card (print + tape to monitor)

```
=== Ops Control 1.5.10 — Operator Cheat Card ===

LAUNCH:           /Applications/Ops Control.app  (or Spotlight: "Ops Control")
SERVER URL:       http://10.102.3.61:3100   (or whatever Lead announced)
LOGIN:            <your username> + <temp pwd from card> + <TOTP from authenticator app>

CRASH:            quit (Cmd+Q) → relaunch
"Failed to fetch": check Wi-Fi, ping the SERVER IP from Terminal
"License invalid": copy Installation ID → Zalo Lead Engineer → paste back the .lic key

HELP:             Cost → SYSTEM → Help (F1 anywhere goes to the current tab's help)
EMERGENCY:        Zalo group "OpsControl GoLive 2026-06-09"
LEAD ENGINEER:    +84965191991 (Đặng Thế Thiệp)
BACKUP ENGINEER:  +84988749869 (Trần Thị Hương)
```

---

## Companion files

- `docs/cutover/BACKUP_ENGINEER_BRIEF_2026-06-09.md` — Hương scope + contacts
- `docs/cutover/STOP_TRIGGERS_2026-06-09.md` — 11 halt criteria
- `docs/cutover/ROLLBACK-RUNBOOK-20260522.md` — incident playbook (engineer-facing)
- `client/public/help/OpsControl_UserGuide.docx` — full user guide (in-app: Help tab)

---

**Document version**: 1.0 (D-14 2026-05-26)
**Owner**: Lead Engineer (Đặng Thế Thiệp)
**Audience**: 7 Mac operators (1 SERVER + 6 CLIENT) at CCL Vietnam Yen Phong
**Print + circulate**: D-15 evening or D-14 morning before walkthrough
