@echo off
setlocal enableextensions
title Ops Control SERVER - trang thai
set "TASKNAME=OpsControlServer"
set "OPS_HOME=%ProgramData%\OpsControl"
set "PORT=3000"

echo ============================================================
echo   Ops Control SERVER - Trang thai
echo ============================================================
echo.
echo [Scheduled task]
schtasks /Query /TN "%TASKNAME%" /V /FO LIST 2>nul | findstr /I "TaskName Status Last Next Result"
if errorlevel 1 echo   (chua cai task "%TASKNAME%")
echo.

echo [Health check cong %PORT%]
powershell -NoProfile -Command "try{ $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 http://127.0.0.1:%PORT%/health; Write-Host ('   OK SONG - HTTP '+$r.StatusCode) }catch{ Write-Host '   KHONG phan hoi' }"
echo.

echo [Duong dan]
echo   DATA_DIR : %OPS_HOME%\data
echo   License  : %OPS_HOME%\data\license.json
echo   env file : %OPS_HOME%\server.env
echo.

echo [Log loi gan nhat]
if exist "%OPS_HOME%\logs\server.err.log" (
  powershell -NoProfile -Command "Get-Content -Tail 8 '%OPS_HOME%\logs\server.err.log' | ForEach-Object { '    ' + $_ }"
) else (
  echo     (chua co log)
)
echo.
pause
