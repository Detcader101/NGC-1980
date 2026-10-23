// ch46ai.js - how the AI flies the CH-46: mission profile numbers for transportai.js and the adapter from guidance
// to the tandem's controls (pilot.js loops, torque limiting, hands on the ground). Pure JS.
import { clamp } from './rb.js';

// Mission profile (INFERRED, typical HMM assault profile scaled to a 1.3 km war zone): cruise 90 kt, 50 m above the
// terrain, 1.2 m/s2 deceleration (a ~7 deg nose-up flare), 7 deg approach to a 6 m hover, vertical descent.
export const CH46_AI = {
  cruise: 46, aDec: 1.2, stop: 0.6, glide: 7 * Math.PI / 180, flat: 18, hover: 6, agl: 45, clear: 18, kh: 0.45, vDesc: 4, vClimb: 6,
  hdgDist: 70, liftAgl: 7, spool: 2.5,
};
// guidance cmd -> controls. On the ground: collective as asked, stick and pedals centred, the loops' memory reset.
// In the air: pilot.js, with the torque held under the transmission limit (a pilot watches the torque gauge).
export function flyCH46(S, P, st, cmd, dt) {
  if (cmd.ground) {
    P.i.lon = P.i.lat = P.i.ped = 0; P.i.th = P.i.ph = 0; P.i.coll = cmd.collFix ?? 0;
    // (ngc/bugsweep) the cyclic and pedals wash out from where they were flying instead of snapping to neutral: a
    // snap with the rotor still carrying the weight tilted the thrust and dragged the wheels sideways on touchdown
    const k = Math.exp(-dt / 0.8); P.ctl.lon *= k; P.ctl.lat *= k; P.ctl.ped *= k;
    return { coll: cmd.collFix ?? 0, lon: P.ctl.lon, lat: P.ctl.lat, ped: P.ctl.ped };
  }
  if (S.body.contacts >= 2) {   // light on the wheels: no trim wind-up against the gear, pull pitch smoothly
    P.i.lon = P.i.lat = P.i.th = P.i.ph = 0; P.i.coll = Math.min(P.i.coll, S.c.coll + 0.04);
  }
  const c = P.step(st, dt, cmd);
  // torque limiting: a collective ceiling that follows the rotor power against the transmission limit smoothly (the pilot
  // on the torque gauge; rotor power, not the needle, so a passing rpm droop doesn't make it pump), no integrator wind-up
  const pw = (S.rf.power + S.ra.power) / S.xmsn;
  P.cMax = clamp((P.cMax ?? 1) + (0.96 - pw) * (pw > 0.96 ? 2.5 : 0.8) * dt, 0.25, 1);
  if (c.coll > P.cMax) { c.coll = P.cMax; P.i.coll = Math.min(P.i.coll, P.cMax); }
  return c;
}
