// RUNAWAY aircraft for the parametric airframe (units/air/airframe.js) and a small point-mass sim for the one-way
// drones. Pure; runs in node (tools/airbench.mjs).
//   RW-4 SHRIKE   the RUNAWAY's fighter drone: fictional numbers (no pilot, so it pulls what the structure takes:
//                 11 g commanded, 14 g overstress), one engine, no afterburner, fly-by-wire (NDI law like the Hornet's)
//   MQ-9 REAPER   a seized turboprop UAV, flown by the machines: orbit and spot. Public airframe numbers.
//   SHAHED-style  one-way delta drone with a moped-class piston engine, launched in salvos off a rail with a booster,
//                 flies to a point and dives on it. Simple physical flight (point mass, bank-to-turn, lift, drag,
//                 propeller thrust); game-level effect when it arrives (a blast, as war.js does for bombs).
// World scale as everywhere (jetfm.js): the air is 4x sea-level density, so forces and EAS are real, true speeds half.
// Tags: CONFIRMED = published figure, INFERRED = derived / tuned, FICTIONAL = made up for the setting, GAME = tuned.
import * as THREE from 'three';
import { createAirframe, clamp, ATM, rhoAt } from './airframe.js';

// --------------------------------------------------------------------------------------------- RW-4 SHRIKE (FICTIONAL)
export const SHRIKE = {
  EMPTY: 4300, FUEL_MAX: 1500, GUN_MAX: 90,          // kg; "gun" = bursts from a nose cannon
  S: 24, B: 8.2, C: 3.6, I: [8500, 38000, 44000],    // a cranked blended delta, 11.5 m long
  TMIL: 39000, TAB: 39000,                            // N, one engine, no reheat: T/W ~0.75 clean
  GEAR: [[0, -1.55, -3.4], [-1.3, -1.55, 0.6], [1.3, -1.55, 0.6]], K: [120000, 220000, 220000], DAMP: [26000, 45000, 45000], STROKE: 0.3,
  HOOK_TIP: [0, -1.4, 5.2], VNE_GEAR: 120, REST_H: 1.5,
  HULL: [[0, -0.1, -6.2], [0, -0.6, 0], [0, -0.3, 5.2], [-4.1, 0, 2.6], [4.1, 0, 2.6], [-1.6, 1.4, 4.6], [1.6, 1.4, 4.6]],
  STATIONS: { L: [-0.7, -0.55, -0.4], R: [0.7, -0.55, -0.4], gun: [0, -0.15, -5.6] },
};
const SHRIKE_AERO = {
  CL0: 0.02, CLA: 4.1, CLMAX: 1.75, CLMIN: -1.1, DCL_FLAP: 0.3, DCL_LEF: 0.12, CLDE: -0.3,
  CD0: 0.017, KIND: 0.14, WAVE: 0.05, MW0: 0.86, MW1: 1.05, CD_GEAR: 0.02, CD_FLAP: 0.03, CD_LEF: 0.004, CD_BRAKE: 0.05, CD_STORE: 0.001,
  SEP0: 0.58, SEPF: 0.02, SEP1: 0.9,
  CMA: -0.22, CMQ: -5, CMDE: 0.9, CM0: 0.005,
  CLB: -0.08, CLP: -0.3, CLR: 0.1, CLDA: 0.32, CLDR: -0.01,
  CNB: 0.1, CNP: -0.03, CNR: -0.3, CNDA: -0.008, CNDR: 0.08,
  CYB: -0.8, CYDR: -0.14,
  LIM: { stab: 0.45, ail: 0.45, rud: 0.5 }, RATE: { stab: 1.4, ail: 3, rud: 2 },
};
export const SHRIKE_AF = {
  name: 'SHRIKE', ...SHRIKE, NENG: 1, ENG_Y: 0, CAT_STAB: 0.1, N_OVER: 14, N_BREAK: 18,
  aero: SHRIKE_AERO,
  eng: { idle: 0.68, span: 0.32, thrMil: 0.8, thrAB: 2, abSpan: 1, upLo: 0.12, upHi: 0.25, dn: 0.3, ffIdle: 0.05, ffMil: 0.75, ffAB: 0 },
  fcs: { law: 'ndi', nmax: 11, nmaxPA: 4, nmin: -4, nminPA: -1, alim: 0.6, alimPA: 0.4, pmax: 6 },
  initStores: () => [{ w: 'aam', st: 'L', on: true }, { w: 'aam', st: 'R', on: true }],
  mass: A => SHRIKE.EMPTY + A.fuel + A.gun * 0.8 + A.stores.filter(s => s.on).length * 90,
  storeDrag: () => 0,   // internal bay
};
export function createShrikeSim(GRAV = 9.0, opts = {}) {
  return createAirframe(opts.fuelX ? { ...SHRIKE_AF, FUEL_X: opts.fuelX } : SHRIKE_AF, GRAV);
}

// --------------------------------------------------------------------------------------------- MQ-9 REAPER
// General Atomics MQ-9A: span 20.1 m, length 11 m, height 3.8 m, empty 2,223 kg, max take-off 4,760 kg, internal fuel
// ~1,800 kg, Honeywell TPE331-10 turboprop 900 shp (671 kW), cruise ~170 kt (CONFIRMED: GA-ASI / USAF fact sheet).
// Wing area ~24 m2 (INFERRED from span and aspect ratio ~17), inertias INFERRED (long light wing).
export const REAPER = {
  EMPTY: 2223, FUEL_MAX: 1800, GUN_MAX: 0,
  S: 24, B: 20.1, C: 1.25, I: [26000, 21000, 45000], LENGTH: 11, HEIGHT: 3.8,
  TMIL: 0, TAB: 0, P_MAX: 671000, PROP_ETA: 0.8, T_STATIC: 9500,
  GEAR: [[0, -1.25, -3.2], [-1.4, -1.25, 0.3], [1.4, -1.25, 0.3]], K: [60000, 110000, 110000], DAMP: [12000, 22000, 22000], STROKE: 0.25,
  HOOK_TIP: [0, -1.0, 4], VNE_GEAR: 70, REST_H: 1.2,
  HULL: [[0, -0.2, -5.4], [0, -0.6, 0], [0, 0.1, 5.4], [-10, 0.3, 0.4], [10, 0.3, 0.4], [-2, 1.1, 5], [2, 1.1, 5], [0, -1.6, 4.8]],
  STATIONS: { ball: [0, -0.75, -4.1] },   // the sensor ball under the nose
};
const REAPER_AERO = {
  CL0: 0.25, CLA: 5.2, CLMAX: 1.45, CLMIN: -0.9, DCL_FLAP: 0.4, DCL_LEF: 0, CLDE: -0.4,
  CD0: 0.03, KIND: 0.024, WAVE: 0, MW0: 0.7, MW1: 0.9, CD_GEAR: 0.02, CD_FLAP: 0.03, CD_LEF: 0, CD_BRAKE: 0.05, CD_STORE: 0.002,
  SEP0: 0.22, SEPF: 0.04, SEP1: 0.5,
  CMA: -0.9, CMQ: -14, CMDE: 1.4, CM0: 0.02,
  CLB: -0.08, CLP: -0.55, CLR: 0.15, CLDA: 0.18, CLDR: -0.005,
  CNB: 0.07, CNP: -0.05, CNR: -0.12, CNDA: -0.01, CNDR: 0.05,
  CYB: -0.5, CYDR: -0.1,
  LIM: { stab: 0.35, ail: 0.4, rud: 0.4 }, RATE: { stab: 0.8, ail: 1, rud: 1 },
};
// turboprop: the power lever sets gas-generator power with a ~1.5 s lag; thrust = eta P / V (V = the speed the real
// aircraft would fly at this dynamic pressure, i.e. EAS), capped by static thrust; power lapses with density
function turboprop(A, h, ctl, M, mods) {
  const R = REAPER, e = A.eng[0], thr = clamp(ctl.throttle[0], 0, 1);
  if (e.run && (A.fuel <= 0 || mods.eng[0] <= 0.02)) { e.run = false; A.ev('flameout', { k: 0 }); }
  const want = e.run ? 0.15 + 0.85 * thr : 0;
  e.n += clamp((want - e.n) * 0.7, -0.5, 0.5) * h;
  const P = R.P_MAX * e.n * (A.rho / ATM.RHO0) ** 0.7 * Math.max(0.25, mods.eng[0]);
  e.thrust = e.run ? Math.min(R.T_STATIC, R.PROP_ETA * P / Math.max(A.eas, 12)) : 0;
  e.power = P; e.ff = e.run ? 0.012 + 0.07 * e.n : 0;   // kg/s (~0.33 kg/kWh, INFERRED)
  if (A.P.FUEL_X) e.ff *= A.P.FUEL_X;
  A.fuel = Math.max(0, A.fuel - e.ff * h); e.egt = 400 + 300 * e.n; e.oil = 60; e.ab = 0; e.nozzle = 0;
}
export const REAPER_AF = {
  name: 'REAPER', ...REAPER, NENG: 1, ENG_Y: 0, CAT_STAB: 0.05, N_OVER: 3.8, N_BREAK: 5.7,
  aero: REAPER_AERO,
  eng: { idle: 0.15, span: 0.85, thrMil: 1, thrAB: 2, abSpan: 1, upLo: 0.5, upHi: 0.5, dn: 0.5, ffIdle: 0.01, ffMil: 0.07, ffAB: 0 },
  fcs: { law: 'ndi', nmax: 2.5, nmaxPA: 2, nmin: -0.5, nminPA: -0.5, alim: 0.2, alimPA: 0.2, pmax: 0.7 },
  initStores: () => [],
  mass: A => REAPER.EMPTY + A.fuel + 300,   // + the sensor turret and RUNAWAY pods (INFERRED)
  storeDrag: () => 1,
  engineFn: turboprop,
};
export function createReaperSim(GRAV = 9.0, opts = {}) {
  return createAirframe(opts.fuelX ? { ...REAPER_AF, FUEL_X: opts.fuelX } : REAPER_AF, GRAV);
}

// --------------------------------------------------------------------------------------------- SHAHED-style drone
// Point mass: speed, flight-path angle, heading, bank. Lift gives the load factor the autopilot asks for (up to the
// wing's limit), drag polar, a pusher propeller from a ~37 kW engine, gravity. INFERRED / GAME numbers: a 3.5 m long,
// 2.5 m span delta of ~200 kg; it cruises at ~100 kt EAS here (true ~26 m/s low down: a slow, loud, shootable thing).
export const SHAHED = { MASS: 200, S: 2.9, CD0: 0.06, K: 0.2, CLMAX: 1.0, P: 30000, ETA: 0.7, T_STATIC: 1400, NMAX: 3, ROLL: 1.5, BOOST: 2.5, BOOST_T: 3200 };
export function createShahedSim(GRAV = 9.0) {
  const S = SHAHED;
  const D = {
    pos: new THREE.Vector3(), V: 30, gam: 0, hdg: 0, bank: 0, n: 1, eas: 0, t: 0, dead: false, thrust: 0,
    vel: new THREE.Vector3(),
    // controls: wanted bank (rad, + right), wanted flight-path angle, throttle 0..1
    ctl: { bank: 0, gam: 0, thr: 1 },
    launch(x, y, z, hdg, gam = 0.35) { D.pos.x = x; D.pos.y = y; D.pos.z = z; D.hdg = hdg; D.gam = gam; D.V = 18; D.t = 0; D.dead = false; D.bank = 0; },
    step(dt) {
      if (D.dead) return;
      D.t += dt;
      const rho = rhoAt(D.pos.y), q = 0.5 * rho * D.V * D.V; D.eas = Math.sqrt(2 * q / ATM.RHO_SL);
      // bank toward the wanted bank at the roll rate limit
      D.bank += clamp(D.ctl.bank - D.bank, -S.ROLL * dt, S.ROLL * dt);
      // load factor for the wanted path angle (and the turn), within what the wing can lift
      const cb = Math.cos(D.bank), nWant = (Math.cos(D.gam) + clamp((D.ctl.gam - D.gam) * 2.5, -1, 1.5) * D.V / GRAV * 0.5) / Math.max(0.3, cb);
      const nMax = Math.min(S.NMAX, q * S.S * S.CLMAX / (S.MASS * GRAV));
      D.n = clamp(nWant, -1, nMax);
      const CL = D.n * S.MASS * GRAV / Math.max(1, q * S.S), Dr = q * S.S * (S.CD0 + S.K * CL * CL);
      const P = S.P * clamp(D.ctl.thr, 0, 1) * (rho / ATM.RHO0) ** 0.8;
      D.thrust = Math.min(S.T_STATIC, S.ETA * P / Math.max(D.eas, 10)) + (D.t < S.BOOST ? S.BOOST_T : 0);   // the rocket booster off the rail
      D.V += ((D.thrust - Dr) / S.MASS - GRAV * Math.sin(D.gam)) * dt; D.V = Math.max(D.V, 5);
      D.gam += GRAV / D.V * (D.n * cb - Math.cos(D.gam)) * dt;
      D.hdg += GRAV * D.n * Math.sin(D.bank) / (D.V * Math.max(0.2, Math.cos(D.gam))) * dt;
      const ch = Math.cos(D.gam);
      D.vel.x = Math.sin(D.hdg) * ch * D.V; D.vel.y = Math.sin(D.gam) * D.V; D.vel.z = -Math.cos(D.hdg) * ch * D.V;
      D.pos.x += D.vel.x * dt; D.pos.y += D.vel.y * dt; D.pos.z += D.vel.z * dt;
    },
  };
  return D;
}
// the drone's autopilot: cruise toward the target at `alt` above the ground (terrain look-ahead), then dive on it
export function shahedGuide(D, tgt, terrain, { alt = 70, dive = 380 } = {}) {
  const dx = tgt.x - D.pos.x, dz = tgt.z - D.pos.z, d = Math.hypot(dx, dz);
  const want = Math.atan2(dx, -dz);
  let err = want - D.hdg; err = Math.atan2(Math.sin(err), Math.cos(err));
  D.ctl.bank = clamp(err * 1.5, -0.7, 0.7);
  if (d < dive) { D.ctl.gam = clamp(Math.atan2(tgt.y - D.pos.y, d), -0.9, 0.2); D.ctl.thr = 1; D.diving = true; return d; }
  let floor = 0; for (const s of [0, 3, 6, 10]) { const L = D.V * s; floor = Math.max(floor, terrain(D.pos.x + D.vel.x / D.V * L, D.pos.z + D.vel.z / D.V * L)); }
  D.ctl.gam = clamp((floor + alt - D.pos.y) * 0.02, -0.25, 0.35); D.ctl.thr = 1;
  return d;
}
