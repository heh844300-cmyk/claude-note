@echo off
rem Double-click: organize clipboard text. Or drag a .txt/.md file onto this .bat.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0claude-note.ps1" %* -Open
pause
