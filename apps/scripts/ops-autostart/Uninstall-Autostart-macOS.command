#!/usr/bin/env bash
#
# Uninstall-Autostart-macOS.command — double-click uninstaller wrapper
#
# Operators: double-click this file in Finder to remove the
# auto-start LaunchAgent. The Quoted Module SERVER app itself is NOT
# affected — only the auto-start mechanism is removed.

cd "$(dirname "$0")"

clear
echo "═══════════════════════════════════════════════════════════════"
echo "  QUOTED MODULE SERVER — Auto-start Uninstall (macOS)"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Script này sẽ GỠ LaunchAgent auto-start cho Quoted Module SERVER."
echo "App Quoted Module SERVER vẫn còn — chỉ cơ chế auto-start bị gỡ."
echo ""
echo "Bắt đầu sau 3 giây · Starting in 3 seconds..."
echo "(Nhấn Ctrl+C để hủy · Press Ctrl+C to cancel)"
sleep 3
echo ""

sh ./uninstall-macos.sh
UNINSTALL_EXIT=$?

echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ $UNINSTALL_EXIT -eq 0 ]; then
  echo "  ✓ GỠ THÀNH CÔNG · UNINSTALL SUCCESSFUL"
else
  echo "  ✗ GỠ THẤT BẠI · UNINSTALL FAILED (exit $UNINSTALL_EXIT)"
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Nhấn Enter để đóng · Press Enter to close"
read -r
