// stationtable.js - station tables from traced three-views (shared by the UH-1H and, later, the UH-1N and other
// aircraft). A tracer (tools/hueytrace.mjs) turns a public-domain dimensioned drawing into per-column samples in model
// metres; this module turns those samples into smooth profile functions and the [z, T, B, W, ym, nT, nB, lean] keys
// that hueygeo.bodySurface lofts.
//   const top = sampler(trace.side, 'top', { median: 0.15 });   top(z) -> metres (null samples bridged linearly)
//   const keys = stationKeys(zs, z => ({ T, B, W, ym, nT, nB, lean }));

// a profile function over samples [{ z, [key] }] (z ascending, one per drawing column): a running median of `median`
// metres rejects single-column noise, null samples (masked parts) are bridged linearly, ends are held
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
// piecewise-linear through [[z, v]...]
export const pl = pts => z => {
  if (z <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, v0] = pts[i - 1], [z1, v1] = pts[i]; return v0 + (v1 - v0) * (z - z0) / (z1 - z0); }
  return pts[pts.length - 1][1];
};
export const smooth01 = (a, b, z) => { const t = Math.min(1, Math.max(0, (z - a) / (b - a))); return t * t * (3 - 2 * t); };
// stations: ranges [[z0, z1, step]...] merged with extra stops, sorted, unique
export function stationList(ranges, extra = []) {
  const s = new Set(); for (const [a, b, st] of ranges) { const n = Math.max(1, Math.round((b - a) / st)); for (let i = 0; i <= n; i++) s.add(+(a + (b - a) * i / n).toFixed(4)); }
  for (const e of extra) s.add(+e.toFixed(4)); return [...s].sort((p, q) => p - q);
}
export function stationKeys(zs, at) {
  return zs.map(z => { const p = at(z); return [z, p.T, p.B, p.W, p.ym, p.nT, p.nB, p.lean || 0, p.crown || 0]; });
}
// the half-width profile of a front view [{ y, left, right }] -> w(y) (mean of both sides, median-smoothed)
export function frontSampler(rows, opts) { return sampler(rows.map(r => ({ z: r.y, w: r.left != null && r.right != null ? (r.left + r.right) / 2 : null })).sort((a, b) => a.z - b.z), 'w', opts); }
