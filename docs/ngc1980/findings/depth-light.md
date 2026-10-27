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
**Evidence:** probe in `tools/scenes/_rkdiag.mjs`: the pad's ground point projected to x = -0.42 in the far map, so it
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
