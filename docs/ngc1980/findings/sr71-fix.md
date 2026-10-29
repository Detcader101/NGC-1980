# sr71-fix: the SR-71 after Jay Jay's first flights (branch ngc/sr71-fix, off ngc/shader-library 200e0d7)

Reports (Jay Jay, on the merged build with the air base and the 5.12 km terrain, `?fly=sr71`):
1. "first person camera mode doesn't capture mouse correctly, sometimes just looks straight down"
2. "the HOTAS controls work but the in-game animations are flipped"
3. "the interior doesn't look much like the interior of the Blackbird"
4. "cameras on and nav map don't change anything in blackbird, make sure that changes"

Format per the house rule: Finding / Evidence / Cause / Action.

## 1. Mouse look

| Finding | Evidence | Cause | Action |
|---|---|---|---|
| The mouse did not turn the head in the SR-71's cockpit; clicking captured the cursor anyway | main.js `craftLooks()` = every craft that is not the Huey and not a carrier jet (`isJet()`: jet / tomcat only) gets captured-mouse movement through `crafts.active.look(dx, dy)`; craftsr71.js had no `look()`, so the host's no-op ran and `head` never moved | the SR-71 is neither the Huey nor `isJet()`, so it was routed like a ground vehicle, whose own `look()` does the work - and it had none | `D.look(dx, dy)`: the head in the cockpit (same sensitivity and limits as main.js's jets: 0.0025 rad/px, yaw +-2.4, pitch -1.0..0.8), the chase camera's orbit outside; NaN deltas ignored |
| "Sometimes just looks straight down" | the only thing left moving the head was the HOTAS hat branch: `if (hatX \|\| hatY) head.pitch += hatY * 1.6 * dt` | a POV hat that rests off-centre (some HOTAS axes read -1 at rest; hotas.js maps the hat axis) walks the pitch to the -1.0 rad clamp: the floor. The Tomcat has the same branch but is usually flown with the mouse, which the SR-71 could not use | the hat counts only when it moves away from the value it had when you got in (a resting -1 is ignored until it is centred once); the head re-centres on enter, seat change and V; a NaN head is reset before the camera reads it |
| The pointer lock itself | `canvas` click -> `requestPointerLock` when `craftLooks()`: works the same as on foot / in vehicles | - | kept; the cockpit re-centres when the cursor is released (as in the Tomcat / Hornet) |

Test: `scenes/sr71.mjs` now feeds `crafts.active.look(200, 80)` and expects the head at yaw -0.5, pitch -0.2.

## 2. Animations against the inputs

Checked every animated control against the input and the flight model (`scenes/sr71controls.mjs`, 4/4, dev page
with the game's play code, the inputs through `P.override` = what the keyboard / pad / HOTAS paths produce):

| Control | Was | Now (checked) |
|---|---|---|
| Stick pitch (cockpit) | `rotation.x = -pitch` - pulling aft pushed the grip forward | aft = grip toward the pilot (+0.25 rad at full aft) |
| Stick roll | right = grip right | unchanged (it was right) |
| Throttles | `rotation.x = -0.5 + thr` - forward throttle swung the levers aft | forward = grips forward (-z); idle -> max AB 0.9 rad |
| Rudder pedals | none | added: right pedal forward for right rudder |
| Elevons (outside) | correct: aft stick = both trailing edges up, right stick = left TE down / right TE up | unchanged (verified) |
| Fins (all-moving rudders) | `setFromAxisAngle(axis, -rud)`: right pedal swung the trailing edges LEFT (the nose-left direction) | `+rud`: right pedal = trailing edges right = nose right (verified on both fins) |

The keyboard, gamepad and HOTAS all reach the same `P.ctl` (hotas.js normalises them), so one sign fix covers all three.

## 3. The cockpits, rebuilt from the sources

New references (all in `docs/ngc1980/reference/sr71/`, SOURCES.md updated):
- SR-71A-1 figures, public domain: 1-13 INSTRUMENT SIDE PANELS (forward), 1-14 LEFT CONSOLE (forward), 1-15 RIGHT CONSOLE
  (forward), 1-17 INSTRUMENT PANEL (aft), 1-18 / 1-19 LEFT / RIGHT CONSOLE (aft), 4-29 OPTICAL BAR CAMERA CONTROL PANEL, the
  SR-1 seat text (p. 1-199).
- Photos: Brian Shul's self-portrait in the cockpit (USAF, public domain): the black canopy interior, the side windows,
  the pressure suit; Bill Abbott's pilot and RSO cockpits with the canopies open (CC BY-SA 2.0): grey tub and console
  sides, black panel faces, the V of the centre and side panels under the hood, the long black stick; Jonathan Cutrer's
  Udvar-Hazy canopy close-up (CC BY 2.0): the pilot's trapezoid side window.

What changed (`game/js/units/air/sr71cockpit.js`):
- **Panel faces from the figures.** `tools/blueprint/sr71/consoles.json` outlines every panel / console face on its figure
  (polygons in figure px, the same 2821 px/m drafting scale as the traced fig. 1-12 centre panel: checked, fig. 1-14's
  console comes out 0.28 x 0.70 m, fig. 1-19's 0.25 x 0.52 m); `panelart.mjs` turns each into panel art
  (`game/img/sr71/*.png`): the figure's black faces kept, thin white strokes near black as the legends, page and outline
  areas as the console's grey; everything outside the outline cleared.
- **The forward cockpit layout as the figures' insets and the photos show it:** the traced centre panel (unchanged), the
  two instrument side panels folded back from its lower corners (45 deg) into the V, a black hood over them, the left
  console with the throttle quadrant (two levers side by side, as fig. 1-14) and the right console (SAS / autopilot,
  TACAN, interphone, IGV...), grey consoles and tub walls, a floor ~1 m under the eye, the long stick with the black grip,
  rudder pedals, the SR-1 seat (headrest with the inertia reel, the bucket, the yellow D-ring forward), the periscope.
- **The RSO's cockpit:** fig. 1-17's panel (the two triangular side panels, the viewsight under its round hood, the
  display below it) with a live viewsight (drift lines, the camera strip's edges, OBC RUN / STBY / OFF) and the display
  showing the moving map; the aft consoles (figs. 1-18 / 1-19); the **NOSE OBC control panel** (fig. 4-29) live in the
  radar panel's place (the OBC fit replaces it, per the figure's note): FILM REMAIN counter (one exposure per 1.75 s of
  running, as the text), POWER OBC / ON (green), OPERATE OPR / SRT-STP, MODE 10 / 55, FILM DRIVE (white while running);
  the bulkhead between the two cockpits.
- Photo side-by-side: `evidence/sr71-fix/cockpit-photo-sidebyside.png` (Abbott's photo vs the model from the same side and
  angle with the canopy skin removed, `dev/sr71.html?open=1&tgt=...`). Matches: the V of the centre and side panels, the
  consoles at elbow height either side, the stick between the knees, black faces over grey structure. Differences kept
  as open items: the photo's seat wears the museum's red covers (in service it was dark); the canopy does not open in the
  model; the side panels' exact fold angle is read from photos (no dimensioned figure gives it).

## 4. Cameras and the Nav Map

| Finding | Cause | Action |
|---|---|---|
| K did nothing visible | the cameras ran only above 60,000 ft and wings level (+-10 deg); below that K said "CAMERAS ON (LEVEL, ABOVE 60,000 FT)" once and nothing else happened; a pilot who had not finished the ~30 min climb never saw them work | they run from 20,000 ft (the strip scales with height: 0.7 km either side at 20,000 ft, 2.2 km at 75,000) within 15 deg of level; K always says the state and why: CAMERAS ON - RUNNING / NOT RUNNING: BELOW 20,000 FT (n,000) / NOT LEVEL (BANK n deg) / ON THE GROUND; the HUD weapons line and the hint show the same live |
| The big map (M) never opened in the SR-71 | the craft's own key handler took M (spikes AUTO / MAN) before main.js's map key | the spikes are SHIFT+M; M is the map again |
| The map did not show the SR-71's work, and lost her at Mach 3 | the map draws enemy units only inside the fog of war's sight; the photo intel reached the fog (`fog.intel`) but nothing drew the strips or the photographed targets; the map stayed where you panned it | `sr71C.mapOverlay` (called by main.js drawMap for every craft that has one): the photographed strips as cyan bands with their minutes of intel left, every photographed target as a red diamond with its kind and name where the film saw it, her track (cyan where the cameras ran), the strip being photographed now, an edge arrow with her range when she is off the map; `mapFollow`: while she flies the big map follows her (opened zoomed out to 0.4x once, then yours) and the minimap zooms out to ~5 km |
| The cockpit Nav Map Display (fig. 1-12 item 41) showed a grid | it was a placeholder | a moving map, heading up: the zone's square, the intel strips, the photographed targets, the track, the strip being photographed, the waypoint, the range |
| Pass results | the feed said "RECON PASS: ..." only after leaving the strip for 4 s | K off ends the pass at once; the feed says RECON PASS COMPLETE: n TARGETS PHOTOGRAPHED - by kind, then PHOTO INTEL: islands marked for 10 min; the board's status line carries CAMERAS RUNNING and n PHOTOGRAPHED |
| Outside the zone | the fog of war covers only the zone (look-terrain): past it the map shows what is near something of ours | the photographed marks and strips are drawn wherever they are, inside or outside the zone |

`scenes/sr71recon.mjs` (3/3): K at 75,000 ft over the enemy islands -> CAMERAS RUNNING · STRIP 4.4 KM; a 22 s pass ->
23 targets (4 HQ, 10 AA, 4 islands, 2 fuel, 1 factory, 1 carrier, 1 shipyard); K off -> RECON PASS COMPLETE in the feed,
30 photo-intel circles in the fog; K at 15,000 ft -> CAMERAS ON · NOT RUNNING: BELOW 20,000 FT (15,000).

## 5. Contracts kept

basesr71.js (the air base adapter) wraps `key`, `exit`, `update`, `hud`, uses `P.override` for the way home and an `out`
flag for "out of her shelter". Kept: `D.key(code, e)` still returns the play code's answer; `placeOnGround` / `placeInAir`
now set the base's `out` flag when it exists (its `parkAt` clears it after placing), so a placed SR-71 is present and can
be left with Y. `scenes/sr71.mjs`'s last step (7/8 on the merged head) failed because the scene's re-placed aircraft was
still "in her shelter" (`out` false) for the base, so Y could not get out; with the placement fix it passes. The scene
also restores the base's `P.override` after its scripted take-off instead of clearing it (clearing it removed the base's
way-home hook for the rest of the run).

## 6. Tests

(filled in at the end of the run)
