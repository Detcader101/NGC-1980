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
