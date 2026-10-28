# NGC-1980 — TypeScript

The game stays a browser game with plain ES modules. TypeScript arrives in two phases.

## Phase 1 (done on `ngc/typecheck`): type checking only, no build

The game still loads `game/js/*.js` as before. Nothing in the browser changed.

| piece | what |
|---|---|
| `tsconfig.json` | `allowJs` + `checkJs` + `noEmit` over `game/js/**/*.js`. Module resolution `bundler`, the same relative-path ES modules the browser loads. `three` maps to `@types/three` r170 (the vendored `three.module.min.js` is r170; the import map in `game/index.html`). Not strict. |
| `game/types/globals.d.ts` | the `window.*` hooks: `__G` (typed as `DebugBridge`), `__xrlog`, `__xrbench`, `__WORLD`, the dev pages' `__BENCH` etc., `webkitAudioContext`, `XRRenderState`. |
| `game/vendor/html2canvas.d.ts` | a small stub so tsc does not check the 7,000-line vendor bundle. |
| `tools/typecheck.mjs` | `node tools/check.mjs types`: runs tsc, prints errors per file, compares with `tools/typecheck-baseline.json`. |
| `tools/package.json` | devDependencies `typescript` 6.0.3, `@types/three` 0.170.0 (`cd tools && npm ci`). |

### Running it

```sh
cd tools && npm ci            # once: installs typescript and @types/three next to puppeteer
node tools/check.mjs types    # ~12 s; exit 1 only if the TOTAL went up
node tools/check.mjs types --list war.js   # every error whose path contains "war.js"
node tools/check.mjs types --update        # after fixing errors: write the lower count into the baseline (commit it)
```

The check passes as long as the total does not rise. Branches can keep merging while the number comes down. A file
whose own count rose is marked `NEW +n` so its author can see what they added. `--update` will not raise the
baseline unless you also pass `--force`.

### Typed core (JSDoc)

| module | type | what the checker now catches in callers |
|---|---|---|
| `craft.js` | `CraftDef`, `CraftHost`, `CraftPL`, `PlayerView` | wrong `crafts.*` member names and arity; `register()` keeps the def's own type |
| `war.js` | `War` (W is cast to it where it is made) | a misspelt `war.member` (the type is closed), wrong argument types for `allow`, `setSea`, `deckY`... and any `W.x =` in war.js that is not declared |
| `renderkit/adopt.js` | `RKArea`, `RK` | `RK.on('natur')`: a misspelt area is an error |
| RenderKit factories | `createParticleSystem`, `createSkyMaterial`, `createDecalMaterial`, `createDistanceText*`, `decal`, `createSunShadows` | their option objects |
| `main.js` | `DebugBridge` (`function debugBridge()`, assigned to `window.__G`) | in-page code reading `window.__G`; `tools/scenes` reach it through `page.evaluate` strings, which tsc does not see |

Units, islands and projectiles are still `any`. That is the next typing job (below).

### How to write JSDoc that helps

- Option objects with `= {}` defaults: TypeScript only sees the keys that have defaults, so a key without a default
  (`{ war, fog, sim = false } = {}`) is reported as unknown at every call. Give the function a
  `@param {{ war?: War, fog?: any, sim?: boolean }} [opts]`.
- Objects built by assignment (`const W = {...}; W.x = ...`) are open in JS: any `W.typo` passes. Declare a
  `@typedef` and cast where the object is made: `const W = /** @type {War} */ ({ ... })`.
- Callback placeholders (`onSwitch: () => {}`, `groundY = () => 0`) are inferred as taking no arguments. Type the
  slot.
- `pos.set(...arr)` needs a tuple: `/** @type {[number, number, number]} */`. This is 62 of the current errors.
- `obj.traverse(o => o.isMesh && o.material...)`: use `if (o instanceof THREE.Mesh)` in new code. Leave old code
  alone unless you are already working in it.

## Phase 2: real `.ts` files (after the look pass merges)

Start Phase 2 only when the LOOK wave (huey, people, terrain, buildings, voices, sea) has merged. Renaming files
under six active branches would turn every merge into a conflict.

### The build: Node's type stripping, no bundler

Browsers cannot load `.ts`. The lightest step is **erasable TypeScript + Node's built-in type stripping**
(`node:module` `stripTypeScriptTypes`, present in the Node 22.23 installed here). No new dependency, no watch
process, no source maps needed (stripping replaces types with spaces, so line and column numbers stay the same).

1. `tsconfig.json`: add `"erasableSyntaxOnly": true` (no `enum`, `namespace`, parameter properties: things that need
   real code generation), `"allowImportingTsExtensions": true`, `"rewriteRelativeImportExtensions": true`. Source
   imports name the real file: `import { createWar } from './war.ts'`.
2. **Dev serving** (`tools/serve.mjs`) and the **test server** in `tools/snap.mjs` (it has its own static server):
   one shared helper, `tools/tsserve.mjs`. For a `.ts` request it reads the file, strips the types and sends it as
   `text/javascript`. The `'./x.ts'` import specifiers can stay as they are, because the same server answers them.
   The import map in `game/index.html` stays as it is. A reload still runs the latest file.
3. **Node benches** (`tools/*bench.mjs` import game modules directly): Node 22.18+ strips types on import, and
   `.ts` specifiers resolve as written (checked 2026-10-28: Node 22.23.3 runs an `a.ts` that imports `./b.ts`, no
   flags). Nothing to change beyond the file names in the imports.
4. **Release / static hosting** (the launcher, GitHub): `node tools/build.mjs` writes `game/dist/` (mirrored tree,
   `.ts` -> `.js`, `'./x.ts'` -> `'./x.js'` in import specifiers, through TypeScript's own scanner so only real
   specifiers change). Static hosts serve `.ts` with the wrong MIME type, so the release must be `.js`.

Fallback, if type stripping is too limiting: **esbuild** in transform mode (`esbuild game/src/**/*.ts --outdir=game/js
--format=esm`, no bundling), about 0.1 s for the whole tree, with `serve.mjs` calling esbuild's `transform` per request
in dev. It is one more dependency (a native binary) for no gain while the code stays erasable.

### Conversion order

Convert a module only once its JSDoc types are clean (zero errors in that file), so the rename is mechanical.

1. **Shared contracts first** (types only, no behaviour): `game/types/` gets `craft.ts`, `war.ts` (War, Unit, Island,
   Projectile), `env.ts` (the terrain / ground / sea callbacks every sim takes). Every later file imports these.
2. **Core sims and war logic**: `craft.js`, `ground.js`, `platform.js`, `footsim.js`, `war.js`, `sim/*`
   (rng, zone, doctrine, policy, redai, commanderai, strike, telemetry, spectator), `techtree.js`. These are pure or
   nearly pure, already covered by Node benches (groundwarbench, economybench, warsim), and are where a type error is
   a gameplay bug.
3. **Flight and vehicle models**: `hueyfm.js`, `jetfm.js`, `units/air/*fm.js`, `units/armor/trackfm.js`,
   `units/wheeled/vehiclefm.js`, `units/naval/seamotion.js`. Pure maths with benches and reference data.
4. **Unit hosts and AI**: `units/*/` craft and brain files, `units/groundwar/*`, `units/commander/*`.
5. **RenderKit** (`game/js/renderkit/*`): its API is already JSDoc-typed at the entry points.
6. **Models, cockpits, UI, main.js** last. They are the largest and most churned, and their errors are mostly
   three.js narrowing (`Object3D` -> `Mesh`), which is noise and not bugs. `main.js` should be split before it is
   converted (it is 2,800 lines).

### Strict mode

- Now: `strict: false`. The baseline means something, and real findings are not buried under `implicit any`.
- When a directory's files are converted to `.ts` with zero errors, turn on `strict` for that directory with a
  nested `tsconfig.json` (`extends` the root one, plus `"strict": true`). Start with `game/js/sim/` and the war.
- Turn on `strict` globally once the core sims, war and flight models are converted and clean (steps 1 to 3). Models
  and cockpits can keep `noImplicitAny: false` longer; `strictNullChecks` is the part that finds bugs.
- Keep `noUnusedLocals` off in the baseline (231 hits, all leftovers, no bugs found in a sweep). Turn it on per
  converted directory.
