// tiltpilot.js - the AI's hands on a tiltrotor (MV-22): the same guidance as the helicopters (desired world velocity,
// climb rate, heading), flown in three regimes that blend with the nacelle angle:
//   helicopter (nacelles 85-97.5): speed by pitch attitude, height by the thrust lever (collective) - like pilot.js;
//   airplane   (nacelles 0-55):    speed by the thrust lever, climb by pitch (flight path + learned angle of attack),
//                                  turns by banking to the heading, pedals keep the ball in the middle;
//   conversion (between):         a weighted mix, while the nacelle schedule follows the wanted speed.
// The nacelle command follows a schedule of the wanted airspeed and is held inside the conversion corridor at the
// present airspeed (never lower the nacelles faster than the wing can take over, never raise them past the limit).
// Gear goes up above 70 kt with height, down for the approach. Pure JS.
import { clamp, wrap, sstep, attitude } from './rb.js';

const D2R = Math.PI / 180, KT = 1.94384;
// nacelle angle (deg) for a wanted airspeed (kt): helicopter at the hover, conversion through ~60-140 kt, airplane above
// (as a fraction of the flapped wing stall speed at the present weight: the wing takes the load as the nacelles come down)
const SCHED = [[0, 90], [0.25, 87], [0.55, 82], [0.8, 78], [1.0, 74], [1.12, 60], [1.22, 35], [1.3, 12], [1.36, 0]];
const lerpT = (T, x) => { if (x <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [x0, y0] = T[i - 1], [x1, y1] = T[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return T[T.length - 1][1]; };
export const nacFor = (kt, vs = 150) => lerpT(SCHED, kt / vs);

// G: helicopter gains as pilot.js + { air: { kv, ki, aoaI, bank, kb } }
export function createTiltPilot(G, sim) {
  const A = G.air || { kv: 0.05, ki: 0.012, aoaI: 0.008, kvy: 1.6, bank: 0.55, kb: 1.3 };
  const P = {
    i: { lon: 0, lat: 0, ped: 0, tcl: G.coll0, th: 0, ph: 0, aoa: 0.05, tclA: 0.5 }, thT: 0, phT: 0, nacT: 90, k: 1,
    ctl: { tcl: 0, lon: 0, lat: 0, ped: 0, nac: 90, gear: 1, flap: 1 },
    reset(tcl = 0) { Object.assign(P.i, { lon: 0, lat: 0, ped: 0, tcl, th: 0, ph: 0, aoa: 0.05, tclA: tcl }); P.thT = P.phT = 0; P.nacT = sim.nac / D2R; },
    step(s, dt, cmd) {
      const c = P.ctl, I = P.i, g = 9.81, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
      const V = Math.hypot(s.vx, s.vz), ias = sim.ias, nac = sim.nac / D2R;
      // ---- the velocity error and the acceleration it asks for (heading frame)
      const evx = (cmd.vx ?? 0) - s.vx, evz = (cmd.vz ?? 0) - s.vz, ef = evx * fx + evz * fz, er = evx * -fz + evz * fx;
      const af = clamp(ef * G.kv, -G.aMax, G.aMax) + ((cmd.ax ?? 0) * fx + (cmd.az ?? 0) * fz), ar = clamp(er * G.kv, -G.aMax, G.aMax) + ((cmd.ax ?? 0) * -fz + (cmd.az ?? 0) * fx);   // (ngc/bugsweep: + the sideways feed-forward, as pilot.js: a turning deck spot)
      // ---- nacelles: a tiltrotor pilot accelerates and slows with the nacelle thumbwheel, attitude near level: the
      // schedule for the present airspeed plus a lead from the acceleration wanted, held inside the corridor
      // (slowing down from airplane mode: on power first - the nacelles only lead the slowdown once below 1.15 Vs)
      const decLead = ias > 1.15 * sim.vStall ? -6 : -45;
      const want = cmd.nac ?? nacFor(Math.max(0, ias + clamp(af * 20, decLead, 45)), sim.vStall);
      const cor = n => sim.corridor(n);
      let lo = 0; while (lo < 90 && cor(lo).min > ias - 8) lo += 2;                 // lowest nacelle the airspeed supports (8 kt margin)
      let hi = 97.5; while (hi > 0 && cor(hi).max < ias + 8) hi -= 2;               // highest the airspeed allows
      P.nacT = clamp(want, lo, Math.max(lo, hi)); c.nac = P.nacT;
      // 1 = helicopter loops, 0 = airplane loops: by nacelle angle, but helicopter-style until the wing can carry it
      const k = P.k = Math.max(sstep(55, 85, nac), 1 - sstep(1.0 * sim.vStall, 1.22 * sim.vStall, ias));
      // ---- helicopter: velocity -> attitude (as pilot.js) but less and less pitch as the nacelles take over the
      // speed (near level by 70 deg), climb -> thrust lever
      const kt_ = sstep(70, 88, nac), tl = 0.06 + (G.tilt - 0.06) * kt_;
      // the pitch trim works on the speed while the rotors lift (nacelles up), on the climb (wing angle of attack) as
      // the nacelles come down and the wing takes the weight
      const evy = (cmd.vy ?? 0) - s.vy;
      if (k >= 0.5) { I.th = clamp(I.th + (-ef * G.trimI * kt_ + evy / Math.max(20, V) * A.aoaI * 20 * (1 - kt_)) * dt, -0.25 * kt_ - 0.05, 0.25 * kt_ + 0.2 * (1 - kt_) + 0.06); I.ph = clamp(I.ph + er * G.trimI * dt, -0.15, 0.15); }   // one set of integrators in charge at a time
      const thH = clamp(I.th - Math.atan(af / g) * kt_ + (1 - kt_) * A.kvy * evy / Math.max(25, V), -tl - 0.05 * (1 - kt_), Math.max(tl * 0.8 + 0.04, I.th + 0.05)), phH = clamp(I.ph + Math.atan(ar / g), -G.tilt, G.tilt);
      if (k >= 0.5) I.tcl = clamp(I.tcl + evy * G.vz[1] * dt, 0, 1);
      const tclH = clamp(I.tcl + evy * G.vz[0], 0, 1);
      // ---- airplane: speed -> thrust lever, climb -> pitch (flight path + angle of attack), heading -> bank
      const Vd = Math.max(0, (cmd.vx ?? 0) * fx + (cmd.vz ?? 0) * fz), ev = Vd - V;
      if (k < 0.5) { I.tclA = clamp(I.tclA + ev * A.ki * dt, 0, 1); I.aoa = clamp(I.aoa + evy / Math.max(20, V) * A.aoaI * 20 * dt, -0.1, 0.22); }
      const tclA = clamp(I.tclA + ev * A.kv, 0, 1), gam = Math.atan2(cmd.vy ?? 0, Math.max(20, V));
      const thA = clamp(I.aoa + gam + A.kvy * evy / Math.max(25, V), -0.3, 0.35);   // + a flight-path damping term
      const he = wrap((cmd.hdg ?? s.yaw) - s.yaw), phA = clamp(-he * A.kb, -A.bank, A.bank);
      // bumpless: the loops not in charge track what the aircraft is doing
      if (k > 0.5) { I.tclA = c.tcl; I.aoa = clamp(s.pitch - gam, -0.1, 0.22); } else { I.tcl = c.tcl; I.th = clamp(s.pitch, -0.25, 0.25); }
      // ---- blend, attitude loops
      const sr = (G.rate ?? 0.15) * dt;
      let thT = k * thH + (1 - k) * thA, phT = k * phH + (1 - k) * phA;
      if (cmd.pitch !== undefined) thT = cmd.pitch;
      P.thT += clamp(thT - P.thT, -sr, sr); P.phT += clamp(phT - P.phT, -2 * sr, 2 * sr);
      const eth = P.thT - s.pitch, eph = P.phT - s.roll;
      I.lon = clamp(I.lon + eth * G.th[1] * dt, -1, 1); I.lat = clamp(I.lat + eph * G.ph[1] * dt, -1, 1);
      c.lon = clamp(I.lon + eth * G.th[0] - s.q * G.th[2], -1, 1);
      c.lat = clamp(I.lat + eph * G.ph[0] - s.p * G.ph[2], -1, 1);
      // yaw: heading in the hover, zero sideslip in forward flight
      const rT = k * clamp(-he * G.psi[0], -G.psi[1], G.psi[1]) + (1 - k) * (-sim.beta * 2.5 + clamp(phT * 0.0, 0, 0));
      const er_ = rT - s.r * (k + (1 - k) * 0.4); I.ped = clamp(I.ped + er_ * G.r[1] * dt, -1, 1); c.ped = clamp(I.ped + er_ * G.r[0], -1, 1);
      c.tcl = cmd.collFix !== undefined ? cmd.collFix : clamp(k * tclH + (1 - k) * tclA, 0, 1);
      // gear and flaps
      if (cmd.gear !== undefined) c.gear = cmd.gear; else if (ias > 75 && (cmd.agl ?? 99) > 25) c.gear = 0; else if (ias < 55) c.gear = 1;
      c.flap = ias > 1.38 * sim.vStall ? 0 : ias < 1.28 * sim.vStall ? 1 : c.flap;   // flaperons up once the clean wing has margin
      return c;
    },
  };
  return P;
}
export { attitude };
