@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Ops Control v1.0

cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║            Ops Control v1.0                          ║
echo  ║            Cost Flow · Planning                      ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   Node.js not installed! Download from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo   Node.js: %%i
echo.

:: Install dependencies
if not exist "node_modules" (
    echo   Installing dependencies...
    call npm install --silent
    echo   Dependencies installed
    echo.
)

if not exist "client\node_modules" (
    echo   Installing client dependencies...
    cd client && call npm install --silent && cd ..
    echo   Client dependencies installed
    echo.
)

:: Build client
if not exist "client\dist" (
    echo   Building client...
    cd client && call npx vite build --silent && cd ..
    echo   Client build done
    echo.
)

echo.
echo   Ops Control: http://localhost:3000
echo   To STOP: Ctrl+C or close this window
echo.

:: Open browser
start /b cmd /c "timeout /t 2 >nul & start http://localhost:3000"

:: Start server
set NODE_NO_WARNINGS=1
node server/index.js

echo.
echo   Stopped.
pause
