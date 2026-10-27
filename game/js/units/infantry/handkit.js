// RENDERKIT figures (ngc/depth-figures): hands, sleeves and faces built from smooth capsules / rounded boxes into a
// meshkit Kit. Used by the first-person viewmodel (closest thing on screen: fingers with three phalanges, knuckles,
// nails, the thumb, the palm and the heel of the hand, the wrist) and, cheaper, by the third-person soldier.
// Only called when RK.on('figures') (meshkit FIG); with ?rk=0 the classic box hands stay.
import * as THREE from 'three';
import { CAMO } from './meshkit.js';

export const SKIN_TONES = [0xc69a78, 0xb0805e, 0x8a5d40, 0x6b4630];
const NAIL = 0xe0c0ac;
// skin with a little life in it: per-vertex mottling, knuckles / fingertips warmer
export const skinPaint = (base, amt = 0.06) => CAMO.vary(base, amt, 0.018);

// a fingernail: a thin ellipsoid on the distal phalanx C -> D, on the side `out`, slightly proud of the skin
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _mm = new THREE.Matrix4();
function nail(k, C, D, out, r) {
  _y.set(D[0] - C[0], D[1] - C[1], D[2] - C[2]).normalize();             // along the finger
  _z.copy(out).addScaledVector(_y, -out.dot(_y)).normalize();             // the nail's normal
  _x.crossVectors(_y, _z);
  const q = new THREE.Quaternion().setFromRotationMatrix(_mm.makeBasis(_x, _y, _z));
  const c = [C[0] * 0.28 + D[0] * 0.72 + _z.x * r * 0.62, C[1] * 0.28 + D[1] * 0.72 + _z.y * r * 0.62, C[2] * 0.28 + D[2] * 0.72 + _z.z * r * 0.62];
  k.add(new THREE.SphereGeometry(1, 8, 5), NAIL, c, q, [r * 0.62, r * 0.55, r * 0.2]);
}

// ------------------------------------------------------------------------------------------------ first-person hand
// A fist round a grip: grip axis = hand y, grip centre at the origin, the wrist toward +z, the back of the hand on the
// +x side (s = 1 right hand, -1 left), the fingers round the front (-z) to the far side. gripR: the radius the hand
// closes on (pistol grip ~17 mm, handguard ~26 mm). trigger: the right index finger lies on the trigger (hand frame
// ~(0, 0.047, -0.038)) instead of curling round the grip.
// open: a relaxed, flat hand (swimming strokes, pressing on a wound) with the same wrist point, so the IK is unchanged.
export function fpHand(k, { side = 'R', gripR = 0.017, trigger = false, open = false, skin = SKIN_TONES[0], seg = 10 } = {}) {
  const s = side === 'L' ? -1 : 1, sk = skinPaint(skin), P = (x, y, z) => [s * x, y, z];
  const fingers = trigger ? [0.046, 0.021, -0.001, -0.022] : [0.031, 0.01, -0.011, -0.031];
  const scale = [0.96, 1.0, 0.95, 0.8], R0 = 0.0098;
  const rho0 = gripR + 0.023;           // the knuckle line, outside the grip by the hand's thickness
  const rho = gripR + 0.0085;           // the finger centreline once it wraps the grip
  const ang = (r, th) => [r * Math.cos(th), -r * Math.sin(th)];   // (x, z) round the grip axis
  for (let i = 0; i < 4; i++) {
    const y = fingers[i], f = scale[i], r0 = R0 * (i === 3 ? 0.88 : 1), lp = 0.044 * f, lm = 0.027 * f, ld = 0.021 * f;
    const th0 = 0.38, [mx, mz] = ang(rho0, th0);
    let A = [mx, y + 0.002, mz], B, C, D;
    if (open) {   // relaxed / flat: forward from the knuckles, a slight curl toward the palm, the fingers a little apart
      const sp = (1.5 - i) * 0.004;
      B = [mx - 0.006, y + sp, mz - lp]; C = [B[0] - lm * 0.22, y + sp * 1.4, B[2] - lm * 0.96]; D = [C[0] - ld * 0.42, y + sp * 1.6, C[2] - ld * 0.88];
    } else if (trigger && i === 0) {   // the trigger finger: straight forward along the side of the receiver, the pad on the trigger
      B = [0.018, y + 0.003, -0.046]; C = [-0.004, y + 0.002, -0.054]; D = [-0.014, y + 0.0, -0.04];
    } else {
      // walk round the grip: proximal phalanx from the knuckle to the PIP joint at length lp, then middle and distal
      let th = th0; for (let t = 0; t < 60; t++) { const [x, z] = ang(rho, th); if (Math.hypot(x - mx, z - mz) >= lp) break; th += 0.04; }
      const [bx, bz] = ang(rho, th); B = [bx, y, bz];
      const t2 = th + 2 * Math.asin(Math.min(1, lm / (2 * rho))), [cx, cz] = ang(rho, t2); C = [cx, y - 0.001, cz];
      const t3 = t2 + 2 * Math.asin(Math.min(1, ld / (2 * rho))) * 0.92, [dx, dz] = ang(rho * 0.96, t3); D = [dx, y - 0.002, dz];
    }
    A = P(...A); B = P(...B); C = P(...C); D = P(...D);
    k.capsule(A, B, r0 * 1.06, r0 * 0.96, sk, seg, 'vertex');
    k.capsule(B, C, r0 * 0.94, r0 * 0.86, sk, seg, 'vertex');
    k.capsule(C, D, r0 * 0.84, r0 * 0.74, sk, seg, 'vertex');
    // the nail on the back of the distal phalanx (away from the grip axis; the trigger finger's faces up)
    nail(k, C, D, open ? new THREE.Vector3(s, 0, 0) : trigger && i === 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(D[0] + C[0], 0, D[2] + C[2]).normalize(), r0);
    k.ellip(0.0105 * f, 0.0098, 0.0105, sk, P(mx + 0.003, y + 0.002, mz - 0.001), [0, 0, 0], 8, 'vertex');   // the knuckle
  }
  // the back of the hand / palm (metacarpals): a rounded slab from the knuckle line to the wrist, the palm side on the grip
  const top = fingers[0] + 0.012, bot = fingers[3] - 0.011, cy = (top + bot) / 2;
  k.rbox(0.024, top - bot - 0.006, 0.07, 0.0115, sk, P(gripR + 0.014, cy, 0.03), [0, s * -0.12, 0], 3, 'vertex');
  k.ellip(0.0135, (top - bot) / 2 + 0.001, 0.05, sk, P(gripR + 0.0175, cy, 0.028), [0, s * -0.16, 0], 16, 'vertex');   // the back of the hand: a gentle dome over the metacarpals
  // the heel of the hand and the wrist (oval, flattened across the palm)
  k.ellip(0.022, 0.034, 0.03, sk, P(gripR + 0.016, cy - 0.004, 0.072), [0, 0, 0], 12, 'vertex');
  k.capsule(P(gripR + 0.019, cy, 0.07), P(gripR + 0.02, cy, 0.11), 0.026, 0.024, sk, 12, 'vertex', [0.78, 1.0]);
  // the thumb: base (thenar) on the palm side, over the top of the grip to the far side
  const A = P(gripR + 0.01, 0.024, 0.06), B = open ? P(gripR + 0.002, top + 0.008, 0.026) : P(gripR + 0.002, top + 0.002, 0.024),
    C = open ? P(gripR - 0.006, top + 0.02, -0.004) : P(-0.002, top + 0.008, 0.004), D = open ? P(gripR - 0.012, top + 0.024, -0.026) : P(-(gripR + 0.004), top + 0.004, -0.004);
  k.ellip(0.016, 0.022, 0.03, sk, P(gripR + 0.008, 0.026, 0.046), [0.5, 0, 0], 10, 'vertex');   // thenar
  k.capsule(A, B, 0.0135, 0.012, sk, seg, 'vertex');
  k.capsule(B, C, 0.0115, 0.0105, sk, seg, 'vertex');
  k.capsule(C, D, 0.0102, 0.0088, sk, seg, 'vertex');
  nail(k, C, D, new THREE.Vector3(0, 1, 0), 0.011);
  return { wrist: new THREE.Vector3(s * (gripR + 0.02), cy, 0.105) };
}

// ------------------------------------------------------------------------------------------------ sleeves
// A sleeve along -y from the joint (length len, radius r0 at the joint, r1 at the far end), with soft fabric folds:
// bunching rings near the far end (a cuff over the wrist / the elbow), a couple of long diagonal creases. Returns a
// BufferGeometry (indexed, smooth normals, seam welded) for Kit.add.
export function sleeveGeo(len, r0, r1, { seg = 16, rows = 12, folds = 1, seed = 0, cuff = true } = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, rows, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = (y + len / 2) / len;   // 0 at the far end (bottom), 1 at the joint
    const a = Math.atan2(z, x);
    const ring = Math.sin(u * 26 + seed) * 0.5 + 0.5, nearEnd = Math.exp(-u * 5), nearJoint = Math.exp(-(1 - u) * 6);
    let d = folds * (0.07 * ring * (nearEnd + 0.6 * nearJoint) * (0.6 + 0.4 * Math.sin(a * 3 + seed * 2))
      + 0.035 * Math.sin(a * 2 + u * 7 + seed) * (1 - nearEnd)
      + 0.02 * Math.sin(a * 5 - u * 11 + seed * 3));
    if (cuff && u < 0.12) d += 0.05;   // the cuff stands off the wrist
    const k = 1 + d; p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.translate(0, -len / 2, 0);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------ third-person hand
// The soldier's hand bone: the hand hangs along -y from the wrist, palm toward -z, thumb on the inner side (s * -x).
// A cheap closed hand (~300 tris): palm slab, four curled fingers in two phalanges, the thumb. grip: fingers round
// something (the rifle); open: relaxed.
export function tpHand(k, { side = 'R', skin = SKIN_TONES[0], seg = 6, rings = 2, open = false } = {}) {
  const s = side === 'L' ? -1 : 1, sk = skin;
  k.rbox(0.078, 0.09, 0.03, 0.011, sk, [0, -0.05, 0.002], [0, 0, 0], 1);   // palm
  for (let i = 0; i < 4; i++) {
    const x = s * (0.027 - i * 0.018) * -1, f = [0.96, 1, 0.95, 0.82][i], r = 0.0088 * (i === 3 ? 0.9 : 1);
    const A = [x, -0.092, -0.002], B = open ? [x, -0.13 * f, -0.012] : [x, -0.125 * f, -0.024], C = open ? [x * 1.02, -0.155 * f, -0.03] : [x, -0.115 * f, -0.05];
    k.capsule(A, B, r * 1.05, r * 0.95, sk, seg, undefined, null, rings);
    k.capsule(B, C, r * 0.92, r * 0.78, sk, seg, undefined, null, rings);
  }
  const T0 = [s * -0.036, -0.025, -0.008], T1 = [s * -0.05, -0.06, -0.026], T2 = open ? [s * -0.052, -0.09, -0.034] : [s * -0.03, -0.085, -0.05];
  k.capsule(T0, T1, 0.013, 0.011, sk, seg, undefined, null, rings);
  k.capsule(T1, T2, 0.0105, 0.0085, sk, seg, undefined, null, rings);
}
