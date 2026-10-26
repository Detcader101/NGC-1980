# Continuum RenderKit

Reusable rendering for NGC-1980: physical military surfaces, atmospheric effects, quiet instruments
and restrained time-travel accents. Branch **`ngc/shader-library`**, based on `experimental` at
`4017e45`. Adoption is opt-in; the game entry point is unchanged.

Start with [the Claude handoff](renderkit-claude.md) and [public exports](../game/js/renderkit/index.js).
No build step, network assets, or new runtime dependencies. The adapter targets the vendored
**Three.js r170 / WebGL2**. Shared GLSL math is portable; Unity, Unreal, WebGPU/TSL and other
renderers need their own adapters.

## Preview and verification

From this branch's checkout:

```sh
node tools/serve.mjs --port 8771
# Open http://127.0.0.1:8771/dev/renderkit.html
# Add ?still for a repeatable paused composition.

node tools/check.mjs syntax
CHROME_PATH=/path/to/chrome node tools/benchmark.mjs tools/scenes/renderkit.mjs \
  --width 1440 --height 1080 --no-capture --out tools/runs/renderkit-review
```

On this machine Chrome's wrapper is `/home/jayjay/.cache/chs/chrome.sh`. In a fresh checkout,
install tooling with `npm --prefix tools ci`. The fixture checks linked shaders and pixel output,
then controls, five gallery views, mobile layout and reduced motion. It samples 30 rendered
intervals after 10 warmup frames. This is a preview measurement, not gameplay or hardware-GPU
qualification. See [the validation record](renderkit-validation.md).

## Coverage

| Game surface | API | Behavior |
| --- | --- | --- |
| Vehicles, characters, equipment, structures | `createSurfaceMaterial(preset, options)` | Standard PBR, maps, shadows, fog, skinning, morphs and instancing |
| Existing PBR materials | `applySurfaceDetail(material, detail)` | Dust, worn paint, wetness and camouflage |
| Glass / canopies | `createGlassMaterial(options)` | Physical transmission, IOR, roughness and absorption |
| Foliage cards | `createFoliageMaterial(options)` | Double-sided cutout PBR |
| Markings / impact stains | `createDecalMaterial(options)` | Lit transparent overlay with depth offset |
| Terrain | `createTerrainMaterial(options)` | Slope/altitude transitions: grass, rock, shoreline, snow |
| Water | `createWaterMaterial(options)` | Animated optical normals under physical lighting |
| Sky | `createSkyMaterial(options)` | Gradient hemisphere and sun; environment-source compatible |
| Smoke, dust, fire, sparks, rain, snow, temporal motes | `createParticleSystem(options)` | Instanced GPU motion, lifetimes and optional depth fade |
| Time anomalies / holograms | `createTemporalMaterial(options)` | Fresnel edge and antialiased scan modulation |
| GPU panels / reticles | `createHUDMaterial(options)` | Antialiased distance geometry with an open aiming centre |
| World / cockpit / screen text | `createTextLabel(options)` | Browser-shaped Unicode drawn through a GPU texture |
| Scalable atlas text | `createDistanceText`, `createDistanceTextMaterial` | SDF/MSDF, kerning, multiline BMFont layout, outline/weight |
| Menus / overlays / controls | `design.css` | Scoped minimalist components, optical spacing, focus and responsive layout |
| Final scene | `createPostPipeline(renderer, options)` | Grading, vignette, grain, night-vision tint and temporal distortion |
| Custom effects | `noiseGLSL`, `sdfGLSL`, `depthGLSL` | Renderer-independent math snippets |

Surface presets: `paintedMetal`, `armor`, `steel`, `aluminum`, `rubber`, `fabric`, `skin`,
`concrete`, `asphalt`, `wood`, `ceramic`, `wreck`. Skin/fabric are PBR starting points, not subsurface
scattering or fibre simulations. The library does not add geometry, animation, collision or gameplay.

## Basic integration

Keep the existing import map for `three`. From a module under `game/js/`:

```js
import * as THREE from 'three';
import {
  uniform, createSurfaceMaterial, createWaterMaterial, createParticleSystem,
  createTextLabel, createPostPipeline,
} from './renderkit/index.js';

const clock = uniform(0);
const armor = createSurfaceMaterial('armor', {
  map: albedoTexture, normalMap: normalTexture,
  detail: { dust: 0.18, wear: 0.12, wetness: 0, camouflage: 0.25, scale: 3 },
});
vehicleMesh.material = armor;
const waterMaterial = createWaterMaterial({ time: clock });
waterMesh.material = waterMaterial;
const smoke = createParticleSystem({ kind: 'smoke', count: 96, seed: 1980 });
scene.add(smoke.mesh);
const caption = createTextLabel({ text: 'ALBATROSS / 1980', height: 0.4 });
scene.add(caption.mesh);
const post = createPostPipeline(renderer);

function draw(simulationSeconds) {
  clock.value = simulationSeconds;
  smoke.update(simulationSeconds, camera, renderer);
  armor.userData.renderkit.uniforms.rkWet.value = weather.wetness;
  if (renderer.xr.isPresenting) renderer.render(scene, camera);
  else post.render(scene, camera, simulationSeconds);
}

// When this owner unloads:
smoke.dispose(); caption.dispose(); post.dispose();
armor.dispose(); waterMaterial.dispose();
// The caller still owns its meshes, geometries, maps and lights.
```

This sketch assumes a host scene, camera, renderer, textures, meshes and weather. The gallery is
the complete runnable example. Importing the library creates no renderer, DOM node or animation loop.
Freeze simulation time when paused or motion is disabled.

## Material contracts

Dimensions use metres / Y-up. CSS/hex colors are sRGB; Three converts them to linear working
colors. `setTextureRole(texture,'color')` is for albedo/emissive, `'data'` for normals/roughness/
metalness/AO/masks/distance fields, and `'hdr'` for linear radiance. It intentionally mutates the
caller's texture. Vertex colors are linear. Light physical materials with scene lights and preferably
a filtered environment; bare metal without reflections may look dark. Apply final tone mapping once.

Factories accept ordinary Three material options. `createSurfaceMaterial` accepts `detail:false`
to skip procedural work. Detail settings:

| Setting | Default | Meaning |
| --- | --- | --- |
| `scale` | 3 | Noise frequency in model-local units |
| `dust`, `wear`, `wetness`, `camouflage` | .12, .08, 0, 0 | Shader-clamped 0–1 amounts |
| `dustColor`, `bareColor`, `camoColor` | earth / alloy / green | CSS, hex or Three colors |
| `mask` | null | Optional UV0 data texture: R dust, G exposed-metal wear, B wetness |

Nonmetal presets default to zero exposed-metal wear. Keep it zero unless metal exposure is intended.
Without a mask, wear is procedural mottling, **not inferred edge curvature**. Camouflage uses
undeformed local coordinates so it follows moving/skinned models; terrain uses world coordinates
after skin/morph/instance transforms. Masks use UV0 without texture offset/repeat transforms.
Standard PBR maps remain active. Apply detail once, only to an unpatched Standard/Physical material.

Live values are in `material.userData.renderkit.uniforms`: `rkScale`, `rkDust`, `rkWear`, `rkWet`,
`rkCamo`, `rkDustColor`, `rkBareColor`, `rkCamoColor`, and `rkMask` in masked variants. Adjust values
without recreating programs. Changing whether a mask exists requires a new material. Do not use
`Material.clone()` or JSON serialization to preserve shader hooks; recreate through the factory.

The existing NGC fog-of-war helper replaces hooks. Apply it **before** surface detail:

```js
const material = new THREE.MeshStandardMaterial({ color: 0x66705a });
fogPatch(material, fog, timeUniform);
applySurfaceDetail(material, { dust: 0.2 });
```

`patchMaterial` chains previous hooks and adds distinct cache keys. Missing shader chunks fail
loudly after an incompatible Three update. Re-run browser checks after upgrades. Standard PBR
retains built-in skin/morph/shadow support; custom HUD/text/sky/temporal shaders support plain meshes
and instances, not skinned meshes. Do not stack multiple coordinate/noise patches on one material.

Terrain defaults: `snowLine:600`, `snowFade:80`, `shoreHeight:2`, `shoreFade:3`, `scale:.1`.
It blends procedural colors, not triplanar texture arrays. Add standard UV maps as needed. Rebase
large worlds before rendering to avoid position/noise precision loss.

Water is opaque and changes normals only: no wave displacement, shoreline foam, planar reflection,
refraction or buoyancy. Sky is an artistic gradient, not physical scattering. Glass uses Three's
transmission path and its extra rendering cost. Decals need caller-projected or surface-aligned
geometry. Foliage does not include wind deformation.

## Particles

`createParticleSystem({kind,count:96,seed:1980,spread:1,loop:true,...overrides})` returns
`{mesh,material,uniforms,update,setDepthTexture,dispose}`. Overrides: `color`, `endColor`, `size`,
`speed`, `gravity`, `life`, `opacity`, `stretch`, `additive`. Speed is vertical metres/s; gravity is
signed Y acceleration in metres/s². Quad size is in world units; emitter origins/velocities are local.
Instance attributes: `rkOrigin` vec3, `rkVelocity` vec3, `rkSeed` vec2. Edit their arrays and mark
`needsUpdate` for custom spawn distributions.

`update(seconds,camera?,renderer?)` takes nonnegative absolute simulation time. Looping emitters
stagger ages; non-looping bursts start at zero. Reuse a burst with elapsed time since its next start.
Moving the mesh moves existing particles. Use stationary/world-coordinate emitters for trails.
There is no collision, drag, turbulence advection, respawn buffer or per-instance alpha sorting.
Separate smoke emitters sensibly; additive particles are order insensitive. Culling is disabled
because the CPU cannot bound GPU motion; hide distant emitters yourself.

For soft intersections, render opaque geometry to a **separate** target with a standard non-reversed
depth texture, then use `setDepthTexture(opaqueTarget.depthTexture, softness)`. Pass the same camera
to `update`. When drawing to a scaled offscreen target, set `uniforms.rkResolution.value` to its
physical dimensions after `update`. Depth and particles must cover the same full camera viewport.
Never sample an attached depth texture while writing it: use a prepass and separate destination/copy.
Perspective and orthographic conversion are supported; logarithmic/reversed depth and subviewports
are not. `setDepthTexture(null)` disables fading and is the default.

## Text and HUD

`createTextLabel({text,height:.4,fontSize:64,fontFamily:'sans-serif',weight:500,tint:'#e7e9df',depthTest:true})`
returns `{mesh,material,texture,setText,dispose}`. Height includes padded bitmap/all lines. Browser
shaping provides Unicode with installed fonts; await custom font loading first. Labels are textures,
not screen-reader content. Use semantic DOM or an accessible equivalent for critical screen text.
Call `setText` only when text changes. It replaces its texture when rebuilding the label, and the
`texture` getter returns the current allocation. Maximum bitmap dimensions: 4096px per axis.

For an atlas (font assets are supplied by the caller):

```js
setTextureRole(atlas, 'data');
atlas.minFilter = atlas.magFilter = THREE.LinearFilter;
const text = createDistanceText({
  text: 'OFFSET +106\nSIGNAL STABLE', font: bmFontJSON, atlas, mode: 'msdf', size: 0.4,
  tint: 0xe7e9df, outline: 0.02, outlineColor: 0x101719, depthTest: true,
});
scene.add(text.mesh);
text.setText('OFFSET +107');
```

Supply **single-page BMFont JSON** and a matching SDF/MSDF atlas, not a normal bitmap atlas.
SDF reads red, MSDF uses RGB median. Size is line height in world units. Weight/outline use
normalized distance values, not pixels. Positive weight expands glyphs. Origin is top-left,
Y upwards; offsets, advances, kerning, newlines and atlas `flipY` are honored. Missing glyphs
fall back to `?`, or throw if absent. No complex-script shaping, wrapping, ligatures or fallback
font composition in this helper; use canvas text or a shaped glyph pipeline. The caller owns
font licensing and borrowed atlases. The returned object owns its geometry/material.

HUD panels/reticles use PlaneGeometry UVs. Width, height, stroke and radius share layout units
(usually pixels); the plane's physical size is independent. Set `depthTest:true` for cockpit/world
placement. Overlay defaults: `depthTest:false`, `depthWrite:false`, `toneMapped:false`. Use an
orthographic overlay camera and render after post so critical text remains sharp:

```js
post.render(scene, camera, seconds);
const saved = renderer.autoClear;
renderer.autoClear = false;
renderer.clearDepth();
renderer.render(hudScene, hudCamera);
renderer.autoClear = saved;
```

## Post-processing

`createPostPipeline(renderer,{scale:1,vignette:.12,grain:0,saturation:.92,contrast:1.02,temporal:0,nightVision:0})`
owns a linear scene target/fullscreen triangle. It uses HDR half-float when available, otherwise
8-bit linear color, where highlights clip. `post.hdr` reports the choice. The renderer's tone mapper
and display color conversion run in the final shader; do not add another output conversion.

`render(scene,camera,seconds)` sizes from the destination; `setSize(width,height)` takes physical
pixels. It preserves render target, viewport, scissor, clear color/alpha, autoClear and XR-enabled
state. Render the world once through it, then HUD. The output depth buffer is not copied from the
world: clear depth or disable depth testing for overlays. It expects a full view; split-screen/atlas
views require caller composition with separate targets. This is not an EffectComposer or XR pass.
Active XR presentation throws; bypass the post chain with direct scene rendering.

Live uniforms: `rkTime`, `rkVignette`, `rkGrain`, `rkSaturation`, `rkContrast`, `rkTemporal`, `rkNight`.
Temporal distortion is a small bounded displacement, default zero. Night vision is a luminance tint,
not thermal sensing or target detection. For reduced motion freeze time and set grain/temporal zero.
The gallery respects the preference; the library intentionally installs no global listeners.

## UI design system

Load `game/js/renderkit/design.css`; add `class="rk-ui"` to the component root. All rules are scoped.
Use semantic buttons, labels, inputs, selects and tables. Available styles include shell/header,
asymmetric content/rail layout, panels, fields, controls, statistics, chips, tables, type and focus.
The host implements menu behavior/modal focus management. No external fonts are downloaded.

- **Optical balance:** align related elements without forcing equal margins. Desktop shell:
  36px left / 52px right, 52px content-to-rail gap, 28px rail inset. Grouping is deliberate.
- **Negative space:** spacing tokens 4, 8, 12, 20, 32, 52, 84px. Smaller within a group, larger
  between decisions; leave the central viewing area open.
- **Logo principles:** a two-bar sample mark with unequal lengths, one repeated angle and a clean
  negative interval. Preserve at least one cap-height of clearspace. It is an optional identity,
  not a mandated game logo. Simple accent bars repeat the motif without boxing everything.
- **Postmodern detail:** oversized tight headings, occasional off-axis accents and muted lavender
  era markers; body copy remains conventionally spaced.
- **Color:** charcoal/chalk and desaturated field green; mint for active controls, amber/red for
  caution/critical with words/icons too, lavender for time. Avoid competing accents and noisy borders.
- **Interaction:** 44px controls, visible keyboard focus, explicit labels, mobile reflow, tabular
  telemetry and reduced-motion rules. The host still checks contrast over its scene, accessible
  naming, keyboard navigation and target resolutions.

## Cost, ownership and scope

Share materials and atlases. Procedural surfaces add noise evaluations per fragment; use
`detail:false` for small/distant objects. Bound particle count and screen coverage: one draw per
emitter does not make transparency overdraw free. Dispose each owner's materials, geometry and
targets on removal. Borrowed maps are never disposed by the library. Plain material factories
return materials, which the caller disposes normally. There is no global resource cache.

This foundation does not make every asset realistic by material replacement alone. Geometry,
normal maps, textures, lighting, scale and animation still determine the result. Adopt components
incrementally. The gallery is isolated from game materials, physics, saves, economy and UI flows.

References: [Three color management](https://threejs.org/manual/pages/color-management.html),
[material compilation/cache hooks](https://threejs.org/docs/pages/Material.html),
[final output conversion](https://threejs.org/docs/pages/OutputPass.html). The implementation is
tested against the vendored r170; current docs may describe newer revisions.
