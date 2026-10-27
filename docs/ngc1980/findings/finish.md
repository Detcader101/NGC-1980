# Sandbox integration findings — 2026-10-25

## Enemy research was starved by unit purchases

**Finding:** In three BALANCED/DEFAULT wars (seeds 1–3, default tech, 20 simulated minutes), RUNAWAY completed no
research. Its mean materiel at 5/10/15/20 minutes was 3/19/10/8: production was immediately consumed by military buyers.

**Cause:** Research ran after the ground-arm budget and could not protect its next programme from air/ground purchases.
**Action:** Plan the next research budget before those buyers, reserve it on the enemy side, then release the hold when
research starts. Normal player spending stays under player control. Both the built-in commander and doctrine copy use
the same spending rules. After the change the same seeds researched REAPER, hover armour, fabrication and SHRIKE in all
three wars (mean completion about 1.2/5.5/10/14.8 minutes); two reached SHAHED. This is progression evidence, not a balance verdict.
**Evidence:** `tools/economybench.mjs`, `tools/simbench.mjs`; raw before/after runs and final matrix in [SIMREPORT.md](../SIMREPORT.md).

## Raids could buy more units than they could afford

**Finding:** Late WASP raids checked for 36 materiel then bought up to five units at 12 each. Late SHAHED salvos checked
four units' cost but could buy six. Both could make the enemy balance negative.
**Action:** Cap each group by the remaining affordable count (and raid cap), after research/doctrine reserves.
**Evidence:** `economybench.mjs` exercises the real purchase/spawn paths with small balances, including the doctrine copy.

## Default Huey placement stopped the carrier queue

**Finding:** The browser catshot scene's ordered Tomcat waited indefinitely with “THE HUEY IS ON THE DECK”.
The Huey started at deck coordinates (-2, 32), only 13.46 m from the first jet spot; the combined clearance was 13.5 m.
**Action:** Share the start position through `DECK_OPS.HELO_START` and move it to (-5.5, 32), clearing the taxi route.
The normal obstruction rule remains active for a helicopter actually on that route. Also include a deployed CH-46
in the deck's obstacle list, and restore the escort order's success text used by the CPU commander.
**Evidence:** `deckopsbench.mjs` exercises three launches with the starting Huey present; browser `catshot.mjs` passes
5/5 for player Hornet/Tomcat and an ordered AI escort. The failed pre-fix run is retained under `tools/runs/finish-catshot/`.

## Deep deck contact could throw rotorcraft off the map

**Finding:** Starting the CH-46, MV-22 or WASP below a raised deck produced speeds above 900 m/s before a rollover/crash.
**Cause:** Gear spring force grew without a bound with penetration depth, including the underside of an elevated deck.
**Action:** Bound gear forces and report a deep obstruction as a collision. This preserves finite state rather than
turning a large overlap into an explosive launch. It does not implement the deferred shared collision world.
**Evidence:** `rotarycontactbench.mjs`: three aircraft, three frame rates, three depths; crash reported, finite state,
peak speed below 20 m/s. Existing flight and moving-deck benches cover ordinary contact behavior.

## Cockpit switches captured the cursor after operating

**Finding:** Clicking the Sea Knight's battery worked, but its subsequent click event also enabled pointer lock.
Moving the cursor to the APU then moved the head instead, invalidating the next screen position.
**Cause:** The shared switch handler consumed `mousedown`; the canvas's separate `click` handler still requested lock.
**Action:** Consume the follow-on click for a handled switch, and only pick cockpit switches for canvas input.
**Evidence:** The cold-start browser scene now checks that a switch click leaves the cursor free before clicking the APU.

## Enemy transports crashed before taking islands

**Finding:** The first 24-war matrix had zero enemy captures. Tracing seed 1 showed every MV-22 crashing during boarding;
the first lasted nine seconds, and later aircraft often lasted two. Simplified deck tests had only a three-second spool.
**Cause:** The boarding animation displayed chocks without restraining the airframe. Ship separation also changed carrier
position after updating aircraft, without adding that movement to surface velocity. Lift guidance retained the original
spot through a long boarding sequence, even after the deck had turned and moved.
**Action:** Restrain the aircraft to its live deck pose/velocity while boarding, release on lift, and guide lift from
the current deck spot. Complete ship movement/separation first and expose its actual velocity to deck occupants.
**Evidence:** `transportbench.mjs` runs the actual war through a long boarding turn, departure, troop landing, capture and
recovery. In the repeated 20-minute seed 1 war, RUNAWAY captured BEACON, KILN and CINDER. Recovery and awkward terrain
still cause some losses; this repairs the systemic failure to launch, not every possible navigation problem.

## Removed aircraft crashes were missing from loss totals

**Finding:** Transports could retain positive HP after a physics crash and be removed in the same update. Telemetry
counted dying units still in the list, but counted removed units only when HP was zero, masking those accidents.
**Action:** Record dead/dying removed units as losses once, including the first-loss time and event; exclude recovery
and stowage. `telemetrybench.mjs` covers each path. Loss counts before and after this correction are not directly comparable.
The live air-war retirement hooks now mark successful friendly/enemy returns as stowed; the bench exercises those hooks
as well as the observer, and a casualty cannot receive a recovery refund. This avoids counting a returned jet as a crash.

## Huey troop departure accelerated into nearby terrain

**Finding:** The airlift browser scene delivered its sling load, boarded six Marines, then struck a rotor against terrain
just beyond the departure pad. The crew AI immediately requested cruise speed while still close to the ground.
**Action:** Limit horizontal acceleration until the skids clear the pad, then build speed with height. Guard the zero-distance
direction calculation as well. `commanderbench.mjs` covers a loaded departure beside rising ground and existing recoveries.

## Batch reports could disagree with their own wars

**Finding:** Aggregation recomputed winners and comeback metrics from thinned samples, which could omit the last sample.
Worker errors were not written to `runs.jsonl`, and the command could exit successfully after failed wars.
**Action:** Preserve the full-timeline verdict/metrics, keep the final stored sample, log failures, await output flush,
and exit nonzero on errors. Validate CLI numbers, doctrine/tech names and sweep keys before allocating workers.
The default CLI research start now matches normal play. Report text explicitly qualifies timeout scores and small matrices.
**Evidence:** `simreportbench.mjs`, `warsimbench.mjs`, and the seeded simulation regression.

## Browser checks assumed transitions were instantaneous

**Finding:** Several old assertions compared stores across frames while island income continued, expected a catapult
spot before the shared deck queue cleared, or counted passengers immediately before their weight/ground handoff updated.
The Sea Knight's last Marines were still walking down the ramp after the cabin became empty. A dolphin check also
assumed a distant randomized pod would reach a particular bow after exactly thirty seconds; the test ship's initial
heading then took it toward FORGE, where its shoal avoidance slowed it below bow-riding speed.
**Action:** Compare purchases within a frame or allow the known income interval; accept a matching queued launch;
wait for the actual payload and complete ground handoff. Use a verified deep-water corridor for the ship, place the
dolphin fixture near its bow and wait for arrival, checking lateral/longitudinal clearance and minimum ship speed.
Keep earlier failed artifacts and corrected reruns separate.
