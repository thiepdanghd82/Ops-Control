#!/bin/bash
# offsite-backup.sh — mirror Ops Control data + backups OFF this Mac's disk.
#
# Closes audit finding H-1: without this, every backup sits on the same
# physical disk as the live ops.db, so one disk failure loses all of them.
# Run by the LaunchAgent vn.ccldesign.opsbackup.offsite every few hours. If
# the destination is not mounted it logs and exits 0 (an unplugged drive must
# not spam failures) and catches up on the next run.
#
# ── Two things production taught, both of which cost real exposure ──────
#
# 1. A destination nobody has to remember is worth more than a tidy one.
#    On the CCL box this pointed at an external drive that was never plugged
#    in: 478 runs across 84 days, every one a SKIP, zero successes, and the
#    only record was a log file nobody opens. Prefer an always-mounted LAN
#    share over a drive someone must connect.
#
# 2. If the destination is SHARED, exclude the credentials — and then VERIFY
#    that they are gone, because a name-based filter cannot see inside a
#    tarball. Set SHARED_DEST=1 below for any destination other people can
#    read. See README.md for what you must then keep elsewhere.
#
# EDIT THE REPO COPY, NOT THE INSTALLED ONE.
# install.sh copies deploy/macos-offsite-backup/offsite-backup.sh over
# ~/Library/Application Support/ops-offsite-backup/offsite-backup.sh, so an edit made
# in place is silently reverted by the next install. It also drifts the other way:
# on 2026-09-17 the self-mount and sentinel work was written into the installed copy
# only, and by 2026-09-21 the repo held a 156-line script still pointing at
# /Volumes/OPSBACKUP -- the drive that had never once succeeded -- which install.sh
# would have deployed over a working one.

# ── EDIT THESE ─────────────────────────────────────────────────────────
# The share mounts in more than one shape and both are legitimate. Finder
# "Connect to Server" on smb://…/Departments$/NPI/Henry lands at
# /Volumes/Henry; on the share ROOT it lands at /Volumes/Departments$ and the
# same mirror is then two levels down. On 2026-09-21 the second shape read as
# "destination unreachable" and the job refused to run against a share that was
# mounted and writable the whole time. Listing candidates costs nothing; being
# wrong about which one is mounted costs a backup.
DEST_VOLUME_CANDIDATES=(
  '/Volumes/Henry'                       # …/Departments$/NPI/Henry mounted directly
  '/Volumes/Departments$/NPI/Henry'      # share root mounted, mirror two levels down
)
DEST_VOLUME="${DEST_VOLUME_CANDIDATES[0]}"   # replaced below by whichever is live
DEST_SUBPATH="ops-control-mirror"      # folder created under DEST_VOLUME. Keeping this
                                       # subfolder is what lets rsync --delete run safely:
                                       # it prunes inside the mirror and can never touch
                                       # anything else the operator keeps in NPI/Henry.
MOUNT_SENTINEL="ops-control-mirror"    # a dir that exists ONLY when mounted, relative
                                       # to DEST_VOLUME (e.g. 'NPI'). Empty = just
                                       # check DEST_VOLUME itself.
SHARED_DEST=1                          # 1 if anyone else can read the destination

# ── Self-mount ────────────────────────────────────────────────────────────
# An SMB share mounted by the Finder belongs to the GUI LOGIN SESSION that
# mounted it. launchd gives every job its OWN audit session, so the agent sees
# the mountpoint, can stat it, and gets "Operation not permitted" on any read
# or write. Measured 2026-09-17: shell session 3331 could list the share while
# the agent in session 3843 could not, same user, same second. That is why
# every manual run succeeded and every scheduled run failed — and why granting
# Full Disk Access changed nothing: it was never a privacy permission.
#
# So the job mounts its OWN copy, inside its own session, and unmounts after.
SMB_URL='//henry_dang@10.102.1.2/Departments%24/NPI/Henry'   # %24 = the '$' in the share name
OWN_MNT="$HOME/.ops-offsite-mnt"                   # our private mountpoint
# ───────────────────────────────────────────────────────────────────────

SRC="$HOME/Library/Application Support/ops-control-desktop"
DEST="$DEST_VOLUME/$DEST_SUBPATH"
LOG="$HOME/Library/Logs/ops-offsite-backup.log"
STATUS="$SRC/data/Library/SystemConfig/offsite-status.json"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
iso() { date '+%Y-%m-%dT%H:%M:%S%z'; }

# Report to Settings → Backup. The app does not run this job and must not
# parse this log, so drop it a status file instead. Keeping last_ok_at
# separate from last_run_at is the whole point: a job that reports SKIP
# forever looks fine under any "did the last run finish" check.
LAST_OK=""
[ -f "$STATUS" ] && LAST_OK=$(sed -n 's/.*"last_ok_at"[ ]*:[ ]*"\([^"]*\)".*/\1/p' "$STATUS" | head -1)

write_status() { # $1=state  $2=detail
  mkdir -p "$(dirname "$STATUS")" 2>/dev/null || return 0
  [ "$1" = "ok" ] && LAST_OK=$(iso)
  local ok_field="null"
  [ -n "$LAST_OK" ] && ok_field="\"$LAST_OK\""
  cat > "$STATUS" <<JSON
{
  "last_run_at": "$(iso)",
  "last_run_state": "$1",
  "last_ok_at": $ok_field,
  "dest": "$DEST",
  "detail": "$2"
}
JSON
}

echo "[$(ts)] offsite-backup start" >> "$LOG"

if [ ! -d "$SRC" ]; then
  echo "[$(ts)] ERROR: source not found: $SRC" >> "$LOG"
  write_status error "source not found"
  exit 0
fi

# Reachability, not existence: the directory can be present and still refuse
# every read when the mount belongs to another login session (see Self-mount
# above). `ls` is the cheapest honest test.
WE_MOUNTED=0
# Pick the candidate whose SENTINEL is readable, not merely whose volume
# exists. That distinction is the safety: an unmounted share leaves an empty
# directory of the same name behind, so a stale /Volumes/Henry must not win
# over a live mount elsewhere. Reachability, not existence -- a mount owned by
# another login session can be stat-ed and still refuse every read.
for _cand in "${DEST_VOLUME_CANDIDATES[@]}"; do
  if ls "$_cand/$MOUNT_SENTINEL" >/dev/null 2>&1; then
    DEST_VOLUME="$_cand"
    DEST="$DEST_VOLUME/$DEST_SUBPATH"
    echo "[$(ts)] destination resolved: $DEST" >> "$LOG"
    break
  fi
done

if ! ls "$DEST_VOLUME/$MOUNT_SENTINEL" >/dev/null 2>&1; then
  mkdir -p "$OWN_MNT"
  if mount_smbfs -N "$SMB_URL" "$OWN_MNT" >>"$LOG" 2>&1; then
    WE_MOUNTED=1
    DEST_VOLUME="$OWN_MNT"
    DEST="$DEST_VOLUME/$DEST_SUBPATH"
    echo "[$(ts)] mounted own copy at $OWN_MNT" >> "$LOG"
  else
    # -N means never prompt, so this is almost always a missing or wrong
    # credential in ~/Library/Preferences/nsmb.conf.
    # NOT a skip. A skip means "nothing to do" (the drive is unplugged); this
    # means the backup did not happen and nobody would know. Two known causes:
    # no credentials in ~/Library/Preferences/nsmb.conf, or the share is
    # already mounted by the Finder session — smbfs refuses to mount the same
    # share twice, so leaving it mounted there locks the agent out.
    echo "[$(ts)] ERROR: cannot reach $DEST_VOLUME and mount_smbfs failed" >> "$LOG"
    write_status error "destination unreachable and self-mount failed"
    rmdir "$OWN_MNT" 2>/dev/null
    exit 0
  fi
fi

# Unmount our own copy on the way out, however we leave.
cleanup_mount() {
  if [ "$WE_MOUNTED" = "1" ]; then
    umount "$OWN_MNT" 2>/dev/null || diskutil unmount force "$OWN_MNT" >/dev/null 2>&1
    rmdir "$OWN_MNT" 2>/dev/null
  fi
}
trap cleanup_mount EXIT

# An unmounted SMB share can leave an empty directory of the same name behind,
# and rsync --delete into that would look like it worked. When a sentinel is
# configured, require it.
SENTINEL_PATH="$DEST_VOLUME"
[ -n "$MOUNT_SENTINEL" ] && SENTINEL_PATH="$DEST_VOLUME/$MOUNT_SENTINEL"
if [ ! -d "$SENTINEL_PATH" ]; then
  echo "[$(ts)] SKIP: destination not mounted ($SENTINEL_PATH) — will retry next run" >> "$LOG"
  write_status skip "destination not mounted: $DEST_VOLUME"
  exit 0
fi

# --delete is about to run. Refuse unless DEST is the dedicated mirror folder,
# so a typo above can never empty somebody's shared directory.
case "$DEST" in
  */"$DEST_SUBPATH") : ;;
  *)
    echo "[$(ts)] ERROR: refusing --delete, DEST is not .../$DEST_SUBPATH: $DEST" >> "$LOG"
    write_status error "unsafe DEST"
    exit 0
    ;;
esac

mkdir -p "$DEST"

SECRET_EXCLUDES=()
SHARED_HOLDBACKS=()
if [ "$SHARED_DEST" = "1" ]; then
  # '*.env' not '.env': the exact-name form let 'ops-migration.env' through
  # carrying live 64-hex keys. And Backup/Library/*.tar.gz EMBED
  # Library/Users/users.json + sessions.json, which no filename filter can
  # reach, so they are dropped wholesale. Little is lost — the live
  # data/Library tree is still mirrored, and Backup/Data/*.json holds the
  # same datasets in history form without credentials.
  SECRET_EXCLUDES=(
    --exclude '*.env'
    --exclude 'users.json*'
    --exclude 'totp_secrets*'
    --exclude 'sessions.json'
    --exclude '/data/Backup/Library/'
  )
  # Library/Fleet/ goes wholesale, at DIRECTORY level, and that is the point
  # rather than laziness. It holds heartbeats.json today (hashed fingerprints
  # and hostnames, no customer name), but the same directory is where
  # pending-licenses.json appears the first time the fleet distribution flow is
  # used — and that file holds FULL SIGNED LICENCES for every other machine.
  # A per-file exclude would not have caught it, because the filename differs
  # from license.json*, so the hole would have opened silently on the day that
  # feature first ships. Excluding the directory covers whatever fleetStore.js
  # adds to it next.
  #
  # The cost is real and small: after a disk loss the fleet table comes back
  # EMPTY rather than broken — fleetStore reads it as readJson(path, {}) and
  # POST /api/heartbeat refills it as machines check in. What does not come
  # back is first_seen, and the row of any machine that never checks in again.
  #
  # Held back but NOT a secret, which is why it is a separate list. A licence
  # is signed, cannot be edited without breaking its own signature, and is
  # useless on another machine because installation_id is that machine's
  # hardware fingerprint. What it does do on a departmental share is publish
  # this box's fingerprint, the customer name, tier and expiry to everyone who
  # can open the folder. The glob carries the '*' so the dated
  # license.json.before-* copies go with it — the same reason 'users.json*'
  # does. Restoring a licence after a disk loss means re-minting with
  # mint-license.command, which is the documented path anyway.
  SHARED_HOLDBACKS=(
    --exclude 'license.json*'
    --exclude '/data/Library/Fleet/'
    # The bare fingerprint, cached at <userData>/installation-id. Missed by the
    # first sweep because that audit only grepped *.json. Costs nothing to drop:
    # resolveInstallationId() treats a cache miss by recomputing sha256(machineId)
    # and re-caching, so it comes back identical on the same hardware — and on
    # different hardware the licence would need re-minting anyway.
    --exclude '/installation-id'
  )
fi

rsync -a --delete \
  "${SECRET_EXCLUDES[@]}" \
  "${SHARED_HOLDBACKS[@]}" \
  --exclude 'Cache' \
  --exclude 'GPUCache' \
  --exclude 'Code Cache' \
  --exclude 'DawnCache' \
  --exclude 'blob_storage' \
  --exclude 'Local Storage' \
  --exclude 'Session Storage' \
  --exclude 'Service Worker' \
  "$SRC/" "$DEST/" >> "$LOG" 2>&1
RC=$?

# Verify rather than trust the exclude list. It has been wrong twice, and on a
# shared destination a miss is silent and not undoable. Sweep what actually
# landed and delete anything that looks like a credential.
LEAKS=0
HELD=0
if [ "$SHARED_DEST" = "1" ]; then
  while IFS= read -r f; do
    grep -qE '^[A-Z_]+=[0-9a-fA-F]{32,}' "$f" 2>/dev/null || continue
    rm -f "$f"; LEAKS=$((LEAKS + 1))
    echo "[$(ts)] LEAK REMOVED (key value): ${f#$DEST/}" >> "$LOG"
  done < <(find "$DEST" -type f -size -1M 2>/dev/null)

  while IFS= read -r t; do
    tar tzf "$t" 2>/dev/null | grep -qiE 'users\.json|sessions\.json|totp_secrets' || continue
    rm -f "$t"; LEAKS=$((LEAKS + 1))
    echo "[$(ts)] LEAK REMOVED (archive holds credentials): ${t#$DEST/}" >> "$LOG"
  done < <(find "$DEST" -type f -name '*.tar.gz' 2>/dev/null)

  # Held-back files, swept separately from credentials on purpose. Counting
  # them as LEAKS would relabel a signed artefact as a credential AND set
  # RC=99, turning the Settings → Backup card red for something that is not
  # an incident — the alarm crying wolf, which is how people learn to ignore
  # the one that matters.
  #
  # This loop is also what CLEANS UP. `rsync --delete` does not remove a file
  # already on the destination once it is excluded: rsync stops considering
  # it at all. Adding --delete-excluded would have changed that for every
  # exclude at once; sweeping here removes exactly the held-back files and
  # leaves the rest of --delete alone.
  while IFS= read -r h; do
    rm -f "$h"; HELD=$((HELD + 1))
    echo "[$(ts)] REMOVED (not for a shared drive): ${h#$DEST/}" >> "$LOG"
  done < <(find "$DEST" -type f -name 'license.json*' 2>/dev/null)

  # Directory form of the same cleanup. `$DEST` was already refused above
  # unless it ends in "$DEST_SUBPATH", so this rm -rf cannot escape the mirror,
  # and the path is written out literally rather than built from a glob.
  if [ -d "$DEST/data/Library/Fleet" ]; then
    rm -rf "$DEST/data/Library/Fleet"
    HELD=$((HELD + 1))
    echo "[$(ts)] REMOVED (not for a shared drive): data/Library/Fleet/" >> "$LOG"
  fi
  if [ -f "$DEST/installation-id" ]; then
    rm -f "$DEST/installation-id"
    HELD=$((HELD + 1))
    echo "[$(ts)] REMOVED (not for a shared drive): installation-id" >> "$LOG"
  fi
fi

if [ $RC -eq 0 ] && [ $LEAKS -gt 0 ]; then
  echo "[$(ts)] ERROR: mirror completed but $LEAKS credential file(s) had to be removed — FIX THE EXCLUDE LIST" >> "$LOG"
  RC=99
fi

if [ $RC -eq 0 ]; then
  date '+%Y-%m-%d %H:%M:%S %z' > "$DEST/LAST_MIRROR_OK.txt"
  echo "[$(ts)] offsite-backup OK → $DEST" >> "$LOG"
  write_status ok ""
else
  echo "[$(ts)] ERROR: rsync exit $RC" >> "$LOG"
  write_status error "rsync exit $RC${LEAKS:+, $LEAKS credential file(s) removed}"
fi
exit 0
