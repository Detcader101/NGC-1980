// armorenv.js - builds the trackfm environment from a game world (for the wave-2 host; the dev page uses testground.js).
// Pure: no THREE, no DOM. The host passes its own height function and whatever it knows about the ground:
//
//   const env = makeArmorEnv({
//     height: (x, z) => terrainH(x, z),            // REQUIRED: the same height the renderer draws
//     seaLevel: 0,                                  // water surface (the archipelago's sea is at 0)
//     paved: (x, z) => onPadOrRoad(x, z),           // optional: pads, roads, decks -> 'paved'
//     forest: (x, z) => forestAt(x, z),             // optional: woodland floor -> 'grass' (+ trees via obstacles)
//     obstacles: (x, z, r) => [...],                // optional: trees, buildings, other vehicles (trackfm format)
//     raycast: (o, d, max) => distance | null,      // optional: the laser rangefinder's ray
//   });
//
// Surface classes (trackfm SOILS): under the sea and on the beach band -> 'sand'; slopes steeper than ~35 deg -> 'rock';
// high ground (> 60 m) -> 'rock'; low wet hollows near the coast -> 'mud'; else 'grass' / 'dirt' in patches. The
// classification is deterministic (a hash noise) so the same spot is always the same soil, and it is cheap.
const hash = (x, z) => { const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return h - Math.floor(h); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function makeArmorEnv(o) {
  const H = o.height, sea = o.seaLevel ?? 0, e = 1.0;
  const slope = (x, z) => { const dx = (H(x + e, z) - H(x - e, z)) / (2 * e), dz = (H(x, z + e) - H(x, z - e)) / (2 * e); return Math.hypot(dx, dz); };
  const surface = (x, z) => {
    if (o.paved && o.paved(x, z)) return 'paved';
    const h = H(x, z);
    if (h < sea + 1.2) return 'sand';                       // sea bed, surf line and beach
    if (slope(x, z) > 0.7 || h > 60) return 'rock';          // > ~35 deg, or high ground
    if (o.forest && o.forest(x, z)) return 'grass';
    const n = vnoise(x * 0.04, z * 0.04);
    if (h < sea + 4 && n > 0.72) return 'mud';               // wet hollows behind the beach
    return n > 0.45 ? 'grass' : 'dirt';
  };
  return {
    height: H, surface,
    water: (x, z) => (H(x, z) < sea ? sea : -Infinity),
    obstacles: o.obstacles || null,
    raycast: o.raycast || null,
  };
}
