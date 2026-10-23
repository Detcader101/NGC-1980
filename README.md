# NGC-1980

**1980.** Machines from the runaway star NGC-1980 have made a one-way jump back in time to Earth, bringing their own
war machines and modern weapons from our future. A joint Cold War task force is sent to stop them.

A browser game in Three.js (formerly *Thrust Zarch: The Island War*) that grew out of *Zarch*, *Thrust*, *Raid on
Bungeling Bay* and *Carrier Command*. Design bible: [docs/ngc1980/BIBLE.md](docs/ngc1980/BIBLE.md).
You fly a simulated helicopter from the deck of your carrier, the ALBATROSS, across a sea of 17 islands.
The enemy carrier KRAKEN is out there doing the same, and whoever controls the map wins.

![The KRAKEN and the enemy battleship](docs/screenshot.png)

## What's in it

- **Endless world.** The 17 islands are the CONTROL ZONE, where the war happens. Past it the world goes on for ever: open sea, then continents with coasts, forests and mountain ranges over a kilometre high, all perfectly flyable, just without objectives.
- **Archipelago and fog of war.** You only see what your helicopter, carrier, drones and islands can see. Radar islands see further.
- **Capture islands.** Silence the owner's AA guns, then land on the pad or send a drone. Fortress islands hide a cave: fly down the shaft, Thrust-style, and steal the pod. Every cave is procedurally generated (the same island always has the same cave), and the heavier the fortress, the deeper and more twisted its cave and the more turrets guard it.
- **Economy.** Islands produce fuel and materiel. Spend materiel on capture drones, AA guns, spare helicopters and escort fighters.
- **An enemy commander.** It sends transports to take islands, fortifies, raids your carrier, ships supplies by freighter, and builds a battleship in its factories that hunts the ALBATROSS. Bomb the factories to slow it down.
- **HORNET carrier jet.** Land on the ALBATROSS and press 5: an F/A-18-style fighter on the catapult. Full 6-DOF flight model with a Hornet-like flight computer, a 3D cockpit with a conformal HUD and working displays, catapult launches, arrested landings, gun, AIM-9s and CCIP bombs, ejection. Built for a T.Flight HOTAS 4 and rudder pedals with toe brakes (any stick, pad or keyboard works).
- **Para-drop repair team.** Downed on land? Press L and home base sends a steel dropship from over the horizon. You fly it in from the flight deck with a real fixed-wing flight model (or let the autopilot), line up the jump run against the wind, jump on the green light, then steer the canopies down; whoever lands on dry ground runs over with fuel and fixes the helicopter. Enemy flak can bring the dropship down.
- **SKY CARRIER.** Spend 300 materiel (6 on the map) and the ALBATROSS is refitted with four ducted lift fans and takes to the air. Land on her and press Tab to stand on the bridge: wheel, speed telegraph and lift lever, all slow and heavy. Send her anywhere from the map and she flies over the islands; flak can bring her down.
- **UH-1H Huey.** A Bell UH-1H with a validated flight model (teetering two-blade rotor with the Bell stabilizer bar, translational lift, ground effect, vortex ring state, retreating blade stall, a T53 engine with governor and freewheel so autorotations work), a full 3D cockpit with live instruments and the real caution panel, an authentic (optional) start sequence, the two-blade "wop wop", and a damage model where hits cause failures you can survive and repair. Built for a T.Flight HOTAS 4 + T-Rudder pedals: stick = cyclic, throttle lever = collective, pedals (or twist) = anti-torque; keyboard works too with the stability assist.
- **Armour: M60A3 TTS and M113A2** (on their test ground for now, `dev/tank.html`; they join the war in the next wave). A tracked-vehicle simulation with torsion-bar roadwheels, track-soil shear and sinkage on road, grass, sand, mud and bog, a real drivetrain (diesel, torque converter, cross-drive with pivot turns / controlled differential), steps, trenches, slopes, fording, and the M113 swims on its tracks. The tank has a stabilised turret, laser rangefinder and ballistic computer, day and thermal (TTS) sights, a loader, coax and .50; both have full crew interiors (driver's periscopes and gauges, gunner's station, commander's cupola, the M113's troop compartment) and synthesised engine, track and gun sound.
- **Effects that build up.** Smoke columns, fires, scorch marks, debris and oil slicks stay on the map.

Win by sinking the KRAKEN or taking IRONHOLD. You lose if the ALBATROSS sinks or you run out of helicopters.

## Run it

It's static files with no build step. Serve the `game/` folder and open it in a browser:

```
node tools/serve.mjs          # http://127.0.0.1:8765/
```

Any static server works (for example `npx serve game`). On Windows, `game/start.bat` does the same and opens the browser.

**Desktop launchers (Windows + WSL).** `bash launcher/install.sh` (run in WSL) puts two icons on the Windows desktop:
**Thrust Zarch** runs this checkout (`main`, port 8765) and **Thrust Zarch EXPERIMENTAL** runs the `experimental`
worktree next to it (port 8766, the icon with the orange EXP band). Each click starts that build's server inside WSL
(or reuses it) and opens the browser, so both builds can run side by side. Set up the experimental worktree once with
`git worktree add --track -b experimental ../thrust-zarch-experimental origin/experimental`, and `git pull` there to
update it. The launcher lives in `%LOCALAPPDATA%\ThrustZarch` (log: `launcher.log`).

## Controls

| Key | Action |
|---|---|
| Space / Shift, Ctrl / Z | collective up / down |
| W A S D or arrows | cyclic |
| Q / E | pedals (anti-torque; the Huey needs some left pedal in the hover) |
| F / G / B | gun / rockets / bombs |
| R | winch (pick up the pod in a cave) |
| M | command map: click the sea to sail the carrier, click an island to select it |
| 1-5 | send drone, build AA gun, spare helicopter, escort fighter, SKY CARRIER refit |
| Tab | take / leave the SKY CARRIER helm (landed on her deck) |
| V / C | cockpit view / chase camera |
| H | stability assist on/off (on: the cyclic holds attitude, pedals hold heading; default for keyboard) |
| J | controls panel: bind and calibrate HOTAS / pedals (throttle lever = collective, pedals or twist = anti-torque) |
| I | engine: cut the fuel (autorotate) / with the engine stopped, the one-key start |
| PgUp / PgDn, Home | throttle twist grip (idle detent ... full open), starter (hold to 40% N1) |
| U / N / O / L | hydraulic control, landing light, fire extinguisher, call logistics (on the ground) |
| Esc / P | menu: resume, call logistics, respawn on the carrier if stuck, cockpit FOV slider, quit |

The Huey spawns hot at flight idle and rolls the throttle on by itself. With `?cold` it starts cold and dark: BAT and MAIN FUEL on, throttle to the idle detent (PgUp), hold the starter (Home) to 40% N1 (light-off at ~12%), let it reach idle (~70% N1), then throttle full open to 6600 rpm. The cockpit switches (battery, generator, inverter, main fuel, governor AUTO/EMER, hydraulic control, force trim, low rpm audio, starter, master caution) are clickable. To autorotate: collective down to keep 324 rpm, 70 kt, flare at ~100 ft, cushion with the collective.

### HORNET (jet)

| Key | Action |
|---|---|
| 5 | on the ALBATROSS deck: a Hornet on the catapult (throttle to MIL or afterburner and the cat fires) |
| W S A D / arrows, Q E | stick, rudder |
| Shift / Space, Ctrl / Z | throttle (above 80% is MIL, above 84% afterburner) |
| G / L / H / O | gear / flaps (AUTO, HALF, FULL) / hook / speed brake |
| . | wheel brakes (toe brakes on the pedals) |
| F / X / mouse, R, B | gun, A/A missiles (press again to fire), A/G bombs with CCIP (press again to drop) |
| , / I / U / N | master arm / engines / canopy / lights |
| hold Backspace | eject |
| V, mouse wheel, hat | cockpit or chase view, zoom, look around |
| J | controls panel: live view of every axis and button, bind and calibrate HOTAS / pedals |
| Y | stopped on the deck: back to the helicopter |

Cockpit switches are clickable (gear and hook handles, flaps, master arm, FCS CAS/DIRECT, engine cranks, fire lights, master caution, jettison, eject, DDI pages). To land: gear down, flaps FULL, hook down, fly the ICLS needles at 8° AoA (the green/amber/red indexer) into the wires.

The in-game help screen has the full list.

## Tests

`tools/` has a headless test harness: Puppeteer drives the game in software WebGL and takes screenshots. See [tools/README.md](tools/README.md).

```
cd tools && npm install && node snap.mjs scenes/war.json
node tools/jetbench.mjs             # the jet's flight model against published F/A-18C figures, in plain node
node tools/hueybench.mjs            # the Huey's flight model against published UH-1H data (Heffley, Talbot, DCS / TM charts)
```

Jet scenes: `jet.mjs` (launch, climb, turn), `jettrap.mjs` (arrested landing), `jetweapons.mjs` (AIM-9, gun, CCIP), `jetsystems.mjs` (damage, fire, DIRECT, G-LOC, ejection), `jetterrain.mjs` (TERRAIN and PULL UP at a mountain).
`node tools/cavebench.mjs` checks the cave generator without a browser: it prints every island's cave as an ASCII map and
sweeps hundreds of seeds per tier, checking that each cave is connected, wide enough to fly and has its pad, tanks and
pod on solid floors. `scenes/caves.mjs` flies into every cave and screenshots it.
Huey scenes: `hueystart.json` (cold start), `hueyhover.json` (hover trim, forward flight), `hueyauto.json` (practice autorotation with power recovery), `hueycockpit.mjs`, `hueymodel.mjs` (screenshots).
`node tools/tankbench.mjs` checks the M60A3 and M113A2 against published figures (speed, acceleration, gradient, side
slope, step, trench, fording, swimming, turning, turret rates, stabiliser), every number tagged with its source.
Armour scenes: `tankmodel.mjs` (exterior; `VEH=m113` for the APC), `tankinterior.mjs` (crew stations, sight pictures),
`tankdrive.mjs` (the obstacle lanes, a first-round hit at 1000 m), `tankm113.mjs` (ramp, troops, swimming),
`tankaudio.mjs` (the synthesised sound, rendered offline).

**Armour test ground** (`game/dev/tank.html`, `?veh=m113` for the APC): W/S accelerator / brake, A/D steer, Z X C V
range R N L H (M113: R N 1-2 1-3), P park brake, I engine; Tab cycles the views (chase, driver, gunner, commander,
free); arrows or mouse lay the gun, Space fires, F coax, T lase, G dump, 1 2 3 SABOT HEAT HEP, B stabiliser, O day /
thermal sight, [ ] TTS 3x / 8x, U white / black hot, E (gunner) look up from the sight, K searchlight, M or Space in
the cupola fires the .50, H hatches; M113: R ramp, Y trim vane, J bilge pumps.

## Credits

Built by Jason with Claude (Anthropic) as an AI pair-programmer. Uses [three.js](https://threejs.org) (MIT), vendored in `game/vendor/`.
