// SR-71A flight model (ngc/look-sr71). Pure: three.js maths only, no DOM, no game imports beyond the shared atmosphere,
// so it runs in node (tools/sr71bench.mjs validates it against the flight manual and NASA numbers).
//
// World scale (the NGC-1980 contract, units/air/airframe.js): the air is 4x sea-level density, so dynamic pressure,
// IAS / EAS, forces and g are the real aircraft's and world true speeds are half (K_EQ = 2). Heights are world metres in
// the shared exponential atmosphere (rhoAt); the instruments read the ISA altitude with the same density ratio (a real
// altimeter reads pressure altitude), so "80,000 ft" is where the real aircraft's air is, at a world height of 20.4 km.
// Mach and the compressor inlet temperature use the ISA temperature at that altitude (real Mach = 2 x world TAS / a).
//
// Sources (docs/ngc1980/reference/sr71/SOURCES.md). Tags: CONFIRMED = published number, INFERRED = derived from them,
// UNVERIFIED = engineering estimate.
//   SR-71A-1 flight manual (31 Oct 1986, change 2 1989; public, archive.org): dimensions; weights (gross 135-140,000 lb,
//   zero fuel 56,500-60,000 lb); J58 (JT11D-20) max AB 34,000 lb uninstalled SL static, minimum AB ~85 % of max AB, the
//   takeoff thrust chart fig. 1-3 (25.5 k lb per engine at 15 C static, ~28 k at 200 KIAS); bypass from CIT 85-115 C =
//   Mach 1.8-2.0; Mach 3.2 design, 3.17 max scheduled cruise, 3.3 if CIT <= 427 C; 450 KEAS max (climb), 310 KEAS min
//   supersonic; takeoff ~210 KIAS (8-10 deg attitude), gear up by 300 KEAS, 400 KEAS climb to Mach 0.9, refuel at
//   25,000 ft, 450 KEAS supersonic climb; final 175 KIAS, touchdown 155 KIAS (+1 kt per 1,000 lb of fuel over 10,000),
//   drag chute limit 210 KIAS; the spike moves 26 in, starting at Mach 1.6.
//   NASA TM-104330 (Conners 1997): max weight 140,000 lb, dry 60,000 lb, 18,000 lb JP-7 return-to-base reserve, the
//   flight envelope (fig. 11), 16-17 min from refuelling (Mach 0.75 / 25,000 ft) to Mach 3 / 70,000 ft on the 450 KEAS
//   schedule, ~12.5 min on 500 KEAS (fig. 10).
// Frames: three.js body axes for the airframe (x right, y up, nose -z, origin = CG); dynamics in FRD body axes.
import * as THREE from 'three';
import { ATM, rhoAt } from './airframe.js';

export const KT = 1.94384, FT = 3.28084, LB = 2.20462, FPM = 196.85;
export const K_EQ = Math.sqrt(ATM.RHO0 / ATM.RHO_SL);   // real TAS / world TAS (2.0)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pl = pts => x => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts[pts.length - 1][1]; };
const D2R = Math.PI / 180;

// ---- the ISA (real) for the instruments, Mach and CIT: density ratio -> altitude (m) and temperature (K)
export function isaFromSigma(sig) {
  const s11 = 0.29707;
  if (sig >= s11) { const d = (1 - Math.pow(sig, 1 / 4.2559)) / 2.25577e-5; return { d, T: 288.15 - 0.0065 * d }; }
  const d = 11000 - 6341.6 * Math.log(sig / s11); return { d, T: d < 20000 ? 216.65 : 216.65 + 0.001 * (d - 20000) };
}
export const sigmaOfFt = ft => { const d = ft / FT; return d < 11000 ? Math.pow(1 - 2.25577e-5 * d, 4.2559) : 0.29707 * Math.exp(-(d - 11000) / 6341.6); };
export const worldHOfFt = ft => -ATM.H * Math.log(sigmaOfFt(ft));   // world height with the density of that altitude

export const SR71 = {
  // geometry CONFIRMED (SR-71A-1): length 107.4 ft, span 55.6 ft, wing area 1605 ft2; MAC from the traced planform (INFERRED)
  LENGTH: 32.74, SPAN: 16.947, S: 149.1, B: 16.947, C: 12.06,
  // weights: zero fuel 60,000 lb incl. crew and sensors (CONFIRMED range 56,500-60,000), fuel 80,000 lb JP-7 (= 140,000 lb
  // max gross less 60,000: INFERRED; 12,219 US gal is the usual figure), max gross 140,000 lb (CONFIRMED)
  EMPTY: 60000 / LB, FUEL_MAX: 80000 / LB, MTOW: 140000 / LB, RTB_FUEL: 18000 / LB,
  // inertia at 50 t: UNVERIFIED (slender-body radii of gyration: roll 0.11 b, pitch/yaw 0.30 L)
  I50: [7.2e5, 4.4e6, 4.8e6],
  // J58 per engine, installed (INFERRED from fig. 1-3: 25,500 lbf at 15 C static, +~13 lbf/kt): max AB static SL
  T_AB0: 25500 * 4.44822, T_AB_PER_KT: 13 * 4.44822, MIL_FRAC: 0.69, MIN_AB: 0.85, MIN_AB_HI: 0.55, IDLE_FRAC: 0.06,
  ENG_X: [-4.226, 4.226], ENG_Y: 0.10,                     // nacelle centre lines (trace) and thrust line above the CG
  // undercarriage (model frame, contact points): nose X 10.6, mains X 22.7 at BL +-2.54 (tread 16.67 ft CONFIRMED)
  GEAR: [[0, -1.93, -10.6], [-2.54, -1.93, 1.5], [2.54, -1.93, 1.5]],
  K: [1.4e6, 5.2e6, 5.2e6], DAMP: [1.6e5, 5.5e5, 5.5e5], STROKE: [0.32, 0.36, 0.36],
  HULL: [[0, -0.5, -20.4], [0, -0.85, -8], [0, -0.95, 0.5], [0, 0.45, 11.4], [-8.4, -0.42, 7.3], [8.4, -0.42, 7.3], [-4.23, -0.95, -1.5], [4.23, -0.95, -1.5], [-3.6, 3.55, 9.0], [3.6, 3.55, 9.0]],
  // limits (CONFIRMED SR-71A-1)
  KEAS_MAX: 450, KEAS_MIN_SS: 310, MACH_MAX: 3.3, CIT_MAX: 427, V_CHUTE: 210, V_GEAR: 300, V_TO: 210, V_TD: 155,
  CHUTE_CDS: 62,          // m2: 40 ft ring-slot canopy (117 m2) at CD ~0.55 (INFERRED)
  SPIKE_START: 1.6, SPIKE_FULL: 3.2,   // Mach (CONFIRMED: "starts at 1.6", 26 in aft at 3.2)
};
const P = SR71;
// control limits (rad) and rates: elevons pitch -24..+11 deg (TE up / down), roll +-12 deg differential, rudders +-20 deg
// (the surface limiter cuts them to +-10 deg above Mach 0.5, the climb chart's "0.5 MACH - SURFACE LIMITER ENGAGED") -
// pitch/roll UNVERIFIED (manual fig. 1-97 not legible in the scan), limiter CONFIRMED
const LIM = { eUp: 24 * D2R, eDn: 11 * D2R, roll: 12 * D2R, rud: 20 * D2R, rudLim: 10 * D2R }, RATE = { e: 30 * D2R, r: 40 * D2R };

// ---- aerodynamics (INFERRED, see the findings: the delta's Polhamus lift with the chine vortices, a transonic drag rise
// that makes Mach 0.95-1.3 the hard part of the climb, supersonic lift slope 4/sqrt(M^2-1), and the drag due to lift as
// CL tan(alpha) with ~25 % leading-edge suction: subsonic L/D max ~11, Mach 3.2 cruise L/D ~6.5)
const CD0 = pl([[0, 0.0095], [0.8, 0.0098], [0.92, 0.0122], [1.0, 0.0195], [1.1, 0.0228], [1.25, 0.0225], [1.6, 0.0195], [2.0, 0.0172], [2.5, 0.0138], [3.2, 0.0114], [3.5, 0.011]]);
const KP = 2.95, KV = 2.9;
export function aero(a, b, M, cfg, o = {}) {
  const sa = Math.sin(a), ca = Math.cos(a);
  // vortex lift breaks down from ~20 deg (the chine vortices burst over the wing): the lift curve rounds off
  const burst = sstep(0.33, 0.55, Math.abs(a));
  const sub = (KP * sa * ca * ca + KV * Math.sign(sa) * sa * sa * ca) * (1 - 0.55 * burst) + burst * 0.55 * Math.sin(2 * a) * 0.9;
  const cla = M > 1.15 ? Math.min(KP, 4 / Math.sqrt(M * M - 1)) : KP;
  const sup = cla * sa * ca;
  const ws = sstep(0.95, 1.3, M);
  o.CL = 0.015 + lerp(sub, sup, ws) + 0.25 * cfg.flapE;   // flapE: the elevons' collective deflection's lift (TE down +)
  const suction = lerp(0.25, 0.22, ws);
  o.CD = CD0(M) + Math.abs(o.CL * Math.tan(a)) * (1 - suction) + 0.4 * Math.sin(b) ** 2 + 0.015 * cfg.gear + cfg.extra;
  o.CY = -0.55 * b + 0.09 * cfg.rud;
  o.burst = burst;
  return o;
}
// moment derivatives (per rad; INFERRED / UNVERIFIED): static margin ~4 % MAC subsonic, ~5 % at Mach 3 (the c.g. moved
// aft by the fuel sequence for low trim drag); weak directional stability at high Mach (the canted fins: Cn_beta falls),
// the low-aspect-ratio delta's weak roll damping.
const CMA = M => lerp(-0.12, -0.16, sstep(1, 3, M)), CMDE = M => lerp(-0.34, -0.15, sstep(0.9, 2.5, M)), CMQ = -2.6, CM0 = 0.004;
const CNB = M => lerp(0.14, 0.045, sstep(1.2, 3.2, M)), CNR = -0.32, CNDR = M => lerp(0.075, 0.035, sstep(1, 3, M)), CNDA = 0.004;
const CLB = a => -0.05 - 0.45 * a, CLP = -0.24, CLR = 0.06, CLDA = M => lerp(0.085, 0.04, sstep(1, 3, M)), CLDR = 0.008;

// ---- J58: thrust per engine for a throttle setting, Mach, density ratio (real sigma = world sigma)
// max AB: the fig. 1-3 static / takeoff numbers, rising with ram pressure ((1 + 0.2 M^2)^3.5) against the falling specific
// thrust (1 / (1 + 0.1 M + 0.2 M^2)): ~12,400 lbf per engine at Mach 3.2 / 80,000 ft (INFERRED: enough for cruise at
// partial AB with a margin, the published shares of the inlet / engine / ejector are not modelled separately)
// past the design point the inlet / engine match runs out (the compressor on its CIT schedule, the ejector choking): net
// thrust collapses by Mach ~3.6 (INFERRED; the J58 was limited to Mach 3.3-3.4 by temperature, not thrust)
const ramF = M => Math.pow(1 + 0.2 * Math.min(M, 3.6) ** 2, 3.5) / (1 + 0.1 * M + 0.2 * M * M) * (1 - 0.85 * sstep(3.25, 3.65, M));
export function j58(thr, M, sig, kias = 0) {
  // max AB: fig. 1-3's static thrust and its rise with airspeed at low Mach, then the ram curve
  const tab = sig * (P.T_AB0 * ramF(M) + P.T_AB_PER_KT * Math.min(kias, 250) * (1 - sstep(0.4, 0.9, M)));
  const mil = tab * P.MIL_FRAC * clamp(1 - 0.17 * M, 0.25, 1), idle = tab * P.IDLE_FRAC * clamp(1 - 0.3 * M, 0.1, 1);
  if (thr <= 0.66) return idle + (mil - idle) * (Math.max(0, thr) / 0.66) ** 1.6;
  // minimum AB: ~85 % of max AB at sea level, ~55 % at high altitude (SR-71A-1 sec. I, CONFIRMED)
  const minAB = P.MIN_AB_HI + (P.MIN_AB - P.MIN_AB_HI) * clamp((sig - 0.03) / 0.5, 0, 1);
  return tab * (minAB + (1 - minAB) * (thr - 0.66) / 0.34);
}
// lb of fuel per lbf per hour: dry 1.0 + 0.2 M, AB 2.2 + 0.15 M (cruise at Mach 3.2: ~41,000 lb/h for both: INFERRED,
// the usual figure is 38-44,000 lb/h)
const tsfc = (ab, M) => ab ? 2.2 + 0.15 * M : 1.0 + 0.2 * M;
// spike schedule (CONFIRMED end points): forward and locked below Mach 1.6, 26 in aft at 3.2 (linear between)
export const spikeSched = M => clamp((M - P.SPIKE_START) / (P.SPIKE_FULL - P.SPIKE_START), 0, 1);

function newEngine(running) { return { n: running ? 0.68 : 0, ab: 0, run: running, start: 0, thrust: 0, ff: 0, egt: running ? 420 : 20, nozzle: 0.8, spike: 0, bypass: 1, unstart: 0, restart: 0, cit: 15, overT: 0, damaged: 0, thr: 0 }; }

export function createSR71Sim(GRAV = 9.80665) {
  const _e = new THREE.Euler(), _f = new THREE.Vector3(), _v = new THREE.Vector3(), _vb = new THREE.Vector3(), _iq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _ax = new THREE.Vector3();
  const _r = new THREE.Vector3(), _t = new THREE.Vector3(), _wp = new THREE.Vector3(), _pv = new THREE.Vector3(), _ow = new THREE.Vector3(), _d = new THREE.Vector3(), _l = new THREE.Vector3();
  const toF = (v3, out) => out.set(-v3.z, v3.x, -v3.y), fromF = (vf, out) => out.set(vf.y, -vf.z, -vf.x);
  const A = {
    P, pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
    eng: [newEngine(true), newEngine(true)], fuel: 50000 / LB, surf: { elevL: 0, elevR: 0, pitch: 0, roll: 0, rud: 0 }, trim: 0,
    gear: 1, gearCmd: 1, chute: 'stowed', canopy: 0, canopyCmd: 0, steer: 0, wow: [0, 0, 0], slip: [0, 0, 0], onGround: false, events: [], dead: false,
    alpha: 0, beta: 0, tas: 0, eas: 0, kias: 0, keas: 0, mach: 0, qbar: 0, nz: 1, ny: 0, rho: ATM.RHO0, sigma: 1, altFt: 0, isaT: 288, cit: 15, skinT: 15, burst: 0,
    spikeMode: 'auto', spikeManual: [0, 0], restartArm: true, sas: { pitch: true, roll: true, yaw: true }, limiter: true,
    leak: 0, refuel: 0, tSim: 0, strut: [0, 0, 0], wheelRot: 0, nzMax: 1, nzMin: 1, overspeedT: 0, damage: 0,
    get mass() { return P.EMPTY + A.fuel; },
    forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(A.q); },
    up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(A.q); },
    attitude() { _e.setFromQuaternion(A.q, 'YXZ'); return { pitch: _e.x, roll: -_e.z, yaw: _e.y }; },
    worldPoint(local, out = new THREE.Vector3()) { return out.set(local[0], local[1], local[2]).applyQuaternion(A.q).add(A.pos); },
    get heading() { A.forward(_f); return Math.atan2(-_f.x, -_f.z); },
    get spike() { return [A.eng[0].spike, A.eng[1].spike]; },
    totalThrust() { return A.eng[0].thrust + A.eng[1].thrust; },
    reset(p, yaw, speed, o = {}) {
      A.q.setFromEuler(_e.set(o.pitch || 0, yaw, 0, 'YXZ')); A.pos.copy(p); A.w.set(0, 0, 0);
      A.vel.set(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed);
      A.eng = [newEngine(o.running !== false), newEngine(o.running !== false)];
      for (const e of A.eng) { e.thr = o.thr ?? 0.5; e.n = o.running === false ? 0 : 0.95; }
      { const sig = rhoAt(p.y) / ATM.RHO0, T = isaFromSigma(sig).T, M = speed * K_EQ / Math.sqrt(1.4 * 287.05 * T); for (const e of A.eng) { e.spike = spikeSched(M); e.ab = (o.thr ?? 0.5) > 0.66 ? 1 : 0; e.abFill = e.ab ? 99 : 0; e.n = o.running === false ? 0 : Math.max(e.n, (o.thr ?? 0.5) > 0.66 ? 1 : e.n); } }
      A.gear = A.gearCmd = o.gear ?? 0; A.chute = 'stowed'; A.trim = o.trim ?? 0; A.surf.elevL = A.surf.elevR = A.surf.rud = A.surf.pitch = A.surf.roll = 0;
      if (o.fuel !== undefined) A.fuel = o.fuel;
      A.onGround = false; A.wow.fill(0); A.slip.fill(0); A.dead = false; A.events.length = 0; A.nzMax = A.nzMin = 1; A.damage = 0; A.leak = 0;
      A.skinT = o.skinT ?? 15; A.ap.on = false; return A;
    },
    resetGround(x, gy, z, yaw, o = {}) {
      A.reset(new THREE.Vector3(x, gy + 1.97 - 0.045, z), yaw, 0, { ...o, gear: 1, thr: 0 });
      A.onGround = true; for (const e of A.eng) { e.thr = 0; e.n = o.running === false ? 0 : 0.68; }
      if (o.running === false) for (const e of A.eng) Object.assign(e, newEngine(false));
      return A;
    },
    // ctl: { pitch (+aft), roll (+right), yaw (+right pedal) -1..1, throttle: [2] 0..1 (0 IDLE, .66 MIL detent, 1 max AB),
    //        brakeL, brakeR 0..1, trimRate -1..1 } ; env: { groundY(x, z), water(x, z) }
    step(dt, ctl, env) {
      A.events.length = 0;
      const n = Math.max(1, Math.ceil(dt / (1 / 200))), h = dt / n;
      for (let i = 0; i < n && !A.dead; i++) sub(h, ctl, env);
      return A.events;
    },
    // engine start: the AG330 start cart (or the buick: two V8s on a common shaft) spins the J58 and the TEB (triethylborane)
    // chemical ignition lights it: ~60 s to idle. Here: o.cart must be present (the bases' start cart or 'quick start')
    startEngine(k) { const e = A.eng[k]; if (e.run || e.start > 0) return false; e.start = 0.001; ev('start', { k }); return true; },
    stopEngine(k) { const e = A.eng[k]; e.run = false; e.start = 0; ev('shutdown', { k }); },
    deployChute() {
      if (A.chute !== 'stowed') return false;
      if (A.kias > P.V_CHUTE + 15) { A.chute = 'failed'; ev('chuteFail'); return false; }   // torn off above the limit
      A.chute = 'deployed'; ev('chute'); return true;
    },
    jettisonChute() { if (A.chute === 'deployed') { A.chute = 'jettisoned'; ev('chuteJett'); } },
    // the autopilot (the SR-71's: pitch on KEAS or Mach hold, altitude hold, heading / attitude hold): ap.on + modes
    ap: { on: false, pitch: 'att', roll: 'att', keas: 450, mach: 3.2, alt: 0, hdg: 0, att: 0, bank: 0, I: 0 },
  };
  const ev = (e, extra) => { A.events.push(extra ? { e, ...extra } : { e }); };

  // ---------------------------------------------------------------- engines and inlets
  function engines(h, ctl) {
    const M = A.mach, sig = A.sigma;
    // CIT: the total temperature at the compressor face (inlet recovery ~ full total temperature)
    A.cit = A.isaT * (1 + 0.2 * M * M) - 273.15;
    for (let k = 0; k < 2; k++) {
      const e = A.eng[k], thr = clamp(ctl.throttle ? ctl.throttle[k] : 0.5, 0, 1); e.thr = thr;
      if (e.start > 0) {   // cart start: ~20 s cranking, TEB light-off at 30 %, ~45 s to idle
        e.start += h; e.n = Math.min(0.68, e.n + h * (e.start < 18 ? 0.017 : 0.03));
        if (e.n >= 0.30 && !e.lit) { e.lit = true; ev('teb', { k }); }
        if (e.n >= 0.67) { e.run = true; e.start = 0; e.lit = false; ev('running', { k }); }
      }
      if (A.fuel <= 0 && e.run) { e.run = false; ev('flameout', { k, why: 'fuel' }); }
      const nT = e.run ? 0.68 + 0.32 * clamp(thr / 0.66, 0, 1) : (e.start > 0 ? e.n : Math.max(0, e.n - h * 0.05));
      e.n += clamp(nT - e.n, -h / 2.5, h / 3.0);   // the J58 spools slowly (INFERRED)
      const abCmd = e.run && thr > 0.66 && e.n > 0.95 ? 1 : 0;
      // AB light-off: the manifold fill time, up to 3 s at sea level, 7 s at altitude (CONFIRMED), then the TEB shot
      const fill = 3 + 4 * (1 - A.sigma); e.abFill = abCmd ? (e.abFill || 0) + h : 0;
      e.ab += clamp((abCmd && e.abFill > fill * 0.6 ? 1 : 0) - e.ab, -h / 0.8, h / (fill * 0.4));
      // inlet: the spike on its schedule (auto) or where the pilot set it; forward bypass doors open subsonic and on the
      // ground, modulating with the duct pressure (shown as a 0..1 position)
      const want = A.spikeMode === 'auto' ? spikeSched(M) : A.spikeManual[k];
      if (e.restart > 0) { e.restart -= h; e.spike += clamp(0 - e.spike, -h / 1.2, h / 1.2); e.bypass = Math.min(1, e.bypass + h); if (e.restart <= 0 && e.unstart) { e.unstart = 0; ev('restarted', { k }); } }
      else { e.spike += clamp(want - e.spike, -h / 2.5, h / 2.5); e.bypass += clamp((M < 1.4 ? 1 : 0.15 + 0.4 * (1 - spikeSched(M))) - e.bypass, -h / 2, h / 2); }
      // unstart: the shock is expelled - above Mach 2.2 a spike too far from its schedule, high alpha / sideslip, or the
      // analog control's occasional glitch (1980: the DAFICS digital controls came in the mid 1980s; unstarts were
      // routine): hazard ~1 per 40 min per inlet in cruise (UNVERIFIED)
      e.calm = Math.max(0, (e.calm || 0) - h); if (e.restart > 0) e.calm = 4;   // re-scheduling after a restart: no new unstart for ~4 s
      if (!e.unstart && e.run && M > 2.2 && e.calm <= 0) {
        const mis = Math.abs(e.spike - spikeSched(M)), a = A.alpha * 57.3, b = Math.abs(A.beta * 57.3);
        const hz = (A.spikeMode !== 'auto' && mis > 0.22 ? 3 : 0) + (a > 10 ? (a - 10) * 0.6 : 0) + (b > 2.5 ? (b - 2.5) * 0.8 : 0) + 1 / 2400 + (A.forceUnstart === k ? 1e6 : 0);
        if (Math.random() < hz * h) { e.unstart = 1; ev('unstart', { k }); A.forceUnstart = null; if (A.restartArm) { for (const f of A.eng) f.restart = Math.max(f.restart, 3.5); } }
      }
      // thrust
      const base = e.run || e.n > 0.2 ? j58(thr, M, sig, A.kias) : 0;
      const spool = e.run ? sstep(0.6, 1.0, e.n) : e.n * 0.2;
      const dry = e.run || e.n > 0.2 ? j58(Math.min(thr, 0.66), M, sig, A.kias) : 0;
      let T = lerp(dry, base, abCmd ? e.ab : 0) * spool;
      if (e.unstart) T *= 0.22;                                   // the unstarted inlet: thrust gone, spillage drag (below)
      if (e.damaged) T *= 0.5;
      e.thrust = Math.max(0, T);
      e.ff = e.run ? Math.max(1800, (e.thrust / 4.44822) * tsfc(e.ab > 0.5, M) * (e.unstart ? 2.5 : 1)) : 0;   // lb/h
      // the gauges show the real fuel flow; the tanks drain at 1 / K_EQ of it: in the half-speed world every leg and climb
      // takes K_EQ times as long, so a mission phase burns the real aircraft's fuel (the findings: 'world scale')
      A.fuel = Math.max(0, A.fuel - e.ff / LB / 3600 * h / K_EQ);
      // EGT: the trim band 800-860 C at MIL and above (the fuel control holds it), lower at part power; CIT over the limit
      // drives it up (INFERRED)
      const egtT = e.run ? 380 + 440 * sstep(0.68, 1, e.n) + 30 * e.ab + Math.max(0, A.cit - 400) * 2 + (e.unstart ? 120 : 0) : 20 + 200 * e.n;
      e.egt += (egtT - e.egt) * Math.min(1, h * 0.8);
      e.nozzle = e.ab > 0.1 ? 0.5 + 0.5 * e.ab : 0.35 + 0.2 * (1 - e.n);
      e.cit = A.cit;
      if (A.cit > P.CIT_MAX) { e.overT += h; if (e.overT > 30 && !e.damaged) { e.damaged = 1; ev('engineDamage', { k, why: 'CIT' }); } } else e.overT = Math.max(0, e.overT - h * 0.2);
    }
  }

  // ---------------------------------------------------------------- one substep
  const Fb = new THREE.Vector3(), Mb = new THREE.Vector3(), Fw = new THREE.Vector3(), Tw = new THREE.Vector3(), _c = {}, cfg = { gear: 0, rud: 0, extra: 0, flapE: 0 };
  function sub(h, ctl, env) {
    const m = A.mass, km = m / 50000, I = [P.I50[0] * (0.5 + 0.5 * km), P.I50[1] * (0.6 + 0.4 * km), P.I50[2] * (0.6 + 0.4 * km)];
    A.rho = rhoAt(A.pos.y); A.sigma = A.rho / ATM.RHO0;
    const isa = isaFromSigma(Math.max(1e-5, A.sigma)); A.altFt = isa.d * FT; A.isaT = isa.T;
    _v.copy(A.vel); _iq.copy(A.q).invert(); _v.applyQuaternion(_iq); toF(_v, _vb);
    const V = _vb.length(), a = V > 1 ? Math.atan2(_vb.z, _vb.x) : 0, b = V > 1 ? Math.asin(clamp(_vb.y / V, -1, 1)) : 0;
    const qb = 0.5 * A.rho * V * V, Vr = V * K_EQ, aSnd = Math.sqrt(1.4 * 287.05 * A.isaT);
    A.alpha = a; A.beta = b; A.tas = V; A.qbar = qb; A.eas = Math.sqrt(2 * qb / ATM.RHO_SL); A.keas = A.eas * KT; A.mach = Vr / aSnd;
    // indicated: the compressible pitot (the KIAS the manual's takeoff / landing numbers use; equals KEAS at sea level)
    A.kias = A.keas * (1 + 0.125 * (1 - A.sigma) * (A.mach) ** 2) ;
    // skin temperature (the 'heat soak' that seals the tanks): toward the recovery temperature, slowly
    const Trec = A.isaT * (1 + 0.18 * A.mach * A.mach) - 273.15; A.skinT += (Trec - A.skinT) * Math.min(1, h / (A.skinT < Trec ? 240 : 1800));
    // gear (~12 s), canopy
    A.gear += clamp(A.gearCmd - A.gear, -h / 12, h / 12);
    if (A.gear > 0.02 && A.keas > P.V_GEAR + 30 && !A.gearT) { A.gearT = 1; ev('gearOverspeed'); A.damage += 0.02; } else if (A.keas < P.V_GEAR) A.gearT = 0;
    A.canopy += clamp(A.canopyCmd - A.canopy, -h / 4, h / 4);
    A.trim = clamp(A.trim + clamp(ctl.trimRate || 0, -1, 1) * 0.1 * h, -0.6, 0.6);
    // ---- flight controls: stick -> pitch / roll commands, SAS dampers, the autopilot, the surface limiter
    let pc = clamp(ctl.pitch || 0, -1, 1), rc = clamp(ctl.roll || 0, -1, 1), yc = clamp(ctl.yaw || 0, -1, 1);
    const hasStick = Math.abs(pc) > 0.02 || Math.abs(rc) > 0.02;
    if (A.ap.on && !A.onGround) { const o = autopilot(h, hasStick); if (o) { pc = o.pitch; rc = o.roll; } }
    // stick gearing: the artificial feel spring makes the same stick give less surface at high KEAS (INFERRED)
    const gear_ = clamp(7000 / Math.max(qb, 7000), 0.4, 1), gearR = clamp(9000 / Math.max(qb, 9000), 0.55, 1);
    const p_ = A.w.x, q_ = A.w.y, r_ = A.w.z, kd = clamp(4000 / Math.max(qb, 1500), 0.15, 1.6);
    const pitchCmd = (pc >= 0 ? pc * LIM.eUp : pc * LIM.eDn) * gear_ + A.trim * LIM.eUp + (A.sas.pitch ? -0.55 * q_ * kd : 0);
    const rollCmd = rc * LIM.roll * gearR + (A.sas.roll ? -0.18 * p_ * kd : 0);
    const rudMax = A.limiter && A.mach > 0.5 ? LIM.rudLim : LIM.rud;
    const rudCmd = clamp(yc * rudMax + (A.sas.yaw ? -0.9 * (r_ - 0) * kd + 0.35 * Math.sin(b) : 0), -rudMax, rudMax);
    const act = (cur, cmd, lo, hi, rate) => cur + clamp(clamp(cmd, -lo, hi) - cur, -rate * h, rate * h);
    A.surf.pitch = act(A.surf.pitch, pitchCmd, LIM.eDn, LIM.eUp, RATE.e);
    A.surf.roll = act(A.surf.roll, rollCmd, LIM.roll, LIM.roll, RATE.e);
    A.surf.rud = act(A.surf.rud, rudCmd, rudMax, rudMax, RATE.r);
    // the model's elevons: + = trailing edge down; pitch up (stick aft) = trailing edges up; roll right = left TE down
    A.surf.elevL = -A.surf.pitch + A.surf.roll; A.surf.elevR = -A.surf.pitch - A.surf.roll;
    engines(h, ctl);
    // ---- aerodynamic forces
    const chute = A.chute === 'deployed';
    if (chute && A.kias > P.V_CHUTE + 25) { A.chute = 'failed'; ev('chuteFail'); }
    cfg.gear = A.gear; cfg.rud = A.surf.rud; cfg.flapE = -A.surf.pitch * 0.35;
    cfg.extra = 0.006 * (A.eng[0].unstart + A.eng[1].unstart) + 0.002 * (A.eng[0].bypass + A.eng[1].bypass) * sstep(0.5, 1.2, A.mach) + (A.canopy > 0.05 ? 0.02 * A.canopy : 0);
    aero(a, b, A.mach, cfg, _c); A.burst = _c.burst;
    Fb.set(0, 0, 0); Mb.set(0, 0, 0);
    if (V > 0.5) {
      const uw = Math.hypot(_vb.x, _vb.z) || 1, L = qb * P.S * _c.CL, Dg = qb * P.S * _c.CD + (chute ? qb * P.CHUTE_CDS * (A.chuteInfl = Math.min(1, (A.chuteInfl || 0) + h / 1.2)) : (A.chuteInfl = 0));
      const Y = qb * P.S * _c.CY;
      Fb.x += L * _vb.z / uw - Dg * _vb.x / V; Fb.y += Y - Dg * _vb.y / V; Fb.z += -L * _vb.x / uw - Dg * _vb.z / V;
      const VrM = Math.max(Vr, 30), ph = p_ * P.B / (2 * VrM), qh = q_ * P.C / (2 * VrM), rh = r_ * P.B / (2 * VrM), M = A.mach, s = _c.burst;
      // the unstarted side's spillage drag and lost thrust yaw the nose toward it (thrust moments below)
      const unst = (A.eng[1].unstart - A.eng[0].unstart) * 0.004;
      const Cl = CLB(a) * b + CLP * (1 - 0.5 * s) * ph + CLR * rh + CLDA(M) * A.surf.roll * (1 - 0.4 * s) + CLDR * A.surf.rud + unst * 0.6 + s * 0.01 * Math.sin(A.tSim * 1.3);
      const Cm = CM0 + CMA(M) * Math.sin(a) * (1 + 0.5 * s) + CMQ * qh + CMDE(M) * -A.surf.pitch * (1 - 0.4 * s) + 0.01 * A.gear - 0.05 * s;
      const Cn = CNB(M) * (1 - 0.8 * s) * Math.sin(b) + CNR * rh + CNDR(M) * A.surf.rud + CNDA * A.surf.roll + unst;
      Mb.set(qb * P.S * P.B * Cl, qb * P.S * P.C * Cm, qb * P.S * P.B * Cn);
    }
    // thrust along the body axis on the nacelle lines: an engine out (or unstarted) yaws hard
    // (FRD: the left engine at y = -4.226 pushing yaws the nose right; the thrust line above the CG pitches nose down)
    for (let k = 0; k < 2; k++) { const T = A.eng[k].thrust; Fb.x += T; Mb.z += -T * P.ENG_X[k]; Mb.y += -T * P.ENG_Y; }
    A.nz = -Fb.z / (m * GRAV); A.ny = Fb.y / (m * GRAV);
    Fw.set(0, 0, 0); Tw.set(0, 0, 0);
    const ground = gearForces(h, ctl, env, m);
    if (ground) A.nz += -toF(_t.copy(Fw).applyQuaternion(_iq), _r).z / (m * GRAV);
    // integrate: translation in world, rotation in body
    fromF(Fb, _f).applyQuaternion(A.q).add(Fw); _f.y -= m * GRAV;
    A.vel.addScaledVector(_f, h / m); A.pos.addScaledVector(A.vel, h);
    _t.copy(Tw).applyQuaternion(_iq); toF(_t, _r); Mb.add(_r);
    A.w.x += (Mb.x + (I[1] - I[2]) * q_ * r_) / I[0] * h;
    A.w.y += (Mb.y + (I[2] - I[0]) * p_ * r_) / I[1] * h;
    A.w.z += (Mb.z + (I[0] - I[1]) * p_ * q_) / I[2] * h;
    fromF(A.w, _ax); const ang = _ax.length() * h;
    if (ang > 1e-9) { _dq.setFromAxisAngle(_ax.normalize(), ang); A.q.multiply(_dq).normalize(); }
    A.tSim += h;
    if (!A.onGround) { A.nzMax = Math.max(A.nzMax, A.nz); A.nzMin = Math.min(A.nzMin, A.nz); }
    // limits: the airframe is a 3 g aircraft at heavy weights (2.5 g at high Mach); KEAS over 450 heats and loads it
    const gLim = A.mach > 2 ? 2.5 : 3.0;
    if (A.nz > gLim + 0.3 && !A.overG) { A.overG = true; ev('overstress', { g: A.nz }); A.damage += 0.05; } else if (A.nz < gLim) A.overG = false;
    if (A.keas > P.KEAS_MAX + 10) { A.overspeedT += h; if (A.overspeedT > 0.5 && !A.osEv) { A.osEv = true; ev('overspeed'); } if (A.keas > 520) A.damage += h * 0.02; } else { A.overspeedT = 0; A.osEv = false; }
    // fuel leaks on the ground until the airframe has been heat-soaked (the tank sealant): a slow drip, cold (INFERRED)
    A.leak = A.onGround && A.skinT < 60 ? 0.012 : 0; A.fuel = Math.max(0, A.fuel - A.leak * h);
    // air refuelling (the play layer sets A.refuel kg/s when the boom is in: the KC-135Q gives ~6,000 lb/min)
    if (A.refuel > 0) A.fuel = Math.min(P.FUEL_MAX, A.fuel + A.refuel * h);
    hull(env);
  }

  // ---------------------------------------------------------------- the autopilot: pitch hold of KEAS / Mach / altitude /
  // attitude, roll hold of heading / attitude. PI loops on the stick (it flies the same surfaces the pilot does).
  function autopilot(h, override) {
    const ap = A.ap; if (override) { ap.I = 0; ap.last = null; return null; }
    const att = A.attitude(), V = Math.max(1, A.vel.length()), gam = Math.asin(clamp(A.vel.y / V, -1, 1));
    if (ap.last !== ap.pitch) { ap.last = ap.pitch; ap.g = gam; ap.I = 0; }
    // outer loops command a flight-path angle (KEAS / Mach: integrating the speed error; altitude: a vertical speed)
    let gc = null;
    // speed rate (filtered) damps the long-period speed / height exchange the plain loop would ride
    const kd = (A.keas - (ap.kPrev ?? A.keas)) / h; ap.kPrev = A.keas; ap.kDot = (ap.kDot || 0) + (kd - (ap.kDot || 0)) * Math.min(1, h * 0.5);
    const md = (A.mach - (ap.mPrev ?? A.mach)) / h; ap.mPrev = A.mach; ap.mDot = (ap.mDot || 0) + (md - (ap.mDot || 0)) * Math.min(1, h * 0.5);
    if (ap.pitch === 'keas') { const e = A.keas - ap.keas; ap.g = clamp(ap.g + clamp(e * 0.00025, -0.003, 0.003) * h * 10, -0.35, 0.45); gc = ap.g + clamp(e * 0.0012 + ap.kDot * 0.012, -0.06, 0.06); }
    else if (ap.pitch === 'mach') { const e = A.mach - ap.mach; ap.g = clamp(ap.g + clamp(e * 0.08, -0.003, 0.003) * h * 10, -0.35, 0.45); gc = ap.g + clamp(e * 0.4 + ap.mDot * 4, -0.06, 0.06); }
    else if (ap.pitch === 'alt') { const vs = clamp((ap.alt - A.pos.y) * 0.04, -12, 12); gc = Math.asin(clamp(vs / V, -0.5, 0.5)); }
    if (gc === null) gc = gam + clamp(ap.att - att.pitch, -0.15, 0.15);
    // inner loop: a g command (the flight-path error over ~3 s at the real-equivalent speed), PI on the stick
    const Vr = V * K_EQ, nzc = Math.cos(gam) * Math.cos(att.roll) ** -1 * 0 + Math.cos(gam) / Math.max(0.5, Math.cos(att.roll)) + clamp((gc - gam) * Vr / GRAV / 3, -0.8, 1.3);
    const en = nzc - A.nz; ap.I = clamp(ap.I + en * h * 0.25, -0.6, 0.6);
    const pitch = clamp(en * 0.25 + ap.I - A.w.y * 0.8, -0.8, 0.8);
    let bankT = ap.bank;
    if (ap.roll === 'hdg') { let d = ap.hdg - A.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; bankT = clamp(-d * 1.5, -0.6, 0.6); }   // heading decreases turning right
    const roll = clamp((bankT - att.roll) * 2.0 - A.w.x * 0.6, -0.5, 0.5);
    return { pitch, roll };
  }


  // ---------------------------------------------------------------- undercarriage (nose + two main bogies of three wheels)
  function gearForces(h, ctl, env, m) {
    fromF(A.w, _ow).applyQuaternion(A.q);
    let any = false; const down = A.gear > 0.98, vg = Math.hypot(A.vel.x, A.vel.z);
    // nose wheel steering on the pedals: +-40 deg slow, +-8 deg fast (INFERRED: the manual's steering is engaged by switch)
    A.steer = clamp(clamp(ctl.yaw || 0, -1, 1) * lerp(0.7, 0.14, sstep(5, 30, vg)), -0.7, 0.7);
    for (let i = 0; i < 3; i++) {
      const Gp = P.GEAR[i];
      _r.set(Gp[0], Gp[1], Gp[2]).applyQuaternion(A.q); _wp.copy(_r).add(A.pos);
      const gy = env.groundY(_wp.x, _wp.z), pen = gy - _wp.y;
      if (!down || pen <= 0) { A.wow[i] = 0; A.strut[i] = Math.max(0, A.strut[i] - h); continue; }
      if (env.water && env.water(_wp.x, _wp.z) && gy <= 0.5) { die('ditch'); return true; }
      any = true;
      _pv.copy(_ow).cross(_r).add(A.vel);
      if (!A.onGround && _pv.y < -4.5) { ev('gearcollapse'); die('crash'); return true; }   // ~1,800 fpm real-equivalent
      if (!A.onGround && _pv.y < -2.6 && !A.hardT) { A.hardT = 0.5; ev('hardland', { vy: _pv.y }); }
      const c = Math.min(pen, P.STROKE[i]); A.wow[i] = c; A.strut[i] = c;
      let N = P.K[i] * c - P.DAMP[i] * _pv.y * (_pv.y < 0 ? 1 : 0.4);
      if (pen > P.STROKE[i]) N += 3e7 * (pen - P.STROKE[i]);
      N = Math.max(0, N);
      const st = i === 0 ? A.steer : 0;
      _d.set(Math.sin(st), 0, -Math.cos(st)).applyQuaternion(A.q); _d.y = 0; _d.normalize();
      _l.set(-_d.z, 0, _d.x);
      const vlat = _pv.dot(_l), vlong = _pv.dot(_d), mu = 0.75;
      const brk = i === 1 ? ctl.brakeL || 0 : i === 2 ? ctl.brakeR || 0 : 0;
      const mw = N / GRAV / h, flat = clamp(-vlat * mw * 0.5, -mu * N, mu * N);
      // anti-skid brakes, effective mu ~0.35 (the SR-71's small hot tyres: brakes are for the end of the roll, the chute
      // does the work: INFERRED)
      const bmax = 0.35 * clamp(brk, 0, 1) * N; A.slip[i] = bmax > 0 ? A.slip[i] + vlong * h : 0;
      const fb = -(vlong + A.slip[i] * 6) * mw * 0.5; if (Math.abs(fb) > bmax) A.slip[i] = 0;
      const flong = -0.014 * N * Math.tanh(vlong / 0.4) + clamp(fb, -bmax, bmax);
      _f.set(0, N, 0).addScaledVector(_l, flat).addScaledVector(_d, flong);
      Fw.add(_f); Tw.add(_t.copy(_r).cross(_f));
      if (vg * KT * K_EQ > 239 && !A.tyreEv) { A.tyreEv = true; ev('tyreLimit'); }   // tyre speed (UNVERIFIED rating ~239 kt)
    }
    A.wheelRot -= vg / 0.43 * h;
    if (A.hardT) A.hardT = Math.max(0, A.hardT - h);
    if (any && !A.onGround) ev('touchdown', { vg, vy: A.vel.y, kias: A.kias });
    if (!any && A.onGround) ev('airborne', { kias: A.kias });
    A.onGround = any;
    return any;
  }
  function hull(env) {
    for (let i = 0; i < P.HULL.length; i++) {
      const Hp = P.HULL[i]; A.worldPoint(Hp, _wp); const gy = env.groundY(_wp.x, _wp.z);
      if (_wp.y >= gy) continue;
      if (env.water && env.water(_wp.x, _wp.z) && gy <= 0.5) { die('crash'); return; }
      if (A.vel.length() > 8 || gy - _wp.y > 0.5) { die('crash'); return; }
      A.pos.y += (gy - _wp.y); if (A.vel.y < 0) A.vel.y *= 0.3; ev('scrape', { i });
    }
  }
  function die(why) { if (A.dead) return; A.dead = why; ev(why); }
  return A;
}
