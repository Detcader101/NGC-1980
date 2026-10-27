// NGC-1980 look-people: a small SIGNED-DISTANCE modeller for people. Bodies, heads and hands are described as smooth
// unions of anatomical primitives (tapered capsules, ellipsoids, rounded boxes, tori) with blend radii, optional
// subtractions (eye sockets, the mouth line, the gap between the legs) and displacements (cloth folds), then meshed ONCE
// into a single continuous, welded, indexed surface by SURFACE NETS (dual contouring without the QEF: one vertex per
// cell, projected back onto the surface by Newton steps, normals from the field gradient). No part-built boxes, no
// seams at the armpit, crotch, neck or knuckles: the surface is one piece and shades smooth everywhere.
//
// Each primitive carries a MATERIAL (colour hex or fn(x, y, z), camo weights, roughness, skin-tone weight, cloth fold
// strength) and a SKIN spec (a bone name, or a chain of bones with joints and transition widths). Per vertex the
// nearby primitives are weighted like the smooth union itself, so colours and bone weights blend exactly where the
// shapes blend: a shoulder is part chest, part upper arm; an elbow is a smooth half-and-half of upper arm and forearm.
//
//   const S = new SdfKit();
//   S.capsule([0, 1.0, 0], [0, 0.6, 0], 0.08, 0.06, { k: 0.03, mat: M.trouser, skin: CHAIN.legL });
//   const surf = S.mesh(0.015);            // { pos, nor, col, fig, rm, skinIndex, skinWeight, index } (plain arrays)
//
// The FigBuilder (figgeo.js) merges surfaces and rigid Kit parts into one skinned BufferGeometry.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------ rotations
// a primitive's frame: Euler XYZ -> row-major 3x3 (world = R * local); we store R and use R^T for world -> local
const RM = rot => (rot ? (rot.length === 9 ? rot : rotMat(...rot)) : null);   // Euler [x, y, z] or a row-major 3x3
function rotMat(rx = 0, ry = 0, rz = 0) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  // THREE's Euler 'XYZ': R = Rx * Ry * Rz
  return [
    cy * cz, -cy * sz, sy,
    cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
    sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy,
  ];
}

// ------------------------------------------------------------------------------------------------ the kit
export class SdfKit {
  constructor() { this.prims = []; }
  _push(p, o = {}) {
    p.k = o.k ?? 0.01;                         // blend radius (m) with what is already there
    p.sub = !!o.sub;                           // subtract (carve) instead of add
    p.mat = o.mat || null;                     // material record (see MAT below); subtractors keep the surrounding one
    p.skin = o.skin || null;                   // bone name | chain {bones, joints:[{p,ax,r}]}
    p.disp = o.disp || null;                   // fn(x, y, z) -> distance offset (folds); amplitude bound in o.dispMax
    p.grow = (o.dispMax || 0) + Math.max(0, p.k);
    p.id = this.prims.length; this.prims.push(p); return this;
  }
  // tapered capsule (round cone) from a (radius ra) to b (radius rb)
  capsule(a, b, ra, rb, o) {
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2], l2 = bax * bax + bay * bay + baz * baz, rr = ra - rb, a2 = l2 - rr * rr, il2 = 1 / Math.max(1e-12, l2);
    const R = Math.max(ra, rb);
    return this._push({ t: 0, a, bax, bay, baz, l2, il2, rr, a2, ra, rb, box: [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R] }, o);
  }
  // ellipsoid at c with radii r [rx, ry, rz], rotated (Euler XYZ)
  ellip(c, r, rot = null, o) {
    const R = RM(rot), m = Math.max(r[0], r[1], r[2]);
    return this._push({ t: 1, c, r, ir: [1 / r[0], 1 / r[1], 1 / r[2]], ir2: [1 / (r[0] * r[0]), 1 / (r[1] * r[1]), 1 / (r[2] * r[2])], R, box: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m] }, o);
  }
  sphere(c, r, o) { return this.ellip(c, [r, r, r], null, o); }
  // rounded box at c, half extents h [hx, hy, hz], edge radius rad, rotated
  rbox(c, h, rad, rot = null, o) {
    const R = RM(rot), m = Math.hypot(h[0], h[1], h[2]);
    rad = Math.min(rad, h[0], h[1], h[2]);
    return this._push({ t: 2, c, b: [h[0] - rad, h[1] - rad, h[2] - rad], rad, R, box: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m] }, o);
  }
  // torus round the local y axis (ring radius R0, tube radius r), at c, rotated; sx/sz squash the ring into an oval
  torus(c, R0, r, rot = null, o, sx = 1, sz = 1) {
    const Rm = RM(rot), m = R0 * Math.max(sx, sz) + r;
    return this._push({ t: 3, c, R0, r, R: Rm, sx, sz, box: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m] }, o);
  }
  // an elliptic cylinder (rounded caps) along local y: half height hh, radii rx, rz, edge radius rad
  ecyl(c, rx, rz, hh, rad, rot = null, o) {
    const R = RM(rot), m = Math.hypot(Math.max(rx, rz), hh);
    return this._push({ t: 4, c, rx, rz, hh, rad: Math.min(rad, rx, rz, hh), R, box: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m] }, o);
  }
  // an elliptic BAND round the local y axis (a belt, a cuff, a boot top, a helmet band, reflective tape): the ring of
  // radii rx, rz, thickness th (each side of the ring), half height hh, edge radius rad
  band(c, rx, rz, hh, th, rot = null, o, rad = 0.002) {
    const R = RM(rot), m = Math.hypot(Math.max(rx, rz) + th, hh);
    return this._push({ t: 6, c, rx, rz, hh, th, rad: Math.min(rad, th * 0.99, hh * 0.99), R, box: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m] }, o);
  }
  // a half-space cut (keep the side where n.(p - c) < 0), only inside a box (for trimming): `sub` is implied
  plane(c, n, box, o = {}) {
    const l = Math.hypot(n[0], n[1], n[2]);
    return this._push({ t: 5, c, n: [n[0] / l, n[1] / l, n[2] / l], box }, { ...o, sub: true });
  }
}

// distance of one primitive at (x, y, z) (no blend, no displacement)
function primDist(p, x, y, z) {
  let lx, ly, lz;
  if (p.t !== 0 && p.t !== 5) {
    lx = x - p.c[0]; ly = y - p.c[1]; lz = z - p.c[2];
    if (p.R) { const R = p.R, a = R[0] * lx + R[3] * ly + R[6] * lz, b = R[1] * lx + R[4] * ly + R[7] * lz, c = R[2] * lx + R[5] * ly + R[8] * lz; lx = a; ly = b; lz = c; }
  }
  switch (p.t) {
    case 0: {   // round cone (Inigo Quilez, sdRoundCone with arbitrary end points)
      const pax = x - p.a[0], pay = y - p.a[1], paz = z - p.a[2];
      const yv = pax * p.bax + pay * p.bay + paz * p.baz, zv = yv - p.l2;
      const qx = pax * p.l2 - p.bax * yv, qy = pay * p.l2 - p.bay * yv, qz = paz * p.l2 - p.baz * yv;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * p.l2, z2 = zv * zv * p.l2;
      const k = Math.sign(p.rr) * p.rr * p.rr * x2;
      if (Math.sign(zv) * p.a2 * z2 > k) return Math.sqrt(x2 + z2) * p.il2 - p.rb;
      if (Math.sign(yv) * p.a2 * y2 < k) return Math.sqrt(x2 + y2) * p.il2 - p.ra;
      return (Math.sqrt(x2 * p.a2 * p.il2) + yv * p.rr) * p.il2 - p.ra;
    }
    case 1: {   // ellipsoid (IQ's bound)
      const k0 = Math.hypot(lx * p.ir[0], ly * p.ir[1], lz * p.ir[2]), k1 = Math.hypot(lx * p.ir2[0], ly * p.ir2[1], lz * p.ir2[2]);
      return k1 < 1e-9 ? -Math.min(p.r[0], p.r[1], p.r[2]) : k0 * (k0 - 1) / k1;
    }
    case 2: {   // rounded box
      const qx = Math.abs(lx) - p.b[0], qy = Math.abs(ly) - p.b[1], qz = Math.abs(lz) - p.b[2];
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - p.rad;
    }
    case 3: {   // torus round y
      const qx = Math.hypot(lx / p.sx, lz / p.sz) - p.R0; return Math.hypot(qx, ly) - p.r;
    }
    case 4: {   // elliptic capped cylinder (approximate: scaled radial distance), rounded edge
      const rl = Math.hypot(lx / p.rx, lz / p.rz), dr = (rl - 1) * Math.min(p.rx, p.rz) + p.rad, dy = Math.abs(ly) - p.hh + p.rad;
      return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) - p.rad;
    }
    case 6: {   // elliptic band
      const rl = Math.hypot(lx / p.rx, lz / p.rz), dr = Math.abs((rl - 1) * Math.min(p.rx, p.rz)) - p.th + p.rad, dy = Math.abs(ly) - p.hh + p.rad;
      return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) - p.rad;
    }
    case 5: return (x - p.c[0]) * p.n[0] + (y - p.c[1]) * p.n[1] + (z - p.c[2]) * p.n[2];
  }
  return 1e9;
}
const inBox = (b, x, y, z, g) => x > b[0] - g && y > b[1] - g && z > b[2] - g && x < b[3] + g && y < b[4] + g && z < b[5] + g;
function smin(a, b, k) { if (k <= 0) return a < b ? a : b; const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

// the field over a list of primitives (the ones whose grown boxes contain the point); FAR when none does
const FAR = 1;
function field(list, x, y, z, guard) {
  let d = FAR, any = false;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (!inBox(p.box, x, y, z, p.grow + guard)) continue;
    let di = primDist(p, x, y, z); if (p.disp) di += p.disp(x, y, z);
    if (p.sub) { if (any) d = -smin(-d, di, p.k); }
    else if (!any) { d = di; any = true; } else d = smin(d, di, p.k);
  }
  return d;
}

// ------------------------------------------------------------------------------------------------ materials
// a material record: { col: hex | fn(x,y,z)->hex, erdl 0..1 (utility camo in the shader), mitch 0..1 (helmet cover
// camo), skin 0..1 (takes the person's skin tone), fold 0..1 (cloth bump detail), rough, metal }
export const mat = (col, o = {}) => ({ col, erdl: 0, mitch: 0, skin: 0, fold: 0, rough: 0.9, metal: 0, ...o });

// ------------------------------------------------------------------------------------------------ skin weights
// chain: { bones: [b0, b1, ... bn], joints: [{ p: [x,y,z], ax: [x,y,z] (toward b(i+1)), r: half width }, ...] (n of them) }
// weight of bone i: s_i * (1 - s_(i+1)), s_0 = 1, s_i = smoothstep(-r, r, ax . (v - p)) at joint i
export function chainWeights(skin, x, y, z, out) {
  if (typeof skin === 'string') { out[skin] = (out[skin] || 0) + 1; return out; }
  const J = skin.joints, B = skin.bones; let prev = 1;
  for (let i = 0; i < B.length; i++) {
    let s = 0;
    if (i < J.length) { const j = J[i]; s = sstep(-j.r, j.r, (x - j.p[0]) * j.ax[0] + (y - j.p[1]) * j.ax[1] + (z - j.p[2]) * j.ax[2]); s = Math.min(s, 1); }
    const w = prev * (1 - s); if (w > 1e-4) out[B[i]] = (out[B[i]] || 0) + w; prev = prev * s; if (prev < 1e-5) break;
  }
  return out;
}
// normalised top-4 weights from {bone: w} into indices via boneIndex map
export function top4(acc, boneIndex, si, sw, o) {
  const e = Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 4); let t = 0; for (const [, w] of e) t += w;
  for (let i = 0; i < 4; i++) { si[o + i] = e[i] ? boneIndex[e[i][0]] : 0; sw[o + i] = e[i] ? e[i][1] / t : 0; }
}

// ------------------------------------------------------------------------------------------------ surface nets
const _hex = [0, 0, 0];
function hexRGB(h) { _hex[0] = ((h >> 16) & 255) / 255; _hex[1] = ((h >> 8) & 255) / 255; _hex[2] = (h & 255) / 255; return _hex; }
// sRGB hex -> linear (the figure material works in linear like THREE's vertex colours with ColorManagement)
const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

SdfKit.prototype.mesh = function (h = 0.015, o = {}) {
  const P = this.prims; if (!P.length) return null;
  // bounds: the additive primitives' boxes
  let b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of P) if (!p.sub) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], p.box[i] - p.grow); b[i + 3] = Math.max(b[i + 3], p.box[i + 3] + p.grow); }
  if (o.clip) for (let i = 0; i < 3; i++) { b[i] = Math.max(b[i], o.clip[i]); b[i + 3] = Math.min(b[i + 3], o.clip[i + 3]); }
  const ox = b[0] - 2 * h, oy = b[1] - 2 * h, oz = b[2] - 2 * h;
  const nx = Math.ceil((b[3] - b[0]) / h) + 5, ny = Math.ceil((b[4] - b[1]) / h) + 5, nz = Math.ceil((b[5] - b[2]) / h) + 5;
  const F = new Float32Array(nx * ny * nz), idx = (i, j, k) => i + nx * (j + ny * k);
  const guard = 2 * h;
  // evaluate in blocks of 8^3 corners with the primitives that can reach the block
  const BS = 8, nbx = Math.ceil(nx / BS), nby = Math.ceil(ny / BS), nbz = Math.ceil(nz / BS), BL = [];
  const blockOf = (x, y, z) => BL[clamp(Math.floor((x - ox) / h / BS), 0, nbx - 1) + nbx * (clamp(Math.floor((y - oy) / h / BS), 0, nby - 1) + nby * clamp(Math.floor((z - oz) / h / BS), 0, nbz - 1))] || P;
  for (let bk = 0; bk < nz; bk += BS) for (let bj = 0; bj < ny; bj += BS) for (let bi = 0; bi < nx; bi += BS) {
    const x0 = ox + bi * h, y0 = oy + bj * h, z0 = oz + bk * h, x1 = x0 + BS * h, y1 = y0 + BS * h, z1 = z0 + BS * h;
    const list = [];
    const G2 = guard + 2 * h;   // (the vertices are projected and painted with the same lists: a little more margin)
    for (const p of P) { const g = p.grow + G2, bb = p.box; if (bb[0] - g < x1 && bb[3] + g > x0 && bb[1] - g < y1 && bb[4] + g > y0 && bb[2] - g < z1 && bb[5] + g > z0) list.push(p); }
    BL[bi / BS + nbx * (bj / BS + nby * (bk / BS))] = list;
    const ie = Math.min(nx, bi + BS), je = Math.min(ny, bj + BS), ke = Math.min(nz, bk + BS);
    if (!list.some(p => !p.sub)) { for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) for (let i = bi; i < ie; i++) F[idx(i, j, k)] = FAR; continue; }
    for (let k = bk; k < ke; k++) for (let j = bj; j < je; j++) for (let i = bi; i < ie; i++) F[idx(i, j, k)] = field(list, ox + i * h, oy + j * h, oz + k * h, guard);
  }
  if (o.clipFn) for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = idx(i, j, k); F[q] = Math.max(F[q], o.clipFn(ox + i * h, oy + j * h, oz + k * h)); }
  // one vertex per cell with a sign change
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1), cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const V = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cd = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const v = F[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; cd[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, bb] of E) {
      const da = cd[a], db = cd[bb]; if ((da < 0) === (db < 0)) continue;
      const t = da / (da - db);
      sx += (a & 1) + t * ((bb & 1) - (a & 1)); sy += ((a >> 1) & 1) + t * (((bb >> 1) & 1) - ((a >> 1) & 1)); sz += ((a >> 2) & 1) + t * (((bb >> 2) & 1) - ((a >> 2) & 1)); n++;
    }
    cellV[cidx(i, j, k)] = V.length / 3;
    V.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
  }
  // quads round every grid edge with a sign change
  const T = [];
  const quad = (a, b2, c, d, flip) => {
    if (a < 0 || b2 < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b2; b2 = d; d = t; }
    // the shorter diagonal
    const dAC = (V[a * 3] - V[c * 3]) ** 2 + (V[a * 3 + 1] - V[c * 3 + 1]) ** 2 + (V[a * 3 + 2] - V[c * 3 + 2]) ** 2;
    const dBD = (V[b2 * 3] - V[d * 3]) ** 2 + (V[b2 * 3 + 1] - V[d * 3 + 1]) ** 2 + (V[b2 * 3 + 2] - V[d * 3 + 2]) ** 2;
    if (dAC <= dBD) T.push(a, b2, c, a, c, d); else T.push(a, b2, d, b2, c, d);
  };
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const s0 = F[idx(i, j, k)] < 0;
    if (j > 0 && k > 0 && (F[idx(i + 1, j, k)] < 0) !== s0) quad(cellV[cidx(i, j - 1, k - 1)], cellV[cidx(i, j, k - 1)], cellV[cidx(i, j, k)], cellV[cidx(i, j - 1, k)], !s0);
    if (i > 0 && k > 0 && (F[idx(i, j + 1, k)] < 0) !== s0) quad(cellV[cidx(i - 1, j, k - 1)], cellV[cidx(i - 1, j, k)], cellV[cidx(i, j, k)], cellV[cidx(i, j, k - 1)], !s0);
    if (i > 0 && j > 0 && (F[idx(i, j, k + 1)] < 0) !== s0) quad(cellV[cidx(i - 1, j - 1, k)], cellV[cidx(i, j - 1, k)], cellV[cidx(i, j, k)], cellV[cidx(i - 1, j, k)], !s0);
  }
  // project the vertices onto the surface (Newton on the full field), normals from the gradient
  const nv = V.length / 3, N = new Float32Array(nv * 3), e = h * 0.2;
  let LIST = P;
  const fAt = (x, y, z) => { let d = field(LIST, x, y, z, guard); if (o.clipFn) d = Math.max(d, o.clipFn(x, y, z)); return d; };
  const g = [0, 0, 0];
  const grad = (x, y, z) => { g[0] = fAt(x + e, y, z) - fAt(x - e, y, z); g[1] = fAt(x, y + e, z) - fAt(x, y - e, z); g[2] = fAt(x, y, z + e) - fAt(x, y, z - e); return g; };
  for (let v = 0; v < nv; v++) {
    let x = V[v * 3], y = V[v * 3 + 1], z = V[v * 3 + 2]; const x0 = x, y0 = y, z0 = z; LIST = blockOf(x, y, z);
    for (let it = 0; it < (o.iters ?? 3); it++) {
      const d = fAt(x, y, z); if (Math.abs(d) < h * 1e-3) break;
      grad(x, y, z); const gl2 = (g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) / (4 * e * e); if (gl2 < 1e-8) break;
      const s = d / gl2 / (2 * e); x -= g[0] * s; y -= g[1] * s; z -= g[2] * s;
    }
    // stay near the cell (thin features / creases): limit the move
    const mx = x - x0, my = y - y0, mz = z - z0, ml = Math.hypot(mx, my, mz), lim = h * 0.9;
    if (ml > lim) { x = x0 + mx * lim / ml; y = y0 + my * lim / ml; z = z0 + mz * lim / ml; }
    V[v * 3] = x; V[v * 3 + 1] = y; V[v * 3 + 2] = z;
    grad(x, y, z); const l = Math.hypot(g[0], g[1], g[2]) || 1; N[v * 3] = g[0] / l; N[v * 3 + 1] = g[1] / l; N[v * 3 + 2] = g[2] / l;
  }
  // per-vertex material and skin: the additive primitives weighted like the blend
  const col = new Float32Array(nv * 3), fig = new Float32Array(nv * 4), rm = new Float32Array(nv * 2), skinAcc = [];
  const dl = [], pl = [];
  for (let v = 0; v < nv; v++) {
    const x = V[v * 3], y = V[v * 3 + 1], z = V[v * 3 + 2];
    dl.length = 0; pl.length = 0; let dmin = Infinity;
    for (const p of blockOf(x, y, z)) { if (p.sub || !inBox(p.box, x, y, z, p.grow + guard)) continue; let d = primDist(p, x, y, z); if (p.disp) d += p.disp(x, y, z); dl.push(d); pl.push(p); if (d < dmin) dmin = d; }
    let wt = 0, cr = 0, cg = 0, cb = 0, f0 = 0, f1 = 0, f2 = 0, f3 = 0, r0 = 0, r1 = 0; const acc = {};
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i], kk = Math.max(p.k, h * 0.5), w0 = 1 - (dl[i] - dmin) / kk; if (w0 <= 0) continue;
      const w = w0 * w0 * w0;
      const m = p.mat;
      if (m) {
        const c = hexRGB(typeof m.col === 'function' ? m.col(x, y, z) : m.col);
        cr += lin(c[0]) * w; cg += lin(c[1]) * w; cb += lin(c[2]) * w; f0 += m.erdl * w; f1 += m.mitch * w; f2 += m.skin * w; f3 += m.fold * w; r0 += m.rough * w; r1 += m.metal * w; wt += w;
      }
      if (p.skin) { const a = {}; chainWeights(p.skin, x, y, z, a); for (const kb in a) acc[kb] = (acc[kb] || 0) + a[kb] * w; }
    }
    if (wt > 0) { col[v * 3] = cr / wt; col[v * 3 + 1] = cg / wt; col[v * 3 + 2] = cb / wt; fig[v * 4] = f0 / wt; fig[v * 4 + 1] = f1 / wt; fig[v * 4 + 2] = f2 / wt; fig[v * 4 + 3] = f3 / wt; rm[v * 2] = r0 / wt; rm[v * 2 + 1] = r1 / wt; }
    else { col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = 0.2; rm[v * 2] = 0.9; }
    if (o.paint) {   // a post pass: (x, y, z, nx, ny, nz) -> hex | null (e.g. the helmet's liner under the rim)
      const hx = o.paint(x, y, z, N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
      if (hx != null) { const c = hexRGB(hx); col[v * 3] = lin(c[0]); col[v * 3 + 1] = lin(c[1]); col[v * 3 + 2] = lin(c[2]); fig[v * 4] = fig[v * 4 + 1] = 0; }
    }
    skinAcc.push(acc);
  }
  return { pos: new Float32Array(V), nor: N, col, fig, rm, skinAcc, index: T, tris: T.length / 3, verts: nv, cell: h };
};
