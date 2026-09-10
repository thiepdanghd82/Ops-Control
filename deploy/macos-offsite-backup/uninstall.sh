#!/bin/bash
# uninstall.sh — remove the off-site backup LaunchAgent.
LABEL="vn.ccldesign.opsbackup.offsite"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "✓ Removed $LABEL (the mirror on the external drive is left untouched)"
