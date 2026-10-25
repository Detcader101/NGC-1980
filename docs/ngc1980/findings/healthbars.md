# ngc/healthbars - findings

User request: "allow healthbar icon UI for each unit". Built as game/js/ui/unitmarkers.js (the adapter, pure) and
game/js/ui/markerlayer.js (the on-screen layer), with small hooks in main.js.

## 2026-10-25 - Health lives in seven different shapes; one duck-typed adapter covers them all
**Finding**: no two unit families store health the same way. war.js aircraft / ships / rotary / airwar / strike jets:
`hp` + `hpMax` (counts). Island structures and ship gun mounts: `hp` + `max`. Ground-war soldiers and vehicles
(groundsim): `u.hp` already a 0..1 fraction (Marine: body-part sum / 440; STRIDER: thorax / STRIDER.HP.thorax; RW-7
and MBT: hull fraction). Player crafts: Huey damage.js and the jets' jetdamage / tomcatdamage keep a map of parts 0..1;
the Marine keeps medical.js regions + blood volume; the M60A3 / M113A2 a COMPS list (components 0..1, crew included);
the wheeled vehicles a component state (engine, fuel tank, radiator, tyres...); vehicle.js crafts `sim.hp` 0..100.
**Evidence**: tools/healthbarbench.mjs part 1 builds each of these from the real modules and checks the fraction.
**Action**: `hpOf(x)` in game/js/ui/unitmarkers.js tries the shapes in order (fraction, hp/hpMax, hp/max, medical,
total(), part map, armour COMPS, wheeled state, sim.hp); `roleOf` matches the unit's kind / type / mbtType / id against a
name table (substring match, so `rw12-scarab-tank` -> armour, `mq9reaper` -> drone) and falls back on shape (`dims` ->
ship, `rot` -> heli, `air` -> air, `vehicle` -> vehicle); a unit may also say `markerRole` or `health()`. New units
(ngc/parity) get a marker with no change as long as they are in war.units, the ground sim, an island's structs or a
`war.markerExtra` source.

## 2026-10-25 - war.js's 'drone' is the CH-46 and 'transport' is the MV-22
**Finding**: the war's legacy type names outlived the units: `type: 'drone'` is the CH-46 Sea Knight (it replaced the
capture drone; the feed says SEA KNIGHT DOWN), `type: 'transport'` the MV-22, `type: 'gunship'` the RW-3 WASP.
**Evidence**: rotary.js makes `{ type: 'drone', kind: 'ch46' }`, `{ type: 'transport', kind: 'mv22' }`, `{ type: 'gunship', kind: 'wasp' }`.
**Action**: roleOf reads `kind` before `type` (bench check "kind beats type").

## 2026-10-25 - Ground-war squad proxies would double the Marines
**Finding**: groundwar.js puts a `type: 'squad'` proxy in war.units for every landed group (with `members`, hp = men
alive) while the men themselves live in the ground sim. Marking both draws every squad twice.
**Action**: proxies with `members` are skipped; the ground sim's foot soldiers are grouped by `u.squad` into one marker
at the squad's centre with the squad's aggregate bar (sum of the men's health / the most men the squad has had, so dead
men count as empty). Vehicles (RW-7, MBT) always get their own marker. The legacy rotary squad (no `members`) keeps its own.

## 2026-10-25 - Key choice: F8
**Finding**: every letter key is taken by some craft (and the craft gets first pick of keys), as are the digits,
`[ ] \ / ; ' , . - = \``, Insert / Delete / Home / PageUp / PageDown. F6 is the sky carrier.
**Action**: F8 cycles ALL UNITS -> DAMAGED ONLY -> OFF, handled before the craft routing (so no craft can swallow it),
and the pause menu has UNIT MARKERS (every variant of the menu: Huey, jets, foot / vehicles). Remembered per browser:
`tz_markers` (play, default DAMAGED ONLY) and `tz_markers_sim` (?sim, default ALL UNITS); `?markers=all|damaged|off`
overrides for tests.
