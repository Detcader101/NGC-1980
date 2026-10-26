# NGC-1980 — design bible

Every agent working on NGC-1980 reads this first. It is the shared contract: setting, factions, the unit roster, the
quality bar, and how to work without breaking each other's work.

**Status, 2026-10-26:** the current finish line is the playable sandbox described in [PLAN.md](PLAN.md).
The control zone is now 2.56 km across, with varied island geology, blended world LOD, visible aerial shoals and
direct research controls. This bible retains the wider design ambition. Integrated does not mean every quality-bar item is complete;
see [VALIDATION.md](VALIDATION.md) for evidence and limits, and PLAN for deferred branches.

## 1. Setting

**NGC-1980.** Far in the future, a machine civilisation (the **RUNAWAY**, after the runaway star they fled from in the
NGC 1980 cluster below Orion's belt) makes a one-way jump back in time to Earth, **summer 1980**. They come ashore in a
remote archipelago (the game's 17 islands) to build a foothold. They bring:
- their own **futuristic** machines (sleek, asymmetric, matte ceramic and dark composite, pale cyan/white emissive
  seams, no pilots, no windows, sensor clusters instead of cockpits, hover / walker / ducted-fan locomotion), and
- **modern** human hardware from our near future (2015-2035) that they seized before the jump and crewed with
  machines: drones, a supercarrier, Ospreys, MBTs, loitering munitions. Modern units look like the real thing, but
  weathered and refitted: RUNAWAY sensor pods bolted on, cyan IFF strips, crude machine stencils over old markings.

Against them, **1980 Cold War** forces: a joint NATO-led task force around the carrier ALBATROSS, with a Soviet
contingent in an uneasy truce (so both Western and Eastern 1980 hardware can appear on the player's side). The player
side is **analog**: steam gauges, paper maps, grease pencils, olive drab, haze grey, white-on-black stencils, stained
and used. The world is **lived in**: crews, clutter, wear, fishing villages, roads and traffic, smoke from chimneys.

Tone: grounded and realistic, not campy. The machines are uncanny and precise; the humans are improvising.

### Sides in code
- side 1 = player = **TASK FORCE ALBATROSS** (Cold War 1980)
- side 2 = enemy = **RUNAWAY** (futuristic + modern brought back)
- side 0 = neutral / civilian (new: civilians, fishing boats, traffic)

## 2. Roster

Status: INTEGRATED = present in the playable sandbox, subject to the limits in PLAN; PLANNED = a remaining ambition.
Real designations are used for real hardware; RUNAWAY units get `RW-` designations and short names.

### Player (1980)
| Role | Unit | Status | Notes |
|---|---|---|---|
| Carrier | ALBATROSS, 1980 conventional carrier (Midway/Forrestal style), haze grey | INTEGRATED | deck crew in coloured jerseys, tractors, parked aircraft, Phalanx (1980 fit), Sea Sparrow, SPS-48/49 radars, wear |
| Utility helicopter | UH-1H Huey | INTEGRATED (quality reference) | |
| Strike fighter | F/A-18A Hornet (full-scale development jets, 1980) | INTEGRATED (quality reference) | |
| Fleet fighter | F-14A Tomcat (AI escorts and player craft) | INTEGRATED | AI flies a real flight model, not steering |
| Transport / capture | CH-46 Sea Knight with a Marine squad (replaces the MANTA capture drone) | INTEGRATED | lands the squad, who take the pad |
| Para-drop | KC-130R Hercules (C-130H flight-model baseline) | INTEGRATED | 4 x T56, flight deck, para doors, flyable |
| AA gun | M163 VADS (Vulcan) on our islands; Soviet ZSU-23-4 Shilka from the contingent | INTEGRATED | game-level tracking, readable cues and fire control |
| Paratroopers | 1980 US Army/Marines: M1 steel helmet, OG-107 / ERDL woodland, ALICE gear, MC1-1 steerable round canopies | INTEGRATED | |
| Infantry (player-controlled) | Marine rifleman 1980: M16A1, M60, M203, M72 LAW, M1911, ALICE | INTEGRATED | inventory, medical, weapons; further depth remains an ambition |
| Light vehicle | M151A2 MUTT jeep | INTEGRATED | drivable, full dynamics |
| Truck | M35A2 "deuce and a half" | INTEGRATED | drivable, cargo, troop transport |
| APC | M113A2 | INTEGRATED | tracked, drivable |
| Tank | M60A3 TTS (plus Soviet T-72A from the contingent later) | INTEGRATED | crew stations, fire control, armour model |
| Bases / structures | HQ bunker, fuel farm, depot (was factory), radar site, AA site, pads | INTEGRATED | quonset huts, sandbags, antennas, generators, floodlights, vehicles parked |

### Enemy (RUNAWAY + modern brought back)
| Role | Unit | Era | Status |
|---|---|---|---|
| Carrier | KRAKEN: a seized 2030s nuclear supercarrier with RUNAWAY refit | modern + RW | INTEGRATED |
| Capital ship | RW-9 LEVIATHAN railgun monitor (was the battleship) | futuristic | INTEGRATED |
| Supply ship | autonomous container ship (modern, unmanned) | modern | INTEGRATED |
| Troop transport | MV-22B Osprey with machine troops (was the twin-rotor transport) | modern | INTEGRATED |
| Attack drones | RW-3 WASP hover drone (was the saucer gunship); MQ-9 Reaper; Shahed-style loitering munitions | RW + modern | INTEGRATED |
| Air defence | Pantsir-S1 (seized); RW-5 lance laser turret | modern + RW | INTEGRATED |
| Infantry | RW-1 STRIDER walker (bipedal machine soldier); modern-equipped machine squads | RW | INTEGRATED |
| Armour | RW-7 hover tank; seized M1A2 SEPv3 / T-90M | RW + modern | INTEGRATED |
| Structures | fabricator (was factory), sensor spire (radar), power pylon, fortress (cave), IRONHOLD HQ | RW | INTEGRATED |

### Neutral / civilian (lived-in world)
Fishing villages and harbours, trawlers and dinghies, dirt and tarmac roads with 1980 civilian cars and trucks, farms,
power lines, lighthouses, a radio mast, church, people going about their day (and fleeing fighting).

## 3. The quality bar (the Hornet and Huey standard)

A unit is done when it matches the HORNET (`jetfm.js`, `jetcockpit.js`, `jetplay.js`, `jetmodel.js`) and the UH-1H
(`hueyfm.js`, `hueycockpit.js`, `hueymodel.js`):
1. **Pure simulation core**: plain JS, no THREE, no DOM, no game imports; runs in node. Real physics at the right
   level (rigid body / drivetrain / tyre or track / aero / ballistics), real numbers.
2. **A node bench** (`tools/<unit>bench.mjs`) checking the sim against **published data**, every number tagged
   CONFIRMED / INFERRED / UNVERIFIED with its source in a comment (manuals, FM / TM field manuals, Jane's, NASA /
   DTIC reports, manufacturer data). Example: M60A3 top speed 48 km/h, M16A1 M193 muzzle velocity 991 m/s.
3. **Exterior model** at real dimensions, low-poly but detailed and believable (the house style: flat-shaded,
   Lambert, no textures, colours from materials, small details as geometry), with wear and markings, LOD-cheap.
4. **Interior / first person** where a player can sit or stand: working gauges, sights, switches, moving controls.
5. **Systems**: engine start, fuel, electrics, damage by component, failure states you can survive or repair.
6. **Sound** via WebAudio in `audio.js` style (synthesised; no samples required).
7. **Tests**: the node bench, a `game/dev/<unit>.html` preview page (orbit / drive / fly the unit alone; see
   `game/dev/jet-preview.html`), and headless scenes in `tools/scenes/` that you run and whose screenshots you look
   at. Screenshot evidence, not just pass counts.
8. **Docs**: a MODLOG.md section (what, sources, numbers vs published, gotchas, untested) and README lines.

**Weapons stay at game level**: widely known headline figures only (muzzle velocity, rate of fire, magazine size), game-tuned damage and armour tables, missiles as projectiles with a capped turn rate. No guidance or seeker laws, no kill-probability or penetration research. Deep real-world weapons modelling trips auto mode's safety check and stops the agent; the depth belongs in vehicle and flight dynamics, systems, models, interiors, AI behaviour and sound.

Performance: the game must stay playable on a mid-range GPU. Instanced meshes for crowds, merged geometry per unit,
no per-frame allocations in hot loops, `?res=` respected.

## 4. How to work (agents)

- **Branch**: start with `git switch -c ngc/<feature> experimental` in your worktree (the integration branch is
  `experimental`). Commit there in steps. The integration owner advances `experimental` after review and tests
  within the user's authorized scope. Keep the classic `main` separate. Push only when the user requests it.
- **Commit identity**: use the contributor's configured identity (this workspace uses Jason,
  `8167600+gnutgnut@users.noreply.github.com`). Any co-author attribution must name an actual contributor;
  the historical Claude/Opus attribution is not a template for other tools.
- **Own your files.** Put new work in new files (`game/js/units/<group>/<unit>*.js`, `game/dev/<unit>.html`,
  `tools/<unit>bench.mjs`, `tools/scenes/<unit>*.mjs`). Touch shared files (`main.js`, `war.js`, `ships.js`,
  `audio.js`, `world.js`, `index.html`) only where your brief allows, with small, clearly commented hooks, so merges
  stay easy. `main.js` belongs to the FOUNDATION agent in wave 1.
- **Keep interfaces**: if you replace a model in `ships.js`, keep the export name, return type and the dimensions or
  `userData` that `war.js` relies on (read the callers first).
- **Tests**: headless Chrome under WSL: from `tools/`, `CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs
  scenes/<scene>`. A scene `query` can open a dev page (`"query": "dev/tank.html?debug"`). Create the symlink
  `tools/node_modules -> /home/jayjay/thrust-zarch/tools/node_modules` in your worktree first (do not commit it).
  Many agents share the machine (15 GB RAM): run one browser at a time, prefer node benches, use `res=0.45`.
- **Don't break the game**: before you finish, run `scenes/smoke.json` plus the scenes for the units you touched.
- **Report**: what you built, branch and commits, test results with run folders, screenshots worth looking at, the
  shared-file lines you touched, what's untested, and what the next step for your feature should be.
