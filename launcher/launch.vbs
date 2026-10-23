' Runs launch.ps1 with no console window (target of the desktop shortcuts). Argument: main or experimental.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
build = "main"
If WScript.Arguments.Count > 0 Then build = WScript.Arguments(0)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\launch.ps1"" -Build " & build, 0, False
