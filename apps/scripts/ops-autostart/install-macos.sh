#!/usr/bin/env bash
#
# install-macos.sh — install Ops Control SERVER as macOS LaunchAgent
#
# Wires the Electron app to:
#   - Auto-start at user login (after power loss → reboot → login)
#   - Auto-restart on crash (KeepAlive SuccessfulExit=false)
#
# Usage:
#   sh scripts/ops-autostart/install-macos.sh
#
# Idempotent: re-running re-installs the LaunchAgent with current plist.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_TEMPLATE="$SCRIPT_DIR/com.ccldesign.opscontrol-server.plist"
LABEL="com.ccldesign.opscontrol-server"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PATH="$TARGET_DIR/$LABEL.plist"
APP_BUNDLE="/Applications/Ops Control.app"
APP_PATH="$APP_BUNDLE/Contents/MacOS/Ops Control"

# Pre-flight
if [ ! -f "$PLIST_TEMPLATE" ]; then
  echo "✗ Template not found: $PLIST_TEMPLATE" >&2
  exit 1
fi
if [ ! -x "$APP_PATH" ]; then
  echo "✗ Ops Control.app not installed at /Applications/Ops Control.app." >&2
  echo "  Install the SERVER DMG first: drag 'Ops Control.app' from the mounted" >&2
  echo "  DMG window into the Applications folder, then re-run this script." >&2
  exit 1
fi

# Reminder: this script assumes the installed app is SERVER role. The role
# marker (desktop/build-role.json) lives inside app.asar so we can't easily
# inspect it on disk. If you intended CLIENT, abort now and reinstall the
# correct DMG; auto-start is designed for SERVER role only.

mkdir -p "$TARGET_DIR"
mkdir -p "$HOME/Library/Logs"

# Render template: replace __HOME__ with actual $HOME
sed "s|__HOME__|$HOME|g" "$PLIST_TEMPLATE" > "$TARGET_PATH"
chmod 644 "$TARGET_PATH"

# Unload previous registration if any (idempotency)
launchctl unload "$TARGET_PATH" 2>/dev/null || true

# Load + start
launchctl load -w "$TARGET_PATH"

echo "✓ LaunchAgent installed: $TARGET_PATH"
echo ""
echo "Verify:"
echo "  launchctl list | grep $LABEL"
echo ""
echo "Logs:"
echo "  ~/Library/Logs/ops-control-server.out.log"
echo "  ~/Library/Logs/ops-control-server.err.log"
echo ""
echo "Test auto-restart (will close + relaunch the app):"
echo "  killall \"Ops Control\""
echo "  sleep 35  # ThrottleInterval is 30s"
echo "  pgrep -fl \"Ops Control SERVER\"  # should show new PID"
echo ""
echo "⚠️  Reminder: enable auto-login (System Settings → Users & Groups →"
echo "   Automatic Login) so the agent kicks in after power-loss reboot"
echo "   without operator intervention."
