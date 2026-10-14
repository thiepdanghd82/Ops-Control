#!/usr/bin/env bash
#
# uninstall-macos.sh — remove Ops Control SERVER LaunchAgent
#
# Stops auto-start + auto-restart. Does NOT touch the app, data, or
# logs. Run this when retiring the SERVER role from this Mac, or when
# switching to a different management strategy.
#
# Usage:
#   sh scripts/ops-autostart/uninstall-macos.sh

set -euo pipefail

LABEL="com.ccldesign.opscontrol-server"
TARGET_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -f "$TARGET_PATH" ]; then
  echo "✓ Nothing to do — LaunchAgent not installed at $TARGET_PATH"
  exit 0
fi

# Unload (stops the running agent + prevents auto-start next login)
launchctl unload -w "$TARGET_PATH" 2>/dev/null || true

# Remove plist
rm -f "$TARGET_PATH"

echo "✓ LaunchAgent removed: $TARGET_PATH"
echo ""
echo "Note: the Ops Control SERVER app itself is untouched. Quit it"
echo "manually if you want it to stop now:"
echo "  killall \"Ops Control\""
