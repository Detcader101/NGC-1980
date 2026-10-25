# Sandbox integration validation — 2026-10-25

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
