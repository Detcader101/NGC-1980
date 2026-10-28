# perf-render: rendering budgets, the desktop benchmark, merges and LODs (2026-10-28)

Branch `ngc/perf-render` from `ngc/shader-library` 36eb21b. Contract and how-to: [PERF-BUDGETS.md](../PERF-BUDGETS.md).
All timings are headless SwiftShader (CPU rasteriser) at `res=0.5`: **relative only**. Draw calls and triangles are
exact. Evidence: `docs/ngc1980/evidence/perf-render/`.

## 2026-10-28 - A desktop benchmark: `?bench`

**Finding:** there were no real-GPU numbers for the desktop game. `?bench` now tours 8 seeded views through the game's
own paths, measures every frame, and repeats the tour once per RenderKit area switched off (by reloading with
`?rk=<all but that area>`) and once with `?rk=0`, giving a per-area cost table. One-click: the **NGC-1980 BENCHMARK**
launcher shortcut (`launcher/install.sh`, `?bench` on the experimental server). Report: `tools/runs/bench-<run>/`.

**Evidence:** `tools/scenes/perfbench.mjs` (headless, end to end against `tools/serve.mjs`: upload, files on disk,
every view in its craft). The area pass and reload hand-over were run with `bench=2&benchareas=post,light`.

**Notes for reading a report:**
* The rAF frame time is capped by vsync on a real screen. The **uncapped** row (10 frames, each drained with a
  1-pixel `readPixels` before and after) is what a frame costs; GPU time comes from `EXT_disjoint_timer_query_webgl2`
  where Chrome exposes it.
* Dynamic resolution is held during the run, so every view renders at the starting pixel ratio.
* The deck view gets out of the Huey with the game's own `getInOut`; the Huey needs a moment on its skids after the
  reset, so the bench retries for up to 12 s.

## 2026-10-28 - Where the draws and triangles go (the census, before this branch)

**Finding:** per frame (all passes, mean over the measured frames), headless `?bench=quick`, before (36eb21b + the
bench, `tools/runs/bench-2026-10-28_19-27-33` + `_19-34-07` for the deck) and after this branch (`bench-2026-10-28_19-36-17`):

| view | draws before → after | of which shadow | triangles (k) | uncapped ms (SwiftShader) | GPU timer ms (SwiftShader) |
|---|---|---|---|---|---|
| foot-home | 496 → 463 | 221 → 211 | 1337 → 1142 | 768 → 749 | 610 → 633 |
| huey30 (cockpit) | 905 → 778 | 241 → 213 | 1737 → 1414 | 1104 → 876 | 1049 → 871 |
| huey200 | 454 → 375 | 87 → 91 | 840 → 828 | 687 → 481 | 665 → 422 |
| jet1200 | 509 → 352 | 154 → 140 | 448 → 466 | 430 → 319 | 409 → 294 |
| deck | 654 → 736 * | 202 → 313 * | 1455 → 1380 | 1152 → 807 | 848 → 736 |
| village | 317 → 179 | 65 → 62 | 1367 → 1391 | 899 → 789 | 727 → 728 |
| forest | 115 → 99 | 61 → 50 | 1725 → 1365 | 914 → 757 | 767 → 763 |
| war | 386 → 354 | 129 → 121 | 1115 → 1108 | 533 → 585 | 503 → 568 |

\* the bench views are the game's own paths with a live war, so two runs are not the same frame (the before deck view
was a separate run). The controlled comparison is the scripted-camera A/B below (`tools/scenes/perfab.mjs`, same seed,
same camera, two page loads; before = 36eb21b + the bench from a `git archive`, after = this branch; mean of 2 frames):

| view | draws / frame before → after | shadow draws | triangles (k) | drained ms (SwiftShader) |
|---|---|---|---|---|
| on foot at the HQ | 533 → 472 (-11 %) | 250 → 231 | 1908 → 1765 | 1001 → 890 |
| home pad from 22 m | 1171 → 936 (-20 %) | 318 → 302 | 2056 → 1850 | 1033 → 1082 |
| landing hard | 793 → 538 (-32 %) | 374 → 288 | 1629 → 1441 | 661 → 677 |
| M60A3 close | 771 → 514 (-33 %) | 374 → 286 | 1614 → 1427 | 651 → 764 |
| M113A2 on deck | 975 → 713 (-27 %) | 438 → 321 | 1745 → 1356 | 1018 → 1143 |
| M151 at the motor pool | 1103 → 896 (-19 %) | 316 → 297 | 2088 → 1885 | 1178 → 1236 |
| carrier deck from 40 m | 1203 → 953 (-21 %) | 398 → 374 | 1689 → 1610 | 964 → 982 |
| home island from 200 m | 573 → 363 (-37 %) | 113 → 99 | 1007 → 948 | 746 → 542 |
| jet over the islands, 1200 m | 612 → 288 (-53 %) | 5 → 5 | 485 → 485 | 361 → 432 |

SwiftShader's drained times move ±15 % run to run with the war's state and the shared PC's load; they are not a GPU
measurement (that is what `?bench` on the real PC is for). Draws and triangles are exact. Pictures: one side-by-side
per view in `docs/ngc1980/evidence/perf-render/sbs-*.png`; nothing differs but the sea, the war's progress (an AA
site built a few seconds earlier in one run, visible at the right of `sbs-jeep.png`) and the clock.

The census (one frame's draws by model, world pass + shadow passes):

* **Terrain** (`Mesh` top level, ShaderMaterial): ~185 k triangles in 2 draws in every view. No-edit (terrain shader).
* **RENDERKIT nature**: the forest mid set is **360 k triangles in 8 draws, plus 430 k in 12 shadow draws** in every
  land view; the grass / scrub clutter **280-570 k triangles in 4 draws** on foot. These two are the bulk of the
  1.2-1.7 M triangles on foot. No-edit here (nature.js): see "For the look agents".
* **Huey cockpit**: 109 draws + 79 shadow draws in the cockpit view (each instrument / switch is its own mesh).
* **Landing hards**: 33 draws each, ~3 in view from the home base = ~100 draws for 2.5 k triangles.
* **Deck crew** (`ALBATROSS > deckcrew`): 73 k triangles in 4 instanced draws **plus 73 k in the shadow maps in every
  view on the map**, carrier in sight or not (`frustumCulled = false`).
* **Vehicles**: M60A3 223 meshes, M113A2 140, M35 123, M151 86 (incl. crew-station interiors); parked civilian cars
  40-80 draws each with shadows.
* **ALBATROSS**: 85 meshes, 38 materials; the parked jets on deck come from `albatross.js` (no-edit).
* **The world group of base structures**: 962 meshes, 166 k triangles (world/structures.js, no-edit).

**Cause:** models are built part by part (one mesh per part per material); the builders already merge per material in
places (`wheeled/modelkit.js builder`), but articulated parts, interiors and named sub-assemblies are separate.
Triangles are not the problem for units (a Hornet is 4.2 k, an M60 35 k); draw calls are.

## 2026-10-28 - Double MSAA: the canvas was multisampled under the post pipeline

**Finding:** confirmed. `main.js` created the renderer with `antialias: true`, and with RENDERKIT post on the world
and the arms are drawn into the post's own 4x MSAA targets; only the full-screen composite reached the canvas. The
canvas MSAA was 4x the backbuffer memory and a resolve per frame for nothing.

**Action:** `main.js` creates the WebGL2 context itself with `antialias: false` when the post is on (`POST_ON`), and
reports `antialias: true` to Three's WebXRManager (it reads the context attributes once in the renderer's constructor
to choose the XR layer's / target's MSAA), so VR keeps exactly the 4x MSAA it had. Post off (`?rk=0`, `?rkpost=off`):
canvas MSAA as before. `?canvasaa=1` forces it back for A/B.

**Evidence:** `perfab.mjs AQ='canvasaa=1'` (before) vs now, the same page build: draws and triangles identical (hq
474.5 / 474.5, deck 952 / 952). Drained frame (SwiftShader, load average 45-85 on the shared PC): hq 1372 → 1070 ms,
deck 1376 → 925 ms, tank 758 → 833 ms. That is mostly noise at this load; the real-GPU saving is a multisample resolve
of the canvas and 4x its colour memory, and `?bench` records `canvasMSAA` in its environment table. The pictures are
identical (`sbs-msaa-hq.png`). `xr.mjs` passes 19/19 with the change (VR entry, eyes, layers).

## 2026-10-28 - frustumCulled = false review (39 sites)

**Finding / action per site:**

| site | verdict |
|---|---|
| `units/naval/deckcrew.js` (4 InstancedMesh) | **fixed**: a sphere round the members, refitted on every crew update, and a 600 m dissolve (lod.js `detail`). Was 146 k triangles a frame everywhere on the map. The first version fitted the sphere once at creation and **the whole deck crew vanished** in the deck side-by-side (deckops.js places the directors and walkers after creation); caught by the screenshot check, fixed, re-shot (`sbs-deck.png`). |
| `units/armor/tankmodel.js` track links (3 InstancedMesh per side) | **fixed**: a fixed sphere round the belt. |
| `main.js` terrain, far terrain, sky; `renderkit/atmosphere.js` cloud floor; `renderkit/post.js`, `gamepost.js` quads; `xr/panel.js` | correct: camera-following / full-screen. (terrain is no-edit anyway) |
| `fx.js` (3), `main.js` Cloud points, `marine.js` tracers, `vehicleguns.js`, `drop.js` / `brain.js` / `delivery.js` lines, `airlift.js` rope, `groundwar.js` grenades, `navalfx.js` | correct: particles and lines with world-space positions anywhere; `count = 0` when idle draws nothing. |
| `world/ambient.js` (5: people, traffic, gulls, cattle) | correct for now: instances spread over the zone; a per-frame sphere would cost more than it saves at their triangle counts. |
| `units/naval/sealife.js` (4) | correct: underwater layers that follow the camera. |
| `units/naval/kraken.js` parked drones, `xr/runtime.js` hand joints, `foot.js` arms, `armorsight.js` post quad | correct / tiny. |
| `interiors/interiors.js` (2), `albatross.js` parked jets, `renderkit/nature.js` | no-edit: noted for the owners. `albatross.js:405` (parked aircraft InstancedMesh) should get a sphere round the deck like the deck crew. |

## 2026-10-28 - Shadow casters and the far cascade

**Finding:** `renderkit/light.js` already did most of the caster rules asked for: only lit, opaque meshes cast; casters
under 8 cm (20 cm in XR / low) cast nothing; casters under 0.6 m skip the far cascade; hairline masts and wires never
cast; the far cascade renders every 2nd frame on desktop, every 3rd in XR. What remained: the far cascade at 2 frames
is 72 Hz on a 144 Hz screen.

**Action:** the desktop far cascade is now time-based, at most 24 updates a second (every 3rd frame at 60 fps, 6th at
144 fps): `TIERS.desktop.far.hz`. The near cascade is untouched (every frame). The box is texel-snapped and its matrix
is only updated with the map, so a held map never shimmers; moving casters past 34 m update their far shadow at 24 Hz.

**Evidence:** shadow draws per frame (mean) in the bench: huey30 241 → 213, jet1200 154 → 140, forest 61 → 50 (with
the merges and culls in the same comparison). Headless runs at 1-3 fps, where the cap changes nothing (every frame is
over 42 ms), so the saving only shows on a real screen: at 60 fps the far map renders 20 times a second instead of 30.

**Static shadow caching:** not done. The far map holds moving casters over 0.6 m (vehicles, aircraft) and the box
follows the camera, so a cached static layer would need a second map and a composite pass; the 24 Hz cap gets most of
the saving without either. Worth revisiting if the far pass shows up in a real-GPU report.

## 2026-10-28 - Post: already half resolution

**Finding:** `gamepost.js` already runs AO at half resolution (plus 2 bilateral blur passes there) and bloom from a
half-resolution threshold down a 1/2-1/32 mip chain; only the composite is full resolution. Nothing to change. The
per-area table of `?bench` gives the post's real GPU cost.

## 2026-10-28 - LOD framework, budgets, static-part merge

**Finding / action:** see [PERF-BUDGETS.md](../PERF-BUDGETS.md) for the design. Results:

Draws per model at the merge (all of each model's meshes; the watchdog later splits out parts that move):

| model | draws before → after merge | notes |
|---|---|---|
| landing hard (x17) | 33 → 6 | all static |
| M60A3 | 178 → 61 | 42 parts (road-wheel arms, hubs) split back out on first movement |
| M113A2 | 109 → 40 | 36 split back out (running gear) |
| M35 | 117 → 85 | 17 split (sprung body parts) |
| M151 | 73 → 64 | 4 split (interior controls) |
| Tomcat (player) | 135 → 108 measured, **then taken out**: ngc/look-tomcat owns `tomcatplay.js` now; it applies `mergeUnit` itself to the rebuilt model | |
| Hornet (player) | 85 → 76 | most draws are decals / distinct materials |
| CH-46 | 91 → 89 | already one mesh per material per sub-assembly |
| RUNAWAY wasp | 67 → 60 | |
| deck crew | 4 instanced draws everywhere → only when the carrier is in view, gone past 600 m | 146 k triangles a frame elsewhere |

* `tools/scenes/perflod.mjs`: the two LOD levels' screen doors cover the box together in the band (462 red + 114
  blue of 576 pixels, 0 holes at the 60 m switch), only LOD0 at 40 m, only LOD1 at 90 m.
* `tools/scenes/perfbudget.mjs`: every model inside its LOD0 budget; the far levels are reported as "LOD missing" for
  the legacy models (none has a far level except the wheeled vehicles' baked far mesh).
* Merging stops at materials: most of these models are already one mesh per material per sub-assembly, so the
  remaining draws are distinct materials (decals with their own textures, lamps, glass) and handles. Fewer draws from
  here means fewer materials (vertex colours / a small atlas per model) or LODs, which is the look agents' job.
* The watchdog was needed: tank road-wheel arms, the M35's sprung body, the M151's interior controls are moved by
  code through unnamed nodes that no API object exposes. 16-42 parts per tank type are split back out the first time
  they move and remembered for the type.

## 2026-10-28 - Impostors and instancing: reviewed, not built (OPEN)

**Finding:** from the census, the same mesh drawn many times without instancing: the landing hards' posts and panels
(now merged), the parked civilian cars (each a full model of 40-80 draws; the traffic is already instanced from a
baked mesh in `world/ambient.js`), the base structures' 962 meshes (sandbag walls, HESCO, fence posts: structures.js,
no-edit), the M35 / M151 wheels (6 + 4 wheels x tyre + rim, moving: instancing would need per-instance spin). Trees
are already instanced (nature.js) and their far set is a cheap mesh, so tree impostors would mainly save the far
set's triangles (not measured as a cost yet).

**Action:** OPEN. Suggested order once a real-GPU report is in: (1) parked civilian cars -> the baked one-draw model
(`wheeledbake.js`) unless the player is within ~40 m (it already exists for traffic); (2) structures: instancing of
repeated fortification pieces in the buildings rewrite; (3) impostor cards for far buildings / trees past ~1 km
(an `createLOD` level whose object is a camera-facing quad with a baked texture).

## 2026-10-28 - perf-cpu's findings, acted on here

* **Static parts stop recomposing their matrices:** merged-out parts get `matrixAutoUpdate = false`. Their world
  matrix still follows the parent, so `getWorldPosition` on a part stays right. The watchdog now compares
  position / quaternion / scale / visibility of each part and every node up to its frame (plus the matrix of nodes
  whose matrix code sets directly) instead of world matrices. That drops the per-frame `updateMatrixWorld(true)` it
  did before. In the opening scene, 735 nodes are frozen (M60A3 98, M113A2 46, M35 26, Hornet 16 ...), with 0 bad
  parts. The deep trees perf-cpu measured (Tomcat 639 nodes, Huey 436) belong to look-tomcat / look-huey:
  `mergeUnit` does this for them as soon as they call it.
* **`ui/markerlayer.js readKeep`:** the HUD boxes were read with `getBoundingClientRect` from the frame loop twice a
  second, which forced a layout whenever the HUD text had changed. Now a ResizeObserver flags size changes and the
  boxes are read in its callback, when layout is already fresh. The element list is re-queried every 2 s
  (`querySelectorAll`, no layout).
* **three.js `getParameters` allocating 100-200 KB a frame in the shadow pass: OPEN.** Not reproduced here. Leads:
  Three calls `getProgram -> getParameters` whenever a material's cached state differs from the draw's (output colour
  space, fog, environment, clipping, shadow-map type, instancing / skinning flags). Candidates in this game are:
  - materials drawn both into the canvas and into the post's sRGB `isXRRenderTarget` target in one frame (the post
    switches `outputColorSpace` to linear while it draws);
  - Three's per-material depth-material variants in `WebGLShadowMap` (`getDepthMaterial` keys by material uuid +
    side + alphaTest / clipping);
  - RENDERKIT nature's own `customDepthMaterial` per set.
  A heap-allocation profile with the post off (`?rkpost=off`) vs on, and with `?shadows=off`, splits these apart.
  Sharing one `customDepthMaterial` per instancing / skinning variant would cut the shadow variants.

## 2026-10-28 - After merging ngc/shader-library (typecheck, perf-cpu, look-people) at dbe3b1b

* **Deck crew:** look-people replaced the deck crew with one instanced person mesh per LOD (`createCrewLP`, near and
  far sets). My sphere + 600 m fade still applies to the classic crew (`?figparts`, `?rk=0` figures), not to the new
  one. **OPEN for look-people:** `deckcrew-people` / `deckcrew-people-far` are `frustumCulled = false` and catch the
  camera in `onBeforeRender`, so the far set still draws, into both shadow maps too, in every view on the map.
  Suggestion: fit a sphere round the members in `done()` (as the classic path now does) and take the camera from
  `updateLODs` / the frame instead of `onBeforeRender`, so culling does not stall the near / far split.
* **Tomcat:** ngc/look-tomcat owns `tomcatplay.js` and the Tomcat model files. The `mergeUnit` call I had there was
  taken out before any commit, so no commit of this branch touches a Tomcat file.
* **Types:** `node tools/check.mjs types` is at its baseline (608) with the perf-render modules typed. The one NEW
  entry it lists is look-people's `humanfig.js:539`, which nets out against an error the merge removed.
* **Budgets after the merge** (`perfbudget.mjs`): Huey 90 draws / 55 k tris, Hornet 115 / 4.2 k, Tomcat 152 / 49 k,
  CH-46 100 / 7.5 k, M60A3 142 / 35 k, M113A2 103 / 24.8 k, M35 97 / 26.5 k, M151 72 / 12.6 k, ALBATROSS group
  91 / 154 k (look-people's crew), landing hard 6 / 0.8 k. All are within LOD0. None has a far level except the hards
  (static) and the wheeled vehicles' baked far mesh.

## Regression (headless, load average 45-100 on the shared PC)

* `xr.mjs`: 19/19 before the merge. After the merge it is 17/19 ("sky dome follows the rendered eye", "near terrain
  window follows the world rig"). **shader-library ae0cacc fails the same two without this branch**, so they came in
  with the merged branches. **OPEN for the orchestrator.**
* PASS: `smoke.json`, `smoke.json ?rk=0`, `perflod.mjs` 4/4, `perfbudget.mjs`, `perfbench.mjs`
  (`?bench=quick`, all 8 views in their craft, report on disk), `mergecheck` (no merged part moved, hid or swapped
  material) inside `armorgame` and `wheeledgame`.
* **Same failures on the base build under the same load** (they are timeouts, not regressions):
  - `armorgame` fails the same 7 waypoint / delivery expects on 36eb21b;
  - `jet.mjs` fails the same 4 catapult / climb expects on ae0cacc;
  - `wheeledgame` is 17/28 on ae0cacc and 16/28 here, plus the merge expect, which passes. The same village / ford /
    commandeer / deck / M35 timeouts fail in both. The one extra here is "keyboard steering narrowed at speed", which
    depends on the speed reached in a fixed wall time. No merged part moved over the whole drive.
  - `worldvisibility` 17/18: the 2000 m flight wait times out, and does the same on ae0cacc (17/18).
  - `underwater`: its frame-interval benchmark crashed once at load 85 ("111/120 rendered intervals"; ae0cacc's run
    also ended with a page error). On the merged branch at load 70 it **passes 6/6**.
  - `groundwar` 9/10: "the hover tank came ashore and joined the fight" fails, identically on ae0cacc (9/10).
  - Rerun all of these when the PC is quiet.
* `depthsky.mjs` 14/14 PASS. `underwater.mjs` 6/6 PASS (see above).
* The `?bench` area pass now runs end to end: `perfbench.mjs` with `bench=2&benchareas=post,light` and two views is
  4/4 (three reloads, `tools/runs/bench-2026-10-28_23-36-13`). That first per-area table (SwiftShader, relative only):

  | area off | foot-home: GPU ms / draws / triangles it costs | huey200 |
  |---|---|---|
  | light (sun shadows) | 173 ms of 917 / +159 draws / +672 k tris (all shadow passes) | 183 ms / +68 / +167 k |
  | post (AO, bloom, grade) | 18 ms / ±(the shadow cadence) / - | 122 ms / - / - |
  | everything (`?rk=0`) | 522 ms / +185 / +1166 k | 447 ms / +77 / +411 k |

  So on foot the sun shadows are the largest single RenderKit cost in draws and triangles, mostly the forest's mid set
  in the far cascade (the census above). The real-GPU split is what Jay Jay's `?bench` run will give.

## For the look agents (the orchestrator passes this on)

* **look-huey**: the Huey is 90 draws today with the cockpit (109 + 79 shadow draws in the cockpit view in the
  census). Build LOD0 / LOD1 / LOD2 and wrap them with `createLOD`; show the cockpit only when seated; run
  `mergeUnit(group, [api, cockpit])` on the result; switch `huey` to `enforce: ALL` in `perfbudget.mjs`.
* **look-people**: per-figure LODs with `createLOD`, crowds instanced per LOD; deck crew already fade by 600 m.
* **look-terrain / nature (nature.js)**: forest mid set 360 k triangles + 430 k shadow triangles per frame; clutter
  280-570 k triangles on foot. Suggest: mid trees cast into the near cascade only (or a 1-draw billboard caster), and a
  distance thinning of clutter in the vertex shader.
* **look-buildings (structures.js, models.js, arch.js, interiors)**: the base structures group is 962 meshes; run
  `mergeUnit` on each building after its rewrite (doors as handles), LOD1 = today's boxes, LOD2 an impostor card.
* **albatross.js**: give the parked-aircraft InstancedMesh (`albatross.js:405`) a bounding sphere round the deck;
  `mergeUnit(g, [api])` on the carrier once the island rewrite lands.
* **The landing hard's sign board reads mirrored** ("DRAH GNIDNAL") from the boat side: `lcm8.js buildHardMesh` sets
  `board.rotation.y = h.yaw` facing down the hard, so the text faces up the hard. OPEN, not touched (a look issue).
* **The wheeled vehicles' near/far swap at 60 m is a pop** (`motorpool.js` toggles the baked far mesh). `rangeView`
  from lod.js on both models' materials with the same switch distance would make it a cross-fade.
