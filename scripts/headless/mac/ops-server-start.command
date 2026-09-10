#!/bin/bash
# Khởi động (hoặc khởi động lại) Ops Control SERVER nền (macOS).
set -uo pipefail
cd "$(dirname "$0")"
source "$(dirname "$0")/_common.sh"

echo "  Khởi động Ops Control SERVER nền…"
need_root "$@"

if [ ! -f "$PLIST" ]; then
  echo "  ✘ Chưa cài. Chạy ops-server-install-daemon.command trước."
  pause_close; exit 1
fi

# bootstrap nếu chưa nạp; kickstart -k để (re)start
run launchctl bootstrap system "$PLIST" 2>/dev/null || true
run launchctl enable "system/${LABEL}" 2>/dev/null || true
run launchctl kickstart -k "system/${LABEL}"

echo "  Đợi /health…"
for i in $(seq 1 15); do health >/dev/null 2>&1 && break; sleep 1; done
if health >/dev/null 2>&1; then
  echo "  ✅ Đang chạy — http://127.0.0.1:${PORT}/health OK"
else
  echo "  ⚠ Chưa thấy /health. Xem: tail -n 50 $ERR_LOG"
fi
pause_close
