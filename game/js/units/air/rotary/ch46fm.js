// CH-46E Sea Knight flight model (Boeing Vertol 107 tandem). Pure JS: runs in node (tools/ch46bench.mjs).
//
// Two 3-blade articulated rotors on the same drive train (a synchronising shaft keeps the blades meshed), real air,
// real gravity, real size. Built on the Huey's rotor concepts (rotor.js): blade-element thrust, momentum inflow with
// lag, vortex ring, ground effect, flapping. What makes it a tandem:
// - Pitch control by DIFFERENTIAL COLLECTIVE (DCP): stick aft = more pitch on the front rotor, less on the aft one.
// - Roll by lateral cyclic on both rotors; YAW by DIFFERENTIAL LATERAL CYCLIC (pedal right: front disc tilts right,
//   aft disc left). (The brief said "differential collective for yaw"; on a tandem differential collective is pitch
//   and yaw is differential lateral cyclic - documented in MODLOG.)
// - LONGITUDINAL CYCLIC TRIM (LCT): both discs tilted forward by an airspeed schedule so the fuselage stays near level
//   in cruise (the CH-46's LCT actuators).
// - Rotor interference: in the hover each rotor flies partly in the other's wake (overlap, ~10% more induced power);
//   in forward flight the aft rotor flies in the front rotor's downwash (more aft collective and power), less so once
//   the front wake passes below it (the aft pylon is higher).
// - Counter-rotating: front rotor counter-clockwise from above, aft clockwise; torques cancel in yaw.
// - The fuselage is unstable in pitch (no tail plane); the aft pylon gives weathercock stability; dual SAS (rate
//   damping) on all three axes.
// Engines: 2 x GE T58-GE-16 behind a combining gearbox, N2 governor, single-engine flight possible.
//
// Tags: CONFIRMED = from a published source, INFERRED = estimated / tuned / scaled (stated).
// Sources: Wikipedia CH-46 (from Jane's / NAVAIR fact files): dims, weights, engines, speed, climb, hover ceilings;
// Boeing Vertol CH-46E flight test report (rotor rpm limits 94% = 248 rpm / 113% = 298 rpm -> 100% = 264 rpm);
// the 16 ft rotor overlap (globalsecurity / museum fact sheets).
import { createRotor, clamp } from './rotor.js';
import { createBody, sstep, toF, fromF, qrot, qinv, attitude, cross } from './rb.js';

export const KT = 1.94384, FT = 3.28084, LB = 2.20462, HP = 745.7;
export const CH46 = {
  EMPTY: 7047, MTOW: 11022,                   // kg: 15,537 lb empty, 24,300 lb max (CONFIRMED, CH-46E)
  CREW: 4 * 90, FUEL_KG: 1050,                // 4 crew; 350 US gal JP-5 = 1,050 kg (CONFIRMED capacity)
  MARINE_KG: 118,                             // a 1980 Marine with M16A1, flak vest, ALICE pack (INFERRED)
  I: [16000, 95000, 88000],                   // Ixx Iyy Izz kg m2 (INFERRED: scaled from CH-47 inertias by mass x length^2)
  // rotors: 2 x 50 ft (CONFIRMED), 3 blades (CONFIRMED), 264 rpm (CONFIRMED from the 94% = 248 rpm limit),
  // chord 18.25 in (UNVERIFIED, sigma 0.058), twist -8.5 deg (INFERRED), Lock 8 (INFERRED), hinge offset 4% (INFERRED)
  R: 7.62, NB: 3, CHORD: 0.4636, OMEGA: 264 * Math.PI / 30, TWIST: -0.148, LOCK: 8, E: 0.04, SB: 330,
  // hub positions FRD from the CG: 33.3 ft shaft spacing (CONFIRMED: 83 ft 4 in rotors turning - 50 ft), aft head top
  // 16 ft 9 in (5.11 m, CONFIRMED) above the ground -> hub 4.85 m; front pylon ~0.85 m lower (INFERRED); CG 1.80 m up
  HUB_F: [5.08, 0, -2.20], HUB_A: [-5.08, 0, -3.05], CG_H: 1.80,
  SHAFT_F: 4.5 * Math.PI / 180, SHAFT_A: 4.5 * Math.PI / 180,     // forward shaft tilt (INFERRED)
  // controls (INFERRED rigging): collective 1..16 deg at 0.75R; DCP +-3.2 deg; lateral cyclic +-6 deg; diff lateral +-6 deg
  TH_MIN: 0.6 * Math.PI / 180, TH_SPAN: 16.5 * Math.PI / 180, DCP: 3.2 * Math.PI / 180, LAT: 6 * Math.PI / 180, DLC: 6 * Math.PI / 180,
  // LCT: both discs forward with airspeed, -1 deg at hover to +4 deg past 110 kt (INFERRED from the CH-46 LCT actuators)
  LCT: [-1 * Math.PI / 180, 4 * Math.PI / 180, 30, 110],
  // interference (INFERRED): hover overlap inflow 10% of the other rotor's (Harris twin-rotor hover data: ~+10% induced
  // power at 33% overlap); the aft rotor in the front rotor's wake in forward flight (peak 0.85 x its induced velocity)
  K_OV: 0.12, K_WAKE: 0.85,
  // engines: T58-GE-16 1,870 shp each (CONFIRMED); power lapse (rho/rho0)^1.15 ~ delta/sqrt(theta) in the ISA (INFERRED)
  P_ENG: 1870 * HP, XMSN: 2800 * HP,                              // transmission limit 2 x 1,400 shp (INFERRED: the D/F drive train, kept on the E until the 1990s DCU)
  I_ROTOR: 2 * 8600 + 1500,                  // rotor + drive polar inertia at the rotor (INFERRED)
  // fuselage: flat-plate drag area (INFERRED: tuned to the 144 kt max speed), side and vertical areas, pitch moment
  // (unstable, no tail plane), aft pylon weathercock
  FUS: { fx: 5.6, fy: 32, fz: 36, Mw: 60, Nv: 55, Yv: 0 },
  // gear: fixed tricycle - twin nose wheels, main wheels in the sponsons (INFERRED positions)
  GEAR: [[4.6, -0.35], [4.6, 0.35], [-1.6, -1.95], [-1.6, 1.95]],
  // published performance (CONFIRMED, CH-46E SL ISA): max speed 144 kt, cruise 143 kt, climb 1,715 ft/min,
  // hover ceiling OGE 5,750 ft / IGE 9,500 ft, service ceiling 17,000 ft
  PUB: { VMAX: 144, VCRUISE: 143, ROC: 1715, HOGE: 5750, HIGE: 9500 },
  // the AI pilot's gains for this airframe (pilot.js)
  PILOT: { kv: 0.45, aMax: 3, tilt: 0.33, th: [3, 1.5, 1.2], ph: [3, 1.5, 0.8], vz: [0.08, 0.06], coll0: 0.5, psi: [0.9, 0.3], r: [1.5, 1], trimI: 0.004 },
};
const C = CH46;
const ROTOR = (dir) => ({ R: C.R, nb: C.NB, chord: C.CHORD, root: 0.18, twist: C.TWIST, a: 5.9, cd0: 0.0095, d2: 0.35, aStall: 0.24, omega0: C.OMEGA, dir, lock: C.LOCK, e: C.E, Sb: C.SB, N: 8 });

export function createCH46Sim(G = 9.81) {
  const rf = createRotor(ROTOR(+1)), ra = createRotor(ROTOR(-1));   // front CCW, aft CW from above (INFERRED, Vertol convention)
  const S = {
    payload: 13 * C.MARINE_KG, fuelKg: C.FUEL_KG,
    get mass() { return C.EMPTY + C.CREW + S.fuelKg + S.payload; },
    omega: C.OMEGA, rf, ra, eng: [mkEng(), mkEng()], gov: 1,
    // pilot / AI controls: coll 0..1, lon (+aft) -1..1, lat (+right), ped (+right), sas
    c: { coll: 0, lon: 0, lat: 0, ped: 0 }, sas: true, lct: 0,
    ias: 0, vz: 0, agl: 0, landed: true, torque: 0, power: 0, events: [], dead: false, rho: 1.225, vib: 0, mods: null,
    get rpm() { return S.omega / C.OMEGA; },
    reset(pos, yaw = 0, landed = true, env = null) {
      S.body.reset(pos, yaw, landed, env); S.omega = C.OMEGA; S.dead = false;
      rf.reset(landed ? 0.01 : 0.05); ra.reset(landed ? 0.01 : 0.05); for (const e of S.eng) { e.on = true; e.n1 = landed ? 0.8 : 0.9; e.ok = true; }
      S.c.coll = landed ? 0 : 0.5; S.c.lon = S.c.lat = S.c.ped = 0; S.landed = landed; S.events.length = 0;
    },
    step(dt, ctl, env) {
      S.events.length = 0;
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let i = 0; i < n && !S.dead; i++) sub(h, ctl, env);
      return S.events[0] || null;
    },
    attitude(out) { return attitude(S.body.q, out); },
  };
  function mkEng() { return { on: true, ok: true, n1: 0.9, p: 0, q: 0 }; }
  const body = S.body = createBody({ mass: () => S.mass, I: C.I, gear: C.GEAR.map(([x, y]) => ({ at: [x, y, C.CG_H], k: 260000, c: 30000, mu: 0.7 })) });

  // shaft axes for each rotor: tilted forward by the shaft angle (FRD, rotations about y)
  const sh = (t) => ({ X: [Math.cos(t), 0, Math.sin(t)], Y: [0, 1, 0], Z: [-Math.sin(t), 0, Math.cos(t)] });
  const SF = sh(C.SHAFT_F), SA = sh(C.SHAFT_A);
  const _vb = [0, 0, 0], _wb = [0, 0, 0], _hv = [0, 0, 0], _t = [0, 0, 0], _p = [0, 0, 0], _f = [0, 0, 0], _m = [0, 0, 0], _att = {};
  const inpF = { u: 0, v: 0, w: 0, p: 0, q: 0, th75: 0, lon: 0, lat: 0, om: 0, zg: Infinity, lx: 0, rho: 1.225, lift: 1 }, inpA = { ...inpF };
  function rotorInput(inp, hub, Sx, vb, wb, zg) {
    cross(wb, hub, _hv); _hv[0] += vb[0]; _hv[1] += vb[1]; _hv[2] += vb[2];
    inp.u = _hv[0] * Sx.X[0] + _hv[2] * Sx.X[2]; inp.v = _hv[1]; inp.w = _hv[0] * Sx.Z[0] + _hv[2] * Sx.Z[2];
    inp.p = wb[0] * Sx.X[0] + wb[2] * Sx.X[2]; inp.q = wb[1]; inp.zg = zg; inp.om = S.omega; inp.rho = S.rho;
  }
  function addRotor(R, hub, Sx) {   // shaft-axis force / moment -> body FRD, about the CG
    const F = R.F, M = R.M;
    _f[0] = F[0] * Sx.X[0] + F[2] * Sx.Z[0]; _f[1] = F[1]; _f[2] = F[0] * Sx.X[2] + F[2] * Sx.Z[2];
    body.F[0] += _f[0]; body.F[1] += _f[1]; body.F[2] += _f[2];
    cross(hub, _f, _m); body.M[0] += _m[0] + M[0] * Sx.X[0] + M[2] * Sx.Z[0]; body.M[1] += _m[1] + M[1]; body.M[2] += _m[2] + M[0] * Sx.X[2] + M[2] * Sx.Z[2];
  }
  function hubHeight(hub, env) { body.worldPoint(hub, _p); return _p[1] - Math.max(env.groundY(_p[0], _p[2]), -50); }

  function sub(h, ctl, env) {
    const M = env.mods || S.mods || {};
    S.rho = env.rho ?? 1.225;
    // controls: servos follow at a finite rate (boosted controls); SAS rate damping (+-15% authority)
    const c = S.c, mv = (cur, t, r) => cur + clamp(t - cur, -r * h, r * h);
    c.coll = mv(c.coll, clamp(ctl.coll ?? 0, 0, 1), 1.5); c.lon = mv(c.lon, clamp(ctl.lon ?? 0, -1, 1), 4); c.lat = mv(c.lat, clamp(ctl.lat ?? 0, -1, 1), 4); c.ped = mv(c.ped, clamp(ctl.ped ?? 0, -1, 1), 4);
    body.bodyVel(_vb); const wb = body.w, V = Math.hypot(_vb[0], _vb[1]);
    S.ias = V * KT;
    const sas = (ctl.sas ?? S.sas) && M.sasOk !== false ? 1 : 0;
    const sq = clamp(-0.9 * wb[1], -0.15, 0.15) * sas, sp = clamp(-0.5 * wb[0], -0.15, 0.15) * sas, sr = clamp(-1.2 * wb[2], -0.2, 0.2) * sas;
    const lon = c.lon + sq, lat = c.lat - sp, ped = c.ped + sr;   // SAS: pitch-rate -> DCP, roll-rate -> lat cyclic, yaw-rate -> DLC
    S.lct = C.LCT[0] + (C.LCT[1] - C.LCT[0]) * sstep(C.LCT[2], C.LCT[3], Math.max(0, _vb[0]) * KT);
    const th = C.TH_MIN + C.TH_SPAN * c.coll;
    inpF.th75 = th + C.DCP * lon; inpA.th75 = th - C.DCP * lon;
    inpF.lon = inpA.lon = S.lct; inpF.lat = C.LAT * lat + C.DLC * ped; inpA.lat = C.LAT * lat - C.DLC * ped;
    inpF.lift = M.liftF ?? 1; inpA.lift = M.liftA ?? 1;
    rotorInput(inpF, C.HUB_F, SF, _vb, wb, hubHeight(C.HUB_F, env)); rotorInput(inpA, C.HUB_A, SA, _vb, wb, hubHeight(C.HUB_A, env));
    // interference: overlap in the hover; the aft rotor in the front wake in forward flight (fades once the wake passes
    // below the higher aft rotor: wake drop over the spacing ~ 10.2 m x inflow / advance ratio)
    const mu = Math.max(rf.mu, 1e-3), drop = 10.16 * Math.max(0, rf.lam) / mu - (C.HUB_F[2] - C.HUB_A[2]);
    const wake = sstep(0.02, 0.07, mu) * Math.exp(-((drop / (0.7 * C.R)) ** 2));
    inpA.lx = rf.vi * (C.K_OV * (1 - sstep(0.02, 0.07, mu)) + C.K_WAKE * wake);
    inpF.lx = ra.vi * C.K_OV * (1 - sstep(0.02, 0.05, mu));
    rf.step(h, inpF); ra.step(h, inpA);
    addRotor(rf, C.HUB_F, SF); addRotor(ra, C.HUB_A, SA);
    drivetrain(h, ctl, M);
    // fuselage: drag on each axis, the rotor wash on the top at low speed, pitch instability, aft-pylon weathercock
    const F = C.FUS, rho = S.rho / 1.225, u = _vb[0], v = _vb[1], vi = 0.5 * (rf.vi + ra.vi), wake2 = 1 - sstep(4, 16, V);
    const w = _vb[2] - 1.5 * vi * wake2, q0 = 0.5 * S.rho;
    body.F[0] += -q0 * F.fx * u * Math.abs(u); body.F[1] += -q0 * F.fy * v * Math.abs(v); body.F[2] += -q0 * F.fz * w * Math.abs(w);
    body.M[1] += q0 * F.Mw * w * Math.abs(u) * rho;                             // + nose up with angle of attack: unstable
    body.M[2] += q0 * F.Nv * v * Math.abs(u) * sstep(3, 12, Math.abs(u));       // aft pylon: nose into the sideslip
    body.M[0] += -9000 * wb[0]; body.M[1] += -30000 * wb[1]; body.M[2] += -40000 * wb[2] * (0.5 + wake2);   // airframe damping (INFERRED)
    body.integrate(h, env, G);
    // read-outs, events
    S.vz = body.vel[1]; S.agl = body.agl; S.landed = body.landed;
    S.vib = Math.min(1, 0.6 * Math.max(rf.vrs, ra.vrs) + 0.5 * Math.max(rf.stall, ra.stall) + (M.vib || 0));
    if (body.touch) { const t = body.touch; body.touch = null; S.events.push(t.vy < -4.5 || t.hs > 8 ? 'hardland' : 'land'); if (t.vy < -9) { S.events.push('crash'); S.dead = 'crash'; } }
    if (body.wet && !env.floats) { S.events.push('water'); S.dead = 'water'; }
    S.attitude(_att); if (body.contacts && Math.abs(_att.roll) > 0.6) { S.events.push('crash'); S.dead = 'rollover'; }
  }

  // engines + drive train: two free-turbine T58s through a combining gearbox, N2 governor (PI + collective anticipator),
  // gas-generator lag; the rotors share one rpm (sync shaft)
  function drivetrain(h, ctl, M) {
    const lapse = (S.rho / 1.225) ** 1.15, nr = S.omega / C.OMEGA, err = (ctl.beep ? 1 + ctl.beep : 1) - nr;
    S.govI = clamp((S.govI ?? 0.75) + err * 3 * h, 0.3, 1.05);
    let qe = 0, live = 0;
    for (let i = 0; i < 2; i++) {
      const e = S.eng[i], ok = e.ok && e.on && (M['eng' + i] ?? true) && ctl['eng' + i] !== false && (M.fuel ?? 1) > 0;
      const dem = ok ? clamp(S.govI + err * 8 + 0.25 * S.c.coll - 0.1, 0.62, 1.02) : 0;
      e.n1 += clamp((dem - e.n1) * 1.8, -0.3, 0.12) * h;   // acceleration-limited spool (~4 s idle -> max, INFERRED)
      e.p = ok ? C.P_ENG * lapse * Math.max(0, (e.n1 - 0.6) / 0.4) ** 1.5 : 0;
      e.q = e.p / C.OMEGA * Math.max(0, 2 - nr);   // free-turbine torque at the rotor falls with N2
      if (ok) live++; qe += e.q;
    }
    S.live = live;
    const qLoad = rf.Q + ra.Q + 0.03 * C.P_ENG / C.OMEGA * nr;   // + accessories / transmission loss (~3%, INFERRED)
    S.omega = Math.max(0, S.omega + (qe - qLoad) / C.I_ROTOR * h);
    S.power = qe * S.omega; S.torque = qe * C.OMEGA / C.XMSN;   // transmission torque, fraction of the limit (100% at 2,800 shp)
    S.pAvail = S.eng.reduce((a, e) => a + (e.ok && e.on ? C.P_ENG * lapse : 0), 0);
  }
  return S;
}
