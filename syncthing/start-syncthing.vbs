' Starts Syncthing in the background (no window). Syncthing restarts itself if it crashes.
' Uses "syncthing" from PATH so winget upgrades keep working.
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c syncthing serve --no-browser --no-console", 0, False
