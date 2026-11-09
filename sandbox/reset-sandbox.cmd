@echo off
rem Reset the ClaudeSandbox WSL distro to the clean snapshot (does not touch your own Ubuntu).
wsl.exe --terminate ClaudeSandbox
wsl.exe --unregister ClaudeSandbox
wsl.exe --import ClaudeSandbox "%~dp0disk" "%~dp0clean.tar" --version 2
echo done.
pause
