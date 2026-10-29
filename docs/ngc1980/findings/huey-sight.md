# huey-sight: the pilot's armament sight (ngc/huey-sight)

Branch `ngc/huey-sight` from ngc/shader-library 200e0d7. User request: "remove the crosshair in the huey, replace it
with the real holographic sight that the huey has that flips down from the top of the interior hull."

## 2026-10-29 - What the real sight is (it is a reflex sight, not holographic)
**Finding:** the sight that flips down from the cabin top in front of a Huey pilot is the **M60-series helicopter
reflex sight (XM60 / XM60E1 / M60A1)** on the **infinity reflex sight mount**, part of the helicopter armament
subsystems that carry the 2.75 in rocket launchers (XM156 multiarmament mount: XM16 / XM21 / M158 launchers). It is a
*reflex (collimating) sight*: a lamp-lit reticle projected through a collimator onto a beam-splitter glass so it
appears at infinity. Holographic sights came decades later; the user's word "holographic" is logged as the reflex
sight.
**Evidence (open access, US Army, public domain; files and URLs in `reference/uh1/SOURCES.md`):**
- TM 9-1090-204-12 (1967, XM156 mount): para 1-3b "The reflex sight XM60 provides a projected reticle image, enabling
  the pilot to fly a target-collision course by maintaining the target at the center of sight reticle pattern";
  1-3d "The reflex sight mount is attached to the top of the aircraft cabin and holds reflex sight XM60 in operating
  or stowed position"; fig 1-4 (sight on its mount, decal bracket with the elevation-setting table), fig 1-5 (mount:
  hub with STOW INDENT and OPERATE INDENT, locking lever, headguard); table 1-4 (sight 9.10 lb, elevation /
  depression limits +-88.9 mils); table 2-2 (reticle lamp toggle on top, "either ON position" lights it; rheostat
  knob upper left, clockwise brighter; elevation / depression knob, white up / red down, detents); para 2-8 (before
  firing: sight from stow to operate, reticle lamp on, position and intensity adjusted); fig 2-4 (launchers
  boresighted to the sight pip).
- FM 1-40 Helicopter Gunnery (1973): para 11-19c "The pilot uses the XM60/XM60E1 infinity sight ... to aim the
  rockets and the stowed automatic guns. When this sight is not in use, it may be stowed near the helicopter's
  ceiling in front of the pilot"; figs 4-1 and 4-3 (the reticle: pipper, circle, a ladder of short horizontal ticks,
  two broken horizontal bars each side; "a tank 15 m long covers 20 mils"); para 4-6 (harmonisation: select a target
  at 1,250 m for UH-1B/C/M; "80 mils for the XM60 sight").
- Enthusiast cross-check (URL only): centaursinvietnam.org XM21 page, "mounted on the windshield frame above the right
  seat ... stowed by pivoting to the left".
**Open:** these manuals cover the UH-1B/C (XM156) and the 1973 gunnery doctrine; a 1980 US Army UH-1H with M158
launchers is the game's fit option (Army UH-1H slicks rarely carried rockets). The reticle colour (amber-orange
here) and the lamp's exact hue are not stated in the sources found.

## 2026-10-29 - Model and behaviour
**Action:** `game/js/hueysight.js` (used by the hi-fi cockpit, hueycockpit.js):
- mount plate, hub, drop plate with lightening holes, locking lever, aiming-data decal (the fig 1-4 table), sight
  housing (rounded casting), azimuth ring, graduated elevation drum (white / red graduations) on the left, rheostat
  knob upper left, reticle lamp toggle on top, level vial, beam-splitter glass in its hoop, the collimator below;
- the swinging part pivots about the fore-aft hub axis: OPERATE hangs it in front of the pilot's eye (glass 0.35 m
  ahead of the design eye on the sight line), STOW swings it up inboard under the ceiling; animated;
- **collimated reticle:** a shader in the glass turns each fragment's view ray into the airframe's frame and draws the
  FM 1-40 pattern by angle (mils): fixed to the airframe at infinity, no swim with head movement, visible only through
  the glass; each XR eye uses its own camera position. Evidence `collimation_head_moved.png`: the pipper stays on a
  marker 250 m out with the head moved 4 cm / 3 cm and turned;
- controls: \` (backquote) or a click on the housing flips it OPERATE / STOW; click the lamp switch (on / off), the
  rheostat (25 / 50 / 75 / 100 %); default STOW; the first rocket fired from the cockpit with it stowed swings it down
  (the crew's para 2-8 step);
- the generic crosshair (the 3D reticle and the screen-centre dot) is gone in the Huey cockpit only (other units keep
  theirs; chase views keep the aim line); switches still show the hover frame;
- **boresight:** the M158 launchers are fixed, so the rockets now leave along the airframe's boresight (before: the
  hat-steered door-gun aim). The sight line is harmonised to the rocket pair's mean point at 250 m (the game's
  rockets: 105 m/s, 1.2 m/s^2, 3 s life; the real harmonisation range is 1,250 m, scaled) seen from the design eye:
  14.5 mils below the airframe axis, 2.2 mils left (parallax of the right seat).
**Evidence (tools/scenes/hueysightfire.mjs, in the game):** each rocket the game launches is captured (launch point,
velocity, the simulation's frame) and flown with the war module's law to 250 m: left rocket az -6.6 / el 0.0 mils,
right rocket az +5.9 / el +0.1 mils; the pair's mean is 0.35 mils from the pipper (the two pods 3.6 m apart give the
+-6 mil spread, inside the 10-mil ticks). `rockets_fired.png`, `pilot_eye_ingame.png`.
Other evidence: `stowed.png`, `deployed.png`, `deployed_outside.png`, `tm_vs_model.png` (TM fig 1-4 vs the model),
`reticle_vs_fm.png` (FM fig 4-1 vs the collimated reticle on the 250 m marker).
**Door guns:** the M23 M60Ds are flexible, aimed by the gunner / crew chief, not by the pilot's sight (FM 1-40: the
pilot's XM60 is for the rockets and *stowed* guns); the game's door gun keeps its hat aim; its tracers fall on the
reticle's tick ladder when the hat is centred (not separately harmonised).

## Tests (load average ~40 throughout)
| Check | Result |
|---|---|
| check syntax | PASS 692/692 |
| check types | 572 (baseline 572) |
| hueysight (dev turntable views) | PASS, 0 errors |
| hueysightfire (rockets vs reticle, in the game) | PASS 4/4 |
| hueycockpit | PASS 7/7 |
| hueyhotas | PASS 11/11 |
| xrgameplay | PASS 26/26 (new step: the Huey's VR cockpit with the sight swung down, both eyes: `xr_stereo.png`) |
| smoke | PASS 5/5 |

## Open
- The elevation drum is modelled but not operable: the reticle is fixed at the 250 m harmonisation (no
  per-range settings from the decal yet).
- Reticle colour unverified; XM60E1 / M60A1 differences not modelled.
