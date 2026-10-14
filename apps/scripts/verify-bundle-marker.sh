#!/usr/bin/env bash
# verify-bundle-marker.sh — confirm a freshly-built DMG contains the
# expected v1.3 bundle marker, proving "this binary corresponds to
# THIS build" (defense against supply-chain swap during distribution).
#
# Usage:
#   bash scripts/verify-bundle-marker.sh dist/OpsControl-CLIENT-v1.3-mac-arm64.dmg \
#        v1.3.0-build-29-04
#
# Exit codes:
#   0 — marker found and matches expected build-id
#   1 — DMG mount failed
#   2 — marker not found
#   3 — marker found but build-id mismatch
#
# This script does NOT verify code-signing (that's a separate gate;
# DMG must also pass `codesign -v`). Bundle marker just proves the
# in-DMG bundle came from a specific build, not that the DMG itself
# was signed by CCL.
set -euo pipefail

DMG="${1:?usage: verify-bundle-marker.sh <DMG> [expected-build-id]}"
EXPECTED="${2:-}"

if [ ! -f "$DMG" ]; then
  echo "ERROR: DMG not found: $DMG" >&2
  exit 1
fi

# hdiutil's last line shape: "/dev/disk5\tApple_HFS\t/Volumes/Mount Path"
# `awk '{print $NF}'` breaks on paths with spaces. Use cut on the final
# tab field instead.
MOUNT=$(hdiutil attach -nobrowse -readonly "$DMG" 2>/dev/null | tail -1 | cut -f3)
if [ -z "$MOUNT" ] || [ ! -d "$MOUNT" ]; then
  echo "ERROR: hdiutil attach failed or returned bad mount: '$MOUNT'" >&2
  exit 1
fi
trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true' EXIT

# Find the .app bundle and grep for the marker inside its asar archive
APP=$(find "$MOUNT" -maxdepth 2 -type d -name "*.app" | head -1)
if [ -z "$APP" ]; then
  echo "ERROR: no .app found in $MOUNT" >&2
  exit 2
fi

# The bundle marker lives in the client JS chunk. electron-builder
# packs `client/dist/` into `app/client/dist/` via extraResources, so
# the file path inside the DMG is:
#   .app/Contents/Resources/app/client/dist/assets/index-*.js
# NOT inside app.asar (asar is just main.js + preload + shared
# server code; the client SPA lives outside asar so the user-facing
# bundle is updateable without re-packing the asar).
CLIENT_DIST="$APP/Contents/Resources/app/client/dist/assets"
if [ ! -d "$CLIENT_DIST" ]; then
  echo "ERROR: no client dist at $CLIENT_DIST" >&2
  exit 2
fi

MARKER=$(grep -hoE 'opsctl-v1\.3-marker:[A-Za-z0-9._-]+:[A-Za-z0-9.:T-]+Z' "$CLIENT_DIST"/index-*.js 2>/dev/null | head -1)
if [ -z "$MARKER" ]; then
  echo "ERROR: bundle marker not found in $CLIENT_DIST/index-*.js" >&2
  echo "  Either this DMG is pre-v1.3 or the marker injection regressed." >&2
  exit 2
fi

echo "✓ Bundle marker found:"
echo "  $MARKER"

if [ -n "$EXPECTED" ]; then
  if echo "$MARKER" | grep -q ":$EXPECTED:"; then
    echo "✓ Build-id matches expected: $EXPECTED"
  else
    echo "✗ Build-id mismatch (expected '$EXPECTED' in marker)" >&2
    exit 3
  fi
fi

exit 0
