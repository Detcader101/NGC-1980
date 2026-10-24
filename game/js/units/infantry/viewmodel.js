// NGC-1980 infantry: the first-person viewmodel. Arms (ERDL sleeves, a GI watch on the left wrist, bare hands) and the
// weapon in camera space, rendered in their own pass over the world (depth cleared, near plane 5 mm) so they never
// clip into walls. Procedural animation:
//   - placement: hip / low ready, ADS exactly through the real sight line (the rear sight eyeRelief in front of the
//     eye; the M203 through its quadrant sight, raised by the set elevation), sprint (port arms), prone, weapon swap
//   - the gun follows the soldier's aim (deadzone, sway, recoil) relative to the camera; inertia from turning; bob
//   - action tracks keyed to the same fractions as weapons.js (reloads, charging, SPORTS, remedial, belt, barrel
//     change, LAW extend / arm, checks, inspect); hands parented to anchors on the weapon or free in camera space,
//     arms solved by two-bone IK from fixed shoulders
//   - shots: kick, bolt cycle, muzzle flash, brass out of the port
// API: const vm = createViewmodel(); vm.update(dt, R (rifleman), { camYawRate, camPitchRate });  vm.render(renderer, camera)
//      vm.fov(baseFov) -> the FOV to use (slight zoom on the sights)
import * as THREE from 'three';
import { Kit, KITMAT, CAMO, COL } from './meshkit.js';
import { buildWeaponModel, buildItemModel, setLawReticle } from './weaponmodels.js';
import { WEAPONS } from './weapons.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), sstep = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), ZERO6 = [0, 0, 0, 0, 0, 0];
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = V3(), _w = V3(), _a = V3(), _b = V3(), _m = new THREE.Matrix4();

// ------------------------------------------------------------------------------------------------ placements (camera space)
// [x, y, z, pitch, yaw, roll] of the weapon frame (rear sight) relative to the eye
const HIP = { rifle: [0.115, -0.13, -0.2, 0.02, 0.06, 0.0], gl: [0.09, -0.085, -0.27, 0.04, 0.08, -0.1], mg: [0.14, -0.16, -0.22, 0.05, 0.06, 0.0], pistol: [0.06, -0.15, -0.36, 0.0, 0.035, 0], law: [0.11, -0.03, -0.03, 0.0, 0.03, 0] };
const SPRINT = { rifle: [0.03, -0.24, -0.26, 0.45, 0.95, -0.55], gl: [0.03, -0.24, -0.26, 0.45, 0.95, -0.55], mg: [0.1, -0.32, -0.2, 0.3, 1.0, -0.5], pistol: [0.12, -0.3, -0.22, -1.0, 0.1, 0], law: [0.16, -0.12, 0.02, 0.15, 0.1, 0.05] };
const PRONE = { rifle: [0.07, -0.085, -0.15, 0.0, 0.04, 0], gl: [0.07, -0.085, -0.15, 0, 0.04, 0], mg: [0.08, -0.12, -0.16, 0.0, 0.03, 0], pistol: [0.05, -0.12, -0.36, 0, 0.03, 0], law: [0.1, -0.03, -0.03, 0, 0.03, 0] };
const SHOULDER = { R: V3(0.19, -0.24, 0.16), L: V3(-0.19, -0.25, 0.14) };
const UPPER = 0.31, FORE = 0.28;

// ------------------------------------------------------------------------------------------------ action tracks
// keyframes [p, { w: weapon offset [dx,dy,dz, rx,ry,rz] (camera space, added to the base placement),
//   L / R: hand target: anchor name on the weapon ('fore', 'magwell', ...), or { c: [x,y,z] } camera space, or 'grip',
//   Lr / Rr: extra hand rotation [rx,ry,rz], mag: 'gun' | 'out' | 'L' | 'none' (where the magazine shows), magOff [x,y,z],
//   part values: charge, fa, cover, glOpen, slide, law, lawSights, barrelOff [x,y,z], barrelVis }]
// p are the fractions of weapons.js WEAPONS[key].actions[name].keys, so the visuals and the state change line up.
const POUCH = [-0.13, -0.5, -0.12], POUCH_R = [0.14, -0.5, -0.12], CHEST = [-0.05, -0.28, -0.25], DROP = [0.0, -0.75, -0.2];
const T = {
  M16A1: {
    speed: [[0, {}], [0.08, { w: [-0.07, 0.07, -0.08, 0.28, 0.38, -0.6], L: 'magBottom' }], [0.12, { mag: 'out', magOff: [0, -0.05, 0] }], [0.2, { mag: 'none', L: { c: [-0.08, -0.32, -0.3] } }],
      [0.35, { L: { c: POUCH } }], [0.55, { mag: 'L', L: { c: POUCH } }], [0.68, { L: { c: [-0.02, -0.35, -0.32] } }], [0.75, { L: 'magwell', mag: 'L' }], [0.77, { mag: 'gun' }],
      [0.86, { L: 'boltCatch', w: [-0.04, 0.05, 0.02, 0.15, 0.25, -0.4] }], [0.92, { L: 'boltCatch' }], [1, { w: [0, 0, 0, 0, 0, 0], L: 'fore' }]],
    tactical: [[0, {}], [0.06, { w: [-0.07, 0.07, -0.08, 0.28, 0.38, -0.6], L: 'magBottom' }], [0.1, { mag: 'out', magOff: [0, -0.04, 0] }], [0.14, { mag: 'L', L: { c: [-0.05, -0.3, -0.3] } }],
      [0.25, { L: { c: [-0.1, -0.42, -0.2] } }], [0.42, { L: { c: POUCH }, mag: 'none' }], [0.6, { L: { c: POUCH }, mag: 'L' }], [0.72, { L: { c: [-0.02, -0.35, -0.32] } }], [0.8, { L: 'magwell' }], [0.82, { mag: 'gun' }],
      [0.88, { L: 'boltCatch' }], [0.94, { L: 'boltCatch' }], [1, { w: [0, 0, 0, 0, 0, 0], L: 'fore' }]],
    charge: [[0, {}], [0.15, { R: 'charging', w: [0, 0.02, 0.02, 0.12, -0.05, -0.1] }], [0.25, { R: 'charging', charge: 0 }], [0.45, { charge: 1 }], [0.6, { charge: 1 }], [0.65, { charge: 0 }], [0.85, { R: 'grip' }], [1, { w: [0, 0, 0, 0, 0, 0] }]],
    boltRelease: [[0, {}], [0.4, { L: 'boltCatch', w: [0, 0.01, 0, 0.05, 0.05, -0.2] }], [0.55, { L: 'boltCatch' }], [1, { L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    fa: [[0, {}], [0.4, { R: 'fa', fa: 0 }], [0.5, { fa: 1 }], [0.6, { fa: 0 }], [1, { R: 'grip' }]],
    ia: [[0, {}], [0.06, { L: 'magBottom', w: [0, 0.02, 0, 0.1, 0.05, -0.3] }], [0.12, { L: 'magBottom', w: [0, 0.03, 0, 0.1, 0.05, -0.3] }], [0.14, { w: [0, 0.01, 0, 0.1, 0.05, -0.3] }],
      [0.28, { R: 'charging', L: 'fore' }], [0.38, { charge: 0 }], [0.48, { charge: 1 }], [0.62, { charge: 1, w: [-0.02, 0.03, 0, 0.1, 0.25, -0.5] }], [0.7, { charge: 0 }], [0.8, { R: 'fa', fa: 0, w: [0, 0, 0, 0.05, 0, -0.1] }], [0.85, { fa: 1 }], [0.9, { fa: 0 }], [1, { R: 'grip', w: [0, 0, 0, 0, 0, 0] }]],
    remedialStuck: [[0, {}], [0.08, { L: 'magBottom', w: [0, 0.05, 0.05, 0.4, 0.2, -0.9] }], [0.1, { mag: 'out' }], [0.12, { mag: 'L', L: { c: [-0.2, -0.4, -0.2] } }], [0.2, { R: 'charging', charge: 1 }], [0.25, { L: { c: [-0.15, -0.45, -0.25] }, mag: 'none' }],
      [0.35, { L: { c: [-0.06, 0.02, -0.75] } }], [0.75, { L: { c: [-0.06, 0.02, -0.75] } }], [0.8, { L: { c: POUCH }, mag: 'L' }], [0.85, { L: 'magwell' }], [0.86, { mag: 'gun' }], [0.95, { charge: 0, R: 'charging' }], [1, { R: 'grip', L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    remedialDouble: [[0, {}], [0.08, { R: 'charging', w: [0, 0.03, 0.02, 0.2, 0.1, -0.5] }], [0.12, { charge: 1 }], [0.2, { R: 'grip', charge: 0 }], [0.25, { L: 'magBottom', mag: 'out', magOff: [0, -0.06, 0] }], [0.3, { mag: 'L', L: { c: [-0.15, -0.4, -0.25] } }],
      [0.4, { R: 'charging', charge: 1 }], [0.47, { charge: 0 }], [0.55, { charge: 1 }], [0.62, { charge: 0, R: 'grip' }], [0.7, { L: 'magwell' }], [0.72, { mag: 'gun' }], [0.85, { R: 'charging', charge: 1 }], [0.92, { charge: 0 }], [1, { R: 'grip', L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    checkMag: [[0, {}], [0.15, { L: 'magBottom', w: [0, 0.02, 0, 0.1, 0.1, -0.4] }], [0.22, { mag: 'L', L: { c: [-0.07, -0.18, -0.32] }, Lr: [0.3, 0.6, 0.4] }], [0.7, { L: { c: [-0.07, -0.18, -0.32] } }], [0.78, { L: 'magwell' }], [0.8, { mag: 'gun' }], [1, { L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    checkChamber: [[0, {}], [0.2, { L: 'charging', w: [-0.02, 0.03, 0.02, 0.15, 0.2, -0.55] }], [0.35, { charge: 0.35 }], [0.7, { charge: 0.35 }], [0.82, { charge: 0 }], [0.88, { R: 'fa', fa: 1 }], [0.94, { fa: 0 }], [1, { L: 'fore', R: 'grip', w: [0, 0, 0, 0, 0, 0] }]],
    inspect: [[0, {}], [0.25, { w: [-0.05, 0.05, -0.08, 0.2, 0.9, -0.5] }], [0.6, { w: [-0.05, 0.03, -0.1, 0.1, 0.5, 0.4] }], [1, { w: [0, 0, 0, 0, 0, 0] }]],
  },
  M203: {
    reload: [[0, {}], [0.1, { L: 'glFore', w: [0, 0.02, 0, 0.1, 0.05, -0.3] }], [0.15, { glOpen: 0 }], [0.3, { glOpen: 1 }], [0.45, { L: { c: [-0.08, -0.3, -0.3] } }], [0.55, { L: { c: POUCH } }], [0.62, { L: { c: POUCH }, round: true }],
      [0.72, { L: 'glBreech' }], [0.76, { L: 'glBreech', round: false }], [0.82, { L: 'glFore' }], [0.9, { glOpen: 0 }], [1, { L: 'magGrip', w: [0, 0, 0, 0, 0, 0] }]],
    open: [[0, {}], [0.4, { L: 'glFore' }], [0.8, { glOpen: 1 }], [1, { glOpen: 1, L: 'magGrip' }]],
    ia: [[0, {}], [0.2, { L: 'glFore' }], [0.3, { glOpen: 0 }], [0.45, { glOpen: 1 }], [0.7, { glOpen: 1 }], [0.85, { glOpen: 0 }], [1, { L: 'magGrip' }]],
    inspect: [[0, {}], [0.3, { w: [-0.05, 0.05, -0.08, 0.2, 0.9, -0.5] }], [1, { w: [0, 0, 0, 0, 0, 0] }]],
  },
  M60: {
    reload: [[0, {}], [0.06, { L: 'cover', w: [0, 0.05, -0.05, 0.25, 0.15, 0.25] }], [0.1, { cover: 0 }], [0.18, { cover: 1 }], [0.25, { L: 'beltEntry', belt: 0 }], [0.32, { L: { c: [-0.25, -0.3, -0.25] } }],
      [0.45, { L: { c: [-0.15, -0.5, -0.1] } }], [0.55, { L: { c: [-0.2, -0.25, -0.35] }, belt: 1 }], [0.6, { L: 'beltEntry' }], [0.68, { L: 'cover' }], [0.75, { cover: 0 }], [0.82, { R: 'charging' }], [0.88, { charge: 1 }], [0.95, { charge: 0 }], [1, { R: 'grip', L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    charge: [[0, {}], [0.25, { R: 'charging', w: [0, 0.02, 0, 0.1, -0.05, -0.15] }], [0.35, { charge: 0 }], [0.55, { charge: 1 }], [0.7, { charge: 0 }], [1, { R: 'grip', w: [0, 0, 0, 0, 0, 0] }]],
    ia: [[0, {}], [0.2, { R: 'charging', w: [0, 0.02, 0, 0.1, -0.05, -0.15] }], [0.3, { charge: 0 }], [0.45, { charge: 1 }], [0.6, { charge: 0 }], [1, { R: 'grip', w: [0, 0, 0, 0, 0, 0] }]],
    remedialStuck: [[0, {}], [0.1, { L: 'cover', cover: 0, w: [0, 0.05, -0.05, 0.25, 0.15, 0.25] }], [0.15, { cover: 1 }], [0.3, { L: 'beltEntry', belt: 0 }], [0.5, { L: { c: [-0.06, 0.0, -0.7] } }], [0.7, { L: { c: [-0.06, 0.0, -0.7] } }], [0.8, { L: 'beltEntry', belt: 1 }], [0.85, { L: 'cover', cover: 0 }], [0.95, { R: 'charging', charge: 1 }], [1, { charge: 0, R: 'grip', L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    barrel: [[0, {}], [0.1, { L: 'barrelLatch', w: [0.05, 0.05, -0.1, 0.1, 0.4, 0.3] }], [0.15, { L: 'barrelLatch' }], [0.22, { L: 'handle' }], [0.3, { barrelOff: [0, 0, 0] }], [0.42, { barrelOff: [-0.05, -0.1, -0.35] }], [0.48, { barrelOff: [-0.3, -0.5, -0.2], barrelVis: false, L: { c: [-0.3, -0.4, -0.3] } }],
      [0.5, { L: { c: [-0.3, -0.45, -0.1] } }], [0.58, { L: { c: [-0.2, -0.3, -0.4] }, barrelOff: [-0.05, -0.1, -0.4], barrelVis: true }], [0.7, { barrelOff: [0, 0, 0], L: 'handle' }], [0.8, { L: 'barrelLatch' }], [0.86, { L: 'barrelLatch' }], [1, { L: 'fore', barrelOff: null, w: [0, 0, 0, 0, 0, 0] }]],
    breakBelt: [[0, {}], [0.3, { L: 'beltEntry' }], [0.6, { L: { c: [-0.3, -0.3, -0.25] }, belt: 0 }], [1, { L: 'fore' }]],
    checkChamber: [[0, {}], [0.15, { L: 'cover', w: [0, 0.04, -0.04, 0.2, 0.1, 0.2] }], [0.22, { cover: 0 }], [0.32, { cover: 1 }], [0.7, { cover: 1 }], [0.85, { cover: 0 }], [1, { L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    inspect: [[0, {}], [0.3, { w: [-0.05, 0.08, -0.1, 0.15, 0.7, 0.4] }], [1, { w: [0, 0, 0, 0, 0, 0] }]],
  },
  M72A2: {
    extend: [[0, { w: [-0.1, -0.15, -0.25, 0, -1.2, 0], law: 0, lawSights: 0 }], [0.15, { L: 'fore', R: 'grip' }], [0.35, { R: 'rearCap' }], [0.6, { law: 1 }], [0.75, { lawSights: 0 }], [0.85, { lawSights: 1 }], [1, { R: 'grip', w: [0, 0, 0, 0, 0, 0] }]],
    arm: [[0, {}], [0.4, { R: 'grip', w: [0, 0.01, 0, 0.05, 0, 0] }], [0.6, { armed: true }], [1, { w: [0, 0, 0, 0, 0, 0] }]],
    collapse: [[0, {}], [0.2, { w: [-0.1, -0.15, -0.25, 0, -1.2, 0] }], [0.3, { lawSights: 0 }], [0.6, { law: 0 }], [1, { law: 0, lawSights: 0 }]],
    ia: [[0, {}], [0.5, { R: 'grip' }], [1, {}]],
    inspect: [[0, {}], [0.4, { w: [-0.05, 0.03, -0.1, 0.1, 0.5, 0.2] }], [1, { w: [0, 0, 0, 0, 0, 0] }]],
  },
  M1911A1: {
    speed: [[0, {}], [0.1, { w: [0, 0.03, 0.05, 0.25, 0.05, 0.2], L: { c: [-0.08, -0.25, -0.35] } }], [0.14, { mag: 'out', magOff: [0, -0.1, 0.02] }], [0.2, { mag: 'none' }], [0.4, { L: { c: POUCH } }], [0.55, { mag: 'L', L: { c: POUCH } }], [0.7, { L: 'magwell' }], [0.75, { mag: 'gun' }], [0.86, { R: 'grip', L: 'slideStop' }], [0.9, { slide: 0 }], [1, { L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    tactical: [[0, {}], [0.1, { w: [0, 0.03, 0.05, 0.25, 0.05, 0.2], L: 'magwell' }], [0.12, { mag: 'L' }], [0.3, { L: { c: [-0.1, -0.4, -0.2] } }], [0.45, { L: { c: POUCH }, mag: 'none' }], [0.6, { L: { c: POUCH }, mag: 'L' }], [0.8, { L: 'magwell' }], [0.82, { mag: 'gun' }], [0.92, { slide: 0 }], [1, { L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    charge: [[0, {}], [0.3, { L: 'slideRear', w: [0, 0.02, 0.05, 0.15, 0, 0.3] }], [0.4, { slide: 0 }], [0.55, { slide: 1 }], [0.7, { slide: 0 }], [1, { L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    ia: [[0, {}], [0.12, { L: 'magwell', w: [0, 0.02, 0.05, 0.15, 0, 0.3] }], [0.2, { L: 'magwell' }], [0.4, { L: 'slideRear' }], [0.5, { slide: 0 }], [0.62, { slide: 1 }], [0.75, { slide: 0 }], [1, { L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    checkMag: [[0, {}], [0.2, { L: 'magwell', w: [0, 0.03, 0.05, 0.25, 0, 0.3] }], [0.27, { mag: 'L', L: { c: [-0.06, -0.15, -0.3] }, Lr: [0.3, 0.6, 0.4] }], [0.68, { L: { c: [-0.06, -0.15, -0.3] } }], [0.75, { L: 'magwell' }], [0.77, { mag: 'gun' }], [1, { L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    checkChamber: [[0, {}], [0.25, { L: 'slideRear', w: [0, 0.02, 0.05, 0.15, 0.2, 0.4] }], [0.35, { slide: 0 }], [0.5, { slide: 0.35 }], [0.68, { slide: 0.35 }], [0.78, { slide: 0 }], [1, { L: 'fore', w: [0, 0, 0, 0, 0, 0] }]],
    inspect: [[0, {}], [0.3, { w: [0.0, 0.05, 0.1, 0.2, 1.1, 0.6] }], [0.65, { w: [0.0, 0.05, 0.1, 0.1, -0.6, -0.5] }], [1, { w: [0, 0, 0, 0, 0, 0] }]],
  },
};
// evaluate a track at p: merge keyframes up to p, interpolate numeric targets between the two around p
function evalTrack(track, p) {
  const out = {}; let k0 = track[0], k1 = track[track.length - 1];
  for (let i = 0; i < track.length; i++) { if (track[i][0] <= p) { Object.assign(out, track[i][1]); k0 = track[i]; } else { k1 = track[i]; break; } }
  // interpolation targets: the next keyframe's values for the same keys
  const t = k1[0] > k0[0] ? sstep(clamp((p - k0[0]) / (k1[0] - k0[0]), 0, 1)) : 1;
  return { s: out, next: k1[1], t };
}

// ------------------------------------------------------------------------------------------------ arms and hands
function sleeveMat() { return KITMAT.lambert(); }
function buildHand(side) {   // a fist around a ~32 mm grip; grip axis = local y, grip centre at the origin, wrist toward +z
  const s = side === 'L' ? -1 : 1, k = new Kit(), skin = CAMO.vary(COL.skin, 0.05, 0.02), knuckle = 0xbb8c68, crease = 0x9c6c4c, nail = 0xd8b8a0;
  k.box(0.024, 0.086, 0.07, skin, [s * 0.031, 0, 0.024]);                                                       // palm (on the near side of the grip)
  k.box(0.012, 0.082, 0.06, skin, [s * 0.046, 0, 0.03]);                                                        // back of the hand
  for (let i = 0; i < 4; i++) {
    const y = 0.031 - i * 0.021, l = [0.95, 1, 0.97, 0.82][i];
    k.box(0.016, 0.018, 0.016, knuckle, [s * 0.046, y, -0.012]);                                                // knuckle
    k.box(0.046 * l, 0.017, 0.019, skin, [s * 0.012, y, -0.027]);                                             // proximal phalanx across the front of the grip
    k.box(0.019, 0.016, 0.026 * l, skin, [s * -0.022, y, -0.012]);                                            // middle phalanx round the far side
    k.box(0.006, 0.013, 0.012, nail, [s * -0.032, y, 0.004 * l]);                                             // nail
    if (i < 3) k.box(0.05, 0.003, 0.02, crease, [s * 0.012, y - 0.0105, -0.027]);                             // the gap between fingers
  }
  k.box(0.022, 0.024, 0.04, skin, [s * 0.026, 0.05, 0.018], [0, 0, 0]);                                        // thumb, base
  k.box(0.02, 0.02, 0.034, skin, [s * -0.004, 0.056, -0.004], [0, s * 0.35, 0]);                               // thumb over the top
  k.box(0.008, 0.012, 0.012, nail, [s * -0.018, 0.064, -0.012]);
  k.box(0.032, 0.058, 0.05, skin, [s * 0.036, 0.0, 0.072]);                                                    // heel of the hand / wrist
  const m = k.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), 'hand' + side);
  const g = new THREE.Group(); g.add(m); g.userData.wrist = V3(s * 0.036, 0, 0.097); return g;
}
function buildSegment(len, r0, r1, side, watch) {   // along -y from the joint; sleeve camo
  const k = new Kit(), cloth = CAMO.erdl(0.06, side === 'L' ? 3 : 5);
  k.cyl(r1, r0, len, cloth, [0, -len / 2, 0], 'y', 8, null, false, 'local');
  if (watch) { k.cyl(r1 + 0.004, r1 + 0.004, 0.02, 0x23241c, [0, -len + 0.035, 0], 'y', 8); k.box(0.032, 0.008, 0.036, 0x101010, [0, -len + 0.035, -(r1 + 0.006)], [0, 0, 0]); k.box(0.026, 0.004, 0.03, 0xd8d4c0, [0, -len + 0.035, -(r1 + 0.0105)]); }
  else k.cyl(r1 + 0.003, r1 + 0.003, 0.025, cloth, [0, -len + 0.012, 0], 'y', 8, null, false, 'local');   // cuff
  const g = new THREE.Group(); g.add(k.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }))); return g;
}
const DOWN = V3(0, -1, 0);
export function solveArm(arm, wrist) {   // all in viewmodel (camera) space; arm = { up, fo, sh }  (exported: throwvm.js, ngc/infdepth)
  const S = arm.sh, d = _v.subVectors(wrist, S); let L = clamp(d.length(), 0.1, UPPER + FORE - 0.003); d.normalize();
  const x = (UPPER * UPPER - FORE * FORE + L * L) / (2 * L), h = Math.sqrt(Math.max(0, UPPER * UPPER - x * x));
  const pole = _w.copy(arm.pole); pole.addScaledVector(d, -pole.dot(d)).normalize();
  const E = _a.copy(S).addScaledVector(d, x).addScaledVector(pole, h);
  arm.up.position.copy(S); arm.up.quaternion.setFromUnitVectors(DOWN, _b.subVectors(E, S).normalize());
  arm.fo.position.copy(E); arm.fo.quaternion.setFromUnitVectors(DOWN, _b.subVectors(wrist, E).normalize());
  // spin the forearm so the watch face shows on top (look along the arm, roll toward -z of the camera)
}

// ------------------------------------------------------------------------------------------------ the viewmodel
export function createViewmodel(o = {}) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(60, 1, 0.005, 20);
  scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x4e4b38, 1.05));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.25); sun.position.set(0.5, 1, 0.4); scene.add(sun);
  const root = new THREE.Group(); scene.add(root);
  const arms = {};
  for (const sd of ['L', 'R']) {
    const up = buildSegment(UPPER, 0.052, 0.045, sd, false), fo = buildSegment(FORE, 0.045, 0.036, sd, sd === 'L'), hand = buildHand(sd);
    root.add(up, fo, hand);
    arms[sd] = { up, fo, hand, sh: SHOULDER[sd].clone(), pole: sd === 'R' ? V3(0.7, -1, 0.3) : V3(-0.35, -1, 0.1) };
  }
  const handMag = new THREE.Group(); arms.L.hand.add(handMag);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flash = new THREE.Group(); { for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.03), flashMat); p.rotation.z = i * Math.PI / 3; p.position.z = -0.03; flash.add(p); } const c = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05).rotateY(Math.PI / 2), flashMat); c.position.z = -0.04; flash.add(c); }
  flash.visible = false; root.add(flash);
  const brass = [];   // { mesh, v, w, t }
  const vm = {
    scene, camera: cam, root, arms, model: null, key: null, cls: 'rifle', t: 0,
    kick: { z: 0, zv: 0, p: 0, pv: 0 }, lag: { x: 0, y: 0, vx: 0, vy: 0 }, flashT: 0, boltT: 0, swapY: 0, adsE: 0, lastYaw: null, lastPitch: null,
    state: {}, debugHands: false,
  };
  vm.setWeapon = function (key, gl) {
    const k = key + (gl ? '/M203' : '');
    if (vm.key === k) return;
    if (vm.model) root.remove(vm.model.group);
    vm.model = buildWeaponModel(key === 'M16A1' && gl ? 'M16A1/M203' : key, { detail: 'high' });
    root.add(vm.model.group); vm.key = k;
    if (key === 'M72A2' && vm.lawLines) setLawReticle(vm.model, vm.lawLines);
    handMag.clear(); vm.handRound = null;
    const fit = WEAPONS[key].fit; if (fit && fit !== '40mm' && fit !== 'M60-belt') { const m = buildItemModel(fit); m.position.set(key === 'M1911A1' ? 0.0 : 0.0, 0.03, 0); handMag.add(m); }
    if (gl) { vm.handRound = buildItemModel('40mm'); vm.handRound.rotation.x = Math.PI / 2; handMag.add(vm.handRound); }
    handMag.visible = false;
  };

  // weapon placement (camera space) for the current state
  const basePos = V3(), baseQ = new THREE.Quaternion();
  function place(R, S, W, cls, dt) {
    const key = W.key, gl = cls === 'gl', ads = S.ads, adsE = sstep(ads), prone = S.stance === 'prone' && S.stanceT >= 1 ? 1 : 0;
    const hip = (prone ? PRONE : HIP)[cls] || HIP.rifle, spr = SPRINT[cls] || SPRINT.rifle, low = sstep(S.lower);
    // ADS: rear sight eyeRelief in front of the eye; M203: through the quadrant sight, raised by its elevation
    const er = vm.model.sight.eyeRelief;
    let ap = [0, 0, -er, 0, 0, 0];
    if (gl && vm.model.sight.quad) { const qd = vm.model.sight.quad, el = W.sightElevation(); ap = [-qd.rear[0], -qd.rear[1], -er - 0.02, el, 0, 0]; }
    if (cls === 'law') ap = [0, 0, -er, 0, 0, 0];
    const P = _P;
    for (let i = 0; i < 6; i++) P[i] = lerp(lerp(hip[i], ap[i], adsE), spr[i], low);
    // the gun follows the aim relative to the camera (deadzone, sway, recoil, free look) - on the sights the camera IS the aim
    const dyaw = wrapA(S.aimYaw - S.camYaw), dp = S.aimPitch - S.camPitch;
    // inertia: turning drags the gun behind (a spring on the camera's angular rate)
    if (vm.lastYaw !== null && dt > 0) {
      const ry = wrapA(S.camYaw - vm.lastYaw) / dt, rp = (S.camPitch - vm.lastPitch) / dt, k = 140, c = 2 * Math.sqrt(k), m = (1 - 0.7 * adsE) * (cls === 'mg' ? 1.6 : cls === 'pistol' ? 0.7 : 1);
      vm.lag.vx += (k * (clamp(-ry * 0.012, -0.05, 0.05) * m - vm.lag.x) - c * vm.lag.vx) * dt; vm.lag.vy += (k * (clamp(-rp * 0.012, -0.05, 0.05) * m - vm.lag.y) - c * vm.lag.vy) * dt;
      vm.lag.x += vm.lag.vx * dt; vm.lag.y += vm.lag.vy * dt;
    }
    vm.lastYaw = S.camYaw; vm.lastPitch = S.camPitch;
    // bob (less on the sights), breathing drift at the hip
    const bobK = (1 - 0.85 * adsE) * (1 - 0.5 * prone), ph = S.gaitPhase, gm = S.gait === 'idle' ? 0 : S.gait === 'sprint' ? 2.2 : S.gait === 'run' ? 1.4 : 0.8;
    P[0] += Math.sin(ph) * 0.006 * gm * bobK + vm.lag.x * 0.4; P[1] += -Math.abs(Math.cos(ph)) * 0.008 * gm * bobK + vm.lag.y * 0.4 + Math.sin(S.breathPhase) * 0.0012 * (1 - adsE) * (0.5 + S.breathDepth);
    P[4] += dyaw + vm.lag.x * 1.2 + Math.sin(ph) * 0.01 * gm * bobK; P[3] += dp + vm.lag.y * 1.2;
    P[5] += -vm.lag.x * 0.8 + Math.sin(ph) * 0.015 * gm * bobK;
    // lean: the camera rolls; cant the gun a touch less than the head (shooters keep the sights near level)
    P[5] += S.lean * 0.05 * (1 - adsE);
    // recoil kick (visual): back and up
    P[2] += vm.kick.z; P[3] += vm.kick.p;
    // weapon swap: down and out of view
    P[1] -= vm.swapY * 0.4; P[3] -= vm.swapY * 1.0;
    basePos.set(P[0], P[1], P[2]); baseQ.setFromEuler(_e.set(P[3], P[4], P[5], 'YXZ'));
    return P;
  }
  const wrapA = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

  // hand target: an anchor on the weapon (+ the hand's preset orientation), or a point in camera space
  const HANDROT = {   // hand orientation at each anchor, weapon frame (Euler XYZ): grip axis = hand y
    grip: [-0.3, 0, 0], fore: [Math.PI / 2, 0, 0], magBottom: [0, 0, 0], magwell: [0.1, 0, 0], charging: [0, 0, 0], boltCatch: [0, 0, 0.3], fa: [Math.PI / 2, 0, 0],
    stockTop: [Math.PI / 2, 0, Math.PI], cover: [0, 0, 0], beltEntry: [0, 0, 0.5], barrelLatch: [0, 0, 0.3], handle: [Math.PI / 2, 0, 0], glFore: [Math.PI / 2, 0, Math.PI / 2], glBreech: [Math.PI / 2, 0, Math.PI / 2],
    glTrigger: [-0.2, 0, 0], magGrip: [0, 0, 0], rearCap: [Math.PI / 2, 0, 0], slideRear: [Math.PI / 2, 0, 0], slideStop: [0, 0, 0.3],
  };
  const PISTOL_ROT = { grip: [-0.3, 0, 0], fore: [-0.3, 0, 0.0] };
  const LAW_ROT = { grip: [Math.PI / 2, 0, 0], fore: [Math.PI / 2, 0, 0] };
  function handTarget(side, spec, rotX, outPos, outQ) {
    const M = vm.model, g = M.group;
    if (typeof spec === 'string') {
      const a = M.anchors[spec] || M.anchors.grip;
      outPos.set(a[0], a[1], a[2]).applyQuaternion(g.quaternion).add(g.position);
      const r = (vm.cls === 'pistol' && PISTOL_ROT[spec]) || (vm.cls === 'law' && LAW_ROT[spec]) || HANDROT[spec] || [0, 0, 0];
      _q.setFromEuler(_e.set(r[0], r[1], r[2] * (side === 'L' ? -1 : 1), 'XYZ'));
      outQ.copy(g.quaternion).multiply(_q);
    } else {
      outPos.set(spec.c[0], spec.c[1], spec.c[2]);
      outQ.setFromEuler(_e.set(0.4, 0, side === 'L' ? -0.4 : 0.4, 'XYZ'));
    }
    if (rotX) { _q.setFromEuler(_e.set(rotX[0], rotX[1], rotX[2], 'XYZ')); outQ.multiply(_q); }
  }
  const _hp = V3(), _hq = new THREE.Quaternion(), _np = V3(), _nq = new THREE.Quaternion(), _wr = V3(), _P = [0, 0, 0, 0, 0, 0];

  // ---------------------------------------------------------------- per frame
  vm.update = function (dt, R) {
    const S = R.soldier, carrier = R.carrier, W = R.cur; vm.t += dt;
    if (!carrier) { root.visible = false; return; }
    root.visible = true;
    const glMode = R.glMode && !!carrier.gl;
    vm.setWeapon(carrier.key, !!carrier.gl);
    vm.cls = glMode ? 'gl' : carrier.def.cls;
    const M = vm.model, g = M.group;
    // swap animation (holster then draw)
    const sw = R.swap; vm.swapY = sw ? (sw.phase === 'in' ? 1 - clamp((sw.t - sw.outDur) / Math.max(0.01, sw.dur - sw.outDur), 0, 1) : clamp(sw.t / Math.max(0.01, sw.outDur), 0, 1)) : Math.max(0, vm.swapY - dt * 4);
    // shots: kick, flash, bolt cycle, brass
    for (const e of R.events) {
      if (e.e !== 'wpn') continue; const ev = e.ev;
      if (ev.e === 'shot') {
        const k = W.def.cls === 'mg' ? 0.6 : W.def.cls === 'pistol' ? 1.4 : W.def.cls === 'gl' ? 1.6 : W.def.cls === 'law' ? 0.3 : 1;
        vm.kick.zv += 0.9 * k * (1 - 0.4 * (S.bipod ? 1 : 0)); vm.kick.pv += 1.4 * k * (W.def.cls === 'pistol' ? 2 : 1);
        vm.flashT = W.def.cls === 'gl' ? 0.02 : 0.045; vm.boltT = 0.05;
        if (W.def.cls !== 'gl' && W.def.cls !== 'law') spawnBrass(W.def.cls === 'mg' ? 'case762' : W.def.cls === 'pistol' ? 'case45' : 'case556');
      }
    }
    // kick spring
    vm.kick.zv += (-260 * vm.kick.z - 26 * vm.kick.zv) * dt; vm.kick.z += vm.kick.zv * dt * 0.04;
    vm.kick.pv += (-220 * vm.kick.p - 24 * vm.kick.pv) * dt; vm.kick.p += vm.kick.pv * dt * 0.04;
    vm.flashT -= dt; vm.boltT -= dt;
    // base placement + action track
    const P = place(R, S, W, vm.cls, dt);
    const act = W.act, track = act && (T[W.key] && T[W.key][act.name]);
    let tr = null;
    if (track) { tr = evalTrack(track, clamp(act.t / act.dur, 0, 1)); }
    const st = tr ? tr.s : {}, nx = tr ? tr.next : {}, tt = tr ? tr.t : 0;
    const num = (k, d) => { const a = st[k] ?? d, b = nx[k] ?? a; return typeof a === 'number' && typeof b === 'number' ? lerp(a, b, tt) : a; };
    const w0 = st.w || ZERO6, w1 = nx.w || w0, wOff = w0.map((x, i) => lerp(x, w1[i], tt));
    g.position.copy(basePos).add(_v.set(wOff[0], wOff[1], wOff[2]));
    g.quaternion.copy(baseQ).multiply(_q.setFromEuler(_e.set(wOff[3], wOff[4], wOff[5], 'YXZ')));
    // weapon parts from the weapon state (+ the track's overrides)
    const ws = vm.state; for (const k in ws) delete ws[k];
    const locked = W.bolt === 'locked' || W.bolt === 'back';
    ws.charge = num('charge', 0); ws.bolt = vm.boltT > 0 ? 1 : locked ? 1 : 0; ws.locked = W.bolt === 'locked'; ws.dustCover = W.roundsFired > 0 || ws.charge > 0 || locked;
    ws.fa = num('fa', 0); ws.selector = carrier.mode; ws.trigger = R.soldier && R._trig ? 1 : 0;
    const magWhere = act ? (st.mag ?? (W.mag ? 'gun' : 'none')) : (carrier.mag ? 'gun' : 'none');
    ws.mag = magWhere === 'gun' || magWhere === 'out' ? 'in' : 'none'; ws.magOffset = magWhere === 'out' ? (st.magOff || [0, -0.04, 0]) : null;
    handMag.visible = magWhere === 'L'; if (vm.handRound) vm.handRound.visible = !!st.round;
    if (W.gl === undefined && carrier.gl) {}
    ws.glOpen = carrier.gl ? (act && W === carrier.gl ? num('glOpen', carrier.gl.bolt === 'open' ? 1 : 0) : carrier.gl.bolt === 'open' ? 1 : 0) : 0;
    ws.quad = carrier.gl ? carrier.gl.sightElevation() : 0; ws.quadUp = glMode || S.ads < 0.5;
    ws.cover = num('cover', 0); ws.leaf = carrier.key === 'M60' ? (carrier.sight > 0 ? 1 : 0) : 0; ws.leafSlide = carrier.key === 'M60' ? Math.max(0, carrier.sight - 1) * 0.0035 : 0;
    ws.bipod = S.bipod ? 1 : 0; ws.handle = S.ads > 0.3 ? 0 : 1; ws.heat = carrier.barrel ? carrier.barrel.temp : 20;
    ws.barrelOff = st.barrelOff ? st.barrelOff.map((v, i) => lerp(v, (nx.barrelOff || st.barrelOff)[i], tt)) : null; ws.barrelVisible = st.barrelVis !== false;
    ws.beltRounds = carrier.key === 'M60' ? (act && st.belt !== undefined ? (st.belt ? 12 : 0) : carrier.mag ? Math.min(12, carrier.mag.rounds) : 0) : 0; ws.time = vm.t; ws.beltSwing = 0.3 + S.speed * 0.3;
    if (carrier.key === 'M72A2') { const lw = carrier.law; ws.law = act ? num('law', lw === 'closed' ? 0 : 1) : lw === 'closed' ? 0 : 1; ws.lawSights = act ? num('lawSights', lw === 'closed' ? 0 : 1) : lw === 'closed' ? 0 : 1; ws.armed = lw === 'armed' || !!st.armed; }
    if (carrier.key === 'M1911A1') { ws.slide = act ? num('slide', carrier.bolt === 'locked' ? 1 : 0) : (vm.boltT > 0 ? 1 : carrier.bolt === 'locked' ? 1 : 0); ws.hammer = carrier.chamber ? 1 : 0; }
    M.setState(ws);
    g.updateMatrixWorld(true);
    // hands
    const cls = vm.cls;
    let defL = cls === 'gl' ? 'magGrip' : cls === 'mg' && (S.bipod || S.stance === 'prone') ? 'stockTop' : 'fore', defR = cls === 'gl' ? 'glTrigger' : 'grip';
    if (cls === 'law' && carrier.law === 'closed' && !act) { defL = 'fore'; defR = 'grip'; }
    for (const sd of ['L', 'R']) {
      const a = arms[sd], spec = st[sd] ?? (sd === 'L' ? defL : defR), nspec = nx[sd] ?? spec, rot = st[sd + 'r'];
      handTarget(sd, spec === 'grip' && sd === 'L' ? defL : spec, rot, _hp, _hq);
      if (nspec !== spec && tr) { handTarget(sd, nspec, nx[sd + 'r'] || rot, _np, _nq); _hp.lerp(_np, tt); _hq.slerp(_nq, tt); }
      a.hand.position.copy(_hp); a.hand.quaternion.copy(_hq);
      a.hand.updateMatrix();
      const wr = _b.copy(a.hand.userData.wrist).applyMatrix4(a.hand.matrix);
      solveArm(a, _wr.copy(wr));
    }
    // muzzle flash
    flash.visible = vm.flashT > 0 && cls !== 'law';
    if (flash.visible) { const mz = M.anchors[cls === 'gl' ? 'glMuzzle' : 'muzzle']; flash.position.set(mz[0], mz[1], mz[2]).applyQuaternion(g.quaternion).add(g.position); flash.quaternion.copy(g.quaternion); flash.rotateZ(Math.random() * 3); const s = cls === 'mg' ? 1.6 : cls === 'pistol' ? 0.8 : 1; flash.scale.set(s, s, s * (0.8 + Math.random() * 0.5)); }
    // brass
    for (let i = brass.length - 1; i >= 0; i--) { const b = brass[i]; b.t += dt; b.v.y -= 9.8 * dt; b.mesh.position.addScaledVector(b.v, dt); b.mesh.rotation.x += b.w * dt; b.mesh.rotation.y += b.w * 0.7 * dt; if (b.t > 0.7) { root.remove(b.mesh); brass.splice(i, 1); } }
  };
  function spawnBrass(fit) {
    if (!vm.model.anchors.ejection) return;
    const g = vm.model.group, a = vm.model.anchors.ejection, m = buildItemModel(fit);
    m.position.set(a[0], a[1], a[2]).applyQuaternion(g.quaternion).add(g.position);
    const v = V3(1.6 + Math.random() * 0.6, 1.0 + Math.random() * 0.5, 0.3 + Math.random() * 0.4).applyQuaternion(g.quaternion);
    root.add(m); brass.push({ mesh: m, v, w: 20 + Math.random() * 20, t: 0 });
  }
  vm.fov = (base, ads) => base / (1 + 0.18 * sstep(ads));
  vm.render = function (renderer, worldCam) {
    cam.fov = worldCam.fov; cam.aspect = worldCam.aspect; cam.updateProjectionMatrix();
    if (vm.inspect) { cam.position.fromArray(vm.inspect.pos); cam.lookAt(vm.inspect.look[0], vm.inspect.look[1], vm.inspect.look[2]); } else { cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0); }   // debug: orbit the arms
    const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(scene, cam); renderer.autoClear = ac;
  };
  return vm;
}
