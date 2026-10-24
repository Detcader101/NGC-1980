// heavydrop.js - the C-130 heavy-equipment drop (1980 practice: a vehicle lashed to a platform on energy-dissipating
// paper honeycomb, extracted out of the open ramp by an extraction parachute, lowered by a cluster of G-11A cargo
// canopies). Pure: plain JS, no THREE, no DOM; tools/slingbench.mjs checks it in node.
//
// Sequence (FM 10-500 series / the Air Force's airdrop procedures, compressed only where noted):
//   1. the platform rides the dual-rail roller conveyor in the hold; on the green light the loadmaster releases the
//      extraction parachute (ring-slot, 15 / 22 / 28 ft by load) into the slipstream; it pulls the platform aft along
//      the rails and off the ramp in ~1.5 s (~0.9 g relative; the aeroplane pitches up as the weight goes aft);
//   2. clear of the ramp the extraction line's pull is transferred to the main canopies' deployment bags: the G-11As
//      deploy, open reefed (~10 % of their drag) for a few seconds, then disreef to full - the opening shock;
//   3. under canopy the load sinks at ~28 ft/s and drifts with the wind; it swings a little under the cluster;
//   4. it lands: the honeycomb under the vehicle crushes and takes the impact, the M-1 cargo parachute releases cut the
//      canopies away so they cannot drag it, the canopies collapse downwind; the crew de-rigs it and drives it off.
// What can go wrong: a canopy that does not open (a streamer: the cluster sinks faster), wind (drift off the DZ),
// a steep slope (the platform tips over), trees / roofs, water (a vehicle in deep water is lost).
//
// Numbers: G-11A 100 ft nominal diameter (CONFIRMED), rated 2,501-5,000 lb a canopy at ~28 ft/s (CONFIRMED order);
// drag area per canopy from S0 = pi 30.5^2 / 4 = 730 m2 x Cd0 0.69 = 504 m2 (INFERRED, it gives 8.5 m/s at 5,000 lb -
// the published rate); cluster efficiency 0.92 (INFERRED); platform, honeycomb and rigging weights INFERRED from the
// Type II modular platform family. C-130H max payload 42,673 lb (CONFIRMED order: 19.4 t).
export const G = 9.81, RHO = 1.225;
const LB = 0.45359237;
export const C130_MAX_PAYLOAD = 19356;                  // kg (CONFIRMED order, C-130H)
export const G11 = { CDS: 504, RATED: 5000 * LB, EFF: 0.92, D: 30.5 };
const RING = { 15: 4.57, 22: 6.71, 28: 8.53 };           // ring-slot extraction chutes, nominal diameter m (CONFIRMED sizes)
const ringCdS = ft => Math.PI * RING[ft] ** 2 / 4 * 0.55;   // Cd0 0.55 for a ring slot (INFERRED)

// per vehicle: vehicle mass, platform (+ honeycomb + rigging) mass, canopies, extraction chute, platform length
export const RIGGING = {
  m151: { label: 'M151A2', mass: 1100, platform: 650, chutes: 1, ext: 15, len: 3.7, wid: 2.74, tall: 1.8 },
  m35: { label: 'M35A2', mass: 13030 * LB, platform: 1450, chutes: 4, ext: 22, len: 7.3, wid: 2.74, tall: 2.9 },
  m113: { label: 'M113A2', mass: 11343, platform: 1800, chutes: 6, ext: 28, len: 6.1, wid: 2.74, tall: 2.5 },
  m60: { label: 'M60A3', mass: 52617, platform: 3000, chutes: 8, ext: 28, len: 9.0, wid: 3.6, tall: 3.3 },
};
export function rigging(type) {
  const r = RIGGING[type]; if (!r) return null;
  return { type, ...r, rigged: r.mass + r.platform, extCdS: ringCdS(r.ext), mainCdS: r.chutes * G11.CDS * G11.EFF };
}
// can the C-130 drop it? '' or the reason with the numbers
export function c130Check(type) {
  const r = RIGGING[type]; if (!r) return 'NOT AN AIR DROP LOAD';
  const rig = r.mass + r.platform;
  if (rig > C130_MAX_PAYLOAD) return `TOO HEAVY FOR A C-130: ${r.label} ${(r.mass / 1000).toFixed(1)} t (${(rig / 1000).toFixed(1)} t RIGGED)  -  MAX PAYLOAD ${(C130_MAX_PAYLOAD / 1000).toFixed(1)} t`;
  return '';
}

// the drag area behind the load at time t after it left the ramp: extraction chute, then the mains deploying,
// opening reefed and disreefing (timeline INFERRED: deploy 0.8 s, reefed to 3.6 s, full at 5.5 s)
export const TL = { deploy: 0.8, reefed: 1.6, disreef: 3.6, full: 5.5, REEF: 0.1 };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function openFrac(t) { return t < TL.deploy ? 0 : t < TL.disreef ? TL.REEF * sstep(TL.deploy, TL.reefed, t) : TL.REEF + (1 - TL.REEF) * sstep(TL.disreef, TL.full, t); }
export function dragArea(R, t, streamers = 0) {
  const mains = R.mainCdS * (R.chutes - streamers) / R.chutes + R.mainCdS / R.chutes * streamers * 0.06;   // a streamer: a long thin tail of nylon
  return (t < TL.reefed + 0.4 ? R.extCdS : R.extCdS * 0.3) + mains * openFrac(t);
}

// one load in the air after it leaves the ramp. p, v: world arrays (y up); wind [x, z]
export function createLoadFlight(R, p, v, wind = [0, 0], o = {}) {
  const L = {
    R, p: [...p], v: [...v], t: 0, g: 0, gMax: 0, phase: 'ext', streamers: o.streamers || 0, landed: false, vzLand: 0, wind,
    swing: 0, swingV: 0,
    step(h, groundAt) {
      if (L.landed) return;
      L.t += h;
      const m = R.rigged, rx = L.v[0] - L.wind[0], ry = L.v[1], rz = L.v[2] - L.wind[1], V = Math.hypot(rx, ry, rz) || 1e-6;
      const cds = dragArea(R, L.t, L.streamers), q = 0.5 * RHO * V * cds;
      const ax = -q * rx / m, ay = -G - q * ry / m, az = -q * rz / m;
      L.g = q * V / (m * G); L.gMax = Math.max(L.gMax, L.g);
      L.v[0] += ax * h; L.v[1] += ay * h; L.v[2] += az * h;
      L.p[0] += L.v[0] * h; L.p[1] += L.v[1] * h; L.p[2] += L.v[2] * h;
      L.phase = L.t < TL.deploy ? 'ext' : L.t < TL.disreef ? 'reefed' : L.t < TL.full ? 'disreef' : 'canopy';
      // the load swings under the cluster (a damped pendulum, ~25 m of risers and lines: visual only)
      const acc = Math.hypot(ax, az); L.swingV += (-L.swing * G / 22 - L.swingV * 0.25 + (L.t < TL.full ? acc * 0.02 : 0)) * h; L.swing += L.swingV * h;
      const gy = groundAt(L.p[0], L.p[2]);
      if (L.p[1] <= gy) { L.landed = true; L.vzLand = -L.v[1]; L.p[1] = gy; L.phase = 'down'; }
    },
  };
  return L;
}
// the whole descent, for the bench and the release-point computation (CARP): from (0, alt, 0) at v0 over flat ground
export function simulateDrop(R, { v0 = [0, 0, -60], alt = 335, wind = [0, 0], streamers = 0, h = 1 / 120 } = {}) {
  const L = createLoadFlight(R, [0, alt, 0], v0, wind, { streamers });
  let n = 0, vSum = 0, tSteady = 0, xSteady = 0, zSteady = 0;
  while (!L.landed && L.t < 300) {
    L.step(h, () => 0);
    if (L.t > TL.full + 4) { vSum += -L.v[1]; n++; }
    if (!tSteady && L.t > TL.full) { tSteady = L.t; xSteady = L.p[0]; zSteady = L.p[2]; }
  }
  return { vz: n ? vSum / n : -L.v[1], vzLand: L.vzLand, gMax: L.gMax, t: L.t, land: [L.p[0], L.p[2]], drift: L.p[0], throw: -zSteady, x: L.p[0], z: L.p[2] };
}

// how the landing went. slope: rise over run under the platform; water: depth (m); clear: no trees / roofs; vz: m/s
export function landingOutcome({ slope = 0, water = 0, clear = true, vz = 8 }) {
  let damage = 0, lost = false, why = 'ON THE DZ';
  const worse = (d, w) => { if (d > damage) { damage = d; why = w; } };
  if (vz > 16) { lost = true; why = 'CANOPIES FAILED  -  DESTROYED ON IMPACT'; }
  else if (vz > 11) worse(0.6, 'A CANOPY FAILED  -  HARD LANDING, THE HONEYCOMB BOTTOMED OUT');
  if (water > 1.5) { lost = true; why = 'IN THE SEA  -  LOST'; }
  else if (water > 0.3) worse(0.3, 'IN THE SURF  -  WET, DAMAGED');
  if (slope > 0.6) { lost = true; why = 'ROLLED DOWN THE SLOPE  -  LOST'; }
  else if (slope > 0.35) worse(0.5, 'TIPPED OVER ON THE SLOPE  -  DAMAGED');
  if (!clear) worse(0.3, 'CAME DOWN IN THE TREES / ON A ROOF  -  DAMAGED');
  return { ok: !lost, lost, damage: lost ? 1 : damage, why };
}
