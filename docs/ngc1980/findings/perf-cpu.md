# perf-cpu: main-thread CPU and garbage-collection hitches (2026-10-28)

Branch `ngc/perf-cpu` from `ngc/shader-library` 36eb21b. Scope: the JS sim and the per-frame prep on the main thread,
and the garbage they make. GPU, draw calls, LODs, shadows and post belong to the perf-render branch; hotspots found
there are listed at the end for them.

All numbers were taken on the shared box (32 cores, load average 35-45 from five other agents' runs), so absolute ms
are 2-4x what an idle desktop shows; compare before and after within a table, not with a real PC. Allocation numbers
(bytes) do not depend on load.

## Tools added

| tool | what it does |
|---|---|
| `?perfhud` (game/js/perfhud.js) | on-screen CPU ms per system, mean and worst over the last second: input, sea, player, war (split into war.ships / war.air / war.guns+aa / war.ground / war.ai+deck / war.structs), afterwar+fog, fx, sealife, cams+meshes, world, nature, vehicles, hud, interiors, light, render, markers; frame CPU, frame interval, hitches (frames over 2x the median interval), JS heap and its growth per second (Chrome). Without `?perfhud` nothing is measured. `window.__perf.snapshot()` for tools. |
| `tools/scenes/cpuprofile.mjs` | five busy views (war, deck, village, fish, huey) under the V8 CPU profiler and the sampling heap profiler (collected objects kept, so it measures allocation, not the live heap), plus the perfhud split. Writes `tools/runs/prof/browser-<PROF_TAG>/<scene>.{cpuprofile,heapprofile,txt}` and `summary.json`. `PROF_SCENES=war,deck PROF_SECS=20`. |
| `tools/warprof.mjs` | one seeded headless war (tools/sim/headless.mjs), game seconds `--from` to `--from + --secs` profiled for CPU and allocations: ms per 1/30 s step, KB allocated per step, top functions and allocation sites. Real V8 JIT, no SwiftShader: the cleanest view of the war's own cost. |
| `tools/simdiff.mjs` | two warsim runs compared war by war (wall time left out): proves an optimisation did not change a war. |
| `tools/profsummary.mjs`, `tools/profunder.mjs` | summaries of .cpuprofile / .heapprofile: self time, allocation sites, and inclusive / self time under one function ("what does `pool.update` spend its time on"). |
| `tools/hypotbench.mjs` | game/js/hypot.js is bit-identical to Math.hypot and allocation-free. |

## 2026-10-28 - Seeded headless wars changed whenever a model gained or lost a mesh
**Finding** Building three.js objects drew from the war's seeded `Math.random`: half of all random draws in a war
(625 808 of 1.25 M in seed 1's first 10 min) were three.js UUIDs. Making the AI CH-46's Marines lazy (fewer meshes)
changed seed 1's war completely, with no game logic touched. Every model, LOD or prop change by any branch did the same,
so "same seed, same war" could not be used to check a change.
**Evidence** warprof seed 1: `rng 625808` before, `rng 462409` with the lazy figures; with the fix 322 930 draws, and
the lazy figures then give the identical war.
**Cause** `generateUUID()` in three.module.min.js calls `Math.random()` four times per Object3D / geometry / material.
**Action** tools/sim/headless.mjs loads three.js through its module hook with the UUIDs on their own seeded stream
(`globalThis.__uuidRandom`, reseeded per war). The game in the browser is unchanged. This changes every seed's war
once (a new baseline); all comparisons below are against that baseline (commit e40aaf1).

## 2026-10-28 - The war sim: where the time and the garbage went
**Finding** In a headless war (seed 1, 300-600 s, everything at far detail) the top costs were three.js matrix
updates (12.7 % `updateMatrixWorld` + 5.8 % `multiplyMatrices`) and 460 KB of garbage per 1/30 s step (14 MB per game
second).
**Evidence** `node tools/warprof.mjs --seed 1 --from 300 --secs 300` (tools/runs/prof/base-war-s1):

| site | cost before | cause |
|---|---|---|
| defence/brain.js:173 `o.mesh.updateMatrixWorld()` | 12 % CPU | every AA unit re-walked its whole model every step; every world read after it refreshes its own parent chain anyway |
| array iterator `next` (localDeck / deckY / surfVel) | 650 MB / 300 s | `const [xi, zi] = P[i]` in kraken.js `inPoly` and `const [lx, lz] = toLocal(...)` in war.js: destructuring allocates an iterator in unoptimised code |
| infantry/meshkit.js `add` (Marine figures) | 400 MB + 120 MB geometry | every AI CH-46 built 13 full Marines (skeleton, weapon) at spawn, wherever it was |
| Math.hypot | 307 MB | V8's Math.hypot is variadic and allocates an argument array per call (never inlined) |
| kraken.js `localDeck`, war.js `surfVel`, `shipAt` | 300 + 200 + 33 MB | a closure and a result literal per unit per gear leg per substep |
| seamotion.js `mo.step` | 210 MB | three [gain, lag] arrays per wave component per ship per step |
| rotary/rb.js `qrot` / `qinv` / `gear` | 190 + 60 MB | destructured quaternion, a temp array per call, a touch object per contact step |

**Action** All fixed (24de2a2, 25e3669), each with the same arithmetic in the same order:

| headless war, seed 1, 300-600 s | before | after |
|---|---|---|
| wall ms per 1/30 s step | 1.53 | 0.83 |
| KB allocated per step | 460 | 162 |
| MB allocated per game second | 13.8 | 4.9 |
| warsim, 3 seeds x 30 min, wall s | 149 / 126 / 111 | 109 / 84 / 77 |
| warsim records (tools/simdiff.mjs, wall left out) | | identical, all three seeds |

## 2026-10-28 - The browser: five busy views
**Evidence** `tools/scenes/cpuprofile.mjs`, 20 s each (SwiftShader: 1-3 fps, so every frame steps 0.1 s of game time and
the sims substep; per game second is the fair unit for garbage). "JS ms/frame" is the profiler's JS self time (no idle,
no GC). Before = 36eb21b plus the tools; after = this branch.

Paired run (base and branch started together, so both saw the same machine load; load average ~100):
`tools/runs/prof/browser-before3` (in a copy of the base) and `tools/runs/prof/browser-after3`. The "after" side also
pays for ?perfhud's own laps and was measured before perfhud stopped reading `performance.memory` every frame
(that read cost ~1 ms a frame, now every 8th frame), so the after numbers are conservative.

| view | JS ms/frame before | after | GC ms/frame before | after | KB allocated/frame before | after | MB allocated per game s before | after |
|---|---|---|---|---|---|---|---|---|
| war (over CINDER, both sides ashore) | 27.5 | 30.9 | 6.25 | 3.33 | 4684 | 2875 | 50.2 | **29.6** |
| village (Huey at 28 m over a town) | 60.9 | 29.7 | 2.06 | 0.64 | 14509 | 2877 | 152.8 | **35.1** |
| huey (cruising over the islands) | 30.3 | 16.6 | 0.83 | 0.26 | 7711 | 1982 | 84.2 | **24.6** |

Unpaired runs of all five views (before, after1, after2 in tools/runs/prof) agree on the direction but swing by 2x
between runs: under this load V8 keeps hot functions (above all the fish sim) in its baseline tiers for long
stretches, where every double is boxed, and that dominates the allocation count of whichever run is unlucky. The deck
and fish views are dominated by the fish sim (next entry) and were not repeated paired. Long tasks: under SwiftShader
every frame is a 400-1 000 ms task, so long-task counts mean nothing here; GC ms per frame (above) and the perfhud's
hitch count on a real GPU are the measures to use.

Top self time after (all views): three.js `updateMatrixWorld` + `multiplyMatrices` (the render's scene-graph pass,
see the perf-render list), the fish sim's `stepSchool`, the render submit (`renderBufferDirect`, `bindVertexArray`,
uniforms), renderkit/light.js `walk`. Top allocation sites after: `stepSchool` (fish, see below), main.js
`terrainH0` (boxed doubles through its non-inlined `lerp` / `smooth` / `hypot2` calls), wheeled `vehiclefm.sub` and
`wheeledenv.terr` (driven and traffic vehicles), interiors `INT.boxes` (listed below), the STRIDER balance code, world
building (world/kit.js `triW`, while chunks stream in), three.js `getParameters`.

**Finding** Allocation was 50-85 MB per game second in every view. At 60 fps that is a minor GC every few frames and
promotions into the old generation (the major-GC hitches). The biggest sources: the fish sim's sea-bed cache and
deoptimisation churn, Math.hypot, collision bounds built as object literals per query, the carrier interior's boxes
built per collision substep, the naval wake builder (closures, arrays and two Vector3 per ship per frame), the war's
deck queries (above).
**Cause / Action** see the per-item entries below.

## 2026-10-28 - A parked truck that never slept ran the full vehicle sim every frame
**Finding** "player" (the controlled craft and every other craft's idle step) was 7-13 ms a frame in the deck and
village views with the Huey hovering. It was not the Huey: an M35 parked on HOME ISLAND with 3 of its 6 wheels on the
ground rocked at 0.02-0.04 rad/s for ever, above the 0.03 rad/s sleep threshold, so it ran vehiclefm, the tyre model
and the collision queries (trees, buildings, ships' boxes, every craft's footprint) every substep.
**Evidence** profunder under `updateZarch` (village): 205 of 214 ms in `V.idle -> physics` of one m35; a browser probe of
`pool.list` showed it the only awake vehicle (`wheels 001011`).
**Action** wheeledcraft.js (7700749): an engine-off vehicle with no driver that has stayed within 15 cm of where it
stood 2.5 s ago sleeps as it stands (it still wakes on the player, a hit, a blast, a bump). A first try (3 cm, not on
a platform) did not catch it: the truck bobbed ~4 cm and its `P.plat` flickered on and off every second with
0.1-0.2 m/s kicks. **OPEN** (wheeled owner): what platform is under the M35 at (-408, 575) on HOME ISLAND, and why it
keeps being carried on and off it.

## 2026-10-28 - Math.hypot without the garbage
**Finding** Math.hypot allocated in every hot loop (a fifth of the war's garbage) and could not be swapped for
`Math.sqrt(x*x + y*y)` without changing seeded wars (different rounding now and then).
**Action** game/js/hypot.js: `hypot2` / `hypot3` follow V8's own algorithm (largest magnitude out, Kahan-summed squares
of the ratios, sqrt times the largest). tools/hypotbench.mjs: 16 M random and game-scale cases bit-identical to
Math.hypot, about 2x faster, no allocation. Used in war.js, ground.js, world.js, fog.js, sim/zone.js, the rotary sims
(rb, rotor, waspfm), seamotion, the ground war (groundwar, groundsim, marine), the wheeled sims (vehiclefm,
wheeledenv, tyre) and main.js's terrain height. Other files can switch the same way (the import and a rename).

## 2026-10-28 - The fish sim
**Finding** `stepSchool` was the top JS function in the deck and fish views (2-4 ms a frame, 2.5-6.6 MB a frame).
**Cause** (1) the sea-bed cache was a Map keyed by `i * 1048576 + j`, past the small-integer range at game
coordinates, so every lookup boxed a heap number; (2) its rare branches (a fish in the air, a stunned one, a leap)
deoptimised the whole 300-line loop on first use: ~20 re-optimisations in a 30 s run, the loop boxing every double in
between (sealife2.md's OPEN suggestion); (3) calls the optimiser does not inline box their double arguments.
**Action** (1) the cache is 64 x 64-cell Float64Array tiles keyed by small integers; (2) airStep / stunStep /
leapStart are their own functions; fishbench outcomes identical (78/78, every printed value the same). (3) remains:
`fearAt(x, y, z, ...)`, `bed(x, z)`, `band(...)` box ~16 bytes per double argument per fish (~350 KB a frame at 1 000
boids in node). OPEN: pass coordinates through a shared Float64Array, or split stepSchool further.

## 2026-10-28 - Smaller items fixed
- crafts' `bounds()` (jeep, truck, M151/M35 wheeled, Hornet, Tomcat, CH-46, Huey): field writes instead of
  `Object.assign(_b, { ... })` with a closure; they are asked once per collision query per substep per vehicle.
- ground.js `pushBox`: boxes farther than `r + hl + hw` rejected before the trig (exact: the corner is within hl + hw).
- (tried and reverted) ground.js fetching the carrier hollow's boxes (interiors `INT.boxes()`) once per war tick: the
  foot scene then lost two more ladder steps than the base run did on this loaded box; correctness first, so it is back
  to per call and listed for the interiors owner below.
- wheeledcraft.js: a sleeping vehicle's cab (wheel, pedals, levers, gauges: wheeled/interior.js `update`) is posed once
  when it falls asleep, not every frame (19 ms in 20 s of the village view for parked cars within 260 m).
- navalfx.js (ship wakes): scratch vectors, the newest history point updated in place, no closure or `[strip, sd]`
  pairs or `pos.set([...])` temp arrays per wake point; a ship over 900 m away rebuilds its strips every 4th frame
  (each vertex reads the live sea height, ~400 sea samples a ship a frame).
- squad.js / rotary.js / ch46unit.js / groundwar.js: an AI CH-46's stick starts as the 6-mesh stand-in and switches to
  the full Marine within 140 m of the camera (the ground war's own switch distance); before, every AI CH-46 built 13
  full Marines at spawn (~10 MB of allocation and 13 skeleton poses a frame wherever it was).
- main.js: `holeOf` a loop (it ran a `BASES.find` closure on every ground query).

## Tick budgeting by distance
Already in the game: far fish schools step coarsely (fishsim `stepCoarse`), far ground-war soldiers run the light sim
(groundsim `lite`), parked vehicles sleep, far wheeled vehicles draw a far model. Added: CH-46 stick detail by distance,
far ship wakes every 4th frame. Not done, on purpose: stepping the war's far units (the rotary flight models, the
ground battles, the AA brains) at a lower rate. tools/warsim.mjs runs every unit at far distance, so any rate change
changes every seeded war, and the war's far cost after the fixes is small (war.* 3-4 ms a frame on the loaded box in
the busiest view, ~1 ms on an idle PC). If it is wanted later: a fixed 1/15 s step for units over 2 km, with the
benches and warsim re-baselined deliberately.

## Workers (proposal, not implemented)
- **Fish boids**: the cleanest candidate. fishsim is plain data (a Float32Array per school, typed-array grids); its
  inputs are the camera, the threat list (hulls, blasts, rotor wash), the sea surface and the sea bed; its outputs are
  the instance buffers (S.write) and a short event list (splashes). A worker would own the schools and post back the
  instance arrays each frame (1 000 fish x 20 floats = 80 KB, transferable, double-buffered; one frame of latency),
  with the threats and blasts posted in. It needs the terrain height in the worker (world.js islandH + the landing hards,
  as terrainworker.js already does) and the live sea (seamotion.js is pure). Gain: the whole "sealife" line, 1.5-2 ms a
  frame at 1 000 boids on a desktop. Risk: medium (fishbench drives fishsim directly and stays valid; the in-game
  stun / eaten paths become messages). Recommended next if the fish budget goes up.
- **The war's far units**: not cleanly separable. Units are three.js objects whose brains read their own mesh chains,
  the player's craft, deck queries and hit tests cross between the player and the war every substep, and fx / sfx calls
  are interleaved. After the fixes the whole war costs ~1 ms a frame on a desktop. Not worth the split now.
- **Pathfinding**: nav paths are computed on demand and cheap (world.js `path` is 0.3 % of a war's CPU). No.

## OPEN hotspots in files this branch must not edit (for their owners)
| where | cost | suggested fix |
|---|---|---|
| interiors/shipint.js:236 `INT.boxes()` / `doorBox()` | a new 6-number array per door per call, called per collision query per substep per vehicle and walker near the carrier: 0.6-0.7 MB a frame in the deck and village views | keep one array per door and fill it in place (then the callers allocate nothing) |
| units/infantry/meshkit.js `add` / `geometry`, soldiermodel.js `marineFig` | ~10 MB of allocation per full Marine built (a BufferGeometry per part per figure) | cache part geometries per (kind, dimensions) and share them between figures (or merge per figure once) |
| world/structures.js:420 `ud.tick` | every faction structure on every island animated every frame (1.8 % of the war), plus `Math.random()` sparks while growing | skip when not visible / beyond ~1.5 km; draw the sparks' dice from an fx-only random so the war's stream is not touched |
| hueyfm.js `contact` / `groundAt` / `rotorStrike` | groundY (terrain + landing hards + every ship's deck) several times per skid point per substep | sample the ground once per skid point per frame (the code already treats it as per-frame: "groundY is sampled once per frame") |
| renderkit/nature.js:368 `rebuild` | 14 ms in one 20 s window, up to 19.7 ms in one frame (village): a hitch when the camera crosses a cell | spread the rebuild over frames (a budget per frame) |
| units/runaway/strider.js `padCorners` / `hull` / `clampToPoly` / `balanceStep` | ~250 KB a frame in a STRIDER battle: [x, z] arrays, sort, concat per step | scratch arrays; returns through an out object |

## For the perf-render branch (CPU cost in the renderer)
- scene graph: ~6 200 nodes, 98 % with `matrixAutoUpdate` on; vehicle models are deep (Tomcat 639 nodes, M60A3 570,
  Huey 436, Hornet 370, M113A2 346, CH-46 324). `scene.updateMatrixWorld` ~1 ms a frame on the loaded box (12 % of
  the war's CPU before the AA fix was the same thing in the war). Freezing static sub-parts (`matrixAutoUpdate = false`
  after build) or merging them would cut it.
- three.js `getParameters` / program-cache keys allocate 100-200 KB a frame from the shadow pass (some material's
  program state changes per object); worth a look with the shadow work.
- ui/markerlayer.js `readKeep`: `getBoundingClientRect` on the HUD boxes (2x a second) forces a layout, ~12 ms each
  on the loaded box. A ResizeObserver or reading after the HUD's own DOM writes would avoid it.

## Regression record (2026-10-28, load average 40-115 on the shared box)
| check | result |
|---|---|
| `node tools/check.mjs syntax` | 537/537, no conflict markers |
| `node tools/check.mjs bench` (all node benches) | 57/57 pass (fishbench 78/78 with every printed outcome identical to the base) |
| warsim, BALANCED vs DEFAULT, seeds 1-3, 30 min | identical records to the base (tools/simdiff.mjs), wall 149/126/111 s -> 100/82/73 s |
| smoke | PASS 5/5 |
| underwater | PASS 6/6 |
| groundwar | 9/10 twice: "the hover tank came ashore" within the scene's 60 game-second budget. A diagnostic copy of the scene shows the RW-7 following the same route at the same 15 m/s in base and branch, arriving at 395-401 s against a 401 s deadline; the base passed its one run. Edge-of-budget timing in an unseeded war, not a behaviour change. Suggest (scene owner): give `__ff` 90 s. |
| jets | base and branch both fail the same way (escort still on deck when the 90 s game-time wait ends) |
| foot | base and branch run side by side: both 8 passes, the same timed-out waits (walking and ladder steps under load) |
| xr | not runnable here: tools/node_modules has no `iwer` (dev dependency not installed) |
