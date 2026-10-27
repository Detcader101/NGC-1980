# Unit benchmarks and identity audit

The completed [HTML devlog](../devlogs/2026-10-26-units/devlog.html) documents all **48 verified cases**, **198 passing
unit assertions**, 65 screenshots and nine clips. The verified collection combines 47 final-sweep cases with one
successful parachute rerun on identical game content. [Validation](VALIDATION.md) and the
[machine-readable summary](evidence/units-2026-10-26/verified-summary.json) preserve both earlier failed attempts.

The active roster has individually selectable fixtures in `tools/unit-cases/`. Each case describes its setup,
checks a unit-specific behavior, samples actual rendered frames, then captures a screenshot. Optional short clips
run after sampling. The suite includes civilian vehicles, captured modern hardware, landing-craft variants,
mounted defence variants and both factions' structures. The Marine paratrooper is a deployment case using the
existing Marine model, rather than an additional ground unit type.

```sh
node tools/unit-benchmark.mjs --list
CHROME_PATH=/path/to/chrome node tools/unit-benchmark.mjs --unit m35,reaper --frames 30 --clips m35,reaper --out tools/runs/units
CHROME_PATH=/path/to/chrome node tools/unit-benchmark.mjs --category ground --out tools/runs/ground
```

No selector runs the whole catalog serially. Default samples contain 120 rendered intervals after 30 warmup frames;
30-interval runs are smoke evidence. `--capture` records every selected case; `--clips ID,ID` selects recordings.
`suite.json` retains the complete catalog, selection, per-unit results and failures. Each unit subdirectory is an
ordinary `result.json` / `benchmark.json` input for `tools/devlog.mjs`.

Use `--baseline SUITE_DIR` for a comparison. Each fixture, seed, sample policy, browser, viewport and renderer must
match; changed imported case code invalidates a comparison. Missing baselines are explicit. Source changes during
the suite fail it. A failed unit does not prevent the remaining units from producing evidence.

## Coverage

| Category | Units and variants | Principal checks |
|---|---|---|
| Aircraft | UH-1H, F/A-18A, F-14A, CH-46E, KC-130R, MV-22B, RW-3 WASP, RW-4 SHRIKE, MQ-9, SHAHED-style drone | Engine independence and shutdown, rotor/wing roles, transport loading/delivery, live patrol, stopped propellers |
| Deployment | Marine paratrooper / repair team | Scripted emergency release, visible canopy descent and dry-pad landing |
| Ground | M151A2, M35A2, Land Rover Series III, Hilux, Beetle, Lada, M60A3, M113A2, Marine, RW-1, RW-7, M1A2, T-90M | Vehicle-specific driving, tracks/tyres, stance and movement, hover/walker behavior, track-drive detail transitions |
| Naval | ALBATROSS, KRAKEN, LEVIATHAN, container ship, SKY CARRIER, armour LCM-8, truck LCM-8, seized LCAC | Production hulls, moving decks, deck/roof surfaces, ramps/cargo and active refits |
| Defence | M163 VADS, ZSU-23-4, Phalanx Block 0, Sea Sparrow, Pantsir/TALON, RW-5 LANCE, mounted TALON and LANCE | Distinct models and abstract state feedback; visible launcher-cell progression |
| Structures | Human HQ, fuel farm, depot and radar; RUNAWAY command node, siphon, fabricator and sensor spire | Visible damage/wreckage, rebuilding and ownership changes; pristine-site rendering cost |

`tools/unitcatalogbench.mjs` guards selectable fleet, wheeled-vehicle and defence registry coverage. New active roles
need an explicit case and a coverage entry. The per-unit Node programs supplement the existing envelope and mission
regressions; they do not replace them. Run `npm --prefix tools test` separately from rendered benchmarks.

Ambient traffic uses the same civilian vehicle families. Parked low-detail scenery vehicles, deck workers, wildlife,
generic target cubes, historical placeholder aircraft and cave turrets are not independent roster entries in this
suite. Their existing world, cave and sea-life regressions remain separate. Future roster additions in unmerged
branches are not represented as completed units.

The subsequent sea-life follow-up adds `tools/scenes/underwater.mjs` for natural first-person visibility and
`tools/scenes/fish-species.mjs` for the 12-species production-model gallery. Run either through `tools/benchmark.mjs`.
These remain separate from the active-unit catalog. [Swimming/species evidence](../devlogs/2026-10-26-swimming/devlog.html)
distinguishes naturally swimming fish from fixed inspection animations.

## What authenticity means in this pass

The fixes align visible models, names and feedback with their represented roles: the CH-46E variant, the M35's dual
rear tyres, stopped pusher propellers, physical ship deck heights and readable defence launcher cells. Captured tank
detail transitions preserve reverse motion. Screenshot review also exposed cropped parachutes and a prone Marine
whose knee passed through the ground: the gameplay camera now frames the canopy, and the prone pose keeps the
legs connected above the surface. The transport delivery fixture now snaps its camera after fast-forwarding.
These are concrete fidelity improvements within the existing game.

The installed DCS UH-1H manual was consulted for controls and instrument-feedback conventions. No DCS assets or
code are used. The game retains its own original procedural models and gameplay systems. Aircraft variant caveats,
sources and individual checks are in [air findings](findings/unit-air.md), [ground findings](findings/unit-ground.md)
and [naval/defence findings](findings/unit-naval.md).

The KC-130R still uses the existing C-130H performance proxy. The older Hornet envelope tests contain C reference
figures while the player aircraft is identified as an A. Fictional RUNAWAY designs have role checks, not real-world
specification certification. Weapons remain game abstractions. Carrier proportions, mission pacing, battle balance,
full collision coverage and deeper systems remain separate ambitions.

## Interpreting the evidence

Most cases use small dev worlds with production models and simulations; Huey, Hornet and paratroopers use the main
game. Scripted positioning and deterministic fast-forwarding are disclosed in each case. Some samples include a
small squad, drone swarm or transport load because those are the unit's actual role. Their frame costs cannot be
compared as if every scene had identical complexity. Preview CPU phases without instrumentation are unavailable.

Screenshots show specific moments; clips cover only their recorded interval. Software-rendered samples qualify
collection and controlled-scene behavior, not a busy war's hardware FPS. This pass does not independently qualify
VR controllers, tracking, hand input or Quest comfort. See [VALIDATION](VALIDATION.md) for the actual completed runs,
failures and visual observations, and [PLAN](PLAN.md) for remaining work.
