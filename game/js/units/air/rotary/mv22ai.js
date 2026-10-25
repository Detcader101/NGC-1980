// mv22ai.js - how the AI flies the MV-22: mission profile numbers for transportai.js and the adapter from guidance to
// the tiltrotor's controls (tiltpilot.js loops, a power ceiling, nacelles up and gear down for the landing, hands on
// the ground). Pure JS.
import { clamp } from './rb.js';

// Mission profile (INFERRED): cruise up to 230 kt in airplane mode when the leg allows it, 60 m over the terrain,
// 1.3 m/s2 deceleration (nacelles coming back up), a 7 deg approach to a 7 m hover, nacelles to 90 for the last 150 m.
export const MV22_AI = {
  cruise: 118, aDec: 1.1, stop: 0.8, glide: 7 * Math.PI / 180, flat: 22, hover: 7, agl: 60, clear: 20, kh: 0.4, vDesc: 4.5, vClimb: 7,
  hdgDist: 90, liftAgl: 8, spool: 3, kpos: 0.2,
};
export function flyMV22(S, P, st, cmd, dt, agl) {
  const c = P.ctl;
  if (cmd.ground) {
    P.reset(cmd.collFix ?? 0); P.nacT = 90;
    const k = Math.exp(-dt / 0.8);   // (ngc/bugsweep) stick and pedals wash out from where they were, as ch46ai.js
    c.tcl = cmd.collFix ?? 0; c.lon *= k; c.lat *= k; c.ped *= k; c.nac = cmd.fold ? 0 : 90; c.gear = 1; c.flap = 1;
    return c;
  }
  if (S.body.contacts >= 2) { P.i.lon = P.i.lat = P.i.th = P.i.ph = 0; P.i.tcl = Math.min(P.i.tcl, S.c.tcl + 0.04); }
  cmd.agl = agl;
  // close to the landing point: helicopter mode and gear down whatever the speed schedule says
  const near = cmd.dist !== undefined && cmd.dist < 160;
  if (near || (cmd.speed !== undefined && cmd.speed < 3)) { cmd.nac = Math.max(85, Math.min(95, 90 + (cmd.closing ?? 0) * 0)); cmd.gear = 1; } else { cmd.nac = undefined; cmd.gear = undefined; }
  const out = P.step(st, dt, cmd);
  // power ceiling in the helicopter regime: rotor power against the live engines' rating, and rotor droop (a pilot
  // on the torque and Nr gauges): no more thrust lever than they allow, no integrator wind-up
  const pw = (S.rR.power + S.rL.power) / (S.live * 6150 * 745.7 || 1);
  P.cMax = clamp((P.cMax ?? 1) + (0.96 - pw) * (pw > 0.96 ? 3 : 0.8) * dt, 0.3, 1);
  const lim = P.cMax;
  if (P.k > 0.5 && out.tcl > lim) { out.tcl = Math.max(0, lim); P.i.tcl = Math.min(P.i.tcl, out.tcl); }
  return out;
}
