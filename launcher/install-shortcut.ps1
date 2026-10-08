# Creates (or refreshes) the desktop shortcut for this checkout: "Thrust Zarch" for main, "Thrust Zarch EXPERIMENTAL" for
# any other branch (the experimental worktree), each pointing at its own launch.vbs and icon.
$here = $PSScriptRoot
$root = Split-Path -Parent $here
$branch = (git -C $root rev-parse --abbrev-ref HEAD) 2>$null
$exp = $branch -ne 'main'
$name = if ($exp) { 'Thrust Zarch EXPERIMENTAL' } else { 'Thrust Zarch' }
$icon = if ($exp -and (Test-Path "$here\thrust-zarch-exp.ico")) { "$here\thrust-zarch-exp.ico" } else { "$here\thrust-zarch.ico" }
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop "$name.lnk"))
$lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
$lnk.Arguments = "`"$here\launch.vbs`""
$lnk.WorkingDirectory = $root
$lnk.IconLocation = "$icon,0"
$lnk.Description = "Thrust / Zarch ($branch) - runs the latest build from $root"
$lnk.Save()
Write-Output "Shortcut: $(Join-Path $desktop "$name.lnk") -> $branch"
