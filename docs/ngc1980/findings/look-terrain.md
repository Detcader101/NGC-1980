# ngc/look-terrain: land instead of sea-hill blobs, a 5 km control zone, textured ground (LOOK-PLAN workstream C)

Branch `ngc/look-terrain`: WIP a06f1f1 (generated ground layers, splat, outcrops) on 36eb21b, then `ngc/shader-library`
f8abdbb merged in (24071fd; MODLOG kept both sides, `RK_AREAS` typed with `'terrain'` added).

User, 2026-10-28: **"make sure to also have a pass at the terrain again, I want it more like land with more varied
terrain and a bigger control zone."**

## 2026-10-29 - Design (written before the code)

### What was there
- `BOUND = 1280`: a 2.56 km square control zone. Inside it 17 round islands (`ISLANDS`), each its own radial
  height model (`world/terrain.js` `islandHeight`: a plateau, 1-3 peaks, coves / cliffs / rocky shore by angle), baked
  on a 1.25 m grid over +-1400 m (2241^2 cells, 20 MB per thread, 1.7 s per thread: main, terrain worker, world
  worker). From the air it reads as 17 blobs of sea-hills of one design, 300-500 m across, in an empty sea.
- Outside the zone (`world.js` `wildH`): open sea for 0.4-2.4 km, then fixed-seed continents and ridged-noise ranges
  to 1.7 km. That part already reads as land and stays.

### The new zone: BOUND 2560 (5.12 km square, 4x the area)
One constant (`world.js BOUND`). Everything that scales with it is derived from it or listed here:

| What | Old | New | Note |
|---|---|---|---|
| zone ground grid (`terrain.js`) | 1.25 m over +-1400 (2241^2) | 2.5 m over +-2720 (2177^2) | same memory (19 MB), same as the render lattice (TG 2.5) |
| core heightmap `hmTex` (main.js) | 1025^2 f32, 4 MB | 2049^2 f32, 16.8 MB | filled from the zone grid, `terrainH` only where pads / roads / hards change it |
| surface texture `surfTex` | 1025^2 RGBA, 4 MB | 2049^2 RGBA, 16.8 MB | |
| decor texture | 640^2 | 1280^2 RGBA, 6.5 MB | pad / shaft / region index |
| fog of war | 224^2 (11.4 m cells) | 448^2 (same cell) | per-update cost per source unchanged |
| minimap land image | 320^2 | 512^2 | |
| sea nav grid (A*) | 20 m cells, 128^2 | 40 m cells, 128^2 | same search size; carrier and LEVIATHAN are 250-330 m |
| sim/zone.js table (headless war) | 0.5 m over +-1540 (152 MB) | 1.0 m over +-2820 (127 MB) | |
| zone trees (colliders) | 3200 random at 2.5-24 m | woods and hedgerows on the new land, ~4x | |

### The land: "the Kessel coast" (fixed seed, same every run)
A real-looking piece of coast in the 5 km square, built from a hand-laid plan plus noise:
- **One large main island** (about 4 x 3.5 km) filling the centre and north of the zone, with an irregular coastline:
  a deep southern bay (THE SOUND) between a south-west lobe and a southern barrier spit, smaller bays and
  headlands everywhere else (two scales of domain-warped noise on the shoreline).
- **HOME ISLAND** (about 1.8 x 1 km) off the south-west, across a 300-600 m strait from the main island: the Marines'
  island base, the carrier off its south coast. PELICAN (fuel) at its east end.
- **SOUTH REEF**: a low limestone island in the south-east, with KILN on a second small island / headland to its north.
- Islets and sea stacks off the cliffs.
- **Relief, varied by region** (not one sine): a **mountain spine** across the north (ridged noise, peaks 300-380 m,
  spurs and side valleys), a **limestone plateau** in the east at ~110 m ending in a 60-80 m **escarpment** on its
  west and south side, **rolling farmland** in the south-central lowlands (5-40 m, long gentle swells), **granite
  hills** in the west (60-160 m), low dunes and marsh on the barrier spit.
- **Rivers**: two valleys from the spine (one south through the farmland to an estuary in THE SOUND, one west to the
  coast), carved as valleys with a floor graded to the sea and an estuary channel below sea level at the mouth
  (the sea shader fills it); mud / marsh surface along the stream.
- **Coasts by what meets the sea**: cliffs where high ground reaches the coast (the north under the spine, the west
  granite, the plateau's east side), beaches where the lowlands do (THE SOUND, the farmland coast, HOME ISLAND's south
  and east, SOUTH REEF), rocky shore elsewhere. Sea floor: beach shoreface ~1 in 15, shelf to -14, deeper (-30) offshore.
- **Sites as places on the land**: every ISLANDS entry keeps its name, kind, owner and tier, moved onto the new map at
  roughly twice its old position (so the two sides still start ~4 km apart: HOME south-west, IRONHOLD north-east, on
  a north-east bay with water for its shipyard and the enemy fleet). Each site sits in its own flat basin (town
  ground) at a designed height: low (4-16 m) for the cave bases, up on the plateau / hills for some radars and
  factories (pad heights may go above the old 14 m cap). `I.r` stays the war's radius for buildings and guns.
- **Seamless at BOUND**: the zone's outer ~250 m is open sea that blends into `wildH` (which is open sea there too),
  so heights, the sea bed and the far-land texture agree across the line; `rawH` switches to `wildH` past the grid.

### Gameplay checks the land must pass
- both fleet starts and IRONHOLD's shipyard on navigable deep water; the carrier can reach every coastal site;
- a landing hard (LCM-8) on every coastal site; inland sites (CITADEL, WELLSPRING, CINDER) are reached by air / road;
- the zone net: a village by every big site, roads from the pads, harbour quays, **and roads joining the sites
  across the main island** (new: the zone had no roads between places before, because there was sea between them);
- trees, scrub and clutter on the new land (woods on slopes and valley sides, hedgerow trees in the farmland);
- per-point surfaces (`zoneSurf`) now drive the ground host too (it fell back to "rock above 30 m", which would be
  most of the new land).

### Cost targets
Load: the zone bake <= the old 1.7 s per thread (coarse 10 m plan fields + a 2.5 m fine pass); the main thread's core
heightmap filled from the grid, not 4.2 M `terrainH` calls. Frame: the terrain draw is the same mesh (TN x TN at 2.5 m
round the camera), so the bigger zone costs memory, not triangles.

## 2026-10-29 - The land, built (2446f03, 42f2e7b)
**What changed**
- `world/bound.js`: `BOUND = 2560`, the single source; `world.js` re-exports it (it and `world/terrain.js` import
  each other, so the constant lives in its own module).
- `world/terrain.js` rewritten (API kept: `zoneH`, `zoneSurf(Id)`, `SURF_NAMES`, `SURFACE`, `GEOLOGY`, `geologyOf`,
  `zoneGrid`, `beaches`, `shoreAt`, `islandInfo`, `bakeMs`; new: `planAt`, `SITE_H`, `ZONE_E` = BOUND + 160). The plan
  (signed distance to the coast from 13 land shapes and 3 bays with two scales of domain warp, regional relief with
  soft-max blending, 3 rivers, 17 site basins, beach / cliff weights) is baked on a 10 m grid (545^2); the fine
  pass (coast profiles, sea bed, hummocks, broken rock, sea stacks) and the surfaces on the 2.5 m grid (2177^2).
  Bake 1.95 s per thread in node (old: 1.7 s); 19 MB heights + 4.7 MB surfaces (old: 20 + 5 MB).
- `world.js`: the 17 sites moved onto the land (names, kinds, owners, tiers and radii kept); `fleetStart` is two
  fixed open-water spots (south of HOME ISLAND, north of IRON BAY's mouth); `ridged` exported; `rawH` switches to
  `wildH` at the grid edge (the grid's outer ring already blends into `wildH`, sea on both sides: no seam);
  `createNav` cell scales with BOUND (40 m, 128^2 as before; 55 ms to build in node).
- **Hook for ngc/look-airbases** (orchestrator, 2026-10-29): BOUND stays the single source (`world/bound.js`, re-exported by world.js) and `wildH` keeps its structure; after the merge of ngc/shader-library the air base flattens through its own `AIRBASE.H` in `rawH` (outside the zone grid), so the interim `FLATS` list I had added was removed.
- Pads may now sit up to 140 m (radars and the plateau factory: LOOKOUT 59, SPIRE 65, BEACON 97, CINDER 109 m);
  cave bases stay 4-16 m (all designed at 6-15). `main.js` and `sim/zone.js` agree (simmode.json checks it).
- `world/net.js`: link roads between the sites on the same land (relaxed relative-neighbourhood graph, routed by the
  existing DP with a new `avoid` cost round bases and pad aprons; dropped when the path is wet for > 130 m); villages
  allowed up to 18 m above the site's pad; `bedBuckets()` for the heightmap fill.
- `main.js`: the core heightmap is copied from the zone grid (same 2.5 m lattice, aligned) and `terrainH` is called
  only in road / platform buckets, pads, bases with their cave strips and the hards (4.2 M full calls would take
  seconds); fog of war 448^2 (same 11.4 m cells); minimap image 453^2; decor texture's region index = the nearest
  site everywhere (geology colours by region); zone trees 9600 in woods / copses / hedgerows; scrub 12000 to 280 m.
- `ground.js`: inside the zone the ground host's fallback surface is the zone's own per-point surface
  (`SURFACE[name].ground`), not "rock above 30 m" (which would have been most of the new land). `wheeledenv.js`
  maps `dirt` (was falling back to grass).
- `war.js` / `sim/redai.js`: the enemy carrier's retreat point was a fixed (330, -300) - land now; it goes back to its
  own start.
**Gameplay data (node, sim/zone.js)**: every coastal site has a landing hard (12 of 17; LOOKOUT, BEACON, CINDER,
WELLSPRING and SPIRE are inland or on cliffs: reached by air / road); IRONHOLD's shipyard point is 234 m from its
centre on IRON BAY; both fleet starts are on deep water and the carrier has a sea path to water off every site
(135-514 m off, WELLSPRING 1 km inland).

## 2026-10-29 - Every player view, before / after (tools/scenes/lookterrain.mjs)
**Scene**: rewritten so it finds its places from the game's data on either map: foot and feet at the home base, Huey
at 30 m and 200 m, jet at 1200 m and 3000 m, the carrier's deck, a tank sight (2.8 m eye, 10 degree field, 1.3 km
across farmland), a village, a link road, a beach, a cliff from the sea, the river, the spine on foot, the LOD band,
and the in-game big map. Before = 24071fd (the shader-library ground on the old archipelago, `rkterrain` off), after
= this branch at `rk=all`, tier high. Side-by-sides: `docs/ngc1980/evidence/look-terrain/sbs-*.png`.

**Findings and fixes, in the order they showed up**
- *Jet at 3000 m saw only the home island and a few slivers of land.* Two causes. (1) The far land (depth-sky's dome
  raymarch) only had the 8 km height window round the eye, and at 3 km up the draw distance (2.6 km) ends before the
  ground under the jet; the zone 4-5 km away was outside the window. Fix: the dome also gets the zone's own heights at
  16 m (`atmosphere.zoneHeights`, 320^2 half floats from the zone grid), used wherever a ray is over the zone, and the
  ray is not clipped at the window edge while it is still crossing the zone. (2) A ray from above 1600 m starts at
  exactly y = 1600 and the test `y < 1600.` dropped it (from any height above 1600 m, no far land at all). Then the
  low land came out in horizontal slices: the march steps (2-3 % of the distance) jumped over 5-30 m lowland onto the
  sea plane. Fix: the last step lands on t1 (the sea plane); land there means the ray met it in between -> bisect.
- *Huge brown blobs everywhere from the air* (before too): dry-grass patches at full straw colour, bare soil, and the
  zone's dirt rule. Dry grass is now a partial olive sward (base 0.42 0.43 0.23, 65 %), soil patches rarer and half
  strength, zone dirt only small worn patches on slopes; `grassAverage` (the far land's mean) uses the same rule.
- *Grass at the feet read as a neon speckle*: blade colour spread 0.68-1.3 x base over dark gaps. Now 0.82-1.16 over
  lighter thatch, gentler bleached tips.
- *Outcrops were tent-shaped and nearly black*: the sharp noise octave made ridges; the albedo was darkened three times.
  Rounder masses, lighter albedo (x 1.3).
- *Road cuttings with vertical walls* where a link road crosses the escarpment: road shoulders blended over at most
  18 m whatever the height difference. Now up to 45 m (1.1 m per metre of cut: ~42 degrees), wild roads too.
- *Woods*: the 9600 zone trees (colliders, as before) read as savanna; the zone's chunks now stream like the wild ones
  but carry only woods (`forest.js zoneWood`: the same woodland field as the zone trees, none within site radius +
  200 m, so no trees on pads, bases, hards or town ground; roads and villages via `clearedAt`).
- *River*: a 60-80 m mud stripe did not read as a river. The Kessel and the west river are tidal in their lower half
  (bed below sea level: the sea shader fills it, 30-120 m wide), the flood plain stays dry; the upper courses are
  streams in their valleys.

## 2026-10-29 - Cost (SwiftShader, this PC shared with other agents: relative numbers only)
`lookterrain.mjs` frame (full render + 1 px readback, median of 6) and the terrain pass alone, ms:

| view | before: old map, ground layers off | new land, layers off | new land, low | new land, high |
|---|---|---|---|---|
| foot (home base) | 280 / 83 | 226 / 63 | 318 / 172 | 579 / 352 |
| Huey 30 m | 281 / 77 | 234 / 62 | 330 / 162 | 503 / 260 |
| Huey 200 m | 179 / 59 | 173 / 48 | 226 / 100 | 328 / 122 |
| deck | 208 / 71 | 233 / 57 | 270 / 86 | 361 / 126 |

The land itself costs nothing per frame (the terrain mesh is the same 185 k triangles round the camera at any zone
size; the new land is a little cheaper than the old islands' views at layers off). The generated ground layers are
what costs on a CPU rasteriser: high is ~4-5x the classic terrain pass. So `terrainTierName` now picks the low tier
when the WebGL renderer is software (SwiftShader / llvmpipe) and no tier was asked for; a GPU keeps high.
Load (node, per thread): the zone bake 1.7 s (old 1.7-2.0 s), zoneNet 0.2 s (old 0.07 s: the link roads); main.js's
core heightmap is a copy of the zone grid plus `terrainH` in the boxes where roads / pads / bases / hards change it.
Memory: zone grid 19 MB heights + 4.7 MB surfaces per thread (as before); main thread +12.8 MB heightmap texture,
+12.8 MB surface texture, +4.9 MB decor texture (4x area, same cell size), 0.2 MB far-land zone heights.
