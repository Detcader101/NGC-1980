// Stable world-aligned forest tiles. No row-major population cap or moving-window replacement:
// a tree belongs to exactly one tile and returns at exactly the same position and scale.
import { BOUND, islandH, forestAt } from '../world.js';
import { clearedAt } from './net.js';
const hash = (i, j) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function forestTile(x0, z0, size, height = islandH) {
  const S = 12, out = [];
  for (let j = Math.floor(z0 / S); j <= Math.floor((z0 + size) / S); j++) for (let i = Math.floor(x0 / S); i <= Math.floor((x0 + size) / S); i++) {
    const x = (i + hash(i, j) * 0.9) * S, z = (j + hash(j, i * 7 + 3) * 0.9) * S;
    if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size || Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300 || hash(i * 3 + 1, j) < 0.35) continue;
    const y = height(x, z); if (y < 3) continue;
    const sy = 2 / Math.hypot(2, height(x + 2, z) - y, height(x, z + 2) - y);
    if (!forestAt(x, z, y, sy) || clearedAt(x, z)) continue;
    out.push(x, y, z, 2 + hash(i + 11, j * 5) * 1.6);
  }
  return out;
}
