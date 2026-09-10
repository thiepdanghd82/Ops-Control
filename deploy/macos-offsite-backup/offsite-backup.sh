#!/bin/bash
# offsite-backup.sh — mirror Ops Control data + backups to an external drive.
#
# Closes audit finding H-1 (all backups currently live on the same disk as the
# live data). Run by the LaunchAgent vn.ccldesign.opsbackup.offsite every few
# hours; if the external drive isn't mounted it logs + exits 0 (so an unplugged
# drive doesn't spam failures) and catches up on the next run when plugged in.
#
# What it copies (incremental rsync, excludes Electron caches):
#   - the WHOLE userData tree (data/ + .env + config + license) → a full
#     recovery mirror, not just the Backup/ folder.
#
# EDIT THIS if your external volume has a different name:
DEST_VOLUME="/Volumes/OPSBACKUP"

SRC="$HOME/Library/Application Support/ops-control-desktop"
DEST="$DEST_VOLUME/ops-control-mirror"
LOG="$HOME/Library/Logs/ops-offsite-backup.log"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

echo "[$(ts)] offsite-backup start" >> "$LOG"

# 1. Source must exist
if [ ! -d "$SRC" ]; then
  echo "[$(ts)] ERROR: source not found: $SRC" >> "$LOG"
  exit 0
fi

# 2. External drive must be mounted
if [ ! -d "$DEST_VOLUME" ]; then
  echo "[$(ts)] SKIP: external drive not mounted ($DEST_VOLUME) — will retry next run" >> "$LOG"
  exit 0
fi

mkdir -p "$DEST"

# 3. Incremental mirror (delete extraneous, but keep the secrets/caches excluded list tight)
rsync -a --delete \
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

if [ $RC -eq 0 ]; then
  # Stamp a marker so you can see at a glance when the last good mirror ran
  date '+%Y-%m-%d %H:%M:%S %z' > "$DEST/LAST_MIRROR_OK.txt"
  echo "[$(ts)] offsite-backup OK → $DEST" >> "$LOG"
else
  echo "[$(ts)] ERROR: rsync exit $RC" >> "$LOG"
fi
exit 0
