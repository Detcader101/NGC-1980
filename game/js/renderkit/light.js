// RENDERKIT light (ngc/depth-light): sun shadows and the light balance. Gated by RK.on('light'); with ?rk=0 nothing
// here runs and the game renders exactly as before (no shadow maps, no chunk patch, the old light values).
//
// Two cascades from one sun:
//   near: the game's DirectionalLight `sun` itself casts, a box of +-NEAR m round the eye (crisp, ~3-4 cm texels);
//   far:  a second DirectionalLight with intensity 0 whose only job is a shadow map over +-FAR m (hills, towns, the
//         island under a Huey at 200 m). It adds no light.
// Built-in materials (Lambert / Phong / Standard / Physical, instanced or skinned) pick the cascade per fragment through
// one global patch of Three's light loop (patchChunks): inside the near box they read the near map, blend to the far map
// over its outer 15 %, and the far map fades out at its own edge. The terrain / sea ShaderMaterial (main.js) reads the
// same two maps through SUN_SHADOW_GLSL + uniforms(). Each box follows the camera and is snapped to whole shadow texels
// in light space, so standing still or moving never shimmers static shadows.
//
// Who casts / receives (applyRules, a central traversal a few times a second, new objects included):
//   receive: every mesh with a lit material (Lambert, Phong, Standard/Physical, Toon). Basic / Shader ignore it.
//   cast:    lit, opaque (not transparent below 0.9 opacity, depthWrite on, not additive), and not tiny (bounding radius
//            x world scale >= 0.08 m). Never: Points, Lines, Sprites, Basic or Shader materials (markers, beams, rings,
//            HUD, particles, sky, terrain), the XR rig (panel, controllers, hands) or anything under a node with
//            userData.rkShadow === 'none'. Opt-outs / opt-ins per object: userData.rkShadow = 'none' | 'receive' | 'cast' | 'both'.
// Casters under 0.6 m (people, crates, vehicle parts) draw into the near map only (farSkip); in XR / low casters under
// 0.2 m skip the near map too. Tiers (TIERS): desktop / xr / low. XR renders the maps once per frame for both eyes; it gets smaller maps and a far
// cascade refreshed every 3rd frame. ?shadows=off|low|desktop|xr forces one (perf probes).
import * as THREE from 'three';

// Light balance with shadows on: a warmer, stronger sun against a cooler, weaker sky so shaded sides read. Before (rk=0):
// hemisphere 0xcfe6ff / 0x4a5a34 x 0.9, sun 0xfff0d0 x 1.1 (sun : sky ~ 1 : 1 on an up-facing surface: evenly lit).
export const BALANCE = Object.freeze({
  sun: { color: 0xffe7c2, intensity: 2.1 },
  // lower sun (same azimuth): ~42 deg instead of ~60, so shadows have length and walls facing it read as lit faces
  dir: [0.95, 1, 0.57],
  hemi: { sky: 0xa9c4ec, ground: 0x4f4a36, intensity: 0.62 },
  // the terrain / sea shader's own lighting (main.js): sun term x terrSun, ambient x terrAmb (classic .75 / .4)
  terrSun: 1.0, terrAmb: 0.33,
  // the first-person arms / weapon pass (viewmodel.js has its own two lights): same balance, a touch more fill so the
  // hands never go black against the sky
  vmHemi: 0.72, vmSun: 2.0,
});

export const TIERS = Object.freeze({
  desktop: { near: { size: 2048, r: 34, min: 0.08 }, far: { size: 2048, r: 175, every: 2 } },
  xr:      { near: { size: 1536, r: 28, min: 0.2 }, far: { size: 1024, r: 150, every: 3 } },
  low:     { near: { size: 1024, r: 30, min: 0.2 }, far: { size: 1024, r: 150, every: 4 } },
});

// GLSL for a custom ShaderMaterial (the terrain): float rkSunShadow(vec3 worldPos, vec3 worldNormal), 1 = lit.
// Needs the uniforms from light.uniforms() and Three's <packing> chunk.
export const SUN_SHADOW_GLSL = `
uniform sampler2D rkShMap0, rkShMap1; uniform mat4 rkShMat0, rkShMat1; uniform vec4 rkShA, rkShB;   // A: texel0, texel1, normalBias0, normalBias1  B: bias0, bias1, on, -
float rkShTap(sampler2D m, vec2 uv, float z){ return step(z, unpackRGBAToDepth(texture2D(m, uv))); }
float rkShPCF(sampler2D m, vec3 c, float tx){   // Three's PCF soft kernel (3x3, bilinear-weighted 4x4)
  vec2 uv = c.xy, f = fract(uv / tx + .5); uv -= f * tx; float z = c.z, dx = tx;
  return (rkShTap(m, uv, z) + rkShTap(m, uv + vec2(dx, 0.), z) + rkShTap(m, uv + vec2(0., dx), z) + rkShTap(m, uv + vec2(dx), z)
    + mix(rkShTap(m, uv + vec2(-dx, 0.), z), rkShTap(m, uv + vec2(2.*dx, 0.), z), f.x)
    + mix(rkShTap(m, uv + vec2(-dx, dx), z), rkShTap(m, uv + vec2(2.*dx, dx), z), f.x)
    + mix(rkShTap(m, uv + vec2(0., -dx), z), rkShTap(m, uv + vec2(0., 2.*dx), z), f.y)
    + mix(rkShTap(m, uv + vec2(dx, -dx), z), rkShTap(m, uv + vec2(dx, 2.*dx), z), f.y)
    + mix(mix(rkShTap(m, uv + vec2(-dx), z), rkShTap(m, uv + vec2(2.*dx, -dx), z), f.x),
          mix(rkShTap(m, uv + vec2(-dx, 2.*dx), z), rkShTap(m, uv + vec2(2.*dx), z), f.x), f.y)) / 9.;
}
float rkSunShadow(vec3 p, vec3 n){
  if (rkShB.z < .5) return 1.;
  vec4 c0 = rkShMat0 * vec4(p + n * rkShA.z, 1.); c0.z += rkShB.x;
  float e0 = max(abs(c0.x - .5), abs(c0.y - .5)) * 2., w0 = (c0.z < 1. && e0 < 1.) ? 1. - smoothstep(.8, .95, e0) : 0.;
  float sh = 1.;
  if (w0 > 0.) sh = rkShPCF(rkShMap0, c0.xyz, rkShA.x);
  if (w0 < 1.) {
    vec4 c1 = rkShMat1 * vec4(p + n * rkShA.w, 1.); c1.z += rkShB.y;
    float e1 = max(abs(c1.x - .5), abs(c1.y - .5)) * 2., s1 = 1.;
    if (c1.z < 1. && e1 < 1.) s1 = mix(rkShPCF(rkShMap1, c1.xyz, rkShA.y), 1., smoothstep(.85, 1., e1));
    sh = mix(s1, sh, w0);
  }
  return sh;
}`;

let patched = false;
// Global, once, before the first program compiles: the directional loop in lights_fragment_begin picks the cascade for
// light 0 (the sun) when exactly two directional lights cast (this module's pair), and skips the far light's own lookup.
// Any other light setup (the viewmodel pass, dev pages) compiles the stock code path.
export function patchChunks() {
  if (patched) return; patched = true;
  const C = THREE.ShaderChunk;
  C.shadowmap_pars_fragment += `
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS == 2
	// RENDERKIT light: two-cascade sun (renderkit/light.js). 0 = near box, 1 = far box; blend over the near box's outer 15 %.
	float rkCascadeShadow() {
		vec4 c0 = vDirectionalShadowCoord[ 0 ]; vec3 q0 = c0.xyz / c0.w;
		float e0 = max( abs( q0.x - .5 ), abs( q0.y - .5 ) ) * 2.;
		float w0 = ( q0.z < 1. && e0 < 1. ) ? 1. - smoothstep( .8, .95, e0 ) : 0.;
		float sh = 1.;
		if ( w0 > 0. ) sh = getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, c0 );
		if ( w0 < 1. ) {
			vec4 c1 = vDirectionalShadowCoord[ 1 ]; vec2 q1 = c1.xy / c1.w;
			float e1 = max( abs( q1.x - .5 ), abs( q1.y - .5 ) ) * 2.;
			float s1 = getShadow( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, directionalLightShadows[ 1 ].shadowIntensity, directionalLightShadows[ 1 ].shadowBias, directionalLightShadows[ 1 ].shadowRadius, c1 );
			sh = mix( mix( s1, 1., smoothstep( .85, 1., e1 ) ), sh, w0 );
		}
		return sh;
	}
#endif
`;
  const from = `		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];`;
  const src = C.lights_fragment_begin;
  if (!src.includes(from)) { console.warn('RENDERKIT light: lights_fragment_begin changed; cascades fall back to per-light shadows'); return; }
  C.lights_fragment_begin = src.replace(from, `		#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS == 2 && UNROLLED_LOOP_INDEX == 0
		directLight.color *= ( directLight.visible && receiveShadow ) ? rkCascadeShadow() : 1.0;   // RENDERKIT light
		#elif defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS == 2 && UNROLLED_LOOP_INDEX == 1
		// RENDERKIT light: the far cascade's light carries no light; no lookup
		#elif defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];`);
}

const SMALL_FAR = 0.6;   // m: casters smaller than this skip the far cascade (farSkip)
const LIT = m =>m && (m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial || m.isMeshToonMaterial);
const _s = new THREE.Vector3(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();

/**
 * createSunShadows({ renderer, scene, sun, hemi, groundY, tier })
 * - sun: the scene's DirectionalLight. Its position stays a pure direction (world.js / the terrain read it); the shadow
 *   boxes are placed by overriding shadow.updateMatrices, not by moving the light.
 * - groundY(x, z): ground height, for the far box's centre (the ground under a high camera).
 * update(dt, camera): once a frame before the world renders. Returns nothing; renders no extra passes itself.
 */
export function createSunShadows({ renderer, scene, sun, hemi, groundY = () => 0, tier = 'desktop', excludeRoots = [] }) {
  patchChunks();
  let force = null; try { force = new URLSearchParams(location.search).get('shadows'); } catch (e) {}
  const off = force === 'off' || force === '0';
  renderer.shadowMap.enabled = !off;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // balance
  sun.color.set(BALANCE.sun.color); sun.intensity = BALANCE.sun.intensity; sun.position.set(...BALANCE.dir);   // (main.js reads it for the terrain uSun after this)
  if (hemi) { hemi.color.set(BALANCE.hemi.sky); hemi.groundColor.set(BALANCE.hemi.ground); hemi.intensity = BALANCE.hemi.intensity; }

  const far = new THREE.DirectionalLight(0xffffff, 0); far.name = 'RK sun far cascade (shadow only)';
  far.position.copy(sun.position); scene.add(far);   // after the sun: shadow lights keep scene order, so the sun is index 0
  const C = [sun, far].map((L, k) => {
    L.castShadow = !off; const S = L.shadow; S.autoUpdate = false; S.needsUpdate = true;
    S.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
    const c = { L, S, k, r: 1, size: 0, centre: new THREE.Vector3(), D: k ? 520 : 380, every: 1, n: 0 };
    S.updateMatrices = () => { place(c); farSkip(k ? SMALL_FAR : c.min); };   // (runs right before this light's map is drawn: near first, then far)
    return c;
  });
  // the light-space frame: fixed while the sun direction is fixed
  const dir = new THREE.Vector3();
  function place(c) {
    const cam = c.S.camera, tx = 2 * c.r / c.size;
    dir.copy(sun.position).normalize();
    // orientation: look down -dir with a stable up
    cam.position.set(0, 0, 0); cam.up.set(0, 1, 0); if (Math.abs(dir.y) > 0.99) cam.up.set(0, 0, 1);
    cam.lookAt(_v.copy(dir).negate()); _q.copy(cam.quaternion); _qi.copy(_q).invert();
    // snap the centre to whole texels in light space (x, y); depth needs no snap
    _s.copy(c.centre).applyQuaternion(_qi); _s.x = Math.round(_s.x / tx) * tx; _s.y = Math.round(_s.y / tx) * tx; _s.applyQuaternion(_q);
    cam.position.copy(_s).addScaledVector(dir, c.D);
    if (cam.right !== c.r || cam.far !== 2 * c.D) { cam.left = cam.bottom = -c.r; cam.right = cam.top = c.r; cam.near = 1; cam.far = 2 * c.D; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    c.S._frustum.setFromProjectionMatrix(_m);
    c.S.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(_m);
  }
  const _m = new THREE.Matrix4();

  let tierName = null;
  function setTier(name) {
    if (force && TIERS[force]) name = force;
    if (name === tierName) return; tierName = name;
    const T = TIERS[name];
    for (const c of C) {
      const t = c.k ? T.far : T.near; c.r = t.r; c.every = t.every || 1; c.min = t.min || 0;
      if (c.size !== t.size) { c.size = t.size; c.S.mapSize.set(t.size, t.size); if (c.S.map) { c.S.map.dispose(); c.S.map = null; } }
      const tx = 2 * c.r / c.size;
      // bias in depth units over 2D metres of range; normal offset ~1.5 texels (flat-shaded low poly: acne-free at 57 deg sun)
      c.S.bias = -0.00006; c.S.normalBias = tx * 1.6; c.S.radius = 1; c.S.intensity = 1;
      c.S.needsUpdate = true;
    }
    // texel sizes in shadow UV (1 / size) and normal offsets in metres
    U.rkShA.value.set(1 / C[0].size, 1 / C[1].size, C[0].S.normalBias, C[1].S.normalBias);
    U.rkShB.value.set(C[0].S.bias, C[1].S.bias, off ? 0 : 1, 0);
  }
  // uniforms for the terrain shader (getters: the maps are created on the first shadow pass and on a tier change)
  const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); blank.needsUpdate = true;
  const U = {
    rkShMap0: { get value() { return C[0].S.map?.texture || blank; } }, rkShMap1: { get value() { return C[1].S.map?.texture || blank; } },
    rkShMat0: { value: C[0].S.matrix }, rkShMat1: { value: C[1].S.matrix },
    rkShA: { value: new THREE.Vector4() }, rkShB: { value: new THREE.Vector4() },
  };
  setTier(tier);

  // ---- cast / receive rules: a central traversal, new objects picked up within a few frames
  const roots = new Set(excludeRoots);
  const stats = { meshes: 0, cast: 0, receive: 0, passes: 0 };
  function rule(o, inherited) {
    const ud = o.userData.rkShadow || inherited;
    if (!o.isMesh || o.isSprite) return;   // Points, Lines, Sprites: never
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const lit = mats.some(LIT);
    let cast = false;
    if (lit) {
      const solid = mats.every(m => (!m.transparent || m.opacity >= 0.9) && m.depthWrite !== false && m.blending !== THREE.AdditiveBlending && m.visible !== false && m.colorWrite !== false);
      if (solid) {
        const g = o.geometry; if (g && !g.boundingSphere) g.computeBoundingSphere();
        const rad = g?.boundingSphere ? g.boundingSphere.radius : 0;
        o.getWorldScale(_f); const wr = rad * Math.max(_f.x, _f.y, _f.z); cast = wr >= 0.08; o.__rkSmall = wr < SMALL_FAR; o.__rkR = wr;
        // hairline sticks (whip antennas, wires, rails: two extents under 6 cm) alias into dashed lines at 3-17 cm texels
        if (cast && g && !o.isInstancedMesh) {
          if (!g.boundingBox) g.computeBoundingBox();
          const e = g.boundingBox.getSize(_s); const d = [Math.abs(e.x * _f.x), Math.abs(e.y * _f.y), Math.abs(e.z * _f.z)].sort((a, b) => a - b);
          if (d[1] < 0.06) cast = false;
        }
      }
    }
    let rec = lit;
    if (ud === 'none') cast = rec = false; else if (ud === 'receive') cast = false; else if (ud === 'cast') { cast = true; rec = false; } else if (ud === 'both') cast = rec = true;
    o.castShadow = cast && !off; o.receiveShadow = rec && !off; o.__rkCast = o.castShadow;
    o.__rkL = o.material; stats.meshes++; if (o.castShadow) stats.cast++; if (o.receiveShadow) stats.receive++;
  }
  function walk(o, inh) {
    if (roots.has(o)) return;
    const ud = o.userData.rkShadow === 'none' ? 'none' : inh;
    if (o.isMesh) { if (o.__rkL !== o.material) rule(o, ud); if (o.__rkCast && o.__rkSmall) small.push(o); }
    const ch = o.children; for (let i = 0; i < ch.length; i++) walk(ch[i], ud);
  }
  function applyRules() { small.length = 0; walk(scene, undefined); stats.passes++; stats.nearOnly = small.length; }
  // Small casters (people, crates, vehicle parts: world radius under SMALL_FAR) draw into the near map only. At the far
  // map's ~17 cm texels their shadows are a few texels, and they are most of the far pass's draw calls.
  const small = [];
  function farSkip(min) { for (let i = 0; i < small.length; i++) { const o = small[i]; o.castShadow = o.__rkCast && o.__rkR >= min; } }

  let ruleT = 0;
  const api = {
    sun, far, uniforms: () => U, stats, GLSL: SUN_SHADOW_GLSL, get tier() { return tierName; }, setTier, cascades: C, applyRules,
    exclude(o) { roots.add(o); },
    update(dt, camera) {
      if (off) return;
      setTier(renderer.xr.isPresenting ? 'xr' : (api.pressure ? 'low' : 'desktop'));
      ruleT -= dt; if (ruleT <= 0) { ruleT = 0.4; applyRules(); }
      api.follow(camera);
      for (const c of C) { if (++c.n >= c.every) { c.n = 0; c.S.needsUpdate = true; } }
    },
    // where the boxes go (update calls it; a test that moves the camera at render time calls it too, then sets needsUpdate)
    follow(camera) {
      camera.getWorldPosition(_v); camera.getWorldDirection(_f); _f.y = 0; if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1); _f.normalize();
      // near: round the eye, a little ahead; far: on the ground under the eye, further ahead
      C[0].centre.copy(_v).addScaledVector(_f, C[0].r * 0.35);
      const gx = _v.x + _f.x * C[1].r * 0.45, gz = _v.z + _f.z * C[1].r * 0.45;
      C[1].centre.set(gx, Math.min(_v.y, Math.max(0, groundY(gx, gz))), gz);
    },
    pressure: false,
  };
  return api;
}

// The first-person overlay scene (viewmodel.js) has its own hemisphere + sun: give them the same balance.
export function matchOverlayLights(scene, sun) {
  if (!scene) return;
  scene.traverse(o => {
    if (o.isHemisphereLight) { o.color.set(BALANCE.hemi.sky); o.groundColor.set(BALANCE.hemi.ground); o.intensity = BALANCE.vmHemi; }
    else if (o.isDirectionalLight) { o.color.set(BALANCE.sun.color); o.intensity = BALANCE.vmSun; if (sun) o.position.copy(sun.position); }
  });
}
