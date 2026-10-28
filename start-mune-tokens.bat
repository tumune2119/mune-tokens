@echo off
setlocal
title MUNE TOKENS
cd /d "%~dp0"

set "PORT=5176"
set "URL=http://127.0.0.1:%PORT%"

where node >nul 2>nul
if errorlevel 1 (
  echo [MUNE TOKENS] Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

rem Usually started hidden by launch-mune-tokens.vbs; run directly, it shows this console instead.

rem Already running? Just open another window.
node scripts\launcher-check.mjs running "%URL%"
if not errorlevel 1 (
  echo [MUNE TOKENS] Already running - opening the app.
  call :open
  exit /b 0
)

rem First run (or package-lock.json changed): install dependencies.
node scripts\launcher-check.mjs install
if not errorlevel 1 (
  echo [MUNE TOKENS] Installing dependencies, this takes a minute the first time...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
  node scripts\launcher-check.mjs mark-installed
)

rem No build yet, or the source changed since the last one: build.
node scripts\launcher-check.mjs build
if not errorlevel 1 (
  echo [MUNE TOKENS] Building...
  rem Start from a clean folder: OneDrive can hold locks on old build files, which makes Next fail with EPERM.
  if exist .next rd /s /q .next
  call npm run build
  if errorlevel 1 goto :fail
)

call :open
echo.
echo [MUNE TOKENS] Running at %URL%
echo [MUNE TOKENS] It stops by itself when you close the MUNE TOKENS window (or click Quit).
echo.
rem The server watches its app windows and exits when the last one closes (src/lib/app-lifetime.ts).
set "MUNE_TOKENS_AUTO_EXIT=1"
call npx next start -p %PORT% -H 127.0.0.1
exit /b %errorlevel%

:open
if "%MUNE_TOKENS_NO_BROWSER%"=="1" exit /b 0
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\open-app.ps1" -Url "%URL%"
exit /b 0

:fail
echo.
echo [MUNE TOKENS] Something went wrong - see the messages above.
pause
exit /b 1
