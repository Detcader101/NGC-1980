# One-click VR benchmark (`?xrbench`): 2026-10-26

Branch `ngc/xr-bench` from `experimental` e27ca3d. The goal is hard numbers and pictures from the real Quest 3 /
Steam Link / RTX 5080 setup with a single ENTER VR click. On the headset, XR frame time is 17–33 ms against an 8.3 ms target.
AudioContext reports `running`, but the user hears nothing, and the VR HUD "was weird". Usage is in [WEBXR](../WEBXR.md#vr-benchmark-xrbench).

## What was built

* `game/js/xr/bench.js`: the tour, measurement, pictures and report. Six views go through the game's own paths:
  `getInOut` on deck, `resetZarch` to an airborne Huey with a collective height hold, `launchJet`, then an airborne
  Hornet `J.reset` with the existing `JP.autopilot` test hook, `m60C.spawnAt` + `crafts.control`, a Huey hover at the island
  with the most units/rounds within 500 m, and `commander.open()`. There are no render shortcuts, and the XR camera/head tracking is
  untouched. Damage is off through the existing `G.bench` flag, so AA fire cannot end a view. The views are 15 s each, and
  the first 3 s are not measured because of streaming and shader compiles.
* Hooks: one `XRB?.frameStart()` at the top of `frame()` and one `XRB?.frameEnd(...)` after the render submit in
  `main.js`. Construction is under `?xrbench`, and `XR.room` is exposed from `runtime.js`. `index.html` seeds `Math.random`
  under `?xrbench` (`&seed=N`).
* `tools/serve.mjs`: `POST /__bench?run=&name=` is loopback only, needs the `X-NGC-Bench: 1` header (so other web pages
  need a preflight that the server never grants) and checks Origin against Host when one is sent. Run and file names are
  whitelisted (`png|json|html|txt`, no `..`), resolved paths must stay in the run folder, the size limit is 64 MB per file and
  a run holds at most 200 files. The responses are `200 saved`; a 204 to `fetch()` showed as `net::ERR_ABORTED` in Puppeteer.
* `tools/xrbenchreport.mjs`: a console table for a run (newest by default). `tools/scenes/xrbenchrun.mjs` covers the whole
  tour under IWER against a real `serve.mjs` child on a free port, the endpoint's refusals, files on disk and an early-exit run.

## Measurement details

* XR frame-to-frame time comes from the rAF timestamps. Wall time between callbacks and callback start minus frame time are
  recorded too. CPU sim/prep/render come from the existing `frame()` timings.
* `renderer.info.autoReset` is off during the tour and reset at frame start, so draw calls/triangles count every pass in
  the frame (the flat optics path renders twice). It is restored afterwards.
* GPU time: one `TIME_ELAPSED` query per frame over the whole frame, read back asynchronously and dropped when disjoint.
  Chrome on Windows may not expose the extension. The report then says so, and GPU cost has to be read from frame time minus CPU time.
* Panel: `XR.panel.update` is wrapped (restored at the end) to time the synchronous paint and to flag the frames
  that paint. The report compares dt and render-submit times on paint and non-paint frames, because each paint re-uploads a
  window-sized canvas texture.
* Audio: an AnalyserNode is connected from `sfx.master`. AnalyserNodes are pulled without a destination connection,
  so no audible change. The report records RMS/peak per view, `state`, `sampleRate`, `baseLatency`, `outputLatency`,
  `sinkId`, master gain, the audio clock's rate against wall time and the visible output devices. If the RMS is well
  above silence and the clock runs at 1×, the game is producing sound and the problem is the Windows output device / Steam Link audio
  routing.
* Pictures per view: (1) the XR frame drawn again into an offscreen target at the session framebuffer size. This uses
  the same scene, `XR.camera` (Three's ArrayCamera eye viewports) and overlay pass, then the left eye is read back. (2) The left eye read directly from
  the XR framebuffer (`baseLayer.framebuffer`) in the same rAF callback. (3) The panel canvas. Captures happen after a view's
  measured window, so their stall lands in the next view's settle time.

## Gotchas found

* The first eye re-render used a 4× MSAA target and was black except for the rifle. Three resolves and invalidates
  an MSAA target after each `render()`, so the infantry viewmodel's second pass started from undefined pixels. The target is single-sampled now.
  A re-render through a separate camera with XR disabled also put the viewmodel in its desktop pose. Rendering through
  the real ArrayCamera keeps the tracked VR pose.
* An offscreen target only shades like the headset layer when it is marked `isXRRenderTarget` with sRGB colour space
  and an explicit `RGBA8` internal format. Three then applies the output colour space and keeps the storage linear-coded.
* The desktop status line under ENTER VR is rewritten when `isSessionSupported` resolves, so the benchmark note is
  a separate element.

## What the emulated pictures already show about the HUD

These are IWER/SwiftShader pictures, with controllers at the emulator's default poses. The real run will show the headset version.

* The panel is one plane the size of the desktop window (canvas `innerWidth × innerHeight`) with depth testing off,
  1.8 m ahead and up to 2.8 m wide (≈75° of view). The HUD text lines, hint, message and minimap are drawn at their desktop
  pixel positions across the whole view. They float over the cockpit and instruments (the Hornet's HUD and the Huey's
  panel get overwritten by text), the minimap hangs in the sky top-right, and the toolbar crosses the instrument
  panel. The panel's resolution and text size follow the desktop window size, here the `--app` window.
* On foot, the tracked rifle in the right hand and a second long weapon at the bottom centre are both visible.
* A `say()` message from the previous craft stays on the panel into the next view until its timer runs out (not
  bench-specific).

## Headless verification

`tools/scenes/xrbenchrun.mjs` with 8 s views passes 36/36. It covers:

* one click through all six views;
* each view in its intended craft;
* timings and counters;
* eye and panel PNGs saved;
* the audio probe sampling;
* html2canvas captures on the board view;
* a self-contained `report.html`;
* the endpoint's refusals;
* a clean session end with the desktop result box;
* a mid-tour exit that saves a partial report, restores `G.bench`/`autoReset`/autopilot and leaves the game paused.

The pictures were reviewed: the re-rendered eye matches the framebuffer read-back in the views compared (deck, Huey), and every view shows the
intended scene. Example run: `tools/runs/xrbench-2026-10-26_19-28-48`. SwiftShader numbers are meaningless for the headset:
GPU ≈ 330–550 ms/frame, CPU 6–21 ms, ~2–3 fps. They do show that the timer query, info counters and the audio probe work.
The master bus measured −45 to −31 dBFS RMS with a running context and a 1× audio clock.

Other checks on this branch: `node tools/xrbench.mjs`, and `xr`, `xrlifecycle`, `xrextras`, `xrperf` and `smoke.json` all pass.
`xrgameplay` fails 24/25 on "weapon trigger does not request driving throttle" (`XR.pad` is null). The same failure
reproduces on unmodified `e27ca3d`. It comes from the "VR input overrides only while used" change: `XR.pad` is null once
the controllers have been idle for 1.5 s. It is a stale test expectation, not this branch.

## Not verified here

Everything on real hardware: Chromium-on-Windows behaviour of the timer-query extension, `performance.memory`,
`longtask` and `sinkId`; whether the XR framebuffer can be read back on SteamVR (the report records a reason when it
cannot, and the re-rendered eye still works); the cost of the end-of-view capture at full Quest 3 resolution;
and whether the hover hold copes with a connected HOTAS throttle that moves (the existing collective arbitration switches to the
HOTAS). The user's server on 8766 must be restarted from a checkout with this branch for `/__bench`. Otherwise the
page offers SAVE REPORT.
