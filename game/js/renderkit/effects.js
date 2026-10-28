import * as THREE from 'three';
import { color, uniform, positive } from './core.js';
import { noiseGLSL, depthGLSL, meshVertex, outputGLSL } from './glsl.js';

export const PARTICLE_PRESETS = Object.freeze({
  smoke: { color: 0x6c706a, endColor: 0x383c39, size: 1.5, speed: 0.8, gravity: 0.18, life: 5, opacity: 0.3 },
  dust: { color: 0xb4a080, endColor: 0x807864, size: 1.2, speed: 0.6, gravity: 0.03, life: 4, opacity: 0.27 },
  fire: { color: 0xffdb8a, endColor: 0xe05317, size: 0.8, speed: 1.6, gravity: 0.2, life: 1.2, opacity: 0.8, additive: true },
  sparks: { color: 0xffe5ae, endColor: 0xd94b17, size: 0.06, speed: 2.5, gravity: -4, life: 1.4, opacity: 1, additive: true },
  rain: { color: 0xa6c2ca, endColor: 0x819da5, size: 0.07, speed: -9, gravity: 0, life: 2, opacity: 0.35, stretch: 15 },
  snow: { color: 0xe3e6df, endColor: 0xc2d2ce, size: 0.1, speed: -0.6, gravity: 0, life: 7, opacity: 0.85 },
  temporal: { color: 0xa4dbce, endColor: 0xb5a4df, size: 0.09, speed: 0.3, gravity: 0, life: 4, opacity: 0.7, additive: true },
});

const particleVertex = /* glsl */`
attribute vec3 rkOrigin;
attribute vec3 rkVelocity;
attribute vec2 rkSeed;
uniform float rkTime, rkLife, rkGravity, rkSize, rkStretch, rkLoop;
varying vec2 vUv;
varying float vAge, vSeed, vDepth;
#include <fog_pars_vertex>
void main() {
  float elapsed = rkTime + rkSeed.x * rkLife * rkLoop;
  float age = mix(clamp(elapsed / rkLife, 0.0, 1.0), fract(elapsed / rkLife), rkLoop);
  float t = age * rkLife;
  vec3 center = rkOrigin + rkVelocity*t + vec3(0.0,0.5*rkGravity*t*t,0.0);
  vec4 mvPosition = modelViewMatrix * vec4(center,1.0);
  float angle = rkSeed.y * 6.2831853;
  vec2 quad = position.xy;
  #if RK_KIND != 4
    quad = mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*quad;
  #endif
  float growth = 1.0;
  #if RK_KIND < 2
    growth = 0.5 + age * 1.8;
  #endif
  mvPosition.xy += quad * vec2(1.0,rkStretch) * rkSize * growth;
  vUv = uv; vAge = age; vSeed = rkSeed.y; vDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const particleFragment = /* glsl */`
uniform vec3 rkColor, rkEndColor;
uniform float rkTime, rkOpacity, rkDepthEnabled, rkNear, rkFar, rkOrtho, rkSoftness;
uniform sampler2D rkDepth;
uniform vec2 rkResolution;
varying vec2 vUv;
varying float vAge, vSeed, vDepth;
${noiseGLSL}
${depthGLSL}
#include <fog_pars_fragment>
void main() {
  vec2 p = vUv*2.0-1.0;
  float shape = 1.0-smoothstep(0.1,1.0,length(p));
  #if RK_KIND < 3
    float turbulence = rkFBM(vec3(p*3.0+vSeed*17.0, vAge*2.0));
    shape *= smoothstep(0.18,0.7,turbulence);
  #endif
  float alpha = shape * rkOpacity * smoothstep(0.0,0.08,vAge) * (1.0-smoothstep(0.45,1.0,vAge));
  if (rkDepthEnabled > 0.5) {
    float sceneDepth = rkViewDepth(texture2D(rkDepth,gl_FragCoord.xy/rkResolution).r,rkNear,rkFar,rkOrtho);
    alpha *= clamp((sceneDepth-vDepth)/rkSoftness,0.0,1.0);
  }
  if(alpha < 0.002) discard;
  vec3 tint = mix(rkColor,rkEndColor,vAge);
  #if RK_KIND == 2 || RK_KIND == 3
    tint *= 2.0;
  #endif
  gl_FragColor = vec4(tint,alpha);
  ${outputGLSL}
  #include <fog_fragment>
}
`;

/** Analytic motion on the GPU, one instanced draw per emitter. No CPU particle stepping.
 * Coordinates are emitter-local; moving the mesh moves already emitted particles.
 * Call update with absolute simulation seconds; pause by keeping that value fixed.
 */
/**
 * @param {{ kind?: keyof typeof PARTICLE_PRESETS, count?: number, seed?: number, spread?: number, loop?: boolean,
 *   color?: number, endColor?: number, size?: number, speed?: number, gravity?: number, life?: number, opacity?: number,
 *   additive?: boolean, stretch?: number, [preset: string]: any }} [options]   preset fields override PARTICLE_PRESETS[kind]
 */
export function createParticleSystem({ kind = 'smoke', count = 96, seed = 1980, spread = 1,
  loop = true, ...options } = {}) {
  const preset = PARTICLE_PRESETS[kind];
  if (!preset) throw new RangeError(`Unknown particle kind: ${kind}`);
  if (!Number.isInteger(count) || count < 1 || count > 100000) throw new RangeError('count must be 1..100000');
  positive(spread, 'spread', true);
  const p = { ...preset, ...options };
  positive(p.life, 'life'); positive(p.size, 'size'); positive(p.stretch ?? 1, 'stretch');
  const base = new THREE.PlaneGeometry(1,1), geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index.clone();
  for (const name of ['position','uv']) geometry.setAttribute(name, base.getAttribute(name).clone());
  base.dispose(); geometry.instanceCount = count;
  const origins = new Float32Array(count*3), velocities = new Float32Array(count*3), seeds = new Float32Array(count*2);
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
  for (let i=0;i<count;i++) {
    origins.set([(random()-0.5)*spread, (random()-0.5)*spread*0.2, (random()-0.5)*spread],i*3);
    velocities.set([(random()-0.5)*Math.abs(p.speed)*0.5, p.speed*(0.7+random()*0.6), (random()-0.5)*Math.abs(p.speed)*0.5],i*3);
    seeds.set([random(),random()],i*2);
  }
  geometry.setAttribute('rkOrigin',new THREE.InstancedBufferAttribute(origins,3));
  geometry.setAttribute('rkVelocity',new THREE.InstancedBufferAttribute(velocities,3));
  geometry.setAttribute('rkSeed',new THREE.InstancedBufferAttribute(seeds,2));
  const uniforms = { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    rkTime: uniform(0), rkLife: uniform(p.life), rkGravity: uniform(p.gravity), rkSize: uniform(p.size),
    rkStretch: uniform(p.stretch ?? 1), rkLoop: uniform(loop ? 1 : 0), rkColor: uniform(color(p.color)),
    rkEndColor: uniform(color(p.endColor)), rkOpacity: uniform(p.opacity), rkDepth: uniform(null),
    rkDepthEnabled: uniform(0), rkNear: uniform(0.1), rkFar: uniform(1000), rkOrtho: uniform(0),
    rkSoftness: uniform(0.6), rkResolution: uniform(new THREE.Vector2(1,1)) };
  const material = new THREE.ShaderMaterial({ name: `RenderKit/particles/${kind}`, uniforms,
    defines: { RK_KIND: Object.keys(PARTICLE_PRESETS).indexOf(kind) },
    vertexShader: particleVertex, fragmentShader: particleFragment, transparent: true, depthWrite: false,
    blending: p.additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false;
  return { mesh, material, uniforms,
    update(seconds, camera, renderer) {
      positive(seconds, 'seconds', true); uniforms.rkTime.value = seconds;
      if (camera) { uniforms.rkNear.value = camera.near; uniforms.rkFar.value = camera.far; uniforms.rkOrtho.value = camera.isOrthographicCamera ? 1 : 0; }
      if (renderer) renderer.getDrawingBufferSize(uniforms.rkResolution.value);
    },
    setDepthTexture(texture, softness = 0.6) {
      positive(softness, 'softness'); uniforms.rkDepth.value = texture;
      uniforms.rkDepthEnabled.value = texture ? 1 : 0; uniforms.rkSoftness.value = softness;
    },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}

export function createTemporalMaterial({ time = uniform(0), tint = 0x8ccbbf,
  opacity = 0.45, scanScale = 18, ...options } = {}) {
  return new THREE.ShaderMaterial({ name: 'RenderKit/temporal', transparent: true, depthWrite: false,
    side: THREE.DoubleSide, uniforms: { rkTime: time, rkTint: uniform(color(tint)), rkOpacity: uniform(opacity), rkScanScale: uniform(scanScale) },
    vertexShader: meshVertex,
    fragmentShader: /* glsl */`
      uniform float rkTime, rkOpacity, rkScanScale; uniform vec3 rkTint;
      varying vec3 vPosition, vNormalView, vView;
      void main() {
        float rim = pow(1.0-abs(dot(normalize(vNormalView),normalize(vView))),2.5);
        float scan = 0.5+0.5*sin(vPosition.y*rkScanScale-rkTime*1.6);
        float aa = max(fwidth(vPosition.y*rkScanScale),0.001);
        scan = mix(scan,0.5,smoothstep(1.0,3.0,aa));
        gl_FragColor = vec4(rkTint*(0.7+rim),rkOpacity*(0.1+0.7*rim+0.2*scan));
        ${outputGLSL}
      }
    `, ...options });
}

/**
 * @param {{ zenith?: number, horizon?: number, ground?: number, sunDirection?: THREE.Vector3 } & THREE.ShaderMaterialParameters} [options]
 *   the rest go to the THREE.ShaderMaterial
 */
export function createSkyMaterial({ zenith = 0x25404d, horizon = 0xa5b4af,
  ground = 0x4b5046, sunDirection = new THREE.Vector3(0.4,0.6,-0.3), ...options } = {}) {
  return new THREE.ShaderMaterial({ name: 'RenderKit/sky', side: THREE.BackSide, depthWrite: false,
    uniforms: { rkZenith: uniform(color(zenith)), rkHorizon: uniform(color(horizon)), rkGround: uniform(color(ground)),
      rkSun: uniform(sunDirection.clone().normalize()) }, vertexShader: meshVertex,
    fragmentShader: /* glsl */`
      varying vec3 vPosition; uniform vec3 rkZenith, rkHorizon, rkGround, rkSun;
      void main() {
        vec3 ray = normalize(vPosition);
        vec3 tint = mix(rkHorizon,rkZenith,pow(max(ray.y,0.0),0.45));
        tint = mix(tint,rkGround,smoothstep(0.0,0.25,-ray.y));
        float sun = pow(max(dot(ray,rkSun),0.0),600.0);
        gl_FragColor = vec4(tint+vec3(1.0,0.88,0.67)*sun*3.0,1.0);
        ${outputGLSL}
      }
    `, ...options });
}
