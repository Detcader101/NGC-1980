# Findings: ngc/bugsweep

The branch's findings: bugs and their causes, the deck-ops design, and the flaky scenes. Newest entries are at the top.
The format is set in [README.md](README.md).

## 2026-10-25 - DECK OPS: the design and why it looks the way it does
**Finding** The user said "the tomcats can't fly off albatross, need to Q the fly one aircraft at a time, make a taxi
coordination simulation". Every fixed-wing launch now goes through one queue,
`game/js/units/naval/deckops.js`. Before this, the launch paths were all separate:
- the player's 5 / 8 put a jet straight onto cat 1;
- the AI escorts had their own timer queue and went onto the same physical catapult (x -2.5);
- sim mode's strike Hornets were spawned in the air at 60 m.

Nothing stopped two of them sharing the cat.

The design decisions:
- **One catapult (cat 1, x -2.5).** Cat 2 (x 4.5) stays shut. The two parked Hornets at the starboard bow are solid,
  and a Tomcat's wingtip with the wings spread (9.75 m half span) runs into them.
- **Two spots, in file, aft of the island** (x 10.5, z 27 and z 46, nose forward). A Tomcat is 19 m long, so the spots
  are 19 m apart. Spot 1 is far enough aft that a jet's nose clears the island's after face (z 15) as it turns out.
  The jet on spot 2 moves up when spot 1 empties. New jets come up behind the last one; the rest wait in the hangar.
  The player's jet takes the last AI jet's spot when the deck is full; that jet goes back down to the hangar.
- **Taxi route.** The jet turns round the island's after corner to a hold-short line behind the JBD (2.4, 10.5).
  The cat director then brings it over the lowered JBD onto the shuttle. The JBD rises as soon as the jet is on the
  track, the jet tensions, and the cat fires. The cat then resets for 8 s.
- **Cycle ops.** The arresting gear's runout ends between z 18 and z 4 on x -2.5, so the lane, the hold-short line
  and the run onto the cat all lie inside the landing area. Launch and recovery therefore never share the deck.
  - While anyone wants to land (an AI pilot in the pattern inside 3.2 km, or the player's jet with hook and gear down
    inside 3 km), nothing new moves into the area. A jet already at the hold-short line still goes onto the cat,
    because that takes it out of the area.
  - While a jet is in the area, the AI pattern goes round again ("FOUL DECK - GOING ROUND").
- **Fouled deck.** The queue holds, with the reason on the player's HUD, if a CH-46 or the player's Huey sits or
  hovers low on the lane, or the player leaves a parked jet in the way.
- **The commander's priority.** Pressing 5 / 8 again while queued puts the jet next. It goes straight to the cat when
  that is free, which skips the taxi the way the old instant spot did. When nobody is ahead and the deck is open,
  5 / 8 still puts the jet straight onto cat 1, as before.
- **Taxiing is kinematic.** The airframe got `A.tow = { lx, lz, hdg, v }`, which lies the jet on the live deck in the
  ship frame, like the catapult does. The player does not steer the taxi: the director brings the jet up.

**Evidence**
- `tools/deckopsbench.mjs` 15/15, using real Tomcat and Hornet airframes on the game deck in a seaway, at frames of
  1/30 s and 0.1 s:
  - five jets launch in the order they asked, 20-23 s apart (2.6 a minute);
  - never two aircraft on one segment; the closest pair is >= 10.5 m apart;
  - a helicopter on the lane holds the queue (0 moves while it is there), and so does a recovery (0 moves);
  - a bumped jet goes next; the player preempting a full deck goes after the jet already moving.
- `tools/scenes/deckseq.mjs` 4/4: three escorts and the player's Hornet launch at 32 / 54 / 78 / 101 s game time, and
  all four are airborne.

**Cause** No shared deck model existed. Each launcher spotted its jet independently.

**Action** Built in 6d66c6b (core and bench) and b11d662 (in the game). It also moved deck clutter off the lane:
Tilly, the aft tractor, a deck walker, and the motor pool's deck park. The truck had stood under a Tomcat's wing on
the cat.

**OPEN**
- The player cannot taxi by hand under director signals: the director moves the jet.
- A landing jet's runout can still meet a jet standing at the hold-short line if the landing started first. The jet
  at hold short only waits for the cat, and no aircraft-to-aircraft collision is modelled.
- The port-bow vehicle parks (x -10.5) are still under a Tomcat's wingtip on the shot (M113 cupola about 2.5 m).
- The KRAKEN's SHRIKEs still spawn in the air.

## 2026-10-25 - Hands off after the cat shot, the Tomcat settled into the sea
**Finding** A Tomcat launched hands off (no stick input) sank off the bow and hit the sea about 4 s after the stroke:
pitch -5 deg, 3 m above the water. A Hornet launched the same way climbed away.

**Evidence** `tools/catdeckbench.mjs` (Tomcat and Hornet on the live deck, sea states 3 / 5 / 6, straight and
turning, frames 1/60, 1/30 and 0.1 s): Tomcat 0/54 runs away before the fix, 54/54 after; Hornet 54/54 and still
bit-identical. `tools/scenes/catshot.mjs` 5/5: the player's Tomcat hands off was at least 11.7 m up and climbing at
8 m/s, 5 s after the stroke. Screenshots: `tools/runs/2026-10-25_15-13-22-catshot/`.

**Cause** The Hornet's flight control law has a hands-off rotation after the cat shot (the `launchT` bias). The
F-14A's mechanical stick with stability augmentation (SAS) had none: at the end of the stroke the stabilator ran
back to cruise trim.

**Action** Fixed in cad0596. The launch trim rotates the Tomcat to about 10 deg and holds it for 7 s, easing out
over the last 2 s; any stick input above 0.3 takes over at once.

## 2026-10-25 - The catapult crash and the AI Tomcat "stuck" on the cat (jets.json on experimental)
**Finding** On experimental, `jets.json` scored 0/5:
- the escort stayed in state `cat` at 21 kt;
- by the end of the scene every escort was gone (dead);
- the player's F-14 died at the end of the stroke.

**Evidence** Run of experimental 047a748, scratchpad run `exp-jets`. On this branch `jets.json` passes 2/2 with all
waits met, and `tomcat.mjs` passes 15/15. Commit b44b44d logged it per substep: OVER-G 46-55 g, breakup or CRASHED,
at the end of the stroke.

**Cause** SEAWORLD made the parked aircraft solid, and the shuttle ignored the live deck:
1. The two Hornets parked on the starboard bow are solid deck height fields. The escorts' starboard cat (x 4.5) ran
   the right main gear 2-3.5 m into one, and a Tomcat's spread right wingtip swept the other.
2. The AI's carrier environment had no live deck, and the cat held every jet level on the flat deck height. When the
   ship heeled in a turn, the low main gear was 0.3 m into the deck at the end of the stroke, and the first free step
   threw the jet off at 46 g.

"Never leaves the cat" was the visible half of the same failure. The escort also waits in `cat` while the ship turns
into clear water (`catClear`), and at 1-5 fps headless that wait outlasted experimental's 30 s wall-clock timeout.

**Action** Fixed in b44b44d, merged here: the Hornets moved outboard, the escorts use the port cat, and on the
shuttle the jet lies at the deck's pitch and roll. Timeouts now count game time (snap.mjs, b0e3b68).

## 2026-10-25 - Cockpit HUD: the feed ran through the centre message
**Finding** In a jet cockpit, long centre messages overprinted the feed. Island tags were also drawn over the
instrument panel.

**Evidence** `tools/runs/2026-10-25_14-49-04-tomcat/01-cockpit-on-the-cat.png`: "TOMCAT ON CAT 1 ..." is overprinted
by "ALBATROSS: TURNING INTO CLEAR WATER". A NORTH ROCK tag is on the glareshield in the flyaway shot.

**Cause** `main.js` `updateHud` moves `#feed` to `top: 236px` in a cockpit, which is exactly where `#msg` sits:
`max(22%, 236px)`.

**Action** Fixed in 6053c13:
- in a cockpit the feed moves two lines lower and is capped in height;
- tags below the glareshield are skipped in a jet cockpit.

## 2026-10-24 - Flaky scenes: the common cause was wall-clock waits at 1-10 fps
**Finding** Most scene-table flakes came from wall-clock `wait` / `key hold` / `waitFor` timings. On the loaded
shared machine the headless build runs at 1-10 fps, and the game frame is capped at 0.1 s, so a 5 s wall wait gave
the game 0.5-5 s.

**Evidence** In pass 2, hueyhover, wheeledgame, buddyaid, ch46capture, damage, loop, caveaim / caves, rescue and
vehicle failed intermittently. They pass after these fixes: d743557, b0e3b68, 01c78b4, 641fc27, 8cba2de.

**Cause** In `snap.mjs`:
- waits counted wall time;
- a 60 ms key tap fell between frames;
- puppeteer's 180 s protocol timeout cut longer waits;
- `waitFor` on a non-serialisable value never ended.

**Action** Fixed in `snap.mjs`:
- `wait`, `key hold` and `waitFor` timeouts count `__G.war.time` (game time) when the game has a clock;
  `SNAP_WALL=1` restores wall time;
- a tap lasts at least one game frame;
- the protocol timeout is 30 min.

Scene autopilots that ran on `setInterval` now step once per game frame (rescue, damage, hueyauto, the cave hovers).

## 2026-10-24 - rescue.json flake
**Finding** The dead-stick cushion in `rescue.json` flaked.

**Cause** The scene's cushioning stick ran on a 16 ms `setInterval`, about 8 times per headless frame on the same
state. The jumpers also came out at 52 s of a 60 s wall wait.

**Action** Fixed in 29699c7: the cushion steps once per game frame, and the drop timeouts are game time.

## 2026-10-24 - drop.json bank check
**Finding** The check "roll with D and the plane banks" failed 4/5 runs. The input was not the problem.

**Cause** The check assumed the Hercules starts wings level, but the autopilot is often still in its run-in turn.
A real roll of 0.14 rad, starting from -0.08, read as a 0.06 bank.

**Action** Fixed in a5e53cf: the scene measures the change in bank while D is held. 3/3 runs at +0.14.

## 2026-10-24 - armorgame: M113 "slipping" on the deck
**Finding** The M113 failed its stay-on-the-spot check while the ALBATROSS turned.

**Cause** The check measured in plan view. A deck 8.5 m above the waterline moves 0.74 m in plan when the ship heels
5 deg. In the full ship frame (`GR.toShip`) the hull did not move at all (0.000-0.001 m).

**Action** Fixed in 29699c7: the check uses the ship frame. The AI road leg also starts from the motor pool spot
(1fd4d9c). 18/18.

## 2026-10-23 - Rotary rollover on the pitching deck at 0.1 s steps
**Finding** CH-46s and MV-22s rolled over on the carrier decks.

**Evidence** `tools/rotarydeck.mjs`: 0/16 before the fix, 16/16 after (sea states 3-6, frames 1/30 and 0.1 s). On
2026-10-25, after the merge, it is still 16/16.

**Cause**
1. `war.js` `sailShip` stepped the ship's yaw rate from 0 to 0.09 rad/s in one frame. A spot 35 m from the middle was
   jerked sideways at about 3 m/s.
2. `transportai.js` read `sim.contacts` instead of `sim.body.contacts`, so touchdown was never detected.
3. The touchdown logic itself (see 76e6524).

**Action** Fixed in 76e6524: a yaw acceleration limit (0.015 rad/s2), the contacts fix, and a new touchdown
sequence.

## 2026-10-24 - war.json carrier distance
**Finding** "The carrier sails 3 m" failed at low fps.

**Cause** The check came after a 5 s wall wait, and at 1-2 fps the ship moved less than 3 m.

**Action** Fixed in b558270 / d743557: the scene waits 5 s of game time. The capture wait polls the island owner.
