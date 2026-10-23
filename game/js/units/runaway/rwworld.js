// RUNAWAY ground forces: the WORLD QUERY the squad AI and the ground sims use, plus the sandbox island. Pure (no
// THREE, no DOM).
//
// makeWorldQuery({ height(x, z), water?(x, z), obstacles }) -> world, with
//   height(x, z), normal(x, z), isWater(x, z)
//   los(ax, ay, az, bx, by, bz)          -> true when nothing (terrain or obstacle) blocks the segment
//   raycast(ax, ay, az, bx, by, bz)      -> { t: 0..1, kind: 'terrain' | 'obstacle', ob } of the first hit, or null
//   coverPoints(x, z, r, out = [])       -> cover spots near (x, z): { x, z, y, h, nx, nz, ob } (n points away from the
//                                           obstacle: the obstacle protects against threats on the -n side)
//   coverScore(cp, tx, ty, tz)           -> how well cp hides a body from a threat at t (0 none .. 1 full) and whether it
//                                           can fire back from it: { hidden, canFire, low }
//   hullDown(x, z, tx, ty, tz, hullH, topH) -> true when the terrain masks the hull but not the turret top
//   steer(x, z, dx, dz, r)               -> a unit direction around obstacles toward (dx, dz) (local avoidance)
//   obstacles: [{ kind: 'box', x, z, hx, hz, yaw, h, y } | { kind: 'cyl', x, z, r, h, y }]
// Wave 2 builds one from main.js terrainH + war.js structures (see MODLOG: proposed integration).
//
// sandboxIsland(seed) -> { height, water, obstacles, trees, spawn: {...} } a 430 m island with a central ridge
// (slopes to ~27°), a farm plain with field walls, boulders, ruined crofts, a beach and a pine wood.

export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------------- query
export function makeWorldQuery(src) {
  const H = src.height, water = src.water || ((x, z) => H(x, z) < 0.2);
  const obs = src.obstacles || [];
  const CELL = 8, grid = new Map(), key = (i, j) => i * 73856093 ^ j * 19349663;
  for (const o of obs) {
    const R = o.kind === 'cyl' ? o.r : Math.hypot(o.hx, o.hz); o.R = R;
    if (o.y === undefined) o.y = H(o.x, o.z);
    if (o.kind === 'box') { o.c = Math.cos(o.yaw || 0); o.s = Math.sin(o.yaw || 0); }
    for (let i = Math.floor((o.x - R) / CELL); i <= Math.floor((o.x + R) / CELL); i++) for (let j = Math.floor((o.z - R) / CELL); j <= Math.floor((o.z + R) / CELL); j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(o); }
  }
  // the obstacles a 2D segment passes near (cells along it), each once
  let stamp = 1;
  function near(ax, az, bx, bz, pad, out) {
    out.length = 0; stamp++;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(L / (CELL * 0.5)));
    for (let s = 0; s <= n; s++) {
      const x = ax + dx * s / n, z = az + dz * s / n, i0 = Math.floor((x - pad) / CELL), i1 = Math.floor((x + pad) / CELL), j0 = Math.floor((z - pad) / CELL), j1 = Math.floor((z + pad) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = grid.get(key(i, j)); if (l) for (const o of l) if (o._s !== stamp) { o._s = stamp; out.push(o); } }
    }
    return out;
  }
  // segment vs obstacle: entry parameter t in [0, 1] or -1
  function hitOb(o, ax, ay, az, bx, by, bz) {
    let t0 = 0, t1 = 1, lax, laz, ldx, ldz;
    const dx = bx - ax, dz = bz - az;
    if (o.kind === 'cyl') {
      const fx = ax - o.x, fz = az - o.z, a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - o.r * o.r;
      if (a < 1e-9) { if (c > 0) return -1; } else {
        const D = b * b - 4 * a * c; if (D < 0) return -1;
        const sq = Math.sqrt(D); t0 = Math.max(t0, (-b - sq) / (2 * a)); t1 = Math.min(t1, (-b + sq) / (2 * a));
      }
    } else {
      // into the box frame (slab test on x / z)
      lax = (ax - o.x) * o.c - (az - o.z) * o.s; laz = (ax - o.x) * o.s + (az - o.z) * o.c;
      ldx = dx * o.c - dz * o.s; ldz = dx * o.s + dz * o.c;
      for (const [p, d, h] of [[lax, ldx, o.hx], [laz, ldz, o.hz]]) {
        if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) return -1; continue; }
        let u0 = (-h - p) / d, u1 = (h - p) / d; if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
        t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
      }
    }
    if (t0 > t1) return -1;
    // height: the segment must be below the top somewhere in [t0, t1]
    const top = o.y + o.h, y0 = ay + (by - ay) * t0, y1 = ay + (by - ay) * t1;
    if (Math.min(y0, y1) > top) return -1;
    if (Math.max(y0, y1) < o.y - 0.5) return -1;
    if (y0 <= top) return t0;
    return t0 + (t1 - t0) * (y0 - top) / ((y0 - y1) || 1e-9);
  }
  const _near = [];
  // terrain march: first parameter where the segment goes under the ground (with 0.05 m slack)
  function terrainHit(ax, ay, az, bx, by, bz, skip0 = 0.4, skip1 = 0.4) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 1.2));
    for (let i = 1; i < n; i++) {
      const t = i / n, d = t * L; if (d < skip0 || L - d < skip1) continue;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      if (y < H(x, z) - 0.05) return t;
    }
    return -1;
  }
  const W = {
    height: H, isWater: water, obstacles: obs,
    normal(x, z, e = 0.5) { const hx = H(x + e, z) - H(x - e, z), hz = H(x, z + e) - H(x, z - e), nx = -hx / (2 * e), nz = -hz / (2 * e), l = Math.hypot(nx, 1, nz); return [nx / l, 1 / l, nz / l]; },
    los(ax, ay, az, bx, by, bz) {
      if (terrainHit(ax, ay, az, bx, by, bz) >= 0) return false;
      for (const o of near(ax, az, bx, bz, 3, _near)) if (hitOb(o, ax, ay, az, bx, by, bz) >= 0) return false;
      return true;
    },
    raycast(ax, ay, az, bx, by, bz) {
      let best = null, tt = terrainHit(ax, ay, az, bx, by, bz, 0, 0);
      if (tt >= 0) best = { t: tt, kind: 'terrain', ob: null };
      for (const o of near(ax, az, bx, bz, 3, _near)) { const t = hitOb(o, ax, ay, az, bx, by, bz); if (t >= 0 && (!best || t < best.t)) best = { t, kind: 'obstacle', ob: o }; }
      return best;
    },
    coverPoints(x, z, r, out = []) {
      out.length = 0;
      for (const o of near(x - r, z, x + r, z, r + 4, _near)) for (const cp of o.cover) if (Math.hypot(cp.x - x, cp.z - z) < r) out.push(cp);
      return out;
    },
    // how a body at cover point cp fares against a threat at (tx, ty, tz): hidden = the body (crouched) is masked;
    // canFire = it can shoot back by standing / peeking
    coverScore(cp, tx, ty, tz, crouchH = 0.9, standH = 1.85) {
      const dx = tx - cp.x, dz = tz - cp.z, d = Math.hypot(dx, dz) || 1, facing = -(dx * cp.nx + dz * cp.nz) / d;   // > 0: obstacle is between
      const hidden = facing > 0.3 && !W.los(tx, ty, tz, cp.x, cp.y + crouchH * 0.75, cp.z);
      let canFire = W.los(cp.x, cp.y + standH, cp.z, tx, ty, tz);
      if (!canFire && cp.h > 1.6) {   // tall cover: peek around the side
        const px = -cp.nz, pz = cp.nx;
        for (const s of [1, -1]) if (W.los(cp.x + px * s * 0.9, cp.y + 1.6, cp.z + pz * s * 0.9, tx, ty, tz)) { canFire = true; break; }
      }
      return { hidden, canFire, low: cp.h < 1.6, facing };
    },
    hullDown(x, z, tx, ty, tz, hullH = 1.2, topH = 2.4) {
      const y = H(x, z);
      return !W.los(tx, ty, tz, x, y + hullH, z) && W.los(x, y + topH, z, tx, ty, tz);
    },
    // local avoidance: steer the direction (dx, dz) around obstacles within `look` m (and away from water)
    steer(x, z, dx, dz, rad = 0.6, look = 6) {
      let l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, sx = ux, sz = uz;
      for (const o of near(x, z, x + ux * look, z + uz * look, rad + 3, _near)) {
        const ox = o.x - x, oz = o.z - z, along = ox * ux + oz * uz; if (along < -1 || along > look + o.R) continue;
        const R = o.R + rad + 0.4, perp = ox * -uz + oz * ux;
        if (Math.abs(perp) < R && Math.hypot(ox, oz) < look + R) { const side = perp > 0 ? -1 : 1, k = (R - Math.abs(perp)) / R * (1 - clamp(along / (look + R), 0, 1)) * 2.2; sx += -uz * side * k; sz += ux * side * k; }
        const d = Math.hypot(ox, oz); if (d < R) { sx -= ox / d * (R - d); sz -= oz / d * (R - d); }   // already too close: push out
      }
      if (water(x + ux * 4, z + uz * 4)) { const n = W.normal(x, z); sx += n[0] * 3; sz += n[2] * 3; }
      l = Math.hypot(sx, sz) || 1; return [sx / l, sz / l];
    },
  };
  // cover spots round every obstacle
  for (const o of obs) {
    o.cover = [];
    const push = (px, pz, nx, nz) => { if (water(px, pz)) return; const cp = { x: px, z: pz, y: H(px, pz), h: o.h + o.y - H(px, pz), nx, nz, ob: o, taken: null }; if (cp.h > 0.7) o.cover.push(cp); };
    if (o.kind === 'cyl') { const n = Math.max(5, Math.round(o.r * 4)); for (let k = 0; k < n; k++) { const a = k / n * 2 * Math.PI, nx = Math.cos(a), nz = Math.sin(a); push(o.x + nx * (o.r + 0.7), o.z + nz * (o.r + 0.7), nx, nz); } }
    else for (const [ax, h1, h2] of [[0, o.hx, o.hz], [1, o.hz, o.hx]]) {
      // faces normal to local x (ax 0) and local z (ax 1); points along each face every ~2 m
      const n = Math.max(1, Math.round(h2 * 2 / 2.2));
      for (const sgn of [1, -1]) for (let k = 0; k < n; k++) {
        const u = -h2 + (k + 0.5) * 2 * h2 / n;
        const lx = ax === 0 ? sgn * (h1 + 0.7) : u, lz = ax === 0 ? u : sgn * (h1 + 0.7);
        const wx = o.x + lx * o.c + lz * o.s, wz = o.z - lx * o.s + lz * o.c;
        const nlx = ax === 0 ? sgn : 0, nlz = ax === 0 ? 0 : sgn;
        push(wx, wz, nlx * o.c + nlz * o.s, -nlx * o.s + nlz * o.c);
      }
    }
  }
  W.allCover = obs.flatMap(o => o.cover);
  return W;
}

// ------------------------------------------------------------------------------------------------- sandbox island
export function sandboxIsland(seed = 1980) {
  const R = 215;
  const ridge = (x, z) => {   // a NE-SW ridge with a saddle, and a knoll in the east
    const u = (x * 0.8 + z * 0.6), v = (-x * 0.6 + z * 0.8);
    return 21 * Math.exp(-(((v - 20) / 44) ** 2)) * (0.75 + 0.25 * Math.cos(u * 0.03)) * sstep(-190, -60, u) * (1 - sstep(80, 190, u))
      + 12 * Math.exp(-((x - 95) ** 2 + (z + 60) ** 2) / 1100);
  };
  const lumps = (x, z) => 1.7 * Math.sin(x * 0.07 + 1.1) * Math.cos(z * 0.06) + 0.8 * Math.sin(x * 0.13 - z * 0.11) + 0.22 * Math.sin(x * 0.31 + z * 0.23);
  const height = (x, z) => {
    const d = Math.hypot(x, z * 1.08) + 9 * Math.sin(Math.atan2(z, x) * 5 + 0.6), m = 1 - sstep(R * 0.74, R, d);
    return -7 + m * (9.5 + ridge(x, z) + lumps(x, z) * sstep(0, 30, d));
  };
  const r = rng(seed), obstacles = [], trees = [];
  const dry = (x, z, min = 1.2) => height(x, z) > min;
  // field walls on the southern plain (dry-stone, 1.05 m), in broken rectangles
  for (let f = 0; f < 7; f++) {
    const cx = -110 + f * 34 + r() * 14, cz = 40 + r() * 70, w = 18 + r() * 16, d = 14 + r() * 14, yaw = r() * 0.5 - 0.25;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const [lx, lz, hx, hz] of [[0, -d / 2, w / 2, 0.3], [0, d / 2, w / 2, 0.3], [-w / 2, 0, 0.3, d / 2], [w / 2, 0, 0.3, d / 2]]) {
      if (r() < 0.25) continue;   // a gap
      const gap = r() < 0.5, len = gap ? 0.45 : 1;
      const x = cx + lx * c + lz * s, z = cz - lx * s + lz * c;
      if (dry(x, z)) obstacles.push({ kind: 'box', x, z, hx: hx * (hx > 1 ? len : 1), hz: hz * (hz > 1 ? len : 1), yaw, h: 1.05, mat: 'wall' });
    }
  }
  // ruined crofts (stone shells, 2.6 m) near the plain and one on the saddle
  for (const [x, z, yaw] of [[-40, 95, 0.3], [30, 130, -0.2], [-95, 120, 1.2], [-20, -10, 0.7], [70, 60, 0.1]]) if (dry(x, z)) obstacles.push({ kind: 'box', x, z, hx: 3.2 + r(), hz: 4.2 + r(), yaw, h: 2.6, mat: 'croft' });
  // boulders scattered over the slopes
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = 20 + r() * 150, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!dry(x, z, 1.5)) continue;
    const rr = 0.8 + r() * 1.6; obstacles.push({ kind: 'cyl', x, z, r: rr, h: 0.9 + rr * (0.6 + r() * 0.5), mat: 'rock', seed: r() });
  }
  // a pine wood on the north slope (concealment; trunks are thin)
  for (let i = 0; i < 90; i++) { const x = -90 + r() * 120, z = -150 + r() * 70; if (dry(x, z, 2)) trees.push({ x, z, h: 7 + r() * 5, r: 1.4 + r() * 0.8 }); }
  return { height, water: (x, z) => height(x, z) < 0.15, obstacles, trees, R,
    spawn: { rw: [[-40, -125], [0, -135], [40, -125]], tf: [[-60, 105], [0, 120], [55, 95]], pad: [0, 30] } };
}
