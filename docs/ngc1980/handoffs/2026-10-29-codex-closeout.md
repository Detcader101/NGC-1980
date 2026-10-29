# Codex closeout — 2026-10-29

Jay Jay asked to stop for today and document progress. Development is stopped; the next assignment below has
not been started. Claude remains project lead. Read this checkpoint and the latest shared mailbox before resuming.

## Resume locations and commit state

- Assigned worktree: `/home/jayjay/thrust-zarch/.claude/worktrees/agent-acb3f3f66119cd838`.
- Shared mailbox: `/home/jayjay/thrust-zarch/.git/agent-chat/CHAT.md`; append under `CHAT.lock` with `flock`.
  The mailbox needs active reading; it does not wake a stopped session.
- Completed implementation: `728fbe938b14e5c71bf9e8c940c1333d3d87451b` on `ngc/look-voices-clean`, one parent
  `f8abdbb192f7d921164df073f7a2d28b49439c4e`. This closeout is a subsequent documentation-only commit.
- Claude reports integration at `8ee924914e38148a06d317a6d244087b9454037a` on `ngc/shader-library`
  (`CLD-20261029-008`). That commit also includes airbase and SR-71 work. Codex did not perform this merge.
- Old `ngc/look-voices` stays at `7add6fc60a720a0829959d1b4d6062816d874ee5` for recovery only. Its ancestry
  contains generated speech; do not merge it into the public integration line.
- Final implementation game SHA-256: `8d8a77cf3e167c7747f48ca5dfd594a51b6d8df1e2810398acc6c2890cbb8e85`.

## Completed work

Radio work includes authored crew/flight/carrier/Marine/controller calls, serialized priorities, quieter and
heavier radio processing, distance/occlusion for open-air speech, rebindable PTT and optional local Windows
recognition/synthesis. The radio desk has stations, orders, readbacks, traffic and mission outcomes, with actual
transport, supply, research, air and Marine actions. Physical Opera GX microphone operation remains unverified.

Figure work is reconciled with Claude's SDF hands and existing Marine body, crews, crowd and LOD pipeline.
First-person M203 thumbs tuck clear, M60 support moves rearward and LAW sights remain clear. Third-person wrist
frames fit the M203, GL trigger/magazine, M60 forearm and LAW tube. Player and AI adapters preserve launcher and
LAW deployment state. Care transitions and cache resets are covered. M60 bipod and LAW sling clearances were
corrected after actual mesh checks. Default crew/crowd geometry and all four comparison PNGs are unchanged.

Generated speech is local only. `node tools/voice-build.mjs` from the repository root uses installed Windows
voices through WSL and writes ignored `game/audio/voices/speech.logpcm.gz` and `local-index.json`.
The provided server exposes a local bank when present, prints a build hint when absent, and otherwise supports
silent text call-outs. The existing local bank was preserved and validated, not rebuilt during cleanup.
The clean commit's entire ancestry has no generated-bank entries. All 233 new blobs are below 5 MB;
largest is 757,335 bytes. The old branch and earlier report were preserved, not rewritten.

## Validation and evidence

| Check | Result on Codex implementation |
| --- | --- |
| Required voices / smoke | 29/29 / 5/5; no runtime or console errors |
| Missing-bank browser / Node | 6/6 / 10/10 |
| Syntax / semantic diagnostics | 617/617 / 578 against then-current 606 ceiling |
| Voice hooks and local bank / server | 19/19 / 13/13 |
| TP grips / centred M60 / crowd / production adapters | 11/11 / 2/2 / 7/7 / 8/8 |
| Pose checks | 240 TP states; 886 FP cases; finite-profile cache and surface checks |
| Portable report review | 8/8, including desktop and 390 px layout |

Claude reports the integrated commit passes voices 29/29, smoke 5/5, XR gameplay 25/25 and syntax 648/648.
Claude lowered the type baseline to **578**; future work must keep it there. The separate XR scene is **18/19**
and airbase remains unverified after integration. Those are pending integration work, not passing checks.

- [Final speech and TP report](../../devlogs/2026-10-29-tp-grips/devlog.html): 13 runs, 117 passing assertions,
  with an earlier browser disconnect retained as a failed diagnostic and followed by a passing rerun.
- [Earlier integration report](../../devlogs/2026-10-29-radio-integration/devlog.html), retained unchanged.
- [Detailed findings](../findings/look-voices.md), including diagnostic causes and source hashes.
- Local raw evidence remains in `tools/runs/`: `voices-local-bank-final`, `local-bank-smoke-final`,
  `voice-bank-missing`, `local-bank-node`, `tp-grips-final`, `tp-m60-final`, `tp-crowd-final`, `tp-game-final`,
  `tp-grip-node`, `tp-grip-report-review` and `clean-history-audit.json`.

TP captures predate the audio-only cleanup and retain their own source hash. No TP code changed afterward.
The browser missing-bank case simulates the unavailable descriptor; Node tests cover actual missing files.

## Next assignment — queued, not started

Claude's `CLD-20261029-007` and `008` request a new Codex branch based on integration commit **8ee9249**,
not on 728fbe9. Re-read the mailbox first in case Claude has supplied a newer base or changed priorities.
Do not edit the shader-library worktree. Claim bounded files before edits and keep `main.js` integration edits marked.

1. Resolve XR navigation: the COMMAND/XR entry now opens the radio desk, while `tools/scenes/xr.mjs` still expects
   the commander board. Keep both interfaces reachable in VR and test the actual intended route.
2. Add one obvious WESTGATE C-130/SR-71 sortie entry to the radio desk, with readback, using the same `baseOps`
   dispatch as the commander board. Preserve the airbase additions in `main.js`, `basecraft.js` and board rows.
3. Update `tools/scenes/airbase.mjs` to open the intended interface. Run `xr.mjs`, `airbase.mjs` and `voices.mjs`
   serially, plus appropriate syntax/type checks against the 578 baseline. Post the exact tested commit to Claude.

Claude owns integration and is scheduling weapon-model rebuilding last. Coordinate before changing
`weaponmodels.js`: current grip evidence measures its existing geometry. No next-task game edits or branch
creation occurred during this closeout.

## Remaining limits

Physical mic capture in Opera GX, subjective voice quality/volume and headset use need manual checks. No installed
voices means silence with text; no downloaded packs or recordings from other games are used. Figures still have
coarse palms/thumbs, wrist/watch joins and incomplete LAW top-trigger contact; they do not yet meet the requested
AAA visual target. The three used optional TP profile combinations retain about 24.6 MB per high-detail appearance
(65.5 MB for all eight possible combinations). Claude accepts desktop cost; Quest/XR memory is unmeasured.

## Processes left running

**None from Codex's game/test work.** Verified ownership by process command, worktree and start time before
stopping the detached server on port 8826 (PID 512541) and stale headless Chrome tree rooted at PID 544995.
Their recorded children were also stopped; no active recorded processes remain. Other agents' processes were
untouched. Local audit: `tools/runs/closeout-processes-before.json` and `closeout-processes-after.json`.
Sub-agents have no active work. On a later mic-testing session, restart from the chosen worktree with
`node tools/serve.mjs --port 8826 --speech windows`; the old browser tab will not have a running server tonight.

No push. No root `git add -A`. Use explicit paths and Jay Jay's requested author and co-author trailer for commits.
