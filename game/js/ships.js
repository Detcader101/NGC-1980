// Models for the island war: the two carriers, the enemy battleship (LEVIATHAN) and supply ship (the naval ones are
// built in units/naval/ and wrapped here under their old names), capture drones, enemy transports and the island
// buildings. Low-poly, flat-shaded, built from primitives. Local frame: +y up, the bow / nose points along -z.
import * as THREE from 'three';
import { buildFactionStructure } from './world/structures.js';   // WORLD: faction structures
import { buildAlbatross } from './units/naval/albatross.js';
import { buildKraken } from './units/naval/kraken.js';
import { buildLeviathan, LEV } from './units/naval/leviathan.js';
import { buildContainerShip, BOX } from './units/naval/containership.js';
import { buildCH46Mesh } from './units/air/rotary/ch46model.js';
import { buildMV22Mesh } from './units/air/rotary/mv22model.js';
import { buildWaspMesh } from './units/air/rotary/waspmodel.js';

const M = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 20, ...o });
const box = (w, h, d, m, x = 0, y = 0, z = 0, parent) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent && parent.add(b); return b; };
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, parent, seg = 10) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y, z); parent && parent.add(c); return c; };
export const TEAM = { 0: 0xc8c8bc, 1: 0x33bbff, 2: 0xff3322 };

// ------------------------------------------------------------------------------------------- carriers
export const CARRIER = { L: 120, W: 28, DECK: 8, TOWER_X: 10.5, TOWER_Z: 6, TOWER_H: 17 };
// The carriers are built in units/naval/: ALBATROSS (side 1), KRAKEN (side 2). buildCarrier keeps its name and return shape
// { group, guns, dish, lamp, lights, teamM, tower, band } plus the new parts (mounts, crew, tick, localDeck).
export function buildCarrier(side) {
  if (side === 1) return buildAlbatross(1, { buildTomcat });
  return buildKraken();
}
// SKY CARRIER refit: four ducted lift fans on outriggers off the hull, hidden until the refit unfolds them.
// parts.fans[i] = { arm, rotor, glow }; arm.scale.x animates the fold-out (0 = stowed).
export const FAN_POS = [[-1, -38], [1, -38], [-1, 36], [1, 36]];
export function addLiftFans(parts) {
  const g = parts.group, { W, DECK } = CARRIER, steel = M(0x4d5660, { shininess: 40 }), dark = M(0x1c1f23);
  const glowM = new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.0 });
  parts.fans = [];
  for (const [sd, z] of FAN_POS) {
    const arm = new THREE.Group(); arm.position.set(sd * W * 0.42, DECK - 2.5, z); g.add(arm);
    const inner = new THREE.Group(); inner.scale.x = sd; arm.add(inner);   // build for the starboard side, mirror for port
    box(12, 2.2, 5, steel, 6, 0, 0, inner); box(12, 0.5, 5.6, dark, 6, 1.3, 0, inner);
    const fan = new THREE.Group(); fan.position.set(17, 0, 0); inner.add(fan);
    const duct = new THREE.Mesh(new THREE.TorusGeometry(7.6, 1.0, 8, 32).rotateX(Math.PI / 2), steel); fan.add(duct);
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.2, 2.4, 32, 1, true), steel); lip.material = steel.clone(); lip.material.side = THREE.DoubleSide; fan.add(lip);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(7.0, 0.25, 6, 32).rotateX(Math.PI / 2), glowM.clone()); glow.position.y = -1.1; fan.add(glow);
    cyl(1.6, 1.6, 2.6, dark, 0, 0, 0, fan, 12);
    for (const a of [0, Math.PI / 2]) { const st = box(15, 0.3, 0.5, dark, 0, -0.6, 0, fan); st.rotation.y = a; }   // stators
    const rotor = new THREE.Group(); rotor.position.y = 0.4; fan.add(rotor);
    for (let i = 0; i < 7; i++) { const b = box(6.8, 0.15, 1.1, M(0x8a939c), 4.6, 0, 0, rotor); b.rotation.x = 0.35; const piv = new THREE.Group(); piv.rotation.y = i / 7 * Math.PI * 2; rotor.add(piv); piv.add(b); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbbccdd, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); disc.position.y = 0.45; fan.add(disc);
    arm.scale.set(0.001, 0.001, 0.001); arm.visible = false;
    parts.fans.push({ arm, rotor, glow, disc, sd, z });
  }
  return parts.fans;
}

// ------------------------------------------------------------------------------------------- battleship
export const BSHIP = LEV;   // RW-9 LEVIATHAN (units/naval/leviathan.js): { group, turrets, guns } + mounts, tick, localDeck
export function buildBattleship() { return buildLeviathan(); }
// ------------------------------------------------------------------------------------------- freighter
// enemy supply ship (an autonomous container ship): carries its islands' output to the KRAKEN
export const FREIGHTER = BOX;   // the autonomous container ship (units/naval/containership.js): { group, guns } + mounts, tick, localDeck
export function buildFreighter() { return buildContainerShip(); }
// ------------------------------------------------------------------------------------------- aircraft
// NGC-1980: the capture drone, the twin-rotor transport and the saucer gunship are replaced by the rotary units
// (game/js/units/air/rotary/): these names stay as wrappers for anything that still builds them. The blue "escort"
// variant of the saucer is retired - the Tomcats fly escort, and a 1980 task force has no hover drones.
export function buildDrone() { const m = buildCH46Mesh(); return { group: m.group, rotors: [], model: m }; }          // CH-46E Sea Knight
export function buildTransport() { const m = buildMV22Mesh(); return { group: m.group, rotors: [], model: m }; }      // RUNAWAY MV-22B
export function buildGunship() { const m = buildWaspMesh(); return { group: m.group, model: m }; }                    // RW-3 WASP

// ------------------------------------------------------------------------------------------- escort fighter
// Cold War carrier fighter (Tomcat-like): twin tails, wide flat body between the engine nacelles, tandem canopy, and
// swing wings on pivots (parts.wings[0] = right, [1] = left; rotation.y sweeps them back). Nose along -z.
export function buildTomcat(side = 1) {
  const g = new THREE.Group(), grey = M(0xa7acaf, { shininess: 35 }), dark = M(0x34383c), glass = M(0x203848, { emissive: 0x0a1822, shininess: 90 }), team = M(TEAM[side], { emissive: side === 1 ? 0x0a2a44 : 0x440a06 });
  const S = 0.62;   // whole airframe scale (about 12 m long)
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x * S, y * S, z * S); g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.55 * S, 0.75 * S, 7 * S, 10).rotateX(Math.PI / 2), grey, 0, 0.15, -5.2);          // forward fuselage
  add(new THREE.ConeGeometry(0.55 * S, 2.6 * S, 10).rotateX(-Math.PI / 2), grey, 0, 0.15, -10);                       // nose
  add(new THREE.ConeGeometry(0.2 * S, 0.7 * S, 8).rotateX(-Math.PI / 2), dark, 0, 0.15, -11.4);                       // pitot / radome tip
  const can = add(new THREE.SphereGeometry(0.62 * S, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.55, -6.2); can.scale.set(0.85, 0.9, 3.2);   // tandem canopy
  add(new THREE.BoxGeometry(3.4 * S, 0.65 * S, 8.5 * S), grey, 0, 0, 0.6);                                           // the 'pancake' between the engines
  for (const x of [-1.45, 1.45]) {
    add(new THREE.CylinderGeometry(0.72 * S, 0.68 * S, 9 * S, 10).rotateX(Math.PI / 2), grey, x, -0.2, 1.4);         // nacelles
    add(new THREE.BoxGeometry(1.05 * S, 1.35 * S, 2.2 * S), grey, x, -0.15, -3.8);                                   // boxy intakes
    add(new THREE.BoxGeometry(0.8 * S, 1.0 * S, 0.1 * S), dark, x, -0.15, -4.92);
    add(new THREE.CylinderGeometry(0.62 * S, 0.5 * S, 1 * S, 10).rotateX(Math.PI / 2), dark, x, -0.2, 6.2);          // nozzles
    const fin = add(new THREE.BoxGeometry(0.14 * S, 3 * S, 2.4 * S), grey, x, 1.6, 4.4); fin.rotation.z = -Math.sign(x) * 0.17; fin.rotation.x = 0.35;   // twin canted tails
    const flash = add(new THREE.BoxGeometry(0.16 * S, 1.1 * S, 1.5 * S), team, x + Math.sign(x) * 0.08, 2.3, 4.7); flash.rotation.z = fin.rotation.z; flash.rotation.x = 0.35;
  }
  // gloves (fixed) and the tailerons
  const tri = (pts, m, y) => { const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a * S, b * S))); const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.12 * S, bevelEnabled: false }).rotateX(Math.PI / 2); const o = new THREE.Mesh(geo, m); o.position.y = y * S; g.add(o); return o; };
  tri([[1.6, -4.5], [3.0, -0.4], [3.0, 1.2], [1.6, 1.2]], grey, 0.1); tri([[-1.6, -4.5], [-1.6, 1.2], [-3.0, 1.2], [-3.0, -0.4]], grey, 0.1);
  tri([[1.9, 4.2], [4.6, 6.4], [4.6, 7.0], [1.9, 6.6]], grey, 0); tri([[-1.9, 4.2], [-1.9, 6.6], [-4.6, 7.0], [-4.6, 6.4]], grey, 0);
  // swing wings
  const wings = [];
  for (const sd of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(2.7 * sd * S, 0.12 * S, -0.1 * S); g.add(piv);
    const pts = [[0, -0.9], [6.4, 0.1], [6.4, 0.95], [0, 1.4]].map(([a, b]) => new THREE.Vector2(a * sd * S, b * S));
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(sd > 0 ? pts : pts.reverse()), { depth: 0.1 * S, bevelEnabled: false }).rotateX(Math.PI / 2);
    piv.add(new THREE.Mesh(geo, grey)); wings.push(piv);
    const tipLight = new THREE.Mesh(new THREE.BoxGeometry(0.2 * S, 0.12 * S, 0.3 * S), new THREE.MeshBasicMaterial({ color: sd > 0 ? 0x30ff40 : 0xff3030 })); tipLight.position.set(6.3 * sd * S, 0, 0.5 * S); piv.add(tipLight);
  }
  const nozzles = [new THREE.Vector3(-1.45 * S, -0.2 * S, 6.9 * S), new THREE.Vector3(1.45 * S, -0.2 * S, 6.9 * S)];
  const tips = [new THREE.Vector3(6.3 * S, 0, 0.4 * S), new THREE.Vector3(-6.3 * S, 0, 0.4 * S)];
  return { group: g, wings, nozzles, tips };
}

// ------------------------------------------------------------------------------------------- dropship
// our four-engined steel transport (Hercules-like): high wing, upswept tail, rear ramp. Flies the repair team out.
export function buildDropship() {
  const g = new THREE.Group(), steel = M(0x6c747c, { shininess: 40 }), dark = M(0x2a2e33), glass = M(0x1a2a36, { emissive: 0x0a1820 }), team = M(TEAM[1], { emissive: 0x0a2a44 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 20, 12).rotateX(Math.PI / 2), steel); fus.scale.y = 1.05; g.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), steel); nose.scale.set(1, 1, 1.5); nose.position.z = -10; g.add(nose);
  const glazing = box(3.2, 0.8, 1.6, glass, 0, 1.1, -11.2, g);   // cockpit glazing (hidden from inside)
  // tail: tapers and sweeps up to the fin; the ramp is the flat underside
  const tg = new THREE.CylinderGeometry(0.7, 2.1, 9, 12, 1, false).rotateX(-Math.PI / 2); const tail = new THREE.Mesh(tg, steel); tail.position.set(0, 0.9, 14.3); tail.rotation.x = -0.2; g.add(tail);
  box(3, 0.25, 7, dark, 0, -1.2, 13.4, g).rotation.x = -0.32;
  box(0.35, 7.5, 5.2, steel, 0, 4.6, 17, g).rotation.x = 0.28;                       // fin
  box(15, 0.3, 3.2, steel, 0, 1.9, 17.8, g);                                         // tailplane
  box(40, 0.55, 4.6, steel, 0, 2.35, -1.5, g);                                       // high wing
  for (const x of [-15, 15]) cyl(1.1, 1.1, 0.06, team, x, 2.66, -1.5, g, 16);       // roundels
  box(0.35, 3.6, 2.8, team, 0, 4.6, 17.3, g);                                        // team flash on the fin
  const props = [];
  for (const x of [-12.5, -6.5, 6.5, 12.5]) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 5.2, 10).rotateX(Math.PI / 2), steel); n.position.set(x, 1.8, -3.2); g.add(n);
    cyl(0.35, 0.6, 0.9, dark, x, 1.8, -6.1, g, 8).rotation.x = Math.PI / 2;
    const pr = new THREE.Group(); pr.position.set(x, 1.8, -6.6); g.add(pr); props.push(pr);
    pr.add(new THREE.Mesh(new THREE.CircleGeometry(2.3, 20), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })));
    for (let k = 0; k < 4; k++) { const b = box(0.28, 2.2, 0.08, dark, 0, 0, 0, pr); b.geometry.translate(0, 1.1, 0); b.rotation.z = k * Math.PI / 2; }
  }
  box(4.6, 1.4, 4.2, steel, 0, -1.9, -1, g);                                         // landing gear sponsons
  const lamp = box(0.3, 0.3, 0.3, new THREE.MeshBasicMaterial({ color: 0xff3020 }), 0, 2.4, 2, g);
  return { group: g, props, lamp, glazing };
}
// a paratrooper (repair crew) with a ram-air canopy that unfurls on opening
export function buildJumper() {
  const g = new THREE.Group(), kit = M(0x4c5636), skin = M(0xc89a74), dark = M(0x1d2018);
  const body = new THREE.Group(); g.add(body);
  box(0.46, 0.62, 0.3, kit, 0, 0.95, 0, body); box(0.4, 0.5, 0.26, dark, 0, 0.98, 0.25, body);   // torso, pack
  box(0.26, 0.26, 0.26, skin, 0, 1.42, 0, body); box(0.32, 0.14, 0.32, kit, 0, 1.58, 0, body);   // head, helmet
  const legs = [], arms = [];
  for (const x of [-0.12, 0.12]) { const l = box(0.17, 0.66, 0.2, kit, x, 0, 0, body); l.geometry.translate(0, -0.33, 0); l.position.set(x, 0.66, 0); legs.push(l); }
  for (const x of [-0.31, 0.31]) { const a = box(0.13, 0.56, 0.15, kit, x, 0, 0, body); a.geometry.translate(0, -0.26, 0); a.position.set(x, 1.24, 0); arms.push(a); }
  box(0.34, 0.4, 0.16, M(0xa83a1c), 0.32, 0.55, 0, body);   // jerrycan / toolbox
  const canopy = new THREE.Group(); canopy.position.y = 6.2; g.add(canopy);
  const c1 = M(TEAM[1], { side: THREE.DoubleSide }), c2 = M(0xe8e8e0, { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.16, c = box(0.96, 0.42, 2.5, i % 2 ? c2 : c1, Math.sin(a) * 3.4, Math.cos(a) * 3.4 - 3.4, 0, canopy); c.rotation.z = -a; }
  const lineMat = new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 });
  const pts = []; for (const x of [-3.2, -1.1, 1.1, 3.2]) for (const z of [-1, 1]) { const a = x / 3.4 * 0.48; pts.push(0, -4.9, 0, Math.sin(a) * 3.3, Math.cos(a) * 3.3 - 3.6, z); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); canopy.add(new THREE.LineSegments(lg, lineMat));
  return { group: g, body, canopy, legs, arms };
}

// ------------------------------------------------------------------------------------------- buildings
// AA gun: yaw on the base, the twin barrels pitch. s = scale.
export function buildGun(side, s = 1) {
  const g = new THREE.Group(), base = M(0x4a4d4a), team = M(TEAM[side], { emissive: side === 1 ? 0x0a2a44 : side === 2 ? 0x440a06 : 0x222222 });
  cyl(1.5 * s, 1.8 * s, 1.2 * s, base, 0, 0.6 * s, 0, g, 8);
  const yaw = new THREE.Group(); yaw.position.y = 1.2 * s; g.add(yaw);
  box(2.2 * s, 1.3 * s, 2.2 * s, team, 0, 0.65 * s, 0, yaw);
  const pitch = new THREE.Group(); pitch.position.set(0, 0.8 * s, -0.4 * s); yaw.add(pitch);
  for (const x of [-0.45, 0.45]) { const b = cyl(0.14 * s, 0.17 * s, 3 * s, M(0x222222), x * s, 0, -1.4 * s, pitch, 6); b.rotation.x = Math.PI / 2; }
  g.userData = { yaw, pitch, team };
  return g;
}
// island buildings: hq / factory (depot) / fuel / radar are the faction structures in world/structures.js (1980 and
// RUNAWAY styles, damage states, ownership changes); the shipyard stays here
export function buildStructure(kind, side) {
  if (kind !== 'shipyard') return buildFactionStructure(kind, side);
  const g = new THREE.Group(), dark = M(0x3a3c3e);
  const team = M(TEAM[side], { emissive: 0x111111 });
  const ud = { team, kind, h: 6, r: 5 };
  if (kind === 'shipyard') {   // the enemy slipway where the battleship is built
    for (const x of [-11, 11]) { box(1.2, 14, 1.2, dark, x, 7, -14, g); box(1.2, 14, 1.2, dark, x, 7, 14, g); box(1.2, 1.2, 30, dark, x, 14, 0, g); }
    box(23, 1.2, 1.2, M(0xd0a020), 0, 14, -6, g); box(23, 1.2, 1.2, M(0xd0a020), 0, 14, 8, g);
    box(18, 1, 34, M(0x55524c), 0, 0.5, 0, g); box(4, 4, 4, team, -9, 2, 16, g);
    const hull = box(8, 4, 26, M(0x3e3a3a), 0, 3, 0, g); hull.scale.y = 0.01; ud.hull = hull;
    ud.h = 14; ud.r = 13;
  }
  g.userData = ud;
  return g;
}
// rubble left where a building stood (persistent)
export function buildRubble(r) {
  const g = new THREE.Group(), m = M(0x2c2a28), m2 = M(0x46423c);
  for (let i = 0; i < 9; i++) {
    const s = r * (0.25 + Math.random() * 0.35), b = box(s, s * 0.5, s * (0.6 + Math.random()), i % 2 ? m : m2, (Math.random() - 0.5) * r * 1.4, s * 0.2, (Math.random() - 0.5) * r * 1.4, g);
    b.rotation.set(Math.random() * 0.5, Math.random() * 3, Math.random() * 0.5);
  }
  return g;
}
