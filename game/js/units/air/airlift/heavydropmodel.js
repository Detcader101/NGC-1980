// heavydropmodel.js - the heavy-drop rigging drawn in the house style (flat-shaded Lambert, colours from materials,
// details as geometry): the platform (aluminium deck panels, side rails with the roller-lock notches, tie-down rings),
// paper honeycomb stacks under the vehicle, chain tie-downs, the four suspension slings to a clevis and the M-1 cargo
// parachute release, the packed G-11A bags and the extraction chute pack; the G-11A canopy (100 ft, 120 gores in two
// shades of olive drab, the vent, suspension lines to a riser) that deploys, opens reefed, disreefs and collapses;
// the ring-slot extraction parachute. Real metres. Frame of the platform: x right, y up, -z forward (the vehicle's
// nose), origin on the platform's underside centre.
import * as THREE from 'three';
import { pbr } from '../../../renderkit/gamemats.js';   // RENDERKIT surface

const M = c => pbr(() => new THREE.MeshLambertMaterial({ color: c, flatShading: true }), c, { flatShading: true }, 'paint');   // RENDERKIT surface
const PAL = { alu: 0x9a9fa3, aluD: 0x6d7276, kraft: 0xb89a62, kraftD: 0x8f7647, od: 0x4f5638, odD: 0x3b412b, odL: 0x667048, nylon: 0xc9c3a6, chain: 0x3a3c3e, ring: 0x9ba0a4, orange: 0xb5642c };
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
function merge(list, mat) {   // geometries of one material into one mesh
  const pos = [], nor = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return new THREE.Mesh(g, mat);
}

// R: heavydrop.js rigging(type); vehicle: the vehicle's model group (origin at its wheels / tracks, nose -z)
// The C-130's hold is 2.74 m (108 in) floor to ceiling, so a load is rigged low (FM 10-500 series practice): whip
// antennas off, an M35A2 with its cab top, bows, cover, ring mount and exhaust stack off and the windshield folded. The G-11A bags ride on a
// parachute stand at the platform's tail when there is room behind the vehicle (else on top of it / in the bed), and
// the suspension slings are folded on the load with the clevis on the stand until the canopies deploy (rig(k)).
export const HOLD_H = 2.74;
const STOW = { m35: ['cabTop', 'bows', 'cover', 'ringMount', 'exhaustStack'], m151: ['top', 'antenna', 'm60mount'] };
export function buildPlatform(R, vehicle) {
  const g = new THREE.Group(); g.name = 'hdPlatform';
  const L = R.len, W = R.wid, T = 0.12, HC = 0.3;   // deck thickness; honeycomb stack height (INFERRED)
  // stow what stands above the hold's height: named parts, then any thin mast (antennas) above it
  vehicle.updateMatrixWorld(true);
  for (const n of STOW[R.type] || []) { const o = vehicle.getObjectByName(n); if (o) o.visible = false; }
  for (const n of ['windshield', 'windscreen']) { const ws = vehicle.getObjectByName(n); if (ws) ws.rotation.x = -Math.PI / 2 + 0.05; }   // folded flat on the hood
  const _b = new THREE.Box3();
  vehicle.traverse(o => { if (!o.isMesh || !o.visible) return; _b.setFromObject(o); const w = Math.min(_b.max.x - _b.min.x, _b.max.z - _b.min.z); if (_b.max.y > HOLD_H - T - HC && w < 0.12) o.visible = false; });
  const vb = new THREE.Box3(); vehicle.traverseVisible(o => { if (o.isMesh) vb.expandByObject(o); });
  const vTop = vb.isEmpty() ? R.tall : vb.max.y, vLen = vb.isEmpty() ? L - 1 : vb.max.z - vb.min.z, vZ = vb.isEmpty() ? 0 : -(vb.min.z + vb.max.z) / 2;   // centred on the platform
  const alu = [], aluD = [], kraft = [], kraftD = [], od = [], chain = [], ring = [];
  // the deck: 2 ft panels with joint lines, side rails with notches for the rail locks, nose and tail bumpers
  for (let z = -L / 2; z < L / 2 - 0.01; z += 0.61) alu.push(box(W - 0.2, T, 0.59, 0, T / 2, z + 0.305));
  for (const s of [-1, 1]) { aluD.push(box(0.1, 0.2, L, s * (W / 2 - 0.05), 0.1, 0)); for (let z = -L / 2 + 0.3; z < L / 2; z += 0.61) aluD.push(box(0.11, 0.05, 0.12, s * (W / 2 - 0.05), 0.2, z)); }
  aluD.push(box(W, 0.18, 0.08, 0, 0.09, -L / 2), box(W, 0.18, 0.08, 0, 0.09, L / 2));
  // tie-down rings along the rails
  for (const s of [-1, 1]) for (let z = -L / 2 + 0.5; z < L / 2; z += 1.2) ring.push(new THREE.TorusGeometry(0.05, 0.012, 4, 6).rotateY(Math.PI / 2).translate(s * (W / 2 - 0.22), T + 0.04, z));
  // paper honeycomb: stacks under the axles / hull, a lighter face and the darker cut edges
  const stacks = R.type === 'm113' ? [[0, -L * 0.3, W - 0.5, L * 0.28], [0, 0, W - 0.5, L * 0.22], [0, L * 0.3, W - 0.5, L * 0.28]] : [[0, -L * 0.28, W - 0.6, 0.9], [0, L * 0.26, W - 0.6, 0.9], ...(R.type === 'm35' ? [[0, 0.05, W - 0.6, 0.9]] : [])];
  for (const [x, z, w, d] of stacks) { kraft.push(box(w, HC, d, x, T + HC / 2, z)); kraftD.push(box(w + 0.02, 0.03, d + 0.02, x, T + HC * 0.33, z), box(w + 0.02, 0.03, d + 0.02, x, T + HC * 0.66, z)); }
  // packed G-11A bags (one per canopy) and the extraction pack at the rear; the clevis + M-1 release
  const top = vTop + T + HC, spare = (L - vLen) / 2 * (L - vLen > 2 ? 2 : 1);   // (a long platform: the vehicle forward, the stand behind it)
  let standTop = T + 0.1;
  if (spare >= 0.95) {   // a parachute stand behind the vehicle: up to three across, stacked two high
    const across = Math.min(3, R.chutes), zc = L / 2 - spare / 2 - 0.05;
    aluD.push(box(W - 0.4, 0.06, 0.95, 0, T + 0.25, zc)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) aluD.push(box(0.06, 0.25, 0.06, sx * (W / 2 - 0.3), T + 0.12, zc + sz * 0.42));
    for (let i = 0; i < R.chutes; i++) { const col = i % across, row = Math.floor(i / across); od.push(box(0.72, 0.48, 0.88, (col - (across - 1) / 2) * 0.76, T + 0.28 + 0.24 + row * 0.5, zc)); standTop = Math.max(standTop, T + 0.28 + 0.48 + row * 0.5); }
  } else if (R.type === 'm35') {   // in the cargo bed (cover and bows stowed), two by two
    for (let i = 0; i < R.chutes; i++) { const c = i % 2 ? 1 : -1, k = Math.floor(i / 2); od.push(box(0.72, 0.48, 0.88, c * 0.42, T + HC + 1.3 + 0.24, 0.9 + k * 0.95)); standTop = T + HC + 1.3 + 0.48; }
  } else {   // the jeep: its one bag in the rear cargo space, behind the seats
    for (let i = 0; i < R.chutes; i++) { const y = T + HC + 0.72; od.push(box(0.72, 0.48, 0.8, 0, y + 0.24, vZ + 1.2 - i * 0.85)); standTop = y + 0.48; }
  }
  od.push(box(0.5, 0.35, 0.55, 0, T + 0.3, L / 2 - 0.35 + (spare >= 0.95 ? 0.05 : 0)));
  const g1 = merge(alu, M(PAL.alu)), g2 = merge(aluD, M(PAL.aluD)), g3 = merge(kraft, M(PAL.kraft)), g4 = merge(kraftD, M(PAL.kraftD)), g5 = merge(od, M(PAL.od)), g6 = merge(ring, M(PAL.ring));
  for (const m of [g1, g2, g3, g4, g6]) g.add(m);
  const bags = g5; g.add(bags);
  // the vehicle on its honeycomb
  vehicle.position.set(0, T + HC, spare >= 0.95 && L - vLen > 2 ? vZ - (L - vLen) / 2 + 0.15 : vZ); g.add(vehicle);
  // chain tie-downs: rail rings to the vehicle's tie-down points (lines)
  const pts = [];
  for (const s of [-1, 1]) for (const z of [-L * 0.38, -L * 0.12, L * 0.12, L * 0.38]) pts.push(s * (W / 2 - 0.22), T + 0.05, z, s * 0.6, T + HC + 0.45, z * 0.8);
  // the suspension slings: platform corners up to the clevis 1.4 m over the load's top once deployed; folded on the
  // load (not drawn) with the clevis on the stand / the bags while it is in the hold
  const clevisY = top + 1.4, slings = [], corners = [];
  for (const s of [-1, 1]) for (const z of [-L / 2 + 0.3, L / 2 - 0.3]) { corners.push([s * (W / 2 - 0.15), T + 0.1, z]); slings.push(s * (W / 2 - 0.15), T + 0.1, z, 0, clevisY, 0); }
  const stowed = [0, Math.min(standTop + 0.12, HOLD_H - 0.2), spare >= 0.95 ? L / 2 - spare / 2 - 0.05 : R.type === 'm35' ? 1.4 : vZ + 1.2];
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute([...pts], 3));
  const chains = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: PAL.chain })); g.add(chains);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(slings, 3));
  const susp = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: PAL.nylon })); g.add(susp);
  const clevis = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.16), M(PAL.aluD)); g.add(clevis);
  const sp = sg.attributes.position;
  const P = { group: g, vehicle, bags, susp, clevis, clevisY, top, deck: T + HC, stowed,
    // k 0: stowed in the hold; 1: the slings stretched to the clevis over the load (the canopies pull it up)
    rig(k) {
      const x = stowed[0], y = stowed[1] + (clevisY - stowed[1]) * k, z = stowed[2] * (1 - k);
      clevis.position.set(x, y, z); P.clevisY = y; P.clevisZ = z; susp.visible = k > 0.02;
      corners.forEach((c, i) => { sp.setXYZ(i * 2, c[0], c[1], c[2]); sp.setXYZ(i * 2 + 1, x, y, z); }); sp.needsUpdate = true;
    },
    crush(k) { for (const m of [g3, g4]) m.scale.y = 1 - 0.45 * k; vehicle.position.y = T + HC * (1 - 0.45 * k); } };
  P.rig(0);
  return P;
}

// a G-11A canopy: 30.5 m nominal (inflated ~23 m across, ~10 m deep), 120 gores; the suspension lines (~1 D) meet at the
// riser's link at the origin; the canopy hangs above along +y. animate(open 0..1, collapse 0..1, time)
export function buildG11() {
  const g = new THREE.Group(); g.name = 'G-11A';
  const N = 24, rings = 6, R = 11.6, Hd = 9.5, LINE = 25;   // 24 drawn gores (each stands for 5), INFERRED proportions
  const pos = [], cols = [], c0 = new THREE.Color(PAL.od), c1 = new THREE.Color(PAL.odL), c2 = new THREE.Color(PAL.nylon);
  const P = (k, j) => { const a = k / N * Math.PI * 2, t = j / rings, polar = 0.12 + t * (Math.PI * 0.5 - 0.12), r = R * Math.sin(polar), y = LINE + Hd * Math.cos(polar) - Hd * 0.08; return [Math.sin(a) * r, y, Math.cos(a) * r]; };
  for (let k = 0; k < N; k++) for (let j = 0; j < rings; j++) {
    const a = P(k, j), b = P(k + 1, j), c = P(k + 1, j + 1), d = P(k, j + 1);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    const col = j === rings - 1 && k % 6 === 0 ? c2 : k % 2 ? c0 : c1;
    for (let i = 0; i < 6; i++) cols.push(col.r, col.g, col.b);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const dome = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })); g.add(dome);
  const lp = []; for (let k = 0; k < N; k += 2) { const s = P(k, rings); lp.push(0, 0, 0, ...s); }
  const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: PAL.nylon, transparent: true, opacity: 0.7 })); g.add(lines);
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 0.9), M(PAL.od)); g.add(bag);
  // open: 0 in the bag, deploying (lines stretch out, a long sleeve), reefed (~0.1: a narrow tulip), disreef -> full
  function animate(open = 1, collapse = 0, time = 0) {
    const deploying = open <= 0.001;
    bag.visible = deploying; dome.visible = lines.visible = !deploying;
    if (deploying) { g.scale.set(1, 1, 1); bag.position.set(0, 0, 0); return; }
    const r = Math.min(1, open), lat = 0.12 + 0.88 * Math.sqrt(r), breathe = 1 + 0.015 * Math.sin(time * 2.1);
    dome.scale.set(lat * breathe, (0.55 + 0.45 * r) * (1 - collapse * 0.85), lat * breathe);
    dome.position.y = (1 - (0.55 + 0.45 * r)) * LINE * 0.6 - collapse * LINE * 0.75;
    lines.scale.set(lat, 1 - collapse * 0.8, lat);
    lines.material.opacity = 0.7 * (1 - collapse * 0.6);
  }
  animate(1);
  return { group: g, dome, lines, animate, LINE };
}

// the ring-slot extraction parachute (15 / 22 / 28 ft): concentric bands with slots between them; origin at its line
export function buildRingSlot(dFt = 22) {
  const g = new THREE.Group(); g.name = 'ringslot';
  const R = dFt * 0.3048 * 0.36, D = R * 0.9, mats = [M(PAL.odL), M(PAL.nylon)];
  for (let i = 0; i < 5; i++) {   // five rings, a slot between each
    const r0 = R * (0.25 + i * 0.15), r1 = R * (0.37 + i * 0.15), y0 = -D * (1 - (i * 0.15 + 0.25) ** 1.6), y1 = -D * (1 - (i * 0.15 + 0.37) ** 1.6);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, Math.abs(y1 - y0) + 0.01, 16, 1, true).translate(0, (y0 + y1) / 2, 0), mats[i % 2]);
    m.material.side = THREE.DoubleSide; g.add(m);
  }
  const lp = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; lp.push(0, -D * 4.5, 0, Math.sin(a) * R * 0.97, -D * (1 - 0.97 ** 1.6), Math.cos(a) * R * 0.97); }
  const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  g.add(new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ color: PAL.nylon })));
  // the frame: the canopy's apex at the origin, the lines' confluence 4.5 D behind it (+y here points into the wind)
  return { group: g, LINE: D * 4.5 };
}
