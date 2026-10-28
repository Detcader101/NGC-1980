# look-people: realistic people, no more blocks (LOOK-PLAN B, supersedes workstream 8)

Branch `ngc/look-people` (from 36eb21b; the first session's checkpoint is 33dac6a). Everything is gated on
`RK.on('figures')` as before. `?figparts=1` brings back the depth-figures part-built people for A/B shots, and `?rk=0` is
the classic game. Evidence is in `docs/ngc1980/evidence/look-people/`; the scenes are `tools/scenes/lpstudio.mjs`
(faces, roles, seated / kneeling crews), `lookpeople.mjs` (the Marine in every posture), `lpweapons.mjs`,
`lpcrews.mjs` (Tomcat), `lpstats.mjs`, and `depthgame.mjs` (in game). `tools/grid.mjs` makes contact sheets.

## 2026-10-28: One continuous person, built from signed-distance anatomy
**Finding**: the depth-figures people were rounded parts (capsules, rounded boxes) on bones. The seams at the
shoulders, elbows, hips, knees and neck, and the jaw ellipsoid on the cranium, still read as an assembled doll.
**Cause**: a mesh made of parts can't blend at a joint.
**Action**: the people are now signed-distance models (`units/infantry/sdfmesh.js`). Anatomical primitives (tapered
capsules, ellipsoids, rounded boxes, tori, bands) are joined with smooth blends, with carves for the eye openings,
nostrils, mouth line and ear conchae, and with displacement for the cloth folds. The model is meshed once by surface
nets into one welded, indexed surface. The weights for colour, material channels and bone skinning follow the same
blend, so the elbow is a smooth half-and-half and the deltoid is part chest, part arm. `humanfig.js` builds a
1.78 m man on the existing 17-bone rig (bound in an A-pose, with procedural chain weights). `figgeo.js` merges the
surfaces and the small rigid kit into ONE geometry with ONE material: a skinned mesh on the soldier's own bones, so
every animation, hitbox, seat, ladder, swim, drag, carry and aid track keeps working unchanged.
The material (`figMaterial`) computes the ERDL utility camouflage and the Mitchell helmet cover per PIXEL from the
bind-pose position, with antialiased thresholds, so there are no triangle blotches. It also adds a procedural cloth
crease and twill bump, skin pores, roughness and metalness per vertex, and the skin tone as a uniform.

## 2026-10-28: Faces
**Finding** (`lpstudio` bare0 before / after): the first SDF head had round, staring eyes and a pear-shaped, puffy
lower face.
**Cause**: the "room for the eyeball" carve also removed the eyelids. The mandible was 14 cm wide at the angle and the
cheek blobs were too big.
**Action**: the lids are now a shell round the eyeball with an almond opening carved through it, so the lids cover the
top of the iris. The eyeballs have their pole on the gaze, so the iris and pupil are crisp latitude rings and not
vertex-colour stars. The jaw is narrower, with a ramus and body to the chin. The beard shadow, cheek warmth, socket
shade and a high-and-tight haircut are smooth colour masks with no hard thresholds. Three face shapes and four skin
tones are used.
**Still open**: in close-up (0.6 m, flat dev light) the face is a plausible adult male, not a portrait. The brow and
cheek forms are still a little lumpy. In game, under a helmet at 2 m or more, it reads right.

## 2026-10-28: Every role on the same person
**Action**: `OUTFITS` (utility, flight suit sage / OD, deck jersey + dungarees, chambray, khakis, civilian shirt +
jeans) and `HEADGEAR` (M1 + Mitchell cover, SPH-4 with visor housing and boom mic, HGU-33 with the visor down and the
MBU oxygen mask, cranial with ear cups and goggles, white hat, ball cap, garrison cap, CVC). `GARMENTS` covers the M1955
flak vest, the float coat with reflective bands, the SRU-21/P survival vest, and the torso harness + G-suit + LPU.
Jersey, coat and cranial share a role colour (a `paint` channel tinted per person or instance). There is also civilian
hair, and gloves on flight crews and deck crew.
- Seated, standing and kneeling crews: `crewfig.js crewGeometry` now returns `humanfig.crewPerson`, the person posed
  (crewfig's arm presets mapped onto the rig) and CPU-baked, with the skin tone and jersey baked in. This covers the
  Huey pilots / gunner / crew chief, the CH-46 copilot, the Hornet pilot (`seats.js`), the seated Marine with his
  rifle, and the ship's interiors (`crewMesh` merges indexed people with mergeFig).
- The Tomcat's pilot and RIO (`tomcatmodel.js`) were a box and a sphere. They are now `jetPilot` people (named
  'torso', so tomcatplay's visibility rules are unchanged).
- Deck crew (`deckcrew.js`): ONE InstancedMesh for the whole crew, down from four. The limbs swing in the vertex shader
  about the shoulders and hips, blended by per-vertex limb weights (`figinst.js`), so there is no seam at the joints.
  The behaviour code is shared with the classic crew (`crewUpdater`) and is unchanged.
- Townsfolk (`ambient.js`): the same instanced walk, now on the real person ('civil', shirt in the instance colour).
- Crowd LOD for squads beyond 140 m (`figures.js`): cut from the real Marine at 'far' detail, posed at the ready, with
  the same six meshes and pivots, and camouflage per pixel.
- First person (`viewmodel.js`): each hand (grip and open) is ONE blended SDF surface (webbing, knuckles, thenar,
  creases kept between the fingers) in the person's skin material. The sleeves keep their folds but take the ERDL per
  pixel. **The thumb now wraps round the back of the pistol grip, just under the receiver, to the far side**
  (handkit.js). It used to cross over the top of the grip into the receiver.
- The player's own body (`marine.js`) is built at hero detail.

## 2026-10-28: Weapons (from the checkpoint, checked)
M60, M16A1/M203, M72A2 LAW and M1911A1 rebuilt like the M16A1 (`weaponmodels.js` m60Fig / m203Fig / m72Fig /
m1911Fig / itemFig). Evidence: `lpweapons.mjs` (25 shots). Triangles / draws, high / low: M16A1 7.6k / 2.0k (11),
M16A1/M203 10.6k / 4.0k (16), M60 17.4k / 5.5k (24 / 17), M72A2 5.6k / 2.3k (9), M1911A1 5.1k / 1.7k (6).

## Reference dimensions (the user's rule: open references, our own geometry)
Sources are in `docs/ngc1980/reference/people/SOURCES.md`. No files were saved, only URLs and numbers.
| item | reference | model | note |
|---|---|---|---|
| stature (US male 50th) | 1755 mm (ANSUR 1988 era tables) | 1786 mm in boots | ~25 mm soles + helmetless top of head |
| head length / breadth | 200 / 154 mm | 200 / 148 mm (cranium; ears add width) | |
| biacromial breadth | 415 mm | ~420 mm over the deltoids | |
| M1 helmet shell | 11 x 9.25-9.5 x ~7 in (279 x 235-241 x 178 mm) | 280 x 242 mm (under the cover) | **was 304 x 274 mm: resized** |
| M16A1 | 986 mm (38 13/16 in) | 1000 mm bbox (sling swivels) | |
| M60 | 43.5 in (1105 mm), FM 23-67 | 1125 mm bbox (bipod) | |
| M72A2 closed | 0.665-0.67 m (24.8 in) | 673 mm | |
| M1911A1 | 8.593 in (218 mm), FM 23-35 | frame and slide 210 mm | the 259 mm bbox includes loose parts |

## Budgets (triangles per person; build time in node, which is relative only)
| object | depth-figures | look-people | build |
|---|---|---|---|
| Marine hero (player's body, close looks < 7 m) | ~13k | 77k | 1.2 s once |
| Marine near (squads < 26 m) | 9.9k | 24k | 0.37 s |
| Marine mid (26-140 m) | (same 9.9k) | 8.8k | 0.13 s |
| crowd LOD (> 140 m) | 2.0k | 3.9k | 0.06 s |
| seated crew figure | 2.7k | 9-13k (Tomcat 'near' 22.5k) | 0.1-0.3 s |
| deck crew per person (1 instanced draw, was 4) | 1.8k | 3.3k | |
| townsperson (1 instanced draw) | 0.84k | 2.5k | |
| first-person hand (each, grip / open) | ~6k | ~15k | 0.15 s each |
Draw calls: a full Marine is now 1 person draw + the weapon (was 29 part draws), and the deck crew is 1 draw (was 4).
Geometries are cached per combination (lod, face, sleeves, vest, helmet, pack), and LODs switch with THREE.LOD. A
squad of 13 within 26 m costs ~310k vertex-skinned triangles. That is fine on a desktop GPU, and too much for the
Quest. **OPEN**: an XR tier (near -> mid at 10 m) and a mesh decimator (QEM) would cut hero / near by 3-4x at the same
look. Not measured on hardware. SwiftShader runs ~1 fps in game either way.


## 2026-10-28: Shared geometry, per-figure memory and build time (perf-cpu's question)
**Finding**: perf-cpu measured ~10 MB allocated per full Marine on the old part-built path (`meshkit.js` /
`soldiermodel.js marineFig`).
**Evidence**: in node, `buildMarine()` x40 after warming the variant caches (`--expose-gc`, heap and ArrayBuffer deltas):
- **~25 KB and 7 ms per figure without a weapon**
- **~0.33 MB (128 KB heap + 207 KB buffers) and ~5 ms with the M16A1**.
**Cause / design**: `humanfig.js` caches every SDF surface (`body|lod|sleeves|vest|camo`, `head|lod|face|clip`,
`helmet|lod`, `hand|side|shape|cell|glove`) and every merged person geometry (`marineGeometry` /
`personGeometry`, keyed by lod, face, sleeves, vest, helmet, pack, frags, camo and hands). Each soldier is only a
`THREE.LOD` of `SkinnedMesh`es on his own bones, sharing those geometries and a shared material (`figMaterial` keyed by
camo, seed % 8 and skin tone). Crews bake one pose per crew figure (~10k vertices, a few hundred KB, made once per seat
at load). The deck crew and townsfolk are one shared geometry per role, instanced. The crowd LOD is one set of six
geometries.
The first build of each variant does cost something: hero 1.2 s, near 0.37 s, mid 0.13 s, far 0.06 s, a crew pose
0.1-0.3 s. That cost is paid once per session per variant (3 faces x sleeves x camo x pack ...), not per person.
**OPEN**: the weapon model (`buildWeaponModel`, checkpoint code) still builds its geometries per soldier, which is
most of the 0.33 MB. Caching those per weapon and detail (parts move by transform only) is the next saving.
Precomputing the SDF meshes at build time (a binary asset) would remove the first-variant cost.

## 2026-10-28: The underwater benchmark ran out of frames (fixed)
**Finding**: `scenes/underwater.mjs` failed twice with a harness timeout (106 / 119 of 120 rendered intervals in 120 s). It
passes on 36eb21b and with `?figparts=1`.
**Evidence**: a triangle probe of the swimmer's view (frustum-tested, by material). The deck crew drew 131k triangles
(instanced, never culled, crowd detail for all ~40) and the ship's interior crews drew 121k (crew detail, visible
through the hull from outside). Together that is ~150k more than depth-figures.
**Action**: the deck crew now has two instanced levels: crowd detail within 25 m of the camera and far detail (1.8k)
beyond. Each person goes to one or the other on every update (the camera is caught in onBeforeRender). An interior
crew figure is a THREE.LOD (crew detail, then far beyond 12 m; renderOrder passes to its levels). Townsfolk use far
detail (1.3k; 180 max). Underwater now passes 6/6, with 120 intervals, mean 831 ms.

## 2026-10-28: invui duplicate icon key (typecheck agent's report)
**Finding**: `invui.js` defined the `needle` icon twice (lines 35 and 79). The second definition overwrote the first, so
RW NEEDLES (`items.js` r_rwn) showed the 14G catheter icon.
**Action**: line 35 is now `rwneedle`, and r_rwn's icon points at it. The 14G catheter keeps `needle`.

## Checks (2026-10-28, SwiftShader)
| check | look-people | 36eb21b baseline (same machine, `git archive` on :8802) |
|---|---|---|
| `node tools/check.mjs syntax` | 539 / 539, no conflict markers | |
| smoke.json | 5 / 5 (re-run after the LOD changes) | |
| foot.mjs | 8 / 20 | 8 / 21 |
| foot.mjs `?rknature=0` | 8 / 20 | |
| underwater.mjs | 6 / 6 (after the deck / interior / townsfolk LODs; 3 / 3 + timeout before) | 6 / 6 |
| groundwar.mjs | 9 / 10 | 9 / 10 (same failure: the hover tank coming ashore) |
| marinepolish.mjs | 8 / 11 | 8 / 11 (same 3: self-aid completion, BV) |
| infantrydrills.mjs | 6 / 6 | |
| infantry.mjs / infantrymodels.mjs | 3 / 3 / pass | |
| xr.mjs | 19 / 19 | |
| xrgameplay.mjs | 25 / 25 | |
foot.mjs fails the same steps on the baseline: the carrier-moving wait, the ladder off the carrier, the walk to the
pad, and getting into the Huey. These are time-outs under SwiftShader load, not figure regressions. The baseline
expect count is 21 against our 20 because the baseline reaches one more step before its swim wait times out.

## Open (honest list)
- Faces at 0.6 m are believable, not portrait quality: some lumpiness at the brow and cheeks. Needs a sculpt pass
  or a decimated hi-res head.
- Deck crew kneel and the other instanced poses keep the rigid-leg approximation of the classic crew (no knee bend),
  so the kneel reads as a lunge. A knee joint in the limb shader is the fix.
- Budgets are heavy for the Quest (hero 77k, near 24k). Needs an XR tier and a QEM decimator.
- Weapon geometries are still built per soldier (see the memory note).
- The cranial reads as a skullcap at a distance. The SPH-4 and HGU are not yet checked against drawings (only the M1
  shell is resized to its reference).
- The first-person hands are ~15k triangles each.
