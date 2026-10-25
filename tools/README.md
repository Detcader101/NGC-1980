# tools/ - headless oracle harness

`snap.mjs` opens the game in headless Chrome with software WebGL (SwiftShader), runs a scene
script and writes evidence. Agents can use it to see and drive the game without a human.

## Setup (once)

```
cd tools
npm ci        # pinned puppeteer-core only, no bundled browser
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

```
node snap.mjs scenes/smoke.json                     # serves ../game on a free port itself
node snap.mjs scenes/cave.json --url http://127.0.0.1:8765/   # reuse a running server (start.bat)
node snap.mjs --name quick --query "?debug&auto" --steps "wait 1500" "shot a" "expect __G.G.mode==='zarch'"
npm run smoke  /  npm run cave
```

Options: `--url <base>`, `--query "<?qs>"` (overrides the scene), `--name`, `--out <dir>`, `--headful`,
`--browser <exe>`, `--width/--height` (default 1280x720), `--allow-console-errors`, `--steps ...` (inline steps).

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
| `notblank [minLitFraction]` | fail if the last shot is mostly black (default 0.05) or has 8 or fewer colours |
| `goto [query]` | navigate to another query string on the same server |
| `log <text>` | write a note to the log |

With `?debug` the game exposes `window.__G = { G, Z, T, newGame, enemies, dockStart }`
(`G.mode` 'zarch'|'thrust', `G.state`, `Z.pos` THREE.Vector3, `T` = cave state). Use `?debug&auto` to start
a game at once, or `?debug&thrust` to start in the cave.

JS scene: a `.mjs` file that exports either the same object, or `export default async function (h) {...}`.
Here `h` has `wait, key(action, code, ms), click, eval, expect, waitFor(expr, ms), shot, notblank, goto, log, page`
(`page` is the raw puppeteer Page).

## Notes
- Headless WebGL comes from `--use-angle=swiftshader --enable-unsafe-swiftshader`. The GPU string reads
  `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) ...), SwiftShader driver)`. Expect roughly 25-35 fps
  in Zarch and about 65 in the cave. Game physics use real dt, so timings roughly match a real browser.
- The scenes depend on the current `main.js` behaviour and may need updating when it changes.
