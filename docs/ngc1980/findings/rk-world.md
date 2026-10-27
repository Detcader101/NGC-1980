# RenderKit world adoption (ngc/rk-world)

Branch `ngc/rk-world` from `ngc/shader-library` (7a62f55). Area `world` in `game/js/renderkit/adopt.js`: terrain, sea,
sky and `zScene.environment`. New code: `game/js/renderkit/world.js`; hooks in `game/js/main.js` marked
`// RENDERKIT world`; fixture `tools/scenes/rkworld.mjs` (`RK=0|world`, `VIEWS=...`).

## 2026-10-27 - The kit's terrain and water materials cannot replace the game's ground/sea shader

**Finding:** `createTerrainMaterial` and `createWaterMaterial` patch a `MeshStandardMaterial`. NGC-1980 draws ground
and sea with one custom `ShaderMaterial` (main.js `terrainVS`/`terrainFS`): a camera-following height-map grid with
near/far LOD morphing and window blending, the live sea displaced by the same waves the ships ride (seasurface.js),
clarity/shallows/caustics, the seabed, surf/whitecaps/hull foam, pads and shaft aprons, the fog of war, the radial haze
and the underwater view of the surface (Snell's window). The kit water is opaque, flat and changes normals only.
**Evidence:** `docs/renderkit.md` ("Water is opaque and changes normals only: no wave displacement, shoreline foam,
planar reflection, refraction or buoyancy"); main.js terrain shader.
**Cause:** different scope: the kit materials target ordinary meshes.
**Action:** ported the kit's ideas into the existing shader behind `#ifdef RK_WORLD` (defined only when
`RK.on('world')`), keeping every existing feature. Did NOT swap materials. `?rk=0` compiles the classic program
(the RK blocks are preprocessed out, no RK uniforms, no environment, classic dome).

## 2026-10-27 - What was adopted, per part

**Terrain** (createTerrainMaterial's model on the game's palette): 2D value noise with the kit's hash (half the cost of
its 3D `rkNoise`; the terrain is a height field). Macro patches at ~90 m and ~21 m everywhere, a ~4 m grain only within
170 m (no far shimmer). Grass varies lush/dark/dry (drier with altitude); rock by slope with noise-broken edges and
faint strata; snow above a noisy 440-520 m line, off steep faces; wild coasts get a noise-varied sand band with wet
sand at the waterline. Inside the zone the per-point surface types (`uSurf`) and island geology colours stay; they gain
grain, and steep grass shows the island's rock. The Zarch checker stays at half contrast (speed/height cue). Lighting
uses the DirectionalLight's colour plus a sky/ground hemisphere ambient instead of white Lambert + constant.
**Sea:** Schlick Fresnel (F0 .02) reflecting the sky that is actually drawn (the kit sky gradient), in place of a
constant pale blue at a fixed power; the kit water's optical ripple added near the eye (40-140 m fade, scaled by sea
state) on top of the live swell normal and the glitter normal. Clarity, bed, caustics, foam, glint and the underwater
branch are unchanged.
**Sky:** the dome uses the kit `createSkyMaterial` (sun direction = the DirectionalLight's), keeping the mesh XR finds.
**Environment:** `zScene.environment` = PMREM of the kit sky over a darker ground, rebuilt only on sun/weather change.
**Evidence:** `docs/ngc1980/evidence/rk-world/` (off/on pairs).

## 2026-10-27 - Kit sky gradient drew a hard band at the horizon

**Finding:** with `createSkyMaterial` as-is, the mainland and snow views showed a hard edge one pixel above the horizon,
where the hazed terrain edge (fog colour) meets the sky.
**Evidence:** `tools/runs/rkworld-on1/05-mainland.png`, `06-snow.png`; fixed in `rkworld-on2`.
**Cause:** the kit's `pow(max(ray.y,0),.45)` has infinite slope at y = 0, so the sky turns blue immediately above the
horizon; the classic dome used `smoothstep(0,.55,y)`.
**Action:** `world.js softHorizon()` rewrites that one expression in the kit material's source to
`pow(smoothstep(0,1,y),.45)` (same look above ~15 degrees) and throws if the kit's source changes. Suggest the kit
expose a horizon softness option instead.

## 2026-10-27 - Sky reflection first washed out the shallows

**Finding:** the first Schlick version (cap .85) made shallow water round islets pale sky-blue at the 26 m carrier
view, hiding the teal bed colour that marks shallows.
**Evidence:** `rkworld-on1/04-carrier.png` vs base (crop compared side by side).
**Cause:** at ~10 degrees grazing, F = .41 vs the classic .26.
**Action:** reflection weight `min(F*.7, .6)`: close to the classic weight at low angles, physically shaped. The
underwater/swimmer views are unchanged (rkw-underwater-0 / -world, both 6/6).

## 2026-10-27 - Terrain output space: the raw shader now cooperates with tone mapping and linear targets

**Finding:** the terrain shader writes display (sRGB) values with no output chunks. Any tone mapping or linear render
target (a post pipeline) would treat them as linear: terrain and sea would wash out against tone-mapped built-ins.
**Action:** `world.js linearOutput()`: on the default path (sRGB canvas, no tone mapping) the shader writes its values as
before (`RK_DISPLAY_OUT`, zero cost); otherwise Three compiles a second program that converts to linear and runs
`tonemapping_fragment` + `colorspace_fragment` like every built-in. The kit sky does the same natively.
**Evidence:** `rkworld.mjs` view `tonemap` (renderer set to ACES for one shot): terrain, sea, sky and built-ins tone map
together with no seam at the haze.

## 2026-10-27 - Weather and sun rebuild the environment, not frames

**Finding:** `createWorldSky().update(seaState)` compares sun direction/colour and a quarter-step weather value; it
rebuilt the PMREM once at load and once when the sea was set to 7 (zenith greys towards overcast for states 5-7).
**Evidence:** rkworld `envprobe-env` {rebuilds: 1, buildMs ~33-39 (SwiftShader)}, `weather-rebuilds` {rebuilds: 1}.
There is no time of day in the game (sun fixed at (.5,1,.3)), so there is no dusk view to test.

## 2026-10-27 - Contract: `zScene.environment` (for rk-surface and anyone using PBR)

- Owner: `createWorldSky` in `game/js/renderkit/world.js`, created in main.js after the sky dome. Only when
  `RK.on('world')`; with world off (`?rk=0`, or `?rk=surface` alone) `zScene.environment` is `null`, so PBR materials
  must still look acceptable with lights only (hemisphere 0.9 + sun 1.1).
- Content: a PMREM (`PMREMGenerator.fromScene`, 256 px cube-UV, HalfFloat, LINEAR) of the kit sky: the same zenith /
  horizon / sun as the dome, over a darker blue-grey ground hemisphere (0x4b5754). No terrain, ships or clouds are in it.
- Rebuilt only when the DirectionalLight's direction or colour changes, or the weather bucket changes (sea state 5-7
  greys the zenith, quarter steps). ~35 ms per rebuild on SwiftShader. Never per frame. The old target is disposed on
  rebuild, so do not cache `scene.environment` across frames: read it, or use `material.envMap = null` and let the
  scene supply it.
- Under water (`sealife.under`) it is set to `null` (the sky is hidden there); it returns on surfacing without a rebuild.
- Do not assign `zScene.environment` elsewhere; tune per material with `envMapIntensity` (the Lambert/Phong house
  materials ignore it). The hemisphere light stays on for the Lambert world, so a full-strength environment adds to it on
  PBR materials. `createWorldSky` therefore sets `zScene.environmentIntensity = 0.5` (option `intensity`); with
  NoToneMapping that keeps painted PBR close to the Lambert world while chrome/steel still show a readable sky
  (rkworld `envprobe`). rk-surface's `useSceneEnvironment()` can rely on it; tune per material with `envMapIntensity`.
- Debug: `window.__rkWorld` (`?debug`): `{ rebuilds, lastBuildMs, texture, update(seaState, underwater), dispose() }`.

## 2026-10-27 - Fit with rk-fx (01665aa): no renderer tone mapping, display-referred post

**Finding:** rk-fx keeps `renderer.toneMapping = NoToneMapping` and renders post through an sRGB XR-style target that
holds the old frame pixel for pixel. The world area never enables tone mapping; it is tuned for untonemapped output.
**Evidence/Cause:** Three passes `outputColorSpace` = the target texture's colour space for XR-style targets (sRGB), so
`linearOutput()` takes the `RK_DISPLAY_OUT` path there too: terrain and sea write the same display values as on the
canvas, and the kit sky's `colorspace_fragment` encodes to sRGB like every built-in. For a plain linear target the
fallback path converts once (and a hardware sRGB texture encodes on write), so the world stays consistent either way.
**Action:** none needed. The `tonemap` view in `rkworld.mjs` switches ACES on for one shot only as a robustness probe
of the fallback program and restores NoToneMapping immediately; it is not a recommendation.

## 2026-10-27 - Regression scenes (RenderKit world on unless noted)

**Evidence** (tools/runs/, SwiftShader, local only): smoke.json 5/5; visibility.mjs 10/10 (fish at 25/80/220 m);
worldvisibility.mjs 17/17 (town LOD band, 900 m window move, 2 km flight, zone edge, four islands: no seams);
underwater.mjs 6/6 on and with `rk=0` (fish pixels 3845 / 631: natural populations differ run to run; the
underwater branch of the shader is untouched); xr.mjs 19/19 (IWER Quest 3: stereo eyes, the kit sky dome found by
renderOrder -10 and centred on the rendered eye, terrain window follows the rig).
**OPEN (not caused by this branch):** fish.mjs "the downwash frightens the school under the Huey" fails 9/10 both with
RenderKit on and with `tz_rk=0` (control wrapper); sealife.mjs `PARTS=deck,bow` "dolphins at her bow" fails 2/4
identically on and off. Both are simulation/behaviour checks. A first full sealife run also timed out once waiting for
`craft==='foot'` (deck part); the rerun of that part passed on and off.
**Note:** the xr scene needs `iwer`, which the main checkout's tools/node_modules lacks; the experimental checkout's
node_modules has it.

## 2026-10-27 - Final A/B: frame cost and screenshots

**Evidence:** `tools/runs/rkworld-final-off` (11/11) and `-on` (12/12), same seed and views, SwiftShader 1280x720, res 0.6.
Off/on side-by-sides: `docs/ngc1980/evidence/rk-world/*-off-on.png` (home island 200 m, shore, sea towards the sun,
carrier, mainland, snow peak, wild coast, environment probe, sea state 7).
Terrain shader alone (near + far terrain only, classic vs RK_WORLD programs alternated ABAB in one page, render +
1-pixel readback, median ms; from the on run): home200 78.4 / 83.2 (+6 %), shore 84.3 / 92.3 (+9 %), seasun 82.0 /
85.6 (+4 %), carrier 74.1 / 76.4 (+3 %), mainland 63.2 / 67.6 (+7 %), snow 51.8 / 57.5 (+11 %), coast 85.3 / 88.4
(+4 %), envprobe 134.7 / 145.0 (+8 %). Range +3 to +11 % of the terrain pass; the off run's own ABAB gives +3 to +15 %.
Whole frame (render + readback, median, separate pages so noisier): home200 204.9 / 205.2, carrier 277.9 / 278.4,
mainland 136.5 / 131.4, seasun 222.2 / 253.2, coast 141.3 / 159.8 ms off / on. Software rasteriser: relative numbers
only, not a GPU or Quest claim. The remaining per-pixel cost is the 2-3 value-noise octaves on land and the Fresnel /
ripple on near water; the default output path adds nothing (`RK_DISPLAY_OUT`, asserted in the scene).
**Observations:** zone islands keep their surface types and read the same from 200 m with softer, varied grass; wild
land loses most of the hard checker (kept at half contrast) and gains slope rock, snow line and coast sand; metals now
reflect the sky (off: black spheres); at low grazing views the sea is a little more reflective than before, so the
teal of the shallows is slightly less pronounced at 20-30 m altitude (capped to keep it readable). Snow still follows
the flat-shaded triangles of the 16 m far grid (house style, unchanged by design).
