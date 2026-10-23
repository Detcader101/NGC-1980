// Terrain worker: bakes the world outside the control zone into heightmaps (and scatters forest trees) off the main
// thread, from world.js's exact height function, so what you see is what the physics collides with.
//   in:  { id, ox, oz, n, c, trees }   heightmap n x n at c metres from (ox, oz); trees: also scatter forest trees
//   out: { id, ox, oz, n, c, h: Float32Array, trees: Float32Array [x, y, z, scale, ...] | null }
import { islandH, rawH, forestAt, BOUND } from './world.js';
import { clearedAt } from './world/net.js';   // the lived-in world: roads, towns, fields and yards are kept clear of forest
const hash = (i, j) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
onmessage = ({ data: q }) => {
  const { n, c, ox, oz } = q, h = new Float32Array(n * n);
  // the near window carries the road beds and building platforms (islandH); the 16 m far window can't show a road
  // anyway, so it bakes the natural ground (rawH) and skips generating the towns of an 8 km square
  const H = c > 8 ? rawH : islandH;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = H(ox + i * c, oz + j * c);
  let trees = null;
  if (q.trees) {   // a jittered 12 m grid, fixed in the world (the same trees every time you come back)
    const S = 12, out = [], i0 = Math.ceil(ox / S), i1 = Math.floor((ox + (n - 1) * c) / S), j0 = Math.ceil(oz / S), j1 = Math.floor((oz + (n - 1) * c) / S);
    for (let j = j0; j <= j1 && out.length < q.trees * 4; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + hash(i, j) * 0.9) * S, z = (j + hash(j, i * 7 + 3) * 0.9) * S;
      if (Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300) continue;
      const y = islandH(x, z); if (y < 3) continue;
      const sy = 2 / Math.hypot(2, islandH(x + 2, z) - y, islandH(x, z + 2) - y);
      if (!forestAt(x, z, y, sy) || hash(i * 3 + 1, j) < 0.35 || clearedAt(x, z)) continue;
      out.push(x, y, z, 2 + hash(i + 11, j * 5) * 1.6);
      if (out.length >= q.trees * 4) break;
    }
    trees = new Float32Array(out);
  }
  postMessage({ id: q.id, ox, oz, n, c, h, trees }, trees ? [h.buffer, trees.buffer] : [h.buffer]);
};
