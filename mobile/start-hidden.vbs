' Launch run-server.cmd without a visible window (used by the Startup folder shortcut).
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & dir & "\run-server.cmd""", 0, False
