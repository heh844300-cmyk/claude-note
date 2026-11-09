@echo off
rem Stops the Claude Note server started from THIS folder (the restart loop and node).
set "HERE=%~dp0"
powershell -NoProfile -Command "$h = $env:HERE; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine.Contains($h + 'run-server.cmd') -or ($_.Name -eq 'node.exe' -and $_.CommandLine.Contains($h + 'server.js'))) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo stopped.
