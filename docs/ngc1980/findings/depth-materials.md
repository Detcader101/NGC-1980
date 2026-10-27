# depth-materials — surface detail, materials and palette (the "roblox low tech look")

Branch `ngc/depth-materials` (from `ngc/shader-library` 4a47cbb). User report: first person on foot at the home-island
HQ, desktop GPU: "add more depth and drag it away from this roblox low tech look ... in every aspect". The HQ,
sandbags, tarmac and helipad were flat single colours and the pad paint a glaring saturated cyan. This branch owns
surface detail and materials; light, post, nature, figures and sky are other branches. Everything is gated on
`RK.on('surface')`; `?rk=0` is the classic look. Evidence in `docs/ngc1980/evidence/depth-materials/`
(`*-off.png` = `?rk=0`, `*-on.png` = RenderKit on).

## 2026-10-27 - One procedural detail library, picked per triangle
**Finding**: the world (structures, towns, roads) is merged flat-coloured geometry without UVs, built partly in a
worker; units are Phong/Lambert models with poor UVs. A texture-based approach would need UVs everywhere.
**Action**: `game/js/renderkit/detail.js`, shader-only, no textures:
- `worldDetailShader` / `applyWorldDetail`: a surface CLASS per triangle picks the pattern: plaster, concrete (round
  air holes, form-work lines on walls, 4 m slab joints on floors), sandbag (3 mm weave, pillow rows, lumpy fill,
  bleached / muddy bags), tarmac (aggregate, cracks, oil stains), painted steel (rust runs, chips to primer), wood
  (boards, grain, gaps, silvering), brick (stretcher bond, lime mortar, per-brick tint), stone (coursed blocks, dark
  joints), clay tile / slate (staggered courses, overlap shadow, lichen), corrugated iron, earth / turf (pebbles,
  clods, dry patches), canvas, worn road / pad markings, and a GENERIC fine grain for anything untagged.
- Classes come from the palette: `renderkit/surfclass.js` maps palette hexes to classes; `world/kit.js` `col()` tags
  the colour array (`.s`), `shade()` / `mixc()` keep the tag, `surf(c, cls)` overrides (quonset roofs ->
  corrugated). `Geo.build()` emits one more attribute, `srf` (2 bytes a vertex: class, baked occlusion); the worker
  transfers it with the other buffers. Unlisted colours are GENERIC, so nothing gets a wrong pattern, only a plain one.
- Projection per face from the geometric normal in model space: floors use xz, walls use (distance along the wall,
  height), so bricks and boards follow any wall orientation; slopes use distance along the slope (roof courses).
  Coordinates are the mesh's own `position` (before instancing / skinning): detail never swims on moving units.
- Bump: a height in metres -> normal through screen derivatives (Three's bump-map method), so mortar, tile courses,
  pillows, corrugations and pores catch the sun without normal maps.
- Anti-aliasing: every pattern fades where a pixel covers a good part of its period (`rkAA(fwidth, period)`), lines
  are at least ~1 px wide and band-limited; all detail fades to the average colour by 150 m (`rkDFar`).
- `applyUnitDetail` (replaces RenderKit `applySurfaceDetail` inside `gamemats.pbr`, same uniforms, so live `rkWet` /
  `rkDust` still work): adds panel lines (per preset: air 0.85 m, ships 2.4 m plating, RUNAWAY 1.1 m ceramic tiles,
  carrier deck 3.2 m plates), rain / oil / rust streaks down vertical faces (ships rust brown, army mud, air exhaust
  grey), underside grime, paint grain bump and roughness variation.

## 2026-10-27 - Vertex contact occlusion without breaking ?rk=0
**Finding**: the world worker cannot read the page's `?rk` (worker `location` is the worker script; no localStorage),
so anything baked into the vertex colours would change the classic look.
**Action**: `Geo.box()` side faces record an occlusion byte on their bottom corners (short boxes such as bags, crates
and kerbs 0.3, walls 0.15-0.22) in the new `srf` attribute, not in the colours. Only the RenderKit detail shader
applies it (`diffuse *= 1 - occ`), so `?rk=0` and `?rkdetail=0` are unchanged. It works in VR where post (SSAO) is off.

## 2026-10-27 - The helipad: neon rings -> a painted 1980 pad
**Finding**: the pad and apron are painted by the terrain shader (main.js), four concentric rings alternating near-black
and the full team colour (player 0.2, 0.75, 1.0 = neon cyan), plus a torus at the home pad cycling through the
rainbow (`setHSL(time)`), plus 12 bright yellow / green edge-light boxes (0xffe860 / 0x50c060).
**Action** (RK surface only; the classic shader text is untouched under `?rk=0`): `detail.js padGLSL` paints a
broom-finished concrete disc (stains, rotor-wash soot in the centre, worn paint patches), a white perimeter line, a
touchdown circle and an H turned to the pad's yaw (new `uPadP.w`), and the owner colour as one faded painted band
(desaturated 50 %, 62 % value: still blue / red / white at a glance). Apron: 4 m slabs with joints and per-slab tone.
Cave-base hazard ring: faded yellow / black (enemy red / black) instead of cyan. The rainbow torus is hidden with RK
on; edge lights are grey housings on concrete footings with small amber / green lenses.

## 2026-10-27 - Palette
**Action** (RK surface only): structure team colours 0x2f6fd0 / 0xff3322 / 0x4f9a5a -> 0x35557f / 0xa3342a / 0x5f7f56
(the HQ band, flag, ring); sandbags 0xb8a678 / 0xa89668 (yellow sand) -> 0x9c9070 / 0x8a8064 (filled hessian / poly);
home-base blocks blue-grey 0x8a92a0 -> concrete 0x8e8c86; landing-hard markers red / white / green to painted
0x9a2c22 / 0xd6d4cc / 0x34653a; pad paint as above.

## 2026-10-27 - ALU value noise was 5-8x the Lambert cost; one noise texture instead
**Finding**: the first version evaluated the RenderKit 3D value noise (`rkNoise`: 8 hashes + trilinear mix) 3-5 times a
fragment. Raster cost of world surfaces filling 960x540 (`tools/scenes/depthmicro.mjs`, 30 renders, readPixels sync,
SwiftShader): sandbag wall 6.2 ms (`?rk=0`) -> 53 ms; HQ close 4.4 -> 31 ms; town street 4.4 -> 33 ms.
Also the hashed "pores" / aggregate (`floor()` cells) read as square pixels up close and the analytic 3 mm sandbag
weave (`sin()`) moired on oblique faces.
**Cause**: SwiftShader is a CPU rasterizer, so ALU-heavy noise costs in proportion; on a GPU the ratio is smaller but
the work is the same kind.
**Action**: `noiseTexture()`: one generated 256x256 tileable RGBA texture (R fbm 1/4-1/16 tile, G fbm 1/16-1/64, B white
noise per texel, A ridges), mipmapped, anisotropy 1. Every fragment makes three fetches (20 m blotches, 4 m grain /
1.6 cm speckle, a stretched one for streaks) outside the class branches, so derivatives / mip selection are defined.
Mip filtering band-limits the noise (pores and aggregate fade with distance instead of shimmering). Hash noise is left
only for per-cell tints (bricks, tiles, boards). The fbm is contrast-stretched (`smoothstep(.22,.78)`) once, so blotches
read (~+-15 %) without per-class constants. Units: the dust mottle reads the texture; the camouflage keeps the 3D FBM
(it must be continuous across edges) but only runs when `rkCamo > 0`.

## 2026-10-27 - Raster cost A/B and tiers (SwiftShader, honest numbers)
**Evidence**: `tools/scenes/depthmicro.mjs`, one surface filling 960x540 under the game's hemisphere + sun, 30 renders
with a readPixels sync each, ms per frame. Five other agents were running headless browsers on the same CPU, so
run-to-run noise is about +-30 %; two runs each, ranges given.

| view | `?rk=0` (Lambert) | `&rkdetail=0` (PBR roles, no detail) | `&rkdetail=1` medium | high (default) |
| --- | --- | --- | --- | --- |
| HQ site close (concrete, bags, berm) | 5.8-7.6 | 8.0-12.0 | 13.9 | 23.4-29.0 |
| HQ at 30 m | 2.7-3.3 | 3.8-4.3 | 5.0 | 7.7-9.1 |
| sandbag wall filling the screen | 7.2-9.4 | 15.5-18.4 | 22.9 | 37.3-38.8 |
| town street (Lambert world material) | 5.2-7.8 | 8.0-8.4 | 12.5 | 24.1-29.6 |
| Huey (unit detail) | 11.8-17.8 | 21.0 | 24.7 | 21.0-24.3 |

**Reading**: on a CPU rasterizer the high tier costs ~3x the plain PBR roles on world pixels that are inside the
detail range; medium ~1.5x; unit detail is within noise of the old RenderKit dust / wear (it replaced it). SwiftShader
pays for every instruction of every branch its 4-pixel group touches; a GPU skips the class branches it does not take
(the class is constant over a triangle) and hides the three texture fetches behind the lighting math, so the ratio on
the user's desktop GPU should be well below this. Not measured on a hardware GPU or headset (none on this machine).
In-game rAF frame time (`depthmat.mjs PERF=20`) is useless here: the game's frames are throttled to the harness
(16.7 ms p50 for every variant).
**Action**: tiers. High (default): every class pattern, bump, 150 m. Medium `?rkdetail=1`: no class patterns, no bump,
the shared blotches / grain / streaks and the baked occlusion, 60 m: the VR / low-end choice. `?rkdetail=0`: the
RenderKit PBR roles only. XR sessions drop the range to 60 m and halve the bump on any tier (`bindXR`, main.js).
Beyond the range every pixel takes one distance test and skips the detail.

## 2026-10-27 - Screenshot review (what was looked at, what was fixed on the way)
**Evidence**: `docs/ngc1980/evidence/depth-materials/` (`-off` = `?rk=0`, `-on` = default, `-medium` = `&rkdetail=1`):
the user's view (`base_user`), 3 m from the HQ door and sandbags (`base_near`), 30 m (`base_mid`), the pad edge, a town
crossroads, the carrier deck on foot, the Tomcat, and dev-page close-ups of sandbags and roofs / brick
(`tools/scenes/depthlook.mjs`). Also reviewed, not copied: Huey (orbit, close, cockpit), Hornet, Shrike, Reaper, all
four ships (far and close), M60 / M113 (outside and inside), M151 / M35 / Land Rover / Beetle, village, harbour
street, VR stereo cockpit (`xr.mjs`).
Fixed during review:
- hashed `floor()` pores read as square pixels; analytic 3 mm weave moired -> texture speckle, mip-filtered.
- sandbag "fold" lines looked like crazed marble -> pillow rows (`sin` over each 0.3 m course) + lump / wrinkle bump.
- plaster rain streaks every 30 cm looked like stripes -> wider, sparser, 9 %.
- tarmac oil stains too many and hard-edged (camouflage look) -> fewer, softer.
- the uniform panel grid on jets read as graph paper -> irregular layout (missing frames, joins staggered per bay).
- ship streaks mixed toward a fixed rust colour turned the dark RUNAWAY hull brown -> a tinted darkening relative to
  the paint.
- pad owner band was still a light teal at 1.3 m wide -> 0.65 m, 42 % saturation, 50 % value.
No swimming: detail is in mesh coordinates (checked on the carrier deck and the ships while the scene runs; units are
moving in the Huey / deck shots). No shimmer at distance: mip-filtered noise, AA-faded analytic patterns, 150 m fade.

## 2026-10-27 - Verification
`node tools/check.mjs syntax` 512/512; `smoke.json` PASS 5/5; `xr.mjs` (IWER Quest 3) PASS 19/19 (stereo cockpit
frame reviewed: detail matches in both eyes); RenderKit fixture `tools/runs/depth-materials` PASS 20/20;
`depthmat.mjs` RK=0 / all / medium PASS; `rksurface.mjs` huey, ships, tank, wheeled, jet, air, rw PASS with RK on
and off. `?rk=0` shots are pixel-for-pixel the classic look (the occlusion byte and the pad / palette changes are all
behind `RK.on('surface')`).

## 2026-10-27 - Open
- **OPEN**: cockpit interiors (Huey, jets, tanks, cabins) are not detailed. They fill half the view in cockpit / VR,
  so the per-pixel cost is largest there, and grain over instrument faces hurts readability. If wanted: `applyWorldDetail(
  mat, { defCls: SURF.METAL })` on the structure materials only (frames, floors), medium tier in VR.
- **OPEN**: not measured on a hardware GPU or headset (none here). On the user's desktop GPU, check `?rkdetail=1` vs
  default at the base view; on Quest standalone use medium.
- **OPEN**: ambient town people / cars and interior rooms use `worldMaterial`, so they get the GENERIC grain (no class
  attribute). Harmless; the figures branch can pass `detail: false` in `world/ambient.js` if it wants them plain.
- **OPEN**: sandbag pillows assume courses 0.3 m from the mesh's ground (as `structures.js` stacks them); bags built
  elsewhere on another grid get the pillow shading offset.
- **OPEN**: the terrain shader (main.js) has no noise texture, so the pad / apron concrete uses cheap sine mottling;
  passing `noiseTexture()` into `terrainUni` would let nature and this pad share it.
- Deck crew vehicles / cranes stay USN yellow (they are yellow); the home beacon beam (cyan) is a gameplay marker, kept.
