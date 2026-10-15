; ─────────────────────────────────────────────────────────────────────
;  Quoted Module (formerly "Ops Control") SERVER — NSIS installer customization
;  Server build: thêm firewall TCP 3100 inbound (cho LAN clients connect),
;  giữ Zebra outbound + Defender whitelist của installer chung.
;
;  Đổi tên: exe mới "Quoted Module.exe", bản cũ "Ops Control.exe" — dừng
;  process + xoá firewall rule xử lý CẢ HAI tên. Registry key
;  "Software\CCL Design Vietnam\Ops Control" giữ nguyên (IT inventory).
; ─────────────────────────────────────────────────────────────────────
!include "FileFunc.nsh"

!macro customInstall
  nsExec::ExecToLog 'taskkill /F /IM "Quoted Module.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "Ops Control.exe" /T'

  ; Dọn rule mang tên cũ (trước khi đổi tên) rồi thêm rule tên mới
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Ops Control - Zebra TCP9100"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Ops Control Server - LAN TCP3100"'

  ; Firewall: TCP 9100 outbound cho Zebra/TSC
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Quoted Module - Zebra TCP9100" dir=out action=allow protocol=TCP remoteport=9100'

  ; SERVER-ONLY: TCP 3100 inbound — cho phép máy nhân viên LAN kết nối.
  ; Profile=any (Domain + Private + Public) để bao hết. Production khuyến nghị
  ; lock thêm bằng remoteip=LocalSubnet nếu LAN có giới hạn.
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Quoted Module Server - LAN TCP3100" dir=in action=allow protocol=TCP localport=3100 profile=any'

  ; Registry IT inventory
  WriteRegStr HKLM "Software\CCL Design Vietnam\Ops Control" "Version" "${VERSION}"
  WriteRegStr HKLM "Software\CCL Design Vietnam\Ops Control" "Role" "server"
  WriteRegStr HKLM "Software\CCL Design Vietnam\Ops Control" "InstallPath" "$INSTDIR"
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  WriteRegStr HKLM "Software\CCL Design Vietnam\Ops Control" "InstallDate" "$2-$1-$0 $4:$5:$6"

  ; Defender whitelist
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -Command "Add-MpPreference -ExclusionProcess \"$INSTDIR\\Quoted Module.exe\" -ErrorAction SilentlyContinue"'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'taskkill /F /IM "Quoted Module.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "Ops Control.exe" /T'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Quoted Module - Zebra TCP9100"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Quoted Module Server - LAN TCP3100"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Ops Control - Zebra TCP9100"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Ops Control Server - LAN TCP3100"'
  DeleteRegKey HKLM "Software\CCL Design Vietnam\Ops Control"
!macroend
