@echo off
title GOAL NATION 2026
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is needed to run the game from source. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b
)
if not exist "node_modules\ws" (
  echo  First run: installing the online-play component...
  call npm install --omit=dev --no-audit --no-fund
)
start "" "http://localhost:3100"
node server.js
pause
