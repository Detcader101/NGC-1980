// Shared distance policy for the whole world. Strategic fog still controls intelligence in fog.js;
// this atmospheric veil hides the streaming boundary everywhere, including the wild lands.
export const LOD = Object.freeze({ near: 520, blend: 110, detail: 240, detailBlend: 70, prefetch: 600, maxDraw: 2600 });
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const drawDistance = (height, jet = false) => Math.min(LOD.maxDraw, (jet ? 1100 : 720) + Math.max(0, height) * 1.6);
export const lodWeights = d => ({ near: 1 - smooth(LOD.near - LOD.blend, LOD.near + LOD.blend, d), far: smooth(LOD.near - LOD.blend, LOD.near + LOD.blend, d), detail: 1 - smooth(LOD.detail - LOD.detailBlend, LOD.detail + LOD.detailBlend, d) });

// All built-in materials use the same radial fog distance as terrain, rather than camera-space depth.
// Otherwise a tree at a screen edge can remain clear after the ground below it has vanished into haze.
export function radialFog(THREE) {
  THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex.replace('- mvPosition.z', 'length( mvPosition.xyz )');
}

// Complementary screen-door masks preserve opaque depth sorting while detail dissolves into silhouettes.
// Every chunk gets a separate reveal uniform; a late worker result fades in instead of appearing in one frame.
export function lodShader(sh, kind, reveal) {
  sh.uniforms.uReveal = reveal;
  sh.vertexShader = 'varying vec3 vLodWorld;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvLodWorld = (modelMatrix * vec4(transformed, 1.)).xyz;');
  const near = `smoothstep(${LOD.near - LOD.blend}.,${LOD.near + LOD.blend}.,d)`;
  const weight = kind === 'near' ? `1.-${near}` : kind === 'far' ? near : kind === 'detail' ? `1.-smoothstep(${LOD.detail - LOD.detailBlend}.,${LOD.detail + LOD.detailBlend}.,d)` : '1.';
  sh.fragmentShader = 'varying vec3 vLodWorld; uniform float uReveal;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
    float d=length(vLodWorld-cameraPosition), w=${weight};
    float screenDoor=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
    ${kind === 'far' ? 'if(screenDoor < 1.-w) discard;' : 'if(screenDoor >= w) discard;'}
    if(fract(screenDoor*7.31+.17)>=uReveal) discard;`);
}
