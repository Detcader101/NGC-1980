// Stable world-aligned forest tiles. No row-major population cap or moving-window replacement:
// a tree belongs to exactly one tile and returns at exactly the same position and scale.
import { BOUND, ISLANDS, islandH, forestAt, fbm, noise } from '../world.js';
// (ngc/look-terrain) the control zone's woods: the same woodland field as main.js's zone trees (the colliders), kept off
// every site's town ground, pads, bases and landing hards (site radius + 200 m: farmland and towns round each place)
export const zoneWood = (x, z) => fbm(x / 900 + 5.5, z / 900 + 9.2, 3) + 0.3 * noise(x / 240 + 1.3, z / 240 - 4.1) > 0.12;
const nearSite = (x, z) => { for (const I of ISLANDS) { const R = I.r + 200; if (Math.abs(x - I.x) < R && Math.abs(z - I.z) < R && Math.hypot(x - I.x, z - I.z) < R) return true; } return false; };
import { clearedAt } from './net.js';
const hash = (i, j) => { let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function forestTile(x0, z0, size, height = islandH) {
  const S = 12, out = [];
  for (let j = Math.floor(z0 / S); j <= Math.floor((z0 + size) / S); j++) for (let i = Math.floor(x0 / S); i <= Math.floor((x0 + size) / S); i++) {
    const x = (i + hash(i, j) * 0.9) * S, z = (j + hash(j, i * 7 + 3) * 0.9) * S;
    if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size || hash(i * 3 + 1, j) < 0.35) continue;
    if (Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300 && (!zoneWood(x, z) || nearSite(x, z))) continue;   // (ngc/look-terrain: woods in the zone too)
    const y = height(x, z); if (y < 3) continue;
    const sy = 2 / Math.hypot(2, height(x + 2, z) - y, height(x, z + 2) - y);
    if (!forestAt(x, z, y, sy) || clearedAt(x, z)) continue;
    out.push(x, y, z, 2 + hash(i + 11, j * 5) * 1.6);
  }
  return out;
}

// RENDERKIT nature (ngc/depth-nature): which tree grows where. Pure (worker and main thread agree).
// Summer 1980, a temperate-Mediterranean archipelago and its mainland: maritime / Aleppo pines on the coasts and the
// limestone, evergreen and deciduous oaks (broadleaf) in the sheltered lowland, fir above ~200 m, maquis scrub on the
// dry hills. No palms (not native to the setting's Atlantic-Mediterranean coasts).
export const TREE_KINDS = ['fir', 'pine', 'broad', 'scrub'];
export const FIR = 0, PINE = 1, BROAD = 2, SCRUB = 3;
// geo: 'granite' | 'volcanic' | 'limestone' | 'sandstone' | null (the mainland); u: a 0..1 hash for the tree
export function treeKind(x, z, y, u, geo = null) {
  const v = hash(Math.floor(x * 3.7) | 0, Math.floor(z * 3.1) | 0);   // a second, independent hash
  // stands: species come in groups (a low-frequency field), not salt and pepper
  const stand = Math.sin(x * 0.011 + Math.sin(z * 0.007) * 2.1) * 0.5 + Math.sin(z * 0.013 - x * 0.004) * 0.5;
  if (geo) {   // the control zone's islands
    const pineBias = { granite: 0.38, volcanic: 0.5, limestone: 0.62, sandstone: 0.35 }[geo] ?? 0.4;
    const coast = y < 6 ? 0.25 : 0;
    return u * 0.6 + (stand * 0.5 + 0.5) * 0.4 < pineBias + coast ? PINE : BROAD;
  }
  const fir = smooth01((y - 170 + 50 * stand) / 90);                  // the fir belt starts ~170-220 m
  if (v < fir) return FIR;
  const pine = y < 40 ? 0.7 : 0.35 + 0.25 * stand;
  return u < pine ? PINE : BROAD;
}
const smooth01 = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
export const natureHash = hash;
// maquis scrub on the wild lands: the cells forestTile left empty, on the dry, open ground between the forests.
// Same 12 m lattice as the forest (a different hash), denser on slopes the forest avoids. Out: [x, y, z, s] * n.
export function scrubTile(x0, z0, size, height = islandH) {
  const S = 12, out = [];
  for (let j = Math.floor(z0 / S); j <= Math.floor((z0 + size) / S); j++) for (let i = Math.floor(x0 / S); i <= Math.floor((x0 + size) / S); i++) {
    if (hash(i * 5 + 7, j * 3 + 1) > 0.38) continue;
    const x = (i + 0.15 + hash(i + 3, j * 11) * 0.7) * S, z = (j + 0.15 + hash(j + 9, i * 13) * 0.7) * S;
    if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size || Math.max(Math.abs(x), Math.abs(z)) < BOUND + 300) continue;
    const y = height(x, z); if (y < 2.5 || y > 330) continue;
    const sy = 2 / Math.hypot(2, height(x + 2, z) - y, height(x, z + 2) - y);
    if (sy < 0.7 || forestAt(x, z, y, sy) && hash(i, j * 7) < 0.7 || clearedAt(x, z)) continue;
    out.push(x, y, z, 0.7 + hash(i * 2 + 1, j + 5) * 0.9);
  }
  return out;
}
