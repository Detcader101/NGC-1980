// Portable GLSL ES functions. No renderer globals, textures, or hidden uniforms.
export const noiseGLSL = /* glsl */`
float rkHash(vec3 p) {
  p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float rkNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rkHash(i), rkHash(i+vec3(1,0,0)), f.x),
                 mix(rkHash(i+vec3(0,1,0)), rkHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(rkHash(i+vec3(0,0,1)), rkHash(i+vec3(1,0,1)), f.x),
                 mix(rkHash(i+vec3(0,1,1)), rkHash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float rkFBM(vec3 p) {
  return rkNoise(p)*0.57 + rkNoise(p*2.03+7.1)*0.28 + rkNoise(p*4.11+19.7)*0.15;
}
`;

export const sdfGLSL = /* glsl */`
float rkRoundBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - radius;
}
float rkCoverage(float distanceToEdge) {
  float aa = max(fwidth(distanceToEdge), 0.00001);
  return 1.0 - smoothstep(-aa, aa, distanceToEdge);
}
float rkMedian(vec3 v) { return max(min(v.r,v.g), min(max(v.r,v.g),v.b)); }
`;

export const depthGLSL = /* glsl */`
float rkViewDepth(float depth, float nearPlane, float farPlane, float orthographic) {
  float perspective = nearPlane * farPlane / (farPlane - depth * (farPlane - nearPlane));
  return mix(perspective, mix(nearPlane, farPlane, depth), orthographic);
}
`;

export const meshVertex = /* glsl */`
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormalView;
varying vec3 vView;
void main() {
  vUv = uv; vPosition = position;
  vec4 local = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
    mat3 im = mat3(instanceMatrix);
    n /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
    n = im * n;
  #endif
  vec4 view = modelViewMatrix * local;
  vNormalView = normalize(normalMatrix * n); vView = -view.xyz;
  gl_Position = projectionMatrix * view;
}
`;

export const outputGLSL = /* glsl */`
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;
