; ─────────────────────────────────────────────────────────────────────
;  Ops Control — NSIS installer customization
;  Included by electron-builder via package.json > build.nsis.include
; ─────────────────────────────────────────────────────────────────────
!include "FileFunc.nsh"   ; ${GetTime} for install-time timestamp registry entry
;
;  Mục đích:
;    - Đóng port 3000-3010 trước khi cài (tránh "file đang bị khoá")
;    - Tạo firewall rule cho TCP 9100 outbound (Zebra/TSC)
;    - Whitelist app path cho Windows Defender (giảm cảnh báo)
;    - Thêm registry entry để IT có thể audit version đã cài
;
;  KHÔNG xoá %APPDATA%\Ops Control khi uninstall (data của user).
;  Đó là default behaviour của electron-builder với deleteAppDataOnUninstall=false.

!macro customInstall
  ; Stop any running Ops Control instance từ trước (process cùng tên)
  nsExec::ExecToLog 'taskkill /F /IM "Ops Control.exe" /T'

  ; Firewall: cho phép TCP 9100 outbound (Zebra/TSC raw printing)
  ; Nếu user đã có rule trùng tên thì lệnh sẽ no-op.
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Ops Control - Zebra TCP9100" dir=out action=allow protocol=TCP remoteport=9100'

  ; Registry entry: ghi version đã cài để IT inventory tool đọc được
  ; (System Center / Lansweeper / etc.)
  WriteRegStr HKLM "Software\CCL Design Vietnam\Ops Control" "Version" "${VERSION}"
  WriteRegStr HKLM "Software\CCL Design Vietnam\Ops Control" "InstallPath" "$INSTDIR"
  ; Install timestamp (YYYY-MM-DD HH:MM:SS) — uses NSIS FileFunc::GetTime built-in,
  ; resolved at install time on the target machine (not build time).
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  WriteRegStr HKLM "Software\CCL Design Vietnam\Ops Control" "InstallDate" "$2-$1-$0 $4:$5:$6"

  ; Whitelist exe trong Windows Defender (best-effort — yêu cầu admin)
  nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -Command "Add-MpPreference -ExclusionProcess \"$INSTDIR\\Ops Control.exe\" -ErrorAction SilentlyContinue"'
!macroend

!macro customUnInstall
  ; Stop process trước khi gỡ
  nsExec::ExecToLog 'taskkill /F /IM "Ops Control.exe" /T'

  ; Xoá firewall rule
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Ops Control - Zebra TCP9100"'

  ; Xoá registry entry
  DeleteRegKey HKLM "Software\CCL Design Vietnam\Ops Control"

  ; KHÔNG đụng vào %APPDATA%\Ops Control (chứa license + cache + ops.db).
  ; User muốn xoá hoàn toàn thì phải xoá tay — đây là design choice
  ; tránh mất data khi reinstall.
!macroend
