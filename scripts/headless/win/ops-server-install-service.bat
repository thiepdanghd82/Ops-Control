@echo off
setlocal enableextensions
title Ops Control SERVER - cai dich vu nen
rem ===========================================================================
rem  ops-server-install-service.bat — cai Ops Control SERVER chay nen (Windows)
rem
rem  Co che: Windows Task Scheduler (built-in) — KHONG can cai them gi.
rem  Vi sao khong dung Windows Service that: mot tien trinh Electron/node thuan
rem  KHONG noi giao thuc SCM, nen "sc create" tro thang vao no se bi SCM kill.
rem  Mot service that can shim ben thu ba (nssm/WinSW/node-windows) = cai them.
rem  Task Scheduler chay luc BOOT bang tai khoan SYSTEM (truoc khi login), tu
rem  restart khi loi, chay an (khong cua so) — du moi yeu cau, zero cai them.
rem  (Muon "service that": xem README muc nssm tuy chon.)
rem
rem  CHAY: chuot phai -> Run as administrator (script tu xin UAC neu chua).
rem ===========================================================================

rem -- Self-elevate to Administrator --
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Can quyen Administrator. Dang xin nang quyen UAC...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "TASKNAME=OpsControlServer"
set "OPS_HOME=%ProgramData%\OpsControl"
set "ENV_FILE=%OPS_HOME%\server.env"
set "TASKXML=%OPS_HOME%\OpsControlServer.xml"
set "PORT=3000"
if not defined OPS_APP set "OPS_APP=%ProgramFiles%\Ops Control"
set "ELECTRON=%OPS_APP%\Ops Control.exe"
set "SERVER=%OPS_APP%\resources\app\server\index.js"
set "HELPER=%~dp0setup-service-files.cjs"

echo ============================================================
echo   Cai Ops Control SERVER dang dich vu nen (Task Scheduler)
echo ============================================================
echo.

echo [1/6] Kiem tra app da cai...
if not exist "%ELECTRON%" goto :noapp
if not exist "%SERVER%" goto :noapp
echo   OK App: %OPS_APP%
echo.

echo [2/6] Sinh file cau hinh (env + wrapper + task XML)...
echo     ^> "%ELECTRON%" setup-service-files.cjs "%OPS_HOME%" "%OPS_APP%" %PORT%
set "ELECTRON_RUN_AS_NODE=1"
"%ELECTRON%" "%HELPER%" "%OPS_HOME%" "%OPS_APP%" %PORT%
set "RC=%errorlevel%"
set "ELECTRON_RUN_AS_NODE="
if not "%RC%"=="0" ( echo   FAIL: setup-service-files loi ^(ma %RC%^). & goto :done )
echo.

echo [3/6] Khoa quyen file env (chi SYSTEM + Administrators doc)...
echo     ^> icacls "%ENV_FILE%" /inheritance:r /grant:r SYSTEM:F Administrators:F
icacls "%ENV_FILE%" /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" >nul
echo.

echo [4/6] License...
if exist "%OPS_HOME%\data\license.json" (
  echo   OK Da co license: %OPS_HOME%\data\license.json
) else if exist "%APPDATA%\ops-control-desktop\license.json" (
  echo     ^> Sao chep license cua app sang dich vu nen
  copy /Y "%APPDATA%\ops-control-desktop\license.json" "%OPS_HOME%\data\license.json" >nul
) else (
  echo   [!] Chua co license. Dat file license da ky vao:
  echo       %OPS_HOME%\data\license.json
)
echo.

echo [5/6] Tao + chay scheduled task (boot, SYSTEM, an, tu restart)...
echo     ^> schtasks /Create /TN "%TASKNAME%" /XML "%TASKXML%" /F
schtasks /Create /TN "%TASKNAME%" /XML "%TASKXML%" /F
echo     ^> schtasks /Run /TN "%TASKNAME%"
schtasks /Run /TN "%TASKNAME%"
echo.

echo [6/6] Kiem tra /health (doi toi da 15s)...
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 15;$i++){ try{ Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PORT%/health | Out-Null; $ok=$true; break }catch{ Start-Sleep -Seconds 1 } }; if($ok){ Write-Host '   OK Server DANG CHAY - http://127.0.0.1:%PORT%/health' } else { Write-Host '   [!] Chua thay /health - xem log %OPS_HOME%\logs\server.err.log' }"
echo      Client trong LAN noi toi: http://(IP-may-nay):%PORT%
goto :done

:noapp
echo   FAIL: Khong thay app tai %OPS_APP%
echo   Cai "Ops Control SERVER Setup ....exe" truoc (mac dinh C:\Program Files\Ops Control),
echo   hoac dat bien OPS_APP=^<duong dan app^> roi chay lai.

:done
echo.
pause
