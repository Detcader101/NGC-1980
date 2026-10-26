# Aircraft unit audit and focused regressions

2026-10-26, branch `ngc/unit-air`, starting from `2b43929`.

The ten active aircraft already have distinct flight models, silhouettes and roles. This pass fixes concrete
presentation/identity errors and adds short, individually selectable evidence fixtures. It does not replace the
existing envelope, deck-operations, startup or transport-mission suites with a claim of full aircraft fidelity.

## Changes

- **CH-46E Sea Knight:** the player craft messages, craft label and cockpit placard now agree with the E model
  already used by the flight simulation, exterior and AI preview. The simulation specifies T58-GE-16 engines.
  The old F placards described a different variant; no power or handling change was needed. The root integration
  also needs to use E in the command board and current user documentation.
- **MQ-9 Reaper:** zero shaft animation signal now leaves its pusher propeller stationary. Previously the model
  added a permanent 10 rad/s rotation even with a stopped engine. Engine fuel cutoff now reports zero power and
  fuel flow, lets exhaust temperature cool, and loses oil pressure as the shaft signal decays. Cold engines stay
  cold. These gauge decay rates and pressure scales are game presentation, not TPE331 servicing data.
- **SHAHED-style delta drone:** a stopped pusher shows its two solid blades without a motion disc. As it runs,
  the disc appears and the solid blades hide. The previous disc remained visible at zero throttle. No guidance,
  launch, impact or damage rules changed.
- Aircraft flight/rotary/C-130 dev hosts expose the small `__BENCH` renderer bridge. CPU phase timings are absent
  unless the host measures them; missing measurements must be reported as `null`, not invented zeroes.

## Unit coverage

`node tools/unit-air-bench.mjs` runs all ten aircraft, or `--unit=reaper` selects one. `--json=/path/result.json`
writes the assertion results. `tools/unit-cases/air.mjs` supplies the rendered cases to the root unit runner.

| Case | Role regression | Rendered fixture |
| --- | --- | --- |
| `huey` | Collective increases hover lift; engine cutoff separates engine/rotor RPM | Main game, peaceful carrier deck, governed RPM, analog cockpit/exterior |
| `hornet` | Right-stick roll; independent engine throttles | Player selects F/A-18A on the real carrier catapult; cockpit/exterior |
| `tomcat` | Wing sweep takes time; deck oversweep inhibited airborne | Actual AI catapult departure into CAP; live patrol |
| `ch46` | Both tandem rotors lift; aft stick pitches via differential collective | Board 13 Marines, fly transit, deliver through the ramp |
| `c130` | One prop feathers independently; three-engine autopilot remains airborne | KC-130R host, feather number one, cockpit/exterior |
| `mv22` | Wing-borne cruise; cross-shaft keeps both proprotors loaded after one engine fails | Vertical departure, airplane conversion, live transit, troop delivery |
| `wasp` | Stable ducted-fan hover; edgewise drag and lip pitching moment | Five-drone swarm/ambush demo with scripted Huey |
| `shrike` | Fictional single-engine bank response without afterburner | Live patrol with the demo opponent disabled |
| `reaper` | Shutdown power/fuel/gauges; cold engine; stationary/running prop transforms | Live loiter plus stopped pusher close-up and optional start clip |
| `shahed` | Simplified finite forward turn; stopped/running pusher transforms | Isolated four-drone flight sample and stopped pusher close-up |
| `paratrooper` | Reuses the Marine ground unit covered by the ground suite | Scripted emergency release of three Marines, canopy inflation/descent, dry-pad landing |

Every rendered case records its own benchmark sample, PNG and nonblank assertion, plus a six-second clip when
capture is enabled. Additional stills show troop delivery, cockpit gauges or stopped propellers where relevant.
Model/dev hosts and scripted placement are named in each case description. The paratrooper case uses the real
KC-130 emergency bell and canopy update path, but bypasses aircraft approach and jumpmaster/static-line sequencing.
The C-130 flight model remains the existing H-based proxy behind the KC-130R presentation; this pass does not
claim an exact R performance reconstruction. The older Hornet envelope bench uses C reference figures; the
game's F/A-18A identity is retained and the new checks concern controls/engine independence, not C avionics.

## Evidence and validation

- New role regression: **22 passed, 0 failed across ten aircraft**, approximately 0.28 seconds in this checkout.
  The Reaper/SHAHED model transform checks instantiate production geometry with a no-op canvas decal context;
  they do not validate painted textures or WebGL rendering.
- `node --check` passed for the new cases/bench and the three modified dev hosts.
- Browser runs, screenshot review, clip review and render performance results are coordinated by the root agent
  after integration. None are claimed by this branch report before those runs. No before/after performance claim
  is implied by adding instrumentation.
- Existing larger suites remain relevant: `hueybench`, `jetbench`, `tomcatbench`, `tomcatsysbench`, `c130bench`,
  `ch46bench`, `ch46playbench`, `mv22bench`, `waspbench`, `airbench`, `catdeckbench`, `transportbench`, and the
  `drop.json`, `airdrop.mjs`, `ch46fly.mjs` browser scenes.

## References and boundaries

- [USMC aircraft history, 1913–2000](https://www.marines.mil/Portals/1/Publications/Marine%20Corps%20Aircraft_1913-2000%20%20PCN%2019000411600.pdf)
  identifies the CH-46E/T58-GE-16 and KC-130R/T56-A-16 in the 1976 inventory. The branch uses this for variant
  naming, not a new performance tune.
- [NAVAIR, New Iron for the CH-46E](https://www.navair.navy.mil/node/4896) identifies the E model's original
  T58-GE-16 and later -16A improvement. The existing game specifies the original engine family.
- [USAF MQ-9 fact sheet](https://www.25atkw.af.mil/Fact-Sheets/Display/Article/4232320/mq-9-reaper-fact-sheet/)
  identifies the TPE331 turboprop and its 900 shaft horsepower, 20.1 m span and 11 m length. Its approximate
  200-knot cruise figure corrects an inaccurate source comment; gameplay performance is unchanged.
- [US Navy V-22 fact file](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2417719/v-22b-osprey-tilt-rotor-aircraft/v-22b-osprey-tilt-rotor-aircraft/)
  describes the transport's helicopter/airplane roles. The existing game already models nacelle conversion and
  wing lift; the new checks guard those distinctions.
- Local DCS **UH-1H Flight Manual_EN.pdf**, PDF pages 40–41 and 68 (printed 38–39 and 66), was read at
  `/mnt/d/SteamLibrary/steamapps/common/DCSWorld/Mods/aircraft/Uh-1H/Doc/`. Collective, stabilizer-bar,
  anti-torque-pedal and RPM warning descriptions informed the audit of existing Huey controls and feedback.
  No proprietary assets or code were copied. No F/A-18C or C-130J manual was substituted for this roster's variants.

RW-3 and RW-4 are fictional. Reaper, MV-22 and SHAHED-style drones remain intentionally displaced into the
RUNAWAY faction's fictional 1980 setting. Weapon effects and guidance remain the existing game abstractions.
No desktop preview or automated browser run qualifies physical Quest tracking, controller feel or headset comfort.
