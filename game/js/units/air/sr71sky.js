// The view from 80,000 ft (ngc/look-sr71). The game draws its world to ~2.6 km; from an SR-71's cruise height (a world
// 20 km up) all of that is out of sight. This is a direction-only "far earth" shell around the camera: for every view
// ray below the horizon it finds where the ray meets the curved Earth (R 6371 km) and shades that ground - sea, land
// (the control zone's own map image where the ray lands inside it, a procedural archipelago elsewhere), cloud fields -
// hazed by the air path's length; above the horizon the sky darkens toward a navy-black zenith with height (the
// stratosphere's thin air: little scattering). It sits at 1.8 km radius (inside the camera's far plane), draws after the
// opaque world without writing depth (the aircraft and near terrain stay in front), and fades in above ~3 km so the real
// terrain hands over to it. The horizon dips (3.9 deg at a world 20 km) and the Earth's curve shows at the edges.
import * as THREE from 'three';

const VERT = /* glsl */`varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir; uniform vec3 uCam; uniform float uK, uTime, uBound; uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uSun;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += a * n2(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float H = max(uCam.y, 1.0), R = 6371000.0;
  // ray / sphere: centre (cam.x, -R, cam.z)
  vec3 oc = vec3(0.0, H + R, 0.0); float b = dot(oc, d), c = dot(oc, oc) - R * R, disc = b * b - c;
  float alt = clamp((H - 2500.0) / 18000.0, 0.0, 1.0);
  vec3 zen = mix(vec3(0.30, 0.52, 0.86), vec3(0.03, 0.07, 0.20), alt), hor = mix(vec3(0.74, 0.84, 0.94), vec3(0.62, 0.74, 0.90), alt);
  float up = clamp(d.y, -1.0, 1.0);
  vec3 col;
  if (disc > 0.0 && -b - sqrt(disc) > 0.0) {
    float t = -b - sqrt(disc); vec3 P = uCam + d * t; vec2 w = P.xz;
    // land: the zone's map inside the bound, a procedural archipelago outside (low frequency continents + islands)
    float land = smoothstep(0.58, 0.62, fbm(w * 0.00004 + 3.1) * 0.75 + fbm(w * 0.00031) * 0.35);
    vec3 sea = mix(vec3(0.05, 0.13, 0.22), vec3(0.08, 0.22, 0.32), fbm(w * 0.0005));
    vec3 grd = mix(vec3(0.30, 0.34, 0.20), vec3(0.47, 0.43, 0.32), fbm(w * 0.0009)) * (0.8 + 0.4 * fbm(w * 0.004));
    col = mix(sea, grd, land);
    if (uHasMap > 0.5 && abs(w.x) < uBound && abs(w.y) < uBound) col = texture2D(uMap, (w + uBound) / (2.0 * uBound)).rgb;
    // cumulus fields (patchy, with shadows toward the sun) and the haze of the long air path
    float cl = smoothstep(0.55, 0.75, fbm(w * 0.00018 + uTime * 0.0004));
    col = mix(col * (1.0 - 0.35 * smoothstep(0.55, 0.75, fbm((w + uSun.xz * 900.0) * 0.00018))), vec3(0.93, 0.94, 0.96), cl * 0.9);
    float haze = 1.0 - exp(-t / mix(60000.0, 260000.0, alt));
    col = mix(col, hor, clamp(haze, 0.0, 1.0));
  } else {
    // above the horizon: the limb's bright band, then up into the dark
    float e = clamp(up * 4.0 + 0.2, 0.0, 1.0);
    col = mix(hor, zen, pow(e, 0.6));
    float sunA = max(0.0, dot(d, normalize(uSun))); col += vec3(1.0, 0.95, 0.85) * (pow(sunA, 600.0) * 4.0 + pow(sunA, 12.0) * 0.12 * (1.0 - alt * 0.6));
  }
  gl_FragColor = vec4(col, uK);
}`;

export function createHighView(scene, { mapTex = null, bound = 1280 } = {}) {
  const uni = { uCam: { value: new THREE.Vector3() }, uK: { value: 0 }, uTime: { value: 0 }, uBound: { value: bound }, uMap: { value: mapTex || new THREE.Texture() }, uHasMap: { value: mapTex ? 1 : 0 }, uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3) } };
  const mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.BackSide, fog: false });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 32), mat); shell.name = 'sr71HighView'; shell.renderOrder = -1; shell.frustumCulled = false; shell.visible = false;
  scene.add(shell);
  return {
    shell,
    // camera: the render camera; on: whether the SR-71 is the view's subject (it fades with height either way)
    update(camera, on, time = 0, sunDir = null) {
      const h = camera.position.y, k = on ? Math.min(1, Math.max(0, (h - 3000) / 3000)) : 0;
      shell.visible = k > 0.001; uni.uK.value = k; if (!shell.visible) return;
      shell.position.copy(camera.position); uni.uCam.value.copy(camera.position); uni.uTime.value = time;
      if (sunDir) uni.uSun.value.copy(sunDir);
      const far = camera.far || 2600, r = Math.min(1800, far * 0.7); shell.scale.setScalar(r / 1800);
    },
    setMap(tex) { uni.uMap.value = tex; uni.uHasMap.value = tex ? 1 : 0; },
    dispose() { scene.remove(shell); shell.geometry.dispose(); mat.dispose(); },
  };
}
