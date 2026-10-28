// hueygeo.js - geometry and texture kit for the hi-fi UH-1H (hueyhifi.js): smooth lofted surfaces from cross-section
// tables, analytic normals, UVs, curves on those surfaces (marching squares on a signed-distance field), sweeps along
// them, airfoil lofts, rounded boxes, merging, and baked generated textures (paint, wear, markings, bump, roughness)
// computed per texel from the 3D surface point. No image assets, no third-party geometry.
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------------------------- monotone cubic tracks
// keys [[z, v1, v2, ...]] -> f(z, out) with every column interpolated by a Fritsch-Carlson monotone cubic (no overshoot,
// so a constant cabin section stays exactly constant between its stations)
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

// ------------------------------------------------------------------------------------- body of revolution-ish
// cross section: superellipse halves joined at the widest line ym. phi 0 = top centre, PI/2 = right side (+x), PI = keel,
// 3PI/2 = left. Upper half exponent nT, lower nB (2 = ellipse, 9 = near-rectangle with a small corner radius).
// lean (optional, >= 0): tumblehome of the upper half, the side leans in by lean x W at the top (front view of a cabin)
// crown (optional): the roof's centre stands crown higher than a plain superellipse puts its shoulders (front views of
// cabins are crowned: the corners drop, the top centre stays at T)
export function secPt(T, B, W, ym, nT, nB, phi, o, lean = 0, crown = 0) {
  const s = Math.sin(phi), c = Math.cos(phi), up = c >= 0, e = 2 / (up ? nT : nB);
  o.x = W * Math.sign(s) * Math.abs(s) ** e;
  o.y = up ? ym + (T - ym) * c ** e : ym - (ym - B) * (-c) ** e;
  if (lean && up && T > ym) o.x *= 1 - lean * (o.y - ym) / (T - ym);
  if (crown && up && W > 0) { const q = Math.min(1, Math.abs(o.x / W) / 0.6); o.y -= crown * q * q * c * c; }   // full drop from 60 % of the half-width out
  return o;
}
// keys [z, T, B, W, ym, nT, nB, lean?, crown?] -> surface { at(z, phi, o), normal(z, phi, o), params(z), z0, z1, yToPhi(z, y, side) }
export function bodySurface(keys) {
  const tr = track(keys), p = [], z0 = keys[0][0], z1 = keys[keys.length - 1][0];
  const at = (z, phi, o = {}) => { tr(z, p); secPt(p[0], p[1], Math.max(0, p[2]), p[3], Math.max(2, p[4]), Math.max(2, p[5]), phi, o, p.length > 6 ? Math.max(0, p[6]) : 0, p.length > 7 ? Math.max(0, p[7]) : 0); o.z = z; return o; };
  const A = {}, Bq = {}, C = {}, D = {};
  const normal = (z, phi, o = {}) => {
    const e = 1e-3, ez = 2e-3;
    at(z, phi - e, A); at(z, phi + e, Bq); at(Math.max(z0, z - ez), phi, C); at(Math.min(z1, z + ez), phi, D);
    const px = Bq.x - A.x, py = Bq.y - A.y, pz = Bq.z - A.z, zx = D.x - C.x, zy = D.y - C.y, zz = D.z - C.z;
    let nx = zy * pz - zz * py, ny = zz * px - zx * pz, nz = zx * py - zy * px; const L = Math.hypot(nx, ny, nz);
    if (L < 1e-10) { o.x = 0; o.y = 0; o.z = z < (z0 + z1) / 2 ? -1 : 1; return o; }
    o.x = nx / L; o.y = ny / L; o.z = nz / L; return o;
  };
  // the phi on one side (+1 right / -1 left) where the section reaches height y (y falls monotonically top -> keel)
  const yToPhi = (z, y, side = 1) => {
    let a = 0, b = Math.PI; const o = {};
    for (let k = 0; k < 40; k++) { const m = (a + b) / 2; at(z, m, o); if (o.y > y) a = m; else b = m; }
    const m = (a + b) / 2; return side > 0 ? m : TAU - m;
  };
  // the phi on the upper (top = true) or lower half of one side where the section reaches |x|
  const xToPhi = (z, x, top = true, side = 1) => {
    let a = top ? 0 : Math.PI / 2, b = top ? Math.PI / 2 : Math.PI; const o = {};
    for (let k = 0; k < 40; k++) { const m = (a + b) / 2; at(z, m, o); if ((o.x < Math.abs(x)) === top) a = m; else b = m; }
    const m = (a + b) / 2; return side > 0 ? m : TAU - m;
  };
  return { at, normal, params: z => tr(z, []), z0, z1, yToPhi, xToPhi };
}

// grid mesh over a surface: zs (stations), phis (around), off = offset along the normal, keep(i, j) per quad,
// uv(z, phi) -> [u, v] (default: z over the surface length, phi / TAU)
export function gridGeo(S, zs, phis, { off = 0, keep = null, uv = null, flip = false } = {}) {
  const nz = zs.length, np = phis.length, pos = new Float32Array(nz * np * 3), nor = new Float32Array(nz * np * 3), uvs = new Float32Array(nz * np * 2);
  const P = {}, N = {};
  for (let i = 0; i < nz; i++) for (let j = 0; j < np; j++) {
    const k = i * np + j; S.at(zs[i], phis[j], P); S.normal(zs[i], phis[j], N);
    pos[k * 3] = P.x + N.x * off; pos[k * 3 + 1] = P.y + N.y * off; pos[k * 3 + 2] = P.z + N.z * off;
    nor[k * 3] = N.x; nor[k * 3 + 1] = N.y; nor[k * 3 + 2] = N.z;
    const t = uv ? uv(zs[i], phis[j]) : [(zs[i] - S.z0) / (S.z1 - S.z0), phis[j] / TAU];
    uvs[k * 2] = t[0]; uvs[k * 2 + 1] = t[1];
  }
  const idx = [];
  for (let i = 0; i < nz - 1; i++) for (let j = 0; j < np - 1; j++) {
    if (keep && !keep(i, j)) continue;
    const a = i * np + j, b = a + 1, d = a + np, c = d + 1;
    if (flip) idx.push(a, b, d, b, c, d); else idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx); return g;
}
// evenly spaced values, optionally with extra stops merged in
export function steps(a, b, n, extra = []) {
  const s = new Set(); for (let i = 0; i <= n; i++) s.add(+(a + (b - a) * i / n).toFixed(5));
  for (const e of extra) if (e > a && e < b) s.add(+e.toFixed(5));
  return [...s].sort((p, q) => p - q);
}
// stations along z with a different spacing per range: [[z0, z1, step]...]
export function stations(ranges, extra = []) {
  const out = new Set();
  for (const [a, b, st] of ranges) { const n = Math.max(1, Math.round((b - a) / st)); for (let i = 0; i <= n; i++) out.add(+(a + (b - a) * i / n).toFixed(5)); }
  for (const e of extra) out.add(+e.toFixed(5));
  return [...out].sort((p, q) => p - q);
}

// ------------------------------------------------------------------------------------- curves on a surface
// marching squares on f(z, phi) (a signed distance in metres) over a (z, phi) box -> polylines of [z, phi]
export function contours(f, z0, z1, p0, p1, nz, np) {
  const W = np + 1, V = new Float32Array((nz + 1) * W), Z = i => z0 + (z1 - z0) * i / nz, Pp = j => p0 + (p1 - p0) * j / np;
  for (let i = 0; i <= nz; i++) for (let j = 0; j <= np; j++) V[i * W + j] = f(Z(i), Pp(j));
  const pt = new Map(), adj = new Map();
  const edgePt = (key, ia, ja, ib, jb) => {
    if (!pt.has(key)) { const a = V[ia * W + ja], b = V[ib * W + jb], t = a / (a - b); pt.set(key, [mix(Z(ia), Z(ib), t), mix(Pp(ja), Pp(jb), t)]); }
    return key;
  };
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let i = 0; i < nz; i++) for (let j = 0; j < np; j++) {
    const v00 = V[i * W + j], v10 = V[(i + 1) * W + j], v11 = V[(i + 1) * W + j + 1], v01 = V[i * W + j + 1];
    const c = (v00 < 0 ? 1 : 0) | (v10 < 0 ? 2 : 0) | (v11 < 0 ? 4 : 0) | (v01 < 0 ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const e0 = () => edgePt(`a${i},${j}`, i, j, i + 1, j), e1 = () => edgePt(`b${i + 1},${j}`, i + 1, j, i + 1, j + 1);
    const e2 = () => edgePt(`a${i},${j + 1}`, i, j + 1, i + 1, j + 1), e3 = () => edgePt(`b${i},${j}`, i, j, i, j + 1);
    const segs = {
      1: [[e3, e0]], 2: [[e0, e1]], 3: [[e3, e1]], 4: [[e1, e2]], 6: [[e0, e2]], 7: [[e3, e2]], 8: [[e2, e3]], 9: [[e2, e0]],
      11: [[e2, e1]], 12: [[e1, e3]], 13: [[e1, e0]], 14: [[e0, e3]], 5: [[e3, e0], [e1, e2]], 10: [[e0, e1], [e2, e3]],
    }[c];
    for (const [a, b] of segs) link(a(), b());
  }
  const used = new Set(), lines = [];
  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const line = [start]; used.add(start);
    let cur = start;
    for (;;) { const nx = (adj.get(cur) || []).find(k => !used.has(k)); if (!nx) break; used.add(nx); line.push(nx); cur = nx; }
    // extend backwards for open lines
    cur = start;
    for (;;) { const nx = (adj.get(cur) || []).find(k => !used.has(k)); if (!nx) break; used.add(nx); line.unshift(nx); cur = nx; }
    const closed = line.length > 2 && (adj.get(line[0]) || []).includes(line[line.length - 1]);
    if (line.length > 3) lines.push({ pts: line.map(k => pt.get(k)), closed });
  }
  return lines;
}
// resample a polyline to roughly even spacing (in 3D, via map) and drop near duplicates
export function resample(pts3, closed, step) {
  const out = [pts3[0]]; let acc = 0;
  const all = closed ? [...pts3, pts3[0]] : pts3;
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i], d = a.distanceTo(b); acc += d;
    if (acc >= step) { out.push(b.clone()); acc = 0; }
  }
  if (closed && out.length > 2 && out[out.length - 1].distanceTo(out[0]) < step * 0.5) out.pop();
  if (!closed && out[out.length - 1] !== pts3[pts3.length - 1]) out.push(pts3[pts3.length - 1].clone());
  return out;
}
// sweep a 2D profile [[across, out]...] (across = in-surface, perpendicular to the path; out = along the surface
// normal) along a path with per-point normals -> smooth indexed geometry
export function sweep(path, norms, profile, closed = false) {
  const n = path.length, m = profile.length, pos = [], idx = [], T = new THREE.Vector3(), Bv = new THREE.Vector3(), Nv = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.subVectors(b, a).normalize(); Nv.copy(norms[i]); Nv.addScaledVector(T, -Nv.dot(T)).normalize(); Bv.crossVectors(T, Nv);
    for (const [u, w] of profile) pos.push(path[i].x + Bv.x * u + Nv.x * w, path[i].y + Bv.y * u + Nv.y * w, path[i].z + Bv.z * u + Nv.z * w);
  }
  const rows = closed ? n : n - 1;
  for (let i = 0; i < rows; i++) for (let k = 0; k < m; k++) {
    const k2 = (k + 1) % m, i2 = (i + 1) % n, a = i * m + k, b = i * m + k2, c = i2 * m + k2, d = i2 * m + k;
    idx.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// profiles: a rounded strip lying on the surface (frames, seals, rails); a round tube
export const stripProfile = (w, h, below = 0.01, seg = 6) => {
  const p = [[-w / 2, -below]];
  for (let k = 0; k <= seg; k++) { const a = Math.PI * k / seg; p.push([-Math.cos(a) * w / 2, Math.sin(a) * h]); }
  p.push([w / 2, -below]); return p;
};
// a frame/surround on a surface curve: polyline in (z, phi) -> sweep
export function surfStrip(S, line, profile, step = 0.03, off = 0) {
  const P = {}, N = {}, pts = [], nrm = [];
  for (const [z, ph] of line.pts) { S.at(z, ph, P); S.normal(z, ph, N); pts.push(new THREE.Vector3(P.x + N.x * off, P.y + N.y * off, P.z + N.z * off)); nrm.push(new THREE.Vector3(N.x, N.y, N.z)); }
  // resample keeping normals: nearest original normal
  const rs = resample(pts, line.closed, step), rn = rs.map(p => { let best = 0, bd = 1e9; for (let i = 0; i < pts.length; i++) { const d = pts[i].distanceToSquared(p); if (d < bd) { bd = d; best = i; } } return nrm[best]; });
  return sweep(rs, rn, profile, line.closed);
}

// ------------------------------------------------------------------------------------- airfoils
// NACA 00xx half thickness at chord fraction x (closed trailing edge)
export const naca = (x, t) => 5 * t * (0.2969 * Math.sqrt(Math.max(0, x)) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
// loft along a span axis. stations: [{ s, le, chord, t, twist, off }] where s = span coordinate, le = leading-edge
// position along the chord axis, off = offset along the thickness axis. axes: { span, chord, thick } as 'x' | 'y' | 'z'
// (chord axis points from the leading to the trailing edge). camber (fraction of chord, + toward +thick). n = points
// around the section. Ends closed by tapering to a thin rounded cap if cap = true.
export function airfoilLoft(stations, { span = 'x', chord = 'z', thick = 'y', n = 24, camber = 0, capA = false, capB = true, flip = false } = {}) {
  const pos = [], uvs = [], idx = [], ring = [];
  for (let k = 0; k < n; k++) { const th = TAU * k / n; ring.push([0.5 * (1 + Math.cos(th)), Math.sin(th) >= 0 ? 1 : -1, k / n]); }
  const put = (s, c, t) => { const v = { x: 0, y: 0, z: 0 }; v[span] = s; v[chord] = c; v[thick] = t; pos.push(v.x, v.y, v.z); };
  const st = stations.slice();
  for (const S of st) {
    const cs = Math.cos(S.twist || 0), sn = Math.sin(S.twist || 0);
    for (const [x, sg] of ring) {
      const cx = x * S.chord, ty = sg * naca(x, S.t) * S.chord + camber * S.chord * 4 * x * (1 - x) + (S.off || 0);
      const cq = cx - (S.pivot ?? 0) * S.chord;   // twist about the pitch axis (fraction of chord)
      // twist rotates (chord, thick): leading edge up for + twist
      const c2 = cq * cs + ty * sn, t2 = -cq * sn + ty * cs;
      put(S.s, (S.le ?? 0) + (S.pivot ?? 0) * S.chord + c2, t2);
    }
  }
  const m = n, rows = st.length;
  for (let i = 0; i < rows - 1; i++) for (let k = 0; k < m; k++) {
    const k2 = (k + 1) % m, a = i * m + k, b = i * m + k2, c = (i + 1) * m + k2, d = (i + 1) * m + k;
    if (flip) idx.push(a, b, d, b, c, d); else idx.push(a, d, b, b, d, c);
  }
  const cap = (i, outward) => {   // fan to the section centroid, pushed out slightly (rounded end)
    let cx = 0, cy = 0, cz = 0; for (let k = 0; k < m; k++) { cx += pos[(i * m + k) * 3]; cy += pos[(i * m + k) * 3 + 1]; cz += pos[(i * m + k) * 3 + 2]; }
    const c = pos.length / 3; const v = [cx / m, cy / m, cz / m]; const ax = { x: 0, y: 1, z: 2 }[span]; v[ax] += outward * st[i].t * st[i].chord * 0.6; pos.push(...v);
    for (let k = 0; k < m; k++) { const a = i * m + k, b = i * m + (k + 1) % m; if ((outward > 0) !== flip) idx.push(a, b, c); else idx.push(b, a, c); }
  };
  if (capA) cap(0, -1); if (capB) cap(rows - 1, 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------- solids
// a box with rounded edges and smooth normals (extruded rounded rectangle with a round bevel)
export function rbox(w, h, d, r = 0.01, seg = 2) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const sw = w / 2 - r, sh = h / 2 - r, s = new THREE.Shape();
  s.moveTo(-sw, -sh); s.lineTo(sw, -sh); s.lineTo(sw, sh); s.lineTo(-sw, sh); s.lineTo(-sw, -sh);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: 2 });
  g.translate(0, 0, -(d - 2 * r) / 2); return smoothGeo(g);
}
// weld coincident vertices and recompute normals (smooth), dropping uv
export function smoothGeo(g, eps = 1e-4) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
    let k = map.get(key); if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(x, y, z); } idx.push(k);
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx); out.computeVertexNormals(); return out;
}
// a lathe (profile [[r, y]...] around +y) with smooth normals
export const lathe = (prof, seg = 16) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg);
// align a +y geometry from a to b
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const AV = a => (a.isVector3 ? a : V3(...a));
export function alignY(geo, a, b, len = null) {
  a = AV(a); b = AV(b); const d = V3().subVectors(b, a), L = d.length();
  return geo.applyMatrix4(_m4.compose(a, _q.setFromUnitVectors(_Y, d.normalize()), ONE));
}
export const rod = (a, b, r, seg = 10, r2 = r) => { a = AV(a); b = AV(b); const L = a.distanceTo(b); return alignY(new THREE.CylinderGeometry(r2, r, L, seg, 1).translate(0, L / 2, 0), a, b); };
export const tube = (pts, r, seg = 32, rad = 10, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(AV), closed, 'centripetal'), seg, r, rad, closed);

// merge geometries (position, normal, optional uv) into one indexed geometry
export function merge(geos) {
  let nv = 0, ni = 0; const hasUV = geos.every(g => g.attributes.uv);
  for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = hasUV ? new Float32Array(nv * 2) : null, idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, c = p.count;
    for (let i = 0; i < c; i++) { pos[(ov + i) * 3] = p.getX(i); pos[(ov + i) * 3 + 1] = p.getY(i); pos[(ov + i) * 3 + 2] = p.getZ(i); nor[(ov + i) * 3] = n.getX(i); nor[(ov + i) * 3 + 1] = n.getY(i); nor[(ov + i) * 3 + 2] = n.getZ(i); }
    if (uv) { const u = g.attributes.uv; for (let i = 0; i < c; i++) { uv[(ov + i) * 2] = u.getX(i); uv[(ov + i) * 2 + 1] = u.getY(i); } }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.getX(i) + ov; else for (let i = 0; i < c; i++) idx[oi++] = ov + i;
    ov += c;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1)); return out;
}
// mirror a geometry across x = 0 (winding fixed)
export function mirrorX(g) {
  const m = g.clone(); m.scale(-1, 1, 1);
  if (m.index) { const a = m.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } m.index.needsUpdate = true; }
  m.computeVertexNormals(); return m;
}
export const triCount = g => (g.index ? g.index.count : g.attributes.position.count) / 3;

// ------------------------------------------------------------------------------------- noise and glyphs
const NG = 256, LAT = (() => { const a = new Float32Array(NG * NG); let s = 1969; for (let i = 0; i < a.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; a[i] = s / 4294967296; } return a; })();
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const i0 = xi & 255, j0 = yi & 255, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255;
  const a = LAT[j0 * NG + i0], b = LAT[j0 * NG + i1], c = LAT[j1 * NG + i0], d = LAT[j1 * NG + i1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.03 + 5.1, y * 2.03 + 1.7) * 0.3 + vnoise(x * 4.1 + 9.2, y * 4.1 + 3.3) * 0.2;
export const hash2 = (a, b) => { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
// text -> sampler (u, v in 0..1, v = 0 top) returning coverage 0..1
export function glyphs(lines, { font = 'bold 64px Arial, "Liberation Sans", sans-serif', W = 512, H = 96, align = 'center' } = {}) {
  if (typeof document === 'undefined') return () => 0;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.font = font; x.textAlign = align; x.textBaseline = 'middle';
  const L = [].concat(lines); L.forEach((t, i) => x.fillText(t, align === 'left' ? 4 : W / 2, H * (i + 0.5) / L.length));
  const d = x.getImageData(0, 0, W, H).data;
  return (u, v) => {
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const fx = u * (W - 1), fy = v * (H - 1), i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, A = k => d[k * 4 + 3] / 255;
    const i1 = Math.min(W - 1, i + 1), j1 = Math.min(H - 1, j + 1);
    return mix(mix(A(j * W + i), A(j * W + i1), tx), mix(A(j1 * W + i), A(j1 * W + i1), tx), ty);
  };
}
// 2D signed distances (negative inside)
export function sdBox(px, py, hx, hy, r = 0) { const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; }
export function sdPoly(px, py, pts, r = 0) {
  let d = Infinity, s = 1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i], ex = bx - ax, ey = by - ay, wx = px - ax, wy = py - ay;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1), dx = wx - ex * t, dy = wy - ey * t; d = Math.min(d, dx * dx + dy * dy);
    const c1 = py >= ay, c2 = py < by, c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d) - r;
}
// shrink a polygon's corners for rounding: sdPoly(inset by r) - r. Callers pass already inset points when needed.

// ------------------------------------------------------------------------------------- texture baking
// fn(u, v, o) fills o = { r, g, b, a, bump, rough } (colour 0..255 sRGB, a 0..1, bump 0..1 (0.5 = flat), rough 0..1
// multiplier). column(u) is called once per column first (cache per-z work there). Returns { map, aux } DataTextures:
// map RGBA (sRGB colour + alpha), aux R = bump height, G = roughness multiplier (Three reads bump from .r, roughness .g).
export function bake(W, H, fn, column = null, { aniso = 8 } = {}) {
  const col = new Uint8Array(W * H * 4), aux = new Uint8Array(W * H * 4), o = { r: 0, g: 0, b: 0, a: 1, bump: 0.5, rough: 1 };
  for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W; if (column) column(u);
    for (let j = 0; j < H; j++) {
      o.r = o.g = o.b = 0; o.a = 1; o.bump = 0.5; o.rough = 1;
      fn(u, (j + 0.5) / H, o);
      const k = (j * W + i) * 4;
      col[k] = clamp(o.r, 0, 255); col[k + 1] = clamp(o.g, 0, 255); col[k + 2] = clamp(o.b, 0, 255); col[k + 3] = clamp(o.a * 255, 0, 255);
      aux[k] = clamp(o.bump * 255, 0, 255); aux[k + 1] = clamp(o.rough * 255, 0, 255); aux[k + 2] = 0; aux[k + 3] = 255;
    }
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = aniso; t.needsUpdate = true; return t;
  };
  return { map: mk(col, true), aux: mk(aux, false) };
}
