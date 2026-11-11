@echo off
rem Update to the latest version from GitHub, then restart the server.
cd /d "%~dp0"
rem --------------
rem Lines 1-4 must keep the byte length of the old script's first 4 lines: an old update.cmd that pulls this one resumes at line 5.
rem prompt.md is replaced by every update; a copy someone edited would block the pull, so back it up and restore the original first
git diff HEAD --quiet -- prompt.md
if errorlevel 128 goto pull
if not errorlevel 1 goto pull
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%t"
copy /y "prompt.md" "prompt.backup-%TS%.local.md" >nul
if errorlevel 1 (
  echo Could not back up your changes to prompt.md. Update stopped, nothing was changed.
  pause
  exit /b 1
)
git checkout HEAD -- prompt.md
echo.
echo You had changed prompt.md. Your version is saved as:
echo     prompt.backup-%TS%.local.md
echo prompt.md is now replaced by every update. Put your own rules in prompt.local.md instead
echo (it is never overwritten): copy over only the rules you added yourself.
echo.

:pull
rem One block: cmd reads it whole before running, so the pull replacing this file cannot make it read the new file mid-line
(
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
  exit /b 0
)
