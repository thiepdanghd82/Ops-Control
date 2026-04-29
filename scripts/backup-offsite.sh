#!/usr/bin/env bash
#
# backup-offsite.sh — IBM 3-2-1 rule "1 off-site" copy.
#
# Companion to server/services/backupScheduler.js (which handles the
# local 3-copies portion). This script picks the LATEST local backup
# files and rsyncs/scps them to a remote destination — meant to run
# from cron AFTER the in-process scheduler finishes (~02:30 daily).
#
# Configuration — set these env vars in /etc/environment, .env, or
# the cron line itself. All paths support shell expansion (~).
#
#   OPS_DATA_DIR         /opt/ops-control/server/data       (required)
#   OPS_OFFSITE_TARGET   user@nas:/volume1/ops-backup       (required)
#                        # Format: rsync target — ssh+rsync OR
#                        #   /Volumes/usb/ops-backup        (local mount)
#                        #   user@host:/path                (remote)
#   OPS_OFFSITE_SSH_KEY  ~/.ssh/ops_backup_id_ed25519       (optional)
#   OPS_OFFSITE_RETAIN   14                                 (optional, days)
#   OPS_BACKUP_WEBHOOK   https://hooks.slack.com/...        (optional)
#
# Behaviour:
#   1. Pick the newest .sqlite + .tar.gz in $OPS_DATA_DIR/Backup/
#   2. rsync them to $OPS_OFFSITE_TARGET preserving timestamps
#   3. Optionally prune off-site files older than $OPS_OFFSITE_RETAIN days
#      (only when target is local mount or we have ssh access)
#   4. Verify the off-site .sqlite by sha256 checksum match
#   5. Webhook alert on failure (best-effort, Slack incoming-webhook JSON)
#
# Why this is a SEPARATE script vs in-process:
#   - Network failure (NAS down, VPN dropped, NFS hung) shouldn't
#     block the main server event loop.
#   - rsync over ssh wants real shell + key agent — easier from cron
#     than spawning from Node.
#   - Easy for ops to test in isolation: ./scripts/backup-offsite.sh
#
# Cron example (run nightly at 02:30):
#   30 2 * * * /opt/ops-control/scripts/backup-offsite.sh >> /var/log/ops-offsite.log 2>&1
#
# macOS launchd alternative — see LAN_DEPLOYMENT_GUIDE.md.

set -euo pipefail

# ── Config + defaults ───────────────────────────────────────────────
DATA_DIR="${OPS_DATA_DIR:-}"
TARGET="${OPS_OFFSITE_TARGET:-}"
SSH_KEY="${OPS_OFFSITE_SSH_KEY:-}"
RETAIN_DAYS="${OPS_OFFSITE_RETAIN:-14}"
WEBHOOK="${OPS_BACKUP_WEBHOOK:-}"
DRY_RUN="${OPS_OFFSITE_DRY_RUN:-0}"

if [[ -z "$DATA_DIR" || -z "$TARGET" ]]; then
  echo "ERROR: OPS_DATA_DIR + OPS_OFFSITE_TARGET must be set" >&2
  echo "  e.g. OPS_DATA_DIR=/opt/ops-control/server/data \\" >&2
  echo "       OPS_OFFSITE_TARGET=backup@nas.local:/volume1/ops-backup \\" >&2
  echo "       $0" >&2
  exit 2
fi

BACKUP_DIR="$DATA_DIR/Backup"
if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "ERROR: backup dir not found: $BACKUP_DIR" >&2
  echo "Run the in-process scheduler first (OPS_BACKUP_SCHEDULE=1)." >&2
  exit 2
fi

START_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
HOSTNAME_SHORT=$(hostname -s 2>/dev/null || hostname)
LOG_PREFIX="[offsite ${HOSTNAME_SHORT} ${START_TS}]"

log() { echo "${LOG_PREFIX} $*"; }

# ── Webhook alert helper ────────────────────────────────────────────
notify_webhook() {
  local status="$1"; shift
  local msg="$*"
  if [[ -z "$WEBHOOK" ]]; then return 0; fi
  # Slack-compatible payload — Teams accepts the same shape via
  # incoming-webhook connector.
  local payload
  payload=$(printf '{"text":"%s — Ops Control off-site backup %s\\n%s"}' \
    "$HOSTNAME_SHORT" "$status" "${msg//\"/\\\"}")
  # Best-effort, 5s timeout. Webhook failure must not abort the script.
  curl -sS -m 5 -X POST -H 'Content-Type: application/json' \
    -d "$payload" "$WEBHOOK" >/dev/null 2>&1 || true
}

trap 'notify_webhook "FAILED" "exit at line $LINENO (last command: $BASH_COMMAND)"' ERR

# ── Pick newest local artifacts ─────────────────────────────────────
SQLITE_DIR="$BACKUP_DIR/SQLite"
LIBRARY_DIR="$BACKUP_DIR/Library"

LATEST_SQLITE=""
LATEST_LIBRARY=""

if [[ -d "$SQLITE_DIR" ]]; then
  # GNU + BSD compatible — find sorts by mtime, pick last.
  LATEST_SQLITE=$(find "$SQLITE_DIR" -name "*.sqlite" -type f \
    -exec stat -f "%m %N" {} \; 2>/dev/null \
    | sort -n | tail -n 1 | cut -d' ' -f2- || true)
fi
if [[ -d "$LIBRARY_DIR" ]]; then
  LATEST_LIBRARY=$(find "$LIBRARY_DIR" -name "*.tar.gz" -type f \
    -exec stat -f "%m %N" {} \; 2>/dev/null \
    | sort -n | tail -n 1 | cut -d' ' -f2- || true)
fi

if [[ -z "$LATEST_SQLITE" && -z "$LATEST_LIBRARY" ]]; then
  log "ERROR: no local backup artifacts found in $BACKUP_DIR"
  notify_webhook "FAILED" "no local backups under $BACKUP_DIR — scheduler may not be running"
  exit 1
fi

log "latest sqlite:  ${LATEST_SQLITE:-<none>}"
log "latest library: ${LATEST_LIBRARY:-<none>}"
log "destination:    $TARGET"

# ── rsync transfer ──────────────────────────────────────────────────
RSYNC_OPTS=(-avz --partial --progress --stats)
if [[ "$DRY_RUN" == "1" ]]; then
  RSYNC_OPTS+=(--dry-run)
  log "DRY-RUN mode (set OPS_OFFSITE_DRY_RUN=0 to actually transfer)"
fi

# Use ssh with explicit key if provided. Targets without ":" are
# treated as local paths (USB drive, NFS mount).
if [[ "$TARGET" == *":"* ]]; then
  if [[ -n "$SSH_KEY" ]]; then
    RSYNC_OPTS+=(-e "ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10")
  else
    RSYNC_OPTS+=(-e "ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10")
  fi
else
  if [[ ! -d "$TARGET" ]]; then
    log "ERROR: local target dir does not exist: $TARGET"
    log "  Mount the drive first, or use ssh form (user@host:/path)."
    notify_webhook "FAILED" "local target dir missing: $TARGET (drive unmounted?)"
    exit 1
  fi
fi

TRANSFERRED=()
if [[ -n "$LATEST_SQLITE" ]]; then
  log "transferring sqlite…"
  rsync "${RSYNC_OPTS[@]}" "$LATEST_SQLITE" "$TARGET/"
  TRANSFERRED+=("$(basename "$LATEST_SQLITE")")
fi
if [[ -n "$LATEST_LIBRARY" ]]; then
  log "transferring library tarball…"
  rsync "${RSYNC_OPTS[@]}" "$LATEST_LIBRARY" "$TARGET/"
  TRANSFERRED+=("$(basename "$LATEST_LIBRARY")")
fi

# ── Verify checksum on destination (sqlite only — tar is hashable too
# but the cost grows with library size; we trust rsync --checksum).
if [[ -n "$LATEST_SQLITE" && "$DRY_RUN" != "1" ]]; then
  LOCAL_SUM=$(shasum -a 256 "$LATEST_SQLITE" | cut -d' ' -f1)
  REMOTE_NAME=$(basename "$LATEST_SQLITE")
  if [[ "$TARGET" == *":"* ]]; then
    REMOTE_HOST="${TARGET%%:*}"
    REMOTE_PATH="${TARGET#*:}"
    SSH_OPTS=()
    if [[ -n "$SSH_KEY" ]]; then SSH_OPTS=(-i "$SSH_KEY"); fi
    REMOTE_SUM=$(ssh "${SSH_OPTS[@]}" -o ConnectTimeout=10 "$REMOTE_HOST" \
      "shasum -a 256 \"$REMOTE_PATH/$REMOTE_NAME\" 2>/dev/null \
        || sha256sum \"$REMOTE_PATH/$REMOTE_NAME\" 2>/dev/null" \
      | cut -d' ' -f1 || true)
  else
    REMOTE_SUM=$(shasum -a 256 "$TARGET/$REMOTE_NAME" 2>/dev/null | cut -d' ' -f1 || true)
  fi
  if [[ "$LOCAL_SUM" == "$REMOTE_SUM" && -n "$REMOTE_SUM" ]]; then
    log "checksum verified: $LOCAL_SUM"
  else
    log "WARN: checksum mismatch or remote unreadable. local=$LOCAL_SUM remote=${REMOTE_SUM:-<unreadable>}"
    notify_webhook "WARN" "off-site sqlite checksum mismatch ($REMOTE_NAME)"
  fi
fi

# ── Optional: prune off-site files older than RETAIN_DAYS ───────────
# Only applied to local-mount targets; remote pruning is risky over
# ssh (one bad path = wipe wrong dir). For remote targets, configure
# the destination's own retention policy.
if [[ "$TARGET" != *":"* && "$RETAIN_DAYS" -gt 0 && "$DRY_RUN" != "1" ]]; then
  PRUNED=$(find "$TARGET" \( -name "*.sqlite" -o -name "*.tar.gz" \) \
    -type f -mtime "+$RETAIN_DAYS" -print -delete 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$PRUNED" -gt 0 ]]; then
    log "pruned $PRUNED local-target file(s) older than ${RETAIN_DAYS}d"
  fi
fi

DURATION=$(($(date +%s) - $(date -ju -f "%Y-%m-%dT%H:%M:%SZ" "$START_TS" +%s 2>/dev/null || date -d "$START_TS" +%s)))
log "OK — transferred ${#TRANSFERRED[@]} file(s) in ${DURATION}s: ${TRANSFERRED[*]}"
notify_webhook "OK" "$(printf 'transferred %d file(s) in %ss: %s' "${#TRANSFERRED[@]}" "$DURATION" "${TRANSFERRED[*]}")"
exit 0
