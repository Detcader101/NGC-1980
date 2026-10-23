# Creates (or refreshes) one desktop shortcut per build in config.json ("Thrust Zarch" for main, "Thrust Zarch
# EXPERIMENTAL" for the experimental worktree), each with its own icon. Run by launcher/install.sh.
$here = $PSScriptRoot
$cfg = Get-Content (Join-Path $here 'config.json') -Raw | ConvertFrom-Json
$desktop = [Environment]::GetFolderPath('Desktop')
foreach ($p in $cfg.builds.PSObject.Properties) {
  $b = $p.Value
  $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop "$($b.name).lnk"))
  $lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
  $lnk.Arguments = "`"$here\launch.vbs`" $($p.Name)"
  $lnk.WorkingDirectory = $here
  $lnk.IconLocation = "$here\$($b.icon),0"
  $lnk.Description = "Thrust / Zarch ($($p.Name)) - runs the latest build from $($b.root) in WSL, port $($b.port)"
  $lnk.Save()
  Write-Output "Shortcut: $(Join-Path $desktop "$($b.name).lnk") -> $($p.Name)"
}
ie4uinit.exe -show
