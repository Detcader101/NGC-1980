// RENDERKIT world (ngc/rk-world): the Continuum RenderKit adopted for NGC-1980's terrain, sea, sky and scene environment.
//
// The game's ground and sea are ONE custom ShaderMaterial (main.js terrainVS/terrainFS): a camera-following height-map
// grid with seamless LOD morphing, the live sea displaced by the waves the ships ride, clarity/shallows/caustics, pads,
// shaft aprons and the fog of war. createTerrainMaterial / createWaterMaterial are MeshStandardMaterial patches for
// ordinary meshes and cannot replace that shader without losing all of it, so this module ports their ideas into it as
// GLSL snippets (compiled only with the RK_WORLD define, i.e. RK.on('world')):
// - RK_TERRAIN_GLSL: createTerrainMaterial's slope / altitude / shoreline / snow blending and FBM variation, as 2D noise
//   on world xz (the terrain is a height field: half the hashes of the kit's 3D rkNoise, which matters full-screen in VR).
// - RK_SKY_GLSL: the kit sky's gradient (createSkyMaterial, same pow(y, .45) curve and colours) so the sea reflects the
//   sky that is actually drawn; plus sRGB<->linear helpers so the raw terrain shader can hand Three a LINEAR colour and
//   let tone mapping / output conversion happen once, like every built-in material (and a post pipeline's linear target).
// The sky dome itself becomes a kit createSkyMaterial; createWorldSky also owns scene.environment: a PMREM of the kit sky
// (with a darker ground hemisphere), rebuilt only when the sun or the weather changes.
import * as THREE from 'three';
import { createSkyMaterial } from './effects.js';
import { uniform } from './core.js';

// The game's palette: horizon = the haze / fog colour (main.js HORIZON 0xbfd9f2), zenith = the old dome's top.
export const WORLD_SKY = Object.freeze({ zenith: 0x386bd9, horizon: 0xbfd9f2, envGround: 0x4b5754, overcast: 0x8e9aa6 });

// 2D value noise with the kit's hash (glsl.js rkHash, Dave Hoskins' hash without sine: stable on mobile GPUs).
export const RK_TERRAIN_GLSL = /* glsl */`
    float rkH2(vec2 p){ vec3 q=fract(p.xyx*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
    float rkN2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(rkH2(i),rkH2(i+vec2(1.,0.)),f.x),mix(rkH2(i+vec2(0.,1.)),rkH2(i+1.),f.x),f.y); }
`;
// rkSkyZ / rkSkyH: zenith and horizon in DISPLAY (sRGB) values, mixed there: two pow(vec3) less per sea pixel than mixing
// in linear like the dome, an invisible difference in a reflection. rkSkyRay returns DISPLAY colour, the
// space the terrain shader shades in.
export const RK_SKY_GLSL = /* glsl */`
    uniform vec3 rkSkyZ, rkSkyH, rkSunCol;
    vec3 rkToLinear(vec3 c){ c=max(c,0.); return mix(pow(c*.9478673+.0521327,vec3(2.4)),c*.0773994,vec3(lessThanEqual(c,vec3(.04045)))); }
    vec3 rkToDisplay(vec3 c){ c=max(c,0.); return mix(pow(c,vec3(.41666))*1.055-.055,c*12.92,vec3(lessThanEqual(c,vec3(.0031308)))); }
    vec3 rkSkyRay(vec3 ray){ return mix(rkSkyH,rkSkyZ,pow(smoothstep(0.,1.,max(ray.y,0.)),.45)); }   // = HORIZON_CURVE below
`;
// The kit sky's pow(y, .45) has an infinite slope at the horizon: over the game's hazed terrain edge it drew a hard band
// one pixel above the horizon (rkworld.mjs mainland/snow views). Easing y in with a smoothstep keeps the kit's gradient
// above ~15 degrees and meets the haze colour smoothly. Applied to the kit material's source (no fork of effects.js).
const KIT_CURVE = 'pow(max(ray.y,0.0),0.45)', HORIZON_CURVE = 'pow(smoothstep(0.0,1.0,max(ray.y,0.0)),0.45)';
function softHorizon(material) {
  if (!material.fragmentShader.includes(KIT_CURVE)) throw new Error('RenderKit world: sky gradient changed in effects.js; update softHorizon');
  material.fragmentShader = material.fragmentShader.replace(KIT_CURVE, HORIZON_CURVE);
  return material;
}
export const createWorldUniforms = () => ({ rkSkyZ: uniform(new THREE.Color(WORLD_SKY.zenith).convertLinearToSRGB()), rkSkyH: uniform(new THREE.Color(WORLD_SKY.horizon).convertLinearToSRGB()), rkSunCol: uniform(new THREE.Color(0xfff0d0)) });

/** Sky dome + scene.environment for one scene.
 * sky: the existing dome mesh (kept: XR and the scripted tests find it by renderOrder -10 / SphereGeometry);
 * sun: the DirectionalLight whose direction (position, a direction from the origin) and colour the sky follows;
 * uniforms: the terrain uniforms that receive rkSkyZ/rkSkyH/rkSunCol for the sea's sky reflection.
 * update(seaState, underwater) once a frame: compares a few numbers and rebuilds the PMREM only when the sun or the (quantised)
 * weather changed. */
// The terrain shader shades in display values. On the default path (sRGB canvas, no tone mapping) it writes them as they
// are, exactly the classic output at no cost; when a tone mapper or a linear target (a post pipeline, an XR layer in
// linear space) is active, Three compiles a separate program in which it converts to linear and lets Three tone map and
// encode once, like every built-in material. (onBeforeCompile receives the program parameters; the cache key already
// separates programs by toneMapping / outputColorSpace.)
export function linearOutput(material) {
  material.onBeforeCompile = p => { if (p.toneMapping === THREE.NoToneMapping && p.outputColorSpace === THREE.SRGBColorSpace) p.fragmentShader = '#define RK_DISPLAY_OUT\n' + p.fragmentShader; };
  return material;
}

export function createWorldSky({ renderer, scene, sky, sun, uniforms, intensity = 0.5, atmosphere = null }) {
  // environmentIntensity: the game keeps its HemisphereLight (0.9) for the Lambert world and NoToneMapping, so the PBR
  // materials that pick up this environment get it ON TOP of that ambient; 0.5 keeps them from glowing (rkworld envprobe).
  scene.environmentIntensity = intensity;
  const sunDir = new THREE.Vector3().copy(sun.position).normalize();
  const horizon = new THREE.Color(WORLD_SKY.horizon), zenith0 = new THREE.Color(WORLD_SKY.zenith), overcast = new THREE.Color(WORLD_SKY.overcast);
  // the dome: below the horizon it stays the horizon colour, so the haze at the end of the terrain meets it with no seam
  // RENDERKIT sky: with an atmosphere (renderkit/atmosphere.js) the dome is its material, and the environment is a PMREM
  // of its sky + sun + clouds over a darker ground, rebuilt on this same contract (sun / weather bucket, never per frame)
  const domeMat = atmosphere ? null : softHorizon(createSkyMaterial({ zenith: WORLD_SKY.zenith, horizon: WORLD_SKY.horizon, ground: WORLD_SKY.horizon, sunDirection: sunDir, depthWrite: false }));
  if (domeMat) {
    domeMat.uniforms.rkSun.value = sunDir;   // shared: one direction for dome, environment and terrain
    const oldMat = sky.material; sky.material = domeMat; oldMat.dispose();
  }
  // the environment: the same sky over a darker ground (earth / sea bounce), so metals reflect a horizon, not a white floor
  const envScene = new THREE.Scene();
  const envMat = atmosphere ? atmosphere.envMaterial() : softHorizon(createSkyMaterial({ zenith: WORLD_SKY.zenith, horizon: WORLD_SKY.horizon, ground: WORLD_SKY.envGround, sunDirection: sunDir }));
  if (!atmosphere) envMat.uniforms.rkSun.value = sunDir;
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), envMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let target = null, under = false;
  const last = { x: NaN, y: NaN, z: NaN, col: -1, w: -1 };
  const S = { rebuilds: 0, lastBuildMs: 0, get texture() { return target?.texture ?? null; } };
  function rebuild() {
    const t0 = performance.now();
    const rt = pmrem.fromScene(envScene, 0, 0.1, 200);
    if (target) target.dispose();
    target = rt; scene.environment = under ? null : rt.texture;
    S.rebuilds++; S.lastBuildMs = performance.now() - t0;
  }
  S.update = (seaState = 4, underwater = false) => {
    // under water the sky is hidden (sealife.js) and nothing should mirror it: the environment steps aside, no rebuild
    under = !!underwater;
    const env = under ? null : target?.texture ?? null;
    if (target && scene.environment !== env) scene.environment = env;
    sunDir.copy(sun.position).normalize();
    // weather: a rough sea (state 5-7) greys the zenith; quantised to quarter states so drift never rebuilds every frame
    const w = atmosphere ? atmosphere.weatherBucket() / 4 : Math.round(Math.min(1, Math.max(0, (seaState - 4.5) / 2.5)) * 4) / 4, col = sun.color.getHex();
    if (sunDir.x === last.x && sunDir.y === last.y && sunDir.z === last.z && col === last.col && w === last.w) return false;
    Object.assign(last, { x: sunDir.x, y: sunDir.y, z: sunDir.z, col, w });
    let z;
    if (atmosphere) {   // the clouds as they are now, held still for the probe
      const c = envMat.uniforms.rkCloud.value.copy(atmosphere.uniforms.rkCloud.value); c.x = atmosphere.coverTarget; c.y = atmosphere.greyTarget; c.z = c.w = 0;
      z = atmosphere.zenith(new THREE.Color());
    } else { z = domeMat.uniforms.rkZenith.value.copy(zenith0).lerp(overcast, w * 0.6); envMat.uniforms.rkZenith.value.copy(z); }
    if (uniforms) { uniforms.rkSkyZ.value.copy(z).convertLinearToSRGB(); uniforms.rkSkyH.value.copy(horizon).convertLinearToSRGB(); uniforms.rkSunCol.value.copy(sun.color).convertLinearToSRGB(); }
    rebuild();
    return true;
  };
  S.dispose = () => { target?.dispose(); pmrem.dispose(); envMat.dispose(); envScene.children[0].geometry.dispose(); if (scene.environment === target?.texture) scene.environment = null; };
  S.update();
  return S;
}
