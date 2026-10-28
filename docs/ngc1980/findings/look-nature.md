# ngc/look-nature: foot.mjs blocker, then tree silhouettes at 5-50 m (LOOK-PLAN workstream 3)

Branch `ngc/look-nature` from `ngc/shader-library` 36eb21b. Rocks / outcrops, the far grid and the terrain shader belong to
look-terrain and are not touched here.

## 2026-10-28 - foot.mjs 3/14 failures with the nature area on
**Finding**: with `rk=all` (and `rk=nature` alone) foot.mjs timed out on the stern ladder climb (40 s wait; the soldier
stopped at y 6.55 of 8, still on the ladder) and on the 16 m walk to the home pad (30 s wait; 9.8 m walked), and the
deck-height expect after the ladder failed with it. Nothing blocked him: no collider, no height query and no clutter
on the carrier, the ladder or the pad path is involved (nature never registers colliders; clutter is kept 27 m off pads).
**Evidence**: the failing log (`tools/runs/2026-10-27_19-04-49-foot`) shows the climb still moving at the time-out
(7.8 m in 71 s real time). A probe (`_probe_pad`, `rk=nature`) walked the same path fine at 2.4 fps and got through the pad
in time. The main loop clamps `dt` to 0.1 s (main.js), so below 10 fps game time runs slower than real time, and every
game-time wait in the test stretches with the frame time. A one-page cost breakdown at the HQ view (`_probe_cost`, sync draw +
readback, SwiftShader): all 586 ms / 1378 kt; trees off 470 ms; tufts off 253 ms; all clutter off 193 ms; terrain micro
detail off 196 ms (no cost). Without nature foot.mjs already needed 35 of the 40 s on the stern climb, so the extra
draw cost was enough to push it over.
**Cause**: every nature set is one instanced draw with `frustumCulled = false`. Each refill took the WHOLE ring round
the eye (trees to 520 m, the zone's 3200-tree far set, ~15.6 k grass tufts to 105 m), so everything behind the player
and the far set inside the near band (where its material discards every pixel) still went through the vertex stage.
**Action** (game fix, test unchanged): a view cone on every refill (`renderkit/nature.js` `viewCone` / `inCone` /
`coneMoved`). The host records the rendering eye's forward vector and its half-diagonal FOV tangent in `natEye`
(main.js `N.place`, which already ran per rendering camera, XR eyes included; XR's off-axis skew widens it). Trees are
tested as a sphere of their crown plus shadow (7 x scale + 3 m), clutter cells as their 8 m cell plus height span. The
margin is 0.4 rad round the view, and a turn of more than 0.16 rad refills, so a quick turn never shows a missing tree.
Clutter cells outside the cone are still generated (nearest first, under the same 6 ms budget), so a turn finds them
ready. The zone's far set only holds trees past the near band (`LOD.near - LOD.blend`), where its screen door lets them
show. Result at the HQ: 1378 -> 766 kt; trees 1084+787+3200 -> 518+109+0, tufts 15651 -> 7330.
foot.mjs with everything on: **PASS 12/12** (stern climb 38.8 s of 40: the test is marginal under SwiftShader with
or without nature; see the timing note in OPEN).

## 2026-10-28 - Tree crowns: leaf cards instead of faceted blobs (look-nature-2)
**Finding**: at 5-50 m every crown was a cluster of 8-9 jittered icosahedra: big flat facets with hard polygon outlines
against the sky (`sbs-02-oak`, `sbs-06-forest`, left). The pine read as a lumpy ball on a stick, the fir as a stack
of hard star plates, the maquis bushes as faceted boulders. No leaf edge anywhere.
**Evidence**: `docs/ngc1980/evidence/look-nature/sbs-*.png`, from `tools/scenes/looknature.mjs` (before =
8148fcc, the cone-only build with the 36eb21b trees; after = this branch). The views are the HQ (the user's view),
single oak / pine / fir at 9-14 m, a back-lit oak, the forest edge, a village garden tree on foot and from 30 m, the
Huey at 30 m and 200 m, and the jet at 1200 m.
**Cause**: solid geometry can't give a foliage outline at this distance. The silhouette has to come from alpha.
**Action** (`renderkit/nature.js`):
- **Leaf atlas** (`leafAtlas`): three 256 px tiles drawn once at start on a canvas. They are a broadleaf spray (oval
  leaves on twigs, ragged edge), pine needle tufts, and a fir branch spray (twig, side twigs, needles; base at v = 0).
  RGB is a grey leaf-to-leaf shade that multiplies the vertex colour, and A is the mask. Transparent texels carry mid grey
  so the mips don't darken the edges.
- **Cards** (`Builder.card / cluster / cardCrown / fringe`): a crown is 10-12 clusters of three crossed cards (one
  across the outward direction, two along it, turned at random) on an ellipsoid shell. They sit over a small dark
  low-poly hull (46 % of the crown, 42 % for the pine), so the crown never reads hollow. Normals are bent to point away
  from the crown's centre (sphere normals, bend 0.8), so a crown shades as one soft volume. AO is baked per vertex from
  the corner's place in the crown. The fir keeps a smaller, darker star skirt as its inner mass, fringed by 10 drooping
  branch-spray cards per tier (alternate heights, random roll) and a leader tuft. Maquis (and the clutter bushes, which
  use it) is 7 clusters over an octahedron.
- **Material**: the cards alpha-test the atlas with a one-pixel `fwidth` edge, so `alphaToCoverage` (the world target
  and XR are MSAA) gives soft leaf edges. The mask is held up in the smaller mips (`* (1 + 0.3 * mip)`), so crowns
  don't thin out with distance. Translucency is stronger on cards: a wide and a tight lobe toward the sun, tinted
  yellow-green. The detail and mid materials are double-sided for the cards only; trunks and hulls discard their back
  faces first thing (`!gl_FrontFacing`), which halved the forest's draw time in the A/B. Shadows: the detail depth
  material alpha-tests the cards (dappled, leafy shadows); the mid one casts whole quads (no atlas fetch: those
  shadows are a few pixels).
- **LOD and tiers**: detail and mid use the same species built at two densities (mid: 5-6 clusters of two cards), so
  the screen-door hand-over at the tier radius (90 / 170 / 260 m) dissolves one leafy crown into another. The zone's
  far set (past ~520 m) keeps the clump crowns, which read the same at that size. The low tier (XR) used the octahedron
  "lite" crowns as its mid set; it now uses the card mid (similar triangle count, the same silhouette as its detail).
  Wind, lean, colour shift and felling are unchanged (same instance data). Bark is lighter (the trunks read black).
- **Grass tufts**: 13 -> 10 blades, slightly wider. The 15 random draws of the dropped blades are burnt, so the clutter
  rocks built next from the same stream keep their exact shapes (rocks belong to look-terrain).

Triangles per tree (detail / mid; before -> after): oak 228 / 88 -> 120 / 40; pine 220 / 96 -> 126 / 44; fir
152 / 38 -> 170 / 74; maquis and the clutter bush 80 / 40 -> 50 / 20; grass tuft 39 -> 30.

## 2026-10-28 - Village, garden and hedgerow trees on the species
**Finding**: zone villages and streamed chunks merged their trees (world/chunkgen.js `tree()`: a 5-sided trunk and one
blob) into the world geometry: the "old village tree" next to the new species (`sbs-07-village`, left).
**Action**: with nature on, `tree()` records the tree (x, y, z, scale x 1.2 so the crown matches the old blob's width,
species: 80 % oak, 20 % pine by position hash) instead of building it. It consumes the same random draws, so the rest
of the build (hedge gaps, the next hedgerow tree) is identical. `buildGeo` returns `vtrees` / `vkinds`. The world
worker transfers them; world/life.js adds them as forest sources (`zone-v<n>` for the zone villages, `<chunk>v` for
streamed chunks, removed with the chunk). The colliders (world/solid.js, from the items) and the far blob in the
chunk's far mesh are unchanged, so the far hand-over is the same as before. `?rk=0` and nature-off builds are
untouched (`NAT_TREES` is null).

## 2026-10-28 - Cost (SwiftShader, relative only)
**Evidence**: renderer.info triangles (main + shadow passes), same scene and camera:

| view | 36eb21b | cone (8148fcc) | look-nature |
|---|---|---|---|
| HQ (user's view) | 1378 kt | 767 kt | 566 kt |
| oak at 10 m | - | 919 | 802 |
| forest edge | - | 709 | 625 |
| village street | - | 731 | 643 |
| Huey 30 m | - | 862 | 731 |
| Huey 200 m | - | 642 | 559 |
| jet 1200 m | - | 452 | 436 |

The `_probe_cost` in-page A/B at the HQ (hide the forest, then the clutter, same page) gave a forest share of ~94 ms
with the old blob trees vs ~76 ms with the cards once trunks and hulls skipped their back faces. The first card version,
double-sided throughout, cost 261 ms. Whole-frame sync draw times between separate runs vary by +-25 % on this shared
machine (the jet view, whose geometry is unchanged, measured 434 and 537 ms), so they're logged per view by
`looknature.mjs` but not compared. A close crown filling the screen costs more fill than a blob (3-4 card layers);
that is the honest trade, and the real-GPU A/B is still open.
