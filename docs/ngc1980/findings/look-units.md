# look-units: blueprint-first rebuilds of every real-world unit (2026-10-29)

Branch `ngc/look-units` from `ngc/shader-library` f8abdbb. Method: the milsim-blueprint skill (pin one airframe and
date, open-access drawings, cited dimension table, trace, loft, fit IoU >= 0.97 / max gap ~1 % per view, dated-photo
side-by-side, cockpit panels traced from the manual). Audit of every unit: [BLUEPRINT-AUDIT.md](../BLUEPRINT-AUDIT.md).
Evidence: `docs/ngc1980/evidence/look-units/<unit>/`. Headless timings are SwiftShader: relative only.

## 2026-10-29 - Audit: which models are drawn, which are boxes

**Finding:** none of the units outside the Huey / Tomcat workstreams was built from a drawing. All are primitives or
hand-typed rings inside overall dimensions from a TM or Jane's. Four real items exist twice (LCM-8, Phalanx, Sea
Sparrow, the M113 hull of the M163). **Evidence:** BLUEPRINT-AUDIT.md (19 real units, sources and licences found).
**Action:** rebuild in the briefed order, one unit per commit.

## 2026-10-29 - F/A-18A Hornet: pin, sources, dimension table

**Pin:** FSD #3, BuNo 160777, Naval Air Test Center, the carrier-suitability jet (USS America, Oct-Nov 1979); in summer
1980 only the eleven FSD jets exist (VFA-125 forms Nov 1980). The game's player jet already was this airframe.

**Sources** (`docs/ngc1980/reference/fa18a/SOURCES.md`): NASA Dryden F/A-18 three-view (Commons, 2865 px, PD); NASA
F-18 HARV three-view (3030 px, PD: an F/A-18A, used for the hook); NATOPS A1-F18AC-NFM-000 (2008, US Navy, PD) para
1.1.2 dimensions and fig. FO-1 front cockpit F/A-18A; dated USN photos of 160777 (USS America 1979) and 160775 (KA-3B
tanking, April 1979).

| Dimension | Value | Source |
|---|---|---|
| Length | 56 ft = 17.07 m (nose tip to stabilator tip) | NATOPS 1.1.2; drawing calibrated on it: 111.42 px/m |
| Span over tip rails | 37 ft 6 in = 11.43 m (drawing reads 11.58 m, +1.3 %: drawing kept, both recorded) | NATOPS 1.1.2 / NASA three-view |
| Span with AIM-9s / folded | 40 ft 5 in = 12.32 m / 27 ft 6 in = 8.38 m | NATOPS 1.1.2 |
| Height to fin tops | 15 ft 3 in = 4.65 m (side view 4.72 m, front view 4.63 m) | NATOPS 1.1.2 / NASA |
| Height to closed canopy | 10 ft 6 in = 3.20 m (drawing 3.36 m on its ground line) | NATOPS 1.1.2 / NASA |
| Wheelbase / main track | 5.51 m / 3.09 m (Jane's 5.42 / 3.11) | NASA side / front view |
| Nose tip to main wheels | 11.08 m (old model 9.2 m) | NASA side view |
| Wing LE sweep / anhedral | 25.5 deg / 3.2 deg | NASA top / front view |
| Fin cant | 20 deg (front view reads 18-21 deg) | NATOPS fig. / NASA front view |
| Nozzle exit | centres x +-0.38, y -0.12, z 6.05; exit r 0.30 (cruise) | NASA side / top view |
| Hook | pivot (0, -0.66, 3.22), arm 2.97 m, tip on the deck at z 5.89 | NASA HARV side view (114 px/m on its wheelbase) |
| Design eye | (0, 0.88, -5.05): 0.43 m under the canopy top, 0.93 m aft of the bow | NASA side view |
| DDI display / standby dials | 5 in / 2 in and 3 in: 2126 px/m on FO-1 | NATOPS FO-1 |

Frame: the sim's (origin at the CG, main wheel centres z 0.6, wheel contact y -2.05) so jetfm's physics stays put;
the airframe moved round it. Conversion once, in `game/js/units/air/hornetgeo.js` (G).

## 2026-10-29 - F/A-18A: the box model was 17 % short ahead of the main gear

**Finding:** on the NASA three-view the old model's silhouette fit was side IoU 0.674 (max gap 2.18 m), top 0.784,
front 0.788: nose to main wheels 9.2 m against the drawn 11.08 m, the wings and LEX hand-placed, the fins 0.5 m too
far aft, the nozzles 1.8 m aft of the real exit. **Evidence:** `evidence/look-units/fa18a/ref_side.png`,
`ref_top.png`, `ref_front.png` (left: before). **Cause:** 17 hand-typed rings and slab outlines, no drawing.
**Action:** rebuilt from the trace:
* `tools/blueprint/fa18a/` (configs, `merge.mjs`, `fitall.mjs`, `panel-fo1.json`) -> `units/air/fa18trace.js`.
* `units/air/hornetgeo.js`: fuselage loft (superellipse sections from the side/top trace, tumblehome and crown from
  the front view, arc-length UVs), canopy loft on the drawn sill with the fairing behind the seat, D-section intake
  ducts with splitter gap, the LEX from the traced top outline, airfoil wings / stabilators / canted fins on the traced
  planforms (control surfaces as chord strips of the same airfoil, so they close flush), stabilator actuator fairings,
  F404 nozzles at the drawn stations.
* `jetmodel.js` keeps every handle, name and the animate() / hookTip() / parts API; JET constants now come from the
  drawing (gear, hook, stations, EYE, SEAT, COCKPIT_SHIFT).

**Fit after** (`node tools/blueprint/fa18a/fitall.mjs`, masks from `dev/jet-preview.html?ref=<view>&mask=1`):

| view | IoU before | IoU after | max gap after |
|---|---|---|---|
| side (fins and the AIM-7 masked) | 0.674 | **0.987** | 0.099 m (0.58 %) |
| top (planform, runs through the centre line) | 0.784 | **0.980** | 0.18 m (1.05 %) without the 9 trailing-edge columns z 2.20-2.29; 0.72 m with them (the TE runs parallel to the columns: a 1 px offset reads as metres) |
| front (canopy + intake bands) | 0.788 | **0.981** | 0.072 m (0.42 %) |
| front canopy band | 0.668 | 0.977 | 0.072 m |
| front intake band | 0.903 | 0.983 | 0.054 m |

Residuals on the configuration list, not fudged: the AIM-7 Sparrows semi-recessed under the nacelles (in the drawing,
not carried by the game's jet), the front view's lower belly (0.04-0.08 m lower than the side view says: the views of
the drawing disagree by that much; front registered on the canopy top).

## 2026-10-29 - F/A-18A: 160777 was white and blue in 1979, not gull grey

**Finding:** the model wore the fleet gull grey over white with an INFERRED day-glo fin band. The dated USN photograph
of 160777 trapping aboard USS America in 1979 shows the McDonnell Douglas FSD scheme: gloss white, dark blue wing tops
and LEX, a blue band down each fin's leading edge widening to an all-blue tip with the FSD number in white, a cream
radome tip; 160775 (April 1979) shows the same scheme with MARINES aft of the intake insignia on the right side and a
thin blue chine stripe. **Evidence:** `reference/fa18a/photo-yf18a-160777-uss-america-1979-hires.jpg`,
`photo-yf18a-160775-ka3b-1979.jpg`; `evidence/look-units/fa18a/proportions.png` (photo left, model right).
**Action:** repainted; the fin band is a chord station of the fin loft (no stair-steps); NAVY on the left side is
INFERRED (the FSD jets' split titles; not in either photo).

## 2026-10-29 - F/A-18A cockpit moved with the airframe; main panel traced from FO-1

**Finding:** fixing the airframe put the design eye 0.70 m further forward and 0.10 m lower than the old cockpit; and
the old panel had its DDIs at x +-0.255 (6.8 cm too far out) and 12 cm low against the UFC. **Action:** jetcockpit.js
is built in its old frame and shifted as a block (`COCKPIT_SHIFT`); `JEYE` follows; the HUD projection works in the
build frame (no change in conformality). The main panel items sit at their FO-1 centres (`PANEL_FO1`, scale from the
5 in DDI, checked on the 2 in and 3 in standby dials to 4 %); the seated pilot figure uses `JET.SEAT`. Coaming strips
close the gap between the consoles and the narrower drawn canopy rail. **Evidence:** `evidence/look-units/fa18a/`
cockpit shots. Deviations (in panel-fo1.json): the right vertical panel is not modelled, so the caution light panel
stays on the main panel face; the EFD keeps its landscape canvas at the traced centre.

## 2026-10-29 - F/A-18A: levels of detail and budgets

**Finding / action:** LOD0 the full model; the lofted skins have mid (1/6) and far levels; past 700 m the whole jet is
two draws (coarse skins + wings, LEX, fins, stabilators baked at rest), every separate part dissolves by 700 m (small
fittings, decals, lamps by 180 m). `perfbudget.mjs`: hornet 59 draws / 9.6 k tris at LOD0, 67 / 13.5 k at 200 m,
20 / 6 k at 800 m (budget 160 / 110 / 40 draws): `enforce: ALL`.

## 2026-10-29 - F/A-18A: tests

| check | result | base (shader-library, same machine) |
|---|---|---|
| `node tools/check.mjs syntax` | 565/565 | |
| `node tools/check.mjs types` | 605 (baseline 606) | 606 |
| `scenes/jetmodel.mjs` (wheel contacts, hook tip on the drawn hook, cockpit volume clear, every surface sense) | PASS 4/4 | (old contract) |
| `scenes/jettrap.mjs` (trap with the moved hook and gear) | PASS 7/7 | |
| `SCENE=jettrap.mjs scenes/mergecheck.mjs` | PASS 8/8 | |
| `scenes/perfbudget.mjs` (hornet now `enforce: ALL`) | PASS: 59 / 67 / 20 draws | 152 / 160 / 160 |
| `scenes/jet.mjs` | 6/10 | 6/10, identical failures (keyboard throttle ramp under load) |
| `scenes/hornetcockpit.mjs` | 9/11, then 6/12 | 10/10 twice |

**Finding (open):** hornetcockpit fails at `waitFor apu === "READY"`. A debug run shows the APU timer advancing
normally (READY 12 s of jet time after the click, ~66 s wall, the same as base). snap.mjs's waitFor also gives up once
40 s of wall time have passed if a single frame then takes over 1 s. The new jet adds about 8 shader programs (LOD and
dissolve ranges: 21 against 13 outside, 26 in the cockpit). Compiling these when the view first turns to the console
plausibly causes that >1 s SwiftShader frame. **Action taken:** every part dissolves on one range (700 m), and all
paints are smooth Phong (one variant less). **Remaining:** a shader prewarm at jet build (renderer.compile) would remove
the first-look compile on real GPUs too. That is a main.js / jetplay change, left for the owner of the render loop.

## 2026-10-29 - F/A-18A: shader precompile, lighter LOD0 skin (coordinator: "precompile the Hornet's shaders")

**Action:** jetplay.js compiles every program of the jet and its cockpit right after the jet first draws (a
one-triangle warm-up handle catches renderer / camera; the compile runs in a setTimeout after that frame: compiling
inside the render pass broke three's state, `Cannot read properties of null (reading 'state')`). No main.js change. The
LOD0 fuselage dropped from 150 x 48 to ~115 x 36 quads (fit unchanged: side 0.986, top 0.980, front 0.981). Smoke
and flare ports moved to the drawn nozzle / belly stations.

**Finding (load, not logic):** hornetcockpit with the precompile: 9/10 (FUEL LO), 10/10 (flagged only for a source edit
mid-run), 9/11 (APU READY) in three runs; base 10/10 in three runs. Measured cockpit frame times on the cat in the same
session (SwiftShader, res 0.6, a loaded machine): median 1.37 s (base 1.08 s) looking out ahead, 0.87 s (0.82 s) at the
panel, 0.45 / 0.48 s (0.43 / 0.48 s) at the consoles. Frames sit near the 1 s limit of snap.mjs's waitFor (it gives up
once 40 s have passed and a single frame takes over 1 s). The base trips that limit less often, the new jet a little more.
On a real GPU these are 1-2 ms frames.

## 2026-10-29 - CH-46E Sea Knight: pin, sources, dimensions

**Sources:** NADC-81118-60 (Naval Air Development Center 1981, DTIC ADA134320, public domain) fig. 2-1 "Helicopter
Geometry": a dimensioned three-view of the CH-46E, the master; a dated 1983 USMC photo of an HMM-261 CH-46 on USS Guam.
No CH-46 NATOPS manual is publicly available (only sold copies), so the cockpit panels were not traced; the CH-46
cockpit (ch46cockpit.js) is unchanged.

| Dimension | Value | Source |
|---|---|---|
| Fuselage length | 45 ft 8 in = 13.92 m (calibration: 99.4 px/m) | fig. 2-1 |
| Rotor diameter | 51 ft = 15.54 m (the figure's top view draws 50 ft) | fig. 2-1 label, NNAM, NASM |
| Hub spacing | 33 ft 4 in = 10.16 m label; STA 96.1 / 492.4 = 10.07 m, drawn 10.06 m | fig. 2-1 |
| Height to the aft hub | 16 ft 8 in = 5.08 m (drawn 5.10 m) | fig. 2-1 |
| Wheelbase | 24 ft 10 in = 7.57 m (drawn 7.52 m): nose 5.08 m ahead of the hub midpoint, mains 2.43 m behind | fig. 2-1 |
| Main gear track | 3.78 m (top view; the front view's 14 ft 4 in reads 8 % short: the front view is too small to trust) | fig. 2-1 |
| Cabin width | 7 ft 3 in = 2.21 m (top view 2.24 m) | fig. 2-1 |
| Shaft angles | 9.5 / 7.0 deg forward of the datum; the datum sits 3.4 deg nose-up on the gear -> 6.1 / 3.6 deg | fig. 2-1 |

## 2026-10-29 - CH-46E: rebuilt on the drawing

**Finding:** the old model (20 hand stations, a level box cabin 2.26 m tall, nose gear at -4.6, mains 1.6 m aft)
fit fig. 2-1 at side IoU 0.833 (max gap 0.96 m), top 0.888. **Action:**
* `tools/blueprint/ch46e/`: the side view traced by trace3view.mjs from a cleaned copy (the dimension extension lines
  closed the area under the belly); the top view, crossed by blades and disc arcs, read by a column scan in `merge.mjs`
  (outermost run inside the cabin / sponson band, to the line's centre; blade crossings left null) -> `ch46trace.js`.
* `ch46model.js`: fuselage stations every 0.06-0.2 m from the traced profiles (side outline, the drawn cabin roof line
  under the pylons, top-view widths; the nose rounds into a bulb), pylons with traced tops, sponsons with the top view's
  plan (bulging to x 2.0 only between z 1.0 and 2.55), round cabin windows and the escape hatch at the drawn stations,
  gear, hubs (2.53 / 3.33 m, 10.06 m apart), shaft tilts 6.1 / 3.6 deg, blades 51 ft, nacelles on the pylon flanks, the
  ramp as the drawn sloping underside (hinge z 3.55, 3.77 m, lip on the deck when lowered). The drawn 3.4 deg nose-up
  posture is kept (the cabin floor starts at z -4.3: ahead of it the drawn belly rises to the floor line).
* `ch46fm.js`: gear contact points moved to the drawn stations (were INFERRED).

**Fit after** (`node tools/blueprint/ch46e/fitall.mjs`, masks from `dev/ch46-ref.html?ref=<view>&mask=1`):

| view | IoU before | IoU after | max gap after |
|---|---|---|---|
| side (masts, gear masked) | 0.833 | **0.985** | 0.22 m (1.59 %): the pylon's trailing-edge corner and the forward mast's edge |
| top (to z 6.15) | 0.888 | **0.977** | 0.20 m (1.45 %) without z 1.15-1.21, where the drawn sponson outline has a break; 0.48 m with it |

**Deviations (on the list, not fudged):** aft of z 6.15 the drawing's plan tapers to 0.5 m at the tail while the ramp
(the squads walk on it) stays 2 m wide; the flight model keeps its 50 ft rotors and its hubs 0.3 m lower with 4.5 deg
shafts (fig. 2-1 gives STA / WL and 9.5 / 7.0 deg: for the flight-model owner).

**Levels (perf recipe):** past 700 m the CH-46 is one coarse draw (fuselage every 4th station, pylons, sponsons);
every other part dissolves by 700 m. `perfbudget.mjs`: 54 / 54 / 3 draws at near / 200 m / 800 m (budget 160 / 100 /
40): `enforce: ALL`.

**Tests:** `scenes/ch46fly.mjs` (the player's CH-46 end to end: cold start, 13 Marines up the ramp, flight, landing,
dismount) 16/19 on look-units and 16/19 on the base under the same load, identical failures (the boarding waitFor and
the 45 kt waitFor time out at ~1 fps in SwiftShader); every screenshot checked (deck, cockpit, cabin, LZ, dismount).
* `SCENE=ch46capture.mjs scenes/mergecheck.mjs` (the AI CH-46 taking SANDBAR): no merged part moved (`bad: []`). The
  scene's AI waitFors timed out at ~1 fps: 3/14 expects; the AI did lift off and fly to the LZ. **UNTESTED against the
  base:** the base comparison run was stopped part-way when the PC was handed back. Rerun both on a quiet machine
  before merging (ch46capture on look-units and on ngc/shader-library).
