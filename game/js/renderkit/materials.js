import * as THREE from 'three';
import { color, uniform, patchMaterial, insertAfter, addSurfaceCoordinates, positive } from './core.js';
import { noiseGLSL } from './glsl.js';

export const SURFACE_PRESETS = Object.freeze(Object.fromEntries(Object.entries({
  paintedMetal: { color: 0x646d60, roughness: 0.68, metalness: 0.05 },
  armor: { color: 0x4c5546, roughness: 0.78, metalness: 0.08 },
  steel: { color: 0x9ca4aa, roughness: 0.34, metalness: 1 },
  aluminum: { color: 0xc4c8ca, roughness: 0.3, metalness: 1 },
  rubber: { color: 0x24272a, roughness: 0.94, metalness: 0 },
  fabric: { color: 0x6d7059, roughness: 0.98, metalness: 0 },
  skin: { color: 0xa97d65, roughness: 0.72, metalness: 0 },
  concrete: { color: 0x929087, roughness: 0.94, metalness: 0 },
  asphalt: { color: 0x363b3c, roughness: 0.96, metalness: 0 },
  wood: { color: 0x706049, roughness: 0.86, metalness: 0 },
  ceramic: { color: 0xc9c7b6, roughness: 0.42, metalness: 0 },
  wreck: { color: 0x3c3029, roughness: 0.95, metalness: 0.18 },
}).map(([k,v]) => [k, Object.freeze(v)])));

/** Add optical surface wear; does not change geometry, colliders, or shadow silhouettes.
 * mask: optional linear RGBA UV texture (R dust, G paint wear, B wetness, A unused).
 * No mask: procedural mottling, not curvature/edge detection.
 */
export function applySurfaceDetail(material, {
  scale = 3, dust = 0.12, wear = 0.08, wetness = 0, camouflage = 0,
  dustColor = 0x9f9278, bareColor = 0x818789, camoColor = 0x303c30, mask = null,
} = {}) {
  if (!material?.isMeshStandardMaterial) throw new TypeError('Surface detail requires a MeshStandardMaterial or MeshPhysicalMaterial');
  if (material.userData.renderkit) throw new Error('Surface detail must be applied once to an unpatched PBR material');
  positive(scale, 'scale');
  const uniforms = {
    rkScale: uniform(scale), rkDust: uniform(dust), rkWear: uniform(wear), rkWet: uniform(wetness),
    rkCamo: uniform(camouflage), rkDustColor: uniform(color(dustColor)),
    rkBareColor: uniform(color(bareColor)), rkCamoColor: uniform(color(camoColor)),
  };
  if (mask) uniforms.rkMask = uniform(mask);
  return patchMaterial(material, `surface:${!!mask}`, uniforms, shader => {
    addSurfaceCoordinates(shader);
    shader.fragmentShader = /* glsl */`
      uniform float rkScale, rkDust, rkWear, rkWet, rkCamo;
      uniform vec3 rkDustColor, rkBareColor, rkCamoColor;
      ${mask ? 'uniform sampler2D rkMask; varying vec2 rkMaskUV;' : ''}
      ${noiseGLSL}\n${shader.fragmentShader}`;
    if (mask) {
      shader.vertexShader = `varying vec2 rkMaskUV;\n${shader.vertexShader}`;
      shader.vertexShader = insertAfter(shader.vertexShader, '#include <begin_vertex>', 'rkMaskUV = uv;');
    }
    shader.fragmentShader = insertAfter(shader.fragmentShader, '#include <color_fragment>', /* glsl */`
      float rkMottle = rkFBM(rkLocal * rkScale);
      vec3 rkMasks = ${mask ? 'texture2D(rkMask, rkMaskUV).rgb' : 'vec3(rkMottle, smoothstep(0.56, 0.78, rkMottle), 1.0)'};
      float rkD = clamp(rkDust * rkMasks.r, 0.0, 1.0);
      float rkW = clamp(rkWear * rkMasks.g, 0.0, 1.0);
      float rkWetAmount = clamp(rkWet * rkMasks.b, 0.0, 1.0);
      float rkPattern = smoothstep(0.42, 0.5, rkFBM(rkLocal * rkScale * 0.28));
      diffuseColor.rgb = mix(diffuseColor.rgb, rkCamoColor, rkPattern * clamp(rkCamo,0.0,1.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, rkBareColor, rkW);
      diffuseColor.rgb = mix(diffuseColor.rgb, rkDustColor, rkD);
      diffuseColor.rgb *= 1.0 - rkWetAmount * 0.23;
    `);
    shader.fragmentShader = insertAfter(shader.fragmentShader, '#include <roughnessmap_fragment>', /* glsl */`
      roughnessFactor = mix(roughnessFactor, 0.4, rkW);
      roughnessFactor = mix(roughnessFactor, 0.96, rkD);
      roughnessFactor = clamp(mix(roughnessFactor, 0.16, rkWetAmount), 0.045, 1.0);
    `);
    shader.fragmentShader = insertAfter(shader.fragmentShader, '#include <metalnessmap_fragment>',
      'metalnessFactor = mix(metalnessFactor, 0.85, rkW) * (1.0 - rkD);');
  });
}

export function createSurfaceMaterial(preset = 'paintedMetal', { detail = {}, ...options } = {}) {
  if (!SURFACE_PRESETS[preset]) throw new RangeError(`Unknown surface preset: ${preset}`);
  const material = new THREE.MeshStandardMaterial({ ...SURFACE_PRESETS[preset], ...options });
  material.name = `RenderKit/${preset}`;
  // Metal exposure is opt-in on nonmetallic substrates.
  const nonmetal = ['rubber', 'fabric', 'skin', 'concrete', 'asphalt', 'wood', 'ceramic'].includes(preset);
  return detail === false ? material : applySurfaceDetail(material, { ...(nonmetal ? { wear: 0 } : {}), ...detail });
}

export function createGlassMaterial(options = {}) {
  return new THREE.MeshPhysicalMaterial({ name: 'RenderKit/glass', color: 0xd7e4db,
    metalness: 0, roughness: 0.08, transmission: 0.92, thickness: 0.15, ior: 1.5,
    attenuationColor: 0xb1c8bd, attenuationDistance: 6, ...options });
}

export function createFoliageMaterial({ map = null, ...options } = {}) {
  return new THREE.MeshStandardMaterial({ name: 'RenderKit/foliage', color: 0x697353,
    roughness: 0.95, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.45,
    map, ...options });
}

// Project decal geometry in the caller (or place a plane just above its receiver).
export function createDecalMaterial({ map = null, ...options } = {}) {
  return new THREE.MeshStandardMaterial({ name: 'RenderKit/decal', color: 0x302c26,
    roughness: 0.95, transparent: true, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -2, polygonOffsetUnits: -2, map, ...options });
}

export function createTerrainMaterial({ scale = 0.1, grass = 0x626c43, rock = 0x77786d,
  sand = 0xb6a582, snow = 0xdde2df, snowLine = 600, snowFade = 80,
  shoreHeight = 2, shoreFade = 3, ...options } = {}) {
  positive(scale, 'scale'); positive(snowFade, 'snowFade'); positive(shoreFade, 'shoreFade');
  const uniforms = { rkTerrainScale: uniform(scale), rkGrass: uniform(color(grass)), rkRock: uniform(color(rock)),
    rkSand: uniform(color(sand)), rkSnow: uniform(color(snow)), rkSnowLine: uniform(snowLine),
    rkSnowFade: uniform(snowFade), rkShore: uniform(shoreHeight), rkShoreFade: uniform(shoreFade) };
  return patchMaterial(new THREE.MeshStandardMaterial({ name: 'RenderKit/terrain', roughness: 0.92, ...options }),
    'terrain', uniforms, shader => {
      addSurfaceCoordinates(shader);
      shader.fragmentShader = /* glsl */`
        uniform float rkTerrainScale, rkSnowLine, rkSnowFade, rkShore, rkShoreFade;
        uniform vec3 rkGrass, rkRock, rkSand, rkSnow;
        ${noiseGLSL}\n${shader.fragmentShader}`;
      shader.fragmentShader = insertAfter(shader.fragmentShader, '#include <color_fragment>', /* glsl */`
        vec3 rkTerrainNormal = normalize(cross(dFdx(rkWorld), dFdy(rkWorld)));
        float rkSlope = 1.0 - abs(rkTerrainNormal.y);
        float rkVariation = rkFBM(rkWorld * rkTerrainScale);
        vec3 rkLand = mix(rkGrass, rkRock, smoothstep(0.18,0.55,rkSlope));
        rkLand = mix(rkSand, rkLand, smoothstep(rkShore, rkShore + rkShoreFade, rkWorld.y));
        float rkSnowMask = smoothstep(rkSnowLine, rkSnowLine + rkSnowFade, rkWorld.y + (rkVariation-0.5)*rkSnowFade);
        rkLand = mix(rkLand, rkSnow, rkSnowMask * (1.0-smoothstep(0.25,0.7,rkSlope)));
        diffuseColor.rgb *= rkLand * mix(0.82,1.08,rkVariation);
      `);
    });
}

// Optical ripples only: the surface and its collision height remain level.
export function createWaterMaterial({ time = uniform(0), scale = 0.65, amplitude = 0.16, ...options } = {}) {
  positive(scale, 'scale'); positive(amplitude, 'amplitude', true);
  return patchMaterial(new THREE.MeshStandardMaterial({ name: 'RenderKit/water', color: 0x214c50,
    roughness: 0.24, metalness: 0, ...options }), 'water',
    { rkTime: time, rkWaveScale: uniform(scale), rkWaveAmplitude: uniform(amplitude) }, shader => {
      addSurfaceCoordinates(shader);
      shader.fragmentShader = `uniform float rkTime, rkWaveScale, rkWaveAmplitude;\n${shader.fragmentShader}`;
      shader.fragmentShader = insertAfter(shader.fragmentShader, '#include <normal_fragment_maps>', /* glsl */`
        vec2 rkP = rkWorld.xz * rkWaveScale;
        vec2 rkSlope = vec2(cos(rkP.x + rkTime*0.7) + 0.35*cos(dot(rkP,vec2(1.7,1.1))-rkTime),
                            sin(rkP.y*1.3 + rkTime*0.5) + 0.25*sin(dot(rkP,vec2(0.8,2.1))+rkTime));
        normal = normalize(normal + mat3(viewMatrix) * vec3(rkSlope.x,0.0,rkSlope.y) * rkWaveAmplitude);
      `);
    });
}
