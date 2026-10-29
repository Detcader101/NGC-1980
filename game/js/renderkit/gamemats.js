// RENDERKIT surface: the game's bridge to the Continuum RenderKit surface materials.
//
// The house style builds every model from flat-shaded Lambert/Phong materials coloured per part (or per vertex). This
// module gives the model kits drop-in replacements: with RK.on('surface') off (?rk=0) every helper returns exactly the
// legacy material it is handed, so the game looks as before; with it on, the same colour/vertex colours/emissive/side/
// transparency go into a MeshStandardMaterial whose roughness/metalness come from a ROLE (painted metal, lusterless
// army paint, armour, bare steel, rubber, canvas, glass, concrete, RUNAWAY ceramic...). Big hull skins also get the
// RenderKit's procedural dust / paint wear (applySurfaceDetail), small parts stay plain (no per-pixel noise).
//
// Lighting today is a HemisphereLight + a DirectionalLight sun and no environment map, so nothing here is very metallic:
// a metal with no reflections renders dark. Roles keep metalness <= 0.45 and roughness >= 0.3. When rk-world sets
// zScene.environment, Standard materials pick it up automatically (metal parts brighten, glass reflects the sky); the
// role table is the one place to retune.
//
// Rules from docs/renderkit-claude.md: fog-of-war (fogPatch) BEFORE applySurfaceDetail; never Material.clone() a
// patched material (rebuild through these factories); one noise patch per material; paint/rubber/canvas are dielectric.
import * as THREE from 'three';
import { RK } from './adopt.js';
import { createGlassMaterial, createDecalMaterial } from './materials.js';
import { applyUnitDetail, worldDetailShader, DETAIL_TIER } from './detail.js';   // ngc/depth-materials

export const RKS = RK.on('surface');
// ?rkdetail=0 keeps the RenderKit PBR roles but skips the procedural detail (cost probe, low-end); ?rkdetail=1 medium
// (60 m, no bump); default high (150 m). See renderkit/detail.js.
export const RK_DETAIL = DETAIL_TIER > 0;

// role -> { roughness, metalness }. Values are tuned for the hemisphere + sun rig (no env map), see the header.
export const ROLES = Object.freeze({
  paint:    { roughness: 0.58, metalness: 0 },      // semi-gloss aircraft paint (paint is a dielectric layer)
  flat:     { roughness: 0.8, metalness: 0 },       // lusterless army paint (olive drab, MERDC)
  armor:    { roughness: 0.78, metalness: 0 },      // painted cast / rolled armour
  hull:     { roughness: 0.66, metalness: 0 },      // ship hull / superstructure haze grey
  metal:    { roughness: 0.42, metalness: 0.35 },   // bare or oiled steel: guns, struts, pins
  grimy:    { roughness: 0.74, metalness: 0.2 },    // muddy / dusty working steel: track links, road wheel hubs
  chrome:   { roughness: 0.28, metalness: 0.45 },   // polished oleos, chrome trim (light colours only)
  rubber:   { roughness: 0.94, metalness: 0 },
  fabric:   { roughness: 0.97, metalness: 0 },      // canvas, webbing, seats, flight suits
  skin:     { roughness: 0.72, metalness: 0 },
  dark:     { roughness: 0.72, metalness: 0 },      // black plastics, anti-glare, interiors
  concrete: { roughness: 0.93, metalness: 0 },
  wood:     { roughness: 0.86, metalness: 0 },
  ceramic:  { roughness: 0.5, metalness: 0 },       // RUNAWAY matte ceramic / dark composite
  lamp:     { roughness: 0.3, metalness: 0 },       // lenses and lamps (emissive carries the light)
});

// Procedural detail presets (scale = noise frequency per model-local metre).
export const DETAIL = Object.freeze({
  // ngc/depth-materials: panel = panel-line grid (m, 0 none), streak = rain / oil / rust runs down the sides
  air:   { dust: 0.1, wear: 0.1, scale: 1.6, dustColor: 0x8f8a7c, bareColor: 0x9a9ea0, panel: 0.85, streak: 0.16, streakColor: 0x34302a },
  army:  { dust: 0.22, wear: 0.06, scale: 1.4, dustColor: 0x8d7d5e, bareColor: 0x6c6c66, panel: 0, streak: 0.2, streakColor: 0x5a4a34 },
  armor: { dust: 0.36, wear: 0.08, scale: 1.1, dustColor: 0x8a7a5a, bareColor: 0x6a6a64, panel: 0, streak: 0.22, streakColor: 0x4a3e2c },
  ship:  { dust: 0.18, wear: 0.1, scale: 0.35, dustColor: 0x6e5a48, bareColor: 0x5a5856, panel: 2.4, streak: 0.28, streakColor: 0x5e4024 },   // rust streaks / salt
  rw:    { dust: 0.08, wear: 0, scale: 0.9, dustColor: 0xa29c8e, panel: 1.1, streak: 0.06, streakColor: 0x6a665e },   // RUNAWAY: grime, no chips
  site:  { dust: 0.22, wear: 0, scale: 0.6, dustColor: 0x7c705a },                         // structures: grime
});

// Fallback reflection for glass, lamps and bare metal ONLY, until the scene has an environment: a 64x32 equirect of the
// game's sky gradient (main.js sky shader colours) over a dark sea. Without it a canopy or a chrome oleo reflects
// nothing and reads as dull tinted plastic. Three PMREM-filters it once on first use. It is per material, so it
// overrides zScene.environment: when rk-world provides one, call useSceneEnvironment() once (or delete this block).
let _env = null;
const ENV_ROLES = { metal: 0.5, grimy: 0.2, chrome: 0.9, lamp: 1, glass: 0.7 };   // role -> envMapIntensity
const _envMats = new Set();
function fallbackEnv() {
  if (_env) return _env;
  const W = 64, H = 32, a = new Uint8Array(W * H * 4), mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
  const ZEN = [56, 107, 217], HOR = [191, 217, 242], SEA = [52, 70, 82], DEEP = [24, 32, 38];
  for (let j = 0; j < H; j++) {
    const e = ((j + 0.5) / H - 0.5) * Math.PI, s = Math.sin(e);   // elevation, row 0 = straight down
    const c = s >= 0 ? mix(HOR, ZEN, Math.min(1, s / 0.55) ** 0.8) : mix(SEA, DEEP, Math.min(1, -s / 0.4));
    for (let i = 0; i < W; i++) a.set([...c.map(Math.round), 255], (j * W + i) * 4);
  }
  _env = new THREE.DataTexture(a, W, H, THREE.RGBAFormat);
  _env.mapping = THREE.EquirectangularReflectionMapping; _env.colorSpace = THREE.SRGBColorSpace;
  _env.magFilter = _env.minFilter = THREE.LinearFilter; _env.needsUpdate = true;
  return _env;
}
function withEnv(m, role) {
  if (!(role in ENV_ROLES) || _env === false) return m;
  m.envMap = fallbackEnv(); m.envMapIntensity = ENV_ROLES[role]; _envMats.add(m); return m;
}
// rk-world: once zScene.environment is set, drop the fallback so every surface uses the scene's environment
export function useSceneEnvironment() {
  for (const m of _envMats) { m.envMap = null; m.needsUpdate = true; }
  _envMats.clear(); _env = false;
}

// Phong/Lambert-only options a MeshStandardMaterial does not take
const PAINTED = ['paint', 'flat', 'armor', 'hull', 'metal', 'grimy', 'chrome'];
const LEGACY_ONLY = ['shininess', 'specular', 'specularMap', 'combine', 'reflectivity', 'refractionRatio', 'rk'];
const strip = o => { const r = {}; for (const k in o) if (!LEGACY_ONLY.includes(k) && o[k] !== undefined) r[k] = o[k]; return r; };
const _c = new THREE.Color();
const lum = c => { _c.set(c ?? 0xffffff); return 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b; };   // linear

// role from the legacy hints when the call site names none: shiny -> metal / chrome, near-black and dull -> rubber
function autoRole(color, o, base) {
  const L = lum(color);
  if (o.shininess >= 45) return L > 0.35 ? 'chrome' : 'metal';
  if (o.shininess !== undefined && o.shininess <= 6 && L < 0.02) return 'rubber';
  return base;
}

// Build the PBR equivalent. rk: role string | { role, detail } | false (keep legacy). detail: true -> the base preset.
export function pbr(legacy, color, o = {}, base = 'paint', baseDetail = null) {
  const spec = o.rk;
  if (!RKS || spec === false) return legacy();
  const s = typeof spec === 'string' ? { role: spec } : (spec || {});
  const role = s.role || autoRole(color, o, base);
  const m = new THREE.MeshStandardMaterial({ ...ROLES[role], ...(color !== undefined ? { color } : {}), ...strip(o) });
  m.name = 'RK/' + role; withEnv(m, role);
  // (no unit material is fog-of-war patched today; one that is must get fogPatch HERE, before the detail below)
  const d = s.detail === true ? baseDetail : s.detail;
  // exposed-metal wear only where paint sits on metal; rubber, canvas, skin, concrete, wood, ceramic never chip to metal
  if (d && RK_DETAIL) applyUnitDetail(m, { ...d, ...(PAINTED.includes(role) ? {} : { wear: 0 }), ...(PAINTED.includes(role) || role === 'ceramic' || role === 'concrete' ? {} : { panel: 0 }) });
  return m;
}

// Drop-in for a kit factory `M = (c, o) => new THREE.MeshPhongMaterial({...})`. Returns the wrapped factory.
export const wrapFactory = (legacy, base, baseDetail = null) => (c, o = {}) => pbr(() => legacy(c, strip0(o)), c, o, base, baseDetail);
const strip0 = o => { if (!('rk' in o)) return o; const r = { ...o }; delete r.rk; return r; };

// Glass / canopies: RenderKit glass WITHOUT transmission (transmission renders the whole scene again into a target,
// far too costly for every canopy and in VR); transparent physical dielectric, IOR 1.5.
/** @param {() => any} legacy @param {{ color?: number, opacity?: number, side?: number, roughness?: number, [k: string]: any }} [opts] */
export function glass(legacy, { color = 0x9fc6d8, opacity = 0.25, side = THREE.DoubleSide, roughness = 0.05, ...o } = {}) {
  if (!RKS) return legacy();
  // the env reflection adds sky irradiance to the (alpha-blended) tint, so the tint colour is cut to 40% to keep the
  // legacy veil: glass reads as a reflective pane, not milky plastic
  const m = createGlassMaterial({ color: new THREE.Color(color).multiplyScalar(0.4), transmission: 0, thickness: 0, transparent: true, opacity, depthWrite: false, side, roughness, ...strip(o) });
  m.name = 'RK/glass'; withEnv(m, 'glass');
  return m;
}

// Canvas-texture markings: lit decal material with depth offset (map multiplies colour, so colour defaults to white)
/** @param {() => THREE.Material} legacy  @param {{ map?: THREE.Texture, [k: string]: any }} [opts] */
export function decal(legacy, { map, ...o } = {}) {
  if (!RKS) return legacy();
  const m = createDecalMaterial({ map, color: 0xffffff, roughness: 0.85, ...strip(o) });
  m.name = 'RK/decal';
  return m;
}

// worldMaterial()-style vertex-coloured Standard material (world/gfx.js stores sqrt(linear) colours and squares them
// back in the vertex shader). Used by the faction structures. ngc/depth-materials: the detail is the per-triangle class
// detail of renderkit/detail.js (sandbag weave, concrete pores, corrugated iron, painted steel...) plus kit.js's baked
// contact occlusion, instead of one uniform grime mottle.
export function worldSurface(legacy, { side = THREE.FrontSide, role = 'concrete', detail = true } = {}) {
  if (!RKS) return legacy();
  const m = new THREE.MeshStandardMaterial({ ...ROLES[role], vertexColors: true, side });
  m.name = 'RK/world-' + role;
  const det = detail && RK_DETAIL;
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\n vColor.rgb *= color.rgb;\n#endif');
    if (det) worldDetailShader(sh);
  };
  m.customProgramCacheKey = () => 'rkworld' + (det ? 'D' : '');
  return m;
}
