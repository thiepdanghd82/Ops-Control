#!/bin/bash
# Gỡ Ops Control SERVER nền (macOS): dừng + xóa plist + wrapper. Dữ liệu +
# license + env GIỮ LẠI mặc định (hỏi nếu muốn xóa luôn).
set -uo pipefail
cd "$(dirname "$0")"
source "$(dirname "$0")/_common.sh"

echo "════════════════════════════════════════════════════════════"
echo "  Gỡ Ops Control SERVER nền"
echo "════════════════════════════════════════════════════════════"
need_root "$@"

echo ""
echo "[1/3] Dừng + bỏ nạp dịch vụ…"
run launchctl bootout "system/${LABEL}" 2>/dev/null || true

echo ""
echo "[2/3] Xóa plist + wrapper…"
[ -f "$PLIST" ] && run rm -f "$PLIST" || echo "  • plist không có (bỏ qua)"
[ -f "$RUN_SCRIPT" ] && run rm -f "$RUN_SCRIPT" || echo "  • wrapper không có (bỏ qua)"

echo ""
echo "[3/3] Dữ liệu + license + env…"
echo "  • Giữ lại: $DATA_DIR  (dữ liệu, license)"
echo "  • Giữ lại: $ENV_FILE  (khóa — xóa sẽ khóa toàn bộ user khỏi 2FA nếu cài lại với khóa mới)"
read -r -p "  XÓA LUÔN toàn bộ dữ liệu + khóa? Gõ 'XOA-HET' để xác nhận, Enter để giữ: " ans 2>/dev/null || ans=""
if [ "$ans" = "XOA-HET" ]; then
  run rm -rf "$SUPPORT_DIR"
  run rm -rf "$LOG_DIR"
  echo "  ✓ Đã xóa toàn bộ $SUPPORT_DIR + log."
else
  echo "  ✓ Giữ nguyên dữ liệu. (Cài lại bằng install để dùng tiếp.)"
fi

echo ""
if health >/dev/null 2>&1; then
  echo "  ⚠ Cổng ${PORT} vẫn phản hồi — kiểm tra tiến trình khác."
else
  echo "  ✅ Đã gỡ. Cổng ${PORT} không còn phản hồi."
fi
pause_close
