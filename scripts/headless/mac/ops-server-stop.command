#!/bin/bash
# Dừng Ops Control SERVER nền (macOS). Vẫn tự chạy lại ở lần boot sau —
# muốn gỡ hẳn thì dùng ops-server-uninstall.command.
set -uo pipefail
cd "$(dirname "$0")"
source "$(dirname "$0")/_common.sh"

echo "  Dừng Ops Control SERVER nền…"
need_root "$@"

if ! is_loaded; then
  echo "  • Dịch vụ không nạp (đã dừng sẵn)."
else
  # bootout dừng tiến trình + bỏ KeepAlive cho phiên hiện tại.
  run launchctl bootout "system/${LABEL}" 2>/dev/null || run launchctl bootout system "$PLIST"
  echo "  ✓ Đã gửi lệnh dừng."
fi

sleep 2
if health >/dev/null 2>&1; then
  echo "  ⚠ Vẫn còn phản hồi ở cổng ${PORT} — có thể tiến trình khác đang chiếm cổng."
else
  echo "  ✅ Đã dừng (cổng ${PORT} không còn phản hồi)."
fi
echo "  (Lưu ý: lần khởi động máy kế tiếp dịch vụ sẽ tự chạy lại.)"
pause_close
