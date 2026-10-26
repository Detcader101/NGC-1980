// THREE side of the lived-in world's geometry: one material for everything built (vertex colours, Lambert, optional
// fog of war in the control zone), and buffers from kit.js's packed arrays (positions f32, normals i8, colours u8 -
// 18 bytes a vertex). Colours are stored as sqrt(linear) for precision in the darks and squared back in the shader.
import * as THREE from 'three';
import { FOG_GLSL } from '../fog.js';
import { lodShader } from './visibility.js';

export function worldMaterial({ fog = null, uTime = null, instanced = false, side = THREE.FrontSide, extra = null, lod = null, reveal = { value: 1 } } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\n vColor.rgb *= color.rgb;\n#endif');
    if (fog) {   // the zone's fog of war (fog.js), as on the trees
      sh.uniforms.uFogT = fog.uniforms.uFogT; sh.uniforms.uFogB = fog.uniforms.uFogB; sh.uniforms.uTime = uTime;
      sh.vertexShader = 'varying vec3 vFW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vFW = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
        #else
          vFW = (modelMatrix * vec4(transformed, 1.)).xyz;
        #endif`);
      sh.fragmentShader = 'varying vec3 vFW; uniform sampler2D uFogT; uniform float uFogB; uniform float uTime;\n' + FOG_GLSL + '\n' + sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = fogOfWar(gl_FragColor.rgb, vFW.xz, uTime);\n#include <fog_fragment>');
    }
    if (extra) extra(sh);
    if (lod) lodShader(sh, lod, reveal);
  };
  m.customProgramCacheKey = () => 'world' + (fog ? 'F' : '') + (extra ? extra.key || 'x' : '') + (lod || '');
  return m;
}
// ground overlays (roads, fields, squares): pulled towards the camera in depth, and further out lifted a little with
// distance, so they stay on top of a terrain that is coarser than they are (16 m far heightmap, no road beds in it)
export function groundMaterial({ fog = null, uTime = null, far = false, lod = null, reveal = { value: 1 } } = {}) {
  const lift = far ? 'clamp((dd - 300.) / 500., 0., 1.) * 3.0' : 'clamp((dd - 120.) / 380., 0., 1.) * 0.6';
  const extra = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec4 wq = modelMatrix * vec4(transformed, 1.); float dd = length(wq.xyz - cameraPosition); transformed.y += ${lift}; }`);
  };
  extra.key = far ? 'gf' : 'gn';
  const m = worldMaterial({ fog, uTime, extra, lod, reveal });
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4;
  return m;
}
export function geoFrom(d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3, true));
  g.setAttribute('color', new THREE.BufferAttribute(d.col, 3, true));
  g.computeBoundingSphere();
  return g;
}
