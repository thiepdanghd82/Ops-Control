#!/usr/bin/env bash
#
# Install-Autostart-macOS.command — double-click installer wrapper
#
# Operators: double-click this file in Finder. A Terminal window will
# open, the install runs, and a prompt asks you to press Enter to close.
#
# Vận hành: double-click file này trong Finder. Cửa sổ Terminal mở,
# install chạy, sau đó nhấn Enter để đóng.
#
# This wrapper simply calls install-macos.sh with proper cwd + pauses
# at the end so operator can read the output. macOS recognizes .command
# files as scripts to open in Terminal on double-click (vs .sh which
# opens in default text editor).

cd "$(dirname "$0")"

clear
echo "═══════════════════════════════════════════════════════════════"
echo "  OPS CONTROL SERVER — Auto-start Install (macOS)"
echo "  CCL Design Hai Duong · v1.6.0"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Script này sẽ cài LaunchAgent để Ops Control SERVER:"
echo "  • Tự khởi động sau khi Mac reboot (mất điện)"
echo "  • Tự restart nếu app bị crash"
echo ""
echo "Yêu cầu trước · Prereqs:"
echo "  1. SERVER DMG đã cài (drag /Volumes/Ops Control X.X.X/Ops Control.app sang Applications)"
echo "  2. Auto-login đã bật (System Settings → Users & Groups)"
echo ""
echo "Bắt đầu sau 3 giây · Starting in 3 seconds..."
echo "(Nhấn Ctrl+C để hủy · Press Ctrl+C to cancel)"
sleep 3
echo ""

# Run the install script
sh ./install-macos.sh
INSTALL_EXIT=$?

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ $INSTALL_EXIT -eq 0 ]; then
  echo "  ✓ CÀI ĐẶT THÀNH CÔNG · INSTALL SUCCESSFUL"
  echo ""
  echo "  Tiếp theo · Next steps:"
  echo "    1. Test bằng cách kill app + đợi 35 giây + check lại:"
  echo "       killall \"Ops Control\""
  echo "       sleep 35"
  echo "       pgrep -fl \"Ops Control SERVER\""
  echo ""
  echo "    2. Restart máy + verify SERVER tự bật sau auto-login"
  echo ""
  echo "    3. Xem hướng dẫn đầy đủ trong Autostart_Setup_Guide.docx"
else
  echo "  ✗ CÀI ĐẶT THẤT BẠI · INSTALL FAILED (exit $INSTALL_EXIT)"
  echo ""
  echo "  Đọc log lỗi phía trên + xem hướng dẫn:"
  echo "  Autostart_Setup_Guide.docx → Phần 5 (Sự cố thường gặp)"
  echo ""
  echo "  Liên hệ Henry nếu vẫn không sửa được."
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Nhấn Enter để đóng cửa sổ này · Press Enter to close this window"
read -r
