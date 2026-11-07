@echo off
setlocal
cd /d "%~dp0"

if not defined HEMASCORE_DATA_DIR set "HEMASCORE_DATA_DIR=%LOCALAPPDATA%\HemaScoreKeeper"
if not exist "%HEMASCORE_DATA_DIR%\server.env" (
  echo Start HemaScoreKeeper.Launcher.exe once first so it can create the server configuration.
  exit /b 1
)

set "APP_DATA_DIR=%HEMASCORE_DATA_DIR%"
set "DATABASE_URL=file:./dev.db"
set "LIVE_DATA_DIR=%HEMASCORE_DATA_DIR%\live"

runtime\node.exe --env-file "%HEMASCORE_DATA_DIR%\server.env" server\apps\backend\scripts\create-admin.mjs %*
exit /b %errorlevel%
