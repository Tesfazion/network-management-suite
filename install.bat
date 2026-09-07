@echo off
rem =============================================================
rem  Network Management Suite - Windows installer
rem  Installs dependencies and optionally loads demonstration data.
rem  Run this from the project folder.
rem =============================================================
setlocal

echo.
echo  ============================================
echo   Network Management Suite - installation
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  ERROR: Node.js was not found.
  echo  Install it from https://nodejs.org then run this script again.
  echo.
  pause
  exit /b 1
)

echo  [1/3] Installing dependencies ^(npm install^)...
call npm install
if errorlevel 1 (
  echo  ERROR: npm install failed.
  echo.
  pause
  exit /b 1
)

echo  [2/3] Preparing the database...
echo        The database file network.db is created automatically on first run.

echo  [3/3] Demonstration data ^(optional^)
set /p wantdemo=        Load a demonstration office network? [y/N]: 
if /i "%wantdemo%"=="y" (
  call npm run seed
  if errorlevel 1 (
    echo  ERROR: seeding failed.
    pause
    exit /b 1
  )
)

if not defined PORT set "PORT=8080"

echo.
echo  ------------------------------------------------------------
echo   Installation complete.
echo   - Start the Suite with:   npm start
echo   - Open in your browser:   http://localhost:%PORT%
echo   - Change the organization name from the sidebar footer.
echo  ------------------------------------------------------------
echo.
endlocal