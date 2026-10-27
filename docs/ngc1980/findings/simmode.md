# Findings: ngc/simmode (SIM MODE, CPU vs CPU)

Running log. The summary with tables is [../SIMREPORT.md](../SIMREPORT.md). Run folders are under `tools/runs/sim/`
(gitignored: re-run the command given to reproduce; every war is deterministic per seed).

## 2026-10-25 - Every Tomcat escort breaks up at the end of the catapult stroke
**Finding**: command 4 (Tomcat CAP) never gets a Tomcat into the air: each one crashes ("VICTORY 2xx CRASHED") as the
cat 2 stroke ends. In the first sim wars the TASK FORCE lost 7-11 Tomcats (30 materiel each) per war for nothing.
**Evidence**: headless `node tools/sim/tryescort.mjs 40` (events catend, touchdown, overstress, breakup, crash at
eas 96); confirmed in the browser on experimental: `snap.mjs --query "?debug&kb&peace" ... command(4)` -> feed
"VICTORY 201 IS DOWN - CRASHED" (run folder tools/runs/2026-10-25_13-50-29-catcheck).
**Cause**: albatross.js makes the two Hornets parked on the bow solid deck (height fields in `localDeck`, commit
79feec1 "parked aircraft are solid"). The forward one (x 8.9, z -47) reaches over the cat 2 lane (catX 4.5): the F-14's
right main gear hits 9.9 m "deck" (2.2 m above the real deck) at the end of the stroke.
**Action**: OPEN (naval file, not changed here). Suggestion: park the bow Hornets clear of the cat lanes, or leave
parked footprints out of `localDeck` inside the catapult lanes. The sim has `--patch catlane` (drops the two bow
footprints for that run only); the tournaments use it so Tomcats count.

## 2026-10-25 - Far battles ran the full STRIDER walker sim for every unit that landed after the battle started
**Finding**: groundsim's level of detail only switched units when the battle's near/far state changed, so STRIDERs
landed on a far island later never went to the cheap kinematic level.
**Evidence**: profile of a 25 min headless war: strider balanceStep 13% of CPU with the camera 50 km away; after the
fix the same war ran 1.7x faster (12.7 s vs 21.5 s); groundwarbench 33/33.
**Cause**: `lod(B)` returned early when `near === B.near`.
**Action**: fixed in 1f1d872 (groundsim.js: re-apply when the battle's unit count changes). Also affects the live game
(intended: far fights cheaper).

## 2026-10-25 - gwmap `at(x, z)` was 8-11% of a war
**Finding**: the island lookup every ground-height query makes looped all 17 islands with hypot.
**Evidence**: profile, hAt <- hovertank.sub at 240 Hz.
**Action**: fixed in 1f1d872 (40 m cell index, identical answers).

## 2026-10-25 - A CH-46 flying into the airborne SKY CARRIER is launched at thousands of m/s
**Finding**: with the ALBATROSS refitted and flying at ~70 m, a Sea Knight transiting at the same height met her deck;
its gear springs threw it to 23 km/s and 1e8 m away (NaN soon after).
**Evidence**: `tools/sim/trych46.mjs` trace (removed later): v 25 -> 122 -> 23185 m/s at (-293, 154, 312), sky carrier up.
**Cause**: rotary gear contact against a deck that is above the rotorcraft (penetration of metres -> huge spring force).
**Action**: OPEN. The sim logs it as an anomaly, writes the unit off and goes on. Suggestion: rotary units fly over (or
avoid) the sky carrier, and gear contact force should be capped by penetration depth.

## 2026-10-25 - WASPs and other units go NaN / are thrown off the map now and then
**Finding**: 19 anomalies in 72 pilot-tournament wars: "gunship (side 2) NaN position" and terrain asked at 1e5-1e10 m.
**Evidence**: tools/runs/sim/2026-10-25-14-24-24-pilot-tournament/report.md, Anomalies section.
**Cause**: not pinned down per unit yet (waspfm / rotary blow-ups); the sim now names the module that asked
(f8fe282).
**Action**: OPEN. Each anomaly is listed in the report for the run.

## 2026-10-25 - The RUNAWAY's raid can overspend: its materiel goes negative
**Finding**: E.mat seen at -4.
**Cause**: war.js think() step 4 checks `E.mat >= 36` then spends `12 * n` with n up to 5 (60).
**Action**: OPEN (suggestion: check `E.mat >= 12 * n`).

## 2026-10-25 - With no player, the LEVIATHAN decides most wars
**Finding**: in the first wars every TASK FORCE doctrine without an early KRAKEN strike lost the ALBATROSS to the
LEVIATHAN's shells (600 of 600 hp from 'shell') at 12-15 min.
**Evidence**: `node tools/sim/trycarrier.mjs BALANCED DEFAULT 1500 4` -> "shell: 600"; seed 5 TURTLE the same.
**Cause**: ANVIL + the shipyard build it at ~0.14/s -> at sea by ~12 min; 420 hp, 7.5 m/s (faster than the
ALBATROSS's 6), 320 m reach, nothing but bombs hurt it.
**Action**: reported in SIMREPORT (tuning suggestions). The CPU TASK FORCE strikes the shipyard once the hull is half
built, runs from the LEVIATHAN and sends every Hornet at her.

## 2026-10-25 - The RUNAWAY commander is always broke, so the KRAKEN never repairs
**Finding**: RUNAWAY materiel sits at 0-10 for the whole war (island-control table: 7-9 at every minute mark).
A Hornet strike doctrine sinks the KRAKEN in 5-22 minutes every time.
**Evidence**: pilot tournament (2 seeds): AIRPOWER beat every RUNAWAY doctrine by "ENEMY CARRIER SUNK" (5-22 min).
**Cause**: the KRAKEN's repair (3 hp/s) costs materiel (1 per 4 hp); think() spends every point on WASPs and guns.
**Action**: see SIMREPORT (the full tournament numbers).

## 2026-10-25 - Under the default tech tree the RUNAWAY does not research in the first 20 minutes
**Finding**: DEFAULT under `tech=default` started no research in a 20 min war (the TASK FORCE did 12 programmes).
**Evidence**: tools/simbench.mjs "under tech=default..." line (seed 21, 1200 s): RW none.
**Cause**: aiPickResearch keeps a 25 materiel reserve; the RUNAWAY never holds 25 + the node's cost.
**Action**: OPEN, see SIMREPORT tuning.

## 2026-10-25 - Normal play (tech=default): the RUNAWAY stays on tier 0 and the TASK FORCE wins nearly every war
**Finding**: with both trees starting 'default' (normal play since 047a748), the RUNAWAY researched something in 5% of
wars (REAPER, once a SHRIKE); RW-7 hover tanks, LANCE, SHAHEDs, MBTs and the LEVIATHAN programme were never
researched. The TASK FORCE researched its whole tree by ~22 min and won 63 of 65 wars (BALANCED: 45 of 47 on points
at the 45 min limit; RUSH: 18 of 18, 13 by sinking the KRAKEN).
**Evidence**: tools/runs/sim/2026-10-25-14-41-30-tournament-default (65 wars, stopped early; the doctrines BALANCED and
RUSH against all six RUNAWAY doctrines, 8 seeds each), report.md "RUNAWAY research" and "Never researched".
**Cause**: aiPickResearch keeps 25 materiel in reserve plus the node's cost; the RUNAWAY commander's think() spends
every point on WASPs, transports and guns, so its store sits at 0-10 and research never starts. The RUNAWAY doctrines
that keep a reserve (FORTRESS, DREADNOUGHT) did not get there either in these runs.
**Action**: OPEN - see SIMREPORT tuning suggestions (research budget for the RUNAWAY).
