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

## Board
| Feature | Branch | Wave | Status | Notes |
|---|---|---|---|---|
| Rename, bible, plan | experimental | 0 | done | |
| Merge main into experimental (sky carrier refit -> key 6) | experimental | 0 | done | |
| SKYFIX: Huey/jet held on a climbing sky deck; helm reads raw stick | ngc/skyfix | 1 | merged c5ec4f5 | sky 8/8 |
| FOUNDATION: craft framework, on-foot, enter/exit, ground physics host | ngc/foundation | 1 | | owns main.js |
| INFANTRY: soldier movement, weapons, ballistics, first-person viewmodels | ngc/infantry | 1 | | |
| MEDICAL + INVENTORY | ngc/medinv | 1 | | |
| TANK M60A3 TTS (+ M113A2 shares the track sim) | ngc/tank | 1 | | |
| WHEELED: M151A2 MUTT, M35A2 | ngc/wheeled | 1 | | |
| NAVAL: ALBATROSS 1980, KRAKEN seized CVN, LEVIATHAN, container ship | ngc/naval | 1 | | |
| AIR AI fixed-wing: F-14A on a real FM, MQ-9, Shahed | ngc/airfw | 1 | | |
| AIR AI rotary: CH-46 + Marines, MV-22B, RW-3 WASP | ngc/airrot | 1 | | |
| C-130H Hercules (replaces MULE 1) | ngc/c130 | 1 | | |
| DEFENCE, game-tuned (first agent blocked by an auto-mode safety check; relaunched without real-world weapon data) | ngc/defence-v2 | 1 | | |
| STRUCTURES + LIVED-IN WORLD: bases both sides, villages, roads, civilians | ngc/world | 1 | | |
| RUNAWAY ground: RW-1 STRIDER, RW-7 hover tank, seized M1A2/T-90M | ngc/rwground | 1 | | |
