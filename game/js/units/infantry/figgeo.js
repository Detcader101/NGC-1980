// NGC-1980 look-people: the people's GEOMETRY BUILDER and MATERIAL.
//   FigBuilder  merges SDF surfaces (sdfmesh.js) and rigid / chained meshkit Kit parts into ONE indexed BufferGeometry
//               with per-vertex colour, material channels and skin weights for the 17-bone soldier rig
//               (soldiermodel.js BONES). One geometry, one material, one draw call per person.
//   figMaterial MeshStandardMaterial + a small shader patch:
//               - utility camouflage (ERDL leaf, four colours) and the Mitchell helmet cover pattern computed per PIXEL from
//                 the bind-pose position (glued to the cloth, smooth edges with screen-space antialiasing: no per-triangle
//                 blotches), a per-person pattern offset
//               - cloth detail as a procedural bump (creases, a fine twill), skin with a faint pore / blotch bump
//               - roughness / metalness per vertex (cloth, skin, leather, steel, rubber in one draw)
//               - the person's skin tone as a uniform (the same face mesh for every tone)
//   bindSkeleton / makeSkinned  a THREE.SkinnedMesh on the soldier's bone Groups (they need not be THREE.Bones)
//   bakePose     CPU-skins a figure geometry into a static one (crowds, instanced crews: one pose, no skeleton)
import * as THREE from 'three';
import { chainWeights } from './sdfmesh.js';

export const FIG_BONES = ['pelvis', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'forearmL', 'handL', 'upperArmR', 'forearmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
export const BONE_INDEX = Object.fromEntries(FIG_BONES.map((n, i) => [n, i]));
const _c = new THREE.Color();
const sortW = (acc) => { const e = Object.entries(acc).filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4); let t = 0; for (const [, w] of e) t += w; return e.map(([n, w]) => [BONE_INDEX[n] ?? 0, w / (t || 1)]); };

export class FigBuilder {
  constructor() { this.P = []; this.N = []; this.C = []; this.F = []; this.R = []; this.T = []; this.SI = []; this.SW = []; this.I = []; this.tris = 0; }
  get count() { return this.P.length / 3; }
  _w(acc) { const e = sortW(acc); for (let i = 0; i < 4; i++) { this.SI.push(e[i] ? e[i][0] : 0); this.SW.push(e[i] ? e[i][1] : 0); } }
  // an SDF surface from SdfKit.mesh()
  addSurface(s) {
    if (!s) return this;
    const base = this.count;
    for (let i = 0; i < s.verts; i++) {
      this.P.push(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]); this.N.push(s.nor[i * 3], s.nor[i * 3 + 1], s.nor[i * 3 + 2]);
      this.C.push(s.col[i * 3], s.col[i * 3 + 1], s.col[i * 3 + 2]); this.F.push(s.fig[i * 4], s.fig[i * 4 + 1], s.fig[i * 4 + 2], s.fig[i * 4 + 3]); this.R.push(s.rm[i * 2], s.rm[i * 2 + 1]); this.T.push(s.pt ? s.pt[i] : 0);
      const acc = s.skinAcc[i]; this._w(Object.keys(acc).length ? acc : { pelvis: 1 });
    }
    for (const j of s.index) this.I.push(base + j);
    this.tris += s.index.length / 3; return this;
  }
  // a meshkit Kit (non-indexed triangles, linear vertex colours, normals): m = material channels { erdl, mitch, skin,
  // fold, rough, metal }; skin = bone name or chain; xf = optional THREE.Matrix4 (the part's bind transform)
  addKit(kit, m = {}, skin = 'pelvis', xf = null) {
    if (!kit || kit.empty) return this;
    const g = kit.geometry(); if (xf) g.applyMatrix4(xf);
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, base = this.count, rigid = typeof skin === 'string';
    const fig = [m.erdl || 0, m.mitch || 0, m.skin || 0, m.fold || 0], rm = [m.rough ?? 0.9, m.metal || 0], paint = m.paint || 0;
    let rw = null; if (rigid) rw = sortW({ [skin]: 1 });
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.P.push(x, y, z); this.N.push(n.getX(i), n.getY(i), n.getZ(i)); this.C.push(c.getX(i), c.getY(i), c.getZ(i)); this.F.push(...fig); this.R.push(...rm); this.T.push(paint);
      if (rigid) { this.SI.push(rw[0][0], 0, 0, 0); this.SW.push(1, 0, 0, 0); } else this._w(chainWeights(skin, x, y, z, {}));
      this.I.push(base + i);
    }
    this.tris += p.count / 3; g.dispose(); return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setAttribute('aFig', new THREE.Float32BufferAttribute(this.F, 4));
    g.setAttribute('aRM', new THREE.Float32BufferAttribute(this.R, 2));
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(this.T, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere(); g.userData.tris = this.I.length / 3;
    return g;
  }
}

// ------------------------------------------------------------------------------------------------ skinning on the rig
const _m = new THREE.Matrix4(), _id = new THREE.Matrix4();
// bindWorld: { boneName: Matrix4 (root-relative bind transform) } -> a SkinnedMesh bound to sk.bones (Groups), child of sk.root
export function makeSkinned(sk, geo, material, bindWorld, name = 'figure') {
  const bones = FIG_BONES.map(n => sk.bones[n]), inv = FIG_BONES.map(n => bindWorld[n].clone().invert());
  const skel = new THREE.Skeleton(bones, inv);
  const m = new THREE.SkinnedMesh(geo, material); m.name = name;
  m.bind(skel, _id); m.normalizeSkinWeights();
  // a fixed bound that covers every stance (standing, prone 0.7 m ahead, lying on the back): no per-frame bone bounds
  m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 1.7); m.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.3, -1.6), new THREE.Vector3(1.2, 2.1, 1.6));
  m.castShadow = false; m.receiveShadow = false;
  sk.root.add(m);
  return m;
}
// CPU skinning into a static geometry. pose: { boneName: Matrix4 root-relative posed transform }; bindWorld as above
export function bakePose(geo, bindWorld, pose) {
  const M = FIG_BONES.map(n => new THREE.Matrix4().multiplyMatrices(pose[n] || bindWorld[n], _m.copy(bindWorld[n]).invert()));
  const N = M.map(m => new THREE.Matrix3().getNormalMatrix(m));
  const g = geo.clone(), p = g.attributes.position, n = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const v = new THREE.Vector3(), a = new THREE.Vector3(), nn = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nn.fromBufferAttribute(n, i); a.set(0, 0, 0); b.set(0, 0, 0);
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (!w) continue; const j = si.getComponent(i, k); a.addScaledVector(_v1.copy(v).applyMatrix4(M[j]), w); b.addScaledVector(_v1.copy(nn).applyMatrix3(N[j]), w); }
    p.setXYZ(i, a.x, a.y, a.z); b.normalize(); n.setXYZ(i, b.x, b.y, b.z);
  }
  g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
  g.computeBoundingSphere(); return g;
}
const _v1 = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ the material
// palettes (sRGB hex): ERDL lowland (light green, olive, brown, black) and the Mitchell cover's green side
export const PAL = {
  erdl: [0x7a8752, 0x4a5733, 0x5c4b31, 0x1f2119],
  mitchell: [0x6f7b42, 0x55633a, 0x3c4829, 0x2b311e],
  og107: [0x55583b, 0x50533a, 0x4a4c34, 0x5b5e40],
  woodland: [0x6b6d47, 0x3f4a2c, 0x5a4630, 0x1c1d18],
};
const GLSL_NOISE = /* glsl */`
float lpHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lpNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lpHash(i), lpHash(i + vec3(1, 0, 0)), f.x), mix(lpHash(i + vec3(0, 1, 0)), lpHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lpHash(i + vec3(0, 0, 1)), lpHash(i + vec3(1, 0, 1)), f.x), mix(lpHash(i + vec3(0, 1, 1)), lpHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float lpFbm(vec3 p) { return 0.62 * lpNoise(p) + 0.28 * lpNoise(p * 2.13 + 7.1) + 0.1 * lpNoise(p * 4.37 + 3.3); }
// a four-colour camouflage: base c1; c0 where n is low; c2 where n is high; c3 (black / dark) where m is high
vec3 lpCamo(vec3 p, vec3 c0, vec3 c1, vec3 c2, vec3 c3, float t0, float t2, float t3) {
  vec3 w = p + 0.55 * vec3(lpNoise(p * 0.6 + 3.1), lpNoise(p * 0.6 + 7.7), lpNoise(p * 0.6 + 1.3));
  float n = lpFbm(w), m = lpFbm(w * 1.35 + vec3(40.0, 9.0, 3.0));
  float an = max(fwidth(n), 1e-4) * 0.8, am = max(fwidth(m), 1e-4) * 0.8;
  vec3 c = mix(c0, c1, smoothstep(t0 - an, t0 + an, n));
  c = mix(c, c2, smoothstep(t2 - an, t2 + an, n));
  return mix(c, c3, smoothstep(t3 - am, t3 + am, m));
}
vec3 lpPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos), n = surf_norm;
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 g = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * n - g);
}`;
const MATS = new Map();
// o: { camo: 'erdl' | 'og107' | 'woodland', seed (0..), skin: hex (the person's tone), hair } -> a shared material per key
export function figMaterial(o = {}) {
  const camo = o.camo || 'erdl', seed = (o.seed ?? 0) % 8, skin = o.skin ?? 0xc79a77, key = `${camo}|${seed}|${skin}|${o.side || 0}`;
  if (MATS.has(key)) return MATS.get(key);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: o.side || THREE.FrontSide });
  m.name = 'RKfig/person';
  const pal = PAL[camo] || PAL.erdl, mp = PAL.mitchell;
  const U = {
    lpCam: { value: pal.map(h => new THREE.Color(h)) }, lpMit: { value: mp.map(h => new THREE.Color(h)) },
    lpSeed: { value: new THREE.Vector3(seed * 3.7, seed * 1.9, seed * 5.3) },
    // the person's skin tone relative to the modelled one (0xc79a77): skin-flagged vertices are multiplied by it
    lpSkin: { value: (() => { const a = new THREE.Color(skin), b = new THREE.Color(0xc79a77); return new THREE.Color(a.r / b.r, a.g / b.g, a.b / b.b); })() },
    lpPlain: { value: camo === 'og107' ? 1 : 0 },
  };
  m.userData.lp = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    // look-faces: skin takes WRAPPED diffuse light, wider in red than in blue (light scattered under the skin softens the
    // terminator and warms it), instead of a hard Lambert edge that makes a face look like painted plastic
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
      `{ float lpS = clamp(vFig.z, 0.0, 1.0);
        vec3 lpW = vec3(0.42, 0.2, 0.13) * lpS, lpNL = vec3(dot(geometryNormal, directLight.direction));
        vec3 lpWrap = clamp((lpNL + lpW) / (1.0 + lpW), 0.0, 1.0) / (1.0 + 0.5 * lpW);
        reflectedLight.directDiffuse += mix(irradiance, lpWrap * directLight.color, lpS) * BRDF_Lambert( material.diffuseColor ); }`));
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFig; attribute vec2 aRM; varying vec4 vFig; varying vec2 vRM; varying vec3 vCP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFig = aFig; vRM = aRM; vCP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vFig; varying vec2 vRM; varying vec3 vCP;\nuniform vec3 lpCam[4]; uniform vec3 lpMit[4]; uniform vec3 lpSeed; uniform vec3 lpSkin; uniform float lpPlain;\n' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
      if (vFig.x > 0.01) {   // utility camouflage: ERDL leaf blotches ~8-14 cm, a little elongated across the body
        vec3 cp = vCP * vec3(8.5, 6.5, 8.5) + lpSeed;
        vec3 cam = lpPlain > 0.5 ? mix(lpCam[0], lpCam[2], 0.35 * lpFbm(vCP * 14.0 + lpSeed)) : lpCamo(cp, lpCam[0], lpCam[1], lpCam[2], lpCam[3], 0.4, 0.6, 0.66);
        diffuseColor.rgb = mix(diffuseColor.rgb, cam, clamp(vFig.x, 0.0, 1.0));
      }
      if (vFig.y > 0.01) {   // the Mitchell cover: smaller leaves
        vec3 cam = lpCamo(vCP * 17.0 + lpSeed * 0.7, lpMit[0], lpMit[1], lpMit[2], lpMit[3], 0.38, 0.58, 0.68);
        diffuseColor.rgb = mix(diffuseColor.rgb, cam, clamp(vFig.y, 0.0, 1.0));
      }
      // skin: the person's tone, a faint blotchy variation (freckles, redness)
      diffuseColor.rgb *= mix(vec3(1.0), lpSkin * (0.94 + 0.12 * lpNoise(vCP * 90.0 + lpSeed)), clamp(vFig.z, 0.0, 1.0));
      // hair on skin (look-faces): on skin the fold channel is the hair density (the cropped scalp, brows, stubble, a
      // moustache): short dark strands / follicles per pixel, faded out where they get smaller than a pixel
      if (vFig.z > 0.5 && vFig.w > 0.02) {
        vec3 hp = vCP * vec3(2600.0, 900.0, 2600.0);
        float fw = max(length(fwidth(hp)), 1e-3), vis = 1.0 - smoothstep(0.6, 2.2, fw);
        float st = smoothstep(0.55, 0.85, lpNoise(hp)) * vis;
        diffuseColor.rgb *= 1.0 - vFig.w * (0.45 * st - 0.12 * vis + 0.05);
      }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x * mix(1.0, 0.9 + 0.2 * lpNoise(vCP * 160.0), clamp(vFig.z, 0.0, 1.0));')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {   // cloth: creases and a fine twill; skin: pores. Heights in metres along the bind-pose surface
        float hc = 0.0;
        if (vFig.w > 0.01 && vFig.z < 0.5) {
          vec3 q = vCP * vec3(28.0, 70.0, 28.0) + lpSeed;
          float cr = abs(lpNoise(q) - 0.5) + 0.5 * abs(lpNoise(q * 2.1 + 5.0) - 0.5);
          hc += vFig.w * 0.0016 * cr;
        }
        if (vFig.z > 0.01) hc += vFig.z * (0.00007 * lpNoise(vCP * 900.0) + 0.00004 * lpNoise(vCP * 2300.0));
        if (hc > 0.0) normal = lpPerturb(-vViewPosition, normal, vec2(dFdx(hc), dFdy(hc)), faceDirection);
      }`);
  };
  m.customProgramCacheKey = () => 'lp-person-v2';
  MATS.set(key, m);
  return m;
}

// merge indexed figure geometries with the same attributes (baked crews + rigid props) into one
export function mergeFig(list) {
  const names = Object.keys(list[0].attributes), out = new THREE.BufferGeometry(), idx = [];
  let base = 0;
  for (const n of names) {
    const it = list[0].attributes[n].itemSize, tot = list.reduce((s, g) => s + (g.attributes[n] ? g.attributes[n].count : g.attributes.position.count) * it, 0), arr = new Float32Array(tot);
    let o = 0; for (const g of list) { const a = g.attributes[n]; if (a) arr.set(a.array.subarray(0, a.count * it), o); o += g.attributes.position.count * it; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, it));
  }
  for (const g of list) { const n = g.attributes.position.count; if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base); else for (let i = 0; i < n; i++) idx.push(i + base); base += n; }
  out.setIndex(base > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  out.computeBoundingSphere(); out.userData.tris = idx.length / 3; return out;
}
