# WebXR integration — 2026-10-26

The requested target is immersive VR, tracked controllers and optional hand tracking. The implementation is on
`ngc/webxr`, based on the completed sandbox at `2745fb2`; implementation `e91f0a8`, panel `b1ea595`, pointer `433395b` and world-camera `bfd019b`
have final game tree `79685ee0377afe0eb907f098387cd237132f5261`. [WEBXR](../WEBXR.md) describes setup, controls and primary technical
references. [VALIDATION](../VALIDATION.md) records measured results and reviewed screenshots.

## Shared game, tracked views

The desktop animation loop, camera projection and DOM overlays did not provide a headset view. The new host uses
Three's XR animation loop and a separate tracking-origin rig. Aircraft, ground vehicles, infantry, the carrier
bridge and CPU spectator retain their existing simulations. Head motion is in metres; synthetic camera shake,
G sag and walking bob are suppressed. Optical magnification and side-view caves use a spatial screen so their
original projections and controls remain usable.

The Marine's desktop viewmodel used a separate origin camera and depth clear, which is unsuitable for stereo.
Its XR pass now places the weapon at the tracked ray and renders through the same eye cameras as the world.
Shoulders are anchored to the head instead of rotating the whole upper body around the controller. The tracked
origin/direction feed the existing game projectile path; game weapon tuning is unchanged.

## Existing actions through controllers and hands

The input adapter separates vehicle steering/throttle from weapon triggers, seeds aircraft throttle on entry,
provides foot snap turning and resets input on capture, tracking loss and session exit. Multiple older hosts
read different control paths; small hooks in `main.js`, vehicle hosts and the Marine route the adapter through
those paths. HOTAS polling mutates action dictionaries in place, so XR copies action values rather than sharing
those dictionaries. Secondary-weapon edges are retained for the jet hosts.

Optional hands supply joint visuals and select rays. Pinch-relative flight/walking controls and right-hand infantry
fire work without controller thumbsticks. Hand displacement while firing does not snap the soldier's heading.
Ray selection operates existing cockpit switches, including C-130 controls. UI/switch selection consumes the
trigger instead of firing a weapon at the same time.

HTML, SVG and canvas screens are copied to a spatial panel. Pointer events go to their original DOM targets, so
research purchases, medical/inventory drags, sliders and right-click actions keep their existing behavior. A
virtual keyboard exposes the remaining controls; closing it releases held keys and latched modifiers. Native
headset menus can end the session, and declined entry leaves desktop usable.

## Integration fixes found by the checks

* Screenshot review exposed a black dome and terrain centred at the tracking origin. Object render hooks received
  XR eyes whose local positions exclude the moving rig. Sky and both terrain windows now read the prepared world
  matrices directly, without recomputing Three's internally managed eye matrices. Browser assertions verify the sky
  centre and near-terrain grid against the rendered eye; the final screenshots and benchmark use the corrected world.
* The compact VR HUD draws text in different positions from the desktop HUD. Hidden desktop buttons are now excluded
  from ray hits, while spatial toolbar/modal controls retain their real DOM targets.
* Thermal sights previously forced output back to the desktop framebuffer. They now restore the caller's target,
  allowing the same thermal pass on the VR optical screen.
* A resized canvas texture retained its old WebGL allocation. The panel now disposes that allocation on resize;
  the lifecycle rerun checks that no WebGL validation warnings appear. Panel width fits the narrower eye frustum,
  fixing clipped controls in the resized spectator view.
* The research benchmark exposed expensive document cloning. Capture now keeps only visible modal subtrees, their
  ancestors and the toolbar. Sampled preparation CPU fell from 203.7 to 24.3 ms; overall software frame pacing is
  still poor. [Measurements and raw frame rows](../evidence/webxr-2026-10-26/benchmark.json) distinguish CPU phases
  from asynchronous capture elapsed time and physical-headset performance.
* Standing down a Hornet or Tomcat left its old catapult state occupied. Stow now clears it. The browser test stands
  down a Hornet and deploys a Tomcat through the real commander/roster path.
* A controller trigger could also be interpreted as the desktop “any button to start” action. XR pads now bypass
  that path, preserving pause/menu interaction.
* The first cockpit-switch test aimed from Three's stereo-union camera, which is shifted from the viewer pose.
  The test helper now converts coordinates using the XR frame's viewer pose. This was an emulator-fixture error;
  no enlarged switches or synthetic game callbacks were used to make the check pass.

## Dependencies, serving and ownership

New game files live in `game/js/xr/`. Shared hooks are in `main.js` (frame loop, input, views and switch dispatch),
`marine.js`/`rifleman.js`/`viewmodel.js`, the aircraft camera functions, ground driving hosts and `armorsight.js`.
`tools/serve.mjs` adds an explicit HTTPS certificate/key and bind-address option; its default remains loopback HTTP.
HTTPS tests use a temporary certificate, not a headset trust installation.
Malformed URLs, including encoded NULs, return an error without crashing the listener.

The game lazy-loads the unmodified html2canvas 1.4.1 ESM distribution, with its MIT license alongside it. Its upstream
formatting is preserved. Meta IWER 2.7.0 is a pinned test dependency and is injected only by the test harness.
The dependency audit at this pass reported zero known vulnerabilities.

## Open qualification and ambitions

The browser checks use IWER and Chrome SwiftShader under WSL. They establish integration behavior and screenshots,
not physical headset compatibility, sustained GPU frame rates, controller feel or readable text on every display.
The next qualification is a sustained standalone/PC-headset session through a busy war, including hand occlusion,
reacquisition, audio positioning, optical displays, comfort and UI readability.

Room-scale motion currently changes the view without moving the soldier's collision body. Native hand grabbing,
magazine manipulation, two-hand weapon grips and full-body pose work remain. Extreme one-hand weapon poses can
look unnatural with the adapted desktop arms. AR/mixed reality remains deferred as requested. The previous
sandbox's pacing, collision and broader branch-integration ambitions remain in [PLAN](../PLAN.md).
