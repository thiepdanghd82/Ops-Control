#!/bin/bash
# ───────────────────────────────────────────────────────────────────────────
# _common.sh — shared config + helpers for the Ops Control headless SERVER
# (macOS LaunchDaemon). Sourced by every ops-server-*.command script.
#
# Design (see scripts/headless/README.md):
#   • Runtime    = the installed app's Electron binary in ELECTRON_RUN_AS_NODE
#                  mode running <app>/Contents/Resources/app/server/index.js.
#                  No separate Node install; native modules already ABI-matched.
#   • Pre-login  = LaunchDaemon (RunAtLoad) runs as root at boot, before any
#                  user logs in. KeepAlive auto-restarts on crash.
#   • DATA_DIR   = /Library/OpsControl/data (system-wide, no spaces). A per-user
#                  ~/Library path can't be read pre-login under FileVault, so a
#                  root daemon MUST own a system dir.
#   • Secrets    = /Library/OpsControl/server.env (chmod 600 root) — sourced by
#                  the wrapper, NEVER placed in the world-readable plist.
#   • License    = <DATA_DIR>/license.json (OPS_LICENSE_FILE). licenseService
#                  verifies the signature only (no HW re-check), so the app's
#                  license copies over unchanged.
# ───────────────────────────────────────────────────────────────────────────

LABEL="com.opscontrol.server"
PLIST="/Library/LaunchDaemons/${LABEL}.plist"

# Installed SERVER app (either DMG installs as "Ops Control.app"; both bundle
# the same server/ code). Override with OPS_APP=/path/to/App.app if relocated.
APP="${OPS_APP:-/Applications/Ops Control.app}"
ELECTRON_BIN="$APP/Contents/MacOS/Ops Control"
SERVER_ENTRY="$APP/Contents/Resources/app/server/index.js"
APP_WORKDIR="$APP/Contents/Resources/app"

SUPPORT_DIR="/Library/OpsControl"
DATA_DIR="$SUPPORT_DIR/data"
ENV_FILE="$SUPPORT_DIR/server.env"
RUN_SCRIPT="$SUPPORT_DIR/run-server.sh"
LICENSE_FILE="$DATA_DIR/license.json"
LOG_DIR="/var/log/opscontrol"
OUT_LOG="$LOG_DIR/server.out.log"
ERR_LOG="$LOG_DIR/server.err.log"
PORT="${OPS_PORT:-3000}"

# Re-exec self under sudo if not already root (transparent — prints why).
need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "  → Cần quyền admin (sudo) cho thao tác hệ thống. Sẽ hỏi mật khẩu Mac của bạn."
    exec sudo -p "  [sudo] mật khẩu cho %u: " /bin/bash "$0" "$@"
  fi
}

# Echo a command before running it (sudo transparency: from now on minh bạch).
run() {
  echo "    \$ $*"
  "$@"
}

# True if the daemon is loaded in launchd's system domain.
is_loaded() {
  launchctl print "system/${LABEL}" >/dev/null 2>&1
}

# Probe the local server health endpoint.
health() {
  curl -fsS --max-time 4 "http://127.0.0.1:${PORT}/health" 2>/dev/null
}

pause_close() {
  echo ""
  read -r -p "Nhấn Enter để đóng..." _ 2>/dev/null || true
}
