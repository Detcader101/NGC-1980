// landinghard.js - LANDING HARDS: a concrete slipway on each island where a landing craft can put armour ashore (wave 2).
// The archipelago's coasts are cliffs (a 1.0-2.6 rise per metre in the first 26 m inland almost everywhere: built for
// helicopters), so the task force's engineers have cut a hard on each island: a straight ramp at 1 in 5 from 2 m under
// the sea up to the island's own ground, 9 m wide, with 45 degree cut and fill slopes. It is part of the terrain
// (main.js folds it into terrainH, so the ground, the soldier, the tanks, the war and the renderer all agree), drawn with a
// concrete strip on top (buildHardMesh in lcm8.js). PURE: no THREE.
//
//   const HARDS = planHards(ISLANDS, terrainH0, { pads, holes, cleared(x, z) })   once, before terrainH is used
//   hardsH(HARDS, x, z, h)  -> the height with the hards cut / filled in       (cheap: a box reject per hard)
//   hard: { I, name, x, z (the waterline point), fx, fz (inland unit), g (grade), u0, u1 (ends, m along from the waterline),
//           y0 (height at u0), w (core half width), at(u, lat) -> [x, z], y(u) }
export const HARD = { G: 0.2, U0: -16, Y0: -2.2, W: 4.5, K: 1.0, MAXCOST: 16, MAXLEN: 110 };

export function planHards(islands, H, o = {}) {
  const out = [];
  for (const I of islands) {
    const cands = [], keep = o.keepOut ? o.keepOut(I) : [];
    for (let k = 0; k < 120; k++) {
      const a = k * Math.PI / 60, cx = Math.cos(a), sz = Math.sin(a);
      let shore = -1; for (let r = 6; r < (I.r || 80) + 180; r += 1) if (H(I.x + cx * r, I.z + sz * r) < 0) { shore = r; break; }
      if (shore < 0) continue;
      const fx = -cx, fz = -sz, x0 = I.x + cx * shore, z0 = I.z + sz * shore;   // inland = toward the centre
      const ramp = u => HARD.Y0 + HARD.G * (u - HARD.U0);
      const pt = (u, lat) => [x0 + fx * u - fz * lat, z0 + fz * u + fx * lat];
      let u1 = -1, cost = 0, ok = true;
      for (let u = HARD.U0; u <= HARD.MAXLEN && ok; u += 2) {
        const [x, z] = pt(u, 0), n = H(x, z), r = ramp(u);
        if (u > 2 && n <= r + 0.3) {   // the ramp has come up to the island's ground: is it fit to drive on from there?
          const [x2, z2] = pt(u + 8, 0), s = Math.abs(H(x2, z2) - n) / 8;
          if (s < 0.3) { u1 = u; break; }
        }
        let c = Math.abs(n - r);
        for (const lat of [-HARD.W, HARD.W]) { const [xl, zl] = pt(u, lat); c = Math.max(c, Math.abs(H(xl, zl) - r)); }
        cost = Math.max(cost, c);
        if (cost > HARD.MAXCOST) ok = false;
        for (const p of o.pads || []) if (Math.hypot(x - p.x, z - p.z) < 36) ok = false;   // the pad, its HQ, works and AA ring (17-22 m)
        for (const q of keep) if (Math.hypot(x - q.x, z - q.z) < q.r) ok = false;
        for (const b of o.holes || []) if (Math.hypot(x - b.x, z - b.z) < 30) ok = false;
      }
      if (!ok || u1 < 0) continue;
      cands.push({ I, name: `${I.name} HARD`, x: x0, z: z0, fx, fz, g: HARD.G, u0: HARD.U0, u1, y0: HARD.Y0, w: HARD.W, score: cost + u1 * 0.04, cost, pt });
    }
    // the best one that keeps off the village and its roads (the costly check, so only on the candidates)
    cands.sort((a, b) => a.score - b.score);
    const best = cands.find(c => { if (!o.cleared) return true; for (let u = -2; u <= c.u1 + 4; u += 2) for (const lat of [-c.w - 2, 0, c.w + 2]) { const [x, z] = c.pt(u, lat); if (o.cleared(x, z)) return false; } return true; });
    if (best) { delete best.pt; finish(best); out.push(best); }
  }
  return out;
}
function finish(h) {
  h.y = u => h.y0 + h.g * (Math.min(h.u1, Math.max(h.u0, u)) - h.u0);
  h.at = (u, lat = 0) => [h.x + h.fx * u - h.fz * lat, h.z + h.fz * u + h.fx * lat];
  // a box round the core and its slopes for a quick reject
  const r = 2 + h.cost + h.w, ends = [h.at(h.u0 - r), h.at(h.u1 + r)];
  h.bx0 = Math.min(ends[0][0], ends[1][0]) - r; h.bx1 = Math.max(ends[0][0], ends[1][0]) + r;
  h.bz0 = Math.min(ends[0][1], ends[1][1]) - r; h.bz1 = Math.max(ends[0][1], ends[1][1]) + r;
  h.yaw = Math.atan2(-h.fx, -h.fz);   // the craft convention: facing inland (forward = (-sin yaw, -cos yaw))
  return h;
}
// the terrain with the hards: in the core (|lat| <= w, u0..u1) the ramp; outside it the ground is held within a 45
// degree slope of the ramp's edge (a cutting through high ground, an embankment over low ground or the sea bed)
export function hardsH(hards, x, z, h) {
  for (let i = 0; i < hards.length; i++) {
    const H = hards[i];
    if (x < H.bx0 || x > H.bx1 || z < H.bz0 || z > H.bz1) continue;
    const dx = x - H.x, dz = z - H.z, u = dx * H.fx + dz * H.fz, lat = -dx * H.fz + dz * H.fx;
    const d = Math.max(0, Math.abs(lat) - H.w, H.u0 - u, u - H.u1), ref = H.y(u), m = HARD.K * d;
    if (h > ref + m) h = ref + m; else if (h < ref - m) h = ref - m;
  }
  return h;
}
