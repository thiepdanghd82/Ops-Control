#!/usr/bin/env bash
#
# build-desktop.sh — wrap electron-builder để workaround bug node-gyp
# với path có spaces (đặc thù path "Ops Control v1.1" có dấu cách).
#
# Workflow:
#   1. Sync project sang /tmp/ops-build/ (no spaces)
#   2. Sync server node_modules + rebuild better-sqlite3 cho Electron ABI
#   3. Chạy electron-builder trong /tmp
#   4. Copy DMG/EXE artifacts về desktop/dist-electron/
#
# Usage:
#   ./scripts/build-desktop.sh mac arm64        # macOS arm64 DMG
#   ./scripts/build-desktop.sh mac x64          # macOS Intel DMG
#   ./scripts/build-desktop.sh win              # Windows NSIS .exe (cần Wine trên macOS, hoặc chạy trên máy Win)
#   ./scripts/build-desktop.sh                  # arm64 mặc định
#
# Trong production: chạy script này trên CI machine có path không có
# spaces (Linux/Windows runner) → workaround không cần thiết.

set -euo pipefail

PLATFORM="${1:-mac}"
ARCH="${2:-arm64}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="/tmp/ops-build"

echo "═══ Ops Control Desktop Build ═══"
echo "Project: $PROJECT_ROOT"
echo "Tmp:     $TMP_DIR"
echo "Target:  $PLATFORM-$ARCH"
echo

# ─── 1. Sync project to no-space path ─────────────────────────────────
echo "[1/5] Syncing project to $TMP_DIR (rsync, follow symlinks)…"
mkdir -p "$TMP_DIR"
rsync -aL --delete \
  --exclude='node_modules' \
  --exclude='dist-electron' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='Backup & restore' \
  "$PROJECT_ROOT/desktop" "$TMP_DIR/"
rsync -aL --delete \
  --exclude='node_modules' \
  --exclude='*.test.js' \
  --exclude='legacy' \
  "$PROJECT_ROOT/server" "$TMP_DIR/"
rsync -aL --delete "$PROJECT_ROOT/client/dist/" "$TMP_DIR/client-dist/"
rsync -aL --delete --exclude='*.test.js' "$PROJECT_ROOT/scripts" "$TMP_DIR/"

# Bundled package.json (with type:module + server runtime deps)
cp "$PROJECT_ROOT/package.json" "$TMP_DIR/package.json"
cp "$PROJECT_ROOT/package-lock.json" "$TMP_DIR/package-lock.json" 2>/dev/null || true

# ─── 2. Patch /tmp desktop/package.json paths ─────────────────────────
echo "[2/5] Patching extraResources paths to /tmp/ops-build/…"
node -e "
const fs = require('fs');
const path = '$TMP_DIR/desktop/package.json';
const p = JSON.parse(fs.readFileSync(path, 'utf8'));
p.build.extraResources = [
  { from: '$TMP_DIR/server', to: 'app/server', filter: ['**/*', '!**/*.test.js', '!**/legacy/**'] },
  { from: '$TMP_DIR/client-dist', to: 'app/client/dist' },
  { from: '$TMP_DIR/scripts', to: 'app/scripts', filter: ['**/*.js', '!**/*.test.js'] },
  { from: '$TMP_DIR/package.json', to: 'app/package.json' },
  { from: '$TMP_DIR/node_modules', to: 'app/node_modules', filter: ['**/*', '!**/{*.test.js,*.md,*.markdown,*.html,test/**,tests/**,examples/**,docs/**,.bin/**,.cache/**}'] }
];
fs.writeFileSync(path, JSON.stringify(p, null, 2));
console.log('  ✓ Patched');
"

# ─── 3. Install desktop deps (Electron + native) ──────────────────────
echo "[3/5] Installing desktop deps…"
cd "$TMP_DIR/desktop"
if [[ ! -d node_modules ]]; then
  npm install --cache /tmp/npm-cache-ops --no-audit --no-fund --ignore-scripts 2>&1 | tail -3
  node node_modules/electron/install.js 2>&1 | tail -3
fi

# ─── 4. Install server deps + rebuild native for Electron ABI ─────────
echo "[4/5] Installing server runtime deps + rebuilding better-sqlite3…"
cd "$TMP_DIR"
npm install --cache /tmp/npm-cache-ops --no-audit --no-fund --ignore-scripts --omit=dev 2>&1 | tail -3
cd "$TMP_DIR/desktop"
./node_modules/.bin/electron-rebuild \
  --module-dir "$TMP_DIR" \
  --only better-sqlite3 \
  --arch "$ARCH" 2>&1 | tail -3

# ─── 5. Run electron-builder ───────────────────────────────────────────
echo "[5/5] Running electron-builder…"
cd "$TMP_DIR/desktop"
rm -rf dist-electron

case "$PLATFORM" in
  mac)
    CSC_IDENTITY_AUTO_DISCOVERY=false env -u ELECTRON_RUN_AS_NODE \
      ./node_modules/.bin/electron-builder --mac dmg --$ARCH --publish never
    ;;
  win)
    CSC_IDENTITY_AUTO_DISCOVERY=false env -u ELECTRON_RUN_AS_NODE \
      ./node_modules/.bin/electron-builder --win nsis --x64 --publish never
    ;;
  *)
    echo "✗ Unknown platform: $PLATFORM"
    exit 1
    ;;
esac

# ─── Copy artifacts back ──────────────────────────────────────────────
echo
echo "Copying artifacts to $PROJECT_ROOT/desktop/dist-electron/…"
mkdir -p "$PROJECT_ROOT/desktop/dist-electron"
cp "$TMP_DIR/desktop/dist-electron/"*.dmg \
   "$TMP_DIR/desktop/dist-electron/"*.exe \
   "$TMP_DIR/desktop/dist-electron/latest"*.yml \
   "$PROJECT_ROOT/desktop/dist-electron/" 2>/dev/null || true

ls -lh "$PROJECT_ROOT/desktop/dist-electron/"
echo
echo "═══ Done ═══"
echo "Installer ở: $PROJECT_ROOT/desktop/dist-electron/"
