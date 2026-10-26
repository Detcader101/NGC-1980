# Sandbox validation

## Visibility and expanded islands — 2026-10-26

Follow-up to experimental `fcf6b0e`, developed in `ngc/visibility-ui`. All current Markdown documentation and
additional commander2/parity documents on the other branch tips were reviewed. Historical agent ownership and
results remain preserved; [PLAN](PLAN.md) lists the remaining ambitions and selective integrations.

The full Node gate passed **435 syntax checks and all 46 regression programs** (481/481 runner checks).
[Committed Node results](evidence/node-checks-2026-10-26.json) preserve per-program outcomes and timings.
Targeted results: fish 78/78, expanded world 11/11, commander/recovery 39/39 (10/10 real-island jet recoveries),
simulation 13/13, and the complete enemy transport loop. The Sea Knight scene's transient-state wait was corrected
after the gate and syntax-checked separately; gameplay code did not change afterward.

Gameplay source: `a141dd4` (game tree `facda38801b4d1d1a35f0dad4a82d39c9d5234ee`).
Nine selected browser scenes passed **108 assertions**, produced **94 screenshots**, and recorded no page or
console errors. [Committed browser results](evidence/browser-checks-2026-10-26.json) retain individual assertions,
fixture queries and artifact names.

| Scene | Assertions | Coverage |
|---|---|---|
| CPU spectator | 6/6 | Commanders, cameras, overlays and 4,000 matching terrain samples |
| C-130 airdrop | 10/10 | Heavy delivery, parachutes, derigging and taking control |
| Research | 26/26 | Starting gates, purchases, research/cancel, AI research and unlocked mode |
| Catapult launches | 5/5 | Player Hornet/Tomcat and AI launches |
| Natural fish and UI | 10/10 | Normal flight visibility, Off, three research entry points |
| World visibility | 17/17 | Town/forest LOD, terrain transitions, streaming and zone edge |
| Huey airlift | 14/14 | Jeep delivery/control and six-person troop lift |
| Sea Knight | 17/17 | Cold start, flight, safe touchdown and 13-person ground handoff |
| Swimming | 3/3 | Expanded-map shelf, underwater rendering and resurfacing |

The sling delivery retained 23.3% fuel from a 50% starting tank and the delivered jeep remained usable. The Sea
Knight landed at FORGE at 2.82 m/s maximum sink, with intact gear, then transferred all 13 Marines to ground combat.
[Delivered jeep](evidence/visibility-2026-10-26/delivered-jeep.png),
[Sea Knight landing](evidence/visibility-2026-10-26/sea-knight-landed.png),
[after disembarkation](evidence/visibility-2026-10-26/sea-knight-dismounted.png).

The existing experimental server on port 8766 then passed **11/11 normal-startup checks** at clean commit
`a141dd4`, without a debug bridge or automatic start. Enter, HUD research, pause/board research and the default
medium sea-life setting were verified. [Experimental startup](evidence/visibility-2026-10-26/experimental-startup.png).
Documentation/evidence commits after this source commit do not change its game tree.

Representative screenshots were inspected at full-frame size:
[research](evidence/visibility-2026-10-26/tech-tree.png),
[fish at 25 m](evidence/visibility-2026-10-26/fish-25m.png),
[80 m](evidence/visibility-2026-10-26/fish-80m.png),
[220 m](evidence/visibility-2026-10-26/fish-220m.png),
[town at 680 m](evidence/visibility-2026-10-26/town-680m.png),
[520 m](evidence/visibility-2026-10-26/town-520m.png),
[360 m](evidence/visibility-2026-10-26/town-360m.png),
[2 km streaming flight](evidence/visibility-2026-10-26/flight-2km.png),
[HOME](evidence/visibility-2026-10-26/home-island.png),
[PELICAN](evidence/visibility-2026-10-26/pelican.png),
[CITADEL](evidence/visibility-2026-10-26/citadel.png) and
[SANDBAR](evidence/visibility-2026-10-26/sandbar.png).

Natural medium-quality sea life changed **4,134 / 767 / 391 pixels** at 25/80/220 m in a 768×432 render;
18 schools were present in each sample, while Off changed zero pixels.
[Pixel comparison data](evidence/visibility-2026-10-26/fish-pixels.json).

| Scenery sample | Frame median / p95 (ms) | World-update CPU (ms) | Draw calls | Submitted triangles |
|---|---|---|---|---|
| Town, 680 m | 116.7 / 233.3 | 0.178 | 177 | 441,661 |
| Town, 520 m | 150.0 / 283.3 | 0.151 | 172 | 485,614 |
| Town, 360 m | 166.6 / 333.4 | 0.233 | 236 | 551,880 |
| After 900 m move | 116.6 / 216.6 | 0.163 | 175 | 410,419 |

The browser benchmark ran alone after the CPU wars, at 1280×720 with render scale 0.5. The continuous 2 km
streaming path peaked at **98 chunks / 2 pending requests**. These are SwiftShader software-renderer numbers,
not a claim of playable GPU frame rates. [Raw streaming data](evidence/visibility-2026-10-26/streaming-benchmark.json).
Node measured 690 fish at 0.61 ms/frame and 1,010 boids at 1.28 ms average / 1.97 ms worst. The terrain bench took
1.12 s for its initial natural-grid bake and 1.84 s overall; sampled island land areas ranged from 14,450 to
190,225 m². [Terrain benchmark](evidence/visibility-2026-10-26/terrain-benchmark.json).

The expanded-map strategy batch completed **8 wars / 360 simulated minutes**, with no numerical anomalies.
All reached the 45-minute limit. [SIMREPORT](SIMREPORT.md) records the captures, research, attrition and remaining
pacing/production issues instead of treating time-limit points leads as victories.

The natural-fish scene starts through Enter with default research and the normal medium sea-life preference. It
holds the Huey over open water at 25, 80 and 220 m with the game's chase camera, waits for natural spawning, and
compares two renders in the same frame with only the sea-life meshes toggled. No bait ball, oversized fish or
close-up camera is injected. A difference above 12 RGB units counts as a changed pixel; Off must change zero pixels.
At higher altitudes, the visible feature is a live shoal, not an individually resolvable fish body.

The scenery scene approaches a real town outside the control zone at 680/520/360 m, checks overlapping LOD,
stable trees after a 900 m terrain-window move and the temporal height transition, then streams a scripted 2 km
camera path at 100 m/s. It also crosses the expanded zone edge. Island-survey screenshots deliberately disable
strategic intelligence masking to show coast shapes; the other fixtures retain it.

The larger-map checks exposed and corrected a ship-route corner cut and a missing public navigation check used by
recovery-course selection. The transport's real round trip now needs about 560 simulated seconds, so its old
480-second test limit became 660 seconds. A sling-delivery screenshot exposed fuel exhaustion before set-down;
Huey game fuel acceleration was halved to accommodate the wider map. Early failed runs are retained locally.

The terrain generator's natural surface palette is integrated. Its shared friction table and natural-beach delivery
are still prospective interfaces; current gameplay retains the existing ground hosts and landing hards. Ten jet
recovery trials use real island heights and navigable constant-speed carrier lanes. They do not certify every
moving/blocked/contested approach. Larger crew/roster integration remains deferred.

Reproduce from the repository root:

```sh
npm --prefix tools test
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/visibility.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/worldvisibility.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/airlift.mjs
PARTS=swim CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/sealife.mjs
node tools/warsim.mjs --blue BALANCED,AIRPOWER --red DEFAULT,SWARM \
  --seeds 2 --tmax 2700 --workers 2 --tech default --name expanded-visibility
```

This pass uses Chrome Headless 156 / SwiftShader under WSL. Browser timings measure this software renderer, not
consumer GPU frame rates. Hardware controls, audio listening and human balance/endurance testing remain open.
Raw artifacts are in ignored `tools/runs/` in `/home/jayjay/thrust-zarch/.claude/worktrees/visibility-ui`.

## Historical integration baseline — 2026-10-25

The results below were measured on the previous, smaller map; they remain historical evidence and do not stand
in for the expanded-world reruns above.

Source: `experimental` baseline `72e27dd`, six feature merges, gameplay fixes `dba1e25` / `11069ca`,
aircraft retirement accounting `01d0d05`, cockpit cursor handling `2216951`, and tooling `b0c7c24`
on `ngc/finish`. The final local integration also includes the documentation update.

## Automated checks

`npm --prefix tools test` passed **429 module syntax checks and 45 regression programs**. These are program counts,
not a claim of 474 independent gameplay assertions. Each bench contains its own assertions. The runner discovers
every `tools/*bench.mjs` and additionally runs `hotas-selftest.mjs` and `rotarydeck.mjs`, sequentially.

Evidence: `tools/runs/check-2026-10-25T18-12-58-978Z/summary.json` and the per-program logs beside it.
The [committed Node results](evidence/node-checks-2026-10-25.json) retain all 45 program outcomes and durations.
After the aircraft retirement flag correction, the expanded `telemetrybench.mjs`, `airbench.mjs` (28/28)
and affected-file syntax checks passed again. Logs: `tools/runs/finish-telemetry-v5.log` and `finish-airbench-v5.log`.

Coverage includes flight models and systems, ground vehicles, Marine/inventory/medical logic, squads and embarkation,
moving decks and catapult queues, cave/world collisions, research, economy, UI marker logic, HOTAS/wheel mappings,
sea motion/life, deterministic CPU wars and the reporting CLI. New targeted checks cover:

| Check | Result | What it catches |
|---|---|---|
| `economybench.mjs` | 6/6 | Real raid/salvo purchases stay within budget; research reserves start/release/reset |
| `rotarycontactbench.mjs` | 27/27 | Deep contacts remain finite for CH-46/MV-22/WASP at three frame rates and depths |
| `deckopsbench.mjs` | 16/16 | Ordered launches, spacing, recovery/foul holds, priority and the starting Huey's clearance |
| `simbench.mjs` | 13/13 | Seed determinism, default doctrine/copy agreement, research on both sides, captures and finite state |
| `simreportbench.mjs` | 11/11 | Aggregation preserves full-timeline outcomes/metrics and excludes failed wars |
| `warsimbench.mjs` | 20/20 | Invalid arguments fail; real CLI output uses default research and keeps its last sample |
| `transportbench.mjs` | Pass | Actual-war boarding through a carrier turn, departure, troop landing, enemy capture and recovery |
| `telemetrybench.mjs` | Pass | Immediate crash/damage losses counted once; real air-war recovery/stowage excluded; no casualty refund |
| `commanderbench.mjs` | 33/33 | Crew recoveries and a loaded Huey departure beside rising terrain |

## Browser integration

Browser: Chrome Headless 156, SwiftShader, WSL; 1280×720 screenshots, usually `res=0.45`.
These drive the actual browser game through keys, clicks and the debug bridge. They are regression scenarios,
not an unscripted human playtest. Debug fixture setup and accelerated research are explicit in each scene.

| Scene | Assertions | Coverage | Local run folder under `tools/runs/` |
|---|---|---|---|
| `smoke.json` | 5/5 | Launch, real keyboard input, nonblank rendered world | `finish-smoke` |
| `techtree.mjs` | 26/26 | Locked/open gates, purchases, research/cancel/input, AI research and full-tree debug mode | `finish-techtree-v4` |
| `airlift.mjs` | 13/13 | Overweight refusal, Huey jeep lift/delivery/control, six-man boarding and landing without aircraft loss | `finish-airlift-v4` |
| `airdrop.mjs` | 10/10 | C-130 M113 delivery, parachutes, derigging, taking control, refusal of an overweight M60 | `finish-airdrop` |
| `qa_ship.mjs` | 37/37 | Interior clearance, doors, seats, hangar and sky-carrier views (`QA_PART=inside,seats,sky`) | `finish-qa_ship` |
| `simmode.json` | 6/6 | Both CPU commanders, overlays/cameras and 4,000 terrain samples (worst difference zero) | `finish-simmode` |
| `deckseq.mjs` | 4/4 | Three AI Tomcats and the player Hornet queued and airborne in order | `finish-deckseq` |
| `catshot.mjs` | 5/5 | Player Tomcat/Hornet and AI escort launches with positive climb after leaving the catapult | `finish-catshot-v4` |
| `sealife.mjs` | 8/8 | Bait ball/birds, downwash, dolphin bow-riding in clear water, diving/resurfacing (`PARTS=huey,bow,swim`) | `finish-sealife-v5` |
| `commander.mjs` | 29/29 | Command-board switching, reserves/losses, queued Tomcat, Huey/Hornet recovery and fleet-exhausted defeat | `finish-commander-v4` |
| `ch46fly.mjs` | 17/17 | Cold start by mouse/key, 13-man boarding/payload, carrier departure, safe landing and all 13 joining the ground war | `finish-ch46fly-v5` |

These 11 selected scene runs passed **160 assertions**, produced 159 screenshots, and recorded zero page or console
errors. [Committed browser results](evidence/browser-checks-2026-10-25.json) retain their individual outcomes, assertion
labels and artifact names. Runs span the integration; affected flows were rerun after fixes. Earlier failed runs remain
alongside corrected reruns. The commander scenario's original 28/29 result included successful Huey and Hornet
recoveries; its one obsolete assertion expected an immediate catapult spot during recovery, before the shared queue.
The corrected rerun recovered the Hornet on its third approach after two wave-offs while the carrier changed course;
longer-duration recovery and approach robustness remain in the backlog. Subsequent scene edits add wave-off diagnostics
and clarify a label without changing its inputs or assertions.

Representative screenshots were inspected for rendered content and placement: helicopter flight, jet climb-out,
research and the spectator map, carrier hangar/seats, the M113 under parachutes, the Sea Knight cockpit and seated/dismounting
Marines, Huey delivery, and dolphins alongside the bow. This was a selected visual review, not an inspection of every frame.

After fast-forwarding `experimental`, a separate **7/7 startup check** used the existing server at
`http://127.0.0.1:8766/?kb&res=0.45`, without debug or auto-start. It verified the title, Enter to play, fleet display,
default research locks, command/research screens, pause and resume; five screenshots and no page/console errors.
`/version.json` identified the clean experimental checkout at gameplay/test commit `28c3447`. Only documentation
changed afterward. Artifacts: `tools/runs/finish-release-startup`; its result is included in the browser evidence JSON.

## Strategy evidence

See [SIMREPORT.md](SIMREPORT.md) for the paired research runs and final doctrine matrix. Node uses the game's war,
unit and commander logic with a baked terrain table, DOM/renderer stubs and distant-combat detail. It cannot verify
browser rendering, input, near-player combat detail or hardware performance. The browser spectator additionally
checks terrain agreement and camera/overlay behavior.

## Reproduce

```sh
# No dependencies needed for the static game or the Node benches.
npm --prefix tools test

# For browser scenes: install the pinned Puppeteer dependency and point to a local browser.
npm --prefix tools ci
CHROME_PATH=/path/to/chrome npm --prefix tools run smoke
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/catshot.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/ch46fly.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/airlift.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/airdrop.mjs
```

This workspace's browser executable is `/home/jayjay/.cache/chs/chrome.sh`. Run one browser at a time.
Generated logs, screenshots, simulation records and terrain caches live under ignored `tools/runs/` in the
integration worktree `/home/jayjay/thrust-zarch/.claude/worktrees/finish`; they are not shipped as source files.

## Practical limits

- The full historical collection of browser scenes and every development preview were not rerun. The selected
  scenes cover the merged features and main regression risks; the Node suite covers the remaining subsystem cores.
- No physical HOTAS, wheel, pedals, audio listening session or mid-range GPU benchmark was available. Software-rendered
  browser frame rates are not evidence of consumer hardware performance.
- Airdrop terrain coverage, long-duration AI recovery, comprehensive collision/parity work and human balance testing
  remain in [PLAN.md](PLAN.md). An automated pass does not certify every feature in the design bible.
