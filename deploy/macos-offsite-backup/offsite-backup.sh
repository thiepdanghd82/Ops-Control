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

# ── EDIT THESE ─────────────────────────────────────────────────────────
DEST_VOLUME="/Volumes/OPSBACKUP"       # e.g. '/Volumes/Departments$' for an SMB share
DEST_SUBPATH="ops-control-mirror"      # folder created under DEST_VOLUME
MOUNT_SENTINEL=""                      # a dir that exists ONLY when mounted, relative
                                       # to DEST_VOLUME (e.g. 'NPI'). Empty = just
                                       # check DEST_VOLUME itself.
SHARED_DEST=0                          # 1 if anyone else can read the destination
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
fi

rsync -a --delete \
  "${SECRET_EXCLUDES[@]}" \
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
