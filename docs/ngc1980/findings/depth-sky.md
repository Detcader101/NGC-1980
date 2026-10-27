# Depth pass: sky, clouds, sun and aerial perspective (ngc/depth-sky)

Branch `ngc/depth-sky` from `ngc/shader-library` (4a47cbb). New area `sky` in `game/js/renderkit/adopt.js` (`?rk=0` is
classic; `?rk=world` alone keeps the rk-world kit sky). New module `game/js/renderkit/atmosphere.js`; hooks in
`game/js/main.js` marked `// RENDERKIT sky`; `createWorldSky` in `world.js` takes the atmosphere. Scene
`tools/scenes/depthsky.mjs` (`RK=0|all`, `SKY=low`, `VIEWS=...`). User report that started it: "add more depth and drag
it away from this roblox low tech look", with a first-person shot at the home base whose sky was an empty gradient.

## 2026-10-27 - Why the world looked shallow

**Finding:** the sky was a two-colour gradient with no sun, no cloud. Everything faded linearly from half the draw
distance to one flat haze colour (`mix(c, HORIZON, smoothstep(draw*.5, draw, d))`), so a hill at 300 m looked like a
hill at 50 m, and at the draw distance (720 m on foot, 1040 m at 200 m, 2600 m for a jet) the world ended in a pale wall.
From a jet above ~2600 m everything was past the far plane: the jet saw a blank haze-coloured floor.
**Evidence:** `tools/runs/depthsky-before/` (RK=all on shader-library 4a47cbb): hq, footup, huey200 (wall of haze past
the islands), jet1500/jet3000 (no ground at all).
**Cause:** a linear fog by design (the old retro look and the fps lever) and a draw distance capped at 2600 m.
**Action:** below.

## 2026-10-27 - Aerial perspective on every material, without per-material work

**Finding:** the haze has to be the same function in the terrain shader, the sky, and every built-in material (trees,
buildings, units, particles), or LOD and the draw edge show. Three's fog chunks give built-ins only `fogColor/Near/Far`.
**Action:** `installAtmosphere()` patches the fog chunks once at load (before anything compiles):
- `fog_vertex` also passes the world-space eye-to-vertex ray (`(vec4(mvPosition.xyz,0)*viewMatrix).xyz`, per eye in XR);
- `fog_fragment` applies `rkAerial`: optical depth of an exponential atmosphere (sea-level extinction 0.001 /m, scale
  height 320 m, closed form along the ray, so valleys and the sea are hazier and a jet sees clearer air), extinction
  stronger for blue than red, in-scatter = the clear sky along that ray (gradient + Mie glow round the sun). Hazed things
  turn into the sky behind them, so silhouettes recede in layers;
- past `fog.near` (now 0.8 x draw) an object dissolves with the visibility.js screen-door pattern instead of fading to
  one colour: what shows through is the terrain's own far look, then the dome's far land (below), so nothing pops.
- the uniforms (`rkHaze`, `rkHazeSun`, `rkHazeZen`, `rkHazeSunC`, `rkHazeSea`) are Float32Arrays added to `ShaderLib.*`
  and `UniformsLib.fog`. Three's `cloneUniforms` copies Colors/Vectors but shares typed arrays by reference, so one write
  per frame reaches every material with no registry. A ShaderMaterial without them reads zero = classic fog (safe).
The terrain shader's fog line is replaced (`#ifdef RK_SKY`) by the same `rkAerial`, plus a hand-over at the draw edge
to `rkFarLand / rkFarSeaCol`, the look the dome gives that same point.
**Evidence:** `runs/ds4/` hq, huey200, seahz; huey200 shows ten islands stepping back into the haze where before there
were three and a wall.

## 2026-10-27 - The land past the draw distance (the "far land")

**Finding:** the terrain worker already bakes an 8 km height window at 16 m round the camera (`HW[1]`), used for the
minimap. **Action:** `atmosphere.farHeights(d)` averages it to 256 x 256 R16F (32 m, linear filtered; half floats filter
in core WebGL2, unlike float32 on Quest). The dome raymarches that heightfield from 0.94 x draw to where the ray leaves
the window or meets the sea (56 steps high / 28 low, step = max(2.2 % of t, 0.55 x height above ground), 5 bisections),
shades it like the RK terrain (grass/forest, rock by height and slope, snow, beaches; sun colour + hemisphere ambient),
puts cloud shadow on it, fades it to sea in the last 500 m of the window, and hazes it. Past it, a sea plane (deep water
+ capped Schlick sky reflection + a soft glitter path) hazed the same way. The terrain dissolves into exactly this.
**Evidence:** `runs/ds4/04-huey200.png` (mountains on the right are far land, ~4 km), `09-jetdown.png` (zone islands
visible from 3000 m, before: nothing). `runs/ds5`: with the far land switched off (`rkFarO.w = 0`) they vanish.
**Note:** an island in `jet3000` looked cut by a straight line; a probe (`PROBE=` in depthsky.mjs) showed that was its
real, straight 32 m coastline; the window-edge fade is behind the HUD panel there. Not a bug.

## 2026-10-27 - Clouds: a 2.5D cumulus slab, raymarched in the dome and in a cloud floor

**Action:** one 256 x 256 RGBA8 tileable noise texture (R: coverage fbm, G: detail fbm, B: billows), 11 km tile. A
column's top = coverage x (0.5 + 0.5 billow) (+ detail): flat bases, domed tops. 28 steps (high) / 12 (low), finer
near the eye, white per-pixel jitter (IGN's structured pattern drew diagonal hatching on SwiftShader), one light tap
120 m towards the sun (lit tops, shaded bases), a forward-scatter silver lining, Beer alpha, then the same aerial
perspective as everything else by the mean depth, faded out 20-32 km. Short crossings that find no column at both ends
and the middle are skipped (most clear-sky pixels from the ground). Drift with the game clock (5.9 m/s), frozen on pause.
**Seen from above:** the dome is drawn first and behind the terrain, so from a jet over the clouds they would sit under
the ground. A camera-following disc at the cloud base (`rkCloudFloor`, transparent, depth-tested, after the opaque world)
marches the clouds between the eye and the base. Inside the slab both march from the eye, so climbing through it has no
popping slab. **Bug found and fixed:** the first disc (radius 0.95 x draw) was cut by the far plane and the dome also drew
the same clouds, so those rays were composited twice, with a straight seam. Now the disc's radius keeps its rim inside
the far plane (`sqrt((0.97 draw)^2 - dy^2)`), and the dome skips exactly the rays that meet the base inside it.
**Height:** first at 1150-1850 m. A sweep of `rawH` over 60 x 60 km found peaks to 1577 m (the nearest above 1150 m is
7.2 km out), and a dome-drawn cloud can never be in front of real geometry, so the base went to 1650 m (top 2400 m).
Sea state 5-7 lowers it to 1250 m (only 405 of 1 M samples are higher, all 7 km+ out).
**Evidence:** `runs/ds4/` footup, huey200, jet2000, jet3000, jetdown; `runs/ds3/` vs `ds2/` for the jitter change.

## 2026-10-27 - Sun, horizon, weather

**Action:** a 1-degree sun disc with a tight halo (pow 900 / 5000) and the Mie glow in `rkSkyBase` (pow 4 / 8 / 40),
at the DirectionalLight's direction and colour, read every frame (the light agent can move or recolour it). Horizon:
softHorizon's curve plus a milky band just above it; below the horizon the dome is far land / far sea, so the sea's
edge meets a sky of the same colour with no band. Weather: sea state 4 -> 7 raises coverage 0.42 -> 0.86, greys clouds
and zenith, lowers the base, thickens the haze and weakens the glow, cross-fading over a few seconds of game time.
**Evidence:** `runs/ds4/03-sun.png`, `05-seahz.png`, `10-ss7.png`.

## 2026-10-27 - Environment (rk-world contract kept)

**Action:** `createWorldSky({ atmosphere })`: the PMREM is built from the atmosphere's env variant (sky, sun, clouds held
still, darker ground below), rebuilt on the same contract: sun direction / colour, or the weather bucket (coverage in
quarter steps) changing. Never per frame; the cloud drift is not in it. The sea's sky reflection (`rkSkyZ`) follows the
weather zenith.

## 2026-10-27 - Cloud-shadow hook (for the nature / light agents)

**Action:** `RK_CLOUD_GLSL` exports `float rkCloudShade(vec3 worldPos)`: 1 in sun, 1 - 0.38 under a cloud, sampled along
the sun direction to the lower slab (one texture fetch). Uniforms: `rkCloudT`, `rkCloud`, `rkCloudL`, `rkHazeSun` (all on
`terrainUni` already, shared objects; for another material spread `atmo.uniforms` into its uniforms and include
`RK_HAZE_GLSL + RK_CLOUD_GLSL`). Applied here only in the terrain's fog/hand-over line (a whole-colour multiply, so
ambient is dimmed too; the far land and far sea use the same). Trees, buildings and units do not get it yet: the
right place is the sun term in the light agent's lighting, not the fog chunk.
