# ngc/look-airbases: the air base outside the control zone, C-130 / SR-71 sorties from it

Branch `ngc/look-airbases` from `ngc/shader-library` f8abdbb.

User (Jay Jay): **"have another agent work on our bases outside the control zone that has big hangers and such to fly
the blackbird and heracles from there whenever we want."**

## 2026-10-29 - What was built

### The base: WESTGATE AFB (world/airbase.js, world/airbasemesh.js)
A 1980 USAF field in the Beale AFB mould (9th SRW: SR-71A, U-2/TR-1, KC-135Q; C-130s transient), fictional name, real
standards. Sources and the dimension table: `docs/ngc1980/reference/airbase/SOURCES.md` (FAA / DoD public-domain
standards, Beale's runway from the FAA chart supplement, the SAC double-cantilever hangar type from Lincoln AFB /
HAER, SR-71 and C-130 principal dimensions). No images downloaded, no game assets used.

- **Where**: a deterministic site search (`planAirbase`) over ~1,300 candidate sites along the two zone edges on the
  friendly side (the side the player's HQ island is on), 2.6-7.4 km past `BOUND`, with the runway either parallel to
  the edge or pointing at the zone. Scored on the relief of the natural ground under the 5.4 x 1.05 km footprint, sea
  under it, **both approach corridors** (+-900 m, 8 km, against the 3 deg glide path + 150 m: at least one must be
  clear) and distance. It reads `BOUND` and `wildH`, so the terrain agent's bigger zone moves it:
  BOUND 1280 -> (-1152, 5880), 4.6 km south of the zone, runway 36/18 pointing at it, elevation 41 m;
  BOUND 2560 -> (-8360, 0), 5.8 km west, runway 18/36, elevation 34 m (both flown in the node bench). The ground
  round it is real wild land: in both cases one approach has mountains (RWY 36 at 1280: 506 m over the path), which
  the autopilot avoids (it lands on the clear end, SHIFT+L lines up so the climb-out goes over the clear side).
  The search costs ~220 ms in each thread that imports world.js (main, terrain worker, world worker).
- **Ground**: `world.js` has one marked hook: `rawH = ... : AIRBASE.H(x, z, wildH(x, z))`. Inside the field it is
  exactly the field elevation; it blends back to the natural ground over 380 m. Because it is inside `rawH`, the
  physics (`terrainH`), the terrain worker's near (islandH) and far (rawH) windows, the lived-in world and the far
  land all agree (bench: worst 0.000 m on every paved surface).
- **Keep-outs** (`world/net.js`, five marked lines): no settlements within 320 m, no farms within 200 m, no road edge
  whose straight line crosses the field (the router's 500 m lateral limit cannot go round a 5.4 km field), a road cost
  penalty near it, `clearedAt` true on the field (no forest / scrub). main.js's clutter sampler skips pavement.
- **Layout** (u along the runway, v towards the zone): runway 12,000 x 300 ft with 1,000 ft overruns; parallel taxiway
  75 ft wide at 1,000 ft with five connectors and hold-short markings; a 1.6 km ramp; behind it a double-cantilever
  maintenance hangar (150 x 84 m, 60 ft doors, two 36 m bays: the C-130 lives in the front one), four SR-71 shelters
  (40 x 46 m), the tower (cab floor 27 m), base operations, the fire station, squadron ops, base supply, shops, a
  four-tank fuel farm in a bund, the main gate; an 8 ft chain-link fence with barbed-wire outriggers round all of it.
- **Markings and lights** to the period FAA / USAF standard (SOURCES.md #2-#4): 16 threshold stripes, block
  designators from the actual heading, 120/80 ft centreline, TDZ bars 3-3-2-2-1-1, aiming points, side stripes,
  overrun chevrons, 25 ft slab joints, rubber deposits in the touchdown zones; white / yellow (last 2,000 ft) edge
  lights every 200 ft, green thresholds, red ends, ALSF-1 with the 1,000 ft bar and red side rows, 2-bar VASIs,
  blue taxiway edges, distance-remaining signs, windsocks, the tower beacon, obstruction lights.
- **Cost**: 6 draws (pavement, markings, buildings, fixtures, fence, lamps), 126 k triangles (751 lamps instanced),
  built in ~150 ms at start. Fixtures dissolve out at 1.1 km, the fence at 450 m (`renderkit/lod.js detail`); the
  buildings and the pavement stay to the draw distance (they are the base). Beyond the draw distance (2.6 km max) the
  far land (`renderkit/atmosphere.js rkFarLand`) greys the runway, taxiway and ramp analytically (`airbaseFarGLSL`),
  so the field reads from 3,000 m and at long range.
- **Map**: the minimap and the jet's moving map draw the runway, taxiway and ramp; the command map (M), which shows the
  zone, puts an arrow at its edge pointing to the base with the name and range.

### Flying from it whenever you like (units/air/basecraft.js)
- The command board (`\`) has two new rows, **C-130** and **SR-71** (fleet types `c130` / `sr71`, `at: ['airbase']`,
  `support: true` so they never keep a lost war going). A row that only the air base takes deploys there whatever base
  the board has selected (`board.js baseFor`), so it is `\`, down to the row, ENTER, from any unit, any time.
- The C-130H comes out of the maintenance hangar onto the ramp in front of it, engines running (or cold with `?cold`).
  On the real flight model (`c130fm.js`: the ground model, nose-wheel steering, beta / reverse, brakes):
  - **B** parking brake, **SHIFT / CTRL** power levers (ground: the beta range from ground idle; **R** held reverse),
    **Q / E** rudder + nose wheel, **, .** tiller, **SPACE** brakes, **W/S A/D** yoke, **[ ]** trim, **G** gear,
    **Z / X** flaps, **V** flight deck / chase, the flight deck's switches clickable (the same deck as RAIDER 21).
  - **K** the flight engineer runs the start checklist (battery, GTC, 3-4-2-1) or the shutdown; **SHIFT+K** quick
    start; **SHIFT+L** quick line-up on the nearer runway end (engines on, flaps 50).
  - **H** autopilot hold; **N** (or SHIFT+H) autopilot home: flies to a 5.2 km final for the better runway end, a 3 deg
    glide path, flare, landing, reverse and brakes to a stop.
  - Stopped on the base's pavement after a flight: **O** hands her to the ground crew (or parking brake + engines shut
    down does it by itself): towed into the hangar, the sortie ends, she is back in reserve and you are back in the
    Huey. Left in the air for another unit, the crew flies her home and lands; left on the base, she is towed in.
  - The hangars and tanks stop her (`hitBuilding`); fast into one is a crash. Lost: the fleet's loss, the hangar empty.
- RAIDER 21 (drop.js, the para-drop) is announced from the air base. Its run-in direction is unchanged: bringing it in
  from the base's side broke drop.json (5/6) and c130jump.json (7/8: the jump run geometry the scenes rely on); with the
  direction reverted c130jump is 7/7 again.

### SR-71 hook (status: slot ready, waiting for ngc/look-sr71)
ngc/look-sr71 had no commits and no findings yet when this was written (worktree clean at f8abdbb), so there is no
SR-71 API to call. The base is ready for it:
- **The slot**: `AB_SLOTS.sr71` (shelter 1, `barn1`) and `sr71b` (shelter 2): `AIRBASE.spot('sr71', 'park')` inside the
  shelter, nose out; `AIRBASE.spot('sr71', 'ramp')` on the ramp in front of it. Both `{ x, y, z, yaw }` in game
  convention (forward = (-sin yaw, -cos yaw)), y = the field elevation.
- **The board row** `sr71` exists (fleet type `sr71`, 1 in reserve, air base only); until an SR-71 is attached it shows
  NOT ON THE BASE YET.
- **What the SR-71 module provides**: a craft def (craft.js contract: id `'sr71'`, label, kind 'air', present, frame,
  enter, canExit, exit, update, idle, render, camera, firstPerson, key, hud, pl, avatar, hurt, silence) plus the base
  hooks: `baseSlot: 'sr71'`, `spawnAt(spot, mode)` (mode 'hot' | 'cold' | 'runway'; on the ground at spot ready to
  taxi), `parkAt(spot)` (a static parked aircraft in the shelter, present() false), `sortie: { airborne, onBase,
  stopped }` kept up to date (`AIRBASE.onPavement(x, z)` / `onRunway` help), `handIn()` (stopped on the base: parkAt
  the slot and call `ctx.onSortieEnd(def, mine)`), optional `flying()`, `lineUp()`, `farView: true` (jet draw distance).
  units/air/basecraft.js `createC130Sortie` is the worked example of every one of these.
- **Plugging it in** (main.js, one line after the C-130's): `baseOps.attach(createSR71Craft(baseOps.ctx));`.
  `baseOps.ctx` (= main's BASE_CTX) carries scene, war, G, Z, CTL, keyDown, hwOn, say, feed, sfx, fx, crafts, head,
  AIRBASE, terrainH, camZ, hover, view, onUnitLost, autoNext, onSortieEnd, params. `attach` registers the craft and
  parks it in its shelter; the board row, deploy, status, the stand-down (X on the board) and the map then work.
  If the SR-71 agent's API is `createSR71({...})` with placeOnGround / enter / exit, a 30-line adapter maps it:
  spawnAt -> placeOnGround(spot) + running state, parkAt -> placeOnGround(spot) + shut down + present false.
- Update 09:30: ngc/look-sr71 2a8f702 has the exterior model only (`units/air/sr71model.js buildSR71Model`, local frame
  +x right, +y up, nose -z, origin at the CG, ground at y = -G.Y_CG: the same convention as the C-130, so a parked SR-71
  is `model.group.position.set(spot.x, spot.y + G.Y_CG, spot.z); model.group.rotation.y = spot.yaw`). Its flight model
  (sr71fm.js) is not committed yet. Not merged here (no merging between branches).


## Test results (2026-10-29, headless SwiftShader, one scene at a time)
- `node tools/airbasebench.mjs`: ALL PASS. Paved surfaces flat to 0.000 m in rawH and islandH; the blend reaches the
  wild land; one approach clear; no trees / scrub / roads on the field; mesh 6 draws, 129 k tris, 790 lamps, ~190 ms;
  full sorties on the real C-130 flight model and the craft's own `homeAutopilot` from **both** runway ends: lift-off
  ~117 m from brake release (world scale), circuit, final, flare, rollout on the centreline (0.1 m), nz 0.32-1.75.
  The same bench with BOUND = 2560 (world.js edited temporarily, then restored): ALL PASS (the site moves 5.8 km west
  of the bigger zone).
- `tools/scenes/airbase.mjs`: **PASS 14/14** (run 2026-10-29_11-23-57): board -> C-130 row -> ENTER on the ramp,
  taxi under power, SHIFT+L, keyboard take-off, N home, approach, landing, stopped on the centreline, O: parked in
  the hangar, back in reserve, back in the Huey. Evidence in `docs/ngc1980/evidence/look-airbases/`: 01 board, 02-05
  ground views, 06 300 m, 07 3,000 m, 09 4 km out on the clear approach, 10-11 the C-130 in its hangar, 12-13 ramp
  chase / flight deck, 15-19 line-up, take-off, final from the flight deck, flare, stopped, 20 command map arrow,
  21 minimap, and the scene log.
- Regressions: smoke.json 5/5, drop.json 5/5, c130jump.json 7/7, airdrop.mjs 10/10, c130.mjs 8/8,
  worldvisibility.mjs 17/17, commanderbench 39/39, `check.mjs syntax` 562/562, `check.mjs types` 606 (baseline 606).

## Open items
- **SR-71**: plug it in when ngc/look-sr71 has a flight model (see "SR-71 hook"). Until then the SR-71 row says NOT ON
  THE BASE YET and its shelter stands empty.
- **3,000 m view**: the far land (renderkit/atmosphere.js) shows the runway, but at that height the far heightmap draws
  in bands with sea between them (07-air-3000m; it happens away from the base too, so it is not from this branch). For
  the sky / terrain agent. The base geometry itself only draws inside the game-wide 2.6 km draw distance.
- **Merge with ngc/look-terrain**: the world.js changes are two marked lines; the site re-plans itself on the new
  BOUND / wildH. If the terrain agent changes `wildH`, re-run `node tools/airbasebench.mjs`.
- No static display aircraft on the ramp yet (a KC-135Q or T-38 of the period would sell the 9th SRW look); no night
  lighting pass (the lamps are unlit emissive points, sized up with distance); the hangar interiors are simple.
- The tower is a generic 1960s USAF concrete tower: no open-access standard drawing was found (UNVERIFIED).
- Keyboard flying: letting go of the yoke holds heading and height (as RAIDER 21 does); in the climb-out it holds a
  climb to 1,000 ft AGL. A HOTAS flies it raw.
- The site search costs ~220 ms per thread at load (main + 2 workers); it could be cached if load time matters.

## 2026-10-29 (afternoon) - The SR-71 at the base (after merging ngc/shader-library with ngc/look-sr71)

`units/air/basesr71.js attachSR71(BASE_CTX, sr71C)` gives look-sr71's craft the base contract on top of its own API
(placeOnGround, addStrip, P.override, its altitude / heading autopilot); main.js: `baseOps.add(attachSR71(BASE_CTX, sr71C))`.
- **Board**: the SR-71 row (`\`, down, ENTER) puts the crew in her in **shelter 1**, cold (`?quick`: engines running).
  I: the start cart lights both J58s; she taxis out of the shelter on her own power (the shelters, hangar, tanks and
  buildings stop her: `hitBuilding`). SHIFT+L: towed to the runway (the departure end), engines running.
- **Pavement**: every paved rectangle of the field (runway + overruns, taxiways, ramp, shelter and hangar floors) is
  registered with `sr71C.addStrip({ ..., mesh: false })`, so she rolls on it exactly (never "sea").
- **N: home** (`sr71Home`, pure): the initial fix 9 km out at 1,600 ft over the field (500 ft over the ground ahead
  at least), 250 KEAS, 200 KEAS and gear down inside 5 km, a 175 KEAS final on a 3 deg path (165 short final), the flare
  law of sr71bench to touchdown, power off, the **drag chute below 205 KIAS** (jettisoned at a walk), brakes below 80
  KIAS, nose wheel on the centreline. It flies her own autopilot (altitude + heading hold) and the throttles; any stick
  input hands back. SHIFT+N is now her lights (N was).
- **End**: stopped on the base, O (engines off) - the crew tows her into the shelter after 2 s; SHIFT+O at once. Fleet:
  back in reserve; a loss is booked by craftsr71's `onUnitLost('sr71')`. Left in the air for another unit, the crew flies
  her home. New game: she is parked in her shelter. **?fly=sr71** now lines her up on the base runway (engines running);
  ?fly=sr71air unchanged.
- **Bench** (`node tools/airbasebench.mjs`): SR-71 sorties from both ends on sr71fm: lift-off 217 KIAS (manual ~210),
  home, touchdown 148 KIAS (manual 155), chute out, stopped on the centreline (0.0 m), ~440 m short of the far end.
- **Landing weight**: a 64,000 lb sortie could not hold the 175 KEAS final at MIL (high and slow over the runway in the
  first scene run). The way home now dumps fuel to ~15,000 lb on the way to the fix (the SR-71 has a dump; the rate is
  fast-forwarded, 450 lb/s, and announced). Bench: a heavy (64,000 lb) and a light (45,000 lb) sortie both land, 149
  KIAS touchdown, chute, stop on the centreline.
- **SAMs at the base**: look-sr71's SA-2 sites reach 45 km, and with BOUND 1280 IRONHOLD is ~7 km from the field's
  approach: they fired at her on the runway (first scene run: lost on the take-off). The adapter gives the base a HAWK
  battery: within 15 km of the field below 20,000 ft enemy SAMs are destroyed (feed line). Open: with runways pointing
  at the zone the clear approach can lead over enemy ground; a proper fix is SAM coverage that respects the zone.
- Scene: `tools/scenes/airbasesr71.mjs` (board, shelter, cart start, taxi out, tow, take-off, N home, chute, stop, O,
  parked). The take-off rotation is a test pilot's law through P.override (a held S key is full back stick and scrapes
  the tail: a keyboard player has to ease it, as in look-sr71's own scene).
- **Flare at any frame rate**: the first flare law (the sr71bench gamma law, applied once a frame) touched down at
  122-125 KIAS with a 4.7 g overstress at the headless 10 fps (P.override runs per frame, not per substep). The flare
  now uses her own autopilot's attitude hold (it runs inside the flight model's 200 Hz substeps) at 7.2 deg with
  power for 155 KIAS: 155 KIAS at 60 Hz, 157 at 10 Hz, ~500 m past the threshold. The glide path also leads the
  autopilot's vertical-speed loop (it rode ~60 m high and landed 3 km in).
- Scenes open the command board with `__G.commander.open()` (Codex's radio desk takes the `\` key on the integration
  branch).
- **Touchdown "overstress"**: sr71fm checked the g limit on the ground too, where nz carries the gear's touchdown
  reaction: every landing (even ~200 fpm) read 4-6.5 g OVERSTRESS and took 5 % damage. Now airborne only (one marked
  line in sr71fm.js; sr71bench 24/24). The flare is a 0.5 m/s (world) sink on her altitude hold with power for ~157:
  touchdown 144 KIAS at 60 Hz, 151 at 10 Hz, no overstress. (At SRDT=0.1 the bench's own scripted climb-out from the
  obstructed end hits the hill; that is the bench pilot, not the base code.)
