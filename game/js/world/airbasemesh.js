// (ngc/look-airbases) The air base's THREE side: pavement, markings, lights, buildings, fence, the map symbol.
// The layout (and every real-world dimension) is world/airbase.js; this file only draws it. Built once at start with
// the lived-in world's kit (world/kit.js: flat-shaded, vertex-coloured, RenderKit surface classes), so it reads like
// the rest of the world and costs a handful of draws:
//   pavement (1, ground overlay material), markings and joints (1), buildings (1, casts shadows), fixtures (1: light
//   cans, stanchions, signs, fence posts, windsocks - dissolves out past ~1.1 km), light lenses (1 instanced, unlit),
//   chain-link (1, transparent, near only).
// Markings follow FAA AC 150/5340-1 / AFR 88-16 (1980) for a precision instrument runway; lights the USAF / FAA layout
// of the period (white edge lights, yellow caution zone, green thresholds, blue taxiway edges, ALSF-1, a 2-bar VASI).
import * as THREE from 'three';
import { Geo, col, shade, surf } from './kit.js';
import { worldMaterial, groundMaterial, geoFrom } from './gfx.js';
import { AB, AB_BUILDINGS, AB_TANKS, AB_SLOTS } from './airbase.js';
import { detail } from '../renderkit/lod.js';

const FT = 0.3048;
// palette (hexes from renderkit/surfclass.js so the RenderKit detail shader gives each its texture)
const C = {
  rwy: col(0x8e8b84), rwyB: col(0x86847c), twy: col(0x9a978e), ramp: col(0xa8a49a), floor: col(0x8a8780), ovr: col(0x4c4d50), shoulder: col(0x5e5c5a),
  rubber: col(0x3e3f42), joint: col(0x5a5852), white: col(0xe8e6dc), yellow: col(0xd8b84a), black: col(0x1c1c1e),
  wall: col(0xd9c79a), wall2: col(0xe8e0c8), core: col(0xc8c4b0), concrete: col(0xa8a49a), conc2: col(0x9a958a), roof: col(0x6a6a6a), roofD: col(0x575d66),
  metal: col(0x9aa0a6), metal2: col(0x7c8186), metalD: col(0x6c7276), red: col(0x8a2a1a), glass: col(0x2b3846), glassL: col(0x3d4e5c), frame: col(0x18191a),
  tank: col(0xe8e6e0), earth: col(0x6e6a52), orange: col(0xd8b84a, 1.0), lamp: col(0x9aa0a6), sign: col(0x1c1c1e),
  corr: surf(col(0x8d9296), 'CORRUGATED'), corrD: surf(col(0x6f7478), 'CORRUGATED'),
};
// 3 x 5 block digits (runway designators, distance-remaining signs): rows top to bottom
const DIG = ['111101101101111', '010010010010010', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];

export function buildAirbase(L, { scene } = {}) {
  const root = new THREE.Group(); root.name = 'airbase';
  const E = L.E, R = AB.RWY_L / 2, W = AB.RWY_W / 2, T = AB.TWY_W / 2, TV = AB.TWY_V;
  const w = (u, v, y = 0) => { const p = L.toW(u, v); return [p[0], E + y, p[1]]; };
  // kit frames are proper rotations: a building frame has local +z = +v (its back) and local x along the runway
  const yawFor = () => { const nx = L.nx, nz = L.nz; return Math.atan2(nx, nz); };   // kit: local +z = (sin yaw, cos yaw)
  // a flat quad on the ground in local (u, v): corners in order, y lift
  const flat = (g, pts, y, c) => g.upW(w(pts[0][0], pts[0][1], y), w(pts[1][0], pts[1][1], y), w(pts[2][0], pts[2][1], y), w(pts[3][0], pts[3][1], y), c);
  const rect = (g, u0, u1, v0, v1, y, c) => flat(g, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], y, c);
  // a strip along a direction: centre (u, v), length l along unit (du, dv), width wd
  const strip = (g, u, v, du, dv, l, wd, y, c) => { const ex = du * l / 2, ev = dv * l / 2, px = -dv * wd / 2, pv = du * wd / 2; flat(g, [[u - ex - px, v - ev - pv], [u + ex - px, v + ev - pv], [u + ex + px, v + ev + pv], [u - ex + px, v - ev + pv]], y, c); };

  // ------------------------------------------------------------------------------------------------ pavement
  const P = new Geo();
  for (const [kind, u0, u1, v0, v1] of L.paved) {
    const c = kind === 'runway' ? C.rwy : kind === 'overrun' ? C.ovr : kind === 'taxiway' ? C.twy : kind === 'ramp' ? C.ramp : C.floor;
    // long surfaces in ~250 m pieces (the ground material lifts vertices with distance; short pieces follow better)
    const n = Math.max(1, Math.ceil((u1 - u0) / 250));
    for (let i = 0; i < n; i++) rect(P, u0 + (u1 - u0) * i / n, u0 + (u1 - u0) * (i + 1) / n, v0, v1, 0.06, c);
  }
  // taxiway shoulders (stabilised, darker) and fillets where the connectors meet the runway / parallel taxiway
  for (const cu of L.connectors) for (const s of [-1, 1]) {
    flat(P, [[cu + s * T, W], [cu + s * (T + 18), W], [cu + s * T, W + 18], [cu + s * T, W + 18]], 0.055, C.twy);
    flat(P, [[cu + s * T, TV - T], [cu + s * T, TV - T - 18], [cu + s * (T + 18), TV - T], [cu + s * (T + 18), TV - T]], 0.055, C.twy);
  }
  rect(P, -R + 18, R - 18, TV - T - 3, TV - T, 0.05, C.shoulder); rect(P, -R + 18, R - 18, TV + T, TV + T + 3, 0.05, C.shoulder);
  // a few paved service roads behind the ramp (fire station, fuel farm, tower, the gate)
  rect(P, -1000, 640, 520, 530, 0.05, C.ramp);
  rect(P, -158, -142, 530, 712, 0.05, C.twy); rect(P, 230, 400, 570, 580, 0.05, C.twy); rect(P, 30, 50, 530, 559, 0.05, C.ramp);

  // ------------------------------------------------------------------------------------------------ markings
  const M = new Geo(), y1 = 0.1;
  // concrete slab joints: 25 ft panels (lines every 7.6 m along, every 12.5 ft across in the runway's lanes)
  for (let u = -R + 7.62; u < R; u += 7.62) rect(M, u - 0.06, u + 0.06, -W, W, 0.085, C.joint);
  for (let v = -W + 7.62; v < W; v += 7.62) rect(M, -R, R, v - 0.06, v + 0.06, 0.085, C.joint);
  for (let u = -R + 18 + 7.62; u < R - 18; u += 7.62) rect(M, u - 0.05, u + 0.05, TV - T, TV + T, 0.085, C.joint);
  for (let u = AB.APRON_U0 + 7.62; u < AB.APRON_U1; u += 7.62) rect(M, u - 0.05, u + 0.05, TV + T, AB.APRON_V1, 0.085, C.joint);
  for (let v = TV + T + 7.62; v < AB.APRON_V1; v += 7.62) rect(M, AB.APRON_U0, AB.APRON_U1, v - 0.05, v + 0.05, 0.085, C.joint);
  // rubber deposits in both touchdown zones: dark down the middle, fading out to the concrete (vertex colours)
  for (const e of L.ends) {
    const a = e.u + e.dir * 130, b = e.u + e.dir * 900;
    for (const [v0, v1, c0, c1] of [[-13, -5, C.rwy, C.rubber], [-5, 5, C.rubber, C.rubber], [5, 13, C.rubber, C.rwy]]) {
      const A = w(a, v0, 0.09), B = w(b, v0, 0.09), Cc = w(b, v1, 0.09), D = w(a, v1, 0.09);
      // two triangles with per-corner colours (kit quads are one colour): written straight into the Geo's arrays
      const tri = (p, q, r, cp, cq, cr) => {
        const ny = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
        if (ny < 0) { [q, r] = [r, q]; [cq, cr] = [cr, cq]; }
        M.p.push(...p, ...q, ...r); M.c.push(...cp, ...cq, ...cr); M.sc.push(C.rubber.s | 0); M.ao.push(0, 0, 0); M.tris++;
      };
      tri(A, B, Cc, c0, c0, c1); tri(A, Cc, D, c0, c1, c1);
    }
  }
  // runway: side stripes 3 ft, centreline 120 ft stripes / 80 ft gaps / 36 in wide
  rect(M, -R, R, -W + 0.3, -W + 1.2, y1, C.white); rect(M, -R, R, W - 1.2, W - 0.3, y1, C.white);
  const numEnd = 6 + 150 * FT + 6 + 60 * FT + 12;   // where the centreline starts: past the stripes and the number
  for (let u = -R + numEnd; u + 36.6 < R - numEnd; u += 61) rect(M, u, u + 36.6, -0.46, 0.46, y1, C.white);
  for (const e of L.ends) {
    const d = e.dir, at = s => e.u + d * s;   // s: metres in from the threshold
    // threshold: 16 stripes 150 ft x 5.75 ft (marked width 200 ft), 20 ft in from the threshold
    for (let i = 0; i < 8; i++) for (const sd of [-1, 1]) { const vc = sd * (2.75 + 0.88 + i * 3.5); rect(M, Math.min(at(6), at(6 + 45.7)), Math.max(at(6), at(6 + 45.7)), vc - 0.88, vc + 0.88, y1, C.white); }
    // the designation: 60 ft tall digits, 20 ft past the stripes, reading towards the landing direction
    const s0 = 6 + 45.7 + 6.1, txt = String(e.num).padStart(2, '0'), rs = Math.sign(-L.az * L.nx + L.ax * L.nz) * d;   // +v is the pilot's right when rs > 0
    for (let k = 0; k < 2; k++) {
      const dg = DIG[+txt[k]], vc = rs * (k === 0 ? -1 : 1) * (6.1 / 2 + 2.3);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        if (dg[r * 3 + c] !== '1') continue;
        const sA = s0 + (4 - r) * 3.66, vv = vc + rs * (c - 1) * 2.03;
        rect(M, Math.min(at(sA), at(sA + 3.66)), Math.max(at(sA), at(sA + 3.66)), vv - 1.015, vv + 1.015, y1, C.white);
      }
    }
    // aiming point (1,020 ft, 150 x 30 ft, 72 ft between inner edges) and touchdown zone bars (75 x 6 ft, 5 ft apart)
    for (const sd of [-1, 1]) rect(M, Math.min(at(311), at(311 + 45.7)), Math.max(at(311), at(311 + 45.7)), sd * 11 + (sd < 0 ? -9.1 : 0), sd * 11 + (sd > 0 ? 9.1 : 0), y1, C.white);
    for (const [ft, n] of [[500, 3], [1500, 3], [2000, 2], [2500, 2], [3000, 1]]) for (const sd of [-1, 1]) for (let i = 0; i < n; i++) {
      const vin = 11 + i * (1.83 + 1.52); rect(M, Math.min(at(ft * FT), at(ft * FT + 22.9)), Math.max(at(ft * FT), at(ft * FT + 22.9)), sd > 0 ? vin : -vin - 1.83, sd > 0 ? vin + 1.83 : -vin, y1, C.white);
    }
    // overrun: yellow chevrons pointing at the runway, 100 ft apart
    for (let k = 0; k < 7; k++) {
      const apex = e.u - d * (25 + k * 30.5);
      for (const sd of [-1, 1]) { const len = Math.min(W - 1, 40) * Math.SQRT2; const du = -d * Math.SQRT1_2, dv = sd * Math.SQRT1_2; strip(M, apex + du * len / 2, dv * len / 2, du, dv, len, 0.9, y1, C.yellow); }
    }
    rect(M, Math.min(e.u, e.u - d * 1.2), Math.max(e.u, e.u - d * 1.2), -W, W, y1, C.yellow);   // the runway end / overrun edge
  }
  // taxiways: yellow centreline (6 in, drawn 12 in to read from the air), lead-on lines, hold-short lines
  rect(M, -R + 18 + T, R - 18 - T, TV - 0.15, TV + 0.15, y1, C.yellow);
  for (const cu of L.connectors) {
    rect(M, cu - 0.15, cu + 0.15, 0, TV, y1, C.yellow);
    // hold-short (runway holding position): 2 solid + 2 dashed 12 in lines, solid on the taxiway side, 250 ft from the runway centreline
    const hv = 250 * FT;
    for (let i = 0; i < 4; i++) {
      const v0 = hv + (i - 2) * 0.61, solid = i >= 2;
      if (solid) rect(M, cu - T, cu + T, v0, v0 + 0.305, y1, C.yellow);
      else for (let u = cu - T; u < cu + T - 0.5; u += 1.83) rect(M, u, Math.min(u + 0.91, cu + T), v0, v0 + 0.305, y1, C.yellow);
    }
  }
  // the ramp: a taxilane along it and lead-in lines with stop bars to each hangar slot
  rect(M, AB.APRON_U0 + 20, AB.APRON_U1 - 20, 352, 352.3, y1, C.yellow);
  for (const k in AB_SLOTS) { const S = AB_SLOTS[k]; rect(M, S.park.u - 0.15, S.park.u + 0.15, 352, S.park.v - 14, y1, C.yellow); rect(M, S.park.u - 3, S.park.u + 3, S.ramp.v - 0.15 - 14, S.ramp.v + 0.15 - 14, y1, C.yellow); }
  for (let u = AB.APRON_U0 + 60; u < -820; u += 60) { rect(M, u - 0.15, u + 0.15, 370, 470, y1, C.yellow); }   // transient parking rows

  // ------------------------------------------------------------------------------------------------ buildings
  const B = new Geo(); B.weather(E, 1.2, 0.28, 0.06);
  const yawB = yawFor();
  for (const b of AB_BUILDINGS) {
    const c = w(b.u, b.v); B.push(c[0], E, c[2], yawB);   // local z = +v (back), doors at -z
    building(B, b);
    B.pop();
  }
  for (const [tu, tv, tr, th] of AB_TANKS) { const c = w(tu, tv); B.push(c[0], E, c[2], yawB); tank(B, tr, th); B.pop(); }
  { const c = w(318, 620); B.push(c[0], E, c[2], yawB); for (const [x, z, ww, dd] of [[0, -46, 90, 2], [0, 46, 90, 2], [-46, 0, 2, 90], [46, 0, 2, 90]]) B.box(x, 0, z, ww, 1.6, dd, C.earth); B.pop(); }   // the bund

  // ------------------------------------------------------------------------------------------------ fixtures + lights
  const X = new Geo(), lights = [];   // lights: [x, y, z, colour]
  const lamp = (u, v, cHex, h = 0.4) => { const p = w(u, v); X.box(p[0], E, p[2], 0.22, h, 0.22, C.lamp); lights.push([p[0], E + h + 0.08, p[2], cHex]); };
  const WHITE = 0xfff4dc, YEL = 0xffc23a, GRN = 0x3dff6a, RED = 0xff3020, BLU = 0x2f6bff;
  for (let u = -R; u <= R + 0.1; u += AB.EDGE_LT) for (const sd of [-1, 1]) lamp(u, sd * (W + 1.5), Math.abs(u) > R - 610 ? YEL : WHITE);
  for (const e of L.ends) {
    for (let v = -W + 1.5; v <= W - 1.5; v += 3.05) lamp(e.u - e.dir * 1.0, v, GRN, 0.3);   // threshold bar (green inbound / red stop-end lamps beside)
    for (let v = -W + 3; v <= W - 3; v += 9.1) lamp(e.u - e.dir * 2.2, v, RED, 0.3);
    // ALSF-1: a 5-lamp barrette every 100 ft out to 2,400 ft, the 1,000 ft crossbar, red side-row barrettes in the last 200 ft
    for (let k = 1; k * 30.48 <= AB.ALS + 1; k++) {
      const s = k * 30.48, u = e.u - e.dir * s, hgt = 0.6 + s * 0.004;
      const pc = w(u, 0); X.box(pc[0], E, pc[2], 0.3, hgt, 0.3, C.lamp); X.box(pc[0], E + hgt, pc[2], 0.4, 0.2, 4.6, C.lamp);
      for (let i = -2; i <= 2; i++) lights.push([...w(u, i * 1.07, hgt + 0.3), WHITE]);
      if (k === 10) for (const sd of [-1, 1]) for (let i = 0; i < 8; i++) lights.push([...w(u, sd * (4 + i * 1.52), hgt + 0.3), WHITE]);
      if (k <= 6) for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) lights.push([...w(u, sd * (11 + i * 1.52), hgt + 0.3), RED]);
    }
    // 2-bar VASI on the left of the touchdown zone (downwind bar 500 ft, upwind bar 1,200 ft)
    const lv = -Math.sign(-L.az * L.nx + L.ax * L.nz) * e.dir;
    for (const s of [152, 366]) for (let i = 0; i < 3; i++) { const p = w(e.u + e.dir * s, lv * (W + 15 + i * 5)); X.box(p[0], E, p[2], 1.4, 0.9, 1.4, C.metalD); lights.push([p[0], E + 0.75, p[2], s < 200 ? WHITE : RED]); }
    // windsock beside the touchdown zone
    { const p = w(e.u + e.dir * 300, lv * (W + 60)); X.box(p[0], E, p[2], 0.25, 6, 0.25, C.metal); const q = w(e.u + e.dir * 303, lv * (W + 60)); X.push(q[0], E + 5.7, q[2], yawB); X.cyl(0, -0.45, 0, 0.45, 0.9, 6, C.orange, 0); X.pop(); }
    // distance-remaining signs every 1,000 ft, both sides (black, white numerals: thousands of feet left)
    for (let k = 1; k <= 11; k++) for (const sd of [-1, 1]) {
      const u = e.u + e.dir * k * 304.8, left = 12 - k; if (left < 1) continue;
      const p = w(u, sd * (W + 20)); X.push(p[0], E, p[2], yawB); X.box(0, 0.4, 0, 3.4, 1.8, 0.4, C.sign); X.box(-1.2, 0, 0, 0.12, 0.4, 0.12, C.lamp); X.box(1.2, 0, 0, 0.12, 0.4, 0.12, C.lamp);
      const txt = String(left); for (let q = 0; q < txt.length; q++) { const dg = DIG[+txt[q]], x0 = (q - (txt.length - 1) / 2) * 1.0; for (let r = 0; r < 5; r++) for (let cc = 0; cc < 3; cc++) if (dg[r * 3 + cc] === '1') for (const fz of [-0.21, 0.21]) X.box(x0 + (cc - 1) * 0.24 * (fz > 0 ? 1 : -1), 0.55 + (4 - r) * 0.28, fz, 0.22, 0.26, 0.02, C.white); }
      X.pop();
    }
  }
  for (let u = -R + 18; u <= R - 18; u += AB.EDGE_LT) for (const sd of [-1, 1]) if (!L.connectors.some(cu => Math.abs(cu - u) < T + 10)) lamp(u, TV + sd * (T + 1.2), BLU, 0.35);
  for (const cu of L.connectors) for (let v = W + 25; v < TV - T - 10; v += 30.5) for (const sd of [-1, 1]) lamp(cu + sd * (T + 1.2), v, BLU, 0.35);
  // tower beacon and obstruction lights on the tall buildings
  { const t = AB_BUILDINGS.find(b => b.id === 'tower'); lights.push([...w(t.u, t.v, t.h + 2.0), 0x9dffb8]); }
  for (const b of AB_BUILDINGS) if (b.h > 11) for (const su of [-1, 1]) lights.push([...w(b.u + su * (b.w / 2 - 0.6), b.v + b.d / 2 - 0.6, b.h + (b.type === 'dch' ? 6 : 0.4)), RED]);
  // perimeter fence: 8 ft chain-link on steel posts every 10 ft, three strands of barbed wire on outriggers
  const F = AB.FENCE, fenceLine = [[-F.u, F.v0], [F.u, F.v0], [F.u, F.v1], [-F.u, F.v1], [-F.u, F.v0]], panels = new Geo();
  for (let i = 0; i < 4; i++) {
    const [u0, v0] = fenceLine[i], [u1, v1] = fenceLine[i + 1], len = Math.hypot(u1 - u0, v1 - v0), n = Math.ceil(len / 3.05);
    for (let k = 0; k <= n; k++) { const t = k / n, p = w(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t); X.box(p[0], E, p[2], 0.09, 2.75, 0.09, C.metal); }
    for (let k = 0; k < n; k += 4) {   // the mesh in 4-post panels; the gate gap on the zone side by the guard house
      const ta = k / n, tb = Math.min(1, (k + 4) / n), ua = u0 + (u1 - u0) * ta, va = v0 + (v1 - v0) * ta, ub = u0 + (u1 - u0) * tb, vb = v0 + (v1 - v0) * tb;
      if (i === 2 && Math.abs((ua + ub) / 2 + 150) < 12) continue;
      const A = w(ua, va, 0.05), Bp = w(ub, vb, 0.05), Ct = w(ub, vb, 2.45), D = w(ua, va, 2.45);
      panels.quadW(A, Bp, Ct, D, C.metal); panels.quadW(D, Ct, Bp, A, C.metal);
      for (const hh of [2.55, 2.68, 2.8]) { const a2 = w(ua, va, hh), b2 = w(ub, vb, hh); X.strut([a2[0], a2[1], a2[2]], [b2[0], b2[1], b2[2]], 0.025, C.metalD); }
    }
  }

  // ------------------------------------------------------------------------------------------------ THREE meshes
  const add = (g, mat, o = {}) => { const d = g.build(); if (!d.tris) return null; const m = new THREE.Mesh(geoFrom(d), mat); m.matrixAutoUpdate = false; m.name = o.name || 'airbase'; if (o.shadow) m.userData.rkShadow = o.shadow; root.add(m); return m; };
  const gm = groundMaterial({}), mm = groundMaterial({}); mm.polygonOffsetFactor = -2; mm.polygonOffsetUnits = -8;
  const meshes = {
    pavement: add(P, gm, { name: 'airbase-pavement', shadow: 'receive' }),
    markings: add(M, mm, { name: 'airbase-markings', shadow: 'receive' }),
    buildings: add(B, worldMaterial({}), { name: 'airbase-buildings' }),
    fixtures: add(X, worldMaterial({}), { name: 'airbase-fixtures' }),
  };
  if (meshes.fixtures) detail(meshes.fixtures, 1100);
  { const fm = new THREE.MeshLambertMaterial({ color: 0x8c9294, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }); const m = add(panels, fm, { name: 'airbase-fence', shadow: 'none' }); if (m) { m.geometry.deleteAttribute('color'); detail(m, 450); meshes.fence = m; } }
  // the lamps: one instanced draw, unlit (they are lights), sized up a little with distance so a runway reads at night
  {
    const geo = new THREE.SphereGeometry(0.16, 6, 4), mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    mat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `vec4 rkIW = modelMatrix * instanceMatrix * vec4(0., 0., 0., 1.); float rkD = length(rkIW.xyz - cameraPosition); transformed *= clamp(rkD / 220., 1., 6.);\n#include <project_vertex>`); };
    mat.customProgramCacheKey = () => 'ablamps';
    const im = new THREE.InstancedMesh(geo, mat, lights.length), m4 = new THREE.Matrix4(), cc = new THREE.Color();
    lights.forEach((l, i) => { m4.makeTranslation(l[0], l[1], l[2]); im.setMatrixAt(i, m4); im.setColorAt(i, cc.setHex(l[3])); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); im.userData.rkShadow = 'none'; im.name = 'airbase-lights';
    im.frustumCulled = true; root.add(im); detail(im, 2600); meshes.lights = im;
  }
  root.updateMatrixWorld(true);
  if (scene) scene.add(root);
  return { root, meshes, lightCount: lights.length };

  // ------------------------------------------------------------------------------------------------ building models
  function building(g, b) {
    if (b.type === 'dch') return dch(g, b);
    if (b.type === 'barn') return barn(g, b);
    if (b.type === 'tower') return tower(g, b);
    if (b.type === 'fire') return fire(g, b);
    if (b.type === 'shed') return shed(g, b);
    return block(g, b);
  }
  // window band on a face: the face at local z = zf (facing sz), from x0 to x1, sill y0, height hh, every pitch
  function windows(g, zf, sz, x0, x1, y0, hh, ww = 1.6, pitch = 3.2) {
    for (let x = x0 + pitch / 2; x < x1; x += pitch) { g.box(x, y0, zf + sz * 0.04, ww, hh, 0.08, C.glass); g.box(x, y0 - 0.12, zf + sz * 0.08, ww + 0.2, 0.12, 0.18, C.concrete); }
  }
  function windowsX(g, xf, sx, z0, z1, y0, hh, ww = 1.6, pitch = 3.2) {
    for (let z = z0 + pitch / 2; z < z1; z += pitch) g.box(xf + sx * 0.04, y0, z, 0.08, hh, ww, C.glass);
  }
  // Double-cantilever maintenance hangar: masonry shop core along the middle (offices, shops, two floors of windows
  // into the bays), a steel roof cantilevered out over both bays, a deep fascia, sliding door leaves (60 ft, 35 ft
  // wide) on both long sides - open on the ramp side (stacked in pockets at the ends), shut at the back.
  function dch(g, b) {
    const hw = b.w / 2, hd = b.d / 2, bay = b.bay, core = b.d - 2 * bay, H = b.h, Dh = b.door;
    const zf = -hd, zb = hd;
    // core (two floors of shops, a clerestory on top)
    g.box(0, 0, 0, b.w - 2, H + 3, core, C.core, 1);
    g.gable(0, H + 3, 0, b.w - 2, core, 2.2, C.roofD, C.core, 0.2);
    windows(g, -core / 2, -1, -hw + 6, hw - 6, 3, 1.4, 2.4, 4.2); windows(g, -core / 2, -1, -hw + 6, hw - 6, 8, 1.4, 2.4, 4.2);
    windows(g, core / 2, 1, -hw + 6, hw - 6, 3, 1.4, 2.4, 4.2); windows(g, core / 2, 1, -hw + 6, hw - 6, 8, 1.4, 2.4, 4.2);
    for (const sz of [-1, 1]) for (let x = -hw + 20; x < hw - 10; x += 30) g.box(x, 0, sz * core / 2 + sz * 0.05, 3, 3.2, 0.12, C.metalD);   // shop doors into the bays
    // the roof over each bay: underside, top, the fascia (deep, with the cantilever ribs showing)
    for (const sz of [-1, 1]) {
      const zc = sz * (core / 2 + bay / 2);
      g.box(0, Dh + 0.4, zc, b.w, H - Dh - 0.4, bay, C.wall, 0);
      for (let x = -hw + 5; x < hw; x += 10) g.box(x, Dh - 0.6, zc, 0.5, 1.0, bay - 1, C.metalD, 3);   // ceiling trusses
      for (let x = -hw + 5; x < hw; x += 10) g.box(x, Dh - 0.35, zc, 0.6, 0.2, 0.6, C.lamp, 3);
      g.box(0, Dh, sz * hd - sz * 0.5, b.w, H - Dh + 0.6, 1.0, C.metal2);   // fascia
      for (let x = -hw + 5; x < hw; x += 10) g.box(x, Dh, sz * hd - sz * 1.05, 0.35, H - Dh + 0.6, 0.12, C.metalD, 3);
    }
    // end walls (masonry, high windows), full depth
    for (const sx of [-1, 1]) {
      g.box(sx * (hw - 0.6), 0, 0, 1.2, H + 0.6, b.d, C.wall, 1);
      windowsX(g, sx * hw, sx, -hd + 2, hd - 2, Dh - 4, 2.5, 3, 6);
      windowsX(g, sx * hw, sx, -core / 2, core / 2, 2.5, 1.4, 1.6, 3.2);
    }
    // door leaves: 35 ft wide panels; back side shut (offset tracks), front side stacked open at both ends
    const leaf = 35 * FT, n = Math.floor((b.w - 2) / leaf);
    for (let i = 0; i < n; i++) { const x = -hw + 1 + leaf / 2 + i * leaf; g.box(x, 0, zb - 1.6 - (i % 2) * 0.5, leaf - 0.1, Dh, 0.4, i % 2 ? C.metal : C.metal2); for (let y = 2; y < Dh; y += 2.4) g.box(x, y, zb - 1.35 - (i % 2) * 0.5, leaf - 0.4, 0.08, 0.1, C.metalD, 3); }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { const x = sx * (hw - 1.2 - leaf / 2 - i * 0.15); g.box(x, 0, zf + 1.4 + i * 0.5, leaf - 0.1, Dh, 0.4, i % 2 ? C.metal : C.metal2); }
    // the door track at the threshold and a hangar number on the fascia (white block digits)
    g.box(0, 0, zf + 1.4, b.w - 2, 0.06, 1.6, C.metalD, 1);
    const num = '102'; for (let q = 0; q < 3; q++) { const dg = DIG[+num[q]]; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (dg[r * 3 + c] === '1') g.box(-hw + 12 + q * 3.2 + (c - 1) * 0.8, Dh + 0.6 + (4 - r) * 0.7, zf - 0.08, 0.75, 0.68, 0.1, C.white); }
  }
  // SR-71 shelter: a steel-framed barn, corrugated walls, shallow gable roof, two door leaves pushed back to the sides
  function barn(g, b) {
    const hw = b.w / 2, hd = b.d / 2, Dh = b.door, eave = Dh + 1.6;
    g.box(0, 0, hd - 0.3, b.w, eave, 0.6, C.corr, 1);   // back
    for (const sx of [-1, 1]) g.box(sx * (hw - 0.3), 0, 0, 0.6, eave, b.d, C.corr, 1);
    g.box(0, Dh, -hd + 0.3, b.w, eave - Dh, 0.6, C.corr);   // door header
    g.gable(0, eave, 0, b.w, b.d, b.h - eave, C.roofD, C.corr, 0.4);
    g.box(0, eave - 0.2, 0, b.w - 1.2, 0.2, b.d - 1.2, C.corrD, 0);   // ceiling
    for (let z = -hd + 4; z < hd; z += 7) g.box(0, eave - 1.0, z, b.w - 1.2, 0.8, 0.4, C.metalD, 3);   // portal frames
    for (const sx of [-1, 1]) { g.box(sx * (hw - 5.5), 0, -hd - 0.4, 10, Dh, 0.3, C.metal2); g.box(sx * (hw - 5.8), 0, -hd - 0.9, 10, Dh, 0.3, C.metal); }
    g.box(-hw + 3, 0, -hd - 0.1, 1.8, 0.05, 0.1, C.yellow);
  }
  // control tower: concrete shaft, catwalk, a glazed cab with sloped glass, the beacon on top
  function tower(g, b) {
    const H = 27;
    g.box(0, 0, 0, 7, H, 7, C.concrete);
    for (let y = 3; y < H - 2; y += 3.4) { g.box(0, y, -3.54, 1.6, 1.4, 0.1, C.glass); g.box(-3.54, y, 0, 0.1, 1.4, 1.6, C.glass); g.box(3.54, y, 0, 0.1, 1.4, 1.6, C.glass); }
    g.box(0, H, 0, 11.5, 0.4, 11.5, C.conc2, 0); for (const s of [-1, 1]) { g.box(s * 5.7, H + 0.4, 0, 0.08, 1.0, 11.5, C.metal, 3); g.box(0, H + 0.4, s * 5.7, 11.5, 1.0, 0.08, C.metal, 3); }
    g.box(0, H + 0.4, 0, 9.4, 0.9, 9.4, C.concrete);
    // the cab: glass leaning out, mullions
    const y0 = H + 1.3, ch = 3.4, r0 = 4.7, r1 = 5.2;
    for (let i = 0; i < 4; i++) {
      g.push(0, 0, 0, i * Math.PI / 2);
      g.quad([-r0, y0, -r0], [r0, y0, -r0], [r1, y0 + ch, -r1], [-r1, y0 + ch, -r1], C.glassL);
      for (let k = -2; k <= 2; k++) g.strut([k * r0 / 2.5, y0, -r0 - 0.02], [k * r1 / 2.5, y0 + ch, -r1 - 0.02], 0.12, C.frame);
      g.pop();
    }
    g.box(0, y0, 0, 9.2, 0.6, 9.2, C.frame, 2);
    g.box(0, y0 + ch, 0, 11.6, 0.5, 11.6, C.conc2);
    g.box(0, y0 + ch + 0.5, 0, 0.3, 1.6, 0.3, C.metal);
    for (let i = 0; i < 3; i++) g.box(4.2, y0 + ch + 0.5, -3 + i * 3, 0.1, 2.2, 0.1, C.metal, 3);   // antennas
    g.box(3.6, 0, -3.6, 1.2, H, 1.2, C.conc2);   // stair / lift shaft
  }
  function block(g, b) {
    const fl = b.floors || 2, fh = b.h / fl, hw = b.w / 2, hd = b.d / 2;
    g.box(0, 0, 0, b.w, b.h, b.d, C.wall2, 1);
    g.box(0, b.h, 0, b.w + 0.3, 0.6, b.d + 0.3, C.concrete, 0); g.box(0, b.h + 0.6, 0, b.w - 0.6, 0.06, b.d - 0.6, C.roofD, 1);
    for (let f = 0; f < fl; f++) { windows(g, -hd, -1, -hw + 1, hw - 1, f * fh + 1.0, Math.min(1.5, fh - 1.4), 1.8, 3.4); windows(g, hd, 1, -hw + 1, hw - 1, f * fh + 1.0, Math.min(1.5, fh - 1.4), 1.8, 3.4); }
    if (b.w > 10) { g.box(0, 0, -hd - 1.4, 5, 0.25, 2.8, C.concrete); g.box(0, 2.8, -hd - 1.6, 6, 0.25, 3.2, C.concrete); g.box(0, 0, -hd - 0.05, 2.2, 2.4, 0.12, C.glassL); }
    for (let x = -hw + 4; x < hw - 2; x += 9) g.box(x, b.h + 0.6, 2, 1.8, 1.0, 1.2, C.metal);   // rooftop units
  }
  function fire(g, b) {
    const hw = b.w / 2, hd = b.d / 2;
    g.box(0, 0, 0, b.w, b.h, b.d, C.wall2, 1);
    g.box(0, b.h, 0, b.w + 0.3, 0.5, b.d + 0.3, C.concrete, 0);
    for (let i = 0; i < 4; i++) { const x = -hw + 5 + i * 8.5; g.box(x, 0, -hd - 0.05, 6.2, 5.2, 0.12, C.red); for (let y = 1.2; y < 5; y += 1.1) g.box(x, y, -hd - 0.12, 6.0, 0.06, 0.06, C.metalD, 3); }
    windows(g, hd, 1, -hw + 1, hw - 1, 1.2, 1.3);
    g.box(hw - 3, b.h + 0.5, hd - 3, 3, 6, 3, C.wall2);   // the hose-drying tower
  }
  function shed(g, b) {
    const hw = b.w / 2, hd = b.d / 2;
    g.box(0, 0, 0, b.w, b.h, b.d, C.corr, 1);
    g.gable(0, b.h, 0, b.w, b.d, 2.4, C.roofD, C.corr, 0.5);
    for (let i = 0; i < 3; i++) g.box(-hw + 10 + i * (b.w - 20) / 2, 0, -hd - 0.05, 5, 4.5, 0.12, C.metal2);
    windows(g, -hd, -1, -hw + 2, hw - 2, 5.6, 1.0, 2.4, 5);
    g.box(0, 0, -hd - 3, b.w * 0.6, 1.2, 6, C.concrete);   // loading dock
  }
  function tank(g, r, h) {
    g.cyl(0, 0, 0, r, h, 20, C.tank, 0);
    g.cyl(0, h, 0, r, 1.6, 20, shade(C.tank, 0.92), 0, 0.6);
    g.strut([r * 0.92, 0, 0.6], [r * 0.18, h + 1.3, 0.6], 0.25, C.metalD);   // the stair
    g.cyl(0, 0, 0, r + 0.25, 0.5, 20, C.concrete, 0);
  }
}

// ---------------------------------------------------------------------------------------------------- the map
// draw the field on a 2D map: px / py map world x / z to canvas pixels, half = pixels per metre. Off the canvas (the
// command map shows the zone only), an arrow at the edge points to it with the name and range.
export function drawAirbaseMap(c, L, px, py, half, { big = false, W = 0, H = 0, from = null } = {}) {
  const R = AB.RWY_L / 2, Wd = AB.RWY_W / 2;
  const P = (u, v) => { const p = L.toW(u, v); return [px(p[0]), py(p[1])]; };
  const [cx, cy] = P(0, 300);
  const off = W && H && (cx < 10 || cy < 10 || cx > W - 10 || cy > H - 10);
  c.save();
  if (!off) {
    c.fillStyle = 'rgba(160,160,150,.9)';
    const poly = (pts) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.fill(); };
    poly([P(-R, -Wd * (big ? 1 : 2.5)), P(R, -Wd * (big ? 1 : 2.5)), P(R, Wd * (big ? 1 : 2.5)), P(-R, Wd * (big ? 1 : 2.5))]);
    c.fillStyle = 'rgba(140,140,130,.8)'; poly([P(-R, AB.TWY_V - 12), P(R, AB.TWY_V - 12), P(R, AB.TWY_V + 12), P(-R, AB.TWY_V + 12)]);
    poly([P(AB.APRON_U0, AB.TWY_V), P(AB.APRON_U1, AB.TWY_V), P(AB.APRON_U1, 620), P(AB.APRON_U0, 620)]);
    c.fillStyle = '#6ef'; c.font = `bold ${big ? 12 : 9}px monospace`; c.textAlign = 'center';
    if (big || half * R > 20) c.fillText(L.name, cx, cy - (big ? 10 : 6));
  } else if (big) {
    const mx = Math.min(W - 70, Math.max(70, cx)), my = Math.min(H - 140, Math.max(40, cy)), a = Math.atan2(cy - my, cx - mx);
    c.translate(mx, my); c.fillStyle = '#6ef'; c.save(); c.rotate(a); c.beginPath(); c.moveTo(14, 0); c.lineTo(-6, -8); c.lineTo(-6, 8); c.closePath(); c.fill(); c.restore();
    const d = from ? Math.hypot(L.x - from.x, L.z - from.z) : 0;
    c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.fillText(`${L.name}${d ? `  ${(d / 1000).toFixed(1)} km` : ''}`, 0, 24);
  }
  c.restore();
}
