@echo off
setlocal enableextensions
title Ops Control SERVER - go cai
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set "TASKNAME=OpsControlServer"
set "OPS_HOME=%ProgramData%\OpsControl"
set "PORT=3000"

echo ============================================================
echo   Go Ops Control SERVER nen
echo ============================================================
echo.
echo [1/3] Dung task dang chay...
schtasks /End /TN "%TASKNAME%" 2>nul
echo.
echo [2/3] Xoa scheduled task + wrapper + xml...
schtasks /Delete /TN "%TASKNAME%" /F 2>nul
if exist "%OPS_HOME%\run-server.bat" del /Q "%OPS_HOME%\run-server.bat"
if exist "%OPS_HOME%\OpsControlServer.xml" del /Q "%OPS_HOME%\OpsControlServer.xml"
echo   OK da xoa task + file chay.
echo.
echo [3/3] Du lieu + license + khoa...
echo   Giu lai: %OPS_HOME%\data (du lieu, license)
echo   Giu lai: %OPS_HOME%\server.env (khoa - xoa se khoa user khoi 2FA neu cai lai khoa moi)
set /p ANS=  Go XOA LUON toan bo du lieu + khoa? Go XOA-HET de xac nhan, Enter de giu:
if /I "%ANS%"=="XOA-HET" (
  rmdir /S /Q "%OPS_HOME%"
  echo   OK da xoa toan bo %OPS_HOME%.
) else (
  echo   OK giu nguyen du lieu. Cai lai bang install de dung tiep.
)
echo.
timeout /t 2 >nul
powershell -NoProfile -Command "try{ Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:%PORT%/health | Out-Null; Write-Host '   [!] Cong %PORT% van phan hoi - kiem tra tien trinh khac' }catch{ Write-Host '   OK da go (cong %PORT% khong con phan hoi)' }"
echo.
pause
