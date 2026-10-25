# NGC-1980 — FOUNDATION: crafts, on foot, the ground-vehicle host

API reference for the wave-2 agents. Read [BIBLE.md](BIBLE.md) first. Everything here is on branch `ngc/foundation`.

The game used to know two player vehicles, `G.craft = 'heli' | 'jet'`, with the jet's plumbing spread through
`main.js`. Now **everything the player controls is a craft** registered with one host. A craft supplies its own
update, cameras, keys, HUD lines, sound silencing and what `war.js` sees; `main.js` routes to whichever craft the
player is in, idles the parked ones, and handles getting in and out (`Y`) and changing seat (`[` / `]`).

| file | what | pure? |
|---|---|---|
| `game/js/craft.js` | the registry: `createCraftHost()`, the craft interface, `PL` for war.js, doors and seats | yes |
| `game/js/ground.js` | the ground host `GR`: surfaces, floors, colliders, ladders, deck carrying, spawn spots | yes (no THREE) |
| `game/js/platform.js` | platform-relative motion on moving / turning / flying ship decks (`carry`, `settle`) | yes |
| `game/js/footsim.js` | the default soldier movement sim (walk, run, sprint, stances, jump, swim, ladders, falls) | yes |
| `game/js/foot.js` | ON FOOT as a craft: placeholder Marine, first-person arms, M16A1 placeholder, the slots | THREE |
| `game/js/vehicle.js` | `createVehicleCraft()`: a pure wheeled / tracked sim + a model -> a drivable craft | THREE |
| `game/js/craftjet.js` | the HORNET as a craft (the proof the interface carries a full aircraft) | THREE |
| `game/js/units/placeholder/boxcar*.js` | the TEST CAR: a placeholder sim + model the WHEELED agent's M151A2 replaces | sim pure |
| `tools/footbench.mjs`, `tools/boxcarbench.mjs` | node benches (28 + 20 checks) against stub worlds | |
| `tools/scenes/foot.mjs`, `vehicle.mjs` | headless scenes (and `jettrap.mjs` now walks away from the parked Hornet) | |

## 1. The craft interface (`craft.js`)

```js
const crafts = createCraftHost({ G, Z, say });   // main.js owns one; G.craft always holds the active id
crafts.register(def); crafts.get(id); crafts.active; crafts.seat;
crafts.control(id, seat, from)   // hand control over: def.enter(seat, from) then the previous craft's exit()
crafts.setActive(id)             // without enter/exit (new game, respawn: the caller placed everything)
crafts.nearestDoor(x, y, z, reach) -> { def, seat, d }    crafts.cycleSeat(+1 | -1)    crafts.toWorld(def, [x, y, z])
crafts.update(dt, input) / afterWar() / render(dt, time) / silence() / bounds(skip)
crafts.PL                       // what war.js sees (below)
```

A craft def is a plain object. Only `id`, `label`, `kind`, `present`, `update`, `pl` are required; the host fills in
no-op defaults for the rest.

| member | meaning |
|---|---|
| `id`, `label`, `kind` | unique id (`G.craft`), the name the HUD uses ("THE TEST CAR"), `'air' \| 'ground' \| 'foot'` |
| `seats` | `[{ id, label, role, eye:[x,y,z], door:[x,y,z] or doors:[[..],[..]], exit:[x,y,z], reach, locked }]` in the craft's local frame (x right, y up, **-z forward**, metres). `role: 'driver'` drives; anything else rides |
| `present()` | does it exist in the world now (parked or driven)? Only present crafts idle, render, collide and have doors |
| `frame(out)` | `{x, y, z, yaw}`: where its local frame is (yaw: forward = (-sin yaw, -cos yaw), the war.js / THREE convention) |
| `enter(seat, from)` | the player climbs in (`from`: `'foot'`, `'swap'`...); return false to refuse |
| `canExit()` | `''` = may get out now, else the reason to show ("STOP FIRST") |
| `exitSpots()` | world spots `[{x, y, z, yaw}]` to step out to, best first (the host tries them in order) |
| `exit(next)` | the player has left; the craft stays where it is, parked |
| `setSeat(i)` | optional: move to another seat inside (the `[` / `]` keys) |
| `update(dt, input)` | while the player is in it. `input`: `{ fire, pad (gamepad or null), keyboardOnly, x, y, thrK, beam }` + read keys with the `keyDown` you were given |
| `idle(dt)` | every frame while nobody is in it (engines spooling down, deck riding, parked services) |
| `afterWar()` | after `war.update` moved the ships: ride the deck now (no one-frame lag) |
| `render(dt, time, firstPerson)` | every frame, driven or parked: position the model, effects, parked sound by distance |
| `camera(cam, dt, view)` | set `cam` (a THREE camera) to the current seat's eye or the chase / orbit rig. `view.locked`: the mouse is captured |
| `firstPerson()`, `fov(ckFov)` | is the camera in the eye (FOV slider, near plane 0.05, HUD layout); the FOV to use (default: the slider) |
| `key(code, e)` | keyboard command while in it; return true if used. Craft keys come **before** the global ones |
| `look(dx, dy)` | captured-mouse movement in pixels (on foot and in vehicles the mouse always looks) |
| `hud()` | `{ line, hint, tip, weap, fuel 0..100, fuelLabel }` for the bottom block, hint line, weapons line, bar |
| `silence()` | stop every sound (pause menu, title) |
| `pl` | what war.js sees (values or functions, below) |
| `avatar(Z)` | copy position / velocity / facing into the player avatar `Z` (map arrow, tags, advisor, war) |
| `hurt(amount, why, at, dir)` | enemy fire. `amount` in war.js units (a helicopter hit is 0.13-0.2), `at` the round's closest point (null for blasts / flak), `dir` its velocity |
| `bounds()` | footprint box(es) `{x, z, yaw, hl, hw, y0, y1}` for walkers / vehicles to bump into (when present) |
| `menuNote()` | optional pause-menu sub-line ("JET FUEL 9000 LB") |

Per frame (`main.js frame()`): `crafts.update(dt, input)` (active `update`, every other present craft `idle`, then
`avatar(Z)`) -> `war.update` -> `crafts.afterWar()` -> cameras (`active.camera`) -> `crafts.render` -> HUD (`active.hud`).

The **Huey** is registered as `heli` and is reachable through the interface (enter / exit / doors / park / idle /
bounds / pl / hurt), but its flying, cockpit, cameras, cave, logistics drop and sky-carrier helm stay special in
`main.js` (`updateHeli(dt, inp, piloted)`); `G.craft === 'heli'` takes those paths.

### What war.js sees: `PL`

`war.js` gets `crafts.PL`. `pos` / `vel` are the avatar `Z`; the rest is asked from the active craft's `pl`:

| field | meaning | heli | jet | foot | vehicle |
|---|---|---|---|---|---|
| `alive` | can be hurt / targeted | Z.alive | not ejected | alive | not destroyed |
| `landed` | on the ground (pad capture) | skids down | - | on the ground | stopped |
| `inCave` | in a 2D cave (out of the war) | in a cave | - | - | - |
| `hitR` | a round must pass within (m) | 4.0 | 4.5 | 0.35-0.45 by stance | 2.0 |
| `sight` | fog-of-war radius (0 = war default 180) | 0 | 220 | 110 | 140 |
| `sources` | extra sight patches | - | radar cone | - | - |
| `detect` | 0..1 visibility: scales gunship hunting range, AA engagement range, "player near our islands" | 1 | 1 | 0.18-0.45 by stance, +sprint, +firing | 0.55-0.8 |
| `capTime` | seconds to take a pad standing on it | 6 | - | 12 | 8 |

war.js hooks (small, each commented `FOUNDATION`): swept bullet test against the player (`segD2`, so a 0.45 m soldier
can't be skipped between frames) passing the hit point to `hurtPlayer(amount, why, at, dir)`; `pl.detect` in the
gunship hunt, AA target ranges and the commander's "defend" check; `pl.capTime` / `pl.kind` in pad capture.

## 2. Keys and input

Order in the keydown handler: controls panel (J) open -> pause menu -> `Esc` -> **`Y` get in / out, `[` `]` seat** ->
**the active craft's `key()`** (not for the Huey) -> the Huey's switches -> global keys (`J`, `T`, `M`, digits, `Tab`,
`V`/`C` for the aircraft, `K`, `P`).

| key | everywhere |
|---|---|
| `Y` | get out (if `canExit()`), or get in at the nearest door when on foot |
| `[` / `]` | previous / next seat (crafts with more than one) |
| `1`-`6` | commands (as before); **`7`** motor pool: a vehicle to the selected friendly island (15 materiel) |
| `M`, `Esc`/`P`, `J`, `K` | map, pause menu, controls panel, keyboard only |

| on foot | | in a ground vehicle | |
|---|---|---|---|
| `W A S D` / arrows up-down | move (arrows left / right turn) | `W` / `S` | throttle / brake, reverse when stopped |
| mouse (click to capture) | look | `A` / `D` | steer |
| `Shift` | sprint (stamina) | `Space` | handbrake |
| `Space` | jump (gets up from crouch / prone first) | `I` | engine |
| `C` / `Z` | crouch / prone (toggle) | `H` | horn |
| `V` | first / third person | `V` | seat eye / chase (mouse orbits) |
| `F` / `X` / click | fire (weapon slot) | | |
| `R`, `I` | reload (weapon slot), inventory (slot) | | |
| `PgUp` / `PgDn` | look up / down (no mouse) | | |

Free for unit agents on foot: `Q` / `E` (lean), `G` (grenade), `B`, `H`, `N`, `L`, `O`, `U` and the digits if you
take them in `key()` (the craft is asked first). Gamepad on foot: left stick moves (half way = walk), right stick
looks, A jump, B crouch, RT fire, L3 sprint. In vehicles: left stick steers, RT gas, LT brake / reverse, A handbrake.
HOTAS (`hotas.js` CTL) in vehicles: stick X or rudder pedals steer, throttle lever = gas, toe brakes / stick aft =
brake. The aircraft read CTL as before.

## 3. ON FOOT (`foot.js`, `footsim.js`)

`foot` is the craft `'foot'`. Getting out puts the soldier at the craft's first standable, clear `exitSpots()` spot
(`foot.spawnAt(spots, { fresh })`). He walks on terrain, island pads (concrete), ship decks (`plat` = the ship,
carried by `platform.js`), climbs ladders (`GR.LADDERS`: the carriers' stern from the water and the island's port
face to its roof), wades and swims (bottom deeper than 1.3 m), falls (hurts from ~2.5 m, kills from ~8 m), collides
with trees, buildings, ship superstructures and every craft's `bounds()`.

Numbers (footbench, all pass): quick time 1.52 m/s and double time 2.74 m/s (FM 22-5 cadences, CONFIRMED), loaded
sprint 5.5 m/s for ~13 s, crouch 1.4, crawl 0.5, swim 0.9 m/s; jump 0.43 m; steps 0.45 m; slopes past 37° block;
Tobler's hiking function slows hills; standing still on a deck that sails, turns and climbs: 0.000 m slip.

### Slots (injection points)

`foot.setSlot(name, impl)` swaps a placeholder for the real module. All optional members may be omitted.

| slot | who | interface |
|---|---|---|
| `soldier` | INFANTRY | movement sim shaped like `createWalker()` (footsim.js): state `x y z vx vy vz yaw pitch stance eye tall onGround swim wade ladder sprinting stamina winded surface stride plat loc carried deckV`; `place(x, y, z, yaw)`; `step(dt, intent, env) -> events`. `intent = { mx, mz, sprint, walk, stance, jump, yaw, pitch, speedK }`; `env` is the ground host `GR`. Events: `land {v}`, `fall {v, water}`, `splash {v}`, `jump`, `ladder {name}`, `ladderTop`, `rung`, `stance`. Call `env.carry(W)` first and `env.settle(W, onGround)` last in `step` |
| `viewmodel` | INFANTRY | `{ group: THREE.Object3D in eye space (-z ahead), update(dt, s) }`; s = `{ speed, stride, stance, eye, swim, ladder, dead, pitch, onGround, sprinting, fired }`. The host places the group at the camera every frame (first person only) |
| `body` | INFANTRY | `{ group, animate(s, dt) }` third-person body (drawn when not first person); group positioned at the feet, rotation.y = yaw |
| `weapon` | INFANTRY | `{ update(dt, a) -> bool fired, key(code) -> bool, hudLine(), reset() }`; `a = { fire, eye, dir (unit), vel, stance }`. The placeholder fires war.js bullets (`war.fireBullet(pos, vel)`); real ballistics should hit war targets through `war.hitTest(x, y, z, side, rad)` / `war.damage` (exported) |
| `medical` | MEDINV | `{ hit(h) -> { dead }, reset(), speedK(), hudLine(), key(code) }`; `h = { part, amount (HP), why, kind: 'bullet' \| 'blast' \| 'fall' }` |
| `inventory` | MEDINV | `{ key(code) -> bool, toggle(), update(dt, foot), hudLine(), reset() }`; `I` toggles it when nothing else took the key |

Damage routing: war.js -> `hurtPlayer(amount, why, at, dir)` -> `foot.hurt` -> `hitZone(at, ...)` picks one of
`BODY_PARTS` (head 35 HP, thorax 85, stomach 70, arms 60, legs 65; prone soldiers are hit along their length) ->
`medical.hit({ part, amount: amount x HP_PER_WAR_UNIT (300), ... })`. Blasts / flak (`at` null) spread over every part.
Falls hit the legs. The default medical kills at zero on head / thorax / stomach, spills a lost limb's damage into the
thorax x0.7 and slows you to 60% with a leg gone. In an open vehicle `exposed` (0.35 for the test car) of the hits
reach the crew the same way. A dead soldier costs a life (a crew); after 3.5 s a new crew starts in the helicopter on
the ALBATROSS (`toHeli()`).

## 4. The ground-vehicle host (`ground.js`, `platform.js`, `vehicle.js`)

```js
GR.sample(x, z, out) -> { h, nx, ny, nz, surface, water, plat, mu, crr, sink }
GR.floor(x, z, y, step = 0.45, tall = 1.8)   // the surface you'd stand / roll on from height y; Infinity = a wall
GR.collide(o, skipDef) -> contacts           // o = { x, z, r, y0, y1 } pushed out; o.nx, o.nz = last normal
GR.ladderAt(x, z, y, r) / GR.LADDERS / GR.ladderWorld(L, ship)
GR.carry(o) / GR.settle(o, onGround)         // o = { x, y, z, yaw, plat, loc, carried }: see platform.js
GR.platVel(x, z) -> { vx, vz, w, cx, cz } | null
GR.deckSpot(k) / GR.motorPool(island) / GR.beach(island, toward) / GR.spawns() -> [{ name, x, y, z, yaw, plat }]
GR.clearView(eyeX, eyeY, eyeZ, camPos, skipDef)   // pull a third-person camera in front of obstacles
GR.addSurface(fn(x, z, h) -> name | null)         // roads, mud, airstrips (WORLD agent)
GR.addCollider({ x, z, r, y0, y1 } | { x, z, yaw, hl, hw, y0, y1 }) / GR.removeCollider(c)
GR.G = 9.81, GR.SURF
```

Surfaces (`SURF`, mu / rolling resistance, INFERRED from Wong, Theory of Ground Vehicles): `road` (pads and aprons
count as road) 0.85 / 0.015, `deck` 0.8 / 0.015, `rock` 0.7 / 0.02, `grass` 0.5 / 0.06, `sand` (beaches below 2.5 m)
0.5 / 0.18, `mud` 0.35 / 0.13 (only from `addSurface` providers yet), `water` = the bottom under shallow water
0.45 / 0.15 (wading drag is the sim's job), `hole` (cave shafts: fenced, `floor` says Infinity).

Water: `sample().water` is the depth of sea over the ground (sea level y = 0). Fording, flooding, swimming
(amphibians) and sinking are the unit sim's: the test car drowns past 0.53 m and sinks past 85% of its height, and has
an `AMPHIB` option (afloat past its draft, thrust against hull drag, 5.8 km/h like an M113, out again up a beach) as a
reference for the TANK agent's M113 - see `tools/boxcarbench.mjs`.

Collisions: per wheel / track point compare `GR.floor` against the last height (a rise above 0.45 m is a wall; the
test car bounces and reports `crash {v}`), then `GR.collide` circles along the body for trees, buildings, ship
islands and other crafts (`S.self = def` skips your own footprint).

Decks: the host carries anything with `plat` set (`carry` before the step, `settle` after; `afterWar` again after
the ships moved). Motion relative to the deck is the sim's; the deck's own motion (sailing, turning, the SKY
CARRIER climbing) is added exactly. If your sim keeps per-wheel heights, implement `sim.shift(carried)` (the deck
moved you by `carried.dy`).

Spawns: `GR.deckSpot(0..2)` (the ALBATROSS's starboard deck park, forward of the island, clear of the catapult and
the landing area), `GR.motorPool(island)` (beside the pad, flat and clear, nose to the pad). Shipping vehicles:
the motor pool command (`7`) lands one at the selected friendly island (or the nearest one, else the deck). A real
landing craft or a CH-46 / C-130 delivery is a wave-2 job; call `def.spawnAt(spot)` when it arrives.

### The vehicle adapter

```js
import { createVehicleCraft } from './vehicle.js';
const def = crafts.register(createVehicleCraft(vehCtx, {
  id: 'm151', label: 'M151A2 MUTT', sim, model,     // sim: the pure unit sim; model: { group, animate(sim, dt, opts) }
  seats: [{ id: 'driver', label: 'DRIVER', role: 'driver', eye: [-0.38, 1.5, 0.12], door: [-1.15, 0.9, -0.1], exit: [-1.6, 0, -0.1] }, ...],
  hp: 100, exposed: 0.35, hitR: 2, sight: 140, capTime: 8, cyl: 4,
  controls: (ctl, input, def) => { /* gunner / commander seats: turret keys etc. */ },
  key: (code, def) => false, weapLine: def => '',
}));
def.spawnAt({ x, y, z, yaw });   def.stow();
```

`vehCtx` is built once in `main.js` (`scene, GR, crafts, war, fx, sfx, say, feed, keyDown, CTL, hwOn, camZ,
crewHit, crewKilled`); reuse it. The **sim contract** (see `units/placeholder/boxcar.js`):

- state the adapter reads: `x, y` (wheel contact plane), `z, yaw, pitch` (nose up +), `roll` (right side down +),
  `v` (m/s forward, relative to the ground / deck), `vy, yawRate, steer, rpm, gear, engineOn, onGround, fuel, hp,
  dead, flooded, sunk, water, surface, plat, loc, carried`, and `P = { L, W, H, FUEL, FORD }`;
- `place(x, y, z, yaw)`, `reset()`, `step(dt, ctl, env) -> events`, optional `shift(carried)`;
- `ctl = { drive -1..1, steer -1..1 (right +), handbrake, engine (true = crank once) }`;
- events: `crash {v}`, `land {v}`, `flood`, `sink`, `stall`. The adapter turns crashes into hull damage and crew hits;
- `env` is `GR`: use `env.floor`, `env.sample`, `env.collide(o, S.self)`, `env.carry(S)` first, `env.settle(S, onGround)` last.

Cameras: each seat's `eye` with mouse head-look (eases back when the mouse is released), or `V` for a chase orbit
(mouse orbits, eases back behind). Sound: `sfx.motor({ rpm, load, cyl, on, inside })` (a new small hook in
audio.js) for the vehicle you drive or a running one within 60 m.

## 5. Worked example: a new craft (an aircraft)

```js
// game/js/units/c130/c130craft.js
export function createC130Craft(ctx) {            // ctx: what main.js hands you (scene, war, sfx, say, keyDown, GR, crafts...)
  const sim = createC130Sim(9.81), model = buildC130Mesh(); ctx.scene.add(model.group);
  let out = false;                                 // on the carrier? on a runway? parked?
  const D = {
    id: 'c130', label: 'C-130H HERCULES', kind: 'air',
    seats: [
      { id: 'pilot', label: 'PILOT', role: 'driver', eye: [-0.6, 3.9, -12.2], doors: [[-1.8, -1.2, -9.5]], exit: [-2.6, -2.9, -9.5] },
      { id: 'loadmaster', label: 'LOADMASTER', role: 'crew', eye: [0, 2.6, 8], doors: [[0, -1.5, 14]], exit: [0, -2.9, 16] },
    ],
    present: () => out,
    frame: o => Object.assign(o, { x: sim.pos.x, y: sim.pos.y, z: sim.pos.z, yaw: sim.yaw() }),
    enter: (seat, from) => out && !sim.dead,
    canExit: () => sim.onGround && sim.groundSpeed < 0.5 ? '' : 'STOP FIRST',
    exitSpots: () => [ctx.crafts.toWorld(D, D.seats[ctx.crafts.seat].exit)],
    update: (dt, input) => { sim.step(dt, readControls(ctx, input), env); },
    idle: dt => sim.step(dt, PARKED, env),         // brakes on, engines winding down
    render: (dt, t, fp) => { model.group.position.copy(sim.pos); model.group.quaternion.copy(sim.q); model.animate(sim, dt, fp); },
    camera: (cam, dt, view) => ctx.crafts.seat === 0 ? cockpitEye(cam, view) : chase(cam, dt),
    firstPerson: () => ctx.view.cockpit,
    key: code => code === 'KeyG' ? (sim.gearToggle(), true) : false,
    hud: () => ({ line: `IAS ${sim.kias.toFixed(0)}kt ...`, hint: '', weap: '', fuel: sim.fuel / sim.FUEL * 100 }),
    silence: () => ctx.sfx.c130?.({ on: 0 }),
    pl: { alive: () => !sim.dead, landed: () => sim.onGround, hitR: 15, sight: 260 },
    avatar: Z => { Z.pos.copy(sim.pos); Z.vel.copy(sim.vel); Z.facing.set(-Math.sin(sim.yaw()), -Math.cos(sim.yaw())); },
    hurt: (a, why) => sim.damage(a, why),
    bounds: () => out && sim.onGround ? { x: sim.pos.x, z: sim.pos.z, yaw: sim.yaw(), hl: 15, hw: 2.2, y0: sim.pos.y - 3, y1: sim.pos.y + 8 } : null,
    spawn: spot => { sim.reset(spot); out = true; },
  };
  return D;
}
// in main.js (FOUNDATION block):  const c130C = crafts.register(createC130Craft({ ...the same things the jet gets }));
```

Walk up to the crew door and press `Y`: `crafts.nearestDoor` finds the door, `crafts.control('c130', seat, 'foot')`
calls your `enter`; `[` / `]` moves between pilot and loadmaster; `Y` on the ground calls `canExit` / `exitSpots`.

## 6. Worked example: a new ground vehicle (the M151A2)

```js
// game/js/units/wheeled/m151sim.js  (pure, node-benchable: copy tools/boxcarbench.mjs's stub env)
export function createM151() { const S = { P: M151, x: 0, ... }; S.place = ...; S.reset = ...; S.step = (dt, ctl, env) => { env.carry(S); ...; env.settle(S, S.onGround); return S.events; }; return S; }
// game/js/units/wheeled/m151model.js
export function buildM151Mesh() { ...; return { group, animate(s, dt, { driverIn, firstPerson, seat }) {...} }; }
// main.js, in the FOUNDATION block, next to the TEST CAR (or instead of it):
const m151C = crafts.register(createVehicleCraft(vehCtx, {
  id: 'm151', label: 'M151A2', sim: createM151(), model: buildM151Mesh(), exposed: 0.4, cyl: 4,
  seats: [
    { id: 'driver', label: 'DRIVER', role: 'driver', eye: [-0.36, 1.45, 0.1], door: [-1.1, 0.9, 0], exit: [-1.6, 0, 0] },
    { id: 'gunner', label: 'M60 GUNNER', role: 'gunner', eye: [0, 1.9, 0.9], door: [0, 0.9, 2.0], exit: [0, 0, 2.4] },
  ],
  controls: (ctl, input, def) => { if (def.seats[def.seat].role === 'gunner') m60.aim(input, def); },
}));
m151C.spawnAt(GR.motorPool(HOME_B.isl) || GR.deckSpot(0));
// deliverVehicle() (key 7) spawns carC: point it at your craft, or make a list
```

A tracked vehicle is the same: track contact points instead of wheels (check each against `GR.floor`), skid
steering in the sim, `controls` for the turret seats (gunner sight eye in `seats`).

## 7. Testing

- `node tools/footbench.mjs` (28 checks) and `node tools/boxcarbench.mjs` (20) - stub worlds, no browser.
- `CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/foot.mjs` (10 checks) and
  `scenes/vehicle.mjs` (14); `scenes/jettrap.mjs` now climbs out of the trapped Hornet and walks to the Huey.
- Debug bridge additions (`?debug`): `__G.crafts, foot, GR, carC, jetC, heliC, getInOut, deliverVehicle, toHeli,
  stowCrafts, hurtPlayer`. Useful: `__G.foot.spawnAt({ x, y, z, yaw })`, `__G.foot.W` (the walker),
  `__G.crafts.toWorld(def, [x, y, z])`, `__G.GR.toLocal(__G.war.carrier, x, z)`.
- Headless gotcha: `requestPointerLock` must only come from a click; requested on a key press it froze headless
  screenshots (the scenes set `foot.W.yaw` / `pitch` instead of moving the mouse).

## 8. Integration status and limitations (2026-10-25)

- The Huey's crew figures are merged into its model, so a pilot still sits in it after you get out (call him the
  copilot). Parked crafts are not war.js targets (only the player's craft is); `pl` is per active craft.
- The sky-carrier helm, enterable buildings and ship spaces, doors, seats, hangar and deck elevators have since been
  integrated. Their implementation is in `interiors/`, `units/naval/` and the main craft hooks; the original
  foundation preview below is not the complete current feature list.
- The placeholder car remains a development fixture. Playable wheeled/tracked units use their own dynamics,
  damage and rollover models. A complete shared collision world remains deferred on `ngc/collision`.
- Ejected Hornet pilots still go straight to the rescue; landing on foot after an ejection would be a small change
  in `craftjet.js` (`updateChute` -> `foot.spawnAt`).

Current release scope, branch disposition and testing are in [PLAN.md](PLAN.md) and [VALIDATION.md](VALIDATION.md).

## 9. Wave 2: the Marine on this craft (ngc/foot2)

- `foot.setMarine(createMarine(ctx))` (main.js does it): the real 1980 Marine (`marine.js` + pure `marinesim.js`,
  `units/infantry/invbridge.js`) owns input, weapons, wounds, cameras, the first-person pass (`foot.overlay(renderer,
  cam)` after the world render) and the HUD lines. `__G.marine` in debug: `.MS` (sim), `.R` rifleman, `.S` soldier,
  `.M` medical, `.inv` rig, `.input({...})` / `.press(...actions)` (held / one-shot inputs for scenes), `.aim(yaw,
  pitch)`, `.addFigure(x, y, z, yaw, { ship, side, kit })`, `.openScreen('gear' | 'health', loot)`, `.stats`.
- War hits: `hurtPlayer(amount, why, at, dir, kind)`; `kind` is the war.js projectile kind (`'b'`, `'ciws'`, `'jb'`,
  `'flak'`, `'blast'`); a new weapon that hurts soldiers should pass its kind (and the hit point for bullets) and add a
  row to `INCOMING` in marine.js.
- The Marine's rounds hit war.js units as spheres of `u.r`; a unit can supply its own `u.hitRay(x0, y0, z0, dx, dy, dz,
  L) -> { dist, x, y, z, material?, thickness? } | null` (walkers, tanks: hull boxes, armour material).
- Ground host additions: `GR.deckH(x, z)` (war.deckY with the ALBATROSS island's real levels), `GR.toShip(u, x, y, z)` /
  `GR.fromShip(u, lx, ly, lz)` (the full ship frame with heave, pitch and roll), `GR.laddersOf(u)`, `GR.treeHit(...)`.
  platform.js now carries in the full ship frame (decks that heave, pitch and roll; the sky carrier's climb).
