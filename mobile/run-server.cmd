@echo off
rem Keeps the Claude Note server running; restarts it if it crashes.
cd /d "%~dp0"
if not exist logs mkdir logs
set "NODE=C:\Program Files\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"
:loop
echo [%date% %time%] starting server >> logs\server.log
"%NODE%" "%~dp0server.js" >> logs\server.log 2>&1
set "RC=%errorlevel%"
echo [%date% %time%] server exited with %RC%, restarting >> logs\server.log
rem exit code 1 = configuration problem (e.g. no vault): retry slowly instead of every 5 seconds
if "%RC%"=="1" (timeout /t 60 /nobreak > nul) else (timeout /t 5 /nobreak > nul)
goto loop
