# Orchestrator findings

## 2026-10-25 - Tech tree merged; normal play now starts on the default tree
**Finding:** after ngc/techtree (047a748) a normal game starts with tier 0 only: no parked M60A3/M113A2, no Tomcat
escorts, logistics or sky carrier until researched. `?debug` with no `?tech` and `?tech=all` give the old game.
**Evidence:** techbench 95/95, techtree.mjs 26/26, smoke 5/5, commander/groundwar/air benches pass on the merge.
**Action:** balance is a first cut; the sim tunes it. Shift+6 / F6 free sky carrier skips the gate on purpose.

## 2026-10-25 - First sim tournament: wars don't end
**Finding:** in the first partial tournament (BALANCED vs each RUNAWAY doctrine, 8 seeds each, 45 min limit,
default tech) nearly every war ran to the time limit with the Task Force slightly ahead. Decisive ends: 2 ALBATROSS
sinkings (vs SWARM, HORDE), 1 RUNAWAY carrier sunk (vs DREADNOUGHT), out of 42 games.
**Evidence:** tools/runs/sim/2026-10-25-14-41-30-tournament-default/runs.jsonl on ngc/simmode (c1083ff).
**Cause:** not yet known: enemy too passive, objectives too hard to finish, or both. Small sample, one blue doctrine.
**Action:** OPEN - SIMREPORT.md (ngc/simmode) and the balance pass.

## 2026-10-25 - Sim shortcut did nothing until simmode merged
**Finding:** the NGC-1980 SIM MODE desktop shortcut opened the normal game: `?sim` lived only on ngc/simmode.
**Action:** merged the first cut (613739b); simmode.json 6/6, simbench 13/13. Launcher shortcuts are on main (3d2e3a4).

## 2026-10-25 - USER REPORT: Tomcats can't fly off the ALBATROSS
**Finding:** the player F-14 is destroyed at the end of the catapult stroke and the AI Tomcat never leaves the cat
(jets.json); known since 2026-10-24. User asked for a launch queue, one aircraft at a time, and a taxi coordination sim.
**Action:** OPEN - ngc/bugsweep owns the catapult fix + new deck ops module (launch queue, taxi, fouled-deck holds).

## 2026-10-25 - USER REPORT: the sides aren't symmetrical
**Finding:** the user wants each side to have an equivalent for every unit, matched in role, size and power. Two
examples they gave: the KRAKEN has container freighters that the ALBATROSS lacks, and only the ALBATROSS can be refitted
into a flying SKY CARRIER.
**Action:** OPEN - ngc/parity. First a role-by-role matrix (docs/ngc1980/PARITY.md), then every gap filled across the
game, tech tree, AI and sim, with sim win rates measured before and after.

## 2026-10-25 - Paused at the user's request (weekly usage)
**Action:** all agents stopped, every worktree checkpoint-committed. Merged into experimental: techtree, the simmode
first cut, healthbars. Paused mid-work: simmode (tournament, SIMREPORT), sealife2, bugsweep (catapult fix + deck
ops), commander2, qa-ship, airlift, parity, ch46fly. The repo was made public at the user's request.

## 2026-10-27 - RenderKit adoption: four branches merged into ngc/shader-library
**Finding:** The Continuum RenderKit (ngc/shader-library, rebased onto main 914b5f3) was adopted in four areas by parallel agents, each gated by `game/js/renderkit/adopt.js` (`?rk=0` = classic look, pause menu RENDERKIT GRAPHICS).
**Evidence:** `findings/rk-surface.md`, `rk-world.md`, `rk-fx.md`, `rk-ui.md`, and `evidence/rk-*/`. On the merged branch: smoke 5/5, xr 19/19, rkfx-xr 10/10, rkfx-motion 7/7, menu 9/9, rksurface/rkui pass, renderkit fixture 20/20.
**Cause / decisions:**
- The renderer stays NoToneMapping. Post runs display-referred through an sRGB XR-style target (rk-fx), because four custom shaders write sRGB directly.
- The terrain and sea keep the game's own shader, with the kit's methods compiled in under `#ifdef RK_WORLD`; the kit's terrain/water materials would have lost LOD, live waves, caustics and fog of war.
- rk-world owns `zScene.environment` (PMREM of the kit sky, environmentIntensity 0.5). With the scene environment, Three r170 uses `scene.environmentIntensity` for every Standard material whose own envMap is null, so the per-role intensities in `gamemats.js` no longer apply. A/B of the Huey (surface vs surface+world): paint slightly lighter, canopy unchanged. Accepted.
- Merge conflicts were only in main.js imports and the `__G` debug object (union of keys).
**Action:** Integration commit b12e2e9 calls `useSceneEnvironment()` after `createWorldSky`. OPEN: real-GPU / Quest frame times (SwiftShader A/B: surface +5–10 %, world +3–14 %, post +5–20 %); fish.mjs downwash and sealife bow-dolphin checks fail with RenderKit off too (pre-existing); caves still reflect the sky.

## 2026-10-27 - Fish-visibility pixel checks after the RenderKit merges
**Finding:** `underwater.mjs` and `visibility.mjs` read 0 changed fish pixels whenever RenderKit post was on, and `visibility` 220 m failed intermittently with everything on (27–39 changed pixels against a threshold of 80).
**Evidence:** Underwater bisect by area: only rk=post read 0; the others read 262–636. Visibility 25/80/220 m changed pixels: rk=0 6941/1825/276, world 5076/3438/224, surface 4265/2884/568, post 14955/1648/536, all 518/490/39. Side-by-side 25 m screenshots (rk=0 vs all): the same dark school patches and signs; the rk=0 frame also caught a large splash near the camera.
**Cause:** (1) Post draws the scene into an MSAA render target, and `gl.readPixels` on it returns zeros. (2) The count is dominated by random near-camera splashes, and the fish in view vary (0–23 at 220 m), so the 220 m threshold is noisy.
**Action:** Fixed (1) in 2a10eda: the hooks measure on the canvas. underwater 6/6 with everything on. (2) OPEN: no visual regression seen; the 220 m check needs a seeded school under the camera or a lower threshold. The fx/ui bisect runs crashed with "Node is detached from document" (a harness click race).
