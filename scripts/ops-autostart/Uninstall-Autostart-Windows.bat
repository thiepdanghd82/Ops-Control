@echo off
REM Uninstall-Autostart-Windows.bat — double-click uninstaller wrapper
REM
REM Operators: double-click this file in File Explorer to remove the
REM auto-start Scheduled Task. The Ops Control SERVER app itself is
REM NOT affected — only the auto-start mechanism is removed.

cd /d "%~dp0"

cls
echo ===============================================================
echo   OPS CONTROL SERVER -- Auto-start Uninstall (Windows)
echo ===============================================================
echo.
echo Script nay se GO Scheduled Task auto-start cho Ops Control SERVER.
echo App Ops Control SERVER van con -- chi co che auto-start bi go.
echo.
echo Bat dau sau 3 giay / Starting in 3 seconds...
echo (Nhan Ctrl+C de huy / Press Ctrl+C to cancel)
timeout /t 3 /nobreak >nul
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-windows.ps1"
set UNINSTALL_EXIT=%errorlevel%

echo.
echo ===============================================================
if %UNINSTALL_EXIT%==0 (
    echo   [OK] GO THANH CONG / UNINSTALL SUCCESSFUL
) else (
    echo   [X] GO THAT BAI / UNINSTALL FAILED (exit %UNINSTALL_EXIT%)
)
echo ===============================================================
echo.
echo Nhan phim bat ky de dong / Press any key to close
pause >nul
