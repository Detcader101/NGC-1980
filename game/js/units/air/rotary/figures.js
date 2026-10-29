// figures.js - stand-in soldiers for the transports' squads, kept deliberately simple and SWAPPABLE: the INFANTRY
// work builds the real soldier; whatever it exports only has to match this interface and be registered in FIGURES.
//
//   FIGURES[kind](opts) -> { group, pose(state, phase, dt) }
//   group: an Object3D with its origin between the feet, facing -z, metres
//   state: 'run' | 'walk' | 'stand' | 'kneel' | 'aim' | 'fall' | 'dead' | 'seated'; phase: gait cycle (rad) / fall 0..1
//
// 1980 Marine rifleman: M1 helmet with the Mitchell leaf cover, ERDL utilities, M1955 flak vest, ALICE pack with
// canteens on the belt, M16A1. RUNAWAY machine trooper: a tall ceramic-and-composite frame, a cyan sensor slit for
// a face, a seized modern carbine. Each figure is 6 meshes with one shared vertex-coloured material (cheap crowds).
import * as THREE from 'three';
import { RK } from '../../../renderkit/adopt.js';   // RENDERKIT figures
import { roundedBox, capsuleGeo, weldNormals, figMat } from '../../infantry/meshkit.js';
import { marineGeometry, bakedPerson } from '../../infantry/humanfig.js';   // ngc/look-people
import { figMaterial, FIG_BONES } from '../../infantry/figgeo.js';
const PARTS = (() => { try { return new URLSearchParams(location.search).has('figparts'); } catch (e) { return false; } })();

const MAT = new Map();
const vcMat = (emissive = false) => { const k = emissive ? 'e' : 'n'; if (!MAT.has(k)) MAT.set(k, FIG ? figMat('fabric', { roughness: 0.85 }) : new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...(emissive ? { emissive: 0x000000 } : {}) })); return MAT.get(k); };
const col = new THREE.Color();
// parts: [[geometry, hex], ...] -> one geometry with vertex colours
function paint(parts) {
  const pos = [], nor = [], cols = [];
  for (const [g0, hex] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); col.setHex(hex);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) cols.push(col.r, col.g, col.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}
const bx = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const sp = (r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 7, hs = 5, th = Math.PI) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, th).scale(sx, sy, sz).translate(x, y, z);
const cy = (r, h, x, y, z, seg = 6) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z);
const SKIN = [0xc39a78, 0x8d6448, 0x5e4030, 0xd2a888];

// ---- RENDERKIT figures (ngc/depth-figures): the crowd LOD rounded and smooth-shaded. Same pivots, same 6 meshes and
// one shared material, ~1.5k triangles a man (classic ~0.5k): rounded trunk and pack, capsule limbs, a head with a
// brow and nose under a proper M1 helmet with its rim, hands round the rifle, rounded boots.
const FIG = RK.on('figures');
const _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function paintS(parts) {   // like paint(), but every primitive keeps its own (smooth / crisp) normals
  const pos = [], nor = [], cols = [];
  for (const [g0, hex] of parts) {
    if (!g0.attributes.normal) g0.computeVertexNormals();
    const g = g0.index ? g0.toNonIndexed() : g0; col.setHex(hex);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) cols.push(col.r, col.g, col.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}
const rb = (w, h, d, r, x = 0, y = 0, z = 0, rx = 0) => { const g = roundedBox(w, h, d, r, 1); if (rx) g.rotateX(rx); return g.translate(x, y, z); };
const cap = (a, b, ra, rbb, seg = 6, body = 1) => { const { geo, q, mid } = capsuleGeo(a, b, ra, rbb, seg, 2, null, body); return geo.applyQuaternion(q).translate(...mid); };
const ell = (rx, ry, rz, x, y, z, seg = 7) => weldNormals(new THREE.SphereGeometry(1, seg, Math.max(5, seg * 0.66 | 0))).scale(rx, ry, rz).translate(x, y, z);
const cyS = (r0, r1, h, x, y, z, seg = 10) => new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z);
function marineGeoFig() {
  const ut = 0x4d5838, ut2 = 0x3c4330, vest = 0x48503a, pack = 0x535740, belt = 0x5a5a40, helm = 0x56603d, blk = 0x161616, mtl = 0x2a2a2a, brow = 0x2a2018;
  const heads = SKIN.map(skin => paintS([
    [rb(0.34, 0.3, 0.21, 0.08, 0, 1.05, 0), ut], [rb(0.39, 0.44, 0.27, 0.1, 0, 1.3, 0), vest], [cyS(0.19, 0.19, 0.07, 0, 1.06, 0, 10).scale(1, 1, 0.74), belt],
    [rb(0.3, 0.38, 0.17, 0.05, 0, 1.3, 0.21), pack], [cap([-0.1, 1.08, 0.2], [0.1, 1.08, 0.2], 0.05, 0.05), pack],
    [cyS(0.05, 0.05, 0.14, -0.17, 1.04, 0.05), ut2], [cyS(0.05, 0.05, 0.14, 0.17, 1.04, 0.05), ut2],
    [ell(0.07, 0.07, 0.075, -0.19, 1.47, 0), ut], [ell(0.07, 0.07, 0.075, 0.19, 1.47, 0), ut],                                   // shoulders
    [cap([0, 1.5, 0], [0, 1.6, -0.005], 0.055, 0.05), skin], [ell(0.082, 0.1, 0.098, 0, 1.665, -0.012, 8), skin],                // neck, head
    [ell(0.064, 0.064, 0.074, 0, 1.6, -0.035, 7), skin], [cap([0, 1.665, -0.1], [0, 1.635, -0.112], 0.009, 0.013, 6), skin],    // jaw, nose
    [cap([-0.045, 1.685, -0.088], [0.045, 1.685, -0.088], 0.011, 0.011, 6), brow],                                              // brow shade
    [new THREE.SphereGeometry(0.15, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 0.8, 1.08).translate(0, 1.7, 0.005), helm],   // M1 dome
    [new THREE.CylinderGeometry(0.16, 0.175, 0.022, 10, 1, true).scale(1, 1, 1.08).translate(0, 1.678, 0.005), helm],          // flared rim
  ]));
  const thigh = paintS([[cap([0, 0.02, 0], [0, -0.44, 0], 0.085, 0.064, 7, 1), ut]]);
  const shin = paintS([[cap([0, 0, 0], [0, -0.38, 0], 0.062, 0.054, 7, 1), ut], [rb(0.11, 0.1, 0.26, 0.035, 0, -0.43, -0.05), blk]]);
  // arms holding the M16A1 at the ready (pivot at the shoulders, y = 1.46): capsule arms from the shoulders to the hands
  const sh = [[-0.2, 0, 0], [0.2, 0, 0]], el = [[-0.22, -0.26, -0.12], [0.24, -0.25, -0.06]], hd = [[-0.06, -0.22, -0.48], [0.08, -0.2, -0.22]];
  const arms = paintS([
    ...[0, 1].map(i => [cap(sh[i], el[i], 0.055, 0.047, 6, 1), ut]), ...[0, 1].map(i => [cap(el[i], hd[i], 0.047, 0.04, 6, 1), ut]),
    [bx(0.05, 0.07, 0.62, 0.02, -0.14, -0.42), blk], [new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8).rotateX(Math.PI / 2).translate(0.02, -0.13, -0.9), mtl],   // receiver + barrel
    [bx(0.03, 0.13, 0.065, 0.02, -0.22, -0.4), blk], [bx(0.045, 0.11, 0.26, 0.02, -0.17, -0.06), blk], [bx(0.024, 0.06, 0.16, 0.02, -0.065, -0.42), blk],   // magazine, stock, carry handle
    [ell(0.042, 0.05, 0.05, hd[0][0], hd[0][1], hd[0][2], 7), SKIN[0]], [ell(0.042, 0.05, 0.05, hd[1][0], hd[1][1], hd[1][2], 7), SKIN[0]],   // hands
  ]);
  return GEO.marine = { heads, thigh, shin, arms, hip: 0.1, shoulder: 1.46, legY: 0.98 };
}

// ---- ngc/look-people: the crowd stand-in cut from the real Marine (humanfig.js, 'far' detail: ~1.5k triangles), the
// same 6 meshes and pivots. The person is baked holding the M16A1 at the ready, then its triangles go to the part of
// their main bone: trunk + head (one per skin tone), the thigh and the shin + boot (shared by both legs), the arms with
// the rifle. Utility camouflage per pixel (figgeo.js figMaterial), like the full figure.
function marineGeoLP() {
  const g0 = marineGeometry({ lod: 'far', face: 0, sleeves: 'rolled', vest: true, helmet: true, pack: true, frags: 0, hands: 'grip' });
  const si = g0.attributes.skinIndex, sw = g0.attributes.skinWeight;
  const main = new Uint8Array(si.count); for (let i = 0; i < si.count; i++) { let b = 0, w = -1; for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); b = si.getComponent(i, k); } main[i] = b; }
  // the arms at the ready: shoulder -> elbow -> hand directions (shoulder pivot frame, as the classic crowd arms)
  const rot = {}, inv = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), dn = new THREE.Vector3(0, -1, 0), e = new THREE.Euler();
  const arm = (s, el, hd) => { const sh = new THREE.Vector3(s === 'L' ? -0.19 : 0.19, -0.03, 0), E = new THREE.Vector3(...el), H = new THREE.Vector3(...hd);
    qa.setFromUnitVectors(dn, E.clone().sub(sh).normalize()); qb.setFromUnitVectors(dn, H.clone().sub(E).normalize());
    rot['upperArm' + s] = e.setFromQuaternion(qa, 'XYZ').toArray().slice(0, 3); rot['forearm' + s] = e.setFromQuaternion(inv.copy(qa).invert().multiply(qb), 'XYZ').toArray().slice(0, 3); rot['hand' + s] = [0, s === 'L' ? 0.6 : -0.3, 0]; };
  arm('L', [-0.22, -0.28, -0.12], [-0.06, -0.24, -0.45]); arm('R', [0.24, -0.28, -0.05], [0.08, -0.22, -0.2]);
  const posed = bakedPerson(g0, rot);
  const groups = { up: [], thigh: [], shin: [], arms: [] }, idx = posed.index;
  const which = b => { const n = FIG_BONES[b]; return /Arm|forearm|hand/.test(n) ? 'arms' : n === 'thighL' ? 'thigh' : n === 'shinL' || n === 'footL' ? 'shin' : /R$/.test(n) && /thigh|shin|foot/.test(n) ? null : 'up'; };
  for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2), gname = which(main[a]) || which(main[b]); if (gname) groups[gname].push(a, b, c); }
  const sub = (list, dx, dy, dz, tone) => {
    const map = new Map(), P = [], N = [], C = [], F = [], R = [], I = [], p = posed.attributes.position, n = posed.attributes.normal, c = posed.attributes.color, fg = posed.attributes.aFig, rm = posed.attributes.aRM;
    for (const v of list) { if (!map.has(v)) { map.set(v, P.length / 3); P.push(p.getX(v) + dx, p.getY(v) + dy, p.getZ(v) + dz); N.push(n.getX(v), n.getY(v), n.getZ(v)); const k = fg.getZ(v); C.push(c.getX(v) * (1 + k * (tone.r - 1)), c.getY(v) * (1 + k * (tone.g - 1)), c.getZ(v) * (1 + k * (tone.b - 1))); F.push(fg.getX(v), fg.getY(v), 0, fg.getW(v)); R.push(rm.getX(v), rm.getY(v)); } I.push(map.get(v)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aFig', new THREE.Float32BufferAttribute(F, 4)); g.setAttribute('aRM', new THREE.Float32BufferAttribute(R, 2)); g.setIndex(I); g.computeBoundingSphere(); return g;
  };
  const ref = new THREE.Color(0xc79a77), one = new THREE.Color(1, 1, 1);
  const heads = SKIN.map(h => { const t = new THREE.Color(h); return sub(groups.up, 0, 0, 0, new THREE.Color(t.r / ref.r, t.g / ref.g, t.b / ref.b)); });
  const thigh = sub(groups.thigh, 0.095, -0.92, 0, one), shin = sub(groups.shin, 0.095, -0.48, 0, one);
  const sh = 1.46;
  const arms = sub(groups.arms, 0, -sh, 0, one);
  // the rifle (a crowd-scale M16A1) in the hands
  const rifle = paint([[bx(0.05, 0.07, 0.62, 0.02, -0.14, -0.42), 0x161616], [new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8).rotateX(Math.PI / 2).translate(0.02, -0.13, -0.9), 0x2a2a2a],
    [bx(0.03, 0.13, 0.065, 0.02, -0.22, -0.4), 0x161616], [bx(0.045, 0.11, 0.26, 0.02, -0.17, -0.06), 0x161616], [bx(0.024, 0.06, 0.16, 0.02, -0.065, -0.42), 0x161616]]);
  const ri = rifle.attributes.position.count; rifle.setAttribute('aFig', new THREE.Float32BufferAttribute(new Float32Array(ri * 4), 4)); rifle.setAttribute('aRM', new THREE.Float32BufferAttribute(new Float32Array(ri * 2).fill(0.5), 2)); rifle.setIndex([...Array(ri).keys()]);
  const armsAll = new THREE.BufferGeometry(); for (const nme of ['position', 'normal', 'color', 'aFig', 'aRM']) { const a = arms.attributes[nme], b = rifle.attributes[nme], arr = new Float32Array(a.array.length + b.array.length); arr.set(a.array); arr.set(b.array, a.array.length); armsAll.setAttribute(nme, new THREE.BufferAttribute(arr, a.itemSize)); }
  armsAll.setIndex([...arms.index.array, ...rifle.index.array.map(i => i + arms.attributes.position.count)]); armsAll.computeBoundingSphere();
  return GEO.marine = { heads, thigh, shin, arms: armsAll, hip: 0.095, shoulder: sh, legY: 0.92, mat: figMaterial({ camo: 'erdl', seed: 2 }) };
}

// a shared geometry set per kind (built once): upper body, thigh, shin (+boot), arms + weapon
const GEO = {};
function marineGeo() {
  if (GEO.marine) return GEO.marine;
  if (FIG && !PARTS) return marineGeoLP();
  if (FIG) return marineGeoFig();
  const ut = 0x4d5838, ut2 = 0x3c4330, vest = 0x48503a, pack = 0x535740, belt = 0x5a5a40, helm = 0x56603d, blk = 0x161616, mtl = 0x2a2a2a;
  const heads = SKIN.map(skin => paint([
    [bx(0.34, 0.32, 0.2, 0, 1.06, 0), ut], [bx(0.38, 0.44, 0.26, 0, 1.3, 0.0), vest], [bx(0.36, 0.08, 0.27, 0, 1.06, 0), belt],   // hips, vest, belt
    [bx(0.3, 0.38, 0.17, 0, 1.3, 0.21), pack], [bx(0.22, 0.12, 0.1, 0, 1.08, 0.2), pack],                                        // ALICE pack + butt pack
    [cy(0.05, 0.14, -0.17, 1.04, 0.05), ut2], [cy(0.05, 0.14, 0.17, 1.04, 0.05), ut2],                                             // canteens
    [bx(0.11, 0.08, 0.11, 0, 1.55, 0), skin], [sp(0.1, 0, 1.66, -0.01, 1, 1.1, 1), skin],                                          // neck, head
    [sp(0.145, 0, 1.69, 0.01, 1, 0.85, 1.08, 9, 5, 1.75), helm], [bx(0.3, 0.03, 0.32, 0, 1.62, 0.01), helm],                        // M1 helmet + brim
    [bx(0.07, 0.035, 0.05, -0.05, 1.68, -0.09), 0x2a2018], [bx(0.07, 0.035, 0.05, 0.05, 1.68, -0.09), 0x2a2018],                    // brows / shade
  ]));
  const thigh = paint([[bx(0.15, 0.46, 0.17, 0, -0.23, 0), ut]]);
  const shin = paint([[bx(0.13, 0.42, 0.14, 0, -0.21, 0), ut], [bx(0.13, 0.12, 0.26, 0, -0.44, -0.05), blk]]);
  // arms holding the M16A1 at the ready (pivot at the shoulders, y = 1.46)
  const arms = paint([
    [bx(0.11, 0.3, 0.12, -0.24, -0.1, -0.08).rotateX(0.5), ut], [bx(0.11, 0.3, 0.12, 0.24, -0.1, -0.08).rotateX(0.5), ut],
    [bx(0.09, 0.09, 0.32, -0.14, -0.2, -0.32), ut], [bx(0.09, 0.09, 0.32, 0.14, -0.16, -0.28), ut],
    [bx(0.05, 0.07, 0.62, 0.02, -0.14, -0.42), blk], [bx(0.035, 0.035, 0.42, 0.02, -0.13, -0.9), mtl],                            // receiver + barrel
    [bx(0.05, 0.13, 0.08, 0.02, -0.22, -0.4), blk], [bx(0.045, 0.11, 0.26, 0.02, -0.17, -0.06), blk], [bx(0.03, 0.08, 0.04, 0.02, -0.06, -0.5), blk],   // magazine, stock, carry handle
    [bx(0.08, 0.08, 0.08, -0.06, -0.24, -0.5), SKIN[0]], [bx(0.08, 0.08, 0.08, 0.1, -0.2, -0.22), SKIN[0]],
  ]);
  return GEO.marine = { heads, thigh, shin, arms, hip: 0.1, shoulder: 1.46, legY: 0.98 };
}
function machineGeo() {
  if (GEO.machine) return GEO.machine;
  const cer = 0xb9bcb8, cer2 = 0x8f938f, comp = 0x2a2d30, eye = 0x55f0ff, blk = 0x111214;
  const heads = [paint([
    [bx(0.3, 0.24, 0.2, 0, 1.12, 0), comp], [bx(0.42, 0.5, 0.24, 0, 1.42, 0), cer], [bx(0.3, 0.3, 0.16, 0, 1.38, 0.18), comp],   // pelvis, chest plate, power pack
    [bx(0.46, 0.08, 0.26, 0, 1.66, 0), cer2], [bx(0.08, 0.14, 0.08, 0, 1.75, 0), comp],                                          // shoulder yoke, neck
    [bx(0.2, 0.24, 0.26, 0, 1.92, 0.02), cer], [bx(0.16, 0.035, 0.03, 0, 1.94, -0.115), eye], [bx(0.05, 0.16, 0.05, 0.08, 2.08, 0.06), comp],   // head, sensor slit, antenna stub
  ])];
  const thigh = paint([[bx(0.12, 0.52, 0.14, 0, -0.26, 0), cer2], [bx(0.1, 0.1, 0.1, 0, -0.52, 0), comp]]);
  const shin = paint([[bx(0.1, 0.5, 0.12, 0, -0.25, 0), comp], [bx(0.12, 0.08, 0.3, 0, -0.52, -0.06), cer2]]);
  const arms = paint([
    [bx(0.09, 0.34, 0.1, -0.27, -0.12, -0.08).rotateX(0.5), cer2], [bx(0.09, 0.34, 0.1, 0.27, -0.12, -0.08).rotateX(0.5), cer2],
    [bx(0.08, 0.08, 0.36, -0.15, -0.24, -0.34), comp], [bx(0.08, 0.08, 0.36, 0.15, -0.2, -0.3), comp],
    [bx(0.06, 0.09, 0.7, 0.02, -0.17, -0.46), blk], [bx(0.05, 0.05, 0.3, 0.02, -0.15, -0.95), blk], [bx(0.05, 0.16, 0.08, 0.02, -0.28, -0.42), blk],
    [bx(0.06, 0.05, 0.14, 0.02, -0.08, -0.55), blk], [bx(0.02, 0.02, 0.02, 0.02, -0.08, -0.63), eye],                               // optic with a cyan lens
  ]);
  return GEO.machine = { heads, thigh, shin, arms, hip: 0.1, shoulder: 1.6, legY: 1.04 };
}

function buildFigure(G, o = {}) {
  const g = new THREE.Group(), m = G.mat || vcMat(), hd = G.heads[(o.variant ?? Math.floor(Math.random() * 99)) % G.heads.length];
  const body = new THREE.Group(); g.add(body);
  const upper = new THREE.Mesh(hd, m); body.add(upper);
  const legs = [-1, 1].map(s => { const hip = new THREE.Group(); hip.position.set(s * G.hip, G.legY, 0); body.add(hip); hip.add(new THREE.Mesh(G.thigh, m));
    const knee = new THREE.Group(); knee.position.y = -(G.legY / 2 - 0.02); hip.add(knee); knee.add(new THREE.Mesh(G.shin, m)); return { hip, knee }; });
  const arms = new THREE.Group(); arms.position.y = G.shoulder; body.add(arms); arms.add(new THREE.Mesh(G.arms, m));
  const scale = o.scale ?? (0.95 + Math.random() * 0.1); g.scale.setScalar(scale);
  // pose: legs swing in the gait, torso leans into a run, kneel drops the hips, fall / dead lie the figure down
  function pose(state, ph = 0) {
    const sn = Math.sin(ph), L = legs;
    body.rotation.set(0, 0, 0); body.position.set(0, 0, 0); arms.rotation.set(0, 0, 0);
    for(const l of L){l.hip.rotation.set(0,0,0);l.knee.rotation.set(0,0,0);} // no knee bend leaks from a previous seated or casualty pose
    if (state === 'run' || state === 'walk') {
      const a = state === 'run' ? 0.75 : 0.4;
      L[0].hip.rotation.x = sn * a; L[1].hip.rotation.x = -sn * a;
      L[0].knee.rotation.x = -Math.max(0, -Math.cos(ph)) * a * 1.4; L[1].knee.rotation.x = -Math.max(0, Math.cos(ph)) * a * 1.4;   // + hip = thigh forward, - knee = shin back
      body.rotation.x = state === 'run' ? -0.25 : -0.06; body.position.y = Math.abs(Math.cos(ph)) * (state === 'run' ? 0.06 : 0.02);
      arms.rotation.x = 0.1 + sn * 0.05;
    } else if (state === 'kneel' || state === 'aim') {   // right knee down, left foot forward, rifle up
      L[0].hip.rotation.x = 1.45; L[0].knee.rotation.x = -1.45; L[1].hip.rotation.x = -0.15; L[1].knee.rotation.x = -1.5; body.position.y = -0.47; body.rotation.x = 0.05; arms.rotation.x = state === 'aim' ? 0.42 : 0.15;
    } else if (state === 'seated') {
      for (const l of L) { l.hip.rotation.x = 1.5; l.knee.rotation.x = -1.5; } body.position.y = -0.45;
    } else if (state === 'prone') {
      body.rotation.x=-1.5;body.position.y=.15;body.position.z=.68;L[0].hip.rotation.z=-.14;L[1].hip.rotation.z=.14;arms.rotation.x=.18;
    } else if (state === 'fall' || state === 'dead') {
      const k = state === 'dead' ? 1 : Math.min(1, ph);
      body.rotation.x = k * 1.5; body.position.y = 0.12 * k; body.position.z = k * 0.9;
      L[0].hip.rotation.x = -0.3 * k; L[1].hip.rotation.x = 0.2 * k; arms.rotation.x = -0.6 * k;
    } else { for (const l of L) l.hip.rotation.x = l.knee.rotation.x = 0; arms.rotation.x = 0.05; }
  }
  pose('stand');
  return { group: g, pose };
}
export const buildMarine = o => buildFigure(marineGeo(), o);
export const buildMachineTrooper = o => buildFigure(machineGeo(), { ...o, variant: 0 });
// the registry the squads use: swap these for the INFANTRY / RW-1 models when they land
export const FIGURES = { marine: buildMarine, machine: buildMachineTrooper };
