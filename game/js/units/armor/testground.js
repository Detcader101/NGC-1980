// testground.js - the armour test ground: a pure environment (trackfm's interface) used by tools/tankbench.mjs and
// game/dev/tank.html. Axis-aligned features so the render grid can put exact edges on them:
//   - a paved road (x -6..6) running north-south; the start area at z +40
//   - obstacle lanes east of the road, all crossing z -40: A step 0.91 m (x 20..32), B trench 2.6 m wide x 2 m deep
//     (x 36..48), C 60 % concrete ramp to a 4 m plateau (x 52..64), D a ridge with 30 % faces (x 68..84, 2.4 m high),
//     E 1.2 m step (x 88..100, too high), F 3.4 m trench (x 104..116, too wide)
//   - soft ground west: mud (x -60..-30, z -40..0), bog (x -60..-30, z -80..-50), sand (x -60..-30, z 10..50)
//   - water further west: a ford 1.2 m deep (x -100..-80) dropping into a 4 m deep lake (x -150..-100), banks 25 %
//   - cross-country bumps (x 130..230, z -120..120) for the stabiliser
//   - a firing range north: flat, targets at 500 / 1000 / 1500 / 2000 m (z = 40 - range), trees along the west edge
// World: x east, y up, z south. Ground level 0.5 (water surface 0).
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const G0 = 0.5;
const inside = (x, z, x0, x1, z0, z1) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const smooth = t => t * t * (3 - 2 * t);

export const FEATURES = {
  road: [-6, 6, -2200, 200],
  stepA: { x: [20, 32], z: -40, h: 0.91 }, trenchB: { x: [36, 48], z0: -42.6, z1: -40, d: 2.0 },
  rampC: { x: [52, 64], z0: -40, rise: 4, grade: 0.6, len: 8 }, sideD: { x: [68, 84], z: [-70, -10], grade: 0.3 },
  stepE: { x: [88, 100], z: -40, h: 1.2 }, trenchF: { x: [104, 116], z0: -43.4, z1: -40, d: 2.0 },
  mud: [-60, -30, -40, 0], bog: [-60, -30, -80, -50], sand: [-60, -30, 10, 50],
  ford: [-100, -80, -60, 60], lake: [-150, -100, -60, 60], bank: 0.25,
  bumps: [130, 230, -120, 120],
};
export const TARGETS = [500, 1000, 1500, 2000].flatMap((r, i) => [
  { id: 'panel' + r, kind: 'panel', x: -8 + i * 5, z: 40 - r, w: 3.4, h: 2.4, range: r },
  { id: 'hulk' + r, kind: 'hulk', x: 12 + i * 4, z: 40 - r - 6, w: 3.6, h: 2.3, l: 6.8, range: r },
]);
export const TREES = [];
for (let i = 0; i < 60; i++) { const z = 120 - i * 7.3, x = -175 + Math.sin(i * 2.7) * 10; TREES.push({ kind: 'cyl', x, z, r: 0.25, top: G0 + 9, id: 'tree' + i, breakN: 4.5e5, h: 8 + (i % 5) }); }

// ground height
export function height(x, z) {
  const F = FEATURES;
  let h = G0;
  // gentle undulation outside the lanes (keeps the ground believable but drivable)
  if (!inside(x, z, -8, 120, -80, 60) && !inside(x, z, -160, -20, -90, 70) && !inside(x, z, -60, 60, -2200, 60)) h += 0.6 * Math.sin(x * 0.021) * Math.sin(z * 0.017) + 0.25 * Math.sin(x * 0.07 + z * 0.05);
  // lanes
  const A = F.stepA; if (x >= A.x[0] && x <= A.x[1] && z < A.z && z > A.z - 30) h = G0 + A.h;
  const E = F.stepE; if (x >= E.x[0] && x <= E.x[1] && z < E.z && z > E.z - 30) h = G0 + E.h;
  const B = F.trenchB; if (x >= B.x[0] && x <= B.x[1] && z > B.z0 && z < B.z1) h = G0 - B.d;
  const Ft = F.trenchF; if (x >= Ft.x[0] && x <= Ft.x[1] && z > Ft.z0 && z < Ft.z1) h = G0 - Ft.d;
  const C = F.rampC; if (x >= C.x[0] && x <= C.x[1] && z < C.z0) { const d = C.z0 - z, up = C.rise / C.grade; h = G0 + (d < up ? d * C.grade : d < up + C.len ? C.rise : d < 2 * up + C.len ? C.rise - (d - up - C.len) * C.grade : 0); }
  const D = F.sideD; if (x >= D.x[0] && x <= D.x[1] && z >= D.z[0] && z <= D.z[1]) h = G0 + ((D.x[1] - D.x[0]) / 2 - Math.abs(x - (D.x[0] + D.x[1]) / 2)) * D.grade;   // a 30 % ridge: drive along either face
  // water: ford (1.2 m), lake (4 m), sloped banks
  const fd = F.ford, lk = F.lake, bk = F.bank;
  if (z > fd[2] && z < fd[3] && x < fd[1] + (G0 + 1.2) / bk && x > lk[0] - (G0 + 4) / bk) {
    // bed profile west-east: bank down into the 1.2 m ford, ford floor, drop into the 4 m lake, lake floor, west bank
    let t;
    if (x > fd[1]) t = Math.min(G0, -1.2 + (x - fd[1]) * bk);
    else if (x > fd[0]) t = -1.2;
    else if (x > lk[0]) t = Math.max(-4, -1.2 - (fd[0] - x) * bk * 2);   // the ford's west edge drops into the lake
    else t = Math.min(G0, -4 + (lk[0] - x) * bk);
    // north and south banks
    const ez = Math.min(z - fd[2], fd[3] - z);
    t = Math.max(t, G0 - ez * bk);
    h = Math.min(h, t);
  }
  // cross-country bumps
  const bu = F.bumps; if (inside(x, z, bu[0], bu[1], bu[2], bu[3])) { const e = smooth(clamp(Math.min(x - bu[0], bu[1] - x, z - bu[2], bu[3] - z) / 10, 0, 1)); h += e * (0.24 * Math.sin(z * 0.45 + 0.7 * Math.sin(x * 0.11)) + 0.1 * Math.sin(z * 1.05 + x * 0.31) + 0.08 * Math.sin(x * 0.83 - z * 0.2)); }
  return h;
}
export function surface(x, z) {
  const F = FEATURES;
  if (inside(x, z, ...F.road)) return 'paved';
  // (the step lanes are earth banks: a field obstacle course, not a concrete wall)
  const C = F.rampC; if (x >= C.x[0] && x <= C.x[1] && z < C.z0 + 4 && z > C.z0 - 30) return 'paved';
  if (inside(x, z, ...F.mud)) return 'mud';
  if (inside(x, z, ...F.bog)) return 'bog';
  if (inside(x, z, ...F.sand)) return 'sand';
  if (x < F.ford[1] + 8 && x > F.lake[0] - 20 && z > F.ford[2] - 6 && z < F.ford[3] + 6) return 'sand';
  if (inside(x, z, -60, 60, -2200, 60)) return 'dirt';
  return 'grass';
}
export function water(x, z) { const F = FEATURES; return x < F.ford[1] + 10 && x > F.lake[0] - 20 && z > F.ford[2] - 2 && z < F.ford[3] + 2 ? 0 : -Infinity; }
// obstacles near (x, z): the trees (cylinders) and the target hulks (boxes)
const HULKS = TARGETS.filter(t => t.kind === 'hulk').map(t => ({ kind: 'box', x: t.x, z: t.z, hx: t.w / 2, hz: t.l / 2, yaw: 0, top: G0 + t.h, id: t.id }));
export function obstacles(x, z, r) {
  const out = [];
  for (const t of TREES) if (Math.abs(t.x - x) < r + 1 && Math.abs(t.z - z) < r + 1 && t.top > 0) out.push(t);
  for (const t of HULKS) if (Math.abs(t.x - x) < r + 4 && Math.abs(t.z - z) < r + 4) out.push(t);
  return out;
}
// laser / shell ray: first hit with the targets, trees or the ground. o, d world; returns distance or null
export function raycast(o, d, max = 5000, skipId = null) {
  let best = null;
  for (const t of TARGETS) {
    if (t.id === skipId) continue;
    const hit = rayTarget(t, o, d); if (hit != null && hit < max && (best == null || hit < best)) best = hit;
  }
  // ground: march (coarse then refine)
  let prev = 0, step = 2;
  for (let s = 2; s < Math.min(max, best ?? max); s += step) {
    const x = o[0] + d[0] * s, y = o[1] + d[1] * s, z = o[2] + d[2] * s;
    if (y < height(x, z)) { let a = prev, b = s; for (let k = 0; k < 10; k++) { const m = (a + b) / 2; if (o[1] + d[1] * m < height(o[0] + d[0] * m, o[2] + d[2] * m)) b = m; else a = m; } best = b; break; }
    prev = s; step = Math.min(10, 2 + s * 0.01);
  }
  return best;
}
export function rayTarget(t, o, d) {
  // panels: a vertical plate facing south (+z); hulks: a box
  const hx = t.w / 2, hz = t.kind === 'panel' ? 0.05 : t.l / 2, y0 = G0, y1 = G0 + t.h;
  let t0 = 0, t1 = 1e9;
  for (const [oc, dc, lo, hi] of [[o[0], d[0], t.x - hx, t.x + hx], [o[1], d[1], y0, y1], [o[2], d[2], t.z - hz, t.z + hz]]) {
    if (Math.abs(dc) < 1e-9) { if (oc < lo || oc > hi) return null; continue; }
    let a = (lo - oc) / dc, b = (hi - oc) / dc; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return null;
  }
  return t0;
}
// grid lines for the render mesh: uniform spacing plus every feature edge (both sides)
export function gridLines(lo, hi, step, axis) {
  const F = FEATURES, s = new Set();
  for (let v = lo; v <= hi + 1e-6; v += step) s.add(+v.toFixed(3));
  const edges = axis === 'x'
    ? [...F.road.slice(0, 2), ...F.stepA.x, ...F.trenchB.x, ...F.rampC.x, ...F.sideD.x, ...F.stepE.x, ...F.trenchF.x, ...F.mud.slice(0, 2), ...F.bog.slice(0, 2), ...F.sand.slice(0, 2), ...F.ford.slice(0, 2), ...F.lake.slice(0, 2)]
    : [F.stepA.z, F.trenchB.z0, F.trenchB.z1, F.trenchF.z0, F.trenchF.z1, F.rampC.z0, F.rampC.z0 - F.rampC.rise / F.rampC.grade, F.rampC.z0 - F.rampC.rise / F.rampC.grade - F.rampC.len, F.rampC.z0 - 2 * F.rampC.rise / F.rampC.grade - F.rampC.len, ...F.sideD.z, F.stepA.z - 30, ...F.mud.slice(2), ...F.bog.slice(2), ...F.sand.slice(2), ...F.ford.slice(2)];
  for (const e of edges) if (e > lo && e < hi) { s.add(+(e - 0.02).toFixed(3)); s.add(+(e + 0.02).toFixed(3)); }
  return [...s].sort((a, b) => a - b);
}
export const ENV = { height, surface, water, obstacles, raycast };
