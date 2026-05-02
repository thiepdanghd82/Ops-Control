#!/usr/bin/env bash
#
# install-from-dmg.sh - operator-facing one-shot installer that drops
# the Gatekeeper "from unidentified developer" warning permanently.
#
# Why this exists:
#   CCL Vietnam ships unsigned ad-hoc DMGs (no Apple Developer ID -
#   the Apple program costs USD 99/year per company and blocks shipping).
#   On first launch macOS quarantines the .app and shows a scary modal.
#   Right-click -> Open works once but every fresh install repeats the
#   ritual. Most operators see the modal and bounce.
#
#   This script does what `right-click -> Open` does, just from the
#   terminal: copy the .app from the DMG to /Applications and clear the
#   `com.apple.quarantine` extended attribute that Gatekeeper reads.
#
#   AFTER this script runs the .app launches by double-click like a
#   notarized app - no warning, no right-click dance, no Gatekeeper
#   blockage.
#
# Trust model:
#   Operator verifies the DMG SHA-256 against `dist/checksums.txt` BEFORE
#   running this script. The checksum is published on the trusted CCL HQ
#   channel (Drive, internal portal). The bundle marker inside each DMG
#   (verifiable via scripts/verify-bundle-marker.sh) ties the binary to
#   a specific build-id so a swap during transit is detectable.
#
# Usage:
#   bash install-from-dmg.sh OpsControl-SERVER-v1.3.0-mac-arm64.dmg
#   bash install-from-dmg.sh OpsControl-CLIENT-v1.3.0-mac-arm64.dmg
#
# Exit codes:
#   0 - installed
#   1 - DMG missing or hdiutil failed
#   2 - checksum did not match (operator MUST stop and re-download)
#   3 - install failed (permissions on /Applications?)
#
# IMPORTANT: keep this file ASCII-only. macOS ships bash 3.2 by default,
# which mis-parses bare `${VAR}` followed by a multi-byte UTF-8 char
# (the ellipsis the script previously used was treated as part of the
# variable name). Use plain ASCII for output strings + always brace
# variable references when followed by punctuation.

set -euo pipefail

DMG="${1:?usage: install-from-dmg.sh <dmg-path>}"
CHECKSUMS="${2:-$(dirname "$DMG")/checksums.txt}"

if [[ ! -f "$DMG" ]]; then
  echo "ERROR: DMG not found: $DMG" >&2
  exit 1
fi

# --- 1. Verify checksum (skip with FORCE=1 if checksums.txt missing) --
if [[ -f "$CHECKSUMS" ]]; then
  echo "[1/4] Verifying SHA-256 against ${CHECKSUMS} ..."
  ( cd "$(dirname "$DMG")" && shasum -a 256 -c <(grep "$(basename "$DMG")" "$CHECKSUMS") ) \
    || { echo "[X] Checksum FAILED. DMG may be corrupted or tampered. Re-download." >&2; exit 2; }
  echo "  [OK] Checksum matches"
else
  if [[ "${FORCE:-0}" != "1" ]]; then
    echo "ERROR: ${CHECKSUMS} not found. Re-run with FORCE=1 to skip checksum (NOT recommended)." >&2
    exit 2
  fi
  echo "[1/4] [WARN] Checksum file missing - skipped (FORCE=1)"
fi

# --- 2. Mount the DMG ------------------------------------------------
echo "[2/4] Mounting DMG ..."
MOUNT=$(hdiutil attach -nobrowse -readonly "$DMG" 2>/dev/null | tail -1 | cut -f3)
if [[ -z "$MOUNT" || ! -d "$MOUNT" ]]; then
  echo "ERROR: hdiutil attach failed (mount: '${MOUNT}')" >&2
  exit 1
fi
trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true' EXIT
echo "  [OK] Mounted at ${MOUNT}"

APP=$(find "$MOUNT" -maxdepth 2 -name '*.app' -print -quit)
if [[ -z "$APP" ]]; then
  echo "ERROR: no .app bundle inside DMG" >&2
  exit 1
fi
APP_NAME=$(basename "$APP")
TARGET="/Applications/${APP_NAME}"

# --- 3. Copy to /Applications ----------------------------------------
echo "[3/4] Installing ${APP_NAME} to /Applications ..."
if [[ -d "$TARGET" ]]; then
  echo "  [WARN] ${TARGET} already exists - replacing"
  rm -rf "$TARGET"
fi
cp -R "$APP" "$TARGET" || {
  echo "ERROR: copy failed. Is /Applications writable? Try: sudo bash $0 $DMG" >&2
  exit 3
}
echo "  [OK] Copied"

# --- 4. Strip Gatekeeper quarantine ----------------------------------
echo "[4/4] Removing Gatekeeper quarantine attribute ..."
# -r recurses into the bundle. -c clears all xattrs (more thorough than
# -d com.apple.quarantine alone - also drops com.apple.metadata:* tags
# that occasionally trip Gatekeeper on subsequent macOS releases).
xattr -cr "$TARGET" 2>/dev/null || true
echo "  [OK] Quarantine cleared"

# --- Sanity-check: is the app launchable? ----------------------------
if ! ls "$TARGET/Contents/MacOS/" 2>/dev/null | grep -q .; then
  echo "WARNING: no executable found at ${TARGET}/Contents/MacOS/ - install may be incomplete." >&2
fi

echo
echo "==============================================================="
echo "  [OK] ${APP_NAME} installed."
echo "  Launch it from /Applications or:"
echo "      open '${TARGET}'"
echo "  No Gatekeeper warning will appear (quarantine cleared)."
echo "==============================================================="
