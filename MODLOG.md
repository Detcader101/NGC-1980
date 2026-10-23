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

## 2026-10-23 — Huey sits on the flying SKY CARRIER deck (merge fix)
- Root cause: the Huey's skid contact moved with the deck horizontally (surfVel vx/vz + yaw) but not vertically.
  `war.surfVel` had no vy, and groundY is sampled once per frame before war.update moves the ship, so inside the
  Huey's substeps a climbing deck stood still and then jumped up by vy*dt: the skids hopped (contacts 6/0/6...),
  `H.landed` flickered, Tab could not take the helm. Second merge bug: the helm read the Huey's assisted stick, so
  the stability assist turned W into a pitch hold and the telegraph went astern; it now reads `ctl.raw`.
- Fix: `war.surfVel` returns vy (skyFall keeps u.v.y = S.vy); hueyfm / jetfm `surfaceVel` carry vy into the contact
  relative velocity, and `groundAt` lifts a moving deck by vy * (time into the frame step) for skids, tail, nose
  (jet: gear and hull); the jet's catapult keeps the deck's vy; spawnSpot uses DECK + c.p.y like deckY.
- Checked: sky 8/8 (twice); a scratch scene climbing + turning + ahead, then descending: Huey stays at the same deck
  spot and heading (±0.2 m, ±0.01 rad), lifts off, and the climbing deck catches it in a hover for a clean landing.
  hueyhover, hueystart, hueyauto, rescue, smoke, loop, jettrap green; hueybench 41/41.
## 2026-10-23 — NGC-1980 MEDICAL + INVENTORY (wave 1, branch ngc/medinv)
Pure modules in `game/js/units/infantry/` (no DOM, no THREE, node-testable) + HTML overlay UIs + a sandbox.
- `items.js`: the item database (about 90 items): 1980 USMC kit (M16A1, M16A1/M203, M60, M1911A1, M72A2, magazines,
  M193 bandoliers, M67, M18 smoke, claymore, LC-2 belt and ALICE pouches, M69 vest, M1 helmet, ALICE packs, Unit One
  bag, e-tool, P-38), 1980 medicine (field / battle dressing, cravat, strap-and-buckle tourniquet, wire ladder splint,
  morphine syrette, APC, Lactated Ringer's IV, ammonia inhalant, 14G catheter), rations (MCI "C-rats", LRP), seized
  modern loot (M4A1 RW refit, PMAGs, M855A1, plate carrier, ECH, CAT, QuikClot, SAM, Hyfin, fentanyl lozenge, IFAK,
  2030s MRE) and RUNAWAY items (needle carbine, cells, carapace, MENDER nanite injector, sensor core). Crates and caches.
  Decision: the MRE was adopted in 1975 but reached troops in 1983, so in 1980 the Marines eat C-rats; the MRE is loot.
- `medical.js`: 7 regions with Tarkov HP (35/85/70/60/65) and blacked-out limbs (damage spills x0.7, stomach x1.5);
  zones (cranium/face/neck, chest, abdomen/pelvis, upper arm/forearm/hand, thigh/shin/foot) decide vessels, bones and
  armour coverage. Blood 70 ml/kg; bleeds light/heavy/arterial with flow at normal pressure, scaled by MAP (they slow in
  shock), clotting (light ~4 min, heavy slowly, arterial not), control class tq/junctional/internal; ATLS classes I-IV
  drive HR, BP, RR, mental state, consciousness (cerebral perfusion), vision, tremor and stamina. Haematocrit and
  crystalloid (3:1 rule; IV pressure makes an uncontrolled bleed bleed faster), transcapillary refill, pneumothorax
  (open / sealed / tension / decompressed / vented), fractures, pain + adrenaline, morphine PK (overdose worse in shock),
  hydration and energy (bite after hours), tourniquet ischaemia (2 h safe, limb lost at 6 h), RW nanites.
- DAMAGE AND ARMOUR ARE GAME-LEVEL (coordinator instruction, mid-task): rounds carry Tarkov-style dmg / pen / bleed,
  armour has classes 1-6 (M69 and M1 = 2, seized soft armour 3, ECH 4, ceramic plates 5, RUNAWAY lattice 6) with
  coverage per zone and face, durability and blunt damage; fragments are a simple falloff table. No real terminal
  ballistics are modelled or researched; the medical side keeps its sourced depth. Bench section 4 checks feel only.
- Treatments (times self / buddy): dressing 40/25 s (stops light, heavy x0.3, arterial x0.6, wrapper seals a sucking
  chest wound), tourniquets roll success per application (CAT 97% leg, strap-and-buckle 30% leg / 85% arm, cravat
  windlass 60% leg; +8% buddy), TIGHTEN re-rolls a windlass, a second TQ above the first; QuikClot (3 min pressure)
  packs junctional wounds; splint / sling; morphine (absorption compressed ~10x for play, documented); IV is
  CORPSMAN ONLY (decision); wound care with the Unit One bag (corpsman) restores a ruined limb to 50%; the inhalant
  wakes a knocked-out man, not a shocked one; MENDER heals everything (a second dose within 10 min: seizure).
- `inventory.js`: nested grids and named slots, rotation, stacks (split / merge), magazines with LIFO round segments
  (tracers on top feed first), loading from loose rounds (0.9 s/rd) or stripper clips (0.3 s/rd), reload swaps the
  fullest magazine in and the empty back where it came from, quick slots, search (items revealed one by one),
  encumbrance from load / body mass + the Pandolf load-carriage equation, loadouts (rifleman, grenadier, mg,
  corpsman, RW trooper body), loot tables, serialise / relink.
- `invui.js` / `medui.js`: overlays in the game's style. The health screen draws the figure facing you (his right on
  your left), wounds, tourniquet bands, splints, an M on the forehead after morphine. Also `createMedHud` (HUD strip)
  and `createVisionFX` (vignette + canvas grayscale / blur + blackout + nanite tint).
- Sandbox `game/dev/medinv.html` (?debug -> window.__MI, &manual stops real-time stepping, &seed=N).
- Bench `tools/medinvbench.mjs`: 108 checks pass. Femoral artery untreated: class III 3:15, unconscious 5:34, dead
  6:21 (lit. 3-5 min, INFERRED); carotid 2:02 / 3:56; brachial 6:33 / 12:55; heavy venous class III 17:14 and survives;
  light ooze clots; ATLS HR/SBP/RR bands per class (CONFIRMED). Femoral bleed + self-aid at 0:15, survive 30 min:
  CAT 98%, strap 29%, two straps (buddy) 62%, cravat 59%, cravat + tighten 87%. QuikClot on a groin bleed 91%.
  Ringer's: 403 of 1000 ml left after an hour. Sealed sucking chest wound -> dead of tension at 20:22; decompressed
  survives; vented seal no tension. Loads incl. 3.6 kg clothing: rifleman 29.8 kg (fighting 20.5), grenadier 28.7,
  corpsman 30.6, M60 gunner 41.3 (FM 21-18: 22 kg fighting / 33 kg approach). Pandolf 75+30 kg at 1.34 m/s: 429 W.
- Scenes: `tools/scenes/medinv.mjs` (10 expects) and `medinv_ui.mjs` (11 expects) drive the real UI with the mouse.
- Gotchas: `pickW(obj, rng)` got the function, not a number (every hit landed on the cranium); the Unit One bag had
  cat 'pack' so the pack main grid (deny pack) refused it and the loadout silently dropped it - loadouts now throw;
  `dblclick` never fires when the DOM re-renders between the clicks (search ticking) - double-click is detected by
  item uid in pointerdown; an ECG canvas inside innerHTML is recreated every refresh - it is now re-attached;
  3-digit hex + alpha ('#4f6' + '18') is not a colour; a canvas arc after rect() needs a moveTo.

### Interfaces for wave 2
- INFANTRY (weapons) -> medical: `M.hit(hitInfo, I.armour(inv))`, hitInfo = { part | zone (+ side), round (ROUNDS
  id) + velocity (m/s at impact) or dmg + pen directly, dir (travel direction in the victim's body frame: x right, y up,
  z forward), kind 'bullet' | 'fragment' | 'blunt', source }. Returns { region, zone, face, penetrated, layers[{ cls,
  pPen, stopped }], hp, bleed, fracture, ptx, concussion } for hit markers and the feed. Grenades:
  `fragmentHits(FRAGS id, distM, rng, { prone })` -> hit-infos. Falls: `M.fall(impactSpeed, { plf })`.
  The INFANTRY branch's `ballistics.js makeHitInfo()` object is accepted as is (checked in the bench): its `dmg` is
  read as a scale, `part: 'neck'` becomes head/neck, and its world `dir` array is turned into the body frame when
  the caller adds `victimYaw` (three.js yaw, facing -z at 0). Its `explosionInfo()` keys M433 / M72 exist in FRAGS.
- Weapons <-> inventory: magazines are items. `I.weaponMag(w)`, `I.magPop(m)` -> round id (feed), `I.magCount`,
  `I.reload(inv, weapon)` -> { mag, old, dropped }, `I.countRounds(inv, cal)`, `ROUNDS[id]` (cal, v0, cartG, dmg,
  pen, bleed, tracer); weapon defs carry `weapon: { cal, rpm, modes, barrelIn, vMul, single }`; the M203 slot is `gl`.
- Soldier sim (FOUNDATION / INFANTRY): call `M.update(dt, { exertion 0..1, moving })` every frame and read
  `M.mods()`: speedMul, sprint, jump, crawlOnly, limp, aimSway (x), tremor (rad), reloadMul, adsTimeMul, weaponUse
  ('both' | 'one' | 'none'), staminaRegenMul, staminaMaxMul, vision { tunnel, grey, blur, blackout, tint }, hearing,
  breathing, heartRate, dead, unconscious. Load: `I.encumbrance(I.totalWeight(inv))` or `I.pandolfWatts(...)`.
  Events from `M.update` (bleed, fracture, unconscious, death, treated ...) feed the HUD and sound.
- UI: `createInvUI({ inv, med, parent, tabs: ['GEAR','HEALTH'], onTab, onUse?, onDrop?(item to the ground) })`,
  `.open(loot?)` with a crate (`I.fillCrate`) or a dead soldier's inventory root; `createMedUI({ med, inv, parent,
  by: () => ({ self, skill }) })`; `createMedHud(hudEl, M)`; `createVisionFX(hudEl, canvas)`. Both overlays close on
  Esc and stop key propagation while open; FOUNDATION should bind Tab / H and release pointer lock.
- Buddy aid: `patient.startTreatment({ item, region, by: { self: false, skill: medic.skill } })`; `patient.action`
  is the progress (cancel when they move more than `BUDDY.treatRangeM` apart); `BUDDY.dragSpeed(medicMods,
  casualtyKg, medicLoadKg)`, `carrySpeed`, `staminaDrainMul`.
- Untested: in-game integration (no on-foot mode yet), gamepad on real hardware (only the button mapping is wired),
  touch input, the UIs below 1280x720, save / load across sessions.
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
## 2026-10-23 — NGC-1980 air defence units (ngc/defence-v2)
Files: game/js/units/defence/ (tune.js tunables, kit.js modelling + bake, models.js, brain.js behaviour, sound.js),
game/dev/defence.html + defence-sandbox.js, tools/scenes/defence.mjs, defencewar.mjs, defbalance.mjs. war.js: small
commented `DEFENCE hook` lines only (import, createDefence, addStruct model + attach, starting-garrison flag,
makeShip carrier refit + attach, updateGuns update, W.update tick, W.reset reset). ships.js and main.js untouched.
- Units (game units, game-design numbers; no real weapon performance data): M163 VADS (command 2 on our islands),
  ZSU-23-4 (our starting guns: the Soviet contingent), ALBATROSS close-in gun (white dome) and 8-cell box launcher,
  RW TALON seized 8x8 gun/missile truck (most enemy islands; RUNAWAY refit: ceramic sensor pod on the cab, cyan IFF
  strips, machine stencil over a scraped number, old camo patches), RW-5 LANCE laser (enemy hq + fortress islands,
  two on IRONHOLD). Real-world sizes (M113 hull 4.86 x 2.69 m, Shilka 6.5 m, the truck 9.6 m).
- Models: primitives in a hierarchy, then baked (kit.js) into ONE vertex-coloured flat-shaded Lambert mesh per
  moving part (hull / turret / cradle / barrels / radar). The bake weathers: per-face jitter, mud low down, chips,
  rust streaks. Team colour stays a separate material (air-recognition panels), as war.js recolours by identity.
  4-5k tris for the vehicles, 1-1.5k for the mounts and the LANCE; 9-36 draw calls each.
- Behaviour (brain.js): search (radar spins) -> track (turret slews at a capped rate; with terrain line of sight a
  lock builds over `lock` s; losing sight keeps `lockKeep` of it, then it bleeds away) -> fire. Guns lead with a
  linear prediction and fire tracer bursts up close, airbursts (the old 'flak' round) further out, through war.js's
  own projectiles (so all hit rules and player damage stay war.js's). Missiles are the module's own projectiles:
  visible, steer at a capped turn rate, guided only while the launcher still sees the target, proximity fuse.
  LANCE: charge (seams brighten, aiming line, rising hum) -> beam along the barrel (so a target crossing faster than
  the turret slews slides out of it) -> burns only after a dwell -> spreads with range -> stopped by terrain and by
  smoke (it sums the opacity of fx.mix puffs along the ray) -> cools (fins glow red, steam).
- Tells: lamp blinks faster as the lock builds, steady when locked; rotary barrels spin up (with a whine) before
  firing; Shilka's dish stops and points; cockpit warning for a lock on the player (beeps -> steady warble -> fast
  high warble with a missile in the air) and a MISSILE LAUNCH feed line. Sounds synthesised (sound.js): bursts are
  noise chopped at the gun's rate, single heavy rounds, motor whine, launch whoosh, the LANCE voice, steam vent.
- Balance (scenes/defbalance.mjs; sandbox units 'legacy1'/'legacy2' run the old war.js gunFire rules). Open sky,
  no hills (the player's worst case), hurtPlayer per minute on a circling stand-in, orbits close / mid / far:
  | unit | close | mid | far |
  |---|---|---|---|
  | old enemy gun | 5.45 | 2.58 | 0.59 |
  | TALON | 6.07 | 1.33 | 0.75 |
  | LANCE | 2.45 | 1.67 | 0.87 |
  Our side, kills/min of hp-12 stand-ins: old island gun 3.5, VADS 3.0, Shilka 2.8; the ALBATROSS's four mounts
  together ~1.2x its old four (CIWS 6.7, launcher 2.0 each). Checks: enemy within 1.25x close / mid, 2x far (range
  used to be nearly free; the missile and LANCE make it dangerous on purpose - that is what the hills are for).
- Gotchas: the TALON's tracer outscored the old gun with fewer rounds, because the old gun led its tracer as if it
  flew at flak speed (it missed a lot) - fixed with longer gaps between bursts; a missile with a 1.5 rad/s turn hits
  a helicopter almost every time in open sky, so missiles are rare (20 s) and light, and line of sight is the
  counter; the sandbox's first rAF stamp can be older than its start time (negative dt lit the muzzle flashes);
  long trucks parked radially poked into the HQ / factory, so vehicles park along the gun ring.
- Tests: defence.mjs PASS 11/11 (tools/runs/*-defence), defencewar.mjs PASS 5/5, defbalance.mjs PASS 4/4,
  smoke 5/5, war 5/5, war2 6/6, dropflak 1/1.
- Untested: the sounds by ear (the paths run without errors in a live AudioContext); the NAVAL agent's
  carrier `userData.mounts` (the code reads { kind, pos, dir } and falls back to the old four deck spots); the sky
  carrier as a missile / beam target in a real fight; performance on a mid-range GPU with every island garrisoned.
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
## 2026-10-23 — NGC-1980 FOUNDATION: crafts, on foot, the ground-vehicle host (branch ngc/foundation)
API reference for wave 2: [docs/ngc1980/FOUNDATION.md](docs/ngc1980/FOUNDATION.md).
- craft.js: a registry of player-controllable crafts with one interface (seats with eyes / doors / exits, enter /
  canExit / exitSpots / exit, update / idle / afterWar / render, camera / firstPerson / fov, key / look, hud, silence,
  pl, avatar, hurt, bounds). main.js routes keys, mouse, cameras, FOV, near plane, HUD, pause menu, silence and war.js's
  PL through it. G.craft is still the active id ('heli', 'jet', 'foot', 'boxcar').
- The HORNET moved out of main.js into craftjet.js (taking a jet, flying, losing it, cameras, keys, HUD, radar sight).
  Y stopped on deck now climbs out: the jet stays parked and rides the deck; the deck crew brings the Huey up from the
  hangar; Y at the boarding ladder climbs back in; 5 in the Huey re-spots the parked jet instead of a new one.
- The Huey is a craft too (doors either side, exit when landed with the collective down, parked: collective down,
  engine left at flight idle, still serviced on a friendly pad, can still be lost). Its flying / cave / drop / helm
  stay special in main.js (updateHeli(dt, inp, piloted)).
- ON FOOT (foot.js + pure footsim.js): FM 22-5 walk 1.52 / run 2.74 m/s, sprint 5.5 m/s with stamina, crouch, prone,
  jump, Tobler slopes (blocked past 37°), 0.45 m steps, falls (hurt from ~2.5 m), wading, swimming, ladders (carrier
  stern from the water, island to its roof), mouse look, first / third person, a placeholder 1980 Marine and arms with
  an M16A1 that fires war.js bullets. Slots for INFANTRY (soldier sim, viewmodel, body, weapon) and MEDINV (medical,
  inventory). Hits are routed to body parts from the round's closest point.
- platform.js: kinematic deck carrying (ship motion since the last settle is added, so mouse look and the sim's own
  motion are kept); crafts.afterWar() re-carries after war.update so nothing trails its deck by a frame.
- ground.js (GR): surfaces (road / deck / rock / grass / sand / mud / water, mu + rolling resistance), floor() with
  walls, colliders (island trees now recorded, buildings, AA guns, ship islands, every craft's footprint), ladders,
  spawn spots (carrier deck park, island motor pools, beaches), clearView for third-person cameras.
- vehicle.js: any pure wheeled / tracked sim + model becomes a drivable craft (keyboard / gamepad / HOTAS + pedals,
  seat eyes with head-look, chase orbit, motor sound, hull damage, crew exposure, wrecks, sinking). Placeholder TEST
  CAR (units/placeholder/boxcar*.js, M151A2-ish numbers) at the home motor pool; 7 = motor pool delivery.
- war.js (small, commented FOUNDATION): swept bullet hits on the player with the hit point, pl.detect (gunship hunt,
  AA ranges, the commander's defend check), pl.capTime / kind (a soldier or a vehicle takes a pad).
- audio.js: sfx.motor (piston engine), huey()/jet() accept a volume for parked aircraft heard from outside.
- Gotchas: requestPointerLock from a key press froze headless screenshots (now only on a click); a frame with
  dt = 0 (same rAF timestamp) made the flight models divide by zero (NaN Huey) - dt is now at least 1 ms; the first
  deck carry snapped the walker back to his stored yaw (mouse look dead on ships) - carry now adds only the ship's
  motion; reading the soldier between war.update and the next frame showed him trailing his deck (afterWar); a
  vehicle wheel compared against the body height took slopes for walls - each wheel is compared with its own height.
- Tests: tools/footbench.mjs (28 checks), tools/boxcarbench.mjs (20), scenes foot.mjs (12), vehicle.mjs (14),
  jettrap.mjs (now walks away from the parked Hornet to the Huey); regression results in the branch report.
- Untested: real HOTAS / gamepad driving and walking (only keyboard in headless), pointer-lock mouse look in a real
  browser, the SKY CARRIER flying with a soldier on deck (bench only), many vehicles at once.
## 2026-10-23 — NGC-1980 AIR (fixed wing): F-14A on a real flight model flown by an AI pilot; the RUNAWAY air arm
Branch ngc/airfw (airframe, Tomcat FM, flight director) + ngc/airfw-2 (pilot, RUNAWAY aircraft, models, war hooks).
- **Parametric airframe** (units/air/airframe.js): the Hornet's flight model generalised (aero table, engine schedule,
  NDI or SAS control law, sweep / engine hooks). jetfm.js is now the Hornet's parameter set, bit-identical
  (tools/jetfingerprint.mjs hashes every state float over 12 scenarios; jetbench 24/24).
- **F-14A TOMCAT** (units/air/tomcatfm.js): CADC sweep 20-68° + oversweep (Heatblur table, 15°/s), TF30-P-412A (slow
  spool, AB zones, compressor stalls at high AoA / sideslip / slams, 0.69 / 2.78 TSFC), mechanical stick + SAS (no
  limiter). tools/tomcatbench.mjs 32/32: 1 g min 114 KEAS (~115-125), on-speed 124 KEAS (~130-135 at 51,800 lb), roll
  145°/s at 350 KEAS, M 0.91 MIL / M 1.14 AB low level (M 1.2 Jane's), 6.5 g sustained at 343 KEAS, fuel flow 8,337 /
  57,678 lb/h (8,500 / 58,000), cat end 187 KEAS, trap.
- **AI pilot** (units/air/pilot.js) flies only stick, pedals and throttles through the flight director (fd.js):
  - cat run-up and shot, climb-out (gear and flaps up on schedule), CAP orbit (lead-point guidance on a circle; turns
    kept flat, no loops to reverse), radar contacts, intercept, dogfight: lead / pure / lag (high yo-yo) pursuit,
    "bugout" extension (the Tomcat does not turn with a better turner), energy limit (no zooms below vmin), defensive
    break into an attacker with guns jinks, missile break; game weapons in range bands with a gun snapshot cone;
  - terrain look-ahead: the path is sampled out to 14 s, the climb angle raised to clear by 55 m, and if no sane climb
    does, a clearing heading is held for a few seconds (no flip-flop along ridges); hard deck 140 m in fights, and a
    dive-recovery check (pull-out height V^2(1-cos g)/(g(n-1)) + roll-out) that rolls level and pulls;
  - recovery: bingo / winchester RTB; pattern (upwind, downwind, base) or straight in; final: carrot onto the extended
    centreline + glideslope, gear / hook / flaps, speedbrake when fast; the last 700 m flown like the LSO wants: stick
    for the 3.5° slope (vertical speed), throttle for on-speed EAS from the weight (aeroCoeffs at 10.5° AoA) trimmed on
    AoA, bank for lineup; wave-off in close (lineup, glideslope, AoA, swinging deck), bolter (MIL on touchdown), go
    round; trap and wire release. The 3 wire: the hook hangs 3.4 m under the CG at 7° nose up and a wire catches within
    0.45 m of the deck, so the glideslope is aimed 20 m up the deck from the hook's touchdown point.
- **RUNAWAY aircraft** (units/air/rwfm.js): RW-4 SHRIKE (FICTIONAL: blended delta drone, 39 kN dry, NDI 11 g, ~280°/s
  roll, M 0.92 low level, 2 decoys, hp 2); MQ-9 REAPER on the airframe with a turboprop engineFn (671 kW TPE331,
  eta 0.8, thrust = eta P / EAS; cruise 178 KEAS at 70%, slow flight 99 KEAS; GA-ASI: cruise ~170 kt) that orbits and
  spots; SHAHED-style one-way drone as a point mass (bank-to-turn, lift / drag / prop thrust, rail booster; GAME
  ~115 KEAS) with terrain-following cruise and a terminal dive.
- **Weapons stay game level** (BIBLE rule): AIM-54 / AIM-7 / AIM-9 and the SHRIKE's missiles are all war.js 'aam'
  projectiles (units/air/gameproj.js: the existing capped-turn-rate homing moved into a shared module, unchanged) with
  game range bands; guns are war.js 'jb'; the SHAHED's warhead is a war.js blast. Decoys are a game rule: a missile
  closing inside 350 m and again inside 150 m on an aircraft with decoys is drawn off 45% of the time.
- **tools/airbench.mjs 28/28** (node): two full sorties off a fake ALBATROSS (with tower) sailing at 6 m/s and turning
  during CAP: cat at 7 s, CAP at 20 s (r 430-490 m, 249 m), bingo at 295 s, 3 wire, 0 wave-offs, < 3.6 g, never below
  110 m AGL outside the approach; a forced wave-off and a hook-skip bolter that both go round and trap; a 700 m ridge in
  front of a low CAP point (cleared by 56 m); SHRIKE / REAPER / SHAHED checks; Tomcat vs SHRIKE: BVR 5 wins / 1 loss,
  merge (AIM-9 + gun only, a 10-g drone) 3 / 3, nobody into the sea, every pursuit mode used; a Tomcat on CAP vs
  SHAHED salvos at 70 m: 9/12 shot down, never below 80 m (dive limit: no dive steeper than one it can pull out of
  above the 140 m hard deck; below 460 m no reversals through the vertical).
- **Models** (house style, real size): TOMCAT (units/air/tomcatmodel.js) driven by the sim: swing wings, glove vanes,
  slats, flaps, spoilers, differential stabs, rudders, speedbrakes, gear with launch bar, hook, canopy, two crew, TF30
  nozzles + afterburner, AIM-54 / 7 / 9 on their stations, gull grey over white, fictional 1980 squadron VF-118 on the
  ALBATROSS (tail code AB, modex 2xx), full-colour star-and-bar. SHRIKE, REAPER, SHAHED (units/air/rwmodel.js) with
  RUNAWAY marks (cyan IFF strips, stencils over painted-out markings, a bolted-on sensor pod on the REAPER).
- **In the war** (units/air/airwar.js; war.js hooks marked AIR): command 4 queues a Tomcat for the bow catapult (one at
  a time, waits for open water ahead up to 20 s), CAP over the selected island or the ALBATROSS (main.js one-liner:
  `war.sendEscort(selIsl)`), fights anything of the RUNAWAY's in the air, RTBs and traps (+15 materiel back); the enemy
  launches SHRIKE pairs off the KRAKEN (answering our Tomcats, sweeps), a REAPER that finds the ALBATROSS and then SHAHED
  salvos from its nearest island at her (or at our islands' buildings). The player is a target too (missiles, cannon).
  Fuel runs 8x real for game-length sorties (~5 min CAP). Sounds (units/air/airsound.js, on the Sfx bus): TF30 roar with
  AB crackle and Doppler for the three nearest jets, REAPER turboprop buzz, SHAHED moped drone.
- **Gotchas**: ship heading vs flight heading convention (bow at -z: heading = -yaw; one sign error made every wave-off
  turn the wrong way); FD.steer asked for all of the g as turn and none to hold the nose up in steep turns at low g
  limits (now it keeps sqrt(n^2-1) for the turn); "push instead of rolling inverted" is wrong in a fight (option); the
  catapult holds forever (burning all its fuel) if the lane-ahead check never clears; the dev page's carrier sat on an
  island; the old kinematic escort code in war.js is gone.
- **Untested**: hours of real play balance (SHRIKE / SHAHED pacing, materiel costs); the escorts with the sky carrier
  airborne; Tomcats over the real mountains outside the zone (bench ridge only); many simultaneous sims on a slow GPU.
- Scenes: escorts.mjs (new), airmodels.mjs, airfly.mjs (dev/air.html); jets.json and war2.json updated for real jets.
## 2026-10-23 — NGC-1980 AIR AI rotary: CH-46E + Marines, RUNAWAY MV-22B, RW-3 WASP (branch ngc/airrot)
Three AI rotorcraft that fly physically: a pure-JS flight model, a node bench against published data, an AI pilot that
works the controls (stick, collective / thrust lever, pedals, nacelles - never a position), a mission brain, an
exterior model, synthesized sound, a dev page and in-game scenes. Files: game/js/units/air/rotary/* (all new),
game/dev/rotary.html (+ rotary-dev.js, rotary-units.js), tools/{ch46bench,mv22bench,waspbench,rotarymission,
waspmission,rotaryperf,rotarykit,runscenes}.mjs, scenes ch46capture / mv22landing / wasp / rotarydamage / rotarydev.

### Shared core
- rb.js: 6-DOF rigid body (FRD dynamics, three-style quaternion so meshes take it as is) with gear contacts: spring /
  damper normal force and the Huey's deadbeat friction on the effective mass, relative to moving decks (surfVel).
- rotor.js: the Huey's rotor concepts as a reusable disc, but thrust / torque from 8-10 blade-element strips with the
  azimuth-mean tangential speed (reproduces CT = sigma a/2 (theta0 (1/3 + mu^2/2) ...) - checked: 0.00576 vs 0.00573 in
  the Huey's hover) so the same code is a lifting rotor AND a proprotor in high axial inflow. Glauert inflow + lag,
  Johnson's ring curve, Cheeseman-Bennett ground effect, external inflow (rotor interference), flapback / lateral
  flapping signed by rotation sense, disc lag behind body rates, articulated hub moment (hinge offset) or gimbal spring.
  Non-uniform inflow factor 1.12 (INFERRED).
- pilot.js: layered autopilot - velocity -> attitude (+ learned trim, slewed at a pilot's pace) -> cyclic PD+I,
  vertical speed PI on the collective, yaw rate on the pedals. transportai.js: the transport mission (spool on the
  deck, lift off a moving deck, turn onto the track in the hover, terrain-following transit, a sqrt-profile approach
  with deceleration feed-forward and a linear close-in, glide path, steep-approach speed limit, VRS descent limit below
  ~40 kt, slewed climb commands, vertical descent, unload, RTB to the moving deck, park).

### CH-46E Sea Knight (player transport, command 1: replaces the MANTA capture drone)
- Tandem: pitch by DIFFERENTIAL COLLECTIVE (DCP), roll by lateral cyclic, yaw by DIFFERENTIAL LATERAL CYCLIC. The brief
  said "differential collective for yaw" - on a tandem that is pitch; yaw is differential lateral cyclic (decision).
  LCT (both discs forward with airspeed), overlap interference in the hover (+~10% induced power, Harris), the aft rotor
  in the front rotor's wake in forward flight (fades as the wake passes below the higher aft rotor), counter-rotating
  (front CCW, aft CW), unstable fuselage in pitch, aft-pylon weathercock, dual SAS. 2 x T58-GE-16 with N2 governor,
  collective anticipator, torque topping (~105%, INFERRED), a 2,800 shp transmission limit (INFERRED: the D/F drive
  train). Gear: fixed tricycle.
- Bench (node tools/ch46bench.mjs, 21/21; CH-46E SL ISA):
  | item | model | published |
  |---|---|---|
  | max level speed, 24,300 lb, 2,800 shp | 144 kt | 144 kt (CONFIRMED) |
  | max climb, 24,300 lb, 75 kt | 1,799 fpm | 1,715 fpm (CONFIRMED; weight / speed INFERRED) |
  | hover ceiling OGE / IGE, 24,300 lb | 6,000 / 9,000 ft | 5,750 / 9,500 ft (CONFIRMED; weight INFERRED) |
  | hover OGE at mission weight (22,000 lb) | 2,298 shp, pitch +3.8 deg | - |
  | aft rotor power > front in forward flight | 60 kt: 584 / 777 shp | qualitative (Stepniewski & Keys, Harris) CONFIRMED |
  | one engine out, 70 kt, mission weight | +815 fpm | E upgrade bought single-engine capability (INFERRED) |
  | autorotation 80 kt | NR 102%, 2,650 fpm | rpm limits 94-113% CONFIRMED; rate UNVERIFIED |
  | SAS off at 100 kt | pitch diverges 4.2 deg in 6 s (0.6 with SAS) | tandems need SAS (qualitative) |
  INFERRED (tuned / estimated, stated in ch46fm.js): flat-plate drag 5.6 m2 (to 144 kt), inertias, blade chord 18.25 in
  (UNVERIFIED), twist, Lock, hinge offset, shaft tilt 4.5 deg, LCT schedule, interference factors, transmission limit.
  Source conflict: 83 ft 4 in rotors-turning length gives 33.3 ft shaft spacing, the "16 ft overlap" figure 34 ft (used 33.3).
- Mission (node tools/rotarymission.mjs): lifts off the ALBATROSS at 6 m/s, lands 1.2 m from its LZ mark at 0.19 m/s,
  unloads, lands back on the moved deck at 0.20 m/s, min 29 m AGL en route, bank <= 17 deg, torque <= 105%.
- In the war: the LZ is chosen beside the pad (18 m out, perpendicular to the HQ / production line, tail to the pad,
  rotor discs and fuselage clear of every building, flat ground); the ramp lowers, 13 Marines run up the cabin, down the
  ramp and out to a perimeter round the pad, kneel facing out; the squad is its own unit ('squad': capTime 9 s like the
  drone, hp = men alive, hits drop them one by one, it fires back at game level) and holds the pad; the Sea Knight lifts
  off once they're clear and flies home to its deck spot (or HOME ISLAND's pad if the carrier is gone or flying), parks
  and is struck below. Below half hp an engine quits (abort, home on one engine); killed: both engines out, the AI
  autorotates (40% of the time the aft rotor is lost - it falls), the wreck explodes, Marines aboard are lost. Taken
  islands keep their Marines standing guard until the island falls again.
- Model (ch46model.js): lofted fuselage at real size, cockpit glazing, crew in the cockpit, five-a-side windows, crew
  door with the upper half swung up, hoist, sponsons + main wheels, twin nose wheels, forward pylon, roof tunnel, aft
  pylon with trailing fin, T58 nacelles with soot, 3-blade articulated heads (blades flap into each tip-path plane,
  droop at rest, blur discs), red troop seats, the ramp (lowers to the ground; crew chief appears), beacons / nav /
  landing light, 1980 USMC markings: dark green, black MARINES, full-colour star and bar, "EM 05" (HMM-261, INFERRED),
  BuNo, nose modex.

### MV-22B Osprey (RUNAWAY, replaces the enemy twin-rotor transport)
- Tiltrotor: two 3-blade gimballed proprotors (rotor.js discs) on nacelles 0-97.5 deg (CONFIRMED), 90 deg in ~12 s
  (CONFIRMED), cross-shafted (either engine turns both, CONFIRMED). FCS mixing by nacelle angle: helicopter =
  longitudinal cyclic (pitch), differential collective (roll), differential longitudinal cyclic (yaw); airplane =
  elevator, flaperons, twin rudders. Thrust lever -> collective on an axial-inflow schedule in the helicopter share,
  -> engine power with a collective prop governor in the airplane share; 412 rpm helicopter / conversion, 333 rpm
  airplane (CONFIRMED two-speed rotor); FCS overspeed protection. Wing halves in the rotor wash (download), H-tail,
  twin fins, retractable gear, proprotor ground strike. Conversion corridor INFERRED from the published XV-15 / V-22
  shape, with the floor scaled to the wing's stall speed at the present weight.
- Bench (node tools/mv22bench.mjs, 21/21):
  | item | model | published |
  |---|---|---|
  | disc loading at 47,500 lb | 20.9 lb/ft2 | 20.9 (CONFIRMED) |
  | hover OGE at 47,500 lb | 8,787 shp (71% of 2 x 6,150), FM 0.78, download 10.7% | FM ~0.78, download ~10-12% (INFERRED) |
  | level trims hover .. 260 kt inside the corridor | all held, max pitch 8.1 deg | - |
  | max level speed SL, 2 x 6,150 shp | 270 kt | 275 kt (CONFIRMED) |
  | climb, airplane mode, 154 KCAS, MCP, 52,600 lb | 2,774 fpm | 2,320-4,000 fpm (CONFIRMED; 154 KCAS AOPA) |
  | conversion 90 -> 0 | 11.9 s | ~12 s (CONFIRMED) |
  | rotor speed heli / airplane | 412 / 333 rpm | 412 / 333 (CONFIRMED) |
  | one engine out at 200 kt | level, both rotors at 333 rpm | cross-shaft (CONFIRMED) |
  CONFLICT: the published 110 kt "stall speed" can't be the wing alone (W/S 158 lb/ft2 needs CL 3.8); the model's flapped
  wing stalls at 137 kt at 39,500 lb. INFERRED: f = 3.55 m2 (to 275 kt), inertias, linear twist -40 deg (real -47
  nonlinear), wing CLmax 1.6 / 2.05 flapped, wash factor, tail sizes, MCP ~5,000 shp.
- Tilt pilot (tiltpilot.js): accelerates and slows with the nacelle angle (the thumbwheel), attitude near level; the
  helicopter loops (speed by pitch, height by thrust lever) hand over to airplane loops (speed by thrust lever, climb
  by pitch, turn by bank, zero sideslip) only once the wing has margin (1.0-1.22 x stall speed); one set of integrators
  in charge at a time (bumpless); decelerating from airplane mode on power first. Mission (rotarymission.mjs): from the
  KRAKEN 6.5 km out - converts to 0 deg / 206 KIAS, back to the hover, lands 1.6 m from its LZ at 0.24 m/s, unloads,
  back to the moving KRAKEN at 0.24 m/s, 0 s outside the corridor, power <= 97%, min AGL 32 m.
- In the war ('transport'): off the KRAKEN's bow spot (or IRONHOLD); 12 machine troopers march out in lock-step (one
  shared gait phase) and stand round the pad sweeping their heads together (capTime 10 s as before); if the commander's
  target is taken first it's re-tasked to the next island; it folds on the KRAKEN when it gets home (rotor brake,
  nacelles down, blades fold back, wing swings fore-and-aft) and is struck below. Engine hits: it presses on
  (cross-shaft); killed: it falls and explodes with the troopers aboard.
- Model (mv22model.js): two-tone grey, primer patches, nacelles that tilt about the wing tips with spinners and three
  twisted blades (fold), wing on its stow ring with flaperons, H-tail + twin fins / rudders, sponsons, retracting gear,
  rear ramp, refuelling probe; RUNAWAY refit: a sensor ball under the chin with cyan lenses, cyan IFF strips and seams,
  machine cores where the pilots sat, crude glyphs stencilled over MARINES.

### RW-3 WASP (RUNAWAY ducted-fan attack drone, replaces the saucer gunship)
- Physics (waspfm.js, a fictional machine: physics checks, not a spec sheet): shrouded-fan momentum theory with the wake
  held at the exit (P = T^1.5 / sqrt(4 sigma rho A); fan share 1/(2 sigma)), climb inflow, edgewise momentum drag and
  the nose-up lip moment (Fleming 2003, Abrego & Bulaga 2002), exit vanes below the CG, fan torque split for yaw, an
  onboard stabiliser (open loop it diverges, as ducted fans do), three feet. The AI never tilts further than full power
  can hold 1 g.
- Bench (waspbench.mjs 13/13): hover 156 kW = FM 0.78 against the ducted ideal, 1.5x less than an open rotor (sqrt(2
  sigma)), lip share 55% (from the fan's pressure jump), 60% power to hover, momentum drag 1 kN at 10 m/s -> 1.8 kN at
  20, vanes trim nose-down with speed, holds 30 m/s at 41 deg, top speed 39 m/s at 52 deg, open loop diverges, lands.
- Mind (waspai.js): guard with mechanical sensor sweeps (yaw steps); AMBUSH - finds low ground with terrain between it
  and a target that's closing, hovers there still, springs when it's in reach; STRAFE - runs in on an offset line,
  fires, overflies, breaks away and comes back from a new bearing; SNIPE - hovers at standoff and slides sideways; SWARM
  - raid groups take evenly spaced slots on a ring round the target, turning in lock-step, breaking off one at a time;
  predictive avoidance of the target and each other. Node (waspmission.mjs 8/8): a swarm of four round a circling Huey
  for 2 min - no losses, >= 10 m from the target, >= 9.8 m apart, 39-58 s of firing windows each; the ambusher hides 9 s
  behind the hills and springs at 40 s.
- In the war ('gunship', same unit-list and damage semantics, hp 3): the old targeting rules (the player within
  170 / 260 m, our transports / squads / escorts within 160 m, raid targets, guard home), swarm slots shared by WASPs on
  one target, some lie in ambush when the player is coming their way. WEAPON AT GAME LEVEL (orchestrator's rule): bursts
  of three of the war's own 'b' rounds at 90 m/s with spread, drawn cyan (one-line b.col hook in war.js updateProj).
  Shot down: fans die, it tumbles and explodes.
- Model (waspmodel.js): a lathed ceramic shroud with cyan seams round two counter-rotating fans, stators and two stages
  of exit vanes (animated), a faceted sensor head offset to the left with three eyes and a sweeping scanner slit, a
  sensor fin on the right, a segmented abdomen curling under into an articulated stinger (the emitter tracks its
  target, flashes when it fires), three legs that fold.
- Escort decision: the blue-saucer "escort" variant of buildGunship is retired - the Tomcats (fixed-wing agent) fly
  escort, and a 1980 task force has no hover drones. ships.js keeps buildDrone / buildTransport / buildGunship as
  wrappers that build the CH-46 / MV-22 / WASP.

### Troops (figures.js, squad.js)
- Stand-in soldiers, deliberately simple and SWAPPABLE: FIGURES[kind](opts) -> { group, pose(state, phase) }, states
  run / walk / stand / kneel / aim / fall / dead / seated. 1980 Marine (M1 helmet with the leaf cover, ERDL utilities,
  M1955 flak vest, ALICE pack + canteens, M16A1; four skin tones) and RUNAWAY machine trooper (ceramic plates, cyan
  sensor slit, seized carbine with a cyan optic). 6 meshes each with one shared vertex-colour material. The INFANTRY
  and RW-1 work can replace them by registering in FIGURES.

### Sound (rotorsound.js)
- A voice pool per type for the nearest aircraft, distance falloff like the war's sounds, Doppler on the tones. CH-46:
  two 13.2 Hz blade-passage pulse trains gating noise bands, a hair apart (the beating tandem whop-whop), rotor thump,
  T58 whine. MV-22: deep 20.6 Hz proprotor thrum that turns into a propeller drone as the nacelles come down, AE1107
  whine. WASP: two detuned fan tones that beat, a slowly wavering formant, a sub hum, a chirp when it acquires a target.

### Shared-file hooks
- war.js: import createRotary; `const ROT = createRotary(...)` + `W.rotary`; makeAir first line (ROT.make), updateAir
  first line (ROT.update - rotary units fly themselves, dying too), W.update `W.peace = peace` and `ROT.tick(dt)`,
  W.reset `ROT.reset()`, updateCapture uses `u.capTime || CAP_TIME[u.type]`, gunship targeting includes 'squad',
  pickExpansion skips islands with an enemy landing party on them, sendDrone / damage feed texts (SEA KNIGHT), the
  b.col tracer colour. ships.js: three builders replaced by wrappers + three imports. main.js: ONE line - the command
  map legend "1: SEA KNIGHT + 13 MARINES" (the advisor's "SEND A DRONE (M, 1)" line in main.js is left for FOUNDATION).
- External placement: if a script / test moves a rotary unit's u.p, its flight model follows (jetweapons.mjs pins a
  gunship ahead of the jet).

### Tests (2026-10-23, load average ~70 from 13 agents: headless runs at 3-15 fps)
- node: ch46bench 21/21, mv22bench 21/21, waspbench 13/13, rotarymission 12/12, waspmission 8/8, rotaryperf (3 CH-46
  + 2 MV-22 + 12 WASP = 0.39 ms of CPU per 60 fps frame).
- scenes: ch46capture 4/4, mv22landing 4/4, wasp 3/3, rotarydamage 8/8, rotarydev 5/5 (all three missions + turntables),
  smoke 5/5, war 5/5 (two earlier runs at 3 fps failed a carrier-moved-3-m-in-5-s and an 8 s heli capture check: game
  time falls behind real time under load, before any rotary unit exists; passed on rerun), war2 6/6, jets 1/1,
  jetweapons 7/7, ships / aisim / playwar run clean (no expects).
- Untested: sound by ear (the graph builds; headless audio is muted); the CH-46 / Osprey launching from a pad when
  their carrier is gone; a flying SKY CARRIER as home (falls back to the HQ pad); many simultaneous squads on one
  island; the advisor text in main.js still says DRONE.

### Gotchas
- An inline `//` comment swallowed the rest of a line again (mv22bench) - keep comments off code lines in edits.
- dt = 0 on a page's first update divided by zero in the gear friction (NaN everywhere): every sim's step() returns on
  dt <= 0.
- With the gear up the Osprey lost its AGL and water / ground detection (they came from the gear contacts): belly check.
- Torque limiting by the needle pumped: rotor droop raises free-turbine torque. Limit on rotor power, slowly.
- Tandem transition: a fast nose-down command = forward stick = more aft-rotor collective = 135% torque: attitude
  commands slew at a pilot's pace.
- The tiltrotor's hard part was the conversion, not the hover: accelerating by pitching (a helicopter habit) with the
  nacelles already forward sank it; slowing from airplane mode by raising the nacelles at 190 kt windmilled the rotors
  (122% rpm). Fixes: speed by nacelle angle, attitude near level, wing-load handover, slow on power first, an FCS
  overspeed protection.
- Ducted fans have huge momentum drag at high disc loading: the WASP needs ~40 deg of tilt for 30 m/s; it sank when the
  pilot leant further than the thrust allowed (tilt limit from the fan model).
- The game only draws terrain round the player (250 m): in-game scenes park the Huey near the action for screenshots.
- The ALBATROSS's guns shred WASPs (hp 3, like the saucer) before they're in range; the wasp scene silences them to test
  the weapon.
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
  `makeArmorEnv({ height, seaLevel, paved, forest, obstacles, raycast })` (armorenv.js) builds this from the game's own
  terrain: sand on the sea bed and beach band, rock on steep or high ground, mud in wet coastal hollows, grass / dirt
  patches, paved where the host says (pads, roads, decks); water at the sea level.
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

**Bench (node tools/tankbench.mjs: 72 checks, all pass, incl. 7 state-hygiene checks from a code review).** C = in a source read for this work (AFVDB, FAS, Wikipedia
citing Foss / Jane's and Hunnicutt, armedconflicts.com), U = unverified, I = inferred, GAME = game balance.
| item | M60A3 sim | published | M113A2 sim | published |
|---|---|---|---|---|
| top speed, road | 48.7 km/h | 48 (C) | 63.6 km/h | 64 (C) |
| 0-32 km/h | 10.3 s | not found (U ~15-20) | 9.2 s | 11.0 s (FAS, C) |
| reverse | 17.1 km/h | 16 (FAS, C) | 19.0 km/h | - |
| road range at 30 km/h | 500 km | 450-500 (C) | 446 km | 480 (C) |
| gradient | climbs 60 % at 3.5 km/h, fails 85 % (pad friction) | 60 % (C) | 60 % at 2.3 km/h, fails 85 % | 60 % (C) |
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
- The gun muzzle probe had the hull's stiffness: a tank that hit a bank at 47 km/h was thrown back at 28 km/h off its
  own gun, and a 75 % slope "stopped" it only because the barrel jammed into the slope. The muzzle is a soft, lossy stop
  now (the barrel bends; each dig-in costs the gun a quarter of its hp) and hull contacts are ~half critically damped.
- The snap harness wraps evals in `const __r = ...`: a scene variable named __r breaks it.
- A fresh-eyes code review found state that survived reset() (the intake-flood timer re-flooded a reset tank in a
  puddle; rate-limited events stayed silent; damper rates jolted the first step), probes shared between tank instances
  (every tank's muzzle probe followed the last-stepped gun), an M113 automatic range that went NaN at speed, troop mass
  baked in, knockdowns that relied on mutating the host's objects, an engine fire that never burned, machine guns
  firing below their rate. All fixed; the probes are now bench checks (state hygiene).
- A `//` comment pasted mid-line by sed swallowed the rest of the statement (again): use /* */ in one-liners.
- Sensitivities, documented not hidden: a sharp CONCRETE 0.91 m wall is marginal for the M60 in the sim (face friction
  must lift the nose against the rear pivot; earth banks with crumbling lips are fine, so the test ground's steps are
  earth banks), and both vehicles bridge trenches ~1.4-1.6x their ratings at a crawl (rigid track, firm far wall; the
  ratings carry field margins).

**Tests and runs.** node tools/tankbench.mjs 72/72. Scenes (from tools/, CHROME_PATH=... node snap.mjs scenes/<s>):
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


## 2026-10-23 — NGC-1980: faction structures and a lived-in world (ngc/world)
Files: game/js/world/ (net.js, layout.js, models.js, kit.js, chunkgen.js, worldworker.js, gfx.js, life.js, ambient.js,
structures.js, rng.js), game/dev/world.html (+ world-preview.js), tools/worldbench.mjs, tools/scenes/world.mjs,
worldprev.mjs, structprev.mjs, worldperf.mjs, worldjet.mjs.
- **Settlements and roads (net.js, pure, seeded).** Wild lands: one settlement candidate per 1.6 km cell (hamlet 70 m,
  village 135 m, town 210 m radius; harbour towns on the coast), linked by a relaxed relative-neighbourhood graph
  (tarmac between villages and towns, lanes to hamlets, dirt between hamlets). Each road is routed by dynamic
  programming down a corridor (40 m stations, 25 m lateral steps, cost = length + grade + water), Chaikin-smoothed,
  resampled at 8 m, given a grade-limited profile (tarmac 8.5 %, lane 10 %, street 12 %, dirt 14 %), causeways over
  short shallow water, bridges over longer water or fills > 5 m (max 420 m). Towns get side streets, a harbour lane and
  a quay; farms (one per 420 m cell where the land allows) get a dirt track to the nearest road and up to seven walled or
  hedged fields (wheat, barley, hay, potato, plough, pasture) inside their own cell. Control zone: a village on each big
  island (away from the pad, the shaft and the war's building slots), a lane from the pad apron, a harbour lane to a
  stone quay, a back street; jetties, rim cottages and lighthouses on the small islands.
- **The ground agrees.** world.js: `rawH` is the old islandH; `islandH = roadBed(rawH)`: road beds (flat 1.6 m past the
  edge, shoulder 3-18 m), squares, quays, farmyards and **building platforms** (cut-and-fill pads, blended by weights
  that don't depend on generation order) are flattened in, so physics, the terrain bake and the road ribbons agree
  (99.9 % of road centreline samples within 5 cm; the rest are junctions). The 16 m far bake uses rawH.
- **Determinism.** Everything is seeded by position and generated lazily per 1.6 km cell, independently on the main
  thread, the terrain worker and the world worker. What keeps the threads agreeing: lots and farms only look at things
  guaranteed to exist first (prepArea), incident roads are sorted by key, farms stay in their own cell. worldbench: a
  second process generating in the opposite order agrees to 5e-5 m over 20 000 points.
- **Buildings (models.js on kit.js).** 1980 houses (1-2 storeys, gable / hip, framed windows, doors, porches, chimneys,
  TV aerials, flower boxes), cottages, terraces with shopfronts, awnings and fascias, the church (nave, chancel, porch,
  tower with spire or battlements, clock, churchyard), filling station, barns, Dutch barns, silos, tractors, boat sheds,
  quay walls, timber piers, lobster pots, lighthouses with keeper's cottages, guyed radio masts, phone and post boxes,
  bus shelters, lamps, signs, war memorials, benches, laundry lines, sheds, woodpiles, garages, parked cars, garden
  trees; wooden power poles every 45 m along tarmac and lane links with sagging wires.
- **Chunks (chunkgen.js, worldworker.js, life.js).** 400 m chunks built in a worker: four merged buffers (solid near,
  solid far, ground overlay near, ground overlay far; 18 bytes a vertex), one draw call each. Near within ~520 m, far to
  the jet's view (capped 2.3 km), at most two in flight, nearest first. Ground overlays (roads, fields, squares) use a
  polygon offset, sit on the terrain as drawn (the 4 m lattice, bilinear), and lift a little with distance so the
  coarser far terrain doesn't swallow them. The zone villages are built at start (fog-of-war patched materials).
- **Faction structures (structures.js; ships.js buildStructure delegates for hq / factory / fuel / radar).** 1980: HQ
  bunker in an earth berm (concrete face, blast door, prefab hut, guyed mast, whips, flag), fuel farm (three bunded
  tanks with ladders, pipes, pump house, a nodding pumpjack), depot (two quonsets, workshop with stove pipe, crates),
  radar site (AN/TPS-43-style planar array turning on its trailer, radome, shelters on M35s). Military clutter (jeeps,
  M35s, camo nets, sandbags, generators, floodlights) while we hold it; Land Rover, notice board and flower tubs while
  it is neutral. RUNAWAY: command node (leaning ceramic monolith, sensor head, fins), siphon spire with spherical tanks,
  fabricator (maw, sliding gantry arm, vents), sensor spire (tripod, rotating ring array, crystal tip); pale cyan seams.
  When the machines take a site their structure grows out of the 1980 ruin (9 s, sparks, seams blazing) and RW power
  pylons go up across the island one by one; when we take it back the machine goes dark and stays as shards round the
  1980 site, and half the pylons topple. Damaged below 50 % hp (smoke that keeps going, scorch, mast blown over, flag
  gone, seams flickering); destroyed = the structure's own ruin (no generic rubble). Dressing: helipad windsock (turns
  to fx.wind, droops in a calm), edge lights, ops shack; a collar over each cave shaft (RUNAWAY ring and leaning pylons /
  our sandbag ring and floodlights) replacing main.js's placeholder blocks.
- **Ambient life (ambient.js).** Civilians (instanced, walk cycle in the vertex shader, shirts from the instance colour)
  walk the verges, go in and out of front doors, and run for their doors at any explosion within ~160-200 m (and stay
  in a minute). Traffic: saloons, hatchbacks, estates, VW-style vans, pickups, lorries, tractors (on dirt), country
  buses; keeping right, slowing for bends (2.6 m/s² lateral) and the car in front, carrying on at road ends and turning
  off at junctions, turning round and leaving when a battle is near, burning out when a shell lands next to them. Moored
  dinghies and crabbers bob at the piers; trawlers work the fishing grounds offshore (six more in the zone, kept to deep
  water by the nav grid) with gulls following; cows and sheep in the pastures; up to eight chimneys lit near the camera.
  A village on a machine-held island is deserted (no people, no smoke, no traffic).
- **Interfaces for vehicles and AI** (net.js; also on the world object): `roadAt(x, z)` -> { surface 'tarmac'|'dirt',
  type, kind, bridge, y, road, s, heading, dist, hw } or null; `roadGraph(x, z, r)` -> { roads: [{ id, type, surface,
  kind, hw, xs, ys, zs, br (bridge per segment), s (arc length), len, junctions: [{ s, road, end }], a, b }], nodes:
  [{ id, x, y, z, roads: [{ road, end }] }] }; `roadPoint(R, s, lateral)` -> { x, y, z, dx, dz, grade, bridge };
  `nearestRoad(x, z, maxD)`. Bridge decks are NOT in groundY: a wheeled vehicle must use roadAt(x, z).y on a bridge.
  Traffic models are swappable: `world.traffic.setModel(kind, { geometry, length })` (instanced; an optional aPaint
  vertex attribute marks the paint) or `{ object, length }` (cloned per car); kinds saloon, hatch, estate, van, pickup,
  truck, tractor, bus.
- **Hooks.** main.js (4 lines marked WORLD): import, createWorldLife after createWar, world.update after
  updateCamsAndMeshes, clearedAt() keeps the zone trees off the villages. war.js: structAngle (HQ / production slots
  seeded per island, were random), ud.attach / setSide / onHp / setState / tick when present, dead faction structures
  stay visible as their ruin, fronts face the pad and sit on a cardinal direction between the AA slots on the diagonals.
  terrainworker.js: far bake on rawH, forest trees skip clearedAt(). ships.js: delegate.
- **Numbers.** worldbench (9 km square 3.6 km east of the zone): 18 settlements, 26 farms / 89 fields, 125 km of road,
  7 bridges, steepest grade 14 %; a new cell costs 10-20 ms on the main thread (the first, cold, ~240 ms; prewarmed only
  near the wild lands); a 2 km x 4 m terrain bake 54 ms with roads vs 43 raw; chunk build in the worker 5-50 ms; a town
  chunk ~12k near tris; world main-thread cost 0.1-0.4 ms a frame. worldperf A/B (same run, load average ~70 on the
  shared box): deck 10.8 -> 9.9 fps, 151 -> 165 calls, 139k -> 147k tris; over a town 6.9 -> 6.5 fps, 106 -> 134 calls,
  294k -> 327k tris (most of those are the forest). Jet at 300 m over the zone: +34 calls, +9k tris.
- **Gotchas.** Every ground overlay quad faced down at first (faceW / upW now wind quads by direction); the ES-module
  cycle world.js <-> net.js <-> layout.js needs lazy references (a top-level `{ hf: ground0 }` hit the TDZ); a piped
  write cut short by process.exit; a trailing // comment swallowed the rest of a line again (worldperf caught it).
- **Untested / next.** Wheeled vehicles driving on the roads (roadAt for the surface and bridge decks); AI ground units
  on the road graph; civilians react to explosions and impacts only (not aircraft overhead); no night lighting; the
  zone villages are small (the islands are steep and mostly base). A Huey NaN was seen once at the very start of a run
  at load average ~70, with and without the world (not reproduced).

## 2026-10-23 — NGC-1980 wave 2: the M60A3 TTS and M113A2 in the game (branch ngc/armorgame)
Files (new, game/js/units/armor/): armorcraft.js (the craft adapter), armorworld.js (the trackfm environment on the real
islands, pure), armordriver.js (an AI driver, pure), armorgunnery.js (rounds through war.js), armorsight.js (sight
overlay + thermal render of the game scene), armordelivery.js + lcm8.js (the LCM-8 landing craft: model, sound, run-in,
ramp, unloading), landinghard.js (landing hards, pure); tools/armorgamebench.mjs (20 checks), tools/scenes/armorgame.mjs
(+ armorprobe.mjs, a scratch probe). Shared files: main.js only (blocks marked ARMOUR); vehicle.js, ground.js, war.js
untouched (war.js's exported hitTest / damage / blast carry the gunnery).

- **Crafts.** `createArmorCraft(ctx, 'm60' | 'm113')` on the FOUNDATION craft interface - richer than createVehicleCraft
  because the tank sims are 6-DOF with turret, stations and component damage. Seats with doors at the hull sides (walk up,
  Y): M60 driver / gunner / commander / loader; M113 driver / commander (.50) / 11 troop seats (by the ramp). Eyes from
  tankinterior.js (driver periscopes with the live panel, the gunner's station, the M19 cupola, the M113 driver and
  troop compartment); H opens the seat's hatch for the head-out eye (loader and the M113 commander start head out; the
  troops stand in the cargo hatch). The gunner's M35E1 day (8x) and TTS (3x / 8x, WH / BH) sights are full-screen
  views: the reticle overlay sits just above the WebGL canvas (under the HUD); the TTS re-renders the whole game scene
  with heat materials (terrain through its own heat shader: cool sea, sun-warmed slopes; RUNAWAY machines hot) and the
  green-phosphor post pass, through a new craft hook `renderView` in main.js's frame. V: chase view; as gunner the
  turret lays on what the camera ring is on (a reticle shows where the gun is laid and its range).
- **Controls.** From every seat W / S / A / D are orders to the driver (the crew drives; in the driver seat you drive):
  steering narrowed with speed (Right Shift: full), S brakes then reverses, steering at a standstill pivots (M60) /
  creeps round (M113), the park brake sets itself, Z low range. The mouse lays the gun as a position target turned into
  power-control-handle rates (the inverse of the handle's ^1.6 shaping, so small corrections still drive) and holds in
  space with the stabiliser. Gamepad: left stick / RT / LT drive, right stick lays, RB / LB / X / Y fire / coax / lase /
  sight. HOTAS (CTL): pedals steer, throttle lever drives, the stick is the gunner's handle, trigger / pickle fire.
- **The world (armorworld.js).** Terrain sampled on a 2 m lattice in a direct-mapped cache and interpolated with a
  Catmull-Rom bicubic: slope-continuous (trackfm reads a 5 cm second difference as an edge) and 16 table reads a height
  (the bench: within 0.0 cm of terrainH on smooth ground, no false edges). Ship decks (war.deckY) and the host's own
  platforms (the LCM) win where higher; bridge decks from WORLD's roadAt().y near bridges; surfaces: decks, pads, hards
  and tarmac paved, dirt roads dirt, beaches / sea bed sand, steep or high ground rock, wet hollows mud, grass / dirt
  patches; water at sea level except over decks and inside a landing craft. Obstacles: trees (they give way: the M60
  pushes over small ones - laid down in the instanced mesh), village houses (boxes from WORLD's zone items), island
  buildings and AA sites, the cave shafts, every craft's footprint. The laser ranges terrain, decks, houses, crafts and
  war targets. Deck riding: platform.js carry / settle on the hull origin (position, heading and velocity turn with the
  deck) - bench: parked on a deck that sails 6 m/s and turns 45 degrees for 30 s, 0.0 cm slip.
- **Weapons (game level).** Shot events fly on armorballistics (≤ 3 m sub-steps) and hit through war.hitTest /
  war.damage / war.blast: SABOT 10 (+1.5 blast), HEAT 8 (+5 in 5 m), HEP 6 (+9 in 7 m), .50 1.0, 7.62 0.45 war units (an AA
  site has 7 hp, an HQ 30). Muzzle flash, smoke and the blast's dust ring, tracers through fx.js, ArmorAudio on the game's
  audio bus (sfx.ctx / master: engines by distance, the gun, impacts with sound delay).
- **RUNAWAY fire into the sim.** hurt(amount, why, at, dir) becomes a ray in the hull frame into V.hit: a cannon round
  (23 mm KE, pen 40: perforates the M113, scars the M60), a missile (HEAT 420), a shell's blast (HEP 55 from above), flak
  fragments. Component knock-outs, crew wounds (the player's own position goes to the soldier's medical system, killed =
  a crew lost), fires (Halon, X extinguisher), cook-off; catastrophic kills make a scorched, burning wreck (turret lifted)
  and the crew bails out. Small arms and splinters can find the man with his head out of a hatch.
- **Getting armour to the islands.** New war: the M60A3 at the top of the home island hard, the M113A2 on the ALBATROSS forward
  deck park. 8 / 9 (30 / 60 materiel): an LCM-8 (22.4 m, two 12V71s, 9 kn loaded; modelled with its well, wing walls,
  armoured coxswain's station, exhausts, mast lights, tyre fenders, hull number, ramp with cleats; twin-diesel sound)
  motors in from the amphibious group, grounds, drops its ramp onto the concrete, the crew drives the vehicle off and up
  (the AI driver, gun in the travel position), the ramp comes up and the boat backs off, turns and leaves.
  Landing hards: the archipelago's coasts are cliffs (a 0.7-2.6 rise per metre in the first 26 m inland round the whole
  home island), so planHards cuts a 1-in-5 concrete ramp on each island where the cut / fill is least (45 degree slopes,
  kept off the pads, the structures, the shipyard, the village and roads) and main.js folds it into terrainH (the
  renderer, soldier, war and tanks all agree); concrete strip, kerbs, marker posts and a sign drawn on top. 10 of 17
  islands get one (HOME, IRONHOLD, NORTH ROCK, SOUTH REEF, CITADEL, PELICAN, LOOKOUT, BEACON, FORGE, SANDBAR); an island
  without one gets its armour at home. The hard is also where an M113 drives into the sea to swim.
- **AI hook.** `createTrackDriver(V)` (armordriver.js, pure): goTo / follow (pure pursuit, yaw-rate steering loop,
  speed for turn and stop, pivots when facing away, backs off and retries when stuck, gives up after 3) -> the same
  inputs a player gives, so AI armour obeys the sim. On a craft: `def.order(points, { speed, arrive })`,
  `def.driver.state`. Bench: M60 and M113 drive 200 m and stop within 2.2 m, turn to a target behind, run a 60 m square,
  give up against a wall. For the RUNAWAY ground war's seized MBTs on trackfm: give them a createTrackDriver and an env
  from AW.env(self) (prep each frame), carry / settle for decks.
- **Gotchas.** The M60's diesel catches at 160 rpm and dies under 380: a starter released the frame it "ran" never
  started a parked tank at 120 Hz - crank until it is past stall speed. The gun's dig-in rule (a quarter of the gun per
  dig) fired on house walls and on the LCM's raised ramp: refunded when the muzzle is above the terrain. The first LCM
  plan ramped a tank into a 52 degree bank (GR.beach checks the beach point, not the climb): hence the hards. Sed and
  long node one-liners are refused by the worktree guard: scripted edits go through files.
- **Untested.** Real HOTAS / gamepad on the tank (code paths only); parked / AI armour as war targets (only the player's
  craft is targeted, as for every craft); the M113's squad dismounting into the war; soldiers walking onto an LCM (it is
  not a GR deck); bridge decks (no bridges in the control zone); performance with several tanks fighting at once.
- **Performance.** A tank asleep (parked, engine off, at rest) costs nothing; asleep on a deck it is carried kinematically
  (held at its deck height); a driven tank runs trackfm at 240 Hz, an idle / AI one at 120 Hz; nothing past 900 m is drawn,
  the running gear stays still past 250 m. Headless (SwiftShader, load ~30): sim 1.8 -> ~2.6 ms, render 3.4 -> 4.7 ms a
  frame with the M113 parked on deck in view.
- **Tests (2026-10-23).** node tools/armorgamebench.mjs 20/20; node tools/tankbench.mjs 72/72; scenes/armorgame.mjs 18/18
  (runs/2026-10-23_14-19-53-armorgame); smoke 5/5, war 5/5 (failed 4/5 while the M113 kept simulating on the deck at
  4 fps: the carrier moved 2.2 m instead of 3 in 5 s of wall time - fixed by sleeping on decks), vehicle 14/14 (failed 13/17
  while the M60 and M113 were parked in the test car's path - moved), jettrap 7/7, world 4/4; foot.mjs 10/12 (the island
  roof ladder top and the medical slot check; the experimental base scored 6/18 on the same machine - load-dependent).
