# Claude handoff: reusable GPU library

User intent: reusable shaders across the visual stack, on a separate branch, with realistic military
surfaces and a restrained time-travel aesthetic. UI uses optical/asymmetric spacing, negative space
and simple logo geometry. Do not automatically replace game rendering or UI.

- Branch: **`ngc/shader-library`**, from `experimental` commit `4017e45`.
- Local worktree: `/home/jayjay/thrust-zarch/.claude/worktrees/shader-library`.
- Public imports: `game/js/renderkit/index.js`.
- UI components/tokens: `game/js/renderkit/design.css`.
- Contracts/examples: [renderkit.md](renderkit.md).
- Runnable gallery: `/dev/renderkit.html` on the static game server.
- Checks: `game/dev/renderkit-checks.js`, driven by `tools/scenes/renderkit.mjs`.
- Evidence: [renderkit-validation.md](renderkit-validation.md).

Inspect from another checkout:

```sh
git show ngc/shader-library:docs/renderkit.md
git log experimental..ngc/shader-library --oneline
git diff experimental...ngc/shader-library -- game/js/renderkit game/dev/renderkit.html game/dev/renderkit.js docs
```

When asked to adopt it, work in this worktree or bring the desired files into the target branch.
Do not merge unrelated branches or change the user's active checkout just to inspect the library.

1. Keep the existing Three r170 import map. ESM/embedded GLSL need no new runtime packages.
2. Apply the existing `fogPatch` to a base PBR material **before** `applySurfaceDetail`.
3. Recreate patched materials with factories; `Material.clone()` does not preserve shader hooks.
4. Use one simulation clock and honor pause/reduced motion. Particle motion is emitter-local,
   with no collisions or per-instance sorting. Trails need a stationary coordinate frame.
5. Post-process world first, then HUD/text. Bypass this desktop post pipeline in XR. Soft particles
   need a separate opaque depth prepass and a matching full viewport/camera.
6. Paint, fabric, rubber, wood and skin are primarily dielectric. Exposed-metal wear defaults to
   zero on nonmetal presets. Do not indiscriminately turn every surface metallic.
7. Keep UI sparse, group with clearspace, preserve semantic controls and keep effects off vital text.
8. Re-run browser checks after changing shaders, uniforms, text or renderer state; syntax alone
   does not prove GLSL compiles or renders correctly.

Suggested user phrase: **“Use the Continuum RenderKit on `ngc/shader-library`; read
`docs/renderkit-claude.md` first.”**
