// Original NGC-1980 Kit surfaces. One shared, mipmapped 512px data tile serves weapon parts and legacy figures.
// The welded look-people body and SDF hands use figgeo.js's independent aFig/aRM material contract.
// Coordinates are authored/rest positions before skinning: fabric, pores and wear follow the moving surface.
// Camo is evaluated per fragment, so its outline is independent of the garment's triangle layout.
import * as THREE from 'three';
import { RK } from '../../renderkit/adopt.js';
import { DETAIL_TIER, DETAIL_U } from '../../renderkit/detail.js';

export const FIGURE_SURFACES = Object.freeze({ fabric: 0, skin: 1, steel: 2, plastic: 3, rubber: 4, leather: 5, webbing: 6 });
/** @typedef {keyof typeof FIGURE_SURFACES | number} SurfaceRole */
/** @typedef {{pattern: number, scale: number, seed: number, role: number}} SurfaceSpec */
/** @typedef {((x: number, y: number, z: number) => number) & {figureSurface?: Readonly<SurfaceSpec>}} SurfacePaint */
/** @param {SurfaceRole} role */
const surfaceID = role => typeof role === 'number' ? role : FIGURE_SURFACES[role] ?? -1;
/**
 * @param {SurfacePaint} paint
 * @param {{pattern?: number, scale?: number, seed?: number, role?: SurfaceRole}} [options]
 */
export function tagFigurePaint(paint, { pattern = 0, scale = 0.1, seed = 0, role = -1 } = {}) {
  paint.figureSurface = Object.freeze({ pattern, scale, seed, role: surfaceID(role) });
  return paint;
}
/** @param {number | SurfacePaint} color @param {SurfaceRole} [role] */
export function surfacePaint(color, role = 'fabric') {
  return tagFigurePaint(typeof color === 'function' ? color : () => color, { role });
}
// New authored/skinned geometry can opt into the same surface contract as Kit. This is a build-time operation.
// Existing vertex colours are preserved; they remain the ?rk=0 / ?rkdetail=0 fallback and tint non-patterned parts.
/** @param {THREE.BufferGeometry} geometry @param {{paint?: number | SurfacePaint, role?: SurfaceRole}} [options] */
export function applyFigureAttributes(geometry, { paint, role } = {}) {
  const p = geometry.attributes.position, spec = typeof paint === 'function' ? paint.figureSurface : undefined;
  const data = new Float32Array(p.count * 4), col = !geometry.attributes.color && paint !== undefined ? new Float32Array(p.count * 3) : null;
  const c = new THREE.Color(), r = role === undefined ? spec?.role ?? -1 : surfaceID(role);
  for (let i = 0; i < p.count; i++) {
    data.set([spec?.pattern ?? 0, spec?.scale ?? 0.1, spec?.seed ?? 0, r], i * 4);
    if (col) { c.setHex(typeof paint === 'function' ? paint(p.getX(i), p.getY(i), p.getZ(i)) : paint); c.toArray(col, i * 3); }
  }
  geometry.setAttribute('figCoord', p.clone());
  geometry.setAttribute('figSurface', new THREE.BufferAttribute(data, 4));
  if (col) geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geometry;
}

let sharedTexture;
export function figureTexture() {
  if (sharedTexture) return sharedTexture;
  const N = 512, pixels = new Uint8Array(N * N * 4), TAU = Math.PI * 2;
  let seed = 19801107;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const grids = new Map();
  for (const size of [4, 8, 16, 32, 64, 128]) { const g = new Float32Array(size * size); for (let i = 0; i < g.length; i++) g[i] = rnd(); grids.set(size, g); }
  const noise = (size, x, y) => {
    x *= size; y *= size;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), g = grids.get(size);
    const at = (a, b) => g[((b % size + size) % size) * size + (a % size + size) % size];
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const byte = v => Math.round(Math.max(0, Math.min(1, v)) * 255);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    // Warped overlapping leaf lobes, with a smaller field cutting the broad shapes into irregular fingers.
    // Periodic lattice and integer-frequency weave make every channel tile at all mip levels.
    const wx = u + (noise(4, u, v) - 0.5) * 0.19, wy = v + (noise(4, u + 0.37, v + 0.61) - 0.5) * 0.19;
    const broad = 0.62 * noise(8, wx, wy) + 0.25 * noise(16, wx, wy) + 0.13 * noise(32, wx, wy);
    const leaf = 0.68 * noise(8, wx + 0.41, wy + 0.73) + 0.32 * noise(32, wx + 0.17, wy + 0.31);
    // Cotton threads: alternating over/under crossings, a little irregular fibre thickness, no white speckle.
    const tx = Math.sin(u * TAU * 64), ty = Math.sin(v * TAU * 64), over = Math.sin(u * TAU * 32) * Math.sin(v * TAU * 32);
    const weave = 0.5 + (tx * 0.17 + ty * 0.17) * (0.84 + over * 0.16) + (noise(128, u, v) - 0.5) * 0.12;
    // A low-contrast, smooth grain field for skin pores, worn leather and parkerized metal.
    const grain = 0.65 * noise(128, u + 0.29, v + 0.57) + 0.35 * noise(64, u, v);
    const i = (y * N + x) * 4;
    pixels[i] = byte(broad); pixels[i + 1] = byte(leaf); pixels[i + 2] = byte(weave); pixels[i + 3] = byte(grain);
  }
  sharedTexture = new THREE.DataTexture(pixels, N, N, THREE.RGBAFormat);
  sharedTexture.name = 'ngc-figure-cotton-grain';
  sharedTexture.wrapS = sharedTexture.wrapT = THREE.RepeatWrapping;
  sharedTexture.magFilter = THREE.LinearFilter; sharedTexture.minFilter = THREE.LinearMipmapLinearFilter;
  sharedTexture.generateMipmaps = true; sharedTexture.anisotropy = 4;
  sharedTexture.colorSpace = THREE.NoColorSpace; sharedTexture.needsUpdate = true;
  return sharedTexture;
}
const linear = hex => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(6)},${c.g.toFixed(6)},${c.b.toFixed(6)})`; };
const sharedGLSL = /* glsl */`
uniform sampler2D figTex;
uniform float figRole, figBump;
varying vec3 figP, figN;
varying vec4 figS;
vec3 figPattern(vec2 field, float pattern) {
  float aa = max(0.006, max(fwidth(field.x), fwidth(field.y)) * 0.85);
  if (pattern < 1.5) {
    vec3 c = mix(${linear(0x7d8a52)}, ${linear(0x4c5a35)}, smoothstep(0.39-aa, 0.39+aa, field.x));
    c = mix(c, ${linear(0x5a4a30)}, smoothstep(0.585-aa, 0.585+aa, field.x));
    return mix(c, ${linear(0x24271c)}, smoothstep(0.635-aa, 0.635+aa, field.y));
  }
  if (pattern < 2.5) return ${linear(0x53563a)} * (0.91 + field.x * 0.18);
  vec3 c = mix(${linear(0x3d4a2a)}, ${linear(0x56643a)}, smoothstep(0.37-aa,0.37+aa,field.x));
  c = mix(c, ${linear(0x6e7a40)}, smoothstep(0.58-aa,0.58+aa,field.x));
  return mix(c, ${linear(0x2c321f)}, smoothstep(0.64-aa,0.64+aa,field.y));
}
vec4 figTriplanar(vec3 p, vec3 w) {
  return texture2D(figTex,p.yz) * w.x + texture2D(figTex,p.zx) * w.y + texture2D(figTex,p.xy) * w.z;
}
`;
const surfaceGLSL = /* glsl */`
  vec3 figWeights = pow(abs(normalize(figN)), vec3(6.0));
  figWeights /= max(dot(figWeights, vec3(1.0)), 0.0001);
  vec3 figCP = figP / (max(figS.y, 0.025) * 6.4) + vec3(figS.z * 0.137, figS.z * 0.231, figS.z * 0.319);
  vec4 figCX = texture2D(figTex, figCP.yz), figCY = texture2D(figTex, figCP.zx), figCZ = texture2D(figTex, figCP.xy);
  vec4 figCoarse = figCX * figWeights.x + figCY * figWeights.y + figCZ * figWeights.z;
  if (figS.x > 0.5) {
    diffuseColor.rgb = figPattern(figCX.rg,figS.x) * figWeights.x + figPattern(figCY.rg,figS.x) * figWeights.y + figPattern(figCZ.rg,figS.x) * figWeights.z;
  }
  float figR = figS.w < -0.5 ? figRole : figS.w;
  float figLod = 1.0 - smoothstep(3.0, 14.0, length(vViewPosition));
  float figHeight = 0.0, figRough = 0.0, figMetal = -1.0;
  float figBaseRough = figR < 0.5 ? 0.93 : figR < 1.5 ? 0.58 : figR < 2.5 ? 0.5 : figR < 3.5 ? 0.44 : figR < 4.5 ? 0.9 : figR < 5.5 ? 0.72 : 0.86;
  vec4 figFine = vec4(0.5);
  #if FIG_DETAIL_TIER > 1
    figFine = figTriplanar(figP / 0.064, figWeights);
  #endif
  float figGrain = figFine.a - 0.5, figWeave = figFine.b - 0.5, figMottle = figCoarse.g - 0.5;
  if (figR < 0.5 || figR > 5.5) {
    // Woven cotton utility cloth / tighter ALICE nylon. Colour stays quiet; relief catches grazing light.
    float web = step(5.5, figR);
    diffuseColor.rgb *= 1.0 + (figMottle * 0.14 + figWeave * 0.075) * figLod;
    figHeight = (figWeave * mix(0.00016,0.00012,web) + figMottle * 0.00008) * figLod;
    figRough = (figGrain * 0.07 - web * 0.07) * figLod;
  } else if (figR < 1.5) {
    // Pore relief is tens of microns, avoiding the coarse stipple and glossy doll-skin look.
    diffuseColor.rgb *= vec3(1.0 + figMottle * 0.035, 1.0 + figMottle * 0.016, 1.0 + figMottle * 0.01);
    figHeight = figGrain * 0.000055 * figLod;
    figRough = (figGrain * 0.10 + figMottle * 0.035) * figLod;
  } else if (figR < 2.5) {
    float curve = clamp(length(fwidth(normalize(figN))) / max(length(fwidth(figP)), 0.0001) * 0.0013, 0.0, 1.0);
    float wear = curve * smoothstep(0.38,0.69,figCoarse.g) * 0.26 * figLod;
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 + figMottle * 0.12), diffuseColor.rgb * 1.5 + vec3(0.025), wear);
    figHeight = figGrain * 0.000025 * figLod;
    figRough = (figGrain * 0.07 - wear * 0.24) * figLod;
    figMetal = 0.22 + wear * 0.2;
  } else if (figR < 3.5) {
    diffuseColor.rgb *= 1.0 + figMottle * 0.09 * figLod;
    figHeight = figGrain * 0.000045 * figLod;
    figRough = figGrain * 0.055 * figLod;
  } else if (figR < 4.5) {
    diffuseColor.rgb *= 1.0 + figMottle * 0.1 * figLod;
    figHeight = figGrain * 0.00012 * figLod;
    figRough = 0.08;
  } else {
    diffuseColor.rgb *= 1.0 + (figMottle * 0.15 + figGrain * 0.08) * figLod;
    figHeight = figGrain * 0.0002 * figLod;
    figRough = (figGrain * 0.1 - 0.1) * figLod;
  }
`;
const bumpGLSL = /* glsl */`
  {
    vec3 figPX = dFdx(-vViewPosition), figPY = dFdy(-vViewPosition);
    vec3 figR1 = cross(figPY, normal), figR2 = cross(normal, figPX);
    float figDet = dot(figPX, figR1);
    vec3 figGradient = sign(figDet) * (dFdx(figHeight) * figR1 + dFdy(figHeight) * figR2) * figBump;
    if (abs(figDet) > 1e-12) normal = normalize(abs(figDet) * normal - figGradient);
  }
`;
function after(source, marker, code) {
  if (!source.includes(marker)) throw new Error('Figure material shader chunk missing: ' + marker);
  return source.replace(marker, marker + '\n' + code);
}
/** @param {SurfaceRole} [role] */
export function applyFigureMaterial(material, role = 'fabric') {
  if (!RK.on('figures') || DETAIL_TIER === 0) return material;
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey.bind(material);
  material.defines = { ...material.defines, FIG_DETAIL_TIER: DETAIL_TIER };
  // Also supports direct Standard meshes (the shader then uses position and a plain material role).
  material.defaultAttributeValues = { ...material.defaultAttributeValues, figCoord: [0,0,0], figSurface: [0,0,0,-1] };
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, { figTex: { value: figureTexture() }, figRole: { value: surfaceID(role) }, figBump: DETAIL_U.rkDBump });
    shader.vertexShader = 'attribute vec3 figCoord; attribute vec4 figSurface; varying vec3 figP, figN; varying vec4 figS;\n' + shader.vertexShader;
    shader.vertexShader = after(shader.vertexShader, '#include <begin_vertex>', 'figP = figSurface.y > 0.0 ? figCoord : position; figN = normal; figS = figSurface;');
    shader.fragmentShader = sharedGLSL + shader.fragmentShader;
    shader.fragmentShader = after(shader.fragmentShader, '#include <color_fragment>', surfaceGLSL);
    shader.fragmentShader = after(shader.fragmentShader, '#include <roughnessmap_fragment>', 'roughnessFactor = clamp((figS.w >= 0.0 ? figBaseRough : roughnessFactor) + figRough, 0.22, 1.0);');
    shader.fragmentShader = after(shader.fragmentShader, '#include <metalnessmap_fragment>', 'if (figS.w >= 0.0) metalnessFactor = 0.0; if (figMetal >= 0.0) metalnessFactor = figMetal;');
    if (DETAIL_TIER > 1) shader.fragmentShader = after(shader.fragmentShader, '#include <normal_fragment_maps>', bumpGLSL);
  };
  // Role is a uniform, so skin/fabric/steel share programs when their Three material defines match.
  material.customProgramCacheKey = () => previousKey() + '|ngc-figure-surface-v1:' + DETAIL_TIER;
  material.userData.figureSurface = { version: 1, tier: DETAIL_TIER, role, sharedTexture: true };
  return material;
}
