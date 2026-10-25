# Findings - ngc/sealife2 (sea life that reacts to units)

## 2026-10-25 - Before: the sea life did not read as "pop" from any player view
**Finding** With the first version (ngc/waterfish) a player saw almost nothing: from 14-30 m the fish were a few dark
specks; a mackerel school spawned right beside the ALBATROSS was invisible from 70 m; nothing ever broke the surface;
there were no birds, no surface signs, no dolphins. Life existed only in a 70-170 m circle round the camera, so the
places where the action is (a ship under way, a landing craft run-in) had no life of their own.
**Evidence** `tools/scenes/fish.mjs` PARTS=look,fps,hull,wash on experimental 369fefd, run
`tools/runs/2026-10-25_13-25-14-fish/` (01-shallows-from-14m, 04-school-beside-albatross, 05-downwash-over-sardines).
**Cause** Real-size 15-20 cm fish are 2-5 px at 20 m; countershaded backs on blue water are near-invisible by design;
schools of 50-90 boids made balls ~1.6 m across; no behaviour put anything at or above the surface.
**Action** Fixed on this branch (commit 3519ab6 and later): unit-anchored spawning, bait balls with predators, leapers,
flying fish, dolphins, seabirds, wave-riding surface signs (nervous water, bait-ball stain and froth, rings, spray).

## 2026-10-25 - Fish could poke out of wave troughs
**Finding** The old sim clamped every fish to y <= -0.18 m whatever the waves did; at sea state 4 the drawn troughs reach
~-0.4 m, so near-surface fish could sit above the drawn water.
**Evidence** fishbench test 22 (SS5): now 0 of 69 600 fish-frames above the live surface.
**Cause** Flat surface assumed in fishsim.js.
**Action** Fixed: the sim takes `surf(x,z)` (the drawn sea: same components, grid filter and shallow-water fade as the
GPU); each school gets the wave plane over it per frame; floating, leaping and surfacing bodies use the exact surface.
Drawn floating dead fish sit on the exact drawn top (error 0.000 m in the bench).

## 2026-10-25 - Predators emptied a bait ball in ~9 s
**Finding** First version of predation: bonito ate 36 of 72 pilchard in 9 s, the ball dissolved, the birds left.
**Evidence** scratch probe printed every 3 s: live 72 -> 36 by t=9 s. After the fix: 17 eaten in 90 s, ball 1.00 held,
milling 0.6-0.97.
**Cause** A predator inside the ball could take a fish every 1/20 s sub-step.
**Action** Fixed: one prey per strike, 4-10 s handling time, ~1 in 3 strikes succeeds (game-tuned), satiation after
4 x school size or 150 s. Predator "vacuole" radius cut from 3.3 m to ~1.9 m (the ball had become a hollow ring).

## 2026-10-25 - Bonito drawn with ten-metre black spikes
**Finding** Huge black triangular fans radiated from every bait ball (huey shots 03-05, run 2026-10-25_14-02-21-sealife).
**Evidence** Per-mesh diagnostic (PARTS=diag, run 2026-10-25_14-05-07-sealife): only the single-fish mesh had them.
**Cause** The predators' strike timer reused the flying-fish wing slot; write() sent it to the shader as "wing spread",
so pectorals were extrapolated by mix(p, wing, 4..10).
**Action** Fixed: wing spread is written only for gliding species, clamped 0..1.

## 2026-10-25 - Dolphins fled the bow they were meant to ride
**Finding** In game the pod stayed 50-100 m away from the ALBATROSS under way (bench passed, game did not).
**Evidence** sealife.mjs bow part: pod at lx -35, lz -112 relative to the ship (log of run 2026-10-25_14-37-58-sealife).
**Cause** navalfx wakes call fx.wake and bow spray calls fx.splash; sealife wraps both into transient "scares"
(strength 0.75 / 1.0), and dolphins treated them as danger.
**Action** Fixed: dolphins react only to explosions (scare strength > 1.1) and pick the ship with the biggest bow
wave (distance - 1.5 x half length), so a nearer trawler does not win over the carrier.

## 2026-10-25 - Life round far units starved the camera's own sea
**Finding** At a swim spot ~250 m from the carrier, reef fish spawned by the scene returned null: the budget was full.
**Cause** Schools kept alive round ships up to 520 m away took the whole boid budget.
**Action** Fixed: life outside the camera's own circle gets at most 45 % of the budget; an explicit spawn evicts the
school furthest from the camera.

## 2026-10-25 - From the flight deck the water right under the hull is hidden
**Finding** A Marine at the deck edge looking straight down sees catwalks and the flight-deck overhang, not water; at
the bow the flight deck overhangs the stem by ~5 m, so dolphins riding right at the stem are invisible from deck.
**Evidence** deck shots in runs 2026-10-25_14-15-28 and 14-20-24 (01-deck-looking-over-the-side shows only deck).
**Cause** Geometry of a real carrier.
**Action** Dolphin bow slots scale with hull length (2 m + up to 16 % of the half length ahead of the stem), so on the
carrier they ride 2-12 m ahead, clear of the overhang; the deck views look out at ~30-35 degrees down.

## 2026-10-25 - Schools in deep water stay hard to see from the deck (by design)
**Finding** Mackerel / pilchard 20-40 m out in 14 m deep blue water are faint specks from the ALBATROSS deck.
**Cause** Countershading (dark backs on dark water) is real; the shader is physically based (Pope & Fry absorption,
Fresnel).
**Action** Not faked. The readable cues are added instead: surface-feeding spells for pilchard on calm days (nervous
water, terns), flashing flanks when frightened fish roll, bait balls (dark stain + froth + birds). OPEN: a bait ball 70 m
off seen from the Huey's chase camera at grazing angle is still small; birds are the main tell at that range.

## 2026-10-25 - `node --check file.js` does not catch syntax errors in game/js modules
**Finding** Two edits that put a `//` comment in the middle of a one-line block passed `node --check` but stopped the
game loading (blank page, "SyntaxError: Unexpected end of input", every scene expect failed: run
tools/runs/2026-10-25_15-01-42-sealife).
**Cause** Unclear why plain `node --check` passes these files; `node --input-type=module --check < file.js` reports
the error correctly.
**Action** Fixed both lines. Suggestion for every agent: check game files with
`node --input-type=module --check < game/js/<file>.js` (the brief's `node --check game/js/*.js` can miss this).

## 2026-10-25 - Cost
**Finding / Evidence** node fishbench: 1010 boids (HIGH budget 1100, each pilchard / mackerel boid drawn as 4 fish)
with a hunt and birds: 2.10 ms average, 3.24 ms worst per 60 Hz frame; 10 seabirds 0.014 ms. Medium budget (760) round
HOME ISLAND: 1.24 ms average (old sim: 0.24 ms for 552 fish). In game (SwiftShader, res 0.6): sealife.ms 1.6-2.7 ms
a frame incl. instance upload during the Huey bait-ball part. fps on/off: see the entry below when measured.
**Action** Far schools (> 230 m) move as one (no boids); neighbour search on a per-school grid; fish that cannot show
are not drawn; quality setting SEA LIFE off / low / medium / high in the pause menu.
