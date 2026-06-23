#!/bin/bash
# install.sh — install the off-site backup LaunchAgent on this Mac.
# Reversible via uninstall.sh. The agent runs offsite-backup.sh every 4 hours;
# it safely skips when the external drive isn't mounted.
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$HOME/Library/LaunchAgents"
LABEL="vn.ccldesign.opsbackup.offsite"
DEST_PLIST="$AGENT_DIR/$LABEL.plist"

# macOS TCC blocks launchd from executing scripts inside ~/Downloads, ~/Documents,
# ~/Desktop ("Operation not permitted"). Copy the script to a non-protected
# location so the agent can run it. Re-run install.sh after editing the repo copy.
INSTALL_DIR="$HOME/Library/Application Support/ops-offsite-backup"
SCRIPT="$INSTALL_DIR/offsite-backup.sh"

mkdir -p "$AGENT_DIR" "$HOME/Library/Logs" "$INSTALL_DIR"
cp "$HERE/offsite-backup.sh" "$SCRIPT"
chmod +x "$SCRIPT"

# Render the plist template with real paths
sed -e "s|__SCRIPT_PATH__|$SCRIPT|g" -e "s|__HOME__|$HOME|g" \
  "$HERE/$LABEL.plist" > "$DEST_PLIST"

# Reload
launchctl unload "$DEST_PLIST" 2>/dev/null || true
launchctl load "$DEST_PLIST"

echo "✓ Installed $LABEL"
echo "  Script : $SCRIPT"
echo "  Plist  : $DEST_PLIST"
echo "  Target : edit DEST_VOLUME in offsite-backup.sh (default /Volumes/OPSBACKUP)"
echo "  Log    : ~/Library/Logs/ops-offsite-backup.log"
echo "  Runs at load + every 4h; skips silently when the drive is unplugged."
