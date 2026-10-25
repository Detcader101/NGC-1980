# Orchestrator findings

## 2026-10-25 - Tech tree merged; normal play now starts on the default tree
**Finding:** after ngc/techtree (047a748) a normal game starts with tier 0 only: no parked M60A3/M113A2, no Tomcat
escorts, logistics or sky carrier until researched. `?debug` with no `?tech` and `?tech=all` give the old game.
**Evidence:** techbench 95/95, techtree.mjs 26/26, smoke 5/5, commander/groundwar/air benches pass on the merge.
**Action:** balance is a first cut; the sim tunes it. Shift+6 / F6 free sky carrier skips the gate on purpose.

## 2026-10-25 - First sim tournament: wars don't end
**Finding:** in the first partial tournament (BALANCED vs each RUNAWAY doctrine, 8 seeds each, 45 min limit,
default tech) nearly every war ran to the time limit with the Task Force slightly ahead. Decisive ends: 2 ALBATROSS
sinkings (vs SWARM, HORDE), 1 RUNAWAY carrier sunk (vs DREADNOUGHT), out of 42 games.
**Evidence:** tools/runs/sim/2026-10-25-14-41-30-tournament-default/runs.jsonl on ngc/simmode (c1083ff).
**Cause:** not yet known: enemy too passive, objectives too hard to finish, or both. Small sample, one blue doctrine.
**Action:** OPEN - SIMREPORT.md (ngc/simmode) and the balance pass.

## 2026-10-25 - Sim shortcut did nothing until simmode merged
**Finding:** the NGC-1980 SIM MODE desktop shortcut opened the normal game: `?sim` lived only on ngc/simmode.
**Action:** merged the first cut (613739b); simmode.json 6/6, simbench 13/13. Launcher shortcuts are on main (3d2e3a4).

## 2026-10-25 - USER REPORT: Tomcats can't fly off the ALBATROSS
**Finding:** the player F-14 is destroyed at the end of the catapult stroke and the AI Tomcat never leaves the cat
(jets.json); known since 2026-10-24. User asked for a launch queue, one aircraft at a time, and a taxi coordination sim.
**Action:** OPEN - ngc/bugsweep owns the catapult fix + new deck ops module (launch queue, taxi, fouled-deck holds).
