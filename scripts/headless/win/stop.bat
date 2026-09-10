@echo off
setlocal enableextensions
title Ops Control SERVER - stop
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set "TASKNAME=OpsControlServer"
set "PORT=3000"

echo Dung Ops Control SERVER nen...
schtasks /End /TN "%TASKNAME%"
echo   (Luu y: lan khoi dong may ke tiep dich vu se tu chay lai.)
echo.
timeout /t 2 >nul
powershell -NoProfile -Command "try{ Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:%PORT%/health | Out-Null; Write-Host '   [!] Cong %PORT% van phan hoi - kiem tra tien trinh khac' }catch{ Write-Host '   OK da dung (cong %PORT% khong con phan hoi)' }"
echo.
pause
