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

MOUNT=$(hdiutil attach -nobrowse -readonly "$DMG" 2>&1 | tail -1 | awk '{print $NF}') || {
  echo "ERROR: hdiutil attach failed for $DMG" >&2
  exit 1
}
trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true' EXIT

# Find the .app bundle and grep for the marker inside its asar archive
APP=$(find "$MOUNT" -maxdepth 2 -type d -name "*.app" | head -1)
if [ -z "$APP" ]; then
  echo "ERROR: no .app found in $MOUNT" >&2
  exit 2
fi

# The bundle marker lives in the client chunk inside app.asar.
# `strings | grep` works because Vite emits it as a literal string.
ASAR="$APP/Contents/Resources/app.asar"
if [ ! -f "$ASAR" ]; then
  echo "ERROR: no app.asar at $ASAR" >&2
  exit 2
fi

MARKER=$(strings "$ASAR" | grep -oE 'opsctl-v1\.3-marker:[A-Za-z0-9._-]+:[A-Za-z0-9.:T-]+Z' | head -1)
if [ -z "$MARKER" ]; then
  echo "ERROR: bundle marker not found in $ASAR" >&2
  echo "  Either this DMG is pre-v1.3 or the marker grep is mis-tuned." >&2
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
