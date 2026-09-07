@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Network Management Suite - installer

echo ==============================================
echo   Network Management Suite - Windows install
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo   Download it from https://nodejs.org and re-run this script.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies ^(this can take a minute^)...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
) else (
  echo Dependencies already installed.
)

if "%PORT%"=="" set PORT=8080

echo.
echo Starting Network Management Suite on port !PORT!...
echo   Local:  http://localhost:!PORT!
echo   LAN:    http://<this-computer-ip>:!PORT!
echo.
echo The first run opens the setup wizard - enter your organization name.
echo.

start "Network Management Suite" node server/server.js
timeout /t 2 /nobreak >nul
echo Server started in its own window. You can close this one.
pause >nul