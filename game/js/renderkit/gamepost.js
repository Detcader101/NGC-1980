// RENDERKIT post: the game's desktop post pipeline. Only built when RK.on('post'); main.js draws straight to the canvas
// otherwise (and always in XR: this file never runs while presenting).
//
// ngc/depth-post: scene depth -> ambient occlusion (half res, bilateral), thresholded bloom (mip chain), and a filmic
// grade (highlight shoulder, S-curve contrast, chroma-aware saturation, warm highlights / cool shadows, light vignette).
//
// Display-referred, on purpose (findings/rk-fx.md). The game was authored with no tone mapping, and several of its own
// ShaderMaterials (terrain, fx.js particles and decals, sea life) write display (sRGB) values straight to gl_FragColor.
// So the scene target is flagged the way Three treats an XR framebuffer (isXRRenderTarget with an sRGB texture): every
// material encodes into it exactly as onto the canvas and the target holds the classic frame pixel for pixel. The passes
// here decode that display colour to linear light (exact sRGB curve), apply AO and bloom there, compress the highlights,
// re-encode, and grade in display space. renderer.toneMapping stays NoToneMapping everywhere, outputColorSpace is
// linear only while the passes draw (no second encode), both restored afterwards.
//
// Frame (desktop world view, see render()):
//   1. world -> scene target (RGBA8, 4x MSAA, depth texture)
//   2. AO at half res from the depth (SAO-style hemisphere taps, normals from depth), 2 bilateral blur passes
//   3. bloom: threshold + Karis average at half res, down to 1/32, tent upsample back
//   4. optional overlay (the first-person arms and weapon) -> its own MSAA target with alpha
//   5. composite to the canvas: AO (depth-aware upsample) -> overlay -> bloom -> shoulder -> encode -> grade
//
// Every number lives in POST_TIERS / POST_GRADE below. ?rkpost=low|medium|high picks the tier (default high);
// ?rkpost=off leaves the post out entirely (main.js). Live: __G.rkPost.setQuality('low'), __G.rkPost.set(name, v).
import * as THREE from 'three';

export const POST_GRADE = Object.freeze({
  vignette: 0.1, grain: 0, temporal: 0, nightVision: 0,
  contrast: 1.2,               // S-curve slope at the pivot (display space); 1 = off
  pivot: 0.42,                 // display value the S-curve turns about
  saturation: 0.9,             // overall
  satHigh: 0.82,               // extra factor for strongly chromatic colours (chroma > ~0.6): the cyan pad paint, flat greens
  shoulder: 0.8,               // linear value above which highlights roll off (bloom and glints compress instead of clip)
  warm: [1.035, 1.0, 0.955],   // highlight tint
  cool: [0.975, 0.99, 1.04],   // shadow tint
  split: 1,                    // 0 = no split toning
});

// per tier: ao samples (0 = off), blur passes, bloom levels (0 = off); radius in metres grows with distance and fades out
export const POST_TIERS = Object.freeze({
  low:    { ao: 0,  blur: 0, bloom: 0 },
  medium: { ao: 6,  blur: 1, bloom: 4 },
  high:   { ao: 10, blur: 2, bloom: 5 },
});
export const POST_AO = Object.freeze({
  radius: 0.3, radiusPerM: 0.014, radiusMax: 2.5,   // world radius r(z) = clamp(radius + z*radiusPerM, radius, radiusMax)
  pxMax: 0.09,                // cap on the screen radius, fraction of the half-res height (cache and halo control)
  intensity: 2.0, bias: 0.15, power: 1.5,
  fadeNear: 140, fadeFar: 520, // metres: AO gone by fadeFar (the haze and the fog take over)
  strength: 1.0,
});
export const POST_BLOOM = Object.freeze({ threshold: 0.8, knee: 0.14, intensity: 0.7, scatter: 0.7 });

export function postQuality() {
  let q = null; try { q = new URLSearchParams(location.search).get('rkpost'); } catch (e) {}
  q = (q || 'high').toLowerCase();
  return q === 'off' || q === '0' ? 'off' : POST_TIERS[q] ? q : 'high';
}

const VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DEPTH = /* glsl */`
  uniform sampler2D tDepth; uniform float uNear, uFar; uniform vec4 uProj;
  // positive distance along the view axis from the depth buffer (perspective, not reversed)
  float viewZ(vec2 uv) { float d = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - (uFar - uNear) * d); }
  bool isSky(vec2 uv) { return texture2D(tDepth, uv).x >= 0.999999; }
  vec3 viewPos(vec2 uv, float z) { vec2 n = uv * 2.0 - 1.0; return vec3((n.x + uProj.z) * z / uProj.x, (n.y + uProj.w) * z / uProj.y, -z); }`;
const SRGB = /* glsl */`
  vec3 dec(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
  vec3 enc(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }`;

const AO_FS = (n) => /* glsl */`
  #define SAMPLES ${n}
  varying vec2 vUv; uniform vec2 uFull, uHalf;
  uniform float uR0, uRk, uRmax, uPxMax, uIntensity, uBias, uPower, uFadeNear, uFadeFar;
  ${DEPTH}
  void main() {
    // positions at full-res texel centres: the depth is point-sampled there, an unsnapped xy would put every tap off its
    // surface by up to half a pixel (horizontal AO stripes on the ground at grazing angles)
    vec2 uv0 = (floor(vUv * uFull) + 0.5) / uFull;
    if (isSky(uv0)) { gl_FragColor = vec4(1.0); return; }
    float z = viewZ(uv0); vec3 P = viewPos(uv0, z);
    // face normal from depth: per axis the neighbour on the same surface (smaller depth step), so silhouettes stay clean
    vec2 px = 1.0 / uFull;
    vec2 ur = uv0 + vec2(px.x, 0.0), ul = uv0 - vec2(px.x, 0.0), uu = uv0 + vec2(0.0, px.y), ud = uv0 - vec2(0.0, px.y);
    vec3 Pr = viewPos(ur, viewZ(ur)), Pl = viewPos(ul, viewZ(ul)), Pu = viewPos(uu, viewZ(uu)), Pd = viewPos(ud, viewZ(ud));
    vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
    vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
    vec3 N = normalize(cross(dx, dy));
    float rW = clamp(uR0 + z * uRk, uR0, uRmax);
    float rPx = min(rW * uProj.y * 0.5 * uHalf.y / z, uPxMax * uHalf.y);
    float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, z);
    if (rPx < 0.75 || fade <= 0.0) { gl_FragColor = vec4(1.0); return; }
    // fixed per-pixel rotation (interleaved gradient noise): stable when nothing moves, the blur removes the pattern
    float rot = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float occ = 0.0, r2 = rW * rW;
    for (int i = 0; i < SAMPLES; i++) {
      float t = (float(i) + 0.5) / float(SAMPLES);
      float a = float(i) * 2.3999632 + rot;
      vec2 suv = (floor((uv0 + vec2(cos(a), sin(a)) * (rPx * mix(0.08, 1.0, t * t)) / uHalf) * uFull) + 0.5) / uFull;
      if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
      vec3 v = viewPos(suv, viewZ(suv)) - P;
      float vv = dot(v, v);
      // range check: a tap far in front (a silhouette) or behind (the sky) does not occlude -> no halos
      occ += max(0.0, 1.0 - vv / r2) * max(0.0, dot(v, N) * inversesqrt(vv + 1e-6) - uBias);
    }
    float ao = clamp(1.0 - uIntensity * occ * (2.0 / float(SAMPLES)), 0.0, 1.0);
    ao = pow(ao, uPower);
    gl_FragColor = vec4(vec3(mix(1.0, ao, fade)), 1.0);
  }`;

const BLUR_FS = /* glsl */`
  varying vec2 vUv; uniform sampler2D tAO; uniform vec2 uStep;
  ${DEPTH}
  void main() {
    float z0 = viewZ(vUv), sum = 0.0, wsum = 0.0;
    for (int i = -4; i <= 4; i++) {
      vec2 uv = vUv + uStep * float(i);
      float g = exp(-float(i * i) / 9.0);
      float w = g * exp(-abs(viewZ(uv) - z0) * 24.0 / z0);   // relative depth: edges keep their AO, no bleed across
      sum += texture2D(tAO, uv).r * w; wsum += w;
    }
    gl_FragColor = vec4(vec3(sum / max(wsum, 1e-4)), 1.0);
  }`;

const PRE_FS = /* glsl */`
  varying vec2 vUv; uniform sampler2D tScene; uniform vec2 uTexel; uniform float uThreshold, uKnee;
  ${SRGB}
  vec3 tap(vec2 uv) {
    vec3 c = dec(texture2D(tScene, uv).rgb);
    // brightness: luma, or for strongly warm colours (flames, fireballs, tracers' hot cores) the red channel. The frame is
    // display-referred and clamped, so a fire is never brighter than 1; without this only white-hot cores would bloom.
    // Sunlit dirt and red roofs stay far below (red channel < 0.5 linear).
    float l = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.95 * c.r * smoothstep(0.25, 0.6, c.r - c.b));
    float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
    return c * max(soft, l - uThreshold) / max(l, 1e-4);
  }
  void main() {
    // 4 bilinear taps = a 4x4 box; Karis weights (1 / (1 + luma)) so one sparkling glint pixel cannot flicker the bloom
    vec3 a = tap(vUv + uTexel * vec2(-1, -1)), b = tap(vUv + uTexel * vec2(1, -1)), c = tap(vUv + uTexel * vec2(-1, 1)), d = tap(vUv + uTexel * vec2(1, 1));
    vec4 w = 1.0 / (1.0 + vec4(dot(a, vec3(0.2126, 0.7152, 0.0722)), dot(b, vec3(0.2126, 0.7152, 0.0722)), dot(c, vec3(0.2126, 0.7152, 0.0722)), dot(d, vec3(0.2126, 0.7152, 0.0722))));
    gl_FragColor = vec4((a * w.x + b * w.y + c * w.z + d * w.w) / dot(w, vec4(1.0)), 1.0);
  }`;
const DOWN_FS = /* glsl */`
  varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
  void main() {
    gl_FragColor = vec4(0.25 * (texture2D(tSrc, vUv + uTexel * vec2(-1, -1)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1, -1)).rgb
      + texture2D(tSrc, vUv + uTexel * vec2(-1, 1)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1, 1)).rgb), 1.0);
  }`;
const UP_FS = /* glsl */`
  varying vec2 vUv; uniform sampler2D tSrc, tBase; uniform vec2 uTexel; uniform float uScatter;
  void main() {
    vec3 s = texture2D(tSrc, vUv).rgb * 4.0;   // 3x3 tent on the coarser level
    s += (texture2D(tSrc, vUv + vec2(uTexel.x, 0)).rgb + texture2D(tSrc, vUv - vec2(uTexel.x, 0)).rgb + texture2D(tSrc, vUv + vec2(0, uTexel.y)).rgb + texture2D(tSrc, vUv - vec2(0, uTexel.y)).rgb) * 2.0;
    s += texture2D(tSrc, vUv + uTexel).rgb + texture2D(tSrc, vUv - uTexel).rgb + texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb + texture2D(tSrc, vUv + vec2(-uTexel.x, uTexel.y)).rgb;
    gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s / 16.0 * uScatter, 1.0);
  }`;

const COMP_FS = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D tScene, tAO, tBloom, tOver;
  uniform vec2 uFull, uHalf; uniform float uAO, uBloom, uOver, uDebug;
  uniform float rkTime, rkVignette, rkGrain, rkSaturation, rkContrast, rkTemporal, rkNight;
  uniform float uPivot, uSatHigh, uShoulder, uSplit; uniform vec3 uWarm, uCool;
  ${DEPTH}
  ${SRGB}
  // AO from half res: the 4 half-res texels round this pixel, weighted bilinear x depth similarity (no halo at edges)
  float upAO(float z) {
    vec2 f = vUv * uHalf - 0.5, b = floor(f), t = f - b;
    float sum = 0.0, wsum = 0.0;
    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
      vec2 uv = (b + vec2(float(i), float(j)) + 0.5) / uHalf;
      float wb = (i == 0 ? 1.0 - t.x : t.x) * (j == 0 ? 1.0 - t.y : t.y);
      float w = (wb + 1e-3) / (1e-3 + abs(viewZ(uv) - z) / z * 40.0);
      sum += texture2D(tAO, uv).r * w; wsum += w;
    }
    return sum / max(wsum, 1e-5);
  }
  vec3 scurve(vec3 x, float p, float c) {
    x = clamp(x, 0.0, 1.0);
    vec3 lo = p * pow(x / p, vec3(c)), hi = 1.0 - (1.0 - p) * pow((1.0 - x) / (1.0 - p), vec3(c));
    return mix(lo, hi, step(p, x));
  }
  void main() {
    float wave = sin(vUv.y * 19.0 + rkTime * 1.2) * sin(vUv.y * 7.0 - rkTime * 0.7);
    vec2 halfTexel = 0.5 / uFull;
    vec2 uv = clamp(vUv + vec2(wave * rkTemporal * 0.003, 0.0), halfTexel, 1.0 - halfTexel);
    vec3 lin = dec(texture2D(tScene, uv).rgb);
    if (uAO > 0.0 && !isSky(vUv)) lin *= mix(1.0, upAO(viewZ(vUv)), uAO);
    if (uOver > 0.0) { vec4 o = texture2D(tOver, uv); if (o.a > 0.0) lin = mix(lin, dec(o.rgb / o.a), o.a); }   // MSAA-resolved alpha is premultiplied
    if (uBloom > 0.0) lin += texture2D(tBloom, vUv).rgb * uBloom;
    // highlight shoulder: linear values above uShoulder roll off towards 1 (bloom on a glint compresses, never clips flat)
    vec3 over = max(lin - uShoulder, 0.0), room = vec3(1.0 - uShoulder);
    lin = min(lin, vec3(uShoulder)) + room * over / (over + room);
    vec3 rgb = enc(lin);
    // filmic contrast in display space: a toe that deepens the shadows, a shoulder that opens the highlights
    rgb = scurve(rgb, uPivot, rkContrast);
    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    // controlled saturation: strongly chromatic colours are pulled in more than the muted ones
    float chroma = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
    rgb = mix(vec3(luma), rgb, rkSaturation * mix(1.0, uSatHigh, smoothstep(0.25, 0.75, chroma)));
    // split toning: warm highlights, cool shadows (small multipliers about the luma)
    rgb *= mix(vec3(1.0), mix(uCool, uWarm, smoothstep(0.12, 0.8, luma)), uSplit);
    rgb = mix(rgb, vec3(0.38, 0.92, 0.57) * luma * 1.6, clamp(rkNight, 0.0, 1.0));
    float vig = dot(vUv - 0.5, vUv - 0.5);
    rgb *= 1.0 - clamp(rkVignette, 0.0, 1.0) * smoothstep(0.1, 0.5, vig);
    float noise = fract(sin(dot(floor(vUv * uFull), vec2(12.9898, 78.233)) + floor(rkTime * 24.0)) * 43758.5453) - 0.5;
    rgb = clamp(rgb + noise * rkGrain * 0.025, 0.0, 1.0);
    gl_FragColor = vec4(rgb, 1.0);
    // debug views (G.set('debug', n)): 1 the AO term, 2 the bloom alone
    if (uDebug > 0.5) gl_FragColor = uDebug < 1.5 ? vec4(vec3(uAO > 0.0 && !isSky(vUv) ? upAO(viewZ(vUv)) : 1.0), 1.0) : vec4(enc(texture2D(tBloom, vUv).rgb * uBloom), 1.0);
  }`;

export function createGamePost(renderer, { reducedMotion = () => false, quality = postQuality(), ...options } = {}) {
  const GR = { ...POST_GRADE, ...options };
  const hdr = renderer.extensions.has('EXT_color_buffer_float');
  const maxS = Math.min(4, renderer.capabilities.maxSamples || 0);
  // the world target: display values (see the header), 8-bit (the canvas clamps 0..1 anyway), MSAA, depth texture
  const displayTarget = (samples, depth) => {
    const t = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: true, stencilBuffer: false, samples });
    // @ts-expect-error isXRRenderTarget is a real WebGLRenderer flag (r170 WebGLTextures / WebXRManager) missing from @types/three
    t.isXRRenderTarget = true; t.texture.colorSpace = THREE.SRGBColorSpace; t.texture.internalFormat = 'RGBA8';
    if (depth) { t.depthTexture = new THREE.DepthTexture(1, 1); t.depthTexture.type = THREE.UnsignedIntType; t.depthTexture.name = 'RenderKit/scene-depth'; }
    return t;
  };
  const target = displayTarget(maxS, true); target.texture.name = 'RenderKit/scene-display';
  const overT = displayTarget(maxS, false); overT.texture.name = 'RenderKit/overlay';
  const passTarget = (name, half) => { const t = new THREE.WebGLRenderTarget(1, 1, { type: half && hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
    t.texture.colorSpace = THREE.NoColorSpace; t.texture.generateMipmaps = false; t.texture.name = 'RenderKit/' + name; return t; };
  const aoA = passTarget('ao', false), aoB = passTarget('ao-blur', false);
  const down = [0, 1, 2, 3, 4].map(i => passTarget('bloom-down' + i, true)), up = [0, 1, 2, 3].map(i => passTarget('bloom-up' + i, true));

  const u = v => ({ value: v });
  const depthU = { tDepth: u(target.depthTexture), uNear: u(0.5), uFar: u(1000), uProj: u(new THREE.Vector4(1, 1, 0, 0)) };
  const uFull = u(new THREE.Vector2(1, 1)), uHalf = u(new THREE.Vector2(1, 1));
  const mat = (name, fs, uniforms) => new THREE.ShaderMaterial({ name: 'RenderKit/' + name, vertexShader: VS, fragmentShader: fs, uniforms,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const A = { ...POST_AO }, B = { ...POST_BLOOM };   // live copies: G.set("ao.radius", v), G.set("bloom.intensity", v)
  const aoU = { ...depthU, uFull, uHalf, uR0: u(A.radius), uRk: u(A.radiusPerM), uRmax: u(A.radiusMax), uPxMax: u(A.pxMax), uIntensity: u(A.intensity),
    uBias: u(A.bias), uPower: u(A.power), uFadeNear: u(A.fadeNear), uFadeFar: u(A.fadeFar) };
  const aoMats = {};   // per sample count (the loop bound is a define)
  const aoMat = n => aoMats[n] || (aoMats[n] = mat('ao' + n, AO_FS(n), aoU));
  const blurU = { ...depthU, tAO: u(null), uStep: u(new THREE.Vector2()) }, blurMat = mat('ao-blur', BLUR_FS, blurU);
  const preU = { tScene: u(target.texture), uTexel: u(new THREE.Vector2()), uThreshold: u(B.threshold), uKnee: u(B.knee) }, preMat = mat('bloom-pre', PRE_FS, preU);
  const downU = { tSrc: u(null), uTexel: u(new THREE.Vector2()) }, downMat = mat('bloom-down', DOWN_FS, downU);
  const upU = { tSrc: u(null), tBase: u(null), uTexel: u(new THREE.Vector2()), uScatter: u(B.scatter) }, upMat = mat('bloom-up', UP_FS, upU);
  const uniforms = { ...depthU, tScene: u(target.texture), tAO: u(aoA.texture), tBloom: u(up[0].texture), tOver: u(overT.texture), uFull, uHalf,
    uAO: u(A.strength), uBloom: u(B.intensity), uOver: u(0), uDebug: u(0),
    rkTime: u(0), rkVignette: u(GR.vignette), rkGrain: u(GR.grain), rkSaturation: u(GR.saturation), rkContrast: u(GR.contrast),
    rkTemporal: u(GR.temporal), rkNight: u(GR.nightVision), uPivot: u(GR.pivot), uSatHigh: u(GR.satHigh), uShoulder: u(GR.shoulder),
    uSplit: u(GR.split), uWarm: u(new THREE.Vector3(...GR.warm)), uCool: u(new THREE.Vector3(...GR.cool)) };
  const compMat = mat('post', COMP_FS, uniforms);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const screen = new THREE.Scene(), cam = new THREE.Camera(), quad = new THREE.Mesh(geometry, compMat);
  quad.frustumCulled = false; screen.add(quad);
  const pass = (m, rt) => { quad.material = m; renderer.setRenderTarget(rt); renderer.render(screen, cam); };

  let tier = POST_TIERS[quality] ? quality : 'high', Q = POST_TIERS[tier];
  const bufferSize = new THREE.Vector2(), viewport = new THREE.Vector4(), scissor = new THREE.Vector4(), clearColor = new THREE.Color();
  let disposed = false, seconds = 0;
  const sizes = { w: 0, h: 0 };
  function setSize(w, h) {
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    if (sizes.w === w && sizes.h === h) return; sizes.w = w; sizes.h = h;
    target.setSize(w, h); overT.setSize(w, h);
    const hw = Math.max(1, Math.ceil(w / 2)), hh = Math.max(1, Math.ceil(h / 2));
    aoA.setSize(hw, hh); aoB.setSize(hw, hh); uFull.value.set(w, h); uHalf.value.set(hw, hh);
    for (let i = 0; i < down.length; i++) { const s = 2 ** (i + 1); down[i].setSize(Math.max(1, Math.ceil(w / s)), Math.max(1, Math.ceil(h / s))); }
    for (let i = 0; i < up.length; i++) up[i].setSize(down[i].width, down[i].height);
  }

  // the pipeline proper. overlay: optional function drawing the first-person arms (it clears depth itself).
  const post = { target, uniforms, hdr, depthTexture: target.depthTexture, setSize,
    get quality() { return tier; },
    render(scene, viewCamera, secs = 0, overlay = null) {
      if (disposed) throw new Error('RenderKit post pipeline has been disposed');
      if (renderer.xr.isPresenting) throw new Error('RenderKit post is desktop only; use renderer.render in XR');
      const output = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
      renderer.getViewport(viewport); renderer.getScissor(scissor); renderer.getClearColor(clearColor);
      const scissorTest = renderer.getScissorTest(), autoClear = renderer.autoClear, clearAlpha = renderer.getClearAlpha(), xr = renderer.xr.enabled;
      renderer.getDrawingBufferSize(bufferSize);
      setSize(output?.width ?? bufferSize.x, output?.height ?? bufferSize.y);
      uniforms.rkTime.value = secs;
      const e = viewCamera.projectionMatrix.elements;
      depthU.uNear.value = viewCamera.near; depthU.uFar.value = viewCamera.far; depthU.uProj.value.set(e[0], e[5], e[8], e[9]);
      try {
        renderer.xr.enabled = false; renderer.autoClear = false; renderer.setScissorTest(false);
        renderer.setRenderTarget(target); renderer.clear(true, true, true); renderer.render(scene, viewCamera);
        const ortho = !viewCamera.isPerspectiveCamera;   // the depth maths is perspective only
        uniforms.uAO.value = Q.ao && !ortho ? A.strength : 0;
        if (uniforms.uAO.value > 0) {
          pass(aoMat(Q.ao), aoA);
          let src = aoA, dst = aoB;
          for (let i = 0; i < Q.blur; i++) for (const axis of [0, 1]) {
            blurU.tAO.value = src.texture; blurU.uStep.value.set(axis ? 0 : 1 / uHalf.value.x, axis ? 1 / uHalf.value.y : 0);
            pass(blurMat, dst); [src, dst] = [dst, src];
          }
          uniforms.tAO.value = src.texture;
        }
        uniforms.uBloom.value = Q.bloom ? B.intensity : 0;
        if (Q.bloom) {
          const n = Math.min(Q.bloom, down.length);
          preU.uTexel.value.set(1 / sizes.w, 1 / sizes.h); pass(preMat, down[0]);
          for (let i = 1; i < n; i++) { downU.tSrc.value = down[i - 1].texture; downU.uTexel.value.set(1 / down[i - 1].width, 1 / down[i - 1].height); pass(downMat, down[i]); }
          let src = down[n - 1];
          for (let i = n - 2; i >= 0; i--) { upU.tSrc.value = src.texture; upU.tBase.value = down[i].texture; upU.uTexel.value.set(1 / src.width, 1 / src.height); pass(upMat, up[i]); src = up[i]; }
          uniforms.tBloom.value = src.texture;
        }
        uniforms.uOver.value = 0;
        if (overlay) {
          renderer.setRenderTarget(overT); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, false);
          overlay(); uniforms.uOver.value = 1;
        }
        quad.material = compMat;
        renderer.setRenderTarget(output, face, mip); renderer.setViewport(viewport);
        renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
        renderer.render(screen, cam);
      } finally {
        renderer.setRenderTarget(output, face, mip); renderer.setViewport(viewport);
        renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
        renderer.setClearColor(clearColor, clearAlpha); renderer.autoClear = autoClear; renderer.xr.enabled = xr;
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const t of [target, overT, aoA, aoB, ...down, ...up]) t.dispose();
      target.depthTexture.dispose(); geometry.dispose();
      for (const m of [compMat, blurMat, preMat, downMat, upMat, ...Object.values(aoMats)]) m.dispose();
    },
  };

  const U = uniforms, base = { grain: U.rkGrain.value, temporal: U.rkTemporal.value };
  const KEYS = { vignette: 'rkVignette', grain: 'rkGrain', saturation: 'rkSaturation', contrast: 'rkContrast', temporal: 'rkTemporal', nightVision: 'rkNight',
    debug: 'uDebug', pivot: 'uPivot', satHigh: 'uSatHigh', shoulder: 'uShoulder', split: 'uSplit' };
  const AOK = { radius: 'uR0', radiusPerM: 'uRk', radiusMax: 'uRmax', pxMax: 'uPxMax', intensity: 'uIntensity', bias: 'uBias', power: 'uPower', fadeNear: 'uFadeNear', fadeFar: 'uFadeFar' };
  const BK = { threshold: 'uThreshold', knee: 'uKnee', scatter: 'uScatter' };   // intensity is read each frame
  const G = {
    post, uniforms: U,
    get seconds() { return seconds; },
    get quality() { return tier; },
    setQuality(q) { if (POST_TIERS[q]) { tier = q; Q = POST_TIERS[q]; } return tier; },
    // advance the post clock (grain / temporal wave); main.js passes 0 while paused, reduced motion freezes it
    tick(dt) { if (!reducedMotion()) seconds += dt; },
    // overlay: draws the first-person arms into the post's overlay target (graded with the world, no AO / bloom on them)
    render(scene, camera, overlay = null) {
      if (renderer.xr.isPresenting) { renderer.render(scene, camera); overlay?.(); return; }   // never post in XR
      const calm = reducedMotion();
      U.rkGrain.value = calm ? 0 : base.grain; U.rkTemporal.value = calm ? 0 : base.temporal;
      const ocs = renderer.outputColorSpace, tm = renderer.toneMapping;
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
      try { post.render(scene, camera, seconds, overlay); }
      finally { renderer.outputColorSpace = ocs; renderer.toneMapping = tm; }
    },
    set(name, v) {
      if (name === 'grain' || name === 'temporal') base[name] = v;
      if (KEYS[name]) U[KEYS[name]].value = v;
      else if (name.startsWith('ao.') && name.slice(3) in A) { A[name.slice(3)] = v; const k = AOK[name.slice(3)]; if (k) aoU[k].value = v; }
      else if (name.startsWith('bloom.') && name.slice(6) in B) { B[name.slice(6)] = v; const k = BK[name.slice(6)]; if (k) (k === 'uScatter' ? upU : preU)[k].value = v; }
    },
    dispose() { post.dispose(); },
  };
  return G;
}
