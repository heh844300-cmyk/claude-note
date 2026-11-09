@echo off
rem Update to the latest version from GitHub, then restart the server.
cd /d "%~dp0"
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Update failed. If you changed files yourself, undo those changes or ask for help.
  pause
  exit /b 1
)
call "%~dp0mobile\stop-server.cmd"
start "" wscript.exe "%~dp0mobile\start-hidden.vbs"
echo.
echo Updated and restarted.
pause
