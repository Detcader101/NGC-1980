// Deterministic randomness for the lived-in world: everything is seeded by position or by an id, so the same town,
// road, house and cow come out in the same place every run, on the main thread and in the workers alike.
export const hash2 = (i, j, s = 0) => {   // integer lattice hash -> [0, 1)
  let h = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
export function rng(seed) {   // mulberry32
  let a = (seed | 0) ^ 0x9e3779b9;
  const r = () => { a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = a => a[Math.floor(r() * a.length)];
  r.chance = p => r() < p;
  return r;
}
export const seedOf = (x, z, s = 0) => (Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(z) | 0, 19349663) ^ Math.imul(s, 83492791)) | 0;
