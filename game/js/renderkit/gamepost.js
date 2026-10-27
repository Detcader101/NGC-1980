// RENDERKIT post: the desktop post pipeline (renderkit createPostPipeline) fitted to the game's renderer.
// Only built when RK.on('post'); main.js draws straight to the canvas otherwise (and always in XR).
//
// Display-referred, on purpose. The game was authored with no tone mapping, and several of its own ShaderMaterials
// (terrain, the fx.js particles and decals, sea life) write display (sRGB) values straight to gl_FragColor without
// Three's colorspace chunk. The library's linear-target contract would encode those a second time in the final pass
// and wash them out. So the scene target is flagged the way Three treats an XR framebuffer (isXRRenderTarget with an
// sRGB texture): every built-in material encodes into it exactly as it does onto the canvas, custom shaders write what
// they always wrote, and the target holds the old frame pixel for pixel. The final pass then runs with a linear
// output colour space so it does not encode again, and the renderer's toneMapping stays NoToneMapping everywhere.
// Grading is therefore in display space: kept very light (no grain, faint vignette, a touch of saturation/contrast).
// The scene target is multisampled to keep the canvas's MSAA (antialias: true) through the post pass.
import * as THREE from 'three';
import { createPostPipeline } from './post.js';

export const GAME_POST_DEFAULTS = Object.freeze({ vignette: 0.1, grain: 0, saturation: 0.96, contrast: 1.03, temporal: 0, nightVision: 0 });

export function createGamePost(renderer, { reducedMotion = () => false, ...options } = {}) {
  const post = createPostPipeline(renderer, { ...GAME_POST_DEFAULTS, ...options });
  post.target.isXRRenderTarget = true;               // output colour space = target texture's (sRGB), see above
  post.target.texture.colorSpace = THREE.SRGBColorSpace;
  // 8-bit is enough: the target holds display values that the canvas would clamp to 0..1 anyway, and it halves the
  // bandwidth of the half-float default (measured: the half-float MSAA target cost +30-40% frame time at full res on
  // SwiftShader). internalFormat pins plain RGBA8 so the sRGB-tagged texture is not given an sRGB8 format.
  post.target.texture.type = THREE.UnsignedByteType; post.target.texture.internalFormat = 'RGBA8';
  post.target.samples = Math.min(4, renderer.capabilities.maxSamples || 0);
  const U = post.uniforms, base = { grain: U.rkGrain.value, temporal: U.rkTemporal.value };
  let seconds = 0;
  const G = {
    post, uniforms: U,
    get seconds() { return seconds; },
    // advance the post clock (grain / temporal wave); main.js passes 0 while paused, reduced motion freezes it
    tick(dt) { if (!reducedMotion()) seconds += dt; },
    render(scene, camera) {
      if (renderer.xr.isPresenting) { renderer.render(scene, camera); return; }   // never post in XR
      const calm = reducedMotion();
      U.rkGrain.value = calm ? 0 : base.grain; U.rkTemporal.value = calm ? 0 : base.temporal;
      const ocs = renderer.outputColorSpace, tm = renderer.toneMapping;
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
      try { post.render(scene, camera, seconds); }
      finally { renderer.outputColorSpace = ocs; renderer.toneMapping = tm; }
    },
    set(name, v) { if (name === 'grain' || name === 'temporal') base[name] = v; const k = { vignette: 'rkVignette', grain: 'rkGrain', saturation: 'rkSaturation', contrast: 'rkContrast', temporal: 'rkTemporal', nightVision: 'rkNight' }[name]; if (k) U[k].value = v; },
    dispose() { post.dispose(); },
  };
  return G;
}
