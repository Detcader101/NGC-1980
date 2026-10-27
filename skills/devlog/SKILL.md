---
name: devlog
description: Turn NGC-1980 / Thrust Zarch gameplay evidence into an offline HTML devlog with screenshots, playable clips, benchmark results and explanations of what changed and what works. Use to document a completed game change or review captured runs.
---

# Devlog

Produce an HTML development record grounded in the changed code and observed gameplay. Use `tools/devlog.mjs`
in the selected repository; `/home/jayjay/thrust-zarch-experimental` is the playable integration checkout.
Read [the workflow and notes schema](references/workflow.md) when assembling a report.

Inspect the relevant diff, test assertions, benchmark provenance, screenshots and decoded clip frames. Use existing
evidence when it actually covers the change. If evidence is missing, capture the relevant scene through the repo
harness or `$benchmark`; do not invent a before image, passing result, performance gain or visual review.

Explain each change as player-visible behavior: what changed, why, what the evidence shows, which assertions passed
or failed, and what remains uncertain. Label scripted positioning, debug unlocks, peaceful fixtures, emulated XR and
software rendering where they affect the conclusion. Preserve failures that matter to the report, even if a later
run passes. A screenshot proves a moment; a clip covers only its recorded interval. Keep remaining ambitions visible.

Write the editorial notes JSON, select concise screenshots/clips, and build `devlog.html` with its copied assets
and raw data. Mark media `reviewed: true` only after inspecting it. Use before/after labels only for identified
versions and comparable viewpoints. The HTML report may include existing test runs without a fresh benchmark.

Open the generated report in a browser. Check images, video metadata and playback/seeking, internal links, narrow
layout and the visible explanations. Return a direct link to the HTML file and mention material test limits.
The folder is the portable artifact: retain `assets/`, `data/` and `manifest.json` with the HTML. Publish nothing
externally unless requested. Update the repo's existing docs with the report location when completing a game change.
