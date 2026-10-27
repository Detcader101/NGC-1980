# World visibility and access — 2026-10-26

## Natural sea life was missing from ordinary flying views

**Finding:** The default-medium flight probe at 25/60/120/220 m showed almost no readable sea life. At 220 m there
were zero local schools. The earlier sea-life screenshots used close-up fixtures and did not establish this case.
**Cause:** Local spawning stopped above 160 m and centred on the camera rather than the sea ahead. Individual
fish become smaller than a pixel, while surface cues required rare feeding behaviour.
**Action:** Populate the visible sea, retain bounded aerial populations and render live shoals as an aggregate
surface cue. Preserve individual bodies, reactions, underwater views and the off/low/medium/high preference.
**Evidence:** `tools/runs/visibility-before` records the failure. The final natural-flight scene passed 10/10 with no page/console
errors: at 25/80/220 m, sea life changed 4,134 / 767 / 391 pixels of a 768×432 render in same-frame on/off
comparisons. There were 18 naturally spawned schools in each view; at 220 m individual bodies were culled but the
shoal cues remained. Off changed zero pixels. [80 m screenshot](../evidence/visibility-2026-10-26/fish-80m.png);
[25 m](../evidence/visibility-2026-10-26/fish-25m.png); [220 m](../evidence/visibility-2026-10-26/fish-220m.png).
`fishbench.mjs` passed 78/78, including moving-camera samples at 25–400 m across three seeds.

## Research was hard to discover

**Finding:** Research existed behind Shift+backslash or T on the command board. The pause menu had no entry;
the command board did not handle the UK `IntlBackslash` key consistently.
**Action:** Visible HUD/board buttons, a pause-menu entry, consistent keyboard handling, and a scrollable pause menu.
**Evidence:** The final visibility scene opens research through all three buttons. `techtree.mjs` passed 26/26
(default gates, purchases/cancel, AI research and debug-unlocked mode), with no page/console errors.
[Research screenshot](../evidence/visibility-2026-10-26/tech-tree.png).

## Scenery changed abruptly outside the control zone

**Finding:** Forests were replaced wholesale with each terrain-window bake, with a row-major population cap.
Town LOD switched at chunk boundaries. Terrain and built-in materials used different fog-distance metrics.
**Action:** Stable forest tiles, near/far silhouettes blended per pixel, prefetch beyond the haze, and arrival fades.
Share radial distance haze inside/outside the zone, blend terrain resolutions and soften the strategic-fog border.
**Evidence:** `worldvisibility.mjs` passed 17/17 with no page/console errors. Town views at 680/520/360 m show
continuous haze and both LODs coexist in the blend band. Trees retained their counts across a 900 m height-window
move; its temporal blend was observed. A scripted 2 km / 100 m/s camera flight peaked at 98 resident chunks and
2 pending requests. [Town approach](../evidence/visibility-2026-10-26/town-520m.png);
[after 2 km](../evidence/visibility-2026-10-26/flight-2km.png).

Uncontended SwiftShader measurements at 1280×720, render scale 0.5: frame medians 116.6–166.6 ms and 95th
percentiles 216.6–333.4 ms; world-update CPU 0.151–0.233 ms; 172–236 draw calls and 410,419–551,880 submitted
triangles. These are software-renderer timings, not a GPU performance claim.
[Raw measurements](../evidence/visibility-2026-10-26/streaming-benchmark.json).

## Larger and more varied islands

**Action:** Expand the control zone from 1.28 to 2.56 km across. Retain the 17 objectives and reuse the geology,
beaches, cliffs and valley generator from `ngc/terrain`, with varied island sizes and wider spacing. Keep the
existing logistics interfaces and landing hards. Update fleet starts and the spectator/headless map dimensions.
**Evidence:** `visibilitybench.mjs` passed 11/11, including all 17 level dry pads and landing hards, varied coasts and safe
carrier routes. The 8-war expanded-map batch completed 360 simulated minutes without numerical anomalies;
[SIMREPORT](../SIMREPORT.md) distinguishes captures/research from time-limit points leads. The rest of the old terrain branch,
including its full surface-friction integration, is not implicitly merged.

## Wider-map gameplay follow-through

**Finding:** Fixed-distance ship-route samples could skip a blocked grid corner. The old transport test timed out
at 480 seconds before the wider-map round trip could finish. A sling-delivery screenshot showed fuel exhaustion
and a damaged jeep before release.
**Action:** Traverse every touched navigation cell; retain the real transport/deployment/recovery assertions with
a 660-second limit; halve Huey game fuel acceleration from 50× to 25× for the longer routes.
**Evidence:** All 46 Node regression programs and 435 syntax checks passed. The real transport completes boarding,
departure, unloading, enemy capture, return and stowage. The final sling browser rerun passed 14/14: 23.3% fuel
remained from a 50% starting tank, the jeep was delivered intact and controlled, and six Marines joined ground combat.

**Finding:** Bigger islands put high ground under old jet patterns/finals.
**Action:** Adapt terrain-aware pattern selection, CAP height, final rejection and wave-off protection from
`ngc/commander2`, preserving current catapult/deck hooks. A shared recovery-course check lets both browser and CPU
air crews request a navigable turn from the carrier.
**Evidence:** `commanderbench.mjs` passes 39/39. Ten Hornet/Tomcat trials near real islands all recovered with no
crash; minimum observed clearance over land was 28 m. The fixture carrier follows a verified deep-water lane for
its whole run, avoiding an impossible synthetic landing on a ship sailing through an island.

**Test finding:** The Sea Knight browser pilot could finish landing between polls for the temporary `down` state.
The scene now accepts either `down` or `landed` before checking actual touchdown, gear, passenger transfer and
ground-war membership. The earlier stalled run was closed and retained; it is excluded from the final pass totals.
The corrected run passed 17/17, landing at FORGE with a 2.82 m/s maximum sink and intact gear, then handing all 13
Marines to ground combat.

## Remaining ambitions

**OPEN:** Hardware GPU profiling and unscripted endurance; broader contested recovery and airdrop-zone coverage;
shared natural-surface friction and beach delivery; larger crew/roster and collision/parity integration. All eight
45-minute CPU wars timed out and no RUNAWAY built a researched SHRIKE, so campaign pacing and production choices
still need work. [PLAN](../PLAN.md) and [SIMREPORT](../SIMREPORT.md) retain those limits.
