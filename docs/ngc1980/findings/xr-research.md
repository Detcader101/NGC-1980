# XR research: PC VR (Quest 3 over Steam Link, SteamVR, Chromium/Edge), branch `ngc/xr-research`

Scope: why the game misses 120 Hz on the user's PC, why there is no sound in the headset, and why the HUD looks
"weird". Weapons are out of scope. The data comes from the Steam logs of the 2026-10-26 sessions
(`C:\Program Files (x86)\Steam\logs`), `tools/runs/client-log.txt` (`?xrlog`) in the experimental checkout, and the code
at `e27ca3d`. The web research cites Chromium/three.js source wherever possible. Tags: **[src]** means read in the
source, **[log]** means measured here, **[forum]** is anecdotal, and **[inference]** is reasoning.

## 2026-10-26 - Hardware and settings inventory

**Finding.** The hardware is far beyond what the game needs. The bottleneck is not the GPU (see the next entry).

| Item | Value | Source |
|---|---|---|
| CPU | AMD Ryzen 9 9950X3D, 16C/32T | /proc/cpuinfo |
| GPU | RTX 5080, driver 616.92 (32.0.16.1692). WebGL runs on it: `ANGLE (NVIDIA, RTX 5080, Direct3D11)` | vrcompositor.txt, client-log |
| iGPU | AMD Radeon (Ryzen). SteamVR enables direct mode on both NVIDIA and AMD; compositor and WebGL are both on NVIDIA (no cross-adapter copy) | vrserver.txt |
| Monitor | M185LS on the NVIDIA HDMI/DP audio endpoint, so it is on the RTX | vrserver audio list |
| SteamVR | 2.18.4 (v1792185270); OpenXR active runtime = SteamVR | vrserver.txt |
| SteamVR resolution | Auto. GPU speed 4759 MP/s gives an ideal scale of 4.35×, **clamped to 1.5× area** (`gpuSpeedRenderTargetScale 1.5`). With Quest 3 at about 2064×2208 per eye at 100%, 150% is **2528×2704 per eye**, which matches the 5056×2704 swap texture | vrcompositor.txt, steamvr.vrsettings |
| Refresh | `preferredRefreshRate 120`. Steam Link offers 72/80/90/120 and negotiated 120.0048 Hz | vrserver/driver_vrlink |
| Mirror | `showMirrorView: true` (a desktop mirror window, small cost) | steamvr.vrsettings |
| Steam Link | Client `qvlclient;eureka;2.0.24.2395`, NVENC, `VTE_USE_ENCODE_TARGET_WIDTH = 1280` (the default automatic encode size), 10-bit encode supported. Codec and bitrate are not in the logs; they are set on the headset | driver_vrlink.txt |
| Network | Wi-Fi ping 5–6 ms p50, 8.7 ms p99. Fine | vrlink_aftm CSV |
| Audio | 35 playback devices (Voicemeeter VAIO ×N, THX, NVIDIA HDMI, Realtek USB…). SteamVR switches the Windows default playback device to **Steam Streaming Speakers** on start, and vrlink captures from that device at 48 kHz | vrserver.txt |
| RAM / Windows build / HAGS / power plan / Game Mode | **Not read.** PowerShell is refused inside this isolated agent worktree. WSL sees 15 GB, which is the WSL cap, not the host total | — |

To fill the gaps, the user can run this one read-only line in PowerShell:
`Get-CimInstance Win32_OperatingSystem | select Caption,BuildNumber; (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB; (Get-ItemProperty HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers).HwSchMode; powercfg /getactivescheme`
(HwSchMode 2 = HAGS on).

**Hurts VR.** 120 Hz is set while the app cannot reach it, and the mirror view is on. HAGS is unknown; it has mixed
reports for Steam Link [forum]. If streaming stutter appears, test it both on and off.

## 2026-10-26 - Frame rate: CPU/sync-bound in Chromium's serial XR loop, not GPU-bound

**Finding.** In VR the game runs at about 35–40 fps, quantised to whole vsyncs of the 120 Hz display. SteamVR
measures the GPU as nearly idle.

**Evidence.**
- vrcompositor.txt, game session (chrome pid 36824, 4 min 20 s): 9221 presents, about **35 fps**,
  `ApplicationTime CPU: 23.2 ms / GPU: 0.225 ms`, 0 dropped, 0 reprojected. For comparison, the bare `xrtest.html` sessions
  ran at **117–119 fps** with ApplicationTime CPU 1.3–2.0 ms (Edge pid 38500 and Chromium pid 12148). Browser plus runtime
  can do 120 Hz; the game's frame cannot.
- Steam Link frame CSVs (`vrlink_aftm_2026-10-26-18-{41,45,50}*.csv`, about 100 s each, game running), measured with a
  small node script:

  | | p10 | p50 | p90 | p99 |
  |---|---|---|---|---|
  | interval between frames (WaitGetPoses) | 16.7 | **25.0** | 33.3 | 41.7 ms |
  | WaitGetPoses → app submit | 10.7–18.4 | **18.7–20.6** | 30.6–32.6 | 37–41 ms |
  | NVENC encode | 2.9 | 3.0 | 3.2 | 3.4 ms |
  | headset decode | 7.5–11 | **11–13** | 14–15.5 | 16–17 ms |
  | submit → photons | 36.5 | 40–44 | 47.5 | 48–50 ms |

- In-page timings (client-log XRFRAME): JS sim 3–5 ms, prep 0–2 ms, render-submit 4–9 ms. That is about 11 ms of JS
  against 19–20 ms from pose to submit as SteamVR sees it.
- Earlier IWER benchmark (`docs/ngc1980/evidence/webxr-2026-10-26/benchmark.json`): about **1230 draw calls and 890k triangles per
  XR frame**. three r170 draws every object once per eye (no multiview in r170: `multiview` does not occur in
  `game/vendor/three.module.min.js`), so this is about 615 objects ×2.

**Cause.**
- Chromium's OpenXR render loop is **serial, with no pipelining**. `ShouldDelayGetFrameData()` withholds the next frame until
  `MarkFrameSubmitted()`, and `xrWaitFrame` is called inside `BeginFrame` [src: device/vr/openxr/openxr_render_loop.cc,
  openxr_api_wrapper.cc]. Submit waits on a GPU fence, then always composites or copies into a single side-by-side sRGB
  swapchain texture, then `xrEndFrame` [src: openxr_graphics_binding_d3d11.cc].
- So one XR frame costs roughly the sum of these: JS (about 11 ms), plus the GPU process decoding and executing about 1230
  WebGL draws through ANGLE/D3D11, plus the copy, plus IPC between renderer, GPU process and XR utility process.
  That sum is about 19–20 ms. Anything over 8.33 ms misses a 120 Hz slot, and the runtime then waits for the next vsync,
  so the interval jumps to 16.7, 25 or 33 ms [inference].
- The GPU itself does almost nothing: 0.2 ms by SteamVR's measure. Lowering the resolution will barely help; cutting
  JS and draw calls will.
- Headset decode at 11–13 ms is high. It is set by the encode resolution and bitrate, and adds latency but not judder.

## 2026-10-26 - WebXR Layers on Chromium/Windows: root cause of "no frame ever"

**Finding.** The workaround in `runtime.js` (hiding `renderState.layers`) is correct and should stay.

**Evidence.**
- `WebXRLayers` is stable and on by default, so Blink exposes `renderState.layers`. three r170 then calls
  `createProjectionLayer` [src: runtime_enabled_features.json5, device/vr/public/cpp/features.cc, three WebXRManager.js r170].
- The Windows D3D11 OpenXR binding returns `SupportsLayers() == false`, and `CanUseSharedImages()` is true only for WebGPU.
  The `layer_manager` pipe is bound only when layers are supported, and `ShouldDelayGetFrameData()` holds frames while
  `RequiresSharedImages() && !IsUsingSharedImages()` [src].
- The layers path therefore stalls the loop [inference]. No crbug was found [unverified].

**Action.** Keep the code workaround. `--disable-blink-features=WebXRLayers` is an equivalent launch flag [inference].
Multiview is unavailable regardless: it needs layers, desktop Chrome does not reliably expose `OVR_multiview2`, and r170
has no multiview path.

## 2026-10-26 - APIs that are no-ops on PC Chrome

- `renderer.xr.setFoveation(1)`: Chrome's `XRWebGLLayer` IDL has **no `fixedFoveation`** attribute, and three only sets it if
  it is defined [src: xr_webgl_layer.idl]. It costs nothing, but it does nothing on PC. Steam Link applies its own
  foveated encoding.
- `XRSession.frameRate / supportedFrameRates / updateTargetFrameRate`: `[RuntimeEnabled=WebXRFrameRate]`, status
  *experimental*, absent by default. No `XR_FB_display_refresh_rate` handling was found in the OpenXR loop [src, partly
  unverified]. **Set the refresh rate in Steam Link/SteamVR, not in code.** The new `SESSIONSTART` log line now prints
  whether these exist.
- `setFramebufferScaleFactor(0.8)` multiplies SteamVR's recommended size, which is already 150% here. The two compound
  [src: openxr_api_wrapper.cc]. The effective per-eye size is about 2022×2163.

## 2026-10-26 - No audio in the headset: device routing, not the game

**Finding.** The game's AudioContext reports `running 48000Hz`, and Steam Link captures Steam Streaming Speakers. So the
browser's output is probably not reaching that endpoint. **OPEN**: needs one check on the PC.

**Evidence.**
- vrserver.txt: SteamVR sets the default console, multimedia and communications playback devices to Steam Streaming Speakers
  `{8d2878fc…}` at start. vrlink logs `WSAPI: Found Steam Streaming Speakers … capture starting … Init(48000)`, with a
  stereo 32-bit float mix.
- Both audio tests in client-log were in the portable Chromium 158 (18:36 and 18:52). Edge was never tested for audio.
- The game creates the context with no `setSinkId`, so it follows the system default (`game/js/audio.js` `Sfx.init`), and
  nothing suspends it on blur or visibility change.

**Likely causes, in order [inference/forum]:**
1. A Windows per-app device assignment pins `chrome.exe`/`msedge.exe` to another output. Check Settings → System → Sound →
   Volume mixer → App volume and device preferences. Voicemeeter setups commonly leave these; reset to Default.
2. The browser mixes into Voicemeeter or another device, or the per-app volume for the browser is muted in the mixer.
3. Chromium silently falls back to a fake output stream when it cannot open the device. AudioContext still says
   `running` [inference]. Check `chrome://media-internals` → Audio tab: the output stream should show the device and
   no "fake" fallback.
4. The Steam Streaming Speakers default format or exclusive mode. Forum fix: 48 kHz 32-bit, "allow exclusive control" off.

**Quick tests.**
- Play a YouTube video in the same browser while in VR.
- Repeat in Edge.

**Possible code change (not made).** `?xrsink`: after `enumerateDevices()` (which needs the mic permission to reveal labels,
a drawback), `sfx.ctx.setSinkId(id)` for the "Steam Streaming Speakers" label. This is only worth it if checks 1–3 do not
explain the problem.

## 2026-10-26 - "The HUD was weird": geometry and filtering of the VR panel

**Finding.** The compact HUD quad has five problems [code, `game/js/xr/panel.js` + `runtime.js` `prepare()`]:
1. **Too big and too close to the edges.** It is 2.8 m wide at 1.8 m, about **76° wide by 46° tall**, and text is drawn at the
   desktop positions (top-left war/fleet lines, bottom fuel line, radar top-right). So the HUD sits 30–38° off-axis,
   at the blurry edge of the Quest 3 lenses, and needs eye and head turns to read.
2. **Depth conflict.** `depthTest:false` with `renderOrder 10000` draws the panel at 1.8 m *over* cockpit geometry
   0.5 m away. Stereo disparity says "far" while occlusion says "nearest". This is the classic uncomfortable,
   "weird" look.
3. **Shimmer.** `LinearFilter` with no mipmaps on a canvas the size of the desktop window, minified into an eye buffer
   of about 2000 px. Its resolution also changes with the browser window size.
4. **Steppy updates.** It repaints and uploads a full window-sized RGBA texture every 100 ms whether or not anything changed.
5. **Dark halo.** The text has a 4 px dark shadow over a transparent background.

**Action (recommended, not made: needs in-headset judgement):**
- Use a fixed canvas, for example 1536×640, and draw only the HUD lines.
- Place it at 1.2–1.4 m wide at about 1.6 m (≤40°), centred about 12° below eye level, in the vehicle frame as now.
- Give it real depth (`depthTest:true`, placed in front of the instrument panel), or fade it when the ray hits nearer
  geometry.
- Turn on mipmaps: power-of-two canvas, `generateMipmaps:true`, `LinearMipmapLinearFilter`,
  `anisotropy = renderer.capabilities.getMaxAnisotropy()`.
- Set `texture.needsUpdate` only when the text hash changes.
- Keep the full-window copy only for modal pages, which are already html2canvas snapshots.

## 2026-10-26 - Recommendations (prioritised)

| # | Change | Where | Expected effect | Measure |
|---|---|---|---|---|
| 1 | **Run 90 Hz in Steam Link now** (or 72 Hz). With a serial pose-to-submit of about 19 ms, 120 Hz gives a 16.7/25/33 ms jitter mix; at 90 Hz a sub-11 ms pipeline is reachable, and until then the game gets a steady half rate (45) instead of jitter | Steam Link / SteamVR settings | Smoother motion immediately, lower decode load | aftm CSV interval distribution; SteamVR Advanced Frame Timing |
| 2 | **Cut draw calls in VR** (about 1230 → ≤500 per frame). Distance-cull or LOD small props, crowd, sealife and particles harder in XR (shorter `far`, `layers` for "detail" objects disabled in XR); merge static island/base meshes; use `InstancedMesh` for repeated units/trees. Every object costs 2 draws in r170 XR | `world.update`, `pool`, `sealife`, `interiors`, terrain windows; `runtime.prepare()` sets `xrCamera.far = camera.far` | Each ~100 objects removed saves ~200 GPU-process draws. Expect pose-to-submit 19 → about 11 ms [inference] | `calls`/`tris` now in the XRFRAME log; SteamVR ApplicationTime CPU |
| 3 | **Trim per-frame main-thread work in VR**: skip `markers.draw` (its 2D layer is invisible in VR); throttle `updateHud` DOM writes to about 5 Hz while `XR.active`; skip `updateDynRes` (already done) | `main.js` `frame()` | 1–3 ms of JS; fewer style/layout passes | XRFRAME `prep`, `sim` |
| 4 | **Rebuild the VR HUD panel** as in the HUD entry: smaller, lower, depth-correct, mipmapped, dirty-only uploads | `xr/panel.js` `api.update`, `runtime.js` `prepare()` | Fixes "weird HUD"; removes a 10 Hz texture-upload hitch | Headset screenshots; `panel.paints` versus changes |
| 5 | **Resolution**: leave three's scale at 0.8 with SteamVR Auto (150%), or set SteamVR to 100% and `?xrscale=1`. The GPU is idle, so this is about clarity, not fps. Do not raise both | SteamVR → Video; `?xrscale` | Neutral for fps; sharper text at 100%×1.0 compared with 150%×0.8 (2064 vs 2022 px per eye, about the same) | ApplicationTime GPU stays <2 ms |
| 6 | **Audio checks** 1–4 above (per-app device mapping first). Add `setSinkId` only if needed | Windows Sound settings; optional `audio.js` | Sound in the headset | `chrome://media-internals` |
| 7 | **Steam Link stream**: fixed bitrate of about 80–150 Mbps instead of Auto if stutter is seen; HEVC or AV1 (AV1 needs RTX 40+, available here) [forum]. Keep encode width about 1280 unless text clarity needs more. Decode is already 11–13 ms | Headset Steam Link settings | Fewer stream hitches; lower decode time with a lower encode size | aftm "Decode", "Encode" |
| 8 | Keep **layers hidden** (current code), **antialias on** (the GPU is idle), and the **mirror view** optional (`showMirrorView` off saves a little) | — | — | — |

**Recommended defaults for this machine.**
- Steam Link 90 Hz.
- SteamVR resolution Auto (150%) with three `xrscale` 0.8, or 100% with `xrscale=1`.
- Motion smoothing / throttling on per-app default.
- Revisit 120 Hz only once XRFRAME shows pose-to-submit < 7 ms (JS ≤ 5 ms and calls ≤ about 400).

**What to measure next session.**
- Run with `?xrlog`. The new `SESSIONSTART` line logs the real base-layer size, antialias, foveation and
  frameRate/supportedFrameRates. `XRFRAME` lines now include `calls` and `tris` of the main eye pass.
- Keep the matching `vrlink_aftm_*.csv` and the vrcompositor "Cumulative stats" for the session. Use 90 Hz versus 120 Hz
  as the first A/B.

## 2026-10-26 - Code change on this branch

**Action.** Diagnostics only, active only under `?xrlog` except for two counters:
- `game/js/xr/runtime.js`: `state.calls`/`state.triangles` are captured right after the main stereo pass in `render()`.
  Capturing them there means later overlay passes cannot reset `renderer.info`.
- `game/js/xr/runtime.js`: `SESSIONSTART` now reads Three's layer via `manager.getBaseLayer()`. Before, it logged `{}` because
  `renderState.baseLayer` only applies on the next frame. It also logs frameRate and supportedFrameRates.
- `game/js/main.js`: the `XRFRAME` log line adds `calls`/`tris`.

`tools/scenes/xrlifecycle.mjs` passes 15/15 with 0 page errors and 0 console errors (headless SwiftShader + IWER).

## Sources

- Chromium: `device/vr/openxr/openxr_render_loop.cc`, `openxr_api_wrapper.cc`, `windows/openxr_graphics_binding_d3d11.cc`,
  `windows/openxr_platform_helper_windows.cc`, `device/vr/public/cpp/features.cc`, `device/vr/README.md`,
  `third_party/blink/renderer/modules/xr/{xr_render_state,xr_session,xr_webgl_layer}.idl`,
  `third_party/blink/renderer/platform/runtime_enabled_features.json5` (https://chromium.googlesource.com/chromium/src/+/HEAD/…);
  texture-array layer copy overhead: https://chromium.googlesource.com/chromium/src/+/f543e1d7bb3bc5d9c00c54b0452ef68d0ce43003
- three.js r170 `WebXRManager.js`, `WebGLRenderer.js` (https://github.com/mrdoob/three.js/tree/r170/src/renderers);
  doubled info counts in XR: https://discourse.threejs.org/t/webxr-triangle-count-info-seems-doubled/25410 ;
  EffectComposer in XR: https://discourse.threejs.org/t/webxr-not-working-with-effectcomposer/47761/2
- Chrome WebXR support and sandbox flags: https://immersiveweb.dev/chrome-support.html ; one adapter per Chrome:
  https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips ; AudioContext.setSinkId:
  https://developer.chrome.com/blog/audiocontext-setsinkid
- Meta: multiview https://developers.meta.com/horizon/documentation/web/web-multiview/ , FFR
  https://developers.meta.com/horizon/documentation/web/webxr-ffr/ , spatial UI cost
  https://developers.meta.com/horizon/documentation/iwsdk/concepts/spatial-ui/
- Steam Link: https://help.steampowered.com/faqs/view/0E2C-406B-9135-38A4 ; AV1/HEVC update
  https://www.techspot.com/community/topics/steam-link-app-update-adds-av1-codec-hdr-support-and-more-for-enhanced-streaming.289185/ ;
  120 Hz stutter / fixed bitrate https://steamcommunity.com/app/353380/discussions/11/4038102936180056187 ; audio
  https://steamcommunity.com/app/353380/discussions/11/4038102936186536349 ,
  https://communityforums.atmeta.com/discussions/OtherTroubleshooting/quest-3-no-sound-via-steam-link/1218030 ; Voicemeeter
  per-app routing https://forum.vb-audio.com/viewtopic.php?p=4380 ; wired USB beta
  https://www.uploadvr.com/steam-links-latest-public-beta-adds-wired-usb-support-on-quest-headsets/
- SteamVR frame timing: https://developer.valvesoftware.com/wiki/SteamVR/Frame_Timing ; HAGS:
  https://steamcommunity.com/discussions/forum/1/6725643788916625334 , https://uploadvr.com/hardware-accelerated-gpu-scheduling/
