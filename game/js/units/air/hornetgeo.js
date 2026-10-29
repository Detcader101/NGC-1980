// F/A-18A airframe geometry from the drawings (ngc/look-units). Every outline is the traced or dimensioned shape of the
// public-domain sources (docs/ngc1980/reference/fa18a/SOURCES.md), converted ONCE into the jet model frame:
//   NASA Dryden three-view (2865 x 1760 px), 111.42 px/m (NATOPS A1-F18AC-NFM-000 1.1.2: length 56 ft = nose tip to
//   stabilator tip; the span over the tip rails then reads 11.58 m against NATOPS 37 ft 6 in: +1.3 %, drawing kept)
//     side:  z = (px - 959) / 111.42 - 10.475     y = (1685 - py) / 111.42 - 2.05
//     top (mirrored, nose left): z = (px' - 946) / 111.42 - 10.475   x = (815 - py) / 111.42
//     front: x = (2087 - px) / 111.42            y = (544 - py) / 111.42 - 2.05
//   The frame is the sim's (jetfm.js HORNET): origin at the CG, main wheel centres at z 0.6, wheel contact at y -2.05.
//   fa18trace.js: the traced side (top / bottom), top (half-width, wings and LEX included) and front silhouettes.
// Shapes are smooth lofts (superellipse sections with analytic normals, arc-length UVs) and airfoil slabs, no boxes.
import * as THREE from 'three';
import { sampler, pl, stationList, stationKeys, bodySurface, gridArrays, TAU } from './loftkit.js';
import { FA18_TRACE } from './fa18trace.js';

export const D2R = Math.PI / 180;
const S = 111.42, zS = px => (px - 959) / S - 10.475, yS = py => (1685 - py) / S - 2.05;   // side-view pixel -> frame
// ---- dimension table (m, frame above). Sources: NATOPS 1.1.2 (overall), the NASA three-view (everything drawn)
export const G = {
  NOSE: -10.475, NOZZLE_EXIT: zS(2801), LENGTH: 17.07, SPAN_RAILS: 11.58, HEIGHT: 4.65,
  Z_WS: zS(1345), Z_BOW: zS(1468), Z_CANOPY_END: zS(1710),                       // windscreen base, windscreen bow, canopy aft end
  Z_INTAKE: zS(1914),                                                            // intake face (side view vertical line)
  NOSE_WHEEL: [0.23, zS(1579)], MAIN_WHEEL: [1.544, 0.6], R_NOSE: 0.26, R_MAIN: 0.37, // front view track 3.09 m (Jane's 3.11), wheelbase 5.51 m
  WING: { y0: 0.165, x0: 0.85, tipX: 5.67, railX: 5.73, dihedral: -3.2 * D2R, le: [1.93, -1.455], leSlope: 0.4775, te: [1.64, 2.27], teSlope: -0.0137, tc: [0.05, 0.03] },
  RAIL: { z0: -0.62, z1: 2.35, x: 5.76, y: -0.05 },
  STAB: { x0: 0.70, tip: 3.18, y0: -0.10, anh: 2 * D2R, pivotZ: 4.85, tc: 0.045 },
  FIN: { cant: 20 * D2R, xRoot: 1.04, yRoot: 0.445, yTip: yS(1161), tc: 0.05 },
  NOZ: { x: 0.38, y: -0.12, z0: 5.32, rBase: 0.47, rExit: 0.31 },
  ACT: { z0: 5.0, z1: 6.04, xo: [[5.0, 0.90], [5.6, 0.88], [6.04, 0.74]], h: 0.26 },    // stabilator actuator fairings outboard of the nozzles (top view)
  HOOK: { pivot: [0, -0.66, 3.22], len: 2.97, up: 0.11 },                        // NASA F-18 HARV side view (114 px/m on its wheelbase)
  EYE: [0, 0.88, -5.05],                                                        // design eye: 0.43 m under the canopy top, 0.93 m aft of the bow
};

// ---- profiles from the trace
const T = FA18_TRACE;
const sideTop = sampler(T.side, 'top', { median: 0.1 }), sideBot = sampler(T.side, 'bottom', { median: 0.12 }), topHW = sampler(T.top, 'hw', { median: 0.08 });
export { sideTop, sideBot, topHW };

// canopy rail (sill): the canopy's lower edge in the side view, windscreen base to the aft fairing
export const sill = pl([[G.Z_WS, 0.59], [-6.0, 0.62], [-5.0, 0.66], [G.Z_CANOPY_END, 0.72]]);
// the spine aft of the canopy: traced to z 1.0, then (hidden by the fins in the side view) the drawn line between them
const spine = pl([[1.0, 0.86], [2.4, 0.74], [3.9, 0.50], [4.6, 0.42], [5.32, 0.34]]);
const Z_FAIR = G.Z_CANOPY_END - 0.3;   // the fairing behind the seat rises under the canopy's aft glass to the spine
export function fuseT(z) { if (z <= G.Z_WS) return sideTop(z); if (z <= Z_FAIR) return sill(z) - 0.03; if (z <= G.Z_CANOPY_END) { const t = (z - Z_FAIR) / 0.3; return sill(z) - 0.03 + (sideTop(G.Z_CANOPY_END) - 0.02 - sill(z) + 0.03) * t * t * (3 - 2 * t); } if (z <= 1.0) return sideTop(z); return spine(z); }
export function fuseB(z) { return sideBot(z); }
// half-width: the traced top view ahead of the LEX apex; under the LEX the front view's forebody (0.64), the intakes are
// their own ducts; aft of the wing the nacelles as the top view draws them
const Z_LEX = -7.95;
const fwW = pl([[Z_LEX, 0.55], [-6.8, 0.61], [-5.6, 0.64], [-2.0, 0.66], [-1.6, 0.74], [-1.0, 0.86], [0.6, 0.98], [1.6, 0.98], [2.4, 0.92], [3.8, 0.92], [4.6, 0.97], [5.32, 0.94]]);
export function fuseW(z) { return z <= Z_LEX ? topHW(z) : fwW(z); }
// widest line, exponents, tumblehome: round nose; under the canopy the shoulders at the LEX (front view 0.64 at y 0.45);
// flat-bellied centre body; aft the spine stands up between the nacelle shoulders (crown)
const fuseYm = z => { const t = fuseT(z), b = fuseB(z); return pl([[G.NOSE, 0.42], [-9.0, 0.45], [-7.95, 0.62], [-6.5, 0.70], [-3.5, 0.66], [-1.0, 0.58], [2.0, 0.50], [5.32, 0.55]])(z) * (t - b) + b; };
const fuseNT = pl([[G.NOSE, 2.0], [-9.0, 2.0], [-7.6, 2.3], [-7.0, 3.5], [G.Z_CANOPY_END, 3.5], [-2.5, 2.4], [1.0, 2.6], [5.32, 3.0]]);
const fuseNB = pl([[G.NOSE, 2.0], [-9.0, 2.3], [-7.0, 3.0], [-4.0, 3.6], [-1.0, 4.2], [5.32, 3.6]]);
const fuseLean = pl([[G.NOSE, 0.0], [-8.0, 0.05], [-6.0, 0.10], [-2.5, 0.25], [-1.7, 0.36], [-1.0, 0.46], [1.0, 0.50], [3.0, 0.55], [5.32, 0.40]]);
const fuseCrown = pl([[-2.5, 0.0], [0.5, 0.18], [3.0, 0.30], [5.32, 0.22]]);

// geometry from loftkit arrays, material groups per quad (matOf(i, j) -> index, or -1 to drop the quad: openings)
export function gridGeo(Sf, zs, phis, matOf = null, opts = {}) {
  const a = gridArrays(Sf, zs, phis, { uv: 'arc', ...opts }), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3)); g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  if (!matOf) { g.setIndex(a.index); return g; }
  const np = phis.length, buckets = [];
  for (let q = 0; q < a.index.length; q += 6) { const v = a.index[q], i = Math.floor(v / np), j = v % np, m = matOf(i, j); if (m >= 0) (buckets[m] ||= []).push(...a.index.slice(q, q + 6)); }
  const idx = []; buckets.forEach((b, m) => { if (b) { g.addGroup(idx.length, b.length, m); idx.push(...b); } }); g.setIndex(idx); return g;
}
export const ring = n => Array.from({ length: n + 1 }, (_, j) => TAU * j / n);

// ---- fuselage: nose tip to the nozzle base. lod 0 ~150 x 48, lod 1 ~60 x 24, lod 2 ~30 x 12
// materials: 0 upper, 1 belly, 2 radome, 3 anti-glare
export const COCKPIT_OPEN = [G.Z_WS + 0.05, G.Z_CANOPY_END - 0.32];
export function fuselageSurface(lod = 0) {
  const k = [1, 2.5, 5][lod];
  const zs = stationList([[G.NOSE, -9.6, 0.03 * k], [-9.6, -7.2, 0.08 * k], [-7.2, -3.5, 0.08 * k], [-3.5, G.NOZ.z0, 0.14 * k]], lod ? [] : [G.Z_WS, G.Z_CANOPY_END - 0.3, G.Z_CANOPY_END, -9.33]);
  zs[0] += 0.002;
  const keys = stationKeys(zs, z => ({ T: fuseT(z), B: fuseB(z), W: fuseW(z), ym: fuseYm(z), nT: fuseNT(z), nB: fuseNB(z), lean: fuseLean(z), crown: fuseCrown(z) }));
  return { S: bodySurface(keys), zs };
}
const _o = {};
export function fuselageGeo(lod = 0) {
  const { S: Sf, zs } = fuselageSurface(lod), phis = ring([48, 24, 12][lod]);
  const zRadome = -9.33;   // the radome's aft joint (top view line at px' 1072)
  return gridGeo(Sf, zs, phis, (i, j) => {
    const z = zs[i], ph = phis[j], belly = Math.abs(ph - Math.PI) < 1.05;
    if (z > COCKPIT_OPEN[0] && z < COCKPIT_OPEN[1] && (ph < 1.2 || ph > TAU - 1.2)) { Sf.at(z, ph, _o); if (Math.abs(_o.x) < canopyW(z) - 0.02) return -1; }   // cockpit opening: everything inside the canopy's base
    if (z < zRadome) return 2;
    if (z < G.Z_WS && z > -8.6 && (ph < 0.5 || ph > TAU - 0.5)) return 3;
    return belly ? 1 : 0;
  });
}

// ---- canopy and windscreen: one loft over the sill, windscreen base to the aft fairing (top from the side trace,
// widths from the front view: 0.44 m at y 1.0)
export const canopyW = pl([[G.Z_WS, 0.45], [-6.4, 0.44], [-5.4, 0.43], [-4.6, 0.40], [-4.1, 0.35], [G.Z_CANOPY_END, 0.24]]);
const canopyT = z => Math.max(sill(z) + 0.02, sideTop(z));
export function canopySurface() {
  const zs = stationList([[G.Z_WS, G.Z_CANOPY_END, 0.06]], [G.Z_BOW]);
  const keys = stationKeys(zs, z => ({ T: canopyT(z), B: sill(z) - 0.06, W: canopyW(z), ym: sill(z) - 0.03, nT: pl([[G.Z_WS, 2.3], [-6.2, 2.9], [-5.0, 3.2], [G.Z_CANOPY_END, 2.6]])(z), nB: 4 }));
  return { S: bodySurface(keys), zs };
}
let _cs = null;
const canopyS = () => (_cs ||= canopySurface());
export function canopyGeo(z0, z1, { off = 0, n = 28, lod = 0 } = {}) {
  const { S: Sc } = canopyS(), zs = stationList([[z0, z1, lod ? 0.25 : 0.05]]);
  const ph = Array.from({ length: n + 1 }, (_, j) => -Math.PI / 2 + Math.PI * j / n);
  const Sx = { ...Sc, at: (z, p, o) => Sc.at(z, (p + TAU) % TAU, o), normal: (z, p, o) => Sc.normal(z, (p + TAU) % TAU, o) };
  return gridGeo(Sx, zs, ph, null, { off });
}
export function canopyHoop(z, off = 0.02, n = 16) {
  const { S: Sc } = canopyS(), o = {}, nn = {}, pts = [];
  for (let j = 0; j <= n; j++) { const p = (-Math.PI / 2 + Math.PI * j / n + TAU) % TAU; Sc.at(z, p, o); Sc.normal(z, p, nn); pts.push(new THREE.Vector3(o.x + nn.x * off, o.y + nn.y * off, o.z + nn.z * off)); }
  return pts;
}
export function canopySillPts(side, z0, z1, n = 12, off = 0.012) {
  const { S: Sc } = canopyS(), o = {}, nn = {}, pts = [];
  for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n, p = side > 0 ? Math.PI / 2 : 3 * Math.PI / 2; Sc.at(z, p, o); Sc.normal(z, p, nn); pts.push(new THREE.Vector3(o.x + nn.x * off, o.y + nn.y * off, o.z)); }
  return pts;
}

// ---- intake ducts: D-section boxes under the LEX, face at the side view's intake line (z -1.91), the boundary-layer
// splitter gap to the fuselage, fairing back into the nacelle. Outer wall at the front view's 1.21 m; bottom -0.82.
const DUCT = {
  xo: pl([[G.Z_INTAKE, 1.21], [-0.4, 1.21], [0.6, 1.06], [1.6, 0.98]]),
  xi: pl([[G.Z_INTAKE, 0.72], [-0.4, 0.70], [0.6, 0.62], [1.6, 0.62]]),
  top: pl([[G.Z_INTAKE, 0.24], [0.0, 0.20], [1.6, 0.10]]),
  bot: pl([[G.Z_INTAKE, -0.82], [-0.4, -0.84], [1.6, -0.80]]),
};
export const ductAt = z => ({ xo: DUCT.xo(z), xi: DUCT.xi(z), top: DUCT.top(z), bot: DUCT.bot(z) });
export function ductGeo(s, lod = 0) {
  const k = [1, 2.5, 5][lod], zs = stationList([[G.Z_INTAKE, 1.6, 0.12 * k]]), np = [32, 16, 10][lod], phis = ring(np);
  const P = (z, ph, o) => {
    const xo = DUCT.xo(z), xi = DUCT.xi(z), tp = DUCT.top(z), bt = DUCT.bot(z), cx = (xo + xi) / 2, a = (xo - xi) / 2, cy = (tp + bt) / 2, b = (tp - bt) / 2;
    const sn = Math.sin(ph), cs = Math.cos(ph), eX = 2 / (sn > 0 ? 4.2 : 6), eY = 2 / (cs > 0 ? 6 : 5);   // flat inner wall, rounded outer lower corner
    o.x = s * (cx + a * Math.sign(sn) * Math.abs(sn) ** eX); o.y = cy + b * Math.sign(cs) * Math.abs(cs) ** eY; o.z = z; return o;
  };
  const Sd = { at: P, normal: (z, ph, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, z0: G.Z_INTAKE, z1: 1.6 };
  const g = gridGeo(Sd, zs, phis, (i, j) => { const ph = phis[j]; return Math.abs(ph - Math.PI) < 1.2 ? 1 : 0; }, { flip: s < 0 });
  g.computeVertexNormals();
  return g;
}

// ---- LEX: the leading-edge extension from the traced top view (outer edge = the top silhouette ahead of the wing root),
// inner edge on the fuselage; it droops from y 0.45 at the body to 0.29 at its edge (front view)
export const LEX = { z0: Z_LEX, z1: -1.45, yIn: 0.40, yOut: 0.26 };
export function lexOutline(n = 40) {   // [[x, z]...] outer edge, apex to wing root
  const o = [];
  for (let i = 0; i <= n; i++) { const z = LEX.z0 + (LEX.z1 - LEX.z0) * i / n, xLE = Math.max(1.3, G.WING.le[0] + (z - G.WING.le[1]) / G.WING.leSlope + 0.12); o.push([Math.max(fuseW(z) + 0.01, Math.min(xLE, topHW(z))), z]); }   // (tucked under the wing root's leading edge)
  return o;
}

// ---- airfoil slabs: planform LE(u) / TE(u) over a span coordinate u, thickness tc(u) of chord, symmetric section;
// map(u, z, h) -> [x, y, z] (h = height off the chord plane). A closed smooth geometry with a capped root.
const naca = x => 5 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
// chordFn(u) -> chord fractions per span station (strips whose edges move along the span: a rudder hinge line)
export function airfoilGeo({ u0, u1, nu = 24, nc = 18, LE, TE, tc, map, cap0 = true, cap1 = false, chordPts = null, chordFn = null, split = false }) {
  const cs0 = chordPts || Array.from({ length: nc + 1 }, (_, i) => (1 - Math.cos(Math.PI * i / nc)) / 2);
  const pos = [], idx = [], uv = [], ring2 = [];
  const N = chordFn ? chordFn(u0).length : cs0.length, full = !chordFn && cs0[0] === 0 && cs0[N - 1] === 1;
  for (let i = 0; i <= nu; i++) {
    const u = u0 + (u1 - u0) * i / nu, zl = LE(u), zt = TE(u), c = zt - zl, t = tc(u) * c / 2, st = [], cs = chordFn ? chordFn(u) : cs0;
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
  return g;
}
// make a closed mesh face outward (flip winding if its signed volume is negative)
export function outward(g) {
  const p = g.attributes.position.array, ix = g.index.array; let vol = 0;
  for (let q = 0; q < ix.length; q += 3) { const a = ix[q] * 3, b = ix[q + 1] * 3, c = ix[q + 2] * 3; vol += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]); }
  if (vol < 0) { const a = Array.from(ix); for (let q = 0; q < a.length; q += 3) { const t = a[q + 1]; a[q + 1] = a[q + 2]; a[q + 2] = t; } const gr = g.groups.slice(); g.setIndex(a); g.clearGroups(); for (const x of gr) g.addGroup(x.start, x.count, x.materialIndex); g.computeVertexNormals(); }
  return g;
}

// ---- wing planform (top view): LE swept 25.5 deg (traced, rows x 1.9..5.6), TE nearly straight; chord plane 3.2 deg anhedral (front view: y 0.10 at x 2, -0.09 at x 5.5)
const W = G.WING;
export const wingLE = x => W.le[1] + (x - W.le[0]) * W.leSlope;
export const wingTE = x => W.te[1] + (x - W.te[0]) * W.teSlope;
export const wingY = x => W.y0 + (x - W.x0) * Math.tan(W.dihedral);
export const wingTC = x => W.tc[0] + (W.tc[1] - W.tc[0]) * Math.min(1, Math.max(0, (x - W.x0) / (W.tipX - W.x0)));
// control surface split (drawn hinge lines): LEF 17 % chord, full span; TEF inboard to x 3.65, aileron to x 5.45 (both 26 %)
export const WSPLIT = { lef: 0.17, te: 0.74, flapX: [1.25, 3.65], ailX: [3.65, 5.45], lefX: [1.45, W.tipX] };
export const hingeZ = (x, f) => wingLE(x) + f * (wingTE(x) - wingLE(x));

// ---- stabilator (top view traced): LE 51 deg, TE swept back to the rounded tip
const ST = G.STAB;
export const stabLE = x => 4.08 + (x - 2.0) * 1.25;
export const stabTE = pl([[ST.x0, 5.52], [0.88, 5.58], [1.17, 5.70], [1.44, 5.88], [1.70, 6.03], [2.0, 6.20], [2.36, 6.41], [2.9, 6.62], [3.06, 6.62], [3.14, 6.55], [ST.tip, 6.36]]);
export const stabLEr = x => x < 3.14 ? stabLE(x) : stabLE(3.14) + (x - 3.14) / (ST.tip - 3.14) * 0.5;   // rounded tip
export const stabY = x => ST.y0 - (x - ST.x0) * Math.tan(ST.anh);

// ---- fins: side-view projection traced (LE 45 deg projected), canted 20 deg out; v = projected height above the root
const F = G.FIN, FH = F.yTip - F.yRoot;
export const finLE = v => 1.13 + v * 1.0, finTE = v => 3.90 + v * 0.279;
export const finRudder = { v0: 0.06, v1: yS(1250) - F.yRoot, hinge: v => 3.37 + (v - 0.063) * (3.93 - 3.37) / (1.409 - 0.063) };
export const FIN_H = FH;
// fin point: side s, projected height v, station z, thickness offset w (normal to the fin plane)
export const finPt = (s, v, z, w = 0) => [s * (F.xRoot + v * Math.tan(F.cant) + w * Math.cos(F.cant)), F.yRoot + v - w * Math.sin(F.cant), z];

// the FSD scheme's blue chine stripe, LEX apex forward to the radome joint: a ribbon laid on the skin (side s), centre
// height yc and half-width hw tapering to a point at the front (photos: 160775 / 160777, 1979)
export function chineStripeGeo(s, n = 40) {
  const { S: Sf } = fuselageSurface(0), pos = [], idx = [], o = {}, nn = {}, z0 = -9.25, z1 = Z_LEX + 0.12;
  for (let i = 0; i <= n; i++) {
    const z = z0 + (z1 - z0) * i / n, t = i / n, yc = -0.08 + 0.46 * t, hw = 0.005 + 0.055 * Math.sqrt(t);
    for (const y of [yc - hw, yc + hw]) { const ph = Sf.yToPhi(z, y, s); Sf.at(z, ph, o); Sf.normal(z, ph, nn); pos.push(o.x + nn.x * 0.005, o.y + nn.y * 0.005, o.z + nn.z * 0.005); }
    if (i) { const a = (i - 1) * 2; s > 0 ? idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) : idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
