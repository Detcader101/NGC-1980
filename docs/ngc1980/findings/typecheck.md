# ngc/typecheck - findings

User request (Jay Jay): JavaScript feels "a bit fucky"; TypeScript instead of a Rust rewrite, the game stays a browser
game. Phase 1 = type checking the existing JS with no build step (`node tools/check.mjs types`). Plan for Phase 2:
[TYPESCRIPT.md](../TYPESCRIPT.md). Branch `ngc/typecheck` off `ngc/shader-library`.

## 2026-10-28 - Baseline: 761 errors raw, 608 after declarations and core JSDoc
**Finding**: tsc 6.0.3 with `allowJs`/`checkJs`, not strict, `@types/three` 0.170.0, over the 269 files in `game/js`.
| step | errors |
|---|---|
| raw (no declarations) | 761 |
| + `game/types/globals.d.ts` (window hooks) + `game/vendor/html2canvas.d.ts` stub (9 errors were inside the vendor bundle) | 643 |
| + JSDoc on craft host, war, RK adopt, RenderKit factories, a few option objects | **608** (the committed baseline) |
**Evidence**: `node tools/check.mjs types` -> `Types: 608 errors in 105 files (baseline 608)`, ~12 s.
116 of the 608 are in files other agents are rewriting (huey*, units/infantry, renderkit/nature.js, world/structures.js,
world/models.js, interiors, albatross.js); they are reported here, not edited.
**Action**: `tools/typecheck-baseline.json` holds the per-file counts; the check fails only when the total rises.

## 2026-10-28 - What the 608 are: almost all JS idioms tsc cannot follow, not bugs
**Finding**: by error code: 353 TS2339 (property does not exist), 62 TS2556 (spread of an array into `.set(...)`),
36 TS2322, 34 TS2345, 43 TS2362/2363 (arithmetic on booleans or `string|number`), 23 TS2554 (argument count),
19 TS2365, 10 TS2353, 7 TS18047. The patterns, with how to clear each:
- **Expando objects**: `const H = { ... }; H.at = ...` in another function, `S.dead = false` then `S.dead = 'crash'`,
  engine objects that gain `stalled` later (tomcatplay.js: 13). Fix: a `@typedef` for the object.
- **Destructured options with `= {}`**: `function f({ war, fog, sim = false } = {})` - tsc only keeps the keys with
  defaults, so every caller passing `war` is an error (markerlayer, hotas createControls, fishsim, makeTerrainEnv,
  pilot.js `fly`, inventory `findFree`, medical, ballistics `mv`). Fix: `@param {{...}} [opts]`. Done for the first
  four; the rest are in other agents' files or not core.
- **Placeholder callbacks**: `onSwitch: () => {}`, `groundY = () => 0`, `matFn = () => 0` are inferred as taking no
  arguments (the 23 TS2554, none a real arity bug). Fix: type the slot.
- **Arrays as tuples**: `pos.set(...[x, y, z])`, `for (const [k, l] of list)` over mixed arrays (62 + ~40).
- **three.js narrowing**: `obj.traverse(o => o.isMesh && o.material...)` (26), `scene.fog.near`.
- **DOM**: `e.target.closest`, `$('radar').getContext` on `HTMLElement` (~40). Fix: `/** @type {HTMLCanvasElement} */`.
**Cause**: tsc's JS inference is per assignment; the codebase builds objects incrementally and uses arrays as tuples.
**Action**: leave in the baseline; clear them file by file when a file is converted (TYPESCRIPT.md, Phase 2 order).

## 2026-10-28 - REAL: `needle` icon defined twice; RW NEEDLES ammo shows the 14G catheter icon (OPEN, infantry)
**Finding**: `game/js/units/infantry/invui.js:35` and `:79` both define the key `needle` in the ICON table. The second
(a catheter: grey needle with a yellow hub, line 79) silently replaces the first (a row of four thin darts, line 35,
in the ammunition block). `items.js:150` `r_rwn` (RW NEEDLES, ammo) and `items.js:263` `needle_14g` (14G catheter,
medical) both say `icon: 'needle'`, so the flechette ammo is drawn as a medical catheter.
**Evidence**: tsc TS1117 "An object literal cannot have multiple properties with the same name", invui.js:79.
**Cause**: two agents (infantry ammo, medical) each added a `needle` icon.
**Action**: OPEN for the infantry owner (file is being rewritten; not edited here): rename the line-35 icon to
`rwneedle` and set `icon: 'rwneedle'` on `r_rwn` in items.js.

## 2026-10-28 - REAL: the sounds `sfx.ui`, `sfx.refuel`, `sfx.hit` never existed; 20 calls are silent (OPEN, audio)
**Finding**: `class Sfx` (audio.js) has no `ui`, `refuel` or `hit` method. Every call is written `sfx.ui?.('select')`
/ `sfx.refuel?.()` / `sfx.hit?.() ?? sfx.boom(0.3)`, so nothing fails, but: the pause-menu / craft-switch / jump /
lift "select" click never plays (main.js:1123, 1560, 2165, 2168, 2173, 2194; drop.js:215; armorcraft.js:200), refuel /
field repair / fire-out are silent (main.js:1036, 1116, 1129), and every "hit" falls through to a boom or thump
(main.js:1153, foot.js:329, marine.js:525, jetplay.js:80, tomcatplay.js:107, armorcraft.js:502).
`Sfx.betty()` also reads `this.muteVoice`, which nothing ever sets (audio.js:195).
**Evidence**: tsc TS2339 "Property 'ui' does not exist on type 'Sfx'" (and refuel, hit, muteVoice); grep finds no
definition anywhere in game/ or tools/.
**Cause**: callers were written against sounds that were planned and never added (the `?.` hides it).
**Action**: OPEN, not fixed: adding sounds changes how the game plays, so it is the audio / look-voices owner's call.
Either add `ui(kind)`, `refuel()`, `hit()` to Sfx (blip / noiseBurst like the others), or delete the dead calls.
Left in the baseline so the type check keeps pointing at them.

## 2026-10-28 - Checked and not bugs (so nobody re-investigates)
- `c130fm.js:254` `e.fire === 'out'` while `fire` starts `false`: fire is `false | true | 'out'` (drop.js:78, 446).
  Same pattern: `S.dead = false` then `'crash'` / `'rollover'` in the rotary sims (ch46play.js:240 compares it).
- `airlift.js:315` `F.lpath` "did you mean path": a second path the figure walks (squad.js:46 uses it).
- `trackfm.js:164` `c.N` "did you mean n": N is the contact normal force, n the normal vector.
- `marine.js:134` hit `x / y / z / armour` "missing": raycastHitboxes adds them after building the object.
- `main.js:1590, 2767` `hh.at`, `hh.yaw`: landinghard.js `finish()` adds them.
- `war.js:435` `buildGunship(side)` ignores `side`: gunships come from `ROT.make` (the WASP) first; this branch is
  never reached for `'gunship'`.
- `chunkgen.js:210` `farmItems(f, hf)`: farmItems takes one argument and reads the height itself.
- `weapons.js:295` `cycle(mods)`: cycle() takes no argument; the stoppage odds do not use the injury mods. Possibly
  intended to; flagged for the infantry owner, harmless as is.
- A sweep with `noUnusedLocals` (231 hits) and `allowUnreachableCode: false` (0 hits) found leftovers only, no
  unreachable code. Two dead functions in main.js: `refuelAtBase` (:1823) and `startTransition` (:2076).
- No `Cannot find name` (undefined variable) errors anywhere in game/js.

## 2026-10-28 - JSDoc quirks worth knowing
- An object built by assignment (`const W = {...}; W.x = ...`) is *open* in a JS file: `war.typo` is not an error,
  and `ReturnType<typeof createWar>` only has the literal's initial keys. The fix is an explicit `@typedef War` and
  `const W = /** @type {War} */ ({...})`; that also checks every `W.x =` inside war.js.
- `skipLibCheck: true` would hide errors in `game/types/*.d.ts` (it caught a wrong `XRRenderState.layers`
  redeclaration); the config keeps it `false` (+2 s).
- `@types/three` r170 lacks `WebGLRenderTarget.isXRRenderTarget` (a real flag the renderer reads):
  `// @ts-expect-error` with the reason at gamepost.js and xr/bench.js.
- A `@typedef` must start its own JSDoc line; after text on the same line it is ignored silently.

## 2026-10-28 - Merge notes
- `renderkit/adopt.js`: `RKArea` lists the areas. A branch that adds an area to `RK_AREAS` must add it to `RKArea`
  too, or `RK.on('newarea')` fails the type check (that is the point).
- `war.js`: a branch that adds `W.something =` must add `@property` to the `War` typedef above `createWar`.
- `main.js`: the `window.__G = {...}` object moved into `function debugBridge()` just above it (same members, same
  getters, built only under `?debug`). A branch that adds a member to `__G` adds it inside `debugBridge()`.
