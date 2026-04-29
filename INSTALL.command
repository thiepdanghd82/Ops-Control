#!/bin/bash
# Ops Control v1.0 — Installer (macOS)
# Double-click để cài đặt dependencies

cd "$(dirname "${BASH_SOURCE[0]}")"

clear
echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║       Ops Control v1.0 — Installer              ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# Python
PYTHON=""
for cmd in python3 python3.13 python3.12 python3.11; do
    command -v "$cmd" &>/dev/null && PYTHON="$cmd" && break
done
[ -z "$PYTHON" ] && echo "  ❌  Python 3 not found! Install: brew install python3" && exit 1
echo "  ✓  Python: $($PYTHON --version)"

# Node.js
command -v node &>/dev/null || { echo "  ❌  Node.js not found! Install: brew install node"; exit 1; }
echo "  ✓  Node.js: $(node --version)"
echo ""

# Python dependencies
echo "  📦  Installing Python dependencies..."
$PYTHON -m pip install --quiet bcrypt openpyxl pandas
echo "  ✓  Python packages installed"
echo ""

# Node dependencies
echo "  📦  Installing Node.js server dependencies..."
npm install
echo "  ✓  Server dependencies installed"
echo ""

echo "  📦  Installing React client dependencies..."
cd client && npm install && cd ..
echo "  ✓  Client dependencies installed"
echo ""

# Build
echo "  🔨  Building React client..."
cd client && npx vite build && cd ..
echo "  ✓  Client built successfully"
echo ""

echo "  ══════════════════════════════════════════"
echo "  ✅  Installation complete!"
echo ""
echo "  To start:  Double-click START_SERVER.command"
echo "  URL:       http://localhost:3000"
echo "  ══════════════════════════════════════════"
echo ""
read -p "  Nhấn Enter để thoát..."
