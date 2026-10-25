// RW-3 WASP flight model: a RUNAWAY ducted-fan attack drone (fictional machine, real physics). Pure JS (node bench:
// tools/waspbench.mjs).
//
// One shroud, two counter-rotating fans inside it (no net torque), exit vanes below. The physics is the published
// ducted-fan picture (momentum theory for shrouded rotors - Leishman "Principles of Helicopter Aerodynamics" ch. 15,
// Pereira 2008 thesis; edgewise behaviour - Fleming et al. 2003, Abrego & Bulaga 2002 wind-tunnel tests):
// - Hover: with the wake held to the exit area (expansion ratio sigma = A_exit / A_fan), ideal power is
//   T^1.5 / sqrt(4 sigma rho A): sqrt(2 sigma) less than an open rotor of the same disc; the fan carries 1/(2 sigma) of
//   the thrust and the duct lip (suction on the inlet) the rest.
// - Axial climb: thrust falls with the inflow (exit velocity vs climb speed); descent adds it back.
// - Edgewise flight: the duct turns the free stream into the fan - momentum drag (mass flow x edgewise speed) and a
//   NOSE-UP pitching moment from the windward lip carrying more suction (the classic ducted-fan trim problem the vanes
//   must hold).
// - Control: four exit vanes deflect the jet below the CG (pitch / roll moments; small side forces); yaw from a split
//   in the two fans' torques; thrust from the fans' rpm (first-order spool, ~0.15 s).
// - Open loop the vehicle is unstable in pitch / roll (the lip moment): the onboard stabiliser (a machine, after all)
//   is rate + attitude feedback on the vanes.
// Numbers are this machine's design (INFERRED): there is no RW-3 to measure. The bench checks them against the theory.
import { createBody, clamp, sstep, attitude, cross } from './rb.js';

export const WASP = {
  MASS: 520, I: [210, 260, 300],                 // kg, kg m2 (INFERRED: a 2.4 m ring with a sensor head and a tail)
  R_FAN: 0.72, SIGMA: 1.12, FM: 0.78,             // fan radius, exit expansion ratio, fan figure of merit (INFERRED, shrouded fans ~0.7-0.8)
  P_MAX: 260e3, SPOOL: 0.15,                      // 260 kW turbines (INFERRED), spool time constant
  VANE_Z: 1.05, VANE_MAX: 0.5, VANE_K: 1.0,       // two stages of vanes 1.05 m below the CG, +-29 deg (INFERRED: sized to hold the lip moment to 60 m/s)
  LIP_K: 0.14,                                    // lip moment arm factor (x duct radius) (INFERRED from Fleming's trends)
  CD_A: [0.55, 0.6, 1.4],                         // drag areas m2 forward, side, vertical (INFERRED)
  YAW_K: 900,                                     // N m per unit yaw command (fan torque split)
  PAD_Z: 0.95,                                    // landing feet below the CG
};
const C = WASP, A_FAN = Math.PI * C.R_FAN * C.R_FAN;

export function createWaspSim(G = 9.81) {
  const S = {
    c: { thr: 0, pitch: 0, roll: 0, yaw: 0 }, thrust: 0, power: 0, vf: 0, lipM: 0, momDrag: 0, agl: 0, landed: true, events: [], dead: false, rho: 1.225, ductShare: 0,
    thrCmd: 0, sas: true, mods: null,
    get mass() { return C.MASS + (S.extra || 0); },
    reset(pos, yaw = 0, landed = false, env = null) { S.body.reset(pos, yaw, landed, env); S.thrust = landed ? 0 : C.MASS * G; S.dead = false; S.events.length = 0; },
    // ctl: thr 0..1 (fan power), pitch / roll (+ nose up / right) vane commands -1..1, yaw (+ right) -1..1
    step(dt, ctl, env) {
      S.events.length = 0; if (!(dt > 0)) return null;
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let i = 0; i < n && !S.dead; i++) sub(h, ctl, env);
      return S.events[0] || null;
    },
    attitude(out) { return attitude(S.body.q, out); },
  };
  const body = S.body = createBody({ mass: () => S.mass, I: C.I, gear: [[0.6, 0, C.PAD_Z], [-0.45, -0.55, C.PAD_Z], [-0.45, 0.55, C.PAD_Z]].map(at => ({ at, k: 30000, c: 3500, mu: 0.8 })) });
  const _vb = [0, 0, 0], _f = [0, 0, 0], _m = [0, 0, 0], _r = [0, 0, 0];
  // static thrust for a power: momentum theory with the wake held at sigma A
  // momentum theory with the wake held at the exit: through-flow u at the fan, exit velocity u / sigma, climb speed vax:
  //   T = rho A u (u / sigma - vax),  P_ideal = 1/2 rho A u (u^2 / sigma^2 - vax^2)   (hover: P = T^1.5 / sqrt(4 sigma rho A))
  // solved for u from the power (Newton), returns { T, u }
  const _fl = { T: 0, u: 0 };
  function flowFor(P, rho, vax) {
    const Pf = P * C.FM, s2 = C.SIGMA * C.SIGMA, k = 0.5 * rho * A_FAN;
    let u = Math.max(C.SIGMA * vax * 1.01 + 1, Math.cbrt(Pf / k * s2));
    for (let i = 0; i < 8; i++) { const f = k * u * (u * u / s2 - vax * vax) - Pf, df = k * (3 * u * u / s2 - vax * vax); u = Math.max(C.SIGMA * vax + 0.1, u - f / df); }
    _fl.u = u; _fl.T = rho * A_FAN * u * (u / C.SIGMA - vax); return _fl;
  }
  S.flowFor = flowFor;
  function sub(h, ctl, env) {
    const M = env.mods || S.mods || {}; S.rho = env.rho ?? 1.225;
    body.bodyVel(_vb); const w = body.w, u = _vb[0], v = _vb[1], wz = _vb[2];
    // fans: spool toward the commanded power; thrust from momentum theory with the axial inflow (climb = -wz)
    S.thrCmd = clamp(ctl.thr ?? 0, 0, 1) * (M.power ?? 1);
    S.power += (S.thrCmd * C.P_MAX - S.power) * (1 - Math.exp(-h / C.SPOOL));
    const vax = Math.max(-8, -wz), fl = flowFor(Math.max(1, S.power), S.rho, Math.max(0, vax)), Tt = fl.T * (1 + 0.03 * Math.max(0, -vax));   // descending: a little more thrust
    const vf = fl.u, mdot = S.rho * A_FAN * vf;
    S.thrust = Tt; S.vf = vf; S.ductShare = 1 - 1 / (2 * C.SIGMA);
    // edgewise: momentum drag (the duct turns the cross flow) and the nose-up lip moment toward the relative wind
    const ue = Math.hypot(u, v), md = mdot * ue;
    S.momDrag = md; S.lipM = C.LIP_K * C.R_FAN * 1.6 * md;
    body.F[2] -= Tt;                                                            // thrust along -z (up)
    if (ue > 0.05) {
      body.F[0] -= md * u / ue; body.F[1] -= md * v / ue;
      body.M[1] += S.lipM * u / ue; body.M[0] -= S.lipM * v / ue;               // windward lip lifts: nose up into a forward wind, roll away from a side wind
    }
    // vanes: jet deflection below the CG; stabiliser = attitude + rate feedback (a machine flies itself)
    const att = S.attitude(_m), sas = S.sas && M.sasOk !== false;
    const pc = clamp((ctl.pitch ?? 0) - (sas ? 1.6 * w[1] : 0), -1, 1), rc = clamp((ctl.roll ?? 0) - (sas ? 1.4 * w[0] : 0), -1, 1);
    const Fv = C.VANE_K * mdot * (vf / C.SIGMA) * Math.sin(C.VANE_MAX);   // the side force the vanes can take out of the exit jet
    const fx = pc * Fv, fy = -rc * Fv;   // below the CG: a forward push pitches the nose up, a push to the left rolls right
    _f[0] = fx; _f[1] = fy; _f[2] = 0; _r[0] = 0; _r[1] = 0; _r[2] = C.VANE_Z;
    body.F[0] += fx; body.F[1] += fy; cross(_r, _f, _m); body.M[0] += _m[0]; body.M[1] += _m[1]; body.M[2] += _m[2];
    body.M[2] += clamp((ctl.yaw ?? 0) - (sas ? 1.5 * w[2] : 0), -1, 1) * C.YAW_K * (Tt / (C.MASS * G));
    // airframe drag and damping
    const q0 = 0.5 * S.rho, [cx, cy, cz] = C.CD_A;
    body.F[0] -= q0 * cx * u * Math.abs(u); body.F[1] -= q0 * cy * v * Math.abs(v); body.F[2] -= q0 * cz * wz * Math.abs(wz);
    body.M[0] -= 60 * w[0]; body.M[1] -= 60 * w[1]; body.M[2] -= 120 * w[2];
    body.integrate(h, env, G);
    S.agl = body.agl; S.landed = body.landed;
    if (body.obstructed) { S.events.push('crash'); S.dead = 'collision'; }
    if (body.touch) { const t = body.touch; body.touch = null; S.events.push(t.vy < -5 ? 'crash' : 'land'); if (t.vy < -5) S.dead = 'crash'; }
    if (body.wet) { S.events.push('water'); S.dead = 'water'; }
    const a = S.attitude({}); if (body.contacts && Math.abs(a.roll) > 0.9) { S.events.push('crash'); S.dead = 'rollover'; }
  }
  return S;
}
