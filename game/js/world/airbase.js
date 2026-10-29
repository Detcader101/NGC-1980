// (ngc/look-airbases) The friendly air base outside the control zone: a 1980 USAF strategic-reconnaissance / airlift
// field in the Beale AFB mould (one 12,000 x 300 ft runway, a full-length parallel taxiway, a mass parking ramp, a
// double-cantilever maintenance hangar for the C-130, a row of SR-71 "barns", tower, fire station, fuel farm).
// Pure maths (no THREE, no DOM): world.js, the terrain worker and the world worker all import it, so the physics, the
// baked heightmaps and the far land agree on the flattened ground. The THREE side is world/airbasemesh.js.
//
// Where: on the friendly side of the zone (the side the player's HQ island is on), past the sea band, wherever the
// natural ground (world.js wildH) is lowest-relief - a fixed, deterministic search over a few dozen candidate sites
// along the two friendly edges (it moves with BOUND, so a bigger zone moves the base with it). The runway runs
// parallel to the zone edge; the base complex is on the zone side of it.
//
// Local frame: u along the runway (+u = the runway's "low number" landing direction's far end), v across it, +v
// towards the zone. world = O + u * a + v * n.  All lengths in metres; the real dimensions and their sources are in
// docs/ngc1980/reference/airbase/SOURCES.md (FT = published feet).
const FT = 0.3048;
export const AB = Object.freeze({
  RWY_L: 12000 * FT, RWY_W: 300 * FT,            // Beale AFB runway 15/33: 12,000 x 300 ft (FAA chart supplement / AirNav)
  OVR: 1000 * FT,                                 // paved overrun each end (UFC 3-260-01 class B: 1,000 ft)
  TWY_W: 75 * FT, TWY_V: 1000 * FT,               // taxiway 75 ft; runway-to-parallel-taxiway separation 1,000 ft (class B)
  APRON_V0: 1000 * FT + 75 / 2 * FT, APRON_V1: 520, APRON_U0: -1000, APRON_U1: 620,
  ALS: 2400 * FT,                                 // ALSF-1 approach lights: 2,400 ft from the threshold
  EDGE_LT: 200 * FT,                              // runway / taxiway edge lights at most 200 ft apart
  FENCE: { u: 2640, v0: -240, v1: 720 },
  FLAT: { u: 2700, v0: -290, v1: 760, blend: 380 },
});
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The base's buildings in the local frame: centre (u, v), footprint w (along u) x d (along v), height h; doors face -v
// (the ramp). type picks the model in airbasemesh.js. Real-world sizes: SOURCES.md.
export const AB_BUILDINGS = Object.freeze([
  // double-cantilever maintenance hangar (SAC 1950s type, Lincoln / March / Travis): two aircraft bays back to back on a
  // central shop core; 60 ft door leaves. Front bay 36 m deep holds a C-130 (29.8 m long) nose out.
  { id: 'dch', type: 'dch', name: 'MAINTENANCE HANGAR', u: -700, v: 562, w: 150, d: 84, h: 21, door: 18.3, bay: 36 },
  // SR-71 shelters ("barns"): one aircraft each (span 16.9 m, length 32.7 m, fin 5.6 m)
  { id: 'barn1', type: 'barn', name: 'SR-71 SHELTER 1', u: -500, v: 543, w: 40, d: 46, h: 12.5, door: 9 },
  { id: 'barn2', type: 'barn', name: 'SR-71 SHELTER 2', u: -456, v: 543, w: 40, d: 46, h: 12.5, door: 9 },
  { id: 'barn3', type: 'barn', name: 'SR-71 SHELTER 3', u: -412, v: 543, w: 40, d: 46, h: 12.5, door: 9 },
  { id: 'barn4', type: 'barn', name: 'SR-71 SHELTER 4', u: -368, v: 543, w: 40, d: 46, h: 12.5, door: 9 },
  { id: 'tower', type: 'tower', name: 'CONTROL TOWER', u: -170, v: 538, w: 8, d: 8, h: 32 },
  { id: 'baseops', type: 'block', name: 'BASE OPERATIONS', u: -150, v: 566, w: 46, d: 22, h: 8, floors: 2 },
  { id: 'fire', type: 'fire', name: 'FIRE STATION', u: 40, v: 548, w: 40, d: 22, h: 7.5 },
  { id: 'sqops', type: 'block', name: 'SQUADRON OPERATIONS', u: -900, v: 560, w: 50, d: 24, h: 7, floors: 2 },
  { id: 'supply', type: 'shed', name: 'BASE SUPPLY', u: -900, v: 622, w: 70, d: 30, h: 9 },
  { id: 'shops', type: 'shed', name: 'ENGINE AND AVIONICS SHOPS', u: -700, v: 640, w: 60, d: 28, h: 8 },
  { id: 'pump', type: 'block', name: 'FUEL PUMP HOUSE', u: 250, v: 560, w: 14, d: 8, h: 4.5, floors: 1 },
  { id: 'guard', type: 'block', name: 'MAIN GATE', u: -150, v: 712, w: 6, d: 4, h: 3.2, floors: 1 },
]);
// the fuel farm: four JP-4 / JP-7 tanks in a bund (u, v, radius, height)
export const AB_TANKS = Object.freeze([[300, 600, 12, 11], [336, 600, 12, 11], [300, 640, 12, 11], [336, 640, 12, 11]]);

// Hangar slots: where each base aircraft lives. park = inside (nose out to the ramp), ramp = on the ramp in front of
// the doors (where a cold start is towed out to). hdg: 'out' = nose towards -v.
export const AB_SLOTS = Object.freeze({
  c130: { building: 'dch', park: { u: -737, v: 540 }, ramp: { u: -737, v: 486 } },
  c130b: { building: 'dch', park: { u: -663, v: 540 }, ramp: { u: -663, v: 486 } },
  sr71: { building: 'barn1', park: { u: -500, v: 541 }, ramp: { u: -500, v: 490 } },
  sr71b: { building: 'barn2', park: { u: -456, v: 541 }, ramp: { u: -456, v: 490 } },
});

// ---------------------------------------------------------------------------------------------------- the plan
// natH(x, z): the natural ground outside the zone (world.js wildH). home: the friendly HQ (picks the friendly edges).
export function planAirbase({ natH, BOUND, home = { x: -1, z: 1 }, name = 'WESTGATE AFB' }) {
  const sx = Math.sign(home.x) || -1, sz = Math.sign(home.z) || 1, F = AB.FLAT;
  let best = null;
  // runways parallel to the zone edge (the base complex on the zone side), or pointing at the zone (one approach comes
  // in over the sea band; the complex on the side towards the friendly corner)
  for (const edge of ['z', 'x']) for (const perp of [false, true]) for (let d = perp ? 3800 : 2600; d <= (perp ? 7400 : 6200); d += 400) for (let t = -0.8; t <= 1.81; t += 0.1) {
    const along = t * BOUND;
    const S = !perp ? (edge === 'z' ? { x: sx * along, z: sz * (BOUND + d), ax: 1, az: 0, nx: 0, nz: -sz } : { x: sx * (BOUND + d), z: sz * along, ax: 0, az: 1, nx: -sx, nz: 0 })
      : (edge === 'z' ? { x: sx * along, z: sz * (BOUND + d), ax: 0, az: -sz, nx: -sx, nz: 0 } : { x: sx * (BOUND + d), z: sz * along, ax: -sx, az: 0, nx: 0, nz: -sz });
    const at = (u, v) => natH(S.x + u * S.ax + v * S.nx, S.z + u * S.az + v * S.nz);
    const hs = []; let sea = 0;
    for (let u = -F.u; u <= F.u + 1; u += F.u / 5) for (let v = F.v0; v <= F.v1 + 1; v += (F.v1 - F.v0) / 4) { const h = at(u, v); hs.push(h); if (h < 2) sea++; }
    const land = hs.filter(h => h >= 2).sort((a, b) => a - b);
    const E = land.length > hs.length * 0.3 ? Math.max(6, Math.min(90, Math.round(land[land.length >> 1]))) : 6;
    let dev = 0, worst = 0; for (const h of hs) { const e = Math.abs(Math.max(h, 0) - E); dev += e; worst = Math.max(worst, e); }
    dev /= hs.length;
    // the approaches: the ground in each end's corridor against the 3 deg glide path + 150 m (1,000 ft at 6 km); at
    // least one end must be clear, both is better
    const ob = approachObst(at, E, 900, 1000, 8000), o = Math.max(0, Math.min(ob[0], ob[1])), o2 = Math.max(0, Math.max(ob[0], ob[1]));
    const score = dev + worst * 0.15 + (sea / hs.length) * 40 + o * 3 + o2 * 0.4 + d * 0.003 + Math.abs(t) * 2 + (edge === 'x' ? 1 : 0);
    if (!best || score < best.score) best = { ...S, E, score, edge, perp, d, t, endObst: ob };
  }
  // endObst: each runway end's approach corridor, metres of ground above (glide path + 150 m): the autopilot's way
  // home picks an end it can come down to (basecraft.js homeAutopilot)
  { const S = best, at = (u, v) => natH(S.x + u * S.ax + v * S.nx, S.z + u * S.az + v * S.nz); best.endObst = approachObst(at, best.E, 1500, 500, 8000); }
  return makeLayout({ ...best, name, BOUND });
}
// [end 0 (lands +u, approach from -u), end 1]: max over an 8 km corridor (+-half m wide, every step m) of ground - E -
// (3 deg glide path from the threshold + 150 m), the glide path capped at the 1,000 ft the approach is flown at
function approachObst(at, E, half, step, len) {
  const tan3 = Math.tan(3 * Math.PI / 180);
  return [1, -1].map(dir => { let m = -1e9; for (let s0 = 0; s0 <= len; s0 += step) for (let v = -half; v <= half; v += half / 2) m = Math.max(m, at(-dir * (AB.RWY_L / 2 + s0), v) - E - Math.min(330, s0 * tan3) - 150); return m; });
}

// the layout object for a chosen site (also used by tests with a fixed site)
export function makeLayout(s) {
  const { x: X, z: Z, ax, az, nx, nz, E } = s, F = AB.FLAT;
  const L = {
    name: s.name, x: X, z: Z, ax, az, nx, nz, E, site: s,
    yaw: Math.atan2(-ax, -az),   // game yaw of the +u direction (forward = (-sin, -cos))
    toW(u, v, out = [0, 0]) { out[0] = X + u * ax + v * nx; out[1] = Z + u * az + v * nz; return out; },
    toL(x, z, out = [0, 0]) { const dx = x - X, dz = z - Z; out[0] = dx * ax + dz * az; out[1] = dx * nx + dz * nz; return out; },
    // game yaw for a local direction (du, dv)
    yawOf(du, dv) { const wx = du * ax + dv * nx, wz = du * az + dv * nz; return Math.atan2(-wx, -wz); },
    // the flattened ground: E inside the field, blending back to the natural ground h over F.blend metres
    H(x, z, h) {
      const dx = x - X, dz = z - Z, u = dx * ax + dz * az, v = dx * nx + dz * nz;
      const eu = Math.max(Math.abs(u) - F.u, 0), ev = Math.max(F.v0 - v, v - F.v1, 0);
      if (eu >= F.blend || ev >= F.blend) return h;
      const e = Math.sqrt(eu * eu + ev * ev); if (e >= F.blend) return h;
      return E + (h - E) * sm(0, F.blend, e);
    },
    // inside the field (+ margin m): no towns, farms, roads, forest or scrub here
    keep(x, z, m = 0) {
      const dx = x - X, dz = z - Z, u = dx * ax + dz * az, v = dx * nx + dz * nz;
      return Math.abs(u) < F.u + m && v > F.v0 - m && v < F.v1 + m;
    },
    // paved surfaces: [kind, u0, u1, v0, v1]
    paved: [],
    buildings: AB_BUILDINGS, tanks: AB_TANKS,
    // a slot's spots in world terms: { x, z, yaw } (nose out to the ramp)
    spot(slot, which = 'park') { const S = AB_SLOTS[slot]; if (!S) return null; const p = S[which], w = L.toW(p.u, p.v); return { x: w[0], z: w[1], y: E, yaw: L.yawOf(0, -1), slot, which }; },
    // runway ends: the threshold (u) and the landing direction (+1 = along +u) for each designation
    ends: [],
    // is (x, z) on any paved surface (runway, overrun, taxiway, ramp, hangar floor)?
    onPavement(x, z, m = 0) { const [u, v] = L.toL(x, z, _l); for (const p of L.paved) if (u > p[1] - m && u < p[2] + m && v > p[3] - m && v < p[4] + m) return p[0]; return null; },
    onRunway(x, z, m = 0) { const [u, v] = L.toL(x, z, _l); return Math.abs(u) < AB.RWY_L / 2 + AB.OVR + m && Math.abs(v) < AB.RWY_W / 2 + m; },
    // building footprints hit by (x, z): the building, or null (a hangar's open bay counts as inside, not a hit)
    hitBuilding(x, z, r = 0) {
      const [u, v] = L.toL(x, z, _l);
      for (const b of AB_BUILDINGS) {
        const du = Math.abs(u - b.u) - b.w / 2 - r, dv0 = (b.v - b.d / 2) - v - r, dv1 = v - (b.v + b.d / 2) - r;
        if (du > 0 || dv0 > 0 || dv1 > 0) continue;
        // the open door side of a hangar: inside the bay is fine, only the side walls / back / core count
        if (b.type === 'barn' && Math.abs(u - b.u) < b.w / 2 - 1.2 - r && v < b.v + b.d / 2 - 1 - r) continue;
        if (b.type === 'dch' && Math.abs(u - b.u) < b.w / 2 - 1.5 - r && v < b.v - b.d / 2 + b.bay - r) continue;
        return b;
      }
      for (const [tu, tv, tr] of AB_TANKS) if (Math.hypot(u - tu, v - tv) < tr + r) return { id: 'tank', name: 'FUEL TANK' };
      return null;
    },
  };
  const R = AB.RWY_L / 2, W = AB.RWY_W / 2, T = AB.TWY_W / 2, TV = AB.TWY_V;
  L.paved.push(['runway', -R, R, -W, W], ['overrun', -R - AB.OVR, -R, -W, W], ['overrun', R, R + AB.OVR, -W, W]);
  L.paved.push(['taxiway', -R + 18, R - 18, TV - T, TV + T]);
  L.connectors = [-R + 18 + T, -900, 0, 900, R - 18 - T];
  for (const cu of L.connectors) L.paved.push(['taxiway', cu - T, cu + T, W, TV - T]);
  L.paved.push(['ramp', AB.APRON_U0, AB.APRON_U1, TV + T, AB.APRON_V1]);
  for (const b of AB_BUILDINGS) if (b.type === 'dch' || b.type === 'barn') L.paved.push(['hangar', b.u - b.w / 2, b.u + b.w / 2, b.v - b.d / 2, b.type === 'dch' ? b.v - b.d / 2 + b.bay : b.v + b.d / 2]);
  // designations: the runway number is the landing heading / 10 (true north here: the world has no magnetic variation)
  const hdgOf = (du) => { const wx = du * ax, wz = du * az; let deg = Math.atan2(wx, -wz) * 180 / Math.PI; deg = (deg + 360) % 360; let n = Math.round(deg / 10) % 36; return n === 0 ? 36 : n; };
  L.ends = [{ dir: 1, u: -R, num: hdgOf(1), obst: s.endObst ? s.endObst[0] : 0 }, { dir: -1, u: R, num: hdgOf(-1), obst: s.endObst ? s.endObst[1] : 0 }];   // obst: ground above the 3 deg path on the approach (m)
  L.label = `${L.name}  ·  RWY ${String(L.ends[0].num).padStart(2, '0')}/${String(L.ends[1].num).padStart(2, '0')}`;
  return L;
}
const _l = [0, 0];

// The field in the far land (renderkit/atmosphere.js rkFarLand: the ground past the draw distance, and the terrain's
// hand-over band): a GLSL snippet that greys the runway, the parallel taxiway and the ramp, so the base still reads as
// an airfield from 3,000 m and at long range. Analytic (per pixel), so it is sharp although the far heightmap is 32 m.
// Expects vec3 p (world position) and vec3 c (the colour being built).
export function airbaseFarGLSL(L) {
  const f = v => v.toFixed(3), R = AB.RWY_L / 2 + AB.OVR, W = AB.RWY_W / 2, T = AB.TWY_W / 2, TV = AB.TWY_V;
  return `{ vec2 abD=p.xz-vec2(${f(L.x)},${f(L.z)}); float abU=dot(abD,vec2(${f(L.ax)},${f(L.az)})), abV=dot(abD,vec2(${f(L.nx)},${f(L.nz)}));
    float abR=(1.-step(${f(R)},abs(abU)))*(1.-step(${f(W)},abs(abV)));
    float abT=(1.-step(${f(R - 18)},abs(abU)))*(1.-step(${f(T)},abs(abV-${f(TV)})));
    float abA=step(${f(AB.APRON_U0)},abU)*(1.-step(${f(AB.APRON_U1)},abU))*step(${f(TV)},abV)*(1.-step(${f(AB.APRON_V1 + 100)},abV));
    float abG=(1.-step(${f(AB.FLAT.u)},abs(abU)))*step(${f(AB.FLAT.v0)},abV)*(1.-step(${f(AB.FLAT.v1)},abV));
    c=mix(c,vec3(.22,.30,.13),abG*.6); c=mix(c,vec3(.50,.49,.46),max(abR,max(abT,abA*.85))); }`;
}
