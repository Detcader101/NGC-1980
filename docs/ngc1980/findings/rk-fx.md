# ngc/rk-fx: RenderKit particles and desktop post

Branch `ngc/rk-fx`, from `ngc/shader-library` at 7a62f55. Files: `game/js/renderkit/gamefx.js` (GPU emitters),
`game/js/renderkit/gamepost.js` (post wrapper), hooks in `game/js/fx.js` and `game/js/main.js` (marked
`RENDERKIT fx` / `RENDERKIT post`). Scenes: `tools/scenes/rkfx.mjs` (on/off A/B shots), `rkfx-perf.mjs`
(frame time), `rkfx-xr.mjs` (IWER VR bypass), `rkfx-motion.mjs` (clocks, reduced motion, resolution step).
Shots: [evidence/rk-fx](../evidence/rk-fx/). Gated on `RK.on('fx')` and `RK.on('post')`; with `?rk=0` neither
module builds anything, `fx.update` gets the same dt as before and `drawDesktop` takes the old path.

## 2026-10-27 - Post must be display-referred: a linear post target would wash out the game's own shaders

**Finding:** the library's post contract (linear scene target, tone mapping + sRGB encode in the final pass) is
wrong for this game. Four game files use their own ShaderMaterials (`main.js` terrain, `fx.js` particles and decals,
`sealife.js`, `armorsight.js`), none includes `<colorspace_fragment>`: they write display (sRGB) values straight to
`gl_FragColor`. In a linear target these would be encoded a second time by the final pass (washed-out terrain,
pale smoke). The game also has no tone mapping anywhere (`renderer.toneMapping` 0).
**Evidence:** `grep -l colorspace_fragment` over the four files finds none; `rkfx.mjs` post state eval:
`toneMapping 0, ocs srgb`, post target `[768,432,4,UnsignedByte,srgb]` at res 0.6.
**Cause:** the art was authored display-referred without tone mapping.
**Action:** `gamepost.js` marks the post target the way Three treats an XR framebuffer (`isXRRenderTarget = true`,
texture colour space sRGB), so built-in materials encode into it exactly as onto the canvas and custom shaders write
what they always wrote: the target holds the old frame pixel for pixel. The final pass runs with
`outputColorSpace = Linear` (no second encode) and `NoToneMapping`, both restored afterwards. **Tone-mapping decision:
NoToneMapping everywhere** (desktop with post, desktop without, XR), so `?rk=0` and VR keep the old look and HUD /
Basic materials cannot be shifted. Grading is therefore in display space and kept light: vignette 0.10,
saturation 0.96, contrast 1.03, grain 0, temporal 0, night vision 0. A/B shots of the deck, both cockpits and the
pause menu match the old frame apart from the faint vignette (on-/off-*.png).

## 2026-10-27 - Post target: 4x MSAA, 8-bit; follows dynamic resolution; renderView crafts bypass it

**Finding:** the canvas is created with `antialias: true`; an unsampled post target would have dropped MSAA.
The library's half-float target doubles bandwidth for no gain in a display-referred frame (values are clamped 0..1
on the canvas anyway).
**Evidence:** first full-res A/B with half-float + MSAA: burning view 370-400 ms (off) vs 495-560 ms (on) on
SwiftShader. After switching to RGBA8: see the frame-time entry below. `rkfx-motion.mjs`: after
`setPixelRatio(0.6)` the target is `[768,432]` = the drawing buffer (PASS).
**Action:** `samples = min(4, maxSamples)`, `texture.type = UnsignedByte`, `internalFormat = 'RGBA8'` (pins a plain
format on the sRGB-tagged texture). The target is sized from the drawing buffer every frame, so dynamic resolution
needs nothing extra. Crafts with their own `renderView` (the M60's TTS thermal picture, already its own post pass)
draw directly, with no post on top; the night-vision tint is not used because the only NV-like view is that thermal
sight. The foot overlay (arms + weapon) renders after post with its own depth clear; DOM HUD and the marker canvas
are untouched, so text stays sharp.

## 2026-10-27 - GPU particles: what was replaced, what was added

**Finding / Action:** `gamefx.js` adds pooled `createParticleSystem` emitters, never one per shot:
- 10 burning-wreck slots (flames `fire` 28 + embers `sparks` 18). Each frame the nearest burning `fx.emitters` claim
  slots; for those, `fx.js` skips its CPU flame particles (CPU smoke stays). Distant/overflow fires keep CPU flames.
- 8 explosion spark bursts (non-looping, radial velocities written into `rkVelocity`), round robin; they replace the
  CPU spark loop in `fx.explode` (CPU fireball, smoke, dust, debris unchanged).
- one rotor-downwash emitter under the player's Huey (`dust` over land, `snow`-kind spray over water), fed by
  `fx.downwash()` from the existing downwash block in `main.js`; the CPU dust stays as well.
Emitters sit at world points that do not move while their particles live (wreck, burst centre, ground under the
disc). Additive kinds skip the library fog (which mixes additive colour toward the fog colour and leaves a pale
smudge at range) and fade with distance over the game's fog near/far instead. No soft particles:
`setDepthTexture(null)` (no opaque depth prepass exists). No rain/snow or temporal motes: the game has no
precipitation and no time-travel moment to attach them to (seaweather.js is sea state only); the `temporal`
post uniform stays 0 for the same reason.
**Evidence:** `rkfx.mjs` burning eval `gpuFires 5, add 0` (CPU flames handed over); on-07-burning.png,
on-sight-burning-8x.png, on-06-blasts.png.

## 2026-10-27 - First fire tuning was white blobs; dust kind made lacy rings over the sea

**Finding:** with the preset fire colours (doubled in the shader) and opacity 0.5, overlapping additive quads
saturated to white; at the M60's 8x day sight the fire was a white mass. The `dust` kind's FBM-carved edge read as
ring-shaped lace over water.
**Evidence:** run 2026-10-27_09-33-22-rkfx-on 12-m60-day-sight.png (white) vs evidence on-sight-burning-8x.png
(orange flames under the smoke); 09-rotor-spray.png in that run (rings) vs on-09-rotor-spray.png (droplets).
**Action:** flames `0xe0782a -> 0x8a260a` at 0.24 opacity, embers/sparks warm orange; spray uses the `snow` kind
(round, no turbulence). Dust 0.42 opacity: it is subtle next to the existing CPU dust and rotor shadow (augment).

## 2026-10-27 - Clocks: pause freezes, reduced motion freezes post and hides embers

**Finding:** `fx.update(dt)` ran during the pause menu (smoke kept drifting). With the kit on it now gets 0 while
`G.state === 'paused'`, so the CPU pools and the GPU emitters share one frozen clock; the post clock too.
`prefers-reduced-motion` (live media query) freezes the post clock, forces grain/temporal to 0 and hides the
decorative embers; gameplay effects (explosions, fires) keep running.
**Evidence:** `rkfx-motion.mjs` 7/7 PASS (fx.time, rk.time and post seconds unchanged over 1.5 s paused; reduced
motion frozen, grain 0, temporal 0). With `?rk=0` the old behaviour (fx runs while paused) is unchanged.

## 2026-10-27 - XR never uses the post chain; GPU particles render in both eyes

**Evidence:** `rkfx-xr.mjs` (IWER Quest 3) 10/10 PASS: post renders on the desktop title, `post.render` call count
stays constant while presenting, also through the flat spatial display (M60 gunner sight in VR: `flat true,
postCalls 0`), and resumes after leaving VR; GPU fires drawn in VR (vr-fire-stereo.png, vr-gunner-flat-display.png).
**Cause / Action:** `drawDesktop` checks `renderer.xr.isPresenting` (true in the flat-display path too, where
`XR.render` calls drawDesktop into its own target) and `gamepost.render` refuses as a second guard.
The tools symlink must point at `/home/jayjay/thrust-zarch-experimental/tools/node_modules`: the root checkout's
`tools/node_modules` has no `iwer`.

## 2026-10-27 - Frame time A/B (SwiftShader, honest limits)

**Evidence:** `rkfx-perf.mjs`, `--seed 7`, 30 intervals after 8 warmup, interleaved off/on/off/on, 1280x720:

| view | res | off (ms, two runs) | on (ms, two runs) |
|---|---|---|---|
| deck | 0.6 | 525 / 357 | 376 / 408 |
| burning (5 wreck fires) | 0.6 | 328 / 316 | 340 / 356 |
| deck | 1.0 (8-bit target) | 447 / 408 | 505 / 510 |
| burning | 1.0 (8-bit target) | 402 / 391 | 385 / 471 |
| deck / burning | 1.0 (first, half-float target) | 458 / 370, 391 / 399 | 570 / 560, 511 / 495 |

Run-to-run noise on this shared, software-rendered machine is ±20%. Read: at res 0.6 the kit costs about +5-10%,
at full res about +10-20% on SwiftShader (the offscreen MSAA target, its resolve and one fullscreen pass, all on the
CPU here). Draw calls in the world pass are unchanged apart from at most ~21 visible emitter draws. Dynamic
resolution never engaged in headless runs (`updateDynRes` ignores frames over 250 ms); the post target follows a
forced pixel-ratio change. **OPEN:** no hardware-GPU or headset measurement; on a real GPU the extra cost should be
one MSAA resolve + one fullscreen pass, but that is not measured.

## 2026-10-27 - Checks

`node tools/check.mjs syntax` 498/498; `smoke.json` PASS (kit on) and PASS with `?rk=0`; `fx.json` PASS;
renderkit fixture `tools/runs/rk-fx` 20/20, 0 console errors; `rkfx.mjs` on and off 2/2 each, 0 console errors.
Thermal sight (on-13): no particle squares (the GPU group is hidden for a craft's own picture, whose heat-material
swap would turn the instanced quads into opaque squares).
