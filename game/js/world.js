// The archipelago: open sea with islands. Every height query (JS physics and the GLSL terrain shader) comes from the
// same island list, so what you see is what you collide with. Islands are static; who owns them is game state (war.js).
//
// kinds:  hq        - a side's headquarters island; has a cave (home reservoir / enemy fortress). Taken only via its cave.
//         fortress  - enemy-held cave fortress: steal its pod (the command core) from the cave to take the island.
//         fuel      - oil derricks: fuel for the fleet's stores
//         factory   - materiel for drones, guns and helicopters (enemy factories also build the battleship)
//         radar     - long-range sight through the fog of war
export const BOUND = 640, SEA_FLOOR = -14;
export const ISLANDS = [
  { name: 'HOME ISLAND', kind: 'hq', owner: 1, x: -420, z: 400, r: 130, tier: 0 },
  { name: 'IRONHOLD', kind: 'hq', owner: 2, x: 420, z: -400, r: 130, tier: 4 },
  { name: 'NORTH ROCK', kind: 'fortress', owner: 2, x: -400, z: -360, r: 112, tier: 1 },
  { name: 'SOUTH REEF', kind: 'fortress', owner: 2, x: 400, z: 360, r: 112, tier: 2 },
  { name: 'CITADEL', kind: 'fortress', owner: 2, x: 0, z: 0, r: 122, tier: 3 },
  { name: 'PELICAN', kind: 'fuel', owner: 1, x: -170, z: 480, r: 62 },
  { name: 'ANVIL', kind: 'factory', owner: 2, x: 170, z: -480, r: 62 },
  { name: 'LOOKOUT', kind: 'radar', owner: 0, x: -540, z: 110, r: 58 },
  { name: 'BEACON', kind: 'radar', owner: 0, x: 540, z: -110, r: 58 },
  { name: 'FORGE', kind: 'factory', owner: 0, x: -210, z: 190, r: 66 },
  { name: 'CINDER', kind: 'factory', owner: 0, x: 210, z: -190, r: 66 },
  { name: 'WELLSPRING', kind: 'fuel', owner: 0, x: -150, z: -230, r: 60 },
  { name: 'SANDBAR', kind: 'fuel', owner: 0, x: 150, z: 230, r: 60 },
  { name: 'DRIFTWOOD', kind: 'factory', owner: 0, x: -560, z: -130, r: 56 },
  { name: 'KILN', kind: 'factory', owner: 0, x: 560, z: 130, r: 56 },
  { name: 'SPIRE', kind: 'radar', owner: 0, x: -60, z: -560, r: 54 },
  { name: 'ECHO', kind: 'radar', owner: 0, x: 60, z: 560, r: 54 },
];
ISLANDS.forEach((I, i) => { I.id = i; I.cave = I.kind === 'hq' || I.kind === 'fortress'; });

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
// rolling hills (the original Zarch landscape), only raised where there is an island
const hills = (x, z) => 14 * Math.sin(x * .035 + 1.3) * Math.cos(z * .04) + 9 * Math.sin(x * .09 + z * .07) + 5 * Math.sin(z * .13 - x * .05) + 2.5 * Math.sin(x * .31) * Math.sin(z * .27) + 8;
const wobble = (x, z) => 14 * Math.sin(x * .045 + z * .03) + 9 * Math.sin(z * .071 - x * .052);   // ragged coastlines
export function landMask(x, z) {
  const w = wobble(x, z); let m = 0;
  for (const I of ISLANDS) { const d = Math.hypot(x - I.x, z - I.z) + w; if (d < I.r) m = Math.max(m, 1 - sm(I.r * 0.55, I.r, d)); }
  return m;
}
// Beyond the archipelago (the operating area, where the war is) the sea goes on forever, scattered with wild islands.
// Each WCELL grid cell may hold one, picked by a hash of the cell: the same islands every run, no edge anywhere.
export const WCELL = 460, WILD_MIN = BOUND + 160;
const hash = (i, j, k) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const _wild = new Map();
export function wildIsland(i, j) {
  const key = i * 131072 + j; let I = _wild.get(key);
  if (I === undefined) {
    I = null;
    if (hash(i, j, 1) < 0.42) {
      const x = (i + 0.2 + 0.6 * hash(i, j, 2)) * WCELL, z = (j + 0.2 + 0.6 * hash(i, j, 3)) * WCELL, r = 45 + 140 * hash(i, j, 4) ** 1.5;
      if (Math.max(Math.abs(x), Math.abs(z)) - r > WILD_MIN) I = { x, z, r, hs: 0.55 + 0.9 * hash(i, j, 5), seed: (hash(i, j, 6) * 4294967296) >>> 0 };
    }
    if (_wild.size > 50000) _wild.clear(); _wild.set(key, I);
  }
  return I;
}
// wild islands whose land may reach within R of (x, z)
export function wildIslandsNear(x, z, R) {
  const out = [], i0 = Math.floor((x - R) / WCELL) - 1, i1 = Math.floor((x + R) / WCELL) + 1, j0 = Math.floor((z - R) / WCELL) - 1, j1 = Math.floor((z + R) / WCELL) + 1;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const I = wildIsland(i, j); if (I && Math.abs(I.x - x) < R + I.r + 25 && Math.abs(I.z - z) < R + I.r + 25) out.push(I); }
  return out;
}
export const outsideOps = (x, z) => Math.max(Math.abs(x), Math.abs(z)) > BOUND;
export const islandH = (x, z) => {
  let m = landMask(x, z), hs = 1;
  if (Math.max(Math.abs(x), Math.abs(z)) > WILD_MIN - 220) {   // wild islands: only the 3x3 cells around can reach here
    const ci = Math.floor(x / WCELL), cj = Math.floor(z / WCELL), w = wobble(x, z);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const I = wildIsland(i, j); if (!I) continue;
      const d = Math.hypot(x - I.x, z - I.z) + w; if (d < I.r) { const k = 1 - sm(I.r * 0.55, I.r, d); if (k > m) { m = k; hs = I.hs; } }
    }
  }
  return mix(SEA_FLOOR, hills(x, z) * 0.7 * hs + 9, m);
};
export const islandAt = (x, z, pad = 0) => ISLANDS.find(I => Math.hypot(x - I.x, z - I.z) < I.r + pad);

// the same, as GLSL (constants baked in: the islands never move)
const f = v => (+v).toFixed(2);
export const islandGLSL = `
float hills(vec2 p){return 14.*sin(p.x*.035+1.3)*cos(p.y*.04)+9.*sin(p.x*.09+p.y*.07)+5.*sin(p.y*.13-p.x*.05)+2.5*sin(p.x*.31)*sin(p.y*.27)+8.;}
float landMask(vec2 p){
  float w=14.*sin(p.x*.045+p.y*.03)+9.*sin(p.y*.071-p.x*.052), m=0.;
${ISLANDS.map(I => `  m=max(m,1.-smoothstep(${f(I.r * 0.55)},${f(I.r)},length(p-vec2(${f(I.x)},${f(I.z)}))+w));`).join('\n')}
  return m;
}
float islandH(vec2 p){ return mix(${f(SEA_FLOOR)}, hills(p)*.7+9., landMask(p)); }
`;

// --------------------------------------------------------------------------------------------- sea navigation
// Ships route over a coarse grid of deep-water cells (A*), so carriers sail round islands instead of beaching.
export function createNav(heightAt, { cell = 20, draft = -5, margin = 14 } = {}) {
  const N = Math.ceil(2 * BOUND / cell), ok = new Uint8Array(N * N);
  const cx = i => -BOUND + (i + 0.5) * cell;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = cx(i), z = cx(j); let wet = Math.abs(x) < BOUND - 25 && Math.abs(z) < BOUND - 25;
    for (const [ox, oz] of [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin], [margin, margin], [-margin, -margin], [margin, -margin], [-margin, margin]]) if (wet && heightAt(x + ox, z + oz) > draft) wet = false;
    ok[j * N + i] = wet ? 1 : 0;
  }
  const idx = (x, z) => [Math.min(N - 1, Math.max(0, Math.floor((x + BOUND) / cell))), Math.min(N - 1, Math.max(0, Math.floor((z + BOUND) / cell)))];
  const nearestWet = (i, j) => {
    if (ok[j * N + i]) return [i, j];
    for (let r = 1; r < N; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < N && b < N && ok[b * N + a]) return [a, b];
    }
    return [i, j];
  };
  function lineClear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / (cell * 0.5));
    for (let k = 1; k <= n; k++) { const [i, j] = idx(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n); if (!ok[j * N + i]) return false; }
    return true;
  }
  return {
    N, cell, ok, wet: (x, z) => { const [i, j] = idx(x, z); return !!ok[j * N + i]; },
    nearestWater(x, z) { const [i, j] = nearestWet(...idx(x, z)); return [cx(i), cx(j)]; },
    // world-space waypoints from (x0,z0) to (x1,z1), smoothed by line-of-sight
    path(x0, z0, x1, z1) {
      const [si, sj] = nearestWet(...idx(x0, z0)), [ti, tj] = nearestWet(...idx(x1, z1));
      const S = sj * N + si, T = tj * N + ti, g = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
      const open = [S]; g[S] = 0;
      const hh = k => Math.hypot((k % N) - ti, Math.floor(k / N) - tj);
      let guard = 0;
      while (open.length && guard++ < 20000) {
        let bi = 0; for (let k = 1; k < open.length; k++) if (g[open[k]] + hh(open[k]) < g[open[bi]] + hh(open[bi])) bi = k;
        const c = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (c === T) break; if (closed[c]) continue; closed[c] = 1;
        const ci = c % N, cj = Math.floor(c / N);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue; const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue;
          const k = b * N + a; if (!ok[k] || closed[k]) continue;
          if (di && dj && (!ok[cj * N + a] || !ok[b * N + ci])) continue;   // no squeezing diagonally between two land cells
          const ng = g[c] + (di && dj ? 1.414 : 1); if (ng < g[k]) { g[k] = ng; from[k] = c; open.push(k); }
        }
      }
      if (from[T] < 0 && T !== S) return [[x1, z1]];
      const cells = []; for (let k = T; k !== -1; k = from[k]) { cells.push([cx(k % N), cx(Math.floor(k / N))]); if (k === S) break; }
      cells.reverse();
      { const [oi, oj] = idx(x1, z1); if (ok[oj * N + oi] && cells.length) cells[cells.length - 1] = [x1, z1]; }   // the exact goal when it is open water
      const out = []; let ax = x0, az = z0;
      for (let k = 0; k < cells.length; k++) {
        const nx = cells[k + 1];
        if (nx && lineClear(ax, az, nx[0], nx[1])) continue;   // skip cells we can see past
        out.push(cells[k]); [ax, az] = cells[k];
      }
      return out.length ? out : [[x1, z1]];
    },
  };
}
