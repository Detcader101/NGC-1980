// hueysight.js - the pilot's armament sight: the M60-series (XM60) helicopter REFLEX sight on the infinity reflex sight
// mount, as TM 9-1090-204-12 (1967, XM156 multiarmament mount: figs 1-4, 1-5, table 2-2, fig 2-4) and FM 1-40 (1973,
// helicopter gunnery: figs 4-1, 4-3, 11-27, 11-28) describe it. It is a collimating reflex sight (a lamp-lit reticle
// projected at infinity through a beam splitter), not a holographic sight.
//   - the mount hangs from the top of the cabin in front of the pilot and holds the sight "in operating or stowed
//     position" (a hub with an OPERATE and a STOW indent and a locking lever); it stows by pivoting up and inboard
//     against the ceiling (Centaurs-in-Vietnam XM21 page: "stowed by pivoting to the left")
//   - reticle lamp switch on top (three positions: either ON lights the dual-filament lamp), rheostat knob upper left
//     (clockwise brighter), elevation / depression knob on the left side (white graduations up, red down), a level
//     vial and inclinometer, the aiming-data decal on the mount
//   - reticle (FM 1-40 figs 4-1 / 4-3): a centre pipper, a circle, a vertical row of short horizontal ticks above and
//     below at 10 mil steps and two broken horizontal bars each side; the FM reads target widths in mils off it
//     ("a tank 15 m long covers 20 mils") and gives the XM60 reticle as 80 mils
// The reticle is drawn in the combining glass by a collimating shader: each fragment's view ray is turned into the
// aircraft's frame and compared with the sight line, so the pattern is fixed to the airframe at infinity, does not swim
// with head movement and is seen only through the glass (each XR eye uses its own camera position).
import * as THREE from 'three';
import { rbox } from './hueygeo.js';

export const MIL = Math.PI * 2 / 6400;   // US Army mil
// the sight line: harmonised so the pipper sits on the rocket pair's mean point of impact at H.range (game rockets:
// 105 m/s from the pods at (+-1.80, -1.13, -0.55) relative to the airframe launch point, 1.2 m/s^2 drop; main.js
// fires them from (+-1.7, -0.4, -0.6) along the launcher boresight), seen from the pilot's design eye
export const SIGHT_HARMONY = Object.freeze({ range: 250, v: 105, g: 1.2, launch: [0, -0.4, -0.6] });
export function sightLine(eye, H = SIGHT_HARMONY) {
  const t = H.range / H.v, drop = 0.5 * H.g * t * t;
  return new THREE.Vector3(H.launch[0] - eye.x, H.launch[1] - drop - eye.y, H.launch[2] - H.range - eye.z).normalize();
}

// pattern in mils (u right, v up from the pipper): the FM 1-40 fig 4-1 / 4-3 layout, measured on the figure at 10 mils
// per tick step (fig 4-3: 20 mils = two steps): circle 50 mil radius, pipper 2 mil radius, ticks at v = +-10/20/30
// (8 mil long), horizontal bars 11..21 and 30..40 mils out each side
const FRAG = `
uniform mat3 uToLocal; uniform vec3 uBore, uRight, uUp; uniform float uLamp, uGlass; uniform vec3 uColor;
varying vec3 vWorld; varying vec2 vUv;
float band(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
float seg(vec2 p, vec2 a, vec2 b, float w, float aa) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return 1.0 - smoothstep(w - aa, w + aa, length(pa - ba * h)); }
void main() {
  vec3 d = normalize(uToLocal * normalize(vWorld - cameraPosition));
  float mil = 6400.0 / 6.2831853;
  vec2 p = vec2(atan(dot(d, uRight), dot(d, uBore)), atan(dot(d, uUp), dot(d, uBore))) * mil;   // angles off the sight line
  float aa = max(fwidth(p.x), fwidth(p.y)) * 0.8 + 0.05, w = 0.85;
  float r = length(p), m = band(r - 50.0, w, aa) + (1.0 - smoothstep(2.5 - aa, 2.5 + aa, r));
  for (int i = 1; i <= 3; i++) { float v = float(i) * 10.0; m += seg(p, vec2(-4.0, v), vec2(4.0, v), w, aa) + seg(p, vec2(-4.0, -v), vec2(4.0, -v), w, aa); }
  for (int s = -1; s <= 1; s += 2) { float sx = float(s); m += seg(p, vec2(11.0 * sx, 0.0), vec2(21.0 * sx, 0.0), w, aa) + seg(p, vec2(30.0 * sx, 0.0), vec2(40.0 * sx, 0.0), w, aa); }
  m = clamp(m, 0.0, 1.0) * uLamp;
  float edge = smoothstep(0.5, 0.47, length(vUv - 0.5));   // the round glass
  vec3 tint = vec3(0.55, 0.62, 0.58);
  gl_FragColor = vec4(tint * uGlass + uColor * m, (uGlass * 0.6 + m) * edge);
}`;
const VERT = `varying vec3 vWorld; varying vec2 vUv; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

// opts: { eye (Vector3, the design eye), M (material factory (hex) -> material), hit(id, w, h, d, x, y, z, parent, label) }
export function buildHueySight({ eye, M, hit, hinge = [0.55, 0.455, -2.28] }) {
  const root = new THREE.Group(); root.name = 'armamentSight';
  root.position.set(hinge[0], hinge[1], hinge[2]);
  const dark = M(0x1e2021), grey = M(0x4c5154), od = M(0x3c4232), knob = M(0x151515), decal = M(0xd8d4c4), red = M(0xb02018), white = M(0xd8d8d0);
  const add = (geo, mat, x = 0, y = 0, z = 0, p = root, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  // the mount plate on the headguard / cabin top, the hub with its STOW and OPERATE indents, the locking lever
  add(new THREE.BoxGeometry(0.11, 0.012, 0.16), od, 0, 0.012, 0);
  add(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 20).rotateX(Math.PI / 2), grey, 0, 0, 0);
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.034, 6).rotateX(Math.PI / 2), dark, 0, 0, 0);   // the hub nut
  // the swinging part: pivots about the fore-aft hub axis (z); operate = hanging down, stow = swung up inboard
  const arm = new THREE.Group(); arm.name = 'sightArm'; root.add(arm);
  add(new THREE.BoxGeometry(0.05, 0.13, 0.016), od, 0, -0.07, 0.004, arm);                                   // the mount's drop plate
  for (let i = 0; i < 2; i++) add(new THREE.CylinderGeometry(0.005, 0.005, 0.018, 8).rotateX(Math.PI / 2), dark, (i ? 0.013 : -0.013), -0.03, 0.004, arm);   // fasteners above the decal
  add(new THREE.BoxGeometry(0.008, 0.035, 0.012), dark, 0.025, -0.045, 0.012, arm);                         // locking lever
  // aiming data decal on the bracket (SIGHT REFLEX HELICOPTER XM60 - ELEVATION SETTING: range / altitude table)
  { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 160; const c = cv.getContext('2d'); c.fillStyle = '#d8d4c4'; c.fillRect(0, 0, 128, 160); c.fillStyle = '#151515'; c.font = 'bold 11px Arial'; c.textAlign = 'center';
    ['SIGHT REFLEX', 'HELICOPTER XM60', 'ELEVATION SETTING'].forEach((t, i) => c.fillText(t, 64, 13 + i * 12)); c.font = '10px Arial';
    const rows = [['RANGE', 'NOE', '1500', '2500'], ['500', '15', '', ''], ['1000', '0', '10', '20'], ['1500', '-25', '-15', '-5'], ['2000', '-15', '-20', '-10'], ['2500', '', '-30', '-20'], ['3000', '', '-35', '-30'], ['3500', '', '-45', '-40']];
    rows.forEach((r, j) => r.forEach((t, i) => c.fillText(t, 18 + i * 31, 52 + j * 14))); c.strokeStyle = '#151515'; c.strokeRect(2, 40, 124, 116);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(0.045, 0.056), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }), 0, -0.09, 0.0125, arm); }
  // the sight: the lamp / collimator housing (9.1 lb), the elevation drum on the left, the rheostat and lamp switch
  const body = new THREE.Group(); body.name = 'sightBody'; body.position.set(0, -0.2, 0); arm.add(body);
  add(rbox(0.1, 0.07, 0.125, 0.018, 3), dark, 0, 0.0, 0, body);                                             // housing (rounded casting)
  add(new THREE.CylinderGeometry(0.058, 0.058, 0.016, 32), grey, 0, 0.042, 0, body);                        // circular support assembly (azimuth ring)
  add(new THREE.CylinderGeometry(0.02, 0.026, 0.035, 20), dark, 0, -0.17, 0.018, body);                     // collimator / lamp housing under the glass cage (fig 1-4)
  add(new THREE.TorusGeometry(0.024, 0.005, 6, 20).rotateX(Math.PI / 2), grey, 0, -0.155, 0.018, body);
  const drum = add(new THREE.CylinderGeometry(0.036, 0.036, 0.022, 28).rotateZ(Math.PI / 2), grey, -0.064, -0.005, 0.0, body);   // elevation / depression knob, graduated
  { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32; const c = cv.getContext('2d'); c.fillStyle = '#4c5154'; c.fillRect(0, 0, 256, 32); for (let i = 0; i < 40; i++) { c.fillStyle = i < 20 ? '#e8e8e0' : '#d03020'; c.fillRect(i * 6.4, 0, 1.6, i % 5 ? 10 : 18); }
    const tx = new THREE.CanvasTexture(cv); tx.wrapS = THREE.RepeatWrapping; drum.material = new THREE.MeshLambertMaterial({ map: tx }); }
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 14).rotateZ(Math.PI / 2), knob, -0.06, 0.03, -0.035, body);   // rheostat knob (upper left)
  const lampSw = new THREE.Group(); lampSw.position.set(0.02, 0.058, 0.02); body.add(lampSw);
  add(new THREE.CylinderGeometry(0.003, 0.004, 0.022, 8), white, 0, 0.011, 0, lampSw);                     // reticle lamp toggle (on top)
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.012, 10), dark, 0, -0.005, 0, lampSw);
  add(new THREE.CylinderGeometry(0.006, 0.006, 0.012, 12).rotateX(Math.PI / 2), M(0x30473a), 0.03, 0.02, 0.066, body);   // level vial window
  // the combining glass (beam splitter) in its hoop, below the housing on the pilot's line of sight
  const glassY = -0.105, glassR = 0.052;
  const hoop = add(new THREE.TorusGeometry(glassR + 0.004, 0.006, 8, 36), dark, 0, glassY, 0.018, body);
  add(new THREE.BoxGeometry(0.01, 0.06, 0.01), dark, -glassR - 0.004, glassY + 0.035, 0.018, body); add(new THREE.BoxGeometry(0.01, 0.06, 0.01), dark, glassR + 0.004, glassY + 0.035, 0.018, body);
  const U = { uToLocal: { value: new THREE.Matrix3() }, uBore: { value: new THREE.Vector3(0, 0, -1) }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) },
    uLamp: { value: 0 }, uGlass: { value: 0.12 }, uColor: { value: new THREE.Color(1.0, 0.55, 0.18) } };
  const glassMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const glass = add(new THREE.CircleGeometry(glassR, 40), glassMat, 0, glassY, 0.018, body); glass.renderOrder = 6; glass.name = 'combiningGlass';
  // sight line and its frame (aircraft frame: x right, y up, -z forward)
  const bore = sightLine(eye), right = new THREE.Vector3().crossVectors(bore, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(right, bore);
  U.uBore.value.copy(bore); U.uRight.value.copy(right); U.uUp.value.copy(up);
  // place the hinge so the glass centre sits on the design eye's sight line, 0.35 m ahead of the eye (the sight hung
  // close in front of the pilot's eye): arm 0.2 + glass offset below the hub
  const glassAt = eye.clone().addScaledVector(bore, 0.35);
  root.position.set(glassAt.x, glassAt.y - (-0.2 + glassY), glassAt.z - 0.018);
  // hit boxes: the housing deploys / stows, the lamp switch, the rheostat
  hit('sight', 0.12, 0.09, 0.14, 0, 0, 0, body, 'ARMAMENT SIGHT  OPERATE / STOW');
  hit('sightLamp', 0.03, 0.03, 0.03, 0.02, 0.065, 0.02, body, 'SIGHT RETICLE LAMP');
  hit('sightBril', 0.035, 0.035, 0.035, -0.06, 0.03, -0.035, body, 'SIGHT RHEOSTAT  (BRIGHTER)');
  const STOW = -1.45;   // swung up inboard, just under the ceiling
  const S = { deployed: false, k: 0, lamp: true, bril: 0.85 };
  arm.rotation.z = STOW;
  const _m4 = new THREE.Matrix4();
  return {
    group: root, glass, state: S, bore,
    toggle(v = !S.deployed) { S.deployed = v; return S.deployed; },
    lampToggle() { S.lamp = !S.lamp; return S.lamp; },
    brighter() { S.bril = S.bril >= 0.99 ? 0.25 : Math.min(1, S.bril + 0.25); return S.bril; },
    // frame: the aircraft's world matrix (the cockpit group's parent), dt
    update(dt, frame) {
      S.k += ((S.deployed ? 1 : 0) - S.k) * Math.min(1, dt * 5); if (dt === 0) S.k = S.deployed ? 1 : 0;
      const e = S.k * S.k * (3 - 2 * S.k); arm.rotation.z = STOW * (1 - e);
      lampSw.rotation.x = S.lamp ? -0.45 : 0.45;
      U.uLamp.value = S.lamp && S.k > 0.98 ? S.bril : 0;
      _m4.extractRotation(frame); U.uToLocal.value.setFromMatrix4(_m4).transpose();
    },
  };
}
