#!/usr/bin/env bash
#
# sign-macos.sh — Ad-hoc sign + clear quarantine cho macOS app/dmg
# ─────────────────────────────────────────────────────────────────────
#
# THAY THẾ Apple Developer ID ($99/năm) BẰNG AD-HOC SIGN + IT-distributed
# (không qua browser → không có quarantine attribute → Gatekeeper bypass)
#
# Tại sao hoạt động:
#   - Quarantine attribute (`com.apple.quarantine`) chỉ được set khi
#     file download từ browser (Safari/Chrome). LaunchServices kiểm
#     attr này → mới invoke Gatekeeper.
#   - Nếu IT distribute qua: file share LAN, Jamf/Mosyle MDM, AirDrop,
#     USB, scp, hoặc internal pkg installer → KHÔNG có quarantine →
#     Gatekeeper KHÔNG block, dù app chỉ ad-hoc signed.
#   - Ad-hoc sign vẫn cung cấp code integrity (anti-tamper) — quan
#     trọng cho asar verify + auto-update.
#
# Logic:
#   1. Re-sign .app bundle với ad-hoc identity ("-")
#   2. Apply hardened runtime entitlements (cho JIT + USB + network)
#   3. Verify codesign passes
#   4. Clear quarantine attr trên .dmg + .app (tránh trường hợp DMG
#      bị set quarantine khi rsync qua một số tool)
#
# Usage:
#   ./scripts/sign-macos.sh "desktop/dist-electron/Ops Control-1.1.0-arm64.dmg"
#   ./scripts/sign-macos.sh "/Applications/Ops Control.app"

set -euo pipefail

TARGET="${1:?Usage: $0 <path-to-app-or-dmg>}"
ENTITLEMENTS_DEFAULT="$(cd "$(dirname "$0")/.." && pwd)/desktop/build/entitlements.mac.plist"
ENTITLEMENTS="${OPS_ENTITLEMENTS:-$ENTITLEMENTS_DEFAULT}"

if [[ ! -e "$TARGET" ]]; then
  echo "✗ Not found: $TARGET" >&2
  exit 1
fi

if [[ ! -f "$ENTITLEMENTS" ]]; then
  echo "✗ Entitlements not found: $ENTITLEMENTS" >&2
  echo "   Set OPS_ENTITLEMENTS env or create desktop/build/entitlements.mac.plist" >&2
  exit 1
fi

echo "═══ Ops Control — macOS ad-hoc sign ═══"
echo "Target:       $TARGET"
echo "Entitlements: $ENTITLEMENTS"
echo

# ─── Sign ──────────────────────────────────────────────────────────────
sign_app() {
  local app="$1"
  echo "Signing ${app}..."

  # Order matters: deepest helpers first, then containing app last.
  # codesign --deep handles this in modern macOS, but explicit is safer.
  codesign --force --deep --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign - "$app"

  echo "Verifying..."
  codesign --verify --strict --verbose=2 "$app" 2>&1 | tail -5
  echo "  ✓ Codesign valid (ad-hoc)"
}

if [[ "$TARGET" == *.app ]]; then
  sign_app "$TARGET"
elif [[ "$TARGET" == *.dmg ]]; then
  # Mount DMG, extract .app, re-sign, repack.
  # For simplicity, we sign the DMG itself (allowed for ad-hoc).
  # Note: DMG signing only verifies the disk image, not contents.
  # The .app inside must be signed BEFORE being put into DMG.
  echo "DMG signing — assuming .app inside was already signed during build."
  echo "Use this script on the .app BEFORE creating DMG, or after install."
  codesign --force --sign - "$TARGET"
  echo "  ✓ DMG signed (ad-hoc)"
else
  echo "✗ Unknown target type. Pass .app or .dmg" >&2
  exit 1
fi

# ─── Clear quarantine ─────────────────────────────────────────────────
echo
echo "Clearing com.apple.quarantine attribute..."
xattr -cr "$TARGET" 2>/dev/null || true
xattr -d com.apple.quarantine "$TARGET" 2>/dev/null || true
echo "  ✓ Quarantine cleared"

echo
echo "═══ Done ═══"
echo "User next step:"
echo "  - Nếu IT distribute qua MDM / file share / USB → cài + chạy được ngay."
echo "  - Nếu user download qua browser → nhận quarantine, phải chạy:"
echo "      xattr -cr '/Applications/Ops Control.app'"
echo "    HOẶC right-click → Open lần đầu (Gatekeeper sẽ remember choice)."
