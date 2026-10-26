// Public entry point. Importing this module does not touch the DOM or game state.
export { VERSION, THREE_REVISION, uniform, patchMaterial, setTextureRole } from './core.js';
export { noiseGLSL, sdfGLSL, depthGLSL } from './glsl.js';
export { SURFACE_PRESETS, applySurfaceDetail, createSurfaceMaterial, createGlassMaterial,
  createFoliageMaterial, createDecalMaterial, createTerrainMaterial, createWaterMaterial } from './materials.js';
export { PARTICLE_PRESETS, createParticleSystem, createTemporalMaterial, createSkyMaterial } from './effects.js';
export { createHUDMaterial, createDistanceTextMaterial, createDistanceText, createTextLabel } from './ui.js';
export { createPostPipeline } from './post.js';
