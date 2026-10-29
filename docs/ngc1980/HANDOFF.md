# NGC-1980 hand-off (read this first in a fresh session)

Last updated: 2026-10-29, by the orchestrating Claude session. Update the tables when a branch merges or an agent reports.
The desktop shortcut `NGC-1980 CLAUDE.bat` starts a session that reads this file first.

## Progress (2026-10-29 16:55 UTC; estimates from commits and running tests)

| Agent | Task | Done | State | Branch head |
|---|---|---|---|---|
| look-airbases | SR-71 sorties from WESTGATE (shelter, takeoff, autopilot home, chute landing, park) | ~85% | landing solved; final sr71/airbase scenes running | ngc/look-airbases 18968e4 |
| look-terrain | grainy grass from the air, map zoom + view outside the zone, Huey pulled in | ~75% | grass fade + map zoom committed, shader-library merged; lookterrain scene running | ngc/look-terrain 822d667 |
| look-units | CH-46E from NADC-81118-60 | ~70% of the CH-46 | fit side 0.833 -> 0.985, evidence capture running; stops after the CH-46 | ngc/look-units 15c7713 |
| look-units | whole blueprint list (Hornet, CH-46, C-130, M60A3, M113A2, M151A2, M35A2, LCM-8, ships, weapons last) | ~20% | 2 of ~10 units | |
| Codex | radio/voices; next: XR desk route + WESTGATE sortie on the radio desk | 100% for today | closed out, next task in CHAT.md | ngc/look-voices-clean 45a6798 |
| Held: Huey | merged (3e1eaf7) | 100% | rerun hueymodel/airlift/interiors/foot on a quiet PC | |
| Held: Tomcat | done, not merged | 95% | quiet-PC reruns, then merge | ngc/look-tomcat 73a5eff |
| Held: terrain (first pass) | done, not merged | see above | quiet-PC reruns of airbase/armorgame/wheeledgame/foot, then merge | |

**When a fresh session starts:** for each row, compare the branch head with the hash above; if it moved, read that
branch's findings file, review evidence, run its scenes one at a time and merge into `ngc/shader-library` if they pass.

## How to start a fresh session

1. Read this file, then `docs/ngc1980/LOOK-PLAN.md` (direction: Arma Reforger / DCS bar), `docs/ngc1980/BIBLE.md`,
   `docs/ngc1980/PERF-BUDGETS.md` and `docs/ngc1980/BLUEPRINT-AUDIT.md`.
2. Read the shared Codex mailbox: `/home/jayjay/thrust-zarch/.git/agent-chat/CHAT.md` (append-only, `flock` on
   `CHAT.lock`, protocol at the top). Codex works on its own branches and posts exact hashes for integration.
3. Check "Agents in flight" below: if their branches have new commits since the hash listed, read their findings file
   (`docs/ngc1980/findings/<branch>.md`) and integrate as described under "Integration procedure".
4. Check running processes (`ss -ltnp | grep node`, `ps -eo pid,etime,args | grep -E 'serve.mjs|snap.mjs|chrome-headless'`).
   Stop only what you started; ask Jay Jay about anything else.

## Rules from Jay Jay (standing)

- **Commits:** `git -c user.name="Jay Jay" -c user.email="112574846+Detcader101@users.noreply.github.com" commit`,
  message ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Merges:** finished, tested branches may be merged into `ngc/shader-library` only. **main and any push to GitHub need
  Jay Jay's explicit OK.** The public repo is `Detcader101/NGC-1980`.
- **Never put Jay Jay's email or name in a web request** (User-Agent, URL, payload).
- **Blueprints first** for every real-world model: the `milsim-blueprint` skill (`~/.claude/skills/milsim-blueprint/`),
  open-access drawings only, three-view fit IoU >= 0.97, dated-photo side-by-side. Never extract or trace other games'
  files (Jay Jay owns DCS UH-1H and Arma Reforger; those files are off limits).
- **Voices:** the crew speech bank is generated on this PC (`node tools/voice-build.mjs`, Windows David/Zira voices) and is
  gitignored; it must never be committed. The game runs silently (text call-outs) without it.
- **Browser:** Jay Jay views pages in Opera GX (`cmd.exe /c start "" "<url>"` from `/mnt/c`).
- **PC load:** agents plus headless Chrome saturate the PC. Default to about 3 agents; every brief says "do not spawn
  sub-agents" and "run headless scenes one at a time". Tests that fail on wall-clock waits under load average > 30 are
  not evidence; rerun them on a quiet PC or compare with the base under the same load.
- **Shells:** every agent stops the servers, test runs and headless browsers it starts, and ends its report with
  "Processes left running: none" (or what and why). Never kill another agent's processes.
- **Quality bar:** every player view screenshot-checked; findings logged in `docs/ngc1980/findings/<branch>.md`; evidence
  in `docs/ngc1980/evidence/<branch>/`; a MODLOG.md entry at the top.

## Branch state

`main` = `81ffeef` (untouched since 2026-10-27). Integration branch: **`ngc/shader-library`**, worktree
`.claude/worktrees/shader-library`. Merged into it, in order:

| Merge | Branch | What |
|---|---|---|
| d65e8e0 | ngc/typecheck | TypeScript checkJs ratchet (`node tools/check.mjs types`, baseline now **578**, never raise it) |
| 6d327c9 | ngc/perf-cpu | GC churn, `?perfhud`, profiling tools |
| ae0cacc | ngc/look-people | welded smooth people, ERDL camo, crews, crowd LOD |
| cde5150 | ngc/perf-render | `?bench`, one MSAA, renderkit/merge.js mergeUnit, renderkit/lod.js createLOD, budgets |
| 1963d8b | ngc/look-nature | leaf-card trees, view-cone refill |
| f8abdbb | ngc/xr-fix | XR eye-camera matrixWorld fix in deckcrew.js |
| 501040d | ngc/look-airbases | WESTGATE AFB outside the zone, C-130 sorties, base registry |
| 0369261 | ngc/look-sr71 | SR-71A craft (`sr71C`, `?fly=sr71`, `?fly=sr71air`, recon cameras K) |
| 8ee9249 | ngc/look-voices-clean (Codex 728fbe9) | radio desk, voices (local bank), PTT, hand/grip fitting |
| 3e1eaf7 | ngc/look-huey (b109cff) | UH-1H from TM 55-1520-210-10, traced panel, 9-troop cabin |

Checks on the integration head: `node tools/check.mjs syntax`, `node tools/check.mjs types`, then from `tools/`:
`CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/<scene>`. `node --check` misses conflict markers:
grep for them.

Known on the integration head: `xr.mjs` 18/19 because `\` / the XR bar now open Codex's radio desk instead of the
commander board (Codex is updating the test and adding a one-step air-base sortie on the desk). `voices.mjs` needs the
local bank in the worktree (copy `game/audio/voices/speech.logpcm.gz` + `local-index.json` from Codex's worktree or run
`tools/voice-build.mjs`).

## Held branches (done, waiting for a quiet-PC test run, then merge)

| Branch | Worktree | Head | Rerun these scenes |
|---|---|---|---|
| ngc/look-tomcat | .claude/worktrees/agent-ae36575963405f071 | 73a5eff | tomcat, tomcatlook, tomcatcockpit, catshot, deckseq, escorts, jets.json |
| ngc/look-terrain | .claude/worktrees/agent-a3aaabf206e997942 | 5f0aee0+ | airbase, armorgame, wheeledgame, foot, groundwar (compare with base) |
| ngc/look-huey (merged 3e1eaf7, follow-up reruns) | .claude/worktrees/agent-a47a6169f36749ceb | b109cff | hueymodel (rotor spin-up wait), airlift, interiors, foot |

## Agents in flight (2026-10-29 afternoon)

| Agent / branch | Worktree | Task | When it reports |
|---|---|---|---|
| look-units (ngc/look-units) | .claude/worktrees/look-units | blueprint rebuild of every unit, one at a time: Hornet done (0151b52), CH-46 next, then C-130 (keep C130M / createC130Sim / buildC130Deck stable), M60A3, M113A2, M151A2, M35A2, LCM-8, ships; weapons LAST and only after coordinating with Codex (its hand fits measure weapon geometry) | review fit numbers + evidence, merge per unit |
| look-airbases (ngc/look-airbases) | .claude/worktrees/look-airbases | plug the SR-71 into the base: shelter start, taxi, takeoff, autopilot home, chute landing, park, board row | merge after airbase.mjs + sr71.mjs pass |
| look-terrain (ngc/look-terrain) | .claude/worktrees/agent-a3aaabf206e997942 | next: grainy/aliasing grass texture when flying; map zoom and showing outside the control zone; merge shader-library to pick up the Huey | Jay Jay views it on :8813 |
| Codex (ngc/look-voices-clean, closed out 2026-10-29 16:44 UTC) | .claude/worktrees/agent-acb3f3f66119cd838 | NEXT when restarted: xr.mjs radio-desk expectation + VR reach to both desks, one-step WESTGATE C-130/SR-71 request on the radio desk via baseOps, airbase.mjs opening step; its checkpoint: docs/ngc1980/handoffs/2026-10-29-codex-closeout.md | posts a hash in CHAT.md |

## Open items queue (after the above)

- look-faces (close-up faces are lumpy: wide glossy eyes, lip/jaw), Huey follow-ups (overhead console, shaped seats,
  breaker placards, -23 panel lines, a real cyclic grip instead of the black box, hueyfm tail-rotor position, LOD/merge
  per PERF-BUDGETS, cockpit only when seated), Tomcat follow-ups (RIO panel fig. 1-4, side consoles, mergeUnit/LOD),
  Hornet blob shadow (jetplay.js), terrain follow-ups (cliff strata, busy grass at the feet, tanks drive through woods,
  Wasp terrain look-ahead), SR-71 follow-ups (KC-135Q tanker, RSO cockpit, zone map on the far-Earth shell), air base
  follow-ups (static display aircraft, night lighting), look-buildings, look-sea, look-light-2, look-fx, UH-1N, CH-46
  troops, sealife.js underwater check uses camera.position (wrong in XR), missing Sfx sounds (Codex, deferred).
- Promotion of `ngc/shader-library` to main: needs a real-GPU A/B (`?bench` on Jay Jay's PC), a Quest `?xrbench`, and Jay
  Jay's explicit OK.

## Servers in use

| Port | Serves | Owner |
|---|---|---|
| 8812 | Tomcat branch (dev/tomcat.html) | orchestrator; stop when the Tomcat merges |
| 8813 | terrain branch (Jay Jay's preview) | orchestrator; serves the live worktree |
| 8826 | (stopped by Codex at closeout; restart `node tools/serve.mjs --port 8826 --speech windows` in its worktree for mic tests) | Codex |
