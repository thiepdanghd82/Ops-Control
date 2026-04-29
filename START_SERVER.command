#!/bin/bash
# Ops Control v1.0 — Server Launcher (macOS)
# Double-click file này để khởi động server

cd "$(dirname "${BASH_SOURCE[0]}")"

clear
echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║           Ops Control v1.0 — Server              ║"
echo "  ║           Cost Flow · Planning                   ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# ── Tìm Node.js ───────────────────────────────────────────
NODE=""
for cmd in node node20 node22; do
    command -v "$cmd" &>/dev/null && NODE="$cmd" && break
done

if [ -z "$NODE" ]; then
    echo "  ❌  Node.js chưa được cài đặt!"
    echo "      brew install node  hoặc  https://nodejs.org"
    read -p "  Nhấn Enter để thoát..."
    exit 1
fi
echo "  ✓  Node.js: $($NODE --version)"
echo ""

# ── Cài npm dependencies nếu chưa có ─────────────────────
if [ ! -d "node_modules" ]; then
    echo "  📦  Đang cài dependencies..."
    npm install --silent
    echo "  ✓  Dependencies đã cài xong"
    echo ""
fi

if [ ! -d "client/node_modules" ]; then
    echo "  📦  Đang cài client dependencies..."
    cd client && npm install --silent && cd ..
    echo "  ✓  Client dependencies đã cài xong"
    echo ""
fi

# ── Build client nếu chưa có dist ─────────────────────────
if [ ! -d "client/dist" ]; then
    echo "  🔨  Đang build client..."
    cd client && npx vite build --silent && cd ..
    echo "  ✓  Client build xong"
    echo ""
fi

# ── Tìm IP LAN ───────────────────────────────────────────
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null)
[ -z "$LOCAL_IP" ] && LOCAL_IP=$(ipconfig getifaddr en1 2>/dev/null)
[ -z "$LOCAL_IP" ] && LOCAL_IP=$(ipconfig getifaddr en2 2>/dev/null)

# ── Kill tiến trình cũ ────────────────────────────────────
# `lsof -ti` returns PIDs newline-separated. We pass the variable
# UN-quoted so bash word-splits — each PID becomes a separate arg to
# kill. Quoted ("$OLD_PIDS") would hand kill a single multi-line
# string it can't parse, which is why the old version silently
# failed when multiple stale processes were bound to the port.
OLD_PIDS=$(lsof -ti:3000 2>/dev/null)
if [ -n "$OLD_PIDS" ]; then
    PID_LINE=$(echo "$OLD_PIDS" | tr '\n' ' ')
    echo "  ⚠️   Đang dừng tiến trình cũ trên port 3000 (PID $PID_LINE)..."
    # Graceful TERM first.
    kill $OLD_PIDS 2>/dev/null
    # Poll up to ~3s for the port to free. Escalate to SIGKILL after
    # ~1.5s so stuck/ignoring processes don't block startup.
    for i in 1 2 3 4 5 6 7 8 9 10; do
        sleep 0.3
        STILL=$(lsof -ti:3000 2>/dev/null)
        [ -z "$STILL" ] && break
        if [ "$i" = "5" ]; then
            echo "  ⚠️   Tiến trình cũ không tự dừng, dùng SIGKILL..."
            kill -9 $STILL 2>/dev/null
        fi
    done
    if [ -n "$(lsof -ti:3000 2>/dev/null)" ]; then
        echo "  ❌  Không thể giải phóng port 3000. Hãy khởi động lại máy hoặc kiểm tra thủ công."
        read -p "  Nhấn Enter để thoát..."
        exit 1
    fi
fi

echo ""
echo "  ┌──────────────────────────────────────────────────┐"
echo "  │                                                  │"
echo "  │           🚀  OPS CONTROL v1.0                   │"
echo "  │                                                  │"
if [ -n "$LOCAL_IP" ]; then
echo "  │   👉  http://$LOCAL_IP:3000"
fi
echo "  │   👉  http://localhost:3000   (máy này)          │"
echo "  │                                                  │"
echo "  │   Mở Chrome/Safari, nhập địa chỉ trên            │"
echo "  │   Để TẮT: Cmd+C hoặc đóng cửa sổ này            │"
echo "  │                                                  │"
echo "  └──────────────────────────────────────────────────┘"
echo ""

# ── Mở trình duyệt sau 2 giây ────────────────────────────
(sleep 2 && open "http://localhost:3000") &

# ── Khởi động Ops Control server ──────────────────────────
echo "  ✓  Ops Control starting (Node.js only, no Python required)..."
echo ""
NODE_NO_WARNINGS=1 "$NODE" server/index.js

# ── Cleanup ───────────────────────────────────────────────
echo ""
echo "  ✓  Đã dừng."
read -p "  Nhấn Enter để thoát..."
