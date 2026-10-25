// ch46cockpit.js - the CH-46 Sea Knight cockpit for the player's first-person view: side by side, the aircraft commander
// on the RIGHT (x +0.5), the copilot flying with him on the left. Built in the airframe's local frame (ch46model.js:
// x right, y up, nose -z, origin at the CG) and added to the model group, so it rides with the aircraft; the model's
// own cockpit crew / seats / panel (parts.cockpitBits) are hidden while it shows.
// 1980 analog: steam gauges on a flat black panel - each pilot's airspeed, attitude, altimeter, vertical speed,
// bearing-distance-heading indicator, turn and slip, radar altimeter; the centre stack: dual torquemeter (No 1 / No 2
// needles, % of the transmission limit), triple tachometer (rotor NR + the two power turbines N2), two gas generator
// (N1) gauges, fuel quantity, transmission oil; master caution lamps on the glare shield; the caution panel on the
// pedestal (ch46play.js CH46_CAPTIONS). The overhead console carries the start: BATTERY, APU, GEN 1 / 2, the two START
// switches, the two ENGINE CONDITION LEVERS (STOP / GND IDLE / FLY) and the ROTOR BRAKE handle; the pedestal the
// SAS / AFCS panel, the landing light, the ramp and the parking brake. Every one of those is clickable. Layout INFERRED
// from CH-46E cockpit photographs and NATOPS figures; the gauge faces are drawn live on canvases like the Huey's.
// API: buildCH46Cockpit() -> { group, hitBoxes, labelOf(id), update(dt, S (ch46play panel()), hover id), EYE, EYE_PITCH }
import * as THREE from 'three';
import { canvasTex, P2, txt, faceBg, band, radial, needle, hub, offFlag, lin, dialFace } from '../../../hueycockpit.js';
import { CH46_CAPTIONS } from './ch46play.js';
import { crewGeometry, crewMaterial } from '../../../interiors/crewfig.js';

export const CH46_EYE = new THREE.Vector3(0.5, 0.3, -5.48), CH46_EYE_PITCH = -0.2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2, D2R = Math.PI / 180, FL = -0.98;
const GRN = '#2db040', YEL = '#e8c020', RED = '#e8281a';
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export function buildCH46Cockpit() {
  const g = new THREE.Group(); g.name = 'ch46Cockpit'; g.visible = false;
  // the cockpit is lit through the glazing: every surface gets some self-light (like the Huey's)
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.6), ...o });
  const black = M(0x151617), panelM = M(0x1c1e1f), glareM = M(0x0f1010), olive = M(0x5a6246), oliveD = M(0x3e4532), grey = M(0x6c706c);
  const floorM = M(0x2e312a), seatM = M(0x3d4236), cushion = M(0x2a2f25), metal = M(0x7b8186), frameM = M(0x262a24), suit = M(0x56603f), glove = M(0x4a3c2c), bootM = M(0x141414), redM = M(0xb01a10), yelM = M(0xd8b020);
  const box = (w, h, d, m, x, y, z, p = g, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); p.add(o); return o; };
  const cyl = (r0, r1, h, m, x, y, z, p = g, rx = 0, rz = 0, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); p.add(o); return o; };
  const plane = (w, h, mat, x, y, z, p = g) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); o.position.set(x, y, z); p.add(o); return o; };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const tube = (pts, r, m = frameM, p = g) => { const o = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(4, pts.length * 4), r, 6), m); p.add(o); return o; };
  const limbGeo = new THREE.CylinderGeometry(1, 0.9, 1, 8);
  function setLimb(o, a, b) { _v.subVectors(b, a); const L = _v.length(); o.position.copy(a).addScaledVector(_v, 0.5); o.quaternion.setFromUnitVectors(_up, _v.multiplyScalar(1 / L)); o.scale.set(o.userData.r, L, o.userData.r); }
  const limb = (a, b, r, m) => { const o = new THREE.Mesh(limbGeo, m); o.userData.r = r; g.add(o); setLimb(o, a, b); return o; };

  // ---------------------------------------------------------------- structure: floor, frames, side consoles, seats
  box(2.05, 0.03, 1.5, floorM, 0, FL, -5.75);
  box(1.6, 0.03, 0.5, oliveD, 0, FL + 0.05, -6.38, g, 0.35);                         // the toe board rising into the nose
  // windscreen frames (the model's glazing is the glass): centre post, the side pillars, the overhead window bows
  tube([V3(0, 0.04, -6.42), V3(0, 0.5, -6.1), V3(0, 0.86, -5.68)], 0.028);
  for (const s of [-1, 1]) {
    tube([V3(s * 0.9, 0.04, -6.36), V3(s * 1.04, 0.45, -6.0), V3(s * 1.0, 0.84, -5.5)], 0.03);
    tube([V3(s * 0.05, 0.84, -5.62), V3(s * 0.6, 0.86, -5.58), V3(s * 1.0, 0.82, -5.5)], 0.024);
    tube([V3(s * 1.08, 0.1, -5.42), V3(s * 1.09, 0.62, -5.42)], 0.03);             // door post behind the side window
    box(0.22, 0.32, 0.9, olive, s * 0.96, -0.8, -5.7);                               // side console under the window
    box(0.2, 0.012, 0.85, black, s * 0.95, -0.635, -5.7);
  }
  // armoured seats (the CH-46's crew seats with side armour), the copilot in his
  for (const s of [-1, 1]) {
    const x = s * 0.5;
    box(0.5, 0.08, 0.48, seatM, x, -0.55, -5.36); box(0.46, 0.06, 0.42, cushion, x, -0.49, -5.38);
    box(0.5, 0.85, 0.08, seatM, x, -0.12, -5.1, g, -0.12); box(0.46, 0.7, 0.05, cushion, x, -0.1, -5.15, g, -0.12);
    for (const k of [-1, 1]) box(0.04, 0.55, 0.5, oliveD, x + k * 0.27, -0.3, -5.21);   // side armour
    cyl(0.03, 0.03, 0.45, metal, x, -0.78, -5.36);
  }
  const copilot = new THREE.Mesh(crewGeometry('heloPilot', 'seated', { arms: 'controls', seed: 3 }), crewMaterial());
  copilot.position.set(-0.5, -0.5, -5.36); copilot.rotation.y = Math.PI; g.add(copilot);

  // ---------------------------------------------------------------- glare shield and instrument panel
  box(1.9, 0.025, 0.3, glareM, 0, 0.02, -6.33);
  box(1.9, 0.05, 0.03, glareM, 0, 0.0, -6.18);
  const P = new THREE.Group(); P.position.set(0, -0.27, -6.2); P.rotation.x = -0.3; g.add(P);
  box(1.96, 0.54, 0.04, panelM, 0, 0.0, -0.025, P);
  // gauges: [x, y, diameter] in panel coordinates (pilot right, copilot left, the engine stack in the middle)
  const GL = {
    asi: [0.3, 0.14, 0.105], adi: [0.5, 0.135, 0.13], alt: [0.7, 0.14, 0.105], ralt: [0.3, 0.005, 0.095], bdhi: [0.5, -0.005, 0.115], vsi: [0.7, 0.005, 0.105], ts: [0.5, -0.13, 0.08],
    asi2: [-0.7, 0.14, 0.105], adi2: [-0.5, 0.135, 0.13], alt2: [-0.3, 0.14, 0.105], ralt2: [-0.7, 0.005, 0.095], bdhi2: [-0.5, -0.005, 0.115], vsi2: [-0.3, 0.005, 0.105], ts2: [-0.5, -0.13, 0.08],
    tq: [-0.075, 0.14, 0.12], tach: [0.075, 0.14, 0.12], n1a: [-0.075, 0.0, 0.1], n1b: [0.075, 0.0, 0.1], fuel: [-0.075, -0.13, 0.095], xmsn: [0.075, -0.13, 0.095],
  };
  const art = canvasTex(1960, 560), PXM = 1000, ax = x => (x + 0.98) * PXM, ay = y => (0.27 - y) * PXM;
  {
    const c = art.ctx; c.fillStyle = '#1c1e1f'; c.fillRect(0, 0, 1960, 560);
    c.strokeStyle = '#34383a'; c.lineWidth = 3;
    for (const [x0, x1] of [[-0.93, -0.18], [-0.165, 0.165], [0.18, 0.93]]) c.strokeRect(ax(x0), ay(0.25), (x1 - x0) * PXM, 0.5 * PXM);
    for (const k in GL) { const [x, y, d] = GL[k], s = d * 1.12 * PXM; c.fillStyle = '#111213'; c.fillRect(ax(x) - s / 2, ay(y) - s / 2, s, s); c.fillStyle = '#5a5e60'; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.arc(ax(x) + dx * s * 0.41, ay(y) + dy * s * 0.41, 4, 0, TAU); c.fill(); } }
    const lab = (t, x, y, s = 13, col = '#e0ddd0') => txt(c, t, ax(x), ay(y), col, s);
    lab('AIRCRAFT COMMANDER', 0.82, -0.2, 12, '#8a8d88'); lab('COPILOT', -0.82, -0.2, 12, '#8a8d88');
    lab('NR 100% = 264 RPM', 0, -0.205, 12); lab('VNE 144 KIAS', 0, -0.23, 12);
    c.fillStyle = '#2a2d2e'; c.fillRect(ax(0.66), ay(-0.17), 160, 30); lab('CH-46F', 0.74, -0.185, 16, '#d0d0c8');
    art.tex.needsUpdate = true;
  }
  plane(1.96, 0.56, new THREE.MeshLambertMaterial({ map: art.tex, emissive: 0xffffff, emissiveMap: art.tex, emissiveIntensity: 0.55 }), 0, -0.01, 0.001, P);
  const ringM = M(0x2a2c2e), gauges = [];
  function gauge(key, size, face, dyn) {
    const [x, y, d] = GL[key], t = canvasTex(size, size), o = new THREE.Mesh(new THREE.CircleGeometry(d / 2, 36), new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false, color: 0xe2e2e2 }));
    o.position.set(x, y, 0.004); P.add(o);
    const ring = new THREE.Mesh(new THREE.RingGeometry(d / 2, d / 2 + 0.007, 36), ringM); ring.position.set(x, y, 0.006); P.add(ring);
    let bg = null; if (face) { bg = document.createElement('canvas'); bg.width = bg.height = size; face(bg.getContext('2d'), size); }
    const G = { key, W: size, ...t, bg, dyn, i: gauges.length }; gauges.push(G); return G;
  }
  // the needles' values (damped), filled from the panel snapshot each frame
  const V = { ias: 0, alt: 0, vsi: 0, agl: 0, p: 0, r: 0, hdg: 0, turn: 0, slip: 0, nr: 0, n2a: 0, n2b: 0, tqa: 0, tqb: 0, n1a: 0, n1b: 0, fuel: 0, xot: 20 };
  const flaky = (S, i) => S.avionics < 0.4 && ((performance.now() / 700 + i * 1.7) % 3) < 1.2;
  const asiMap = lin(0, 0, 200, 330), vsiMap = v => -90 + clamp(v / 4000, -1.02, 1.02) * 170 + 0, raltMap = lin(0, -135, 1500, 135), tqMap = lin(0, -140, 120, 140), tachMap = lin(0, -140, 120, 140), n1Map = lin(0, -140, 110, 140);
  const F = {
    asi: (c, W) => dialFace(c, W, { v0: 0, v1: 200, major: 20, minor: 10, map: asiMap, labels: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180].map(v => [v, String(v)]), reds: [144], bands: [[30, 144, GRN]], title: 'KNOTS', ty: 1.3, ls: 0.15 }),
    alt: (c, W) => dialFace(c, W, { v0: 0, v1: 10, major: 1, minor: 0.2, map: v => v * 36, labels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => [v, String(v)]), title: 'ALT|FT x 100', ty: 1.32, ls: 0.2 }),
    vsi: (c, W) => dialFace(c, W, { v0: -4000, v1: 4000, major: 1000, minor: 500, map: vsiMap, labels: [[-4000, '4'], [-2000, '2'], [0, '0'], [2000, '2'], [4000, '4']], title: 'VERTICAL SPEED|1000 FT/MIN', ty: 1.32, ls: 0.17 }),
    ralt: (c, W) => dialFace(c, W, { v0: 0, v1: 1500, major: 500, minor: 100, map: raltMap, labels: [[0, '0'], [500, '5'], [1000, '10'], [1500, '15']], title: 'RADAR ALT|FT x 100', ty: 1.32, ls: 0.17 }),
    ts: (c, W) => { const R = W / 2; faceBg(c, W); for (const a of [-20, 20]) radial(c, R, a, '#ecebe2', R * 0.6, R * 0.88, R * 0.06); txt(c, 'TURN', R, R * 1.42, '#cfcdc0', R * 0.16); },
    tq: (c, W) => dialFace(c, W, { v0: 0, v1: 120, major: 20, minor: 5, map: tqMap, labels: [0, 20, 40, 60, 80, 100, 120].map(v => [v, String(v)]), bands: [[0, 100, GRN], [100, 110, YEL]], reds: [110], title: 'TORQUE %|1     2', ty: 1.32, ls: 0.15 }),
    tach: (c, W) => dialFace(c, W, { v0: 0, v1: 120, major: 20, minor: 5, map: tachMap, labels: [0, 20, 40, 60, 80, 100, 120].map(v => [v, String(v)]), bands: [[94, 106, GRN]], reds: [94, 113], title: 'NR  %  N2|ROTOR  1  2', ty: 1.32, ls: 0.15 }),
    n1: t => (c, W) => dialFace(c, W, { v0: 0, v1: 110, major: 10, minor: 5, map: n1Map, labels: [0, 20, 40, 60, 80, 100].map(v => [v, String(v)]), bands: [[60, 100, GRN]], reds: [104], title: `GAS PROD|N1 %  ${t}`, ty: 1.32, ls: 0.15 }),
    fuel: (c, W) => dialFace(c, W, { v0: 0, v1: 2500, major: 500, minor: 100, map: lin(0, -135, 2500, 135), labels: [[0, '0'], [500, '5'], [1000, '10'], [1500, '15'], [2000, '20'], [2500, '25']], reds: [300], title: 'FUEL|LB x 100', ty: 1.32, ls: 0.15 }),
    xmsn: (c, W) => dialFace(c, W, { v0: 0, v1: 150, major: 50, minor: 10, map: lin(0, -135, 150, 135), labels: [[0, '0'], [50, '50'], [100, '100'], [150, '150']], bands: [[20, 110, GRN]], reds: [120], title: 'XMSN OIL|TEMP °C', ty: 1.32, ls: 0.15 }),
  };
  function adiDraw(c, W, S, G) {
    const R = W / 2; c.clearRect(0, 0, W, W); const ppd = R * 0.024;
    c.save(); c.beginPath(); c.arc(R, R, R * 0.97, 0, TAU); c.clip(); c.translate(R, R); c.rotate(-V.r);
    const off = clamp(V.p / D2R, -60, 60) * ppd;
    c.fillStyle = '#4a86c4'; c.fillRect(-W, -2 * W + off, 2 * W, 2 * W); c.fillStyle = '#4e3620'; c.fillRect(-W, off, 2 * W, 2 * W);
    c.strokeStyle = '#fff'; c.lineWidth = R * 0.03; c.beginPath(); c.moveTo(-W, off); c.lineTo(W, off); c.stroke(); c.lineWidth = R * 0.018;
    for (let p = -30; p <= 30; p += 5) if (p) { const y = off - p * ppd, w = p % 10 ? R * 0.12 : R * 0.26; c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); if (!(p % 10)) txt(c, String(Math.abs(p)), w + R * 0.12, y, '#fff', R * 0.11); }
    c.restore();
    c.fillStyle = '#111'; c.beginPath(); c.arc(R, R, R, 0, TAU); c.arc(R, R, R * 0.8, 0, TAU, true); c.fill();
    for (const a of [-60, -30, -20, -10, 10, 20, 30, 60]) radial(c, R, a, '#ecebe2', R * 0.8, R * (Math.abs(a) % 30 ? 0.9 : 0.97), R * 0.03);
    c.save(); c.translate(R, R); c.rotate(-V.r); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -R * 0.79); c.lineTo(-R * 0.06, -R * 0.68); c.lineTo(R * 0.06, -R * 0.68); c.fill(); c.restore();
    c.strokeStyle = '#ffd040'; c.lineWidth = R * 0.07; c.lineCap = 'round'; c.beginPath(); c.moveTo(R - R * 0.55, R); c.lineTo(R - R * 0.2, R); c.lineTo(R - R * 0.1, R + R * 0.1); c.moveTo(R + R * 0.55, R); c.lineTo(R + R * 0.2, R); c.lineTo(R + R * 0.1, R + R * 0.1); c.stroke(); c.lineCap = 'butt';
    c.fillStyle = '#ffd040'; c.beginPath(); c.arc(R, R, R * 0.045, 0, TAU); c.fill();
    if (S.volts < 18 || flaky(S, G.i)) offFlag(c, W, 'OFF', 0.28, 0.68, -0.5);
  }
  function bdhiDraw(c, W, S, G) {   // heading card turning with the heading (no TACAN tuned: the needles parked)
    const R = W / 2; faceBg(c, W); if (flaky(S, G.i)) { offFlag(c, W); return; }
    c.save(); c.translate(R, R); c.rotate(-V.hdg);
    for (let a = 0; a < 360; a += 5) { const L = a % 30 ? (a % 10 ? 0.07 : 0.11) : 0.15; c.strokeStyle = '#ecebe2'; c.lineWidth = R * 0.025; c.beginPath(); c.moveTo(Math.sin(a * D2R) * R * 0.88, -Math.cos(a * D2R) * R * 0.88); c.lineTo(Math.sin(a * D2R) * R * (0.88 - L), -Math.cos(a * D2R) * R * (0.88 - L)); c.stroke(); }
    for (let a = 0; a < 360; a += 30) { c.save(); c.rotate(a * D2R); txt(c, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), 0, -R * 0.6, '#ecebe2', R * 0.17); c.restore(); }
    c.restore();
    c.fillStyle = '#ffd040'; c.beginPath(); c.moveTo(R, R * 0.14); c.lineTo(R - R * 0.07, R * 0.02); c.lineTo(R + R * 0.07, R * 0.02); c.fill();
    needle(c, R, 90, R * 0.78, '#e8e4d4', R * 0.06); hub(c, R, 0.11); txt(c, 'BDHI', R, R * 1.45, '#9a9d98', R * 0.12);
    if (S.volts < 18) offFlag(c, W, 'OFF', 0.32, 0.72);
  }
  const altDraw = (c, W, S, G) => { const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; } const ft = Math.max(0, V.alt); needle(c, R, (ft % 10000) / 10000 * 360, R * 0.5, '#ecebe2', R * 0.14, 0.12); needle(c, R, (ft % 1000) / 1000 * 360, R * 0.86, '#f2f2ea', R * 0.08); hub(c, R, 0.1); };
  const raltDraw = (c, W, S, G) => { const R = W / 2, ft = V.agl * 3.28084, on = S.volts > 18 && !flaky(S, G.i); if (on && ft <= 1500) needle(c, R, raltMap(ft), R * 0.84, '#f2f2ea', R * 0.08); hub(c, R, 0.1); c.fillStyle = '#000'; c.fillRect(R * 0.62, R * 1.05, R * 0.76, R * 0.26); txt(c, on ? String(Math.round(Math.min(ft, 9999))) : '----', R, R * 1.18, on ? '#ffb040' : '#333', R * 0.2); if (!on) offFlag(c, W, 'OFF', 0.32, 0.36); };
  const tsDraw = (c, W, S) => { const R = W / 2, dc = S.volts > 18; needle(c, R, dc ? clamp(V.turn / D2R / 3, -2.2, 2.2) * 20 : 0, R * 0.8, '#f2f2ea', R * 0.1, 0.1, R, R * 1.05); const [bx, by] = P2(R, R * 0.62, 180 - clamp(V.slip, -1, 1) * 24); c.fillStyle = '#060606'; c.beginPath(); c.arc(bx, by, R * 0.09, 0, TAU); c.fill(); };
  for (const sfx of ['', '2']) {
    gauge('asi' + sfx, 256, F.asi, (c, W, S, G) => { const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; } needle(c, R, asiMap(V.ias), R * 0.86); hub(c, R); });
    gauge('adi' + sfx, 320, null, adiDraw); gauge('alt' + sfx, 256, F.alt, altDraw); gauge('ralt' + sfx, 224, F.ralt, raltDraw);
    gauge('bdhi' + sfx, 256, null, bdhiDraw); gauge('vsi' + sfx, 256, F.vsi, (c, W, S, G) => { const R = W / 2; if (flaky(S, G.i)) { offFlag(c, W); return; } needle(c, R, vsiMap(V.vsi), R * 0.86); hub(c, R); });
    gauge('ts' + sfx, 192, F.ts, tsDraw);
  }
  // the engine stack: two needles on the torquemeter (1 white, 2 yellow), three on the tach (rotor long, N2 1 / 2 short)
  gauge('tq', 288, F.tq, (c, W) => { const R = W / 2; needle(c, R, tqMap(V.tqa), R * 0.86, '#f2f2ea', R * 0.07); needle(c, R, tqMap(V.tqb), R * 0.72, '#ffd040', R * 0.08); hub(c, R, 0.1); });
  gauge('tach', 288, F.tach, (c, W) => { const R = W / 2; needle(c, R, tachMap(V.n2a * 100), R * 0.62, '#f2f2ea', R * 0.08); needle(c, R, tachMap(V.n2b * 100), R * 0.62, '#ffd040', R * 0.06); needle(c, R, tachMap(V.nr * 100), R * 0.88, '#f2f2ea', R * 0.06); hub(c, R, 0.1); });
  gauge('n1a', 256, F.n1('1'), (c, W) => { const R = W / 2; needle(c, R, n1Map(V.n1a * 100), R * 0.86); hub(c, R); });
  gauge('n1b', 256, F.n1('2'), (c, W) => { const R = W / 2; needle(c, R, n1Map(V.n1b * 100), R * 0.86); hub(c, R); });
  gauge('fuel', 224, F.fuel, (c, W, S) => { const R = W / 2; needle(c, R, lin(0, -135, 2500, 135)(S.volts > 18 ? V.fuel : 0), R * 0.86); hub(c, R); });
  gauge('xmsn', 224, F.xmsn, (c, W) => { const R = W / 2; needle(c, R, lin(0, -135, 150, 135)(V.xot), R * 0.86); hub(c, R); });

  // ---------------------------------------------------------------- lamps
  function lamp(parent, w, h, x, y, z, text, on, off = '#2a2420', ink = '#111') {
    const mk = lit => { const W = Math.round(w * 2400), H = Math.round(h * 2400), t = canvasTex(W, H), c = t.ctx; c.fillStyle = lit ? on : off; c.fillRect(0, 0, W, H); c.strokeStyle = '#000'; c.lineWidth = 4; c.strokeRect(0, 0, W, H);
      const L = text.split('|'); L.forEach((s, i) => txt(c, s, W / 2, H / 2 + (i - (L.length - 1) / 2) * H * 0.4, lit ? ink : '#5c5650', H * (L.length > 1 ? 0.34 : 0.5))); t.tex.needsUpdate = true; return t.tex; };
    const tOff = mk(false), tOn = mk(true), o = plane(w, h, new THREE.MeshBasicMaterial({ map: tOff, toneMapped: false }), x, y, z, parent);
    o.userData = { tOn, tOff, on: false }; return o;
  }
  const setLamp = (o, v) => { v = !!v; if (o.userData.on !== v) { o.userData.on = v; o.material.map = v ? o.userData.tOn : o.userData.tOff; } };
  const mcL = [lamp(P, 0.085, 0.034, 0.86, 0.2, 0.005, 'MASTER|CAUTION', '#ffaa18', '#2e2408'), lamp(P, 0.085, 0.034, -0.86, 0.2, 0.005, 'MASTER|CAUTION', '#ffaa18', '#2e2408')];
  const rpmL = [lamp(P, 0.07, 0.03, 0.86, 0.15, 0.005, 'ROTOR|RPM', '#ff2a14', '#3a0e08'), lamp(P, 0.07, 0.03, -0.86, 0.15, 0.005, 'ROTOR|RPM', '#ff2a14', '#3a0e08')];

  // ---------------------------------------------------------------- clickable switches (hit boxes: userData.sw)
  const hits = [], hitsOf = {}, sw = {}, LBL = {
    bat: 'BATTERY', apu: 'APU START / STOP', gen1: 'NO 1 GENERATOR', gen2: 'NO 2 GENERATOR', start1: 'NO 1 ENGINE START (HOLD TO 45% N1)', start2: 'NO 2 ENGINE START (HOLD TO 45% N1)',
    ecl1: 'NO 1 ENGINE CONDITION LEVER', ecl2: 'NO 2 ENGINE CONDITION LEVER', rbrake: 'ROTOR BRAKE', pbrake: 'PARKING BRAKE', sas: 'SAS (DUAL STABILITY AUGMENTATION)', afcs: 'AFCS (ATTITUDE / HEADING HOLD)',
    light: 'LANDING LIGHT', ramp: 'RAMP (UP / DOWN)', mc: 'MASTER CAUTION RESET',
  };
  const hitM = new THREE.MeshBasicMaterial({ visible: false });
  function hit(id, w, h, d, parent, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitM); o.position.set(x, y, z); o.userData = { sw: id, size: [w, h, d] }; parent.add(o); hits.push(o); (hitsOf[id] ||= []).push(o); return o; }
  // a toggle switch on a panel group: a bat handle that flips along the panel's y
  function toggle(id, parent, x, y, z, rx0 = 0) {
    box(0.03, 0.03, 0.012, black, x, y, z + 0.006, parent);
    const p = new THREE.Group(); p.position.set(x, y, z + 0.012); p.rotation.x = rx0; parent.add(p);
    box(0.008, 0.008, 0.04, metal, 0, 0, 0.02, p); sw[id] = p; hit(id, 0.05, 0.05, 0.06, parent, x, y, z + 0.02); return p;
  }
  const flip = (id, on) => { const p = sw[id]; if (p) p.rotation.x = on ? -0.55 : 0.55; };

  // overhead console: under the roof just ahead of the crew, its face tilted down toward them (panel coords: x right,
  // y = aft; a pilot tilting his head back reads it upright). Canvas 500 x 600 px = 0.5 x 0.6 m.
  const OH = new THREE.Group(); OH.position.set(0, 0.72, -5.66); OH.rotation.x = Math.PI / 2 - 0.3; g.add(OH);
  box(0.5, 0.6, 0.06, panelM, 0, 0, -0.03, OH);
  const ohT = canvasTex(500, 600);
  { const c = ohT.ctx; c.fillStyle = '#26292a'; c.fillRect(0, 0, 500, 600); c.strokeStyle = '#4a4f52'; c.lineWidth = 4;
    const sec = (x0, y0, x1, y1, t) => { c.strokeRect(x0, y0, x1 - x0, y1 - y0); txt(c, t, (x0 + x1) / 2, y0 + 18, '#e4e2d8', 18); };
    sec(8, 8, 492, 170, 'ENGINE CONDITION'); sec(8, 178, 492, 290, 'ENGINE START'); sec(8, 298, 492, 420, 'ELECTRICAL'); sec(8, 428, 246, 592, 'APU'); sec(254, 428, 492, 592, 'ROTOR BRAKE');
    const l = (t, x, y, s = 16) => txt(c, t, x, y, '#e4e2d8', s);
    l('NO 1', 160, 44); l('NO 2', 340, 44); l('FLY', 62, 72); l('GND IDLE', 62, 110, 14); l('STOP', 62, 148);
    c.fillStyle = '#101112'; for (const x of [160, 340]) c.fillRect(x - 6, 62, 12, 96);
    l('NO 1', 160, 212); l('NO 2', 340, 212); l('HOLD TO 45% N1', 250, 278, 13);
    l('BATT', 110, 332); l('GEN 1', 250, 332); l('GEN 2', 390, 332); l('ON  ^', 250, 408, 13);
    l('START / STOP', 127, 575, 14); l('PULL = ON', 373, 575, 14);
    ohT.tex.needsUpdate = true; }
  plane(0.5, 0.6, new THREE.MeshBasicMaterial({ map: ohT.tex, toneMapped: false }), 0, 0, 0.001, OH);
  const oh = (px, py) => [(px / 500 - 0.5) * 0.5, (0.5 - py / 600) * 0.6];
  // ECLs: levers in the quadrant, sliding along the panel between STOP / GND IDLE / FLY
  const ECLY = v => oh(0, v >= 1 ? 72 : v >= 0.5 ? 110 : 148)[1];
  const ecl = [1, 2].map(i => { const [x] = oh(i === 1 ? 160 : 340, 0); const lv = new THREE.Group(); OH.add(lv); lv.position.set(x, ECLY(1), 0.01);
    box(0.012, 0.012, 0.06, metal, 0, 0, 0.03, lv); box(0.05, 0.024, 0.03, i === 1 ? black : grey, 0, 0, 0.065, lv);
    hit('ecl' + i, 0.07, 0.12, 0.1, OH, x, oh(0, 110)[1], 0.05); return lv; });
  toggle('start1', OH, ...oh(160, 248), 0); toggle('start2', OH, ...oh(340, 248), 0);
  toggle('bat', OH, ...oh(110, 372), 0); toggle('gen1', OH, ...oh(250, 372), 0); toggle('gen2', OH, ...oh(390, 372), 0);
  toggle('apu', OH, ...oh(127, 510), 0);
  const rbH = new THREE.Group(); { const [x, y] = oh(373, 510); rbH.position.set(x, y, 0.01); OH.add(rbH); box(0.12, 0.025, 0.02, redM, 0, 0, 0.06, rbH); box(0.015, 0.015, 0.06, metal, 0, 0, 0.03, rbH); hit('rbrake', 0.16, 0.08, 0.1, OH, x, y, 0.05); }

  // pedestal between the seats: caution panel up front, SAS / AFCS, lights, ramp, parking brake
  box(0.26, 0.42, 0.62, black, 0, -0.77, -5.82);
  const PD = new THREE.Group(); PD.position.set(0, -0.55, -5.84); PD.rotation.x = -Math.PI / 2 + 0.35; g.add(PD);   // its face up and tilted toward the crew
  const cautT = canvasTex(560, 360); plane(0.24, 0.155, new THREE.MeshBasicMaterial({ map: cautT.tex, toneMapped: false }), 0, 0.2, 0.002, PD);
  const pedT = canvasTex(260, 520);
  { const c = pedT.ctx; c.fillStyle = '#1e2122'; c.fillRect(0, 0, 260, 520); c.strokeStyle = '#3a3f42'; c.lineWidth = 4; c.strokeRect(6, 6, 248, 508);
    const l = (t, x, y, s = 17) => txt(c, t, x, y, '#d8d6cc', s);
    l('AFCS / SAS', 130, 30); l('SAS', 70, 120); l('AFCS', 190, 120); l('LDG LT', 70, 250); l('RAMP', 190, 250); l('UP / DN', 190, 280, 13); l('PARK BRAKE', 130, 380); l('MC RESET', 130, 480, 14); pedT.tex.needsUpdate = true; }
  plane(0.12, 0.24, new THREE.MeshBasicMaterial({ map: pedT.tex, toneMapped: false }), 0, -0.02, 0.002, PD);
  const pd = (px, py) => [(px / 260 - 0.5) * 0.12, -0.02 + (0.5 - py / 520) * 0.24];
  toggle('sas', PD, ...pd(70, 80), 0); toggle('afcs', PD, ...pd(190, 80), 0); toggle('light', PD, ...pd(70, 210), 0); toggle('ramp', PD, ...pd(190, 210), 0);
  const pbH = new THREE.Group(); { const [x, y] = pd(130, 340); pbH.position.set(x, y, 0.01); PD.add(pbH); box(0.07, 0.018, 0.02, yelM, 0, 0, 0.03, pbH); hit('pbrake', 0.1, 0.05, 0.08, PD, x, y, 0.03); }
  { const [x, y] = pd(130, 450); box(0.03, 0.02, 0.012, metal, x, y, 0.006, PD); hit('mc', 0.06, 0.04, 0.05, PD, x, y, 0.02); }
  // master caution lamps double as the reset too (on the glare shield)
  for (const L of mcL) { const o = hit('mc', 0.09, 0.04, 0.03, P, L.position.x, L.position.y, 0.015); void o; }

  // ---------------------------------------------------------------- flight controls (both seats, linked) and the pilot
  const cyclics = [], collectives = [], pedals = [];
  for (const s of [-1, 1]) {
    const x = s * 0.5, cp = new THREE.Group(); cp.position.set(x, FL + 0.02, -5.72); g.add(cp);
    cyl(0.07, 0.09, 0.04, frameM, x, FL + 0.03, -5.72);                               // boot
    cyl(0.016, 0.02, 0.62, black, 0, 0.31, 0, cp); cyl(0.024, 0.024, 0.13, black, 0, 0.66, 0, cp, 0.15);   // stick, grip
    box(0.02, 0.02, 0.02, redM, 0, 0.73, -0.015, cp); cyclics.push(cp);
    const cl = new THREE.Group(); cl.position.set(x - s * 0.3, -0.72, -5.06); g.add(cl);   // collective: pivot aft, handle forward (left of each seat)
    box(0.03, 0.03, 0.5, frameM, 0, 0, -0.25, cl); cyl(0.03, 0.03, 0.14, black, 0, 0.0, -0.53, cl, Math.PI / 2); box(0.06, 0.05, 0.07, oliveD, 0, 0.04, -0.47, cl);   // stick, grip, switch box
    collectives.push(cl);
    const pl = [-1, 1].map(k => { const o = box(0.09, 0.15, 0.025, black, x + k * 0.12, FL + 0.18, -6.24, g, -0.45); return o; });
    pedals.push(pl);
  }
  // the aircraft commander's legs and arms (you): thighs, shins to the pedals, gloves on the cyclic and the collective
  const legs = [-1, 1].map(k => { const hip = V3(0.5 + k * 0.1, -0.45, -5.42), knee = V3(0.5 + k * 0.12, -0.36, -5.86); limb(hip, knee, 0.075, suit); const shin = limb(knee, V3(0.5 + k * 0.12, FL + 0.2, -6.18), 0.06, suit); const boot = box(0.1, 0.09, 0.24, bootM, 0.5 + k * 0.12, FL + 0.12, -6.18); return { k, knee, shin, boot }; });
  const foreR = limb(V3(0.72, -0.25, -5.42), V3(0.5, -0.3, -5.72), 0.045, suit), handR = box(0.07, 0.07, 0.08, glove, 0.5, -0.27, -5.72);
  const foreL = limb(V3(0.3, -0.3, -5.4), V3(0.2, -0.68, -5.58), 0.045, suit), handL = box(0.07, 0.07, 0.08, glove, 0.2, -0.68, -5.58);

  // hover marker: a thin yellow frame round the switch under the crosshair
  const hov = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffd040, depthTest: false, transparent: true })); hov.renderOrder = 9; hov.visible = false; hov.matrixAutoUpdate = false; g.add(hov);
  const _m4 = new THREE.Matrix4(), _m5 = new THREE.Matrix4();

  // ---------------------------------------------------------------- caution panel (5 x 4 captions)
  let cautKey = '';
  function drawCaut(S) {
    const pw = S.volts > 18, list = pw ? S.cautions : [], k = list.join('|') + pw;
    if (k === cautKey) return; cautKey = k; const c = cautT.ctx, W = 560, H = 360, cw = W / 4, ch = H / 5;
    c.fillStyle = '#0c0c0c'; c.fillRect(0, 0, W, H);
    CH46_CAPTIONS.forEach((t, i) => { const x = (i % 4) * cw, y = Math.floor(i / 4) * ch, on = list.includes(t), adv = ['APU ON', 'PARK BRAKE', 'RAMP OPEN', 'ROTOR BRAKE'].includes(t);
      c.fillStyle = on ? (adv ? '#4ad060' : '#ffb020') : '#1e1b16'; c.fillRect(x + 3, y + 3, cw - 6, ch - 6);
      const w = t.split(' '), half = Math.ceil(w.length / 2); [w.slice(0, half).join(' '), w.slice(half).join(' ')].filter(Boolean).forEach((s, j, a) => txt(c, s, x + cw / 2, y + ch / 2 + (j - (a.length - 1) / 2) * 22, on ? '#111' : '#4a453c', 19)); });
    cautT.tex.needsUpdate = true;
  }

  let slot = 0, lastS = null;
  const stateLbl = {};
  return {
    group: g, hitBoxes: hits, EYE: CH46_EYE, EYE_PITCH: CH46_EYE_PITCH, copilot,
    canvases: () => [...gauges.map(G => G.cv), cautT.cv, ohT.cv, pedT.cv],
    labelOf(id) {
      const s = lastS && lastS.sw, base = LBL[id] || id; if (!s) return base;
      let st = '';
      if (id === 'ecl1' || id === 'ecl2') st = s[id] >= 1 ? 'FLY' : s[id] >= 0.5 ? 'GND IDLE' : 'STOP';
      else if (id === 'apu') st = s.apu === 'on' ? 'ON' : s.apu === 'start' ? 'STARTING' : 'OFF';
      else if (id === 'ramp') st = s.ramp ? 'DOWN' : 'UP';
      else if (id in s) st = s[id] ? 'ON' : 'OFF';
      if (!st) return base; const k = id + st; return stateLbl[k] || (stateLbl[k] = `${base}  [${st}]`);
    },
    update(dt, S, hover) {
      lastS = S; const k = Math.min(1, 7 * dt), sw2 = S.sw, c = S.ctl;
      V.ias += (Math.max(0, S.ias) - V.ias) * k; V.alt += (S.alt - V.alt) * k; V.vsi += (S.vsi - V.vsi) * Math.min(1, 3 * dt); V.agl += (S.agl - V.agl) * k;
      if (S.volts > 18) { V.p += (S.pitch - V.p) * Math.min(1, 12 * dt); V.r += (S.roll - V.r) * Math.min(1, 12 * dt); } else { V.p += (0.35 - V.p) * 0.03 * dt; V.r += (0.6 - V.r) * 0.03 * dt; }
      V.hdg = S.hdg; V.turn += (S.turn - V.turn) * k; V.slip += (S.slip - V.slip) * Math.min(1, 4 * dt);
      V.nr += (S.nr - V.nr) * k; V.n2a += (S.n2[0] - V.n2a) * k; V.n2b += (S.n2[1] - V.n2b) * k; V.n1a += (S.n1[0] - V.n1a) * k; V.n1b += (S.n1[1] - V.n1b) * k;
      V.tqa += ((S.volts > 18 ? S.tq[0] : 0) - V.tqa) * k; V.tqb += ((S.volts > 18 ? S.tq[1] : 0) - V.tqb) * k; V.fuel += (S.fuelLb - V.fuel) * Math.min(1, 2 * dt);
      V.xot += ((S.nr > 0.1 ? 60 + 25 * Math.max(S.tq[0], S.tq[1]) / 100 : 20) - V.xot) * Math.min(1, 0.05 * dt);
      // controls: cyclic (+right / +aft), collective, pedals (+right = right pedal forward)
      for (const cp of cyclics) cp.rotation.set(c.cy * 0.18, 0, -c.cx * 0.15);
      for (const cl of collectives) cl.rotation.x = -0.15 + c.coll * 0.35;
      for (const pl of pedals) { pl[0].position.z = -6.24 + c.pedal * 0.06; pl[1].position.z = -6.24 - c.pedal * 0.06; }
      for (const L of legs) { const pz = L.k < 0 ? -6.24 + c.pedal * 0.06 : -6.24 - c.pedal * 0.06; _w.set(0.5 + L.k * 0.12, FL + 0.22, pz + 0.04); setLimb(L.shin, L.knee, _w); L.boot.position.z = pz + 0.02; }
      { const cp = cyclics[1]; _w.set(0, 0.66, 0).applyEuler(cp.rotation).add(cp.position); setLimb(foreR, V3(0.72, -0.27, -5.38), _w); handR.position.copy(_w); }
      { const cl = collectives[1]; _w.set(0, 0.0, -0.53).applyEuler(cl.rotation).add(cl.position); setLimb(foreL, V3(0.32, -0.3, -5.34), _w); handL.position.copy(_w); }
      // switches, levers, handles
      for (const id of ['bat', 'gen1', 'gen2', 'start1', 'start2', 'sas', 'afcs', 'light', 'ramp']) flip(id, !!sw2[id]);
      flip('apu', sw2.apu !== 'off');
      ecl.forEach((lv, i) => { const v = sw2['ecl' + (i + 1)]; lv.position.y += (ECLY(v) - lv.position.y) * Math.min(1, 12 * dt); });
      rbH.position.z = sw2.rbrake ? 0.05 : 0.01; pbH.position.z = sw2.pbrake ? 0.04 : 0.01;
      const pw = S.volts > 18, fl = (performance.now() % 500) < 260;
      for (const L of mcL) setLamp(L, pw && S.master); for (const L of rpmL) setLamp(L, pw && S.rpmWarn && fl);
      // hover marker
      hov.visible = false;
      const hl = hover && hitsOf[hover];
      if (hl) { const h = hl[0], z = h.userData.size; h.updateWorldMatrix(true, false); g.updateWorldMatrix(true, false); _m4.copy(g.matrixWorld).invert().multiply(h.matrixWorld); hov.matrix.copy(_m4).multiply(_m5.makeScale(z[0], z[1], z[2])); hov.visible = true; }
      // canvases: a third of the gauges per frame, the caution panel every third frame
      slot = (slot + 1) % 3;
      for (let i = slot; i < gauges.length; i += 3) { const G = gauges[i], cx = G.ctx; if (G.bg) { cx.clearRect(0, 0, G.W, G.W); cx.drawImage(G.bg, 0, 0); } else cx.clearRect(0, 0, G.W, G.W); G.dyn(cx, G.W, S, G); G.tex.needsUpdate = true; }
      if (slot === 0) drawCaut(S);
    },
  };
}
