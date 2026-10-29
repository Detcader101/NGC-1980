// NGC-1980 look-faces: a QUADRIC-ERROR SIMPLIFIER for SdfKit.mesh() surfaces (Garland & Heckbert 1997, half-edge
// collapses). A face is meshed ONCE at a fine cell (2-3 mm: lids, nostrils, the lip line, the ear's rim resolve) and
// then reduced to each level's triangle budget: the flat scalp and neck lose triangles, the eyes, nose, mouth and ears
// keep them. A collapse moves one vertex onto its neighbour, so every per-vertex attribute (colour, material channels,
// skin weights, the SDF gradient normal of the fine surface) is the surviving vertex's own: nothing is averaged.
// The cost adds a penalty for collapsing across colour / material changes (the hairline, the brows, the lips) and
// collapses that fold a triangle over or break the manifold are refused.
//   const lo = simplifySurface(fineSurface, 4000);      // same fields as SdfKit.mesh()
//   const cut = cutSurface(lo, (x, y, z) => y > y0);     // drop the triangles wholly inside a test (under a helmet)

class Heap {   // a binary min-heap of [cost, a, b, stampA, stampB]
  constructor() { this.c = []; this.d = []; }
  get size() { return this.c.length; }
  push(cost, rec) {
    const c = this.c, d = this.d; let i = c.length; c.push(cost); d.push(rec);
    while (i > 0) { const p = (i - 1) >> 1; if (c[p] <= cost) break; c[i] = c[p]; d[i] = d[p]; i = p; }
    c[i] = cost; d[i] = rec;
  }
  pop() {
    const c = this.c, d = this.d, top = d[0], lc = c.pop(), ld = d.pop(), n = c.length;
    if (n) {
      let i = 0;
      for (;;) { let m = 2 * i + 1; if (m >= n) break; if (m + 1 < n && c[m + 1] < c[m]) m++; if (c[m] >= lc) break; c[i] = c[m]; d[i] = d[m]; i = m; }
      c[i] = lc; d[i] = ld;
    }
    return top;
  }
}

// s: { pos, nor, col, fig, rm, pt, skinAcc, index } -> a new surface with at most `target` triangles (if reachable)
// o.attr: metres of equivalent error per unit of colour / channel difference (default 0.012)
export function simplifySurface(s, target, o = {}) {
  const nv = s.verts, P = s.pos, I = s.index, nf = I.length / 3;
  if (nf <= target) return s;
  const F = Int32Array.from(I), alive = new Uint8Array(nf).fill(1), Q = new Float64Array(nv * 10), ver = new Int32Array(nv), gone = new Uint8Array(nv);
  const vf = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) vf[F[f * 3 + k]].push(f);
  // area-weighted plane quadrics
  for (let f = 0; f < nf; f++) {
    const a = F[f * 3] * 3, b = F[f * 3 + 1] * 3, c = F[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (l < 1e-14) continue;
    const area = l * 0.5; nx /= l; ny /= l; nz /= l; const d = -(nx * P[a] + ny * P[a + 1] + nz * P[a + 2]);
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (let k = 0; k < 3; k++) { const o2 = F[f * 3 + k] * 10; for (let j = 0; j < 10; j++) Q[o2 + j] += q[j] * area; }
  }
  // boundary edges (an open cut): a strong perpendicular plane keeps the outline
  const ekey = (a, b) => (a < b ? a * nv + b : b * nv + a), ecount = new Map();
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) { const e = ekey(F[f * 3 + k], F[f * 3 + (k + 1) % 3]); ecount.set(e, (ecount.get(e) || 0) + 1); }
  const border = new Uint8Array(nv);
  for (const [e, n] of ecount) if (n === 1) { border[Math.floor(e / nv)] = 1; border[e % nv] = 1; }
  const A = o.attr ?? 0.012, col = s.col, fig = s.fig, rm = s.rm;
  const attrD2 = (u, v) => {
    let d = 0;
    for (let k = 0; k < 3; k++) { const t = Math.sqrt(Math.max(0, col[u * 3 + k])) - Math.sqrt(Math.max(0, col[v * 3 + k])); d += t * t; }   // perceptual-ish (gamma 2)
    for (let k = 0; k < 4; k++) { const t = fig[u * 4 + k] - fig[v * 4 + k]; d += 0.25 * t * t; }
    const t = rm[u * 2] - rm[v * 2]; d += 0.25 * t * t;
    return d;
  };
  const qerr = (q, x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  const qs = new Float64Array(10);
  // cost of moving u onto v
  const cost = (u, v) => {
    if (border[u] && !border[v]) return Infinity;
    for (let j = 0; j < 10; j++) qs[j] = Q[u * 10 + j] + Q[v * 10 + j];
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const e2 = (x - P[u * 3]) ** 2 + (y - P[u * 3 + 1]) ** 2 + (z - P[u * 3 + 2]) ** 2;
    return Math.max(0, qerr(qs, x, y, z)) + e2 * attrD2(u, v) * A * A + (border[u] ? e2 * 4e-3 : 0) + e2 * e2 * 1e-3;   // the last term: no long slivers
  };
  const heap = new Heap();
  const pushEdge = (a, b) => {
    const ca = cost(a, b), cb = cost(b, a);
    if (ca <= cb) { if (ca < Infinity) heap.push(ca, [a, b, ver[a], ver[b]]); } else heap.push(cb, [b, a, ver[b], ver[a]]);
  };
  const neighbours = (v, out) => { out.clear(); for (const f of vf[v]) if (alive[f]) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== v) out.add(w); } return out; };
  const NU = new Set(), NV = new Set();
  for (const e of ecount.keys()) pushEdge(Math.floor(e / nv), e % nv);
  let live = nf;
  const nrm = (a, b, c, out) => {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx; return out;
  };
  const n0 = [0, 0, 0], n1 = [0, 0, 0];
  while (live > target && heap.size) {
    const [u, v, su, sv] = heap.pop();
    if (gone[u] || gone[v] || ver[u] !== su || ver[v] !== sv) continue;
    // the link condition: u and v share exactly the vertices opposite their shared edge
    neighbours(u, NU); if (!NU.has(v)) continue; neighbours(v, NV);
    let shared = 0; for (const w of NU) if (NV.has(w)) shared++;
    let edgeFaces = 0; for (const f of vf[u]) if (alive[f] && (F[f * 3] === v || F[f * 3 + 1] === v || F[f * 3 + 2] === v)) edgeFaces++;
    if (shared !== edgeFaces) continue;
    // no fold-overs: every face of u that survives keeps its orientation (and does not collapse to a needle)
    let ok = true;
    for (const f of vf[u]) {
      if (!alive[f]) continue; const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
      if (a === v || b === v || c === v) continue;
      nrm(a, b, c, n0); nrm(a === u ? v : a, b === u ? v : b, c === u ? v : c, n1);
      const l0 = Math.hypot(n0[0], n0[1], n0[2]), l1 = Math.hypot(n1[0], n1[1], n1[2]);
      if (l1 < 1e-14 || (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) < 0.35 * l0 * l1) { ok = false; break; }
    }
    if (!ok) continue;   // dropped: re-pushed when a collapse next to it changes the neighbourhood
    // collapse u -> v
    for (const f of vf[u]) {
      if (!alive[f]) continue;
      const hasV = F[f * 3] === v || F[f * 3 + 1] === v || F[f * 3 + 2] === v;
      if (hasV) { alive[f] = 0; live--; continue; }
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === u) F[f * 3 + k] = v;
      vf[v].push(f);
    }
    vf[v] = vf[v].filter(f => alive[f]); vf[u] = [];
    for (let j = 0; j < 10; j++) Q[v * 10 + j] += Q[u * 10 + j];
    if (border[u]) border[v] = 1;
    gone[u] = 1; ver[v]++;   // v's old entries are stale; its edges (with the merged quadric) go back in
    neighbours(v, NV); for (const w of NV) pushEdge(v, w);
  }
  // compact
  const map = new Int32Array(nv).fill(-1), keep = [];
  const index = [];
  for (let f = 0; f < nf; f++) if (alive[f]) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (map[w] < 0) { map[w] = keep.length; keep.push(w); } index.push(map[w]); }
  return pick(s, keep, index);
}

// the sub-surface of the vertices `keep` (old indices, in order) with the triangles `index` (new indices)
function pick(s, keep, index) {
  const n = keep.length, out = { pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), col: new Float32Array(n * 3), fig: new Float32Array(n * 4), rm: new Float32Array(n * 2), pt: new Float32Array(n), skinAcc: new Array(n), index, tris: index.length / 3, verts: n, cell: s.cell };
  keep.forEach((w, i) => {
    for (let k = 0; k < 3; k++) { out.pos[i * 3 + k] = s.pos[w * 3 + k]; out.nor[i * 3 + k] = s.nor[w * 3 + k]; out.col[i * 3 + k] = s.col[w * 3 + k]; }
    for (let k = 0; k < 4; k++) out.fig[i * 4 + k] = s.fig[w * 4 + k];
    out.rm[i * 2] = s.rm[w * 2]; out.rm[i * 2 + 1] = s.rm[w * 2 + 1]; out.pt[i] = s.pt ? s.pt[w] : 0; out.skinAcc[i] = s.skinAcc[w];
  });
  return out;
}

// drop the triangles whose three vertices all pass `inside(x, y, z)` (e.g. the scalp under a helmet shell)
export function cutSurface(s, inside) {
  const P = s.pos, map = new Int32Array(s.verts).fill(-1), keep = [], index = [], I = s.index;
  const hid = new Uint8Array(s.verts); for (let v = 0; v < s.verts; v++) hid[v] = inside(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) ? 1 : 0;
  for (let f = 0; f < I.length; f += 3) {
    if (hid[I[f]] && hid[I[f + 1]] && hid[I[f + 2]]) continue;
    for (let k = 0; k < 3; k++) { const w = I[f + k]; if (map[w] < 0) { map[w] = keep.length; keep.push(w); } index.push(map[w]); }
  }
  return pick(s, keep, index);
}
