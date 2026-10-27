# ngc/depth-nature: trees, ground detail, clutter, shores and cliffs

Branch `ngc/depth-nature` (from `ngc/shader-library` 4a47cbb). The user's report (2026-10-27, first person at the home
island HQ, 133 fps at 1080p): "add more depth and drag it away from this roblox low tech look ... in every aspect". Trees
were single flat-green 6-sided cones, grass was flat colour and the hills were bare.

Code: `game/js/renderkit/nature.js` (new), RENDERKIT nature hunks in `game/js/main.js` (trees block, terrain shader,
frame hook, onFell), `game/js/world/forest.js` (species, scrub), `chunkgen.js` / `worldworker.js` / `life.js` (wild
forests as instances), `net.js` (`clearingAt`, additive), `renderkit/adopt.js` (`'nature'` area).
Scene: `tools/scenes/depthnature.mjs` (`RK=all NAT=high|med|low VIEWS=hq,forest,grass,beach,cliff,heli50,heli200,wild150,wildfoot`).

## 2026-10-27 - Baseline: what the user saw
**Finding**: zone trees were one `ConeGeometry(1.3, 5, 6)` InstancedMesh (3200, flat-shaded 0x1f7a2a); wild trees were the
same cone merged into each chunk's near mesh and a 4-sided pyramid far. The RK world terrain had FBM colour patches but
nothing under ~4 m, and no clutter of any kind.
**Evidence**: `tools/scenes/depthnature.mjs` with `NAT=off` (the area did not exist yet): `docs/ngc1980/evidence/depth-nature/before-*.png`.
**Action**: the work below.

## 2026-10-27 - Trees: species, crowns, LOD, wind
**Finding**: four species (fir, maritime pine, oak, maquis scrub) chosen by `world/forest.js treeKind` from geology (zone
islands: pine share granite .38, volcanic .5, limestone .62, sandstone .35, +.25 on the coast) and altitude on the
mainland (fir belt from ~170-220 m). Crowns are 8-9 jittered icosahedron clumps on an ellipsoid shell plus a darker core
clump, with normals bent toward the crown's outside (soft foliage shading instead of facets), baked AO (toward the trunk,
underneath, inside the crown), world-space leaf mottling, sun-behind translucency and a wrap term, and a wind sway that
grows with height squared plus a leaf flutter, on a clock advanced by the game's dt only while playing (stops in pause).
Per instance: scale (the zone trees keep the exact positions, sizes and colliders of `?rk=0`), yaw, a 2-6 degree lean,
colour shift (lighter/darker, greener/yellower).
LOD: detail mesh within `detailR +- band` (tier), a 3-clump / 3-tier mid mesh out to the world near radius
(LOD.near 520 +- 110), then the far impostors (chunk sF in the wild: two stacked pyramids for firs, a lozenge for the
rest; a static instanced far set for the zone so the jet still sees the zone's trees). The three are complementary
screen-door masks with the same hash as `world/visibility.js`, so they never overlap or leave a gap.
**Cause** of the first "acacia / savanna" look: crowns of 5 wide, flat clumps on a long bare trunk (flattened icosahedron
bottoms + a dark underside read as slabs). Fixed by the volumetric crown (height ~ width) and lower crown base for oaks.
**Action**: done. A felled zone tree is a tilt in its instance data (`TREES.fell`, was `TREES.mesh.setMatrixAt`).

## 2026-10-27 - Clutter: grass tufts, bushes, rocks, stones
**Finding**: instanced in a camera-centred ring of 8 m cells (34 candidates a cell, generated once and cached, at most
~6 ms of generation a frame), surface from `zoneSurf` in the zone and height/slope outside, sitting on the RENDERED
terrain (triangle interpolation over the 2.5 m grid lattice, which is what the terrain mesh draws; outside the zone the
4 m worker map bilinear). Each instance shrinks into the ground at its own distance (no pops); the ring is 3D, so from
200 m up nothing is in reach and nothing is drawn.
Grass tufts take the RK world terrain's own grass colour (same noise and palette, computed in the vertex shader), so they
grow out of the ground rather than sitting on it as a second green.
**Cause** of three bugs found on the way, all fixed:
- tufts black on one side: `side: DoubleSide` makes Three flip the normal of back faces (down = unlit). The tuft material
  drops that flip (both faces light like the ground).
- no grass near the HQ or over the cave: `clearedAt` (for forests) clears whole towns and farm yards, and `stripW < 1`
  (ground flattened over the cave) is a 150 x 50 m band. Clutter uses a finer test (`net.js clearingAt`: roads + 1.2 m,
  crop fields but not pasture, farm yards) plus the world/solid.js footprints of every building, wall and parked thing
  (+0.5 m), structures (+2 m), hards, pads (cave pads 21 m, the pad hut; others 28 m) and the base disc (18 m + 1.5).
- bushes as dark "tents": the mid scrub used octahedra; clutter bushes now use the detail scrub.
**Action**: done.

## 2026-10-27 - Terrain near detail, shores and cliffs (RK_NATURE in the terrain shader)
**Finding**: `NATURE_TERRAIN_GLSL rnDetail`, called before the lighting so the tilted normal is lit: at every distance,
dry summer grass and bare-soil patches (a hillside is no longer one green), a dark intertidal band on rock (weed / wet
stone up to ~1.2 m), and wet sand. Near the eye (tier radius): crossed grass-blade streaks and a bump field, pebbles
(a jittered dot per 0.4 m with a dome normal), rock strata of varied thickness with dark undercuts below each ledge,
ledge tops tilted up, vertical joints, sand ripples. Each band fades by `fwidth` so nothing shimmers. On the sea side
a swash lace foam line runs up and down the sand (`rnLace`).
**Cause**: first pebble pass drew a dark ring round each pebble on sand: read as craters/footprints. Sand pebbles cut to
12 % and the ring to a 10 % darkening. The wet band first spanned 0-0.9 m (metres wide on a flat beach, a hard straight
edge along the grid triangles); now ~0.2-0.6 m with a noisy edge.
**Action**: done. The light agent's shadow hunk goes into the lighting line after `rnDetail`; the nature hunks are all
marked `// RENDERKIT nature` and leave the lighting skeleton alone.

## 2026-10-27 - Tiers and what they cost
**Finding**: `?rknature=low|med|high` (saved `tz_rknature`, default high; XR switches to low on session start and back
after). Per tier: tree detail radius 90 / 170 / 260 m (+-30/45/60 cross-fade), clutter ring 38 / 70 / 105 m, grass
density 0.35 / 0.7 / 1, terrain near detail off / 110 m / 170 m; low draws the mid trees with octahedron clumps (8 instead
of 20 triangles a clump). The mid set ends at the far clip (on foot the haze ends at ~265 m), the zone's static far set is
drawn only when the view reaches past 410 m (jets, high helicopters).
**Evidence**: `tools/scenes/depthnature.mjs`, SwiftShader at 60 % of 1280x720 after the shader-library merge
(light/sky/post/materials on in every column). drawMs50 = median of 6 synchronous scene renders with a readback (a CPU
rasteriser: proportional to fragment + vertex work, not a GPU frame time); kt = rendered triangles.

| view | nature off | low | high |
|---|---|---|---|
| hq (user's view) | 237 ms / 414 kt | 353 ms / 643 kt | 864 ms / 1379 kt |
| forest edge, on foot | 221 / 422 | 330 / 658 | 772 / 1322 |
| grassland, on foot | 368 / 508 | 512 / 752 | 1046 / 1473 |
| beach | 179 / 356 | 318 / 544 | 489 / 972 |
| heli 50 m | 289 / 474 | 464 / 649 | 609 / 1072 |
| heli 200 m | 277 / 414 | 412 / 552 | 461 / 662 |
| wild forest, on foot | 158 / 249 | 322 / 556 | 728 / 1283 |

High at the HQ: 1084 detail + 787 mid trees (358 kt), 15.6 k grass tufts (645 kt: the tufts are the bulk of high's cost),
forest refill 0.3 ms when the camera has moved 6 m, clutter generation capped at 6 ms a frame (nearest cells first).
Med (earlier run, pre-merge): ~1.0 M triangles at the HQ, ~5 k tufts. CPU per frame with nothing to rebuild: ~0.
**Action**: high stays the desktop default (the user's GPU has headroom: 133 fps at 1080p before). OPEN: a real-GPU A/B
(`?rknature=low|med|high` with the fps counter) on the user's desktop and on the Quest via Steam Link; if high costs more
than ~1 ms there, cut tuft blades 13 -> 8 (the geometry is one function) before cutting density.

## 2026-10-27 - Bugs found in testing (fixed)
- **Tufts invisible after following the render camera**: the clutter / forest sets were refilled inside
  `terrain.onBeforeRender` (to follow the camera that renders: scripted test cameras, XR eyes) and grew their buffers
  mid-render (`geometry.dispose()` mid-frame). Now `onBeforeRender` only records the eye; the refill runs in the frame
  hook; buffers start large (20 k tufts) and are never disposed mid-frame.
- **Tufts the same colour as the ground** (after the light merge brightened the terrain): roots 0.42, tips 1.5 and
  yellower, a per-tuft brightness: grass reads by its contrast.
- **rkworld.mjs terrain A/B failed to compile** (`rkN2` missing): it strips `RK_WORLD` but keeps the other defines. The
  nature hunks are now `#if defined(RK_NATURE) && defined(RK_WORLD)`.
- **Clutter filled in raster order**: under the 6 ms generation budget the far corner of the ring could fill before the
  ground at your feet (the HQ shot had no grass beside the road). Cells now generate nearest first.
- **Clutter test views were around the wrong camera** (the game's chase camera 40 m up, not the scripted eye): low tier
  had no clutter in the shots. Fixed by the render-camera tracking above; shadow cameras (orthographic) are ignored.

## 2026-10-27 - Merge with ngc/shader-library (light, sky, materials, post, figures)
**Finding**: conflicts in main.js (imports, terrain uniforms, GLSL includes, defines), adopt.js (RK_AREAS) and the world
worker's transfer list; all kept both sides (`RK_DEF` gains `RK_NATURE` only with `RK_WORLD`). The light agent's
`rkShadow` rules now cover the nature meshes: trees, rocks and bushes cast (their `customDepthMaterial` carries the
instance transform and wind), grass and stones only receive, the zone's far set only receives. The sky agent's
`rkFarLand` (land past the draw distance) gets a 13 % straw mix under `RK_NATURE`, the average of the near terrain's
dry-grass and soil patches, so the 0.6-1.0 x draw hand-over shows no colour step (wild150 shot).
**Action**: done. Not done: the materials agent's `detail.js noiseTexture()` could replace the terrain detail's ALU value
noise (~10-14 `rkN2` per near pixel) with 3 texture fetches; worth doing if the terrain shows up in a GPU profile.

## 2026-10-27 - Checks
smoke.json PASS; xr.mjs 19/19 (low tier in VR, stereo shots clean); worldvisibility 17/17 (forest counts unchanged,
`forestTrees` kept); underwater 6/6 after the merge; depthnature 9/9 at high, low and off; renderkit fixture 20/20;
`check.mjs syntax` 529/529. visibility.mjs and the pre-merge underwater pixel checks also failed on the base commit
4a47cbb (post pipeline readPixels; fixed upstream by 2a10eda). rkworld.mjs's "kit sky ... material.name === 'RenderKit/sky'"
expect fails since the depth-sky merge replaced the dome material (not a nature change).
Screens: `docs/ngc1980/evidence/depth-nature/before-*.png` (RK on, no nature), `high-*.png`, `low-02-forest.png`,
`worldvisibility-forest.png`.

## OPEN
- Village garden / hedgerow trees (chunkgen `tree()`, merged world geometry) are still the old trunk + one blob.
- The beach's dark trapezoid in `before/high-04-beach` is the LCM landing hard, not a shading bug.
- Felled zone trees keep their wind sway (a lying tree wiggles a few cm).
- Real-GPU frame times per tier (above).
