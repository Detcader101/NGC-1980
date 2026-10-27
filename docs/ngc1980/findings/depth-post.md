# ngc/depth-post: desktop post pipeline (AO, bloom, filmic grade) and the blue discs

Branch `ngc/depth-post`, from `ngc/shader-library` at 4a47cbb. Part of the "depth pass" after the user's report on the
RenderKit build: *"add more depth and drag it away from this roblox low tech look ... in every aspect"* (first person
at a home-island base, desktop, real GPU, 133 fps at 1080p). Files: `game/js/renderkit/gamepost.js` (the pipeline),
the `RENDERKIT post` block in `game/js/main.js`, `game/js/war.js` (`tracer()`, the blue-disc fix). Scene:
`tools/scenes/depthpost.mjs` (on/off A/B, AO and bloom debug views, draw-time A/B per tier). Shots:
[evidence/depth-post](../evidence/depth-post/).

## 2026-10-27 - The blue glowing discs in the sky are round sparks, not RenderKit

**Finding:** the three soft blue-white circles near the masts and the lattice tower in the user's screenshot (about
60-80 px across at 1080p) are the war's rounds in flight. `war.js` drew each `b`/`ciws` round as ONE soft additive
point sprite (fx.js `add` pool, radial-gradient `softTex`) per frame at the round: own rounds 0.9 m, enemy 1.1 m, and
the RUNAWAY WASP drones' pulses (`b.col = [0.55, 0.95, 1]`, rotary.js) 1.3 m. At 100+ fps a round moves 0.7-1.4 m per
frame and its last 5-8 sparks (life 0.05-0.06 s) overlap into one soft ball. Cyan added onto the blue sky saturates the
blue channel first, so the centre reads pale cyan-white: exactly the user's discs. They hang "near the masts" because
the base's guns and the WASPs fight over it. **Not RenderKit:** the code path and the sprite are identical with `?rk=0`
(fx.js `Pool`, no kit material); the post did not add them. Headless runs never show them: at 2-5 fps a frame's dt is
longer than the spark's life, so it dies before it is drawn.
**Evidence:** zoomed crop of the user's shot (radial falloff, additive brightening over the tower leg = a soft additive
sprite, not geometry); the colour arithmetic above; `depthpost.mjs` "tracers" view, which replays a 133 fps frame
through the war's own spark function with the pool stepped 1/133 s per frame: before
(`evidence/depth-post/tracers-before.png`, old code) vs after (`tracers-after.png`).
**Cause:** a per-frame point sprite sized for 20-30 fps play; at high frame rates the overlap makes a ball.
**Action:** `war.js` `tracer(b, x, y, z, px, py, pz)` (exposed as `war.tracer`): each frame a round draws a short streak
of 1-4 small sparks along the step it just flew (own 0.2 m, enemy 0.2 m, WASP pulse 0.42 m, fading towards the tail),
same colours as before (own cyan, enemy orange, WASP pulse b.col). A round now reads as a thin bolt; the bloom pass gives
the bright core its glow instead of a 1.3 m sprite.

## 2026-10-27 - The pipeline: depth AO, bloom, filmic grade, all in one file with tiers

**Finding / Action:** `gamepost.js` no longer wraps the library's `createPostPipeline` (whose single grading pass
cannot do AO or bloom); it builds its own pipeline with the same contract (display-referred, see rk-fx.md) and the same
interface (`rkPost.post.render/target/hdr/uniforms`, `tick`, `set`, so rkfx-xr/rkfx-motion still hook it). `post.js`
is untouched, the kit fixture stays 20/20. Per frame on the plain desktop world view:
1. world -> scene target (RGBA8, sRGB-tagged XR-style, 4x MSAA) **with a DepthTexture** (24-bit, resolved by Three's
   MSAA blit).
2. **AO**, half res: SAO-style, 10 taps (golden-angle spiral, fixed interleaved-gradient rotation: no temporal
   shimmer), face normals reconstructed from depth (per axis the neighbour with the smaller depth step, so silhouettes
   are clean), range-checked taps (a foreground silhouette or the sky never occludes: no halos), world radius
   `clamp(0.3 + 0.014 z, 0.3, 2.5)` m, screen radius capped at 9% of the height, faded out 140-520 m. Two separable
   9-tap bilateral blurs (relative depth weight). Composite upsamples with 4 depth-weighted taps. Applied in linear light.
3. **Bloom**: threshold 0.8 (soft knee 0.14) on luma, or on the red channel for strongly warm colours (flames, hot
   cores; a clamped display-referred fire never reaches luma 0.8), Karis-weighted 4x4 prefilter at half res, 4-tap
   downsamples to 1/32, 3x3 tent upsamples (scatter 0.7), intensity 0.7. Nothing ordinary passes: the HQ, deck,
   island and sea views have an empty bloom buffer (no blanket haze); the RUNAWAY/capture beams, pad lights, white-hot
   flashes and glints do.
4. **Overlay**: the first-person arms + weapon (viewmodel, own depth clear) now draw into a second MSAA target with
   alpha, composited before bloom, so they get the same grade as the world (they were drawn on top, ungraded) and no
   world AO.
5. **Grade** (composite, display referred): decode sRGB -> AO -> overlay -> bloom -> highlight shoulder above 0.8 linear
   (`x/(x+room)` roll-off, bloom and glints compress instead of clipping flat) -> encode -> S-curve contrast 1.2 about
   0.42 (toe deepens shadows, shoulder opens highlights; 0 and 1 stay fixed so HUD-like whites stay white) -> chroma-aware
   saturation (0.9 overall, x0.82 more for chroma > ~0.6: the cyan pad paint and flat greens are pulled in most) -> split
   toning (shadows x[0.975,0.99,1.04], highlights x[1.035,1,0.955]) -> vignette 0.1, grain 0.
All numbers are in `POST_GRADE`, `POST_AO`, `POST_BLOOM`, `POST_TIERS` at the top of gamepost.js. Live:
`__G.rkPost.set('contrast', 1.3)`, `set('ao.intensity', 2.5)`, `set('bloom.intensity', 1)`, `set('debug', 1|2|0)`
(AO term / bloom alone), `setQuality('low')`.
**Tiers** (`?rkpost=`): `high` (default: AO 10 taps + 2 blur passes, bloom 5 levels), `medium` (AO 6 taps + 1 blur,
bloom 4 levels), `low` (grade only, one pass), `off` (no post at all: main.js draws direct, as `?rk=0` does for post).
**Evidence:** `evidence/depth-post/on-*-ao.png` (AO term: contact darkening under vehicles, sandbags, tree bases, gauge
wells and glare shield in the cockpit, no halo against the sky), `on-hq-foot.png` vs `off-hq-foot.png`,
`on-deck.png` vs `off-deck.png`, `on-burning.png` vs `off-burning.png`.

## 2026-10-27 - AO first cut striped the ground; positions must sit on texel centres

**Finding:** the first AO had horizontal dark stripes across the ground and the pad at grazing angles.
**Cause:** the half-res pass reconstructed each tap's position from its unsnapped uv while the depth texture is
point-sampled at the nearest full-res texel; at grazing angles depth changes fast per pixel, so every tap sat up to half
a pixel off its surface and read as occlusion.
**Action:** the centre and every tap uv are snapped to full-res texel centres before reconstruction; the stripes are
gone (run 14-15-41 vs 14-25-33 AO views).

## 2026-10-27 - Frame time A/B (SwiftShader, relative only)

**Evidence:** `depthpost.mjs` draw-time A/B in one page: the world alone vs world + post per tier, each a render +
1-pixel readback, median of 4, res 0.6 (768x432), 1280x720 window. Machine shared with other agents, +-20% noise.

| view | plain | low | medium | high |
|---|---|---|---|---|
| HQ first person (run alone) | 257 ms | 292 | 336 | 336 |
| HQ first person (2nd run) | 205 | 209 | 240 | 243 |
| carrier deck | 536 | 543 | 560 | 584 |

Read: the grade alone is in the noise to +14%; AO + bloom add ~+10-20% over that on a software rasteriser, where every
fullscreen pass is CPU work. Draw calls in the world pass are unchanged; the post adds 1 AO + 4 blur + 9 bloom + 1
composite fullscreen passes, all but the composite at half res or smaller. **Expected real-GPU cost at 1080p: about
0.6-1.0 ms** (AO 10 taps at 960x540 ~0.3-0.5 ms, blurs ~0.1, bloom chain ~0.15, composite ~0.1) on a mid-range desktop
GPU, plus the depth resolve the MSAA blit already did for colour. **OPEN:** not measured on hardware.

## 2026-10-27 - Anti-aliasing: no FXAA/SMAA added

**Finding:** the world target keeps 4x MSAA and the overlay target has its own 4x MSAA. In the shots the remaining
shimmer is sub-pixel geometry (thin masts and wires far away, 1-2 px wide at res 0.6), which FXAA cannot fix (it would
only soften every edge and the HUD-sharp first-person weapon) and SMAA would only partly. Not added; the right fix for
thin masts is geometry-side (minimum projected width / alpha-to-coverage lines), not post. **OPEN** for the materials or
nature owner if the user still sees mast shimmer.

## 2026-10-27 - Checks

`node tools/check.mjs syntax` 509/509; `smoke.json` 5/5; `rkfx-xr.mjs` 10/10 (postCalls 0 while presenting, flat
display included); `rkfx-motion.mjs` 7/7 (post clocks frozen on pause and reduced motion, target follows the pixel
ratio); renderkit fixture `tools/runs/depth-post` 20/20, 0 console errors; `depthpost.mjs` on and off, 0 page / console
errors. No conflict markers.

## 2026-10-27 - Open issues

- **OPEN** fires bloom only weakly: fx.js/GPU flames are dim orange at low opacity, often behind their own dark smoke,
  so few pixels reach the warm threshold. Bloom on fires is a job for the fx owner (brighter cores), not a lower
  threshold (which would bloom the cyan pad and white paint).
- **OPEN** the sea writes no depth (transparent), so it gets no AO (fine: no wave shimmer) and the sun glint check
  depends on the sky owner's sun disc / glint; in the test light the sea had no pixel above threshold.
- The dark band along the sea horizon in the deck/sea views is present with `?rk=0` too (sky/haze owner).
- AO is screen-space: off-screen occluders do not darken, and it fades out past 520 m by design.
