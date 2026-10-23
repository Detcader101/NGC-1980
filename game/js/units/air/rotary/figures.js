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

const MAT = new Map();
const vcMat = (emissive = false) => { const k = emissive ? 'e' : 'n'; if (!MAT.has(k)) MAT.set(k, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...(emissive ? { emissive: 0x000000 } : {}) })); return MAT.get(k); };
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

// a shared geometry set per kind (built once): upper body, thigh, shin (+boot), arms + weapon
const GEO = {};
function marineGeo() {
  if (GEO.marine) return GEO.marine;
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
  const g = new THREE.Group(), m = vcMat(), hd = G.heads[(o.variant ?? Math.floor(Math.random() * 99)) % G.heads.length];
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
