# Running and extending evidence capture

From the selected repository root, install tools with `npm --prefix tools ci` if needed. Set `CHROME_PATH` to an
installed Chrome/Chromium. On this WSL machine it is `/home/jayjay/.cache/chs/chrome.sh`.

```sh
CHROME_PATH=/path/to/chrome node tools/benchmark.mjs --out tools/runs/before
# Make the authorized game change, then repeat with the same flags and scene.
CHROME_PATH=/path/to/chrome node tools/benchmark.mjs --baseline tools/runs/before/result.json --out tools/runs/after
```

The default scene uses seed 1980, 1280×720, desktop `res=0.45`, 30 rendered warmup frames and 120 measured
intervals per case. It tests a peaceful coastal hover and the research screen, then records six-second wall-time
windows. This is a scripted viewing fixture, not an unscripted piloting or war-balance test. `--frames 30` is a
quick tooling check; use repeated, longer runs for a performance conclusion. All samples, including slow intervals,
are retained. `--no-capture` skips videos but retains screenshots after sampling.

`--gpu hardware` stops forcing SwiftShader; verify the actual GPU string before calling a run a hardware test.
`--seed N`, `--width N`, `--height N`, `--query QUERY`, `--browser PATH`, `--url URL`, and `--headful` are supported.
Prefer the owned local server: external-server provenance is recorded separately from the local checkout.
For XR, create/adapt a scene using `tools/xr-harness.mjs`, enter XR, then call `h.benchmark`. The sampler uses the
XR session's callback and unique rendered frame counter. An XR mirror clip is not a headset view/comfort test.

## Scene API

Existing `h.shot`, `h.expect`, `h.key`, `h.eval`, `h.page`, etc. remain available. Add:

```js
await h.benchmark('island-approach', { frames: 120, warmup: 30, timeoutMs: 120000 });
await h.shot('island-approach');
await h.notblank();
if (h.capture) await h.clip('menu-interaction', { durationMs: 6000, fps: 15 }, async () => {
  await h.page.click('#fleet [data-research]');
});
```

`h.clip` accepts 1–30 seconds of **wall time**, not accelerated game time. Its optional action must finish within
that window (a two-second grace is allowed); otherwise the run fails and the recording stops. Use short direct
input calls inside it. `h.benchmark` and `h.clip` cannot overlap. A screenshot/navigation through the harness also
fails while either is running. Direct raw-page calls remain the scene author's responsibility.

JSON/string steps work too: `"benchmark flight 120"`, `"clip flight 6000"`, or
`{"op":"clip","name":"flight","ms":6000}`. Native recording uses Puppeteer's
[Page.record](https://pptr.dev/api/puppeteer.page.record) and requires Chrome support for
`Page.startScreenRecording`. The validated local combination is Puppeteer 25.13.0 / Chrome 156. No FFmpeg is needed;
older browser builds may lack this experimental API. A capture failure fails the run instead of silently omitting it.

## Artifacts

Each run contains `result.json`, `benchmark.json`, `log.txt`, PNG screenshots, MP4 clips, posters and contact sheets.
`result.json` identifies the source commit, dirty state, current game content hash, scene hash, seed, browser/GPU,
viewport, host, assertions, raw frame samples and clip metadata. Source changes during a run fail the harness.
`benchmark.json` records summaries and optional baseline comparisons. Mean-based observed FPS is `1000/mean ms`;
the median interval is not sustained FPS. Percentiles use the sorted sample at `floor((N-1)*p)`.

Contact sheets are decoded by seeking the **saved MP4** at 12%, 50% and 88% of its encoded duration. The MP4 has
no audio. Native capture can lose initial/intermediate frames; read both encoded duration and requested wall window.
Automatic decoding proves playable media, not correct gameplay. Inspect the contact sheet and screenshots before
writing observations. Keep raw runs in ignored `tools/runs/`; the devlog builder copies selected evidence into a
portable report so later cleanup of raw runs does not break it.
