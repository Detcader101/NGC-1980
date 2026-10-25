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

## 2026-10-25 - A 2D overlay canvas beats instanced sprites here
**Finding**: the markers need screen-space decluttering (merge / stack), a guard round the sight, a panel line in the
cockpits and faint drawing under HUD text - all screen-space rules. A 2D canvas drawn after the 3D render from a
pre-rendered icon atlas does that with one context and no per-unit DOM, and works whatever renders the frame (the
M60A3's TTS sight draws the frame itself; the Marine's arms are a second pass).
**Evidence**: scene healthbars.mjs, the ~300-unit shot: 225 ground-sim soldiers + 51 war units + ~55 structures ->
116 markers after squad aggregation, 18 drawn, 10 merged; the layer's whole cost (collect + project + declutter +
draw) median 0.4 ms, worst 2.3 ms per frame in headless SwiftShader (a real GPU's 2D canvas is faster). Node:
collectUnits 0.19 ms per call (73 markers, a 900 s CPU war).
**Cost of the choice**: markers are not hidden by terrain or buildings (no depth test). Fog of war and the scene fog
still apply (markers fade where the scene fog hides the unit, then stop at 1.8 x the draw distance).

## 2026-10-25 - The cockpits hide the ground ahead: a fixed panel line per view
**Finding**: in level flight the Hornet's horizon sits below the glare shield's top edge (screen y 0.49 at 1280 x 720,
default FOV), the Huey's coaming is at 0.56, so a marker on a unit ahead and below is drawn on the instrument panel.
The panel is fixed in the camera frame, so a fraction of the screen height per view is enough: Huey 0.57, jets 0.50,
dropship 0.62, wheeled vehicles 0.72. The M60A3 / M113A2 crew stations see the world through small vision blocks and
sights, so a marker would float on the hull roof: no markers in the tanks' first person (the chase view has them).
**Evidence**: 06-huey-cockpit, 16-hornet-cockpit (run 2026-10-25_15-41-07: the marker sat on the DDI at y 455 with the
first guess 0.66), 13-m60 (struct marker on the driver's hatch roof).
**Action**: MARKER_PANEL in main.js markerView; markerFP 'armour' hides the layer.

## 2026-10-25 - The scene fog is 250 m round the islands
**Finding**: view.draw is 250 m in the control zone (600 outside, 1100-2600 in a jet). A first cut that let markers
reach the per-role range (520-2300 m) drew a cloud of markers over plain white fog from a camera 140 m up
(run 2026-10-25_15-46-27, 15-many-units).
**Action**: markers fade from 0.7 x draw distance and stop at 1.8 x (faint "radar" knowledge, like the ship tags the
game already draws to 520 m), times the per-role range.

## 2026-10-25 - Your own marker sits beside your craft
**Finding**: in the chase views the player's craft is at the screen centre, so a marker above it covers exactly what
the player looks at (the battle ahead; 02-battle-chase run 15-41-07). Moved under the craft, it went off the bottom
of the screen in the foot / M60A3 chase views (the craft sits low in the frame; run 15-53-17, 12 and 14). Also: the
avatar Z.pos is the Huey's / the jets' position, not the soldier's or a vehicle's (a stale marker sat where the Huey
had landed) - those use the craft's own frame().
**Action**: the own-craft marker is drawn beside the craft (right of it, by its projected size), only in the outside
views; its health is the same adapter on the craft's damage model (Huey damage.js, the jets', the Marine's medical,
the armour's components, the wheeled state).
**Gotcha**: a sed that appended a `// comment` to a line swallowed the statements after it on that line (the same
trap as the minimap fix in a recent main commit) - check the diff after scripted edits.

## 2026-10-25 - OPEN: units with no marker
**Finding**: the Hueys / wingmen the commander's AI flies after you switch units, parked crafts, and the LCAC landing
craft (no health) have no marker; the sim's strategic plot has no bars. None of these are war units with health.
**Action**: open. A module can add them with `(war.markerExtra ||= []).push(() => list)` (units with p or x / y / z, side, hp).
