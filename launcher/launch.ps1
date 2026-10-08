# Thrust / Zarch launcher (the desktop shortcut runs this through launch.vbs, so no console window shows).
# Runs the latest working tree: the no-cache server serves game/ straight from this checkout, so a fresh page load is
# always the newest code. main and experimental (a git worktree) each get their own port so both can run at once.
#
# Safe to click repeatedly: only one launcher per port runs at a time, an already-running server for this checkout is
# reused instead of restarted, and a second click within a few seconds of opening the game does nothing.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$branch = (git -C $root rev-parse --abbrev-ref HEAD) 2>$null
$port = if ($branch -eq 'main') { 8765 } else { 8766 }
$log = Join-Path $PSScriptRoot 'launcher.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 256KB) { Remove-Item $log }
function Log($m) { "$(Get-Date -Format s) $m" | Out-File $log -Append -Encoding utf8 }

# single instance per port
$mutex = New-Object System.Threading.Mutex($false, "Local\ThrustZarchLauncher$port")
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
  # debounce: the game was opened moments ago (double/triple clicks)
  $last = Join-Path $PSScriptRoot '.last-open'
  if ((Test-Path $last) -and ((Get-Date) - (Get-Item $last).LastWriteTime).TotalSeconds -lt 8) { exit 0 }
  Log "launch ($branch, port $port)"

  $node = (Get-Command node).Source
  if (-not $node) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Node.js is required to run Thrust / Zarch (https://nodejs.org).', 'Thrust / Zarch') | Out-Null
    exit 1
  }

  # reuse the server if it already serves this checkout; otherwise replace whatever holds the port
  $running = $null
  try { $running = (Invoke-WebRequest "http://127.0.0.1:$port/version.json" -UseBasicParsing -TimeoutSec 1).Content | ConvertFrom-Json } catch {}
  if (-not $running -or $running.root -ne $root) {
    Get-NetTCPConnection -LocalPort $port -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
    Start-Process -FilePath $node -ArgumentList "`"$root\tools\serve.mjs`" --port $port" -WindowStyle Hidden
    for ($i = 0; $i -lt 30; $i++) {
      try { Invoke-WebRequest "http://127.0.0.1:$port/version.json" -UseBasicParsing -TimeoutSec 1 | Out-Null; break } catch { Start-Sleep -Milliseconds 150 }
    }
    Log "server started"
  }

  $commit = (git -C $root rev-parse --short HEAD) 2>$null
  if (-not $env:TZ_NO_BROWSER) { Start-Process "http://127.0.0.1:$port/?v=$commit-$([DateTimeOffset]::Now.ToUnixTimeSeconds())" }
  New-Item -ItemType File -Force $last | Out-Null
  Log "opened build $commit"

  # refresh the icon from the game when the build changed (needs tools/node_modules and the ?icon hero shot)
  $stamp = Join-Path $PSScriptRoot '.icon-commit'
  $hasIconMode = Select-String -Path "$root\game\js\main.js" -Pattern "has\('icon'\)" -Quiet
  if ($commit -and $hasIconMode -and (Test-Path "$root\tools\node_modules\puppeteer-core") -and ((Get-Content $stamp) -ne $commit)) {
    & $node "$root\tools\make-icon.mjs" *>> $log
    if ($LASTEXITCODE -eq 0) { $commit | Out-File $stamp -NoNewline; ie4uinit.exe -show }
  }
} finally { $mutex.ReleaseMutex() }
