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
