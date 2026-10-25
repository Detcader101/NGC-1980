# Thrust / Zarch launcher (Windows side). The desktop shortcuts run it through launch.vbs (so no console window shows)
# with -Build main or -Build experimental. The game lives in WSL: the no-cache server (tools/serve.mjs) runs there with
# the WSL node, from that build's checkout, one port per build so both can run at once. A fresh page load is always the
# newest code in that checkout. Paths and ports come from config.json, written by launcher/install.sh.
#
# Safe to click repeatedly: one launcher per build at a time, a running server for the same checkout is reused, and a
# second click within a few seconds of opening the game does nothing.
param([string]$Build = 'main')
# A build may share another's checkout and port and only add a URL query (config "query", e.g. sim for ?sim):
# experimental-sim and experimental-tech open the experimental server with ?sim / ?tech=max.
$ErrorActionPreference = 'SilentlyContinue'
$cfg = Get-Content (Join-Path $PSScriptRoot 'config.json') -Raw | ConvertFrom-Json
$b = $cfg.builds.$Build
if (-not $b) { exit 1 }
$root = $b.root; $port = [int]$b.port
$query = if ($b.query) { "&$($b.query)" } else { '' }
$log = Join-Path $PSScriptRoot 'launcher.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 256KB) { Remove-Item $log }
function Log($m) { "$(Get-Date -Format s) [$Build] $m" | Out-File $log -Append -Encoding utf8 }
function Ver { try { (Invoke-WebRequest "http://127.0.0.1:$port/version.json" -UseBasicParsing -TimeoutSec 1).Content | ConvertFrom-Json } catch { $null } }
function Fail($m) {
  Log "FAILED: $m"
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("$m`n`nLog: $log", "$($b.name)") | Out-Null
  exit 1
}

$mutex = New-Object System.Threading.Mutex($false, "Local\ThrustZarchLauncher$port")
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
  $last = Join-Path $PSScriptRoot ".last-open-$Build"
  if ((Test-Path $last) -and ((Get-Date) - (Get-Item $last).LastWriteTime).TotalSeconds -lt 8) { exit 0 }
  Log "launch ($root, port $port)"

  $running = Ver
  if (-not $running -or $running.root -ne $root) {
    # nothing there, or a server for another checkout holds the port: (re)start this build's server inside WSL
    & wsl.exe -d $cfg.distro -- pkill -f "serve.mjs --port $port" | Out-Null
    Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', $cfg.distro, '--cd', $root, '--', $cfg.node, 'tools/serve.mjs', '--port', "$port") -WindowStyle Hidden
    for ($i = 0; $i -lt 75 -and -not $running; $i++) { Start-Sleep -Milliseconds 200; $running = Ver }   # WSL can take a few s to wake
    if (-not $running) { Fail "The game server didn't start (WSL distro '$($cfg.distro)', $root)." }
    Log "server started"
  }

  Start-Process "http://127.0.0.1:$port/?v=$($running.commit)-$([DateTimeOffset]::Now.ToUnixTimeSeconds())$query"
  New-Item -ItemType File -Force $last | Out-Null
  Log "opened build $($running.commit)"
} finally { $mutex.ReleaseMutex() }
