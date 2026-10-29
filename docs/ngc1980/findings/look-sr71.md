# look-sr71: the SR-71A Blackbird, from the drawings (branch ngc/look-sr71, off ngc/shader-library)

User (Jay Jay): "add a sr-71 blackbird unit with the use of Blueprint skill". The aircraft itself; the air bases outside
the control zone (big hangars, the SR-71 and C-130 flown "whenever we want") are another agent's work: see
**API for the bases agent** below. Process: the milsim-blueprint skill (sources, dimension table, trace, loft, fit,
photo side-by-side, configuration table, cockpit panel traced from the manual figure).

## 1. Pinned subject

**SR-71A 61-7964 (64-17964), 9th Strategic Reconnaissance Wing, Beale AFB, as photographed near Beale on 2 August 1981**
(DoD photo, public domain: `reference/sr71/photo-61-7964-beale-1981-08-02.jpg`). The nearest dated public-domain photo to
1980 that shows the whole aircraft and its markings; 61-7979 taking off from Beale the same day confirms them.
- In service 1980: 61-7964 flew with the 9th SRW from Beale and on detachments (Det 1 Kadena, Det 4 Mildenhall); it is
  today in the SAC Museum, Ashland, Nebraska (photo caption).
- Markings of the period (photo): white "U.S. AIR FORCE" on the forward fuselage above the chine, the national insignia
  aft of it at the wing root and on the left upper wing, the serial 17964 on the fins, 964 on the nacelles. (The
  red-letter low-visibility markings came later in the 1980s; the 1981 photo is white.) The insignia's colours are
  INFERRED full colour (the sunset light hides them); the lower right wing insignia is INFERRED (USAF practice, not
  visible in the photo).
- Paint: overall "iron ball" blue-black (the manual: "painted black to reduce internal temperatures"); fuel stains
  streak aft (the tank sealant seeps until heat-soaked: the leak is modelled, sec. 6).
- Sensors 1980: OBC (optical bar camera, nose), TEOCs (technical objective cameras, chine bays), the side-looking radar
  and ELINT. No data link (that came in the 1990s): see sec. 7 for how the game shortcuts the film.
- **Manual date**: the public flight manual is issue E, 31 Oct 1986, change 2 1989. Everything used from it (dimensions,
  limits, J58 data, procedures) is unchanged in kind from 1980; panel items that are later (the Nav Map Display, item 41
  of fig. 1-12; the DAFICS digital inlet control, mid-1980s) are noted where used.

## 2. References

`docs/ngc1980/reference/sr71/SOURCES.md` (all public domain / public-domain-marked): the USAF three-view (Commons SVG,
af.mil origin), the SR-71A-1 flight manual figures 1-1, 1-3, 1-12 and the aft panel (archive.org, declassified), NASA
TM-104330 (Dryden 1997) figures 3, 10, 11, three dated DoD photos (1981, 1981, 1983). No game files of any kind used.

## 3. Dimension table and frame

Trace frame: X = metres aft of the pitot tip, Y = metres above the static ground, x = BL. Model frame (three.js): z = X - X_CG,
y = Y - Y_CG, nose -z (`game/js/units/air/sr71geo.js` G, converted once).

| Dimension | Value | Source |
|---|---|---|
| Length overall (incl. pitot) | 107.4 ft = 32.74 m | SR-71A-1 sec. I; TM-104330 fig. 3: 107 ft 5 in |
| Span | 55.6 ft = 16.947 m | SR-71A-1; TM-104330: 55 ft 7 in. Model (front mask): 16.89 m |
| Height (to the top of the fins) | 18.5 ft = 5.64 m | SR-71A-1 - sets the static ground under the fin tips (the drawing's wheels are schematic: its side view puts the ground 0.39 m lower, its front view 0.12 m higher) |
| Wing area (reference) | 1605 ft2 = 149.1 m2 | SR-71A-1. Traced planform aft of the chine: 165 m2 (includes the nacelles' share) |
| Tread (middle main wheels) | 16.67 ft = 5.08 m | SR-71A-1 |
| Min. distance between the fin tips | 22 ft 9 in = 6.93 m | TM-104330 fig. 3. Model: 7.06 m (fins canted 15 deg on the nacelle lines, 2.0 % off) |
| MAC / its leading edge | 12.06 m / X 18.55 | traced planform (INFERRED) |
| CG | X 21.20 (22 % MAC), Y 1.97 | INFERRED (manual c.g. range 17-25 % MAC; the position of the MAC is not public) |
| Nacelle centre lines | BL +-4.226 m, Y 2.00 rising 0.022 / m aft | top view (BL), side + front views (height, droop) |
| Nacelle | radius 0.88 m (side: 0.95 m, a slight ellipse), cowl lip X 18.30, ejector exit X 29.85 | top view; the side view draws the nacelle + fin group 0.55 m further aft (lip 18.85, exit 30.43): the top view is used |
| Spike | tip X 16.97 (forward), 18 deg half-angle cone, 26 in (0.66 m) travel | top view; travel CONFIRMED (manual) |
| Fins | side outline (X 25.18-30.31, root Y 3.0, tip 5.58), cant 15 deg inboard, all-moving | side view (moved 0.55 m forward with the nacelle), cant from the front view |
| Chine edge | Y 1.56-1.67 (nose to the wing) | side view interior line (follow.mjs) |
| Fuselage body (round) | half-width 0.82 m, Y 1.12-2.82 | top view body line, side view |
| Gear | nose X 10.6, mains X 22.7 at BL +-2.54 | drawing (wheel positions), manual (tread) |

## 4. Shape: trace, loft, fit

- **Trace** (`tools/blueprint/sr71/`): `rasterize.mjs` (SVG -> 2x PNG), `trace3view.mjs` (the skill's, line erase off:
  the vector drawing has no dimension lines and its long fuselage edges are straight) with `side-top.config.json` and
  `front.config.json`; `follow.mjs` for the interior lines (chine, body line); `wing-a/b.config.json` trace the outer wing
  row by row (span -> LE, TE); `merge.mjs` writes `game/js/units/air/sr71trace.json/.js`.
- **Loft** (`sr71geo.js`): the centre body is ONE loft from the radome to the tail cone whose section is sampled, not a
  superellipse: a round body (the drawing's body line) joined to a thin chine edge by a concave fillet above and a flat
  underside below (smooth max / min), so the chine is a real sharp edge; over the wing the same section is the inboard
  wing (out to the nacelle line) blending into the fuselage hump; the canopies are a hump on the spine with the glazing
  as a material group of the same skin. Nacelles: elliptical bodies of revolution with the cowl lip, a dark duct,
  the translating spike, the ejector. Outer wings: biconvex sections (2.4-3 % thick) with the conical-camber leading-edge
  droop on the traced planform; elevons (outboard on their hinge; inboard ones cut from the body skin and hinged).
  Fins: canted, all-moving about a canted axis at 42 % root chord, a fixed root fairing. Normals analytic (finite
  differences on the surface), 208 stations x 57 x 2 surfaces at LOD0.
- **Fit** (`node tools/blueprint/sr71/fitall.mjs`, masks from `dev/sr71.html?ref=<view>&mask=1`, numbers in
  `evidence/look-sr71/fit.json`):

| View | IoU | max gap | note |
|---|---|---|---|
| side | **0.982** | 0.30 m (0.92 %) PASS | fins excluded (their own outline, sec. 3); the worst is the tail cone tip's last centimetres |
| top | **0.997** | 2.10 m at X 30.3 (3 columns), next 0.28 m (0.85 %) | the 2 m is the outer wing's trailing-edge step registered a column off (a step edge: any 1 px offset is the full step); spike / cowl columns X 16.9-18.95 skipped: in the drawing they are not connected to the centre run the tracer takes |
| front (body hump, y 1.8-2.95) | **0.898** | 0.36 m (1.09 %) | the drawing's front view is the weakest: its fins are drawn ~0.77 m short, its nacelles 2.19 m tall vs 1.8 m in plan, so it was registered to the side view by the body; the residual is the hump's lower flanks (the side view's aft belly at Y 0.99 vs the front view's 1.1) |
| span (front mask) | 16.889 m vs 16.947 m (0.3 %) | | |

  Overlays: `evidence/look-sr71/ref_side.png`, `ref_top.png`, `ref_front.png` (model silhouette in blue over the drawing in red).
  Where the drawing's views disagree with each other (nacelle X, fin height in the front view, ground line) the choice
  and both values are in sec. 3.

## 5. Configuration table (61-7964, 1981)

X / Y in the trace frame (m aft of the pitot / above ground), BL = x. Status: done / partial / not done.

| Item | X | Y | BL | Source | Status |
|---|---|---|---|---|---|
| Pitot mast | 0 - 0.85 | 1.47 | 0 | drawing | done |
| Radome / nose, chines (sharp edge) | 0.85 - 18 | 1.1 - 2.8 | 0 - 1.9 | drawing | done (loft) |
| Pilot's canopy: windscreen + side windows | 5.1 - 6.85 | to 2.92 | +-0.5 | drawing, photos | done (glazing on the skin, frames along the sills) |
| RSO's canopy, side windows | 7.35 - 8.85 | to 2.9 | +-0.5 | drawing, photos | done |
| Canopies opening (hinged aft) | 6.85 / 8.85 | | | photos | partial (hinge groups exist; the hatches are part of the loft, they do not lift yet) |
| Crew in S1030 pressure suits (outside view) | 6.0 / 8.0 | | | photos | done (simple figures) |
| Rear-view periscope | 6.7 | 2.86 | 0 | photos | done (inside) |
| U.S. AIR FORCE, insignia (fuselage) | 11.0 - 17.2 | 1.8 - 2.7 | sides | 1981 photo | done (conformed to the skin, reads correctly both sides) |
| Inlets: cowl lip, spike (26 in travel), bleed band, duct, compressor face | 16.97 - 21.5 | 2.0 | 4.226 | drawing, manual | done (spike on the Mach schedule) |
| Forward bypass doors / porous bleed louvres | 19 - 21 | | | fig. 1-1 | not done (texture item) |
| Nacelles, 964 | 18.3 - 29.85 | | +-4.226 | drawing, photo | done |
| Ejector flaps, J58 nozzle, burner face | 29.0 - 29.85 | | | drawing, photos | done |
| Afterburner with shock diamonds | aft of 29.85 | | | photos | done (length with AB and air density) |
| Outer wings, conical camber | 18.9 - 30.3 | 1.55 - 1.6 | 4.2 - 8.46 | drawing (row trace) | done |
| Elevons outboard / inboard | | | 5.1-7.7 / 1.05-3.2 | photos (INFERRED chords) | done (moving) |
| Fins (all-moving, canted 15 deg), 17964 | 25.2 - 30.3 | 3.0 - 5.6 | 3.5 - 4.2 | drawing, photo | done (moving) |
| Drag chute doors and chute (40 ft) | 23.9 | 2.86 | 0 | TM-104330 fig. 3 | done (deploys, inflates, jettison) |
| Gear: nose (2 wheels), mains (3 abreast) | 10.6 / 22.7 | | 0 / +-2.54 | drawing, manual | done (retract; doors as wells only) |
| Anti-collision beacons (top / bottom), wing tip position lights | 14.5 / 16 | | | photos | done |
| Air refuelling receptacle (spine, aft of the RSO) | ~10 | 2.8 | 0 | fig. 1-1 (item 19) | not done |
| Antennas (UHF, IFF, TACAN, DEF H receive) | per fig. 1-1 | | | fig. 1-1 | not done (the figure is a perspective cutaway: no stations) |
| RAM sawtooth edges (chines, wing edges), skin corrugations | | | | drawing (the triangles), photos | not done (planned as a detail texture; the generic RenderKit panel grid is off - a look-alike tell) |
| Panel lines / fasteners | | | | NOT AVAILABLE (no public maintenance manual panel diagrams) | not done |

Rows done: 19 of 23 fully, 1 partial (83 %).

## 6. Flight model (sr71fm.js) and its validation (tools/sr71bench.mjs: 24/24, `evidence/look-sr71/sr71bench.json`)

World scale (the NGC-1980 contract, airframe.js): 4x density air, so KEAS / KIAS, forces and g are real and world true
speeds are half. The instruments read the ISA altitude with the world air's density (as a real altimeter reads pressure
altitude); Mach and CIT use that altitude's ISA temperature. The tanks drain at half the gauge's (real) fuel flow, because
every leg and climb takes twice as long in the half-speed world: a mission phase burns the real aircraft's fuel.

Model: Polhamus delta lift (potential + vortex terms) with vortex burst past ~20 deg; supersonic lift slope 4/sqrt(M^2-1);
drag CD0(M) with the transonic rise (the SR-71's hard part of the climb), drag due to lift CL tan(alpha) with ~25 %
leading-edge suction; static margin 4 % (subsonic) to ~10 % (Mach 3); stick through an artificial feel spring and SAS
dampers in three axes; the surface limiter (rudders +-10 deg above Mach 0.5, CONFIRMED by the climb chart); J58: the
fig. 1-3 / 1-4 thrust, the ram-pressure curve, min AB 85 % (SL) to 55 % (altitude), AB fill time 3-7 s, slow spool;
spike schedule (forward to Mach 1.6, 26 in aft at 3.2); unstarts (manual spike off schedule, alpha > 10 deg, sideslip,
and a random 1980 analog-control glitch ~1 per 40 min per inlet) with the yaw toward the unstarted side and the
automatic restart (both inlets: spikes forward, bypass open, 3.5 s); CIT and its 427 C limit (30 s over it damages the
engines); 450 KEAS and the 2.5-3 g limits; tricycle gear with three-wheel main bogies, anti-skid brakes, nose steering;
the drag chute (210 KIAS limit, torn off above); the cold-tank fuel leak on the ground; an autopilot (KEAS / Mach /
altitude / attitude hold on a flight-path and g command, heading hold).

| Check | Model | Real | Tag |
|---|---|---|---|
| J58 max AB, SL static / 200 KIAS | 25,500 / 28,500 lbf | 25,500 / ~28,100 (fig. 1-3) | CONFIRMED |
| min AB / max AB, SL / altitude | 0.850 / 0.554 | ~0.85 / ~0.55 | CONFIRMED |
| MIL, SL static | 17,595 lbf | ~17,500 (fig. 1-4) | CONFIRMED |
| Take-off at 125,000 lb: lift-off | 217 KIAS at 8.0 deg; roll 404 m world = 5,300 ft real-equivalent | ~210 KIAS, 8-10 deg | CONFIRMED |
| Mach 0.9 at 30,000 ft | 324 KEAS | 324 KEAS / 347 KIAS | CONFIRMED |
| Climb from refuelling (M 0.75, 25,000 ft, 140,000 lb) to Mach 3 / 70,000 ft on 450 KEAS | 35.1 min world = 17.6 min real-equivalent, 23,300 lb | 16-17 min (TM-104330 fig. 10) | CONFIRMED |
| Cruise Mach 3.2 / 80,000 ft | holds in partial AB, 352 KEAS, alpha 6.3 deg, CIT 401 C, 45,000 lb/h | partial AB, ~310-350 KEAS, CIT < 427, 38-44,000 lb/h | CONFIRMED / INFERRED |
| Full AB at 80,000 ft | peaks Mach 3.45, CIT over 427 C at 12 s, engines damaged after 30 s | Mach 3.3 if CIT <= 427 C | CONFIRMED (limit) |
| Unstart, left inlet at Mach 3 | yaws left 5.9 deg/s, sideslip 2.1 deg, auto restart | "yaws violently toward the unstarted side" | CONFIRMED (kind) |
| Landing: 175 KIAS final, touchdown | 154 KIAS at 8.9 deg, -211 fpm real | 155 KIAS (+1 kt / 1,000 lb over 10,000) | CONFIRMED |
| Roll-out with the chute below 210 KIAS | 2,163 ft real-equivalent | (no published figure found) | INFERRED |
| Roll rate (full stick, 300 KEAS) / pitch (half stick) | 33 deg/s / 2.5 g | (none public) | UNVERIFIED |

## 7. The unit in the game

- `game/js/craftsr71.js` (the craft), `units/air/sr71play.js` (flying it), `sr71model.js`, `sr71geo.js`, `sr71fm.js`,
  `sr71cockpit.js`, `sr71sound.js`, `sr71sky.js` (the view from altitude), `sr71trace.js/.json` (the trace).
- **Role: strategic reconnaissance.** K switches the cameras (OBC / TEOC). They photograph when the aircraft is above
  60,000 ft and wings level (+-10 deg); the strip is GAME-scaled to 12 % of the height either side (2.4 km at cruise; the
  real OBC's 72 nm would cover the whole zone from anywhere near it). While they run, the strip is a live sight source
  (war.js visionSources through pl.sources); every enemy unit, ship, island and site in it is photographed; when the
  pass ends the strip and each target become **photo intel**: `fog.intel` circles that keep those areas revealed for
  10 min (`SR71_INTEL_S`), and a feed line lists what was found. Realism note: in 1980 the film came home with the
  aircraft (no data link); the game reads it out at once - a deliberate shortcut, one constant to change.
- **Survivability.** The zone's guns and short-range missiles (game ranges of a few hundred metres) cannot reach 80,000
  ft; `pl.detect` falls with height so they also lose it. Enemy radar / HQ islands fire a long-range SAM (SA-2 class at
  game scale: boost 12 s to ~Mach 3.5 real, a ceiling near 90,000 ft, turn limited by speed) when the SR-71 comes at them
  inside 45 km: at Mach 3+ and 75-80,000 ft it falls short (the SR-71's defence was speed and height; the DEF systems'
  ECM defeats ~35 % of the rest); low and slow it is a real threat.
- **The view from altitude** (`sr71sky.js`): the game draws its world to ~2.6 km; above ~3 km a direction-only "far earth"
  shell takes over: the curved Earth (horizon dip), sea and land, cumulus fields, the haze of the air path, the sky
  darkening to navy-black at cruise height.
- Time compression (T: x1/2/4/8) above 20,000 ft with no missile in the air, for the long legs.
- Keys (pilot): W/S A/D Q/E, Shift/Space + Ctrl/Z throttles (stop at the MIL detent; press again for AB), G gear, C drag
  chute (again: jettison), B / . brakes, I start (the start cart cranks one J58 at a time, TEB light-off), O engines off,
  U canopy, ` autopilot (ATT -> KEAS -> MACH -> ALT -> OFF, with heading hold), ; ' trim, R inlet restart, M spikes
  AUTO / MAN (then , .), K cameras, T time, V view, [ ] pilot / RSO, N lights, Y get out (on the ground, stopped).

## API for the bases agent

The craft is registered in `main.js` as `sr71C` (`crafts.register(createSR71Craft({...}))`, marked `(ngc/look-sr71)`;
`createSR71` is the same factory). Everything is in world metres, yaw with the nose at (-sin yaw, -cos yaw).

```js
sr71C.placeOnGround(x, floorY, z, yaw, { hot: false, fuelLb: 65000 })   // park it (floorY: the hangar / apron floor under the wheels)
sr71C.placeInAir(x, 0, z, yaw, { ft: 25000, keas: 380 | mach: 3.2, fuelLb })
sr71C.enter(seat = 0)            // the player takes it now (= crafts.control('sr71', seat, 'spawn')); walking up and Y also works (ladder, left side)
sr71C.exit()                     // parks it where it is (the host calls it when the player gets out)
sr71C.stow()                     // remove it from the world (e.g. rolled back into the hangar: show your own static one)
sr71C.towTo(x, z, yaw)           // move a parked one (a tug), no physics
sr71C.group                      // its THREE.Group (already in the scene)
sr71C.sim                        // the flight model state: pos, vel, q, onGround, fuel (kg), keas, mach, altFt, gear, chute...
sr71C.present(), sr71C.status(), sr71C.bounds()   // in the world? / a short state line / its parked footprint for walkers
sr71C.onLanded = def => {}       // called when it stops on the ground after a flight (refuel / re-arm the film, roll it in)
```
Ground: it rolls on `max(terrainH, 0)`; give the runway a flat floor in terrainH (or hand the craft your own groundY: one
line in craftsr71.js). Lengths (world scale): take-off roll ~400 m at 125,000 lb, landing roll ~170 m with the chute, a
900 m runway is comfortable. The hangar must clear 32.7 m x 17 m x 5.7 m. Start: the craft assumes a start cart at the
base (I cranks the engines); `{ hot: true }` parks it running. Fuel: it arrives with what you give it; there is no
refuelling hook yet (sim.fuel is writable, kg; SR71.FUEL_MAX).

Until the bases exist: **`?fly=sr71`** (a strip 6 km west of the zone, engines running) and **`?fly=sr71air`** (25,000 ft,
heading for the zone). The dev page **`dev/sr71.html`** has the model and its blueprint overlays (`?ref=side|top|front`,
`&sil=1`, `&mask=1`, `?cam=yaw,pitch,dist`) and a flight test range (`?start=runway|air|cruise|approach`,
`&view=cockpit|chase`, `&ap=keas|mach|alt`).

## 8. Cockpit

The pilot's centre panel is traced from SR-71A-1 fig. 1-12: `tools/blueprint/sr71/panel-pilot.json` (42 items by number
and legend, centres and sizes in figure px, the panel outline), scaled by the altimeter's 3ATI case (233 px = 0.0826 m:
2821 px/m). Every instrument is drawn live on one canvas atlas (12 Hz): the airspeed - Mach meter, ADI, HSI, the Triple
Display Indicator (KEAS / altitude / Mach counters), altimeter, IVSI, AoA, CIT, CIP, skin temperature, the tachometers,
EGTs, nozzle positions, fuel flows, oil and hydraulic pressures, spike positions (with the schedule), forward bypass
positions, accelerometer, trims, the clock; the unstart / master caution / KEAS lamps light from the sim. The yellow
DRAG CHUTE handle, the restart and spike switches are placed. Around it: glare shield, consoles, throttles (moving),
stick (moving), seat, the canopy sills, the periscope; the cockpit walls are the body skin seen from inside. The RSO's
cockpit is a layout (the big viewsight, sub-panels), not traced item by item.

## 9. Evidence

`docs/ngc1980/evidence/look-sr71/`: `ref_side.png`, `ref_top.png`, `ref_front.png` (overlays), `fit.json`,
`sr71bench.json`, `ext-front-left.png`, and the scene's shots (sec. 10).

## 10. Tests

(filled in below)
