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
set "MIGRATE=%~dp0..\migrate-datadir.cjs"
set "MIGRATE_FAILED="

echo ============================================================
echo   Cai Ops Control SERVER dang dich vu nen (Task Scheduler)
echo ============================================================
echo.

echo [1/7] Kiem tra app da cai...
if not exist "%ELECTRON%" goto :noapp
if not exist "%SERVER%" goto :noapp
echo   OK App: %OPS_APP%
echo.

echo [2/7] Sinh file cau hinh (env + wrapper + task XML)...
echo     ^> "%ELECTRON%" setup-service-files.cjs "%OPS_HOME%" "%OPS_APP%" %PORT%
set "ELECTRON_RUN_AS_NODE=1"
"%ELECTRON%" "%HELPER%" "%OPS_HOME%" "%OPS_APP%" %PORT%
set "RC=%errorlevel%"
set "ELECTRON_RUN_AS_NODE="
if not "%RC%"=="0" ( echo   FAIL: setup-service-files loi ^(ma %RC%^). & goto :done )
echo.

echo [3/7] Khoa quyen file env (chi SYSTEM + Administrators doc)...
echo     ^> icacls "%ENV_FILE%" /inheritance:r /grant:r SYSTEM:F Administrators:F
icacls "%ENV_FILE%" /inheritance:r /grant:r "SYSTEM:F" "Administrators:F" >nul
echo.

echo [4/7] Di tru du lieu app embedded cu (neu co)...
call :do_migrate
if defined MIGRATE_FAILED goto :done
echo.

echo [5/7] License...
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

echo [6/7] Tao + chay scheduled task (boot, SYSTEM, an, tu restart)...
echo     ^> schtasks /Create /TN "%TASKNAME%" /XML "%TASKXML%" /F
schtasks /Create /TN "%TASKNAME%" /XML "%TASKXML%" /F
echo     ^> schtasks /Run /TN "%TASKNAME%"
schtasks /Run /TN "%TASKNAME%"
echo.

echo [7/7] Kiem tra /health (doi toi da 15s)...
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 15;$i++){ try{ Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PORT%/health | Out-Null; $ok=$true; break }catch{ Start-Sleep -Seconds 1 } }; if($ok){ Write-Host '   OK Server DANG CHAY - http://127.0.0.1:%PORT%/health' } else { Write-Host '   [!] Chua thay /health - xem log %OPS_HOME%\logs\server.err.log' }"
echo      Client trong LAN noi toi: http://(IP-may-nay):%PORT%
goto :done

rem ── Migrate subroutine (labels, KHONG dung %errorlevel% trong ngoac) ──────
:do_migrate
  rem Tim DATA_DIR cu cua app: quet moi user profile (UAC co the doi tai khoan).
  set "OLD_DATA="
  if defined OPS_OLD_DATA set "OLD_DATA=%OPS_OLD_DATA%"
  if not defined OLD_DATA for /d %%U in ("C:\Users\*") do if not defined OLD_DATA if exist "%%U\AppData\Roaming\ops-control-desktop\data\ops.db" set "OLD_DATA=%%U\AppData\Roaming\ops-control-desktop\data"
  if exist "%OPS_HOME%\data\ops.db" ( echo   DATA_DIR dich vu da co ops.db - BO QUA migrate. & goto :eof )
  if not defined OLD_DATA ( echo   Khong thay du lieu app cu - dich vu khoi tao DB moi. & goto :eof )
  for %%D in ("%OLD_DATA%\..") do set "OLD_UDATA=%%~fD"
  echo   Phat hien du lieu app embedded: %OLD_DATA%
  echo   [!] BAT BUOC: app SERVER (cua so) da TAT HAN truoc khi di tru (tranh hong DB).
  set "ANS="
  set /p ANS=  App da tat - di tru + verify ngay bay gio? [y/N]:
  if /I not "%ANS%"=="y" ( echo   Bo qua migrate - dich vu khoi tao DB RONG. & goto :eof )
  set "ELECTRON_RUN_AS_NODE=1"
  "%ELECTRON%" "%MIGRATE%" "%OLD_DATA%" "%OPS_HOME%\data" "%OPS_APP%"
  set "ELECTRON_RUN_AS_NODE="
  if errorlevel 1 ( echo   FAIL: migrate/verify loi - KHONG khoi dong daemon. & set "MIGRATE_FAILED=1" & goto :eof )
  rem license nam 1 cap TREN data\ -> copy rieng
  if exist "%OLD_UDATA%\license.json" if not exist "%OPS_HOME%\data\license.json" copy /Y "%OLD_UDATA%\license.json" "%OPS_HOME%\data\license.json" >nul
  rem Vo hieu hoa DATA_DIR cu: doi ten -> app embedded khong chay nham DB cu
  move "%OLD_DATA%" "%OLD_DATA%.migrated-backup" >nul 2>&1
  > "%OLD_UDATA%\READ-ME-SERVER-MOVED.txt" echo Ops Control SERVER da chuyen sang dich vu nen. Du lieu o %OPS_HOME%\data . KHONG mo app SERVER nua (se tao DB rong).
  echo   OK da di tru + doi ten data cu -^> .migrated-backup
  goto :eof

:noapp
echo   FAIL: Khong thay app tai %OPS_APP%
echo   Cai "Ops Control SERVER Setup ....exe" truoc (mac dinh C:\Program Files\Ops Control),
echo   hoac dat bien OPS_APP=^<duong dan app^> roi chay lai.

:done
echo.
pause
