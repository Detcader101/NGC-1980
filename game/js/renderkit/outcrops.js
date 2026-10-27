// RENDERKIT terrain (ngc/look-terrain): rock outcrops and boulders as real geometry.
//
// The terrain is a height field: a cliff is a smooth slope and the hills have no rock that stands proud of them. This
// adds smooth, noise-displaced rock masses (4 shapes, each a 2-LOD icosphere with smooth normals: no facets) in a
// camera-centred ring of 16 m cells, placed deterministically from the ground (host callback: slope, the rock surface,
// geology) - big half-buried masses on cliffs and rocky slopes, scattered boulders on the grass. They are shaded with the
// SAME generated rock layers as the terrain (renderkit/terrainmat.js), triplanar in world space, and tinted by the
// island's geology, so a rock grows out of the ground it sits on instead of being a grey prop on it.
// The material is a Lambert (onBeforeCompile), so the light agent's sun shadows, the sky agent's aerial perspective and
// the fog of war all apply as on every built-in material. The two LODs cross over with the screen-door pattern of
// world/visibility.js (no pops), and the whole ring fades out by the same door at its edge.
import * as THREE from 'three';
import { FOG_GLSL } from '../fog.js';

const fract = x => x - Math.floor(x);
const CELL = 16;
// per tier: ring radius (m), LOD switch distance (m), density factor; XR uses low
export const OUTCROP_TIERS = Object.freeze({ low: { R: 170, lod: 50, k: 0.5 }, med: { R: 320, lod: 90, k: 0.8 }, high: { R: 460, lod: 130, k: 1 } });

// a rock: an icosphere pushed out by 3D value noise (broad lumps + a sharper ridge octave), flattened underneath and
// cut a little on the top (bedding), normals recomputed smooth
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z); let fx = x - i, fy = y - j, fz = z - k;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t, h = (a, b, c) => hash3(i + a, j + b, k + c);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy), l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
function rockGeometry(seed, detail) {
  const g = new THREE.IcosahedronGeometry(1, detail), P = g.attributes.position, o = seed * 13.7;
  const sx = 1.1 + fract(seed * 3.3) * 0.5, sy = 0.55 + fract(seed * 5.1) * 0.35, sz = 0.85 + fract(seed * 7.9) * 0.4;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const n = vnoise(x * 1.3 + o, y * 1.3, z * 1.3) * 0.55 + vnoise(x * 2.9, y * 2.9 + o, z * 2.9) * 0.3 + Math.abs(vnoise(x * 6.1 + o, y * 6.1, z * 6.1) - 0.5) * 0.3;
    let r = 0.72 + n * 0.62;
    x *= r * sx; y *= r * sy; z *= r * sz;
    if (y > 0.35 * sy) y = 0.35 * sy + (y - 0.35 * sy) * 0.55;   // a flatter top: bedding
    if (y < -0.1) y *= 0.6;
    P.setXYZ(i, x, y, z);
  }
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = mergeVerts(g); m.computeVertexNormals(); return m;
}
function mergeVerts(g) {   // IcosahedronGeometry is non-indexed: weld so the normals come out smooth
  const P = g.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < P.count; i++) {
    const k = `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
    let v = map.get(k); if (v === undefined) { v = pos.length / 3; map.set(k, v); pos.push(P.getX(i), P.getY(i), P.getZ(i)); } idx.push(v);
  }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setIndex(idx); g.dispose(); return m;
}

// the material: Lambert, per-instance transform (aP x y z scale, aR yaw tiltX tiltZ seed, aC tint rgb + layer), the rock
// layers triplanar in world space with their normal maps, the LOD door, and the fog of war
function rockMaterial({ ter, fog, uTime, lodU, near }) {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTA: ter.uniforms.uTA, uTN: ter.uniforms.uTN, uTerK: ter.uniforms.uTerK, uOcLod: lodU });
    if (fog) Object.assign(sh.uniforms, { uFogT: fog.uniforms.uFogT, uFogB: fog.uniforms.uFogB, uTime });
    sh.vertexShader = `attribute vec4 aP, aR, aC; varying vec3 vOW, vON; varying vec4 vOC; varying float vOS;
      mat3 ocRot(vec4 r){ float c=cos(r.x), s=sin(r.x); mat3 Y=mat3(c,0.,-s, 0.,1.,0., s,0.,c);
        vec3 t=vec3(r.y,0.,r.z); float a=length(t); if(a<1e-4) return Y; vec3 k=t/a; mat3 K=mat3(0.,k.z,-k.y, -k.z,0.,k.x, k.y,-k.x,0.);
        return (mat3(1.)+sin(a)*K+(1.-cos(a))*(K*K))*Y; }\n` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'mat3 ocR=ocRot(aR); vec3 objectNormal=ocR*normal; vON=objectNormal;')
      .replace('#include <begin_vertex>', 'vec3 transformed=ocR*(position*aP.w)+aP.xyz; vOW=transformed; vOC=aC; vOS=aP.w;');
    sh.fragmentShader = `precision highp sampler2DArray; uniform highp sampler2DArray uTA, uTN; uniform vec3 uTerK[14]; uniform vec4 uOcLod;
      varying vec3 vOW, vON; varying vec4 vOC; varying float vOS;
      ${fog ? 'uniform sampler2D uFogT; uniform float uFogB; uniform float uTime;\n' + FOG_GLSL : ''}
      float ocDoor(){ return fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715)))); }
      vec3 ocBump=vec3(0.);\n` + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { float d=length(vOW-cameraPosition), wN=1.-smoothstep(uOcLod.x-uOcLod.y,uOcLod.x+uOcLod.y,d), wR=1.-smoothstep(uOcLod.z*.85,uOcLod.z,d), dr=ocDoor();
          ${near ? 'if(dr>=wN||dr>=wR) discard;' : 'if(dr<wN||dr>=wR) discard;'} }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { // the terrain's rock layer, triplanar in world space (scaled per rock so a boulder is not a tiny cliff)
          float L=vOC.w, s=1./(L>6.5?7.:9.)*mix(1.6,1.,clamp(vOS/4.,0.,1.)); vec3 N=normalize(vON), bw=pow(abs(N),vec3(4.)); bw/=bw.x+bw.y+bw.z;
          vec3 P=vOW*s; int Li=int(L+.5);
          vec4 ax=texture(uTA,vec3(P.zy,L)), ay=texture(uTA,vec3(P.xz,L)), az=texture(uTA,vec3(P.xy,L));
          vec4 bx=texture(uTN,vec3(P.zy,L)), by=texture(uTN,vec3(P.xz,L)), bz=texture(uTN,vec3(P.xy,L));
          vec3 a=(ax.rgb*bw.x+ay.rgb*bw.y+az.rgb*bw.z)*uTerK[Li];
          float ao=bx.w*bw.x+by.w*bw.y+bz.w*bw.z;
          ocBump=vec3(0.,bx.y-.5,bx.x-.5)*bw.x+vec3(by.x-.5,0.,by.y-.5)*bw.y+vec3(bz.x-.5,bz.y-.5,0.)*bw.z;
          float top=smoothstep(.55,.85,N.y)*smoothstep(.4,.6,ay.a);   // moss / grass on the flat tops
          a=mix(a*vOC.rgb,vec3(.2,.3,.12)*(.8+.4*ay.a),top*.6);
          diffuseColor.rgb=a*(.55+.45*ao)*(.75+.25*smoothstep(-.6,.4,N.y));   // darker underneath (contact, the ground's bounce is greener)
          diffuseColor.rgb=pow(diffuseColor.rgb,vec3(2.2));   // (display -> linear: Lambert lights in linear)
        }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        { vec3 wn=normalize(vON); vec3 b=ocBump-wn*dot(ocBump,wn); normal=normalize((viewMatrix*vec4(normalize(wn+b*1.6),0.)).xyz); }`)
      .replace('#include <fog_fragment>', (fog ? 'gl_FragColor.rgb = fogOfWar(gl_FragColor.rgb, vOW.xz, uTime);\n' : '') + '#include <fog_fragment>');
  };
  m.customProgramCacheKey = () => 'rkoutcrop-' + (near ? 'n' : 'f') + (fog ? 'F' : '');
  return m;
}
function depthMat() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = sh => {
    sh.vertexShader = `attribute vec4 aP, aR;
      mat3 ocRot(vec4 r){ float c=cos(r.x), s=sin(r.x); mat3 Y=mat3(c,0.,-s, 0.,1.,0., s,0.,c);
        vec3 t=vec3(r.y,0.,r.z); float a=length(t); if(a<1e-4) return Y; vec3 k=t/a; mat3 K=mat3(0.,k.z,-k.y, -k.z,0.,k.x, k.y,-k.x,0.);
        return (mat3(1.)+sin(a)*K+(1.-cos(a))*(K*K))*Y; }\n` + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed=ocRot(aR)*(position*aP.w)+aP.xyz;');
  };
  m.customProgramCacheKey = () => 'rkoutcrop-depth';
  return m;
}

// host: sample(x, z) -> null or { y: ground height, sl: slope (1 - n.y), rock: 0..1 (how rocky the ground is),
//   layer: 6 (stratified) | 7 (granite), tint: [r g b] display multiplier }
export function createOutcrops({ scene, ter, fog = null, uTime = null, sample, tierName = 'high' }) {
  const root = new THREE.Group(); root.name = 'rk-terrain-outcrops'; scene.add(root);
  let T = OUTCROP_TIERS[tierName] || OUTCROP_TIERS.high;
  const lodU = { value: new THREE.Vector4(T.lod, 15, T.R, 0) };
  const V = 4, geos = [0, 1, 2, 3].map(i => ({ near: rockGeometry(0.17 + i * 0.29, 3), far: rockGeometry(0.17 + i * 0.29, 1) }));
  const mats = { near: rockMaterial({ ter, fog, uTime, lodU, near: true }), far: rockMaterial({ ter, fog, uTime, lodU, near: false }) }, depth = depthMat();
  const sets = [];
  for (let v = 0; v < V; v++) for (const lod of ['near', 'far']) {
    const g = new THREE.InstancedBufferGeometry(); g.index = geos[v][lod].index;
    for (const k of Object.keys(geos[v][lod].attributes)) g.setAttribute(k, geos[v][lod].attributes[k]);
    const set = { v, lod, g, cap: 0, n: 0, tris: geos[v][lod].index.count / 3 };
    set.alloc = n => { set.cap = n; for (const [k, w] of [['aP', 4], ['aR', 4], ['aC', 4]]) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * w), w); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); set[k] = a; } };
    set.alloc(512); g.instanceCount = 0;
    const mesh = new THREE.Mesh(g, mats[lod]); mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.customDepthMaterial = depth;
    mesh.userData.rkShadow = lod === 'near' ? 'both' : 'receive'; root.add(mesh); set.mesh = mesh; sets.push(set);
  }
  const cells = new Map(), key = (i, j) => i * 65536 + j, ring = [];
  const stats = { cells: 0, rocks: 0, near: 0, tris: 0, genMs: 0, ms: 0 };
  // one cell: up to 3 candidates; a rock needs rocky or steep ground (boulders on grass are rare)
  function gen(ci, cj) {
    const h = (a, b) => fract(Math.sin((ci * 127.1 + cj * 311.7) + a * 74.7 + b * 13.13) * 43758.5453), out = [];
    for (let k = 0; k < 3; k++) {
      const x = (ci + h(k, 1)) * CELL, z = (cj + h(k, 2)) * CELL, u = h(k, 3), w = h(k, 4);
      const q = sample(x, z); if (!q) continue;
      const p = q.rock * 0.55 + (q.sl > 0.3 ? 0.25 : 0) + 0.03;
      if (u > p) continue;
      const big = q.rock > 0.4 || q.sl > 0.35, s = big ? 1.4 + w * w * 4.2 : 0.5 + w * w * 1.4;
      const sink = s * (big ? 0.35 + 0.2 * h(k, 5) : 0.25) + q.sl * s * 0.6;
      out.push({ x, y: q.y - sink, z, s, yaw: h(k, 6) * 6.283, tx: (h(k, 7) - 0.5) * 0.3 + q.nx * 0.6, tz: (h(k, 8) - 0.5) * 0.3 + q.nz * 0.6, seed: h(k, 9), v: Math.floor(h(k, 10) * V) % V, c: q.tint, L: q.layer, keep: h(k, 11) });
    }
    return out;
  }
  let lastI = 1e9, lastJ = 1e9, lastY = 1e9, dirty = true;
  const eye = new THREE.Vector3();
  function update(camPos, groundY) {
    const t0 = performance.now(), ci = Math.floor(camPos.x / CELL), cj = Math.floor(camPos.z / CELL), yq = Math.round(camPos.y / 8);
    if (!dirty && ci === lastI && cj === lastJ && yq === lastY) { stats.ms = 0; return; }
    eye.copy(camPos);
    const above = Math.max(0, camPos.y - groundY), R = T.R, reach = above < R ? Math.sqrt(R * R - above * above) : 0, n = Math.ceil(reach / CELL) + 1;
    for (const s of sets) s.n = 0;
    let budget = 0, complete = true;
    const order = ring[n] ||= Array.from({ length: (2 * n + 1) ** 2 }, (_, k) => [k % (2 * n + 1) - n, Math.floor(k / (2 * n + 1)) - n]).sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1]);
    if (reach > 0) for (const [di, dj] of order) {
      const i = ci + di, j = cj + dj, cx = (i + 0.5) * CELL - camPos.x, cz = (j + 0.5) * CELL - camPos.z;
      if (cx * cx + cz * cz > (reach + CELL) ** 2) continue;
      let c = cells.get(key(i, j));
      if (!c) { if (budget > 5) { complete = false; continue; } const g0 = performance.now(); c = gen(i, j); cells.set(key(i, j), c); budget += performance.now() - g0; }
      c.used = true;
      for (const r of c) {
        if (r.keep > T.k) continue;
        const d = Math.hypot(r.x - camPos.x, r.y - camPos.y, r.z - camPos.z);
        if (d < T.lod + 15 + r.s * 2) push(sets[r.v * 2], r);   // near (its door fades it out over lod +- 15 m)
        if (d > T.lod - 15 - r.s * 2) push(sets[r.v * 2 + 1], r);
      }
    }
    for (const s of sets) { s.g.instanceCount = s.n; s.mesh.visible = s.n > 0; for (const k of ['aP', 'aR', 'aC']) { s[k].clearUpdateRanges(); s[k].addUpdateRange(0, s.n * 4); s[k].needsUpdate = true; } }
    if (cells.size > 4 * (2 * n + 2) ** 2 + 64) for (const [k, c] of cells) if (!c.used) cells.delete(k);
    for (const c of cells.values()) c.used = false;
    lastI = ci; lastJ = cj; lastY = yq; dirty = !complete;
    stats.cells = cells.size; stats.rocks = sets.reduce((a, s) => a + (s.lod === 'far' ? s.n : 0), 0); stats.near = sets.reduce((a, s) => a + (s.lod === 'near' ? s.n : 0), 0);
    stats.tris = sets.reduce((a, s) => a + s.n * s.tris, 0); stats.genMs = +budget.toFixed(2); stats.ms = +(performance.now() - t0).toFixed(2);
  }
  function push(s, r) {
    if (s.n >= s.cap) { const old = { P: s.aP.array, R: s.aR.array, C: s.aC.array }, k = s.n; s.alloc(Math.ceil(s.cap * 1.6)); s.aP.array.set(old.P.subarray(0, k * 4)); s.aR.array.set(old.R.subarray(0, k * 4)); s.aC.array.set(old.C.subarray(0, k * 4)); }
    const o = s.n++ * 4;
    s.aP.array[o] = r.x; s.aP.array[o + 1] = r.y; s.aP.array[o + 2] = r.z; s.aP.array[o + 3] = r.s;
    s.aR.array[o] = r.yaw; s.aR.array[o + 1] = r.tx; s.aR.array[o + 2] = r.tz; s.aR.array[o + 3] = r.seed;
    s.aC.array[o] = r.c[0]; s.aC.array[o + 1] = r.c[1]; s.aC.array[o + 2] = r.c[2]; s.aC.array[o + 3] = r.L;
  }
  return {
    root, stats, update,
    setTier(name) { if (!OUTCROP_TIERS[name]) return; T = OUTCROP_TIERS[name]; lodU.value.set(T.lod, 15, T.R, 0); dirty = true; },
    reset() { cells.clear(); dirty = true; },
  };
}
