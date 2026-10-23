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

## 2026-10-23 — NAVAL: ALBATROSS, KRAKEN, LEVIATHAN, container ship, ships that move with the sea
Files: game/js/units/naval/ (albatross.js, kraken.js, leviathan.js, containership.js, deckcrew.js, mounts.js,
navalfx.js, navkit.js, seamotion.js), game/dev/ships.html (+ ships-dev.js), tools/navalbench.mjs,
tools/scenes/naval.mjs, tools/scenes/shipsdev.mjs. ships.js keeps buildCarrier / buildBattleship / buildFreighter and
CARRIER / BSHIP / FREIGHTER as thin wrappers (the old builders are gone).
- ALBATROSS (1980, Midway / Forrestal style, haze grey, hull number 44): flared hull with an enclosed hurricane bow,
  black boot-top over red anti-fouling, waterline grime, hangar-deck openings under three deck-edge elevators (roller
  doors part up, hangar lights), catwalks and safety nets, gun sponsons. Island: flag bridge, navigation bridge (the
  helm.js bridge room sits inside it unchanged), pri-fly overhanging the deck, raked funnel with black uptakes and
  boiler smoke, tripod mast with SPS-49 (rotating curved reflector), SPS-48 planar array (rotating), SPN-35 radome,
  TACAN, ESM domes, yardarms, life-raft racks, hull number with shadow, rust weeping from the scuppers. Deck: textured
  (non-skid patches, padeye grid, tyre rubber in the landing area, oil stains, catapult soot), landing-area lines on
  x = -2.5, four wires (cross-deck pendants on supports) at the DECKOPS positions, catapult track + shuttle at the
  launch bar of a spotted jet, a JBD that rises behind a jet on the cat, LSO platform with its team, Fresnel lens
  (meatball + datums), deck-edge / centreline / drop lights. Lived in: 31 deck crew in 1980 jersey colours (idle,
  walk, signal, kneel at wheels, LSO, talk, seated driver), a tractor lapping the fantail, MD-3A tractors, Tilly,
  a fuel bowser, huffers, fire bottles, tow bars, two parked Hornets (baked from buildJetMesh, instanced) and two
  parked Tomcats at real size with oversweep and added gear, chocks and chains. Crew clear out from under a helicopter
  or jet coming down near them (war.js tickParts passes an avoid() in the ship frame).
- KRAKEN (seized 2030s Ford-class): angled-deck sponson and starboard elevator bulges (a deck polygon), island far aft
  with flat radar arrays, no funnel, four flush EMALS tracks, three AAG wires. RUNAWAY refit: sensor pods, cyan IFF
  strip round the whole deck edge, glyphs over the old "82" and the painted-out stern name, a crystal sensor spire,
  glowing conduits across the deck, autonomous deck tugs, cargo pallets, nine parked RW ducted-fan flying-wing drones
  (instanced, glowing seams), heavier rust (months unmaintained). Mounts: 2 RAM (seized), 2 RUNAWAY lasers.
  dims.TOWER_Z = 22 (its own; the ALBATROSS keeps 6).
- LEVIATHAN (RW-9, replaces the battleship): 96 m wave-piercing tumblehome hull, ceramic upper works on dark
  composite, cyan seams, asymmetric (sensor blade to starboard with flat arrays, a port-side sensor fin, power spine
  with heat-sink fins off the centreline). Three railgun turrets (twin rails, glowing bore) that train and elevate to
  the shot, kick back and flare cyan when they fire (war.js updateBattleship); four point-defence lasers whose beam
  shows when they fire (war.js gunFire -> userData.fireBeam). Game-level visuals and behaviour only.
- Container ship (replaces the freighter): Yara Birkeland-class autonomous electric feeder at real size (80 x 15 m):
  deckhouse right forward with its windows plated over in ceramic, sensor mast with pods, no funnel, battery vents
  and azimuth-pod hatches aft, 8 bays x 5 rows of 20 ft boxes from a fixed stow plan (one InstancedMesh, colour per
  box), a few boxes swapped for glowing RUNAWAY cargo pods, lashing bridges, the name painted out, a forecastle laser.
  FREIGHTER dims are now { L: 80, W: 15, DECK: 4 } (was 46 x 10 x 3): a bigger target.
- Ship motion (seamotion.js, pure, node-tested): Bretschneider sea for the NATO sea state (Hs, Tp), 14 components,
  cos^2 spread; each excites heave / pitch / roll through waterplane-averaged elevation and slope (sinc and
  3(sin x - x cos x)/x^3 over an effective 0.7 L x 0.8 B waterplane, Smith depth attenuation), a damped oscillator per
  DOF at the ENCOUNTER frequency, analytic steady state with integrated phases (stable at any frame rate); heel
  outward in turns (tan phi = V r / g (KG - T/2) / GM) and a little trim with speed. Real-ship numbers per hull
  (Midway, Ford, Yara Birkeland: CONFIRMED dimensions; natural periods and damping INFERRED); heave scaled to the
  game hull (the carriers are 0.44 / 0.38 scale), angles not. Sea state: ?sea=0..7 (default 4 MODERATE), war.setSea(n).
- tools/navalbench.mjs (22 checks, all pass): WMO / NATO Hs ranges, Hs of the discretised sea, ALBATROSS head-sea
  pitch SA SS3 0.09° / SS4 0.39° / SS5 0.94° / SS6 1.67°, heave SS5 0.29 m, ramp vertical velocity SS5 1.8 m/s,
  beam-sea roll 0.9°, roll damping grows with speed, encounter period head < following, the Ford pitches less than
  the Midway, the 96 m monitor pitches 3.9° and the 80 m feeder rolls 4.8° in SS5, steady turn heel 4.7° at 30 kn /
  1.5°/s, deck-height maths vs the YXZ rotation matrix. The bands are INFERRED from published CV seakeeping summaries;
  the NATO mean Hs / modal periods per state are as recalled (Bales 1983 / STANAG 4194), UNVERIFIED offline.
- deckY includes the motion: war.js deckY uses each builder's localDeck(lx, lz) (deck + superstructure in the ship
  frame) through shipPointY(heave, pitch, roll) - the same attitude the mesh gets (placeShip). surfVel also returns
  vy (the deck's vertical velocity), W.deckAt(u, x, z) gives the deck plane; jetfm's catapult and wire checks use it
  (via jetplay's carrier().deckAt), main.js spawnSpot puts the helicopter on the moving deck. The sky carrier's tilt
  goes into the same attitude.
- Effects (navalfx.js): a per-ship foam ribbon mesh following the real track: the churned centre wake from the stern
  and the two Kelvin arms (points the bow passed, pushed out at 19.47°), fading over ~29 s; bow spray at speed and in
  bursts when the stem plunges; stern boil; boiler smoke from the ALBATROSS funnel (none for the nuclear KRAKEN or
  the electric feeder). Replaces the old fx.wake decals for ships at sea.
- Mounts API: parts.mounts = [{ kind: 'ciws' | 'sam' | 'ram' | 'laser' | 'railgun', pos: Vector3 (ship frame),
  dir: Vector3 (outward), node: Object3D (the mount; its userData.yaw / pitch groups are what war.js turns),
  gun: index into parts.guns (absent for the railgun turrets), arc: [yawMin, yawMax] (ALBATROSS only) }]. To fit a
  full model, empty node's children and rebuild under userData.yaw / pitch, or swap parts.guns[i].
- Gotchas: Kit.loft winding was inside out (hulls looked right from one side: you saw the far side's inner faces);
  glow kits need the same push() as the hull kit (the mast lights floated off the island); a headless test camera
  far from the helicopter leaves the sky dome and terrain window behind (naval.mjs parks the helicopter above it).
