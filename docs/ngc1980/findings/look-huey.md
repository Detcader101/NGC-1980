# look-huey: the UH-1H rebuilt from the blueprints (ngc/look-huey)

Branch `ngc/look-huey` from `36eb21b` (checkpoint `cf332e7`). The hi-fi model is `game/js/hueyhifi.js`, behind
`buildHueyMesh()` in `hueymodel.js` when RenderKit surface is on; `?rk=0` keeps the classic model. `hueyfm.js` is not
touched. Tools: `game/dev/huey.html` (turntable, `?ref=side|front|top` overlay, `&mask=1`, `&checker=1`, `&psi=`,
`&rot=`), `tools/hueytrace.mjs` (drawing -> station samples), `tools/hueyfit.mjs` (IoU / edge gap),
`tools/scenes/hueylook.mjs` (every view), `tools/scenes/hueyref.mjs` (overlays and the photo match).

## Reference set (docs/ngc1980/reference/uh1/SOURCES.md)

| Source | Licence | Used for |
|---|---|---|
| TM 55-1520-210-10 (1986) p. 29, principal dimensions three-view (Wikimedia Commons) | public domain (HQ DA) | the traced side / top / front outline, skid track, hub and tail rotor positions |
| TM 55-1520-210-23-1 (1987) fig. 2-3 station, water and butt lines (archive.org micro_IA41152639_0634, page n135) | public domain | fuselage stations FS (nose FS -7.60, mast FS 133.5, cant bulkheads FS 127.5 / 153.4, aft cabin bulkhead FS 166, aft fuselage FS 238.08, tail rotor FS 479.4), floor WL 22, keel WL 7.44, top of pylon WL 95.45 |
| TM 55-1520-210-23-1 para 2-253/2-254, fig. 2-49 seating arrangement | public domain | the eleven-seat troop layout (hueycabin.js) |
| TM 55-1520-210-23P RPSTL (1981, archive.org micro_IA41152635_0517) | public domain | downloaded for parts / fit checks (troop seat fittings listed); not yet mined further |
| Commons photos: UH-1H Medevac at Norton AFB 1982, UH-1H at Fort Irwin 1987, Bolivian UH-1H 1987 | public domain (DoD) | tail rotor side, open cargo door, 1980s fit |
| user's air-to-air photo | visual only | proportions.png |

No other game's files were read. DCS / Arma Reforger files are off limits; `docs/ngc1980/reference/private/` is
git-ignored for user screenshots (finish and feel only, never shape).

## Dimension table (model metres: x right, y up, z aft; ground y -1.84; FS = z / 0.0254 + 137.7)

| Dimension | Published | Model | Source / note |
|---|---|---|---|
| Fuselage length (nose to tail) | 41 ft 5.0 in = 12.62 m | 12.62 m (z -3.735 .. 8.93) | -10 three-view (the calibration length) |
| Main rotor diameter | 48 ft 3.2 in = 14.71 m | 14.64 m (R 7.32, HUEY.R) | -10; R kept for the flight model's disc |
| Rotor hub, nose to mast | 11 ft 8.65 in = 3.573 m | 3.57 m (hub z -0.12) | -10; FS 133.5 in the -23 station diagram agrees to 1 cm |
| Hub height | 13 ft 7.40 in to the hub top (front view label) | 2.00 hub + 0.31 nut = 4.15 m above ground | drawn hub sits 0.2 m lower; the -23 WL table puts the hub 2.84 m above the floor (= 1.80): **open, see below** |
| Tail rotor diameter | 8 ft 6.0 in = 2.59 m | 2.59 m | -10 |
| Tail rotor hub height | 10 ft 2.5 in = 3.11 m (drawn 3.23 m) | 3.23 m (y 1.39) | -10 three-view; the -23 WL 137.555 implies 3.7 m: **open** |
| Overall height (TR top) | 14 ft 8.2 in = 4.48 m | 4.53 m | -10 |
| Skid track | 8 ft 6.6 in = 2.61 m | 2.60 m | -10 |
| Keel clearance | 1 ft 3.48 in = 0.39 m (to the lowest point) | keel 0.45 m, chin cutter lower | -10 |
| Cabin roof above ground | 6 ft 8.13 in = 2.04 m (front view label) | drawn 2.31-2.39 m; model roof shoulders 2.30, centre 2.39 | the label disagrees with the drawing it annotates; drawing kept |
| Cabin width (outer) | 8 ft 7 in = 2.62 m (spec sheets) | 2.52 m skin, 2.57 over the doors | front view trace 2.57 |
| Cargo door opening | 74 x 48 in (1.88 x 1.22 m) spec; drawn 1.96 x 1.46 m | 1.96 x 1.46 m (z -1.16 .. 0.80) | drawing kept (FS 92.5 .. 169 sits on the -23 frames) |
| Elevator | span 9 ft 4.3 in, chord 2 ft 6.5 in | 2.85 x 0.775 m at z 5.42 | -10 |
| Tail rotor side | right of the fin (tractor), bottom blade forward | right, bottom blade forward | -10 top view, 1982/1987 photos, user photo |

## Findings

### 2026-10-28 - The checkpoint model was the wrong shape, not just under-detailed
**Finding:** against the TM three-view the checkpoint fuselage was too low (roof 0.47 vs 0.55), the keel too high
(-1.15 vs -1.39), the doghouse 0.45 m too tall and 1.5 m wide (drawn 1.0 m), the boom a curved tube (drawn: a deep,
straight-topped tapered beam, 1.0 m deep at the root), the tail rotor 0.64 m too high, the skids 1.6 m too long aft
with the cross tubes in the wrong places, the doorway 0.2 m too far aft.
**Evidence:** `evidence/look-huey/overlay_before_after.png`.
**Cause:** sections were hand-placed from memory of photos.
**Action:** trace the drawing, loft from the trace, measure (below).

### 2026-10-28 - Traced loft, measured fit
**Finding:** a hand-tuned table could not get under ~5 % error; a traced one does.
**Action:** `tools/hueytrace.mjs` thresholds the line art, erases straight lines >= 150 px (dimension / extension
lines, the ground line, the rotor blades, which otherwise close false regions), closes 2 px gaps, floods the
background, and scans the silhouette: 1272 side columns (upper / lower profile), 583 top columns (half-width), 241
front rows. Masked spans (mast pylon, wire cutters, antennas, skid struts, chin cutter, the blade over the top view)
are bridged. `game/js/stationtable.js` (shared, for the UH-1N next) turns the samples into 89 fuselage stations (2-3.5
cm at the nose and windscreen) and 30 doghouse stations; `hueygeo.secPt` gained `lean` (tumblehome) and `crown` terms
fitted to the front view (cabin: nT 8, nB 4, lean 6 %, crown 7 cm) and a ray parameterisation.
**Evidence (tools/hueyfit.mjs, silhouette at the drawing's pixel scale; evidence/look-huey/fit.json):**

| View | IoU | Max edge gap | Worst |
|---|---|---|---|
| side | 0.985 | 0.11 m (0.87 %) | z -0.94: a roof vent/scoop forward of the doghouse, not yet modelled |
| top | 0.989 | 0.10 m (0.80 %) | z 0.86: the step behind the cargo door |
| front | 0.975 | 0.42 m (3.3 %) | 2-3 rows at y 0.48-0.50: the drawn roof shoulder drops straight to the doghouse; a superellipse with crown cannot make that corner |

### 2026-10-28 - Station diagram vs three-view: two vertical disagreements (open)
**Finding:** FS from the -23 station diagram match the three-view to 1 cm (nose, mast, tail rotor, aft fuselage). The
WL do not all agree: keel WL 7.44 and floor WL 22 fit, but the hub (2.84 m above the floor) and tail rotor WL 137.555
(3.7 m above ground) disagree with the -10 three-view by 0.2 and 0.5 m. **Action:** the shape follows the -10 drawing
(fitted, labelled, consistent with the user's photo); hub at the -10 label height. To resolve: the -23 boom diagram's
own WL datum (it is drawn tilted on a separate WL 0 line).

### 2026-10-28 - Tail rotor on the right
**Finding:** the model (and the classic one, and `hueyfm.js` TR_HUB [-8.70, -0.39, -2.03]) had the tail rotor on the
left. The -10 top view draws it on the right; Commons photos of US Army UH-1H at Fort Irwin (1987) and a Bolivian
UH-1H (1987) show the hub on the near side of a right-side view; so does the user's photo. A 1982 photo is ambiguous.
**Action:** `GEO.TR_SIDE = 1` (right, tractor), turning bottom blade forward. Classic model and `hueyfm.js` unchanged
(the FM's TR is also 0.64 m higher than drawn): **flagged to the orchestrator**.

### 2026-10-28 - Mirrored stencils, stretched texels
**Finding:** the NO STEP stencils on the roof read upside down from beside the aircraft; the roof texels were crushed
(the |cos|^(2/n) superellipse parameterisation put a squarish roof into a few degrees of phi).
**Action:** stencil tops inboard; sections use the ray parameterisation (even spacing round the section); the skin is
now in arc-length texture space (`hueygeo.arcSpace`): u = z, v = arc length round each section from the keel, both
over the longest perimeter, so the boom and the cabin get the same ~9 mm texels and the seam is on the keel centre
line; the bake inverts the same mapping per column. Markings checked from outside: `evidence/look-huey/markings_1.png`
(U.S. ARMY both boom sides, NO STEP), `markings_2.png` (data block, FUEL, serial both fin sides). The "U.S. ON" seen in
the top view of markings_1 is the far side's NO STEP, upside down from that camera (each stencil reads from its own
side). Checker (`?checker=1`): `checker_before.png` (phi / TAU: boom squares ~5x denser) vs `checker_after_side.png`,
`checker_after_top.png` (one density).

### 2026-10-28 - Troop cabin to the TM seating
**Finding:** the cabin had a 4-place bench and 2 door places; the -23 describes eleven: five across facing forward
immediately forward of the transmission support (two two-man seats with backs and a one-man seat without, between),
two two-man seats without backs facing outboard in the wells beside the transmission, two folding seats with backs
just aft of the crew seats. With the gunner and crew chief in the aft well places: nine troops.
**Action:** `game/js/hueycabin.js` holds the layout (FS-placed: bench back at the forward cant bulkhead FS 127.5, wells
to the aft cabin bulkhead FS 166); the model builds the seats from it, `interiors/seats.js` offers all nine plus the two
doorway places to the player, `airlift.js` calls a squad of nine (TROOPS.N = TROOP_CAPACITY) with boarding paths
through the doorway to each seat and dismount out of both doors. Cargo door travel 1.82 m so its open edge stops
just aft of the M60D pintle (z 0.56).

### 2026-10-28 - Rocket pods
**Finding:** the M158 pods were 0.41 m across and hung beside the windows. **Action:** 0.27 m across, 1.68 m long,
seven tubes at 79 mm pitch, on the side mounts at cabin-floor level below the doorway's forward part (centre y -1.13,
x 1.80, z -0.55: outboard of the skid line), arm to a floor-level hard point, drag brace. Kept as a fit option.
Clearance: a Marine on the doorway sill (legs to x 1.61, y -1.50) clears the pod (x >= 1.665); troops board and dismount
through the doorway's aft part (z 0.43, between the pod's tail at z 0.29 and the M60D at 0.56) and walk forward along
the door side. Evidence: `pods_door.png`, `troops_doorway.png` (all nine seats and both doorway places filled).

## 1980 configuration table (US Army UH-1H, transport fit with door guns; rocket pods as a fit option)

Status: done = modelled at the stated station; partial = modelled, position not yet verified against a figure;
todo = not modelled. FS from the -23 station diagram mapping; WL/BL in model metres where the TM gives none.

| Item | FS / WL / BL (or model) | Source | Status |
|---|---|---|---|
| Fuselage skin, nose to boom | traced, FS -7.6 .. 238 | -10 three-view | done |
| Doghouse (transmission + engine cowl) | FS 102 .. 236, top WL ~95 | -10, -23 fig 2-3 | done |
| Tail boom, drive-shaft cover | FS 238 .. 420 | -10, -23 | done |
| Vertical fin, 42 / 90 deg gearboxes | FS 420 .. 489 | -10 | done (trailing edge hidden in the drawing) |
| Synchronised elevator | z 5.42, 2.85 x 0.775 | -10 | done |
| Tail rotor (right, tractor) | FS 479.4 | -10, -23, photos | done |
| Main rotor, stabiliser bar, swashplate, pitch links | FS 133.5 | -10 | done |
| Windscreen (two-piece, centre post), roof windows, chin bubbles | traced cut-outs | -10 front / side | done |
| Crew doors with upper / lower windows | FS 74 .. 112 | -10 side | done |
| Hinged panel forward of the cargo door, window | FS 74 .. 92 | -10 side | done |
| Sliding cargo doors, rails, rollers | FS 92.5 .. 169 | -10 side | done |
| Skids, cross tubes, saddles, steps, upturned toes | cross tubes z -1.71 / 0.60 | -10 side / front | done |
| Tail skid (stinger) | FS ~430 .. 480 | -10 | done |
| Wire strike protection (upper cutter, windshield deflector, lower cutter) | roof FS 52, centre post, chin FS 6 | -10 (1986) three-view draws all three; -10 (1988) para 2-12.1 and fig. 2-1 items 28/29 | done (fitted: WSPS retrofit began 1979-80; the -10 three-view we fit to shows it) |
| IR exhaust suppressor ("IR scoop") | - | -10 (1988) para 2-21.1 "aircraft equipped with" | not fitted by choice (optional kit; our aircraft has the plain stack the 1986 three-view draws) |
| Exhaust stack | FS ~228 | -10 | done |
| Engine air intake screens | FS ~152 .. 168 | -10 side | done |
| Antennas: VHF nav (Omni) on the fin top, FM homing (towel bars), FM comm No.1 / No.2, VHF/UHF, ADF loop | boom, cowling, belly | -10 fig. 2-1 general arrangement (items 1, 4, 5, 8, 9, 17) | partial (all present; the Omni is still the boom blade, not yet on the fin) |
| HF long-wire antenna | - | -10 fig. 2-1 item 20 | not fitted (HF kit) |
| Radar altimeter (AN/APN-209) antennas + indicator | belly / panel | -10 (1988) section 3 fig. 3-27 | partial (indicator in the panel; belly antennas todo; APN-209 fielding date unverified) |
| AN/APR-39 radar warning (spirals nose / tail, indicator) | - | -10 para 3-30 | partial (fitted for the game's countermeasures; 1980 fielding unverified) |
| Landing light, searchlight | belly FS ~30 / 40 | -10 | partial |
| Anti-collision beacons, position lights | doghouse aft top, belly; roof edges; tail | -10 | partial |
| Pitot tubes (two, roof) | roof FS ~43, BL +-12.6 in | -10 fig. 2-1 items 10 and 27 | done |
| Static port | - | -10 fig. 2-1 item 26 | todo |
| Cabin roof air scoop | FS ~100 | side-view trace bump (worst side gap) | done (identification as the heater / ventilating intake is our reading) |
| Access doors: radio compartment / battery (nose), heater, oil cooler fan, electrical, aft radio compartment | - | -10 fig. 2-1 items 13, 16, 17, 21, 22 | partial (generic panel lines; not placed per the figure) |
| Mirrors | - | - | todo (not fitted to Army UH-1H; confirm) |
| M60D on pintle mounts (left / right) | z 0.56, doorway aft end | photos | done (M23 armament subsystem mount detail todo) |
| M158 rocket pods on side mounts | z -0.55, floor level | photos | done (fit option) |
| Cargo hook (non-rotating cargo suspension unit) | belly FS ~150 | -10 para 4-34; airlift HOOKS.uh1h | todo in the hi-fi model (the game's hook works) |
| Troop seats (11, TM fig 2-49) | FS 112 .. 166 | -23 | done |
| Gunner / crew chief figures | well aft places | -23 | done |
| Floor tie-down rings | cabin floor | - | partial |
| Fire extinguisher, first aid kit | hinged panels | - | partial |
| Access panels and fasteners, louvres | skin bake | - | partial (panel lines generic, not from the -23 skin diagrams fig 2-4/2-5) |
| Rivet lines | skin bake | - | partial |
| Fuel filler (right, aft of the cargo door) | z 1.42 | photos | done |
| Jack and tie-down points | - | - | todo |
| Handholds and kick-in steps | aft of the cargo door, roof | - | partial |
| Paint FS 34087 olive drab, lusterless | skin bake | 1980 Army | done |
| Markings: U.S. ARMY boom, serial on the fin, data block, NO STEP, FUEL, GROUND HERE | skin bake | 1980 Army subdued | done (letter heights not yet checked against MIL-STD) |

Done 25 / 42 rows (60 %), partial 11, settled as not fitted 2, todo 4. 1980 fit settled with dated sources where the -10 (1986 / 1988) and photos allow; rows that still need a dated source say so.

## Triangle budget (measured, what the camera draws)

| Range | LOD | Triangles | Meshes |
|---|---|---|---|
| 20 m | near (exterior + cabin + crew) | 115 k | 108 |
| 120 m | mid | 5.4 k | 25 |
| 300 m | far | 1.9 k | 17 |

The near LOD includes ~11 k for the four crew figures and the interior. SwiftShader timings are relative only.

## Regression status (2026-10-28, machine at load average 40-68 from other agents' browsers)

| Check | Result |
|---|---|
| `node tools/check.mjs syntax` | PASS 544/544; no conflict markers |
| smoke | PASS 5/5 |
| hueymodel, hueycockpit | unverified (load): page navigation timed out at 30 s before the scene started; re-run pending |
| airlift | unverified (load): FAIL in the sling hook-up (the hover never held steady 0.6 s at ~1 fps, 40 s per screenshot), before the troop lift; expectations updated to nine troops / 945 kg |
| foot | unverified (load): ladder and walk waits timed out (no Huey code involved), the Huey boarding step not reached in time |
| interiors | unverified (load, average 83-99): the carrier ladder / hangar steps timed out (no Huey code); the Huey cabin step PASSED boarding ("IN THE UH-1H HUEY - TROOP SEAT 3 (AFT BENCH)", clean first-person view past the pilots: `game_troop_seat.png`), "out again" timed out |
| hueyhotas, xrgameplay | not run: the regression loop was stopped at load average 99 to stop adding to it |

### 2026-10-28 - Cockpit panel from TM -10 fig. 2-4
**Finding:** the panel was a 2.2 m slab with a made-up layout. **Action:** the outline and every instrument's position
and size are read from TM 55-1520-210-10 fig. 2-4 (1988 change 7, archive.org page n68) at 800 px/m: copilot ASI / ADI /
altimeter / RMI / VSI; the centre column fuel pressure / quantity, engine oil, transmission oil, main and standby
generator loadmeters, DC and AC volts; the pilot's dual tachometer / torque / gas producer / EGT column and his ASI, the
large ADI, altimeter, RMI, VSI, turn and slip, CDI and clock; master caution, RPM, fire and inlet-filter lights; the
operating limits, cargo and engine caution decals and the compass card; the glare shield hood; the magnetic compass at
the panel's right edge; the cyclic's S-bend (fig. 2-5). The radar altimeter sits in the slot the V model gives the DME
(approximate). The APR-39 / M130 (game countermeasures) are on an add-on panel outboard of the pilot's group. All gauges,
lamps and hit boxes keep their ids. Evidence: `panel_vs_tm.png`, `cockpit_seats.png` (pilot and copilot eyes).
Not yet: the pedestal's two-column radio stack and the overhead console from fig. 2-5 sheets 1/3, armoured seat shapes,
breaker panel labels from the figure.

## Still open
- Cockpit: pedestal radio stack (two Dzus columns per fig. 2-5), overhead console, seats, breaker placards.
- Skin panel lines from the -23-1 skin diagrams (figs 2-4 / 2-5) as a station-placed detail map: not done.
- The two WL disagreements above; the FM's tail rotor side and height (hueyfm.js unchanged by brief).
- Configuration table rows marked partial / todo; the roof scoop at FS 104 (worst side-view gap).
- Arc-length UVs for an even texel density (now: even round each section, uneven between sections).
