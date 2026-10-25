# NGC-1980 findings

What we learned while building and testing: bugs and their causes, measurements, sim results, balance signals, dead
ends, and anything a later agent or the user should know. The user asked for this ("make sure to document findings").

Rules for agents:
- Each branch writes its own file, `docs/ngc1980/findings/<branch>.md` (e.g. `bugsweep.md`), so merges never conflict.
- Add an entry as soon as you learn something, not only at the end. Entry format:
  `## YYYY-MM-DD - short title` then **Finding**, **Evidence** (numbers, scene/bench, screenshot path or commit),
  **Cause** (if known), **Action** (fixed in <commit> / open / suggestion).
- Write plainly for a reader who wasn't there. Facts and numbers, not narration.
- Open problems you found but did not fix go here too, marked **OPEN**.

The orchestrator keeps `orchestrator.md` (cross-branch findings, merges, user reports).
