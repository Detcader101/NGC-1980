# NGC-1980 render budgets and the performance kit

Branch `ngc/perf-render`. The game is moving to realistic models (Arma Reforger / DCS bar) and stays a browser game at a
high frame rate. This page is the contract every new model is held to, the tools that measure it, and how to run the
benchmark on the real PC. Findings and before/after numbers: [findings/perf-render.md](findings/perf-render.md).

## Run the benchmark (Jay Jay, on the real PC)

1. Desktop shortcut **NGC-1980 BENCHMARK** (re-run `launcher/install.sh` once to create it), or open
   `http://127.0.0.1:8766/?bench` in the browser you play in.
2. Leave mouse and keyboard alone. The game starts itself, tours 8 seeded views, then reloads itself once per RenderKit
   area with that area off and once with `?rk=0` (about 12-15 minutes). Esc stops it and saves what it has.
3. The report is saved to `tools/runs/bench-<date>/report.html` (+ `report.json`) in the experimental checkout; the
   page also offers **SAVE REPORT** / **OPEN REPORT**. Send the report.html.

Variants: `?bench=quick` (one pass with everything on, about 2 minutes), `?bench=10` (10 measured seconds per view),
`&benchareas=post,light` (only those areas in the per-area pass), `&benchviews=foot-home,huey30`, `&seed=N`.

The views: on foot at the home base HQ (the user's view), Huey cockpit at 30 m, Huey chase camera at 200 m, Hornet
cockpit at 1200 m, on foot on the carrier deck, on foot in a village street, on foot at a forest edge, Huey over the
busiest fight. Per view the report gives frame time (vsync-capped), the **uncapped frame** (10 frames drained with a
1-pixel readback before and after: what one frame costs with nothing overlapping, the number to compare), GPU time
(EXT_disjoint_timer_query_webgl2 where the browser has it), CPU sim / prep / render submit, draw calls and triangles for
the whole frame (shadow maps, world, post, arms), the shadow passes alone, programs, textures, heap, long tasks, a
picture, the **who-draws census** (one frame's draws and triangles by model) and the **cost per RenderKit area**
(all on minus that area off). Dynamic resolution is held at the starting ratio during the run.

Headless (SwiftShader: relative numbers only): `CHROME_PATH=... node tools/snap.mjs tools/scenes/perfbench.mjs`
(`BENCH_Q='bench=quick'`, `BENCH_VIEWS=...`, `BENCH_EXTRA='merge=0'`).

## Frame budgets (desktop high tier, 1440p, 60-144 Hz)

| | desktop | XR (Quest 3 via PC, both eyes) |
|---|---|---|
| draw calls per frame, all passes | **1500** (world ~900, shadows ~500, post ~20) | **900** (one shadow update shared by both eyes) |
| triangles per frame, all passes | **4 M** | **2 M** |
| programs (shader variants) | 150 | 150 |
| uncapped frame on an RTX-class GPU | 6.9 ms (144 Hz) | 8.3 ms per XR frame (120 Hz) / 11.1 ms (90 Hz) |
| CPU (sim + prep + submit) | 6 ms | 5 ms |

Current (headless, the 8 views, after this branch): 200-950 draws and 0.4-1.7 M triangles per frame; see the findings.

## Per-model budgets (one instance, main pass)

`tools/scenes/perfbudget.mjs` measures one live instance of each model at **LOD0** (near), **200 m** and **800 m**,
switching levels exactly as `renderkit/lod.js` would, and fails when a model is over. Shadow passes add up to about the
same again for casters (small parts skip the far cascade). Interiors and cockpits count with the model.

| category | LOD0 draws / tris | 200 m | 800 m | notes |
|---|---|---|---|---|
| player helicopter (Huey: exterior + DCS-level cockpit) | 260 / 250 k | 120 / 80 k | 40 / 20 k | cockpit only while seated (it is the bulk) |
| jet (Hornet, Tomcat: exterior + cockpit) | 160-200 / 200 k | 110-130 / 60 k | 40 / 15 k | |
| transport / AI helicopter (CH-46, MV-22) | 160 / 150 k | 100 / 50 k | 40 / 15 k | |
| RUNAWAY drone / walker / hovertank | 90 / 60 k | 70 / 30 k | 30 / 10 k | |
| tank (M60A3, with crew stations) | 160 / 120 k | 80 / 60 k | 30 / 15 k | interior hidden outside |
| APC (M113A2) | 120 / 80 k | 60 / 40 k | 25 / 10 k | |
| truck (M35) / jeep (M151) / civilian car | 110 / 60 k, 80 / 40 k | 80 / 40 k, 60 / 25 k | 30 / 10 k, 25 / 8 k | the game's baked 1-draw far model past 60 m |
| carrier (ALBATROSS, whole group incl. parked jets, deck crew) | 420 / 700 k | 320 / 450 k | 200 / 250 k | |
| infantry figure (look-people) | 8 / 15 k | 4 / 4 k | 1 / 600 | crowds instanced; LOD2 = one draw |
| building (look-buildings) | 12 / 20 k | 6 / 6 k | 2 / 1 k | instanced where repeated; impostor past 1 km |
| tree (instanced, per species) | 3 k tris | 600 | 60 (card) | nature.js: detail / mid / far sets |
| landing hard (static, merged) | 8 / 4 k | 8 / 4 k | 8 / 4 k | 33 draws before the merge, 6 now |

Legacy models are judged at LOD0 now (`enforce: E0` in the scene) and their missing far levels are listed as
"LOD missing". A model rebuilt by a look workstream switches to `enforce: ALL` when it lands with its LODs.

## The kit

### `renderkit/lod.js`: levels of detail without popping
- `createLOD(root, [{ object: lod0, far: 120 }, { object: lod1, far: 600 }, { object: lod2 }])`: 2-4 authored levels
  under one root. Level *i* draws from the previous level's `far` to its own.
- `detail(mesh, far)`: one mesh that dissolves out by `far` metres (small parts, interiors seen through windows).
- Hand-over: a screen-door cross-fade over +-12 % of each switch distance, decided per fragment from its distance to
  the camera (the same technique as `world/visibility.js`'s chunk fades, with a decorrelated mask so the two compose).
  The outgoing and incoming levels draw complementary pixels: no hole, no double draw, no sorting, no hysteresis to
  tune; standing still in the band shows a stable mix. `tools/scenes/perflod.mjs` checks the complement in a real frame.
- CPU: whole levels go on and off by bounding sphere against the band (layer mask 0 when off, so game code's
  `.visible` stays its own). `updateLODs(camera)` runs once a frame in `main.js`.
- Tiers: `LOD.setBias(b)` scales every distance (XR uses 0.7: the eye buffer is lower resolution); `?lodbias=N` forces it.
- Materials: each level's materials are drawn through prototype views (`Object.create` of the original: colour, opacity,
  uniforms and live changes read through; only the program differs), one per (material, range), shared by every
  instance of the model: a few programs per model type, not per instance.

### `renderkit/merge.js`: a vehicle's static parts in a few draws
- `mergeUnit(root, [api, interior, stations...], { name })`: bakes every non-moving part into one draw per material per
  rigid frame. Frames: every handle the model's API objects hold (other code moves, hides or recolours them), every
  named group, every mover name (rotor, wheel, turret, door, gauge, needle, lamp, seat ...). Handles that are meshes are
  never merged themselves (switch clicks, material swaps). Originals stay in place (layer mask 0): names, anchors,
  damage hooks and materials all keep working, and charring / thermal-sight material swaps reach the merged draw.
- Size classes: parts under 12 cm merge into their own draw that dissolves out by 170 m (a 24 cm part is ~1.4 px at
  1080p there).
- Object-space detail (RenderKit panel lines, camouflage, mottle) reads the part's own coordinates from an `rkOP0`
  attribute, so the pattern does not move when parts are merged.
- The watchdog (`watchMerges`, every frame for units within 600 m): a merged part that moves, hides or changes material
  is put back on its own the same frame, the rest of its draw is re-baked without it, and the part is remembered for the
  model type so the next instance merges without it. `rec.check()` / `tools/scenes/mergecheck.mjs` assert none are left.
- `?merge=0` turns all merging off (A/B).

### Measuring
- `?bench` (above). `tools/scenes/perfab.mjs`: the same scripted views in two page loads (`AQ` / `BQ` queries), with
  screenshots for side-by-sides, whole-frame draws / triangles / shadow draws and a per-model diff of the draws.
- `tools/scenes/perfbudget.mjs`: the per-model table above.

## How the look workstreams use this

The recipe, for any rebuilt model (the Tomcat as the example):

```js
import { mergeUnit } from './renderkit/merge.js';          // (path relative to the file)
import { createLOD, detail } from './renderkit/lod.js';

const model = buildTomcatModel(1, { modex: 200 }), cockpit = buildTomcatCockpit();
model.group.add(cockpit.group); scene.add(model.group);
// 1. levels: LOD0 = the full model, LOD1 a simpler exterior, LOD2 a one-draw silhouette (all under model.group)
createLOD(model.group, [{ object: model.lod0, far: 150 }, { object: model.lod1, far: 700 }, { object: model.lod2 }]);
// 2. small parts that should go early (antennas, probes, lamps seen only near): detail(mesh, metres)
detail(model.parts.pitotProbe, 120);
// 3. after every handle is built (and after any traverse that tags userData.heat / collects meshes by name):
//    pass every API object other code holds, plus any array of meshes it collected (crew meshes hidden in the cockpit)
mergeUnit(model.group, [model, cockpit, crewMeshes], { name: 'tomcat' });
```

`mergeUnit` also freezes the merged parts (`matrixAutoUpdate = false`). perf-cpu measured 98 % of the scene's ~6,200
nodes recomposing their matrices every frame (Tomcat 639 nodes, M60A3 570, Huey 436). Keep a model's tree shallow:
no empty wrapper groups. For static groups that are not merged (a building's frame, a parked prop), call
`updateMatrix()` once and set `matrixAutoUpdate = false` after placing them.

Then add the model to `BUDGETS` in `tools/scenes/perfbudget.mjs` with `enforce: ALL`, run `perfbudget.mjs`, and run
the unit's scenes through `SCENE=<scene>.mjs node tools/snap.mjs tools/scenes/mergecheck.mjs`. That fails if a merged
part moved, hid or changed material. Moving parts that no API object exposes are caught by the watchdog at run time,
but name them or expose them so they never merge. Check the look before and after with `tools/scenes/perfab.mjs`
(`AQ='merge=0'`) and `tools/sidebyside.mjs`.

- **look-huey**: build LOD0 (exterior + cockpit), LOD1 (exterior only, cockpit removed, ~1/3 the triangles, rotor
  hub simplified) and LOD2 (silhouette, one draw, rotor disc). Wrap them with `createLOD(heli.group, ...)` at 120 m /
  600 m. Cockpit parts only while the player is seated (they are 109 of the Huey's draws today and also cast 79 shadow
  draws in the cockpit view). Call `mergeUnit` on the result with the model API. Then set `huey: { enforce: ALL }`.
- **look-people**: per-figure LOD0 / LOD1 / LOD2 with `createLOD`; crowds as InstancedMesh per LOD (one draw per LOD
  per crowd). The deck crew already fade out by 600 m with `detail()` and are culled by a fixed bounding sphere.
- **look-terrain / nature**: the grass and scrub clutter is 280-570 k triangles in 4 draws in the on-foot views and
  the forest mid set 360 k triangles + 430 k in the shadow maps; give the mid trees a cheaper shadow caster (or none
  past the near cascade) and thin the clutter by distance in the vertex shader.
- **look-buildings**: LOD0 detailed facade, LOD1 the box with painted windows (what exists now), LOD2 an impostor card
  past ~1 km. Repeated houses as InstancedMesh. The base structures group has ~960 meshes: merge static parts per
  material (`mergeUnit`) once the rewrite lands; doors that swing are handles.
