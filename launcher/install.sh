#!/usr/bin/env bash
# Installs the desktop launchers, run from WSL: copies the launcher to %LOCALAPPDATA%\ThrustZarch (a normal Windows
# folder, so the icons show even when WSL is asleep), writes its config.json and creates two desktop shortcuts:
#   Thrust Zarch               this checkout (main), port 8765
#   Thrust Zarch EXPERIMENTAL  the experimental worktree next to it, port 8766
#     (git worktree add --track -b experimental ../thrust-zarch-experimental origin/experimental)
# Re-run it after moving the checkouts; it's safe to run again.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
main=$(dirname "$here")
exp=${TZ_EXP_ROOT:-$(dirname "$main")/thrust-zarch-experimental}
node=$(command -v node) || { echo "node not found in WSL"; exit 1; }
la=$(cmd.exe /c "echo %LOCALAPPDATA%" 2>/dev/null | tr -d '\r')
dst=$(wslpath "$la")/ThrustZarch
mkdir -p "$dst"
cp "$here"/{launch.ps1,launch.vbs,install-shortcut.ps1,thrust-zarch.ico,thrust-zarch-exp.ico} "$dst"/
[ -d "$exp" ] || echo "note: no experimental checkout at $exp (its shortcut will report that when clicked)"
cat > "$dst/config.json" <<EOF
{
  "distro": "${WSL_DISTRO_NAME}",
  "node": "$node",
  "builds": {
    "main": { "name": "Thrust Zarch", "root": "$main", "port": 8765, "icon": "thrust-zarch.ico" },
    "experimental": { "name": "Thrust Zarch EXPERIMENTAL", "root": "$exp", "port": 8766, "icon": "thrust-zarch-exp.ico" }
  }
}
EOF
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$dst/install-shortcut.ps1")"
