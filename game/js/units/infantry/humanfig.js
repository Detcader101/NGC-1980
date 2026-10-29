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
import { FigBuilder, figMaterial, makeSkinned, bakePose, mergeFig } from './figgeo.js';
import { simplifySurface, cutSurface } from './sdfsimplify.js';
import { unpackSurface, sourceKey } from './headcodec.js';
import { HEAD_BANK } from './headbank.js';
import { FIG_BONES } from './figgeo.js';
import { Kit, COL } from './meshkit.js';
import { m67Into } from './grenademodel.js';
import { tpHand, tpGripFrame } from './handkit.js';

// the rig (soldiermodel.js BONES: [name, parent, rest offset]); copied so this module has no import cycle
/** @type {Array<[string, string | null, [number, number, number]]>} */
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
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// sRGB hex <-> linear rgb (the face's colour masks mix in linear, like THREE.Color.lerp, without allocating)
const LINC = new Map(), toLin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)), toS = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const linOf = h => { let c = LINC.get(h); if (!c) LINC.set(h, c = [toLin(((h >> 16) & 255) / 255), toLin(((h >> 8) & 255) / 255), toLin((h & 255) / 255)]); return c; };
const hexOfLin = c => (Math.round(Math.max(0, Math.min(1, toS(c[0]))) * 255) << 16) | (Math.round(Math.max(0, Math.min(1, toS(c[1]))) * 255) << 8) | Math.round(Math.max(0, Math.min(1, toS(c[2]))) * 255);
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
// clothing for the other roles (1980 USN / USMC / civilian)
Object.assign(M, {
  flightSage: mat(0x6b7356, { fold: 0.9, rough: 0.9 }),      // CWU-27/P (Navy / Marine jet crews)
  flightOD: mat(0x56603f, { fold: 0.9, rough: 0.9 }),        // Army / Marine helicopter crews (OG-106 / sage)
  glove: mat(0x6e6a58, { fold: 0.5, rough: 0.85 }),          // Nomex flight gloves (leather palms)
  gloveDark: mat(0x3a3a36, { fold: 0.5, rough: 0.85 }),
  jersey: mat(0xffffff, { fold: 0.8, rough: 0.92, paint: 1 }),
  dungaree: mat(0x2b3550, { fold: 0.9, rough: 0.92 }),
  chambray: mat(0x7f9cc0, { fold: 0.8, rough: 0.9 }),
  khaki: mat(0xb5a27a, { fold: 0.7, rough: 0.88 }), khakiL: mat(0xa8956c, { fold: 0.7, rough: 0.88 }),
  shirt: mat(0xffffff, { fold: 0.7, rough: 0.9, paint: 1 }),
  jeans: mat(0x3a4660, { fold: 0.9, rough: 0.93 }), slacks: mat(0x4a4640, { fold: 0.7, rough: 0.9 }),
  shoe: mat(0x2a2018, { rough: 0.5 }), deckBoot: mat(0x3a2c20, { rough: 0.7 }),
  beltBlack: mat(0x1a1a1a, { rough: 0.6 }), beltBrown: mat(0x4a3220, { rough: 0.6 }),
  reflect: mat(0xc8c8c0, { rough: 0.4 }), hgu: mat(0xe2e2da, { rough: 0.35 }), sph: mat(0x46502e, { rough: 0.6 }),
  harness: mat(0x4a4a3a, { fold: 0.4, rough: 0.85 }), gsuit: mat(0x5a6048, { fold: 1, rough: 0.9 }), cvc: mat(0x3a3e30, { rough: 0.7 }),
  hat: mat(0xe8e8e0, { fold: 0.2, rough: 0.9 }), cap: mat(0x2a3450, { fold: 0.4, rough: 0.9 }),
});
export const OUTFITS = {
  utility: { top: M.coat, legs: M.coat, sleeves: 'rolled', collar: 'fold', chest: 'utility', cargo: 'utility', foot: 'boot', boot: M.leather, belt: M.web },
  flight: { top: M.flightSage, legs: M.flightSage, sleeves: 'down', collar: 'zip', chest: 'flight', cargo: 'flight', foot: 'boot', boot: M.leather, belt: null, gloves: M.glove },
  heloFlight: { top: M.flightOD, legs: M.flightOD, sleeves: 'down', collar: 'zip', chest: 'flight', cargo: 'flight', foot: 'boot', boot: M.leather, belt: null, gloves: M.glove },
  jersey: { top: M.jersey, legs: M.dungaree, sleeves: 'down', collar: 'crew', chest: null, cargo: null, foot: 'shoe', boot: M.deckBoot, belt: M.beltBlack, gloves: M.gloveDark, coatHem: false },
  chambray: { top: M.chambray, legs: M.dungaree, sleeves: 'rolled', collar: 'fold', chest: 'shirt', cargo: null, foot: 'shoe', boot: M.leather, belt: M.beltBlack, coatHem: false },
  khaki: { top: M.khaki, legs: M.khakiL, sleeves: 'short', collar: 'fold', chest: 'shirt', cargo: null, foot: 'shoe', boot: M.shoe, belt: M.beltBrown, coatHem: false },
  civil: { top: M.shirt, legs: M.jeans, sleeves: 'short', collar: 'fold', chest: 'shirt', cargo: null, foot: 'shoe', boot: M.shoe, belt: M.beltBrown, coatHem: false },
};

// ------------------------------------------------------------------------------------------------ the body
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
// o.outfit (OUTFITS below, or a record): top / legs (cloth materials), sleeves 'rolled' | 'down' | 'short', collar
// 'fold' (utility coat, shirts) | 'zip' (flight suit) | 'crew' (jersey, tee), chest 'utility' | 'flight' | 'shirt' |
// null (pockets), cargo 'utility' | 'flight' | null (thigh pockets), foot 'boot' (trousers bloused over it) | 'shoe'
// (straight trouser hems), boot (leather), belt (material | null), build 0..1 (slim .. heavy)
export function bodySdf(o = {}) {
  const S = new SdfKit(), C = chains(), b = o.build ?? 0.5, w = 0.97 + 0.06 * b;
  const OF = { ...OUTFITS.utility, ...(typeof o.outfit === 'string' ? OUTFITS[o.outfit] : o.outfit || {}) };
  if (o.camo === 'og107' && OF.top === M.coat) { OF.top = M.og; OF.legs = M.og; }
  const sleeves = o.sleeves || OF.sleeves || 'rolled', cloth = OF.top, trou = OF.legs, skinM = M.skin;
  const T = { k: 0.05, mat: cloth, skin: C.torso };
  // trunk (the coat / shirt over it: loose, a little boxy at the hem); the seat and hips in the trousers
  S.ellip([0, 0.945, 0.012], [0.172 * w, 0.115, 0.122], null, { ...T, mat: OF.coatHem === false ? trou : cloth });
  for (const s of [-1, 1]) S.ellip([s * 0.068, 0.9, 0.05], [0.088, 0.1, 0.08], null, { ...T, k: 0.04, mat: trou });   // buttocks
  S.ellip([0, 1.09, -0.004], [0.158 * w, 0.15, 0.113 + 0.012 * b], null, { ...T, k: 0.07 });          // abdomen / waist
  S.ellip([0, 1.265, 0.0], [0.17 * w, 0.17, 0.118], null, { ...T, k: 0.07 });                          // ribcage
  for (const s of [-1, 1]) S.ellip([s * 0.077, 1.315, -0.052], [0.085, 0.07, 0.056], [0, 0, s * 0.2], { ...T, k: 0.06 });   // pectorals (under the cloth: soft)
  S.ellip([0, 1.33, 0.035], [0.168 * w, 0.115, 0.094], null, { ...T, k: 0.05 });                      // upper back
  for (const s of [-1, 1]) S.ellip([s * 0.118, 1.2, 0.03], [0.062, 0.13, 0.072], [0, 0, s * -0.12], { ...T, k: 0.05 });   // lats
  for (const s of [-1, 1]) S.capsule([s * 0.035, 1.475, 0.022], [s * 0.165, 1.432, 0.012], 0.046, 0.04, { ...T, k: 0.045 });   // trapezius
  S.capsule([0, 1.44, 0.012], [0, 1.53, 0.0], 0.06, 0.055, { k: 0.03, mat: skinM, skin: C.neck });     // neck base (under the collar)
  // collars
  if (OF.collar === 'fold') S.torus([0, 1.465, 0.012], 0.066, 0.016, [-0.32, 0, 0], { k: 0.012, mat: cloth, skin: C.torso }, 1.05, 1.0);
  else if (OF.collar === 'zip') { S.torus([0, 1.478, 0.014], 0.064, 0.012, [-0.2, 0, 0], { k: 0.01, mat: cloth, skin: C.torso }, 1.05, 1.0); }
  else if (OF.collar === 'crew') S.torus([0, 1.47, 0.014], 0.062, 0.009, [-0.25, 0, 0], { k: 0.01, mat: cloth, skin: C.torso }, 1.05, 1.0);
  // fronts: the utility coat's button placket and four pockets; the flight suit's zip and slanted chest pockets
  if (!o.vest && OF.chest === 'utility') {
    S.rbox([0.006, 1.2, -0.122], [0.012, 0.2, 0.008], 0.006, [0.03, 0, 0], { k: 0.012, mat: cloth, skin: C.torso });
    for (const s of [-1, 1]) {
      S.rbox([s * 0.085, 1.29, -0.116], [0.05, 0.055, 0.006], 0.004, [-0.1, s * 0.25, 0], { k: 0.005, mat: cloth, skin: C.torso });
      S.rbox([s * 0.09, 1.0, -0.115], [0.058, 0.06, 0.012], 0.01, [0.05, s * 0.3, 0], { k: 0.012, mat: cloth, skin: C.torso });
    }
  } else if (OF.chest === 'flight') {
    S.capsule([0, 1.44, -0.112], [0, 0.98, -0.124], 0.0028, 0.0028, { sub: true, k: 0.004 });          // the front zip
    for (const s of [-1, 1]) S.rbox([s * 0.085, 1.3, -0.114], [0.05, 0.06, 0.004], 0.003, [-0.1, s * 0.25, s * 0.3], { k: 0.004, mat: cloth, skin: C.torso });
  } else if (OF.chest === 'shirt') {
    S.capsule([0.004, 1.44, -0.118], [0.004, 0.99, -0.126], 0.0035, 0.0035, { k: 0.006, mat: cloth, skin: C.torso });   // button line
    S.rbox([-0.085, 1.29, -0.115], [0.045, 0.05, 0.004], 0.003, [-0.1, -0.25, 0], { k: 0.004, mat: cloth, skin: C.torso });
  }
  for (const s of [-1, 1]) {
    const sd = s < 0 ? 'L' : 'R', A = C['arm' + sd], L = C['leg' + sd];
    // ---- arm: deltoid, the sleeve (rolled above the elbow, short, or down to the cuff), bare forearm with its muscles
    const AK = { mat: cloth, skin: A }, ua = 'upperArm' + sd, fa = 'forearm' + sd;
    S.ellip(at(ua, [s * 0.006, -0.025, 0]), [0.064, 0.08, 0.07], rotOf(ua, [0, 0, s * 0.15]), { ...AK, k: 0.04 });   // deltoid
    if (sleeves !== 'down') {
      const end = sleeves === 'short' ? -0.15 : -0.2;
      S.capsule(at(ua, [0, -0.03, 0]), at(ua, [0, end, 0.004]), 0.056, 0.052, { ...AK, k: 0.03, ...creases(ua, end + 0.06, 0.05, 0.003, 90, s) });
      if (sleeves === 'rolled') S.band(at(ua, [0, -0.205, 0.004]), 0.05, 0.049, 0.022, 0.0075, rotOf(ua), { k: 0.006, mat: cloth, skin: A, ...creases(ua, -0.205, 0.02, 0.0025, 260, s * 2) }, 0.006);
      else S.band(at(ua, [0, end, 0.004]), 0.053, 0.051, 0.008, 0.003, rotOf(ua), { k: 0.004, mat: cloth, skin: A }, 0.002);   // the hem
      S.capsule(at(ua, [0, end + 0.03, 0.002]), at(fa, [0, 0.0, 0.0]), 0.043, 0.037, { k: 0.02, mat: skinM, skin: A });
      S.ellip(at(fa, [0, 0.0, 0.012]), [0.035, 0.04, 0.034], rotOf(fa), { k: 0.025, mat: skinM, skin: A });   // elbow
      S.capsule(at(fa, [0, -0.02, 0]), at(fa, [0, -0.255, 0]), 0.04, 0.026, { k: 0.02, mat: skinM, skin: A });
      S.ellip(at(fa, [s * 0.01, -0.075, -0.006]), [0.044, 0.085, 0.037], rotOf(fa, [0, 0, s * 0.12]), { k: 0.035, mat: skinM, skin: A });
      S.ellip(at(fa, [0, -0.238, 0]), [0.029, 0.026, 0.02], rotOf(fa), { k: 0.02, mat: skinM, skin: A });   // the wrist
    } else {
      S.capsule(at(ua, [0, -0.03, 0]), at(ua, [0, -0.2, 0.004]), 0.056, 0.05, { ...AK, k: 0.03, ...creases(ua, -0.12, 0.05, 0.003, 90, s) });
      S.capsule(at(ua, [0, -0.18, 0.004]), at(fa, [0, 0.0, 0.01]), 0.05, 0.048, { k: 0.03, ...AK });
      S.capsule(at(fa, [0, 0.0, 0.01]), at(fa, [0, -0.235, 0]), 0.049, 0.041, { k: 0.03, ...AK, ...creases(fa, -0.04, 0.05, 0.004, 80, s) });
      S.band(at(fa, [0, -0.24, 0]), 0.041, 0.037, 0.016, 0.004, rotOf(fa), { k: 0.008, ...AK }, 0.003);    // cuff
      S.ellip(at(fa, [0, -0.252, 0]), [0.028, 0.02, 0.021], rotOf(fa), { k: 0.01, mat: OF.gloves || skinM, skin: A });
    }
    // ---- leg: thigh with quads / hamstrings, pockets, knee, calf, the hem (bloused over the boot or straight), footwear
    const th = 'thigh' + sd, sh = 'shin' + sd, ft = 'foot' + sd, LK = { mat: trou, skin: L };
    S.capsule(at(th, [s * 0.008, 0.05, 0]), at(th, [0, -0.43, 0]), 0.092, 0.062, { ...LK, k: 0.05 });
    S.ellip(at(th, [0, -0.17, -0.022]), [0.072, 0.15, 0.07], rotOf(th), { ...LK, k: 0.04 });             // quadriceps
    S.ellip(at(th, [0, -0.2, 0.026]), [0.066, 0.15, 0.062], rotOf(th), { ...LK, k: 0.04 });              // hamstrings
    if (OF.cargo === 'utility') {
      S.rbox(at(th, [s * 0.078, -0.235, -0.004]), [0.016, 0.085, 0.068], 0.012, rotOf(th, [0, 0, s * 0.06]), { ...LK, k: 0.012 });
      S.rbox(at(th, [s * 0.084, -0.155, -0.004]), [0.014, 0.018, 0.072], 0.008, rotOf(th, [0, 0, s * 0.06]), { ...LK, k: 0.006 });
    } else if (OF.cargo === 'flight') {   // the flight suit's thigh pockets (front, slanted zips) and the lower-leg pockets
      S.rbox(at(th, [s * 0.035, -0.2, -0.062]), [0.05, 0.075, 0.012], 0.01, rotOf(th, [0.05, s * 0.5, 0]), { ...LK, k: 0.012 });
      S.rbox(at(sh, [s * 0.05, -0.12, -0.03]), [0.012, 0.06, 0.04], 0.008, rotOf(sh, [0, s * 0.4, 0]), { ...LK, k: 0.01 });
    }
    S.ellip(at(sh, [0, 0.0, -0.012]), [0.058, 0.065, 0.058], rotOf(sh), { ...LK, k: 0.03, ...creases(sh, 0.04, 0.05, 0.004, 110, s * 3) });   // knee
    S.capsule(at(sh, [0, -0.01, 0]), at(sh, [0, -0.26, 0.004]), 0.058, 0.05, { ...LK, k: 0.03 });
    S.ellip(at(sh, [0, -0.11, 0.024]), [0.054, 0.1, 0.052], rotOf(sh), { ...LK, k: 0.03 });               // calf
    if (OF.foot === 'boot') {
      S.ellip(at(sh, [0, -0.255, 0.004]), [0.066, 0.045, 0.068], rotOf(sh), { ...LK, k: 0.02, ...creases(sh, -0.255, 0.03, 0.005, 160, s) });   // bloused
      const BK = { mat: OF.boot, skin: L };
      S.capsule(at(sh, [0, -0.27, 0.004]), at(ft, [0, 0.0, 0.006]), 0.05, 0.045, { ...BK, k: 0.01 });
      S.ellip(at(ft, [0, -0.012, -0.06]), [0.047, 0.04, 0.1], null, { ...BK, k: 0.03 });
      S.ellip(at(ft, [0, -0.025, -0.15]), [0.046, 0.032, 0.05], null, { ...BK, k: 0.025 });              // toe cap
      S.ellip(at(ft, [0, -0.012, 0.03]), [0.043, 0.042, 0.045], null, { ...BK, k: 0.02 });               // heel
      S.rbox(at(ft, [0, -0.05, -0.058]), [0.051, 0.008, 0.133], 0.007, null, { mat: M.sole, skin: L, k: 0.004 });
      S.rbox(at(ft, [0, -0.047, 0.035]), [0.047, 0.013, 0.045], 0.006, null, { mat: M.sole, skin: L, k: 0.003 });
    } else {   // straight trousers to the shoe, the shoe (a low leather upper on a sole)
      S.capsule(at(sh, [0, -0.25, 0.004]), at(ft, [0, -0.01, 0.006]), 0.052, 0.056, { ...LK, k: 0.02 });
      S.band(at(ft, [0, -0.012, 0.006]), 0.055, 0.058, 0.006, 0.003, null, { ...LK, k: 0.004 }, 0.002);   // the hem
      const BK = { mat: OF.boot, skin: L };
      S.ellip(at(ft, [0, -0.02, -0.07]), [0.045, 0.032, 0.105], null, { ...BK, k: 0.03 });
      S.ellip(at(ft, [0, -0.025, 0.02]), [0.041, 0.034, 0.045], null, { ...BK, k: 0.02 });
      S.rbox(at(ft, [0, -0.052, -0.055]), [0.048, 0.007, 0.128], 0.006, null, { mat: M.sole, skin: L, k: 0.004 });
    }
  }
  if (OF.belt && o.belt !== false) S.band([0, OF.beltY ?? 1.005, 0.006], 0.176 * w, 0.128, OF.beltH ?? 0.027, 0.006, null, { k: 0.004, mat: OF.belt, skin: C.torso }, 0.004);
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
// look-faces (2026-10-29): the head is built from MEASURED landmarks (docs/ngc1980/reference/faces/SOURCES.md):
//   ANSUR 1988 men (n = 1774, means): head length 197.1, breadth 151.7, bizygomatic 140.5, menton-sellion 121.9,
//   interpupillary 64.7, ear length 64.7 / breadth 37.7 / protrusion 24.2 / above tragion 31.9, neck at the larynx 379.6
//   Farkas norms for North American white men (via Mbugua et al. 2019, CC BY): n-sn 54.8, sn-me 72.6, sn-sto 22.3,
//   sto-sl 19.7, philtrum 15.9, en-en 33.3, ex-en 31.3, ex-ex 91.2, al-al 34.9, ch-ch 54.5, ft-ft 115.9, go-go 105.6;
//   African-American men: al-al 44.1, en-en 35.8, sn-sto 26.1, vermilion 13.6 / 13.8 (face 3)
// Head frame (metres, origin at the head bone, +y up, -z forward): vertex y 0.219, nasion (0, 0.106, -0.0905),
// pupils (+-0.0324, 0.098), subnasale y 0.053, stomion 0.031, menton -0.016 (n-me 122), tragion (+-0.071, 0.094, 0.004).
// The face is a LOFT (a custom field): per height a superellipse cross-section (half width W, front depth D, squareness
// p) through those landmarks, so the forehead, cheeks, the jaw's U and the chin follow the numbers instead of a pile of
// blended blobs; the nose, lips, brow, lids, ears and neck are small primitives with small blend radii (a smooth union
// of radius k swells the surface by k / 4, which made the old head lumpy).
// Five faces: 0 young (the mean), 1 broad (heavy brow, wide jaw), 2 lean (long nose, hollow cheeks), 3 African-American
// proportions, 4 older (40s: deeper folds, receding hairline, greying, a 1980 moustache).
export const FACES = [
  { name: 'young', jaw: 1.0, chin: 1.0, chinP: 1.0, nose: 1.0, noseW: 0.0175, noseP: 1.0, lip: 1.0, mouthW: 1.0, upLip: 1.0, brow: 1.0, cheek: 1.0, hollow: 0.2, skull: 1.0, eyeW: 1.0, lidH: 1.0, beard: 0.8, age: 0.1, hair: 0x2e2419, cut: 'hightight', moustache: 0, ear: 1.0, iris: 0x4a3523 },
  { name: 'broad', jaw: 1.08, chin: 1.12, chinP: 1.04, nose: 0.97, noseW: 0.0185, noseP: 0.96, lip: 1.08, mouthW: 1.03, upLip: 1.0, brow: 1.45, cheek: 1.05, hollow: 0.0, skull: 1.02, eyeW: 0.97, lidH: 0.92, beard: 1.3, age: 0.25, hair: 0x1c1712, cut: 'hightight', moustache: 0, ear: 1.04, iris: 0x3c5464 },
  { name: 'lean', jaw: 0.95, chin: 0.94, chinP: 1.02, nose: 1.08, noseW: 0.016, noseP: 1.08, lip: 0.88, mouthW: 0.97, upLip: 1.02, brow: 0.95, cheek: 1.15, hollow: 1.0, skull: 0.99, eyeW: 1.0, lidH: 1.0, beard: 0.55, age: 0.2, hair: 0x5a4028, cut: 'hightight', moustache: 0, ear: 0.96, iris: 0x55603a },
  { name: 'afam', jaw: 1.03, chin: 1.02, chinP: 0.98, nose: 0.95, noseW: 0.0221, noseP: 0.9, lip: 1.65, mouthW: 1.02, upLip: 1.15, brow: 1.1, cheek: 1.05, hollow: 0.1, skull: 1.0, eyeW: 1.05, lidH: 1.02, beard: 0.9, age: 0.15, hair: 0x120e0b, cut: 'hightight', moustache: 0, ear: 0.98, iris: 0x2a1a10 },
  { name: 'older', jaw: 1.04, chin: 1.0, chinP: 0.98, nose: 1.04, noseW: 0.0185, noseP: 1.04, lip: 0.85, mouthW: 1.02, upLip: 1.0, brow: 1.2, cheek: 0.95, hollow: 0.5, skull: 1.01, eyeW: 0.98, lidH: 0.85, beard: 1.0, age: 0.9, hair: 0x3a3028, cut: 'receding', moustache: 1, ear: 1.08, iris: 0x46586a },
];
// the face for a person: darker tones take the African-American proportions; o.older admits face 4
export function faceFor(seed, tone = null, older = false) {
  if (tone === 0x5e3f2c || tone === 0x6b4630) return 3;
  if (tone === 0x8a5d40) return [3, 0, 2][seed % 3];   // brown irises with the medium-dark tone
  const pool = older ? [4, 0, 1, 2, 4] : [0, 1, 2];
  return pool[Math.floor(seed / 4) % pool.length];
}
// a smooth curve through [y, value] knots (Catmull-Rom, clamped at the ends), tabulated every 0.25 mm
function curve(K) {
  const f = spline(K), y0 = K[0][0], y1 = K[K.length - 1][0], n = Math.ceil((y1 - y0) / 0.00025), T = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) T[i] = f(y0 + (y1 - y0) * i / n);
  return y => { const u = (y - y0) / (y1 - y0) * n; if (u <= 0) return T[0]; if (u >= n) return T[n]; const i = Math.floor(u), t = u - i; return T[i] + (T[i + 1] - T[i]) * t; };
}
function spline(K) {
  const n = K.length;
  return y => {
    if (y <= K[0][0]) return K[0][1]; if (y >= K[n - 1][0]) return K[n - 1][1];
    let i = 0; while (i < n - 2 && y > K[i + 1][0]) i++;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(n - 1, i + 2)];
    const t = (y - p1[0]) / (p2[0] - p1[0]), h = p2[0] - p1[0];
    const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * h, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
// the eye (head frame): centre of the globe, radius; the lid aperture in angles round it (azimuth + = lateral)
const EYE = { x: 0.0324, y: 0.098, z: -0.0738, r: 0.0118 };
export function headSdf(fi = 0, o = {}) {
  const F = FACES[fi % FACES.length], S = new SdfKit(), C = chains(), H = at('head', [0, 0, 0]), low = !!o.low;
  const P = (x, y, z) => [H[0] + x, H[1] + y, H[2] + z], age = F.age;
  const bald = !!o.noHair;
  // ---- colour, hair density (the shader draws hair and stubble per pixel from it) and roughness, head frame
  const g2 = (d, w) => Math.exp(-(d * d) / (w * w));
  const hairline = F.cut === 'receding' ? 0.18 : 0.172;
  const browY = ax => 0.1188 - 0.0012 * (F.brow - 1) + 0.0026 * Math.sin(Math.PI * 0.8 * Math.min(1, Math.max(0, (ax - 0.011) / 0.043)));   // nearly level, the peak two thirds out
  let mX = NaN, mY = NaN, mZ = NaN, mR = null;   // the mesher asks colour, hair and roughness at the same point for each primitive
  const masks = (x, y, z) => { if (x === mX && y === mY && z === mZ) return mR; mX = x; mY = y; mZ = z; return (mR = masks0(x, y, z)); };
  const masks0 = (x, y, z) => {
    const lx = x - H[0], ly = y - H[1], lz = z - H[2], ax = Math.abs(lx);
    const front = sstep(-0.035, -0.06, lz);   // on the face (not the sides / back)
    // scalp hair: above a hairline that dips at the temples, runs down in front of the ear (sideburn) and round the nape
    const temple = F.cut === 'receding' ? 0.024 : 0.007;   // the hairline rises at the temples
    const hl = hairline + temple * sstep(0.012, 0.04, ax) * front;
    const topHair = sstep(hl - 0.004, hl + 0.006, ly) * front + (1 - front) * sstep(0.17, 0.182, ly);
    // the sides and back: clipped short (a high-and-tight) from above the ear to the nape
    const sideLow = 0.098 - 0.06 * sstep(-0.0, 0.07, lz);   // in front of the ear 0.098 (sideburn), down to the nape behind
    const ear = g2(ax - 0.075, 0.012) * g2(ly - 0.094, 0.035) * g2(lz - 0.015, 0.03);
    const sides = sstep(sideLow - 0.004, sideLow + 0.006, ly) * (1 - front * sstep(-0.06, -0.075, lz)) * (1 - ear) * sstep(0.045, 0.06, ax + 0.2 * Math.max(0, lz));
    const sideburn = sstep(0.083, 0.09, ly) * sstep(-0.022, -0.016, lz) * sstep(0.002, -0.004, lz) * sstep(0.055, 0.062, ax) * sstep(0.13, 0.125, ly);
    let hair = bald ? 0 : Math.max(topHair, 0.62 * Math.max(sides, sideburn));
    // brows: a band along the arch, thick at the head, thin at the tail
    const by = browY(ax), bw = 0.0034 - 0.0016 * sstep(0.02, 0.054, ax);
    const brow = sstep(0.0085, 0.013, ax) * sstep(0.058, 0.05, ax) * sstep(bw, bw * 0.45, Math.abs(ly - by)) * sstep(-0.055, -0.07, lz);
    // the beard area (shaved): cheeks below the cheek line, the upper lip, the chin, under the jaw; not the lips
    const cheekLine = 0.072 - 0.022 * sstep(0.055, 0.02, ax) * front;
    const beardA = sstep(cheekLine + 0.004, cheekLine - 0.006, ly) * sstep(-0.045, -0.02, ly) * sstep(0.03, 0.0, lz) * sstep(0.0, 0.012, ax + 0.012);
    const upper = sstep(0.0545, 0.05, ly) * sstep(0.034, 0.039, ly) * sstep(0.03, 0.022, ax) * front;
    const lipsZone = g2(ax / 1.6, 0.017) * g2(ly - 0.0305, 0.0075) * front;
    const beard = Math.max(beardA, upper) * (1 - lipsZone);
    const mt = 0.0525 - 0.011 * (ax / 0.03) ** 2, mb = 0.0365 - 0.004 * (ax / 0.03) ** 2;   // a 1980 moustache: full over the lip, tapering to the corners
    const must = F.moustache ? sstep(mt + 0.0015, mt - 0.0015, ly) * sstep(mb - 0.001, mb + 0.0015, ly) * sstep(0.032, 0.027, ax) * front : 0;
    return { lx, ly, lz, ax, hair, brow, beard, must, front };
  };
  let cX = NaN, cY = NaN, cZ = NaN, cR = 0;
  const skinFn = (x, y, z) => { if (x === cX && y === cY && z === cZ) return cR; cX = x; cY = y; cZ = z; return (cR = skinFn0(x, y, z)); };
  const skinFn0 = (x, y, z) => {
    const m = masks(x, y, z), { ly, lz, ax } = m;
    const c = linOf(SKIN0).slice(), lerpHex = (cc, hex, t) => { const b = linOf(hex), u = Math.max(0, Math.min(1, t)); for (let i = 0; i < 3; i++) c[i] += (b[i] - c[i]) * u; return c; };
    // warmth: the cheeks, the nose, the ears; the eyelids and under the eyes a touch darker and pinker
    const warm = 0.8 * g2(ax - 0.042, 0.016) * g2(ly - 0.07, 0.016) * m.front + 0.7 * g2(ax, 0.012) * g2(ly - 0.062, 0.014) * sstep(-0.09, -0.11, lz) + 0.6 * g2(ax - 0.077, 0.01) * g2(ly - 0.09, 0.03);
    lerpHex(c, 0xc4806a, 0.32 * Math.min(1, warm));
    const orbit = g2(ax - EYE.x, 0.016) * g2(ly - EYE.y + 0.002, 0.011) * m.front;
    lerpHex(c, 0x8e6754, (0.09 + 0.1 * age) * orbit);
    lerpHex(c, 0x7a6658, 0.24 * m.beard * F.beard);
    if (!bald) lerpHex(c, F.hair, Math.max(0.94 * m.hair * (m.ly > 0.17 ? 1 : 0.85), 0.88 * m.brow, 0.8 * m.must));
    if (age > 0.5 && !bald) lerpHex(c, 0x9a958c, 0.45 * m.hair * sstep(0.12, 0.05, ly) * (1 - m.front * 0.5));   // greying at the temples
    return hexOfLin(c);
  };
  const hairFn = (x, y, z) => { const m = masks(x, y, z); return Math.min(1, Math.max(bald ? 0 : m.hair, m.brow, m.must, 0.42 * m.beard * F.beard)); };
  const roughFn = (x, y, z) => {
    const m = masks(x, y, z);
    const tz = Math.max(g2(m.ax, 0.03) * sstep(0.12, 0.16, m.ly) * sstep(0.19, 0.17, m.ly), g2(m.ax, 0.011) * g2(m.ly - 0.075, 0.03)) * m.front;   // the T-zone: forehead and nose
    return 0.56 - 0.12 * tz + 0.3 * Math.max(m.hair, m.brow, m.must);
  };
  const skinM = mk(M.skin, { col: skinFn, fold: hairFn, rough: roughFn });
  const SK = { mat: skinM, skin: 'head' }, k = (kk, ex = {}) => ({ ...SK, k: kk, ...ex });
  const sk = F.skull, jaw = F.jaw;
  // ---- the cranium (head length 197, breadth 152, vertex 0.219)
  S.ellip(P(0, 0.126, 0.0065), [0.0755 * sk, 0.093 * sk, 0.0985 * sk], null, k(0.01));
  // ---- the face loft: knots [y, value]
  const W = curve([[-0.024, 0.014], [-0.014, 0.028], [0.0, 0.0405 * F.chin], [0.018, 0.0548 * jaw], [0.036, 0.0605 + 0.002 * (jaw - 1)], [0.06, 0.066 - 0.002 * F.hollow], [0.085, 0.0695], [0.104, 0.066], [0.125, 0.0595], [0.15, 0.06], [0.175, 0.058], [0.2, 0.05]]);
  const cz = F.chinP;
  const D = curve([[-0.024, 0.06], [-0.016, 0.079], [-0.006, 0.0895 * cz], [0.002, 0.0935 * cz], [0.013, 0.0915], [0.024, 0.093], [0.04, 0.0935], [0.053, 0.0945], [0.068, 0.0905], [0.088, 0.0865], [0.104, 0.0885], [0.118, 0.0935 + 0.001 * (F.brow - 1)], [0.135, 0.093], [0.16, 0.089], [0.185, 0.078], [0.2, 0.066]]);
  const PX = curve([[-0.02, 2.4], [0.0, 2.6], [0.02, 2.8], [0.04, 2.9], [0.07, 3.0], [0.098, 3.2], [0.115, 3.0], [0.15, 2.5], [0.2, 2.2]]);
  const ZC = 0.02, Zb = curve([[-0.02, 0.03], [0.02, 0.045], [0.2, 0.045]]);   // the section's centre sits 2 cm behind the head bone
  const hollowAmp = 0.0035 * F.hollow + 0.0015 * age;
  const loft = (x, y, z) => {
    const lx = x - H[0], ly = y - H[1], lz = z - H[2];
    const w = W(ly), zz = lz - ZC, dd = zz < 0 ? D(ly) + ZC : Zb(ly), p = PX(ly);
    const ax = Math.abs(lx) / w, az = Math.abs(zz) / dd, rho = Math.pow(Math.pow(ax, p) + Math.pow(az, p), 1 / p);
    let d = (rho - 1) * Math.min(w, dd) * 0.85;
    // the buccal hollow under the cheekbone (lean and older faces)
    d += hollowAmp * Math.exp(-(((Math.abs(lx) - 0.047) / 0.012) ** 2 + ((ly - 0.05) / 0.016) ** 2 + ((lz + 0.05) / 0.02) ** 2));
    // the lower border of the mandible: rises from the menton to the angle
    const yb = -0.0185 + 0.036 * sstep(-0.075, -0.004, lz) + 0.006 * (Math.abs(lx) / 0.05) ** 2;
    d = smax(d, yb - ly, 0.007);
    d = smax(d, ly - 0.205, 0.02);
    return d;
  };
  S.field(loft, [H[0] - 0.08, H[1] - 0.03, H[2] - 0.105, H[0] + 0.08, H[1] + 0.21, H[2] + 0.07], k(0.012));
  // ---- cheekbones, the angle of the jaw, the chin, the muzzle over the teeth
  for (const s of [-1, 1]) {
    S.ellip(P(s * 0.0485, 0.0815, -0.065), [0.0115 * F.cheek, 0.0078, 0.0105], [0, s * 0.62, 0], k(0.014));
    S.ellip(P(s * 0.0515 * jaw, 0.0215, -0.005), [0.0085, 0.013, 0.013], null, k(0.012));
    if (age > 0.5) S.ellip(P(s * 0.036, 0.012, -0.068), [0.011, 0.009, 0.0095], null, k(0.012));   // the jowl
    if (age > 0.3) S.ellip(P(s * 0.033, 0.058, -0.08), [0.0125 * age, 0.0145 * age, 0.0095 * age], [0, s * 0.4, 0], k(0.012));   // the malar fat over the nasolabial fold (older)
  }
  S.ellip(P(0, 0.034, -0.071), [0.031 * F.mouthW, 0.025, 0.0235], null, k(0.014));
  S.ellip(P(0, 0.0005, -0.0868), [0.019 * F.chin, 0.0118, 0.0105 * F.chinP], null, k(0.012));
  // ---- the eyes: the socket under the brow, the lids (a shell round the globe), the aperture cut through the shell
  const ew = F.eyeW;
  for (const s of [-1, 1]) {
    S.ellip(P(s * 0.0322, 0.0985, -0.0905), [0.0178 * ew, 0.0128, 0.0115], null, { sub: true, k: 0.0065 });
    S.capsule(P(s * 0.014, 0.1168, -0.0922), P(s * 0.05, 0.1155, -0.0775), 0.0056 * (0.85 + 0.15 * F.brow), 0.0042, k(0.012));   // the brow
    S.ellip(P(s * EYE.x, EYE.y, EYE.z), [0.0152, 0.0132, 0.0132], null, k(0.004));                                       // the lids
  }
  if (!low) {
    for (const s of [-1, 1]) {
      // the palpebral fissure, cut from the front through the lid shell: from the medial corner 14.7 mm in from the pupil
      // to the lateral 13.1 mm out (en-en 33.3, ex-ex 91.2 with the pupils 64.7 apart), ~10 mm high, the upper lid over
      // the top of the iris and peaking medially, the lower lid at the iris' lower edge, the lateral corner higher (tilt)
      const cx = H[0] + s * EYE.x, cy = H[1] + EYE.y, czz = H[2] + EYE.z, hw = 0.0139 * ew, xc = -0.0008, upH = 0.0047 * F.lidH - 0.0006 * age, loH = 0.0052 * F.lidH;
      S.field((x, y, z) => {
        const vx = (x - cx) * s, vy = y - cy, vz = z - czz, u = (vx - xc) / hw, sh = Math.max(0, 1 - u * u), tilt = 0.0011 * u;
        const up = upH * Math.pow(sh, 0.5) + tilt - 0.0007 * Math.max(0, u), lo = -loH * Math.pow(sh, 0.75) + tilt;
        return Math.max(vy - up, lo - vy, (Math.abs(u) - 1) * hw, vz - 0.002, Math.hypot(vx, vy, vz) - 0.0185);
      }, [cx - 0.02, cy - 0.02, czz - 0.02, cx + 0.02, cy + 0.02, czz + 0.02], { sub: true, k: 0.0018 });
      // the upper lid crease (deeper with age)
      S.capsule(P(s * 0.019, EYE.y + 0.0072, -0.0862), P(s * 0.0335, EYE.y + 0.0088 - 0.0015 * age, -0.0868), 0.0007, 0.0007, { sub: true, k: 0.0028 + 0.0015 * age });
      S.capsule(P(s * 0.0335, EYE.y + 0.0088 - 0.0015 * age, -0.0868), P(s * 0.045, EYE.y + 0.0055 - 0.002 * age, -0.079), 0.0007, 0.0007, { sub: true, k: 0.0028 + 0.0015 * age });
    }
  }
  // ---- the nose: the radix at the nasion, the dorsum, the side walls, the tip lobule, the alae, the columella
  const nl = F.nose, nw = F.noseW / 0.0175, np = F.noseP;
  const tipY = 0.0625 - 0.004 * (nl - 1), tipZ = -0.1125 - 0.007 * (np - 1);
  S.capsule(P(0, 0.104, -0.0905), P(0, tipY + 0.005, tipZ - 0.0015), 0.0056, 0.0062, k(0.006));
  for (const s of [-1, 1]) S.capsule(P(s * 0.0052, 0.098, -0.0885), P(s * 0.0102 * nw, tipY + 0.0015, -0.1025 - 0.004 * (np - 1)), 0.0044, 0.0066 * Math.sqrt(nw), k(0.008));
  S.ellip(P(0, tipY, tipZ), [0.0088 * (0.6 + 0.4 * nw), 0.0083, 0.0086], null, k(0.005));
  for (const s of [-1, 1]) S.ellip(P(s * (F.noseW - 0.0058 * nw), 0.0573 - 0.003 * (nl - 1), -0.1003 - 0.003 * (np - 1)), [0.0058 * nw, 0.0058, 0.0078], [0, s * 0.42, 0], k(0.0028));
  S.capsule(P(0, tipY - 0.0062, tipZ + 0.0015), P(0, 0.0535, -0.1015), 0.0034, 0.0031, k(0.003));
  if (!low) for (const s of [-1, 1]) S.ellip(P(s * 0.0062 * nw, 0.0566 - 0.002 * (nl - 1), -0.1036 - 0.002 * (np - 1)), [0.0032 * nw, 0.0016, 0.0046], [0.5, s * 0.35, 0], { sub: true, k: 0.0014 });
  // ---- the mouth: the philtral columns, the vermilion of each lip, the mouth line following the dental arch, the corners
  const L = F.lip, mw = F.mouthW, ul = F.upLip, lipM = { mat: mk(M.lip, { col: 0x8f5d4d, rough: 0.42 }), skin: 'head' };
  const sto = 0.031 - 0.003 * (ul - 1);
  S.ellip(P(0, 0.0445, -0.091 - 0.001 * (L - 1)), [0.0215 * mw, 0.0105 * ul, 0.0108], [0.12, 0, 0], k(0.008));   // the upper lip's skin (philtrum)
  if (!low) S.capsule(P(0, 0.0505, -0.1032), P(0, sto + 0.0095 * L, -0.1055 - 0.001 * (L - 1)), 0.0011, 0.0013, { sub: true, k: 0.0035 });   // the philtral groove
  S.ellip(P(0, sto + 0.0038 * L, -0.0978), [0.0258 * mw, 0.0045 * L, 0.0074 + 0.0018 * (L - 1)], [0.3, 0, 0], { ...lipM, k: 0.0034 });
  S.ellip(P(0, sto - 0.0048 * L, -0.0958), [0.0235 * mw, 0.0056 * L, 0.0079 + 0.0018 * (L - 1)], [-0.32, 0, 0], { ...lipM, k: 0.0034 });
  if (!low) {
    const pts = []; for (let i = 0; i <= 8; i++) { const t = -1 + i / 4; pts.push(P(t * 0.0272 * mw, sto - 0.0006 * t * t, -0.1022 - 0.001 * (L - 1) + 0.0125 * t * t)); }
    for (let i = 0; i < 8; i++) S.capsule(pts[i], pts[i + 1], 0.00075, 0.00075, { sub: true, k: 0.0022 });
    for (const s of [-1, 1]) S.ellip(P(s * 0.0282 * mw, sto - 0.0004, -0.0892), [0.0016, 0.0019, 0.0016], null, { sub: true, k: 0.0035 });
    // the nasolabial fold, from beside the ala to past the corner of the mouth (deeper with age)
    for (const s of [-1, 1]) S.capsule(P(s * (F.noseW + 0.0062), 0.058, -0.094), P(s * 0.0335 * mw, 0.0255, -0.0845), 0.0003 + 0.0012 * age, 0.0002 + 0.0009 * age, { sub: true, k: 0.004 + 0.0035 * age });
    // the labiomental fold
    S.capsule(P(-0.011, sto - 0.0175, -0.0952), P(0.011, sto - 0.0175, -0.0952), 0.0016, 0.0016, { sub: true, k: 0.006 });
  }
  // ---- ears (length 64.7, breadth 37.7, protrusion 24.2; 31.9 above the tragion), tilted back ~15 degrees
  const e = F.ear;
  for (const s of [-1, 1]) {
    const ex = s * 0.0745, ey = 0.0935, ez = 0.0175, R = [0.26, s * 0.62, 0];   // back edge flares out; top tilts back
    S.ellip(P(ex, ey, ez), [0.0042, 0.0305 * e, 0.0172 * e], R, k(0.0045));                                     // the plate
    S.torus(P(ex + s * 0.0012, ey + 0.002, ez + 0.0012), 0.0158 * e, 0.0029, [0.26, s * 0.62, Math.PI / 2], k(0.0022), 1.78, 1.0);   // the helix rim
    S.ellip(P(s * 0.0738, 0.0665, 0.013), [0.0042, 0.0092 * e, 0.0078 * e], [0.2, s * 0.3, 0], k(0.004));           // the lobe
    S.ellip(P(s * 0.0752, 0.0915, 0.0028), [0.0042, 0.0052, 0.0042], null, k(0.003));                              // the tragus
    if (!low) {
      S.ellip(P(s * 0.0785, 0.0905, 0.0115), [0.0048, 0.0105 * e, 0.0078 * e], R, { sub: true, k: 0.0024 });    // the concha
      S.capsule(P(s * 0.0795, 0.113, 0.019), P(s * 0.0805, 0.096, 0.0245), 0.0018, 0.0021, k(0.0025));             // the antihelix
      S.ellip(P(s * 0.081, 0.112, 0.023), [0.0035, 0.009, 0.006], R, { sub: true, k: 0.002 });                     // the scapha behind it
    }
  }
  // ---- the neck: the column, the sternocleidomastoids, the larynx (neck at the larynx 380 mm round)
  const NK = { mat: skinM, skin: C.neck };
  S.capsule(P(0, -0.13, 0.016), P(0, 0.012, 0.024), 0.058, 0.051, { ...NK, k: 0.02 });
  S.ellip(P(0, 0.035, 0.045), [0.05, 0.055, 0.04], null, { ...NK, k: 0.02 });                          // the nape into the occiput
  for (const s of [-1, 1]) S.capsule(P(s * 0.056, 0.066, 0.03), P(s * 0.016, -0.1, -0.042), 0.0125, 0.0115, { ...NK, k: 0.02 });
  S.ellip(P(0, -0.042, -0.0455), [0.0078, 0.0115, 0.0068], null, { ...NK, k: 0.014 });
  return S;
}
// eyeballs: the sclera (matte, warm grey, shaded under the upper lid and into the corners) and the cornea cap with the
// iris (radial fibres, a darker limbal ring) and the pupil; the pole on the gaze so the rings are crisp latitude lines.
// Two parts, two roughnesses: the sclera reads wet but not glossy, the cornea keeps a small highlight.
function eyesKit(sclera, cornea, fi = 0, hi = true) {
  const F = FACES[fi % FACES.length], H = at('head', [0, 0, 0]), ir = new THREE.Color(F.iris);
  for (const s of [-1, 1]) {
    const c = [H[0] + s * EYE.x, H[1] + EYE.y, H[2] + EYE.z], r = EYE.r, cap = 0.56;
    const shade = (x, y, z) => {
      const dx = (x - c[0]) / r, dy = (y - c[1]) / r;
      return (1 - 0.5 * sstep(-0.05, 0.75, dy)) * (1 - 0.3 * sstep(0.45, 0.95, Math.abs(dx)));   // under the lid, into the corners
    };
    const gS = new THREE.SphereGeometry(r, hi ? 28 : 12, hi ? 18 : 8, 0, Math.PI * 2, cap, Math.PI * 0.62 - cap).rotateX(-Math.PI / 2);
    { const p = gS.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setX(i, x + Math.sign(x) * 0.42 * Math.max(0, Math.abs(x) - 0.0063)); } gS.computeVertexNormals(); }   // the globe's visible white reaches the canthi
    sclera.add(gS, (x, y, z) => { const dx = (x - c[0]) / r; const base = new THREE.Color(0xb2a597).lerp(new THREE.Color(0xb48a7c), 0.35 * sstep(0.55, 0.95, Math.abs(dx))); return base.multiplyScalar(shade(x, y, z)).getHex(); }, c, [0, 0, 0], null, 'vertex');
    const gC = new THREE.SphereGeometry(r * 1.004, hi ? 28 : 12, hi ? 10 : 5, 0, Math.PI * 2, 0, cap + 0.02).rotateX(-Math.PI / 2);
    sclera.ellip(0.0019, 0.0025, 0.003, 0x96706a, [c[0] - s * 0.0142, c[1] - 0.0004, c[2] - 0.0068], [0, 0, 0], hi ? 10 : 6);   // the caruncle in the medial corner
    cornea.add(gC, (x, y, z) => {
      const dx = x - c[0], dy = y - c[1], dz = z - c[2], l = Math.hypot(dx, dy, dz) || 1, f = -dz / l, th = Math.atan2(dy, dx);
      let col;
      if (f > 0.988) col = new THREE.Color(0x060505);
      else if (f > 0.87) { const fib = 0.86 + 0.14 * Math.sin(th * 23 + 1.3 * Math.sin(th * 7)), inner = sstep(0.93, 0.975, f); col = ir.clone().multiplyScalar(fib * (0.85 + 0.35 * inner)); }
      else if (f > 0.845) col = ir.clone().multiplyScalar(0.45);
      else col = new THREE.Color(0xb2a597);
      return col.multiplyScalar(shade(x, y, z)).getHex();
    }, c, [0, 0, 0], null, 'vertex');
  }
}
function addEyes(B, face, lod) { const a = new Kit(), b = new Kit(); eyesKit(a, b, face, lod === 'hero'); B.addKit(a, { rough: 0.5 }, 'head'); B.addKit(b, { rough: 0.12 }, 'head'); }
// the head surface for a level of detail: near levels (hero, near, crew) are meshed ONCE per face at a fine cell and
// reduced to the level's triangle budget (sdfsimplify.js); far levels are meshed coarse without the small carves.
// skullY (head frame): the scalp above it is hidden under headgear and dropped
const FINE_CELL = 0.0026;
export const HEAD_TRIS = { hero: 7000, near: 4200, crew: 2900 };   // hero is the player's own body (its face is rarely seen)
// the key of everything that shapes a head: the baked bank (headbank.js, tools/facebake.mjs) is used only while it matches
let HKEY = null;
export const headKey = () => HKEY ||= sourceKey([headSdf.toString(), curve.toString(), spline.toString(), JSON.stringify(FACES), JSON.stringify(EYE), JSON.stringify(M.skin), JSON.stringify(M.lip), String(SKIN0), String(FINE_CELL), String(HEAD_TRIS.hero), SdfKit.prototype.mesh.toString(), simplifySurface.toString()]);
let bankWarned = false;
// the fine head of face nf reduced to the hero budget: from the bank when it is current, else meshed here (~1.3 s)
export function headTop(nf, o = {}) {
  const H = at('head', [0, 0, 0]);
  if (!o.build && HEAD_BANK && HEAD_BANK.key === headKey() && HEAD_BANK.faces[nf]) return unpackSurface(HEAD_BANK.faces[nf], HEAD_BANK.bones, FINE_CELL);
  if (!o.build && !bankWarned) { bankWarned = true; console.warn('[look-faces] head bank is stale or missing: meshing faces at load (run node tools/facebake.mjs)'); }
  const fine = headSdf(nf).mesh(FINE_CELL, { band: 1.6, iters: 3, clip: [-1, H[1] - 0.095, -1, 1, 9, 1] });
  return simplifySurface(fine, HEAD_TRIS.hero);
}
export function headSurfaceFor(fi, lod, skullY = null) {
  const L = LODS[lod], nf = fi % FACES.length, H = at('head', [0, 0, 0]);
  if (!HEAD_TRIS[lod]) return cached(`head|${lod}|${nf}|${skullY}`, () => headSdf(nf, { low: true }).mesh(L.head, skullY != null ? { clipFn: (x, y) => y - (H[1] + skullY) } : undefined));
  // fine (~60k triangles) -> the hero budget once per face; the nearer budgets from that (a tenth of the work)
  const top = cached(`headtop|${nf}`, () => headTop(nf));
  return cached(`headlo|${nf}|${lod}|${skullY}`, () => {
    const src = skullY == null ? top : cutSurface(top, (x, y) => y > H[1] + skullY + 0.004);
    return simplifySurface(src, Math.round(HEAD_TRIS[lod] * (skullY == null ? 1 : 0.85)));
  });
}

// ---- the M1 helmet: steel shell with the flared rim, the Mitchell cover over it, the cover band (head frame)
export function helmetSdf() {
  const S = new SdfKit(), H = at('head', [0, 0, 0]), P = (x, y, z) => [H[0] + x, H[1] + y, H[2] + z];
  const K = { mat: M.cover, skin: 'head' };
  S.ellip(P(0, 0.122, 0.008), [0.121, 0.12, 0.14], null, { ...K, k: 0.01 });   // shell 242 x 280 mm (M1: 9.5 x 11 in) under the cover
  S.band(P(0, 0.126, 0.008), 0.125, 0.144, 0.0065, 0.0068, null, { ...K, k: 0.008 }, 0.004);           // the flared rim (cover tucked round it)
  S.band(P(0, 0.162, 0.008), 0.115, 0.133, 0.012, 0.0045, null, { mat: M.band, skin: 'head', k: 0.003 }, 0.003);   // the cover band
  return S;
}
const helmetClip = () => { const y0 = at('head', [0, 0.119, 0])[1]; return (x, y, z) => y0 - y; };
const helmetPaint = () => { const y0 = at('head', [0, 0.124, 0])[1]; return (x, y, z, nx, ny) => (ny < -0.55 && y < y0 + 0.006 ? 0x2f3226 : null); };

// ------------------------------------------------------------------------------------------------ other headgear
// (head frame; each returns { S, clip (keep y above, head frame), kit (rigid parts on the head bone) })
const headP = () => { const H = at('head', [0, 0, 0]); return (x, y, z) => [H[0] + x, H[1] + y, H[2] + z]; };
const HEADGEAR = {
  // SPH-4 (Army / Marine helicopter crews): the shell over the ears, the visor housing on the front, ear cups, the boom mic
  sph4(o = {}) {
    const S = new SdfKit(), P = headP(), K = { mat: o.mat || M.sph, skin: 'head' };
    S.ellip(P(0, 0.118, 0.012), [0.107, 0.118, 0.124], null, { ...K, k: 0.01 });
    for (const s of [-1, 1]) S.ellip(P(s * 0.094, 0.085, 0.012), [0.03, 0.05, 0.048], null, { ...K, k: 0.03 });          // ear cups
    S.rbox(P(0, 0.08, -0.13), [0.12, 0.075, 0.1], 0.03, null, { sub: true, k: 0.02 });                                 // the face opening
    if (!o.noVisor) S.rbox(P(0, 0.205, -0.075), [0.085, 0.022, 0.034], 0.016, [-0.55, 0, 0], { mat: M.sph, skin: 'head', k: 0.012 });   // visor housing
    const k = new Kit();
    if (!o.noVisor) k.rbox(0.02, 0.012, 0.016, 0.004, 0x1a1a1a, [0, 0.232, -0.074], [0, 0, 0], 1);                        // the visor knob
    if (o.mic !== false) { k.capsule([-0.106, 0.075, -0.02], [-0.06, 0.035, -0.085], 0.004, 0.004, 0x1a1a1a, 6); k.capsule([-0.06, 0.035, -0.085], [-0.02, 0.035, -0.105], 0.004, 0.004, 0x1a1a1a, 6); k.ellip(0.008, 0.008, 0.008, 0x1a1a1a, [-0.016, 0.035, -0.106], [0, 0, 0], 8); }
    for (const s of [-1, 1]) k.rbox(0.012, 0.07, 0.004, 0.0015, 0x2a2a24, [s * 0.075, 0.015, -0.01], [0.15, 0, s * 0.18], 1);   // chin strap
    return { S, clip: 0.04, kit: k, skull: 0.15 };
  },
  // HGU-33/P (Navy / Marine jets): the white shell, the visor housing, the dark visor DOWN, the MBU-12/P oxygen mask
  hgu33(o = {}) {
    const S = new SdfKit(), P = headP(), K = { mat: M.hgu, skin: 'head' };
    S.ellip(P(0, 0.12, 0.012), [0.11, 0.12, 0.128], null, { ...K, k: 0.01 });
    for (const s of [-1, 1]) S.ellip(P(s * 0.096, 0.08, 0.016), [0.03, 0.055, 0.05], null, { ...K, k: 0.03 });
    S.rbox(P(0, 0.075, -0.135), [0.125, 0.07, 0.1], 0.03, null, { sub: true, k: 0.02 });
    S.rbox(P(0, 0.2, -0.08), [0.1, 0.03, 0.04], 0.02, [-0.5, 0, 0], { ...K, k: 0.015 });                               // visor housing
    const k = new Kit();
    // the visor: a dark, glossy shell section in front of the eyes (down)
    const v = new THREE.SphereGeometry(0.118, 28, 10, Math.PI * 0.5 + 0.55, Math.PI - 1.1, Math.PI * 0.32, Math.PI * 0.2).scale(1, 1.05, 1.12);
    k.add(v, 0x16171c, [0, 0.118, 0.008], [0, 0, 0]);
    // the oxygen mask over the nose and mouth, its edge seal, the hose
    k.ellip(0.036, 0.042, 0.03, 0x3c3f38, [0, 0.05, -0.1], [0.15, 0, 0], 14);
    k.ellip(0.016, 0.02, 0.014, 0x2a2c28, [0, 0.032, -0.125], [0, 0, 0], 10);
    k.capsule([0, 0.02, -0.122], [0.01, -0.08, -0.1], 0.011, 0.011, 0x2c2e2a, 8);
    for (const s of [-1, 1]) k.rbox(0.008, 0.06, 0.004, 0.0015, 0x2a2a24, [s * 0.045, 0.075, -0.07], [0, s * 0.6, 0], 1);   // bayonet straps
    return { S, clip: 0.035, kit: k, skull: 0.15, noFace: true };
  },
  // the flight-deck cranial: the soft shell in the jersey colour (tinted), ear cups, the goggles up on the front
  cranial(o = {}) {
    const S = new SdfKit(), P = headP(), K = { mat: M.jersey, skin: 'head' };
    S.ellip(P(0, 0.138, 0.012), [0.085, 0.075, 0.104], null, { ...K, k: 0.01, ...disp((x, y, z) => 0.0015 * Math.sin(z * 260) * Math.sin(x * 200), 0.0015) });
    for (const s of [-1, 1]) {
      S.ellip(P(s * 0.084, 0.088, 0.01), [0.024, 0.042, 0.036], null, { mat: M.gloveDark, skin: 'head', k: 0.004 });   // ear cups
      S.capsule(P(s * 0.084, 0.12, 0.01), P(s * 0.06, 0.18, 0.01), 0.008, 0.008, { ...K, k: 0.012 });                     // the band over
    }
    const k = new Kit();
    for (const s of [-1, 1]) { k.cyl(0.02, 0.022, 0.016, 0x1a1c1e, [s * 0.03, 0.17, -0.083], 'z', 14); k.cyl(0.017, 0.017, 0.003, 0x4a5a60, [s * 0.03, 0.17, -0.092], 'z', 14); }
    k.rbox(0.03, 0.01, 0.012, 0.004, 0x1a1c1e, [0, 0.17, -0.083], [0, 0, 0], 1);
    return { S, clip: 0.1, kit: k, skull: 0.15 };
  },
  // the Navy enlisted white hat (Dixie cup) and the officer's garrison cap; the ball cap of the ready room
  whiteHat() {
    const S = new SdfKit(), P = headP(), K = { mat: M.hat, skin: 'head' };
    // look-faces: a cotton white hat worn square on the head, the crown seated over the skull, the brim rolled up all
    // round 45-50 mm high and flared a little; meshed at its own fine cell (the old 3 mm brim at an 18 mm cell crumpled)
    S.ecyl(P(0, 0.183, 0.006), 0.081, 0.099, 0.03, 0.026, [-0.08, 0, 0], { ...K, k: 0.008 });                         // the crown
    S.band(P(0, 0.162, 0.007), 0.092, 0.11, 0.022, 0.0055, [-0.08, 0, 0], { ...K, k: 0.006 }, 0.004);              // the brim rolled up round it
    S.torus(P(0, 0.184, 0.007), 0.094, 0.006, [-0.08, 0, 0], { ...K, k: 0.004 }, 1.0, 1.17);                         // its rolled top edge
    return { S, clip: 0.14, skull: 0.165, cell: 0.007 };
  },
  ballcap(o = {}) {
    const S = new SdfKit(), P = headP(), K = { mat: o.mat || M.cap, skin: 'head' };
    S.ellip(P(0, 0.15, 0.012), [0.083, 0.075, 0.1], null, { ...K, k: 0.01 });
    S.rbox(P(0, 0.142, -0.112), [0.072, 0.004, 0.05], 0.004, [0.18, 0, 0], { ...K, k: 0.012 });
    return { S, clip: 0.13, skull: 0.15 };
  },
  garrison() {
    const S = new SdfKit(), P = headP(), K = { mat: M.khakiL, skin: 'head' };
    // look-faces: the khaki garrison cap fits the crown (it was a ridge on top), worn tipped to the right
    S.rbox(P(0.006, 0.192, 0.004), [0.064, 0.034, 0.122], 0.028, [0, 0, -0.1], { ...K, k: 0.02 });
    S.rbox(P(0.006, 0.226, 0.004), [0.008, 0.012, 0.11], 0.006, [0, 0, -0.1], { ...K, k: 0.012 });                    // the fold along the top
    return { S, clip: 0.158, skull: 0.172, cell: 0.008 };
  },
  cvc() { return HEADGEAR.sph4({ mat: M.cvc, noVisor: true, mic: true }); },
  m1() { return { S: helmetSdf(), clip: 0.119, kit: null, skull: 0.165, paint: helmetPaint() }; },
};
// civilian hair (no hat): a short men's cut with volume over the cranium, the face left open
function hairSdf(fi = 0) {
  const S = new SdfKit(), P = headP(), F = FACES[fi % FACES.length], K = { mat: mat(F.hair, { rough: 0.8, fold: 0.3 }), skin: 'head' };
  // look-faces: a 1980 civilian cut over the measured cranium (ellipsoid 0.0755 x 0.093 x 0.0985 at y 0.126): 10-14 mm
  // of hair over the top, the sides over the tops of the ears, a side-parted fringe at the hairline, full at the nape
  S.ellip(P(0, 0.131, 0.009), [0.0835, 0.1005, 0.1085], null, { ...K, k: 0.01, ...disp((x, y, z) => 0.0012 * Math.sin(x * 300 + z * 120) * Math.sin(y * 260), 0.0012) });
  S.ellip(P(0.012, 0.19, -0.05), [0.06, 0.035, 0.05], [0, 0, 0.2], { ...K, k: 0.02 });                              // volume over the forehead (the parting's fall)
  S.rbox(P(0, 0.06, -0.135), [0.1, 0.105, 0.1], 0.03, [0.12, 0, 0], { sub: true, k: 0.025 });                        // the face and forehead open (hairline ~0.17)
  for (const s of [-1, 1]) S.ellip(P(s * 0.088, 0.078, 0.012), [0.03, 0.03, 0.034], null, { sub: true, k: 0.012 });  // the lobes and lower ears show
  S.rbox(P(0, -0.0, 0.06), [0.1, 0.055, 0.1], 0.02, null, { sub: true, k: 0.02 });                                   // the nape cut above the collar
  return S;
}

// ---- garments over the body: the deck crew's float coat, the helicopter crews' survival vest, the jet crews' torso
// harness, G-suit and life preserver
const GARMENTS = {
  float() {   // the float coat: a padded vest in the jersey colour with two reflective bands and the collar
    const S = new SdfKit(), C = chains(), T = { mat: M.jersey, skin: C.torso };
    const pad = disp((x, y, z) => 0.003 * Math.max(0, Math.cos((y - 1.0) * Math.PI * 2 / 0.09)), 0.003);
    S.ellip([0, 1.24, 0.0], [0.2, 0.235, 0.143], null, { ...T, k: 0.05, ...pad });
    S.ellip([0, 1.04, -0.002], [0.188, 0.13, 0.138], null, { ...T, k: 0.06, ...pad });
    for (const s of [-1, 1]) S.capsule([s * 0.05, 1.47, 0.03], [s * 0.18, 1.43, 0.015], 0.05, 0.048, { ...T, k: 0.05 });
    S.torus([0, 1.49, 0.02], 0.085, 0.024, [-0.25, 0, 0], { ...T, k: 0.02 }, 1.0, 0.95);
    for (const s of [-1, 1]) S.capsule(at('upperArm' + (s < 0 ? 'L' : 'R'), [0, 0.06, 0]), at('upperArm' + (s < 0 ? 'L' : 'R'), [0, -0.25, 0]), 0.07, 0.07, { sub: true, k: 0.02 });
    S.capsule([0, 1.3, 0.02], [0, 1.7, 0.0], 0.066, 0.066, { sub: true, k: 0.015 });
    S.rbox([0.0, 1.42, -0.17], [0.03, 0.07, 0.06], 0.01, [0.3, 0, 0], { sub: true, k: 0.01 });
    for (const y of [1.11, 1.33]) S.band([0, y, 0.0], 0.2, 0.146, 0.016, 0.006, null, { mat: M.reflect, skin: C.torso, k: 0.004 }, 0.003);
    return S;
  },
  survival() {   // SRU-21/P survival vest (mesh, pockets) over the flight suit
    const S = new SdfKit(), C = chains(), T = { mat: mat(0x4e5634, { fold: 0.6, rough: 0.9 }), skin: C.torso };
    S.ellip([0, 1.21, 0.0], [0.184, 0.2, 0.13], null, { ...T, k: 0.05 });
    for (const s of [-1, 1]) S.capsule(at('upperArm' + (s < 0 ? 'L' : 'R'), [0, 0.06, 0]), at('upperArm' + (s < 0 ? 'L' : 'R'), [0, -0.25, 0]), 0.068, 0.068, { sub: true, k: 0.02 });
    S.capsule([0, 1.25, 0.0], [0, 1.7, 0.0], 0.09, 0.09, { sub: true, k: 0.03 });
    S.rbox([0, 1.2, -0.17], [0.035, 0.3, 0.06], 0.02, null, { sub: true, k: 0.02 });                                   // open at the front
    for (const s of [-1, 1]) for (const y of [1.07, 1.2]) S.rbox([s * 0.11, y, -0.11], [0.04, 0.05, 0.022], 0.01, [0, s * 0.35, 0], { ...T, k: 0.008 });
    return S;
  },
  jet() {   // the torso harness, the CSU-13 G-suit (abdominal and leg bladders, the zips), the LPU round the waist
    const S = new SdfKit(), C = chains(), H = { mat: M.harness, skin: C.torso }, G = M.gsuit;
    S.ellip([0, 1.22, 0.0], [0.18, 0.19, 0.126], null, { ...H, k: 0.05 });
    for (const s of [-1, 1]) S.capsule(at('upperArm' + (s < 0 ? 'L' : 'R'), [0, 0.06, 0]), at('upperArm' + (s < 0 ? 'L' : 'R'), [0, -0.25, 0]), 0.066, 0.066, { sub: true, k: 0.02 });
    S.capsule([0, 1.25, 0.0], [0, 1.7, 0.0], 0.088, 0.088, { sub: true, k: 0.03 });
    S.rbox([0, 1.22, -0.16], [0.06, 0.16, 0.06], 0.03, null, { sub: true, k: 0.02 });
    S.rbox([0, 1.2, -0.17], [0.13, 0.04, 0.06], 0.02, null, { sub: true, k: 0.02 });
    for (const s of [-1, 1]) S.ellip([s * 0.06, 1.17, -0.13], [0.026, 0.02, 0.012], null, { mat: mat(0x8a8a86, { rough: 0.3, metal: 0.6 }), skin: C.torso, k: 0.004 });   // the Koch fittings
    S.ellip([0, 1.0, -0.006], [0.19, 0.08, 0.142], null, { mat: G, skin: C.torso, k: 0.02 });                       // abdominal bladder / belt
    for (const s of [-1, 1]) {
      S.ellip([s * 0.17, 1.02, -0.04], [0.045, 0.05, 0.065], null, { mat: mat(0x9a8a38, { rough: 0.8 }), skin: C.torso, k: 0.01 });   // LPU lobes
      const sd = s < 0 ? 'L' : 'R', L = C['leg' + sd], th = 'thigh' + sd, sh = 'shin' + sd;
      S.capsule(at(th, [0, -0.05, 0]), at(th, [0, -0.4, 0]), 0.1, 0.072, { mat: G, skin: L, k: 0.02, ...creases(th, -0.2, 0.15, 0.003, 70, s) });
      S.capsule(at(sh, [0, -0.04, 0]), at(sh, [0, -0.3, 0.004]), 0.068, 0.058, { mat: G, skin: L, k: 0.02 });
      S.ellip(at(sh, [0, 0.0, -0.03]), [0.04, 0.05, 0.02], rotOf(sh), { sub: true, k: 0.015 });                      // the knee cut-out
    }
    return S;
  },
};

// ------------------------------------------------------------------------------------------------ hands (SDF)
// record handkit.js's hand (capsules, ellipsoids, rounded boxes, nails) into an SdfKit: the same joint layout, now one
// blended surface (webbing between the fingers, knuckles, the thenar) instead of separate pills
export class SdfHandRecorder {
  constructor(S, o = {}) { this.S = S; this.xf = o.xf || null; this.skin = o.skin || 'handR'; this.k = o.k ?? 0.007; this.mat = o.mat || M.skin; this.nail = o.mat ? o.mat : mk(M.skin, { col: 0xe0bba4, rough: 0.35 }); }
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
/** @returns {Array<[string, any, string, [number, number, number]]>} */
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
  k.capsule([0.113, 0.155, -0.058], [0.111, 0.2, -0.062], 0.0105, 0.0095, 0xd8d6c8, hq ? 12 : 8);
  k.cyl(0.008, 0.008, 0.008, 0x2a2a2a, [0.111, 0.208, -0.062], 'y', 8);
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
  hero: { body: 0.014, vest: 0.016, head: 0.0055, helmet: 0.009, hand: 0.0048, hq: true },
  near: { body: 0.025, vest: 0.03, head: 0.011, helmet: 0.018, hand: 0.011, hq: true },
  crew: { body: 0.034, vest: 0.04, head: 0.014, helmet: 0.02, hand: 0.015, hq: true },
  crowd: { body: 0.055, vest: 0.06, head: 0.03, helmet: 0.04, hand: 0.035, hq: false },
  far: { body: 0.075, vest: 0.08, head: 0.045, helmet: 0.055, hand: 0.05, hq: false },
  mid: { body: 0.04, vest: 0.045, head: 0.02, helmet: 0.03, hand: 0.02, hq: false },
};
const CACHE = new Map();
const cached = (key, fn) => { if (!CACHE.has(key)) CACHE.set(key, fn()); return CACHE.get(key); };
const surf = (key, S, h, o) => cached(key, () => S().mesh(h, o));
// the TP hand in the hand bone's frame (tpHand layout) as an SDF surface

function handSurface(side, shape, h, glove = null, profile = null) {
  const active = shape === 'open' ? null : profile;
  if (active) tpGripFrame(active); // finite named profiles only; no unbounded diameter cache
  return cached(`hand|${side}|${shape}|${h}|${glove ? glove.col : ''}` + (active ? `|${active}` : ''), () => {
    const S = new SdfKit(), rec = new SdfHandRecorder(S, { xf: bindPose()['hand' + side], skin: 'hand' + side, k: 0.006, mat: glove });
    tpHand(rec, { side, open: shape === 'open', profile: active });
    // the wrist into the forearm
    rec.capsule([0, 0.012, 0.0], [0, -0.035, 0.002], 0.027, 0.03, SKIN0);   // (gloved: the glove's cuff)
    return S.mesh(h);
  });
}
// one person's geometry (cached per combination): o = { lod, face, sleeves, vest, helmet, pack, frags, camo, hands }
export function marineGeometry(o = {}) {
  const left = o.gripProfiles?.L || null, right = o.gripProfiles?.R || null;
  tpGripFrame(left); tpGripFrame(right); // reject unknown IDs even when open hands will ignore their shape
  const profiles = o.hands === 'open' ? {} : { L: left, R: right };
  const L = LODS[o.lod || 'near'], keyParts = ['marine', o.lod, (o.face || 0) % FACES.length, o.sleeves, !!o.vest, o.helmet !== false, !!o.pack, o.frags !== 0, o.camo === 'og107', o.hands || 'grip'];
  if (profiles.L || profiles.R) keyParts.push(profiles.L || null, profiles.R || null);
  const key = JSON.stringify(keyParts);
  return cached(key, () => {
    const B = new FigBuilder(), lod = o.lod || 'near', helmet = o.helmet !== false;
    B.addSurface(surf(`body|${lod}|${o.sleeves}|${!!o.vest}|${o.camo === 'og107'}`, () => bodySdf({ sleeves: o.sleeves, vest: o.vest, camo: o.camo }), L.body));
    if (o.vest) B.addSurface(surf(`vest|${lod}`, vestSdf, L.vest));
    B.addSurface(headSurfaceFor(o.face || 0, lod, helmet ? 0.165 : null));
    if (helmet) B.addSurface(surf(`helmet|${lod}`, helmetSdf, L.helmet, { paint: helmetPaint(), clipFn: helmetClip() }));
    for (const sd of ['L', 'R']) B.addSurface(handSurface(sd, o.hands || 'grip', L.hand, null, profiles[sd] || null));
    if (L.hq) addEyes(B, o.face || 0, lod);
    for (const [k, m, bone, off] of gearKits(o, L.hq)) B.addKit(k, m, bone, new THREE.Matrix4().makeTranslation(...off));
    if (helmet) B.addKit(helmetKit(L.hq), { rough: 0.7 }, 'head', bindPose().head);
    if (o.sleeves === 'rolled' && L.hq) B.addKit(watchKit(), { rough: 0.5 }, 'forearmL', bindPose().forearmL);
    const g = B.geometry(); g.userData.lod = lod; return g;
  });
}
// put the person on a soldier skeleton: a THREE.LOD with one SkinnedMesh per level, all on sk.bones
export function attachMarine(sk, o = {}) {
  const seed = o.seed ?? 1, skin = o.skin ?? SKIN_TONES[seed % 4], face = o.face ?? faceFor(seed, skin);
  const sleeves = o.sleeves || (o.detail === 'high' || seed % 3 !== 1 ? 'rolled' : 'down');
  const matl = figMaterial({ camo: o.camo === 'og107' ? 'og107' : 'erdl', seed, skin });
  const base = { face, sleeves, vest: o.vest !== false, helmet: o.helmet !== false, pack: !!o.pack, frags: o.frags, camo: o.camo, hands: o.weapon === null ? 'open' : 'grip' };
  const lod = new THREE.LOD(); lod.name = 'personLOD';
  /** @type {Array<[string, number]>} */
  const levels = o.detail === 'high' ? [['hero', 0], ['near', 7], ['mid', 28]] : [['near', 0], ['mid', 26]];
  const meshes = [];
  for (const [lv, dist] of levels) {
    const g = marineGeometry({ ...base, lod: lv });
    const m = makeSkinned(sk, g, matl, bindPose(), 'person_' + lv);
    sk.root.remove(m); lod.addLevel(m, dist); meshes.push(m);
  }
  sk.root.add(lod);
  sk.person = { lod, meshes, material: matl, tris: meshes.map(m => m.geometry.userData.tris), gripBase: base, gripProfiles: { L: null, R: null } };
  return sk.person;
}
// Optional weapon grips only change Marine geometry on the existing LOD meshes. Skeletons, materials and cached
// default person/crew/crowd geometry remain shared and untouched. Call only when the requested profile changes.
export function setMarineGripProfiles(sk, profiles = {}) {
  const person = sk.person; if (!person) return false;
  const L = profiles.L || null, R = profiles.R || null;
  tpGripFrame(L); tpGripFrame(R);
  if (person.gripProfiles.L === L && person.gripProfiles.R === R) return false;
  const next = { L, R };
  for (const mesh of person.meshes) mesh.geometry = marineGeometry({ ...person.gripBase, lod: mesh.geometry.userData.lod, gripProfiles: next });
  person.gripProfiles = next; person.tris = person.meshes.map(m => m.geometry.userData.tris);
  return true;
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
// ------------------------------------------------------------------------------------------------ the other people
// role -> outfit, headgear, garment over the body, gloves
export const ROLES = {
  marine: { outfit: 'utility', camo: 'og107', sleeves: 'down', head: 'm1', vest: true, gear: true },
  heloPilot: { outfit: 'heloFlight', head: 'sph4', garment: 'survival' },
  jetPilot: { outfit: 'flight', head: 'hgu33', garment: 'jet' },
  deck: { outfit: 'jersey', head: 'cranial', garment: 'float' },
  sailor: { outfit: 'chambray', head: 'whiteHat' },
  officer: { outfit: 'khaki', head: 'garrison' },
  pilot: { outfit: 'flight', head: 'ballcap' },
  tanker: { outfit: 'utility', camo: 'og107', sleeves: 'down', head: 'cvc' },
  civil: { outfit: 'civil', head: null },
};
// one person of any role (cached): o = { lod, face, hands: 'grip' | 'open', sleeves }
export function personGeometry(role, o = {}) {
  if (role === 'marine' && o.full) return marineGeometry(o);
  const R = { ...ROLES[role] || ROLES.civil, ...o }, lod = o.lod || 'near', L = LODS[lod], face = (o.face ?? 0) % FACES.length, hands = o.hands || 'open';
  const key = JSON.stringify(['person', role, lod, face, hands, R.sleeves || '', R.camo || '', R.outfit, R.head || '', R.garment || '', !!R.vest]);
  return cached(key, () => {
    const B = new FigBuilder(), OF = OUTFITS[R.outfit], H = at('head', [0, 0, 0]);
    B.addSurface(surf(`pbody|${lod}|${R.outfit}|${R.sleeves}|${R.camo}|${!!R.vest}`, () => bodySdf({ outfit: R.outfit, sleeves: R.sleeves, camo: R.camo, vest: R.vest }), L.body));
    if (R.vest) B.addSurface(surf(`vest|${lod}`, vestSdf, L.vest));
    if (R.garment) B.addSurface(surf(`garm|${R.garment}|${lod}`, GARMENTS[R.garment], L.vest));
    const hg = R.head ? HEADGEAR[R.head]() : null;
    const skullY = H[1] + (hg ? hg.skull : 9);
    B.addSurface(headSurfaceFor(face, lod, hg ? hg.skull : null));
    if (hg) {
      const cy = H[1] + hg.clip;
      B.addSurface(surf(`hg|${R.head}|${lod}`, () => hg.S, L.hq ? Math.min(L.helmet, hg.cell || L.helmet) : L.helmet, { clipFn: (x, y) => cy - y, paint: hg.paint }));
      if (hg.kit) B.addKit(hg.kit, { rough: 0.6 }, 'head', bindPose().head);
      if (R.head === 'm1') B.addKit(helmetKit(L.hq), { rough: 0.7 }, 'head', bindPose().head);
    } else B.addSurface(surf(`hair|${lod}|${face}`, () => hairSdf(face), L.hq ? Math.min(L.helmet, 0.01) : L.helmet));
    const glove = OF.gloves && R.sleeves !== 'rolled' ? OF.gloves : null;
    for (const sd of ['L', 'R']) B.addSurface(handSurface(sd, hands, L.hand, glove));
    if (L.hq) addEyes(B, face, lod);
    if (R.gear) for (const [k, m, bone, off] of gearKits({ vest: true, frags: 0 }, L.hq)) B.addKit(k, m, bone, new THREE.Matrix4().makeTranslation(...off));
    const g = B.geometry(); g.userData.lod = lod; g.userData.role = role; return g;
  });
}

// ---- crews in poses, baked (seats, stations, the deck): the interiors/crewfig.js kinds and poses on these people
// arms [shoulder pitch (+ forward), roll (out), elbow bend] per arm, in crewfig's terms
const CREW_ARMS = {
  side: [[0.05, 0.08, 0.15], [0.05, 0.08, 0.15]], table: [[0.3, 0.1, 1.0], [0.3, 0.1, 1.0]], wheel: [[0.5, 0.15, 1.15], [0.5, 0.15, 1.15]],
  binocs: [[1.25, 0.25, 2.1], [1.25, 0.25, 2.1]], point: [[0.1, 0.08, 0.2], [1.5, 0.05, 0.1]], controls: [[0.55, 0.15, 0.85], [0.45, 0.05, 1.0]],
  knees: [[0.45, 0.05, 0.75], [0.45, 0.05, 0.75]], rifle: [[0.75, 0.0, 1.1], [0.6, 0.0, 1.2]],
};
const GRIP_ARMS = { wheel: 1, binocs: 1, controls: 1, rifle: 1 };
// the rig pose (Euler XYZ per bone, the soldier faces -z) and the pelvis position for a crewfig pose
export function crewPose(pose = 'stand', arms = null, o = {}) {
  const P = {}, A = CREW_ARMS[arms || (pose === 'seated' ? 'knees' : 'side')] || CREW_ARMS.side;
  let pel = [0, 0.98, 0];
  if (pose === 'seated') { pel = [0, 0.14, 0.02]; P.spine = [0.08, 0, 0]; for (const s of ['L', 'R']) { P['thigh' + s] = [1.5, 0, s === 'L' ? -0.06 : 0.06]; P['shin' + s] = [-1.45, 0, 0]; P['foot' + s] = [0.0, 0, 0]; } }
  else if (pose === 'kneel') {   // look-faces: kneeling on the left knee, seat back over the tucked left heel, right foot flat ahead
    pel = [0, 0.46, 0.1]; P.spine = [-0.03, 0, 0];
    P.thighR = [1.86, 0, 0.12]; P.shinR = [-1.86, 0, 0]; P.footR = [0, 0, -0.12];
    P.thighL = [0.79, 0, -0.06]; P.shinL = [-2.58, 0, 0]; P.footL = [0.69, 0, 0];
  }
  // crewfig's arm 0 (its -x side, facing +z) ends up on our right after the 180-degree turn
  for (const [i, s] of [[0, 'R'], [1, 'L']]) { const [p, r, b] = A[i]; P['upperArm' + s] = [p, 0, s === 'L' ? -r : r]; P['forearm' + s] = [b, 0, 0]; }
  P.head = [o.look === 'down' ? -0.35 : 0, o.headYaw || 0, 0];
  return { pose: P, pelvis: pel, grip: !!GRIP_ARMS[arms] };
}
const CREW_SKIN = [0xc79a77, 0x8a5d40, 0x5e3f2c, 0xd2a888, 0xb5835e];
const OLDER = { officer: true, pilot: true, jetPilot: true, heloPilot: true, sailor: true };   // crews that may be in their 30s-40s (face 4)
const KIND_ROLE = { civil: 'civil', sailor: 'sailor', officer: 'officer', pilot: 'pilot', jetPilot: 'jetPilot', heloPilot: 'heloPilot', deck: 'deck', marine: 'marine', tanker: 'tanker' };
// a baked crew figure: position / normal / color (+ aFig / aRM / aPaint), indexed; facing +z, origin at the feet
// standing or the seat under the hips seated. o: { seed, jersey (hex), arms, look, headYaw, detail: 'crew' | 'near' }
export function crewPerson(kind, pose = 'stand', o = {}) {
  const seed = o.seed ?? 1, role = KIND_ROLE[kind] || 'sailor', cp = crewPose(pose, o.arms, o);
  const tone = o.skin ?? CREW_SKIN[seed % CREW_SKIN.length];
  const g0 = personGeometry(role, { lod: o.detail || 'crew', face: o.face ?? faceFor(seed, tone, OLDER[role]), hands: cp.grip ? 'grip' : 'open' });
  const g = bakedPerson(g0, cp.pose, cp.pelvis);
  g.rotateY(Math.PI);
  // the person's skin tone and the jersey / shirt colour into the vertex colours (no per-person material)
  const toneC = new THREE.Color(tone), base = new THREE.Color(SKIN0), tint = new THREE.Color(o.paint ?? o.jersey ?? 0xffffff);
  const c = g.attributes.color, f = g.attributes.aFig, p = g.attributes.aPaint;
  for (let i = 0; i < c.count; i++) {
    const sw = f.getZ(i), pw = p ? p.getX(i) : 0;
    let r = c.getX(i), gg = c.getY(i), b = c.getZ(i);
    r *= 1 + sw * (toneC.r / base.r - 1); gg *= 1 + sw * (toneC.g / base.g - 1); b *= 1 + sw * (toneC.b / base.b - 1);
    r *= 1 + pw * (tint.r - 1); gg *= 1 + pw * (tint.g - 1); b *= 1 + pw * (tint.b - 1);
    c.setXYZ(i, r, gg, b);   // (look-faces: the skin channel stays: wrap lighting and hair per pixel; crewMaterial's tone ratio is 1)
  }
  if (o.arms === 'rifle') {   // the M16A1 upright between the knees, muzzle up (a rounded stand-in, crew scale)
    const k = new Kit();
    k.rbox(0.045, 0.62, 0.06, 0.012, 0x1a1a1a, [0, 0.35, 0.36], [0, 0, 0], 1); k.cyl(0.011, 0.011, 0.36, 0x2a2a2a, [0, 0.84, 0.36], 'y', 8);
    k.rbox(0.03, 0.15, 0.06, 0.01, 0x1a1a1a, [0, 0.28, 0.4], [0, 0, 0], 1); k.rbox(0.045, 0.24, 0.07, 0.015, 0x1a1a1a, [0, 0.0, 0.36], [0, 0, 0], 1);
    const fb = new FigBuilder(); fb.addKit(k, { rough: 0.5 }, 'pelvis'); return mergeFig([g, fb.geometry()]);
  }
  return g;
}
export { cached as figCache };
