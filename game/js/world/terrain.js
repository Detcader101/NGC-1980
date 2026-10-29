// NGC-1980 TERRAIN (ngc/look-terrain): the control zone's land - one large main island with bays, headlands, a
// mountain spine, a limestone plateau with an escarpment, rolling farmland, granite hills and two river valleys,
// HOME ISLAND across a strait, SOUTH REEF and islets - and the visual / sim surface types on it.
// Pure JS (no THREE, no DOM): the main thread, the terrain / world workers and the node benches all build exactly the
// same ground (fixed plan + fixed-seed noise: the same world every run).
//
// How it is built (docs/ngc1980/findings/look-terrain.md, "Design"):
//   1. PLAN fields on a 10 m grid: the land as signed distance to the coast in metres (union of hand-laid ellipses
//      and capsules, bays cut out, both scales of domain-warped noise on the shoreline), the inland relief R (regional
//      landforms blended with a soft max, river valleys carved, a flat basin at each ISLANDS site), and the coast kind
//      (beach where the lowland meets the sea, cliff where high ground does, rocky shore between).
//   2. The FINE pass on a 2.5 m grid (the render lattice): each coast kind's profile across the shore applied to the
//      interpolated plan fields (cliffs stay sharp), the sea bed's shoreface / shelf, hummocks and broken rock.
//   3. SURFACES from the fine ground's slope and what the plan knew (beach, river, high ground).
//   4. The outer ring of the grid blends into world.js wildH (open sea on both sides), so there is no seam at BOUND.
//
// API (all pure, all world metres; y up, sea level 0):
//   zoneH(x, z)            -> natural ground / sea-bed height inside the zone grid (|x|,|z| <= ZONE_E), else SEA_FLOOR
//   zoneSurf(x, z)         -> the natural surface name at (x, z): one of SURF_NAMES (under water: the sea bed)
//   zoneSurfId(x, z)       -> the same as an index into SURF_NAMES
//   SURF_NAMES, SURFACE    -> the canonical surface table (see below) and how each sim names a surface
//   GEOLOGY, geologyOf(I)  -> rock / sand colours of a site's region
//   beaches(), beachesOf(I)-> sand beaches near each site (waterline point, inland direction, width, run-in)
//   islandInfo(I)          -> the site's plan: geology, basin height, coast kind nearby (debug / other agents)
//   shoreAt(x, z)          -> { island (nearest site), s (m inland, negative offshore), kind, beach } near a coast, else null
//   zoneGrid()             -> { N, C, E, h: Float32Array (N*N, row-major z then x), s: Uint8Array (surface ids) }
//   planAt(x, z)           -> the plan fields at (x, z): { s, R, wb, wc, riv } (tools, the overview map)
//   SITE_H                 -> the designed basin height of every site (main.js / sim/zone.js clamp their pads to it)
import { ISLANDS, SEA_FLOOR, noise, fbm, ridged, wildH } from '../world.js';
import { BOUND } from './bound.js';

export const ZONE_E = BOUND + 160;                // the grid covers -ZONE_E..ZONE_E (the zone plus its blend ring)
export const ZONE_C = 2.5;                        // fine grid spacing (m): the render lattice (main.js TG) uses the same vertices
const N = Math.round(2 * ZONE_E / ZONE_C) + 1;    // 2177 at BOUND 2560
const CC = 10, NC = Math.round(2 * ZONE_E / CC) + 1;   // the plan grid
const BLEND0 = BOUND - 220, BLEND1 = BOUND + 120; // the ring where the zone's sea becomes wildH's sea

// ------------------------------------------------------------------------------------------------- surfaces
// The canonical surface table. mu: peak friction for a tyre / boot (Wong, Theory of Ground Vehicles 4th ed. tables 1.2,
// 1.4, 2.1 ranges: grass 0.4-0.55, dry sand 0.4-0.6, wet compact sand ~0.6-0.7, mud 0.2-0.4, gravel 0.55-0.7, rock 0.6-0.75),
// crr: rolling resistance of a pneumatic tyre (Wong 1.2: grass 0.05-0.08, sand 0.15-0.3, firm wet sand 0.04-0.08,
// mud 0.1-0.15), sink: how far a wheel / foot settles (m), speed: walking-pace factor, skid: helicopter skid (steel shoe)
// friction relative to concrete (it ploughs in sand and shingle, glides on mud) - all INFERRED within those ranges.
// tyre / soil / foot: the names this surface has in tyre.js SURF, trackfm.js SOILS and the infantry footstep audio;
// ground: the name in ground.js SURF (the ground host's fallback inside the zone, ngc/look-terrain).
export const SURF_NAMES = ['grass', 'sand', 'wetsand', 'rock', 'mud', 'dirt', 'shingle', 'marsh'];
export const SURFACE = {
  grass:   { mu: 0.50, crr: 0.06,  sink: 0.02, speed: 0.95, skid: 0.85, tyre: 'grass', soil: 'grass', foot: 'grass', ground: 'grass' },
  sand:    { mu: 0.50, crr: 0.18,  sink: 0.06, speed: 0.80, skid: 1.20, tyre: 'sand',  soil: 'sand',  foot: 'sand',  ground: 'sand' },
  wetsand: { mu: 0.62, crr: 0.06,  sink: 0.02, speed: 0.95, skid: 1.00, tyre: 'dirt',  soil: 'dirt',  foot: 'sand',  ground: 'dirt' },   // the swash zone: firm, the landing craft's road
  rock:    { mu: 0.70, crr: 0.02,  sink: 0,    speed: 0.85, skid: 1.05, tyre: 'rock',  soil: 'rock',  foot: 'rock',  ground: 'rock' },
  mud:     { mu: 0.35, crr: 0.13,  sink: 0.08, speed: 0.70, skid: 0.70, tyre: 'mud',   soil: 'mud',   foot: 'mud',   ground: 'mud' },
  dirt:    { mu: 0.65, crr: 0.04,  sink: 0.02, speed: 1.00, skid: 1.00, tyre: 'dirt',  soil: 'dirt',  foot: 'dirt',  ground: 'dirt' },
  shingle: { mu: 0.55, crr: 0.09,  sink: 0.04, speed: 0.80, skid: 1.10, tyre: 'sand',  soil: 'sand',  foot: 'rock',  ground: 'sand' },   // pebble strand on the rocky shores
  marsh:   { mu: 0.30, crr: 0.20,  sink: 0.15, speed: 0.55, skid: 0.80, tyre: 'mud',   soil: 'bog',   foot: 'mud',   ground: 'mud' },    // salt marsh on the estuaries and behind the spit
};
const S_GRASS = 0, S_SAND = 1, S_WET = 2, S_ROCK = 3, S_MUD = 4, S_DIRT = 5, S_SHINGLE = 6, S_MARSH = 7;

// ------------------------------------------------------------------------------------------------- geology
// rock / sand colours (linear-ish RGB 0..1, the shader's palette), ruggedness, tors, cliffs. By region: granite in the
// west, the spine and HOME ISLAND; limestone on the plateau and the south-east; sandstone in the farmland and the river
// country; volcanic round IRON BAY.
export const GEOLOGY = {
  granite:   { rock: [0.56, 0.55, 0.52], sand: [0.86, 0.79, 0.60], rugged: 1.0, tors: 1.0, cliffs: 1.0 },
  volcanic:  { rock: [0.30, 0.28, 0.27], sand: [0.48, 0.45, 0.42], rugged: 1.2, tors: 0.6, cliffs: 1.2 },
  limestone: { rock: [0.74, 0.72, 0.64], sand: [0.94, 0.91, 0.80], rugged: 0.6, tors: 0.2, cliffs: 0.7 },
  sandstone: { rock: [0.62, 0.45, 0.33], sand: [0.88, 0.74, 0.52], rugged: 0.8, tors: 0.5, cliffs: 1.0 },
};
const GEO_OF = {
  'HOME ISLAND': 'granite', PELICAN: 'granite', 'NORTH ROCK': 'granite', LOOKOUT: 'granite', SPIRE: 'granite', DRIFTWOOD: 'granite',
  IRONHOLD: 'volcanic', ANVIL: 'volcanic',
  CINDER: 'limestone', BEACON: 'limestone', KILN: 'limestone', 'SOUTH REEF': 'limestone', ECHO: 'limestone', SANDBAR: 'limestone',
  CITADEL: 'sandstone', WELLSPRING: 'sandstone', FORGE: 'sandstone',
};
export const geologyOf = I => GEO_OF[I.name] || 'granite';

// ------------------------------------------------------------------------------------------------- small maths
const sm = (a, b, x) => { const t = (x - a) / (b - a); const u = t < 0 ? 0 : t > 1 ? 1 : t; return u * u * (3 - 2 * u); };
const mix = (a, b, t) => a + (b - a) * t;
const smax = (a, b, k) => { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (a - b) / k)); return mix(b, a, h) + k * h * (1 - h); };   // soft max (no crease)
// signed distance (m, + inside) to a capsule a-b of radius r, and (approximately) to a rotated ellipse
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const cap = (ax, az, bx, bz, r) => (x, z) => r - segD(x, z, ax, az, bx, bz);
const ell = (cx, cz, rx, rz, rot = 0) => { const c = Math.cos(rot), s = Math.sin(rot), m = Math.min(rx, rz);
  return (x, z) => { const dx = x - cx, dz = z - cz, u = (c * dx + s * dz) / rx, v = (-s * dx + c * dz) / rz; return (1 - Math.hypot(u, v)) * m; }; };

// ------------------------------------------------------------------------------------------------- the plan
// North is -z (the map's top). Sites (world.js ISLANDS) sit on this land at roughly twice their old archipelago spots.
const LAND = [
  ell(100, -450, 1950, 1400, 0.08),        // the main island
  ell(1520, -1430, 620, 470, 0.2),         // its north-east lobe (IRONHOLD)
  ell(-1000, 430, 900, 520, -0.2),         // the south-west lobe (FORGE), across the strait from HOME ISLAND
  cap(-1050, -950, -1650, -1460, 330),     // the north-west peninsula (NORTH ROCK)
  cap(-1300, 330, -2060, 370, 270),        // the west headland (LOOKOUT)
  cap(-1450, -420, -2080, -470, 280),      // DRIFTWOOD's coast
  cap(1300, -420, 2090, -380, 320),        // the east headland under the plateau (BEACON)
  cap(900, -50, 2040, 440, 360),           // the south-east (KILN)
  cap(560, 890, 260, 1090, 95),            // the sand spit across THE SOUND's mouth (SANDBAR)
  ell(-1150, 1580, 1000, 390, -0.12),      // HOME ISLAND
  ell(1450, 1380, 540, 380, 0.25),         // SOUTH REEF
  ell(260, 1980, 210, 160, 0.4),           // ECHO's islet
  ell(-2150, 1150, 130, 90, 0.6), ell(2200, 1050, 110, 80, -0.3), ell(-600, -2150, 90, 70, 0.2),   // islets
];
const SEA = [
  cap(-50, 1150, -20, 650, 285),           // THE SOUND: a deep bay from the south to CITADEL's door
  cap(1130, -2350, 1215, -1300, 285),      // IRON BAY: from the north to IRONHOLD's shipyard
  cap(-2300, 900, -1750, 820, 120),        // the west bay between LOOKOUT's headland and the strait
];
// regional landforms (the relief R where there is land)
const SPINE = { ax: -1050, az: -1330, bx: 1050, bz: -1300, w: 520, fall: 380 };   // the mountain spine across the north
const PLATEAU = ell(1180, -480, 760, 520, 0.1);   // the limestone plateau: 105 m, escarpment W and S, cliffs at the east coast
const WHILLS = ell(-1600, -80, 600, 850, 0.15);   // the granite hills in the west
const HHILLS = ell(-1520, 1560, 560, 300, -0.12); // HOME ISLAND's hills
const LOW = [ell(1450, 1380, 600, 440, 0.25), ell(260, 1980, 260, 200, 0.4), cap(560, 890, 260, 1090, 160)];   // low islands and the spit: relief held down
// rivers: polylines from source to mouth (the last point is in the sea); floor heights at the source
const RIVERS = [
  { pts: [[-320, -1220], [-470, -980], [-540, -720], [-430, -420], [-300, -170], [-190, 120], [-110, 330], [-60, 520]], h0: 70, w0: 14, w1: 55, tide: 0.45 },   // the Kessel: spine -> WELLSPRING -> the farmland -> THE SOUND
  { pts: [[-1000, -1120], [-1200, -900], [-1420, -720], [-1700, -640], [-1950, -620], [-2200, -640]], h0: 60, w0: 12, w1: 45, tide: 0.5 },                  // the west river, past DRIFTWOOD
  { pts: [[480, -1250], [560, -1480], [600, -1700], [620, -1900], [640, -2050]], h0: 80, w0: 10, w1: 35, tide: 0.7 },                                     // the north valley down to ANVIL's harbour
];
// each site's flat basin: the height its town ground is graded to (cave bases 4-16 m: main.js clamps them there)
export const SITE_H = {
  'HOME ISLAND': 9, IRONHOLD: 10, 'NORTH ROCK': 11, 'SOUTH REEF': 6, CITADEL: 14,
  PELICAN: 5, ANVIL: 6, LOOKOUT: 58, BEACON: 96, FORGE: 9, CINDER: 108, WELLSPRING: 34, SANDBAR: 3.5,
  DRIFTWOOD: 7, KILN: 8, SPIRE: 64, ECHO: 22,
};
// beaches: lowland coasts, plus these preferred stretches (landing beaches, holiday sand)
const BEACHY = [ell(-1250, 1900, 700, 260, -0.1), ell(-500, 1450, 260, 260), ell(0, 950, 420, 300), ell(1450, 1600, 600, 260, 0.25), ell(-900, 980, 500, 160, -0.2), ell(1950, 650, 300, 260), ell(600, 1000, 360, 200)];
const CLIFFY = [ell(-300, -1850, 900, 220, 0.03), ell(-2150, 100, 250, 700, 0.1), ell(2100, -420, 200, 380), ell(-1900, 1500, 260, 300)];

function landSD(x, z) {
  // the coastline: domain-warped (bays and headlands at ~1 km and ~250 m), then a small-scale ragged edge
  const wx = x + 230 * fbm(x / 1300 + 3.1, z / 1300 - 8.4, 3) + 60 * noise(x / 260 + 1.7, z / 260 + 4.4);
  const wz = z + 230 * fbm(x / 1300 - 5.3, z / 1300 + 1.9, 3) + 60 * noise(x / 260 - 2.9, z / 260 - 6.1);
  let m = -1e9; for (const f of LAND) { const v = f(wx, wz); if (v > m) m = v; }
  for (const f of SEA) { const v = f(wx, wz); if (-v < m) m = -v; }
  m += 45 * fbm(x / 520 + 9.1, z / 520 + 2.2, 2);
  return m;
}
const PL = { S: null, R: null, WB: null, WC: null, RV: null, siteM: null };
function siteMask() {   // per site: its centre, keep-land radius, basin radii
  return ISLANDS.map(I => ({ I, x: I.x, z: I.z, keep: I.r * 0.8, rin: I.r * (I.cave ? 0.85 : 0.75), rout: I.r * (I.cave ? 0.85 : 0.75) + 260 + I.r * 0.5, h: SITE_H[I.name] ?? 8 }));
}
function relief(x, z) {
  // farmland / lowland everywhere: long gentle swells 5-40 m
  let R = 7 + 26 * (0.5 + 0.5 * fbm(x / 1500 + 2.7, z / 1500 - 1.1, 3)) + 7 * noise(x / 420 + 5.5, z / 420 + 3.3);
  // scattered farm hills and downs (20-70 m)
  { const hv = fbm(x / 650 + 7.7, z / 650 - 3.9, 3); if (hv > 0) R += 130 * hv * hv * (0.6 + 0.4 * noise(x / 210, z / 210 + 2)); }
  // the mountain spine: ridged crests, peaks 300-380 m, spurs falling to the lowland
  const ds = segD(x, z, SPINE.ax, SPINE.az, SPINE.bx, SPINE.bz), spine = sm(SPINE.w + SPINE.fall, SPINE.w - 120, ds);
  if (spine > 0) { const rd = ridged(x / 1150 + 4.2, z / 1150 - 2.6, 5); R = smax(R, spine * (60 + 330 * rd * rd * (0.55 + 0.45 * (1 - ds / (SPINE.w + SPINE.fall))) + 40 * spine), 25); }
  // the plateau: a flat top at ~105 m with a steep escarpment (the edge is a narrow band of the ellipse field)
  const pv = PLATEAU(x + 70 * noise(x / 300, z / 300 + 7), z + 70 * noise(x / 300 + 3, z / 300)), pt = sm(-35, 45, pv);
  if (pt > 0) R = smax(R, pt * (98 + 10 * fbm(x / 600 + 1.3, z / 600 + 8.8, 2)) + 3 * noise(x / 90, z / 90), 10);
  // the granite hills of the west and HOME ISLAND: rounded hills and tors
  const wh = sm(-60, 260, WHILLS(x, z)); if (wh > 0) R = smax(R, wh * (45 + 115 * (0.5 + 0.5 * fbm(x / 520 - 3.3, z / 520 + 6.6, 4))), 20);
  const hh = sm(-40, 160, HHILLS(x, z)); if (hh > 0) R = smax(R, hh * (30 + 75 * (0.5 + 0.5 * fbm(x / 380 + 8.8, z / 380 - 4.4, 3))), 15);
  // the low islands and the spit
  let low = 0; for (const f of LOW) low = Math.max(low, sm(-80, 60, f(x, z)));
  if (low > 0) R = mix(R, 3 + 9 * (0.5 + 0.5 * fbm(x / 300 + 1.1, z / 300 + 2.2, 2)), low);
  return R;
}
// rivers: distance to the (meandering) course and where along it (0 source .. 1 mouth)
function riverAt(x, z, out) {
  out.v = 0; out.floor = 0; out.t = 0;
  const mx = x + 35 * noise(x / 170 + 3.3, z / 170 - 1.2), mz = z + 35 * noise(x / 170 - 6.1, z / 170 + 2.8);
  for (const Rv of RIVERS) {
    const P = Rv.pts; let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    let acc = 0, bd = 1e9, bt = 0;
    for (let i = 1; i < P.length; i++) {
      const [ax, az] = P[i - 1], [bx, bz] = P[i], sl = Math.hypot(bx - ax, bz - az), dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((mx - ax) * dx + (mz - az) * dz) / (sl * sl))), d = Math.hypot(mx - ax - dx * t, mz - az - dz * t);
      if (d < bd) { bd = d; bt = (acc + t * sl) / L; } acc += sl;
    }
    // the upper river a stream in its valley; from Rv.tide on a tidal river (water: the floor is below the sea), widening to the mouth
    const est = sm(Rv.tide, 1, bt), w = mix(Rv.w0, Rv.w1, bt) * (1 + 0.8 * est), side = 140 + 220 * (1 - bt);
    const floor = bt < Rv.tide - 0.08 ? mix(Rv.h0, 1.2, Math.pow(bt / (Rv.tide - 0.08), 0.8)) : mix(1.2, -3.2, sm(Rv.tide - 0.08, Rv.tide + 0.06, bt)) - 0.8 * est;
    const v = 1 - sm(w, w + side, bd);
    if (v > out.v) { out.v = v; out.floor = floor; out.t = bt; out.d = bd; out.w = w; }
  }
  return out;
}
const _rv = { v: 0, floor: 0, t: 0, d: 0, w: 0 };
function bakePlan() {
  const S = new Float32Array(NC * NC), R = new Float32Array(NC * NC), WB = new Float32Array(NC * NC), WC = new Float32Array(NC * NC), RV = new Float32Array(NC * NC);
  const sites = siteMask();
  for (let j = 0; j < NC; j++) {
    const z = -ZONE_E + j * CC;
    for (let i = 0; i < NC; i++) {
      const x = -ZONE_E + i * CC, k = j * NC + i;
      let s = landSD(x, z);
      for (const q of sites) { const d = Math.hypot(x - q.x, z - q.z); if (q.keep - d > s) s = q.keep - d; }   // every site stands on its own land
      if (s < -380) { S[k] = s; R[k] = 0; WB[k] = 0; WC[k] = 0; RV[k] = 0; continue; }   // open sea: the shelf decides, no relief to work out
      let r = relief(x, z);
      // the sites' basins: town ground graded to the site's height
      let keep = 1;
      for (const q of sites) { const d = Math.hypot(x - q.x, z - q.z); if (d < q.rout) { const t = sm(q.rin, q.rout, d); r = mix(q.h + Math.min(4, Math.max(0, r - q.h) * 0.1) * sm(0.3 * q.rin, q.rin, d), r, t); keep *= sm(q.rin * 0.8 + 10, q.rin * 0.8 + 110, d); } }
      // river valleys: the ground falls to the stream's graded floor (only ever lowered), the stream's own bed, an
      // estuary below sea level in the last third; they pass the towns but never cut a pad or a base
      riverAt(x, z, _rv);
      const vk = _rv.v * keep;
      if (vk > 0) { const cut = Math.max(0, r - Math.max(_rv.floor, 1.3)); r -= cut * vk * (0.85 + 0.15 * vk); }   // (the flood plain stays dry; only the bed below takes the water)
      if (_rv.d < _rv.w * 0.6 && keep > 0) r = mix(r, Math.min(r, _rv.floor - 2.2 * (1 - _rv.d / (_rv.w * 0.6))), keep);
      const rv = keep * (1 - sm(_rv.w * 0.7, _rv.w * 1.9, _rv.d));   // (the stream and its flood plain, for the surfaces)
      // coast kind: beach where the lowland meets the sea (and the stretches in BEACHY), cliffs where high ground does
      let pb = 0, pc = 0; for (const f of BEACHY) pb = Math.max(pb, sm(-60, 80, f(x, z))); for (const f of CLIFFY) pc = Math.max(pc, sm(-60, 80, f(x, z)));
      const n = noise(x / 380 + 2.2, z / 380 - 7.7);
      let wb = Math.max(pb, sm(0.05, 0.3, n) * (1 - sm(12, 26, r))) * (1 - sm(28, 50, r)) * sm(0.5, 2.5, r);
      let wc = Math.max(pc * sm(14, 30, r), sm(26, 60, r) * sm(-0.3, 0.1, n + 0.25)) * (1 - wb);
      S[k] = s; R[k] = r; WB[k] = wb; WC[k] = wc; RV[k] = rv;
    }
  }
  PL.S = S; PL.R = R; PL.WB = WB; PL.WC = WC; PL.RV = RV;
}
const _pl = { s: 0, R: 0, wb: 0, wc: 0, riv: 0 };
function planLerp(x, z, out = _pl) {
  let gx = (x + ZONE_E) / CC, gz = (z + ZONE_E) / CC; gx = Math.max(0, Math.min(NC - 1.001, gx)); gz = Math.max(0, Math.min(NC - 1.001, gz));
  const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, k = j * NC + i;
  const L = A => { const a = A[k], b = A[k + 1], c = A[k + NC], d = A[k + NC + 1]; return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; };
  out.s = L(PL.S); out.R = L(PL.R); out.wb = L(PL.WB); out.wc = L(PL.WC); out.riv = L(PL.RV);
  return out;
}
export function planAt(x, z) { if (!PL.S) bakePlan(); return { ...planLerp(x, z, { s: 0, R: 0, wb: 0, wc: 0, riv: 0 }) }; }

// ------------------------------------------------------------------------------------------------- the fine ground
function groundAt(x, z, P) {
  const s = P.s, R = P.R;
  const wb = P.wb * sm(0.5, 3, R), wc = P.wc, wr = Math.max(0, 1 - wb - wc);
  let h;
  if (s >= 0) {
    // beach: foreshore 1 in 15 to the berm (~1.7 m), a backshore with low dunes, then up to the land over a long run
    let hB = 0;
    if (wb > 0) {
      const g = 0.066, berm = 1.7 + 0.2 * noise(x / 60, z / 60), sb = berm / g;
      hB = s < sb ? g * s : berm + 0.15 * sm(sb, sb + 8, s);
      const ds = s - sb - 8; if (ds > 0 && R < 25) hB += Math.max(0, (1.2 + 1.8 * (0.5 + 0.5 * noise(x / 26 + 9, z / 26))) * Math.exp(-(((ds - 14) / 9) ** 2)));   // the dune ridge
      hB = mix(hB, R, sm(sb + 12, sb + 40 + Math.abs(R) * 3.5, s));
    }
    // rocky shore: a bank rising to the land; cliff: the land right to the edge, a short broken face
    const hR = R * sm(0, 22 + Math.abs(R) * 0.7, s) + 0.9 * sm(0, 5, s) * (R > 0 ? 1 : 0);
    const hC = R * sm(0, 4 + Math.max(0, R) * 0.09, s) + 0.5 * sm(0, 2, s);
    h = wb * hB + wc * hC + wr * hR;
    if (R < 0) h = Math.min(h, R * sm(0, 30, s));   // estuary water reaches the coast
  } else {
    // the sea bed: shoreface, then the shelf (-14), deeper (-26) offshore; cliffs drop straight to deep water
    const d = -s, hB = d < 45 ? -0.066 * d : -2.97 - (d - 45) * 0.03, hC = -3 - d * 0.35, hR = -0.6 - d * 0.16;
    h = Math.max(wb * hB + wc * hC + wr * hR, -14 - 12 * sm(300, 1000, d) * (1 - sm(BOUND - 1200, BOUND - 200, Math.max(Math.abs(x), Math.abs(z)))));   // (back to the -14 shelf where wildH takes over)
    if (wc > 0.3 && d < 70) {   // sea stacks: the headland the sea has not taken yet
      const st = noise(x / 23 + 4.1, z / 23 - 2.9); if (st > 0.56 && d > 12) h = Math.max(h, mix(h, (8 + 18 * noise(x / 61, z / 61 + 3)) * wc, sm(0.56, 0.62, st)));
    }
  }
  // near-camera relief: grass hummocks, broken rock on cliffs and the high spine
  if (h > 0) {
    const f1 = noise(x / 9.3 + 1.1, z / 9.3 - 2.3), sandy = wb * (1 - sm(40, 80, s));
    h += (1 - sandy) * 0.35 * f1 * sm(0, 6, s);
    const rocky = Math.max(wc * (1 - sm(0, 30, s)), sm(150, 260, R));
    if (rocky > 0) h += rocky * 1.6 * Math.max(0, noise(x / 6.1 - 4.2, z / 6.1 + 3.8) + 0.1);
  }
  return h;
}

// ------------------------------------------------------------------------------------------------- the bake
let H = null, SID = null;
function bake() {
  if (H) return;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  if (!PL.S) bakePlan();
  const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
  H = new Float32Array(N * N); SID = new Uint8Array(N * N);
  const P = { s: 0, R: 0, wb: 0, wc: 0, riv: 0 };
  for (let j = 0; j < N; j++) {
    const z = -ZONE_E + j * ZONE_C;
    for (let i = 0; i < N; i++) {
      const x = -ZONE_E + i * ZONE_C, k = j * N + i, cheb = Math.max(Math.abs(x), Math.abs(z));
      planLerp(x, z, P);
      let h = groundAt(x, z, P);
      if (cheb > BLEND0) h = mix(h, wildH(x, z), sm(BLEND0, BLEND1, cheb));   // the seam ring: the zone's sea becomes the wild sea
      H[k] = h;
    }
  }
  // ---- surfaces, from the fine ground (its slope) and what the plan knew
  for (let j = 1; j < N - 1; j++) {
    const z = -ZONE_E + j * ZONE_C;
    for (let i = 1; i < N - 1; i++) {
      const k = j * N + i, h = H[k], x = -ZONE_E + i * ZONE_C;
      const gx = (H[k + 1] - H[k - 1]) / (2 * ZONE_C), gz = (H[k + N] - H[k - N]) / (2 * ZONE_C), sl = Math.hypot(gx, gz);   // rise per metre
      planLerp(x, z, P);
      const wb = P.wb, s = P.s;
      let id;
      if (h <= 0) { SID[k] = (wb > 0.4 || h < -4) && sl < 0.45 ? S_SAND : sl > 0.25 || P.wc > 0.5 ? S_ROCK : S_SHINGLE; continue; }   // the sea bed
      const n1 = noise(x / 13 + 7.7, z / 13 - 1.3);
      if (h <= 0) id = (wb > 0.4 || h < -4) && sl < 0.45 ? S_SAND : sl > 0.25 || P.wc > 0.5 ? S_ROCK : S_SHINGLE;          // the sea bed
      else if (sl > 0.85 || (P.wc > 0.5 && s < 25 && sl > 0.45)) id = S_ROCK;                                            // cliffs, crags, the escarpment
      else if (wb > 0.35 && h < 0.6 && sl < 0.2) id = S_WET;                                                             // the swash zone
      else if (wb > 0.3 + 0.25 * n1 && s < 52 + 18 * n1 && P.R < 30) id = s > 40 && n1 > 0.25 ? S_GRASS : S_SAND;        // beach, dunes (marram tufts)
      else if (wb < 0.35 && h < 1.5 && s < 14) id = sl > 0.5 ? S_ROCK : S_SHINGLE;                                       // the strand under a rocky bank
      else if (P.riv > 0.55 && sl < 0.12 && h < 4) id = S_MARSH;                                                         // estuary salt marsh
      else if (P.riv > 0.75 && sl < 0.1) id = S_MUD;                                                                     // the stream's flood plain
      else if ((sl > 0.6 && n1 > -0.1) || (sl > 0.42 && n1 > 0.3) || (h > 230 && sl > 0.3)) id = S_ROCK;                  // outcrops, scree, the high spine
      else if ((noise(x / 19 - 3.3, z / 19 + 6.1) < -0.56 && sl > 0.12 && sl < 0.3) || (sl > 0.4 && n1 < -0.4)) id = S_DIRT;   // worn earth on the slopes, sheep scrapes (small: the big bare blobs read as mud from the air)
      else id = S_GRASS;
      SID[k] = id;
    }
  }
  if (t0 && typeof globalThis.__TERRAIN_LOG === 'function') globalThis.__TERRAIN_LOG(`terrain bake ${(performance.now() - t0).toFixed(0)} ms (plan ${(t1 - t0).toFixed(0)})`);
  BAKE_MS = t0 ? performance.now() - t0 : 0;
}
let BAKE_MS = 0;
export const bakeMs = () => BAKE_MS;   // how long this thread's bake took (ms)

// ------------------------------------------------------------------------------------------------- queries
export function zoneH(x, z) {
  if (!H) bake();
  const gx = (x + ZONE_E) / ZONE_C, gz = (z + ZONE_E) / ZONE_C;
  if (!(gx >= 0 && gz >= 0 && gx < N - 1 && gz < N - 1)) return SEA_FLOOR;
  const i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, k = j * N + i;
  const a = H[k], b = H[k + 1], c = H[k + N], d = H[k + N + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function zoneSurfId(x, z) {
  if (!H) bake();
  const i = Math.round((x + ZONE_E) / ZONE_C), j = Math.round((z + ZONE_E) / ZONE_C);
  if (!(i >= 0 && j >= 0 && i < N && j < N)) return S_SAND;
  return SID[j * N + i];
}
export const zoneSurf = (x, z) => SURF_NAMES[zoneSurfId(x, z)];
export const inGrid = (x, z) => Math.abs(x) < ZONE_E - 2 && Math.abs(z) < ZONE_E - 2;
export function zoneGrid() { if (!H) bake(); return { N, C: ZONE_C, E: ZONE_E, h: H, s: SID }; }
export function islandInfo(I) {
  if (!PL.S) bakePlan();
  const near = shoreAt(I.x, I.z, 600);
  return { name: I.name, geology: geologyOf(I), plateau: SITE_H[I.name] ?? 8, coast: near ? { kind: near.kind, s: near.s } : null };
}
// the nearest coast to (x, z) within `range` m: ray-march 32 directions to the first water
export function shoreAt(x, z, range = 200) {
  if (!PL.S) bakePlan();
  const p = planLerp(x, z, { s: 0, R: 0, wb: 0, wc: 0, riv: 0 }), I = nearestSite(x, z);
  if (Math.abs(p.s) > range) return null;
  return { island: I, s: p.s, beach: p.wb, kind: p.wb > 0.5 ? 'beach' : p.wc > 0.5 ? 'cliff' : 'rocky' };
}
const nearestSite = (x, z) => { let best = null, bd = Infinity; for (const I of ISLANDS) { const d = Math.hypot(x - I.x, z - I.z) - I.r; if (d < bd) { bd = d; best = I; } } return best; };

// ------------------------------------------------------------------------------------------------- beaches
// Sand beaches within 700 m of each site: the waterline point on a ray from the site, inland direction, how far the sand
// runs up, the clear water off it. Same shape as the landing hards (landinghard.js) so the LCM-8 run-in code works.
let BEACHES = null;
export function beaches() {
  if (BEACHES) return BEACHES;
  if (!PL.S) bakePlan();
  BEACHES = [];
  for (const I of ISLANDS) {
    const found = [];
    for (let k = 0; k < 48; k++) {
      const a = k / 48 * Math.PI * 2, cx = Math.cos(a), sz = Math.sin(a);
      let w0 = -1; for (let d = 20; d < I.r + 700; d += 4) if (zoneH(I.x + cx * d, I.z + sz * d) < 0) { w0 = d; break; }
      if (w0 < 0) continue;
      const x = I.x + cx * w0, z = I.z + sz * w0, p = planLerp(x, z, { s: 0, R: 0, wb: 0, wc: 0, riv: 0 });
      if (p.wb < 0.6 || found.some(b => Math.hypot(b.x - x, b.z - z) < 150)) continue;
      const B = { I, name: `${I.name} BEACH${found.length ? ' ' + (found.length + 1) : ''}`, main: !found.length, x, z, fx: -cx, fz: -sz, grade: 0.066, u0: -36, w: 30 };
      B.at = (u, lat = 0) => [B.x + B.fx * u - B.fz * lat, B.z + B.fz * u + B.fx * lat];
      B.y = u => { const [px, pz] = B.at(u); return zoneH(px, pz); };
      let u1 = 6; for (let u = 2; u < 70; u++) { const [px, pz] = B.at(u), sid = zoneSurfId(px, pz); if (sid !== S_SAND && sid !== S_WET) break; if (B.y(u + 2) - B.y(u) > 1.2) break; u1 = u; }
      B.u1 = u1;
      let run = 0; for (let d = 6; d < 300; d += 6) { const [px, pz] = B.at(-d); if (zoneH(px, pz) > -1.8 && d > 40) break; run = d; }
      B.runIn = run; B.yaw = Math.atan2(cx, sz);
      B.bx0 = Math.min(x, B.at(u1)[0]) - B.w; B.bx1 = Math.max(x, B.at(u1)[0]) + B.w; B.bz0 = Math.min(z, B.at(u1)[1]) - B.w; B.bz1 = Math.max(z, B.at(u1)[1]) + B.w;
      found.push(B); if (found.length >= 2) break;
    }
    BEACHES.push(...found);
  }
  return BEACHES;
}
export const beachesOf = I => beaches().filter(b => b.I === I);
