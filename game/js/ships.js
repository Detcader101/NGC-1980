// Models for the island war: the two carriers, the enemy battleship, capture drones, enemy transports and the island
// buildings. Low-poly, flat-shaded, built from primitives. Local frame: +y up, the bow / nose points along -z.
import * as THREE from 'three';
import { buildC130Mesh } from './units/air/c130model.js';   // the para-drop Hercules (C-130 agent)
import { buildParatrooper, buildMC1Canopy } from './units/air/jumper.js';

const M = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, shininess: 20, ...o });
// a top-view outline drawn with y = local z; for a floor facing up after rotateX(-PI/2) the outline is mirrored in y
const flipShape = sh => new THREE.Shape(sh.getPoints(8).map(p => new THREE.Vector2(p.x, -p.y)));
const box = (w, h, d, m, x = 0, y = 0, z = 0, parent) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); parent && parent.add(b); return b; };
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, parent, seg = 10) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); c.position.set(x, y, z); parent && parent.add(c); return c; };
export const TEAM = { 0: 0xc8c8bc, 1: 0x33bbff, 2: 0xff3322 };

// ------------------------------------------------------------------------------------------- carriers
export const CARRIER = { L: 120, W: 28, DECK: 8, TOWER_X: 10.5, TOWER_Z: 6, TOWER_H: 17 };
function deckTexture(side) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const x = c.getContext('2d');
  x.fillStyle = '#3c4045'; x.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 2600; i++) { const g = 50 + Math.random() * 18; x.fillStyle = `rgb(${g},${g + 2},${g + 5})`; x.fillRect(Math.random() * 256, Math.random() * 1024, 3, 2); }
  const team = side === 1 ? '#33bbff' : '#ff4433';
  x.strokeStyle = '#e8e8e0'; x.lineWidth = 4; x.setLineDash([26, 18]); x.beginPath(); x.moveTo(110, 60); x.lineTo(110, 980); x.stroke(); x.setLineDash([]);
  x.strokeStyle = '#ffd040'; x.lineWidth = 5; x.strokeRect(14, 14, 228, 996);
  for (const cy of [250, 520, 790]) {   // three helicopter spots
    x.strokeStyle = team; x.lineWidth = 9; x.beginPath(); x.arc(110, cy, 70, 0, 6.283); x.stroke();
    x.fillStyle = '#f0f0e8'; x.font = 'bold 90px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('H', 110, cy + 4);
  }
  x.fillStyle = team; x.font = 'bold 54px sans-serif'; x.save(); x.translate(205, 520); x.rotate(Math.PI / 2); x.fillText(side === 1 ? 'ALBATROSS' : 'KRAKEN', 0, 0); x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function buildCarrier(side) {
  const g = new THREE.Group(), { L, W, DECK } = CARRIER;
  const hullM = M(side === 1 ? 0x56616c : 0x4f3c3a), darkM = M(0x26292d), teamM = M(TEAM[side], { emissive: side === 1 ? 0x0a2a44 : 0x440a06 });
  // hull: a prism from the top-view outline (pointed bow, square stern), flared above the waterline
  const sh = new THREE.Shape(); sh.moveTo(-W / 2, L / 2); sh.lineTo(W / 2, L / 2); sh.lineTo(W / 2, -L / 2 + 16); sh.lineTo(0, -L / 2 - 6); sh.lineTo(-W / 2, -L / 2 + 16); sh.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(sh, { depth: DECK + 4, bevelEnabled: false }); hullGeo.rotateX(Math.PI / 2); hullGeo.translate(0, DECK, 0);
  const hull = new THREE.Mesh(hullGeo, hullM); hull.scale.set(0.86, 1, 0.97); g.add(hull);
  const deckGeo = new THREE.ShapeGeometry(flipShape(sh)); deckGeo.rotateX(-Math.PI / 2);
  { const uv = deckGeo.attributes.uv, p = deckGeo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + W / 2) / W, 1 - (p.getZ(i) + L / 2 + 6) / (L + 6)); }
  const deck = new THREE.Mesh(deckGeo, new THREE.MeshLambertMaterial({ map: deckTexture(side) })); deck.position.y = DECK + 0.02; g.add(deck);
  box(W + 0.6, 0.5, L - 14, darkM, 0, DECK - 0.4, 6, g);                  // deck edge / gallery
  box(W * 0.86, 0.9, L * 0.92, M(0x7a1e1a), 0, -0.3, 2, g);                 // red boot-top at the waterline
  // island superstructure on the starboard side
  const tw = new THREE.Group(); tw.position.set(CARRIER.TOWER_X, DECK, CARRIER.TOWER_Z); g.add(tw);
  box(5.5, 9, 18, hullM, 0, 4.5, 0, tw); box(5, 4, 10, hullM, 0, 11, -1, tw); const band = box(5.6, 1.4, 8, darkM, 0, 9.6, -3.5, tw);   // bridge windows
  box(0.4, 7, 0.4, darkM, 0, 16, -1, tw); box(3, 0.3, 0.3, darkM, 0, 18, -1, tw);
  const dish = new THREE.Group(); dish.position.set(0, 13.3, 2.5); tw.add(dish);
  box(3.2, 1.4, 0.25, darkM, 0, 0.6, 0, dish); cyl(0.2, 0.2, 1, darkM, 0, 0, 0, dish, 6);
  box(5.7, 1.2, 0.3, teamM, 0, 7, 9.1, tw); box(5.7, 1.2, 0.3, teamM, 0, 7, -9.1, tw);   // team bands
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), new THREE.MeshBasicMaterial({ color: side === 1 ? 0x66ffff : 0xff6644 })); lamp.position.set(0, 19.6, -1); tw.add(lamp);
  // CIWS / flak mounts at the four corners
  const guns = [];
  for (const [x, z] of [[-W / 2 + 2, -L / 2 + 22], [W / 2 - 2, -L / 2 + 22], [-W / 2 + 2, L / 2 - 6], [W / 2 - 2, L / 2 - 6]]) {
    const m = buildGun(side, 0.8); m.position.set(x * 0.95, DECK, z); g.add(m); guns.push(m);
  }
  // deck edge lights
  const lights = [];
  for (let i = 0; i < 10; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xffdd66 })); l.position.set(i % 2 ? W * 0.42 : -W * 0.42, DECK + 0.15, -L / 2 + 18 + Math.floor(i / 2) * 22); g.add(l); lights.push(l); }
  return { group: g, guns, dish, lamp, lights, teamM, tower: tw, band };
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
export const BSHIP = { L: 96, W: 16, DECK: 5 };
export function buildBattleship() {
  const g = new THREE.Group(), { L, W, DECK } = BSHIP;
  const hullM = M(0x3e3a3a), darkM = M(0x1f1d1d), redM = M(0xcc2a1e, { emissive: 0x330806 });
  const sh = new THREE.Shape(); sh.moveTo(-W / 2, L / 2 - 6); sh.quadraticCurveTo(0, L / 2 + 2, W / 2, L / 2 - 6); sh.lineTo(W / 2, -L / 2 + 22); sh.lineTo(0, -L / 2 - 4); sh.lineTo(-W / 2, -L / 2 + 22); sh.closePath();
  const hg = new THREE.ExtrudeGeometry(sh, { depth: DECK + 3, bevelEnabled: false }); hg.rotateX(Math.PI / 2); hg.translate(0, DECK, 0);
  g.add(new THREE.Mesh(hg, hullM));
  const dg = new THREE.ShapeGeometry(flipShape(sh)); dg.rotateX(-Math.PI / 2); const deck = new THREE.Mesh(dg, M(0x6a5a48)); deck.position.y = DECK + 0.02; g.add(deck);
  box(W * 0.95, 0.8, L * 0.9, M(0x7a1e1a), 0, -0.2, 0, g);
  box(9, 6, 20, hullM, 0, DECK + 3, 4, g); box(7, 5, 10, hullM, 0, DECK + 8.5, 2, g); box(4, 7, 4, hullM, 0, DECK + 14, 1, g);
  box(7.2, 1, 3, redM, 0, DECK + 10, -3.2, g);
  cyl(1.6, 2, 7, darkM, 0, DECK + 9, 12, g, 8);   // funnel
  const turrets = [];
  for (const z of [-30, -18, 32]) {
    const t = new THREE.Group(); t.position.set(0, DECK, z); g.add(t);
    box(6.5, 2.6, 7, hullM, 0, 1.3, 0, t);
    const barrels = new THREE.Group(); barrels.position.set(0, 1.6, z > 0 ? 3 : -3); t.add(barrels);
    for (const x of [-1.4, 0, 1.4]) { const b = cyl(0.3, 0.35, 11, darkM, x, 0, 0, barrels, 6); b.rotation.x = Math.PI / 2; b.position.z = z > 0 ? 5.5 : -5.5; }
    t.userData.barrels = barrels; t.userData.aft = z > 0; turrets.push(t);
  }
  const guns = [];
  for (const [x, z] of [[-6, 16], [6, 16], [-6, -6], [6, -6]]) { const m = buildGun(2, 0.6); m.position.set(x, DECK, z); g.add(m); guns.push(m); }
  return { group: g, turrets, guns };
}

// ------------------------------------------------------------------------------------------- freighter
// enemy supply ship: carries its islands' output to the KRAKEN
export const FREIGHTER = { L: 46, W: 10, DECK: 3 };
export function buildFreighter() {
  const g = new THREE.Group(), { L, W, DECK } = FREIGHTER, hullM = M(0x3b3f44), dark = M(0x1e2124);
  const sh = new THREE.Shape(); sh.moveTo(-W / 2, L / 2); sh.lineTo(W / 2, L / 2); sh.lineTo(W / 2, -L / 2 + 9); sh.lineTo(0, -L / 2 - 3); sh.lineTo(-W / 2, -L / 2 + 9); sh.closePath();
  const hg = new THREE.ExtrudeGeometry(sh, { depth: DECK + 2.5, bevelEnabled: false }); hg.rotateX(Math.PI / 2); hg.translate(0, DECK, 0); g.add(new THREE.Mesh(hg, hullM));
  box(W * 0.95, 0.6, L * 0.9, M(0x7a1e1a), 0, -0.2, 1, g);
  const cols = [0xb8462e, 0x2e6fb8, 0xc8a030, 0x3c8a4a, 0x8a3c7a];
  for (let i = 0; i < 6; i++) for (let k = 0; k < 2; k++) for (let h = 0; h < 1 + ((i + k) % 2); h++) box(3.9, 2.3, 5.6, M(cols[(i * 3 + k + h) % cols.length]), (k - 0.5) * 4.1, DECK + 1.15 + h * 2.35, -L / 2 + 10 + i * 5.9, g);
  box(W * 0.85, 6, 6, M(0xd8d8d0), 0, DECK + 3, L / 2 - 6, g); box(W * 0.9, 1.2, 6.4, dark, 0, DECK + 5.2, L / 2 - 6, g);
  cyl(0.9, 1.1, 4, dark, 0, DECK + 7, L / 2 - 3, g, 8);
  const guns = []; { const m = buildGun(2, 0.55); m.position.set(0, DECK, -L / 2 + 4); g.add(m); guns.push(m); }
  return { group: g, guns };
}

// ------------------------------------------------------------------------------------------- aircraft
export function buildDrone() {   // player capture drone ("MANTA"): a flat quad-rotor carrying a command module
  const g = new THREE.Group(), body = M(0x2a3f55), team = M(TEAM[1], { emissive: 0x0b3355 });
  box(3.2, 0.7, 4.2, body, 0, 0, 0, g); box(2, 0.9, 2.2, team, 0, 0.7, 0.3, g);
  const rotors = [];
  for (const [x, z] of [[-2.4, -2.2], [2.4, -2.2], [-2.4, 2.2], [2.4, 2.2]]) {
    box(2.6, 0.25, 0.3, body, x / 2, 0.1, z, g);
    const r = new THREE.Mesh(new THREE.CircleGeometry(1.3, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    r.position.set(x, 0.45, z); g.add(r); rotors.push(r);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: 0x66ffff })); lamp.position.set(0, 1.3, 0.3); g.add(lamp);
  for (const [x, z] of [[-1.2, 1.6], [1.2, 1.6], [-1.2, -1.6], [1.2, -1.6]]) box(0.15, 1.2, 0.15, body, x, -0.8, z, g);
  return { group: g, rotors, lamp };
}
export function buildTransport() {   // enemy twin-rotor transport that lands troops to take islands
  const g = new THREE.Group(), body = M(0x5a2a24), dark = M(0x221614);
  box(2.6, 2.4, 9, body, 0, 0, 0, g); box(2.2, 1.6, 2, M(0xffaa66, { emissive: 0x442200 }), 0, 0.3, -4.7, g);
  box(1.2, 1.6, 2.2, body, 0, 1.6, -3.4, g); box(1.2, 2.2, 2.2, body, 0, 1.8, 3.6, g);
  const rotors = [];
  for (const [y, z] of [[2.7, -3.4], [3.0, 3.6]]) {
    const r = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x221111, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    r.position.set(0, y, z); g.add(r); rotors.push(r);
  }
  for (const x of [-1.1, 1.1]) for (const z of [-3, 3]) box(0.3, 0.8, 0.3, dark, x, -1.5, z, g);
  return { group: g, rotors };
}
export function buildGunship(side = 2) {   // attack drone (the original saucer, with a gun pod): red for the enemy, blue escorts for us
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color: side === 1 ? 0x2a8cdd : 0xdd2222, emissive: side === 1 ? 0x08263f : 0x440808, flatShading: true });
  g.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.8).scale(1.4, 0.7, 1.4), mat));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 4, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: side === 1 ? 0x77eeff : 0xff8844 })));
  box(0.5, 0.5, 1.6, M(0x331111), 0, -0.9, -0.6, g);
  return { group: g };
}

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
// The para-drop aeroplane: a Marine KC-130R Hercules (units/air/c130model.js). Returns the model (group, animate,
// parts, shell) as built there; drop.js drives it from the C-130 flight model.
export function buildDropship() { return buildC130Mesh(); }
// A 1980 paratrooper with an MC1-1 canopy (units/air/jumper.js). Keeps the old contract for drop.js - { group, body,
// canopy, legs, arms } - plus rig (pose / setKit: swap the figure for the infantry model by replacing buildParatrooper)
// and canopyAnim(time, open 0..1, steer). The canopy hangs from the shoulders.
export function buildJumper() {
  const rig = buildParatrooper(), c = buildMC1Canopy(); rig.group.add(c.group);
  return { group: rig.group, body: rig.body, canopy: c.group, legs: rig.legs, arms: rig.arms, rig, canopyAnim: c.animate };
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
export function buildStructure(kind, side) {
  const g = new THREE.Group(), wall = M(0x8a8a84), dark = M(0x3a3c3e), roof = M(0x5c5e60);
  const team = M(TEAM[side], { emissive: 0x111111 });
  const ud = { team, kind, h: 6, r: 5 };
  if (kind === 'hq') {
    box(10, 6, 9, wall, 0, 3, 0, g); box(10.4, 0.6, 9.4, team, 0, 6.2, 0, g); box(4, 5, 4, wall, -2, 9, 0, g); box(4.4, 1.2, 4.4, M(0x223344, { emissive: 0x0a1a2a }), -2, 10.5, 0, g);
    cyl(0.12, 0.12, 8, dark, 3, 10, 2, g, 4);
    const flag = box(2.4, 1.4, 0.08, team, 4.2, 13.2, 2, g); ud.flag = flag;
    ud.h = 12; ud.r = 7;
  } else if (kind === 'factory') {
    box(14, 7, 10, wall, 0, 3.5, 0, g);
    for (let i = 0; i < 4; i++) { const r = box(3.5, 1.6, 10.2, roof, -5.25 + i * 3.5, 7.6, 0, g); r.rotation.z = 0.35; }
    box(14.2, 0.8, 0.3, team, 0, 5.5, -5.1, g);
    ud.stacks = [cyl(0.9, 1.2, 9, dark, 4.5, 11, 3, g, 8), cyl(0.9, 1.2, 11, dark, 2, 12, 3, g, 8)];
    ud.stackTops = [[4.5, 15.6, 3], [2, 17.6, 3]];
    ud.h = 9; ud.r = 8;
  } else if (kind === 'fuel') {   // derrick + storage tanks
    const t = new THREE.Group(); g.add(t);
    for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) { const l = box(0.25, 12, 0.25, dark, x * 0.6, 6, z * 0.6, t); l.rotation.set(z * -0.06, 0, x * 0.06); }
    for (let y = 2; y < 12; y += 2.5) box(2.2 - y * 0.08, 0.15, 2.2 - y * 0.08, dark, 0, y, 0, t);
    const beam = box(6, 0.4, 0.4, M(0xd0a020), 0, 12.3, 0, g); ud.beam = beam;
    for (const [x, z] of [[-6, 4], [6, 4], [0, 7.5]]) { cyl(2.4, 2.4, 4.4, M(0xd8d8d0), x, 2.2, z, g, 14); cyl(2.45, 2.45, 0.5, team, x, 3.4, z, g, 14); }
    ud.h = 8; ud.r = 8;
  } else if (kind === 'radar') {
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) box(0.3, 10, 0.3, dark, x, 5, z, g);
    box(4, 2.5, 4, wall, 0, 10.6, 0, g); box(4.2, 0.4, 4.2, team, 0, 12, 0, g);
    const dish = new THREE.Group(); dish.position.y = 13; g.add(dish);
    const d = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 6, 0, Math.PI * 2, 0, 1.0), M(0xdfe4ea, { side: THREE.DoubleSide })); d.rotation.x = -Math.PI / 2 + 0.25; d.position.z = 1.2; dish.add(d);
    cyl(0.12, 0.12, 2.6, dark, 0, 0.3, -0.2, dish, 4).rotation.x = Math.PI / 2;
    ud.dish = dish; ud.h = 12; ud.r = 5;
  } else if (kind === 'shipyard') {   // the enemy slipway where the battleship is built
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
