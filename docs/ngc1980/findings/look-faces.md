# look-faces: believable faces at close range, a real kneel (branch ngc/look-faces, from ngc/shader-library 9518974)

Bar: Arma Reforger people (LOOK-PLAN "Direction change"). Evidence: `docs/ngc1980/evidence/look-faces/` (before =
ngc/shader-library, after = this branch, same scene and camera). Scenes: `tools/scenes/faces.mjs` (the new face studio,
`game/dev/faces.html`: every face x LOD, the eyes, the M1, every role's headgear, civilians, a 70-degree squad view),
`tools/scenes/kneel.mjs` (kneel from four sides, the aid kneel, stand > crouch > prone > crouch > stand), and the existing
`people.mjs` / `lpstudio.mjs` / `lpcrews.mjs`. Sources: `docs/ngc1980/reference/faces/SOURCES.md`.

## 2026-10-29: Why the faces looked lumpy and uncanny
**Finding** (`faces.mjs` before, `face0-*`, `eyes0-near`): the near-LOD face (what a squad mate at 1-2 m shows) was a
surface-nets mesh at an 11 mm cell, the crew LOD at 14 mm. A lid, a lip line or a nostril is 1-5 mm. Eyes were 21.6 mm
spheres with their apex 4 mm proud of the lids, gloss 0.15, white sclera; the lower face was a pile of blended blobs.
**Causes**: (1) cell size: the features alias into lumps; (2) every smooth union of blend radius k swells the surface by
k/4, and the old head used k = 0.03-0.04 (7-10 mm of swelling) on the cheek, jaw and forehead blobs; (3) the eyeballs
sat too far forward in a socket with no fissure shape; (4) Lambert-lit skin with no wrap reads as plastic.

## 2026-10-29: The head, from measured landmarks
**Action** (`humanfig.js headSdf`, `FACES`):
- A **lofted face**: a new custom-field primitive (`SdfKit.field`, `sdfmesh.js`) whose cross-section at each height is a
  superellipse (half width W, front depth D, squareness p) through landmark knots. Widths and depths come from ANSUR
  1988 (head 197.1 x 151.7, bizygomatic 140.5, n-me 121.9, IPD 64.7) and Farkas' North American norms (n-sn 54.8,
  sn-sto 22.3, en-en 33.3, ex-ex 91.2, al-al 34.9, ch-ch 54.5, ft-ft 115.9, go-go 105.6). The jaw's U, the flat front of the
  face, the chin and the mandible's lower border (rising from menton to gonion) follow the numbers. Table in SOURCES.md.
- Small primitives with small blends on top: the brow, cheekbones, the angle of the jaw, the chin, the nose (radix,
  dorsum, side walls, tip lobule, alae, columella, nostrils under the tip), the upper lip skin and philtral groove, both
  vermilions, a mouth line that follows the dental arch, the modiolus, faint nasolabial and labiomental folds, ears
  (plate, helix rim, lobe, tragus, concha, antihelix, scapha; 61 x 34 mm, set out 25-30 degrees), the neck with the
  sternocleidomastoids, the larynx and the nape.
- **Eyes**: the fissure is cut from the front through a lid shell round the globe, 14.7 mm medial and 13.1 mm lateral of
  the pupil, ~10 mm high, the upper lid over the top of the iris, peaking medially, the lateral corner higher, a lid
  crease. Globe r 11.8 mm with the cornea apex 10 mm behind the glabella. Eyeballs: a matte sclera (rough 0.5, warm grey,
  shaded under the lid and into the corners, widened toward the canthi so it fills the fissure), a caruncle, and a
  cornea cap (rough 0.12) with radial iris fibres, a darker limbal ring and a 3.6 mm pupil. Iris colour per face.
- **Five faces**: 0 young (the means), 1 broad (heavy brow, wide jaw, blue-grey eyes), 2 lean (long nose, hollow cheeks,
  hazel), 3 African-American proportions (al-al 44.1, fuller lips, sn-sto 26.1, en-en 35.8), 4 older (40s: deeper folds,
  heavier lids, jowl, receding temples, grey at the temples, a 1980 moustache). `faceFor(seed, tone)` gives the darkest
  tones face 3 and the medium-dark tone brown-eyed faces; face 4 only for crews that can be older (pilots, officers,
  sailors). Four skin tones as before (a material uniform for marines, baked for crews).
- Hair is **per pixel** now: on skin, the fold channel carries hair density (the high-and-tight's crown, the clipped sides,
  sideburns, brows, the shaved beard's shadow per face, the moustache) and the shader draws follicles / short strands that
  fade out below a pixel. Roughness varies (T-zone 0.44, cheeks 0.56, hair 0.8, a little noise).
- **Skin shading** (`figgeo.js figMaterial`, program key `lp-person-v2`): skin pixels take wrapped diffuse light, wider in
  red (0.42) than green (0.2) and blue (0.13): a soft, warm terminator instead of a hard Lambert edge. Crews keep their skin
  channel now (crewPerson used to zero it after baking the tone; crewMaterial's tone ratio is 1, so nothing doubles).

## 2026-10-29: Fine mesh, then reduce (and bake)
**Action**: `sdfsimplify.js` is a quadric-error simplifier (half-edge collapses: every vertex keeps its own colour,
channels, skin weights and SDF-gradient normal) with a colour / channel penalty so the hairline, brows and lips keep their
triangles, a link-condition and fold-over check. Each face is meshed once at a 2.6 mm cell (~72 k triangles; lids and
nostrils resolve) and reduced: hero 7000, near 4200, crew 2900 triangles (x 0.85 when headgear hides the scalp, which is
cut away first). Mid / crowd / far keep the coarse surface-nets head (cells 20 / 30 / 45 mm) without the small carves, so the
face collapses cleanly with distance.
Meshing a face costs ~1.3-1.7 s in Node, so the five reduced heads are **baked** into `game/js/units/infantry/headbank.js`
(952 KB, `node tools/facebake.mjs`). The game decodes them (~5 ms) while the bank's key (a hash of the head's source:
headSdf, FACES, EYE, the mesher and the simplifier) matches; when the head code changes and the bank is stale, it meshes
at load and warns once in the console. `node tools/facebake.mjs --check` exits 1 when stale (worth adding to a
pre-commit / CI step). The face studio reports `bankCurrent: true` in the browser (the key matches in Chrome and Node).

## Costs (triangles; before = ngc/shader-library)
| figure | head surface before | head after | whole figure before | after |
|---|---|---|---|---|
| hero (player's own body, M1 + vest + pack) | 18.8 k (5.5 mm cell) | 7.0 k / 6.0 k under the helmet | 75.9 k | ~69 k |
| near (squads < 26 m) | 4.7 k (11 mm) | 4.2 k / 3.6 k | 22.6 k | 22.0 k |
| crew (Huey, CH-46, seats, interiors) | 2.9 k (14 mm) | 2.9 k / 2.5 k | 14.6 k | 14.6 k |
| mid / crowd / far | 1.4 k / 0.6 k / 0.28 k | 1.4 k / 0.6 k / 0.28 k | 8.4 k / 4.9 k / 3.4 k | same |
| eyes (hero / near), counted from the segment counts | 3.0 k / 0.28 k | ~3.4 k / ~0.74 k (sclera + cornea cap + caruncle, two kits) | | |
Draw calls are unchanged (one person draw + the weapon). No figure got heavier; the near figure is still over the
PERF-BUDGETS 15 k line (it was 22.6 k before this branch: the body, vest and gear are most of it; open item below).
**Load** (Node, a 13-man squad near + mid and 17 crew figures, under load average ~40): base 4.1 s, this branch 3.7 s
with the bank (11.9 s without it). The face studio (5 faces x 4 LODs + every role) builds in 4.3 s vs 5.1 s for 3 faces.

## 2026-10-29: Kneel reads as a lunge (fixed)
**Finding** (`kneel-side`, before): the still crouch was a high kneel: pelvis 0.565 m, the rear thigh upright, the trunk
leaning forward 0.12 rad over a front thigh at hip height: from the side it reads as a lunge.
**Action** (`soldiermodel.js stancePose`, crouch, FIG branch only; `humanfig.js crewPose('kneel')`): FM 23-9's kneeling
position: pelvis 0.46 m and 0.1 m back, the right knee on the ground (joint 0.09 m up), the rear thigh 45 degrees forward
of vertical, the shin rising 12 degrees to the ankle 0.18 m up with the toes tucked (foot 63 degrees down), the seat back
over that heel; the left foot flat ahead by plantLeg (0.43 m forward), knee out 0.16 rad; trunk upright (spine -0.05).
The crouch-walk blend (w > 0) and prone are unchanged. Measured in Node (buildMarine + poseSkeleton, crouch, still):
lowest vertex +0.011 m (base -0.040 m: the old kneel's knee / boot sank 4 cm into the floor), pelvis 0.481 m (base 0.567),
head bone 1.070 m (base 1.154). Eye height kneeling is now ~1.1 m, closer to soldier.js'
BODY.eye.crouch 1.12. Transitions stand > crouch > prone > crouch > stand checked (`transitions-before/after.png`).
**Coordination (Codex)**: the kneel changes hip height and the trunk angle, so the rifle-hand IK targets move with the
chest; I did not touch handkit.js / handposes.js / viewmodel.js or the grip parts of soldiermodel.js. Please eye the
kneeling grips (`kneel-front34.png`); the hands still meet the weapon in the shots. `crewPose('kneel')` now has the LEFT
knee down for crews (it was already), with the seat back.

## Headgear and hair fits (1980)
- M1 + Mitchell cover: correct for 1980 (PASGT entered service in 1983, SOURCES.md); the shell sits just above the brows
  and over the tops of the ears on the new head (`m1-near-34`).
- Sailor's white hat: was a crumpled band (a 3 mm brim at an 18 mm cell); now a crown, a 45-50 mm rolled brim and its
  rolled edge, meshed at its own 7 mm cell (`sailor-white-hat`).
- Officer's garrison cap: was a ridge on the crown; now fits the head, tipped right, with the fold along the top
  (`officer-garrison`).
- Civilians: a late-1970s cut over the measured cranium (fringe, over the ear tops, full nape) instead of a cap that the
  new head poked through.

## Checks (2026-10-29, SwiftShader, load average 37-45 from other agents)
| check | look-faces | base ngc/shader-library |
|---|---|---|
| `node tools/check.mjs syntax` | 675 / 675, no conflict markers | |
| `node tools/check.mjs types` | 572 (baseline 572) | 572 |
| `node tools/facebake.mjs --check` | current | n/a |
| `node tools/facebench.mjs` | pass (bank current, 5 faces x 6 LODs within the old head / figure triangle counts, crew kneel on the floor: lowest point -0.008 m) | n/a |
| smoke.json | 5 / 5 | |
| people.mjs | 1 / 1 (one skinned body per LOD; near Marine with M16A1 25.7 k visible incl. weapon) | |
| faces.mjs / kneel.mjs / lpstudio.mjs / lpcrews.mjs | pass, 0 errors, screenshots checked | same scenes run on a `git archive` of the base for the before shots |
| foot.mjs (load average ~50) | 9 / 20 | look-people logged 8 / 20 on its branch and 8 / 21 on its base with the SAME failing steps: the carrier-moving wait, the ladders, the walk to the pad, "GET IN THE UH-1H" (wall-clock waits under SwiftShader load) |

## Not run (orchestrator's load hold, 18:38-20:15 UTC: no headless browsers)
- **xrgameplay.mjs** was started at 18:29 and stopped by me when the hold came; it has NOT been run on this branch.
- foot.mjs on the base under the same load (the comparison above uses look-people's logged base result).
- In-game shots of the Huey crew / door gunner and deck crew at their real cameras (the face studio and lpstudio cover the
  same geometry and material, but not the game's post / lighting).

## Open items
- The near Marine is 22 k triangles against the 15 k LOD0 budget (unchanged by this branch, which saved ~0.6 k). The
  same simplifier can now take the body and vest (meshed at 25-30 mm today) down at the same look: ~30 % off near.
- Lips are still a little "set" in profile and the brows a little bushy at 0.25 m; expressions (blinks, a talking jaw for
  the radio voices) need a jaw / lid bone or morph: the rig has none.
- Jet crews hide the face (HGU-33 visor and mask) so they gain little; the Tomcat scene `lpcrews.mjs` frames an empty
  canopy since the Tomcat rebuild (its cameras need updating).
- The head bank must be re-baked after any change to the head (`node tools/facebake.mjs`); otherwise the game falls back to
  meshing at load (correct, slower, warns).
