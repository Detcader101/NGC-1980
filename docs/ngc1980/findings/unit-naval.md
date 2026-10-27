# Naval and air-defence unit pass

The scope is a playable fictional sandbox with recognizable unit roles. ALBATROSS, KRAKEN, SKY CARRIER, LEVIATHAN and LANCE remain fictional. The carriers keep their intentional game compression, while aircraft and landing craft use approximately metre-scale geometry. No DCS assets or code were used.

## Changes

- The autonomous feeder's standing surface used to sit 1.8 m above the visible bridge roof. Roof dimensions now drive both the mesh and collision surface. Its raised forecastle now supports a walker at the visible deck height, and the old invisible roof ledge beyond the roof edge is gone.
- The armour-delivery LCM-8's pilothouse was visible but absent from its standing-surface function. Its roof now supports a walker; the cargo well and ramp behavior remain intact.
- Sea Sparrow and TALON formerly restored all tube covers after every salvo cooldown. As a result, the eight-cell Sparrow only used its first pair visually and TALON only its first tube. Covers now remain open across salvos, progress through the complete bank, and replenish when the empty bank's existing cooldown finishes. Cadence, damage, guidance and acquisition parameters are unchanged. Replenishment is still an abstract game mechanic.
- Labels now say **PHALANX CIWS (Block 0)**, **ZSU-23-4 SHILKA**, and **PANTSIR-S1 / RW TALON**. The pedestal TALON remains explicitly fictional: it is a seized land module refit, not a claim to model Pantsir-M.
- The ship inspection host now applies the same defence refits as the live war. It previously displayed the decorative placeholder mounts even though gameplay replaced them. It also previews the deployed SKY CARRIER fans, both existing LCM-8 prefabs carrying their actual M60A3/M35 models, and the seized LCAC carrying its actual M1A2 model.
- Both dev hosts expose `__BENCH` with the real renderer and live/paused state. CPU timing is absent on these hosts; the sampler must report it as unavailable. The landing-craft and SKY scenes explicitly identify themselves as model articulation previews.

## Coverage

Each case runs role assertions before a real rendered-frame sample, screenshot and optional six-second clip. Eight vessel cases live in `tools/unit-cases/naval.mjs`; eight defence cases live in `tools/unit-cases/defence.mjs`.

| Case | Role checked |
| --- | --- |
| `naval-albatross` | Sea motion; mixed 1980 deck fit; elevator collision follows its moving platform; blast deflector raises |
| `naval-kraken` | Broad bow and aft island; nuclear/no exhaust presentation; active RUNAWAY deck fit |
| `naval-leviathan` | Three independent fictional recoil cradles recover; sea motion; mixed deck defence |
| `naval-container` | Visible roof/forecastle match downward mesh raycasts; no invisible roof ledge; cargo stacks; electric/no exhaust presentation |
| `naval-sky` | Four separate outboard fans deploy and rotate |
| `naval-lcm8-armor` | Actual M60 model fits the well; ramp moves down/forward; visible pilothouse roof supports a walker |
| `naval-lcm8-truck` | Existing simpler LCM prefab carries the actual M35 model; bow gate opens toward shore |
| `naval-lcac` | Actual M1A2 cargo fits; two air propellers animate; bow ramp reaches ground ahead |
| `defence-vads` | Gun spin-up; range-only pod is not misrepresented as a spinning search dish |
| `defence-shilka` | Four muzzle positions and separate searching radar |
| `defence-ciws` | Named Block 0 Phalanx and rotary gun feedback |
| `defence-sparrow` | Eight-cell launcher; covers progress beyond the first pair |
| `defence-talon` | Four gun barrels, search radar and twelve-tube bank on the seized truck |
| `defence-talonm` | Distinct pedestal model retains the fictional refit's gun/missile presentation |
| `defence-lance` | Visible charge line, beam and hot cooling radiators |
| `defence-lancem` | Same visible role cycle with the existing naval gameplay tune |

The root catalog covers the island structures. Decorative civilian craft and wildlife are separate world systems rather than entries in this combat-unit registry.

## Validation

Run from the repository root:

```sh
node tools/navalunitsbench.mjs
node tools/defenceunitsbench.mjs
node tools/navalbench.mjs
```

The new Node checks use the game's pinned THREE build and actual models, not copied shape constants. The decal canvas is stubbed because geometry tests do not render textures. `navalunitsbench` passes 16 checks, including mesh raycasts, moving collision surfaces, refits, both LCM models, LCAC and qualitative sea motion. `defenceunitsbench` passes every one of the eight active defence types; it also runs each launcher through its entire visible bank and replenishment, checks the charge/cooldown sequence, and verifies terrain breaks tracking. Its pseudo-random phases are seeded.

Browser captures and rendered timings are produced by the root unit-suite run after integration. They must be read from its report; the Node tests are not FPS measurements. There has been no physical VR-headset test in this unit pass.

## Source checks and fidelity limits

Only role, era, layout and visual identity were taken from these public primary sources. Weapon performance remains game-tuned.

- [U.S. Navy: Mk 15 Phalanx](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2167831/mk-15-phalanx-close-in-weapon-system-ciws/linkId/mk-15-phalanx-close-in-weapon-system-ciws/) identifies Block 0 as the 1980 introduction aboard USS Coral Sea. This supports the explicit period label; later Block 1B identification would be wrong for ALBATROSS's starting fit.
- [U.S. Marine Corps: Amphibious Ships and Landing Craft Data Book, MCRP 3-31B](https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/MCRP%203-31B%20Amphibious%20Ships%20and%20Landing%20Craft%20Data%20Book.pdf?ver=2015-02-27-140347-137) supplies the LCM Mark 8 dimensions, cargo well, tank/cargo role and four/five-person crew. [MCRP 2-10.3, April 2024](https://www.marines.mil/Portals/1/Publications/MCRP%202-10.3%20%28SECURED%29.pdf?ver=O2JQ0UBPo4WzRt211X8RTQ%3D%3D) gives the steel variant's light/loaded speed distinction. Exact engine power was not needed and an unsourced comment was removed.
- [U.S. Army ODIN: Pantsir-S1](https://odin.t2com.army.mil/WEG/Asset/96K6_Pantsir-S1_%28SA-22_Greyhound%29_Russian_Short-Range_Air_Defense_Gun%3A%3AMissile_System) distinguishes its paired gun assemblies and two six-tube banks, and distinguishes the naval Pantsir-M variant. The existing TALON geometry already conveys the seized land system; the name now makes that clear. The RUNAWAY machine pods and naval conversion are fiction.
- [Yara: Yara Birkeland press kit](https://www.yara.com/news-and-media/media-library/press-kits/yara-birkeland-press-kit/) supports the approximately 80 by 15 m electric autonomous-feeder inspiration. The hull name, machine modifications and particular stowage arrangement in the game are invented.
- [U.S. Navy: LCAC](https://www.navy.mil/Resources/Fact-Files/Display-FactFiles/Article/2170004/no/landing-craft-air-cushion-lcac/) confirms the cargo/MBT role, twin shrouded air propellers and 1980s introduction. Its presence here is the RUNAWAY's seized later hardware. The model's hull/skirt dimensions and ramp extension are simplified rather than survey-grade replicas.

The vessel fixtures do not prove beach pathfinding, a complete supply voyage, carrier recovery or SKY CARRIER flight control. The two LCM prefabs remain distinct detail levels with different ramp conventions, matching their existing delivery integrations. Their previews test those real prefabs honestly; unifying them would require a separate delivery-physics pass. Defence previews use a durable parked practice drone so feedback and successive covers remain visible. The complete war, locomotion, VR controls and physical GPU/headset performance require their corresponding integration runs.
