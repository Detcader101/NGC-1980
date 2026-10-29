# NGC-1980 blueprint audit: every real-world model in game/js

Branch `ngc/look-units`, 2026-10-29. The user (Jay Jay): "make sure you have an agent blueprint skill every unit". Every
real-world unit gets the milsim-blueprint treatment (`~/.claude/skills/milsim-blueprint/SKILL.md`): one real airframe or
vehicle at one date, open-access dimensioned drawings sorted by licence, a cited dimension table, a three-view trace,
a loft, a fit (IoU >= 0.97, max gap ~1 % per view), a dated-photo side-by-side, then detail by station.

Build method key: **box** = primitives and hand-placed points (BoxGeometry / Cylinder / slab outlines at eyeballed
coordinates); **dims** = overall dimensions from a TM or Jane's but the shape eyeballed inside them; **drawn** = traced
from a drawing and fitted. Nothing below is "drawn" yet except the units other agents own.

Source key: **PD** public domain (US government work), **CC** Creative Commons, **(c)** copyrighted (measure only),
**-** not found yet. "Found" means located and licence-checked; "candidate" means the document is known to contain the
figure but is not downloaded yet (fetched when that unit is rebuilt).

## Owned by other agents (not touched here)

| Unit | File(s) | Owner |
|---|---|---|
| UH-1H Huey | `hueymodel.js`, `hueycockpit.js`, `heli.js` | ngc/look-huey (TM 55-1520-210-10, fitted 98 %) |
| F-14A Tomcat | `units/air/tomcat*.js`, `ships.js buildTomcat` | ngc/look-tomcat (NASA TP-2769 / TM-83250, NATOPS 1972) |
| SR-71 | (new) | ngc/look-sr71 |
| People, figures, deck crew, pilots in seats | `units/infantry/*fig*`, `soldiermodel.js`, `deckcrew.js`, `marinefigure.js` | ngc/look-people |
| Buildings, bases, landing hard, hangars | `world/*`, `interiors/*`, `units/armor/lcm8.js buildHardMesh` | ngc/look-buildings, ngc/look-airbases |

## Real-world units in scope (rebuild order)

| # | Unit (pin) | File(s) | Current build | Sources | Licence | Priority |
|---|---|---|---|---|---|---|
| 1 | **F/A-18A Hornet**, FSD #3 BuNo 160777 (NATC Patuxent River, USS America trials Oct-Nov 1979), gull grey over white | `jetmodel.js` (exterior), `jetcockpit.js` (cockpit) | box: 17 hand-typed rings; nose-to-main-gear 9.2 m against the real 11.1 m; cockpit a box grid | **found**: NASA DFRC three-view (Commons, 2865 px, clean line art); NASA F-18 HARV three-view (3030 px); NATOPS A1-F18AC-NFM-000 (2008) para 1.1.2 dimensions and fig. FO-1 front cockpit F/A-18A ("aircraft thru 161528" panels); USN 1977 drawing; dated photos (YF-18A 160777 on USS America 1979, YTF-18A at Pax 1981) | PD (NASA, USN) | **1 (player jet)** |
| 2 | **CH-46E Sea Knight**, a 1980 HMM squadron airframe | `units/air/rotary/ch46model.js`, `ch46cockpit.js` | box: rounded-rect rings at eyeballed stations | Commons 3-view line drawing (574 px, PD, low-res); candidate: NATOPS NAVAIR 01-250HDC-1 dimensions figure, TM 55-1520-? (H-46 is Navy-only: NAVAIR) ; NASA Ames tandem-rotor reports | PD / candidate | 2 (player-flyable transport) |
| 3 | **KC-130R / C-130H Hercules**, VMGR-152 1980 | `units/air/c130model.js`, `c130cockpit.js` (public API C130M, createC130Sim, buildC130Deck must stay) | box/loft hybrid at Jane's dimensions | Commons: C-130A (late) 3-view line drawing (1797x2566, US military, PD); C-130 3-view (PD); candidate: T.O. 1C-130H-1 / NAVAIR 01-75GAL-1 sec. I general arrangement; NASA C-130 test reports | PD | 3 (air bases will spawn it) |
| 4 | **M60A3 TTS**, 1980 US Army (USAREUR, MERDC) | `units/armor/tankmodel.js`, `tankinterior.js` | dims (TM 9-2350-253-10 overall) + boxes | candidate: TM 9-2350-253-10 fig. 1-x (not online yet found); DTIC reports with M60 drawings; Commons dated photos (Reforger 82 left side, 3AD 1980s) | PD (TM) | 4 |
| 5 | **M113A2**, 1980 US Army / USMC | `units/armor/m113model.js`; also the hull of `defence/models.js buildVADS` (M163) | dims + boxes | candidate: TM 9-2300-257-10 (M113A2 family) general data figure; FM 23-? ; Commons photos | PD | 5 (also fixes the M163 VADS hull) |
| 6 | **M151A2 MUTT** | `units/wheeled/m151model.js`, `cabin.js`, `interior.js` | dims (TM 9-2320-218-10) + boxes | **found**: Commons "M151A2 drawing 1/2/3" and "under clean" (US Army TACOM line art, 2010-2664 px, PD) | PD | 6 |
| 7 | **M35A2** 2 1/2-ton 6x6 | `units/wheeled/m35model.js` | dims (TM 9-2320-209-10) + boxes | candidate: TM 9-2320-209-10 fig. 1-1 (archive.org scans exist), TM 9-2320-361-10 | PD | 7 |
| 8 | **LCM-8 Mod 1** (steel) | `units/armor/lcm8.js` (armour delivery) and `units/wheeled/lcm8model.js` (truck delivery): **two models of one craft**, unify | dims (Jane's 1980-81) + boxes | candidate: NAVSEA / Army TM 55-1905-220-14 (LCM-8) general arrangement; FM 55-50 | PD | 8 |
| 9 | **ALBATROSS** carrier (Midway / Forrestal style at the game's 0.44 hull scale) | `units/naval/albatross.js`, `interiors/shipgeo.js` | loft rings, scaled | fictional class at game scale: proportions from CV-41 Midway booklet of general plans (PD, NAVSEA), but the 0.44 scale is a gameplay decision; the island, sponsons and mounts can be authentic at full size | PD | 9 (ships) |
| 10 | Phalanx Mk 15 CIWS (Block 0, 1980) | `units/naval/mounts.js buildPhalanx`, `defence/models.js buildCIWS` (two models) | box | candidate: NAVSEA OP / Raytheon fact sheet drawings; Commons photos | PD / (c) | 10 |
| 11 | NATO Sea Sparrow Mk 29 launcher | `mounts.js buildSeaSparrow`, `defence/models.js buildSparrow` (two models) | box | candidate: NAVSEA SW Mk 29 GMLS drawings, Commons photos | PD | 10 |
| 12 | M163 VADS (Vulcan on M113) | `defence/models.js buildVADS` | box on M113 dims | TM 9-2350-300-10 (Texas Tech Vietnam archive has a copy), shares #5's hull | PD | 11 |
| 13 | ZSU-23-4 Shilka | `defence/models.js buildShilka` | box | US Army FM 100-2-3 / TC recognition drawings (PD) | PD | 12 |
| 14 | M16A1, M16A1+M203, M60 MG, M72A2 LAW, M1911A1 | `units/infantry/weaponmodels.js` (viewmodel + third person) | dims + extrusions | candidate: TM 9-1005-249-10 (M16A1), TM 9-1005-224-10 (M60), FM 23-25 (LAW), TM 9-1005-211-12 (M1911A1): all have dimensioned side views | PD | 13 (first-person: high visibility) |
| 15 | M67 / M18 grenades | `units/infantry/grenademodel.js` | lathe | FM 3-23.30 / TM 9-1330-200-12 figures | PD | 14 |
| 16 | M2HB, M85, M240 / M73 vehicle guns | in `tankmodel.js`, `m113model.js`, `vehicleguns.js`, `m35model.js` | boxes | TM 9-1005-213-10 (M2HB) | PD | with each vehicle |
| 17 | Heavy-drop rigging (Type V platform, G-11A) | `units/air/airlift/heavydropmodel.js` | box | FM 10-500-2 / TM 10-1670-? rigging figures | PD | 15 |
| 18 | Mk-82, AIM-9L/H, (on the Hornet) | `jetmodel.js` stores | cylinders | NAVAIR 11-? / NASA store drawings; done with the Hornet as simple lofts | PD | with #1 |
| 19 | 1980 civilian cars: Land Rover Series III 109, Toyota Hilux RN37, VW Beetle 1200, Lada 2101 | `units/wheeled/civmodel.js` | dims + boxes / loft rings | manufacturer brochures and workshop manuals are **(c)**: measure only; Commons photos (CC) | (c) / CC | 16 |

## Real types in a fictional role (RUNAWAY side): lower priority

The machines' side uses modern hardware brought back through the jump (BIBLE). They are real types, so the same
method applies when they come up, but they are not 1980 equipment and the player mostly sees them at a distance.

| Unit | File | Current | Note |
|---|---|---|---|
| MV-22B Osprey (seized) | `units/air/rotary/mv22model.js` | rounded-rect rings | NASA / NAVAIR V-22 drawings exist (PD); RUNAWAY refit on top |
| LCAC (seized) | `units/groundwar/lcacmodel.js` | box | NAVSEA LCAC drawings (PD) |
| M1A2 SEPv3 and T-90M (seized) | `units/runaway/mbtmodel.js` | box | TM / recognition drawings (PD for the M1) |
| MQ-9 "REAPER", Shahed-136 | `units/air/rwmodel.js` | box | USAF fact sheets (PD); Shahed from open photos |
| Yara Birkeland class feeder | `units/naval/containership.js` | loft | builder's GA is (c) |
| Ford-class style KRAKEN | `units/naval/kraken.js` | rings | game-scale fictional |

## Fictional, out of scope

RW-4 SHRIKE (`rwmodel.js`), RW-3 WASP (`waspmodel.js`), RUNAWAY walker / STRIDER (`units/runaway/stridermodel.js`),
the hover tank (`hovertankmodel.js`), the sky carrier, RW-9 LEVIATHAN (`leviathan.js`), TALON and LANCE
(`defence/models.js`), the RUNAWAY point-defence laser (`mounts.js`), the FOUNDATION placeholder box car
(`units/placeholder/boxcarmodel.js`, superseded by the M151A2).

## Findings from the audit

- **The Hornet's proportions are the worst of the player aircraft:** nose tip to main wheels 9.2 m against the real
  11.1 m, wheelbase 5.2 m (real 5.51 m on the NASA drawing, 5.42 m Jane's), and the cockpit 0.9 m too far aft relative
  to the gear. Fixing the airframe moves the cockpit in the jet frame, so the cockpit is shifted as a block (see
  findings/look-units.md).
- **Duplicated models of one real item:** LCM-8 (two files), Phalanx (two), Sea Sparrow (two), M113 hull (M113A2 and the
  M163). Each pair should become one blueprint-built model with two call sites.
- **The ALBATROSS is deliberately 0.44 scale;** the blueprint method can still make its island, mounts, catapults and
  deck edge authentic at full size; the hull scale is a design decision for the user, not a modelling error.
- Order kept as briefed (Hornet, CH-46, C-130, M60A3, M113A2, M151A2, M35A2, LCM-8, then ships and weapons). One change
  worth considering: the M16A1 / M60 viewmodels are seen closer and longer than any vehicle; they could move up after
  the M60A3.
