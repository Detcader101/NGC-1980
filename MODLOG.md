# MODLOG — Thrust/Zarch experimental (helicopter build)

Own browser game (Three.js r170), no third-party game files. Route: direct source changes (we own the code).
Oracle: tools/snap.mjs headless Chrome (SwiftShader) driving the real game with keyboard + debug bridge
(`?debug&kb&peace`, `window.__G`). Scenes in tools/scenes/: smoke, heli, loop, rescue, perf (+ damage, cockpit).

## 2026-10-10 — damage model + fuel + cockpit
Plan (one commit per stage, each verified with a scene + screenshots):
1. Fuel: burn 2.2 → 0.9 %/s at full collective (hover ≈ 3.5 min), emergency fuel drop 25 → 50 %.
2. Damage model (game/js/damage.js): components with health (main rotor, tail rotor, engine, transmission,
   hydraulics, fuel tank, avionics, skids). Hits from enemy fire / rams / hard landings / tail strikes damage
   parts instead of instant death. Failure effects feed the flight model:
   - tail rotor lost → no anti-torque → torque-reaction spin; cure: lower collective, fly fast (fin), or cut the
     engine and autorotate (no engine torque, no spin);
   - engine damage → power loss / rpm droop; engine fire burns it out (extinguisher puts it out);
   - transmission chip → seizes when critical → rotor rpm decays;
   - hydraulics → heavy, slow controls, no SAS; fuel tank → leak; avionics → gauges fail; skids → softer limits;
   - main rotor destroyed → no lift → fall.
   Repairs: home pad / home intake pad = full repair; field repair via logistics call (L) when landed safely.
3. Cockpit: second gauge row (fuel, eng temp, xmsn, hyd, torque, N1/N2), caution/warning annunciator panel,
   clickable switches (engine, SAS, hyd boost, fire extinguisher, landing light) + keyboard shortcuts.

### Stage 2 notes (damage model) — verified with tools/scenes/damage.json (11 checks, 3/3 runs green)
- Tail rotor lost at hover → ~1.3 rad/s yaw after 2.5 s (death spin). Cutting the engine (I) removes main-rotor
  torque: spin falls to <0.5 rad/s; autorotation + flare lands intact; L → field repair (tail ≥ 60%) + 50% fuel;
  engine back on, lift-off without spin.
- Gotcha 1: touchdown only checked ground under the centre → on slopes the tail and then a blade struck the uphill
  side (ROTOR STRIKE death). Fix: contact = highest ground under the four skid ends.
- Gotcha 2: lifting off a slope scraped the tail → "tail strike". Now only counts with >2 m/s or >8.6° nose-up,
  and 25 cm below ground.
- Gotcha 3: cave "hard landing" branch accepted side-on wall hits at 25 cells/s; now needs |vx| < 6.
- Scripted autopilots must flare like a pilot (target sink = 0.45·AGL); a fixed collective can't autorotate.

### Stage 3 notes (cockpit) — verified with tools/scenes/cockpit.json + screenshots
- Two-row panel: IAS, attitude, altitude, VSI, dual tach (NR yellow / N2 blue: split needles = engine not driving
  the rotor); lower row fuel, torque, EGT (red line 760), XMSN oil psi, HYD psi, clock. Failing avionics drop
  gauges to OFF flags.
- Glare-shield annunciator: 10 lights, amber cautions, flashing red warnings (driven by damage.cautions()).
- Pedestal switch panel: ENGINE, HYD BOOST, SAS, LDG LIGHT toggles + LOGISTICS and FIRE EXT push buttons.
  Click with the crosshair (mouse captured) or the cursor; a switch hit consumes the click (no gunfire).
  Keys: I, U, H, N, L, O. Test clicks via real mousemove+mousedown at the projected switch position.
- Landing light: the terrain shader is unlit, so the light is drawn as an additive pool where the beam meets the ground.
- Gotcha: D.hit() randomises damage ×0.7–1.3, so "destroy the tail rotor" must set hp = 0 directly (tail strike, tests).

## Stage: readability + cave combat pass (2026-10-10)
- Cockpit rebuilt to fit the cabin: windscreen runs glare shield -> roof beam (it used to lean forward and sit in front of
  the panel), A-pillars/centre post on its edges, door glass is a shape that meets the pillar, panel/glare shield inside
  the walls, exterior shell (cab/nose/roof/mast) hidden from inside. Annunciator: 2 rows of 5, full captions.
  Eye pitch -0.22 so both instrument rows show; pedestal lowered so it doesn't hide the lower row.
- HUD: bottom text block hidden in the cockpit, minimap moves top-right; hint sits between the fuel block and the map.
- Reticle: dot + 4 hairlines built in pixels and scaled by distance (fixed screen size), 40 m out so it never sits on the heli.
- Free look toggle T (off = mouse released, view eased to centre and held).
- Cave: hat aims the door gun in 8 directions and auto-fires; else mouse cursor aims (click fires); else nose.
  Base tiers N1..W4 -> tier+1 turrets, range 18, slower fire for light bases, cave hits 0.16. Winch reach 5.5, beam visible.
- Gotcha: a `//` comment inserted mid-line by sed swallowed the rest of the statement (hit boxes lost userData).
- Scenes: caveaim.json (new), cockpit.json (+free look), audit.json (cockpit look-around screenshots).

## Stage: THE ISLAND WAR (2026-10-22) — Carrier Command x Raid on Bungeling Bay
- world.js: archipelago of 17 islands (2 HQs, 3 cave fortresses, fuel/factory/radar outposts) on open sea, BOUND 640.
  Same island list drives JS heights and the terrain. Coarse A* sea-lane grid (20 m cells, 14 m margin) for ships.
- Terrain perf: per-vertex island maths + per-pixel loops over 22 pads cost ~150 ms/frame in SwiftShader. Now a heightmap
  baked at load (one texel per grid vertex, R32F nearest = exact) + a 4 m "decor" texture (nearest pad/shaft index) so
  each pixel shades one pad. Tests run with &res=0.45; dt clamp raised to 0.1 (sims substep) so game time keeps real time.
- fx.js: pooled soft particles (additive 5000 + alpha 6000), fires that burn then smoulder for minutes, chimneys,
  bouncing debris that stays (700, instanced), scorch decals that never fade (450), transient water decals (wakes,
  ripples, oil, shockwaves). Particles fade out within ~size of the camera (fill-rate + looks).
- fog.js: 112² grid, visible (recomputed 4 Hz from sight sources) + explored; one RGBA texture used by the terrain
  shader and a material patch (trees). Enemy units hidden outside sight, buildings until explored, map shows last-seen owner.
- war.js: carriers (A* paths, wakes, CIWS/flak, self-repair, sinking), islands with HQ/production/AA, capture = no
  owner AA alive + hold the pad (heli 6 s, drone 9 s, transport 10 s), cave islands flip on pod theft, enemy recapture
  restocks the cave. Economy: fuel (stores, cap 600) and materiel. Enemy outposts ship output by FREIGHTER to the KRAKEN.
  Enemy commander every 2 s: defend, expand (danger-weighted, backs off 100 s after losing a transport there), fortify,
  raid, guard, supply, battleship (factories 0.08 %/s each + shipyard 0.06 %/s; launches at 100 %, hunts the ALBATROSS).
- Player: door gun, rockets (G/btn 3), bombs (B/btn 5) with a yellow impact ring; commands 1 drone 2 AA 3 heli 4 escort;
  M = command map (click sea = sail, click island = select). Respawn on the carrier deck. heli.js rides moving decks
  (env.surfVel: velocity, yaw rate, centre).
- Balance (aisim.json, idle player): enemy takes ~1 island/min, battleship ~6.5 min. Win: sink KRAKEN or take IRONHOLD.
- Gotchas: bow probe braked a carrier that was turning away from land (only brake when |turn| < 0.6); fogPatch needs a
  newline after the injected GLSL (else "#define" glued to "}"); a cut() that swallowed `const _hud = {}`; tests that
  assumed fixed setInterval ids; peace mode must also silence enemy guns (tests fly near enemy islands).
- Scenes: war.json, war2.json, aisim.json (fast-forwarded AI), ships.json, playwar.json, fx.json.

## 2026-10-22 — HORNET carrier jet (flyable, full cockpit, HOTAS 4 + T-Rudder pedals)
Files: game/js/jetfm.js (flight model, pure), jetmodel.js (exterior), jetcockpit.js (3D cockpit, HUD, displays),
jetplay.js (input, weapons, carrier ops, HUD data, cautions, g tolerance, ejection, cameras), jetdamage.js, hotas.js
(multi-device controls + bind panel), plus hooks in main.js / war.js / audio.js / heli.js.
- World scale: the map is 1.3 km, so the air is 4x sea-level density (sound speed 170 m/s). Forces, g and the
  airspeed indicator (dynamic pressure = equivalent airspeed) are the real Hornet's; true speeds are half, turn radii a
  quarter. Mach is computed honestly against the 170 m/s sound speed, so transonic drag and M~1.05 top speed hold.
- Flight model: 6DOF rigid body, Hornet mass/inertia, lift curve with soft stall + flat-plate blend, drag polar + wave
  drag, linear derivatives that degrade past the stall; twin F404s with spool lag, AB, fuel flow, EGT, nozzles, start.
  FCS (CAS) by dynamic inversion: g command (7.5 g / 3.5 g gear down), roll rate, sideslip + turn coordination,
  AoA limiter ~27°. DIRECT switch hands the surfaces to the stick.
- tools/jetbench.mjs (node, 24 checks, all pass): signs, hands-off trim, damping, 1 g stall 117 KEAS, approach 132 KEAS
  at 8.1° AoA, roll 191°/s, 7.6 g limit, M 0.94 MIL / 1.04 AB, cat end 189 KEAS, trap runout 21 m, brakes hold.
- Hardware (from the Windows HID descriptors): T.Flight Hotas 4 044F:B67C = X Y stick, Z throttle (fwd = -1), Rz twist,
  Slider (rocker?), hat axis 9, 12 buttons; T-Rudder 044F:B679 = X Y Z (published: Z rudder, Y left / X right toe
  brake; UNVERIFIED on this unit, the J panel binds by wiggling). readPad() now never picks the pedals as the stick,
  and the helicopter's pedals read the rudder pedals when bound.
- Gotchas: the stabilator rate limit (40°/s) made the first NDI pitch law bang-bang (10 g overshoot): command model
  + measured flight-path-rate feed-forward fixed it; CAS must stay engaged at low airspeed (it handed full aft stick to
  the surfaces in a zoom); tyre friction needed a deadbeat + slip anchor or braked jets creep; the wire force sign;
  an inline // that swallowed a brace (again); 500 m/s jet rounds and 340 m/s missiles need swept hit / fuse tests at
  low frame rates; hitTest() reuses war.js's _w (don't loop with it); the game starts with the ALBATROSS facing FORGE,
  so the carrier now turns into clear water before a launch; hold-to-eject must use real time, not sim time.
- Scenes (headless, all pass): jet.mjs, jettrap.mjs, jetweapons.mjs, jetsystems.mjs; helicopter scenes still pass.

## 2026-10-22 — infinite procedural world, no limits
- world.js: wild islands outside the archipelago: one per 460 m cell with probability 0.42, placed/sized by an integer
  hash of the cell (same every run), at least 160 m clear of the operating area; islandH() adds them (3x3 cells).
- main.js: the terrain shader samples the baked core heightmap inside the operating area and, outside, a second
  512x512 @ 8 m heightmap streamed around the camera (re-baked island by island when the camera moves 700 m, then
  swapped; bilinear by hand in the vertex shader). Wild-island trees refill on each bake. Fog of war stops at the area.
- No clamps for the helicopter or the jet. Leaving the area: one message + feed line, then a hint with the distance and
  bearing back. Minimap and the jet's AMPCD draw open sea, wild islands and the operating area's dashed outline.
- Scene: infinite.mjs (jet 4 km out over wild islands, physics height on the island, helicopter lands on one).
- Note: damage.json's scripted lift-off is timing-sensitive at low headless fps (flaky under load, passes on rerun).

## 2026-10-22 — real-world terrain past the control zone (replaces the wild islands)
- world.js: gradient-noise world (fixed seed): continents (7 km fBm), lowlands and hills, mountain belts (8 km mask) with
  ridged multifractal ranges (2.4 km) peaking ~1.5 km, forests (fBm mask, gentle slopes, tree line ~360 m). Open sea for
  ~0.5-2 km round the zone. Stats over 40 km: 55% land, 8.5% above 200 m, 3% above 450 m; 0.35 µs per height query.
- terrainworker.js bakes 2 km @ 4 m (+ ~7-9k forest trees on a fixed jittered grid) and 8 km @ 16 m heightmaps from the
  same function; the vertex shader takes the 4 m window where it reaches, else the 16 m one. Wild colours: rock on
  steep faces and above ~200 m, snow caps above ~450 m. Jet view 1.1-2.6 km (far ring 24 m x 220), helicopter 600 m
  outside the zone.
- The zone is the CONTROL ZONE: outlined and labelled on the maps, no messages, no limits anywhere.
- jetweapons.mjs gun test now flies hands-off: the scripted altitude hold moved the gun line tens of metres at 330 m.

## 2026-10-22 — merged experimental (pause menu, para-drop dropship, Tomcat escorts) into main
- Conflicts were all "both sides added here": imports, keydown (controls panel > pause menu > jet keys > H autopilot /
  SAS), camera branches (jet, then dropship), cockpit/near-plane/reticle conditions (helicopter cockpit only when
  neither the jet nor the dropship view is up), the debug bridge.
- The pause menu knows about the jet: no logistics in the jet; RESPAWN becomes BACK TO THE ALBATROSS (writes the Hornet
  off, no life lost); the jet's sounds stop while paused; showEnd() stows the jet.
- war.js projectiles now integrate gravity exactly (p += v dt + ½ g dt²) so bombs fall the same at any frame rate; the
  CCIP predictor does the same: pipper vs impact 0.2 m (was ~5 m from frame-rate integration error).
- All scenes pass except damage.json's scripted lift-off, which is flaky on experimental as well (1 of 2 runs there).

## 2026-10-22 — HORNET terrain warnings work with the real-world terrain
- The old PULL UP looked only straight down (height over sink rate), so flying level into a mountainside was silent.
  Now a look-ahead check (10 Hz) flies the escape the pilot would fly: a reaction delay, then a wings-level pull (4 g,
  or what the wing gives at this speed; 3 g gear down) up to a 45° climb, trading speed for height, over the real
  terrain/sea/deck heights. Fails with 1 s reaction: PULL UP (break-X, "Pull up, pull up"). Fails with 3 s reaction
  against ground rising ahead: TERRAIN (HUD text, "Terrain, terrain"). Clearance shrinks when already low so level
  flight low over flat ground stays quiet; gear down counts only ground above you (not the deck you're landing on).
  The sink-rate PULL UP and ALTITUDE calls are unchanged.
- tools/scenes/jetterrain.mjs: hands off at a 980 m peak 250 m below its top: TERRAIN 7.4 s and PULL UP 4.7 s before
  impact; pulling on the PULL UP clears it; 11 s level at ~25 m over open sea: no warnings. jettrap/jet/infinite pass;
  jetsystems passes (its G-LOC timing is flaky at headless ~10 fps).
## Stage: procedural caves (2026-10-22)
- game/js/level.js: `buildLevel(tier, seed, { home })` generates each base's cave, seeded by the base name (so the
  same island always has the same cave). 64 wide; height 44 (home), 56/60/64/68 for tiers 1-4. The shaft stays at
  x 29..35 (CAVE_OX 32.5) and drops 16-21 cells straight onto a flat ledge in the entry chamber, like the old drop.
- Recipe: 3+tier chambers -> tunnel tree (higher tiers chain more, so routes are longer; low tiers may get a shortcut
  loop) of midpoint-displaced polylines swept with a disk (twistier with tier) -> flat floor slab per chamber ->
  boundary noise + 4 rounds of cellular-automata smoothing with a guaranteed-open core -> fill stray pockets.
- Roles from the real flying distance (navMap: a 6-cell disk flooded from the shaft mouth, 8-connected): pod in the
  furthest chamber, pad in the deepest of the rest, tanks in the next two. Any target unreachable -> next seed
  (about 1.3 attempts on average). Turrets (tier+1) on rock seats facing open air, away from the drop and the entry,
  favouring the pod and tank chambers.
- main.js buildCaves: one buildCaveMesh per base (no shared proto); all five caves build in ~70 ms (PROF.caves).
- Gotchas: a tunnel arriving from below cut through the floor slab and left a 4-cell squeeze -> tunnels to a chamber
  below leave from a side port; a short shaft let dropping helicopters crash on a lumpy chamber bottom (caveaim, loop)
  -> long straight drop onto a flat ledge.
- Tests: tools/cavebench.mjs (pure node: ASCII maps, seed sweep, connectivity/width/floors/turret seats/determinism),
  tools/scenes/caves.mjs (enters all five caves, parks by the pod and on the pad, winches the pod).

## 2026-10-22 — UH-1H "Huey" (flight model, cockpit, exterior, sound, systems)
Files: game/js/hueyfm.js (flight model, pure), hueymodel.js (exterior), hueycockpit.js (3D cockpit), heli.js (now the
glue: systems, cautions, HOTAS / pedals via hotas.js CTL, stability assist), audio.js (sfx.huey), main.js (heli parts
only), tools/hueybench.mjs + hueypilot.mjs (node bench), scenes hueystart / hueyhover / hueyauto / hueycockpit / hueymodel.
Sources (reused from the MC-Huey project's notes): Heffley NASA CR-3144 (trims, inertias, derivatives), Talbot NASA
TM-73,254 (fuselage, stab bar, tail rotor), DCS UH-1H manual (limits, procedures), TM 55-1520-210-10 charts (autorotation).
- World scale: real air and real gravity (9.81) for the Huey only - a helicopter fits the 1.3 km map at real speeds, and
  the validated numbers are the in-game numbers. Real size too: 48 ft rotor, ~17.4 m long (the jet is real size as well).
- Model: 2-blade teetering rotor (no hub moment: control = thrust tilt, so low g = no control), blade-element thrust with
  Glauert inflow + first-order dynamic inflow, Johnson's empirical vortex-ring curve, Cheeseman-Bennett ground effect,
  flapback / coning / transverse-flow flapping (CCW rotor: right roll in ETL), Bell stabilizer bar (gyro, 0.16 mixing,
  3.3 s washout - Talbot), retreating blade stall and tip Mach drag, mast-bump stop. Tail rotor = fan (momentum) + part
  of Talbot's T4 damping. T53: N1 lag/accel limit, free-turbine torque (2 - N2), PI governor with the droop compensator
  and conditional integration, EMER, starter / light-off / hung start, EGT. Freewheel between engine and rotor.
  Talbot fuselage, synchronized elevator (DCS/Talbot table), cambered fin, downwash on fuselage and stab. Skids: 6 spring
  contacts, deadbeat skid friction on the effective mass (rotation included) relative to moving decks.
- Bench (node tools/hueybench.mjs, 41 checks, all pass; 3629 kg / 8000 lb, SL) vs published:
  | item | model | published |
  |---|---|---|
  | hover OGE torque | 36.5 psi (73%) | 32-40 psi (DCS), est 38.4 |
  | hover collective / pitch / roll | 15.3° root / +4.2° / -1.1° (left skid low) | 14.5° / +4.0° / -1.1° (H) CONFIRMED |
  | hover pedal / tail rotor pitch | 22% left / 7.2° | 1/4-1/3 left (DCS), 6.4° (H) |
  | trims 0-120 kt (coll / pitch / tail) | max err 0.8° / 1.5° / 1.0° | Heffley cases 122-128 |
  | power bucket | min 19.4 psi at 60 kt | Vy ~55-60 kt (TM) |
  | IGE (1 m) vs OGE torque | -10% | ~10-20% (INFERRED) |
  | climb at 50 psi, 60 kt | 11.6 m/s | 12.4 m/s (H, "max power") |
  | retreating blade stall onset / reaches VNE | 132 kt / 128 kt at < 54 psi | ~120-130 kt (DCS), 124 kt red line |
  | autorotation 70 kt, NR 100% | 9.8 m/s (1925 fpm), +4.1°, right pedal | ~8.6 m/s TM, +3.1° H, tail ~0° |
  | full-down rpm at 70 kt | 334 rpm | 320-340 (DCS) |
  | engine failure at 90 kt, 2 s | 272 rpm | decays toward ~280 (DCS) |
  | collective +12% droop | 4.2 rpm | 3-5 rpm (DCS) |
  | yaw damping Nr hover | -0.70 /s | -0.71 (H) ; Lp -1.08 vs -0.57, Mq -0.29 vs -0.19 (too damped, bar) |
  | VRS: -10% collective from OGE hover | settles to ~3000 fpm | runs to ~2000 fpm in 1-2 s (DCS) |
  | tail rotor lost: hover / 30 kt / 100 kt power reduced | spins 117°/s / spins / held at 12° sideslip | -10 manual procedures |
  CONFIRMED = from the source; INFERRED (tuned, stated in hueyfm.js): CD0 0.0072, hub 0.12 m ahead of the CG, stall
  angle, fin camber, Talbot N1 cut to 5.5 (with 13.95 the bare airframe is directionally unstable and a tail rotor loss
  is never flyable), stab area (Heffley's 2.03 m2 not Talbot's 1.52), tail solidity (Heffley chord), idle gas power.
- Systems (heli.js): battery / generator / inverter (DC volts, AC instruments), main fuel, governor AUTO/EMER, hydraulic
  control, force trim (keyboard stick stays put), low rpm audio, starter, master caution; the 20 real UH-1H caution
  captions + RPM and FIRE warning lights driven by the damage model. Spawn hot at flight idle with an automatic
  throttle roll-on; I = one-key start (~10 s) / fuel cut; ?cold = cold and dark.
- Input: CTL (hotas.js) stick = cyclic, throttle lever = collective (whichever moved last of lever / keys), rudder
  pedals or twist = anti-torque, buttons = door gun / rockets / bombs / winch, hat = door gun. The old heli calibration
  is retired: J opens the CTL controls panel. Stability assist (H, default on for keyboard): attitude command + hover
  drift hold + yaw-rate command, the flight model untouched; a stick switches it off unless you ask for it.
- Fuel: the game tank follows the T53 fuel flow x50 (a tank = ~3 min hover, ~5 min cruise).
- Cave: same rotor and engine in axial flight (H.axial) -> thrust / weight; the model is drawn at 0.36 to fit shipPts.
- Gotchas: the skid friction limit-cycled sideways (the deadbeat gain ignored the roll lever arm of a contact 1.84 m
  under the CG) - use the effective mass at the point; 0/0 when a contact carries no load (NaN everywhere); governor
  wind-up on the throttle roll-on (108% NR) - conditional integration + N2-rate term; idle power drove the rotor so a
  practice autorotation never split the needles; the assist pre-set the wrong lift-off trim (forward/right instead of
  aft/LEFT) and drifted the big rotor into the carrier's island (rotor strike) - spawn moved to the aft H spot;
  scripted test pilots must hold rpm with the collective and stay out of the H-V avoid area (old scenes cut the engine
  at 150 ft in a hover: not survivable in a real Huey); a scripted height hold that pulls collective with drooping
  rpm over-pitches the rotor (a real Huey trait - the test now backs off below 95% NR).
- Scenes updated for the real aircraft: rescue / damage (failures in a low hover over the flat apron), loop (cave hover
  collective 0.385), dive (was already broken on main: pre-archipelago coordinates).

## 2026-10-22 — cockpit FOV slider
- Pause menu (Esc / P): COCKPIT FOV, 40-100° vertical (default 70; was 62 in the helicopter, 74 in the jet), drag or
  LEFT / RIGHT, stored in localStorage (tz_ckfov). Applies to the Huey cockpit, the Hornet cockpit (zoom = 0.4x of it)
  and the dropship flight deck; chase cameras and the cave side view keep their own. The jet HUD is a physical
  combiner in the cockpit model, so it stays conformal at any FOV. Scene: tools/scenes/fov.mjs.

## 2026-10-23 — NGC-1980 armour: M60A3 TTS and M113A2 (track sim, models, interiors, sound, test ground)
Files (all new): game/js/units/armor/ trackfm.js (the tracked-vehicle sim, pure), m60a3.js (M60A3 parameters + the
tank: turret, stabiliser, fire control, racks, loader, crew, electrics, fire, armour zones), m113.js (M113A2 parameters +
the APC: ramp, trim vane, bilge pumps, M2HB, 11 seats), armorballistics.js (game-level shells and armour), tankmodel.js
(M60A3 exterior + the shared running-gear kit), m113model.js, tankinterior.js (M60 driver / gunner / cupola, M113 driver
/ troop compartment), armoraudio.js, testground.js (the test ground, pure: used by the bench and the dev page);
game/dev/tank.html + tank.js; tools/tankbench.mjs; scenes tankmodel / tankinterior / tankdrive / tankm113 / tankaudio.
No shared files touched (main.js, audio.js, war.js untouched): wave 2 plugs these in through the interface below.

**The sim (trackfm.js), per 1/240 s substep** (AI vehicles can run 1/120: `createTrackSim(P, { substep: 1/120 })`):
- 6-DOF rigid hull (CG, diagonal inertia, quaternion). Hull frame: origin on the ground at static ride height, centre of
  the track contact; x right, y up, z AFT (forward -z, like the jet).
- Roadwheels: massless, on preloaded torsion bars (the rebound stop is a stiff spring, so a hanging wheel touches down
  without a force step), dampers on the stations that have shocks, bump stops. Travel = where the ground puts the wheel
  circle, sampled at 7 points (a kerb lifts the wheel before its centre reaches it). Between adjacent wheels the bottom
  run is two more contacts (it bears on ridges and step lips). Idler and sprocket arcs (to 155° from down) and the
  inclined front / rear runs are rigid contacts; hull probes for high-centring, rollovers and the gun digging in.
- Contact normal = the terrain normal; a contact that meets a wall or an edge (kink in the height field: second
  difference > 5 cm) uses its own geometry. Soil edges crumble under a heavily loaded track (up to 0.3 m).
- Track-ground shear: Wong's exponential law on a 2-D shear-displacement state per contact, relaxed as fresh links
  arrive (steady state = Wong's drawbar-pull / slip curve; at standstill a stiff spring: parks on a 30 % slope with zero
  creep). The links in contact move along the contact plane at track speed (the track conforms). Longitudinal and
  lateral slip, skid steer and pivots all come from this one law.
- Soils (SOILS): Bekker n, kc, kphi, cohesion, friction angle (Wong table 2.3: LLL sandy loam = grass, dry sand, WES lean
  clay 32 % = mud, lean clay 22 % = dirt, snow) + an INFERRED bog; rubber pads on paved / rock. Sinkage from a low-passed
  track pressure (plastic: sinks fast, recovers slowly) plus slip sinkage; compaction resistance; internal track
  resistance R_in = W (222 + 3 V) N (Wong).
- Drivetrain: engine, converter turbine and two sprockets as rotating bodies joined by torque-limited constraints solved
  with sequential impulses: range clutch, converter lock-up, one proportional steer constraint (cross-drive: steer speed from the
  input, pivot in neutral; controlled differential: steer ratio on the output, no pivot), brakes, park brake, downshift
  inhibitor, automatic shifting (TX100). Diesel with an all-speed governor on a net torque curve, injection lag,
  starter, stall, fuel burn incl. fan power; Trilok converter (capacity factor + torque ratio). The ground's pull on each
  sprocket is implicit (stiff soil stays stable).
- Water: buoyant hull columns, quadratic drag, paddle thrust from track slip through the water (and its torque back on
  the sprockets), the M113's trim vane (bow lift), intake flooding after ~0.8 s under (stalls the engine), leaks through
  the deck line, bilge pumps; water aboard adds mass (sinking). Events: stall, start, flooded, thrown, bellied, rollover,
  swimming, sinking, knockdown, impact, gunDug.

**INTERFACE FOR FOUNDATION (wave 2)**
- Create: `createM60A3(opt)` / `createM113(opt)` (vehicle with crew systems) or `createTrackSim(P, opt)` (bare chassis).
  `V.reset(x, z, yaw, env, { range, park, speed, running, cold, vane, pumps, ramp })` sits it on the ground (plane fit
  under the track corners). `V.step(dt, env, input)` returns this frame's events. Pose for rendering: `V.fm.origin()`
  (hull frame origin, world) + `V.fm.q` (quaternion {x,y,z,w}, three.js convention); `V.fm.pos` is the CG.
- env (what the host provides): `height(x, z)` REQUIRED; `surface(x, z)` -> 'paved'|'rock'|'dirt'|'grass'|'sand'|'mud'|
  'bog'|'snow' (default dirt); `water(x, z)` -> water level or -Infinity; `normal(x, z, out)` optional;
  `obstacles(x, z, r)` -> [{ kind: 'cyl', x, z, r, top, id, breakN } | { kind: 'box', x, z, hx, hz, yaw, top, id,
  breakN }] (things with breakN get pushed over: event 'knockdown'); `raycast(o, d, max)` -> distance (laser).
  Moving decks are not supported yet.
- Inputs (M60A3): throttle, brake, steer (-1..1, + right), range ('R','N','L','H'), park, starter, fuelOn; trav, elev
  (power control handle, + right / up), fire, coax, lase, dump, ammo ('M735'|'M456'|'M393'), stab, power, sight
  ('day'|'tts'), ttsMag (3|8), ttsPolarity ('wh'|'bh'); commander: cupTrav, cupElev, fire50; extinguish.
  (M113): the same driving inputs with ranges 'R','N','1','1-2','1-3'; mgTrav, mgElev, fire50; ramp, vane, pumps,
  dismount / mount (seat index, 'all', 'any').
- Shots come out as events `{ type: 'shot', weapon: 'main'|'coax'|'mg50', round, p, dir, v0, vel }`: the host flies
  them with armorballistics `newShot` / `stepShot` (the model the computer's tables use) and reports hits with
  `V.hit({ round, range, o, d })` (a ray in the hull frame; returns the result + events: crew wounds, component damage,
  fire, cook-off, kill state M / F / K). Recoil is applied to the hull by the tank itself.
- Models: `buildM60A3Mesh()` / `buildM113Mesh()` -> { group, hull, turret, cupola, ..., animate(state), setInside(bool) };
  state from the sim: travel = fm.wheels[s][i].s, trackPos = fm.trackPos, az / el / recoil / cupAz / mgEl, hatches,
  ramp / vane. Interiors: `buildTankInterior()` (add .group to the hull, .gunner to model.turret, .commander to
  model.cupola) / `buildM113Interior()` (add .group to the hull, .rampIn to model.ramp, .cargoIn to the cargo hatch);
  eyes: TANK.DRIVER_EYE, TANK.GUNNER_EYE_T, TANK.COMMANDER_EYE_T, M113_EYES. Sound: `new ArmorAudio(sfx.ctx, sfx.master)`,
  `.update(V, 'm60'|'m113', { inside, cam })` per frame, `.mainGun()`, `.mg(weapon)`, `.loaded()`, `.impact(big, dist)`.
  The dev page (game/dev/tank.js) is the reference host: cameras, sights, thermal view, shells, hits, sound.
- Cost: ~1.0 ms per 1/60 s frame for an M60A3 at 240 Hz on rough ground (0.55 ms at 120 Hz), M113 0.4 ms; no
  allocation in the substep loops.

**Bench (node tools/tankbench.mjs: 65 checks, all pass).** C = in a source read for this work (AFVDB, FAS, Wikipedia
citing Foss / Jane's and Hunnicutt, armedconflicts.com), U = unverified, I = inferred, GAME = game balance.
| item | M60A3 sim | published | M113A2 sim | published |
|---|---|---|---|---|
| top speed, road | 48.7 km/h | 48 (C) | 63.6 km/h | 64 (C) |
| 0-32 km/h | 10.3 s | not found (U ~15-20) | 9.2 s | 11.0 s (FAS, C) |
| reverse | 17.1 km/h | 16 (FAS, C) | 19.0 km/h | - |
| road range at 30 km/h | 500 km | 450-500 (C) | 446 km | 480 (C) |
| gradient | climbs 60 % at 3.5 km/h, fails 75 % | 60 % (C) | 60 % at 2.3 km/h, fails 80 % | 60 % (C) |
| side slope | holds 30 % parked (no creep) and driving | 30 % (C) | same | 30 % (C) |
| vertical step | 0.91 m yes, 1.2 m no | 0.91 m (C) | 0.61 m yes, 0.85 m no | 0.61 m (C) |
| trench (crawl) | 2.59 m yes; sim limit ~3.6 m | 2.59 m (C) | 1.68 m yes; sim limit ~2.8 m | 1.68 m (C) |
| fording | 1.2 m dry, floods at 1.6 m | 1.22 m (C) | swims | 1.02 m / swims (C) |
| swimming | - | - | 5.5 km/h, 32 cm freeboard | 5.8 km/h (C) |
| turning | pivots 34°/s (dirt); half T-bar at 40 km/h: ~40 m radius | pivot (C) | 8.0 m circle, no pivot | 7.9 m (C) |
| ground pressure | 0.867 kg/cm2 | 0.852 (C) | 0.557 empty / 0.61 with troops | 0.55 (C) |
| traverse / elevation | 16.2 s for 360°, 3.9°/s, +20/-10° | 16 s, 4°/s, +20/-10° (C) | - | - |
| stabiliser on the move | 2.3 mrad on vs 44 off at 23 km/h | two-axis; Pk >70 % with, ~0 without (C, qualitative) | - | - |
| soft ground | grass 44, sand 42, mud 27 km/h (sinks 24 cm), bog: bellied | - (I) | 43 / 41 / 32, bog: bellied | - (I) |
INFERRED parameters (stated in the files): gear ratios (CD-850-6A: L 5.1, H 1.26, R 3.62, final 4.4; TX100: 4.0 / 1.75 /
1.0, R 3.4, final 3.95), converter capacity and stall ratios, steer ratios (the M113's tuned to its 7.9 m circle),
torsion bar rates (~1.1 Hz heave), track masses and inertias, the M113 track's internal-resistance factor, buoyancy
columns, paddle coefficient (tuned to 5.8 km/h), the soil-to-surface mapping and the bog.

**Weapons are GAME-LEVEL** (the coordinator's instruction mid-wave): headline muzzle velocities only (M735 1501, M456
1173, M393 732, 7.62 853, .50 887 m/s), a game drag, game penetration values and game armour thicknesses per zone
(layered: track skirts and fenders use up part of a round's value). The computer is a simple range (superelevation from
the same flight model) + lead (tracking rate x time of flight, capped at 25 mils) solution, applied by offsetting the
gun from the sight line (the gunner keeps the reticle on the target). Decisions: the coax is the M240 (standardised with
the M60A3 around 1979: Wikipedia, FAS); hydraulics are fire-resistant with Halon (two shots; crew compartment automatic,
engine manual); 63 rounds in three racks (13 ready in the bustle at 7.5 s a round, 26 in the hull at 13 s, 24 on the
floor at 11 s; the loader slows when wounded or on the move, and the commander loads if the loader is dead); combat weight
52,617 kg (sources conflict 51.4-52.6 t).

**Models and interiors.** M60A3 at real size (lofted hull and needle-nose turret, fenders with stowage boxes, headlight
guards, TTS housing with doors, M19 cupola with the M85, xenon searchlight, thermal-sleeved M68 with bore evacuator,
bustle rack with bedrolls, smoke dischargers, antennas, spare track blocks, jerry cans, tow cable), MERDC Summer Verdant
painted per face from a 3-D noise, mud low down, dust on top, stencilled bumper codes and the turret number. The
running-gear kit (both vehicles): wheels ride trailing torsion arms with the sim's travel, shocks stretch, sprocket /
idler / wheels spin with the track, and the links (80 on the M60, 63 on the M113, instanced) follow the real belt round
the circles (support rollers, sag). M113: aluminium box with glacis, plywood trim vane (folds / raises), ramp with door,
cargo hatch, cupola with M2HB, front sprocket, no support rollers. Interiors are closed rooms seen only through the
vision devices (the exterior lofts are back faces from inside): driver (periscopes, live gauges, warning lights, T-bar,
pedals, selector, park brake, hull rack), gunner (full-screen M35E1 day / TTS thermal sight pictures with mil reticle,
range, round, READY, mode; E looks up into the fighting compartment: breech that recoils, power control handles that
move, M21 panel with a live range readout and lamps, handwheels, bustle ready rack), commander (cupola with eight vision
blocks, turns with the .50), M113 driver (four periscopes, laterals that pull, selector, gauges, bilge lamps) and troop
compartment (two benches, eleven seated infantrymen in OG-107 and M1 helmets with M16A1s, the ramp opens to the world,
dome lights, radio). The TTS view re-renders the scene in heat greys (hot hulks, engine decks and running gear, cool sky
and ground) through a green-phosphor shader with scan lines, noise and WH / BH polarity.

**Gotchas found on the way.**
- The first frame's rAF timestamp can be earlier than the load-time performance.now(): dt < 0 ran the sim backwards into
  NaN (and crept the smoothed inputs). Clamp dt >= 0 on the page and refuse dt <= 0 in sim.step.
- Contact normals along the hull's tilted up axis gave a FREE horizontal force whenever the hull pitched (2.7 kN of thrust
  at the M113's 1.3° nose-down trim): top speed depended on the CG position. Use the terrain normal; geometry normals
  only at walls and edges.
- A finite-difference normal over a step lip looks like a 51° slope (passes a steepness test) and pushes the hull back:
  detect kinks by the second difference instead.
- Inclined track runs with a link direction fixed in the hull dragged when pressed flat on the ground (the cos of the run
  angle): project the link direction onto the contact plane at track speed.
- Sinkage computed from the instantaneous load fed back through the dampers into a period-2 limit cycle (730 / 300 kN
  alternating): low-pass the load and measure damper rates over the unsunk ground.
- The side-slope lane had no eastern bound and raised a 4.8 m wall across the bump course; it is a bounded ridge now.
- Steering first used a steer brake easing off against a steer clutch coming in: at half travel their torques cancelled
  and the lower half of the T-bar did nothing. One proportional steer constraint now (squared response on the M113's
  laterals); full steer at top speed still skids and throws tracks, so the dev page narrows the keyboard steer with
  speed (Right Shift: no limit).
- A cleared 2D overlay canvas was not re-composited in headless Chrome (a stale reticle in later shots): hide it instead.
- The snap harness wraps evals in `const __r = ...`: a scene variable named __r breaks it.
- A `//` comment pasted mid-line by sed swallowed the rest of the statement (again): use /* */ in one-liners.
- Sensitivities, documented not hidden: a sharp CONCRETE 0.91 m wall is marginal for the M60 in the sim (face friction
  must lift the nose against the rear pivot; earth banks with crumbling lips are fine, so the test ground's steps are
  earth banks), and both vehicles bridge trenches ~1.4-1.6x their ratings at a crawl (rigid track, firm far wall; the
  ratings carry field margins).

**Tests and runs.** node tools/tankbench.mjs 65/65. Scenes (from tools/, CHROME_PATH=... node snap.mjs scenes/<s>):
tankmodel.mjs 2/2 (VEH=m113 too), tankinterior.mjs 2/2 (driver, sight pictures, gunner station, cupola),
tankdrive.mjs 9/9 (step, trench, 60 % ramp, ridge, mud, ford, laser range, a first-round SABOT hit at 1000 m, a
stabilised hit on the move at ~1000 m),
tankm113.mjs 4/4 (ramp, vane, troops, swims at ~5.9 km/h), tankaudio.mjs 4/4 (offline render: louder under load,
muffled highs inside, the gun, the 6V53).

**Untested / not done.** A HOTAS / gamepad on the tank (keyboard + mouse on the dev page); moving decks (landing craft);
the hatch-open driver view; AI driving; damage drawn on the model (burning, a thrown track off its wheels); night (the
searchlight lights nothing yet); terrain heat in the TTS beyond a flat grey; sound on real speakers (only measured
offline). Next step (wave 2): FOUNDATION hosts V.step / the model / the interior on the island terrain (height, surface
from the terrain classes, water at 0), shells through war.js, enter / exit at the hatches; then AI tank and APC drivers.
