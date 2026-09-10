#!/bin/bash
# Trạng thái Ops Control SERVER nền (macOS). Double-click để xem.
set -uo pipefail
cd "$(dirname "$0")"
source "$(dirname "$0")/_common.sh"

echo "════════════════════════════════════════════════════════════"
echo "  Ops Control SERVER — Trạng thái"
echo "════════════════════════════════════════════════════════════"

echo ""
echo "• Cài đặt (plist):  $([ -f "$PLIST" ] && echo "CÓ ($PLIST)" || echo "CHƯA")"
echo "• Nạp vào launchd:  $(is_loaded && echo "ĐÃ NẠP" || echo "chưa nạp")"

if is_loaded; then
  PID=$(launchctl print "system/${LABEL}" 2>/dev/null | awk -F'= ' '/[^a-z]pid =/{print $2; exit}')
  echo "• PID:              ${PID:-"(không có — có thể đang khởi động lại)"}"
fi

echo -n "• Health check:     "
if health >/dev/null 2>&1; then
  echo "✅ SỐNG — http://127.0.0.1:${PORT}/health OK"
else
  echo "❌ KHÔNG phản hồi ở cổng ${PORT}"
fi

echo ""
echo "• DATA_DIR:   $DATA_DIR  $([ -d "$DATA_DIR" ] && echo "(có)" || echo "(thiếu)")"
echo "• License:    $LICENSE_FILE  $([ -f "$LICENSE_FILE" ] && echo "(có)" || echo "(thiếu)")"
echo "• env file:   $ENV_FILE  $([ -f "$ENV_FILE" ] && echo "(có, 600)" || echo "(thiếu)")"

echo ""
echo "• Log lỗi gần nhất ($ERR_LOG):"
if [ -f "$ERR_LOG" ]; then tail -n 8 "$ERR_LOG" | sed 's/^/    /'; else echo "    (chưa có log)"; fi
pause_close
