# Ground-unit identity and benchmark pass

This pass covers thirteen active ground types with production simulation/model code in isolated rendered dev fixtures. It does not claim that a unit fixture is a full mission, a historical simulator certification or a headset performance measurement. No DCS assets or code were copied. Weapons remain the existing abstract game balance.

## Changes

**M35A2:** replaced the six-single-tyre appearance with two front singles and four rear dual pairs: ten running tyres, plus the existing spare. All tyres now use the standard 9.00-20 designation. The mesh and physics share the inferred 0.508 m unloaded radius and 0.229 m section width. Six hubs/suspension stations remain: a rear pair shares steering, rotation, load and damage state. Its aggregate stiffness, rated load, inertia and contact width represent two tyres; there is no new axle or doubled tractive force. Separate inner/outer punctures and side-by-side terrain sampling remain future work.

**Captured MBTs:** fixed the transition from distant lightweight motion to full tracked physics while reversing. It used to clamp a negative speed to zero and select forward range. Both signs of velocity now survive the transition, along with hull position and track travel. The adapter reports restored velocity immediately, before the next physics tick.

**RUNAWAY lineup:** the previously unpaused display scenario had units without squad controllers, causing its live update to dereference missing AI state. Every display unit now has an idle controller, allowing balancing, suspension and lift to keep running. The dev host accepts `&track` to inject the same tracked adapter used by the active ground war. Its default lightweight preview remains available.

**Marine prone crawl:** corrected the plane of the alternating knee pulls. With the pelvis already rotated onto its belly, the old thigh-X bend pushed a knee 0.164 m below flat ground and shin geometry 0.227 m below it. The bent shin then brought the boot above ground, making it appear detached. Prone knee pulls now move outward/forward along the ground plane, with adjusted toe pitch. Standing, crouched and weapon poses are unchanged. This is a flat-ground pose correction, not new terrain-following foot IK.

**Benchmark bridges:** vehicle, tank, infantry and runaway dev hosts expose `window.__BENCH` with the actual renderer and live/paused state. They do not invent simulation/preparation/render CPU timings. Each case makes unit-specific checks before rendered-frame sampling, a screenshot and optional six-second clip; capture follows timing.

## Active roster and coverage

| Case | Role exercised | Rendering/mechanics scope |
| --- | --- | --- |
| `m151` | M151A2 utility vehicle; part-time front drive, no invented low range | Production wheel physics/model |
| `m35` | M35A2 cargo/troop transport; ten tyres, cargo mass, benches | Production wheel physics/model |
| `landrover` | Driveable Series III 109 utility; selectable low range | Production civilian model, wheel physics |
| `hilux` | Driveable RN37 pickup; selectable low range | Production civilian model, wheel physics |
| `beetle` | Driveable rear-engine air-cooled road car | Production civilian model, wheel physics |
| `lada` | Driveable rear-wheel-drive liquid-cooled saloon | Production civilian model, wheel physics |
| `m60` | M60A3 cross-drive neutral pivot, opposing track travel | Production track physics/model |
| `m113` | M113A2 squad mass, rear ramp, trim vane and bilge pumps | Production track physics/model and controls |
| `marine` | Period rifleman; timed prone transition, lower and slower crawl | Production soldier movement and skeleton |
| `rw1` | Fictional STRIDER balancing and planted biped gait | Production machine/skeleton |
| `rw7` | Fictional hover vehicle; fan-supported gap and lateral inertia | Production hover physics/model |
| `m1a2` | Captured Abrams; seven roadwheels per side, tracked drive | Live-game tracked adapter in isolated dev terrain |
| `t90m` | Captured T-90M; six roadwheels per side, tracked drive | Live-game tracked adapter in isolated dev terrain |

The four civilian models are registered, driveable unit types, not just decorative traffic. Paratroopers reuse infantry after deployment; aircraft/drop integration remains in the C-130 deployment coverage. LCM-8 and defence units belong to the naval/defence pass. T-72A is not an active separate player vehicle in this roster.

The active ground game injects `createTrackDrive` in `groundwar/groundsim.js`; the standalone runaway sandbox originally used `createPlaceholderDrive`. Those paths are distinct. Full captured-MBT dynamics use inferred parameter sets derived from the shared track model; the test confirms those modules run and preserve state, not that every real transmission or suspension characteristic is reproduced. In particular, the T-90 steering/automatic gearbox approximation and variant-level dimensions remain explicitly limited.

## Factual sources

- [US Army TM 55-2320-209-15-1, Transportability Guidance, section 2-2](https://xm381.com/TMs_Files/TM%2055-2320-209-15-1.pdf), primary Army manual hosted by a public archive: M35-series cargo/troop role, tandem rear axle and dual rear tyres. This is the basis for the wheel-layout correction, not a source for tyre force curves.
- [Army in Europe Regulation 750-1 (30 September 2013), table K-1](https://media.defense.gov/2020/Sep/28/2002506497/-1/-1/0/AER750-1.PDF): lists the M35A2 9.00-20 tyre size and distinguishes the later M35A3 fitment. This corroborates designation only; it is a later maintenance table.
- [US Army PS Magazine, February 2004, issue 615, M35A2 Tire NSN](https://www.nsndepot.com/Library/PSMAG/PS_615?PageNumber=32), primary Army publication mirrored publicly: corroborates the M35A2's 9.00 x 20 tyre.

**Confirmed in these sources:** M35A2 dual rear layout and tyre designation. **Inferred game values:** actual tyre envelope, tyre force coefficients, dual aggregate response and station spacing. Other pre-existing unit specifications were not upgraded from their existing source/confidence tags in this pass. The fictional units are checked against intended game behavior.

## Validation

- `node tools/unit-groundbench.mjs`: **15 passed, 0 failed** — one role/handling regression for each of 13 types, plus prone geometry and the live lineup. It includes drive/steer/brake checks for all six wheeled types, cargo acceleration, M60 neutral pivot, M113 ramp-gated troop dismount and removed mass, prone/load effects, biped reach/steps, hover drift, full tracked MBT drive and reverse LOD continuity. The production Marine skeleton and leg meshes clear flat ground through 72 crawl phases while retaining knee movement and constant connected bone lengths: lowest joint 0.118 m, lowest visible leg/boot vertex 0.000645 m.
- `node tools/wheeledbench.mjs --only m35`: **23 passed, 0 failed** with corrected tyres. Observed empty top speed 85.9 km/h inside the existing 90 km/h tolerance; 0–60 km/h 26.5 seconds. Loaded grade, rear-bogie contact, fording and bump-course checks pass. These are Node simulation results, not rendered frame timings.
- `node --check tools/unit-cases/ground.mjs`: passed.
- Rendered cases, screenshots and clips are scheduled centrally by the integration agent to keep browsers and benchmark workloads serial. Their evidence belongs in the generated run report/devlog; no screenshot or headset validation is claimed by the Node results above.

The initial central rendered run exposed a fixture error in `rw7`: checking that all four fans were powered at one instant rejected a normal ride-control correction 0.4 seconds after spawning on sloped ground. Two fans had momentarily cut out while cushion clearance was excessive; subsequent telemetry showed recovery. The case now gives the real controller three simulated seconds to trim, then checks positive lift, clearance and sustained cushion pressure across a full second of movement. A targeted browser rerun passed 8/8 expectations across RW-7 and M35, with no page or console errors. It recorded 32 moving hover samples over 1.033 simulated seconds: minimum centre clearance 1.031 m, mean skirt gap 0.398 m and mean cushion pressure 5,966 Pa. These are diagnostic behavior observations; timing sampling was disabled for that rerun.

The M35 case also captures a low rear view after its performance sample, waiting for two renderer frames after the camera change. Visual inspection confirms distinct inner and outer tyres on both rear hubs; the original side view alone hid that distinction. This additional image accompanies the full-vehicle view rather than replacing it. The targeted evidence lives in the ground worktree at `tools/runs/ground-followup`; the final integrated run regenerates the same views and assertions.

The Marine fix was visually checked in a second targeted browser run: live prone crawl and a fixed production pose at maximum knee pull viewed from the side. Both show connected legs/boots above flat ground. That run passed 3/3 expectations with no browser errors, with timing sampling disabled; its diagnostic images are in the ground worktree at `tools/runs/marine-prone-followup`. The final integrated unit sweep regenerates the moving Marine capture.

Run an individual fixture using the integrated unit runner's case IDs above. The canonical definitions are `tools/unit-cases/ground.mjs`; use the runner documentation for current command flags. The existing standalone dev pages remain directly accessible at `dev/vehicle.html`, `dev/tank.html`, `dev/infantry.html` and `dev/runaway.html`.
