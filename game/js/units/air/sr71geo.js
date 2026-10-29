// SR-71A airframe geometry from the drawings (ngc/look-sr71). Every outline is the traced shape of the public-domain
// USAF three-view (af.mil "Blackbird 3-view", Wikimedia Commons File:Lockheed_SR-71A_3view.svg) scaled by the flight
// manual's dimensions (T.O. SR-71A-1, 31 Oct 1986 / change 2 1989, section I "Dimensions": length 107.4 ft, span 55.6 ft,
// height 18.5 ft), converted ONCE into the model frame here. Sources: docs/ngc1980/reference/sr71/SOURCES.md.
//
// Trace frame (sr71trace.json): X = metres aft of the pitot tip, Y = metres above the static ground, x = BL (right).
// Model frame (three.js, like every NGC-1980 aircraft): x right, y up, nose along -z, origin at the CG:
//   z = X - G.X_CG, y = Y - G.Y_CG.
// The CG (G.X_CG) is 22 % of the 12.06 m mean aerodynamic chord of the traced planform (INFERRED: the manual gives the
// c.g. range in % MAC, 17-25 %, but not the MAC position; the chord-weighted MAC leading edge of the trace is X 18.55).
//
// The shape:
//   - the centre body (nose, chines, fuselage, the inboard wing out to the nacelle centre lines, the tail cone): one
//     loft whose section is a round body (the drawing's "body line", the fuselage's widest line inboard of the chine)
//     joined to a thin chine / wing edge by a concave fillet on top and a flat underside, so the chine is a real sharp
//     edge (sections are sampled, not superellipses: an SR-71 forebody is not one);
//   - nacelles: elliptical bodies of revolution on the traced centre line (BL 4.226) with the cowl lip, the spike and
//     the ejector; outer wings: biconvex sections with the conical-camber leading-edge droop on the traced planform;
//     fins: canted 15 deg inboard (all-moving above a fixed stub), traced from the side view.
import * as THREE from 'three';
import { sampler, pl, smooth01 } from './loftkit.js';
import { SR71_TRACE } from './sr71trace.js';

export const D2R = Math.PI / 180, FT = 0.3048;
const T = SR71_TRACE;
// ---- the dimension table (findings: look-sr71.md section 3). Trace frame metres unless noted.
export const G = {
  LENGTH: 107.4 * FT,          // 32.74 m overall incl. the pitot (SR-71A-1 sec. I; NASA TM-104330 fig. 3: 107 ft 5 in)
  SPAN: 55.6 * FT,             // 16.947 m (SR-71A-1; TM-104330: 55 ft 7 in)
  HEIGHT: 18.5 * FT,           // 5.639 m to the top of the fins (SR-71A-1) - sets the static ground under the fin tips
  TREAD: 16.67 * FT,           // 5.081 m between the middle main wheels (SR-71A-1)
  S_REF: 1605 * FT * FT,       // 149.1 m2 reference wing area (SR-71A-1)
  MAC: 12.06, X_MAC: 18.55,    // traced planform (INFERRED, see above)
  X_CG: 18.55 + 0.22 * 12.06,  // 21.20
  Y_CG: 1.97,                  // the fuselage axis (body centre of the traced side view) at the CG station
  X_PITOT: 0.0, X_NOSE: 0.85,  // pitot mast tip / the radome tip (the mast is the thin part of the trace)
  X_TAIL: 107.4 * FT,
  // the nacelle's X: the drawing's side view puts it 0.5-0.6 m further aft than its top view (lip 18.85 / 18.29, exit 30.43
  // / 29.8, spike tip 17.46 / 16.97); the top view's is used (in plan the nacelle ends are 2 m steps, in profile 0.1-0.5 m)
  NAC: { bl: T.nacelle.bl, y: 2.00, tilt: 0.022, rx: 0.88, ry: 0.95, lip: 18.30, exit: 29.85, spikeTip: 16.97, spikeTravel: 26 * 0.0254, cone: 18 * D2R },
  // the side view draws the nacelle + fin group 0.55 m further aft than the top view (nacelle above; the fin's TE: side 30.86,
  // top 30.2-30.3): the fin's traced side outline moved forward by 0.55 m to sit on the top view's nacelle
  FIN: { side: T.fin.side.map(([X, Y]) => [X - 0.55, Y]), cant: T.fin.cant * D2R, rootY: 3.0, tc: 0.04, pivotFrac: 0.42 },
  WING: { yRoot: 1.60, yTip: 1.555, tcRoot: 0.030, tcTip: 0.024, droop: 0.10 },
  GEAR: { noseX: 10.6, mainX: 22.7, mainBL: 16.67 * FT / 2, wheelR: 0.43, noseR: 0.42 },   // drawing (wheel positions), manual (tread); tyre radii INFERRED
  CHUTE_X: 23.9,               // drag chute compartment doors on the spine between the nacelles (TM-104330 fig. 3)
  GROUND: 0,                   // static ground in the trace frame
};
export const toZ = X => X - G.X_CG, toY = Y => Y - G.Y_CG;

// ---- profiles from the trace (trace frame)
const sideTop = sampler(T.side, 'top', { median: 0.2 }), sideBot = sampler(T.side, 'bottom', { median: 0.2 });
const topHW = sampler(T.top, 'hw', { median: 0.15 });
const chineLine = sampler(T.lines.chine.map(([z, y]) => ({ z, y })), 'y', { median: 0.3 });
const bodyLine = sampler(T.lines.body.map(([z, x]) => ({ z, x })), 'x', { median: 0.3 });
export const PROFILE = { sideTop, sideBot, topHW, chineLine, bodyLine };

// the inboard wing leading edge: traced to X 18.7, then its own line (slope 0.53) on into the nacelle
const X_LE_KINK = 18.7, LE_SLOPE = (topHW(18.7) - topHW(17.4)) / 1.3;
// the inboard trailing edge: the traced run between the nacelle exit and the tail cone (inboard elevons)
const X_TE_IN0 = 29.45, X_TE_IN1 = 31.38;
// planform half-width of the centre body (the chine, then the inboard wing to the nacelle centre line, then the
// inboard elevons' tips, the tail cone)
export function bodyW(X) {
  if (X < X_LE_KINK) return topHW(X);
  if (X < X_TE_IN0) return Math.min(G.NAC.bl, topHW(X_LE_KINK) + LE_SLOPE * (X - X_LE_KINK));
  return Math.min(G.NAC.bl, topHW(X));
}
// the fuselage top without the canopies (spine), the canopy hump on top of it, the body's own bottom
const Z_WS = 4.95;   // windscreen base
const spine = X => X < Z_WS ? sideTop(X) : X < 9.2 ? pl([[Z_WS, sideTop(Z_WS)], [6.2, 2.62], [7.6, 2.76], [9.2, 2.80]])(X) : X < 28.4 ? pl([[9.2, 2.80], [18, 2.822], [24, 2.84], [28.4, 2.80]])(X) : pl([[28.4, 2.80], [30.5, 2.68], [31.4, 2.62], [32.0, 2.55], [32.74, 2.43]])(X);
export const canopyH = X => X < Z_WS || X > 9.3 ? 0 : Math.max(0, sideTop(X) - spine(X));
// bottom: the trace (the fuselage bottom is the side view's lowest line everywhere), smoothed through the gear wells
const belly = X => sideBot(X);
// chine / wing-edge height: the chine line forward; the inboard wing plane aft (front view: wing at the nacelle Y 1.72)
const edgeY = X => X < 17.0 ? chineLine(X) : X < 20.5 ? 1.664 + (1.60 - 1.664) * smooth01(17, 20.5, X) : X < X_TE_IN0 ? 1.60 : pl([[X_TE_IN0, 1.60], [X_TE_IN1, 1.76], [31.6, 2.12], [32.74, 2.30]])(X);
// body half-width (round fuselage): the drawing's body line; forward of X 3 a share of the chine width; tail cone = W
const bodyR = X => X < 3.0 ? 0.42 * topHW(X) : X < 31.38 ? Math.min(bodyLine(X), Math.max(0.05, bodyW(X))) : bodyW(X);

// ---- the centre body section at X: { W, yc, yb, rb, up, lo, ... } and its heights hUp(x), hLo(x)
// upper: smooth max of the body superellipse and the chine ramp (concave fillet); lower: smooth min of the body bottom
// and a nearly flat chine underside. Smooth max/min by a soft blend of width k (m).
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const smin = (a, b, k) => -smax(-a, -b, k);
export function section(X, o = {}) {
  const W = Math.max(0.004, bodyW(X)), yc = edgeY(X), T0 = spine(X), B = belly(X);
  const rb = Math.max(0.004, Math.min(W * 0.995, bodyR(X)));
  const tail = X > X_TE_IN1;
  // the body's centre and half-heights: the round fuselage between the spine and the belly
  const yb = tail ? yc : (T0 + B) / 2, hT = Math.max(0.003, T0 - yb), hB = Math.max(0.003, yb - B);
  // the chine ramp: from the edge (W, yc) up to the body side, concave (p > 1); it meets the body a little above its
  // widest line so the fillet reads as the SR-71's swept-up chine shoulder. Over the wing it is the wing's upper surface.
  const wing = smooth01(16.5, 19.5, X) * (1 - smooth01(30.6, 31.4, X));
  const up = { p: 1.7 + 0.35 * wing, H: Math.max(0.002, (yb + hT * (0.18 - 0.16 * wing)) - yc) };
  // underside: nearly flat under the forebody chines; over the wing it falls away across the whole inboard span to the
  // belly (the front view's broad lower curve)
  const lo = { p: 2.4 - 0.85 * wing, H: Math.max(0.002, (yc - (B + hB * 0.15)) * (0.55 + 0.45 * wing)) };
  Object.assign(o, { X, W, yc, yb, rb, hT, hB, T: T0, B, up, lo, tail, can: canopyH(X) });
  return o;
}
const SE_N = 2.2;   // body superellipse exponent (2 = circle; a touch fuller at the shoulders, as the photos)
export function hUp(s, x) {
  const ax = Math.min(Math.abs(x), s.W), u = s.tail ? Math.min(1, ax / s.rb) : ax / s.rb;
  const body = u <= 1 ? s.yb + s.hT * (1 - u ** SE_N) ** (1 / SE_N) : -1e3;
  const ramp = s.yc + s.up.H * Math.max(0, (s.W - ax) / s.W) ** s.up.p;
  let h = s.tail ? body : smax(body, ramp, 0.12 * Math.min(1, s.rb));
  if (s.can > 0) { const w = 0.56, q = ax / w; if (q < 1) h += s.can * (1 - q * q) ** 0.6; }   // the two canopies on the spine
  return h;
}
export function hLo(s, x) {
  const ax = Math.min(Math.abs(x), s.W), u = s.tail ? Math.min(1, ax / s.rb) : ax / s.rb;
  const body = u <= 1 ? s.yb - s.hB * (1 - u ** SE_N) ** (1 / SE_N) : 1e3;
  const ramp = s.yc - s.lo.H * Math.max(0, (s.W - ax) / s.W) ** s.lo.p;
  return s.tail ? body : smin(body, ramp, 0.10 * Math.min(1, s.rb));
}

// ---- stations: dense at the nose, the windscreen, the wing junction, the trailing edges and the tail
export const BODY_X = (() => {
  const s = new Set(), add = (a, b, st) => { const n = Math.max(1, Math.round((b - a) / st)); for (let i = 0; i <= n; i++) s.add(+(a + (b - a) * i / n).toFixed(4)); };
  add(G.X_NOSE, 3.0, 0.06); add(3.0, 4.9, 0.12); add(4.9, 9.4, 0.08); add(9.4, 16.4, 0.35); add(16.4, 19.5, 0.12); add(19.5, 29.2, 0.4);
  add(29.2, 31.6, 0.05); add(31.6, G.X_TAIL - 0.02, 0.12);
  return [...s].sort((a, b) => a - b);
})();
const NU = 56;   // samples across each surface (cosine spacing: dense at the chine edges)
export const uAt = j => (1 - Math.cos(Math.PI * j / NU)) / 2;   // 0..1 across, -W .. +W

// keep(X, x, top) -> false to cut a hole (the inboard elevons are their own meshes, the canopy glass a group)
export function bodyGeometry({ keep = null, glassAt = null, xs = BODY_X, nu = NU } = {}) {
  const uAt = j => (1 - Math.cos(Math.PI * j / nu)) / 2, BODY_X = xs;
  const S = {}, pos = [], nor = [], uv = [], idx = [], grp = [];
  const P = (X, x, top, o) => { section(X, S); o.x = x; o.y = top ? hUp(S, x) : hLo(S, x); o.z = X; return o; };
  const A = {}, Bq = {}, C = {}, Dq = {}, N = {}, Q = {};
  const nrm = (X, x, top) => {   // analytic normal by central differences on the surface (x, h(X, x))
    const e = 2e-3, eX = X < 3 ? 0.03 : 0.12; P(X, x - e, top, A); P(X, x + e, top, Bq); P(Math.max(G.X_NOSE, X - eX), x * (section(Math.max(G.X_NOSE, X - eX), S).W / section(X, S).W), top, C); P(Math.min(G.X_TAIL, X + eX), x * (section(Math.min(G.X_TAIL, X + eX), S).W / section(X, S).W), top, Dq);
    const ax = Bq.x - A.x, ay = Bq.y - A.y, bz = Dq.z - C.z, by = Dq.y - C.y;
    // tangent t1 = (ax, ay, 0), t2 = (0, by, bz): n = t2 x t1 (up for the top surface)
    let nx = by * 0 - bz * ay, ny = bz * ax - 0 * 0, nz = 0 * ay - by * ax; if (!top) { nx = -nx; ny = -ny; nz = -nz; }
    const L = Math.hypot(nx, ny, nz) || 1; N.x = nx / L; N.y = ny / L; N.z = nz / L; return N;
  };
  const rows = BODY_X.length, cols = nu + 1;
  for (const top of [true, false]) {
    const base = pos.length / 3;
    for (let i = 0; i < rows; i++) {
      const X = BODY_X[i]; section(X, S); const W = S.W;
      let acc = 0, last = null;
      for (let j = 0; j < cols; j++) {
        const x = -W + 2 * W * uAt(j); P(X, x, top, Q); const n = nrm(X, x, top);
        pos.push(Q.x, toY(Q.y), toZ(Q.z)); nor.push(n.x, n.y, n.z);
        if (last) acc += Math.hypot(Q.x - last[0], Q.y - last[1]); last = [Q.x, Q.y];
        uv.push(X, (top ? 1 : -1) * (acc - 0)); // u along the body (m), v around the section from the left edge (m): arc length
      }
    }
    const start = idx.length;
    const gl = [], sk = [];
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const Xm = (BODY_X[i] + BODY_X[i + 1]) / 2; section(Xm, S); const xm = -S.W + 2 * S.W * (uAt(j) + uAt(j + 1)) / 2;
      if (keep && !keep(Xm, xm, top)) continue;
      const a = base + i * cols + j, b = a + 1, d = a + cols, c = d + 1;
      const tri = top ? [a, d, b, b, d, c] : [a, b, d, b, c, d];
      (glassAt && top && glassAt(Xm, xm, hUp(S, xm)) ? gl : sk).push(...tri);
    }
    grp.push([start, sk.length, 0]); idx.push(...sk);
    if (gl.length) { grp.push([idx.length, gl.length, 1]); idx.push(...gl); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); for (const [s, n, m] of grp) if (n) g.addGroup(s, n, m);
  return g;
}
// a patch of the centre body surface over [X0, X1] x [x0, x1] (the inboard elevons): same heights as the body
export function bodyPatch(X0, X1, x0, x1, nX = 10, nx = 10) {
  const S = {}, pos = [], idx = [];
  for (const top of [true, false]) {
    const base = pos.length / 3;
    for (let i = 0; i <= nX; i++) for (let j = 0; j <= nx; j++) {
      const X = X0 + (X1 - X0) * i / nX; section(X, S); const xr = x0 + (x1 - x0) * j / nx, x = Math.sign(xr) * Math.min(S.W, Math.abs(xr));
      pos.push(x, toY(top ? hUp(S, x) : hLo(S, x)), toZ(X));
    }
    for (let i = 0; i < nX; i++) for (let j = 0; j < nx; j++) { const a = base + i * (nx + 1) + j, b = a + 1, d = a + nx + 1, c = d + 1; idx.push(...(top ? [a, d, b, b, d, c] : [a, b, d, b, c, d])); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// ---- nacelle: elliptical body of revolution on (BL, NAC.y); radius schedule along X (trace frame)
const NR = pl([[G.NAC.lip, 0.80], [G.NAC.lip + 0.35, 0.855], [19.6, 0.88], [28.0, 0.88], [29.0, 0.86], [G.NAC.exit, 0.835]]);
export const nacR = X => NR(X);
// the nacelle axis rises aft (side view: bottom 1.03 at X 20 -> 1.29 at X 29, top 2.99 -> 3.17; front view centre 1.95-2.0)
export const nacY = X => G.NAC.y + G.NAC.tilt * (X - 20);
// outer skin from the cowl lip to the ejector exit, plus the lip's inner turn and a short dark inlet duct
export function nacelleGeometry(side, nTheta = 40) {
  const N = G.NAC, xs = []; for (let X = N.lip; X <= N.exit + 1e-6; X += (X < N.lip + 1 || X > 28 ? 0.1 : 0.5)) xs.push(Math.min(X, N.exit));
  if (xs[xs.length - 1] < N.exit) xs.push(N.exit);
  const pos = [], nor = [], idx = [], cols = nTheta + 1;
  for (const X of xs) {
    const r = nacR(X), dr = (nacR(X + 0.01) - nacR(X - 0.01)) / 0.02;
    for (let j = 0; j < cols; j++) {
      const t = (j / nTheta) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      pos.push(side * N.bl + N.rx / 0.88 * r * s, toY(nacY(X) + N.ry / 0.88 * r * c), toZ(X));
      const nx = s / N.rx, ny = c / N.ry, L = Math.hypot(nx, ny, dr); nor.push(nx / L, ny / L, -dr / L);
    }
  }
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < nTheta; j++) { const a = i * cols + j, b = a + 1, d = a + cols, c = d + 1; idx.push(a, d, b, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
}
// the spike, in its own frame (tip at the origin, axis +z aft): the 18 deg cone, the bleed band, the centre body
// widening to the throat inside the cowl and the support aft
export function spikeGeometry(seg = 32) {
  const tc = Math.tan(G.NAC.cone), prof = [[0, 0], [0.9, 0.9 * tc], [1.35, 0.9 * tc + 0.45 * 0.2], [2.1, 0.58], [2.9, 0.62], [3.6, 0.55], [4.4, 0.40]];
  return new THREE.LatheGeometry(prof.map(([z, r]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);   // lathe y -> +z
}

// ---- outer wing: span stations from the nacelle centre to the tip; LE / TE per span from the traced planform
// (the trace's half-width per column inverted: the leading and trailing edge X at each span)
const PLAN = (() => { const W = T.wing.filter(w => w[0] >= G.NAC.bl); const out = []; let last = -1; for (const w of W) if (w[0] - last >= 0.04) { out.push(w); last = w[0]; } return out; })();
export const WING_TIP = PLAN[PLAN.length - 1][0];
const LEp = pl(PLAN.map(p => [p[0], p[1]]));
// inside the nacelle's width the traced 'leading edge' is the spike and cowl: the wing starts behind the lip there
export const wingLE = x => x < G.NAC.bl + 0.95 ? Math.max(LEp(x), G.NAC.lip + 0.4) : LEp(x), wingTE = x => pl(PLAN.map(p => [p[0], p[2]]))(x);
export const wingY = x => G.WING.yRoot + (G.WING.yTip - G.WING.yRoot) * smooth01(G.NAC.bl, WING_TIP, x);
// a biconvex section with the conical-camber droop of the outer leading edge; xi 0 = LE .. 1 = TE
/** @returns {number[]} */
export function wingPt(x, xi, top) {
  const le = wingLE(x), te = wingTE(x), c = te - le, sp = smooth01(G.NAC.bl + 0.8, WING_TIP, x);
  const t = c * (G.WING.tcRoot + (G.WING.tcTip - G.WING.tcRoot) * sp);
  const half = 2 * t * xi * (1 - xi);   // biconvex: max t/2 at mid chord
  const droop = -G.WING.droop * sp * Math.max(0, 1 - xi / 0.35) ** 2 * Math.min(1, c / 3);
  return [x, wingY(x) + droop + (top ? half : -half), le + c * xi];
}
// grid over the outer wing [xi0, xi1] chordwise, [x0, x1] spanwise, one side (sign), both surfaces
export function wingGeometry(side, xi0 = 0, xi1 = 1, x0 = G.NAC.bl, x1 = WING_TIP, nS = 34, nC = 18) {
  const pos = [], idx = [];
  const xsAt = i => { const t = i / nS; return x0 + (x1 - x0) * (1 - (1 - t) ** 1.6); };   // denser toward the tip
  for (const top of [true, false]) {
    const base = pos.length / 3;
    for (let i = 0; i <= nS; i++) for (let j = 0; j <= nC; j++) {
      const xi = xi0 + (xi1 - xi0) * (1 - Math.cos(Math.PI * j / nC)) / 2, [x, y, X] = wingPt(xsAt(i), xi, top);
      pos.push(side * x, toY(y), toZ(X));
    }
    for (let i = 0; i < nS; i++) for (let j = 0; j < nC; j++) { const a = base + i * (nC + 1) + j, b = a + 1, d = a + nC + 1, c = d + 1; idx.push(...((top ? 1 : -1) * side > 0 ? [a, b, d, b, c, d] : [a, d, b, b, d, c])); }
  }
  // close the tip
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// ---- fins: the traced side projection (root at the nacelle top, Y 3.0), canted 15 deg inboard. In fin coordinates
// (a = X along the root, h = height along the canted span) -> model; h = (Y - rootY) / cos(cant)
export const FIN = (() => {
  const s = G.FIN.side, c = Math.cos(G.FIN.cant);
  const [rLE, tLE, tTE, rTE] = s.map(([X, Y]) => [X, (Y - G.FIN.rootY) / c]);
  return { rLE, tLE, tTE, rTE, span: (tLE[1] + tTE[1]) / 2, root: rTE[0] - rLE[0], tip: tTE[0] - tLE[0], pivotX: rLE[0] + G.FIN.pivotFrac * (rTE[0] - rLE[0]) };
})();
// fin point at chordwise xi, span eta (0 root .. 1 tip), side +-1 (the fin over each nacelle), thickness offset w
export function finPt(side, xi, eta, w = 0) {
  const le = FIN.rLE[0] + (FIN.tLE[0] - FIN.rLE[0]) * eta, te = FIN.rTE[0] + (FIN.tTE[0] - FIN.rTE[0]) * eta, h = FIN.span * eta;
  const X = le + (te - le) * xi;
  // canted inboard: the span direction leans toward the centre line
  const c = Math.cos(G.FIN.cant), s = Math.sin(G.FIN.cant), bl = side * (G.NAC.bl - h * s), Y = G.FIN.rootY + h * c;
  return [bl + side * w * c, Y + w * s, X];
}
export function finGeometry(side, nC = 14, nS = 10) {
  const pos = [], idx = [];
  for (const sgn of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= nS; i++) for (let j = 0; j <= nC; j++) {
      const eta = i / nS, xi = (1 - Math.cos(Math.PI * j / nC)) / 2, le = FIN.rLE[0] + (FIN.tLE[0] - FIN.rLE[0]) * eta, te = FIN.rTE[0] + (FIN.tTE[0] - FIN.rTE[0]) * eta;
      const t = G.FIN.tc * (te - le), w = sgn * 2 * t * xi * (1 - xi);
      const [x, Y, X] = finPt(side, xi, eta, w); pos.push(x, toY(Y), toZ(X));
    }
    for (let i = 0; i < nS; i++) for (let j = 0; j < nC; j++) { const a = base + i * (nC + 1) + j, b = a + 1, d = a + nC + 1, c = d + 1; idx.push(...(sgn * side > 0 ? [a, d, b, b, d, c] : [a, b, d, b, c, d])); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}

// elevon split lines (INFERRED from photos: the outer elevons run from the nacelle to near the tip at ~22 % chord, the
// inboard elevons between the body and the nacelle along the inboard trailing edge)
export const ELEVON = { outXi: 0.80, outX0: G.NAC.bl + 0.9, outX1: 7.7, inX0: 1.05, inX1: 3.2, inHinge: 29.95 };
