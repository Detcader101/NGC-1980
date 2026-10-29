#!/usr/bin/env bash
# Installs the desktop launchers, run from WSL: copies the launcher to %LOCALAPPDATA%\ThrustZarch (a normal Windows
# folder, so the icons show even when WSL is asleep), writes its config.json and creates two desktop shortcuts:
#   Thrust Zarch               this checkout (main), port 8765
#   NGC-1980 EXPERIMENTAL      the experimental worktree next to it (NGC-1980), port 8766
#   NGC-1980 SIM MODE          the same experimental server, opened with ?sim (CPU vs CPU war to watch)
#   NGC-1980 FULL TECH TREE    the same experimental server, opened with ?tech=max (every research node done, both sides)
#   NGC-1980 BENCHMARK         the same experimental server, opened with ?bench (the desktop benchmark: ~15 min hands off,
#                              report in tools/runs/bench-<run>/report.html; docs/ngc1980/PERF-BUDGETS.md)
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
cp "$here"/{launch.ps1,launch.vbs,install-shortcut.ps1,thrust-zarch.ico,thrust-zarch-exp.ico,thrust-zarch-sim.ico,thrust-zarch-tech.ico} "$dst"/
[ -d "$exp" ] || echo "note: no experimental checkout at $exp (its shortcut will report that when clicked)"
cat > "$dst/config.json" <<EOF
{
  "distro": "${WSL_DISTRO_NAME}",
  "node": "$node",
  "builds": {
    "main": { "name": "Thrust Zarch", "root": "$main", "port": 8765, "icon": "thrust-zarch.ico" },
    "experimental": { "name": "NGC-1980 EXPERIMENTAL", "root": "$exp", "port": 8766, "icon": "thrust-zarch-exp.ico" },
    "experimental-sim": { "name": "NGC-1980 SIM MODE", "root": "$exp", "port": 8766, "icon": "thrust-zarch-sim.ico", "query": "sim" },
    "experimental-tech": { "name": "NGC-1980 FULL TECH TREE", "root": "$exp", "port": 8766, "icon": "thrust-zarch-tech.ico", "query": "tech=max" },
    "experimental-bench": { "name": "NGC-1980 BENCHMARK", "root": "$exp", "port": 8766, "icon": "thrust-zarch-tech.ico", "query": "bench" }
  }
}
EOF
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$dst/install-shortcut.ps1")"
