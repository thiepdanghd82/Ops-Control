@echo off
:: ═══════════════════════════════════════════════════════════════
:: Ops Control v1.0 — Deploy (Windows wrapper)
:: ═══════════════════════════════════════════════════════════════
::
:: Thin wrapper around deploy.ps1 so operators can double-click
:: a .bat file or type `deploy.bat user@host` from cmd.exe without
:: remembering PowerShell execution-policy flags.
::
:: Usage:
::   deploy.bat                            Local build only
::   deploy.bat user@10.102.3.61           Deploy over SSH
::   deploy.bat user@host /SkipBuild       Reuse existing dist\
::
:: Sprint 11 P1-3.
:: ═══════════════════════════════════════════════════════════════

setlocal

set REMOTE=%1
set FLAG=%2

if /i "%FLAG%" == "/SkipBuild" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -Remote "%REMOTE%" -SkipBuild
) else if "%REMOTE%" == "" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" -Remote "%REMOTE%"
)

endlocal
