// F-14A TOMCAT (1980 fleet fighter) for the parametric airframe: numbers, variable-sweep wings with the CADC schedule,
// TF30-P-412A engines (slow spool, slow afterburner light-off, compressor stalls at high AoA / sideslip / throttle
// slams), a mechanical stick with stability augmentation (no g or AoA limiter), loadouts. Pure; runs in node.
//
// Sources (tags: CONFIRMED = published figure, INFERRED = derived / tuned, UNVERIFIED = remembered, not checked):
//   dims / weights: Jane's All the World's Aircraft 1980-81, NAVAIR 01-F14AAA-1 (NATOPS) public extracts;
//   sweep schedule and rate: Heatblur F-14 manual, "Wing-Sweep System" (emergency-mode table = the CADC program's
//   forward limit); TF30: Pratt & Whitney / Wikipedia "Pratt & Whitney TF30" (-412A ratings), TSFC from the same.
// World scale (see jetfm.js): forces / g / EAS real at 4x density, true speeds half.
import { createAirframe, clamp, sstep } from './airframe.js';

const D2R = Math.PI / 180;
export const TOMCAT = {
  EMPTY: 18191,          // kg, 40,104 lb F-14A empty (CONFIRMED Jane's)
  FUEL_MAX: 7348,        // kg, 16,200 lb internal (CONFIRMED NATOPS); no drop tanks carried
  GUN_MAX: 135,          // M61A1 675 rounds (CONFIRMED) in tracer bursts of 5
  S: 52.49,              // m2, 565 ft2 reference wing area (CONFIRMED)
  B: 19.54,              // m, 64.1 ft span at 20° (CONFIRMED); reference span for the coefficients
  C: 2.99,               // m, 9.8 ft mean aerodynamic chord (CONFIRMED)
  SPAN68: 11.65, SPAN75: 10.15, LENGTH: 19.1, HEIGHT: 4.88,   // m (CONFIRMED: 38.2 ft swept, 33.3 ft oversweep, 62.7 ft, 16 ft)
  // inertia (kg m2) with the wings forward / swept: INFERRED (no published F-14A figures found; scaled from the
  // Hornet by mass and size, the outer panels ~ 1.2 t each at ~ 6 m (20°) / 3 m (68°) from the axis)
  I20: [78000, 330000, 395000], I68: [52000, 345000, 375000],
  // N per engine, installed: TF30-P-412A 12,350 lbf MIL / 20,900 lbf max AB uninstalled static (CONFIRMED P&W) x 0.9
  // installation loss (inlet, bleed, nozzle; INFERRED - the F404 numbers in jetfm.js are uninstalled)
  TMIL: 49400, TAB: 83700,
  // undercarriage: wheelbase 7.02 m, track 5.0 m (CONFIRMED 23 ft 0.5 in / 16 ft 5 in); CG 1.0 m ahead of the mains (INFERRED)
  GEAR: [[0, -2.5, -6.0], [-2.5, -2.5, 1.0], [2.5, -2.5, 1.0]],
  K: [430000, 820000, 820000], DAMP: [90000, 165000, 165000], STROKE: 0.45,   // INFERRED: Hornet struts scaled by weight
  HOOK_TIP: [0, -2.35, 8.0],
  VNE_GEAR: 116,         // m/s EAS: 225 kt flap / gear limit (CONFIRMED NATOPS: 225 KIAS flaps, 280 gear)
  // store masses (kg): AIM-54A 1,008 lb, AIM-7F 510 lb, AIM-9L 190 lb (CONFIRMED); drag in "store units"
  STORE: { aim54: { kg: 457, drag: 1.6 }, aim7: { kg: 231, drag: 0.9 }, aim9: { kg: 86, drag: 0.5 } },
  PIVOT_X: 3.2, PIVOT_Z: -0.9, PANEL: 6.99,   // wing pivot (m) and pivot-to-tip reach, fitted to the three spans (INFERRED)
};
// stations: 1A/8A glove shoulder rails (AIM-9), 1B/8B glove pylons (AIM-7 / AIM-54), 3-6 tunnel between the nacelles
export const STATIONS = {
  '1A': [-2.62, -0.12, -1.6], '8A': [2.62, -0.12, -1.6], '1B': [-2.3, -0.95, -1.2], '8B': [2.3, -0.95, -1.2],
  3: [-0.62, -1.15, -3.2], 6: [0.62, -1.15, -3.2], 4: [-0.62, -1.15, 1.6], 5: [0.62, -1.15, 1.6],
  gun: [-0.95, -0.15, -8.4],   // M61 muzzle, left side of the nose
};
// 1980 fleet loadouts (CAP: two of each was the common FLEET AIR DEFENSE fit; INFERRED from period photos)
export const LOADOUTS = {
  cap: [['aim9', '1A'], ['aim9', '8A'], ['aim54', '1B'], ['aim54', '8B'], ['aim7', 3], ['aim7', 6]],
  phoenix: [['aim9', '1A'], ['aim9', '8A'], ['aim54', '1B'], ['aim54', '8B'], ['aim54', 3], ['aim54', 6], ['aim54', 4], ['aim54', 5]],
  sparrow: [['aim9', '1A'], ['aim9', '8A'], ['aim7', '1B'], ['aim7', '8B'], ['aim7', 3], ['aim7', 6], ['aim7', 4], ['aim7', 5]],
  clean: [],
};

// --------------------------------------------------------------------------------------------- aero vs wing sweep
// Tables at 20 / 35 / 50 / 68° (INFERRED from swept-wing theory and the F-14's published behaviour: lift slope and
// CLmax fall, induced drag rises with the lower aspect ratio (7.28 -> 2.58), drag rise moves to higher Mach, the
// aerodynamic centre moves aft (more stable), spoilers lock out past 57° so roll power drops to the tail alone).
const SW = [20, 35, 50, 68];
const TAB = {
  CLA: [4.4, 4.0, 3.4, 2.75], CLMAX: [1.52, 1.42, 1.25, 1.05], SEP0: [0.44, 0.44, 0.46, 0.5], SEP1: [0.78, 0.78, 0.8, 0.84],
  KIND: [0.078, 0.1, 0.13, 0.19], CD0: [0.0195, 0.019, 0.0185, 0.0182],
  WAVE: [0.07, 0.055, 0.04, 0.032], MW0: [0.7, 0.76, 0.82, 0.84], MW1: [0.98, 1.0, 1.0, 1.0],
  CMA: [-0.2, -0.26, -0.34, -0.44],
  CLB: [-0.12, -0.1, -0.08, -0.06], CLP: [-0.42, -0.36, -0.3, -0.22], CLR: [0.14, 0.12, 0.1, 0.08],
  CLDA: [0.31, 0.29, 0.23, 0.11],
};
const BASE = {
  CL0: 0.04, CLMIN: -1.0, DCL_FLAP: 0.62, DCL_LEF: 0.2, CLDE: -0.3,
  CD_GEAR: 0.028, CD_FLAP: 0.06, CD_LEF: 0.006, CD_BRAKE: 0.065, CD_STORE: 0.0018, SEPF: 0.03,
  CMQ: -7, CMDE: 0.95, CM0: 0.01,
  CLDR: -0.01, CNB: 0.1, CNP: -0.03, CNR: -0.28, CNDA: -0.012, CNDA_A: -0.16, CNDR: 0.072,
  CYB: -0.9, CYDR: -0.15,
  LIM: { stab: 0.42, ail: 0.44, rud: 0.52 }, RATE: { stab: 0.63, ail: 1.5, rud: 1.4 },   // stab ~36°/s (INFERRED)
};
function interp(table, sw) {
  const x = clamp(sw, 20, 68); let i = 0; while (i < 2 && x > SW[i + 1]) i++;
  const t = (x - SW[i]) / (SW[i + 1] - SW[i]); return table[i] + (table[i + 1] - table[i]) * t;
}
// the CADC's program: forward-most sweep for the Mach number (Heatblur manual table: M 0.4 20°, 0.7 25°, 0.8 50°,
// 0.9 60°, 1.0 68°; CONFIRMED) and the 15°/s rate with both hydraulic systems (CONFIRMED; half on one)
const SCHED = [[0.4, 20], [0.7, 25], [0.8, 50], [0.9, 60], [1.0, 68]];
export function cadcSweep(M) {
  if (M <= SCHED[0][0]) return 20; if (M >= 1) return 68;
  let i = 0; while (M > SCHED[i + 1][0]) i++;
  const [m0, s0] = SCHED[i], [m1, s1] = SCHED[i + 1]; return s0 + (s1 - s0) * (M - m0) / (m1 - m0);
}
// wingtip position for a sweep angle (pivot + panel reach, fitted to 19.54 / 11.65 / 10.15 m spans)
export function wingTip(sweepDeg, side) {
  const a = sweepDeg * D2R; return [side * (TOMCAT.PIVOT_X + TOMCAT.PANEL * Math.cos(a)), 0.05, TOMCAT.PIVOT_Z + TOMCAT.PANEL * Math.sin(a) + 0.6];
}
// nose, belly, nozzles, fin tips, stabilator tips, ventral fins, canopy: tail-down clearance ~13° at the nozzles (INFERRED)
const HULL0 = [[0, -0.35, -11.0], [0, -1.2, -3], [0, -1.2, 3], [-1.55, -0.62, 8.9], [1.55, -0.62, 8.9], [-2.05, 3.1, 8.4], [2.05, 3.1, 8.4],
  [-5.0, -0.1, 7.9], [5.0, -0.1, 7.9], [-1.3, -1.1, 6.0], [1.3, -1.1, 6.0], [0, 1.6, -5.6]];

// --------------------------------------------------------------------------------------------- TF30 compressor stalls
// The TF30's reputation: at high AoA or sideslip the inlet flow distortion stalls the compressor, and afterburner
// light-offs or throttle slams at low airspeed make it worse. A stall: a bang, thrust collapses, EGT climbs; it clears
// with the throttle at idle and the nose down, else it overheats into a flame-out. One engine out at high AoA = big
// asymmetric thrust = the flat spin the F-14A was known for. Rates INFERRED (game: a few % chance per second deep in
// the danger zone, near zero in normal flight). Seeded RNG so benches repeat.
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function tf30(A, e, k, h, thr, M) {
  const aD = A.alpha / D2R, bD = Math.abs(A.beta) / D2R;
  e.thrF = e.thrF === undefined ? thr : e.thrF + (thr - e.thrF) * Math.min(1, 3 * h);
  if (!e.run) { e.stalled = false; return; }
  if (!e.stalled && !A.onGround) {   // (deck run-ups and the cat shot were never the problem)
    let r = 0;
    if (aD > 22) r += ((aD - 22) / 10) ** 2 * 0.5;
    if (bD > 7) r += ((bD - 7) / 7) ** 2 * 0.5;
    if (Math.abs(thr - e.thrF) > 0.35 && A.eas < 110) r += 0.25;                        // throttle slam slow
    if (e.abT > 0 && e.abT < 1.4 && A.eas < 100 && !A.onGround) r += 0.3;              // AB light-off in slow flight
    r *= e.n > 0.8 ? 1 : 0.35; r *= A.stallRisk ?? 1;
    A.stallP = Math.max(A.stallP || 0, r);
    if (r > 0 && A.rng() < r * h) { e.stalled = true; e.stallT = 0; e.clearT = 0; A.ev('compstall', { k }); }
  }
  if (e.stalled) {
    e.stallT += h; e.ab = 0; e.thrust *= 0.18; e.n += (0.72 - e.n) * Math.min(1, 0.5 * h); e.egt += 140 * h;
    e.clearT = thr < 0.3 && aD < 15 ? e.clearT + h : 0;
    if (e.clearT > 1.2) { e.stalled = false; A.ev('stallclear', { k }); }
    else if (e.stallT > 7 && thr > 0.4) { e.stalled = false; e.run = false; A.ev('flameout', { k, why: 'stall' }); }
  }
}

// --------------------------------------------------------------------------------------------- the parameter set
const AERO = { ...BASE, CLA: 0, CLMAX: 0, SEP0: 0, SEP1: 0, KIND: 0, CD0: 0, WAVE: 0, MW0: 0, MW1: 0, CMA: 0, CLB: 0, CLP: 0, CLR: 0, CLDA: 0 };
export const TOMCAT_AF = {
  name: 'TOMCAT', ...TOMCAT, I: TOMCAT.I20, NENG: 2, ENG_Y: 1.55, REST_H: 2.38, CAT_STAB: 0.1, N_OVER: 9.6, N_BREAK: 12.8,   // 7.5 g limit, +50% ultimate
  HULL: HULL0, aero: AERO,
  // TF30: slower to spool than the F404 (INFERRED: ~6 s idle-MIL), afterburner zones take ~1.2 s to light;
  // fuel flow from TSFC 0.69 (MIL) / 2.78 (max AB) lb/lbf/h (CONFIRMED P&W): 1.07 / 7.3 kg/s per engine
  eng: { idle: 0.68, span: 0.32, thrMil: 0.8, thrAB: 0.84, abSpan: 0.16, upLo: 0.05, upHi: 0.055, dn: 0.18, abDelay: 1.2, abRate: 1.6, ramAB: 0.75, ffIdle: 0.09, ffMil: 0.98, ffAB: 6.2 },
  // mechanical stick + SAS: full aft stick ~ 0.09 rad of stabilator above ~160 KEAS (feel system), pitch / roll / yaw
  // dampers, ARI. INFERRED (tuned for the published handling: ~7.5 g available at corner speed, ~150°/s roll).
  fcs: { law: 'sas', q0: 8500, gexp: 0.75, gmin: 0.12, kq: -0.06, q0r: 30000, gminr: 0.45, kp: 0.03, kr: 0.9, kb: 0, kari: 0.18 },
  initStores: () => loadout('cap'),
  mass: A => { let m = TOMCAT.EMPTY + A.fuel + A.gun * 1.05; for (const s of A.stores) if (s.on) m += TOMCAT.STORE[s.w].kg; return m; },
  storeDrag: A => { let d = 0; for (const s of A.stores) if (s.on) d += TOMCAT.STORE[s.w].drag; return d; },
  onReset(A) { A.rng = A.rng || mulberry32(1980); if (A.sweep === undefined) { A.sweep = 20; A.sweepMode = 'auto'; A.sweepCmd = 20; A.vane = 0; } if (!A.onGround) A.sweep = cadcSweep(A.mach || 0.5); },
  // wing sweep (CADC auto / manual aft of the program / oversweep on deck), glove vanes, inertia with sweep
  config(A, h, M, mods) {
    const sched = cadcSweep(M);
    let cmd = A.sweepMode === 'manual' ? Math.max(sched, clamp(A.sweepCmd, 20, 68)) : sched;
    if (A.flapSel > 0 || A.surf.flap > 0.05) cmd = 20;                                  // flaps down: wings locked forward
    if (A.sweepMode === 'over' && A.onGround && A.eas < 30) cmd = 75;                    // oversweep for the deck
    if (A.sweepMode === 'emer') cmd = clamp(A.sweepCmd, 20, 68);                         // the emergency handle: anywhere
    const rate = (mods.hyd > 0.3 ? 15 : 7.5) * h;
    A.sweep += clamp(cmd - A.sweep, -rate, rate);
    A.vane += clamp((M > 1.4 && A.sweep > 60 ? 1 : 0) - A.vane, -0.5 * h, 0.5 * h);    // glove vanes: programmed out above M 1.4
    const t = clamp((A.sweep - 20) / 48, 0, 1);
    for (let i = 0; i < 3; i++) A.I[i] = TOMCAT.I20[i] + (TOMCAT.I68[i] - TOMCAT.I20[i]) * t;
  },
  flapLock: A => A.sweep > 50,   // maneuver slats / flaps only with the wings at or forward of 50° (INFERRED)
  aeroAt(A) {
    const K = A._K || (A._K = { ...AERO, LIM: AERO.LIM, RATE: AERO.RATE });
    const key = A.sweep + 1000 * A.vane;
    if (A._Ksw !== key) {
      A._Ksw = key;
      for (const k in TAB) K[k] = interp(TAB[k], A.sweep);
      if (A.sweep > 57) K.CLDA = interp(TAB.CLDA, A.sweep) * 0.75;   // spoilers locked out: differential tail alone
      if (A.vane > 0) K.CMA -= 0.05 * A.vane;
    }
    return K;
  },
  hull(A) {
    const sw = Math.round(A.sweep);
    if (A._hullSw !== sw) { A._hullSw = sw; A._hull = [...HULL0, wingTip(sw, -1), wingTip(sw, 1)]; }
    return A._hull;
  },
  engineHook: tf30,
};
export function loadout(name) { return (LOADOUTS[name] || LOADOUTS.cap).map(([w, st]) => ({ w, st: String(st), on: true })); }
export function createTomcatSim(GRAV = 9.0, opts = {}) {
  const A = createAirframe(opts.fuelX ? { ...TOMCAT_AF, FUEL_X: opts.fuelX } : TOMCAT_AF, GRAV);
  A.sweep = 20; A.sweepMode = 'auto'; A.sweepCmd = 20; A.vane = 0; A.trim = 0; A.rng = mulberry32(opts.seed ?? 1980);
  return A;
}
