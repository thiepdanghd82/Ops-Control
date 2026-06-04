#!/usr/bin/env bash
#
# build-client.sh — one-shot CLIENT-role DMG/EXE builder.
#
# Wraps the same /tmp pipeline as build-desktop.sh (workaround for the
# node-gyp "path with spaces" bug — this repo lives under
# ".../3. PROJECT/Ops-Control", and "3. PROJECT" has a space) but adds
# the CLIENT build-role flags that desktop/package.json's
# `build:client:mac` script sets:
#     OPS_BUILD_ROLE=Client
#     --config.extraMetadata.opsMode=client
#     --config.productName='OpsControl CLIENT'
# The artifactName template (desktop/package.json) is
#   OpsControl-${env.OPS_BUILD_ROLE}-v${version}-${os}-${arch}.${ext}
# so OPS_BUILD_ROLE=Client yields  OpsControl-Client-v<ver>-mac-arm64.dmg.
#
# It also: (1) fails fast with a clear hint if Node is not installed,
# (2) builds client/dist (the Vite bundle that carries the audit fixes),
# (3) rebuilds better-sqlite3 for the Electron ABI, (4) self-checks the
# native-module ABI overlay in the built .app (Lesson 28 diagnostic).
#
# Usage:
#   ./scripts/build-client.sh                 # mac arm64 (default)
#   ./scripts/build-client.sh mac x64         # mac Intel
#   ./scripts/build-client.sh win             # Windows NSIS .exe
#   ROLE=Server ./scripts/build-client.sh     # build the Server role instead
#
# Prereq: Node 24 (matches Electron's bundled Node ABI — Lesson 28 /
# MES-3-FIX-4). electron-rebuild fixes the better-sqlite3 binary
# regardless, but Node 24 avoids churn when alternating with `npm test`.

set -euo pipefail

PLATFORM="${1:-mac}"
ARCH="${2:-arm64}"
ROLE="${ROLE:-Client}"                 # Client | Server
ROLE_LOWER="$(echo "$ROLE" | tr '[:upper:]' '[:lower:]')"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="/tmp/ops-build-${ROLE_LOWER}"

echo "═══ Ops Control ${ROLE} Build ═══"
echo "Project: $PROJECT_ROOT"
echo "Tmp:     $TMP_DIR"
echo "Target:  ${PLATFORM}-${ARCH}  role=${ROLE}"
echo

# ─── 0. Preflight: Node must exist ────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  cat >&2 <<'EOF'
✗ Node.js is not installed (or not on PATH).
  electron-builder + Vite need it. Install Node 24, e.g.:
      brew install node@24 && brew link --overwrite node@24
   or nvm install 24 && nvm use 24
  Then re-run this script.
EOF
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
echo "[0/6] Node $(node -v) detected."
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "  ⚠  Node < 20 — Electron 41 expects Node 24. Build may fail at native rebuild." >&2
elif [[ "$NODE_MAJOR" -ne 24 ]]; then
  echo "  ⚠  Node $NODE_MAJOR (not 24) — fine for this build, but you'll see better-sqlite3"
  echo "     rebuild churn when alternating with 'npm test'. See Lesson 28 / MES-3-FIX-4."
fi

# ─── 1. Build the client bundle (carries the source fixes) ────────────
echo "[1/6] Building client/dist (Vite)…"
if [[ ! -d "$PROJECT_ROOT/client/node_modules" ]]; then
  echo "  · installing client deps…"
  ( cd "$PROJECT_ROOT/client" && npm install --no-audit --no-fund )
fi
( cd "$PROJECT_ROOT/client" && npm run build )
if [[ ! -f "$PROJECT_ROOT/client/dist/index.html" ]]; then
  echo "✗ client/dist/index.html missing after build — aborting." >&2
  exit 1
fi

# ─── 2. Sync project to no-space /tmp path ────────────────────────────
echo "[2/6] Syncing to $TMP_DIR (rsync, follow symlinks)…"
mkdir -p "$TMP_DIR"
rsync -aL --delete \
  --exclude='node_modules' --exclude='dist-electron' --exclude='.git' \
  --exclude='*.log' --exclude='Backup & restore' \
  "$PROJECT_ROOT/desktop" "$TMP_DIR/"
rsync -aL --delete \
  --exclude='node_modules' --exclude='*.test.js' --exclude='legacy' \
  "$PROJECT_ROOT/server" "$TMP_DIR/"
rsync -aL --delete \
  --exclude='node_modules' --exclude='**/tests/**' --exclude='*.test.js' \
  "$PROJECT_ROOT/domains" "$TMP_DIR/"
rsync -aL --delete "$PROJECT_ROOT/client/dist/" "$TMP_DIR/client-dist/"
rsync -aL --delete --exclude='*.test.js' "$PROJECT_ROOT/scripts" "$TMP_DIR/"
cp "$PROJECT_ROOT/package.json" "$TMP_DIR/package.json"
cp "$PROJECT_ROOT/package-lock.json" "$TMP_DIR/package-lock.json" 2>/dev/null || true

# ─── 3. Patch /tmp desktop/package.json extraResources paths ──────────
echo "[3/6] Patching extraResources paths to $TMP_DIR/…"
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('$TMP_DIR/desktop/package.json','utf8'));
p.build.extraResources = [
  { from: '$TMP_DIR/server', to: 'app/server', filter: ['**/*','!**/*.test.js','!**/legacy/**'] },
  { from: '$TMP_DIR/domains', to: 'app/domains', filter: ['**/*','!**/*.test.js','!**/tests/**'] },
  { from: '$TMP_DIR/client-dist', to: 'app/client/dist' },
  { from: '$TMP_DIR/scripts', to: 'app/scripts', filter: ['**/*.js','!**/*.test.js'] },
  { from: '$TMP_DIR/package.json', to: 'app/package.json' },
  { from: '$TMP_DIR/node_modules', to: 'app/node_modules', filter: ['**/*','!**/{*.test.js,*.md,*.markdown,*.html,test/**,tests/**,examples/**,docs/**,.bin/**,.cache/**}'] }
];
fs.writeFileSync('$TMP_DIR/desktop/package.json', JSON.stringify(p,null,2));
console.log('  ✓ patched');
"

# ─── 4. Install desktop deps (Electron + native) ──────────────────────
echo "[4/6] Installing desktop + server deps…"
cd "$TMP_DIR/desktop"
if [[ ! -d node_modules ]]; then
  npm install --cache /tmp/npm-cache-ops --no-audit --no-fund --ignore-scripts 2>&1 | tail -3
  node node_modules/electron/install.js 2>&1 | tail -3
fi
cd "$TMP_DIR"
npm install --cache /tmp/npm-cache-ops --no-audit --no-fund --ignore-scripts --omit=dev 2>&1 | tail -3

# ─── 5. Rebuild better-sqlite3 for Electron ABI + run electron-builder ─
echo "[5/6] Rebuilding better-sqlite3 for Electron ABI…"
cd "$TMP_DIR/desktop"
./node_modules/.bin/electron-rebuild --module-dir "$TMP_DIR" --only better-sqlite3 --arch "$ARCH" 2>&1 | tail -3

echo "      Running electron-builder (role=${ROLE})…"
rm -rf dist-electron
COMMON_FLAGS=(--config.npmRebuild=false
  --config.extraMetadata.opsMode="$ROLE_LOWER"
  --config.productName="OpsControl ${ROLE}"
  --publish never)
case "$PLATFORM" in
  mac)
    OPS_BUILD_ROLE="$ROLE" CSC_IDENTITY_AUTO_DISCOVERY=false env -u ELECTRON_RUN_AS_NODE \
      ./node_modules/.bin/electron-builder --mac dmg --"$ARCH" "${COMMON_FLAGS[@]}"
    ;;
  win)
    OPS_BUILD_ROLE="$ROLE" CSC_IDENTITY_AUTO_DISCOVERY=false env -u ELECTRON_RUN_AS_NODE \
      ./node_modules/.bin/electron-builder --win nsis --x64 "${COMMON_FLAGS[@]}"
    ;;
  *) echo "✗ Unknown platform: $PLATFORM" >&2; exit 1 ;;
esac

# ─── 5b. ABI self-check on the built .app (Lesson 28) ─────────────────
if [[ "$PLATFORM" == "mac" ]]; then
  APP_DIR=$(find "$TMP_DIR/desktop/dist-electron" -maxdepth 2 -name '*.app' -type d | head -1)
  A="$APP_DIR/Contents/Resources/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
  B="$APP_DIR/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
  if [[ -f "$A" && -f "$B" ]]; then
    HA=$(shasum -a 256 "$A" | awk '{print $1}')
    HB=$(shasum -a 256 "$B" | awk '{print $1}')
    if [[ "$HA" == "$HB" ]]; then
      echo "  ✓ ABI self-check: better-sqlite3 overlay matches ($HA)"
    else
      echo "  ✗ ABI MISMATCH (Lesson 28!) outside-asar=$HA  unpacked=$HB" >&2
      echo "    The app will crash with ERR_CONNECTION_REFUSED. Investigate before shipping." >&2
    fi
  else
    echo "  ⚠  ABI self-check skipped — one of the better_sqlite3.node copies not found."
  fi
fi

# ─── 6. Copy artifacts back ───────────────────────────────────────────
echo "[6/6] Copying artifacts → $PROJECT_ROOT/desktop/dist-electron/…"
mkdir -p "$PROJECT_ROOT/desktop/dist-electron"
cp "$TMP_DIR/desktop/dist-electron/"*.dmg \
   "$TMP_DIR/desktop/dist-electron/"*.exe \
   "$TMP_DIR/desktop/dist-electron/latest"*.yml \
   "$PROJECT_ROOT/desktop/dist-electron/" 2>/dev/null || true

echo
ls -lh "$PROJECT_ROOT/desktop/dist-electron/" | grep -iE "${ROLE}|\.dmg|\.exe" || ls -lh "$PROJECT_ROOT/desktop/dist-electron/"
echo
echo "═══ Done — ${ROLE} installer in desktop/dist-electron/ ═══"
