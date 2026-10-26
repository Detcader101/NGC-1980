# Sandbox strategy report

## Expanded control zone — 2026-10-26

The 2.56 km map was rerun with the current terrain, navigation and recovery code, default research, the AI strike
wing, a 1/30-second step, no patches, and seeds 1–2. **8/8 wars completed**, covering **360 simulated minutes in
5.0 wall-clock minutes** on two workers. No failed workers, numerical anomalies or negative stores appeared in the
saved samples. These are regression observations; this small sample does not establish balance.

All eight reached the 45-minute limit: **seven Task Force points leads and one RUNAWAY points lead, no decisive
victories**. Both factions researched and captured islands. The Task Force made 59 captures; RUNAWAY made 12 across
five wars. Task Force completed 13 research programmes in each run; RUNAWAY completed 5–10.

| Task Force doctrine | DEFAULT | SWARM |
|---|---|---|
| BALANCED | 1 TF lead, 1 RW lead | 2 TF leads |
| AIRPOWER | 2 TF leads | 2 TF leads |

First shots averaged 2.12 minutes, first captures 2.88 minutes, quiet minutes 18.6%, and longest lulls 2 minutes.
These coarse pacing measures do not measure enjoyment. The smaller-map October 25 matrix below is historical;
it is not a controlled before/after comparison because the map, recovery behavior and selected doctrines differ.

Three ambitions remain concrete:

- **Decisive endings:** none of these wars finished within 45 minutes. Wider-map campaign pacing needs human play
  sessions and broader doctrine/seed coverage, including DREADNOUGHT and HORDE.
- **Research into production:** every RUNAWAY researched SHRIKE, but none built one. Military spending still competes
  with aircraft purchase cost after the research gate opens.
- **Aircraft attrition:** Task Force escorts averaged 33.5 built / 32.4 lost; Sea Knights 29.4 / 18.5. The ten isolated
  real-island recovery trials all trapped, but that does not explain contested combat losses or certify endurance.

```sh
node tools/warsim.mjs --blue BALANCED,AIRPOWER --red DEFAULT,SWARM \
  --seeds 2 --tmax 2700 --workers 2 --tech default --name expanded-visibility
```

[Committed results](evidence/sandbox-sim-2026-10-26.json) retain configuration, aggregate results and the capture,
research, attrition and numerical-state audit. Raw records/report:
`tools/runs/sim/2026-10-26-08-32-27-expanded-visibility/` in the visibility-ui worktree. Headless wars use the game's
war/unit/commander code with baked terrain and renderer stubs; browser behavior is checked separately in
[VALIDATION](VALIDATION.md).

## Historical smaller-map integration — 2026-10-25

This pass uses CPU wars to find broken gameplay loops and record pacing. These are regression observations,
not proof of faction balance or a substitute for playing the game.

## What the experiments found

| Experiment | Configuration | Observation |
|---|---|---|
| Research baseline | BALANCED/DEFAULT, seeds 1–3, default tech, 20 minutes | RUNAWAY completed no research; military purchases consumed its income |
| Research correction | Same three seeds and duration | All three completed REAPER, hover armour, fabrication and SHRIKE; two completed SHAHED |
| First doctrine matrix | Three player doctrines × four enemy doctrines × two seeds, 45 minutes | No numerical errors, but zero enemy captures; tracing exposed transport crashes during boarding |
| Transport correction | BALANCED/DEFAULT, seed 1, default tech, 20 minutes | RUNAWAY captured BEACON, KILN and CINDER; the first transport unloaded, returned and stowed |

The initial matrix ended with 19 Task Force time-limit points leads and five decisive RUNAWAY wins by sinking
ALBATROSS. It is **intermediate evidence**, before the boarding/deck-motion correction. Its missing immediate-crash
losses also make its attrition counts unsuitable for comparison with the corrected telemetry.

The fixes protect the enemy's next research budget, keep military spending affordable, restrain transports during
boarding, synchronize deck movement/velocity before updating aircraft, and guide lift over the current deck spot.
Details and regression programs are in [findings/finish.md](findings/finish.md) and [VALIDATION.md](VALIDATION.md).

## Final matrix

The final matrix uses the corrected gameplay and telemetry, default research, the AI strike wing, a 1/30-second step,
no `catlane` patch, and seeds 1–2 for each pairing. **24/24 wars completed**, with zero recorded numerical anomalies,
no failed workers and no negative stores in the saved samples. They covered 1,020 simulated minutes in 16.1 wall-clock
minutes on two workers. Mean war length was 42.5 minutes; the median reached the 45-minute limit.

There were **two decisive Task Force wins, five decisive RUNAWAY wins, sixteen Task Force time-limit points leads,
and one time-limit draw**. All decisive results came from sinking a carrier. A points lead is not a completed campaign.

| Task Force doctrine | DEFAULT | SWARM | HORDE | DREADNOUGHT |
|---|---|---|---|---|
| BALANCED | 1 TF lead, 1 draw | 2 TF leads | 2 TF leads | 2 RW wins |
| RUSH | 2 TF leads | 1 TF win, 1 TF lead | 2 TF leads | 2 RW wins |
| AIRPOWER | 2 TF leads | 1 TF win, 1 TF lead | 2 TF leads | 1 RW win, 1 TF lead |

RUNAWAY completed 2–12 research programmes in every war and made **26 captures across 14 wars**, compared with zero
captures before the transport repair. Capture counts by enemy doctrine were DEFAULT 17, HORDE 6, DREADNOUGHT 2 and
SWARM 1. Enemy captures are functioning, but the doctrines still have very different expansion rates.

The next balance pass should investigate three concrete findings:

- **Finishing wars:** 17/24 reached the time limit. DREADNOUGHT sank ALBATROSS in five of its six matchups, while
  DEFAULT and HORDE produced no decisive result in this sample. Two seeds per pairing cannot establish dominance.
- **Research into production:** SHRIKE was researched in 20 wars but no SHRIKE was built. Other military spending
  still competes with the cost of that aircraft after its research gate opens.
- **Aircraft attrition:** Task Force escorts averaged 22.3 built and 21 losses per war; Sea Knights averaged 45.7
  built and 31.3 losses. Successful retirements are excluded. A sampled escort launched, patrolled, fought and was
  shot down on approach, so the count is not solely a launch failure. Broader combat/recovery diagnosis remains open.

The coarse pacing metrics averaged a first shot at 1.7 minutes, first capture at 1.9 minutes, 15% quiet minutes and
a longest lull of 2.13 minutes. The strength-based lead-change metric recorded zero changes; that does not erase the
decisive carrier losses or prove a match was enjoyable.

```sh
node tools/warsim.mjs --blue BALANCED,RUSH,AIRPOWER \
  --red DEFAULT,SWARM,HORDE,DREADNOUGHT --seeds 2 --tmax 2700 \
  --workers 2 --name finish-release
```

## How outcomes are measured

An actual end condition (carrier sunk or IRONHOLD taken) takes priority. At the time limit the report uses a change
in relative strength from the opening state. That number combines island value ×10, up to 400 materiel ×0.05,
carrier health fraction ×40, active aircraft ×2, ground-unit weight ×1.2, AA sites ×2, and a live LEVIATHAN bonus of 15.
HQ/factory/fortress/fuel/radar values are 3/2/2/1.5/1. Ground vehicles weigh 3, able Marines 0.5 and other ground units 1.
A change within five points is a draw. This is a reporting score, not the game's victory condition.

A quiet minute has fewer than 20 rounds fired and no losses, captures or destroyed structures. These coarse metrics
help identify inactivity and snowballing; they do not measure enjoyment. The report preserves metrics computed from
all samples, even when the JSONL output thins its saved timeline. Error runs remain in the output and fail the command.

## Evidence and limits

The committed [summary JSON](evidence/sandbox-sim-2026-10-25.json) retains the final matrix's configuration and results.
Raw local artifacts are under `tools/runs/sim/` in the integration worktree:

- `2026-10-25-17-32-05-finish-before`: research baseline.
- `2026-10-25-17-36-14-finish-after-research`: paired research correction.
- `2026-10-25-17-44-56-finish-final`: intermediate matrix; the historical folder name predates the transport finding.
- `2026-10-25-18-13-00-finish-verified`: transport corrected; successful aircraft retirements still overstated losses.
- `2026-10-25-18-32-59-finish-release`: final matrix, including corrected retirement accounting.
- `tools/runs/finish-transport-trace.log` and `finish-transport-v3.log`: transport traces before and after repair.
- `tools/runs/finish-air-attrition.log`: sampled escort launch/combat/recovery trace.

Each batch has `runs.jsonl`, `summary.json` and `report.md`. These generated artifacts are ignored by git. Two seeds per
matchup are too few to rank doctrines reliably. Headless wars use the actual war/unit/commander code with baked terrain,
renderer stubs and distant-combat detail. Browser rendering, player choices, near-player detail and hardware performance
need separate checks. Recovery accidents, difficult terrain, faction counters and decisive war pacing remain in
[the backlog](PLAN.md).
