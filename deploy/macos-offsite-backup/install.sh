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

# A plist renamed to "<LABEL>.plist.disabled-<date>" is a deliberate hold, not
# leftover junk. This agent has been held since 2026-09-17 because it has never
# once succeeded unattended (CLAUDE.md Lesson 44): a launchd job cannot read a
# share the Finder mounted, and its own mount_smbfs is refused because the
# Finder already holds that share — so every scheduled run takes the
# `write_status error` branch, not `skip`.
#
# Loading it again would redden the Settings → Backup card every four hours
# while manual runs keep writing `ok`. A health signal that flickers is worse
# than one that is steadily wrong: nobody can tell which state to believe, and
# the card exists precisely to be believed.
#
# This script is the trap, which is why the check lives here. It writes
# "<LABEL>.plist" — a DIFFERENT filename from the marker — so without this it
# neither sees nor overwrites the hold; it just creates a fresh enabled agent
# beside it. Line 14 above even instructs you to re-run install.sh after editing
# the script, which is the harmful step.
DISABLED=$(find "$AGENT_DIR" -maxdepth 1 -name "$LABEL.plist.disabled-*" 2>/dev/null | head -1)
if [ -n "$DISABLED" ] && [ "${OPS_FORCE_ENABLE_AGENT:-0}" != "1" ]; then
  # Refresh the held plist in place so it is not stale whenever it is re-enabled.
  sed -e "s|__SCRIPT_PATH__|$SCRIPT|g" -e "s|__HOME__|$HOME|g" \
    "$HERE/$LABEL.plist" > "$DISABLED"
  echo "✓ Script updated: $SCRIPT"
  echo "⚠ Agent left DISABLED — found $(basename "$DISABLED")"
  echo "  It has never succeeded unattended; see CLAUDE.md Lesson 44."
  echo "  Run the mirror by hand : bash \"$SCRIPT\""
  echo "  Enable anyway          : OPS_FORCE_ENABLE_AGENT=1 bash \"$0\""
  echo "  (enabling also means deleting the .disabled-* marker by hand)"
  exit 0
fi

# Render the plist template with real paths
sed -e "s|__SCRIPT_PATH__|$SCRIPT|g" -e "s|__HOME__|$HOME|g" \
  "$HERE/$LABEL.plist" > "$DEST_PLIST"

# Reload
launchctl unload "$DEST_PLIST" 2>/dev/null || true
launchctl load "$DEST_PLIST"

echo "✓ Installed $LABEL"
echo "  Script : $SCRIPT"
echo "  Plist  : $DEST_PLIST"
echo "  Target : edit DEST_VOLUME_CANDIDATES in offsite-backup.sh (SMB share mount paths)"
echo "  Log    : ~/Library/Logs/ops-offsite-backup.log"
echo "  Runs at load + every 4h; skips silently when the drive is unplugged."
