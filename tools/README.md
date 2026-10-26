# tools/ - headless oracle harness

## Benchmark and HTML devlog skills

Two independent Codex skills are versioned in [skills/benchmark](../skills/benchmark/SKILL.md) and
[skills/devlog](../skills/devlog/SKILL.md). Run `node tools/install-skills.mjs` from the experimental checkout to
link them into `${CODEX_HOME:-~/.codex}/skills`; existing unrelated skills are preserved. Open a new Codex session
if discovery has already been cached. Invoke `$benchmark` to measure/capture, or `$devlog` to explain evidence in HTML.

```sh
CHROME_PATH=/path/to/chrome node tools/benchmark.mjs --out tools/runs/my-change
node tools/devlog.mjs --notes notes.json --run after=tools/runs/my-change --out tools/runs/my-devlog
```

The benchmark samples seeded coastal flight and research, then captures PNGs and short silent MP4 clips. It writes
source/environment metadata, assertions, raw timings, video durations and decoded contact sheets. Sampling and
recording cannot overlap. `--frames 30` is a quick tooling check; default is 120 measured intervals after 30 warmup
frames. `--baseline RUN/result.json` compares only matching scene/seed/browser/GPU/viewport/host/sample settings.
`--no-capture` skips videos. `--gpu hardware` removes forced software rendering; check the reported GPU.
XR capture example: `node tools/benchmark.mjs tools/scenes/evidence-xr.mjs --frames 30` with `CHROME_PATH` set.

The devlog requires authored notes describing what changed, observed behavior and limits. It copies selected media
and raw results into a portable folder containing `devlog.html`, `assets/`, `data/` and a hash manifest. It works
offline; preserve the folder together. Input failures remain visible. Notes schema and detailed workflow:
[benchmark](../skills/benchmark/references/workflow.md), [devlog](../skills/devlog/references/workflow.md).

Clips use [Puppeteer Page.record](https://pptr.dev/api/puppeteer.page.record) / Chrome's experimental native screen
recording API; validated with Puppeteer 25.13.0 and Chrome 156. No FFmpeg dependency. Older browsers may fail capture.
Encoded clip duration can be shorter than its wall-time capture window, and video FPS is not game FPS. Benchmark
SwiftShader results and XR emulation do not certify physical GPU/headset performance.

`node tools/evidencebench.mjs` checks timing statistics, comparison rejection, capture exclusion/cleanup,
artifact boundaries and report behavior. Browser capture and HTML playback checks are separate.

## Screenshot harness

`snap.mjs` opens the game in headless Chrome with software WebGL (SwiftShader), runs a scene
script and writes evidence. Agents can use it to see and drive the game without a human.

## Setup (once)

```
cd tools
npm ci        # browser harness, IWER XR test runtime and html2canvas source; no bundled browser
```

The harness uses installed Chrome (`C:\Program Files\Google\Chrome\Application\chrome.exe`) and falls back to Edge.
Under WSL use a Linux headless Chrome through `CHROME_PATH` (a wrapper that unsets `WAYLAND_DISPLAY`/`DISPLAY` and adds
`--ozone-platform=headless`, otherwise SwiftShader WebGL fails; it also needs fonts, or canvas text is invisible).
Override it with `--browser <exe>` or the `CHROME_PATH` environment variable.

## Run

From the repository root, `npm --prefix tools test` checks module syntax and runs the Node regression programs.
`npm --prefix tools run check` is syntax only; `npm --prefix tools run bench` is the benches only.
Logs and a machine-readable summary are saved to `tools/runs/check-*/`; failures produce a nonzero exit code.
These checks do not need a browser. Current integration evidence: [VALIDATION.md](../docs/ngc1980/VALIDATION.md).

WebXR emulation, screenshots, benchmarks and HTTPS serving are described in [WEBXR.md](../docs/ngc1980/WEBXR.md).
`xrbench.mjs` tests input release/capture, hand gestures and the existing infantry projectile path. `servebench.mjs`
tests HTTP/HTTPS with owned temporary listeners and an OpenSSL-generated test certificate. `scenes/xr*.mjs` inject
IWER only into the test browser; the shipped game has no emulator. Run these browser scenes sequentially.

World visibility follow-up (run one browser at a time, from this directory):

```sh
node visibilitybench.mjs
CHROME_PATH=/path/to/chrome node snap.mjs scenes/visibility.mjs
CHROME_PATH=/path/to/chrome node snap.mjs scenes/worldvisibility.mjs
PARTS=swim CHROME_PATH=/path/to/chrome node snap.mjs scenes/sealife.mjs
```

`visibility.mjs` enters a normal default-tech game, opens research through the HUD/menu/board and checks naturally
spawned medium-quality shoals at 25/80/220 m through the chase camera. Same-frame on/off pixel comparisons prove that
sea life contributes to the actual image. `worldvisibility.mjs` approaches a real streamed town, moves the terrain
window, flies a scripted 2 km camera path, crosses the control-zone edge and surveys four island shapes. It records
frame-time percentiles, draw calls, triangles and streaming bounds. These SwiftShader timings are software-renderer
measurements, not consumer GPU performance. The island survey explicitly disables strategic masking; normal flight
and fish tests retain it.

```
node snap.mjs scenes/smoke.json                     # serves ../game on a free port itself
node snap.mjs scenes/cave.json --url http://127.0.0.1:8765/   # reuse a running server (start.bat)
node snap.mjs --name quick --query "?debug&auto" --steps "wait 1500" "shot a" "expect __G.G.mode==='zarch'"
npm run smoke  /  npm run cave
```

Options: `--url <base>`, `--query "<?qs>"` (overrides the scene), `--name`, `--out <dir>`, `--headful`,
`--browser <exe>`, `--width/--height` (default 1280x720), `--allow-console-errors`, `--steps ...` (inline steps),
`--seed N`, `--gpu swiftshader|hardware`, `--frames N`, `--capture` (enables a scene's optional clips).

Output goes to `tools/runs/<timestamp>-<name>/`:
- `NN-<shot>.png` - page screenshots at 1280x720
- `log.txt` - every step, console message (with source line), page error, failed request and HTTP >= 400
- `result.json` - `ok`, summary, GPU string, last `#dbg` fps text, eval values, expect results, and per-shot
  pixel stats (`meanLuma`, `litFraction`, `colors`) so you can spot black frames without opening the PNG

The exit code is **0** only if there were no page errors, no failed requests, no `console.error` (unless allowed)
and no failed `expect`/`notblank`/`waitFor`.

## Scene format

JSON: `{ "name": "...", "query": "?debug&auto", "allowConsoleErrors": false, "steps": [ ... ] }`.
Each step can be a string `"key hold Space 1000"`, an array `["key","hold","Space",1000]`, or an object
`{"op":"key","action":"hold","code":"Space","ms":1000}`.

| step | meaning |
|---|---|
| `wait <ms>` | wait on the game's clock when available; wall time on menus/dev pages or with `SNAP_WALL=1` |
| `key down <code>` / `key up <code>` | press or release a key. Codes are `KeyboardEvent.code` values: `Space`, `ArrowLeft`, `KeyF`, `Enter`, `ShiftLeft`... |
| `key tap <code> [ms]` / `key hold <code> <ms>` | press, wait (default 60 ms), release. `tap`/`hold`/`down`/`up` also work as top-level ops |
| `click <x> <y>` | left-click at viewport coordinates |
| `eval <js expr>` | evaluate in the page (async OK) and log the JSON result. Assigning to `window.foo` keeps a value for later steps |
| `expect <js expr>` | fail the run if the result is falsy or throws |
| `waitFor [timeoutMs] <js expr>` | poll until truthy (default 10000 ms of game time); bounded wall-time fallback when the clock stops |
| `shot [name]` | PNG screenshot and pixel stats |
| `benchmark [name] [frames]` | Rendered-frame sample, default 120 intervals after 30 warmup frames; no capture concurrently |
| `clip [name] [ms]` | Silent MP4 of the page, default 6000 wall ms, plus decoded poster/contact sheet |
| `notblank [minLitFraction]` | fail if the last shot is mostly black (default 0.05) or has 8 or fewer colours |
| `goto [query]` | navigate to another query string on the same server |
| `log <text>` | write a note to the log |

With `?debug` the game exposes `window.__G = { G, Z, T, newGame, enemies, dockStart }`
(`G.mode` 'zarch'|'thrust', `G.state`, `Z.pos` THREE.Vector3, `T` = cave state). Use `?debug&auto` to start
a game at once, or `?debug&thrust` to start in the cave.

JS scene: a `.mjs` file that exports either the same object, or `export default async function (h) {...}`.
Here `h` has `wait, key(action, code, ms), click, eval, expect, waitFor(expr, ms), shot, notblank, goto, log, page`
(`page` is the raw puppeteer Page).
It also has `benchmark(name, options)`, `clip(name, options, optionalAction)` and the boolean `capture`.

## Notes
- The default forces SwiftShader. Speeds depend heavily on scene and host; software timings are not GPU estimates.
  Game simulation caps its time step, so slow rendering can advance less simulation time than wall time. Clip duration
  uses wall time; the older `wait`/`key hold` helpers use game time when available.
- The scenes depend on the current `main.js` behaviour and may need updating when it changes.
