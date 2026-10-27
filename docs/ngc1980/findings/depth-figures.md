# depth-figures — people, first-person hands, weapons (RenderKit area `figures`)

Branch `ngc/depth-figures` (from `ngc/shader-library` 4a47cbb). The user's report: first person at the home HQ, the hands
on the M16A1 were "stacks of tan boxes, Roblox blocks", people everywhere blocky ("drag it away from this roblox low
tech look ... in every aspect"). Everything here is gated on `RK.on('figures')` (new entry in `renderkit/adopt.js`
`RK_AREAS`); `?rk=0` (or `?rk=surface,world,fx,post,ui`) gives the exact previous build. Evidence images in
`docs/ngc1980/evidence/depth-figures/`, `-off` = `?rk=0`, `-on` = default (all areas on).

## 2026-10-27 - One cause for the "Roblox" look: every figure was flat-shaded boxes
**Finding**: hands, sleeves, Marines, deck crew, aircrew and townsfolk were all axis boxes (plus a few 6-8 sided
cylinders / spheres) merged into one geometry with `computeVertexNormals()` on non-indexed triangles, i.e. one normal per
face, and `flatShading: true` materials on top. Even the cylinders and spheres that exist shade as facets.
**Evidence**: `units/infantry/meshkit.js` Kit.geometry(), `air/rotary/figures.js` paint(), `interiors/crewfig.js`
Acc.add(), `naval/navkit.js` (deck crew), `world/kit.js` Geo.build() (townsfolk), `hueymodel.js` merge() (Huey crew).
The first-person fist was 21 boxes (`viewmodel.js` buildHand).
**Action**: the infantry Kit keeps each primitive's own normals (transformed by the normal matrix) when FIG is on: curved
parts shade smooth, boxes and extruded profiles stay crisp. New Kit primitives: `rbox` (rounded box, analytic normals,
c segments per edge, `flat` segments across the faces so camo is not two triangles a face), `capsule` (tapered, the cone
tangent to both caps, optional rings along the body), `ellip`, `rslab` (a band whose plan is a rounded rectangle),
`prism(..., bevel)` (inset so the size is unchanged, crease-smoothed bevels), `vertex` paint (per-vertex colour: soft skin
tones). Helpers `roundedBox`, `capsuleGeo`, `weldNormals` (seams / poles), `creaseNormals`, `roundPoly`. Materials:
`figMat(role)` MeshStandardMaterial roles fabric .93 / skin .58 / steel .5 + metal .22 / plastic .44 (no env map, so
metal stays low); KITMAT gains `skin()` and `plastic()`.

## 2026-10-27 - First-person hands and sleeves (the user's view)
**Finding / Action** (`units/infantry/handkit.js` fpHand, `viewmodel.js` buildHand / buildSegment):
- Each finger is three tapered capsules (proximal 44 mm, middle 27, distal 21, scaled per finger) walked round the grip
  at the right arc length (so the fist closes on a 17 mm pistol grip, a looser 24 mm for the left hand on the
  handguard), a knuckle bump at each MCP joint, a fingernail on each distal phalanx, the thumb in three segments over the
  top of the grip with the thenar pad, a domed back of the hand over a rounded palm slab, the heel of the hand and an
  oval wrist. The right index finger lies forward into the trigger guard (trigger finger) instead of curling round.
- Sleeves: a 24 x 18 open cylinder with fabric folds (bunching rings near the cuff and elbow, two long diagonal creases),
  the cuff standing off the wrist with a rolled hem (no dark hole when you look into it) and a button tab; the GI watch
  is now a round case, crystal, hands and crown on an OD band.
- A second, relaxed / flat hand per side (`fpHand({ open: true })`, same wrist point) for the breaststroke and for
  pressing on a wound: `vm.handShape(side, 'grip' | 'open')`, switched by `bodyvm.js` in 'swim' and 'aid' (the fist seen
  from the palm side in self aid read as claws, `fp-self-aid` in the first game run).
- Same anchors, same wrist point semantics (`g.userData.wrist`), same two-bone IK, so every track keeps working: grip,
  support hand, reloads (tactical / speed), charging, SPORTS, check mag / chamber, M203, M60 cover / belt / barrel
  change, LAW, M1911, swim strokes, ladder, self aid, grenade drill (throwvm/bodyvm only move the hand groups).
**Evidence**: `fp-hip-at-home-{off,on}.png` (the user's exact situation: M16A1 at the hip at the home HQ),
`vm-grip-close-on.png`, `vm-below-on.png`, `fp-swim-on.png`, drills (`tools/runs/df-drills`: check mag, IA, barrel
change, LAW, M1911 inspect all read as hands). 12.7k triangles for both arms (classic 0.9k), 10 draw calls as before.

## 2026-10-27 - The M16A1 rebuilt (same dimensions and anchors)
**Finding / Action** (`weaponmodels.js` m16Fig / m16MagFig): bevelled upper / lower receivers and magwell, bevelled
carry handle with its sight groove, rear sight housing and ears, knurled windage drum; the rounded TRIANGULAR handguards
(point down, tapering forward) with six vent slots each side and a seam; delta ring, handguard cap and the A1 birdcage
as lathes, the birdcage OPEN ALL ROUND (six prongs; the classic model had the A2's closed bottom); the teardrop forward
assist housing; trigger guard as a round bar; pins; front and rear sling swivels; pistol grip and stock bevelled with the
buttplate rounded. Two meshes: anodized / parkerized metal (steel role) and black plastic furniture (plastic role, a
dull sheen) so the two read apart. Charging handle and magazine rounded too.
**Magazine curvature (deliberate)**: the brief asked for a curved magazine, but the 1980 USMC rifleman in this game
carries the straight 20-round magazine (BIBLE / weapons.js: 20 rounds, the pouches hold 20-rd mags); the 30-round curved
one was not general issue yet. Kept straight, given rounded edges, two pressed ribs per side and the floorplate.
**Evidence**: `m16-quarter-{off,on}.png`, `vm-side-r-on.png`; 7.6k triangles at detail high (1.3k classic), 2.0k at
detail low (0.8k), 11 draw calls (+1 for the furniture mesh).

## 2026-10-27 - The 1980 Marine (soldiermodel.js marineFig), crowd LOD, aircrew, deck crew, townsfolk
**Action**:
- Marine: the same 17-bone rig, kit and colours; capsule limbs with rings (per-triangle ERDL needs them, else the camo
  runs in long stripes), rounded trunk / vest with the M1955 rib bands following the vest's rounded plan, a high collar,
  a face (cranium, jaw, brow ridge, eyes with irises, eyebrows, nose, mouth, ears) in a skin material, the M1 helmet with
  a 24-segment Mitchell-covered dome, a flared rim lathe and the band, hands with fingers and thumb (`handkit.tpHand`),
  rounded pouches, canteens with domed tops, boots. Detail 'low' (squads, paratroopers) uses fewer segments and plain
  boxes for straps under 5 cm.
- Crowd LOD (`air/rotary/figures.js`, used for squads beyond 140 m, CH-46 / airdrop crews): same 6 meshes, rounded.
- Seated / standing crews (`interiors/crewfig.js`): pills instead of boxes for limbs and trunk, a face, smooth helmets.
  The Huey's pilots, door gunner and crew chief (`hueymodel.js`) now use it (SPH-4, olive flight suit, armour).
- Deck crew (`naval/deckcrew.js`): same four InstancedMeshes and pivots: float coat with reflective bands, cranial with
  ear cups and goggles, face, capsule sleeves with gloves, dungarees, rounded boots.
- Townsfolk (`world/ambient.js` personGeoFig): same parts / paint flags / sqrt-coded colours for the instanced walk
  shader, rounded jacket, capsule limbs, a head with hair and nose, hands, shoes.
**Evidence**: `marine-face-{off,on}.png`, `tp-front-close-{off,on}.png`, `marine-line-10m-{off,on}.png`,
`marine-line-40m-on.png`, `deck-crew-{off,on}.png`, `huey-crew-{off,on}.png`, `townsfolk-{off,on}.png`.

## 2026-10-27 - Budgets (tools/scenes/depthstats.mjs, triangles / draw calls per object)
| object | classic (`?rk=0`) | figures | note |
| --- | --- | --- | --- |
| Marine, full skeleton, detail low (squads <140 m) | 3.1k / 27 | 9.9k / 29 | +2 skin meshes (head, hands) |
| Marine, detail high (player's own body) | 3.1k | ~13k | one per player |
| crowd LOD figure (>140 m) | 0.5k / 6 | 2.0k / 6 | |
| M16A1 high / low | 1.3k / 0.8k | 7.6k / 2.0k | 11 draws (+1 furniture) |
| first-person arms (both) | 0.9k | 12.7k | own pass, fills the screen |
| seated crew figure (merged) | 0.36k | 2.7k | |
| deck crew per person (4 instanced draws total) | 0.27k | 1.8k | ~30 people on the deck: 55k |
| townsperson (1 instanced draw) | 0.11k | 0.84k | MAXP 180: 150k worst case, tiny on screen |
Draw calls are unchanged except +2 per full Marine and +1 per close weapon. Triangles go up 3-8x; all of it is
vertex work on instanced or merged meshes (no new passes, no textures). On SwiftShader the in-game frame time is
dominated by fill and post (the A/B shots run at the same 1-2 fps); not measured on a hardware GPU / headset.
**OPEN**: if crowds get heavy on a VR GPU, the next step is a mid LOD for the full skeleton between ~25 m and 140 m
(build the 'low' geometry per bone and swap at distance; groundwar.js `GW_T.DRAW.marineFull` picks the level today).

## 2026-10-27 - ?rk=0 is pixel-identical to the build before this branch
**Evidence**: `tools/scenes/depthfig.mjs` (12 viewmodel shots: hip, four orbit views, ADS, three reload frames, M60,
M1911; 13 model-view shots: weapons, stand, face, aim, walk, kneel, hands, lines at 10 / 40 m, seated, swim, self
aid) rendered against a `git archive 4a47cbb` copy served on another port: 25 / 25 PNGs byte-identical with `?rk=0`,
and 25 / 25 identical between the old default (all areas) and `?rk=surface,world,fx,post,ui` now. The figures area
touches nothing else.

## 2026-10-27 - Checks
- `node tools/check.mjs syntax`: 512 / 512; no conflict markers.
- `scenes/xr.mjs` 19 / 19; `scenes/xrgameplay.mjs` 25 / 25 expects (VR on foot through the viewmodel's XR path,
  `vr-marine-on.png`; its one "page error" is the harness noting I edited bodyvm.js during the run).
- `scenes/smoke.json` 5 / 5; renderkit fixture (`tools/runs/depth-figures`) 20 / 20; `scenes/infantrydrills.mjs` 6 / 6;
  `scenes/foot.mjs` 12 / 12; `scenes/marinepolish.mjs` 9 / 9 (kit, self aid, ladder, swim, live grenade).
- Game A/B `scenes/depthgame.mjs` (home pad: hip / aim / reload / look down / third person / squad / casualty / drag /
  carry / self aid / swim / townsfolk) and `depthdeck.mjs` (deck crew, Huey gunner, first person on deck) with `RK=0`
  and `RK=1`; `depthaid.mjs` (open hands on leg / arm / chest wounds). No figure in front of the first-person camera,
  no hand through the weapon in any of them; the viewmodel keeps its own pass.
- Seen but not chased: in VR (`vr-marine-on.png`) the left hand sits near the carry handle rather than on the
  handguard; the XR placement code is unchanged by this branch (only the hand mesh is), not compared against `?rk=0`.

## 2026-10-27 - Open / notes
- **OPEN**: the right thumb in the pistol-grip pose sits up along the left side of the receiver rather than wrapping
  round it (reads fine from the eye, visible in orbit views).
- **OPEN**: the face's jaw ellipsoid meets the cranium in a visible crease (reads as stubble / shadow at 1 m; fine at
  normal distances). A single deformed head mesh would be the proper fix.
- Per-triangle camouflage on smooth surfaces is still faceted colour (ERDL / Mitchell blotches are triangles); limbs got
  rings and the trunks flat segments to keep the blotches small. A texture-free fix would be per-vertex camo with a
  sharper threshold in the shader.
- The M203, M60, LAW and M1911 get the smooth-normal / material upgrade but not a rebuild (only the M16A1 was rebuilt).
- Machine troopers (RUNAWAY, figures.js) keep their faceted ceramic look on purpose.
