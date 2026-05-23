#!/usr/bin/env bash
#
# release.sh — build + publish 1 release lên server auto-update (10.102.3.61).
#
# Workflow:
#   1. Bump version trong root + desktop/ package.json
#   2. Build client (Vite)
#   3. Build installer Windows (.exe) + macOS (.dmg) qua electron-builder
#   4. rsync 3 file lên http://10.102.3.61/updates/:
#        - Ops-Control-Setup-${VERSION}.exe
#        - Ops-Control-${VERSION}.dmg (arm64)
#        - latest.yml + latest-mac.yml (electron-updater manifest)
#   5. Git tag + push reminder
#
# History: a bytenode-compile step (formerly [3/6]) protected 4 IP files
# at server/services/* with V8 bytecode shims. The target paths went stale
# (those files moved to client/src/services/ years ago) and the step never
# completed successfully — no .jsc artifacts ever shipped. Removed
# 2026-05-23 alongside `scripts/build-bytecode.js` to close Issue #60's
# runtime-dep audit (bytenode was undeclared in any package.json).
#
# Pre-req:
#   - SSH key vào ops@10.102.3.61
#   - Đã ssh-add trước
#   - Đang trên branch main, working tree clean
#   - Code-signing cert đã setup (env CSC_LINK + CSC_KEY_PASSWORD cho Win,
#     APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID cho Mac)
#
# Usage:
#   ./scripts/release.sh 1.1.1                   # full release
#   ./scripts/release.sh 1.1.2 --mac-only        # chỉ build mac
#   ./scripts/release.sh 1.1.3 --skip-publish    # build local, không upload
#
set -euo pipefail

# ─── Args & validation ───────────────────────────────────────────────
VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [--mac-only|--win-only] [--skip-publish]"
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$ ]]; then
  echo "Bad version format: $VERSION (expected x.y.z or x.y.z-suffix)"
  exit 1
fi

MAC_ONLY=false
WIN_ONLY=false
SKIP_PUBLISH=false
for arg in "$@"; do
  case "$arg" in
    --mac-only)      MAC_ONLY=true ;;
    --win-only)      WIN_ONLY=true ;;
    --skip-publish)  SKIP_PUBLISH=true ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLISH_HOST="ops@10.102.3.61"
PUBLISH_DIR="/var/www/updates/"

cd "$PROJECT_ROOT"

# ─── Pre-flight ──────────────────────────────────────────────────────
echo "═══ Ops Control release v$VERSION ═══"
echo

if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
  echo "✗ Working tree not clean. Commit or stash first."
  git status --short
  exit 1
fi

if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$PUBLISH_HOST" exit 2>/dev/null; then
  if [[ "$SKIP_PUBLISH" == "false" ]]; then
    echo "✗ Cannot SSH to $PUBLISH_HOST. ssh-add your key, or pass --skip-publish."
    exit 1
  fi
fi

# ─── 1. Bump version ─────────────────────────────────────────────────
echo "[1/5] Bumping version → $VERSION"
node -e "
const fs = require('fs');
for (const f of ['package.json', 'desktop/package.json', 'client/package.json']) {
  const p = JSON.parse(fs.readFileSync(f, 'utf8'));
  p.version = '$VERSION';
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n');
  console.log('  ✓', f);
}
"

# ─── 2. Build client ─────────────────────────────────────────────────
echo "[2/5] Building client (Vite)…"
(cd client && npm run build) > /tmp/release-build-client.log 2>&1
echo "  ✓ client/dist ($(du -sh client/dist | cut -f1))"

# ─── 3. Build installers ─────────────────────────────────────────────
# Note: Mặc định CHẠY UNSIGNED + post-build sign bằng self-signed
# (Win: PowerShell script, Mac: ad-hoc). Xem docs/INTERNAL_TRUST_SETUP.md
# để hiểu cách push trust qua GPO / IT-distribute.
# Nếu sau này có EV cert thật: set CSC_LINK + CSC_KEY_PASSWORD trước
# khi chạy release.sh, electron-builder sẽ ưu tiên dùng cert đó.
echo "[3/5] Building installers…"
cd desktop

ELECTRON_BUILDER_FLAGS="--publish never"
if [[ "$MAC_ONLY" == "true" ]]; then
  ELECTRON_BUILDER_FLAGS="--mac dmg $ELECTRON_BUILDER_FLAGS"
elif [[ "$WIN_ONLY" == "true" ]]; then
  ELECTRON_BUILDER_FLAGS="--win nsis $ELECTRON_BUILDER_FLAGS"
else
  ELECTRON_BUILDER_FLAGS="-mw $ELECTRON_BUILDER_FLAGS"
fi

# CSC_IDENTITY_AUTO_DISCOVERY=false → skip Apple cert auto-detect.
# Nếu CSC_LINK đã set (paid cert), unset flag này để builder dùng cert.
if [[ -z "${CSC_LINK:-}" ]]; then
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron-builder $ELECTRON_BUILDER_FLAGS

cd "$PROJECT_ROOT"

# ─── 3b. Post-build sign (free alternative khi không có paid cert) ──
if [[ -z "${CSC_LINK:-}" ]]; then
  echo "[3b/5] Post-build sign với free alternative (CSC_LINK not set)…"

  # macOS: ad-hoc sign + clear quarantine
  if [[ "$WIN_ONLY" != "true" ]]; then
    for app in desktop/dist-electron/mac-*/Ops*Control.app; do
      [[ -d "$app" ]] && ./scripts/sign-macos.sh "$app"
    done
    for dmg in desktop/dist-electron/Ops*Control*.dmg; do
      [[ -f "$dmg" ]] && xattr -cr "$dmg" 2>/dev/null || true
    done
  fi

  # Windows: PowerShell self-sign (chỉ chạy nếu có pwsh — Windows hoặc PowerShell Core)
  if [[ "$MAC_ONLY" != "true" ]] && command -v pwsh > /dev/null; then
    for exe in desktop/dist-electron/Ops-Control-Setup-*.exe; do
      [[ -f "$exe" ]] && pwsh -File scripts/sign-windows.ps1 -InstallerPath "$exe"
    done
  elif [[ "$MAC_ONLY" != "true" ]]; then
    echo "  ⚠ Skipping Windows sign — pwsh not installed."
    echo "    Run on Windows build machine: pwsh -File scripts/sign-windows.ps1 -InstallerPath ..."
  fi
fi

ls -lh desktop/dist-electron/ | head -20

# ─── 4. Publish ──────────────────────────────────────────────────────
if [[ "$SKIP_PUBLISH" == "true" ]]; then
  echo "[4/5] Skipping publish (--skip-publish)"
  echo
  echo "Local artifacts at: desktop/dist-electron/"
  exit 0
fi

echo "[4/5] Publishing to $PUBLISH_HOST:$PUBLISH_DIR"
PUBLISH_FILES=()
[[ -f "desktop/dist-electron/Ops-Control-Setup-$VERSION.exe" ]] && PUBLISH_FILES+=("desktop/dist-electron/Ops-Control-Setup-$VERSION.exe")
[[ -f "desktop/dist-electron/Ops-Control-$VERSION.dmg" ]] && PUBLISH_FILES+=("desktop/dist-electron/Ops-Control-$VERSION.dmg")
[[ -f "desktop/dist-electron/Ops-Control-$VERSION-arm64.dmg" ]] && PUBLISH_FILES+=("desktop/dist-electron/Ops-Control-$VERSION-arm64.dmg")
[[ -f "desktop/dist-electron/latest.yml" ]] && PUBLISH_FILES+=("desktop/dist-electron/latest.yml")
[[ -f "desktop/dist-electron/latest-mac.yml" ]] && PUBLISH_FILES+=("desktop/dist-electron/latest-mac.yml")

if [[ ${#PUBLISH_FILES[@]} -eq 0 ]]; then
  echo "✗ No publishable artifacts found in desktop/dist-electron/"
  exit 1
fi

# Backup current latest.yml on server (rollback path)
ssh "$PUBLISH_HOST" "cd $PUBLISH_DIR && [ -f latest.yml ] && cp latest.yml latest.yml.bak.\$(date +%Y%m%d_%H%M%S) || true"

rsync -avP --human-readable "${PUBLISH_FILES[@]}" "$PUBLISH_HOST:$PUBLISH_DIR"
echo "  ✓ Uploaded ${#PUBLISH_FILES[@]} files"

# Verify HTTP endpoint serves the new manifest
sleep 2
HTTP_VERSION=$(curl -sS "http://10.102.3.61/updates/latest.yml" | grep '^version:' | head -1 | awk '{print $2}')
if [[ "$HTTP_VERSION" == "$VERSION" ]]; then
  echo "  ✓ http://10.102.3.61/updates/latest.yml reports v$HTTP_VERSION"
else
  echo "  ⚠ Manifest HTTP returned v$HTTP_VERSION instead of v$VERSION (cache?)"
fi

# ─── 5. Tag + summary ────────────────────────────────────────────────
echo "[5/5] Git tag v$VERSION"
git add package.json desktop/package.json client/package.json
git commit -m "chore: release v$VERSION"
git tag -a "v$VERSION" -m "Ops Control v$VERSION"

echo
echo "═══ Done ═══"
echo "Don't forget: git push && git push --tags"
echo "Pilot machines should auto-update within 6h (or via Help → Kiểm tra cập nhật)."
