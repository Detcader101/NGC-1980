// Fog of war. A coarse grid over the map: "visible" is recomputed a few times a second from everything that can see
// (your helicopter, carrier, drones, islands - radar islands see far), "explored" remembers everywhere you have ever
// seen. Both go to the GPU as one small texture: the terrain, trees and buildings darken where you have never been
// and dim where you are not looking now, and enemy units only show inside your sight.
import * as THREE from 'three';

export function createFog(bound, N = 112) {
  const vis = new Float32Array(N * N), exp = new Float32Array(N * N), data = new Uint8Array(N * N * 4);
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  const cell = 2 * bound / N;
  const uniforms = { uFogT: { value: tex }, uFogB: { value: bound }, uFogOn: { value: 1 } };
  const ij = (x, z) => [Math.floor((x + bound) / cell), Math.floor((z + bound) / cell)];
  const fog = {
    N, tex, uniforms, vis, exp, enabled: true,
    // sources: [{ x, z, r }]
    update(sources) {
      vis.fill(0);
      for (const s of sources) {
        const [ci, cj] = ij(s.x, s.z), rc = Math.ceil(s.r / cell) + 1, soft = cell * 2.2;
        for (let j = Math.max(0, cj - rc); j <= Math.min(N - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(N - 1, ci + rc); i++) {
          const x = -bound + (i + 0.5) * cell, z = -bound + (j + 0.5) * cell, d = Math.hypot(x - s.x, z - s.z);
          const v = Math.min(1, Math.max(0, (s.r - d) / soft)); const k = j * N + i; if (v > vis[k]) vis[k] = v;
        }
      }
      for (let k = 0; k < N * N; k++) {
        if (vis[k] > exp[k]) exp[k] = vis[k];
        data[k * 4] = fog.enabled ? vis[k] * 255 : 255; data[k * 4 + 1] = fog.enabled ? exp[k] * 255 : 255;
      }
      tex.needsUpdate = true;
    },
    reset() { exp.fill(0); vis.fill(0); },
    visibleAt(x, z) { if (!fog.enabled) return true; const [i, j] = ij(x, z); return i >= 0 && j >= 0 && i < N && j < N && vis[j * N + i] > 0.3; },
    exploredAt(x, z) { if (!fog.enabled) return true; const [i, j] = ij(x, z); return i >= 0 && j >= 0 && i < N && j < N && exp[j * N + i] > 0.3; },
    explore(x, z, r) { fog.update([{ x, z, r }]); },
  };
  return fog;
}

// GLSL: darken a lit colour c at world xz by the fog of war (needs uFogT, uFogB, uTime)
export const FOG_GLSL = `
vec3 fogOfWar(vec3 c, vec2 p, float t){
  if(max(abs(p.x),abs(p.y))>uFogB) return c;   // past the operating area: no war, no fog of war
  vec2 f=texture2D(uFogT,(p+uFogB)/(2.*uFogB)).rg;
  float cl=.5+.5*sin(p.x*.031+t*.21)*sin(p.y*.027-t*.16);
  vec3 unk=mix(vec3(.09,.11,.15),vec3(.15,.17,.22),cl);
  vec3 seen=mix(vec3(dot(c,vec3(.33))),c,.5)*.6;
  return mix(mix(unk,mix(seen,c,f.r),f.g),c,smoothstep(uFogB-120.,uFogB,max(abs(p.x),abs(p.y))));
}`;

// patch a built-in material (Lambert/Phong, instanced or not) so it is covered by the fog of war too
export function fogPatch(mat, fog, timeUniform) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uFogT = fog.uniforms.uFogT; sh.uniforms.uFogB = fog.uniforms.uFogB; sh.uniforms.uTime = timeUniform;
    sh.vertexShader = 'varying vec3 vFW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      #ifdef USE_INSTANCING
        vFW = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
      #else
        vFW = (modelMatrix * vec4(transformed, 1.)).xyz;
      #endif`);
    sh.fragmentShader = 'varying vec3 vFW; uniform sampler2D uFogT; uniform float uFogB; uniform float uTime;\n' + FOG_GLSL + '\n' + sh.fragmentShader.replace('#include <fog_fragment>', 'gl_FragColor.rgb = fogOfWar(gl_FragColor.rgb, vFW.xz, uTime);\n#include <fog_fragment>');
  };
  mat.customProgramCacheKey = () => 'fogwar';
  return mat;
}
