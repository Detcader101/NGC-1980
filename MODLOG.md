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

## 2026-10-23 — NGC-1980 INFANTRY: the 1980 Marine rifleman (wave 1, branch ngc/infantry)
Standalone modules in `game/js/units/infantry/` plus the range sandbox `game/dev/infantry.html`; nothing in main.js
yet (FOUNDATION wires it in wave 2). Contract for FOUNDATION / MEDINV / RUNAWAY: [docs/ngc1980/INFANTRY.md](docs/ngc1980/INFANTRY.md).
- **Flight of the rounds** (`ballistics.js`, pure): point mass with the standard G1 / G7 drag functions, wind, air
  density from temperature / pressure / humidity, Heun steps (allocation-free, sub-stepped to 1/400 s). Headline
  figures only: muzzle velocities M193 991, M80 853, .45 253, M433 76, M72 145 m/s; drag fitted so the maximum ranges
  match the field manuals (M193 2,861 vs 2,653 m: a point mass flies the subsonic tail too far; M80 3,959 vs 3,725;
  .45 1,547 vs 1,500; M433 402 vs 400; M72 996 vs 1,000). G7 fits the rifle rounds' maximum range better than G1
  (+8 % vs +16 %). Sight solutions: M16A1 apertures (250 m battlesight, 'L' 375 m), M60 leaf (battle + 300-1,100 m),
  M203 quadrant 50-400 m and leaf, M72 front-sight range lines, M1911 fixed 25 m.
- **Hits are a game table**, deliberately (coordinator's call): penetration power (`pen` x v/mv) against material
  resistance per 10 cm, ricochet below a material's grazing angle, a `dmg` scale per round for MEDINV. Tuned so cover
  behaves: a sandbag layer stops rifle ball, plank walls and car bodies do not, brick stops the .45, steel plate stops
  small arms, shallow shots skip off water.
- **Weapons** (`weapons.js`, pure state machines): rates of fire (M16A1 750, M60 550 rpm), semi / auto, closed vs
  open bolt, bolt hold-open, forward assist, 20-round magazines (loaded with 18 like 1980 Marines: full ones jam more),
  M60 belts (4:1 tracer), M203 single shot, M72 extend -> arm -> fire -> discard (backblast event), M1911 slide lock.
  Manual actions run on keyframes (the viewmodel animates the same fractions): tactical / speed reloads (partial
  magazines stay items; speed reloads drop them), charging, SPORTS immediate action, remedial action for stuck cases
  and double feeds, mag / chamber checks (you only know what you have looked at), M60 belt change, barrel change (the
  hot barrel goes into the pack and cools), runaway gun (break the belt). Stoppages scale with fouling, heat, dirt and
  full magazines; barrel heat by Newton cooling fitted to the FM 23-67 barrel-change schedule; cook-off risk on a hot
  closed-bolt chamber. Recoil impulse = bullet + gas momentum.
- **The body** (`soldier.js`, pure): Arma-like inertia (accelerate / brake limits, heavier with load), stand / crouch
  (kneel) / prone with timed transitions, walk 1.52 / run 2.74 m/s (FM 22-5 quick time / double time) / sprint ~5.6,
  lean, free look, aim deadzone, weapon inertia (heavy guns lag), Tobler slope pace, wading and swimming, falls.
  Stamina is physiology: demand from the Pandolf walking equation and the ACSM running equation (load, grade, terrain
  factor), a sprint as an all-out effort; oxygen uptake follows with a lag, the deficit comes out of an anaerobic
  reserve that is paid back afterwards (out of breath after the sprint, fastest recovery at rest); heart rate and
  breathing follow, and drive the sway (breathing figure-8, drift, pulse, pain tremor, movement) by stance, rest and
  bipod. Breath hold ~8 s rested, ~3 s blown. Medical modifiers in, `fallInjury` out.
- **Rifleman** (`rifleman.js`, pure): the whole Marine in one `step()`: loadouts, weapon slots and swap times, the M203
  under the M16, projectiles with host raycasts, body hits through armour layers, explosions, supersonic cracks at the
  listener, dropped items, a HUD status that only reports what the soldier has checked.
- **Viewmodel**: ERDL sleeves, a GI watch, bare hands parented to anchors on the weapon, arms by two-bone IK from
  fixed shoulders; ADS puts the rear sight exactly eyeRelief in front of the eye (the real sight picture: blurred
  aperture ring, front post, the carry handle ears; the M60 leaf; the M203 through its quadrant, raised by the set
  elevation; the LAW reticle with range lines; the M1911 at arm's length); hip, sprint (port arms), prone; inertia from
  turning, bob, recoil kick, bolt cycle, muzzle flash, brass; action tracks for every drill.
- **Third person** (`soldiermodel.js`): a shared rigid skeleton (17 bones, one mesh each), procedural poses (walk /
  run / sprint / crawl cycles, kneel, prone, down, lean, aim, stance blending, arm IK onto the weapon), hitboxes per
  bone (head, neck, thorax, stomach, arms, legs; helmet and vest coverage), and the Marine: M1 helmet with the Mitchell
  cover, a bug-juice bottle in the band and the chin straps hanging, ERDL or OG-107 utilities, M1955 flak vest, ALICE
  belt, suspenders, magazine pouches, canteens, boots.
- **Sound** (`infantryaudio.js`): synthesised; your own shot = blast + body + the action (the M16's buffer-spring
  twang) + reverb tail; distant shots arrive late, darker and quieter with an echo off the treeline; a passing
  supersonic round cracks before its report; steel gongs ring after time of flight + the sound's return;
  mechanics, footsteps by surface with gear rattle, breathing from the soldier's breath phase / depth, heartbeat.
- **Bench** `tools/infantrybench.mjs`: 90 checks (flight, sights, cover table, rates of fire, barrel schedule, stoppages,
  SPORTS, recoil, sway order, march / run / sprint / rush / recovery times, heart-rate recovery, Pandolf, Tobler,
  injuries, the whole shot -> hit loop, hitboxes on the posed skeleton, every module parses).
- **Scenes** (`tools/scenes/`, all on `dev/infantry.html?debug&fixed`, which steps the sim synchronously through
  `__I.advance(sec, input)`): `infantry` (100 / 300 m shots, drop vs the sight line), `infantrydrills` (reloads frame by
  frame, bolt lock, SPORTS, M203 quadrant, M60 bipod + barrel change, LAW, M1911, third person), `infantryviews` (every
  placement, lean, free look, rest and bipod on the sandbags, the aim deadzone), `infantrysights` (one sight picture per
  weapon + spotting scope), `infantryhits` (mannequin parts and armour layers), `infantrymalf` (press check, stuck case ->
  double feed -> rod, runaway M60), `infantrymove` (blown on the hill, wading / swimming, gait cycles in third person),
  `infantryaudio` (offline render: a shot 340 m away arrives 1.0 s late, 8x quieter, darker; crack before report; echo;
  gong after time of flight + sound), `infantryhands` (orbit the arms), `infantrymodels` (weapons and postures). Tags: CONFIRMED (field manual / primary source), INFERRED, UNVERIFIED, GAME.
- Gotchas: (1) a `//` comment appended inside a one-line `if (...) { ... }` swallowed the brace again (weaponmodels):
  the bench now parses every module. (2) Inner `function key()` shadowed the `key` parameter of `createWeapon`.
  (3) Targets lined up in a lane hid each other: they are staggered across the lane by distance. (4) The M16A1 has no
  elevation knob on the left (that is the A2): an early model put one right in the sight picture. (5) A through-and-through
  restarted inside the same hitbox and hit it again: rounds now resume past the exit. (6) Low ready pivoted on the rear
  sight (the stock stood up beside the face): it pivots on the butt in the shoulder pocket. (7) The 1980 range kit with every
  weapon weighed 49 kg, over the 45 kg no-sprint limit: correct, so the range kit is lighter.
