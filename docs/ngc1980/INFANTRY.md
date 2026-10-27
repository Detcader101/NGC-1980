# NGC-1980 infantry: integration contract (wave 2)

The 1980 Marine rifleman lives in `game/js/units/infantry/`. The pure cores (no THREE, no DOM) run in node and are
checked by `tools/infantrybench.mjs`; the visual modules use three.js. The range sandbox `game/dev/infantry.html`
(`infantry.js` + `infantry-range.js`) is the reference host: everything below is wired up there.

| File | Pure | What |
|---|---|---|
| `ballistics.js` | yes | flight of every round (G1/G7 point mass, wind, air density), sight solutions, a game table for hits, `makeHitInfo`, `explosionInfo` |
| `weapons.js` | yes | M16A1, M203, M60, M72A2, M1911A1 state machines; magazines / belts as items; the inventory contract |
| `soldier.js` | yes | body: movement with inertia, stances, stamina (Pandolf / ACSM / oxygen debt), sway, recoil, lean, free look, medical modifiers |
| `rifleman.js` | yes | the whole Marine: soldier + weapons + inventory + live projectiles + hit registration. **The object the game drives.** |
| `viewmodel.js` | no | first-person arms and weapon, own render pass |
| `soldiermodel.js` | no | shared skeleton, poser, hitboxes, the 1980 Marine model |
| `weaponmodels.js`, `meshkit.js` | no | weapon meshes (shared by both views), the vertex-coloured geometry kit |
| `infantryaudio.js` | no | synthesised gunshots by distance, cracks, impacts, mechanics, footsteps, breathing |

## FOUNDATION (on-foot mode in main.js)

```js
import { createRifleman } from './units/infantry/rifleman.js';
import { createViewmodel } from './units/infantry/viewmodel.js';
import { buildMarine, poseSkeleton, raycastHitboxes } from './units/infantry/soldiermodel.js';
import { InfantryAudio } from './units/infantry/infantryaudio.js';

const R = createRifleman({ loadout: 'rifleman', x, y, z, yaw, id: 'player', side: 1, inventory: MEDINV_inventory /* optional */ });
const vm = createViewmodel(), audio = new InfantryAudio(sfx.ctx, sfx.master);   // share the game's AudioContext
// each frame (fixed step recommended, the range uses 1/120 s):
const events = R.step(dt, input, env, mods);
camera.position.set(R.soldier.eye.x, R.soldier.eye.y, R.soldier.eye.z);
camera.rotation.set(R.soldier.camPitch, R.soldier.camYaw, R.soldier.camRoll, 'YXZ');
camera.fov = vm.fov(baseFov, R.soldier.ads);
vm.update(dt, R);  renderer.render(world, camera);  vm.render(renderer, camera);   // second pass, depth cleared
```

- **Enter / exit vehicles**: `R.soldier.place(x, y, z, yaw, stance)`. Hide the viewmodel while seated.
- **Input** (per step): `{ move: [x, y], look: [dx, dy] (rad), sprint, walk, ads, fire, holdBreath, freeLook, jump,
  lean: -1..1, stance: 'stand'|'crouch'|'prone'|'up'|'down' (one-shot), bipod (one-shot), deadzone (rad, 0 = Tarkov),
  actions: [...] }`. Actions: `reload` (tactical), `reloadSpeed`, `ia` (immediate action), `remedial`, `charge`, `fa`,
  `boltRelease`, `mode`, `sightUp` / `sightDown`, `zeroUp/Down/Left/Right`, `checkMag`, `checkChamber`, `inspect`,
  `barrel`, `breakBelt`, `gl` (M203 toggle), `law` (extend, then arm), `lawCollapse`, `slot1`..`slot4`.
  The range's key map (README) is a good default.
- **Env** (the world): `groundY(x, z)`, `surface(x, z)` (`'grass'|'dirt'|'rock'|'sand'|'mud'|'wood'|'metal'|'concrete'|'water'|'brush'`),
  `waterDepth(x, z)`, `move(pos, dx, dz, radius, height) -> { x, z, blockedX, blockedZ }` (colliders),
  `restAt(x, y, z, yaw) -> bool` (a ledge under the handguard: weapon rest), `headroom(x, y, z)` (optional),
  `raycast(x0, y0, z0, x1, y1, z1, P) -> null | { t, x, y, z, nx, ny, nz, material, thickness (mm), target, body }`
  where `body = { target, part, armour }` comes from `raycastHitboxes` on a soldier model (skip `P.owner`),
  `atmos` (ballistics `atmosphere({ T, p, rh, wind: [x, y, z] })`), `listener: { x, y, z, id }`, `dirt` 0..1, `g`.
  The game world uses g = 9.0 for its jets; pass `env.g = 9.81` for people and bullets (real scale).
- **Events** (`R.events`, rebuilt every step): `shot` (muzzle, dir, weapon, round, tracer) -> sound, flash, brass;
  `impact` (point, normal, material, result `stop|pen|ricochet|detonate|dud`, target) -> puffs, holes, sound;
  `hit` (`hit` = hit info, `target`) -> MEDINV; `explode` (`info` = explosionInfo) -> blast for everything nearby;
  `crack` (a supersonic round passing the listener, `miss` m) -> audio; `drop` (an item to spawn on the ground:
  speed-reload magazines, broken belts, the empty LAW tube); `body` (soldier events: footstep, stance, land,
  fallInjury, breath, blown, swim); `wpn` (every weapon event: magOut, chargeBack, malf, info, selector...).
- **Projectiles** are plain objects in `R.projectiles` (draw tracers from `px,py,pz` to `x,y,z` when `P.tracer`).
- **AI soldiers** can use `createRifleman` too (the AI writes `input`), or just `createWeapon` + `createProjectile`.

## MEDINV (medical + inventory)

**Inventory contract** (`weapons.js`, reference: `createSimpleInventory`): ammunition is items
`{ id, kind: 'mag'|'belt'|'round'|'barrel', fit, round, rounds, cap, ... }` with `fit` one of `'M16-20'`,
`'M1911-7'`, `'M60-belt'`, `'40mm'`, `'M60-barrel'`. Partly used magazines stay items with their count.
Implement `find(fit, prefer = 'fullest'|'emptiest'|'coolest')`, `remove(item)`, `add(item) -> bool`, `count(fit)`,
`totalKg()`, optional `step(dt)`. `itemMass(item)` gives an item's mass. Make items with `makeItem(fit, rounds)`.
If your `totalKg()` already counts helmet / vest / webbing, create the rifleman with `kitKg: 0`.

**Hit info** (`ballistics.makeHitInfo`, delivered in `hit` events):
`{ kind: 'bullet', round, name, calibre, velocity, dmg (game damage scale, rifle ball ~1, M80 1.4, .45 0.9, x v/mv),
dir: [x,y,z], point: [x,y,z], range, part: 'head'|'neck'|'thorax'|'stomach'|'armL'|'armR'|'legL'|'legR',
armour: [{ material, thickness, item, stopped }], stopped, tracer, ownerId, side, time }`.
Explosions (`explode` events): `{ kind: 'explosion', round, point, radius, radiusMax, armourDamage, dud, ownerId, side }`.
Terminal effects are a game table (cover power vs material); decide wounds in MEDINV.

**Medical modifiers** (pass as `mods` to `R.step`, all optional, 0..1): `pain` (tremor; `morphine` dulls it),
`legL` / `legR` (> 0.6 = fractured: no running, limp at 0.9 m/s), `armL` / `armR` (sway, slower hands and aiming),
`bloodLoss` (less VO2max, slower, more sway), `shock`, `tremor`, `adrenaline`, `unconscious` (no input).
The soldier reports `fallInjury { v, severity }` (falls over ~1.8 m) in `body` events.

## RUNAWAY ground / AI squads: the shared skeleton

`soldiermodel.js`: `createSkeleton()` gives named bone groups (`pelvis, spine, chest, neck, head, upperArmL/R,
forearmL/R, handL/R, thighL/R, shinL/R, footL/R`, root at the feet, facing -z). Hang your own meshes on the bones
(machine soldiers), then `poseSkeleton(sk, pose, dt)` with `soldier.pose()` or `makePose({ stance, speed, gait,
gaitPhase, ads, aimPitch, ... })`, and `raycastHitboxes(sk, ...)` for hits (same part names, `sk.kit` says which
armour covers what). `buildMarine({ camo: 'erdl'|'og107', seed, weapon, pack })` is the 1980 Marine on that skeleton
(17 meshes + weapon, one draw call each). Paratroopers and the CH-46 squad can use it as is.
