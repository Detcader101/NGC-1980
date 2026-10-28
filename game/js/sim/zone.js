// SIM MODE: the control zone's ground for the headless war (tools/warsim.mjs). This is main.js's terrain built the
// same way - the cave bases' aprons, the flat pads, the ground over the caves, the armour landing hards - without the
// renderer. main.js keeps its own copy (it is the live game's and is not touched); tools/scenes/simmode.json checks the
// two agree point for point in the browser, so a change to main.js's terrain shows up as a failed scene.
// It mutates ISLANDS (I.base, I.pad) exactly as main.js does, unless createZone({ pure: true }) (copies: the browser check).
import { ISLANDS, islandH, createNav, BOUND, fleetStart } from '../world.js';
import { planHards, hardsH } from '../units/armor/landinghard.js';
import { clearedAt } from '../world/net.js';
import { hypot2 } from '../hypot.js';   // (ngc/perf-cpu) Math.hypot without the garbage, same bits

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// (main.js: PAD_R, BASE_R, STRIP_X, STRIP_Z)
const PAD_R = 8.5, BASE_R = 18, STRIP_X = 76, STRIP_Z = 9;

let ZONE = null;
export const GRID = { RES: 0.5, EXT: BOUND + 260, N: (BOUND + 260) * 4 + 1 };   // the baked table extends 260 m beyond the enlarged zone
export function createZone(o = {}) {   // o.pure: on copies of the islands (a check in the live game must not touch its ISLANDS)
  if (ZONE && !o.pure) return ZONE;
  const ISL = o.pure ? ISLANDS.map(I => ({ ...I })) : ISLANDS;
  let Z = null;
  const BASES = ISL.filter(I => I.cave).sort((a, b) => a.tier - b.tier).map(I => I.base = { kind: I.owner === 1 ? 'home' : 'enemy', name: I.name, tier: I.tier, x: I.x, z: I.z, h: clamp(Math.round(islandH(I.x, I.z)), 4, 16), isl: I });
  const PADS = ISL.map(I => I.pad = I.cave ? { x: I.x, z: I.z + 30, h: I.base.h, r0: 12, r1: 34, r: PAD_R, isl: I } : { x: I.x, z: I.z, h: clamp(Math.round(islandH(I.x, I.z)), 3, 14), r0: 30, r1: 52, r: PAD_R, isl: I });
  const stripW = (x, z, b) => smooth(0, 14, hypot2(Math.max(Math.abs(x - b.x) - STRIP_X, 0), Math.max(Math.abs(z - b.z) - STRIP_Z, 0)));
  const terrainH0 = (x, z) => {
    let h = islandH(x, z);
    for (const b of BASES) h = lerp(b.h, h, smooth(BASE_R, 60, hypot2(x - b.x, z - b.z)));
    for (const p of PADS) { const d = hypot2(x - p.x, z - p.z); if (d < p.r1) h = lerp(p.h, h, smooth(p.r0, p.r1, d)); }
    for (const b of BASES) h = lerp(Math.max(h, b.h), h, stripW(x, z, b));
    return h;
  };
  const HARDS = planHards(ISL, terrainH0, {
    pads: PADS, holes: BASES, cleared: (x, z) => clearedAt(x, z),
    keepOut: I => { if (I.name !== 'IRONHOLD') return []; const a = Math.atan2(-I.z, -I.x); for (let r = 20; r < I.r + 60; r += 2) { const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r; if (terrainH0(x, z) < 2.5) return [{ x, z, r: 40 }]; } return []; },
  });
  // the hot path: terrainH is called a great deal (every round, every unit, every frame) and was ~40% of a headless
  // war. Z.useGrid(table) swaps in a baked 0.5 m table with bilinear filtering inside the control zone and its margin (the exact function
  // outside it): heights agree to a few cm (tools/simbench.mjs measures it). warsim --exact keeps the exact function.
  const exact = (x, z) => {
    if (!(Math.abs(x) < 3e4 && Math.abs(z) < 3e4)) {   // (NaN or far off the map: the sim reports who asked, the run goes on)
      if (!Z.bad) { const st = String(new Error().stack).split("\n").map(l => (l.match(/\/js\/(units\/[^:]+|[a-z]+\.js)/) || [])[1]).filter(f => f && !/zone\.js/.test(f)); Z.bad = `ground asked far off the map (${Math.round(x)}, ${Math.round(z)}) by ${[...new Set(st)].slice(0, 3).join(" < ") || "?"}`; }
      return -14;
    }
    return hardsH(HARDS, x, z, terrainH0(x, z));
  };
  let grid = null;
  const terrainH = (x, z) => {
    if (!grid) return exact(x, z);
    const gx = (x + GRID.EXT) / GRID.RES, gz = (z + GRID.EXT) / GRID.RES, i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= GRID.N - 1 || j >= GRID.N - 1) return exact(x, z);
    const fx = gx - i, fz = gz - j, k = j * GRID.N + i, a = grid[k], b = grid[k + 1], c = grid[k + GRID.N], d = grid[k + GRID.N + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  const isWater = (x, z) => terrainH(x, z) <= 0;
  Z = { ISLANDS: ISL, BASES, PADS, HARDS, terrainH, terrainH0, exact, isWater, nav: null, carrierStart: null, enemyStart: null, GRID };
  // bake: the table for useGrid (N x N floats, row-major in z); useGrid(table) before anything reads the ground
  Z.bake = () => { const t = new Float32Array(GRID.N * GRID.N); for (let j = 0; j < GRID.N; j++) for (let i = 0; i < GRID.N; i++) t[j * GRID.N + i] = exact(i * GRID.RES - GRID.EXT, j * GRID.RES - GRID.EXT); return t; };
  Z.useGrid = t => { grid = t; Z.nav = null; return Z; };
  // the sea lanes are planned on whichever ground is in use (built on first ask)
  Object.defineProperty(Z, 'navReady', { get: () => { if (!Z.nav) { Z.nav = createNav(terrainH); const seaSpot = (x, z) => { const [wx, wz] = Z.nav.nearestWater(x, z); return [wx, wz, Math.atan2(wx, wz)]; }; Z.carrierStart = seaSpot(...fleetStart(1)); Z.enemyStart = seaSpot(...fleetStart(2)); } return Z; } });
  if (!o.pure) ZONE = Z;
  return Z;
}
