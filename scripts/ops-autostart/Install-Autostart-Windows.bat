@echo off
REM Install-Autostart-Windows.bat — double-click installer wrapper
REM
REM Operators: double-click this file in File Explorer. A Command
REM Prompt window opens, the install runs, then waits for any key
REM before closing.
REM
REM This wrapper calls install-windows.ps1 with ExecutionPolicy Bypass
REM (PowerShell .ps1 files can't be double-clicked directly on Windows
REM due to default security policy; .bat wrapper is the standard
REM workaround for operator-friendly double-click installs).

cd /d "%~dp0"

cls
echo ===============================================================
echo   OPS CONTROL SERVER -- Auto-start Install (Windows)
echo   CCL Design Hai Duong -- v1.6.0
echo ===============================================================
echo.
echo Script nay se cai Scheduled Task de Ops Control SERVER:
echo   - Tu khoi dong sau khi Win reboot (mat dien)
echo   - Tu restart neu app bi crash
echo.
echo Yeu cau truoc / Prereqs:
echo   1. Ops Control SERVER Setup.exe da cai
echo   2. Auto-login da bat (netplwiz)
echo.
echo Bat dau sau 3 giay / Starting in 3 seconds...
echo (Nhan Ctrl+C de huy / Press Ctrl+C to cancel)
timeout /t 3 /nobreak >nul
echo.

REM Run the PowerShell install script with bypassed execution policy
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1"
set INSTALL_EXIT=%errorlevel%

echo.
echo ===============================================================
if %INSTALL_EXIT%==0 (
    echo   [OK] CAI DAT THANH CONG / INSTALL SUCCESSFUL
    echo.
    echo   Tiep theo / Next steps:
    echo     1. Test bang cach kill app + doi 65 giay + check lai:
    echo        Stop-Process -Name "Ops Control" -Force
    echo        Start-Sleep -Seconds 65
    echo        Get-Process "Ops Control"
    echo.
    echo     2. Restart may + verify SERVER tu bat sau auto-login
    echo.
    echo     3. Xem huong dan day du trong Autostart_Setup_Guide.docx
) else (
    echo   [X] CAI DAT THAT BAI / INSTALL FAILED (exit %INSTALL_EXIT%)
    echo.
    echo   Doc log loi phia tren + xem huong dan:
    echo   Autostart_Setup_Guide.docx -^> Phan 5 (Su co thuong gap)
    echo.
    echo   Lien he Henry neu van khong sua duoc.
)
echo ===============================================================
echo.
echo Nhan phim bat ky de dong cua so nay / Press any key to close
pause >nul
