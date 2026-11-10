@echo off
rem Uninstall wizard (Chinese UI). Your notes in the Obsidian vault are never deleted.
rem Run from %TEMP% so this window does not keep the program folder in use.
set "CN_ROOT=%~dp0"
cd /d "%TEMP%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%CN_ROOT%setup\uninstall.ps1" %*
pause
