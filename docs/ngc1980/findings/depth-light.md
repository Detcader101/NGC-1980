# depth-light (ngc/depth-light): sun shadows and light balance

User report (2026-10-27): "add more depth and drag it away from this roblox low tech look ... in every aspect". Their
screenshot (first person at the home HQ, desktop GPU, 133 fps) had no shadows anywhere: no code set `castShadow`. The
only shadow in the game was a dark disc under the Huey.

## 2026-10-27 - Design: two cascades from one sun, one global chunk patch, one traversal

**Finding:** Three r170 gives each shadow-casting DirectionalLight one map. The draw distance is 250 m, so one map
fine enough for a cockpit (about 3 cm texels) cannot also cover the hills.
**Action:** `game/js/renderkit/light.js`, gated by `RK.on('light')` (new area in `adopt.js`):
- **Near cascade:** the game's `sun` itself. A box of ±34 m round the eye, a little ahead of it.
- **Far cascade:** a second DirectionalLight with intensity 0, used only for its shadow map. A box of ±175 m centred
  on the ground under the eye, further ahead, so the island under a Huey at 200 m is covered.
- **Box placement:** the boxes are placed by overriding `shadow.updateMatrices`, not by moving the light.
  `sun.position` stays a direction because `world.js` (sky / PMREM rebuild check) and the terrain `uSun` read it. Each
  box centre is snapped to whole texels in light space, so static shadows do not shimmer as the eye moves.
- **Built-in materials:** a global patch of `ShaderChunk.lights_fragment_begin` / `shadowmap_pars_fragment`. When
  exactly two directional lights cast (only this pair does), light 0 calls `rkCascadeShadow()`: it reads the near map
  inside the near box and blends to the far map over the box's outer 15 %. The far map fades out at its own edge. The
  far light's own lookup is skipped. All other setups (the viewmodel pass, dev pages) compile the stock code.
- **Terrain / sea** (`main.js` ShaderMaterial): `SUN_SHADOW_GLSL` reads the same two maps through getter uniforms (the
  maps are created on the first pass). The edit is a few clearly marked `// RENDERKIT light` lines: `rkSh` multiplies
  the sun term of both the classic and the RK_WORLD lighting, plus the pads and aprons (via `l`). Water in shadow loses
  its glitter and darkens to 80 %.
- **Updates:** `shadow.autoUpdate = false`, with `needsUpdate` set once per frame by `rkLight.update()`. Extra
  `renderer.render` calls in the same frame (the tank's sights, post) reuse the maps. The far map is refreshed every
  2nd frame (every 3rd in XR). A skipped frame keeps both its map and its matrix, so they always agree.
- **Huey blob:** the old disc under the Huey is hidden when the area is on, because the real shadow replaces it.

## 2026-10-27 - Cast / receive rules (central traversal, every 0.4 s, new objects included)

- **Receive:** every mesh with a lit material (Lambert, Phong, Standard/Physical, Toon). Basic and Shader materials
  ignore lights anyway.
- **Cast:** lit and opaque (opacity >= 0.9, depthWrite on, not additive), with bounding radius × world scale >= 0.08 m,
  and not a hairline stick (two smaller extents under 6 cm; see the artefacts entry).
- **Never cast:** Points, Lines, Sprites, Basic materials (beams, pad rings, bomb sight, markers, light pools), Shader
  materials (sky, terrain, GPU particles), the XR rig (panel, controllers, hands), and anything under
  `userData.rkShadow = 'none'`. Per-object override: `userData.rkShadow = 'none' | 'receive' | 'cast' | 'both'`.
- **Re-check:** an object is re-checked when its material reference changes (damage, fade, swaps).
- **The terrain does not cast.** Its heights come from its vertex shader, so the stock depth pass would draw a flat
  plane at y=0. The terrain's own N·L already shades the slopes facing away from the sun (about 42° up after the change below).

## 2026-10-27 - First pass looked shadow-less: tests moved the camera after the boxes were placed

**Finding:** the first A/B showed shadows on the deck but none of the trees' or buildings' shadows on the terrain.
**Evidence:** a one-off probe scene (now `rklight-calls.mjs`): the pad's ground point projected to x = -0.42 in the far map, so it
was outside the box. A debug output of `rkSh` (blue = shadow) then showed the terrain receiving correctly.
**Cause:** the scripted test cameras (rkworld pattern) move `zCam` inside `renderer.render`. That is after
`rkLight.update()` has centred the boxes on the Huey, so the boxes sat round the Huey on the carrier. In play the
camera is final before `update()` runs.
**Action:** `rkLight.follow(camera)` is split out. Test hooks call it, then set `needsUpdate`, after moving the camera
(`tools/scenes/rklight.mjs`).

## 2026-10-27 - Sun ~60 deg high and behind most views: short, hidden shadows. Lowered to ~42 deg, same azimuth

**Finding:** with the original sun (0.5, 1, 0.3), about 60° up, shadows were short and fell behind objects in most
views, so the scene looked almost unchanged.
**Action (light area only):** `BALANCE.dir` = (0.95, 1, 0.57), about 42° up, same azimuth, so the sun disc and sea
glint stay on the same side.
- `sun.position` is the one source. The terrain `uSun` now copies it (classic value unchanged with `?rk=0`).
- Sealife and the kit sky / PMREM read it already.
- The first-person arms pass (`viewmodel.js`) gets the same direction and colour through `matchOverlayLights`.
- Light values: sun 0xffe7c2 × 2.1, hemisphere sky 0xa9c4ec / ground 0x4f4a36 × 0.62.
- Terrain shader: sun term × 1.0 (was 0.75), ambient × 0.33 (was 0.4).
- Lit to shadowed on flat ground is about 3 : 1 (was about 2 : 1 on objects; there were no cast shadows).

## 2026-10-27 - Artefacts found and fixed in review

- **Dashed ring round the cave shaft:** the shaft funnel (open DoubleSide cylinder) has its rim at ground level and
  shadowed the apron in a jagged arc. Fixed: it receives only (`userData.rkShadow = 'receive'`, main.js).
- **Hairline sticks** (whip antennas, wires, rails) cast 1-px dashed lines across the sea and the apron. Fixed: meshes
  whose two smaller extents are under 6 cm do not cast.
- **Huey blob shadow:** the old disc doubled the real shadow. It is hidden when the area is on.

## 2026-10-27 - Cost: shadow-pass draw calls, and the far cascade trimmed to big casters

**Finding:** the far map (±175 m) drew everything in a 350 m square: on the carrier that is 399 extra draws (deck crew,
aircraft parts, vehicles), more than the near map.
**Evidence:** `tools/scenes/rklight-calls.mjs` census: GL draws for one world render with both maps, near only, or neither:

| view | before trim (both / near / none) | after trim (both / near / none) |
|---|---|---|
| carrier deck | 1608 / 1209 / 891 | 1369 / 1208 / 889 |
| home island from 200 m | 586 / 533 / 514 | 570 / 534 / 514 |
| at the pad, eye height | 502 / 437 / 388 | 506 / 457 / 397 |
| village from above | 619 / 423 / 369 | 480 / 425 / 370 |

**Action:** casters with a world radius under 0.6 m (people, crates, vehicle parts) draw into the near map only.
`farSkip` toggles their `castShadow` just before each map is drawn. The near map always draws first, since the shadow
lights keep scene order. In XR and the low tier, casters under 0.2 m skip the near map too.
- Per frame on the deck, desktop: about 889 + 319 near + 240 / 2 far ≈ 1330 draws (+50 %).
- Per frame on the deck, XR: fewer near draws and the far map every 3rd frame, ≈ +40 %.
- Away from the carrier the overhead is +10 to +25 %.
- The CPU cost is in draw submission. On the user's GPU (133 fps at 1080p before) the fill cost of two 2048² depth maps
  is small.

**SwiftShader world-pass time** (ms, median of 6 renders with a 1-px readback, both maps re-rendered every time = worst
case, before the trim). Light off → on (desktop tier) / on with the XR tier forced:

| view | off → on | XR tier |
|---|---|---|
| deck | 704 → 790 | 802 |
| Huey cockpit | 707 → 942 | 828 |
| home island from 200 m | 510 → 623 | 600 |
| home pad | 565 → 660 | 556 |
| village street | 422 → 452 | 402 |
| village from above | 385 → 670 | 514 |
| on foot at the HQ | 610 → 922 | 539 |
| on foot, the Huey | 467 → 684 | 607 |
| on foot, away | 408 → 441 | 450 |
| on foot, towards the sun | 532 → 641 | 611 |
| on foot, third person | 372 → 501 | 492 |

Runs: `RK=surface,world,fx,post,ui` (light off) / default / `SHADOWS=xr`, `VIEWS=deck,hueyck,home,town,foot`
`tools/scenes/rklight.mjs`. These are software-rasteriser numbers, so the two 2048² maps cost far more here than on a
GPU. Median about +22 %, worst +74 % (village from above, the most casters per pixel). Run-to-run noise on this
machine is ±20 % (rk-fx). **OPEN:** no real-GPU or Quest frame time measured. Next step: `?xrbench` in the headset, and
`?shadows=off|low|xr` to A/B on the desktop.

## 2026-10-27 - Tiers: desktop full, XR reduced, low under GPU pressure

| tier | near map | far map | near casters | when |
|---|---|---|---|---|
| desktop | 2048², ±34 m (3.3 cm texels) | 2048², ±175 m (17 cm), every 2nd frame | ≥ 0.08 m | default |
| xr | 1536², ±28 m (3.6 cm) | 1024², ±150 m (29 cm), every 3rd frame | ≥ 0.2 m | `renderer.xr.isPresenting` |
| low | 1024², ±30 m | 1024², ±150 m, every 4th frame | ≥ 0.2 m | dynamic resolution below 80 % of max |

- In XR the maps are drawn once per frame for both eyes: WebXR renders through one ArrayCamera call.
- `?shadows=off` keeps the light balance with no shadow maps. `?shadows=low|xr|desktop` forces a tier.
- **Evidence:** `tools/scenes/rklight-xr.mjs` 8/8 (IWER Quest 3 stereo). The tier switches to xr (1536 / 1024, far
  every 3rd) and back to desktop on leaving. Nothing under the VR rig casts. Cockpit and on-foot stereo shots render in
  both eyes (`evidence/depth-light/40-vr-foot-stereo-on.png`).

## 2026-10-27 - Regression checks

`node tools/check.mjs syntax` passes. `xr.mjs` 19/19. `smoke.json` 5/5 with the kit on and 5/5 with `?rk=0`. The
renderkit fixture (`tools/runs/depth-light`) is 20/20 with 0 console errors. `rklight.mjs` passes 31/31 with the light
area on and off.

**`?rk=0`** creates no lights, shadow maps or chunk patch. The terrain source gains `RKL_SUN` / `RKL_AMB` macros
defined as the old .75 / .4, and a `rkSh` that is the constant 1.0 (x × 1.0 is exact). `uSun` is a copy of the same
(.5, 1, .3). So the classic look is unchanged by construction. No pixel diff was run, because the sim is not
frame-deterministic.

## 2026-10-27 - Interiors and cockpits

**Finding:** enclosed spaces (hangar deck, island rooms, house rooms) are now in the shadow of their own roofs and
walls. Before, the sun lit them straight through the roof. They are dimmer and cooler (sky fill only) but not black.
Cockpits keep sun patches through the glass, and the frames and roof cast onto seats and panels. Instrument faces are
Basic materials, so they stay readable in shade (they read as backlit).
**Evidence:** `evidence/depth-light/50-hangar-light-off-on.jpg`, `51-flight-deck-control-light-off-on.jpg`,
`52-huey-cabin-light-off-on.jpg`, `03/04-huey-cockpit-*`, `07-jet-cockpit-*` (`tools/scenes/rklight-interiors.mjs`, interiors.mjs with
`RK=` appended).
**OPEN (suggestion for interiors / materials):** give the hangar and island rooms their own light (a few emissive
ceiling strips plus a weak PointLight, or `userData.rkShadow = 'none'` on interior shells if their old daylight look
is preferred). This branch does not change interiors.
**Note:** run alone, interiors.mjs fails "in the hall" (the house door walk) with the light area on and off. With two
browsers running in parallel, the on run also timed out on three stair climbs (wall-clock `waitFor` on a slower page);
a rerun of the on side alone was 19/21, with only "in the hall" failing (as with the light off).

## 2026-10-27 - Cloud shadows from depth-sky (orchestrator request): not wired on this branch

**Finding:** `rkCloudShade(vec3 worldPos)` (`RK_CLOUD_GLSL`, `renderkit/atmosphere.js`) is on ngc/depth-sky and was
merged after this branch was cut, so it cannot be tested here.
**Suggested integration after the merge:**
- **Terrain / sea:** one line in the RENDERKIT light hunk, `rkSh *= rkCloudShade(vW);` after `rkSh=rkSunShadow(vW,n);`
  (the uniforms are already on `terrainUni`).
- **Built-in materials:** harder. The cloud texture would have to reach every lit program.
  - The global chunk path has no per-material uniforms, and the `UniformsLib` clone copies textures.
  - Option: `onBeforeCompile` on the RK surface factories (`gamemats.js`) adding `atmo.uniforms`, and in
    `rkCascadeShadow` multiplying by `rkCloudShade(worldPos)` behind a define.
  - World position comes cheaply from `cameraPosition + transpose(mat3(viewMatrix)) * -vViewPosition`.
