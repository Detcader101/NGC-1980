---
name: benchmark
description: Benchmark the NGC-1980 / Thrust Zarch sandbox with repeatable rendered-frame samples, gameplay checks, screenshots and short clips. Use for performance comparisons or visual evidence of a game change.
---

# Benchmark

Produce measured evidence from the actual running game. Use the repository's `tools/benchmark.mjs` and
`tools/snap.mjs`, preserving the chosen worktree and its game content fingerprint. The experimental checkout is
`/home/jayjay/thrust-zarch-experimental`; the classic `main` is a different game version. Locate the appropriate
checkout before running. Read [the workflow](references/workflow.md) for commands and the scene API.

Choose a short fixture that reaches the changed behavior. Reuse existing scenes where possible; use the default
coastal-flight/research fixture for a general capture. Run one browser at a time. Benchmark with no screenshots,
recordings, other test browsers or CPU regression batches running concurrently. Capture media afterward.

For a before/after claim, retain a baseline from the earlier code and repeat the same scene, seed, browser,
renderer, resolution and sampling policy. The tool rejects comparisons with mismatched settings. A repeated run
of unchanged code measures repeatability, not an improvement. Do not disguise a missing baseline or a failed run.

Inspect the PNGs and decoded clip contact sheets. Where motion is the claim, inspect more frames or play/seek
the clip; three thumbnails do not establish every intermediate frame. Report what the rendered evidence supports
alongside the actual assertions. Population counts alone do not establish visible fish, and a nonblank frame
does not establish correct scenery. Keep visual observations distinct from automated checks.

Return the run directory, source identity, relevant numbers, failures and limits. SwiftShader is a software
renderer; XR emulation is not headset qualification. CPU phases are smoothed CPU costs; draw counters are from
the last render pass. Video encoding rate is never game FPS, and encoded duration can differ from capture time.
Hand evidence to `$devlog` when an HTML development report is requested; benchmarking remains independently usable.
