# NGC-1980 — plan and status board

The orchestrator (main Claude session) keeps this file current. Read [BIBLE.md](BIBLE.md) first.

## Branches
- `main`: last stable Thrust Zarch (desktop icon "Thrust Zarch", port 8765, checkout /home/jayjay/thrust-zarch).
- `experimental`: NGC-1980 integration branch (desktop icon "EXPERIMENTAL", port 8766, worktree
  /home/jayjay/thrust-zarch-experimental). Every feature is merged here after review and tests.
- `ngc/<feature>`: one per agent, cut from `experimental`.

## Orchestrator loop
1. Launch a wave of agents (background, worktree isolation), each with one focused feature and this repo's BIBLE.
2. When an agent reports: read its report, check its branch (diff stat, shared-file hooks), run its bench and scenes
   in the experimental worktree after merging, look at screenshots.
3. Merge into `experimental` (`git merge --no-ff ngc/<feature>`), fix conflicts, run smoke + affected scenes, commit.
4. Treat the feature as user-confirmed and launch its next step (integration, AI, polish) as a follow-up agent.
5. Update the board below and MODLOG.

## Waves
- **Wave 1** (2026-10-23): foundation + independent unit cores, each in its own files.
- **Wave 2**: integrate the cores through the foundation API (drive / fly / walk in the game), AI behaviours in
  war.js, new war roles (ground war on the islands).
- **Wave 3**: lived-in polish, combined arms, balance, performance pass, full regression.

## Board (updated 2026-10-23 ~11:30)
| Feature | Branch | Wave | Status | Notes |
|---|---|---|---|---|
| Rename, bible, plan; main merged into experimental | experimental | 0 | done | sky refit on key 6 |
| SKYFIX | ngc/skyfix | 1 | merged | sky 8/8 |
| MEDICAL + INVENTORY | ngc/medinv | 1 | merged | bench 109/109 |
| NAVAL | ngc/naval | 1 | merged | navalbench 22/22 |
| DEFENCE (game-tuned) | ngc/defence-v2 | 1 | merged | first agent blocked by safety check |
| INFANTRY | ngc/infantry | 1 | merged | bench 90/90 |
| RUNAWAY ground | ngc/rwground | 1 | merged | bench 48/48 |
| FOUNDATION | ngc/foundation | 1 | merged | foot.mjs 9/12, naval.mjs 3/5 (Y change), infinite 5/6 (H.reset snaps back): foot2 owns |
| AIR fixed-wing | ngc/airfw -> airfw-2 | 1 | merged | airbench 28/28, tomcatbench 32/32, Hornet bit-identical |
| AIR rotary | ngc/airrot | 1 | merged | ch46 21/21, mv22 21/21, wasp 13/13 |
| TANK | ngc/tank | 1 | merged | tankbench 72/72 |
| WORLD | ngc/world | 1 | merged | worldbench pass |
| C-130 | ngc/c130 | 1 | merged | c130bench 38/38; drop.json 4/5 (stick routing since FOUNDATION): dropfix |
| WHEELED | ngc/wheeled | 1 | running | |
| On-foot integration (real Marine + medinv) | ngc/foot2 | 2 | running | + naval.mjs Y, H.reset fix |
| Ground war (RUNAWAY + Marine squads in war.js) | ngc/rwwar | 2 | running | |
| Armour in the game (M60A3, M113, landing craft) | ngc/armorgame | 2 | running | |
| Sea + world follow-ups (waves, sea state, strings, elevators, colliders, enemy ship mounts) | ngc/seaworld2 | 2 | running | |
| Flyable F-14A | ngc/tomcat | 2 | running | |
| Dropship stick fix | ngc/dropfix | 2 | running | |
| Next: wheeled in game; rotary/defence/C-130 follow-ups (soldier figures, WASP balance, RWR lamps, flares); wave 3 regression + perf + playtest | | 2-3 | queued | |

Rule learned: keep weapons at game level (headline figures, game-tuned damage, no guidance/seeker/penetration research). Deep real-world weapon modelling trips auto mode's safety check and stops the agent.
