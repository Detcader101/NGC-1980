// THE GROUND WAR: one battle map per island. Pure (no THREE, no DOM): runs in node (tools/groundwarbench.mjs).
//
// The machines' squad AI (runaway/squadai.js) and the Marines' (marineai.js) ask the world thousands of questions a
// second: ground height, line of sight, cover. The game's terrain function is analytic and not cheap (islands, pads,
// road beds), so each island gets a height grid baked a few rows per frame (budgeted, no hitch) the first time a battle
// needs it; until it is done the live terrain function answers. The obstacles (the island's faction structures and
// its AA sites) change as things are built and destroyed, so the RUNAWAY world query (rwworld.makeWorldQuery) is
// rebuilt when they do, behind a stable facade the AIs keep a reference to.
//
//   const maps = createIslandMaps({ terrainH, islands })
//   const M = maps.get(I)          M.height(x, z), M.world (facade: height normal isWater los raycast coverPoints
//                                  coverScore hullDown steer), M.inside(x, z), M.ready
//   maps.tick(ms)                  bake rows within a time budget (call every frame)
//   maps.setObstacles(I, list)     [{ kind: 'box', x, z, hx, hz, yaw, h, mat } | { kind: 'cyl', x, z, r, h, mat }]
import { makeWorldQuery } from '../runaway/rwworld.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createIslandMaps(o) {
  const { terrainH, islands } = o, RES = o.res ?? 2, PAD = o.pad ?? 50;
  const maps = new Map(), queue = [];
  function make(I) {
    const half = I.r + PAD, x0 = I.x - half, z0 = I.z - half, n = Math.ceil(2 * half / RES) + 1;
    const grid = new Float32Array(n * n);
    const M = { I, x0, z0, n, half, grid, rows: 0, ready: false, obstacles: [], key: '', inner: null };
    M.inside = (x, z) => x > x0 && z > z0 && x < x0 + (n - 1) * RES && z < z0 + (n - 1) * RES;
    M.height = (x, z) => {
      if (!M.ready) return terrainH(x, z);
      const fx = (x - x0) / RES, fz = (z - z0) / RES, i = Math.floor(fx), j = Math.floor(fz);
      if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return terrainH(x, z);
      const u = fx - i, v = fz - j, k = j * n + i;
      return grid[k] * (1 - u) * (1 - v) + grid[k + 1] * u * (1 - v) + grid[k + n] * (1 - u) * v + grid[k + n + 1] * u * v;
    };
    M.water = (x, z) => M.height(x, z) < 0.35;
    // the facade: AIs hold this object; its methods go to whichever query is current
    const cur = () => M.inner || (M.inner = makeWorldQuery({ height: M.height, water: M.water, obstacles: M.obstacles }));
    M.world = {
      height: (x, z) => M.height(x, z), isWater: (x, z) => M.water(x, z),
      get obstacles() { return cur().obstacles; }, get allCover() { return cur().allCover; },
      normal: (x, z, e) => cur().normal(x, z, e),
      los: (ax, ay, az, bx, by, bz) => cur().los(ax, ay, az, bx, by, bz),
      raycast: (ax, ay, az, bx, by, bz) => cur().raycast(ax, ay, az, bx, by, bz),
      coverPoints: (x, z, r, out) => cur().coverPoints(x, z, r, out),
      coverScore: (cp, tx, ty, tz, c, s) => cur().coverScore(cp, tx, ty, tz, c, s),
      hullDown: (x, z, tx, ty, tz, a, b) => cur().hullDown(x, z, tx, ty, tz, a, b),
      steer: (x, z, dx, dz, r, look, g) => cur().steer(x, z, dx, dz, r, look, g),
    };
    maps.set(I, M); queue.push(M);
    return M;
  }
  const api = {
    get: I => maps.get(I) || make(I),
    has: I => maps.has(I),
    // the island a point is on (its bake box), or null
    at(x, z) { let best = null, bd = 1e9; for (const I of islands) { const d = Math.hypot(x - I.x, z - I.z); if (d < I.r + PAD * 0.6 && d < bd) { bd = d; best = I; } } return best; },
    tick(ms = 2) {
      const t0 = now();
      while (queue.length) {
        const M = queue[0];
        const n = M.n;
        while (M.rows < n) {
          const j = M.rows++, z = M.z0 + j * RES;
          for (let i = 0; i < n; i++) M.grid[j * n + i] = terrainH(M.x0 + i * RES, z);
          if (now() - t0 > ms) return false;
        }
        M.ready = true; M.inner = null; queue.shift();   // (cover points and obstacle bases re-read from the grid)
      }
      return true;
    },
    // bake everything now (node bench, tests)
    bakeAll() { while (!api.tick(1e9)); },
    setObstacles(I, list) {
      const M = api.get(I);
      const key = list.map(o => `${o.kind}${Math.round(o.x)},${Math.round(o.z)},${o.h}`).join('|');
      if (key === M.key && M.inner) return false;
      M.key = key; M.obstacles = list.map(o => ({ ...o, y: undefined })); M.inner = null;
      return true;
    },
    maps,
  };
  return api;
}
