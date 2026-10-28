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
