// F-14A airframe geometry from the drawings (ngc/look-tomcat). Every outline here is the traced or dimensioned shape of
// the public-domain NASA drawings (docs/ngc1980/reference/f14a/SOURCES.md), converted ONCE into the model frame:
//   NASA TP-2769 / TM-83250 fig. 2-3: 1/12-scale model, stations in model cm (full size = x 12):
//     z (m, aft +) = FS_full - 11.152   (FS 92.933 cm = 11.152 m: the moment reference = the sim's CG, z 0)
//     y (m, up +)  = WL_full - 4.246    (ground under the static jet at y -2.37: the 16 ft 0 in height puts the fin tip,
//                                       WL 56.304 cm = 6.756 m, 4.88 m above it; FRL WL 31.749 cm at y -0.436)
//     x (m, right +) = BL_full
//   f14trace.json: the traced side (top / bottom), top (half-width, wings at 68 deg) and front (half-width per height)
//   silhouettes in this frame (tools/blueprint/f14a/*.config.json).
// Shapes are smooth lofts (superellipse sections with analytic normals, arc-length UVs) and airfoil slabs, no boxes.
import * as THREE from 'three';
import { sampler, pl, smooth01, stationList, stationKeys, bodySurface, gridArrays, TAU } from './loftkit.js';
import { F14_TRACE } from './f14trace.js';

export const D2R = Math.PI / 180;
export const FS = cm => cm * 0.12 - 11.152, WL = cm => cm * 0.12 - 4.246, BL = cm => cm * 0.12;   // model cm (1/12) -> frame
// ---- the dimensioned geometry (NASA TM-83250 fig. 2-3, TP-2769 fig. 2 and 4; m in the frame above)
export const G = {
  NOSE: FS(0), TAIL: FS(156.845), LENGTH: 18.821,
  PIVOT: [BL(22.648), -0.19, FS(91.271)],               // wing pivot BL 107 in (2.718 m); wing chord plane y -0.19 (the wing edge-on in the TP-2769 side view)
  WING: { le0: FS(76.949), root: 35.373 * 0.12, semi: BL(81.443), tipC: 9.364 * 0.12, kinkX: BL(21.635), gloveTE: 13.25 * D2R, sweep: 20 * D2R },
  GLOVE_LE0: [1.61, FS(49.741)],                       // the glove leading edge starts at the intake's outer top corner (FS 49.741)
  VTAIL: { x: BL(11.644) + 0.11,   /* tips at +-1.73: NATOPS fig 1-1 and CR-163098 as drawn (their labels, 10 ft 8 in and BL 11.644, say 1.62-1.63: drawings trusted, both recorded) */ y: WL(34.713), cant: 5 * D2R, rootLE: FS(124.421), rootC: 32.387 * 0.12, tipTE: FS(156.808), tipC: 9.312 * 0.12, h: 21.591 * 0.12, rootTEx: 26.033 * 0.12, tc: 0.045 },
  HTAIL: { x: BL(19.051), y: WL(29.845), anh: 3.5 * D2R, rootLE: FS(122.02), rootC: 31.456 * 0.12, span: 22.488 * 0.12, tipLEz: (36.257 - 6.709) * 0.12, tipTEz: 36.257 * 0.12, axisZ: 16.487 * 0.12, axisSweep: 9.49 * D2R, tc: 0.04 },
  VENTRAL: { y: WL(24.100), z0: FS(137.269) - 28.448 * 0.12, z1: FS(137.269), depth: 6.129 * 0.12, x: 1.41, cant: 15 * D2R },
  HOOK: { pivot: [0, WL(29.209), FS(126.893)], len: 28.701 * 0.12, up: -8.87 * D2R },
  NOZZLE: { z0: FS(141.499), len: 10.792 * 0.12, shroudR: 10.686 * 0.06, exitR: [5.385 * 0.06, 5.664 * 0.06], x: BL(13.547), y: -0.70 },
  GROUND: -2.37,
};

// ---- profiles from the trace
const T = F14_TRACE;
const sideTop = sampler(T.side, 'top', { median: 0.12 }), sideBot = sampler(T.side, 'bottom', { median: 0.12, override: z => z > -7.5 && z < -6.7 ? pl([[-7.5, -1.256], [-6.7, -1.228]])(z) : null });   // (the NASA model's under-nose "gun pods" are a tunnel fixture: bridged)
const topHW = sampler(T.top, 'hw', { median: 0.1 });

// fuselage: nose to the beaver tail; under the canopy the top is the canopy sill (the canopy is its own loft)
const Z_WS = -8.40, Z_CANOPY_END = -2.35;   // windscreen base (traced side view); the canopy's aft fairing meets the spine
export const sill = pl([[Z_WS, 0.05], [-7.6, 0.06], [-6.2, 0.10], [-4.6, 0.16], [-3.2, 0.26], [Z_CANOPY_END, 0.40]]);
const spine = pl([[Z_CANOPY_END, 0.42], [-1.6, 0.30], [0.0, 0.26], [2.0, 0.16], [3.0, 0.03], [4.5, -0.03], [6.0, -0.12], [7.0, -0.22], [7.62, -0.34]]);
export function fuseT(z) { if (z <= Z_WS) return sideTop(z); if (z <= Z_CANOPY_END) return sill(z) - 0.02; if (z < 2.4) return Math.min(sideTop(z), pl([[Z_CANOPY_END, sill(Z_CANOPY_END) + 0.04], [-1.9, 9]])(z)); return spine(z); }   // aft of the canopy the traced spine
export function fuseB(z) { if (z <= -5.25) return sideBot(z); return pl([[-5.25, sideBot(-5.25)], [-3.5, -1.12], [-1.0, -1.0], [1.5, -0.86], [4.0, -0.62], [6.0, -0.50], [7.62, -0.44]])(z); }
export function fuseW(z) { if (z <= -5.30) return topHW(z); return pl([[-5.30, topHW(-5.30)], [-3.5, 0.72], [-1.0, 0.66], [1.0, 0.62], [5.4, 0.62], [6.4, 0.52], [7.62, 0.22]])(z); }
const fuseYm = z => { const t = fuseT(z), b = fuseB(z); return z < -5.0 ? b + (t - b) * pl([[-11.2, 0.5], [-9.5, 0.42], [-7.5, 0.36], [-5, 0.42]])(z) : b + (t - b) * 0.55; };
const fuseNT = pl([[-11.2, 2.0], [-9.0, 2.1], [-8.4, 2.4], [-8.0, 5.5], [-4.3, 5.5], [-2.0, 3.6], [1.0, 5.0], [7.6, 6.0]]);   // flat-topped under the canopy: the rails sit on the fuselage's shoulders
const fuseNB = pl([[-11.2, 2.0], [-9.0, 2.3], [-7.0, 2.8], [-5.0, 3.2], [-1.0, 4.0], [7.6, 4.0]]);

// geometry from loftkit arrays, with material groups chosen per quad
export function gridGeo(S, zs, phis, matOf = null, opts = {}) {   // matOf(i, j) -> material index, or -1 to drop the quad (openings)
  const a = gridArrays(S, zs, phis, { uv: 'arc', ...opts }), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3)); g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  if (!matOf) { g.setIndex(a.index); return g; }
  const np = phis.length, buckets = [];
  for (let q = 0; q < a.index.length; q += 6) { const v = a.index[q], i = Math.floor(v / np), j = v % np, m = matOf(i, j); if (m >= 0) (buckets[m] ||= []).push(...a.index.slice(q, q + 6)); }
  const idx = []; buckets.forEach((b, m) => { if (b) { g.addGroup(idx.length, b.length, m); idx.push(...b); } }); g.setIndex(idx); return g;
}
const ring = n => Array.from({ length: n + 1 }, (_, j) => TAU * j / n);

// ---- the fuselage loft. lod 0: ~150 stations x 48; lod 1: ~60 x 24; lod 2: ~30 x 12
export function fuselageGeo(lod = 0) {
  const k = [1, 2.5, 5][lod];
  const zs = stationList([[G.NOSE, -10.2, 0.03 * k], [-10.2, -8.6, 0.06 * k], [-8.6, -7.2, 0.05 * k], [-7.2, -5.4, 0.1 * k], [-5.4, 7.62, 0.15 * k]], lod ? [] : [Z_WS, -9.3, -5.25, -3.5]);
  zs[0] += 0.002;
  const keys = stationKeys(zs, z => ({ T: fuseT(z), B: fuseB(z), W: fuseW(z), ym: fuseYm(z), nT: fuseNT(z), nB: fuseNB(z), lean: z < -6 ? 0.06 : 0.02, crown: 0 }));
  const S = bodySurface(keys), phis = ring([48, 24, 12][lod]);
  // materials: 0 grey (upper), 1 white (belly), 2 radome (tan), 3 anti-glare (black)
  const zRadome = -9.30;
  return gridGeo(S, zs, phis, (i, j) => {
    const z = zs[i], ph = phis[j], belly = Math.abs(ph - Math.PI) < 0.95;
    if (z > COCKPIT_OPEN[0] && z < COCKPIT_OPEN[1] && (ph < 0.75 || ph > TAU - 0.75)) return -1;   // the cockpit opening under the canopy
    if (z < zRadome) return 2;
    if (z < Z_WS && (ph < 0.55 || ph > TAU - 0.55)) return 3;
    return belly ? 1 : 0;
  });
}

// ---- canopy and windscreen: one loft over the sill from the windscreen base to the aft fairing (top from the trace)
const canopyT = z => z <= -2.9 ? sideTop(z) : pl([[-2.9, sideTop(-2.9)], [Z_CANOPY_END, sill(Z_CANOPY_END) + 0.02]])(z);
export const canopyW = pl([[Z_WS, 0.43], [-7.65, 0.50], [-6.6, 0.53], [-5.0, 0.53], [-4.2, 0.51], [-3.2, 0.41], [Z_CANOPY_END, 0.28]]);   // widths from the CR-163098 front view (registered)
export const Z_BOW = -7.62, Z_GLASS_END = -4.05, COCKPIT_OPEN = [-8.05, -4.15];   // windscreen arch (fixed); the canopy's glass ends at the aft frame over the RIO
export function canopySurface() {
  const zs = stationList([[Z_WS, Z_CANOPY_END, 0.08]], [Z_BOW, Z_GLASS_END]);
  const keys = stationKeys(zs, z => ({ T: canopyT(z), B: sill(z) - 0.06, W: canopyW(z), ym: sill(z) - 0.03, nT: pl([[Z_WS, 2.0], [-7.6, 2.3], [-5, 2.6], [Z_CANOPY_END, 2.2]])(z), nB: 4 }));
  return { S: bodySurface(keys), zs };
}
// a canopy piece between z0 and z1 (upper half only: phi -PI/2..PI/2), offset outward by off
export function canopyGeo(z0, z1, { off = 0, n = 28, lod = 0 } = {}) {
  const { S } = canopySurface(), zs = stationList([[z0, z1, lod ? 0.25 : 0.06]]);
  // phi from -PI/2 (left sill) over the top to PI/2 (right sill), wrapped into the surface's 0..2PI
  const ph = Array.from({ length: n + 1 }, (_, j) => -Math.PI / 2 + Math.PI * j / n);
  const Sx = { ...S, at: (z, p, o) => S.at(z, (p + TAU) % TAU, o), normal: (z, p, o) => S.normal(z, (p + TAU) % TAU, o) };
  return gridGeo(Sx, zs, ph, null, { off });
}
// a frame hoop (canopy bow) at station z: points on the canopy surface, offset out
export function canopyHoop(z, off = 0.02, n = 16) {
  const { S } = canopySurface(), o = {}, nn = {}, pts = [];
  for (let j = 0; j <= n; j++) { const p = (-Math.PI / 2 + Math.PI * j / n + TAU) % TAU; S.at(z, p, o); S.normal(z, p, nn); pts.push(new THREE.Vector3(o.x + nn.x * off, o.y + nn.y * off, o.z + nn.z * off)); }
  return pts;
}

// ---- intakes and nacelles: raked 2D intake (top lip at FS 49.741, lower lip ~0.9 m aft), the box duct rounding into the
// TF30 nacelle; centre line BL 13.547 cm (1.626 m) at the nozzles. Sections are superellipses about (cx, cy).
const NAC = {
  cx: pl([[-5.25, 1.24], [-3.0, 1.30], [-1.0, 1.42], [2.0, 1.60], [4.5, G.NOZZLE.x], [6.0, G.NOZZLE.x]]),
  a: pl([[-5.25, 0.37], [-3.0, 0.42], [-1.0, 0.46], [2.0, 0.52], [4.5, 0.56], [5.83, 0.60]]),
  top: pl([[-5.25, -0.27], [-3.0, -0.10], [-1.0, 0.0], [2.0, 0.02], [4.5, -0.04], [5.83, G.NOZZLE.y + 0.62]]),
  bot: pl([[-5.25, -1.40], [-2.3, -1.44], [0.0, -1.55], [2.1, -1.60], [4.0, -1.50], [5.83, G.NOZZLE.y - 0.64]]),
  n: pl([[-5.25, 8.0], [-3.0, 7.0], [-1.0, 5.5], [2.0, 4.0], [4.5, 3.0], [5.83, 2.2]]),   // boxy flat-sided ducts (CR-163098 front view) rounding to the TF30 nozzle
};
export const LIP_TOP = [-0.27, FS(49.741)];
// the intake mouth in side view (TP-2769 fig. 2a): the long raked side edge from the top lip (FS 49.741) down and aft to
// the lower lip, whose face is the short vertical step at z -2.57 between y -1.10 and the nacelle bottom
export const LIP_LOW = [-1.10, -2.57];
export const zLip = y => y >= LIP_LOW[0] ? LIP_TOP[1] + (LIP_TOP[0] - y) * (LIP_LOW[1] - LIP_TOP[1]) / (LIP_TOP[0] - LIP_LOW[0]) : LIP_LOW[1];
export function nacelleGeo(s, lod = 0) {
  const k = [1, 2.5, 5][lod], zs = stationList([[-5.25, -2.4, 0.08 * k], [-2.4, 5.83, 0.2 * k]]), np = [40, 20, 12][lod];
  const P = (z, ph, o) => {
    const cx = NAC.cx(z), a = NAC.a(z), tp = NAC.top(z), bt = NAC.bot(z), cy = (tp + bt) / 2, b = (tp - bt) / 2, e = 2 / NAC.n(z);
    const sn = Math.sin(ph), cs = Math.cos(ph);
    o.x = s * (cx + a * Math.sign(sn) * Math.abs(sn) ** e); o.y = cy + b * Math.sign(cs) * Math.abs(cs) ** e; o.z = Math.max(z, zLip(o.y)); return o;
  };
  const S = { at: P, normal: (z, ph, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, z0: -5.25, z1: 5.83 };   // (normals recomputed below)
  const g = gridGeo(S, zs, ring(np), (i, j) => { const ph = ring(np)[j]; return Math.abs(ph - Math.PI) < 1.2 ? 1 : 0; }, { flip: s < 0 });
  g.computeVertexNormals();   // (the raked lip folds stations together: facet normals there, smooth elsewhere)
  return g;
}
export const nacelleAt = z => ({ cx: NAC.cx(z), a: NAC.a(z), top: NAC.top(z), bot: NAC.bot(z) });

// ---- airfoil slabs: a planform as LE(u) / TE(u) over a span coordinate u, thickness t(u) as a fraction of chord, a
// symmetric section (NACA 4-digit thickness form, closed TE). map(u, z, h) -> [x, y, z] places it (h = height off the
// chord plane). Returns a closed smooth geometry with a capped root.
const naca = x => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);   // unit thickness (max 1 at 30% chord)
export function airfoilGeo({ u0, u1, nu = 24, nc = 18, LE, TE, tc, map, cap0 = true, cap1 = false, chordPts = null, split = false }) {   // split: group 0 upper surface, 1 lower (paint)
  const cs = chordPts || Array.from({ length: nc + 1 }, (_, i) => (1 - Math.cos(Math.PI * i / nc)) / 2);   // cosine spacing
  const pos = [], idx = [], uv = [], ring2 = [];
  // per span station: upper surface LE->TE, lower TE->LE. A full chord (0..1) shares the LE and TE points (smooth LE);
  // a chordwise strip (slat, box, flap: chordPts f0..f1) keeps both ends, so its section closes with flat walls there
  const N = cs.length, full = cs[0] === 0 && cs[N - 1] === 1;
  for (let i = 0; i <= nu; i++) {
    const u = u0 + (u1 - u0) * i / nu, zl = LE(u), zt = TE(u), c = zt - zl, t = tc(u) * c / 2;
    const st = [];
    for (let k = 0; k < N; k++) { const x = cs[k]; st.push(map(u, zl + c * x, t * naca(x))); }
    for (let k = full ? N - 2 : N - 1; k >= (full ? 1 : 0); k--) { const x = cs[k]; st.push(map(u, zl + c * x, -t * naca(x))); }
    ring2.push(st);
  }
  const M = ring2[0].length;
  ring2.forEach((st, i) => st.forEach((p, k) => { pos.push(...p); uv.push(i / nu, k / M); }));
  const lower = [];
  for (let i = 0; i < nu; i++) for (let k = 0; k < M; k++) { const a = i * M + k, b = i * M + (k + 1) % M, c = (i + 1) * M + (k + 1) % M, d = (i + 1) * M + k; (split && k >= N - 1 ? lower : idx).push(a, b, d, b, c, d); }
  const nUp = idx.length; idx.push(...lower);
  const capAt = (i, flip) => { const base = pos.length / 3, st = ring2[i]; let cx = 0, cy = 0, cz = 0; st.forEach(p => { cx += p[0]; cy += p[1]; cz += p[2]; pos.push(...p); uv.push(0, 0); }); pos.push(cx / M, cy / M, cz / M); uv.push(0, 0); for (let k = 0; k < M; k++) flip ? idx.push(base + M, base + (k + 1) % M, base + k) : idx.push(base + M, base + k, base + (k + 1) % M); };
  if (cap0) capAt(0, false); if (cap1) capAt(nu, true);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  if (split) { g.addGroup(0, nUp, 0); g.addGroup(nUp, lower.length, 1); g.addGroup(nUp + lower.length, idx.length - nUp - lower.length, 0); }
  g.computeVertexNormals();
  // orientation: make the outward normal point away from the chord plane at mid-span upper surface
  return g;
}
// make a closed mesh face outward (flip winding if its signed volume is negative)
export function outward(g) {
  const p = g.attributes.position.array, ix = g.index.array; let vol = 0;
  for (let q = 0; q < ix.length; q += 3) { const a = ix[q] * 3, b = ix[q + 1] * 3, c = ix[q + 2] * 3; vol += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]); }
  if (vol < 0) { const a = Array.from(ix); for (let q = 0; q < a.length; q += 3) { const t = a[q + 1]; a[q + 1] = a[q + 2]; a[q + 2] = t; } const gr = g.groups.slice(); g.setIndex(a); g.clearGroups(); for (const x of gr) g.addGroup(x.start, x.count, x.materialIndex); g.computeVertexNormals(); }
  return g;
}

// ---- the reference wing (TM-83250 fig. 3a) at 20 deg, absolute frame (x = BL >= 0, z aft)
const W = G.WING;
export const wingLE = x => W.le0 + x * Math.tan(W.sweep);                                                  // 20 deg leading edge
export const wingTEout = x => W.le0 + W.root + (x - W.kinkX) * ((W.le0 + W.semi * Math.tan(W.sweep) + W.tipC) - (W.le0 + W.root)) / (W.semi - W.kinkX);   // outer TE: kink -> tip
// the glove planform (top view, traced at 68 deg sweep): LE from the intake corner to its tip near the pivot, then the
// fairing round the pivot back to the nacelle at the glove trailing edge
export const GLOVE = {
  // inboard of the intake corner the glove's leading edge runs back to the fuselage side at z -3.0, leaving the intake's
  // top and the boundary-layer slot beside the fuselage open from above (as the top view)
  LE: x => x <= G.GLOVE_LE0[0] ? G.GLOVE_LE0[1] + (G.GLOVE_LE0[0] - x) / (G.GLOVE_LE0[0] - 0.62) * (-3.0 - G.GLOVE_LE0[1]) : G.GLOVE_LE0[1] + (x - G.GLOVE_LE0[0]) * (-0.66 - G.GLOVE_LE0[1]) / (3.21 - G.GLOVE_LE0[0]),   // 71 deg, traced
  TE: pl([[0.55, 2.55], [1.6, 2.42], [2.22, 2.28], [2.31, 1.22], [2.75, 0.45], [3.21, -0.37]]),
  x0: 0.62, x1: 3.21,
  t: pl([[0.55, 0.50], [1.6, 0.48], [2.7, 0.42], [3.21, 0.34]]),   // thickness (m): encloses the wing root (0.36 m) with margin
  y: -0.17,
};
