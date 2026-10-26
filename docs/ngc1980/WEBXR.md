# WebXR VR

The experimental game has an immersive VR host with head tracking, tracked controllers and optional hand tracking.
It runs the same island war, vehicles, research, logistics, inventory and medical systems as desktop. AR and mixed
reality are deferred, as requested. This is an experimental VR port: automated emulation verifies functionality;
comfort, readability and sustained frame rate on physical headsets still require hardware testing.

## Start

Run from the experimental checkout:

```sh
cd /home/jayjay/thrust-zarch-experimental
node tools/serve.mjs --port 8766
```

Open `http://localhost:8766/` in a browser with an available WebXR VR device and select **ENTER VR**. The button is
also present during play. Entry from the title starts a normal game; `?tech=all` opens the existing sandbox with all
unit gates available. Hand tracking is requested when **HAND TRACKING** is checked; a browser can grant the VR
session without that optional feature. Uncheck it for controllers only. No npm install or build is needed to play.

A standalone headset needs a secure origin. Two supported server arrangements are:

* USB debugging/forwarding on an Android headset: run `adb reverse tcp:8766 tcp:8766` on the computer connected to
  the headset, then open `http://localhost:8766/` in its browser. That computer must itself be able to reach this
  server on port 8766; Windows/WSL forwarding depends on the local network setup.
* HTTPS over the LAN, with a certificate for the server name/IP that the headset trusts:

  ```sh
  node tools/serve.mjs --host 0.0.0.0 --port 8767 --cert /path/to/cert.pem --key /path/to/key.pem
  ```

  Open `https://YOUR-SERVER-NAME:8767/`. This enables an explicit LAN listener; the default remains loopback.
  Certificate issuance, headset trust and the computer's firewall are local setup steps. A plain HTTP LAN address
  does not satisfy WebXR's secure-context requirement. The server's HTTPS test uses a temporary certificate and
  does not establish trust on a headset. See [Meta's secure-origin guidance](https://developers.meta.com/vr/documentation/web/port-vr-xr/).

**MENU / KEYS → EXIT VR** returns to desktop. A declined session request leaves the page usable and the entry button
available to retry. The browser/headset's own exit command works too.

## Controls

| Control | Aircraft / carrier bridge | On foot | Wheeled vehicles / armour |
|---|---|---|---|
| Right stick | Cyclic / flight stick; bridge wheel and telegraph | 30° snap turn, once per stick excursion | Turret / mounted-gun aim |
| Left stick | X pedals; Y adjusts collective/throttle | Walk, with smaller deflection for slower movement | Steer; forward, brake/reverse |
| Right trigger | Primary weapon | Aim with the right controller and fire | Fire mounted weapon |
| Left trigger | Secondary-weapon action | Aim down sights | Secondary action |
| Right grip | Wheel brake | — | Brake; over UI, secondary click |
| Left X / Y | MENU / KEYS / COMMAND | Same | Same |
| Right A / B | Get in/out / change view | Same | Same |

Aim either controller's ray at a panel and squeeze the trigger to click. Hold it while moving the ray to drag
inventory items or medical supplies. Point at a cockpit switch and trigger to operate its existing action. This
consumes the trigger, so clicking a switch does not also fire. Panel input captures movement and weapons.

The spatial toolbar provides **COMMAND**, **RESEARCH**, **MAP**, **PAUSE / BACK**, **RECENTRE**, and scroll buttons.
The full **MENU / KEYS** panel provides the existing keyboard actions, seat changes, 30° foot turns, held fire/
secondary buttons and **INPUT: HOTAS / KEYBOARD**. That input option retains head tracking and ray interaction while
using the existing physical bindings. Keys stay held while the pointer is held; Shift/Ctrl/Alt buttons latch until
toggled or the panel is released. Scroll with the buttons or a controller's vertical stick over a modal panel.
Grip + trigger, or **SECONDARY CLICK**, produces the original UI's right-click action.

For aircraft, use the craft's existing weapon-selection and master-arm actions: for example B selects Hornet bombs
and Enter releases the selected weapon. For infantry, Space jumps, R reloads, Tab opens gear and H opens health.
All of these are on the virtual keyboard. The ordinary [README controls](../../README.md) remain authoritative.

## Hands

When the browser supplies hand input, each hand has a 25-joint visual representation and a pointing ray. Point and
pinch to select; hold a pinch and move the ray to drag. Outside the interface:

* Aircraft: pinch the right hand and move it sideways/fore-aft for cyclic. Pinch the left hand and move it vertically
  for collective, sideways for pedals. Releasing recentres the virtual stick; it retains the collective setting.
* On foot: pinch and move the left hand to walk. Aim the right hand and pinch to fire. Use the turn buttons for body
  heading changes. The hand's movement while firing does not trigger a snap turn.
* Other actions remain accessible through MENU / KEYS. The held fire/secondary buttons also work with pinch input.

These are gesture controls and ray interactions. Reloading, inventory and treatment use the existing game actions;
physical magazine grabbing, two-hand weapon grips, hand collision and direct grasping of cockpit levers are remaining
VR ambitions. Extreme one-hand weapon poses can look unnatural with the adapted desktop arms. Controllers are the primary control scheme; availability and accuracy of hand rays depend on the
browser/device. See [WebXR hand input](https://www.w3.org/TR/webxr-hand-input-1/).

## Views and lifecycle

VR entry selects the cockpit/eye view. Head translation uses the game's metre scale and head rotation is independent
of the craft. **RECENTRE** sets the current head pose as the seated origin. Artificial helicopter vibration, jet
camera kick/G sag and infantry camera bob are suppressed in VR; actual vehicle pitch, roll and movement remain.
Walking uses body heading with snap turning. Room-scale movement changes the view, not the soldier's collision body.

Aircraft, vehicles, infantry, carrier bridge and CPU spectator render with two tracked eyes. Magnified tank sights,
thermal optics, binoculars and the original side-view cave game use a spatial screen in VR, preserving their existing
projection and controls. Leaving those modes restores the stereo world. These modes are not rebuilt as fully
volumetric VR instruments. The UI is a body-relative spatial panel sized to fit both eyes; leaning closer magnifies it naturally.

The game pauses when the XR session loses visible focus and releases held input when tracking/controllers disappear
or the session ends. Resume through PAUSE / BACK. Window resizing is deferred for the renderer until XR exit while
the spatial UI resizes immediately. Desktop projection and layout are restored on exit.

## Rendering and reproducible checks

The host uses the pinned Three r170 renderer's single `setAnimationLoop`, a tracking-origin rig and separate XR
camera. It does not change headset projection matrices to imitate zoom. `?xrscale=0.8` is the default framebuffer
scale; supported values are 0.5–1, chosen before entry. Foveation is requested through Three where supported.
The desktop `?res=` setting remains separate. No physical-headset frame-rate claim follows from the software tests.
Implementation references: [Three WebXRManager](https://threejs.org/docs/pages/WebXRManager.html),
[pinned r170 source](https://github.com/mrdoob/three.js/blob/r170/src/renderers/webxr/WebXRManager.js),
[WebXR session lifecycle](https://www.w3.org/TR/webxr/).

The HUD paints at most 10 times per second. Open HTML/SVG/canvas screens use a single asynchronous snapshot at a time,
with at least 250 ms between completed captures. Capture keeps visible panel subtrees and skips unrelated HUD and
hidden screens; inventory and medical drag targets remain their original DOM
elements. `game/vendor/html2canvas.js` is the unmodified ESM distribution of html2canvas 1.4.1, loaded only when needed;
its MIT license is adjacent. Configuration follows [html2canvas's documentation](https://html2canvas.hertzen.com/configuration).

Install test dependencies with `npm --prefix tools ci`. The game itself never imports the IWER emulator. Tests inject
the pinned Meta IWER 2.7.0 runtime before loading the page, request an actual emulated `immersive-vr` session, and
exercise its eye cameras, select events, controller axes and hand joints. [IWER documentation](https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html).

Run one browser at a time:

```sh
node tools/xrbench.mjs
node tools/servebench.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/xr.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/xrgameplay.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/xrlifecycle.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/xrextras.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/xrperf.mjs
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/smoke.json
CHROME_PATH=/path/to/chrome node tools/snap.mjs tools/scenes/startup.mjs --url http://127.0.0.1:8766/
node tools/check.mjs
```

`servebench` also needs OpenSSL for its disposable certificate. Browser artifacts include screenshots, assertions,
errors and benchmark samples in `tools/runs/`. Current reviewed evidence and limitations are in [VALIDATION](VALIDATION.md).
Hardware qualification still needs sustained sessions on standalone and PC-connected headsets, controller profiles,
hand occlusion/reacquisition, comfort, text readability, sound positioning and performance under a busy war.
The implementation report and shared-file changes are in [findings/webxr.md](findings/webxr.md).
