#!/usr/bin/env bash
#
# build-desktop.sh — DEPRECATED (Issue #59).
#
# This generic wrapper never set OPS_BUILD_ROLE, so electron-builder's
# artifactName template (`OpsControl-${env.OPS_BUILD_ROLE}-...`) failed,
# and it produced role-less DMGs with no `desktop/build-role.json` — the
# app then booted as 'generic' instead of CLIENT / SERVER.
#
# The role-aware build path shipped in PR #100 and is now canonical:
#   scripts/build-mac-installers.mjs       # mac arm64,  CLIENT + SERVER
#   scripts/build-windows-installers.mjs   # win  x64,   CLIENT + SERVER
# Both write desktop/build-role.json (then unlink it) so each installer
# boots in the right mode. Call them directly: `node scripts/build-mac-installers.mjs [client|server]`.
#
# This file is kept only as a thin forwarding shim for backward-compat
# with any direct caller (`./scripts/build-desktop.sh mac arm64` / `win`).
# Note: the old /tmp-no-spaces workaround is gone — the .mjs scripts run
# electron-builder in place (fine on CI / no-space paths; they do NOT
# rebuild native deps, so desktop/node_modules must already be set up).

set -euo pipefail
PLATFORM="${1:-mac}"
ARCH="${2:-arm64}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "⚠  build-desktop.sh is DEPRECATED (Issue #59) — forwarding to the" >&2
echo "   role-aware installer scripts (PR #100). Prefer calling them directly." >&2

case "$PLATFORM" in
  mac)
    if [ "$ARCH" = "x64" ]; then
      echo "✗ Intel (x64) macOS is no longer built: the role-aware path" >&2
      echo "  (scripts/build-mac-installers.mjs) is Apple-Silicon (arm64) only," >&2
      echo "  and CCL ships arm64. To revive x64, extend build-mac-installers.mjs." >&2
      exit 2
    fi
    exec node "$ROOT/scripts/build-mac-installers.mjs" # both roles, arm64
    ;;
  win)
    exec node "$ROOT/scripts/build-windows-installers.mjs" # both roles, x64
    ;;
  *)
    echo "✗ Unknown platform: $PLATFORM (expected: mac | win)" >&2
    exit 1
    ;;
esac
