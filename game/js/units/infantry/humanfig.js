// NGC-1980 look-people: REAL PEOPLE for the soldier rig (RK.on('figures')). One continuous, anatomically proportioned,
// smooth SKINNED mesh per person on the existing 17 bones (soldiermodel.js BONES, rest pose = the rig's), built from
// signed-distance anatomy (sdfmesh.js) and merged with the rigid kit into ONE geometry and ONE material (figgeo.js):
//   - body: a 1.78 m man, ~7.5 heads: pelvis and buttocks, abdomen, ribcage, pectorals, lats, trapezius, deltoids,
//     upper arms, elbows, forearm muscles, thighs with quadriceps / hamstrings, knees, calves, all one surface. Bound in
//     an A-pose (arms 29 degrees out) with procedural weights along bone chains (smooth joint transitions: elbows and
//     knees bend without candy-wrapping, the armpit and groin blend), the shape of the 1980 USMC utilities ON it: the
//     coat worn outside the trousers, sleeves rolled above the elbow or down to the cuff, cargo pockets, the trousers
//     bloused over black leather boots with their soles, heels and toe caps, the pistol belt.
//   - head: skull, forehead, brow ridge, eye sockets with lids and eyeballs (iris, pupil), cheekbones, nose (bridge,
//     tip, alae, nostrils), lips and the mouth line, jaw and chin, ears with the concha, neck with the Adam's apple and
//     the neck muscles; three face shapes, four skin tones (a material uniform), short hair.
//   - hands: fingers in three phalanges blended into the palm and the thumb (a fist on the weapon or relaxed).
//   - kit: the M1 helmet (steel shell with the flared rim under the Mitchell cover, the cover band, the liner seen under
//     the rim, chin straps, the bug-juice bottle), the M1955 flak vest (ribbed upper, high collar, pockets), ALICE
//     suspenders, magazine pouches, canteens, first aid pouch, bayonet, entrenching tool, butt pack, the medium pack.
//   - camouflage, cloth creases and skin are per pixel (figgeo.js figMaterial): no textures, no triangle blotches.
// LODs (THREE.LOD of SkinnedMeshes sharing the skeleton): hero (the player's own body, close looks), near, mid; beyond
// 140 m the squads switch to the crowd stand-in (figures.js), itself baked from this body.
import * as THREE from 'three';
import { SdfKit, mat } from './sdfmesh.js';
import { FigBuilder, figMaterial, makeSkinned, bakePose } from './figgeo.js';
import { Kit, COL } from './meshkit.js';
import { m67Into } from './grenademodel.js';
import { tpHand } from './handkit.js';

// the rig (soldiermodel.js BONES: [name, parent, rest offset]); copied so this module has no import cycle
const RIG = [
  ['pelvis', 'root', [0, 0.98, 0]], ['spine', 'pelvis', [0, 0.1, 0]], ['chest', 'spine', [0, 0.2, 0]], ['neck', 'chest', [0, 0.21, 0]], ['head', 'neck', [0, 0.08, 0]],
  ['upperArmL', 'chest', [-0.19, 0.15, 0]], ['forearmL', 'upperArmL', [0, -0.3, 0]], ['handL', 'forearmL', [0, -0.27, 0]],
  ['upperArmR', 'chest', [0.19, 0.15, 0]], ['forearmR', 'upperArmR', [0, -0.3, 0]], ['handR', 'forearmR', [0, -0.27, 0]],
  ['thighL', 'pelvis', [-0.095, -0.06, 0]], ['shinL', 'thighL', [0, -0.44, 0]], ['footL', 'shinL', [0, -0.42, 0]],
  ['thighR', 'pelvis', [0.095, -0.06, 0]], ['shinR', 'thighR', [0, -0.44, 0]], ['footR', 'shinR', [0, -0.42, 0]],
];
const ARM_OUT = 0.5, LEG_OUT = 0.045, ELBOW = 0.12;   // the bind pose: A-pose, elbows a touch bent
let BIND = null;
export function bindPose() {
  if (BIND) return BIND;
  const rot = { upperArmL: [0, 0, -ARM_OUT], upperArmR: [0, 0, ARM_OUT], forearmL: [ELBOW, 0, 0], forearmR: [ELBOW, 0, 0], thighL: [0, 0, -LEG_OUT], thighR: [0, 0, LEG_OUT], shinL: [0, 0, LEG_OUT], shinR: [0, 0, -LEG_OUT] };
  const W = {}, e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  for (const [n, p, pos] of RIG) {
    const r = rot[n] || [0, 0, 0]; q.setFromEuler(e.set(r[0], r[1], r[2], 'XYZ'));
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, one);
    W[n] = p === 'root' ? local : W[p].clone().multiply(local);
  }
  return (BIND = W);
}
const _v = new THREE.Vector3(), _m3 = new THREE.Matrix4();
// a point / direction / rotation given in a bone's frame, in bind space
const at = (bone, p) => { _v.set(p[0], p[1], p[2]).applyMatrix4(bindPose()[bone]); return [_v.x, _v.y, _v.z]; };
const dirOf = (bone, d) => { _v.set(d[0], d[1], d[2]).transformDirection(bindPose()[bone]); return [_v.x, _v.y, _v.z]; };
function rotOf(bone, eul = [0, 0, 0]) {   // row-major 3x3 of (bone bind rotation * local Euler XYZ)
  _m3.extractRotation(bindPose()[bone]).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(eul[0], eul[1], eul[2], 'XYZ')));
  const e = _m3.elements; return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
}
// bone chains with their joints (bind space): the skin weights of every primitive
const CH = {};
function chains() {
  if (CH.torso) return CH;
  const J = (bone, r, ax) => ({ p: at(bone, [0, 0, 0]), ax: ax || dirOf(bone, [0, 1, 0]), r });
  CH.torso = { bones: ['pelvis', 'spine', 'chest', 'neck', 'head'], joints: [J('spine', 0.06), J('chest', 0.09), J('neck', 0.035), J('head', 0.03)] };
  CH.neck = { bones: ['chest', 'neck', 'head'], joints: [J('neck', 0.03), J('head', 0.035)] };
  for (const s of ['L', 'R']) {
    CH['arm' + s] = { bones: ['chest', 'upperArm' + s, 'forearm' + s, 'hand' + s], joints: [J('upperArm' + s, 0.045, dirOf('upperArm' + s, [0, -1, 0])), J('forearm' + s, 0.035, dirOf('forearm' + s, [0, -1, 0])), J('hand' + s, 0.02, dirOf('hand' + s, [0, -1, 0]))] };
    CH['leg' + s] = { bones: ['pelvis', 'thigh' + s, 'shin' + s, 'foot' + s], joints: [J('thigh' + s, 0.06, dirOf('thigh' + s, [0, -1, 0])), J('shin' + s, 0.04, dirOf('shin' + s, [0, -1, 0])), J('foot' + s, 0.03, dirOf('foot' + s, [0, -1, 0]))] };
  }
  return CH;
}

// ------------------------------------------------------------------------------------------------ materials
const SKIN0 = 0xc79a77;   // the modelled tone (others via the material's lpSkin uniform)
export const SKIN_TONES = [0xc79a77, 0xb5835e, 0x8a5d40, 0x5e3f2c];
const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
const lerpHex = (a, b, t) => { const c = new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))); return c.getHex(); };
export const M = {
  coat: mat(0x4a5733, { erdl: 1, fold: 1, rough: 0.93 }),
  og: mat(0x53563a, { fold: 1, rough: 0.92 }),
  skin: mat(SKIN0, { skin: 1, rough: 0.55 }),
  lip: mat(0xa8705e, { skin: 1, rough: 0.45 }),
  leather: mat(0x1b1714, { rough: 0.55 }),
  sole: mat(0x121212, { rough: 0.95 }),
  web: mat(0x5a5c3c, { fold: 0.45, rough: 0.9 }),
  od: mat(0x575a3b, { fold: 0.5, rough: 0.9 }),
  vest: mat(0x55583a, { fold: 0.55, rough: 0.86 }),
  cover: mat(0x56643a, { mitch: 1, fold: 0.6, rough: 0.92 }),
  band: mat(0x3c3f28, { fold: 0.3, rough: 0.9 }),
  liner: mat(0x34372a, { rough: 0.9 }),
  eyeWhite: mat(0xd9d2c6, { rough: 0.25 }),
};
const mk = (base, o) => ({ ...base, ...o });

// ------------------------------------------------------------------------------------------------ the body
// o: { clothes: 'utility' (USMC) | fn(S, P) for other roles, sleeves: 'rolled' | 'down', camo (material channel: erdl
// weight 1 or 0 for plain OG-107), build: 0..1 (slim .. heavy) }
const disp = (fn, max) => ({ disp: fn, dispMax: max });
// cloth creases round a bone: rings in the bone's frame, strongest near `y0`, falling off over `span`
function creases(bone, y0, span, amp, freq, seed = 0) {
  const inv = bindPose()[bone].clone().invert(), v = new THREE.Vector3();
  return disp((x, y, z) => {
    v.set(x, y, z).applyMatrix4(inv); const u = (v.y - y0) / span; if (u * u > 4) return 0;
    const a = Math.exp(-u * u), th = Math.atan2(v.z, v.x);
    return -amp * a * Math.max(0, Math.sin(v.y * freq + 2.2 * Math.sin(th * 2 + seed) + seed));
  }, amp);
}
export function bodySdf(o = {}) {
  const S = new SdfKit(), C = chains(), sleeves = o.sleeves || 'rolled', b = o.build ?? 0.5, w = 0.97 + 0.06 * b;
  const cloth = o.camo === 'og107' ? M.og : M.coat, trou = cloth;
  const T = { k: 0.05, mat: cloth, skin: C.torso };
  // trunk (the coat over it: loose, a little boxy at the hem)
  S.ellip([0, 0.945, 0.012], [0.172 * w, 0.115, 0.122], null, T);                                   // hips / seat
  for (const s of [-1, 1]) S.ellip([s * 0.068, 0.9, 0.05], [0.088, 0.1, 0.08], null, { ...T, k: 0.04 });   // buttocks
  S.ellip([0, 1.09, -0.004], [0.158 * w, 0.15, 0.113 + 0.01 * b], null, { ...T, k: 0.07 });          // abdomen / waist
  S.ellip([0, 1.265, 0.0], [0.17 * w, 0.17, 0.118], null, { ...T, k: 0.07 });                         // ribcage
  for (const s of [-1, 1]) S.ellip([s * 0.077, 1.315, -0.052], [0.085, 0.072, 0.064], [0, 0, s * 0.2], { ...T, k: 0.045 });   // pectorals
  S.ellip([0, 1.33, 0.035], [0.168 * w, 0.115, 0.094], null, { ...T, k: 0.05 });                     // upper back
  for (const s of [-1, 1]) S.ellip([s * 0.118, 1.2, 0.03], [0.062, 0.13, 0.072], [0, 0, s * -0.12], { ...T, k: 0.05 });   // lats
  for (const s of [-1, 1]) S.capsule([s * 0.035, 1.475, 0.022], [s * 0.165, 1.432, 0.012], 0.046, 0.04, { ...T, k: 0.045 });   // trapezius
  S.capsule([0, 1.44, 0.012], [0, 1.53, 0.0], 0.06, 0.055, { k: 0.03, mat: M.skin, skin: C.neck });       // neck stub (under the collar)
  // the coat's collar (fold-down, lying round the neck base), the front placket, the lower pockets' flaps
  S.torus([0, 1.465, 0.012], 0.066, 0.016, [-0.32, 0, 0], { k: 0.012, mat: cloth, skin: C.torso }, 1.05, 1.0);
  if (!o.vest) {
    S.rbox([0.006, 1.2, -0.122], [0.012, 0.2, 0.008], 0.006, [0.03, 0, 0], { k: 0.012, mat: cloth, skin: C.torso });   // the button placket
    for (const s of [-1, 1]) {
      S.rbox([s * 0.085, 1.29, -0.112], [0.05, 0.055, 0.012], 0.01, [-0.1, s * 0.25, 0], { k: 0.01, mat: cloth, skin: C.torso });   // chest pockets (slanted)
      S.rbox([s * 0.09, 1.0, -0.115], [0.058, 0.06, 0.012], 0.01, [0.05, s * 0.3, 0], { k: 0.012, mat: cloth, skin: C.torso });     // lower pockets
    }
  }
  // the coat hangs to the top of the thigh: a skirt round the seat, weighted to the legs at the sides
  for (const s of [-1, 1]) {
    const sd = s < 0 ? 'L' : 'R', A = C['arm' + sd], L = C['leg' + sd];
    // ---- arm: deltoid, the sleeve (rolled above the elbow or down to the cuff), bare forearm with its muscles
    const AK = { mat: cloth, skin: A };
    S.ellip(at('upperArm' + sd, [s * 0.006, -0.025, 0]), [0.064, 0.08, 0.07], rotOf('upperArm' + sd, [0, 0, s * 0.15]), { ...AK, k: 0.04 });   // deltoid
    const ua = 'upperArm' + sd, fa = 'forearm' + sd;
    S.capsule(at(ua, [0, -0.03, 0]), at(ua, [0, -0.2, 0.004]), 0.056, 0.05, { ...AK, k: 0.03, ...creases(ua, -0.12, 0.05, 0.003, 90, s) });   // upper sleeve
    if (sleeves === 'rolled') {
      S.band(at(ua, [0, -0.205, 0.004]), 0.05, 0.049, 0.022, 0.0075, rotOf(ua), { k: 0.006, mat: cloth, skin: A, ...creases(ua, -0.205, 0.02, 0.0025, 260, s * 2) }, 0.006);   // the roll
      S.capsule(at(ua, [0, -0.18, 0.002]), at(fa, [0, 0.0, 0.0]), 0.043, 0.037, { k: 0.02, mat: M.skin, skin: A });   // bare upper arm below the roll
      S.ellip(at(fa, [0, 0.0, 0.012]), [0.035, 0.04, 0.034], rotOf(fa), { k: 0.025, mat: M.skin, skin: A });   // elbow (olecranon behind)
      S.capsule(at(fa, [0, -0.02, 0]), at(fa, [0, -0.255, 0]), 0.04, 0.026, { k: 0.02, mat: M.skin, skin: A });
      S.ellip(at(fa, [s * 0.01, -0.075, -0.006]), [0.044, 0.085, 0.037], rotOf(fa, [0, 0, s * 0.12]), { k: 0.035, mat: M.skin, skin: A });   // brachioradialis / flexors
      S.ellip(at(fa, [0, -0.238, 0]), [0.029, 0.026, 0.02], rotOf(fa), { k: 0.02, mat: M.skin, skin: A });   // the wrist, flatter
    } else {
      S.capsule(at(ua, [0, -0.18, 0.004]), at(fa, [0, 0.0, 0.01]), 0.05, 0.048, { k: 0.03, ...AK });
      S.capsule(at(fa, [0, 0.0, 0.01]), at(fa, [0, -0.235, 0]), 0.049, 0.041, { k: 0.03, ...AK, ...creases(fa, -0.04, 0.05, 0.004, 80, s) });   // sleeve
      S.band(at(fa, [0, -0.24, 0]), 0.041, 0.037, 0.016, 0.004, rotOf(fa), { k: 0.008, ...AK }, 0.003);    // cuff
      S.ellip(at(fa, [0, -0.252, 0]), [0.028, 0.02, 0.021], rotOf(fa), { k: 0.01, mat: M.skin, skin: A });   // the wrist in the cuff
    }
    // ---- leg: thigh with quads / hamstrings, cargo pocket, knee, calf, the blousing over the boot, the boot
    const th = 'thigh' + sd, sh = 'shin' + sd, ft = 'foot' + sd, LK = { mat: trou, skin: L };
    S.capsule(at(th, [s * 0.008, 0.05, 0]), at(th, [0, -0.43, 0]), 0.092, 0.062, { ...LK, k: 0.05 });
    S.ellip(at(th, [0, -0.17, -0.022]), [0.072, 0.15, 0.07], rotOf(th), { ...LK, k: 0.04 });             // quadriceps
    S.ellip(at(th, [0, -0.2, 0.026]), [0.066, 0.15, 0.062], rotOf(th), { ...LK, k: 0.04 });              // hamstrings
    S.rbox(at(th, [s * 0.078, -0.235, -0.004]), [0.016, 0.085, 0.068], 0.012, rotOf(th, [0, 0, s * 0.06]), { ...LK, k: 0.012 });   // cargo pocket
    S.rbox(at(th, [s * 0.084, -0.155, -0.004]), [0.014, 0.018, 0.072], 0.008, rotOf(th, [0, 0, s * 0.06]), { ...LK, k: 0.006 });  // its flap
    S.ellip(at(sh, [0, 0.0, -0.012]), [0.058, 0.065, 0.058], rotOf(sh), { ...LK, k: 0.03, ...creases(sh, 0.04, 0.05, 0.004, 110, s * 3) });   // knee
    S.capsule(at(sh, [0, -0.01, 0]), at(sh, [0, -0.26, 0.004]), 0.058, 0.05, { ...LK, k: 0.03 });
    S.ellip(at(sh, [0, -0.11, 0.024]), [0.054, 0.1, 0.052], rotOf(sh), { ...LK, k: 0.03 });               // calf
    S.ellip(at(sh, [0, -0.255, 0.004]), [0.066, 0.045, 0.068], rotOf(sh), { ...LK, k: 0.02, ...creases(sh, -0.255, 0.03, 0.005, 160, s) });   // bloused over the boot
    // the boot: black leather shaft and foot, toe cap, heel counter, the rubber sole and heel
    const BK = { mat: M.leather, skin: L };
    S.capsule(at(sh, [0, -0.27, 0.004]), at(ft, [0, 0.0, 0.006]), 0.05, 0.045, { ...BK, k: 0.01 });
    S.ellip(at(ft, [0, -0.012, -0.06]), [0.047, 0.04, 0.1], null, { ...BK, k: 0.03 });
    S.ellip(at(ft, [0, -0.025, -0.15]), [0.046, 0.032, 0.05], null, { ...BK, k: 0.025 });              // toe cap
    S.ellip(at(ft, [0, -0.012, 0.03]), [0.043, 0.042, 0.045], null, { ...BK, k: 0.02 });               // heel
    S.rbox(at(ft, [0, -0.05, -0.058]), [0.051, 0.008, 0.133], 0.007, null, { mat: M.sole, skin: L, k: 0.004 });   // sole
    S.rbox(at(ft, [0, -0.047, 0.035]), [0.047, 0.013, 0.045], 0.006, null, { mat: M.sole, skin: L, k: 0.003 });   // heel
  }


  // the ALICE pistol belt over the coat (LC-2: 2 1/4 in nylon), its buckle
  if (o.belt !== false) S.band([0, 1.005, 0.006], 0.176 * w, 0.128, 0.027, 0.006, null, { k: 0.004, mat: M.web, skin: C.torso }, 0.004);
  return S;
}

// ---- the M1955 flak vest (a separate garment over the coat)
export function vestSdf() {
  const S = new SdfKit(), C = chains(), T = { mat: M.vest, skin: C.torso };
  const ribs = disp((x, y, z) => (y > 1.2 && y < 1.47 ? 0.0035 * (0.5 + 0.5 * Math.cos((y - 1.2) * Math.PI * 2 / 0.048)) : 0), 0.0035);
  S.ellip([0, 1.255, 0.0], [0.198, 0.215, 0.143], null, { ...T, k: 0.05, ...ribs });
  S.ellip([0, 1.08, -0.004], [0.185, 0.14, 0.137], null, { ...T, k: 0.06 });
  for (const s of [-1, 1]) S.capsule([s * 0.05, 1.47, 0.03], [s * 0.18, 1.43, 0.015], 0.052, 0.05, { ...T, k: 0.05, ...ribs });   // over the shoulders
  S.torus([0, 1.48, 0.022], 0.085, 0.022, [-0.25, 0, 0], { ...T, k: 0.02 }, 1.0, 0.95);                 // the high collar
  for (const s of [-1, 1]) S.capsule(at('upperArm' + (s < 0 ? 'L' : 'R'), [0, 0.06, 0]), at('upperArm' + (s < 0 ? 'L' : 'R'), [0, -0.25, 0]), 0.072, 0.072, { sub: true, k: 0.02 });   // arm holes
  S.capsule([0, 1.3, 0.02], [0, 1.7, 0.0], 0.068, 0.068, { sub: true, k: 0.015 });                      // the neck opening
  S.rbox([0.02, 1.4, -0.16], [0.03, 0.06, 0.06], 0.01, [0.3, 0, 0], { sub: true, k: 0.01 });             // the collar opens at the front
  S.rbox([0.018, 1.17, -0.142], [0.004, 0.2, 0.012], 0.003, null, { sub: true, k: 0.003 });               // the zip / snap closure
  for (const s of [-1, 1]) S.rbox([s * 0.09, 1.065, -0.135], [0.052, 0.045, 0.014], 0.01, [0, s * 0.35, 0], { ...T, k: 0.008 });   // pockets
  return S;
}

// ------------------------------------------------------------------------------------------------ heads and faces
// head-bone frame (origin at the head bone, +y up, -z forward); three face shapes
export const FACES = [
  { jaw: 1.0, chin: 1.0, nose: 1.0, noseW: 1.0, brow: 1.0, cheek: 1.0, lip: 1.0, ear: 1.0, skull: 1.0, hair: 0x2a2118 },
  { jaw: 1.12, chin: 1.15, nose: 0.92, noseW: 1.12, brow: 1.15, cheek: 0.9, lip: 1.08, ear: 1.05, skull: 1.03, hair: 0x1a1612 },
  { jaw: 0.92, chin: 0.9, nose: 1.1, noseW: 0.9, brow: 0.9, cheek: 1.12, lip: 0.92, ear: 0.95, skull: 0.98, hair: 0x5a4028 },
];
export function headSdf(fi = 0, o = {}) {
  const F = FACES[fi % FACES.length], S = new SdfKit(), C = chains(), H = at('head', [0, 0, 0]);
  const P = (x, y, z) => [H[0] + x, H[1] + y, H[2] + z];
  const hair = F.hair;
  const skinFn = (x, y, z) => {
    const lx = x - H[0], ly = y - H[1], lz = z - H[2];
    let c = SKIN0;
    // cheeks, nose and ears a touch warmer, the jaw a shade of stubble, the scalp short hair
    const cheek = Math.exp(-(((Math.abs(lx) - 0.042) / 0.02) ** 2 + ((ly - 0.07) / 0.02) ** 2)) + Math.exp(-((lx / 0.012) ** 2 + ((ly - 0.068) / 0.015) ** 2));
    c = lerpHex(c, 0xc4806a, 0.35 * Math.min(1, cheek));
    if (ly < 0.06 && lz < 0.01 && ly > -0.01) c = lerpHex(c, 0x8a7466, 0.18 * Math.min(1, (0.06 - ly) / 0.03) * (lz < -0.02 ? 1 : 0.5));
    const scalp = ly > 0.112 && (lz > -0.062 || ly > 0.155) && !(Math.abs(lx) > 0.07 && ly < 0.12);
    if (scalp) c = lerpHex(c, hair, 0.82);
    else if (Math.abs(lx) > 0.066 && ly > 0.075 && ly < 0.115 && lz > -0.01 && lz < 0.02) c = lerpHex(c, hair, 0.6);   // sideburns
    return lerpHex(c, 0x000000, (hash(x * 300, y * 300, z * 300) - 0.5) * 0.06);
  };
  const SK = { mat: mk(M.skin, { col: skinFn }), skin: 'head' }, k = (kk, ex = {}) => ({ ...SK, k: kk, ...ex });
  const sk = F.skull;
  S.ellip(P(0, 0.118, 0.008), [0.077 * sk, 0.093 * sk, 0.099 * sk], null, k(0.01));                    // cranium
  S.ellip(P(0, 0.122, -0.046), [0.066, 0.056, 0.055], null, k(0.03));                                  // forehead
  S.ellip(P(0, 0.07, -0.05), [0.057 * F.cheek, 0.056, 0.05], null, k(0.03));                         // maxilla / mid face
  for (const s of [-1, 1]) {
    S.ellip(P(s * 0.051 * F.cheek, 0.086, -0.061), [0.021, 0.015, 0.023], [0, s * 0.3, 0], k(0.02));    // cheekbones
    S.ellip(P(s * 0.041, 0.058, -0.06), [0.026, 0.03, 0.03], null, k(0.02));                            // cheeks
    S.capsule(P(s * 0.059 * F.jaw, 0.062, 0.002), P(s * 0.031 * F.jaw, 0.012, -0.058), 0.018, 0.016 * F.jaw, k(0.03));   // mandible
  }
  S.ellip(P(0, 0.012 - 0.003 * (F.chin - 1), -0.076), [0.023 * F.chin, 0.019, 0.017 * F.chin], null, k(0.022));   // chin
  S.capsule(P(-0.043, 0.117, -0.082), P(0.043, 0.117, -0.082), 0.011 * F.brow, 0.011 * F.brow, k(0.02));   // brow ridge
  // the nose: bridge, tip, the alae; nostrils
  const nl = F.nose, nw = F.noseW;
  S.capsule(P(0, 0.108, -0.091), P(0, 0.073 - 0.005 * (nl - 1), -0.112 - 0.006 * (nl - 1)), 0.0072 * nw, 0.0102 * nw, k(0.01));
  S.ellip(P(0, 0.068 - 0.005 * (nl - 1), -0.1135 - 0.006 * (nl - 1)), [0.0112 * nw, 0.0108, 0.011], null, k(0.006));
  for (const s of [-1, 1]) S.ellip(P(s * 0.0125 * nw, 0.0655, -0.104), [0.0088 * nw, 0.0078, 0.0092], null, k(0.006));
  // mouth: the philtrum region, lips, the line between them
  const L = F.lip, lipM = { mat: mk(M.lip, { col: 0xa8705e }), skin: 'head' };
  S.ellip(P(0, 0.05, -0.091), [0.026, 0.014, 0.014], null, k(0.012));
  S.ellip(P(0, 0.0432, -0.0955), [0.022 * L, 0.0062 * L, 0.0092], null, { ...lipM, k: 0.004 });
  S.ellip(P(0, 0.0335, -0.093), [0.0195 * L, 0.0068 * L, 0.0094], null, { ...lipM, k: 0.004 });
  S.capsule(P(-0.0215 * L, 0.0383, -0.104), P(0.0215 * L, 0.0383, -0.104), 0.0014, 0.0014, { sub: true, k: 0.0025 });
  for (const s of [-1, 1]) S.ellip(P(s * 0.0062, 0.0602, -0.1085), [0.0036, 0.0022, 0.0042], null, { sub: true, k: 0.0015 });   // nostrils
  // eyes: the sockets carved, the lids over the eyeballs (eyeballs are a separate, finer mesh: headKit)
  for (const s of [-1, 1]) {
    S.ellip(P(s * 0.032, 0.095, -0.088), [0.0185, 0.0128, 0.0135], null, { sub: true, k: 0.008 });
    S.ellip(P(s * 0.032, 0.1005, -0.0835), [0.0158, 0.0072, 0.0115], [0.25, 0, 0], k(0.004));           // upper lid
    S.ellip(P(s * 0.032, 0.0875, -0.0838), [0.0138, 0.0048, 0.0098], [-0.2, 0, 0], k(0.004));           // lower lid
    S.ellip(P(s * 0.032, 0.094, -0.081), [0.0112, 0.0112, 0.0112], null, { sub: true, k: 0.0015 });       // room for the eyeball
  }
  // ears: the auricle (rim), the concha carved in
  for (const s of [-1, 1]) {
    const e = F.ear;
    S.ellip(P(s * 0.077, 0.092, 0.01), [0.009, 0.03 * e, 0.019 * e], [0, s * 0.3, s * -0.08], k(0.006));
    S.ellip(P(s * 0.0745, 0.077, 0.006), [0.007, 0.011 * e, 0.009], null, k(0.006));                       // lobe
    S.ellip(P(s * 0.084, 0.091, 0.006), [0.0055, 0.018 * e, 0.011 * e], [0, s * 0.3, 0], { sub: true, k: 0.003 });
  }
  // the neck: the column, the sternocleidomastoids, the Adam's apple
  const NK = { mat: mk(M.skin, { col: skinFn }), skin: C.neck };
  S.capsule(P(0, -0.12, 0.012), P(0, 0.045, 0.01), 0.057, 0.051, { ...NK, k: 0.03 });
  for (const s of [-1, 1]) S.capsule(P(s * 0.046, 0.055, 0.022), P(s * 0.016, -0.085, -0.036), 0.0145, 0.0125, { ...NK, k: 0.02 });
  S.ellip(P(0, -0.018, -0.046), [0.011, 0.016, 0.01], null, { ...NK, k: 0.012 });
  return S;
}
// eyeballs (sclera, iris, pupil, a glossy cornea): a fine Kit sphere in the socket
function eyesKit(k, fi = 0) {
  const H = at('head', [0, 0, 0]), irisC = [0x3b2a1c, 0x2a3a48, 0x3a3020][fi % 3];
  for (const s of [-1, 1]) {
    const c = [H[0] + s * 0.032, H[1] + 0.094, H[2] - 0.081];
    k.add(new THREE.SphereGeometry(0.0108, 18, 12), (x, y, z) => {
      const dx = x - c[0], dy = y - c[1], dz = z - c[2], l = Math.hypot(dx, dy, dz) || 1, f = -dz / l;
      return f > 0.975 ? 0x0a0806 : f > 0.86 ? irisC : f > 0.84 ? 0x4a3e34 : 0xddd6ca;
    }, c, [0, 0, 0], null, 'vertex');
  }
}

// ---- the M1 helmet: steel shell with the flared rim, the Mitchell cover over it, the cover band (head frame)
export function helmetSdf() {
  const S = new SdfKit(), H = at('head', [0, 0, 0]), P = (x, y, z) => [H[0] + x, H[1] + y, H[2] + z];
  const K = { mat: M.cover, skin: 'head' };
  S.ellip(P(0, 0.122, 0.006), [0.137, 0.128, 0.152], null, { ...K, k: 0.01 });
  S.band(P(0, 0.126, 0.006), 0.141, 0.157, 0.0065, 0.0068, null, { ...K, k: 0.008 }, 0.004);           // the flared rim (cover tucked round it)
  S.band(P(0, 0.162, 0.006), 0.134, 0.149, 0.012, 0.0045, null, { mat: M.band, skin: 'head', k: 0.003 }, 0.003);   // the cover band
  return S;
}
const helmetClip = () => { const y0 = at('head', [0, 0.119, 0])[1]; return (x, y, z) => y0 - y; };
const headClip = () => { const y0 = at('head', [0, 0.165, 0])[1]; return (x, y, z) => y - y0; };   // the scalp under the helmet is never seen
const helmetPaint = () => { const y0 = at('head', [0, 0.124, 0])[1]; return (x, y, z, nx, ny) => (ny < -0.55 && y < y0 + 0.006 ? 0x2f3226 : null); };

// ------------------------------------------------------------------------------------------------ hands (SDF)
// record handkit.js's hand (capsules, ellipsoids, rounded boxes, nails) into an SdfKit: the same joint layout, now one
// blended surface (webbing between the fingers, knuckles, the thenar) instead of separate pills
export class SdfHandRecorder {
  constructor(S, o = {}) { this.S = S; this.xf = o.xf || null; this.skin = o.skin || 'handR'; this.k = o.k ?? 0.007; this.nail = mk(M.skin, { col: 0xe0bba4, rough: 0.35 }); this.mat = M.skin; }
  _p(p) { if (!this.xf) return p; _v.set(p[0], p[1], p[2]).applyMatrix4(this.xf); return [_v.x, _v.y, _v.z]; }
  _R(eul, q) {
    const m = new THREE.Matrix4(); if (q) m.makeRotationFromQuaternion(q); else m.makeRotationFromEuler(new THREE.Euler(eul[0], eul[1], eul[2], 'XYZ'));
    if (this.xf) m.premultiply(new THREE.Matrix4().extractRotation(this.xf));
    const e = m.elements; return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
  }
  _o(col, k) { return { k: k ?? this.k, mat: typeof col === 'number' && col === 0xe0c0ac ? this.nail : this.mat, skin: this.skin }; }
  capsule(a, b, ra, rb, col) { this.S.capsule(this._p(a), this._p(b), ra, rb, this._o(col)); return this; }
  ellip(rx, ry, rz, col, pos, rot = [0, 0, 0]) { this.S.ellip(this._p(pos), [rx, ry, rz], this._R(rot), this._o(col, this.k * 1.4)); return this; }
  rbox(w, h, d, r, col, pos, rot = [0, 0, 0]) { this.S.rbox(this._p(pos), [w / 2, h / 2, d / 2], r, this._R(rot), this._o(col, this.k * 1.6)); return this; }
  add(geo, col, pos, q, scale) { geo.dispose(); this.S.ellip(this._p(pos), scale, this._R(null, q), { k: 0.0015, mat: this.nail, skin: this.skin }); return this; }
  sphere(r, col, pos) { this.S.ellip(this._p(pos), [r, r, r], null, this._o(col)); return this; }
  cyl() { return this; } box() { return this; } rod() { return this; }
}

// ------------------------------------------------------------------------------------------------ rigid kit
// ALICE gear and the small parts, as meshkit Kits added rigidly (one bone each) to the figure geometry
function gearKits(o, hq) {
  const out = [];   // [kit, material channels, bone]
  const RB = (k, w, h, d, r, c, pos, rot = [0, 0, 0]) => (hq ? k.rbox(w, h, d, r, c, pos, rot, 1) : k.box(w, h, d, c, pos, rot));
  const od = 0x575a3b, web = COL.webbing, vestC = 0x55583a;
  // pelvis (in the pelvis bone frame: origin 0.98 m): pouches, canteens, bayonet, e-tool, butt pack, grenades
  const kp = new Kit(), ko = new Kit();
  RB(kp, 0.056, 0.036, 0.014, 0.004, 0x6a6a5a, [0, 0.025, -0.135]);                                         // buckle
  for (const s of [-1, 1]) {
    RB(kp, 0.092, 0.105, 0.062, 0.014, od, [s * 0.1, -0.005, -0.152]);                                      // 20-rd magazine pouches (ALICE)
    RB(kp, 0.096, 0.034, 0.068, 0.012, od, [s * 0.1, 0.045, -0.156], [-0.12, 0, 0]);                        // flap
    kp.cyl(0.0048, 0.0048, 0.004, 0x2a2a20, [s * 0.1, 0.038, -0.19], 'z', 8);                               // the flap's slide fastener
    kp.cyl(0.047, 0.047, 0.15, od, [s * 0.165, -0.045, 0.1], 'y', hq ? 16 : 10);                              // canteen in its cover
    kp.sphere(0.047, od, [s * 0.165, 0.03, 0.1], hq ? 16 : 10, [1, 0.35, 1], [0, 0, 0], undefined, [0, Math.PI * 2], [0, Math.PI / 2]);
    kp.cyl(0.018, 0.02, 0.022, COL.black, [s * 0.165, 0.045, 0.1], 'y', 10);                                 // cap
  }
  if (o.frags !== 0) for (const s of [-1, 1]) m67Into(ko, [s * 0.163, -0.02, -0.152], !hq);
  RB(kp, 0.04, 0.27, 0.022, 0.008, 0x3f4430, [-0.192, -0.13, -0.05], [0, 0, 0.06]);                      // M8A1 scabbard
  RB(kp, 0.028, 0.11, 0.026, 0.008, 0x1c1c1a, [-0.184, 0.05, -0.05], [0, 0, 0.06]);                       // M7 handle
  RB(kp, 0.14, 0.21, 0.055, 0.018, od, [0.085, -0.08, 0.16]);                                             // LC-1 entrenching tool carrier
  kp.capsule([-0.125, -0.01, 0.15], [-0.03, -0.01, 0.15], 0.036, 0.036, od, 12);                         // butt pack / poncho roll
  out.push([kp, { fold: 0.5, rough: 0.88 }, 'pelvis', [0, 0.98, 0]], [ko, { rough: 0.6 }, 'pelvis', [0, 0.98, 0]]);
  // chest (chest frame: origin 1.28 m): suspenders, first aid pouch, the medium pack
  const kc = new Kit(), vz = o.vest ? 0.148 : 0.128;
  for (const s of [-1, 1]) {
    RB(kc, 0.045, 0.3, 0.008, 0.003, web, [s * 0.1, 0.03, -vz], [s < 0 ? 0.04 : 0.04, 0, 0]);               // suspender fronts
    RB(kc, 0.045, 0.3, 0.008, 0.003, web, [s * 0.09, 0.05, vz - 0.004], [-0.04, 0, s * 0.1]);              // backs
    kc.add(new THREE.TorusGeometry(0.105, 0.0045, 6, 20, Math.PI).rotateY(Math.PI / 2), web, [s * 0.1, 0.168, 0.0], [0, 0, 0], [1, 0.62, 1.42]);   // over the shoulder
  }
  RB(kc, 0.07, 0.085, 0.042, 0.012, od, [-0.1, 0.1, -vz - 0.022]);                                        // first aid pouch
  if (o.pack) {
    RB(kc, 0.32, 0.36, 0.16, 0.05, od, [0, 0.05, 0.235]); RB(kc, 0.3, 0.08, 0.17, 0.03, od, [0, 0.25, 0.235], [0.2, 0, 0]);
    for (const s of [-1, 1]) RB(kc, 0.09, 0.14, 0.06, 0.02, od, [s * 0.11, -0.03, 0.345]);
    RB(kc, 0.09, 0.12, 0.055, 0.02, od, [0, 0.0, 0.34]);
    for (const s of [-1, 1]) RB(kc, 0.025, 0.4, 0.012, 0.004, web, [s * 0.07, 0.07, 0.32]);
    kc.capsule([-0.17, -0.17, 0.235], [0.17, -0.17, 0.235], 0.055, 0.055, 0x4f5236, 12);
  }
  out.push([kc, { fold: 0.45, rough: 0.9 }, 'chest', [0, 1.28, 0]]);
  return out;
}
function helmetKit(hq) {   // head frame: the bug-juice bottle in the band, the chin straps hanging
  const k = new Kit();
  k.capsule([0.128, 0.155, -0.062], [0.126, 0.205, -0.066], 0.0105, 0.0095, 0xd8d6c8, hq ? 12 : 8);
  k.cyl(0.008, 0.008, 0.008, 0x2a2a2a, [0.126, 0.213, -0.066], 'y', 8);
  for (const s of [-1, 1]) { k.rbox(0.014, 0.11, 0.004, 0.0015, 0x4a4a32, [s * 0.098, 0.075, 0.02], [0, 0, s * 0.12], 1); k.rbox(0.02, 0.02, 0.006, 0.002, 0x3a3a30, [s * 0.092, 0.022, 0.02], [0, 0, 0], 1); }
  return k;
}
// the watch on the left wrist (GI, OD band) for bare forearms
function watchKit() {
  const k = new Kit();
  k.add(new THREE.TorusGeometry(0.027, 0.0045, 6, 20).rotateX(Math.PI / 2), 0x3e4030, [0, -0.238, 0], [0, 0, 0], [1, 2.0, 0.78]);
  k.cyl(0.016, 0.017, 0.008, 0x151515, [0, -0.238, -0.023], 'z', 16);
  k.cyl(0.0135, 0.0135, 0.002, 0xcfcbb8, [0, -0.238, -0.0275], 'z', 16);
  return k;
}

// ------------------------------------------------------------------------------------------------ assembly + cache
// level of detail: cell sizes (m) for the body, vest, head, helmet, hands
export const LODS = {
  hero: { body: 0.011, vest: 0.013, head: 0.0042, helmet: 0.007, hand: 0.0042, hq: true },
  near: { body: 0.019, vest: 0.022, head: 0.0085, helmet: 0.013, hand: 0.008, hq: true },
  mid: { body: 0.034, vest: 0.04, head: 0.017, helmet: 0.026, hand: 0.018, hq: false },
};
const CACHE = new Map();
const cached = (key, fn) => { if (!CACHE.has(key)) CACHE.set(key, fn()); return CACHE.get(key); };
const surf = (key, S, h, o) => cached(key, () => S().mesh(h, o));
// the TP hand in the hand bone's frame (tpHand layout) as an SDF surface

function handSurface(side, shape, h) {
  return cached(`hand|${side}|${shape}|${h}`, () => {
    const S = new SdfKit(), rec = new SdfHandRecorder(S, { xf: bindPose()['hand' + side], skin: 'hand' + side, k: 0.006 });
    tpHand(rec, { side, open: shape === 'open' });
    // the wrist into the forearm
    rec.capsule([0, 0.012, 0.0], [0, -0.035, 0.002], 0.027, 0.03, SKIN0);
    return S.mesh(h);
  });
}
// one person's geometry (cached per combination): o = { lod, face, sleeves, vest, helmet, pack, frags, camo, hands }
export function marineGeometry(o = {}) {
  const L = LODS[o.lod || 'near'], key = JSON.stringify(['marine', o.lod, o.face % 3, o.sleeves, !!o.vest, o.helmet !== false, !!o.pack, o.frags !== 0, o.camo === 'og107', o.hands || 'grip']);
  return cached(key, () => {
    const B = new FigBuilder(), lod = o.lod || 'near', helmet = o.helmet !== false;
    B.addSurface(surf(`body|${lod}|${o.sleeves}|${!!o.vest}|${o.camo === 'og107'}`, () => bodySdf({ sleeves: o.sleeves, vest: o.vest, camo: o.camo }), L.body));
    if (o.vest) B.addSurface(surf(`vest|${lod}`, vestSdf, L.vest));
    B.addSurface(surf(`head|${lod}|${o.face % 3}|${helmet}`, () => headSdf(o.face || 0), L.head, helmet ? { clipFn: headClip() } : undefined));
    if (helmet) B.addSurface(surf(`helmet|${lod}`, helmetSdf, L.helmet, { paint: helmetPaint(), clipFn: helmetClip() }));
    for (const sd of ['L', 'R']) B.addSurface(handSurface(sd, o.hands || 'grip', L.hand));
    if (L.hq) { const ke = new Kit(); eyesKit(ke, o.face || 0); B.addKit(ke, { rough: 0.15 }, 'head'); }
    for (const [k, m, bone, off] of gearKits(o, L.hq)) B.addKit(k, m, bone, new THREE.Matrix4().makeTranslation(...off));
    if (helmet) B.addKit(helmetKit(L.hq), { rough: 0.7 }, 'head', bindPose().head);
    if (o.sleeves === 'rolled' && L.hq) B.addKit(watchKit(), { rough: 0.5 }, 'forearmL', bindPose().forearmL);
    const g = B.geometry(); g.userData.lod = lod; return g;
  });
}
// put the person on a soldier skeleton: a THREE.LOD with one SkinnedMesh per level, all on sk.bones
export function attachMarine(sk, o = {}) {
  const seed = o.seed ?? 1, face = o.face ?? (seed % 3), skin = o.skin ?? SKIN_TONES[seed % 4];
  const sleeves = o.sleeves || (o.detail === 'high' || seed % 3 !== 1 ? 'rolled' : 'down');
  const matl = figMaterial({ camo: o.camo === 'og107' ? 'og107' : 'erdl', seed, skin });
  const base = { face, sleeves, vest: o.vest !== false, helmet: o.helmet !== false, pack: !!o.pack, frags: o.frags, camo: o.camo, hands: o.weapon === null ? 'open' : 'grip' };
  const lod = new THREE.LOD(); lod.name = 'personLOD';
  const levels = o.detail === 'high' ? [['hero', 0], ['near', 7], ['mid', 28]] : [['near', 0], ['mid', 26]];
  const meshes = [];
  for (const [lv, dist] of levels) {
    const g = marineGeometry({ ...base, lod: lv });
    const m = makeSkinned(sk, g, matl, bindPose(), 'person_' + lv);
    sk.root.remove(m); lod.addLevel(m, dist); meshes.push(m);
  }
  sk.root.add(lod);
  sk.person = { lod, meshes, material: matl, tris: meshes.map(m => m.geometry.userData.tris) };
  return sk.person;
}
// bake a person into a static geometry in a pose (crowds, instanced crews): pose = { bone: [rx, ry, rz] } Euler XYZ
// on top of the rig's rest pose; returns a geometry with position, normal, color, aFig, aRM (no skin)
export function bakedPerson(geo, pose = {}, pelvisPos = null) {
  const W = {}, e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  for (const [n, p, pos] of RIG) {
    const r = pose[n] || [0, 0, 0]; q.setFromEuler(e.set(r[0], r[1], r[2], 'XYZ'));
    const P = n === 'pelvis' && pelvisPos ? pelvisPos : pos;
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...P), q, one);
    W[n] = p === 'root' ? local : W[p].clone().multiply(local);
  }
  return bakePose(geo, bindPose(), W);
}
export { cached as figCache };
