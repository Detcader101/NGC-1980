// SEALIFE: the life in the archipelago's sea. Pure simulation (no THREE, no DOM, no game imports; node-testable by
// tools/fishbench.mjs). sealife.js draws it and feeds it what disturbs it; seabirds.js flies over it.
//
// What it models
// - SCHOOLS of one species each. They spawn round the camera AND round the units on the water (ships under way or at
//   anchor, landing craft, trawlers, low helicopters, swimmers), so the life is where the action is. A budget of fish,
//   weighted to what is near the camera: far schools are stepped coarsely (moved as one), and every school fades in
//   when it spawns and fades out before it is dropped (no popping in or out at the edge of the screen).
// - Inside a school every fish is a boid (Reynolds 1987): separation inside the nearest-neighbour distance, alignment
//   and cohesion with the fish round it (a grid per school, so a few hundred fish stay cheap), a weak pull back to the
//   school (a school split by a ship re-forms in its wake), a wandering goal, a depth band, the sea bed and the shore
//   ahead (depthAt is the game's terrain height: new beaches just work), and the LIVE WAVES on top (surf(): the drawn
//   sea; nothing pokes out of a trough, floating things ride the swell).
//   Turning fish bank (roll into the turn): their silver flanks flash at the sky - the flicker you see from above.
// - FRIGHT: hulls (a box round the waterline, the bow's pressure wave further ahead with speed, the wake behind),
//   propeller wash (turbulence, the following current), rotor downwash (radial outflow), swimmers, landing craft,
//   splashes and gunfire, explosions. A fish that feels it bolts at burst speed away and down (vessel avoidance: fish
//   dive and move aside ahead of a ship, Misund 1997, Vabo et al. 2002 - INFERRED form, distances game-tuned); the
//   fright runs through the school as a wave (the "Trafalgar effect", Treherne & Foster 1981 - INFERRED form, 8 m/s).
//   A ship at anchor is no threat at all a few metres off: fish gather in its shade (the FAD effect, Freon & Dagorn
//   2000 - CONFIRMED behaviour; distances game-tuned).
// - PREDATORS: bonito, amberjack and dolphins hunt pilchard (and mackerel, flying fish). The prey see each predator
//   as a moving threat and split round it (the "fountain effect", Pitcher & Parrish 1993 - CONFIRMED behaviour); a
//   school under attack balls up, mills and is driven to the surface (the BAIT BALL); predators make passes through it,
//   strike (a boil at the surface), now and then leap clear. Seabirds see it from far off (seabirds.js).
// - LEAPS: grey mullet leap clear when a boat comes at them in the shallows, and now and then for no reason anyone has
//   agreed on (Hoese 1985 - CONFIRMED behaviour); FLYING FISH taxi and glide away from a bow wave, 0.5-1.2 m up over the
//   waves, 2-4 s a glide, sometimes a second glide off a tail-beat taxi (Davenport 1994 Rev Fish Biol Fish 4 - glides
//   ~50 m at 10-20 m/s, CONFIRMED order). DOLPHINS bow-ride a ship under way (in the pressure field ahead of the stem),
//   breathe every 10-35 s (rolling the back and fin through the surface) and porpoise above ~4.5 m/s, where a leap
//   costs less than swimming at the surface (Au & Weihs 1980 Nature 284 - CONFIRMED form, crossover INFERRED).
// - BLASTS: fish close to an explosion in the water are stunned (roll belly up, float to the surface, recover) or
//   killed (float, ride the swell, then sink). Radii game-tuned. Gulls and sharks come for them.
// - REEF FISH: sea bream and damselfish hold station over the bed in the shallows; bream come close to a still swimmer
//   (they learn divers turn up food in protected areas - INFERRED, game-tuned), everything keeps clear of a fast one.
// - DRIFTERS and LOAFERS: barrel jellyfish drift and pulse near the top (sink out of a rough sea), eagle rays glide
//   over sand, a sandbar shark cruises the bottom and comes up under the dead fish after a blast (its fin cuts the top).
// - DAY / NIGHT and SEA STATE: in a rough sea the fish swim deeper (S.sea 0..1); at night schools loosen (S.light).
// - SWIMMING: speed follows body length (BL): cruise ~1-3 BL/s, bursts ~10 BL/s (Videler 1993 "Fish Swimming";
//   Domenici & Blake 1997 J Exp Biol 200 - INFERRED, species values UNVERIFIED). The tail beats at Bainbridge's (1958,
//   J Exp Biol 35) U = L (3 f - 4) / 4, f = (4 U / L + 4) / 3 (CONFIRMED form), amplitude ~0.2 L (CONFIRMED order).
//
// Coordinates: world metres, y up, the mean sea surface at y = 0. depthAt(x, z) is the ground height (negative under
// the sea), the same function the physics uses; surf(x, z, out) the drawn sea's elevation and slope there (optional).
// Every random draw comes from the seeded generator: the same seed and inputs give the same sea.
import { underwaterVisibility } from './seavisibility.js';

const TAU = Math.PI * 2, G = 9.81;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hyp = (a, b, c = 0) => Math.sqrt(a * a + b * b + c * c);   // (Math.hypot is variadic: slow, and it allocated in the hot loops)

// The species: the real fish of a 1980 warm-temperate archipelago (NE Atlantic / Mediterranean coasts). The game's sea
// is shallow (the zone's floor ~14 m, a little deeper offshore), so the depth bands are squeezed into it.
//   len    body length range (m)                 n      fish (boids) per school
//   water  sea depth they are found over (m)     band   swimming depth below the surface (m)
//   bottom > 0: they keep this close over the bed (bottom fish)     storm: m deeper per sea-state unit (0..1)
//   cruise / burst  speeds in body lengths per second               nnd: neighbour spacing (body lengths, boids)
//   view   neighbour radius (m)    shy  how far (m) a threat of strength 1 is felt (x)   calm  s for fear to fade
//   weight spawn odds   max  schools of this kind at once   draw: which mesh ('school' boids draw `SUB` fish each)
//   role:  'school' | 'reef' (holds station, home m) | 'pred' (hunts) | 'solo' | 'drift' | 'mammal'
export const SUB = 4;   // fish drawn per boid of a 'school' species (a tight cluster; see subOffset)
export const SPECIES = [
  {   // European pilchard (sardine), Sardina pilchardus: 15-20 cm, dense schools near the surface over the shelf; the
      // bait of the sea (bonito, amberjack, dolphins, gannets, terns, gulls all take them). nnd 2 BL between boids,
      // each boid drawn as SUB fish ~1 BL apart (Pitcher & Partridge 1979: ~0.5-1 BL, INFERRED).
    key: 'sardine', name: 'PILCHARD', len: [0.14, 0.2], n: [60, 110], water: [3, 99], band: [0.5, 5], bottom: 0, storm: 3,
    cruise: 2.2, burst: 12, nnd: 2.1, view: 1.9, agility: 3.5, shy: 1.0, calm: 4, weight: 3, max: 5, draw: 'school', role: 'school', ball: true, fad: true,
  },
  {   // Atlantic mackerel, Scomber scombrus: 30-40 cm, fast, schools in mid water; bursts ~5 m/s (Wardle 1975, INFERRED).
    key: 'mackerel', name: 'MACKEREL', len: [0.28, 0.38], n: [30, 55], water: [5, 99], band: [1, 8], bottom: 0, storm: 3,
    cruise: 2.6, burst: 11, nnd: 2.2, view: 3.4, agility: 3.0, shy: 1.1, calm: 5, weight: 2, max: 4, draw: 'school', role: 'school', fad: true,
  },
  {   // Flathead grey mullet, Mugil cephalus: 30-50 cm, groups grazing the bottom in the shallows by the beaches; leapers.
    key: 'mullet', name: 'GREY MULLET', len: [0.3, 0.5], n: [7, 16], water: [0.7, 4.5], band: [0.3, 4], bottom: 0.45, storm: 0,
    cruise: 1.0, burst: 8, nnd: 1.8, view: 3.5, agility: 2.2, shy: 1.4, calm: 6, weight: 2, max: 4, draw: 'fish', role: 'school', leap: 'hop', jumpy: 0.05,
  },
  {   // Greater amberjack, Seriola dumerili: ~1 m, loose groups, deep near the bottom, round rocks, wrecks and hulls;
      // takes pilchard and mackerel.
    key: 'amberjack', name: 'AMBERJACK', len: [0.8, 1.25], n: [4, 9], water: [8, 99], band: [4, 30], bottom: 1.6, storm: 0,
    cruise: 0.9, burst: 6, nnd: 2.5, view: 8, agility: 1.6, shy: 0.8, calm: 6, weight: 1, max: 2, draw: 'fish', role: 'pred', hunts: ['sardine', 'mackerel'], fad: true,
  },
  {   // Atlantic bonito, Sarda sarda: 50-70 cm, fast schools that drive pilchard to the surface and burst through them.
    key: 'bonito', name: 'BONITO', len: [0.5, 0.7], n: [6, 14], water: [7, 99], band: [0.5, 10], bottom: 0, storm: 2,
    cruise: 1.8, burst: 13, nnd: 2.5, view: 8, agility: 3.2, shy: 0.6, calm: 3, weight: 1.2, max: 2, draw: 'fish', role: 'pred', hunts: ['sardine'], leap: 'hop', jumpy: 0,
  },
  {   // Mediterranean flying fish, Cheilopogon heterurus: 25-32 cm, small groups at the top over deep water; glide.
    key: 'flyingfish', name: 'FLYING FISH', len: [0.25, 0.32], n: [5, 12], water: [11, 99], band: [0.3, 1.6], bottom: 0, storm: 1,
    cruise: 2.0, burst: 14, nnd: 3, view: 4, agility: 3, shy: 1.7, calm: 5, weight: 1.2, max: 2, draw: 'fish', role: 'school', leap: 'glide', jumpy: 0,
  },
  {   // Two-banded sea bream, Diplodus vulgaris: 15-25 cm, loose groups holding over rock and sea grass 1-15 m.
    key: 'bream', name: 'SEA BREAM', len: [0.15, 0.25], n: [8, 18], water: [1.2, 15], band: [0.4, 15], bottom: 1.1, storm: 0,
    cruise: 0.8, burst: 8, nnd: 2.6, view: 2.5, agility: 2.5, shy: 0.9, calm: 5, weight: 2, max: 4, draw: 'fish', role: 'reef', home: 7, curious: 0.7,
  },
  {   // Damselfish, Chromis chromis: 8-12 cm, dark brown clouds hovering 1-3 m over rocks, 2-25 m.
    key: 'damsel', name: 'DAMSELFISH', len: [0.08, 0.12], n: [18, 36], water: [2, 25], band: [0.5, 25], bottom: 1.8, storm: 0,
    cruise: 0.6, burst: 8, nnd: 2.3, view: 1.2, agility: 3, shy: 0.8, calm: 4, weight: 1.5, max: 3, draw: 'school', role: 'reef', home: 4, curious: 0.3,
  },
  {   // Sandbar shark, Carcharhinus plumbeus: 1.4-2 m, Mediterranean nursery grounds; cruises the bottom, scavenges.
    key: 'shark', name: 'SANDBAR SHARK', len: [1.4, 2.0], n: [1, 2], water: [5, 99], band: [1.5, 40], bottom: 2.2, storm: 0,
    cruise: 0.45, burst: 4, nnd: 6, view: 20, agility: 1.0, shy: 0.4, calm: 4, weight: 0.3, max: 1, draw: 'fish', role: 'solo', scav: true,
  },
  {   // Common eagle ray, Myliobatis aquila: 0.6-1 m across (len here: the disc length), over sand 1-30 m.
    key: 'ray', name: 'EAGLE RAY', len: [0.5, 0.8], n: [1, 3], water: [1.2, 30], band: [0.3, 30], bottom: 0.5, storm: 0,
    cruise: 0.9, burst: 5, nnd: 4, view: 6, agility: 1.4, shy: 1.0, calm: 5, weight: 0.6, max: 2, draw: 'ray', role: 'solo',
  },
  {   // Barrel jellyfish, Rhizostoma pulmo: bell 0.3-0.5 m, drifting near the top in summer (len: the bell + arms).
    key: 'jelly', name: 'BARREL JELLYFISH', len: [0.45, 0.8], n: [3, 9], water: [4, 99], band: [0.3, 3.5], bottom: 0, storm: 6,
    cruise: 0.1, burst: 0.3, nnd: 6, view: 0, agility: 0.6, shy: 0, calm: 1, weight: 0.7, max: 2, draw: 'jelly', role: 'drift',
  },
  {   // Short-beaked common dolphin, Delphinus delphis: 1.8-2.4 m, pods of 5-12 here; bow-riders, porpoise when fast.
    key: 'dolphin', name: 'COMMON DOLPHIN', len: [1.8, 2.3], n: [5, 11], water: [9, 99], band: [0.5, 9], bottom: 0, storm: 1,
    cruise: 1.3, burst: 4.8, nnd: 2.6, view: 25, agility: 1.8, shy: 0.25, calm: 6, weight: 0.45, max: 1, draw: 'dolphin', role: 'mammal', hunts: ['sardine', 'mackerel', 'flyingfish'],
  },
];
export const SPECIES_INDEX = Object.fromEntries(SPECIES.map((s, i) => [s.key, i]));
for (const sp of SPECIES) sp.huntsI = (sp.hunts || []).map(k => SPECIES_INDEX[k]);

// tail-beat frequency (Hz) of a fish of length L (m) at speed U (m/s): Bainbridge 1958
export const tailBeatHz = (U, L) => (4 * U / L + 4) / 3;

// Budgets by quality (the pause menu's SEA LIFE): boids (each 'school' boid draws SUB fish), schools
export const QUALITY = {
  low: { MAX_FISH: 420, MAX_SCHOOLS: 12 },
  medium: { MAX_FISH: 760, MAX_SCHOOLS: 18 },
  high: { MAX_FISH: 1100, MAX_SCHOOLS: 24 },
};
export const FISH = {
  MAX_FISH: 760,        // the most boids alive at once (the instance buffers are sized for QUALITY.high)
  MAX_SCHOOLS: 18,
  R_UNDER: 70,          // sim radius round the camera under water; close schools also serve swimmers/divers
  R_MIN: 70, R_MAX: 220, // above water: grows with the camera's height
  ALT_MAX: 1200,        // aerial shoals fade before high-altitude flight stops local simulation
  ANCHOR_VIEW: 520,     // units further than this from the camera keep no life round them
  ANCHOR_R: 130,        // a school stays while within this of a unit that keeps life
  COARSE: 230,          // m from the camera: further than this a school moves as one (no boids)
  SPAWN_DT: 0.35,       // s between spawn attempts
  FADE: 1.8,            // s to fade a school in (and out before it is dropped)
  ALARM_V: 8,           // m/s: how fast fright runs through a school
  STEP: 1 / 20,         // the longest sim substep (s)
  DEAD_T: 90,           // s a dead fish floats before it sinks away
};

// stride of one fish in a school's Float32Array
const F_X = 0, F_Y = 1, F_Z = 2, F_VX = 3, F_VY = 4, F_VZ = 5, F_FEAR = 6, F_STUN = 7, F_PH = 8, F_LEN = 9, F_ROLL = 10, F_DEAD = 11,
  F_AIR = 12, F_JIT = 13, F_COOL = 14, F_BR = 15, F_WING = 16, F_AK = 17;
const F_HANDLE = F_WING;   // predators (no wings): s until the next strike (handling time)
const STRIDE = 18;
// F_DEAD: 0 alive, 1 dead (floats, then sinks), 2 eaten (gone)   F_AIR: s in the air (0 = in the water)
// F_AK: kind of airtime (1 hop, 2 glide, 3 dolphin leap)          F_COOL: s until it may leap again (glide: s left)
// F_BR: dolphins: s until the next breath                          F_WING: flying fish: pectorals spread 0..1

export function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
// the cluster of drawn fish round each 'school' boid: sub-fish k sits at SUB_BASE[k] (x starboard, y up, z forward, in
// body lengths) plus a jitter hashed from the fish's own seed (0..1, stable for its life), so a cluster keeps its shape
// whatever order the fish are drawn in. sealife.js's shader does exactly this (SUB_GLSL); subOffset is it in JS.
export const SUB_BASE = [[-0.85, 0.22, 0.35], [0.8, -0.18, 0.15], [0.12, 0.5, -0.75], [-0.1, -0.52, -0.55]];
const fract = x => x - Math.floor(x);
export function subOffset(seed, k, out = [0, 0, 0, 0]) {
  const s = seed * (k + 1), b = SUB_BASE[k];
  const h1 = fract(Math.sin(s * 12.9898) * 43758.5453), h2 = fract(Math.sin(s * 78.233) * 43758.5453), h3 = fract(Math.sin(s * 37.719) * 43758.5453);
  out[0] = b[0] + (h1 - 0.5) * 0.35; out[1] = b[1] + (h2 - 0.5) * 0.25; out[2] = b[2] + (h3 - 0.5) * 0.4; out[3] = h1 * TAU;
  return out;
}
export const SUB_GLSL = `
  const vec3 SUB_B0=vec3(${SUB_BASE[0]}), SUB_B1=vec3(${SUB_BASE[1]}), SUB_B2=vec3(${SUB_BASE[2]}), SUB_B3=vec3(${SUB_BASE[3]});
  vec4 subOffset(float seed, float k){
    float s=seed*(k+1.); vec3 h=fract(sin(s*vec3(12.9898,78.233,37.719))*43758.5453);
    vec3 b=k<.5?SUB_B0:k<1.5?SUB_B1:k<2.5?SUB_B2:SUB_B3;
    return vec4(b+(h-.5)*vec3(.35,.25,.4), h.x*6.2832);
  }`;

export function createFishSim({ depthAt, seed = 1980, surf = null } = {}) {
  const r = rng(seed);
  // ---- the sea bed, cached on a 2 m grid (terrainH is not free). Cells are filled on first use.
  // (ngc/perf-cpu) in 64 x 64 cell tiles of doubles (NaN = not yet), keyed by a small integer: the old Map keyed by
  // i * 1048576 + j went past the small-integer range, so every lookup boxed a new heap number - 1.7 MB a frame of
  // garbage with a few schools about. Same values, same cells.
  const BC = 2, bedCache = new Map(), TB = 64;
  let lastKey = -1, lastTile = null;
  const cellH = (i, j) => {
    const ti = i >> 6, tj = j >> 6;
    if (ti < -512 || ti > 511 || tj < -512 || tj > 511) return depthAt(i * BC, j * BC);   // (beyond +-65 km: uncached)
    const key = (ti + 512) * 1024 + (tj + 512);
    let T = key === lastKey ? lastTile : bedCache.get(key);
    if (!T) { T = new Float64Array(TB * TB).fill(NaN); bedCache.set(key, T); }
    lastKey = key; lastTile = T;
    const c = (i & 63) + (j & 63) * TB; let h = T[c];
    if (h !== h) { h = depthAt(i * BC, j * BC); T[c] = h; }
    return h;
  };
  const bed = (x, z) => {
    const gx = x / BC, gz = z / BC, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const a = cellH(i, j), b = cellH(i + 1, j), c = cellH(i, j + 1), d = cellH(i + 1, j + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
  };
  // ---- the live sea surface (exact, at a point) - the waves die out over the last metres of depth, like the drawn sea
  const _so = { e: 0, sx: 0, sz: 0 };
  const surfAt = (x, z, out = _so) => { if (surf) surf(x, z, out); else { out.e = 0; out.sx = 0; out.sz = 0; } return out; };

  const S = {
    enabled: true, schools: [], t: 0, nFish: 0, spawnT: 0, cam: { x: 0, y: 0, z: 0 }, focus: { x: 0, z: 0 }, radius: 0, ms: 0,
    threats: [], nThreats: 0, transient: [], anchors: [], nAnchors: 0, sites: [], events: [], nEv: 0,
    light: 1, sea: 0.5, quality: 'medium', autoSpawn: true,
    stats: { spawned: 0, despawned: 0, stunned: 0, killed: 0, fled: 0, eaten: 0, leaps: 0, glides: 0, breaths: 0, balls: 0, anchored: 0 },
    bed, surfAt,
  };
  S.setQuality = q => { const Q = QUALITY[q] || QUALITY.medium; S.quality = QUALITY[q] ? q : 'medium'; FISH.MAX_FISH = Q.MAX_FISH; FISH.MAX_SCHOOLS = Q.MAX_SCHOOLS; };
  // ------------------------------------------------------------------ events out (sealife.js draws them): splashes etc.
  //   kind: 'jump' (leaves the water) 'enter' (falls back in) 'boil' (a strike at the top) 'blow' (a dolphin breathes)
  //         'taxi' (a flying fish's tail beating the top) 'fin' (a fin cutting the top)
  const event = (kind, x, y, z, s, sp = -1) => {
    let e = S.events[S.nEv]; if (!e) { e = { kind: '', x: 0, y: 0, z: 0, s: 0, sp: -1 }; S.events.push(e); }
    if (S.nEv >= 96) return; S.nEv++; e.kind = kind; e.x = x; e.y = y; e.z = z; e.s = s; e.sp = sp;
  };
  // ------------------------------------------------------------------ threats and anchors
  // A threat each frame (the host fills them before update): kind 0 point, 1 hull (a box in the ship's frame).
  //   x, y, z  where; r  how far it is felt at k = 1; k  strength; vx, vz  its velocity; deep  how far down it reaches
  //   hull: c, s (cos / sin of the heading: forward = (-s, -c) as the game's units), hl, hw (half length / beam), dr, v
  //   swim: a swimmer (reef fish come and look); wash: rotor downwash (water pushed out from under it)
  // Every threat this frame is also an ANCHOR: life spawns and stays round it (weight w).
  // (threats, transients and anchors share ONE object shape, and every number field starts as a double: the hot loops
  // then stay monomorphic - mixed shapes deoptimised them and boxed every double, ~8 MB of garbage a frame)
  const mkThreat = () => ({ kind: 0, x: 0.5, y: 0.5, z: 0.5, r: 1.5, k: 1.5, vx: 0.5, vz: 0.5, c: 0.5, s: 0.5, hl: 0.5, hw: 0.5, dr: 0.5, v: 0.5, deep: 0.5, swim: false, wash: false, w: 0.5, life: 0.5, t: 0.5 });
  const threat = () => { let t = S.threats[S.nThreats]; if (!t) { t = mkThreat(); S.threats.push(t); } t.life = 0; t.t = 0; S.nThreats++; t.vx = t.vz = 0; t.deep = 0; t.swim = t.wash = false; t.v = 0; t.w = 0.5; return t; };
  S.clearThreats = () => { S.nThreats = 0; S.nAnchors = 0; };
  // a point disturbance (rotor wash, a swimmer, a craft): r metres at strength k; deep: how far down it reaches (m)
  S.point = (x, y, z, r, k = 1, vx = 0, vz = 0, deep = 4, o) => {
    const t = threat(); t.kind = 0; t.x = x; t.y = y; t.z = z; t.r = r; t.k = k; t.vx = vx; t.vz = vz; t.deep = deep; t.v = hyp(vx, vz);
    if (o) { t.swim = !!o.swim; t.wash = !!o.wash; if (o.w !== undefined) t.w = o.w; }
    return t;
  };
  // a hull at (x, z) heading yaw (forward = (-sin yaw, -cos yaw)), half length / beam, draft, speed (m/s).
  // Under way the bow's pressure wave reaches further ahead with speed; at anchor (< 0.6 m/s) only the hull itself.
  S.hull = (x, z, yaw, hl, hw, dr, speed = 0) => {
    const t = threat(); t.kind = 1; t.x = x; t.y = 0; t.z = z; t.c = Math.cos(yaw); t.s = Math.sin(yaw); t.hl = hl; t.hw = hw; t.dr = dr;
    const v = Math.abs(speed), still = v < 0.6;
    t.vx = -t.s * speed; t.vz = -t.c * speed; t.v = v;
    t.r = still ? 4 + hw * 0.15 : 6 + v * 3.5 + hw; t.k = still ? 0.3 : 0.55 + Math.min(0.6, v * 0.12); t.deep = dr + 6; t.w = 1 + Math.min(1, hl / 40);
    return t;
  };
  // something that keeps life round it without frightening anything (a trawler's fishing ground, a buoy): weight w
  S.anchor = (x, z, w = 1, vx = 0, vz = 0) => { let a = S.anchors[S.nAnchors]; if (!a) { a = mkThreat(); a.kind = 2; a.r = 0; a.k = 0; a.hl = a.hw = 0; S.anchors.push(a); } S.nAnchors++; a.x = x; a.z = z; a.w = w; a.vx = vx; a.vz = vz; return a; };
  // something brief: a splash, a burst of gunfire on the water, a wake patch (lasts `life` s, fading)
  S.scare = (x, y, z, r, k = 1, life = 1.5, deep = 5) => {
    if (S.transient.length > 48) S.transient.shift();
    const t = mkThreat(); t.kind = 0; t.x = x; t.y = y; t.z = z; t.r = r; t.k = k; t.life = life; t.t = life; t.deep = deep; t.vx = t.vz = t.v = t.hl = t.hw = t.dr = 0; t.c = 1; t.s = 0; t.w = 0;
    S.transient.push(t);
  };
  // an explosion at (x, y, z) of size s (the fx scale: a grenade ~0.8, a shell 1-2, a ship's magazine 5)
  S.blast = (x, y, z, s = 1) => {
    const coup = y > 0.4 ? Math.exp(-(y - 0.4) / 1.5) : 1;   // in the air above the water little of it goes in
    if (coup < 0.05) { S.scare(x, 0, z, 12 + 8 * s, 0.8, 2); return 0; }
    const rStun = (3 + 6 * s) * coup, rKill = rStun * 0.2;
    let hit = 0;
    for (const sc of S.schools) {
      const sp = SPECIES[sc.sp];
      if (hyp(sc.cx - x, sc.cz - z) > rStun + sc.rad + 2) continue;
      if (sp.role === 'drift') continue;   // (no swim bladder: a jellyfish just rocks)
      if (sp.role === 'mammal') { sc.flee = 60; sc.fx = x; sc.fz = z; continue; }   // dolphins: away, and far
      const a = sc.a;
      for (let i = 0; i < sc.n; i++) {
        const o = i * STRIDE; if (a[o + F_DEAD] > 0) continue;
        const d = hyp(a[o] - x, (a[o + F_Y] - Math.min(y, 0)), a[o + F_Z] - z);
        if (d > rStun) continue;
        hit++; a[o + F_AIR] = 0;
        if (d < rKill * (0.7 + 0.6 * r())) { a[o + F_DEAD] = 1; a[o + F_STUN] = FISH.DEAD_T; S.stats.killed++; }
        else { a[o + F_STUN] = Math.max(a[o + F_STUN], 6 + 16 * (1 - d / rStun) * (0.6 + 0.8 * r())); S.stats.stunned++; }
        const k = 4 * (1 - d / rStun) / Math.max(d, 0.5);   // thrown outward
        a[o + F_VX] += (a[o] - x) * k; a[o + F_VZ] += (a[o + F_Z] - z) * k; a[o + F_VY] += 0.5;
      }
    }
    S.scare(x, 0, z, 22 + 14 * s, 1.2, 3.5, 20);
    if (hit > 3) { if (S.sites.length > 6) S.sites.shift(); S.sites.push({ x, z, t: 0, n: hit }); }   // gulls and sharks come
    return hit;
  };

  // ------------------------------------------------------------------ schools
  const habitatOK = (sp, depth) => depth >= sp.water[0] && depth <= sp.water[1];
  const allowed = sp => !(sp.role === 'drift' && S.sea > 0.7) && !(sp.leap === 'glide' && S.light < 0.25);
  function pickSpecies(depth, near) {   // near: an anchor's kind of place ('ship', 'shallow'), or null
    let tot = 0;
    for (const sp of SPECIES) if (habitatOK(sp, depth) && allowed(sp)) tot += sp.weight * (near === 'ship' && (sp.fad || sp.role === 'mammal' || sp.leap === 'glide') ? 2 : 1);
    if (!tot) return -1;
    let u = r() * tot;
    for (let i = 0; i < SPECIES.length; i++) { const sp = SPECIES[i]; if (!habitatOK(sp, depth) || !allowed(sp)) continue; u -= sp.weight * (near === 'ship' && (sp.fad || sp.role === 'mammal' || sp.leap === 'glide') ? 2 : 1); if (u <= 0) return i; }
    return -1;
  }
  // the depth band (y range) for species sp over a bed at height b: [lo, hi] with lo < hi <= 0
  function band(sp, b, len, out) {
    const top = -Math.max(sp.band[0] + sp.storm * S.sea * S.sea, 0.25 + len * 0.5), floor = b + Math.max(0.25, len * 0.6);
    let lo = Math.max(-sp.band[1], floor), hi = top;
    if (sp.bottom > 0) { hi = Math.min(hi, b + sp.bottom + len); lo = Math.max(lo, b + Math.max(0.2, len * 0.5)); }
    if (lo > hi) { const m = (Math.max(floor, -sp.band[1]) + top) * 0.5; lo = hi = Math.min(m, -0.3); }
    out[0] = lo; out[1] = hi; return out;
  }
  const _b = [0, 0];
  function spawnSchool(spi, x, z, fadeIn = true, anchored = false) {
    const sp = SPECIES[spi], n = Math.round(sp.n[0] + r() * (sp.n[1] - sp.n[0]));
    if (S.nFish + n > FISH.MAX_FISH) return null;
    const b = bed(x, z), L0 = sp.len[0] + r() * (sp.len[1] - sp.len[0]);
    band(sp, b, L0, _b); const yc = _b[1] - (_b[1] - _b[0]) * (0.15 + 0.35 * r());   // (the upper part of the band)
    const hd = r() * TAU, sp0 = sp.cruise * L0;
    const sc = {
      sp: spi, n, a: new Float32Array(n * STRIDE), cx: x, cy: yc, cz: z, rad: 2, gx: x, gz: z, goalT: 0, alarm: 0, ax: 0, az: 0, at: -99,
      fade: fadeIn ? 0 : 1, leave: false, retiring: false, L: L0, vx: 0, vz: 0, id: S.stats.spawned, live: n, coarse: false, anchored,
      hx: x, hz: z,                              // home (reef fish)
      ball: 0, mill: r() < 0.5 ? 1 : -1, preds: [], prey: null, huntT: 0, fullT: 0, fed: 0, flee: 0, fx: 0, fz: 0,
      ship: null, se: 0, ssx: 0, ssz: 0, eaten: 0, held: n, topT: 10 + (S.stats.spawned * 7.3) % 30, surfacing: false, wasBall: false,   // (all fields here: one shape)
    };
    // a ball of fish, nnd apart, all heading roughly one way
    const spread = Math.cbrt(n) * sp.nnd * L0 * 0.9;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE, a = sc.a, len = L0 * (0.85 + 0.3 * r());
      a[o] = x + (r() - 0.5) * 2 * spread; a[o + F_Z] = z + (r() - 0.5) * 2 * spread;
      if (bed(a[o], a[o + F_Z]) > _b[0] - 0.2) { a[o] = x + (r() - 0.5) * 0.5; a[o + F_Z] = z + (r() - 0.5) * 0.5; }   // (not in the ground)
      a[o + F_Y] = clamp(yc + (r() - 0.5) * spread, _b[0], _b[1]);
      const h = hd + (r() - 0.5) * 0.6; a[o + F_VX] = Math.sin(h) * sp0; a[o + F_VZ] = Math.cos(h) * sp0; a[o + F_VY] = 0;
      a[o + F_PH] = r() * TAU; a[o + F_LEN] = len; a[o + F_JIT] = r(); a[o + F_BR] = 4 + r() * 20; a[o + F_COOL] = r() * 4;
    }
    surfAt(x, z); sc.se = _so.e; sc.ssx = _so.sx; sc.ssz = _so.sz;
    S.schools.push(sc); S.nFish += n; S.stats.spawned++; if (anchored) S.stats.anchored++;
    return sc;
  }
  // (the host / scenes / tests: a school here now - if the budget is full the schools furthest from the camera go)
  S.spawnSchool = (key, x, z, fadeIn = false, anchored = false) => {
    const spi = typeof key === 'number' ? key : SPECIES_INDEX[key], need = SPECIES[spi].n[1];
    while (S.nFish + need > FISH.MAX_FISH && S.schools.length) { let wi = 0, wd = -1; for (let q = 0; q < S.schools.length; q++) { const sc = S.schools[q], d = hyp(sc.cx - S.cam.x, sc.cz - S.cam.z) + (sc.leave ? 1e5 : 0); if (d > wd) { wd = d; wi = q; } } dropSchool(wi); }
    return spawnSchool(spi, x, z, fadeIn, anchored);
  };
  function dropSchool(i) { const sc = S.schools[i]; S.nFish -= sc.n; S.schools.splice(i, 1); S.stats.despawned++; for (const o of S.schools) { if (o.prey === sc) o.prey = null; const k = o.preds.indexOf(sc); if (k >= 0) o.preds.splice(k, 1); } }
  S.clear = () => { S.schools.length = 0; S.nFish = 0; S.transient.length = 0; S.sites.length = 0; };
  // tests / scenes: a pilchard school with bonito already closing on it
  S.spawnBaitBall = (x, z, pred = 'bonito') => {
    const prey = spawnSchool(SPECIES_INDEX.sardine, x, z, false); if (!prey) return null;
    const a = r() * TAU, p = spawnSchool(SPECIES_INDEX[pred], x + Math.cos(a) * 18, z + Math.sin(a) * 18, false);
    if (p) { p.prey = prey; p.huntT = 0; }
    return { prey, pred: p };
  };

  // a new spot for the school to wander to: within ~30 m, water deep enough for it
  function newGoal(sc) {
    const sp = SPECIES[sc.sp];
    for (let k = 0; k < 6; k++) {
      const a = r() * TAU, d = sp.role === 'reef' ? r() * sp.home : 8 + r() * 26, ox = sp.role === 'reef' ? sc.hx : sc.cx, oz = sp.role === 'reef' ? sc.hz : sc.cz;
      const x = ox + Math.cos(a) * d, z = oz + Math.sin(a) * d;
      if (habitatOK(sp, -bed(x, z))) { sc.gx = x; sc.gz = z; break; }
    }
    sc.goalT = 6 + r() * 12;
  }

  // ------------------------------------------------------------------ the threats one school can feel (pre-filtered)
  const _near = [];
  function nearThreats(sc, sp) {
    _near.length = 0;
    const R0 = sc.rad + 4;
    for (let k = 0; k < S.nThreats + S.transient.length; k++) {
      const t = k < S.nThreats ? S.threats[k] : S.transient[k - S.nThreats];
      const reach = t.r * Math.max(sp.shy, 0.6) + R0 + (t.kind === 1 ? t.hl + t.hw : 0) + 25;
      if (Math.abs(t.x - sc.cx) < reach && Math.abs(t.z - sc.cz) < reach) _near.push(t);
    }
    return _near;
  }
  // ------------------------------------------------------------------ one fish's fear from the threats
  // out: [fear, fleeX, fleeY, fleeZ, washX, washZ, curiousX, curiousZ]
  function fearAt(x, y, z, sp, near, out, mammal) {
    let best = 0, fx = 0, fy = 0, fz = 0, wx = 0, wz = 0, cx = 0, cz = 0;
    for (let k = 0; k < near.length; k++) {
      const t = near[k];
      const life = t.life ? t.t / t.life : 1;
      const R = t.r * sp.shy, below = Math.max(0, -y - (t.kind === 1 ? t.dr : 0));
      let dx, dz, d;
      if (t.kind === 1) {
        // ship frame: lx starboard, lz aft; the hull box plus the bow wave (more ahead with speed) and the wake behind
        const rx = x - t.x, rz = z - t.z, lx = rx * t.c - rz * t.s, lz = rx * t.s + rz * t.c;
        // propeller wash and the following current: behind the stern, a beam wide, a few draughts down
        if (t.v > 0.6 && lz > t.hl && lz < t.hl + 20 + 5 * t.v && Math.abs(lx) < t.hw * 0.9 && y > -t.dr - 2.5) {
          const kk = Math.exp(-(lz - t.hl) / (12 + 3 * t.v));
          wx += t.vx * 0.45 * kk + (r() - 0.5) * t.v * 1.2 * kk; wz += t.vz * 0.45 * kk + (r() - 0.5) * t.v * 1.2 * kk;
        }
        if (mammal) {   // dolphins: no fear of a hull, just never inside it
          if (Math.abs(lx) < t.hw + 0.8 && lz > -t.hl - 1.2 && lz < t.hl + 1 && y > -t.dr - 0.5) { const side = lx >= 0 ? 1 : -1; fx += side * t.c * 3; fz += -side * t.s * 3; best = Math.max(best, 0.05); }
          continue;
        }
        const ox = Math.max(0, Math.abs(lx) - t.hw), oz = lz < 0 ? Math.max(0, -lz - t.hl) * 0.6 : Math.max(0, lz - t.hl) * 1.4;
        d = hyp(ox, oz) + below * 0.8;
        // flee sideways, away from the keel line, and down
        const side = lx >= 0 ? 1 : -1; dx = side * t.c; dz = -side * t.s;
        if (lz < -t.hl) { dx += -t.s * -0.3; dz += -t.c * -0.3; }
      } else {
        dx = x - t.x; dz = z - t.z; const h = hyp(dx, dz) || 1e-3; dx /= h; dz /= h;
        d = h + Math.max(0, below - t.deep) * 2;
        // rotor downwash: the top metre of water runs out from under it
        if (t.wash && d < t.r * 1.2 && y > -1.6) { const kk = t.k * (1 - d / (t.r * 1.2)) * Math.exp(y / 0.8) * 1.6; wx += dx * kk; wz += dz * kk; }
        // a swimmer who keeps still: the curious come and look (to ~2 m), and stay out of reach
        if (t.swim && sp.curious && t.v < 0.8 && !mammal) {
          if (h > 2.2) { const kk = sp.curious * Math.min(1, (h - 2.2) / 6) * (h < 14 ? 1 : 0); cx -= dx * kk; cz -= dz * kk; }
          if (h > 1.4) continue;
        }
      }
      if (mammal) { if (t.kind === 0 && !t.swim && life < 1 && t.k > 1.1 && d < t.r) { /* (explosions only: a bow's spray is what they come for) */ best = Math.max(best, 0.3 * t.k); fx += dx; fz += dz; } continue; }   // big bangs only
      if (d >= R) continue;
      const f = t.k * life * (1 - d / R) * (1 - d / R) * 2.2;
      if (f > best) best = f;
      const w = f; fx += dx * w; fz += dz * w; fy -= 0.6 * w;
    }
    out[0] = Math.min(1, best); out[1] = fx; out[2] = fy; out[3] = fz; out[4] = wx; out[5] = wz; out[6] = cx; out[7] = cz;
    return out;
  }

  // ------------------------------------------------------------------ neighbour grid (per school, reused buffers)
  let gHead = new Int32Array(1024), gNext = new Int32Array(256), nbBuf = new Int32Array(256);
  let gx0 = 0, gz0 = 0, gcs = 1, gnx = 1, gnz = 1;
  function buildGrid(sc, cell) {
    const a = sc.a, n = sc.n;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let i = 0; i < n; i++) { const o = i * STRIDE; const x = a[o], z = a[o + F_Z]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    gcs = Math.max(cell, Math.max(x1 - x0, z1 - z0) / 30); gx0 = x0; gz0 = z0; gnx = Math.floor((x1 - x0) / gcs) + 1; gnz = Math.floor((z1 - z0) / gcs) + 1;
    if (gHead.length < gnx * gnz) gHead = new Int32Array(gnx * gnz * 2);
    if (gNext.length < n) gNext = new Int32Array(n * 2);
    gHead.fill(-1, 0, gnx * gnz);
    for (let i = 0; i < n; i++) { const o = i * STRIDE, ix = Math.floor((a[o] - gx0) / gcs), iz = Math.floor((a[o + F_Z] - gz0) / gcs), c = ix + iz * gnx; gNext[i] = gHead[c]; gHead[c] = i; }
  }

  // ------------------------------------------------------------------ the school's plan: hunting, riding, holding
  function unhunt(sc) { if (sc.prey) { const k = sc.prey.preds.indexOf(sc); if (k >= 0) sc.prey.preds.splice(k, 1); } sc.prey = null; sc.fed = 0; sc.huntT = 0; }
  function planSchool(sc, sp, h) {
    sc.goalT -= h; if (sc.goalT <= 0) newGoal(sc);
    sc.alarm = Math.max(0, sc.alarm - h / sp.calm);
    sc.flee = Math.max(0, sc.flee - h);
    // pilchard feeding on plankton at the top on a quiet day: spells of a minute or two right under it (the "nervous
    // water" a fisherman or a tern looks for); not in a rough sea, not at night, not with something after them
    if (sp.ball) {
      sc.topT -= h;
      if (sc.topT <= 0) { sc.surfacing = !sc.surfacing && S.sea < 0.6 && S.light > 0.3 && r() < 0.55; sc.topT = sc.surfacing ? 50 + r() * 70 : 30 + r() * 60; }
      if (sc.alarm > 0.3 || sc.prey) sc.surfacing = false;
    }
    // a bait ball relaxes slowly once the predators are gone
    if (sp.ball) { let close = false; for (const p of sc.preds) if (hyp(p.cx - sc.cx, p.cz - sc.cz) < 22 + sc.rad) { close = true; break; } sc.ball = close ? Math.min(1, sc.ball + h * 0.45) : Math.max(0, sc.ball - h * 0.035); if (close && sc.ball > 0.3 && !sc.wasBall) { sc.wasBall = true; S.stats.balls++; } if (sc.ball <= 0) sc.wasBall = false; }
    // fish gather in the shade of a hull at anchor (and amberjack and bonito follow a ship's wake for what it stirs up)
    if (!sc.prey && sc.flee <= 0) for (let k = 0; k < S.nThreats; k++) {
      const t = S.threats[k]; if (t.kind !== 1) continue;
      const dx = sc.cx - t.x, dz = sc.cz - t.z, d = hyp(dx, dz); if (d > 90 + t.hl) continue;
      if (t.v < 0.6 && sp.fad) {   // alongside, in her shade, 4-12 m off the side the school is on
        const lx = dx * t.c - dz * t.s, lz = dx * t.s + dz * t.c, side = lx >= 0 ? 1 : -1, off = t.hw + 4 + 8 * ((sc.id * 0.37) % 1), along = clamp(lz, -t.hl * 0.8, t.hl * 0.8);
        sc.gx = t.x + side * off * t.c + along * t.s; sc.gz = t.z - side * off * t.s + along * t.c; sc.goalT = Math.max(sc.goalT, 2);
      } else if (t.v > 2 && sp.role === 'pred' && !sc.prey) {   // follow the wake 25-60 m astern
        const back = t.hl + 25 + 35 * ((sc.id * 0.61) % 1); sc.gx = t.x + t.s * back; sc.gz = t.z + t.c * back; sc.goalT = Math.max(sc.goalT, 2);
      }
    }
    // predators: pick prey (the nearest school of a kind they take, within ~150 m), hunt it for a while, then rest
    if (sp.huntsI.length) {
      sc.fullT = Math.max(0, sc.fullT - h);
      if (sc.prey && (sc.prey.leave || sc.prey.live < 6 || sc.huntT > 150 || sc.fed > sc.n * 4 || sc.flee > 0)) { if (sc.huntT > 150 || sc.fed > sc.n * 4) sc.fullT = 80 + r() * 60; unhunt(sc); }
      if (!sc.prey && sc.fullT <= 0 && sc.flee <= 0 && r() < h * 0.5) {
        let best = null, bd = 150;
        for (const o of S.schools) { if (o === sc || o.leave || o.live < 10 || !sp.huntsI.includes(o.sp)) continue; const d = hyp(o.cx - sc.cx, o.cz - sc.cz); if (d < bd) { bd = d; best = o; } }
        if (best) { sc.prey = best; sc.huntT = 0; }
      }
      if (sc.prey) { if (!sc.prey.preds.includes(sc)) sc.prey.preds.push(sc); sc.huntT += h; sc.gx = sc.prey.cx; sc.gz = sc.prey.cz; sc.goalT = Math.max(sc.goalT, 1); }
    }
    // dolphins: a ship under way within 250 m - go and ride her bow
    if (sp.role === 'mammal') {
      sc.ship = null;
      if (sc.flee <= 0) { let bd = 250; for (let k = 0; k < S.nThreats; k++) { const t = S.threats[k]; if (t.kind !== 1 || t.v < 2.2 || t.v > 16 || t.hl < 5) continue; const d = hyp(t.x - sc.cx, t.z - sc.cz) - t.hl * 1.5; if (d < bd) { bd = d; sc.ship = t; } } }   // (a big bow wave beats a near one)
      if (sc.ship) { unhunt(sc); const t = sc.ship; sc.gx = t.x - t.s * (t.hl + 6); sc.gz = t.z - t.c * (t.hl + 6); sc.goalT = Math.max(sc.goalT, 1); }
      if (sc.flee > 0) { const dx = sc.cx - sc.fx, dz = sc.cz - sc.fz, d = hyp(dx, dz) || 1; sc.gx = sc.cx + dx / d * 60; sc.gz = sc.cz + dz / d * 60; }
    }
  }

  // ------------------------------------------------------------------ steering
  const _f = [0, 0, 0, 0, 0, 0, 0, 0];
  // (ngc/perf-cpu) stepSchool's rare branches: a fish in the air, a stunned or dead one. They read the fish from the
  // array themselves and hand the new state (exact doubles) back in _st = [x, y, z, vx, vy, vz].
  const _st = new Float64Array(6);
  function airStep(sc, a, o, h, mammal) {
    let x = a[o], y = a[o + F_Y], z = a[o + F_Z], vx = a[o + F_VX], vy = a[o + F_VY], vz = a[o + F_VZ];
    const len = a[o + F_LEN];
    a[o + F_AIR] += h;
    const top = surfAt(x, z).e;
    if (a[o + F_AK] === 2) {   // glide: hold 0.5-1.2 m over the waves, the air slowing it (~8 % a second)
      const want = top + 0.55 + 0.6 * a[o + F_JIT];
      vy += ((want - y) * 3 - vy) * Math.min(1, h * 4) - 0.6 * h; const sl = Math.exp(-h * 0.085); vx *= sl; vz *= sl;
      a[o + F_COOL] -= h; a[o + F_WING] = Math.min(1, a[o + F_WING] + h * 6);
      const hs = hyp(vx, vz);
      if (a[o + F_COOL] <= 0 || hs < 7) {
        if (r() < 0.35 && hs > 6) { a[o + F_COOL] = 1.6 + r() * 1.8; vx *= 1.25; vz *= 1.25; event('taxi', x, top, z, len, sc.sp); }   // a tail-beat taxi off the top: another glide
        else { a[o + F_AK] = 1; vy = -2.5; }   // down: fold and fall in
      }
    } else vy -= G * h;
    x += vx * h; y += vy * h; z += vz * h;
    // a glide skims the waves: a crest it meets is a tail touch (another taxi) or the end of it, never flown through
    if (a[o + F_AK] === 2) { const t2 = surfAt(x, z).e; if (y < t2 + 0.12) { if (hyp(vx, vz) > 8 && r() < 0.6) { y = t2 + 0.12; vy = Math.max(vy, 1.2); event('taxi', x, t2, z, len, sc.sp); } else { a[o + F_AK] = 1; vy = Math.min(vy, -1); } } }
    if (vy < 0 && y < top - len * 0.15 && a[o + F_AIR] > 0.15) {   // back in
      event('enter', x, top, z, len * (mammal ? 1.4 : 1), sc.sp);
      a[o + F_AIR] = 0; a[o + F_AK] = 0; a[o + F_WING] = 0; vy *= 0.35; a[o + F_COOL] = mammal ? 0.6 + r() * 1.5 : 2 + r() * 5;
      if (mammal) a[o + F_BR] = 6 + r() * 14;
    }
    a[o + F_ROLL] *= Math.exp(-h * 1.5);
    a[o + F_PH] = (a[o + F_PH] + TAU * (a[o + F_AK] === 2 ? 0 : 2) * h) % TAU;
    a[o] = x; a[o + F_Y] = y; a[o + F_Z] = z; a[o + F_VX] = vx; a[o + F_VY] = vy; a[o + F_VZ] = vz;
    _st[0] = x; _st[1] = y; _st[2] = z; _st[3] = vx; _st[4] = vy; _st[5] = vz;
  }
  function stunStep(a, o, h, i) {   // -> 1 while it is still held (stunned or dead, not yet dropped)
    let x = a[o], y = a[o + F_Y], z = a[o + F_Z], vx = a[o + F_VX], vy = a[o + F_VY], vz = a[o + F_VZ];
    const len = a[o + F_LEN], b = bed(x, z);
    a[o + F_STUN] -= h;
    const dead = a[o + F_DEAD] > 0, sink = dead && a[o + F_STUN] < 8;
    const ty = sink ? b + 0.1 : surfAt(x, z).e - 0.04 - len * 0.12;   // (the exact top: few fish, affordable)
    vy += ((ty - y) * (sink ? 0.15 : 0.6) - vy) * Math.min(1, h * 2);
    vx *= Math.exp(-h * 1.2); vz *= Math.exp(-h * 1.2);
    a[o + F_ROLL] += (Math.PI * (dead ? 1 : 0.85) - a[o + F_ROLL]) * Math.min(1, h * 2.5) + (dead ? 0 : Math.sin(S.t * 3 + i) * h * 0.6);
    x += vx * h; y += vy * h; z += vz * h; { const nb = bed(x, z); if (nb > -0.3) { x -= vx * h; z -= vz * h; vx = vz = 0; } else if (y < nb + 0.05) { y = nb + 0.05; vy = 0; } }
    if (!sink && y > ty - 0.3) { const t2 = surfAt(x, z).e - 0.04 - len * 0.12; vy = (t2 - y) / h * 0.5; y = t2; }   // at the top: on the swell, rising and falling with it
    a[o] = x; a[o + F_Y] = y; a[o + F_Z] = z; a[o + F_VX] = vx; a[o + F_VY] = vy; a[o + F_VZ] = vz;
    if (!dead && a[o + F_STUN] <= 0) { a[o + F_STUN] = 0; a[o + F_FEAR] = 1; }   // comes to and bolts
    if (dead && a[o + F_STUN] <= 0) a[o + F_STUN] = 0.001;   // (stays on the bottom: dropped with the school)
    return a[o + F_STUN] > 0.01 ? 1 : 0;
  }
  // a leap starts (frightened mullet and flying fish near the top, the odd mullet): -> _st [, y, , vx, vy, vz]
  function leapStart(sc, sp, a, o, x, z, top, len, vx, vy, vz) {
    const fl = hyp(_f[1], _f[3]), ux = fl > 1e-3 ? _f[1] / fl : vx / (hyp(vx, vz) || 1), uz = fl > 1e-3 ? _f[3] / fl : vz / (hyp(vx, vz) || 1);
    a[o + F_AIR] = 1e-3; const y = top;
    if (sp.leap === 'glide') { const v0 = 11 + 5 * r(); vx = ux * v0; vz = uz * v0; vy = 2 + r(); a[o + F_AK] = 2; a[o + F_COOL] = 2 + 2 * r(); S.stats.glides++; event('taxi', x, top, z, len, sc.sp); }
    else { const v0 = 1.5 + 1.5 * r(); vx = ux * v0; vz = uz * v0; vy = 3 + 1.4 * r(); a[o + F_AK] = 1; a[o + F_ROLL] = (r() < 0.5 ? 1 : -1) * (0.6 + r()); }
    event('jump', x, top, z, len, sc.sp); S.stats.leaps++;
    _st[1] = y; _st[3] = vx; _st[4] = vy; _st[5] = vz;
  }
  function stepSchool(sc, h) {
    const sp = SPECIES[sc.sp], a = sc.a, n = sc.n, role = sp.role, mammal = role === 'mammal';
    const night = 1 + (1 - S.light) * 0.6;   // schools loosen at night
    const L = sc.L, R = sp.view * night, R2 = R * R, sep = sp.nnd * L * night * (1 - 0.15 * sc.ball), sep2 = sep * sep;
    const alarmR = (S.t - sc.at) * FISH.ALARM_V;
    const near = nearThreats(sc, sp);
    const ball = sc.ball, ballR = Math.cbrt(sc.live) * sp.nnd * L * 1.05;   // (each boid is a cluster of SUB fish: a ball a few metres across)
    const useGrid = n > 28 && R > 0; if (useGrid) buildGrid(sc, R);
    const se = sc.se, ssx = sc.ssx, ssz = sc.ssz, scx = sc.cx, scz = sc.cz;
    const surfY = (x, z) => se + ssx * (x - scx) + ssz * (z - scz);
    let cx = 0, cy = 0, cz = 0, vxs = 0, vzs = 0, live = 0, held = 0;
    // (neighbour candidates are gathered into a typed array and summed in plain locals: a closure writing captured
    // doubles made V8 box every store - most of the sim's time went to the garbage collector)
    if (nbBuf.length < n) nbBuf = new Int32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      if (a[o + F_DEAD] > 1) continue;   // eaten
      let x = a[o], y = a[o + F_Y], z = a[o + F_Z], vx = a[o + F_VX], vy = a[o + F_VY], vz = a[o + F_VZ];
      const len = a[o + F_LEN];
      // ---- in the air: a mullet's hop, a bonito clearing the top, a dolphin's leap (ballistic), a flying fish's glide
      // (ngc/perf-cpu: the rare branches live in their own functions, below, so their first use deoptimises them and
      // not this whole loop - it was re-optimised ~20 times a run, boxing every double in between)
      if (a[o + F_AIR] > 0) { airStep(sc, a, o, h, mammal); cx += _st[0]; cy += Math.min(_st[1], 0); cz += _st[2]; vxs += _st[3]; vzs += _st[5]; live++; continue; }
      // ---- stunned / dead: no swimming; float up to the top and ride it, roll belly up, drift; the dead sink later
      if (a[o + F_STUN] > 0) { held += stunStep(a, o, h, i); continue; }
      const b = bed(x, z);
      // ---- neighbours (the school only)
      let nN = 0, ax = 0, ay = 0, az = 0, mx = 0, my = 0, mz = 0, sx = 0, sy = 0, sz = 0, nc = 0;
      if (role !== 'drift') {
        if (useGrid) {
          const ix = Math.floor((x - gx0) / gcs), iz = Math.floor((z - gz0) / gcs);
          for (let u = Math.max(0, ix - 1); u <= Math.min(gnx - 1, ix + 1); u++) for (let w = Math.max(0, iz - 1); w <= Math.min(gnz - 1, iz + 1); w++) for (let j = gHead[u + w * gnx]; j >= 0; j = gNext[j]) if (j !== i) nbBuf[nc++] = j;
        } else for (let j = 0; j < n; j++) if (j !== i) nbBuf[nc++] = j;
      }
      for (let c = 0; c < nc; c++) {
        const q = nbBuf[c] * STRIDE; if (a[q + F_STUN] > 0 || a[q + F_DEAD] > 0 || a[q + F_AIR] > 0) continue;
        const ex = a[q] - x, ey = a[q + F_Y] - y, ez = a[q + F_Z] - z, d2 = ex * ex + ey * ey * 1.5 + ez * ez;
        if (d2 > R2) continue;
        nN++; mx += ex; my += ey; mz += ez; ax += a[q + F_VX]; ay += a[q + F_VY]; az += a[q + F_VZ];
        if (d2 < sep2) { const k = (sep2 - d2) / (d2 + 0.02 * sep2); sx -= ex * k; sy -= ey * k; sz -= ez * k; }
      }
      const spd = hyp(vx, vy, vz) || 1e-4;
      // desired direction: keep going, plus the rules
      let dx = vx / spd, dy = vy / spd, dz = vz / spd;
      const coh = 0.5 * (1 + 3 * ball);
      if (nN) {
        const al = hyp(ax, ay, az) || 1, aw = 0.9 * (1.4 - 0.5 * night) * (1 - 0.5 * ball); dx += ax / al * aw; dy += ay / al * aw; dz += az / al * aw;   // alignment
        const ml = hyp(mx, my, mz) / nN; if (ml > sep) { dx += mx / nN / ml * coh; dy += my / nN / ml * coh; dz += mz / nN / ml * coh; }   // cohesion
        dx += sx / sep * 1.6; dy += sy / sep * 1.6; dz += sz / sep * 1.6;   // separation
      }
      // back to the school: always a little (a split school re-forms), more when alone
      if (role !== 'drift') {
        const gx = scx - x, gy = sc.cy - y, gz = scz - z, gl = hyp(gx, gy, gz) || 1, over = Math.max(0, gl - Math.max(2, sc.rad * 0.6));
        const k = nN ? Math.min(0.9, over * 0.06) * (1 - 0.7 * a[o + F_FEAR]) : 1.2;
        dx += gx / gl * k; dy += gy / gl * k * 0.5; dz += gz / gl * k;
      }
      // the school's goal (wander, home, prey, the shade of a hull, the wake, a bow)
      { const gx = sc.gx - x, gz = sc.gz - z, gl = hyp(gx, gz); if (gl > 2) { const k = sc.prey || sc.ship ? 0.9 : sc.flee > 0 ? 1.4 : 0.25; dx += gx / gl * k; dz += gz / gl * k; } }
      // depth band, the bed, the surface
      band(sp, b, len, _b);
      let lo = _b[0], hi = Math.min(_b[1], surfY(x, z) - 0.12 - len * 0.3);
      if (sc.surfacing && ball < 0.05) { const t2 = surfY(x, z); hi = t2 - 0.12 - len * 0.3; lo = Math.max(lo, Math.min(t2 - 1.2, hi - 0.2)); }
      if (ball > 0.05) { const by = surfY(x, z) - 0.22 - ballR * 0.6; hi = Math.min(hi, Math.max(by + ballR, lo)); lo = Math.max(lo, Math.min(by - ballR, hi)); }
      // ---- role extras
      let want = -1;
      if (ball > 0.05) {   // a bait ball: tight, milling round its centre, driven up to the top
        const rx = x - scx, rz = z - scz, rr = hyp(rx, rz) || 1e-3;
        dx += (-rz / rr) * sc.mill * ball * 1.1; dz += (rx / rr) * sc.mill * ball * 1.1;
        if (rr > ballR) { dx -= rx / rr * ball * 1.2 * (rr - ballR) / ballR; dz -= rz / rr * ball * 1.2 * (rr - ballR) / ballR; }
      }
      if (sc.prey && role !== 'mammal') {   // predators: passes through the prey, curving in from the side
        const p = sc.prey, px = p.cx - x, pz = p.cz - z, pd = hyp(px, pz) || 1, side = (a[o + F_JIT] > 0.5 ? 1 : -1);
        dx += px / pd * 1.6 + (-pz / pd) * side * 0.5; dz += pz / pd * 1.6 + (px / pd) * side * 0.5; dy += (p.cy - y) * 0.4;
        if (pd < 30) want = len * (sp.cruise + (sp.burst - sp.cruise) * (0.45 + 0.35 * Math.sin(S.t * 0.7 + a[o + F_JIT] * 9)));
        // slashing through a ball at the top: the water thrown up on a pass (taken or not), now and then clear of it
        const tp = surfY(x, z);
        if (p.ball > 0.3 && pd < p.rad + 2 && y > tp - 1.1 && r() < h * 0.5) {
          event('boil', x, tp, z, 0.4 + len, sc.sp);
          if (sp.leap === 'hop' && a[o + F_COOL] <= 0 && r() < 0.18) { a[o + F_AIR] = 1e-3; a[o + F_AK] = 1; vy = 2.6 + r() * 1.6; y = tp; a[o + F_COOL] = 8; event('jump', x, tp, z, len, sc.sp); S.stats.leaps++; }
        }
      }
      if (mammal) {
        const ship = sc.ship;
        if (ship) {   // bow-riding: each dolphin its own slot in the pressure field ahead of the stem, moving with her
          const u = a[o + F_JIT], side = (i % 2 ? 1 : -1), lx = side * ship.hw * (0.15 + 0.6 * u), lz = -ship.hl - 2 - ship.hl * 0.16 * ((u * 7.3) % 1);   // (the pressure field ahead of the stem grows with her length)
          const tx = ship.x + lx * ship.c + lz * ship.s, tz = ship.z - lx * ship.s + lz * ship.c, ex = tx - x, ez = tz - z, ed = hyp(ex, ez);
          const wvx = ship.vx + ex * 0.8, wvz = ship.vz + ez * 0.8, wl = hyp(wvx, wvz) || 1;
          dx = wvx / wl * 3 + dx * 0.3; dz = wvz / wl * 3 + dz * 0.3;
          want = Math.min(len * sp.burst * 1.1, wl);
          if (ed < 6) { lo = Math.max(lo, surfY(x, z) - 2.2); }
        } else if (sc.prey) {   // herding: circle the ball 4-8 m out, dash through it now and then
          const p = sc.prey, px = p.cx - x, pz = p.cz - z, pd = hyp(px, pz) || 1, ring = 4 + 4 * a[o + F_JIT], dash = Math.sin(S.t * 0.4 + a[o + F_JIT] * 11) > 0.7;
          if (dash) { dx += px / pd * 2; dz += pz / pd * 2; } else { dx += (-pz / pd) * sc.mill * 1.4 + px / pd * (pd - ring) * 0.25; dz += (px / pd) * sc.mill * 1.4 + pz / pd * (pd - ring) * 0.25; }
          dy += (p.cy - y) * 0.3; want = len * (sp.cruise + (sp.burst - sp.cruise) * (dash ? 0.8 : 0.35));
        }
        // breathing: rise and roll the back through the top every 10-35 s; above ~4.5 m/s a leap instead
        a[o + F_BR] -= h;
        if (a[o + F_BR] < 0) {
          const top = surfY(x, z); hi = top + 0.05; lo = Math.max(lo, top - 0.6); dy += 2.5;
          if (y > top - 0.16) {
            event('blow', x, top, z, len, sc.sp); S.stats.breaths++; a[o + F_BR] = 10 + r() * 25;
            if (spd > 4.4 && a[o + F_COOL] <= 0) { a[o + F_AIR] = 1e-3; a[o + F_AK] = 3; vy = 2.4 + 1.2 * r(); y = top; event('jump', x, top, z, len, sc.sp); S.stats.leaps++; }
          }
        }
        a[o + F_COOL] -= h;
      }
      if (sp.huntsI.length && sp.leap !== 'glide') a[o + F_HANDLE] -= h;
      if (role === 'reef') {   // hold station over home ground
        const hx = sc.hx - x, hz = sc.hz - z, hd = hyp(hx, hz); if (hd > sp.home) { dx += hx / hd * (hd - sp.home) * 0.3; dz += hz / hd * (hd - sp.home) * 0.3; }
      }
      if (role === 'drift') {   // a jellyfish: carried along, a slow pulse up against a slow sink
        dx = 0.25; dz = 0.1; dy = Math.sin(a[o + F_PH] * 0.5 + a[o + F_JIT] * 5) * 0.5;
      }
      if (sp.scav && S.sites.length) {   // the shark: up under the dead fish after a blast
        let bd = 160, s = null; for (const q of S.sites) { const d = hyp(q.x - x, q.z - z); if (d < bd && q.t < 80) { bd = d; s = q; } }
        if (s) { dx += (s.x - x) / (bd || 1) * 2.5; dz += (s.z - z) / (bd || 1) * 2.5; want = len * sp.cruise * (bd > 12 ? 2.6 : 1.2); /* (smells them: comes at ~2 m/s) */ if (bd < 12) { lo = Math.max(lo, surfY(x, z) - 0.6); hi = surfY(x, z) - 0.25; dy += 1; if (a[o + F_COOL] <= 0) { event('fin', x, surfY(x, z), z, len, sc.sp); a[o + F_COOL] = 0.5; } } }
        a[o + F_COOL] -= h;
      }
      if (y < lo) dy += Math.min(2, (lo - y) * 1.5); else if (y > hi) dy -= Math.min(2, (y - hi) * 1.5);
      // the shore ahead: too shallow there -> turn towards deeper water (the bed's downhill)
      {
        const look = 1.5 + spd * 1.2, hx = x + vx / spd * look, hz = z + vz / spd * look, ah = bed(hx, hz);
        if (-ah < sp.water[0] * 0.8 || ah > y - len) {
          const gxx = bed(x + 2, z) - bed(x - 2, z), gzz = bed(x, z + 2) - bed(x, z - 2), gl = hyp(gxx, gzz) || 1;
          dx -= gxx / gl * 2.2; dz -= gzz / gl * 2.2; dy -= 0.2;
        }
      }
      // fear: own (threats and predators), the school's alarm once its wave reaches this fish
      fearAt(x, y, z, sp, near, _f, mammal);
      let pf = 0, pfx = 0, pfz = 0;
      for (let pi = 0; pi < sc.preds.length; pi++) {   // each predator is a moving threat 2-4 m round it: the prey split round it
        const p = sc.preds[pi], pa = p.a, pr = 1.0 + p.L * 1.6;   // (a vacuole a body length or two round each one)
        if (Math.abs(p.cx - x) > p.rad + pr + 2 || Math.abs(p.cz - z) > p.rad + pr + 2) continue;
        for (let j = 0; j < p.n; j++) {
          const q = j * STRIDE; if (pa[q + F_DEAD] > 0 || pa[q + F_STUN] > 0) continue;
          const ex = x - pa[q], ey = y - pa[q + F_Y], ez = z - pa[q + F_Z], ed = hyp(ex, ey, ez);
          if (ed > pr) continue;
          // taken: close enough to the jaws, now and then
          // (one at a strike: 4-10 s to turn and come again; ~1 strike in 3 takes one - game-tuned)
          let taken = false;
          if (ed < 0.3 + pa[q + F_LEN] * 0.35 && pa[q + F_HANDLE] <= 0) { pa[q + F_HANDLE] = 4 + 6 * r(); taken = r() < 0.35; }
          if (taken) {
            a[o + F_DEAD] = 2; sc.eaten++; p.fed++; S.stats.eaten++;
            if (y > surfY(x, z) - 1.6) event('boil', x, surfY(x, z), z, 0.6 + pa[q + F_LEN], p.sp);
            if (p !== sc && SPECIES[p.sp].leap === 'hop' && pa[q + F_COOL] <= 0 && pa[q + F_Y] > surfY(pa[q], pa[q + F_Z]) - 1.2 && r() < 0.25) {   // the bonito clears the top
              pa[q + F_AIR] = 1e-3; pa[q + F_AK] = 1; pa[q + F_VY] = 3 + r() * 1.5; pa[q + F_COOL] = 6; event('jump', pa[q], surfY(pa[q], pa[q + F_Z]), pa[q + F_Z], pa[q + F_LEN], p.sp); S.stats.leaps++;
            }
            break;
          }
          const f = (1 - ed / pr); if (f > pf) pf = f; pfx += ex / (ed || 1) * f; pfz += ez / (ed || 1) * f;
        }
        if (a[o + F_DEAD] > 1) break;
      }
      if (a[o + F_DEAD] > 1) continue;
      let fear = a[o + F_FEAR] * Math.exp(-h / Math.max(0.5, sp.calm));
      if (_f[0] > fear) { fear = _f[0]; if (_f[0] > 0.35 && _f[0] > sc.alarm) { if (sc.alarm < 0.2) S.stats.fled++; sc.alarm = _f[0]; sc.ax = x; sc.az = z; sc.at = S.t; } }
      if (sc.alarm > 0 && hyp(x - sc.ax, z - sc.az) < alarmR) fear = Math.max(fear, sc.alarm * 0.75);
      if (pf > fear) fear = pf;
      a[o + F_FEAR] = fear;
      if (_f[0] > 0.02) { const fl = hyp(_f[1], _f[2], _f[3]) || 1; const w = 1 + 5 * _f[0]; dx += _f[1] / fl * w; dy += _f[2] / fl * w * (y > lo + 0.3 ? 1 : 0); dz += _f[3] / fl * w; }
      else if (fear > 0.2 && ball < 0.2) { dy -= 0.3 * fear * (y > lo + 0.3 ? 1 : 0); }   // alarmed but nothing seen: go down
      if (pf > 0.02) { const fl = hyp(pfx, pfz) || 1; dx += pfx / fl * (1 + 4 * pf); dz += pfz / fl * (1 + 4 * pf); }
      dx += _f[6]; dz += _f[7];   // the curious
      // speed: cruise with a little life in it, up to a burst when frightened
      const jit = 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(S.t * (0.3 + a[o + F_JIT]) + a[o + F_JIT] * 9));
      if (want < 0) want = len * (sp.cruise * jit + (sp.burst - sp.cruise) * fear * fear);
      if (role === 'drift') want = 0.05 + 0.1 * Math.max(0, Math.sin(a[o + F_PH]));
      const dl = hyp(dx, dy * 1.4, dz) || 1;
      let tvx = dx / dl * want, tvy = dy / dl * want * 0.6, tvz = dz / dl * want;
      const ag = Math.min(1, h * sp.agility * (1 + 4 * fear));
      const ohx = vx, ohz = vz;
      vx += (tvx - vx) * ag; vy += (tvy - vy) * ag; vz += (tvz - vz) * ag;
      // the water itself moving: prop wash and the wake's following current, a rotor's outflow (fish are carried)
      x += _f[4] * h; z += _f[5] * h;
      // bank into the turn (yaw rate x speed: the lateral acceleration), the flank flashing at the sky
      { const yr = (ohx * vz - ohz * vx) / Math.max(1e-4, (ohx * ohx + ohz * ohz)) / h, bank = clamp(-yr * hyp(vx, vz) * 0.09 + fear * 1.1 * Math.sin(S.t * 5.5 + a[o + F_JIT] * 40), -1.3, 1.3); a[o + F_ROLL] += (bank - a[o + F_ROLL]) * Math.min(1, h * 6); }   // (frightened fish twist and roll: the flashing of a school in a panic)
      // integrate, never through the bed or out of the water
      const ox = x, oy = y, oz = z;
      x += vx * h; y += vy * h; z += vz * h;
      const nb = bed(x, z), top = surfY(x, z);
      if (nb > -0.4 && nb > b) { x = ox; y = oy; z = oz; vx = -vx * 0.3; vz = -vz * 0.3; }   // would beach: back off
      else {
        const cap = top - (mammal && a[o + F_BR] < 0 ? -0.05 : 0.08 + len * 0.18);
        if (y > cap) { y = cap; vy = Math.min(vy, 0); }
        if (y < nb + 0.15) { y = Math.min(nb + 0.15, cap); vy = Math.max(vy, 0); }
      }
      // never inside a hull (whatever it was running from): out through the nearer side
      for (let k = 0; k < near.length; k++) {
        const t = near[k]; if (t.kind !== 1 || y < -t.dr) continue;
        const rx = x - t.x, rz = z - t.z, lx = rx * t.c - rz * t.s, lz = rx * t.s + rz * t.c;
        if (Math.abs(lx) < t.hw + 0.3 && Math.abs(lz) < t.hl + 0.3) { const nx = (lx >= 0 ? 1 : -1) * (t.hw + 0.35); x = t.x + nx * t.c + lz * t.s; z = t.z - nx * t.s + lz * t.c; }
      }
      // ---- leaps: frightened mullet and flying fish near the top, the odd mullet for no reason
      a[o + F_COOL] -= h;
      if (sp.leap && !mammal && a[o + F_COOL] <= 0 && y > top - 1.6 && b < -0.9) {
        const trig = sp.leap === 'glide' ? (_f[0] > 0.3 ? h * 2.5 * _f[0] : 0) : (_f[0] > 0.4 ? h * 1.2 * _f[0] : h * sp.jumpy * 0.1);
        if (trig > 0 && r() < trig) { leapStart(sc, sp, a, o, x, z, top, len, vx, vy, vz); y = _st[1]; vx = _st[3]; vy = _st[4]; vz = _st[5]; }
      }
      // the tail: Bainbridge (a jellyfish: its bell's own slow pulse, ~0.8 Hz)
      a[o + F_PH] = (a[o + F_PH] + TAU * (role === 'drift' ? 0.8 : tailBeatHz(hyp(vx, vy, vz), len)) * h) % TAU;
      a[o] = x; a[o + F_Y] = y; a[o + F_Z] = z; a[o + F_VX] = vx; a[o + F_VY] = vy; a[o + F_VZ] = vz;
      cx += x; cy += y; cz += z; vxs += vx; vzs += vz; live++;
    }
    if (live) { sc.cx = cx / live; sc.cy = cy / live; sc.cz = cz / live; sc.vx = vxs / live; sc.vz = vzs / live; }
    let rad = 0; for (let i = 0; i < n; i++) { const o = i * STRIDE; if (a[o + F_DEAD] > 1) continue; rad = Math.max(rad, Math.abs(a[o] - sc.cx) + Math.abs(a[o + F_Z] - sc.cz)); }
    sc.rad = rad; sc.live = live; sc.held = live + held;
  }
  // a far school: moved as one towards its goal at cruise (no boids, no fright); phases still run
  function stepCoarse(sc, h) {
    const sp = SPECIES[sc.sp], a = sc.a, gx = sc.gx - sc.cx, gz = sc.gz - sc.cz, gl = hyp(gx, gz);
    const v = sp.cruise * sc.L, ux = gl > 1 ? gx / gl : 0, uz = gl > 1 ? gz / gl : 0;
    let mx = ux * v * h, mz = uz * v * h;
    if (-bed(sc.cx + mx * 20, sc.cz + mz * 20) < sp.water[0]) { mx = mz = 0; sc.goalT = 0; }
    for (let i = 0; i < sc.n; i++) { const o = i * STRIDE; if (a[o + F_DEAD] > 1) continue; a[o] += mx; a[o + F_Z] += mz; a[o + F_VX] += (ux * v - a[o + F_VX]) * Math.min(1, h); a[o + F_VZ] += (uz * v - a[o + F_VZ]) * Math.min(1, h); a[o + F_PH] = (a[o + F_PH] + TAU * tailBeatHz(v, a[o + F_LEN]) * h) % TAU; if (a[o + F_STUN] > 0) a[o + F_STUN] = Math.max(0.001, a[o + F_STUN] - h); }
    sc.cx += mx; sc.cz += mz; sc.vx = ux * v; sc.vz = uz * v;
  }

  // ------------------------------------------------------------------ the frame
  // where life is kept: the camera's circle, and round anchors within view of the camera
  const anchorW = (x, z) => { let best = 0; for (let k = 0; k < S.nThreats + S.nAnchors; k++) { const t = k < S.nThreats ? S.threats[k] : S.anchors[k - S.nThreats]; if (t.w <= 0) continue; if (hyp(t.x - S.cam.x, t.z - S.cam.z) > FISH.ANCHOR_VIEW) continue; const d = hyp(t.x - x, t.z - z); if (d < FISH.ANCHOR_R + (t.hl || 0)) best = Math.max(best, t.w); } return best; };
  S.anchorW = anchorW;
  const localVisibility = {}, drawVisibility = {};
  // Intersect a school-sized sphere with the camera cone. With no view (pure sim callers)
  // all directions count; looking vertically does not need a made-up horizontal heading.
  const inView = (sc, cam, view, d) => !view ||
    ((sc.cx - cam.x) * view.fx + (sc.cy - cam.y) * view.fy + (sc.cz - cam.z) * view.fz + sc.rad) / Math.max(d, 0.01) > (view.cos ?? 0);
  const nearbySchools = (cam, view) => {
    let n = 0;
    for (const sc of S.schools) {
      const d = hyp(sc.cx - cam.x, sc.cy - cam.y, sc.cz - cam.z);
      if (!sc.leave && sc.live > 0 && d < 30 && inView(sc, cam, view, d)) n++;
    }
    return n;
  };
  // A swimmer can arrive after distant ship/aerial schools have filled every slot. Retire
  // only schools outside their close view, wait for the ordinary fade, and keep that slot
  // available for normal habitat/species selection nearby. Anchors must not revive them.
  function makeNearbyRoom(spi, same, deficit, cam, view) {
    let slots = 0, fish = 0, matching = 0, retiring = 0;
    for (const sc of S.schools) if (sc.leave) { slots++; fish += sc.n; if (sc.sp === spi) matching++; if (sc.retiring) retiring++; }
    const sp = SPECIES[spi], speciesFull = same - matching >= sp.max;
    if (retiring >= deficit || (!speciesFull && S.schools.length - slots < FISH.MAX_SCHOOLS && S.nFish - fish + sp.n[1] <= FISH.MAX_FISH)) return;
    let best = null, score = -1;
    for (const sc of S.schools) {
      if (sc.leave || (speciesFull && sc.sp !== spi)) continue;
      const d = hyp(sc.cx - cam.x, sc.cy - cam.y, sc.cz - cam.z);
      if (d < 32 || (d - sc.rad < localVisibility.far && inView(sc, cam, view, d))) continue;
      const priority = d + Math.min(sc.n, 80) * 0.5;
      if (priority > score) { score = priority; best = sc; }
    }
    if (best) { best.leave = true; best.retiring = true; }
  }
  // cam: the camera position. The host fills threats / anchors first (clearThreats, hull, point, anchor).
  S.update = (dt, cam, view = null) => {
    S.nEv = 0;
    if (!S.enabled) { S.ms = 0; return; }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    S.t += dt; S.cam.x = cam.x; S.cam.y = cam.y; S.cam.z = cam.z;
    const surface = surfAt(cam.x, cam.z).e;
    const under = cam.y < surface - 0.03 && cam.y > bed(cam.x, cam.z) - 0.5, alt = Math.max(0, cam.y);
    // The infantry eye is slightly above mean sea level while surface swimming. Its existing
    // swim threat identifies that case without treating a low aircraft or ship as a diver.
    let swimmer = false;
    for (let i = 0; i < S.nThreats && !swimmer; i++) { const t = S.threats[i]; swimmer = t.swim && Math.abs(cam.y - t.y) < 6 && hyp(cam.x - t.x, cam.z - t.z) < 12; }
    const closeLife = under || swimmer, closeTarget = S.quality === 'low' ? 2 : 3;
    S.radius = under ? FISH.R_UNDER : clamp(FISH.R_MIN + alt * 1.1, FISH.R_MIN, FISH.R_MAX);
    const spawnRadius = view && !under ? clamp(FISH.R_MIN + alt * 0.55, FISH.R_MIN, FISH.R_MAX) : S.radius;
    const off = alt > FISH.ALT_MAX;
    // Populate the water the pilot sees ahead. Centring on the aircraft put most life below/behind the chase view.
    const reach = !under && view ? Math.min(550, alt / Math.max(0.3, -view.fy) * 0.92) : 0;
    const focus = S.focus; focus.x = cam.x + (view ? view.fx * reach : 0); focus.z = cam.z + (view ? view.fz * reach : 0);
    // transient threats and blast sites age
    for (let i = S.transient.length - 1; i >= 0; i--) { const t = S.transient[i]; t.t -= dt; if (t.t <= 0) S.transient.splice(i, 1); }
    for (let i = S.sites.length - 1; i >= 0; i--) { S.sites[i].t += dt; if (S.sites[i].t > 120) S.sites.splice(i, 1); }
    // which schools stay: near the camera, or near a unit that keeps life; the rest fade out, then go
    for (let i = S.schools.length - 1; i >= 0; i--) {
      const sc = S.schools[i], dc = hyp(sc.cx - focus.x, sc.cz - focus.z);
      const keep = (!off && dc < S.radius + 45) || anchorW(sc.cx, sc.cz) > 0;
      if (!keep && dc > S.radius + 400) { dropSchool(i); continue; }   // (a jump: far out of sight, no need to fade)
      const empty = (sc.held ?? sc.live) === 0;
      if (!keep || empty || sc.retiring) sc.leave = true; else if (sc.leave && sc.fade > 0.3) sc.leave = false;
      if (sc.leave) { sc.fade -= dt / FISH.FADE; if (sc.fade <= 0) dropSchool(i); }
      else sc.fade = Math.min(1, sc.fade + dt / FISH.FADE);
    }
    if (bedCache.size > 64) { bedCache.clear(); lastKey = -1; lastTile = null; }   // (64 tiles of 128 m: 2 MB)
    // spawn: a few tries a second (more at the start or after a jump): round the camera, and round the anchors
    S.spawnT -= dt;
    if (S.spawnT <= 0 && S.autoSpawn) {
      const empty = S.schools.length === 0;
      S.spawnT = FISH.SPAWN_DT;
      const nA = S.nThreats + S.nAnchors;
      let closeCount = closeLife ? nearbySchools(cam, view) : closeTarget;
      if (closeLife) underwaterVisibility(S.sea * 7, surface - cam.y, localVisibility);
      for (let k = 0; k < (empty ? 24 : closeLife ? 6 : 3); k++) {
        const close = closeCount < closeTarget;
        if (S.schools.length >= FISH.MAX_SCHOOLS && !close) break;
        let x, z, near = null, anch = false;
        if (close) {
          // Ordinary schools, in suitable water, 8-24 m away. Most candidates lie ahead,
          // with room either side; subsequent movement/curiosity/avoidance is unchanged.
          const ahead = view && hyp(view.fx, view.fz) > 0.1;
          const a = ahead ? Math.atan2(view.fz, view.fx) + (r() - 0.5) * Math.PI : r() * TAU;
          const rr = 8 + r() * 16;
          x = cam.x + Math.cos(a) * rr; z = cam.z + Math.sin(a) * rr; anch = swimmer;
        } else if (nA && (off || r() < 0.5)) {   // round a unit (nearer the camera is likelier)
          let tot = 0; for (let q = 0; q < nA; q++) { const t = q < S.nThreats ? S.threats[q] : S.anchors[q - S.nThreats]; const d = hyp(t.x - cam.x, t.z - cam.z); if (d < FISH.ANCHOR_VIEW && t.w > 0) tot += t.w / (1 + (d / 160) ** 2); }
          if (!tot) continue;
          let u = r() * tot, t = null;
          for (let q = 0; q < nA; q++) { const tt = q < S.nThreats ? S.threats[q] : S.anchors[q - S.nThreats]; const d = hyp(tt.x - cam.x, tt.z - cam.z); if (d < FISH.ANCHOR_VIEW && tt.w > 0) { u -= tt.w / (1 + (d / 160) ** 2); if (u <= 0) { t = tt; break; } } }
          if (!t) continue;
          const big = (t.hl || 0) + (t.hw || 0), a = r() * TAU, rr = big + 10 + r() * (t.kind === 1 && t.v > 1 ? 80 : 45);
          // under way: mostly ahead of her (so the bow meets them); at anchor: alongside
          const ahead = t.kind === 1 && t.v > 1 ? 0.6 : 0;
          x = t.x + Math.cos(a) * rr - t.s * rr * ahead; z = t.z + Math.sin(a) * rr - t.c * rr * ahead;
          near = t.kind === 1 ? 'ship' : null; anch = true;
        } else if (!off) {
          const a = r() * TAU, rr = empty ? spawnRadius * Math.sqrt(0.04 + 0.96 * r()) : spawnRadius * (0.55 + 0.45 * Math.sqrt(r()));
          x = focus.x + Math.cos(a) * rr; z = focus.z + Math.sin(a) * rr;
        } else continue;
        const depth = -bed(x, z);
        if (depth < 0.6) continue;
        let spi = pickSpecies(depth, near); if (spi < 0) continue;
        // predators where there is prey to take (a hunt is what draws the birds); one kind in a place
        const sp = SPECIES[spi];
        let crowd = 0; for (const sc of S.schools) if ((!close || !sc.leave) && hyp(sc.cx - x, sc.cz - z) < (close ? 14 : 30)) crowd += sc.sp === spi ? 2 : 1;
        if (crowd >= 2) continue;
        let same = 0; for (const sc of S.schools) if (sc.sp === spi) same++;
        if (sp.huntsI.length && sp.role !== 'mammal' && !S.schools.some(o => sp.huntsI.includes(o.sp) && hyp(o.cx - x, o.cz - z) < 150)) continue;   // hunters only where there is prey
        if (close && (same >= sp.max || S.schools.length >= FISH.MAX_SCHOOLS || S.nFish + sp.n[1] > FISH.MAX_FISH)) {
          makeNearbyRoom(spi, same, closeTarget - closeCount, cam, view);
          continue;
        }
        if (same >= sp.max) continue;
        // the life round units out of the camera's own circle gets at most ~45 % of the budget (the camera comes first)
        if (hyp(x - focus.x, z - focus.z) > S.radius + 45) { let far = 0, slots = 0; for (const sc of S.schools) if (hyp(sc.cx - focus.x, sc.cz - focus.z) > S.radius + 45) { far += sc.n; slots++; } if (far + sp.n[1] > FISH.MAX_FISH * 0.45 || slots >= Math.floor(FISH.MAX_SCHOOLS * 0.4)) continue; }
        if (S.nFish + sp.n[1] > FISH.MAX_FISH) {   // full: make room if this spot is much nearer the camera than the furthest school
          let wi = -1, wd = 0; for (let q = 0; q < S.schools.length; q++) { const sc = S.schools[q]; if (sc.leave) continue; const d = hyp(sc.cx - focus.x, sc.cz - focus.z); if (d > wd) { wd = d; wi = q; } }
          if (wi >= 0 && hyp(x - focus.x, z - focus.z) < wd * 0.5) S.schools[wi].leave = true;
          continue;
        }
        const spawned = spawnSchool(spi, x, z, close || !empty, anch);
        if (close && spawned) closeCount++;
      }
    }
    // the wave plane over each school (once a frame) and the coarse / fine split
    for (const sc of S.schools) { surfAt(sc.cx, sc.cz); sc.se = _so.e; sc.ssx = _so.sx; sc.ssz = _so.sz; sc.coarse = !under && hyp(sc.cx - cam.x, cam.y - sc.cy, sc.cz - cam.z) > FISH.COARSE && sc.ball <= 0 && !sc.prey && !sc.ship && !S.sites.some(s => hyp(sc.cx-s.x,sc.cz-s.z)<160); }
    // step (substeps at low frame rates)
    let left = Math.min(dt, 0.25);
    while (left > 1e-6) { const h = Math.min(FISH.STEP, left); left -= h; for (const sc of S.schools) { planSchool(sc, SPECIES[sc.sp], h); if (sc.coarse) stepCoarse(sc, h); else stepSchool(sc, h); } }
    S.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  };

  // ------------------------------------------------------------------ instances out
  // One record per drawn body: A (x, y, z, length)  B (yaw, pitch, roll, species)  C (tail phase, effort 0..1, fade
  // 0..1, local sea surface y)  D (wings 0..1, fear 0..1, stable variation seed, airborne 0/1). out: { school, fish, dolphin, ray, jelly } each
  // { A, B, C, D, max } (Float32Arrays of 4 x max); returns them with .n set. 'school' records are per boid (the
  // shader draws SUB fish round each).
  // view (optional): { x, y, z, fx, fy, fz, cos, px } the camera, its forward, the cosine of a cone round the view and
  // pixels per radian: what cannot show is left out (behind the camera, under a pixel, or too deep along the line of
  // sight from above for the water to let it through)
  S.culled = 0;
  S.write = (out, view) => {
    S.culled = 0;
    for (const k in out) out[k].n = 0;
    if (!S.enabled) return out;
    const surface = view ? surfAt(view.x, view.z).e : 0;
    const under = view && view.y < surface - 0.03;
    if (under) underwaterVisibility(S.sea * 7, surface - view.y, drawVisibility);
    for (const sc of S.schools) {
      const a = sc.a, sp = SPECIES[sc.sp], O = out[sp.draw]; if (!O) continue;
      const A = O.A, B = O.B, C = O.C, D = O.D, sub = sp.draw === 'school' ? 2.2 : 1;
      for (let i = 0; i < sc.n && O.n < O.max; i++) {
        const o = i * STRIDE; if (a[o + F_DEAD] > 1) continue;
        const vx = a[o + F_VX], vy = a[o + F_VY], vz = a[o + F_VZ], hs = hyp(vx, vz), len = a[o + F_LEN];
        const air = a[o + F_AIR] > 0, floating = a[o + F_STUN] > 0 && a[o + F_Y] > sc.se - 0.6;
        let top = sc.se + sc.ssx * (a[o] - sc.cx) + sc.ssz * (a[o + F_Z] - sc.cz);
        if (air || floating || sp.role === 'mammal' || sp.scav) top = surfAt(a[o], a[o + F_Z]).e;   // exact where it crosses the top
        let y = a[o + F_Y];
        if (floating && a[o + F_STUN] > 8 && y > top - 0.6) y = top - 0.04 - len * 0.12;   // riding the swell as it goes by
        if (view) {
          const dx = a[o] - view.x, dy = y - view.y, dz = a[o + F_Z] - view.z, d = hyp(dx, dy, dz) + 1e-6;
          const above = y > top - len * 0.3;
          const vis = (dx * view.fx + dy * view.fy + dz * view.fz) / d > view.cos && len * sub / d * view.px > 0.9
            && (above || (under ? d < drawVisibility.bodyRange : (top - y) * d / Math.max(view.y - y, 0.1) < 28));   // (surface water path, m: green ~exp(-0.07 x 28) ~ 0.14)
          if (!vis) { S.culled++; continue; }
        }
        const j = O.n * 4;
        A[j] = a[o]; A[j + 1] = y; A[j + 2] = a[o + F_Z]; A[j + 3] = len;
        B[j] = Math.atan2(vx, vz); B[j + 1] = Math.atan2(vy, Math.max(hs, 1e-4)) * (a[o + F_STUN] > 0 ? 0.2 : air && a[o + F_AK] === 2 ? 0.3 : 1); B[j + 2] = a[o + F_ROLL]; B[j + 3] = sc.sp;
        const dead = a[o + F_DEAD] > 0, sinkFade = dead ? clamp(a[o + F_STUN] / 6, 0, 1) : 1;
        C[j] = a[o + F_PH]; C[j + 1] = a[o + F_STUN] > 0 ? 0 : air && a[o + F_AK] === 2 ? 0 : clamp(hyp(vx, vy, vz) / (len * sp.burst), 0.15, 1); C[j + 2] = Math.max(0, sc.fade) * sinkFade; C[j + 3] = top;
        D[j] = sp.leap === 'glide' ? clamp(a[o + F_WING], 0, 1) : 0;   // F_WING is a predator's strike timer for other species.
        D[j + 1] = a[o + F_FEAR]; D[j + 2] = a[o + F_JIT]; D[j + 3] = air ? 1 : 0;
        O.n++;
      }
    }
    return out;
  };
  // where a drawn 'school' fish sits (the shader's sub-fish placement, in JS for the tests): boid i of school sc,
  // sub-fish k; returns [x, y, z]
  const _sub = [0, 0, 0, 0];
  S.drawnPos = (sc, i, k) => {
    const a = sc.a, o = i * STRIDE, len = a[o + F_LEN], vx = a[o + F_VX], vy = a[o + F_VY], vz = a[o + F_VZ];
    const yaw = Math.atan2(vx, vz), pitch = Math.atan2(vy, Math.max(hyp(vx, vz), 1e-4));
    const spread = len * (1 + 0.6 * a[o + F_FEAR]); subOffset(a[o + F_JIT], k, _sub);
    let px = _sub[0] * spread, py = _sub[1] * spread, pz = _sub[2] * spread;
    const cp = Math.cos(-pitch), sp_ = Math.sin(-pitch); const y1 = cp * py - sp_ * pz, z1 = sp_ * py + cp * pz; py = y1; pz = z1;
    const cy = Math.cos(yaw), sy = Math.sin(yaw); const x2 = cy * px + sy * pz, z2 = -sy * px + cy * pz;
    return [a[o] + x2, a[o + F_Y] + py, a[o + F_Z] + z2];
  };
  // what is worth marking on the surface: schools at the top (nervous water), bait balls (boiling), the fright of a
  // school bolting under the top. out: [{ x, z, r, k, kind }] kind 0 nervous water, 1 bait ball
  S.signs = (out = []) => {
    out.length = 0;
    for (const sc of S.schools) {
      const sp = SPECIES[sc.sp]; if (sc.fade <= 0 || sp.role === 'drift' || sp.role === 'mammal' || sp.role === 'reef' || sp.role === 'solo') continue;
      const depth = sc.se - sc.cy;
      // A whole shoal remains readable when individual bodies fall below a pixel. This follows real live schools,
      // fades with depth/light/altitude, and never generates fish or surface activity on its own.
      if (sp.draw === 'school' && depth < 9 && sc.live > 12) {
        const k = sc.fade * Math.min(1, sc.live / 45) * Math.exp(-Math.max(0, depth) * 0.12) * S.light * (1 - smooth(950, FISH.ALT_MAX, S.cam.y));
        if (k > 0.03) out.push({ x: sc.cx, z: sc.cz, r: clamp(sc.rad * 1.1, 12, 26), k, kind: 4, sc });
      }
      const rr = clamp(sc.rad * 0.5 + 1.5, 2.5, 7);   // (rad is the outermost fish: half of it, capped, is the school's body)
      if (sc.ball > 0.15) out.push({ x: sc.cx, z: sc.cz, r: rr + 1, k: Math.min(1, sc.ball) * sc.fade, kind: 1, sc });
      else if (depth < 1.8 && sp.len[1] < 0.6) { const k = Math.min(1, (1.15 - depth / 1.8) * (0.55 + 0.45 * Math.min(1, sc.alarm + 0.2))) * sc.fade; if (k > 0.08) out.push({ x: sc.cx, z: sc.cz, r: rr, k, kind: 0, sc }); }
    }
    return out;
  };
  // (tests) every fish as plain objects
  S.fish = () => { const out = []; for (const sc of S.schools) for (let i = 0; i < sc.n; i++) { const o = i * STRIDE, a = sc.a; if (a[o + F_DEAD] > 1) continue; out.push({ school: sc, i, sp: SPECIES[sc.sp].key, x: a[o], y: a[o + F_Y], z: a[o + F_Z], vx: a[o + F_VX], vy: a[o + F_VY], vz: a[o + F_VZ], fear: a[o + F_FEAR], stun: a[o + F_STUN], dead: a[o + F_DEAD] > 0, len: a[o + F_LEN], roll: a[o + F_ROLL], air: a[o + F_AIR] > 0, ak: a[o + F_AK], wing: a[o + F_WING], br: a[o + F_BR] }); } return out; };
  // (tests) a fingerprint of the whole state, for determinism
  S.hash = () => { let h = 0; for (const sc of S.schools) for (let i = 0; i < sc.a.length; i++) h = (Math.imul(h, 31) + Math.round(sc.a[i] * 1000)) | 0; return h; };
  S.setQuality(S.quality);
  return S;
}
