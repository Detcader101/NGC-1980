// loft.mjs: turn a traced three-view into a smooth lofted surface. Engine-agnostic: no three.js; it returns typed
// arrays you can wrap in any engine's geometry.
// Distilled from NGC-1980's UH-1H (game/js/stationtable.js + hueygeo.js on ngc/look-huey).
//
//   import { sampler, frontSampler, stationList, stationKeys, bodySurface, gridArrays } from './loft.mjs';
//   const T = sampler(trace.side, 'top'), B = sampler(trace.side, 'bottom'), W = sampler(trace.top, 'hw');
//   const zs = stationList([[-3.7, -2.0, 0.025], [-2.0, 2.6, 0.1], [2.6, 8.9, 0.15]], [doorEdgeZ, frameZ]);
//   const keys = stationKeys(zs, z => ({ T: T(z), B: B(z), W: W(z), ym: <widest-line y>, nT: 4, nB: 6, lean: 0.06, crown: 0.04 }));
//   const S = bodySurface(keys);
//   const { position, normal, uv, index } = gridArrays(S, zs, phis);   // phis: 0..2PI around (0 = top, PI/2 = +x side)
//
// Frame: x right, y up, z along the body (any sign convention, as long as z ascends through the keys).

export const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- profile samplers ------------------------------------------------------------------------------------------
// samples [{ z, [key] }], z ascending (one per drawing column). A running median over `median` metres rejects
// single-column noise; null samples (masked protrusions) are bridged linearly; the ends are held.
export function sampler(cols, key, { median = 0.1, override = null } = {}) {
  const zs = [], vs = [];
  for (const c of cols) if (c[key] != null) { zs.push(c.z); vs.push(c[key]); }
  if (!zs.length) return () => null;
  const sm = vs.slice();
  if (median > 0) {
    let j0 = 0, j1 = 0;
    for (let i = 0; i < zs.length; i++) {
      while (zs[j0] < zs[i] - median / 2) j0++;
      while (j1 + 1 < zs.length && zs[j1 + 1] <= zs[i] + median / 2) j1++;
      const w = vs.slice(j0, j1 + 1).sort((a, b) => a - b); sm[i] = w[w.length >> 1];
    }
  }
  return z => {
    if (override) { const o = override(z); if (o != null) return o; }
    if (z <= zs[0]) return sm[0]; if (z >= zs[zs.length - 1]) return sm[sm.length - 1];
    let a = 0, b = zs.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (zs[m] <= z) a = m; else b = m; }
    const t = (z - zs[a]) / (zs[b] - zs[a] || 1); return sm[a] + (sm[b] - sm[a]) * t;
  };
}
// a front view's rows [{ y, left, right }] -> half-width w(y): the mean of both sides, median-smoothed
export function frontSampler(rows, opts) {
  return sampler(rows.map(r => ({ z: r.y, w: r.left != null && r.right != null ? (r.left + r.right) / 2 : null })).sort((a, b) => a.z - b.z), 'w', opts);
}
// piecewise-linear through [[z, v]...], for hand-set parameters (exponents, lean) per station range
export const pl = pts => z => {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, v0] = pts[i - 1], [z1, v1] = pts[i]; return v0 + (v1 - v0) * (z - z0) / (z1 - z0); }
  return pts[pts.length - 1][1];
};
export const smooth01 = (a, b, z) => { const t = clamp((z - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- stations ------------------------------------------------------------------------------------------------
// ranges [[z0, z1, step]...]: dense where the curvature changes (nose, windscreen, boom root: 2-3.5 cm), coarser on
// constant sections (10-15 cm). `extra` adds stops exactly on features (door edges, frame lines, steps).
export function stationList(ranges, extra = []) {
  const s = new Set();
  for (const [a, b, st] of ranges) { const n = Math.max(1, Math.round((b - a) / st)); for (let i = 0; i <= n; i++) s.add(+(a + (b - a) * i / n).toFixed(5)); }
  for (const e of extra) s.add(+e.toFixed(5));
  return [...s].sort((p, q) => p - q);
}
// keys [z, T, B, W, ym, nT, nB, lean, crown] per station, from at(z) -> { T, B, W, ym, nT, nB, lean?, crown? }
//   T / B: top and bottom heights (side view); W: half-width (top view); ym: the height of the widest line;
//   nT / nB: superellipse exponents of the upper / lower half (2 = ellipse, ~9 = near-rectangle), from the front view;
//   lean: tumblehome, so the side leans in by lean x W at the top; crown: the roof shoulders drop by this much.
export function stationKeys(zs, at) {
  return zs.map(z => { const p = at(z); return [z, p.T, p.B, p.W, p.ym, p.nT, p.nB, p.lean || 0, p.crown || 0]; });
}

// ---- monotone cubic tracks -----------------------------------------------------------------------------------
// keys [[z, v1, v2, ...]] -> f(z, out). Every column is interpolated by a Fritsch-Carlson monotone cubic: smooth, with
// no overshoot, so a constant cabin section stays exactly constant between its stations.
export function track(keys) {
  const n = keys.length, m = keys[0].length - 1, zs = keys.map(k => k[0]), tang = [];
  for (let c = 1; c <= m; c++) {
    const y = keys.map(k => k[c]), d = [], t = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (zs[i + 1] - zs[i]));
    t[0] = d[0]; t[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / d[i], b = t[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * d[i]; t[i + 1] = k * b * d[i]; }
    }
    tang.push(t);
  }
  return (z, out = []) => {
    let i = 0;
    if (z >= zs[n - 1]) i = n - 2; else while (i < n - 2 && zs[i + 1] < z) i++;
    const h = zs[i + 1] - zs[i], s = clamp((z - zs[i]) / h, 0, 1), s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    for (let c = 0; c < m; c++) out[c] = h00 * keys[i][c + 1] + h10 * h * tang[c][i] + h01 * keys[i + 1][c + 1] + h11 * h * tang[c][i + 1];
    return out;
  };
}

// ---- cross-section -----------------------------------------------------------------------------------------------
// Superellipse halves joined at the widest line ym. phi 0 = top centre, PI/2 = +x side, PI = keel, 3PI/2 = -x side.
export function secPt(T, B, W, ym, nT, nB, phi, o, lean = 0, crown = 0) {
  const s = Math.sin(phi), c = Math.cos(phi), up = c >= 0, e = 2 / (up ? nT : nB);
  o.x = W * Math.sign(s) * Math.abs(s) ** e;
  o.y = up ? ym + (T - ym) * c ** e : ym - (ym - B) * (-c) ** e;
  if (lean && up && T > ym) o.x *= 1 - lean * (o.y - ym) / (T - ym);
  if (crown && up && W > 0) { const q = Math.min(1, Math.abs(o.x / W) / 0.6); o.y -= crown * q * q * c * c; }
  return o;
}

// ---- the surface ------------------------------------------------------------------------------------------------
// keys -> { at(z, phi, o), normal(z, phi, o), params(z), z0, z1, yToPhi(z, y, side), xToPhi(z, x, top, side) }
// Normals come from the analytic surface (central differences), not from facets, so shading is smooth at any density.
export function bodySurface(keys) {
  const tr = track(keys), p = [], z0 = keys[0][0], z1 = keys[keys.length - 1][0];
  const at = (z, phi, o = {}) => {
    tr(z, p);
    secPt(p[0], p[1], Math.max(0, p[2]), p[3], Math.max(2, p[4]), Math.max(2, p[5]), phi, o, Math.max(0, p[6] || 0), Math.max(0, p[7] || 0));
    o.z = z; return o;
  };
  const A = {}, Bq = {}, C = {}, D = {};
  const normal = (z, phi, o = {}) => {
    const e = 1e-3, ez = 2e-3;
    at(z, phi - e, A); at(z, phi + e, Bq); at(Math.max(z0, z - ez), phi, C); at(Math.min(z1, z + ez), phi, D);
    const px = Bq.x - A.x, py = Bq.y - A.y, pz = Bq.z - A.z, zx = D.x - C.x, zy = D.y - C.y, zz = D.z - C.z;
    let nx = zy * pz - zz * py, ny = zz * px - zx * pz, nz = zx * py - zy * px; const L = Math.hypot(nx, ny, nz);
    if (L < 1e-10) { o.x = 0; o.y = 0; o.z = z < (z0 + z1) / 2 ? -1 : 1; return o; }
    o.x = nx / L; o.y = ny / L; o.z = nz / L; return o;
  };
  // the phi on one side (+1 = +x, -1 = -x) where the section reaches height y: place window sills, door edges, strakes
  const yToPhi = (z, y, side = 1) => {
    let a = 0, b = Math.PI; const o = {};
    for (let k = 0; k < 40; k++) { const m = (a + b) / 2; at(z, m, o); if (o.y > y) a = m; else b = m; }
    const m = (a + b) / 2; return side > 0 ? m : TAU - m;
  };
  const xToPhi = (z, x, top = true, side = 1) => {
    let a = top ? 0 : Math.PI / 2, b = top ? Math.PI / 2 : Math.PI; const o = {};
    for (let k = 0; k < 40; k++) { const m = (a + b) / 2; at(z, m, o); if ((o.x < Math.abs(x)) === top) a = m; else b = m; }
    const m = (a + b) / 2; return side > 0 ? m : TAU - m;
  };
  return { at, normal, params: z => tr(z, []), z0, z1, yToPhi, xToPhi };
}

// grid over a surface -> { position, normal, uv, index }. off: offset along the normal (paint layers, inner skins);
// keep(i, j): drop quads to cut openings (windows, doors) into the skin instead of stacking boxes on top of it.
// uv: 'arc' (recommended: arc-length metres, constant texel density, markings read correctly on both sides),
// a function (z, phi) -> [u, v], or omitted (z / length, phi / TAU: uneven density, only for quick tests).
export function gridArrays(S, zs, phis, { off = 0, keep = null, uv = null, flip = false, mirrorLeft = true } = {}) {
  const nz = zs.length, np = phis.length, position = new Float32Array(nz * np * 3), normal = new Float32Array(nz * np * 3), uvs = new Float32Array(nz * np * 2);
  const P = {}, N = {};
  for (let i = 0; i < nz; i++) for (let j = 0; j < np; j++) {
    const k = i * np + j; S.at(zs[i], phis[j], P); S.normal(zs[i], phis[j], N);
    position[k * 3] = P.x + N.x * off; position[k * 3 + 1] = P.y + N.y * off; position[k * 3 + 2] = P.z + N.z * off;
    normal[k * 3] = N.x; normal[k * 3 + 1] = N.y; normal[k * 3 + 2] = N.z;
    const t = typeof uv === 'function' ? uv(zs[i], phis[j]) : [(zs[i] - S.z0) / (S.z1 - S.z0), phis[j] / TAU];
    uvs[k * 2] = t[0]; uvs[k * 2 + 1] = t[1];
  }
  if (uv === 'arc') {
    // arc-length UVs in metres (multiply by your texel density in the material): u along the body at each phi, v
    // around each section. Constant texel density everywhere: no squash at the nose and boom, no stretch on the cabin.
    // v runs from the top centre line down each side (both sides alike); u runs along the body and is negated on the
    // -x side (mirrorLeft, default true), because seen from outside the body runs the other way there. Whether text
    // then reads correctly depends on your frame and texture orientation: ALWAYS verify every marking from outside on
    // both sides (a marking check scene), and flip mirrorLeft if the left side reads backwards. The seams sit on the
    // top and keel centre lines.
    const P = (i, j) => [position[(i * np + j) * 3], position[(i * np + j) * 3 + 1], position[(i * np + j) * 3 + 2]];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (let j = 0; j < np; j++) { let u = 0; for (let i = 0; i < nz; i++) { if (i) u += dist(P(i, j), P(i - 1, j)); uvs[(i * np + j) * 2] = u; } }
    for (let i = 0; i < nz; i++) {
      const acc = [0]; for (let j = 1; j < np; j++) acc.push(acc[j - 1] + dist(P(i, j), P(i, j - 1)));
      const total = acc[np - 1];
      for (let j = 0; j < np; j++) {
        const ph = ((phis[j] % TAU) + TAU) % TAU, left = ph > Math.PI + 1e-6 || (j === np - 1 && np > 1);
        // distance from the top centre line, down whichever side this vertex is on (phis span 0..TAU, top at both ends)
        uvs[(i * np + j) * 2 + 1] = left ? total - acc[j] : acc[j];
        if (left && mirrorLeft) uvs[(i * np + j) * 2] = -uvs[(i * np + j) * 2];
      }
    }
  }
  const index = [];
  for (let i = 0; i < nz - 1; i++) for (let j = 0; j < np - 1; j++) {
    if (keep && !keep(i, j)) continue;
    const a = i * np + j, b = a + 1, d = a + np, c = d + 1;
    if (flip) index.push(a, b, d, b, c, d); else index.push(a, d, b, b, d, c);
  }
  return { position, normal, uv: uvs, index };
}
