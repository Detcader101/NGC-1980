// RENDERKIT materials (ngc/depth-materials): procedural surface detail for the game's flat-coloured geometry.
//
// The house style is flat colour per face. This module adds what a real surface has between its edges, in the shader,
// with no image assets and no UVs (the world's merged geometry has none):
//   world  - vertex-coloured world geometry (structures, towns, roads, pads): a material CLASS per triangle
//            (renderkit/surfclass.js, attribute rkSurf) picks plaster / concrete / sandbag / tarmac / painted steel /
//            wood / brick / stone / clay tile / slate / corrugated iron / earth / turf / canvas / worn markings.
//   unit   - vehicles, aircraft, ships (gamemats.pbr): dust mottling and paint wear as before, plus panel lines, rain and
//            oil streaks down the sides, grime on the undersides, a fine paint grain and roughness variation.
// Noise comes from ONE generated 256x256 tileable RGBA noise texture (built here at load, mipmapped): three fetches a
// fragment replace ~30 hashed value-noise evaluations (measured 5-8x the Lambert cost on SwiftShader with ALU noise),
// and the mip chain band-limits the noise for free (no shimmer at distance). Hash noise is only used for per-cell tints.
// Coordinates are the mesh's own (attribute position before instancing / skinning), so detail never swims on a moving
// unit; projections are per face (a wall's horizontal tangent from its geometric normal), so bricks run along any wall.
// Analytic patterns (mortar, courses, panel lines) fade where a pixel covers a good part of their period, and all of it
// fades to the average colour beyond the detail range (high tier 150 m, medium 60 m).
// Bump: a height in metres, turned into a normal by screen derivatives (Three's bump-map method).
//
// Tiers: ?rkdetail=0 off (PBR roles stay), ?rkdetail=1 medium (60 m, no bump), default high. In XR the range drops to
// 60 m and the bump halves (bindXR). Gate: everything here is only called with RK 'surface' on.
import * as THREE from 'three';
import { RK } from './adopt.js';
import { noiseGLSL } from './glsl.js';
import { insertAfter } from './core.js';
import { SURF } from './surfclass.js';

let _q = null; try { _q = new URLSearchParams(location.search).get('rkdetail'); } catch (e) {}
export const DETAIL_TIER = _q === '0' ? 0 : (_q === '1' || _q === 'med' || _q === 'medium') ? 1 : 2;
export const DETAIL_ON = RK.on('surface') && DETAIL_TIER > 0;

// The noise texture. R: value-noise fbm, features 1/4..1/16 of the tile; G: fbm 1/16..1/64; B: white noise per texel
// (pores, aggregate); A: ridges (|noise - .5|, near 0 on a thin line: cracks). All channels tile.
let _nt = null;
export function noiseTexture() {
  if (_nt) return _nt;
  const N = 256, a = new Uint8Array(N * N * 4);
  let s = 1980; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lat = P => { const g = new Float32Array(P * P); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; };
  const vn = (g, P, x, y) => {   // periodic value noise, x, y in lattice units
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const i0 = ((xi % P) + P) % P, j0 = ((yi % P) + P) % P, i1 = (i0 + 1) % P, j1 = (j0 + 1) % P;
    const A = g[j0 * P + i0], B = g[j0 * P + i1], C = g[j1 * P + i0], D = g[j1 * P + i1];
    return A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v;
  };
  const oct = [4, 8, 16, 32, 64].map(P => ({ P, g: lat(P) })), ridge = { P: 12, g: lat(12) };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const f = P => [i / N * P, j / N * P], n = k => vn(oct[k].g, oct[k].P, ...f(oct[k].P));
    const r = n(0) * 0.5 + n(1) * 0.3 + n(2) * 0.2, g = n(2) * 0.5 + n(3) * 0.3 + n(4) * 0.2;
    const rd = Math.abs(vn(ridge.g, ridge.P, ...f(ridge.P)) - 0.5) * 2;
    a.set([r * 255, g * 255, rnd() * 255, rd * 255].map(v => Math.max(0, Math.min(255, Math.round(v)))), (j * N + i) * 4);
  }
  _nt = new THREE.DataTexture(a, N, N, THREE.RGBAFormat);
  _nt.wrapS = _nt.wrapT = THREE.RepeatWrapping; _nt.magFilter = THREE.LinearFilter; _nt.minFilter = THREE.LinearMipmapLinearFilter;
  _nt.generateMipmaps = true; _nt.anisotropy = 1; _nt.colorSpace = THREE.NoColorSpace; _nt.needsUpdate = true; _nt.name = 'rk-detail-noise';
  return _nt;
}
// shared by every detailed material: one place to change the range / bump at run time
export const DETAIL_U = { rkDFar: { value: DETAIL_TIER === 1 ? 60 : 150 }, rkDBump: { value: DETAIL_TIER === 1 ? 0 : 1 }, rkNT: { value: null } };
const uniformsOnce = () => { if (!DETAIL_U.rkNT.value) DETAIL_U.rkNT.value = noiseTexture(); return DETAIL_U; };
export function setDetailRange(far, bump = 1) { DETAIL_U.rkDFar.value = far; DETAIL_U.rkDBump.value = DETAIL_TIER === 1 ? 0 : bump; }
// XR: a shorter range and half the bump (the headset's fill budget; the eye is closer to the ground there anyway)
export function bindXR(renderer) {
  if (!DETAIL_ON || !renderer?.xr) return;
  const far = DETAIL_U.rkDFar.value;
  renderer.xr.addEventListener('sessionstart', () => setDetailRange(Math.min(far, 60), 0.5));
  renderer.xr.addEventListener('sessionend', () => setDetailRange(far, 1));
}

// --------------------------------------------------------------------------------------------- shared GLSL
const commonGLSL = /* glsl */`
uniform float rkDFar, rkDBump;
uniform sampler2D rkNT;
varying vec3 rkOP;
float rkH2(vec2 p) { vec3 q = fract(p.xyx * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// 0 where a pattern of this period would alias at this pixel footprint, 1 where it is well resolved
float rkAA(float fw, float period) { return 1.0 - smoothstep(0.18 * period, 0.5 * period, fw); }
// a soft line mask: 1 on the line (half width w, in the pattern's units), band-limited by the pixel footprint fw
float rkLine(float dist, float w, float fw) { return 1.0 - smoothstep(w, w + max(fw, 1e-4), dist); }
`;
// the face frame from the geometric normal (object space): uv on the face in metres, kind 0 floor / 1 wall / 2 slope /
// 3 underside; then the three noise fetches every class shares (made here, outside any class branch, so their
// derivatives / mip selection are well defined): A large blotches, B fine grain / speckle, S vertical streaks
const frameGLSL = /* glsl */`
  vec3 rkN = normalize(cross(dFdx(rkOP), dFdy(rkOP)));
  vec3 rkAN = abs(rkN);
  vec2 rkT = length(rkN.xz) > 0.02 ? normalize(vec2(-rkN.z, rkN.x)) : vec2(1.0, 0.0);
  float rkKind = rkN.y > 0.93 ? 0.0 : rkN.y < -0.5 ? 3.0 : rkAN.y < 0.3 ? 1.0 : 2.0;
  vec2 rkUV = rkKind == 0.0 || rkKind == 3.0 ? rkOP.xz : vec2(dot(rkOP.xz, rkT), rkKind == 2.0 ? rkOP.y / max(length(rkN.xz), 0.2) : rkOP.y);
  vec2 rkFW2 = fwidth(rkUV); float rkFW = max(rkFW2.x, rkFW2.y);
  float rkDist = length(vViewPosition);
  float rkLod = 1.0 - smoothstep(rkDFar * 0.55, rkDFar, rkDist);
  float rkH = 0.0;      // bump height (m), read by the normal pass
  float rkRgh = 0.0;    // roughness offset
  vec4 rkNA = vec4(0.5), rkNB = vec4(0.5), rkNS = vec4(0.5);
  if (rkLod > 0.001) {
    rkNA = texture2D(rkNT, rkUV * 0.05 + rkSeed);                       // 20 m tile: r 5..1.2 m blotches, g 1.2..0.3 m, a ridges
    rkNB = texture2D(rkNT, rkUV * 0.25 + rkSeed.yx + 0.5);              // 4 m tile: r 1 m..25 cm, g 25..6 cm, b 1.6 cm speckle
    rkNS = texture2D(rkNT, vec2(rkUV.x * 0.45, rkUV.y * 0.03) + rkSeed); // stretched down the face: rain / rust runs
    // value-noise fbm sits in ~.3-.7: stretch it to the full range (contrast where it shows, the mean stays .5)
    rkNA.rg = smoothstep(vec2(0.22), vec2(0.78), rkNA.rg); rkNB.rg = smoothstep(vec2(0.22), vec2(0.78), rkNB.rg); rkNS.rg = smoothstep(vec2(0.25), vec2(0.75), rkNS.rg);
  }
`;
// the bump pass: Three's derivative bump (perturbNormalArb) on rkH, view space
const bumpGLSL = /* glsl */`
  {
    float rkB = rkDBump * rkLod;
    vec3 rkPX = dFdx(-vViewPosition), rkPY = dFdy(-vViewPosition);
    float rkHX = dFdx(rkH) * rkB, rkHY = dFdy(rkH) * rkB;
    vec3 rkR1 = cross(rkPY, normal), rkR2 = cross(normal, rkPX);
    float rkDet = dot(rkPX, rkR1);
    vec3 rkG = sign(rkDet) * (rkHX * rkR1 + rkHY * rkR2);
    if (abs(rkDet) > 1e-12) normal = normalize(abs(rkDet) * normal - rkG);
  }
`;

// --------------------------------------------------------------------------------------------- world classes
// k: albedo factor (~1 on average, so the far colour matches), rkCol: tinted base, rkH bump (m), rkRgh roughness.
const S = SURF;
const worldGLSL = (tier) => /* glsl */`
  vec3 rkBase = diffuseColor.rgb;
  if (rkLod > 0.001 && rkC != ${S.PLAIN}.0) {
    vec3 rkCol = rkBase; float k = 1.0;
    float b1 = rkNA.r, b2 = rkNA.g;                  // blotches: stains, recoats, damp
    float g1 = rkNB.g, sp = rkNB.b, lump = rkNB.r;   // grain, speckle, lumps
    float aG = rkAA(rkFW, 0.05), aS = rkAA(rkFW, 0.012);
    // rain streaks down any wall, stronger where the blotch noise is high
    float st = rkKind == 1.0 ? smoothstep(0.6, 0.9, rkNS.r) * (0.6 + 0.4 * b1) : 0.0;
    if (rkC == ${S.PLASTER}.0) {
      k = (0.88 + 0.24 * b1) * (0.96 + 0.08 * b2) * (1.0 - 0.09 * st) * (1.0 + (sp - 0.5) * 0.08 * aS);
      rkH = (g1 - 0.5) * 0.004 + (sp - 0.5) * 0.0008 * aS;
    } else if (rkC == ${S.CONCRETE}.0) {
      k = (0.85 + 0.3 * b1) * (0.95 + 0.1 * b2) * (0.94 + 0.12 * lump) * (1.0 - 0.18 * st);
      float pore = smoothstep(0.9, 0.97, sp) * aS * smoothstep(0.3, 0.6, lump);   // air holes: small round pits
      k *= 1.0 - 0.35 * pore; rkH = (g1 - 0.5) * 0.003 - pore * 0.0015;
      if (rkKind == 1.0) { float fl = abs(fract(rkUV.y / 1.2) - 0.5) * 1.2; k *= 1.0 - 0.1 * rkLine(0.6 - fl, 0.006, rkFW) * rkAA(rkFW, 0.1); }   // form-work lines
      else if (rkKind == 0.0) { float jx = abs(fract(rkUV.x / 4.0) - 0.5) * 4.0, jz = abs(fract(rkUV.y / 4.0) - 0.5) * 4.0;   // slab joints
        float j = max(rkLine(2.0 - jx, 0.01, rkFW), rkLine(2.0 - jz, 0.01, rkFW)) * rkAA(rkFW, 0.2); k *= 1.0 - 0.3 * j; rkH -= j * 0.004; }
      rkRgh = 0.06 * (b1 - 0.5);
    } else if (rkC == ${S.BAG}.0) {
      // woven poly / hessian: a 3 mm weave; each bag a pillow (filled bags slump: rounded top and bottom edges, the
      // rows 0.3 m from the site's ground as structures.js stacks them), lumpy fill, mud and bleaching
      float wv = (sp - 0.5) * aS;   // the weave: the fine speckle (mip-filtered; an analytic 3 mm weave moired)
      float pil = rkKind == 1.0 ? sin(3.14159 * fract(rkOP.y / 0.3)) * rkAA(rkFW, 0.12) : 1.0;
      k = (0.84 + 0.3 * lump) * (0.92 + 0.16 * b2) * (0.93 + 0.14 * g1) * (1.0 + 0.12 * wv) * (0.74 + 0.3 * pil);
      rkH = (lump - 0.5) * 0.02 + (g1 - 0.5) * 0.014 + pil * 0.03 + wv * 0.0003;   // + wrinkles
      rkCol = mix(rkBase, rkBase * vec3(1.06, 0.98, 0.86), smoothstep(0.45, 0.75, b1) * 0.6);   // sun-bleached / muddy bags
      rkRgh = 0.03;
    } else if (rkC == ${S.TARMAC}.0) {
      float ag = sp;                                               // aggregate chips (one texel ~6.5 mm, mip-filtered)
      k = (0.8 + 0.34 * b1) * (0.95 + 0.1 * b2) * (1.0 + (ag - 0.5) * 0.4 * aS);
      float crack = (1.0 - smoothstep(0.015, 0.015 + rkFW * 0.1, rkNA.a)) * rkAA(rkFW, 0.08) * smoothstep(0.3, 0.7, b2);   // cracks along ridge lines
      float oil = smoothstep(0.84, 0.98, b2) * smoothstep(0.4, 0.8, b1);   // oil / tyre stains: few, soft-edged
      k *= (1.0 - 0.5 * crack) * (1.0 - 0.24 * oil);
      rkH = (ag - 0.5) * 0.0025 * aS - crack * 0.006;
      rkRgh = -0.25 * oil + 0.04 * (ag - 0.5);
    } else if (rkC == ${S.METAL}.0) {
      // painted steel: mottled paint, rust running down from fixings, chipped to primer / bare steel
      k = (0.9 + 0.2 * b1) * (0.97 + 0.06 * g1);
      float rs = rkKind == 1.0 ? smoothstep(0.62, 0.85, rkNS.g) : 0.0;
      float chip = smoothstep(0.82, 0.9, b2 * 0.6 + g1 * 0.4) * aG;
      rkCol = mix(rkBase, vec3(0.16, 0.075, 0.035), rs * 0.45);
      rkCol = mix(rkCol, vec3(0.2, 0.2, 0.19), chip * 0.7);
      rkH = (g1 - 0.5) * 0.0015 - chip * 0.0006;
      rkRgh = 0.12 * rs - 0.2 * chip;
    } else if (rkC == ${S.WOOD}.0) {
      // boards along the face's horizontal, grain along them (the streak fetch turned sideways), dark gaps
      float gr = texture2D(rkNT, vec2(rkUV.x * 0.03, rkUV.y * 1.2)).g;
      float bd = abs(fract(rkUV.y / 0.18) - 0.5) * 0.18;
      float gap = rkLine(0.09 - bd, 0.004, rkFW) * rkAA(rkFW, 0.04);
      float tone = rkH2(vec2(floor(rkUV.y / 0.18), 3.0));
      k = (0.78 + 0.3 * gr + 0.18 * tone) * (1.0 - 0.45 * gap) * (0.92 + 0.16 * b1);
      rkCol = mix(rkBase, rkBase * vec3(0.78, 0.8, 0.84), smoothstep(0.45, 0.75, b1) * 0.5);   // silvered, weathered boards
      rkH = gr * 0.0015 - gap * 0.004;
    } else if (rkC == ${S.BRICK}.0 || rkC == ${S.STONE}.0) {
      bool st2 = rkC == ${S.STONE}.0;
      vec2 bs = st2 ? vec2(0.52, 0.3) : vec2(0.225, 0.075);
      float aB = rkKind == 1.0 ? rkAA(rkFW, bs.y) : 0.0;
      float row = floor(rkUV.y / bs.y);
      float bx = rkUV.x / bs.x + 0.5 * mod(row, 2.0) + (st2 ? rkH2(vec2(row, 5.0)) : 0.0);
      vec2 cell = vec2(floor(bx), row);
      float mx = min(fract(bx), 1.0 - fract(bx)) * bs.x, my = min(fract(rkUV.y / bs.y), 1.0 - fract(rkUV.y / bs.y)) * bs.y;
      float mort = rkLine(min(mx, my), st2 ? 0.012 : 0.005, rkFW) * aB;
      float tint = rkH2(cell);
      k = (st2 ? 0.78 + 0.4 * tint : 0.84 + 0.3 * tint) * (0.9 + 0.2 * b1) * (0.96 + 0.08 * g1);
      rkCol = mix(rkBase, st2 ? rkBase * 0.55 : vec3(0.42, 0.4, 0.36), mort);   // mortar: pale lime, stone joints dark
      if (!st2) rkCol *= mix(vec3(1.0), vec3(1.08, 0.94, 0.9), (tint - 0.5) * aB);   // a few redder / browner bricks
      k = mix(1.0, k, max(aB, 0.35)) * (1.0 - 0.14 * st);
      rkH = (1.0 - mort) * (st2 ? 0.012 : 0.004) * aB + (g1 - 0.5) * 0.002;
      rkRgh = 0.04 * mort;
    } else if (rkC == ${S.TILE}.0 || rkC == ${S.SLATE}.0) {
      bool sl = rkC == ${S.SLATE}.0;
      vec2 ts = sl ? vec2(0.3, 0.15) : vec2(0.27, 0.19);
      float aT = rkKind == 2.0 ? rkAA(rkFW, ts.y) : 0.0;
      float crs = rkUV.y / ts.y, fr = fract(crs), row = floor(crs);
      float tx = rkUV.x / ts.x + 0.5 * mod(row, 2.0);
      float tint = rkH2(vec2(floor(tx), row));
      float shadow = smoothstep(0.7, 1.0, fr);                        // the course above overlaps and shades this one
      float joint = rkLine(min(fract(tx), 1.0 - fract(tx)) * ts.x, 0.004, rkFW);
      k = ((sl ? 0.86 + 0.24 * tint : 0.8 + 0.36 * tint) * (1.0 - 0.35 * shadow) * (1.0 - 0.3 * joint) - 1.0) * aT + 1.0;
      k *= 0.88 + 0.24 * b1;
      rkCol = mix(rkBase, rkBase * vec3(0.85, 1.0, 0.7), smoothstep(0.7, 0.92, b2) * 0.45);   // lichen / moss
      rkH = (fr * (sl ? 0.008 : 0.015) - joint * 0.002) * aT;
      rkRgh = sl ? -0.08 : 0.0;
    } else if (rkC == ${S.CORRUGATED}.0) {
      float aC = rkAA(rkFW, 0.076);
      float rip = sin(dot(rkOP.xz, rkT) * 82.67);   // ridges across the face horizontal (round a quonset arc, down a wall)
      k = (0.88 + 0.24 * b1) * (1.0 + 0.06 * rip * aC);
      float rs = smoothstep(0.6, 0.85, rkNS.g);
      rkCol = mix(rkBase, vec3(0.2, 0.09, 0.04), rs * 0.35);
      rkH = rip * 0.009 * aC; rkRgh = 0.1 * rs;
    } else if (rkC == ${S.EARTH}.0 || rkC == ${S.TURF}.0) {
      float pb = smoothstep(0.86, 0.95, lump * 0.4 + sp * 0.6) * aG;   // pebbles / clods
      k = (0.76 + 0.44 * b1) * (0.88 + 0.24 * g1) * (1.0 + 0.25 * pb);
      if (rkC == ${S.TURF}.0) rkCol = mix(rkBase, rkBase * vec3(1.15, 1.05, 0.7), smoothstep(0.65, 0.9, b2) * 0.6);   // dry patches
      rkH = (g1 - 0.5) * 0.01 + pb * 0.008;
    } else if (rkC == ${S.CANVAS}.0) {
      float wv = (sp - 0.5) * aS;
      k = (0.84 + 0.32 * b1) * (1.0 + 0.1 * wv) * (0.94 + 0.12 * g1);
      rkH = wv * 0.0002 + (g1 - 0.5) * 0.004;
    } else if (rkC == ${S.MARKING}.0) {
      // worn road / pad paint: broken up by traffic, the surface underneath showing through
      float wear = smoothstep(0.6, 0.75, b2 * 0.55 + g1 * 0.45);
      rkCol = mix(rkBase, vec3(0.07, 0.07, 0.075), wear * 0.75);
      k = 0.92 + 0.12 * b1; rkH = (1.0 - wear) * 0.0008;
      rkRgh = -0.06;
    } else {
      // GENERIC: painted / rendered anything: a fine grain and gentle mottling
      k = (0.92 + 0.16 * b1) * (0.97 + 0.06 * g1) * (1.0 - 0.1 * st);
      rkH = (g1 - 0.5) * 0.0015;
    }
    if (rkKind == 3.0) k *= 0.8;   // soffits / overhang undersides: damp, cobwebs, no sky
    diffuseColor.rgb = mix(rkBase, rkCol * k, rkLod);
    rkRgh *= rkLod;
  }
`;
// medium tier (?rkdetail=1, the VR / low-end choice): no per-class patterns and no bump, only the shared blotches,
// grain and streaks (one short path for every class) plus the baked contact occlusion, out to 60 m
const worldMediumGLSL = /* glsl */`
  vec3 rkBase = diffuseColor.rgb;
  if (rkLod > 0.001 && rkC != ${S.PLAIN}.0) {
    float k = (0.88 + 0.24 * rkNA.r) * (0.95 + 0.1 * rkNB.g) * (1.0 - (rkKind == 1.0 ? 0.14 * smoothstep(0.55, 0.78, rkNS.r) : 0.0));
    diffuseColor.rgb = mix(rkBase, rkBase * k, rkLod);
  }
`;

// Patch a world material's shader (call inside its onBeforeCompile, after any fog-of-war replacement). Works on
// Lambert, Phong and Standard; on Standard it also varies roughness. defCls: the class for geometry without rkSurf.
export function worldDetailShader(sh, { defCls = SURF.GENERIC, tier = DETAIL_TIER } = {}) {
  Object.assign(sh.uniforms, uniformsOnce(), { rkDefCls: { value: defCls } });
  // rkSurf: (class, baked occlusion 0-255) per vertex from kit.js; absent -> (0, 0): the default class, no occlusion
  sh.vertexShader = 'attribute vec2 rkSurf;\nvarying vec3 rkOP; varying float rkSC, rkOcc;\n' + sh.vertexShader;
  sh.vertexShader = insertAfter(sh.vertexShader, '#include <begin_vertex>', 'rkOP = position; rkSC = rkSurf.x; rkOcc = rkSurf.y / 255.0;');
  sh.fragmentShader = `varying float rkSC, rkOcc; uniform float rkDefCls;\n${commonGLSL}\n${sh.fragmentShader}`;
  sh.fragmentShader = insertAfter(sh.fragmentShader, '#include <color_fragment>',
    'float rkC = floor(rkSC + 0.5); if (rkC < 0.5) rkC = rkDefCls; vec2 rkSeed = vec2(0.37, 0.11) * rkC;\n' + frameGLSL + (tier > 1 ? worldGLSL(tier) : worldMediumGLSL) + '\n  diffuseColor.rgb *= 1.0 - rkOcc;');
  if (sh.fragmentShader.includes('#include <roughnessmap_fragment>'))
    sh.fragmentShader = insertAfter(sh.fragmentShader, '#include <roughnessmap_fragment>', 'roughnessFactor = clamp(roughnessFactor + rkRgh, 0.05, 1.0);');
  if (tier > 1) sh.fragmentShader = insertAfter(sh.fragmentShader, '#include <normal_fragment_maps>', bumpGLSL);
}
// a material that has no onBeforeCompile of its own (or one that must run first): chain it
export function applyWorldDetail(m, opts = {}) {
  if (!DETAIL_ON) return m;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = function (sh, r) { prev.call(this, sh, r); worldDetailShader(sh, opts); };
  m.customProgramCacheKey = () => prevKey() + '|rkwd' + DETAIL_TIER + ':' + (opts.defCls || 0);
  m.needsUpdate = true;
  return m;
}

// --------------------------------------------------------------------------------------------- units
// Vehicles, aircraft and ships. Replaces RenderKit applySurfaceDetail in gamemats.pbr (same uniform names, so code
// that sets rkWet / rkDust live keeps working) and adds: panel lines (panel = size in m, 0 = none), streaks down the
// sides (rain / oil / rust), underside grime, paint grain and roughness variation. The dust mottle reads the noise
// texture on the face projection; camouflage (continuous across edges) keeps the kit's 3D FBM, only when it is on.
const unitGLSL = (tier) => /* glsl */`
  float rkMottle = texture2D(rkNT, rkUV * rkScale * 0.05 + 0.3).r;
  float rkD = clamp(rkDust * rkMottle, 0.0, 1.0);
  float rkW = clamp(rkWear * smoothstep(0.56, 0.78, rkMottle), 0.0, 1.0);
  float rkWetAmount = clamp(rkWet, 0.0, 1.0);
  if (rkCamo > 0.0) {
    float rkPattern = smoothstep(0.42, 0.5, rkFBM(rkOP * rkScale * 0.28));
    diffuseColor.rgb = mix(diffuseColor.rgb, rkCamoColor, rkPattern * clamp(rkCamo, 0.0, 1.0));
  }
  vec3 rkBase = diffuseColor.rgb;
  vec3 rkCol = rkBase;
  if (rkLod > 0.001) {
    // panel lines: an irregular box-projected layout in model space (some frames missing, the horizontal joins staggered
    // per bay, as on a real skin), the joins slightly dark and recessed; at least ~1 px wide, gone before they alias
    float pl = 0.0;
    if (rkPanel > 0.0) {
      vec2 pg = rkUV / vec2(rkPanel, rkPanel * 0.62);
      float ix = floor(pg.x + 0.5), bay = floor(pg.x), py = pg.y + rkH2(vec2(bay, 9.7)), iy = floor(py + 0.5);
      float dx = abs(pg.x - ix) * rkPanel, dy = abs(py - iy) * rkPanel * 0.62, w = max(0.004, rkFW * 0.5);
      pl = max(rkLine(dx, w, rkFW) * step(0.3, rkH2(vec2(ix, 3.1))), rkLine(dy, w, rkFW) * step(0.3, rkH2(vec2(bay, iy))));
      pl *= rkAA(rkFW, rkPanel * 0.3);
    }
    // streaks: rain / exhaust / oil running down vertical faces; rust on ships (rkStreakColor)
    float st = rkKind == 1.0 ? smoothstep(0.65, 0.92, rkNS.r) : 0.0;
    float g1 = rkNB.g;
    float under = rkKind == 3.0 ? 1.0 : 0.0;
    rkCol *= (1.0 - 0.22 * pl) * (0.94 + 0.12 * rkNA.g) * (0.97 + 0.06 * g1);
    // relative to the paint (a tinted darkening), so a dark hull gets darker runs, not a brown wash
    rkCol *= mix(vec3(1.0), rkStreakColor / max(dot(rkStreakColor, vec3(0.3333)), 1e-3) * 0.5, st * rkStreak);
    rkCol = mix(rkCol, rkCol * 0.62, under * rkDust * 1.2);   // oil, exhaust and road dirt under the belly / hull
    diffuseColor.rgb = mix(rkBase, rkCol, rkLod);
    rkH = (g1 - 0.5) * 0.0008 - pl * 0.0012;
    rkRgh = (0.1 * (rkMottle - 0.5) + 0.12 * st * rkStreak + 0.05 * (g1 - 0.5)) * rkLod;
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, rkBareColor, rkW);
  diffuseColor.rgb = mix(diffuseColor.rgb, rkDustColor, rkD);
  diffuseColor.rgb *= 1.0 - rkWetAmount * 0.23;
`;
export function applyUnitDetail(material, {
  scale = 3, dust = 0.12, wear = 0.08, wetness = 0, camouflage = 0, panel = 0, streak = 0.18,
  dustColor = 0x9f9278, bareColor = 0x818789, camoColor = 0x303c30, streakColor = 0x3a3428,
} = {}) {
  if (!material?.isMeshStandardMaterial) throw new TypeError('applyUnitDetail requires a MeshStandardMaterial');
  if (material.userData.renderkit) throw new Error('applyUnitDetail: material already patched');
  const C = c => new THREE.Color(c);
  const uniforms = {
    rkScale: { value: scale }, rkDust: { value: dust }, rkWear: { value: wear }, rkWet: { value: wetness },
    rkCamo: { value: camouflage }, rkPanel: { value: panel }, rkStreak: { value: streak },
    rkDustColor: { value: C(dustColor) }, rkBareColor: { value: C(bareColor) }, rkCamoColor: { value: C(camoColor) },
    rkStreakColor: { value: C(streakColor) },
  };
  const tier = DETAIL_TIER;
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r);
    Object.assign(sh.uniforms, uniforms, uniformsOnce());
    sh.vertexShader = 'varying vec3 rkOP;\n' + sh.vertexShader;
    sh.vertexShader = insertAfter(sh.vertexShader, '#include <begin_vertex>', 'rkOP = position;');
    sh.fragmentShader = `uniform float rkScale, rkDust, rkWear, rkWet, rkCamo, rkPanel, rkStreak;
      uniform vec3 rkDustColor, rkBareColor, rkCamoColor, rkStreakColor;\n${commonGLSL}\n${noiseGLSL}\n${sh.fragmentShader}`;
    sh.fragmentShader = insertAfter(sh.fragmentShader, '#include <color_fragment>', 'vec2 rkSeed = vec2(0.71, 0.23);\n' + frameGLSL + unitGLSL(tier));
    sh.fragmentShader = insertAfter(sh.fragmentShader, '#include <roughnessmap_fragment>', /* glsl */`
      roughnessFactor = clamp(roughnessFactor + rkRgh, 0.05, 1.0);
      roughnessFactor = mix(roughnessFactor, 0.4, rkW);
      roughnessFactor = mix(roughnessFactor, 0.96, rkD);
      roughnessFactor = clamp(mix(roughnessFactor, 0.16, rkWetAmount), 0.045, 1.0);`);
    sh.fragmentShader = insertAfter(sh.fragmentShader, '#include <metalnessmap_fragment>', 'metalnessFactor = mix(metalnessFactor, 0.85, rkW) * (1.0 - rkD);');
    if (tier > 1) sh.fragmentShader = insertAfter(sh.fragmentShader, '#include <normal_fragment_maps>', bumpGLSL);
  };
  material.customProgramCacheKey = () => prevKey() + '|rkud' + tier;
  material.userData.renderkit = { key: 'unitdetail', uniforms };
  material.needsUpdate = true;
  return material;
}

// --------------------------------------------------------------------------------------------- the helipad
// The pad and the apron are drawn by the terrain shader (main.js). With RK 'surface' on it paints them as a real
// 1980 helipad: a broom-finished concrete disc with expansion joints, oil and rotor-wash staining, a worn white
// perimeter and touchdown circle, a white H, and the owner's colour as a faded painted band (readable, not neon).
// In: vW (world pos), d (distance to the pad centre), q (uPadP: x, z, kind, yaw?), the light factor `l` in classic
// lighting, `c` the colour so far. PAD_R / APRON as numbers.
export function padGLSL(PAD_R, rkLit) {
  const R = PAD_R.toFixed(1), RO = (PAD_R + 2.5).toFixed(1);
  return /* glsl */`
      {
        vec2 rp = vW.xz - q.xy; float rd = length(cameraPosition - vW);
        float lodP = 1.0 - smoothstep(60.0, 160.0, rd);
        float n1 = 0.5 + 0.5 * sin(vW.x * 1.7 + sin(vW.z * 1.3) * 1.5) * sin(vW.z * 1.9 + sin(vW.x * 1.1));   // smooth wear field
        float b = sin(vW.x * 0.37 + sin(vW.z * 0.21) * 2.0) * sin(vW.z * 0.29 + sin(vW.x * 0.17) * 2.0);   // broad stains
        float fwp = max(fwidth(vW.x), fwidth(vW.z));
        float fn = (sin(vW.x * 7.3 + sin(vW.z * 5.1) * 2.0) * sin(vW.z * 6.7 + sin(vW.x * 4.3) * 2.0) * 0.6 + sin(vW.x * 2.3 - vW.z * 1.7) * 0.4) * (1.0 - smoothstep(0.05, 0.25, fwp));   // ~1 m mottling, gone before it aliases
        if (q.z < .5 && d < 26.) {   // the concrete apron: 4 m slabs, joints, recoat patches, tyre / skid marks
          vec2 tl = abs(fract(vW.xz / 4.) - .5) * 4.;
          float joint = (1.0 - smoothstep(0.03, 0.03 + fwp, 2.0 - max(tl.x, tl.y))) * (1.0 - smoothstep(0.04, 0.2, fwp));
          float slab = fract(sin(dot(floor(vW.xz / 4.), vec2(41.3, 17.9))) * 4375.5);
          vec3 cc = vec3(.4, .405, .41) * (0.93 + 0.1 * slab) * (0.94 + 0.06 * b * lodP) * (1.0 + 0.045 * fn * lodP);
          c = mix(cc, cc * 0.62, joint) * ${rkLit};
        }
        if (d < ${RO}) {
          float r = d;
          vec3 conc = vec3(.43, .43, .42) * (0.95 + 0.05 * b * lodP) * (1.0 + 0.045 * fn * lodP);
          // rotor-wash: the centre darker with exhaust soot and oil, a ring of scuffs where skids land
          conc *= 1.0 - 0.16 * (1.0 - smoothstep(1.5, 6.0, r)) - 0.08 * smoothstep(0.3, 0.9, b) * lodP;
          vec3 pc = conc;
          if (r < ${R}) {
            float aaw = max(fwp, 0.02);
            float wear = smoothstep(0.35, 0.75, n1 * 0.5 + 0.5 * (0.5 + 0.5 * b)) * lodP;   // worn paint patches
            // the owner's band (inner of the two outer rings): the team colour as old paint, desaturated and darkened
            vec3 own = uPadCol[pi]; float ol = dot(own, vec3(.2126, .7152, .0722));
            own = mix(vec3(ol), own, 0.42) * 0.5;
            float band = smoothstep(${R} - 1.5 - aaw, ${R} - 1.5 + aaw, r) * (1.0 - smoothstep(${R} - 0.85 - aaw, ${R} - 0.85 + aaw, r));
            float edge = smoothstep(${R} - 0.35 - aaw, ${R} - 0.35 + aaw, r);   // white perimeter line
            float tdc = 1.0 - smoothstep(0.22 - aaw, 0.22 + aaw, abs(r - ${(PAD_R * 0.52).toFixed(2)}));   // touchdown circle
            // the H, turned to the pad's yaw (uPadP.w), 3 x 4.5 m, 0.6 m strokes
            float cy = cos(q.w), sy = sin(q.w); vec2 hp = vec2(cy * rp.x - sy * rp.y, sy * rp.x + cy * rp.y);
            vec2 ah = abs(hp);
            float hBar = step(ah.y, 2.25) * (smoothstep(1.5 + aaw, 1.5 - aaw, ah.x) - smoothstep(0.9 + aaw, 0.9 - aaw, ah.x));
            float hMid = step(ah.x, 1.2) * smoothstep(0.3 + aaw, 0.3 - aaw, ah.y);
            float h = clamp(hBar + hMid, 0.0, 1.0);
            vec3 white = vec3(.66, .66, .62);
            pc = mix(pc, own, band * (1.0 - wear * 0.45));
            pc = mix(pc, white, max(max(edge, tdc), h) * (1.0 - wear * 0.55));
          }
          c = pc * ${rkLit};
        }
      }
`;
}
// the hazard ring round a cave base's shaft mouth: faded yellow / black chevrons (enemy: red / white) instead of neon
// hazard stripes: an anti-aliased square wave (one pixel of blur, capped where atan wraps) - a hard step stair-stepped
export function shaftRingGLSL(rkLit) {
  return /* glsl */`pc=mix(vec3(.07,.07,.075),mix(vec3(.62,.5,.14),vec3(.55,.14,.1),b.w),clamp((abs(fract(a*3.82)-.5)-.25)/min(max(fwidth(a*3.82),1e-4),.25)+.5,0.,1.))*${rkLit}*(0.9+0.1*sin(vW.x*1.7)*sin(vW.z*1.3));`;
}
