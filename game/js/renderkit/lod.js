// RENDERKIT lod (ngc/perf-render): levels of detail that never pop.
//
// Two tools, one mechanism:
//   createLOD(root, [{ object, far }, { object, far }, { object }])   authored levels (2-4): level i draws from the
//       previous level's `far` to its own; the last has no far. For the look agents' new models (Huey, people,
//       buildings): LOD0 the full model, LOD1 a simpler mesh, LOD2 a silhouette, LOD3 an impostor card.
//   detail(mesh, far)   one mesh (a merged size class, a small moving part) that dissolves out by `far` metres.
//
// The hand-over is a screen-door cross-fade over a band round each switch distance (BAND x the distance), decided per
// FRAGMENT from its distance to the camera, exactly like world/visibility.js's chunk fades: the outgoing level keeps
// the pixels where a fixed per-pixel threshold is below its weight, the incoming level the rest, so together they cover
// the object once (no double blending, no sorting, no flicker, no hysteresis to tune: standing still in the band shows
// a stable mix). The mask hash is decorrelated from visibility.js's, so a LOD fade inside a world fade still adds up.
// The CPU side only switches whole levels on and off (by bounding sphere against the band) so out-of-range levels cost
// nothing. Shadow maps draw whichever levels are on (no dither in the depth pass; the levels have the same silhouette).
//
// Materials: every material of a level is drawn through a prototype view (Object.create of the original: every
// property, colour and live change reads through; only the program differs), one per (material, range), shared by all
// instances of that model, so a few extra programs per model type, not per instance.
//
// Tiers: LOD.bias scales every distance (desktop 1, XR / low 0.7, ?lodbias=N): call setBias from the tier code. The
// uniform is global, uploaded once per material per frame.
import * as THREE from 'three';

export const BAND = 0.12;                 // the cross-fade band: +-12 % of the switch distance
const bias = { value: 1 };
let force = null; try { force = Number(new URLSearchParams(location.search).get('lodbias')) || null; } catch (e) {}
if (force) bias.value = force;
export const LOD = { get bias() { return bias.value; }, setBias(b) { if (!force) bias.value = b; }, uniform: bias, stats: { roots: 0, details: 0, switches: 0 } };

const BASE_OBC = THREE.Material.prototype.onBeforeCompile;
const viewCache = new WeakMap();   // material -> Map(range key -> view)
const idSource = () => { const m = new THREE.Material(); const id = m.id; m.dispose(); return id; };

// the material drawn only within [near, far] metres (near 0 = from the eye, far Infinity = to the horizon)
export function rangeView(m, near, far) {
  if (!m || (!(near > 0) && !Number.isFinite(far))) return m;
  const base = m.userData?.rkRangeOf || m;   // never a view of a view
  const key = `${near}:${far}`;
  let M = viewCache.get(base); if (!M) viewCache.set(base, M = new Map());
  let v = M.get(key); if (v) return v;
  v = Object.create(base);
  Object.defineProperty(v, 'id', { value: idSource(), writable: true });   // its own id: Three refreshes its uniforms
  v._listeners = {};
  v.userData = Object.create(base.userData || {}); v.userData.rkRangeOf = base;
  const prevKey = base.customProgramCacheKey.bind(base), obc = base.onBeforeCompile;
  v.customProgramCacheKey = () => prevKey() + `|rklod:${near}:${far}`;
  const fn = (r, s) => `smoothstep(${(r * (1 - BAND)).toFixed(2)} * rkLodBias, ${(r * (1 + BAND)).toFixed(2)} * rkLodBias, ${s})`;
  v.onBeforeCompile = function (sh, r) {
    if (obc !== BASE_OBC) obc.call(this, sh, r);
    sh.uniforms.rkLodBias = bias;
    if (!/varying vec3 rkLodW;/.test(sh.vertexShader)) {
      sh.vertexShader = 'varying vec3 rkLodW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 rkLp = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    rkLp = batchingMatrix * rkLp;
  #endif
  #ifdef USE_INSTANCING
    rkLp = instanceMatrix * rkLp;
  #endif
  rkLodW = (modelMatrix * rkLp).xyz; }`);
    }
    // weight = in (past near) x out (before far); keep the pixel where the decorrelated screen door is under it
    const wIn = near > 0 ? fn(near, 'rkLd') : '1.0', wOut = Number.isFinite(far) ? `(1.0 - ${fn(far, 'rkLd')})` : '1.0';
    sh.fragmentShader = 'varying vec3 rkLodW; uniform float rkLodBias;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  { float rkLd = length(rkLodW - cameraPosition);
    float rkSd = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(.06711056, .00583715))));
    rkSd = fract(rkSd * 3.1734 + .531);
    ${near > 0 ? `if (rkSd >= ${wIn}) discard;` : ''}
    ${Number.isFinite(far) ? `if (rkSd < ${fn(far, 'rkLd')}) discard;` : ''} }`);
    void wOut;
  };
  M.set(key, v); return v;
}
// (the incoming level keeps rkSd < w_in, the outgoing level keeps rkSd >= w_out' = smoothstep(..far..): at the same
// switch distance w_in == w_out', so the two masks are exact complements)

const _c = new THREE.Vector3(), _s = new THREE.Sphere();
const entries = new Set();

function viewAll(object, near, far) {
  object.traverse(o => {
    if (!o.isMesh || o.isSprite) return;
    if (Array.isArray(o.material)) o.material = o.material.map(m => rangeView(m, near, far));
    else o.material = rangeView(o.material, near, far);
  });
}
function radiusOf(object) {
  const b = new THREE.Box3().setFromObject(object, true); if (b.isEmpty()) return 1;
  return b.getBoundingSphere(_s).radius;
}

/** createLOD(root, levels) -> { root, levels, level, dispose() }; levels: [{ object, far }, ..., { object }] (objects under root) */
export function createLOD(root, levels) {
  let near = 0;
  const L = levels.map((l, i) => { const far = i === levels.length - 1 ? Infinity : l.far; const e = { object: l.object, near, far, on: true }; near = far; return e; });
  for (const l of L) viewAll(l.object, l.near, l.far);
  root.updateMatrixWorld(true);
  const e = { root, levels: L, r: radiusOf(root), level: 0, kind: 'levels' };
  entries.add(e); LOD.stats.roots = entries.size;
  e.dispose = () => { entries.delete(e); LOD.stats.roots = entries.size; };
  root.userData.rkLOD = e;
  return e;
}

/** detail(mesh, far): the mesh dissolves out over far*(1 +- BAND) and is switched off beyond (kept: hooks, transforms) */
// (bounds: { center, radius } in the mesh's own space, for an instanced mesh whose instances spread far from its origin)
export function detail(mesh, far, near = 0, bounds = null) {
  if (!mesh?.isMesh) return null;
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => rangeView(m, near, far)) : rangeView(mesh.material, near, far);
  const g = mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
  const e = { root: mesh, levels: [{ object: mesh, near, far, on: true }], r: bounds ? bounds.radius : g.boundingSphere.radius, c: bounds ? bounds.center : g.boundingSphere.center.clone(), b: bounds, kind: 'detail', mesh };   // (bounds: live, read every frame)
  entries.add(e); LOD.stats.details++; LOD.stats.roots = entries.size;
  e.dispose = () => entries.delete(e);
  return e;
}

// once a frame, before rendering: switch whole levels by the root's bounding sphere against each level's band.
// Levels switched off go to layer mask 0 (game code never touches layers; .visible stays the game's).
export function updateLODs(camera) {
  const cp = camera.getWorldPosition(_c), b = bias.value;
  for (const e of entries) {
    const root = e.root;
    if (!root.parent) continue;
    if (e.c) _s.center.copy(e.c).applyMatrix4(root.matrixWorld); else root.getWorldPosition(_s.center);
    const ws = root.matrixWorld.getMaxScaleOnAxis(), r = (e.b ? e.b.radius : e.r) * ws, d = _s.center.distanceTo(cp);
    for (const l of e.levels) {
      const lo = l.near * (1 - BAND) * b - r, hi = Number.isFinite(l.far) ? l.far * (1 + BAND) * b + r : Infinity;
      const on = d >= lo && d <= hi;
      if (on !== l.on) { l.on = on; LOD.stats.switches++; l.object.traverse(o => { if (o.isMesh && !o.userData.rkMergedOut) o.layers.mask = on ? 1 : 0; }); }
    }
  }
}
export function lodEntries() { return entries; }
