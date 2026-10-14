<!-- Tách khỏi CLAUDE.md ngày 2026-10-14 (nguyên văn). -->

# Recovery playbook

### "OPS_EXPORT_HMAC_KEY lost or rotated mid-cycle" (Sprint S-EXPORT-MVP-2)

**Default policy**: do NOT rotate `OPS_EXPORT_HMAC_KEY` once production
quotes have been exported. Every signed xlsx becomes unverifiable on
key change. `deploy.sh` / `deploy.ps1` preserve the key automatically;
preflight refuses prod boot without it.

**Symptom (key missing on prod boot)**:

```
PREFLIGHT FAIL: OPS_EXPORT_HMAC_KEY — must be a 64-char hex string.
```

**Fix**: capture the existing key from a `.env` backup OR generate
a new one, set it on the box, restart:

```bash
ssh user@host
# Inspect backup
grep OPS_EXPORT_HMAC_KEY /opt/ops-control/releases/<prev>/.env  # if recoverable
# OR generate fresh (only if no backups exist)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Set in .env
sed -i 's|^OPS_EXPORT_HMAC_KEY=.*|OPS_EXPORT_HMAC_KEY='<key>'|' /opt/ops-control/.env
chmod 600 /opt/ops-control/.env
systemctl restart ops-control
```

**What if the key is genuinely lost (no backup, regenerated fresh)?**

| Surface affected                      | Impact                                                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer xlsx files (issued pre-loss) | **Still open + read fine.** Visible sheets are unencrypted; only sheet-edit-lock uses XOR. Customer never re-imports.                                                               |
| Internal xlsx files (issued pre-loss) | Same — still readable by humans + by spreadsheet tools.                                                                                                                             |
| Audit-log forensic trace              | Still intact: `wb_password_hash` + `schema_sha256` + `hmac` were logged per export. Auditors can match hash to xlsx file even without verifying signature.                          |
| MVP-3 re-import (when shipped)        | **Refuses pre-loss exports.** HMAC verify will fail because the new key produces a different digest. Operator must re-export from source quote, OR auditor falls back to audit log. |
| Post-loss exports                     | Work normally with the new key. Tamper detection resumes.                                                                                                                           |

Routine compliance (read + audit-trail review) survives key loss.
Fraud detection (HMAC verification of historical xlsx) does NOT —
file an incident memo if a key-loss event happens in a regulated
context. Treat the key with the same operational discipline as
`OPS_TOTP_KEY` + `OPS_KIOSK_KEY`.

### "All users are locked out of 2FA"

```bash
# On the server where the bad OPS_TOTP_KEY was set:
cd "3. PROJECTS/Ops Control"
# Option A (preferred): restore the previous OPS_TOTP_KEY from .env backup
# Option B: re-enroll every user
OPS_TOTP_KEY=$(new_key) node apps/scripts/reset-totp.js
# Users will be prompted to scan a new QR on next login.
```

### TOTP key rotation runbook (Sprint 13)

**The default policy is: NEVER rotate `OPS_TOTP_KEY`.** Every encrypted
2FA secret in `Library/totp/secrets.json` is keyed against this value;
rotating it without a coordinated re-enrollment locks every user out.
When in doubt, leave it alone — `deploy.sh`/`deploy.ps1` automatically
preserve the existing key across deploys.

**When rotation is genuinely required** (suspected key disclosure,
compliance mandate, post-incident hygiene):

1. **Schedule a maintenance window** (≥30 minutes). Notify all users
   via Slack/Teams that they'll need to re-enroll their authenticator
   apps. Without this notice, users see "Invalid code" with no
   explanation.

2. **Capture the OLD key** before changing anything:

   ```bash
   ssh user@host "grep OPS_TOTP_KEY /opt/ops-control/.env"
   # Store this somewhere safe in case rollback is needed.
   ```

3. **Generate the NEW key**:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Must be exactly 64 hex chars. Server's preflight rejects shorter.

4. **Stop the server** to prevent in-flight TOTP verifications from
   landing on a half-rotated state:

   ```bash
   ssh user@host "systemctl stop ops-control"   # Linux
   # OR: nssm stop ops-control                   # Windows
   ```

5. **Wipe the encrypted secrets file**:

   ```bash
   ssh user@host "mv /opt/ops-control/server/data/Library/totp/secrets.json{,.before-rotation}"
   ```

   The `.before-rotation` backup lets you roll back if step 6 fails.

6. **Update `.env`** with the new key:

   ```bash
   ssh user@host "sed -i 's|^OPS_TOTP_KEY=.*|OPS_TOTP_KEY=$NEW_KEY|' /opt/ops-control/.env"
   ssh user@host "chmod 600 /opt/ops-control/.env"
   ```

7. **Start the server** + verify boot probe:

   ```bash
   ssh user@host "systemctl start ops-control && journalctl -u ops-control -n 20"
   # Look for: "🔐  TOTP boot probe OK — 0 user(s) enrolled, key fp …"
   ```

   The probe says 0 enrolled because the secrets file was wiped.

8. **First user to log in** re-enrolls automatically — login-with-2FA
   sees `enrollment_required: true` and shows the QR-code dialog. They
   scan + verify, server stores the new encrypted secret, login completes.

9. **Confirm rotation success** after first 5 users have re-enrolled:

   ```bash
   curl -s http://host:3000/health
   ssh user@host "ls -la /opt/ops-control/server/data/Library/totp/secrets.json"
   # Size should grow as users re-enroll. If it stays 0, the boot probe
   # is fine but writes are failing — check disk perms.
   ```

10. **Roll back if needed** (within 1 hour, before users re-enroll):
    ```bash
    ssh user@host "systemctl stop ops-control"
    ssh user@host "mv /opt/ops-control/server/data/Library/totp/secrets.json.before-rotation /opt/ops-control/server/data/Library/totp/secrets.json"
    ssh user@host "sed -i 's|^OPS_TOTP_KEY=.*|OPS_TOTP_KEY=$OLD_KEY|' /opt/ops-control/.env"
    ssh user@host "systemctl start ops-control"
    ```
    After users have re-enrolled with the new key, rollback is no
    longer safe — those users would lose access on the old key.

**Audit trail:** Every TOTP enrollment + verification is logged to the
audit log (`PG_CHANGE_REVOKE`, `LOGIN_TOTP_OK`, `TOTP_ENROLL`). Use
this to confirm post-rotation that all expected users re-enrolled
within the maintenance window.

### "All data gone after a restore"

Backups are at `server/data/Library/**/*.backup.*` and `Backup & restore/`. Restore is OVERWRITE, not merge — the audit trail for who triggered it lives in `server/logs/`.

### "npm run build fails at prebuild"

The prebuild hook runs Word-doc generators. If any fails, the build aborts. Check `apps/scripts/help/build-all-docs.mjs` — common failure is missing `docx` dep (install: `npm install --save-dev docx`) or a corrupt `apps/client/src/help/content.js`.

### "All admin / sys users lost access" (Sprint 1.7)

Web UI requires an existing sys session to mint a sys user — chicken-and-egg if every sys/admin account is deactivated, deleted, or locked. Console-only escape hatch:

```bash
ssh user@server
cd /opt/ops-control            # or wherever DATA_DIR points
node apps/scripts/recover-sys-user.js
# Type CONFIRM-RECOVER at the prompt
# Choose [1] reset existing user OR [2] create "recovery-sys" user
# Script prints temp pwd ONCE — copy it before closing the terminal
```

The new (or reset) account is `role=sys`, `must_change_password=true`, `2FA cleared`. Login forces a pwd change immediately. Audit row `SYS_RECOVERY` is appended for forensic trace; review it weekly.

**Filesystem prerequisite**: `chmod 600 server/data/Library/Users/users.json` so only the deploy user can run the script. Anyone with shell access to the data dir can mint a sys user — that's by design (otherwise recovery is impossible) but means the OS account is the trust boundary.

### "Bad deploy — need to roll back" (Sprint 1.7)

`deploy.sh` now snapshots the live `/opt/ops-control` to `/opt/ops-control/releases/<timestamp>/` BEFORE rsyncing the new release. To roll back:

```bash
ssh user@server
sudo systemctl stop ops-control
ls /opt/ops-control/releases   # pick the previous snapshot
PREV=20260427-101530           # eg. immediately before the bad deploy
cd /opt/ops-control
# Restore in-place — the snapshot mirrors the same subtree shape
cp -R releases/$PREV/server releases/$PREV/client releases/$PREV/scripts ./
cp releases/$PREV/package.json releases/$PREV/package-lock.json ./
sudo systemctl start ops-control
journalctl -u ops-control -n 30   # confirm clean boot
```

`server/data/` is intentionally NOT versioned (data accumulates across releases — never want to time-travel it). If the bad deploy corrupted data, restore from the nightly SQLite backup at `server/data/Backup/` per "All data gone after a restore" above.

Retention: deploy.sh keeps the **5 most recent snapshots**. Disk fill is unlikely with 5 × ~150 MB.

### "Bad deploy — need to roll back" (Windows, P1-2 patch landed 2026-05-27)

`deploy.ps1` now snapshots live `<RemoteDir>` to `releases\<ts>\` before SCP upload (mirror of Linux `deploy.sh` pattern). To roll back:

```powershell
# 1. SSH to Windows prod
ssh user@10.102.3.61

# 2. List snapshots (newest first)
dir C:\opt\ops-control\releases | sort Name -Descending

# 3. Pick most recent snapshot BEFORE the bad deploy
$PREV = "20260527-110000"  # adjust per actual timestamp

# 4. Stop NSSM service
nssm stop ops-control

# 5. Take emergency backup of bad state
$BAD_TS = Get-Date -Format yyyyMMdd-HHmmss
robocopy C:\opt\ops-control C:\opt\ops-control\releases\BAD-$BAD_TS /E /XD releases data node_modules /R:1

# 6. Restore prior snapshot (EXCLUDES releases\, data\, node_modules\)
robocopy C:\opt\ops-control\releases\$PREV C:\opt\ops-control /E /XD releases data node_modules /MIR

# 7. Verify package.json reverted
type C:\opt\ops-control\package.json | findstr version

# 8. Re-run preflight
cd C:\opt\ops-control
node scripts\preflight-env.js
# Must exit 0

# 9. Start NSSM
nssm start ops-control

# 10. Verify /health
sleep 5
curl http://localhost:3000/health
```

Retention: 5 most recent snapshots, automatically pruned by `deploy.ps1`.

### "Bare-metal restore — disk dies / fresh box" (Sprint 1.7)

> **Superseded 2026-10-14 (Sprint S-MIRROR-USB): the mirror now runs inside the app — Settings → Backup/Restore → Mirror — to a USB drive or folder, and the share and the LaunchAgent script described below are no longer used. The restore steps (copy to local disk, gunzip, open) still apply.**
>
> **On the CCL Mac SERVER box this section is not the procedure to follow** (added
> 2026-09-16). That box is the windowed desktop app, not a `/opt/ops-control`
> service, and it has no `OPS_BACKUP_OFFSITE_DEST` — its off-site copy is an
> rsync mirror of the whole userData tree at
> `smb://10.102.1.2/Departments$/NPI/Henry` (mounts as `/Volumes/Henry`), into the
> `ops-control-mirror` subfolder there. **It is refreshed MANUALLY, not on a
> schedule** (corrected 2026-09-17): the LaunchAgent
> `vn.ccldesign.opsbackup.offsite` is disabled because it has never once
> succeeded unattended at this destination — see Lesson 44, where the cause is
> recorded as unresolved. Run it with
> `bash ~/Library/Application\ Support/ops-offsite-backup/offsite-backup.sh`,
> which takes ~50 s incremental and requires the share to be mounted in Finder.
> **So the age of the off-site copy is the age of the last manual run** — read it
> off the Settings → Backup card before trusting it in a recovery. Four
> consequences:
>
> 1. **Copy the backup to local disk before opening it** — and since 2026-09-30 gunzip it:
>    only the newest SQLite backup is a plain `.sqlite`; older ones are `.sqlite.gz`
>    (`gunzip -c ops_<ts>.sqlite.gz > /tmp/ops.sqlite`). `sqlite3` cannot open a
>    database over SMB — `unable to open database file` — because SQLite will not
>    take its file locks on a network share. That is not corruption; the copy is
>    fine once it is local. Verified by drill 2026-09-16: `integrity_check ok`,
>    131 quotes / 3058 materials / 15057 ifs_inventory / 54 quote_versions all
>    matching live.
> 2. **The `ops-control-mirror` subfolder is load-bearing, not tidiness.** The job
>    runs `rsync --delete`, and the script refuses to run unless the destination
>    path ends in that folder — so a typo can never empty the shared `NPI/Henry`
>    directory, and anything else kept there is safe from the mirror.
> 3. **The mirror alone cannot rebuild a server.** The destination is a shared
>    drive, so `.env`, `users.json` and `totp_secrets.enc` are deliberately
>    excluded (Lesson 39). They live separately at `~/ops-control-secrets/` with
>    a guide for making an encrypted copy. Without them the DATA all comes back;
>    accounts are recreated via `apps/scripts/recover-sys-user.js` and 2FA via
>    `npm run reset-totp`.
> 4. **`Backup/Library/*.tar.gz` are local-only** for the same reason, so
>    point-in-time history of `PermissionGroups` / `MachineProfiles` does not
>    survive a disk loss. Current state does — the live `data/Library` tree is
>    mirrored, and `Backup/Data/*.json` carries the business datasets in history
>    form.
>
> Check the mirror is actually current before relying on it: Settings → Backup
> shows off-site health, and it reads **red** if the mirror has never succeeded
> (Lesson 40).

When the server hardware/disk is gone:

```bash
# 1. Provision the new box (same OS family, same Node version per CLAUDE.md).
# 2. Install Node 20.x + npm.
# 3. Pull the off-site backup. By default deploy.sh / backup-offsite.sh
#    syncs nightly to the rsync target in OPS_BACKUP_OFFSITE_DEST.
sudo mkdir -p /opt/ops-control
sudo chown $USER /opt/ops-control
rsync -avz user@offsite:/var/backups/ops-control/latest/ /opt/ops-control/

# 4. Restore the .env (this MUST include OPS_TOTP_KEY from the previous
#    install — see TOTP key rotation runbook above).
cp /opt/ops-control/.env.backup /opt/ops-control/.env
chmod 600 /opt/ops-control/.env

# 5. Install deps + run preflight.
cd /opt/ops-control
npm install --production
NODE_ENV=production npm run preflight   # MUST pass

# 6. Start the service.
sudo systemctl enable --now ops-control
journalctl -u ops-control -f             # watch for "🔐 TOTP boot probe OK"
```

**RPO** (Recovery Point Objective): 24h (nightly backup). For tighter RPO, increase `OPS_BACKUP_SCHEDULE` frequency or add inotify-driven WAL shipping.
**RTO** (Recovery Time Objective): ~2h on a pre-provisioned hot-spare (just rsync + start), ~6h cold (fresh box install).

Document the off-site target machine, its credentials, and the restore drill checklist in `MAINTAINERS.md` — update it whenever the off-site rotates. Quarterly drill: time the full sequence, fix any documentation gap revealed.
