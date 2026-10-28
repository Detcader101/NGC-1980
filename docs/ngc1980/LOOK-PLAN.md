# NGC-1980 look pass: the plan for the rest

User, 2026-10-27, after playing the depth-sky build: **"that sky looks great ... make plan documents for the rest to
look as good and real as that."** Earlier: "add more depth and drag it away from this roblox low tech look ... in
every aspect."

This is the board for that work. Each workstream is sized for one agent on its own `ngc/look-<name>` branch, cut from
`ngc/shader-library` (which now carries every depth branch: sky, light, nature, materials, figures, post). Merge
target: `ngc/shader-library`, then main when the user says so.

## What made the sky work (the bar for every workstream)

1. **A physical model, not a palette tweak.** The haze is an exponential atmosphere with Rayleigh-like extinction; the
   clouds are a lit volume; the sun is where the light is. Start from how the real thing works, then stylise.
2. **One function, used everywhere it shows.** The same `rkAerial` runs in the fog chunk of every built-in material,
   the terrain shader and the dome, so nothing disagrees at a boundary. Look for the shared hook first
   (`renderkit/atmosphere.js`, the light agent's cascade chunk, `materials.js` detail library, `gamemats.js`).
3. **Seamless hand-overs.** LOD, draw distance and tier changes must be invisible: dissolve into the same look at the
   same point (the far land, visibility.js screen doors), never pop or fade to a flat colour.
4. **Every player view, from every height.** On foot at the home base (the user's view), Huey at 30 / 200 m, jet at
   1200 / 3000 m, a ship's deck, the tank sight, under water, the cave, VR in both eyes. Before/after side-by-sides
   (`tools/sidebyside.mjs`) in `docs/ngc1980/evidence/<branch>/`.
5. **Tiers and honesty about cost.** `high` desktop / `low` XR, A/B in one page (`tools/scenes/depthsky.mjs` shows how),
   SwiftShader numbers labelled as relative. `?rk=0` stays the classic game.
6. **Findings as you go** in `docs/ngc1980/findings/<branch>.md` (Finding / Evidence / Cause / Action).

## Where things stand (shader-library 376d501)

| Area | Done | Still reads "low tech" |
|---|---|---|
| Sky / atmosphere (depth-sky) | clouds, sun, aerial perspective, far land, cloud floor, weather | cloud grain without TAA; no time of day |
| Light (depth-light) | 2-cascade sun shadows, warmer sun / cooler sky, sun at ~42 deg | no cloud shadows on built-ins; interiors lit by the sun's ambient; no bounce light |
| Nature (depth-nature) | four tree species, wind, grass / bush / rock clutter, terrain micro-detail | crowns and rocks are big faceted blobs at 5-30 m; village trees old; far grid flat-shaded |
| Materials (depth-materials) | procedural detail library, contact AO, painted helipad | cockpits plain; buildings are boxes with painted windows |
| Figures (depth-figures) | smooth Marine, hands, M16A1, crowd LOD | triangle camouflage, jaw crease, other weapons not rebuilt |
| Post (depth-post) | depth AO, bloom, filmic grade | no anti-aliasing: thin masts, wires and tree edges shimmer |
| Sea | live swell, glint, foam, clarity | the ripple normal is a regular "fish scale" pattern from 100 m+ (very visible from the Huey); no cloud reflection |
| FX | GPU smoke / fire / dust | fires dim and flat, smoke not lit by the sun, explosions short |

## Direction change, 2026-10-27: a realistic simulator (read this first)

The user, after the depth pass: **"make everything look as good as the sky with shaders and redo things if needed to
make them look realistic. Realistic graphics with authentic models, the helicopter still needs to be redone to
properly match the UH-1 Huey from Cold War. Think like Arma Reforger Huey or DCS Huey. Also the terrain and buildings
need to have high fidelity assets. Also the player and person models look like some sort of Minecraft thing. We need
to go away from the blocky feeling. This isn't a retro game anymore. ... make voices for everyone with relevant
military correct call outs. I want this to be a simulator like Arma but further like DCS."**

What that means for every workstream:
- **The bar is Arma Reforger** for the world, people and ground vehicles, and **DCS** for aircraft, cockpits and
  systems. Low-poly, flat-shaded, box-built geometry is retired (BIBLE section 3 is updated). Redo, don't decorate:
  if a model is blocky underneath, a shader won't save it.
- **Authentic models** at real dimensions from public reference: manuals, drawings, photos, museum walkarounds.
  We build our own geometry, generated textures and self-authored glTF. We never extract or copy another game's
  assets, and we don't download third-party models.
- **Blueprints first (user, 2026-10-28: "search for open access free blueprints ... do the same with anything
  applicable").** Every vehicle, aircraft, ship, weapon, uniform and building starts with a web search for open-access
  dimensioned drawings, and the model is matched to a three-view overlay before any detailing:
  - **Sources:** US government TMs and FMs (public domain: DTIC, Army Publishing Directorate, archive.org scans),
    Wikimedia Commons (public domain or CC only), Smithsonian, NASA and museum open access, and ANSUR for bodies.
  - **Storage:** public-domain and CC files go in `docs/ngc1980/reference/<subject>/`, with a `SOURCES.md` line
    each (URL, licence, what it shows).
  - **Copyrighted drawings** (commercial blueprint sites and the like): keep only the URL and our measurements,
    never the image.
  - **Evidence:** cite every dimension in the branch's findings, and add a photo/render side-by-side in the
    branch's evidence folder.
- **Budgets still matter:** desktop at a high tier, the Quest via `?xrbench` at a low tier. LODs are mandatory for
  anything detailed.
- These workstreams come before the original list below.

### A. look-huey: the UH-1H rebuilt to DCS / Arma Reforger fidelity
Exterior: the real Bell 205 / UH-1H fuselage lofted from drawings, with smooth sections and proper curvature (nose, chin
bubbles, cabin doors on rails, tail boom taper, the vertical fin and synchronised elevator, skids with cross tubes and
steps). The two-blade 48 ft main rotor with stabiliser bar, swashplate and pitch links. The tail rotor and gearbox
hump, the engine deck, exhaust and intake screens. Antennas, the search and landing lights, door guns (M60D on pintle
mounts). 1980 USMC / Army markings and correct olive drab with wear. Interior: the cockpit rebuilt to DCS level (the
instrument panel layout, the overhead console, pedestal, collective and cyclic, seats with armour panels). Interactive
gauges and switches keep working. Cabin with troop seats and the crew chief and gunner stations. LODs. Keep `hueyfm.js`
unchanged.

### B. look-people: realistic humans, no more blocks
Replace the box/capsule people with anatomically proportioned, smooth, skinned bodies: a continuous mesh, not parts, on
the existing rigs and animations. Real heads and faces, hands, 1980 USMC utilities with folds, M1 helmet and cover,
ALICE gear and boots. Deck crew in proper float coats and cranial helmets, pilots in flight suits and HGU helmets,
townsfolk in 1980 civilian clothes. Smooth per-vertex or shader camouflage (woodland or OG-107 as BIBLE). LODs and
instancing for crowds. First-person arms with the same realism. The rest of the infantry weapons are rebuilt like the
M16A1 (M60, M203, LAW, M1911). This supersedes workstream 8.

### C. look-terrain: high-fidelity ground
Texture-based terrain materials (generated, tileable albedo, normal and roughness sets for grass, soil, rock, sand,
snow, tarmac and gravel, splatted by surface type, slope and height, with triplanar mapping on cliffs). A finer near-
camera mesh with smooth normals, real rock outcrops and boulders as geometry, roads with kerbs, verges and ruts, and
beaches with dune grass. Keeps fog of war, the LOD hand-over to depth-sky's far land, and every sim's per-point surface
types. Includes workstream 3's rock and far-grid items.

### D. look-buildings: high-fidelity architecture
Workstream 5, raised to Reforger level: modelled window frames and recesses, doors, sills, gutters, roof tiles and
ridges, chimneys and porches. 1980 European/Atlantic coastal architecture (stone cottages, rendered houses, a church,
a harbour, a pub). Base structures (sandbagged bunker, quonset, fuel farm, TPS-43) and the carrier island as proper
models with panel lines and detail. LODs and instancing.

### E. look-voices: voices and call-outs for everyone
Every person speaks: pilots and crews on the intercom and radio (Huey crew chief and door gunner call-outs, Hornet and
Tomcat flight comms, the carrier's tower and LSO, Air Boss and plane captains), Marines in combat (contact reports,
"CORPSMAN UP", fire-team commands, "FRAG OUT", "RELOADING", casualty calls), and commanders and controllers for the
command board. Use correct 1980 US Navy / USMC / Army procedure and brevity (no modern-only terms), radio processing
(band-pass, squelch tails, clipping) versus open-air voices with distance and occlusion, varied voices per person, and
priority and ducking so call-outs don't stack. Sources must be ours: browser speech synthesis run through the radio
chain, or samples we generate, with a fallback when no voices are installed.

## Workstreams, in priority order

### 1. look-sea: the ocean (biggest visible gap from the air)
- **Target:** open ocean as seen from a helicopter: wind-driven chop with no visible repeat, darker troughs, lighter
  crests, a glitter path towards the sun, cloud and sky reflection, foam streaks at sea state 5-7.
- **Approach:** replace the regular ripple normal (main.js `SEA_FS_NORMAL`, `rkf` ripple) with 3-4 rotated, scaled
  octaves of a baked normal texture (one RGBA tile, like the cloud noise) blended by distance; screen-space-size-aware
  so far water converges to `rkFarSeaCol` (atmosphere.js) instead of aliasing. Reflect `rkSkyBase` + a cheap cloud
  term (`rkCov` along the reflected ray at the cloud base) instead of the two-colour `rkSkyRay`.
- **Accept:** Huey 200 m and jet 1200 m shots with no visible tile or scale pattern; seasun glitter; ss7 streaks;
  underwater.mjs and the Snell's-window view unchanged.

### 2. look-light-2: cloud shadows everywhere, sky light, interiors
- Cloud shadows on built-ins: `rkCloudShade(worldPos)` inside the cascade shadow term (depth-light findings give the
  recipe: `onBeforeCompile` on the RK surface factories adding `atmo.uniforms`). Terrain: one line after `rkSunShadow`.
- Hemisphere / sky light that follows the atmosphere's zenith and weather; a cheap ground bounce colour from the
  terrain below.
- Interiors (carrier hangar, island rooms, cockpits): their own lights, no sun ambient leaking in.

### 3. look-nature-2: silhouettes at 5-50 m
- Tree crowns: break the blob into 6-12 clustered cards or lobed meshes with alpha-to-coverage leaf edges; normals bent
  outward (sphere normals) so crowns shade softly instead of faceted; translucency on the sun side.
- Rocks: smooth normals + the materials detail library (strata, lichen); village / hedgerow trees from the new species.
- Far grid: smooth normals from the heightmap so snow and slopes stop following 16-24 m triangles.

### 4. look-aa: anti-aliasing and thin geometry
- Desktop: TAA or SMAA in the post pass (TAA also removes the cloud jitter grain: feed it the jitter). XR: MSAA is
  already on; alpha-to-coverage for foliage, minimum projected width for wires, masts and antennas.
- Accept: a slow pan over the carrier island and a forest edge with no crawling pixels (record a clip).

### 5. look-buildings: towns, bases and the carrier
- Real window recesses, frames, roof overhangs and gutters as geometry on the near LOD; panel lines and rust streaks on
  the carrier island; sandbags and HESCO with soft bulges (materials has the pillow shader). Signs and markings as
  decals. Keep the LOD budgets in `world/visibility.js`.

### 6. look-fx: fire, smoke and explosions
- Fire with hot cores that bloom (post threshold is ready), smoke lit by the sun direction and in shadow on the far
  side, explosions with a flash, a fireball that rolls into smoke, debris and a ground scorch. Smoke and dust get the
  aerial perspective (they use the fog chunk already).

### 7. look-craft: aircraft, vehicles and cockpits
- Smooth shading groups, panel lines, canopy framing and glass with the environment; the Huey, Hornet, Tomcat and
  tanks first. Cockpit interiors: structure materials with detail (materials OPEN), readable gauges unaffected.
- **User report (2026-10-27): "the tomcat jet seems a bit glitchy."** Not yet investigated. First reproduce it in
  play (outside view, cockpit, carrier launch, swing-wing sweep, flight) and record what glitches: geometry
  (wing sweep pivots, z-fighting), the new shadows / dissolve on its materials, or the flight model / camera. Log it
  in this workstream's findings before fixing.

### 8. look-figures-2
- Per-vertex camouflage with a sharp shader threshold (no triangle blotches); one deformed head mesh (no jaw crease);
  M60 / M203 / LAW / M1911 rebuilt like the M16A1; the thumb on the pistol grip.

### 9. look-time (optional, ask the user first)
- A fixed late-afternoon or a slow day cycle. Everything already reads the sun from the DirectionalLight, and the
  environment rebuilds on a sun change, so this is mostly tuning (sun colour by elevation, sky and haze colour, night).

## Gates before any of this ships to main

- **Real hardware:** a desktop GPU frame-time A/B per area (the user's machine: 133 fps at 1080p before the depth pass)
  and Quest 3 via `?xrbench`. Every depth branch reports SwiftShader numbers only.
- **Tests:** the fish / sign pixel readback with post on is FIXED (2a10eda: measured on the canvas); underwater 6/6.
  The visibility.mjs 220 m threshold is still noisy (findings/orchestrator.md). foot.mjs fails 3 of 14 on the merged
  build (the ladder off the carrier and the walk to the pad); it passes 12/12 with `?rk=0` and with figures only.
- `?rk=0` pixel-identical to the classic build; `node tools/check.mjs syntax`; smoke, xr, worldvisibility, depthsky.

## Starting a session

The desktop shortcut **NGC-1980 CLAUDE** (`C:\Users\jayjay\Desktop\NGC-1980 CLAUDE.bat`) opens a fresh Claude Code
session in `/home/jayjay/thrust-zarch` (WSL Debian) that reads this plan and `PLAN.md` and proposes the next
workstream. It does not merge or push without asking.
