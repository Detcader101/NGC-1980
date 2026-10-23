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

## 2026-10-23 — NGC-1980 wave 1: RUNAWAY ground forces (RW-1 STRIDER, RW-7 hover tank, seized M1A2 SEPv3 / T-90M, squad AI)
Branch `ngc/rwground`. New files only (no main.js / war.js changes this wave):
`game/js/units/runaway/` hit.js (hit-info contract), strider.js + stridermodel.js, hovertank.js + hovertankmodel.js,
mbt.js + mbtmodel.js, squadai.js, rwworld.js (world query + sandbox island), sandbox.js (pure battle host), rwaudio.js,
rwkit.js (model kit); `game/dev/runaway.html` (+ runaway.js, the sandbox), `game/dev/rwmodels.html` (+ rwmodels.js,
turntable); `tools/runawaybench.mjs`; scenes `runaway.mjs`, `runawaycloseup.mjs`, `runawaylive.mjs`, `rwmodels.mjs`,
`striderfall.mjs`. Weapons are GAME-TUNED throughout (ammo classes and armour points in hit.js, no real-world
weapon-performance data); the depth is in locomotion, hover physics, models, sound and squad behaviour.

### RW-1 STRIDER (strider.js, stridermodel.js)
- A 2.2 m, 150 kg digitigrade machine soldier (design values). Body = 3D variable-height linear inverted pendulum
  over a centre of pressure that can only sit inside the support polygon (one toe pad 0.30 x 0.14 m, or the hull of
  both). Stepping by divergent-component-of-motion control (Englsberger 2015 / Pratt 2006 capture point) WITH step
  timing adaptation: every substep it searches the remaining step time (longest first) for a foothold that (1) the
  swing leg reaches in 3D (a foothold below the hip on a grade costs reach), (2) the stance leg is still long enough
  for, (3) the swing foot can get to (11 m/s). Hurried steps = the STUMBLE; no reachable foothold = the FALL.
- Fall: rigid pendulum about the support edge (theta'' = g / L sin theta), impact, lie, then the get-up: feet plant
  under the hips, fold (no rise), one fast swing through 75 %, a dead stop, a slow mechanical finish. A shot-off leg
  = down for good, still armed (shoots prone). Rifle hits to the sensor head blind it (sound only).
- Hits (hit-info contract): momentum pushes the CoM and spins the torso; energy past the armour damages the part AND
  glitches its servos (a stance leg sags and loses its ankle control) - a machine-gun burst into the stance leg while
  running knocks it off its stride. Game armour: rifles get through the head and arms only, MGs the legs too,
  launchers anything.
- Uncanny traits (measured in the bench): the body glides level (1.3 cm bob vs ~5 cm human), the sensor head is
  gyro-stabilised in space (0.00° yaw wander walking) and snaps between scan positions, the torso + weapon slew at a
  hard 7 rad/s and stop dead, a recovering machine keeps its weapon on target while its legs scramble.
- Gait: walk 1.6 m/s at 100 steps/min, run 4.6 m/s at 210 steps/min (quick, scuttling; no flight phase). On grades
  the step period shortens and the body lowers; uphill the top speed falls (a power limit). The hips face the actual
  travel (facing the command while the body lags it made the feet cross in turns); the command turns with a bounded
  lateral acceleration (tight turns are taken slower).
- Model: thigh forward, shin back to a raised hock, a long metatarsal down to a clawed toe pad; ceramic plates over
  dark composite, pale cyan seams, an off-centre lens cluster on a wedge sensor pod, a sensor mast on the left
  shoulder, armoured right shoulder; seized XM7 (coyote, optic, suppressor) with a RUNAWAY sensor puck and IFF strip,
  or the RW coil carbine. ~13 draw calls per machine (rigid merged segments posed from S.pose(); the IK lives in the
  sim so the bench checks it).

### RW-7 hover tank (hovertank.js, hovertankmodel.js)
- 16.5 t, 7.8 x 3.9 m, rigid body 6 DOF. Four ducted lift fans each feed a skirt cell: plenum pressure from the fan
  curve Q = Qmax n (1 - p/pmax) against the hem leakage Q = perimeter x gap x Cd x sqrt(2p/rho), plus the cell's
  volume pumping; lift = p x area along the hull normal. The cushion is a soft spring that follows the ground; an
  active ride control (per fan) damps heave and holds the hem 0.42 m clear (lift = weight at 6.3 kPa, fans 77 %).
- Thrust vectoring 0.45 g in the hull plane (enough to hold and climb 20°), no grip: a hard turn at 16 m/s drifts
  45° between nose and travel. PI station keeping holds it across a 20° slope. The turret's offset weight rocks the
  hull when it slews (3.3°) and the PI trim works it off; the coilgun's recoil kicks the hull back 0.44 m/s.
  A dead fan sags its corner and grounds that cell's skirt, the hull still flies. Vehicles steer along the contour
  where the ground is steeper than they can climb (rwworld steer maxGrade).
- Point defence: an incoming rocket / shell within 45 m gets a flechette burst (55 %, 1.4 s cycle) - a game rule.
- Model: low faceted ceramic hull floating over a thin flared skirt (the gap shows), glowing fan rings under deck
  grilles (rotors spin), off-centre wedge turret with a coilgun of rails and lit coil collars, sensor mast with a
  sweeping head, PD dome aft, underglow, dust.

### Seized MBTs (mbt.js, mbtmodel.js)
| | hull | with gun fwd | width | height | mass | road speed (placeholder drive) |
|---|---|---|---|---|---|---|
| M1A2 SEPv3 | 7.93 m | 9.77 m | 3.66 m | 2.44 m | 66.8 t | 67.0 km/h, 16 km/h on 20° |
| T-90M | 6.86 m | 9.63 m | 3.78 m | 2.23 m (2.22 pub.) | 48 t | 60.0 km/h, 17 km/h on 20° |

Commonly published overall figures; models built to them (7 / 6 road wheels, skirts, CROWS / CITV / doghouse on the
M1, Relikt chevron + glacis V + bustle slat cage on the T-90M), weathered, RUNAWAY refit (ceramic sensor pod on the
roof, cyan IFF strips, glyph blocks painted over the national markings). The drive is a PLACEHOLDER (power-limited
traction, grip, rolling / grade / air resistance, skid-steer yaw limit, attitude from the four track ends) behind the
interface wave 2 fills with the TANK agent's `trackfm.js`: `createMBT(P, { drive: factory })`, factory(P) returns
`{ place(x, z, yaw, env), step(dt, {throttle, steer, brake}, env), p, yaw, pitch, roll, speed, yawRate, wheelSpin }`.

### Hit-info contract (hit.js) - for the INFANTRY agent's ballistics
`{ calibre mm, mass kg, velocity m/s, energy J, direction {x,y,z}, part, point {x,y,z}, type 'ball'|'ap'|'heat'|'frag'|
'blast'|'coil', pen (armour points, optional), impulse N s (optional), side, weapon, src }`; normalizeHit() accepts
`dir`/`direction` as object or array, `vel` (vector), `caliber`. Parts follow the infantry zones (head, thorax,
stomach, armL, armR, legL, legR; machines add weapon; vehicles front / side / rear / top / turret / fan).
Every RUNAWAY unit takes `unit.sim.hit(hit)` and returns `{ part, dmg, pen }`.

### World query (rwworld.js) and the squad AI (squadai.js)
- `makeWorldQuery({ height, water, obstacles })` -> height, normal, isWater, los, raycast, coverPoints, coverScore,
  hullDown, steer(maxGrade); `bakeHeight(fn)` grids an analytic height function (the sandbox got 4x faster).
- AI: `createSquadAI(world)`; `addSquad({ id, side, members, order })`; `order(id, { type: take|defend|patrol|hold|
  retreat, x, z, r })`; `hear(sound)`; `nearMiss(id)`; `update(dt, targets)`; outputs `m.ai = { move, run, crouch,
  face, aim, aimId, fire, look, state }`. Squad states: advance (wedge, armour 30 m behind) -> contact (to cover:
  walls, rocks, or a fold in the ground that hides a crouched body but lets it fire standing) -> bounds (fire teams,
  exact 6 s cadence) -> flank (a stalled fight: a team goes round the RIGHT at 75°) -> assault (strong, close, the
  enemy quiet, after 12 s) / retreat (strength ratio < 0.55: bounding withdrawal to a rally, then hold until
  re-tasked) / regroup / defend (cover round the point, never leaves it). Perception: 10 Hz sensor sweeps in sectors,
  spotting builds with range / movement / firing / cover, terrain + obstacle LOS; sounds triangulated across members.
  Combined arms: striders hunt AT gunners near their vehicles; armour takes hull-down overwatch and backs out of any
  known AT gunner's reach (M1 front to the gunner 150 m, RW-7 with point defence 180 m; the link spans squads);
  armour picks firing positions on an arc round the threat with line of sight (hull-down preferred) and, with no shot
  for 30 s while the walkers fight, accepts the risk and pushes in to 100 m (an ambush chance for a patient gunner).
- Machine weaknesses (deliberate): kill the LINK NODE (member 0) -> 8 s without the link + 1.5 s freeze; synchronised
  volleys (2.4 s on / 0.9 s off: a window to move); exact bound timing; always flank right; strict threat priority
  (a loud MG or an AT gunner draws every rifle: decoys work); loud noises pull them.

### Sound (rwaudio.js)
`new RwAudio(ctx, dest)`: servo whine bank following the nearby striders' joint activity, footfalls (thump + toe tick,
harder when running / stumbling), hover fan roar + blade-pass tone + whistle, M1 turbine / T-90 diesel + track clatter,
coilgun charge whine and crack (snap, falling zap, sub thump), machine 'speech' (FM chirp phrases on squad decisions;
LINK LOST is a broken, glitching phrase), gunfire for both sides, blasts, ricochet pings off ceramic.

### Sandbox (game/dev/runaway.html)
430 m island (central ridge to 24 m with 20-30° flanks, a farm plain with dry-stone walls, roofless crofts, boulders,
a pine wood, a pad). Scenarios 1-6: assault, combined (two strider squads + RW-7 + M1A2), flank, outnumbered, defend,
patrol, vs 1980 DUMMIES (rifle / MG / AT launcher / an M60-ish tank stand-in) that spot, shoot back and get
suppressed. Free camera (drag + WASD/QE, F follow, G free), debug overlay (O: squad + member states, link node,
destinations, aim lines red when firing, cover normals, known contacts, threat axis, flank point, AI log), time
scale, sound on click. `?debug` bridge `window.__RW` { B, start, run(secs), look, lookAt, follow, step, audio }.

### Bench (node tools/runawaybench.mjs): 48 checks, all pass
STRIDER: walk 1.65 / run 4.61 m/s; 20° slopes walking AND running, 8 headings x 60 s, 0 falls (max leg stretch 0.98);
26° walking 0 falls; 8 machines roam the island 90 s (1.9 km, ground to 31°) 0 falls; push recovery 400 N s fore/aft,
240 N s sideways standing, 300 N s any way walking; a 900 N s blow knocks it down and it is up in 3.6 s; 30 rifle
rounds into the thorax do not stop it; an MG burst into the stance leg makes it stumble; rifle -> blind, rocket ->
destroyed, leg off -> disabled but armed; deterministic. RW-7: 10 checks (above). MBTs: dimensions, speed, grade.
AI over three seeds: cover 100 %, flanks right 3/3 and the flankers get there 3/3, retreats 3/3, AT-gunner priority
100 %, no fire in the volley gap, suppression -> cover, link loss -> freeze, armour stands off known AT (199 / 173 /
205 m), defend radius held, ~22 ms CPU per simulated second for a 10 v 10 fight.

### Gotchas found on the way
- Starting from rest by lifting a foot straight away throws the CoM sideways: weight shift first (the DCM moved over
  the stance pad, and pushed forward so the first step goes forward, not back).
- The pad centre sits ahead of the foot reference: unaccounted, every step leaked speed (stops drifted backwards).
- Fixed step timing can't recover pushes: the stance leg runs out of length mid-step (all velocity along the leg was
  killed by the inextensible-leg constraint). Joint foothold + timing search fixed falls from 60 N s pushes.
- Turning: hips facing the command while the body lagged made the feet cross over; face the actual travel.
- Uphill the height servo lagged a ramp by 0.36 m (velocity feed-forward from grad(h).v fixed it), and the 2D reach
  ignored the foothold being below the hip (3D reach + feet set down within reach).
- RW-7: shared scratch vectors overwritten inside the cell loop (forward / right became cell positions: a 3° crab on
  a straight line); fan saturation at the hover point left no trim authority (fan headroom: Qmax up).
- Events raised by hit() between steps were cleared by the next step(): leg-shot falls never reached the host.
- Perception cone + no scanning = squads blind on their flank: sector scanning by the sensor heads.
- Assault on the strength ratio of what was SEEN (one defender) = suicide; armour in the squad centroid made the
  walkers wait for tanks that waited for them (centroid of walkers only); an MBT crept backwards on a slope at the
  brake / grade balance and its steering flipped sign at -0.3 m/s.

### Proposed wave-2 integration (war.js / main.js; nothing changed this wave)
1. `war.js`: import `createSquadAI` (squadai.js), `makeWorldQuery, bakeHeight` (rwworld.js), the sims and models.
   Build the world once in createWar: `makeWorldQuery({ height: bakeHeight(terrainH, 1300, 1.5), water: isWater,
   obstacles })` with obstacles from every island's structs (box from `mesh.userData.r / h`) + AA guns (cyl r 2.8).
2. Lift sandbox.js's host loop into a ground host inside war.js (same adapters: sync / driveUnit / projectiles):
   RUNAWAY ground squads live in `W.ground = { ai, units, proj }`, updated in `W.update` after the air units. Models go
   in islandGroup; `W.setVisibility` hides them outside the fog like other enemy units.
3. Commander (`think`, after step 2 'expand'): when a transport (MV-22B in wave 2) lands at island I, unload a squad
   (4 STRIDERs; from 600 s also an RW-7; from 900 s a seized MBT off the KRAKEN) and `ai.order(id, { type: 'take',
   x: I.pad.x, z: I.pad.z, r: 30 })`; owned islands get `{ type: 'defend', ... }`; squads that retreated are re-tasked
   when `S.holdUntil` passes. `updateCapture`: an RW squad with >= 2 machines up within `pad.r + 10` counts as a
   capturer at `CAP_TIME.squad = 12`; the existing rule (live enemy AA blocks capture) stays.
4. Targets for the AI each frame: the player's infantry / vehicles (INFANTRY, TANK, WHEELED agents: kind inf / mg /
   at / vehicle), player AA guns and structs as 'vehicle', the player's helicopter when below 60 m as 'vehicle'.
5. Damage both ways: player projectiles (`W.proj` 'b' -> AMMO.mg, 'jb' -> AMMO.hmg, 'rocket' -> heat pen 300,
   'bomb' -> blast) get sandbox.projStep's segment tests against RW ground units and call `unit.sim.hit()`; RW ground
   fire goes through `W.shoot` with a hit callback into `W.damage` for structs / aircraft and into the infantry
   agent's damage API for soldiers (same hit-info).
6. Sound: `new RwAudio(sfx.ctx, sfx.master)`, listener = camera, `loops()` with the units near the camera, events from
   the ground host.
7. Performance: squads > 600 m from the camera step at 5 Hz with their walkers moved kinematically along the AI's
   path (no balance sim); full sims within 600 m.

### Untested / known gaps
- Nothing runs inside the real game yet (wave 2). The 1980 side in the sandbox is dummies, not the INFANTRY / TANK
  agents' units; their hit-info field names are matched by convention (the infantry file was not committed yet).
- The MBT drive is a placeholder; no suspension, no track slip. MBT guns / coax fire at game rates.
- STRIDER running has no flight phase; striders do not climb over walls (they path round them); no crouch-walk.
- No pathfinding (local steering only): a squad can get stuck behind a long wall or a cliff; tanks can be cornered
  against steep ground.
- The hover tank's fan / vectoring numbers are design values; no water running (it is a hovercraft, but the sandbox
  keeps it ashore).
- Audio was only checked for errors and a running context headless (no ears on it).
