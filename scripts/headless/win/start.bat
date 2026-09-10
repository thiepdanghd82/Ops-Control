@echo off
setlocal enableextensions
title Ops Control SERVER - start
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set "TASKNAME=OpsControlServer"
set "OPS_HOME=%ProgramData%\OpsControl"
set "PORT=3000"

echo Khoi dong Ops Control SERVER nen...
schtasks /Run /TN "%TASKNAME%"
if errorlevel 1 (
  echo   FAIL: chua cai task. Chay ops-server-install-service.bat truoc.
  echo.
  pause
  exit /b
)
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 15;$i++){ try{ Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PORT%/health | Out-Null; $ok=$true; break }catch{ Start-Sleep -Seconds 1 } }; if($ok){ Write-Host '   OK dang chay - http://127.0.0.1:%PORT%/health' } else { Write-Host '   [!] chua thay /health - xem %OPS_HOME%\logs\server.err.log' }"
echo.
pause
