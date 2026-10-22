// Models for the island war: the two carriers, the enemy battleship, capture drones, enemy transports and the island
// buildings. Low-poly, flat-shaded, built from primitives. Local frame: +y up, the bow / nose points along -z.
import * as THREE from 'three';

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
  box(5.5, 9, 18, hullM, 0, 4.5, 0, tw); box(5, 4, 10, hullM, 0, 11, -1, tw); box(5.6, 1.4, 8, darkM, 0, 9.6, -3.5, tw);   // bridge windows
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
  return { group: g, guns, dish, lamp, lights, teamM };
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
export function buildGunship() {   // the enemy attack drone (the original red saucer, with a gun pod)
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color: 0xdd2222, emissive: 0x440808, flatShading: true });
  g.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.8).scale(1.4, 0.7, 1.4), mat));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 4, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8844 })));
  box(0.5, 0.5, 1.6, M(0x331111), 0, -0.9, -0.6, g);
  return { group: g };
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
