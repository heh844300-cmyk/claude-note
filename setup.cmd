@echo off
rem Setup wizard (Chinese UI). Safe to run again to change settings.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\setup.ps1" %*
pause
