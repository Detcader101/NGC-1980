// ALBATROSS: the task force's 1980 conventional carrier, a Midway / Forrestal-style big deck in haze grey, built at
// the game's 0.44 scale (the map is 1.3 km): 120 m deck, 28 m wide, flight deck 8 m above the waterline. People,
// vehicles and aircraft on the deck are real size (that is what you fly and walk), so the deck is crowded the way
// real decks are.
//
// Deck geometry contract (war.js deckY, jetfm.js DECKOPS, main.js spawnSpot): x starboard, z aft, bow at -z.
//   deck y = 8 (DECK); straight deck 28 m wide (|x| < 14) from the stern edge z = +60 forward to z = -40, then the
//   bow narrows to 8 m wide at z = -66. Island (deckY block): |x - 10.5| < 2.9, |z - 6| < 9, top 17 m above the deck.
//   Catapult (DECKOPS): x = -2.5 from z = -6 to -50. Landing line x = -2.5, wires z = 44, 39.5, 35, 30.5.
//   Helicopter spawn (main.js): x -2, z 32.
// Everything static is one vertex-coloured mesh; the deck one textured mesh; markings + rust one decal mesh; the
// lights one unlit mesh; crew 4 instanced meshes; parked jets one instanced mesh per type; rotating antennas and the
// weapon mounts their own small meshes.
import * as THREE from 'three';
import { Kit, T, DEG, rng, hullMat, glowMat, bake, mergeGeos, canvasTex, DecalSheet, drawStreak, drawText } from './navkit.js';
import { createCrew } from './deckcrew.js';
import { buildPhalanx, buildSeaSparrow } from './mounts.js';
import { buildJetMesh } from '../../jetmodel.js';

export const ALB = { L: 120, W: 28, DECK: 8, TOWER_X: 10.5, TOWER_Z: 6, TOWER_H: 17 };
const { W, DECK } = ALB;
const HAZE = 0x7e878f, HAZE_D = 0x6c757d, HAZE_L = 0x8f979e, DARK = 0x2b2e32, BLACK = 0x161718, DECKC = 0x3c3f43;
const YELLOW = 0xd8b21e, WHITE = 0xe2e2dc, RED = 0xa8231b, GLASS = 0x1c2a33, RUST = 0x7a4426;

// half-width of the flight deck at z (the bow narrows from z = -40 to 4 m at z = -66)
export function deckHalf(lz) {
  if (lz > 60 || lz < -66) return 0;
  if (lz >= -40) return W / 2;
  return 4 + 10 * Math.sqrt(Math.max(0, (lz + 66) / 26));
}
// height (above the waterline, ship frame) of what you stand on at (lx, lz), or -1e9 off the ship
export function localDeck(lx, lz) {
  let h = -1e9;
  if (Math.abs(lx) < deckHalf(lz) * 0.985) h = DECK;
  if (Math.abs(lx - ALB.TOWER_X) < 2.9 && Math.abs(lz - ALB.TOWER_Z) < 9) h = DECK + ALB.TOWER_H;
  return h;
}

// ------------------------------------------------------------------------------------------------- hull
export function hullRings(dhf = deckHalf) {
  const rings = [];
  const zs = [57, 54, 48, 40, 28, 12, -4, -18, -28, -36, -42, -48, -53, -57, -60, -62.5, -64.5, -66];
  for (const z of zs) {
    // waterline half-beam: full 10.6 amidships, a fine entrance forward, a broad transom aft
    let hb = 10.6;
    if (z < -18) { const t = Math.min(1, (-18 - z) / 42); hb = 10.6 * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.15 * t); }
    if (z > 30) hb = 10.6 - (z - 30) / 27 * 2.6;
    const dh = dhf(z), ystem = z < -60 ? (-60 - z) / 6 * 6.8 : -4.2;   // the stem rakes forward: hull starts higher
    const hh = z < -36 ? Math.max(hb + 0.6, dh - 1.2) : Math.min(12.2, dh - 1.8);   // hangar side (enclosed bow flares out to the deck)
    const yb = z < -60 ? ystem : -4.2;
    const pts = [
      [0, yb], [Math.max(0, hb - 2.2) * (z < -60 ? 0 : 1), yb], [hb * 0.98 * (z < -60 ? 0 : 1), z < -60 ? yb : -2.4],
      [hb * (z < -60 ? 0 : 1), z < -60 ? Math.max(yb, -0.7) : -0.7], [hb * (z < -60 ? 0 : 1), Math.max(yb, 0.7)],
      [hb + (hh - hb) * 0.55, Math.max(yb + 0.3, 2.6)], [hh, Math.max(yb + 0.6, 4.2)], [hh, 6.9], [dh, 7.45], [dh, DECK],
    ];
    if (z < -60) { pts[5][0] = dh * 0.35; pts[6][0] = dh * 0.75; }
    rings.push({ z, pts });
  }
  return rings;
}
export function buildHull(kit, dhf = deckHalf, C = { hull: HAZE, dark: HAZE_D }, fantail = true) {
  const rings = hullRings(dhf);
  for (const sd of [1, -1]) {
    const R = rings.map(r => r.pts.map(([x, y]) => [x * sd, y, r.z]));
    if (sd < 0) R.reverse();
    kit.loft(R, C.hull);
  }
  // transom (stern plate) at z = 57: the ring outline closed
  const st = rings[0].pts, outline = [...st.map(([x, y]) => [x, y]), ...st.slice().reverse().map(([x, y]) => [-x, y])];
  kit.add(new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)))), C.dark, T(0, 0, 57));
  if (!fantail) return rings;
  // fantail: the flight deck overhang aft of the transom, with the stern gallery under it
  kit.box(W, 0.55, 3.2, C.hull, 0, DECK - 0.27, 58.4);
  kit.box(W - 4, 1.6, 0.3, C.dark, 0, 6.3, 57.2);
  for (let x = -12; x <= 12; x += 4) kit.box(0.25, 1.6, 2.8, C.dark, x, 6.6, 58.4);
  // deck edge: a thin lip all round (the deck mesh sits on top)
  return rings;
}

// ------------------------------------------------------------------------------------------------- island
// in the tower's frame: origin (TOWER_X, DECK, TOWER_Z); the bridge room (helm.js) is x +-2.4, y 9-13, z -5.75..3.75
function buildIsland(kit, glow, sheet) {
  kit.push(T(ALB.TOWER_X, DECK, ALB.TOWER_Z)); glow.push(T(ALB.TOWER_X, DECK, ALB.TOWER_Z));
  const H = HAZE, HD = HAZE_D;
  kit.box(4.9, 3.2, 17.3, H, 0.15, 1.6, 0.15);                       // O-3 / O-4 levels
  kit.box(4.7, 3.2, 16.5, H, 0.15, 4.8, 0.25);                       // O-5 / O-6
  kit.box(4.9, 2.6, 13.2, H, 0.05, 7.7, -0.6);                       // O-7: flag bridge
  kit.box(5.0, 4.0, 10.0, H, 0, 11, -1);                             // O-8 / O-9: navigation bridge (helm.js inside)
  kit.box(5.3, 0.2, 10.3, HD, 0, 9.0, -1);                           // bridge deck lip
  kit.box(5.3, 0.25, 10.3, HD, 0, 13.05, -1);                        // bridge roof
  // flag bridge windows (all round) and pri-fly: a glassed box overhanging aft and to port, looking down the deck
  kit.box(4.95, 0.75, 13.25, GLASS, 0.05, 7.95, -0.6);
  kit.box(4.4, 2.5, 4.6, H, -1.2, 14.4, 2.6); kit.box(4.5, 1.0, 4.7, GLASS, -1.2, 14.6, 2.6); kit.box(4.6, 0.2, 4.8, HD, -1.2, 15.7, 2.6);
  // bridge wings and the vulture's row balcony
  for (const sd of [-1, 1]) { kit.box(1.4, 0.15, 2.4, HD, sd * 3.2, 9.05, -4.6); kit.rail([[sd * 2.5, 9.1, -5.8], [sd * 3.9, 9.1, -5.8], [sd * 3.9, 9.1, -3.4]], 1.0, HD, 0.8, 0.03); }
  kit.box(1.1, 0.15, 8, HD, -3.0, 6.4, 1); kit.rail([[-3.55, 6.45, -3], [-3.55, 6.45, 5]], 1.0, HD, 1, 0.03);
  // funnel: aft, raked, with the black-topped uptakes
  kit.push(T(0.1, 0, 6.4, -6 * DEG));
  kit.box(4.2, 8.2, 4.6, H, 0, 13.2, 0); kit.box(4.4, 1.1, 4.8, BLACK, 0, 17.8, 0.1);
  for (const [x, z] of [[-0.9, -0.8], [0.9, -0.8], [0, 0.9]]) kit.cyl(0.45, 0.45, 0.8, 0x101010, x, 18.6, z, 0, 0, 0, 8);
  kit.box(4.3, 0.3, 4.7, HD, 0, 16.6, 0);
  kit.pop();
  // island top deck and the mast: a tripod with yardarms, TACAN at the top
  kit.box(5, 0.25, 6.6, HD, 0, 13.2, -2.8);
  kit.rail([[-2.5, 13.3, -6.1], [2.5, 13.3, -6.1], [2.5, 13.3, 0.4]], 0.9, HD, 0.9, 0.03);
  const mast = [0.1, 13.3, -1.0], top = [0.1, 28.6, -1.0];
  kit.rod(mast, top, 0.2, HD, 6); kit.rod([-1.8, 13.3, 0.2], [0.1, 22.5, -0.9], 0.11, HD, 5); kit.rod([1.9, 13.3, 0.2], [0.1, 22.5, -0.9], 0.11, HD, 5); kit.rod([0.1, 13.3, 1.6], [0.1, 22.5, -0.9], 0.11, HD, 5);
  kit.box(2.8, 0.18, 2.4, HD, 0.1, 21.4, -1.0);                      // SPS-49 platform
  kit.rail([[-1.3, 21.5, -2.2], [1.5, 21.5, -2.2], [1.5, 21.5, 0.2], [-1.3, 21.5, 0.2], [-1.3, 21.5, -2.2]], 0.6, HD, 0.7, 0.025);
  kit.rod([-3.2, 25.2, -1.0], [3.4, 25.2, -1.0], 0.07, HD, 4); kit.rod([-2.2, 27.0, -1.0], [2.4, 27.0, -1.0], 0.06, HD, 4);   // yardarms
  kit.cyl(0.42, 0.42, 1.0, 0xc8c8c0, 0.1, 29.2, -1.0, 0, 0, 0, 10); kit.cyl(0.2, 0.02, 1.4, 0xc8c8c0, 0.1, 30.4, -1.0, 0, 0, 0, 6);   // TACAN + whip
  for (const [x, y] of [[-1.6, 19.4], [1.7, 19.4]]) kit.sphere(0.32, 0xd0d0c8, x, y, -0.5, 1, 1, 1, 8, 5);   // ESM domes
  kit.box(0.9, 0.15, 0.9, HD, -1.55, 19.0, -0.5); kit.box(0.9, 0.15, 0.9, HD, 1.65, 19.0, -0.5);
  // SPN-35 carrier-controlled-approach radome on the aft island, SPN-42 dishes, searchlights
  kit.cyl(0.25, 0.3, 2.2, HD, 0.3, 17.8, 9.6); kit.sphere(0.9, 0xd8d8d0, 0.3, 19.4, 9.6, 1, 0.95, 1, 12, 6);
  kit.box(1.6, 0.15, 1.6, HD, -1.6, 16.1, -3.2); kit.sphere(0.6, 0xc8c8c2, -1.6, 16.8, -3.2, 1, 1, 0.45, 10, 6);
  for (const [x, z] of [[-2.6, -5.2], [2.6, -5.2]]) { kit.cyl(0.25, 0.25, 0.4, HD, x, 13.6, z, Math.PI / 2, 0, 0, 8); }
  // life-raft canisters in racks on the starboard side, doors and ladders on the deck side
  for (let i = 0; i < 6; i++) for (let k = 0; k < 2; k++) kit.cyl(0.25, 0.25, 0.9, 0xe9e7df, 2.75, 3.6 + k * 0.55, 1.6 + i * 1.0, Math.PI / 2, 0, 0, 8);
  kit.box(0.2, 1.3, 6.2, HD, 2.62, 3.85, 4.1);
  for (const z of [-6.8, -1.0, 4.8]) kit.box(0.08, 1.9, 0.85, DARK, -2.27, 0.95, z);   // watertight doors (port side, onto the deck)
  for (const z of [-7.6, 6.5]) { kit.rod([-2.4, 0, z], [-2.4, 3.2, z - 1.6], 0.04, HD, 4); kit.rod([-2.4, 0, z + 0.6], [-2.4, 3.2, z - 1.0], 0.04, HD, 4); }
  // hull number on both island faces (white, black shadow) - decals
  const num = sheet.draw(0, 2, 1, (x, w, h) => drawText(x, w, h, '44', { size: 0.95, shadow: '#151515', stretch: 0.9 }));
  sheet.place(num, new THREE.Matrix4().multiplyMatrices(kit.M, T(2.57, 4.6, -3.6, 0, Math.PI / 2, 0)), 6.4, 4.4);
  sheet.place(num, new THREE.Matrix4().multiplyMatrices(kit.M, T(-2.27, 4.6, -3.6, 0, -Math.PI / 2, 0)), 6.4, 4.4);
  // rust weeping from the bridge-deck scuppers and soot on the funnel
  const rs = sheet.draw(3, 1, 2, (x, w, h) => drawStreak(x, w, h, rng(11), { a: 0.6, n: 4 }));
  for (const [zz, y] of [[-4, 8.9], [2.5, 8.9], [-1, 12.9]]) { sheet.place(rs, new THREE.Matrix4().multiplyMatrices(kit.M, T(2.58, y - 1.6, zz, 0, Math.PI / 2, 0)), 1.6, 3.2); sheet.place(rs, new THREE.Matrix4().multiplyMatrices(kit.M, T(-2.53, y - 1.6, zz + 1, 0, -Math.PI / 2, 0)), 1.6, 3.2); }
  // red obstruction lights on the mast, the masthead light
  for (const [x, y, z] of [[0.1, 30.9, -1.0], [-3.2, 25.3, -1.0], [3.4, 25.3, -1.0]]) glow.box(0.18, 0.18, 0.18, 0xff2a1a, x, y, z);
  kit.pop(); glow.pop();
}

// ------------------------------------------------------------------------------------------------- deck texture
// canvas px: x -> (x + 14) * 512 / 28, z -> (z + 66) * 2304 / 126
const DT_W = 512, DT_H = 2304, PXM = DT_H / 126;
const px = x => (x + 14) * DT_W / 28, pz = z => (z + 66) * PXM;
export const ELEVATORS = [{ x0: 8.6, x1: 14, z0: -24, z1: -10 }, { x0: 8.6, x1: 14, z0: 17, z1: 30 }, { x0: -14, x1: -8.6, z0: -38, z1: -25 }];
function deckTexture() {
  return canvasTex(DT_W, DT_H, (x, w, h) => {
    const r = rng(42);
    x.fillStyle = '#3d4044'; x.fillRect(0, 0, w, h);
    // non-skid recoat patches (slightly different greys), then grit
    for (let i = 0; i < 70; i++) { const g = 54 + r() * 14 | 0; x.fillStyle = `rgba(${g},${g + 2},${g + 5},0.45)`; x.fillRect(r() * w, r() * h, 30 + r() * 140, 30 + r() * 160); }
    for (let i = 0; i < 26000; i++) { const g = 46 + r() * 26 | 0; x.fillStyle = `rgb(${g},${g + 2},${g + 4})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    // tie-down padeyes: a grid every 1.6 m
    x.fillStyle = 'rgba(20,20,22,0.55)';
    for (let zz = -64; zz < 60; zz += 1.6) for (let xx = -13; xx < 14; xx += 1.6) x.fillRect(px(xx) - 1.5, pz(zz) - 1.5, 3, 3);
    // tyre marks and rubber in the landing area, exhaust soot behind the catapult
    for (let i = 0; i < 90; i++) { const xx = -2.5 + (r() - 0.5) * 7, z0 = 22 + r() * 30, len = 6 + r() * 22; x.strokeStyle = `rgba(14,14,14,${0.12 + r() * 0.25})`; x.lineWidth = 2 + r() * 4; x.beginPath(); x.moveTo(px(xx), pz(z0)); x.lineTo(px(xx + (r() - 0.5) * 0.8), pz(z0 - len)); x.stroke(); }
    { const g = x.createRadialGradient(px(-2.5), pz(6), 4, px(-2.5), pz(6), 110); g.addColorStop(0, 'rgba(10,10,10,0.5)'); g.addColorStop(1, 'rgba(10,10,10,0)'); x.fillStyle = g; x.fillRect(px(-10), pz(0), px(5) - px(-10), pz(14) - pz(0)); }
    // oil and hydraulic stains where aircraft park
    for (let i = 0; i < 40; i++) { const xx = 4 + r() * 9.5, zz = -50 + r() * 108; x.fillStyle = `rgba(${r() < 0.5 ? '18,16,14' : '40,32,22'},${0.25 + r() * 0.3})`; x.beginPath(); x.ellipse(px(xx), pz(zz), 4 + r() * 12, 3 + r() * 9, r() * 3, 0, 6.283); x.fill(); }
    const line = (x0, z0, x1, z1, col, wpx, dash) => { x.strokeStyle = col; x.lineWidth = wpx; x.setLineDash(dash || []); x.beginPath(); x.moveTo(px(x0), pz(z0)); x.lineTo(px(x1), pz(z1)); x.stroke(); x.setLineDash([]); };
    // landing area: white edge lines, dashed centreline on x = -2.5, the foul line, the stern ramp stripes
    line(-11.5, 60, -11.5, -2, '#d8d8d0', 4); line(6.5, 60, 6.5, -2, '#d8d8d0', 4);
    line(-2.5, 59, -2.5, -2, '#e4e4dc', 5, [3.2 * PXM, 2.8 * PXM]);
    line(7.6, 60, 7.6, -4, '#c23028', 4, [1.2 * PXM, 1.2 * PXM]);
    for (let xx = -13.5; xx < 14; xx += 2) { x.fillStyle = (Math.round(xx) % 4 === 0) ? '#d8d8d0' : '#b02a20'; x.fillRect(px(xx), pz(58.6), 2 * DT_W / 28, pz(60) - pz(58.6)); }
    // arresting-gear wire positions: a worn band under each, small numbers on the port side
    [44, 39.5, 35, 30.5].forEach((wz, i) => { x.fillStyle = 'rgba(25,25,25,0.6)'; x.fillRect(px(-11.5), pz(wz) - 4, px(6.5) - px(-11.5), 8); x.fillStyle = '#d8d8d0'; x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.fillText(String(i + 1), px(-13), pz(wz) + 8); });
    // catapult: the shuttle slot, its edges and the yellow centreline
    x.fillStyle = '#121314'; x.fillRect(px(-2.5) - 2, pz(-52), 4, pz(-5) - pz(-52));
    x.fillStyle = '#7a7c7e'; x.fillRect(px(-2.5) - 6, pz(-52), 2, pz(-5) - pz(-52)); x.fillRect(px(-2.5) + 4, pz(-52), 2, pz(-5) - pz(-52));
    line(-2.5, -5, -2.5, 2, '#d8b21e', 3, [10, 8]);
    for (const [xx, zz] of [[-5.5, -48]]) { x.save(); x.translate(px(xx), pz(zz)); x.fillStyle = '#d8d8d0'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.fillText('1', 0, 0); x.restore(); }
    // JBD (jet blast deflector) outline behind the catapult start
    x.strokeStyle = '#d8b21e'; x.lineWidth = 3; x.strokeRect(px(-7), pz(3.2), px(2) - px(-7), pz(5.6) - pz(3.2));
    for (let xx = -7; xx < 2; xx += 0.9) line(xx, 3.2, xx + 0.6, 5.6, 'rgba(216,178,30,0.5)', 2);
    // elevators: yellow-black hazard edges
    for (const E of ELEVATORS) {
      x.fillStyle = 'rgba(70,72,76,0.6)'; x.fillRect(px(E.x0), pz(E.z0), px(E.x1) - px(E.x0), pz(E.z1) - pz(E.z0));
      for (let k = 0; ; k++) { const t = k * 18; if (t > 2 * (px(E.x1) - px(E.x0) + pz(E.z1) - pz(E.z0))) break; }
      x.lineWidth = 6; x.setLineDash([14, 14]); x.strokeStyle = '#d8b21e'; x.strokeRect(px(E.x0) + 3, pz(E.z0) + 3, px(E.x1) - px(E.x0) - 6, pz(E.z1) - pz(E.z0) - 6);
      x.lineDashOffset = 14; x.strokeStyle = '#151515'; x.strokeRect(px(E.x0) + 3, pz(E.z0) + 3, px(E.x1) - px(E.x0) - 6, pz(E.z1) - pz(E.z0) - 6); x.setLineDash([]); x.lineDashOffset = 0;
    }
    // taxi lines: yellow, round the island and out to the parking spots
    x.strokeStyle = '#c9a51c'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(px(3.5), pz(-46)); x.lineTo(px(3.5), pz(-8)); x.quadraticCurveTo(px(4), pz(-4), px(6), pz(-4)); x.stroke();
    x.beginPath(); x.moveTo(px(6.8), pz(16)); x.lineTo(px(6.8), pz(56)); x.stroke();
    x.beginPath(); x.arc(px(-2), pz(32), 7 * PXM * 0.5, 0, 6.283); x.setLineDash([12, 10]); x.strokeStyle = '#d8d8d0'; x.stroke(); x.setLineDash([]);
    // bow: the hull number, readable from astern, and the deck-edge line
    x.save(); x.fillStyle = '#e0e0d8'; x.font = 'bold 190px Liberation Sans, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.translate(px(0), pz(-58.5)); x.scale(1.0, 1.25); x.fillText('44', 0, 0); x.restore();
    x.strokeStyle = 'rgba(220,220,210,0.7)'; x.lineWidth = 3; x.strokeRect(2, pz(-40), w - 4, pz(59.5) - pz(-40));
    // deck-edge scuffs
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(90,70,50,${r() * 0.25})`; x.fillRect(r() < 0.5 ? r() * 10 : w - r() * 10, r() * h, 3 + r() * 6, 4 + r() * 20); }
  });
}
function buildDeck() {
  const pts = [];
  for (let z = 60; z >= -66; z -= 1) pts.push([deckHalf(z), z]);
  pts.push([deckHalf(-66), -66]);
  for (let z = -66; z <= 60; z += 1) pts.push([-deckHalf(z), z]);
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 14) / 28, 1 - (p.getZ(i) + 66) / 126);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: deckTexture() })); m.position.y = DECK + 0.01; m.name = 'flightdeck';
  return m;
}

// ------------------------------------------------------------------------------------------------- deck gear
function buildDeckGear(kit, glow) {
  // arresting wires (cross-deck pendants) on their bow-spring supports
  for (const wz of [44, 39.5, 35, 30.5]) {
    kit.rod([-11.6, DECK + 0.13, wz], [6.6, DECK + 0.13, wz], 0.045, 0x3a3a38, 4);
    for (const x of [-9, -2.5, 4]) kit.box(0.5, 0.1, 0.18, YELLOW, x, DECK + 0.05, wz);
    for (const x of [-11.9, 6.9]) kit.box(0.5, 0.25, 0.6, DARK, x, DECK + 0.12, wz);   // sheaves
  }
  // catapult shuttle (at the launch bar position of a jet spotted at z -6) and the JBD hinge line
  kit.box(0.45, 0.22, 1.0, 0x50555a, -2.5, DECK + 0.1, -10.7);
  kit.box(9, 0.12, 0.3, DARK, -2.5, DECK + 0.06, 5.6);
  // LSO platform (port side, abeam the wires) with its wind screen, and the Fresnel lens (FLOLS) forward of it
  kit.box(3.2, 0.25, 6.2, HAZE_D, -15.4, DECK - 0.35, 43); kit.box(0.15, 1.2, 6.2, HAZE_D, -16.9, DECK + 0.3, 43);
  kit.box(2.6, 1.1, 0.12, GLASS, -15.5, DECK + 0.4, 40.0);
  kit.box(1.0, 0.9, 0.6, DARK, -15.0, DECK + 0.25, 44.5);                  // the LSO's console
  kit.box(2.4, 1.4, 4.0, HAZE_D, -15.3, DECK - 1.0, 30); kit.box(0.6, 2.2, 1.0, 0x222426, -14.6, DECK + 0.95, 30);   // lens sponson + lens box
  glow.box(0.08, 0.55, 0.5, 0xffb020, -14.25, DECK + 1.15, 30);          // the meatball (amber)
  glow.box(0.08, 0.12, 2.4, 0x30ff50, -14.25, DECK + 0.65, 27.9); glow.box(0.08, 0.12, 2.4, 0x30ff50, -14.25, DECK + 0.65, 32.1);   // datum lights
  // catwalks and safety nets along the deck edges (gaps at the elevators, sponsons and the LSO platform)
  const nets = [[-1, -40, -38.6], [-1, -24.6, 38], [-1, 47, 57], [1, -40, -24.6], [1, -9.5, 16.6], [1, 30.5, 45], [1, 52, 57]];
  for (const [sd, z0, z1] of nets) {
    const x = sd * (W / 2 + 0.55);
    kit.box(1.1, 0.12, z1 - z0, HAZE_D, x, DECK - 0.7, (z0 + z1) / 2);
    kit.box(0.06, 0.9, z1 - z0, 0x2f3236, x + sd * 0.55, DECK - 0.25, (z0 + z1) / 2);   // the net (dark, reads as mesh at a distance)
    for (let z = z0; z <= z1; z += 3) kit.rod([sd * W / 2, DECK - 0.7, z], [x + sd * 0.55, DECK + 0.15, z], 0.035, HAZE_D, 4);
  }
  // deck-edge lights (embedded), drop lights down the stern, the centreline lights in the landing area
  for (let z = -38; z <= 58; z += 6) { glow.box(0.25, 0.06, 0.25, 0xfff2c0, -13.5, DECK + 0.03, z); glow.box(0.25, 0.06, 0.25, 0xfff2c0, 13.5, DECK + 0.03, z); }
  for (let z = -2; z <= 58; z += 4) glow.box(0.18, 0.05, 0.4, 0xffffff, -2.5, DECK + 0.03, z);
  for (let y = 7.4; y > 2; y -= 0.7) glow.box(0.25, 0.25, 0.08, 0xffd27a, -2.5, y, 57.15);
  // deck fuel / service stations at the deck edge (purple-banded hose reels)
  for (const [x, z] of [[13.2, -30], [13.2, 36], [-13.2, 10]]) { kit.cyl(0.45, 0.45, 0.5, 0x5a2a74, x, DECK + 0.25, z, 0, 0, Math.PI / 2, 10); kit.box(0.8, 0.5, 0.9, HAZE_D, x, DECK + 0.25, z + 0.9); }
  // folding whip antennas on the deck edge (lowered for flight ops), and the bow anchors' hawse pipes
  for (const [x, z] of [[14.3, 50], [14.3, 12], [-14.3, 20], [-14.3, -10]]) kit.rod([x, DECK - 0.3, z], [x + Math.sign(x) * 4.5, DECK - 0.1, z + 0.7], 0.05, 0xdadad2, 4);
  for (const sd of [-1, 1]) { kit.cyl(0.55, 0.55, 0.6, BLACK, sd * 6.3, 4.6, -56.5, 0, 0, Math.PI / 2 - sd * 0.3, 10); kit.box(0.4, 1.6, 1.1, 0x1a1a1a, sd * 6.5, 3.4, -56.2, 0, 0, sd * -0.3); }
  // hangar-deck openings in the side under the elevators (dark), and the sponsons for the mounts
  for (const E of ELEVATORS) { const sd = Math.sign(E.x0 + E.x1), zc = (E.z0 + E.z1) / 2, len = E.z1 - E.z0 - 1;
    kit.box(0.12, 2.6, len, 0x23272b, sd * 12.25, 5.4, zc);                                                        // the hangar beyond (dim)
    kit.box(0.16, 1.1, len, 0x5f676e, sd * 12.28, 6.15, zc); for (const y of [5.75, 6.05, 6.35]) kit.box(0.18, 0.04, len, 0x454c52, sd * 12.29, y, zc);   // roller door, part up
    for (let z = E.z0 + 2; z < E.z1 - 1; z += 3) glow.box(0.05, 0.12, 0.9, 0xfff0c8, sd * 12.2, 5.5, z);   // hangar lights
    kit.box(4.6, 0.6, E.z1 - E.z0, HAZE_D, sd * 13.0, DECK - 0.45, (E.z0 + E.z1) / 2);
  }
}
// gun sponsons: [x, z] of the mount, and its outward direction; built below the deck edge
const MOUNTS = [
  { kind: 'ciws', x: 16.3, z: -29, y: DECK - 1.0, out: [1, 0, -0.3] },     // fwd starboard: Phalanx
  { kind: 'sam', x: -16.5, z: -30, y: DECK - 1.4, out: [-1, 0, -0.4] },     // fwd port: Sea Sparrow Mk 25
  { kind: 'ciws', x: -16.3, z: 50, y: DECK - 1.0, out: [-1, 0, 0.4] },      // aft port: Phalanx
  { kind: 'sam', x: 16.5, z: 51, y: DECK - 1.4, out: [1, 0, 0.5] },         // aft starboard: Sea Sparrow
];
function buildSponsons(kit) {
  for (const m of MOUNTS) {
    const sd = Math.sign(m.x), w = Math.abs(m.x) - 12 + 2.2;
    kit.box(w, 0.35, 5.2, HAZE, sd * (12 + w / 2 - 0.3), m.y - 0.15, m.z);
    kit.rail([[sd * 14, m.y, m.z - 2.6], [sd * (Math.abs(m.x) + 2.1), m.y, m.z - 2.6], [sd * (Math.abs(m.x) + 2.1), m.y, m.z + 2.6], [sd * 14, m.y, m.z + 2.6]], 0.9, HAZE_D, 0.9, 0.03);
    // the brackets under it
    for (const dz of [-2, 2]) kit.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -3, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, -3, 0], 3)), HAZE_D, T(sd * 12, m.y - 0.3, m.z + dz, 0, 0, 0, sd * (w - 0.5), 1, 1));
  }
}

// ------------------------------------------------------------------------------------------------- vehicles
// MD-3A tow tractor (yellow, 1980), Tilly (the crash crane), a fuel bowser, a starting unit (huffer), fire bottles
function tractor(kit, x, z, yaw, col = YELLOW) {
  kit.push(T(x, DECK, z, 0, yaw, 0));
  kit.box(1.65, 0.75, 3.0, col, 0, 0.62, 0); kit.box(1.5, 0.5, 1.0, col, 0, 1.15, 0.65); kit.box(0.55, 0.12, 0.55, 0x1c1c1c, 0, 1.45, 0.2);
  kit.box(0.4, 0.5, 0.06, 0x1c1c1c, 0, 1.62, 0.5); kit.box(1.7, 0.18, 0.2, 0x1c1c1c, 0, 0.45, -1.55);
  for (const [wx, wz] of [[-0.85, -0.95], [0.85, -0.95], [-0.85, 0.95], [0.85, 0.95]]) kit.cyl(0.36, 0.36, 0.3, 0x141414, wx, 0.36, wz, 0, 0, Math.PI / 2, 10);
  kit.pop();
}
function tilly(kit, x, z, yaw) {
  kit.push(T(x, DECK, z, 0, yaw, 0));
  kit.box(2.6, 1.6, 6.4, YELLOW, 0, 1.3, 0); kit.box(1.4, 1.5, 1.6, YELLOW, -0.5, 2.6, 2.0); kit.box(1.3, 0.8, 1.5, GLASS, -0.5, 2.8, 1.98);
  for (const [wx, wz] of [[-1.2, -2.2], [1.2, -2.2], [-1.2, 2.2], [1.2, 2.2]]) kit.cyl(0.6, 0.6, 0.5, 0x141414, wx, 0.6, wz, 0, 0, Math.PI / 2, 12);
  kit.box(0.7, 0.7, 7.5, YELLOW, 0.4, 3.6, -1.6, 0.42); kit.box(0.5, 0.5, 4.5, 0xc29f1a, 0.4, 5.6, -6.5, 0.42);   // boom
  kit.rod([0.4, 7.2, -8.6], [0.4, 3.2, -8.9], 0.03, 0x111111, 4); kit.box(0.3, 0.5, 0.3, 0x222222, 0.4, 3.0, -8.9);
  kit.pop();
}
function bowser(kit, x, z, yaw) {
  kit.push(T(x, DECK, z, 0, yaw, 0));
  kit.box(1.9, 1.3, 1.6, WHITE, 0, 1.15, -2.0); kit.box(1.8, 0.6, 1.4, GLASS, 0, 1.5, -2.6);
  kit.cyl(0.85, 0.85, 3.6, 0xb8bcbe, 0, 1.25, 0.6, Math.PI / 2, 0, 0, 12); kit.box(1.92, 0.25, 4.4, 0x6a2c8c, 0, 0.5, 0.2);
  for (const [wx, wz] of [[-0.85, -2.0], [0.85, -2.0], [-0.85, 1.6], [0.85, 1.6]]) kit.cyl(0.45, 0.45, 0.3, 0x141414, wx, 0.45, wz, 0, 0, Math.PI / 2, 10);
  kit.cyl(0.35, 0.35, 0.5, 0x222222, 0, 1.1, 2.6, 0, 0, Math.PI / 2, 10);
  kit.pop();
}
function huffer(kit, x, z, yaw) { kit.push(T(x, DECK, z, 0, yaw, 0)); kit.box(1.2, 0.9, 1.8, YELLOW, 0, 0.65, 0); kit.box(1.0, 0.3, 1.0, 0x222222, 0, 1.2, 0.3); kit.cyl(0.13, 0.13, 3.0, 0x2a2a2a, 0.3, 0.3, -2.2, Math.PI / 2, 0, 0, 6); for (const sx of [-0.55, 0.55]) for (const sz of [-0.6, 0.6]) kit.cyl(0.2, 0.2, 0.15, 0x141414, sx, 0.2, sz, 0, 0, Math.PI / 2, 8); kit.pop(); }
function fireBottle(kit, x, z) { kit.cyl(0.25, 0.25, 1.1, 0xb8261c, x, DECK + 0.6, z, 0, 0, 0, 8); kit.box(0.7, 0.1, 0.4, 0x222222, x, DECK + 0.1, z); }

// parked aircraft: baked once, instanced
let _hornetGeo = null, _tomcatGeo = null;
function hornetGeo() {
  if (_hornetGeo) return _hornetGeo;
  const m = buildJetMesh(1); m.animate({ gear: 1, hook: 0, canopy: 0, flap: 0, lights: false });
  _hornetGeo = bake(m.group); return _hornetGeo;
}
function tomcatGeo(buildTomcat) {
  if (_tomcatGeo) return _tomcatGeo;
  const t = buildTomcat(1); t.wings[0].rotation.y = -1.2; t.wings[1].rotation.y = 1.2;   // oversweep for the deck
  const g = new THREE.Group(); t.group.scale.setScalar(1.68); t.group.position.y = 2.25; g.add(t.group);
  // landing gear (the escort model is built for the air): nose gear, two mains, tyres
  const k = new Kit({ wear: 0 });
  k.rod([0, 1.1, -6.3], [0, 0.35, -6.4], 0.09, 0xd9dcde); k.cyl(0.33, 0.33, 0.3, 0x1b1b1b, -0.18, 0.33, -6.4, 0, 0, Math.PI / 2, 10); k.cyl(0.33, 0.33, 0.3, 0x1b1b1b, 0.18, 0.33, -6.4, 0, 0, Math.PI / 2, 10);
  for (const sd of [-1, 1]) { k.rod([sd * 2.5, 1.6, 0.6], [sd * 2.6, 0.5, 0.9], 0.12, 0xd9dcde); k.cyl(0.5, 0.5, 0.4, 0x1b1b1b, sd * 2.65, 0.5, 0.9, 0, 0, Math.PI / 2, 12); }
  _tomcatGeo = mergeGeos([bake(g), k.geometry()]); return _tomcatGeo;
}
function instanced(geo, list, y) {
  const m = new THREE.InstancedMesh(geo, hullMat(), list.length);
  list.forEach(([x, z, yaw], i) => m.setMatrixAt(i, T(x, DECK + y, z, 0, yaw, 0)));
  m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; return m;
}
// chocks (yellow) at the main wheels and tie-down chains of a parked aircraft (in its own frame: mains at +-mx, mz)
function chocks(kit, x, z, yaw, mx, mz, nz) {
  kit.push(T(x, DECK, z, 0, yaw, 0));
  for (const sd of [-1, 1]) {
    for (const dz of [-0.5, 0.5]) kit.box(0.35, 0.22, 0.25, YELLOW, sd * mx, 0.11, mz + dz);
    kit.rod([sd * mx, 0.9, mz], [sd * (mx + 1.3), 0.02, mz - 1.2], 0.03, 0x2a2a2a, 3); kit.rod([sd * mx, 0.9, mz], [sd * (mx + 1.2), 0.02, mz + 1.3], 0.03, 0x2a2a2a, 3);
  }
  kit.box(0.3, 0.2, 0.25, YELLOW, 0, 0.1, nz - 0.45); kit.rod([0, 0.6, nz], [0, 0.02, nz - 1.6], 0.03, 0x2a2a2a, 3);
  kit.pop();
}

// ------------------------------------------------------------------------------------------------- the ship
// opts: { buildTomcat } (ships.js passes its own, to avoid an import cycle), crew: false to leave the deck empty
export function buildAlbatross(side = 1, opts = {}) {
  const g = new THREE.Group(); g.name = 'ALBATROSS';
  const grime = (x, y, z, c, r) => {
    if (y < -0.7) c.setHex(0x5a2420);                                  // anti-fouling red below the boot-top
    else if (y < 0.7) c.setHex(0x1b1c1e);                              // black boot-top
    else if (y < 2.2 && Math.abs(x) > 6) c.multiplyScalar(0.86);       // waterline grime
    if (y > 0.7 && r() < 0.18) c.multiplyScalar(0.94 + r() * 0.04);    // plate-to-plate variation
  };
  const kit = new Kit({ wear: 0.035, seed: 3, grime }), glow = new Kit({ wear: 0 }), sheet = new DecalSheet(1024, 8, 8);
  buildHull(kit); buildIsland(kit, glow, sheet); buildDeckGear(kit, glow); buildSponsons(kit);
  // vehicles and deck clutter
  tractor(kit, 5.6, -1.5, 0.4); tractor(kit, 12.2, 38, Math.PI); tractor(kit, -11.6, -44, -0.3, 0xe8e8e2);
  tilly(kit, 5.9, 12.5, 0.05); bowser(kit, 10.6, -38.5, 2.6); huffer(kit, 4.6, -16, 1.2); huffer(kit, 4.3, 46, -0.6);
  for (const [x, z] of [[4.2, -25], [6.4, 24], [12.4, 15.8], [-12.6, 2]]) fireBottle(kit, x, z);
  for (let i = 0; i < 4; i++) kit.box(0.6, 0.15, 3.2, 0x2a2a2a, -12.6 + i * 0.75, DECK + 0.08, -18 + i * 0.4, 0, 0.1, 0);   // tow bars stacked at the edge
  // parked aircraft: two Hornets forward of the island (tails over the starboard edge), two Tomcats aft (oversweep)
  const hornets = [[8.9, -46, 0.62], [9.2, -31, 0.62]], cats = [[9.0, 27, 0.06], [9.3, 46.5, -0.1]];
  const hornetMesh = instanced(hornetGeo(), hornets, 2.05); hornetMesh.name = 'parked-hornets'; g.add(hornetMesh);
  if (opts.buildTomcat) { const tm = instanced(tomcatGeo(opts.buildTomcat), cats, 0); tm.name = 'parked-tomcats'; g.add(tm); for (const [x, z, yw] of cats) chocks(kit, x, z, yw, 2.6, 0.9, -6.4); }
  for (const [x, z, yw] of hornets) chocks(kit, x, z, yw, 1.6, 0.6, -4.6);
  // hull decals: the name across the stern, draft marks, rust from the hawse pipes and the scuppers
  const name = sheet.draw(16, 8, 1, (x, w, h) => drawText(x, w, h, 'ALBATROSS', { size: 0.62, color: '#e4e4dc', shadow: '#1a1a1a' }));
  sheet.place(name, T(0, 4.3, 57.06), 13, 1.6);
  const rust = sheet.draw(24, 1, 3, (x, w, h) => drawStreak(x, w, h, rng(5), { a: 0.75, n: 6 }));
  const rust2 = sheet.draw(25, 1, 3, (x, w, h) => drawStreak(x, w, h, rng(9), { col: [92, 70, 52], a: 0.55, n: 4 }));
  const rr = rng(77);
  for (const sd of [-1, 1]) {
    // hawse pipe weep (big), then scupper streaks under the gallery deck all down the side
    sheet.place(rust, T(sd * 7.0, 2.4, -55.6, 0, sd * (Math.PI / 2 - 0.55), 0), 1.8, 4.2, sd < 0);
    for (let z = -40; z < 54; z += 5 + rr() * 6) {
      const hh = 12.27; sheet.place(rr() < 0.6 ? rust : rust2, T(sd * hh, 4.3 - rr() * 0.6, z, 0, sd * Math.PI / 2, 0), 0.9 + rr() * 0.8, 2.4 + rr() * 2, sd < 0);
    }
  }
  const draft = sheet.draw(26, 1, 3, (x, w, h) => { for (let i = 0; i < 4; i++) drawText(x, w, h / 4, String(36 - i * 2), { size: 0.7 }), x.translate(0, h / 4); });
  for (const sd of [-1, 1]) { sheet.place(draft, T(sd * 3.1, 1.7, -58.4, 0, sd * (Math.PI / 2 - 0.62), 0), 0.8, 2.6, sd < 0); sheet.place(draft, T(sd * 8.4, 1.7, 56.9, 0, 0, 0), 0.8, 2.6); }
  const hull = kit.mesh(); hull.name = 'albatross-hull'; g.add(hull);
  g.add(buildDeck());
  const dec = sheet.mesh(); dec.name = 'albatross-decals'; g.add(dec);
  const lights = new THREE.Mesh(glow.geometry(), glowMat()); lights.name = 'albatross-lights'; g.add(lights);

  // the tower group (helm.js mounts the bridge interior here), its window band, rotating radars, the beacon
  const tw = new THREE.Group(); tw.position.set(ALB.TOWER_X, DECK, ALB.TOWER_Z); g.add(tw);
  const band = new THREE.Mesh(new THREE.BoxGeometry(5.12, 2.0, 10.12), new THREE.MeshPhongMaterial({ color: GLASS, flatShading: true, shininess: 80, specular: 0x556677 }));
  band.position.set(0, 11.2, -1); tw.add(band);
  // window mullions on the band (part of the band so the bridge view hides them too)
  { const mk = new Kit({ wear: 0 }); for (let i = 0; i <= 8; i++) { mk.box(0.12, 2.02, 0.12, HAZE_D, -2.5 + i * 0.625, 0, -5.06); } for (let i = 0; i <= 13; i++) { mk.box(0.12, 2.02, 0.12, HAZE_D, -2.56, 0, -6 + i * 0.77); mk.box(0.12, 2.02, 0.12, HAZE_D, 2.56, 0, -6 + i * 0.77); } const mm = mk.mesh(); band.add(mm); }
  // SPS-49 long-range air search (curved mesh reflector) on the mast platform: war.js spins parts.dish
  const dish = new THREE.Group(); dish.position.set(0.1, 21.6, -1.0); tw.add(dish);
  { const k = new Kit({ wear: 0 });
    const refl = new THREE.CylinderGeometry(2.6, 2.6, 1.8, 14, 1, true, -0.62, 1.24); k.add(refl, 0x9aa1a6, T(0, 1.15, 2.2, 0, Math.PI, 0));
    k.add(new THREE.CylinderGeometry(2.62, 2.62, 1.8, 14, 1, true, -0.62, 1.24), 0x3a3e42, T(0, 1.15, 2.22, 0, Math.PI, 0, 1.0, 1, 1));
    k.box(0.25, 0.25, 1.3, 0x50565c, 0, 1.15, -0.25); k.box(0.4, 0.4, 0.4, 0x50565c, 0, 1.15, -0.95); k.cyl(0.2, 0.25, 0.9, 0x50565c, 0, 0.45, 0, 0, 0, 0, 8);
    const dm = k.mesh(); dm.material = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }); dish.add(dm); }
  // SPS-48 3D radar: a square planar array tilted back, on the forward island top
  const sps48 = new THREE.Group(); sps48.position.set(0, 13.35, -3.6); tw.add(sps48);
  { const k = new Kit({ wear: 0 }); k.cyl(0.35, 0.45, 1.1, HAZE_D, 0, 0.55, 0, 0, 0, 0, 8); k.box(2.5, 2.5, 0.35, 0x8d959b, 0, 2.3, 0, -0.26); k.box(2.3, 2.3, 0.05, 0x3a4046, 0, 2.3, -0.2, -0.26); k.box(2.6, 0.2, 0.5, HAZE_D, 0, 1.0, 0.1); sps48.add(k.mesh()); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3a22 })); lamp.position.set(0.1, 31.2, -1.0); tw.add(lamp);

  // weapon mounts (war.js guns) on the sponsons; mounts = the DEFENCE agent's attach points
  const guns = [], mounts = [];
  const team = new THREE.MeshPhongMaterial({ color: 0x33bbff });
  for (const M of MOUNTS) {
    const gun = M.kind === 'ciws' ? buildPhalanx(team) : buildSeaSparrow(team);
    gun.position.set(M.x, M.y, M.z); gun.userData.yaw.rotation.y = Math.atan2(-M.out[0], -M.out[2]); g.add(gun); guns.push(gun);
    mounts.push({ kind: M.kind, pos: new THREE.Vector3(M.x, M.y, M.z), dir: new THREE.Vector3(...M.out).normalize(), node: gun, gun: guns.length - 1, arc: [Math.atan2(-M.out[0], -M.out[2]) - 2.2, Math.atan2(-M.out[0], -M.out[2]) + 2.2] });
  }
  // the JBD panel behind the catapult (lowered; parts.setJBD(0..1) raises it)
  const jbd = new THREE.Group(); jbd.position.set(-2.5, DECK + 0.04, 3.2); g.add(jbd);
  { const k = new Kit({ wear: 0.02 }); k.box(9, 0.12, 2.4, 0x55595e, 0, 0.06, 1.2); for (let i = -4; i <= 4; i += 1) k.box(0.1, 0.16, 2.4, 0x3a3d40, i, 0.08, 1.2); k.box(9, 0.05, 2.3, 0x2c2e30, 0, -0.01, 1.2); jbd.add(k.mesh()); }

  // a tractor doing laps round the fantail (a blue shirt driving), the way decks are never still
  const tug = { s: 0, seat: [0, DECK, 0, 0], path: [[2.6, 56.5], [-10.5, 56.5], [-10.5, 49.5], [2.6, 49.5]], v: 1.6, yaw: 0 };
  { const k = new Kit({ wear: 0.02 }); tractor(k, 0, 0, 0); tug.mesh = k.mesh(); tug.mesh.position.y = 0; g.add(tug.mesh); }
  tug.step = dt => {
    const P = tug.path, n = P.length; let seg = 0, s = (tug.s = (tug.s + tug.v * dt));
    const lens = P.map((a, i) => Math.hypot(P[(i + 1) % n][0] - a[0], P[(i + 1) % n][1] - a[1])), tot = lens.reduce((a, b) => a + b, 0);
    s %= tot; while (s > lens[seg]) { s -= lens[seg]; seg++; }
    const a = P[seg], b = P[(seg + 1) % n], k = s / lens[seg], x = a[0] + (b[0] - a[0]) * k, z = a[1] + (b[1] - a[1]) * k;
    const want = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])); let d = want - tug.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); tug.yaw += d * Math.min(1, dt * 2.5);
    tug.mesh.position.set(x, 0, z); tug.mesh.rotation.y = tug.yaw;
    const c = Math.cos(tug.yaw), sn = Math.sin(tug.yaw); tug.seat = [x + 0.3 * sn, DECK + 1.05, z + 0.3 * c, tug.yaw];
  };
  tug.step(0);
  // deck crew
  let crew = null;
  if (opts.crew !== false) {
    const C = [
      // around the catapult and the bow: green shirts at the shuttle, a yellow shooter, blue chockers
      { x: -9.4, z: -4.2, yaw: 0.8, jersey: 'green', mode: 'kneel' }, { x: 4.0, z: -12, yaw: -0.5, jersey: 'green' }, { x: -9.6, z: -10, yaw: 0.5, jersey: 'yellow', mode: 'signal' },
      { x: -10.2, z: -26, yaw: 1.4, jersey: 'white', hands: true }, { x: -10.8, z: -42, yaw: 0.4, jersey: 'blue', mode: 'talk' }, { x: -10.2, z: -41, yaw: -2.6, jersey: 'blue' },
      // the parked Hornets: plane captains, a purple fueller, an ordie, chockers
      { x: 5.2, z: -44, yaw: -1.9, jersey: 'brown' }, { x: 6.8, z: -40.5, yaw: 2.4, jersey: 'purple', mode: 'kneel' }, { x: 6.0, z: -28.5, yaw: -2.0, jersey: 'red', mode: 'kneel' },
      { x: 4.6, z: -33, yaw: -1.2, jersey: 'brown', hands: true }, { x: 11.8, z: -36, yaw: 3.0, jersey: 'blue', mode: 'talk' }, { x: 4.8, z: -21, yaw: 0.6, jersey: 'green' },
      // the island: flight-deck control, a safety officer, a medic, the tractor driver
      { x: 6.3, z: -3.8, yaw: 2.8, jersey: 'yellow', hands: true }, { x: 7.2, z: 1.2, yaw: -1.6, jersey: 'white' }, { x: 6.6, z: 3, yaw: -1.5, jersey: 'blue', mode: 'talk' },
      { x: 7.1, z: 9, yaw: -2.8, jersey: 'red' },
      // aft: Tomcat crews, the arresting gear (green), the LSO team on the platform
      { x: 5.0, z: 22, yaw: 1.8, jersey: 'brown' }, { x: 6.2, z: 34, yaw: 2.6, jersey: 'purple' }, { x: 5.1, z: 41.5, yaw: -1.2, jersey: 'blue', mode: 'kneel' }, { x: 12.6, z: 54, yaw: 0.4, jersey: 'red', mode: 'talk' },
      { x: -12.5, z: 47, yaw: 0.2, jersey: 'green' }, { x: -12.8, z: 36.5, yaw: 1.1, jersey: 'green', hands: true },
      { x: -15.2, z: 42, yaw: Math.PI - 0.15, jersey: 'white', mode: 'lso', y: DECK - 0.22 }, { x: -14.6, z: 44.2, yaw: Math.PI + 0.2, jersey: 'white', y: DECK - 0.22 }, { x: -16.0, z: 44.8, yaw: Math.PI, jersey: 'white', mode: 'talk', y: DECK - 0.22 },
      // people walking the deck: along the street by the island, across the bow, round the fantail
      { mode: 'walk', jersey: 'blue', path: [[4.4, -48], [4.4, -6], [6.6, -4], [6.6, 16], [6.6, -4], [4.4, -6]], speed: 1.3 },
      { mode: 'walk', jersey: 'yellow', path: [[3.8, 18], [3.8, 46], [3.8, 18]], speed: 1.1 },
      { mode: 'walk', jersey: 'green', path: [[-12, -40], [-12, -6], [-12, -40]], speed: 1.4 },
      { mode: 'walk', jersey: 'purple', path: [[12.8, -34], [12.8, -12], [12.8, -34]], speed: 0.9 },
      { mode: 'walk', jersey: 'brown', path: [[12.6, 18], [12.6, 54], [12.6, 18]], speed: 1.2 },
    ];
    for (const p of C) { p.y ??= DECK; if (p.path) { p.x = p.path[0][0]; p.z = p.path[0][1]; } }
    C.push({ mode: 'seated', jersey: 'blue', at: () => tug.seat });
    crew = createCrew(C, { seed: 21 }); g.add(crew.group);
  }
  // per-frame: radars, crew, JBD. dist = camera distance (skip the people when far); avoid(x, z) in the ship frame
  const parts = {
    group: g, guns, dish, lamp, lights: [], teamM: team, tower: tw, band, mounts, crew, sps48, jbd, hull, deck: g.getObjectByName('flightdeck'),
    jbdK: 0, funnel: new THREE.Vector3(ALB.TOWER_X + 0.1, DECK + 19, ALB.TOWER_Z + 6.6), bow: new THREE.Vector3(0, 1, -60), stern: new THREE.Vector3(0, 0, 57),
    localDeck, deckHalf, motion: 'albatross', dims: ALB, fx: { wake: 1, smoke: 1 },
    setJBD(k, dt) { const want = Math.max(0, Math.min(1, k)); parts.jbdK = dt ? parts.jbdK + Math.max(-dt * 0.7, Math.min(dt * 0.7, want - parts.jbdK)) : want; jbd.rotation.x = -parts.jbdK * 0.95; },   // raised: the aft edge lifts about the forward hinge
    tick(dt, t, dist = 0, avoid = null) {
      sps48.rotation.y += dt * 1.57;
      for (const gun of guns) gun.userData.tick?.(dt);
      if (dist < 450) tug.step(dt);
      if (crew) { const near = dist < 450; crew.group.visible = near; if (near) crew.update(dt, t, avoid); }
    },
  };
  return parts;
}
