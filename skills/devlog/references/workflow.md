# Assembling the report

From the appropriate repository root:

```sh
node tools/devlog.mjs --notes notes.json --run after=tools/runs/after --run before=tools/runs/before --out tools/runs/devlog-change
```

`--run ID=DIR` is repeatable. Omit the before run when none exists. The output directory must be new or empty;
the default is a new timestamped directory in `tools/runs/`. A failed input run remains visibly failed in the report.
Legacy screenshot runs are accepted, but missing provenance is marked unknown and structured benchmarks are absent.

## Editorial notes JSON

```json
{
  "title": "Coastal visibility and research access",
  "date": "2026-10-26",
  "summary": "Explain the concrete result of this change in one or two sentences.",
  "reproduce": "Give the actual commands or scene/flags used for these runs.",
  "changes": [
    {
      "title": "Coastal flight",
      "change": "Describe the actual code change and its player-facing purpose.",
      "observed": "Describe only what you saw in the selected evidence.",
      "checks": ["Describe the relevant actual assertion and outcome."],
      "limitations": ["For example, a scripted hover does not test manual flight endurance."],
      "media": [
        {"run": "after", "shot": "coastal-flight", "label": "Current build", "caption": "State what this image shows.", "reviewed": false},
        {"run": "after", "clip": "coastal-flight", "caption": "State what happens in the clip.", "reviewed": false}
      ]
    }
  ],
  "limitations": ["List remaining issues and untested conditions."]
}
```

The sample prose is guidance, not a claim to copy into the final report. Use exact `shot`/`clip` names from the run's
`result.json`; missing assets and run IDs fail the build. Each media item names exactly one `shot` or `clip`.
Put before and after images together in `media` with explicit labels; the gallery places them side by side.
Select only useful evidence; raw run JSON is retained separately. Text is HTML-escaped, not treated as markup.

The HTML includes authored explanations, images, native video controls, decoded-frame contact sheets, actual
benchmark tables/traces, optional comparison results, assertions and source/environment metadata. It makes no
automatic visual correctness claim. `manifest.json` hashes every copied artifact. No remote scripts, fonts or
network fetches are needed to open the report. Open `devlog.html` directly, or serve its folder with a local server.

Review at desktop and narrow widths, open the assertion details, play and seek each clip, and verify that the
selected images load. Contact sheets are useful for inspecting motion but can miss transient defects. For a claim
about pop-in or smooth transitions, inspect the interval around the actual transition, not just three samples.
For a durable checked-in report, use a dated directory under `docs/devlogs/` and link it from the current docs.

```sh
CHROME_PATH=/path/to/chrome node tools/devlogcheck.mjs tools/runs/devlog-change/devlog.html
```

This checks artifact hashes, links, decoded images, offline video seek/playback, document overflow at 1280 and 390 px,
and browser errors. It captures desktop/mobile report screenshots for visual review. These layout/playback checks
do not substitute for reading the prose and inspecting the game's selected media.
