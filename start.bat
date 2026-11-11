@echo off
title APEX CLASH
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is needed to run APEX CLASH and it is not installed yet.
  echo  Trying to install it automatically with winget...
  echo.
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo  When the install finishes, close this window and double-click start.bat again.
  echo  If it failed, download Node.js LTS from https://nodejs.org and install it.
  pause
  exit /b
)
if not exist "node_modules\ws" (
  echo  First run: installing the multiplayer component...
  call npm install --omit=dev --no-audit --no-fund
)
start "" "http://localhost:3000"
node server.js
pause
