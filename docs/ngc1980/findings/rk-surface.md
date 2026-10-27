# rk-surface — RenderKit surface materials for units, ships and structures

Branch `ngc/rk-surface` (from `ngc/shader-library` 7a62f55). Everything is gated on `RK.on('surface')`; with `?rk=0`
every factory returns the exact legacy Lambert/Phong material. Evidence images are side-by-side, **left `?rk=0`,
right RenderKit on**, in `docs/ngc1980/evidence/rk-surface/`.

## 2026-10-27 - One bridge module instead of per-file material rewrites
**Finding**: the game builds almost every unit through a handful of kit factories (`M()` in hueymodel/jetmodel/ships,
`air/meshkit`, `air/rotary/modelkit`, `c130model`, `wheeled/modelkit.mat()`, `armor/tankmodel.MAT`, `naval/navkit.hullMat`,
`runaway/rwkit.rwMats`, `defence/kit.BAKED/lam`, `infantry/meshkit.KITMAT`) plus a few direct materials (glass,
decals, decks, team paint).
**Evidence**: ~139 Lambert / 26 Phong constructors, but ~15 factories cover >90 % of unit pixels.
**Action**: `game/js/renderkit/gamemats.js`: `wrapFactory(legacy, baseRole, detailPreset)`, `pbr(legacy, colour, opts)`,
`glass()`, `decal()`, `worldSurface()`. Call sites tag paints with `{ rk: 'role' | { role, detail } }`; untagged paints get
the kit's base role, or `metal`/`chrome`/`rubber` from the legacy `shininess` hint. Roles: paint, flat (lusterless
OD), armor, hull, metal, grimy, chrome, rubber, fabric, skin, dark, concrete, wood, ceramic, lamp. Programs are shared
(one cache key per patch), materials stay 1:1 with the legacy instances so code that recolours them (team paint,
lamps, heat glow, civilian `setVariant`) still works.

## 2026-10-27 - Paint must be dielectric; the "darker" Huey was dust, not the BRDF
**Finding**: first pass looked browner/darker than legacy. Under the game's rig a flat-shaded MeshStandardMaterial
(metalness 0) gives the same value as Lambert/Phong; the shift came from the RenderKit dust tint plus preset metalness.
**Evidence**: `tools/scenes/rkmatcheck.mjs` cube read-back, olive drab top face: Lambert 52,58,20 · Phong 52,58,20 ·
Standard flat 55,61,26 · +detail 66,67,36.
**Cause**: presets carry metalness .05-.08 (darkens diffuse with no env map); army dust .3 desaturates OD.
**Action**: all paint roles metalness 0 (rule 6), army dust .22, RUNAWAY dust .08 with a lighter grime colour
(white ceramic had gone grey). Exposed-metal wear only on painted-metal roles.

## 2026-10-27 - No environment map: glass and bare metal need a fallback reflection
**Finding**: with only Hemisphere + sun, Physical glass and metal reflect nothing: canopies read as tinted plastic,
tracks/struts dark. A per-material 64x32 equirect of the game's own sky gradient over dark sea (PMREM'd by Three once)
fixes canopies, bridge windows, chrome and lenses.
**Evidence**: `ab-huey-close.png`, `ab-tomcat-canopy.png`, `ab-deck-island.png` (island bridge band now reflects sky).
**Side effect fixed**: env sky made dark track steel look blue -> new `grimy` role (rough .74, metal .2, env .2) for
tracks, road-wheel hubs and vehicle chassis steel; `metal` env .5. Env irradiance also adds diffuse to glass, which
veiled the view out of windscreens -> glass tint scaled to 40 %, glass env .7 (`ab-m151-cockpit.png`: a light sky
reflection on the raked M151 screen remains, as on a real one).
**Action / rk-world**: the fallback is per material, so it overrides `zScene.environment`. When rk-world sets an
environment, call `useSceneEnvironment()` from gamemats.js once (drops the fallback from every registered material).
Expect then: all Standard units gain IBL diffuse on top of the HemisphereLight (brighter overall; consider lowering
the hemisphere or `envMapIntensity`), metals/glass reflect the real sky. Roles are the single place to retune.

## 2026-10-27 - Glass without transmission
**Finding**: `createGlassMaterial` defaults to transmission .92, which makes Three render the opaque scene a second
time into a transmission target whenever a canopy is on screen (and per eye in XR).
**Action**: `glass()` uses it with `transmission: 0`, transparent alpha as before, IOR 1.5, roughness .05 (7 glass
materials in the main scene).

## 2026-10-27 - Highlights under NoToneMapping (orchestrator note: renderer stays untonemapped)
**Finding**: no clipping. Brightest pixel of a sphere lit head-on by the sun (`rkmatcheck.mjs`, `peak`): white paint
0xe8e9e6 Lambert 174 / Phong 175 / RK paint 178 / RK ceramic 181; grey 0xa7aaab 126 / 128 / 132 / 136. The roles add
<= 8 levels at the specular peak; nothing reaches 255. Roughness floor .28 (chrome only), paint .58.

## 2026-10-27 - Frame time A/B (SwiftShader, honest numbers)
**Evidence**:
- In game, carrier deck, paused sim, 120 rAF intervals (`tools/scenes/rksurfperf.mjs`), two runs each:
  deck chase `?rk=0` 315.5 / 323.9 ms vs on 337.3 / 346.8 ms (+5..8 %); second view 323.2 / 328.9 vs 322.5 / 368.3;
  Huey filling the screen 233.7 vs 257.9 (+10 %). Run-to-run noise on this shared machine is about ±8 %.
  Draw calls unchanged (650 / 667), programs 64 -> 70.
- Isolated raster cost, one unit filling 960x540, 40 renders with readPixels sync (`tools/scenes/rksurfmicro.mjs`):
  Huey 8.35-9.1 -> 13.3 ms, Hornet 6.7-7.3 -> 11.4 ms, M60 19.6-20.0 -> 32.1 ms (about +60 % per unit pixel);
  `&rkdetail=0` (PBR roles without the dust/wear noise) 12.9 / 9.2 / 33.0 ms.
**Cause**: the Standard BRDF (GGX + multiscatter) is the cost; the RenderKit noise adds little.
**Action**: kept detail only on large hull skins; small parts plain; far LODs (`wheeledcraft` farMat, world towns)
stay Lambert. `?rkdetail=0` exists as a probe / low-end knob. **OPEN for VR**: unit pixels are a minority of a
headset frame, but on a fill-bound GPU budget the honest worst case is ~1.6x on pixels covered by units. Not measured
on a hardware GPU or headset.

## 2026-10-27 - What was converted / deliberately not
**Converted**: Huey, Hornet, Tomcat, Shrike/Reaper/Shahed, C-130, CH-46, MV-22, WASP, M151/M35/LCM-8 and the civilian
cars (Land Rover, Hilux, Beetle, Lada), M60A3, M113, RUNAWAY strider/hovertank (ceramic), seized M1A2/T-90M (armour),
defence units, LCM-8, ALBATROSS/KRAKEN/LEVIATHAN/container ship (hull, flight decks as non-skid, containers,
bridge glass, team paint, deck crew), legacy ships.js models, heavy-drop loads, infantry kit materials, faction
structures (one weathered `worldSurface` material) and lit decals everywhere (were partly unlit MeshBasic).
**Not converted**: cockpit/interior instrument materials (hueycockpit, jetcockpit, tank interiors, cabins) - verified
unchanged; town buildings (life.js/gfx.js `worldMaterial`, owned elsewhere and a large screen area where a rough
Standard looks like Lambert at higher cost); landing hards (fog-of-war patched, main.js); trees; far LODs.
**Gotcha**: `charModel` (wheeled wrecks) clones materials - the clone drops the detail hook as intended and is now set
to rough soot.

## 2026-10-27 - Verification
smoke.json PASS 5/5; renderkit fixture PASS 20/20 (`tools/runs/rk-surface`); syntax 497/497; airmodels 2/2,
shipsdev, tankmodel 2/2, wheeledmodel 6/6 PASS with RK on; xr.mjs (IWER Quest 3) PASS 19/19, stereo frame
`xr-cockpit-stereo-rk-on.png`. `rksurface.mjs` asserts no `RK/` material exists in the main scene with `?rk=0`
(and many with it on: 271 paint, 84 decal, 29 flat, 7 glass ...). A/B screenshots of 46 views reviewed, including the
Huey cockpit panel / cabin, M151 and Beetle driver views, M60 driver and M113 troop compartment.
