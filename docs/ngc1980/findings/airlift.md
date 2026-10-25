# Findings - ngc/airlift (Huey sling loads, troop lift, C-130 heavy drop)

## 2026-10-25 - Sling-load pendulum matches textbook mechanics; period vs line length
**Finding**: The load under the UH-1H's hook (units/air/airlift/sling.js, integrated in hueyfm's 240 Hz substep through
env.ext) swings at 2π√(L/g) to within 3 % for every pendant length tried, and the coupled helicopter + load mode is right.
**Evidence**: tools/slingbench.mjs (37/37). M151A2, hook held still, 5° swing: pendant 1.5 / 3 / 4.5 / 6 / 9 m ->
4.22 / 4.93 / 5.56 / 6.12 / 7.10 s (each within 3 % of 2π√(L/g), L = pendant + apex-to-CG, stretched 8 %);
9 m vs 1.5 m ratio x1.68 = √(L ratio). M35A2 (L 7.9 m): 5.74 s vs 5.73 s. Coupled with a free 3,700 kg "helicopter": 4.33 s
= 2π/√(g(M+m)/(ML)). Vertical bounce on the nylon stretch 1.01 Hz. Still-air swing keeps 93 % of its amplitude after
10 cycles (drag only - the pilot has to damp it).
**Cause**: -
**Action**: none (reference numbers).

## 2026-10-25 - Huey trim and torque with the M151A2 on the hook
**Finding**: Hovering OGE with the jeep slung needs 49.8 psi (clean 33.8 psi; the same 1,100 kg inside the cabin 47.6 psi:
the rotor wash on the load adds +4.7 % download). Trim attitude barely moves (pitch 4.6° vs 4.2° clean, roll -1.0°):
the hook sits under the CG. Gross 9,916 lb at half fuel - over the 9,500 lb max gross, a heavy, marginal lift, as a
real UH-1H with a jeep is. 50 kt: the load trails back 4.5° (drag / weight statics say 5.6°) and rides steadily; 70 kt
swing builds to 17°; 95 kt (over its 60 kt limit) the swing builds to 59°. A 15° swing in the hover rocks the airframe
at 4°/s. Release in the hover with the collective held: +4.5 m/s climb after 2 s; retrimmed torque returns to clean.
**Evidence**: slingbench (--v prints the numbers).
**Cause**: physics through the hook point; nothing scripted.
**Action**: none. Note: 50 psi is the UH-1H torque limit, so with the jeep there is ~0 margin OGE; IGE/translational
lift is what makes the lift work - pilots should drag it off gently.

## 2026-10-25 - The crew AI could not fly a sling load: overshoot, circling, 70 psi
**Finding**: With a load on the hook the Huey's AI pilot (commander/heliai.js, T.gentle) overshot the spot, cycled
transit <-> approach for 4 minutes (35° swings), and pulled 71-73 psi lifting off.
**Evidence**: node ferry test (now in slingbench "AI ferry"): before - never arrived in 240 s; airlift scene run
tools/runs/2026-10-24_14-56-33-airlift timed out en route (swing 23° at 25 kt).
**Cause**: the gentle mode scaled the loop gains by 0.4 (the attitude it asked for was too small to brake), a 45 m
approach radius for a load that brakes at 0.45 m/s², full-rate climbs with no torque limit, approach hover height too low
for a load 8 m under the skids.
**Action**: fixed in 8a6baef: full gains with smaller attitude limits, approach radius x2, climb straight up until the
load is clear then accelerate, vertical speed cut above 49.5 psi, approach hover 15 m. 900 m ferry: 93 s, set down 0.2 m
off the spot, 16° max swing, 52.5 psi peak (brief), 2.2 g peak tension. commanderbench 32/32 unchanged.

## 2026-10-25 - Heavy-drop loads did not fit the C-130's hold
**Finding**: The rigged M113A2 stood 3.07 m above the floor in a 2.74 m hold (cupola and whip antennas through the
ceiling), the G-11A bags and the suspension-sling clevis were drawn 1-2 m above the vehicle (lines into the roof), the
vehicle was not centred on the platform (the M113 hung 1 m off its tail) and the troop seats ran through the tracks.
**Evidence**: tools/runs/2026-10-25_14-49-12-airdrop/03-hold-inbound.png, 06-hold-ramp-open.png.
**Cause**: platform model used a fixed 'tall' figure and put everything on top; no stowage for the hold.
**Action**: fixed (heavydropmodel.js): stow what stands above 2.74 m (whips; M35A2 cab top, bows, cover, ring mount and
exhaust stack - its own group now in m35model.js; M151A2 top, whip, M60 pedestal; windshields folded), 0.3 m
honeycomb, vehicle centred, the bags on a parachute stand behind the vehicle (M113A2 on a 24 ft / 7.3 m platform),
slings folded with the clevis on the stand until the canopies pull them up (P.rig(k)); c130model.js: troop seats are
their own meshes, folded up with a lower sidewall over the gear wells when rigged (parts.stowSeats). Max heights now:
M151A2 1.94 m, M35A2 2.71 m, M113A2 2.67 m.

## 2026-10-25 - Heavy drops landed 70 m off, on a slope, in a cave mouth
**Finding**: The first scene drop landed 70 m from the DZ on a >60 % slope (LOST); after the CARP fix one landed on the
apron of a cave base, the next in a village between houses.
**Evidence**: runs 2026-10-25_14-49-12-airdrop (70 m, ROLLED DOWN THE SLOPE), 2026-10-25_15-08-08 (9 m, by the cave),
2026-10-25_15-12-08 (14 m, IN THE TREES / ON A ROOF).
**Cause**: the release point ignored the extraction (the platform leaves the ramp ~14 m/s slower and 2.2 s later) and
the aeroplane's real height and speed; the DZ search only looked at a 9 m radius and knew nothing of caves or pads.
**Action**: fixed: the navigator re-plans the CARP every 0.5 s on the run-in from the real ground velocity and height,
with the extraction kinematics (now 9-14 m off); DZ search scores slope out to 30 m, open ground at 12 / 22 m (hard
filter), sea nearby, and avoids cave mouths (HOLE_R + 48 m) and pad aprons (with a fallback for small islands).

## 2026-10-25 - Collapsed canopies stood 23 m tall / lay over roofs
**Finding**: After landing the G-11As were rotated onto their sides (a 23 m disc standing on edge), and later laid flat
across house roofs and a cave mouth; a six-canopy cluster read as one canopy in the air.
**Evidence**: runs 2026-10-25_14-49-12-airdrop/12-canopies-collapsed.png, 2026-10-25_15-37-47-airdrop/12-canopies-collapsed.png.
**Cause**: the collapse animation only tilted the canopy down wind; no ground check; the cluster lean was 0.22 rad for
any number of canopies (they overlapped).
**Action**: fixed: each canopy settles as a flat spread of nylon on open, level, dry ground around the load (down wind
first, never on a roof / trees / a cave / the sea; across the load as the last resort); the cluster leans apart so
neighbouring skirts touch (ring radius 11.6 / sin(π/n) at 33 m). Screenshot runs/2026-10-25_15-42-00-airdrop.

## 2026-10-25 - OPEN: the home island has little open ground for a heavy-drop DZ
**Finding**: On HOME ISLAND (village, woods, a cave base) the strict DZ search (no houses or trees within ~20 m) finds
nothing; the fallback chain ends on a pad apron. Real heavy-drop DZs are hundreds of metres of open ground.
**Evidence**: run 2026-10-25_15-12-08-airdrop (no DZ until the fallback was added), 15-42-00 (landed on the pad apron).
**Cause**: island size and density of the world dressing.
**Action**: OPEN - suggestion: mark a cleared DZ (a field) on the larger islands in world.js, or allow drops onto the
grass strips beside pads; the board could show which islands have a proper DZ.

## 2026-10-25 - OPEN / notes
- The airdrop scene drops onto HOME ISLAND only; other islands are untested headless (the DZ code is generic).
- M35A2 airdrop shown from the hold is untested by screenshot (bench heights only: 2.71 m with the stowage).
- Heavy-drop outcomes (slope / trees / sea / streamer) are random per drop (1.5 % streamer per canopy); no balance pass.
- Troop lift: the squad is six Marines (630 kg); the Huey seats are four on the bench plus two in the doors - the
  player riding on the bench shifts one man to the floor.
