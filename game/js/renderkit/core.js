import * as THREE from 'three';

export const VERSION = '1.0.0';
export const THREE_REVISION = '170';
export const uniform = value => ({ value });
export const color = value => new THREE.Color(value);

export function positive(value, name, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${name} must be finite and ${allowZero ? 'nonnegative' : 'positive'}`);
  }
  return value;
}

// Fail loudly when a future Three revision changes an integration point.
export function insertAfter(source, marker, code) {
  if (!source.includes(marker)) throw new Error(`RenderKit: missing shader chunk ${marker}; tested with Three r${THREE_REVISION}`);
  return source.replace(marker, `${marker}\n${code}`);
}

// Chain existing hooks. Distinct keys prevent Three from reusing the wrong program.
// Install other replacement-style hooks (e.g. fogPatch) BEFORE this helper.
export function patchMaterial(material, key, uniforms, patch) {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    patch(shader);
  };
  material.customProgramCacheKey = () => `${previousKey}|renderkit:${VERSION}:${key}`;
  material.userData.renderkit = { key, uniforms };
  material.needsUpdate = true;
  return material;
}

// Attribute coordinates before deformation keep camouflage attached to a moving model.
// World coordinates after skin/morph/instance transforms support terrain and weather.
export function addSurfaceCoordinates(shader) {
  const declarations = 'varying vec3 rkLocal; varying vec3 rkWorld;';
  shader.vertexShader = `${declarations}\n${shader.vertexShader}`;
  shader.fragmentShader = `${declarations}\n${shader.fragmentShader}`;
  shader.vertexShader = insertAfter(shader.vertexShader, '#include <begin_vertex>', 'rkLocal = position;');
  shader.vertexShader = insertAfter(shader.vertexShader, '#include <project_vertex>', /* glsl */`
    vec4 rkP = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      rkP = batchingMatrix * rkP;
    #endif
    #ifdef USE_INSTANCING
      rkP = instanceMatrix * rkP;
    #endif
    rkWorld = (modelMatrix * rkP).xyz;
  `);
}

export function setTextureRole(texture, role) {
  if (!texture?.isTexture) throw new TypeError('Expected a Three Texture');
  if (!['color', 'data', 'hdr'].includes(role)) throw new RangeError('Texture role: color, data, or hdr');
  texture.colorSpace = role === 'color' ? THREE.SRGBColorSpace : role === 'hdr' ? THREE.LinearSRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
