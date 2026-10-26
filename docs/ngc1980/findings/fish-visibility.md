# Swimmer and diver fish visibility — 2026-10-26

The ordinary infantry view could contain no readable fish even with a full sea-life population.
At the default sea state 4 the previous fog ended at about 19 m, while occupied underwater
spawning normally selected a 38.5–70 m annulus. Bodies also had an independent 40 m draw cutoff.
Existing remote schools retained by ship/swimmer anchors could fill every school slot: spawning
stopped at that cap before it could consider a closer replacement. The older underwater and
swimming browser scenes injected nearby schools, so they did not exercise this failure.

This population change uses the current simulation and its existing quality budgets. A submerged
camera, or an infantry swimming threat within 12 m horizontally and 6 m vertically of the camera,
prioritizes two nearby schools on LOW and three on MEDIUM/HIGH. Surface-swimming eyes qualify
before diving. Candidates lie 8–24 m away, primarily in the forward half of the view when it has a
horizontal direction. They still pass water-depth, species-frequency, weather, crowding and
predator/prey checks; no fish are debug-injected or enlarged. Close schools may sit 14 m apart
instead of the ordinary 30 m separation. Their subsequent movement, schooling, curiosity and
avoidance are unchanged, so the target is a population preference rather than a fish count locked
to the camera.

When necessary, a school more than 32 m away and outside the camera cone or hidden by underwater
fog relinquishes its capacity. It completes the existing 1.8 s fade before removal, and a retirement
flag prevents anchors from reviving that fade. Pending departures count toward available future
capacity, limiting simultaneous replacements to the nearby deficit. Arriving close schools also
fade in. Species, school and boid caps remain unchanged, and the aerial forward-focus/ship-anchor
population path is retained. Disabled sea life also submits zero body instances even if the host
has not yet cleared its old population.

`game/js/units/naval/seavisibility.js` exports
`underwaterVisibility(seaState = 4, depth = 0, out = {})`. Distances are a **gameplay tuning**, not
a claim about measured ocean visibility:

- `near = 4` m;
- `far = max(34, 72 - 3 * seaState - 0.45 * depth)` m;
- `bodyRange = far + 12` m, so body culling occurs beyond complete fog;
- sea state is clamped to 0–7, with non-finite/non-numeric inputs using 4; negative depth becomes
  zero, and invalid depth uses zero;
- callers can reuse `out` to avoid a frame-loop allocation.

The fish simulation passes its normalized sea state times seven and computes depth below the
**live surface at the camera**. A camera under a wave crest can therefore be underwater even at
positive world Y. The rendering owner separately applies this profile to scene/terrain/fish/particle
fog and enlarges the seabed coverage; those renderer changes are outside this population commit.

Validation completed in `ngc/unit-fish-population`, based on `a1086d7`:

- `node tools/fishvisibilitybench.mjs`: **19/19 passed**. Natural aerial/ship populations fill the
  school or fish budget before a diver arrives, across seeds 1, 7 and 1980 and all three quality
  levels. Tests cover nearby refill, anchored-school retirement, gradual departure/arrival,
  habitat and every population cap, finite state, surface swimming, moving divers over 15 m water,
  the actual HOME east shelf at (-530, 720), deterministic replay, draw-range/wave-depth culling,
  and OFF/re-enable behavior. No population scenario calls `spawnSchool`; two isolated culling
  tests construct a school explicitly to control its distance.
- `node tools/fishbench.mjs`: **78/78 passed**, including existing aerial signs, ship anchors,
  schooling, wakes, swimmer avoidance/curiosity, live waves, fades and determinism. The local Node
  samples were 0.76 ms/frame for 690 boids and 1.29 ms/frame for 1010 boids. These are simulation
  measurements, not browser FPS or a performance improvement claim.
- `git diff --check`: passed.

No browser was run in this branch. Submitted bodies and nearby-school counts do not establish
visible fish pixels. The integration owner retains the natural first-person baseline in
`tools/runs/underwater-before` and owns the subsequent same-scene rendered benchmark, fish-only
pixel comparison, screenshots, clips and HTML devlog. Longer sight distance also requires the
larger seabed mesh so its boundary stays beyond fog. Physical Quest testing remains separate.
