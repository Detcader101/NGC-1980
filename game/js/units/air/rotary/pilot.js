// pilot.js - the AI's hands: a layered rotorcraft autopilot that flies the flight models through their controls, like
// a pilot would (no setting of positions or velocities). Pure JS.
//   guidance (mission AI) -> desired world velocity, vertical speed, heading
//   velocity loop         -> pitch / bank targets (tilt the lift vector for the acceleration wanted) + learned trim
//   attitude loop         -> cyclic (PD + integral trim), collective (vertical speed PI), pedals (yaw-rate PI)
// Gains come per aircraft (G). Sign conventions as the flight models: lon + = stick aft (nose up), lat + = right,
// ped + = right pedal (nose right), state from stateOf().
import { clamp, wrap, attitude } from './rb.js';

const _att = {};
// the state a pilot reads: world velocity, attitude (yaw three-style: + = left), body rates (FRD: p roll right, q pitch
// up, r yaw right), forward / right ground speeds in the heading frame
export function stateOf(body, out = {}) {
  attitude(body.q, _att);
  const y = _att.yaw, fx = -Math.sin(y), fz = -Math.cos(y);
  out.yaw = y; out.pitch = _att.pitch; out.roll = _att.roll;
  out.vx = body.vel[0]; out.vy = body.vel[1]; out.vz = body.vel[2];
  out.vf = out.vx * fx + out.vz * fz; out.vr = out.vx * -fz + out.vz * fx;   // forward, right
  out.p = body.w[0]; out.q = body.w[1]; out.r = body.w[2];
  out.x = body.pos[0]; out.y = body.pos[1]; out.z = body.pos[2];
  return out;
}

// G: { kv (1/s), aMax (m/s2), tilt (rad), th: [P, I, D], ph: [P, I, D], vz: [P, I], coll0, psi: [P (1/s), rMax], r: [P, I],
//      trimI (rad per m/s s), lonSign: 1 }
export function createPilot(G) {
  const P = {
    G, i: { lon: G.lon0 ?? 0, lat: 0, ped: G.ped0 ?? 0, coll: G.coll0, th: G.th0 ?? 0, ph: 0 },
    ctl: { coll: G.coll0, lon: 0, lat: 0, ped: 0 }, thT: 0, phT: 0, rT: 0,
    reset(coll = G.coll0) { Object.assign(P.i, { lon: G.lon0 ?? 0, lat: 0, ped: G.ped0 ?? 0, coll, th: G.th0 ?? 0, ph: 0 }); P.ctl.coll = coll; P.thT = P.phT = 0; },
    // cmd: { vx, vz: desired world ground velocity; vy: desired climb (m/s); hdg: desired yaw (three-style) or null = hold;
    //        ax, az: feed-forward acceleration; tilt: tilt limit override; collFix: hold the collective at a value }
    step(s, dt, cmd) {
      const c = P.ctl, I = P.i, g = 9.81, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
      // velocity loop in the heading frame
      const evx = (cmd.vx ?? 0) - s.vx, evz = (cmd.vz ?? 0) - s.vz;
      const ef = evx * fx + evz * fz, er = evx * -fz + evz * fx;
      const kv = cmd.kv ?? G.kv, aM = cmd.aMax ?? G.aMax;
      let af = clamp(ef * kv, -aM, aM) + ((cmd.ax ?? 0) * fx + (cmd.az ?? 0) * fz), ar = clamp(er * kv, -aM, aM) + ((cmd.ax ?? 0) * -fz + (cmd.az ?? 0) * fx);
      const tl = cmd.tilt ?? G.tilt;
      const tl0 = Math.max(0.25, G.tilt); I.th = clamp(I.th - ef * G.trimI * dt, -tl0, 0.25); I.ph = clamp(I.ph + er * G.trimI * dt, -0.15, 0.15);
      let thT = clamp(I.th - Math.atan(af / g), -tl, tl * 0.8), phT = clamp(I.ph + Math.atan(ar / g), -tl, tl);
      if (cmd.pitch !== undefined) thT = cmd.pitch;
      if (cmd.roll !== undefined) phT = cmd.roll;
      // attitude commands slew at a pilot's pace (G.rate rad/s), not in steps
      const sr = (G.rate ?? 0.15) * dt; P.thT += clamp(thT - P.thT, -sr, sr); P.phT += clamp(phT - P.phT, -2 * sr, 2 * sr);
      // attitude loops (PD + integral), output limited
      const eth = P.thT - s.pitch, eph = P.phT - s.roll;
      I.lon = clamp(I.lon + eth * G.th[1] * dt, -1, 1); I.lat = clamp(I.lat + eph * G.ph[1] * dt, -1, 1);
      c.lon = clamp(I.lon + eth * G.th[0] - s.q * G.th[2], -1, 1);
      c.lat = clamp(I.lat + eph * G.ph[0] - s.p * G.ph[2], -1, 1);
      // heading -> yaw rate -> pedals; with no heading given, coordinate (zero sideslip) in forward flight else hold
      let rT = 0;
      if (cmd.hdg !== undefined && cmd.hdg !== null) rT = clamp(-wrap(cmd.hdg - s.yaw) * G.psi[0], -G.psi[1], G.psi[1]);
      P.rT = rT;
      const er_ = rT - s.r; I.ped = clamp(I.ped + er_ * G.r[1] * dt, -1, 1); c.ped = clamp(I.ped + er_ * G.r[0], -1, 1);
      // collective: vertical speed PI
      if (cmd.collFix !== undefined) { c.coll = cmd.collFix; I.coll = cmd.collFix; }
      else { const ev = (cmd.vy ?? 0) - s.vy; I.coll = clamp(I.coll + ev * G.vz[1] * dt, 0, 1); c.coll = clamp(I.coll + ev * G.vz[0], 0, 1); }
      return c;
    },
  };
  return P;
}
