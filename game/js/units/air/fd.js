// Flight director: the AI pilot's hands. It flies an airframe sim (units/air/airframe.js) only through the stick,
// pedals and throttles a human would use: inner loops for g, bank and speed, and "lift vector" guidance that turns a
// wanted direction of flight into a bank angle and a g. Behaviours (pilot.js) sit on top. Pure; runs in node.
//
// Inner loops by control law:
//   'ndi' (Hornet, SHRIKE): the stick already commands g and roll rate, so the stick is the inverse of the CAS schedule
//         plus a slow integral.
//   'sas' (Tomcat, Reaper): the stick moves the stabilator; a PI on g with pitch-rate damping, gains scheduled with
//         dynamic pressure the way the feel system scales the stick (g per stick is ~constant above q0, ~q below).
// The pilot respects the airframe: g limit, AoA (and for the TF30, no deep-AoA pulls at full power), throttle rate.
import * as THREE from 'three';
import { sasGearing } from './airframe.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _e = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function createFD(A, o = {}) {
  const P = A.P, law = P.fcs.law, NE = A.eng.length, GRAV = o.grav || 9;
  const FD = {
    A, law,
    ctl: { pitch: 0, roll: 0, yaw: 0, throttle: Array(NE).fill(0), brakeL: 0, brakeR: 0 },
    gmax: o.gmax ?? (law === 'ndi' ? P.fcs.nmax : 6.5), gmin: o.gmin ?? -1.5, amax: o.amax ?? (law === 'ndi' ? 0.6 : 0.36),
    thrRate: o.thrRate ?? (law === 'sas' ? 0.6 : 2), gi: 0, ti: 0.6, thr: 0.6, bankCmd: 0, nzCmd: 1, abOk: true,
    // ------------------------------------------------------------------ inner loops
    // pitch stick for a normal load factor n (g)
    pitchFor(n, dt) {
      const att = A.attitude(), cth = Math.cos(att.pitch);
      if (A.onGround) return 0;
      if (law === 'ndi') {
        const F = P.fcs, pa = A.pa, nmax = pa ? F.nmaxPA : F.nmax, nmin = pa ? F.nminPA : F.nmin;
        FD.gi = clamp(FD.gi + (n - A.nz) * 0.15 * dt, -0.3, 0.3);
        const nn = n + FD.gi;
        return clamp(nn >= cth ? (nn - cth) / (nmax - cth) : (nn - cth) / (cth - nmin), -1, 1);
      }
      // SAS: the pilot knows his aeroplane: the AoA this g needs, the stabilator that trims that AoA (the trim curve),
      // then a pull of AoA onto it with pitch-rate damping, and a slow integral on the g error. Inverted through the
      // stick gearing and the pitch damper to a stick position.
      const F = P.fcs, K = P.aeroAt ? P.aeroAt(A) : P.aero, V = Math.max(A.tas, 15), qb = Math.max(A.qbar, 0.5 * A.rho * 225), C = P.C;
      FD.gi = clamp(FD.gi + (n - A.nz) * 0.03 * dt, -0.06, 0.06);
      const dcl = K.DCL_FLAP * A.surf.flap + K.DCL_LEF * A.surf.lef, clReq = (n * A.mass * GRAV - A.totalThrust() * Math.sin(A.alpha)) / (qb * P.S);
      const aReq = clamp((clReq - K.CL0 - dcl) / K.CLA + FD.gi, -0.2, FD.amax);
      const qss = clamp((n - cth * Math.cos(att.roll)) * GRAV / V, -1.2, 1.2);
      const deSS = -(K.CM0 + K.CMA * Math.sin(aReq) + K.CMQ * qss * C / (2 * V) - 0.05 * A.surf.flap + 0.004 * A.gear + 0.01 * A.surf.brake) / K.CMDE;
      const kq = clamp(12000 / qb, 0.6, 4), de = deSS + 0.9 * kq * (aReq - A.alpha) - 0.3 * kq * (A.w.y - qss);
      const g = sasGearing(F, A.qbar);
      return clamp((de - (A.trim || 0) - F.kq * A.w.y * g) / (K.LIM.stab * g), -1, 1);
    },
    // roll stick for a bank angle phi (rad, + right)
    rollFor(phi) {
      const att = A.attitude(), err = wrap(phi - att.roll);
      const kp = law === 'ndi' ? 1.6 : 2.4, kd = law === 'ndi' ? 0.25 : 0.45;
      return clamp(err * kp - A.w.x * kd, -1, 1);
    },
    // throttle for an equivalent airspeed (m/s); ab: may it use afterburner
    throttleFor(eas, dt, ab = true) {
      const e = eas - A.eas, top = ab && FD.abOk ? 1 : 0.8;
      FD.ti = clamp(FD.ti + e * 0.012 * dt, 0, top);
      const want = clamp(FD.ti + e * 0.03, 0, top);
      FD.thr += clamp(want - FD.thr, -FD.thrRate * dt, FD.thrRate * dt);
      return FD.thr;
    },
    setThrottle(t) { for (let k = 0; k < NE; k++) FD.ctl.throttle[k] = A.eng[k].stalled ? 0 : t; },   // a stalled TF30: idle that one
    // ------------------------------------------------------------------ guidance
    // fly so the velocity turns toward direction d (unit, world): lift-vector pointing. k: turn-rate gain (1/s)
    steer(d, dt, { gmax = FD.gmax, k = 1.6, eas = null, ab = true, coord = true, push = true } = {}) {
      const V = Math.max(A.tas, 1); _v.copy(A.vel).divideScalar(V);
      const c = clamp(_v.dot(d), -1, 1), ang = Math.acos(c);
      _e.copy(d).addScaledVector(_v, -c);
      if (_e.lengthSq() < 1e-8) _e.copy(A.up(_u)).addScaledVector(_v, -_v.dot(_u));
      _e.normalize();
      const nAvail = Math.max(1, Math.min(gmax, A.qbar * P.S * 1.1 / (A.mass * GRAV)));   // what the wing can give now
      const w = Math.min(ang * k, GRAV * Math.sqrt(Math.max(0.3, nAvail * nAvail - 1)) / V);   // turn rate wanted (what is left of the g after holding up the weight)
      // specific force the lift must give: the turn plus holding up against gravity (perpendicular to the path)
      _f.copy(_e).multiplyScalar(w * V); _f.y += GRAV; _f.addScaledVector(_v, -_v.dot(_f));
      let n = _f.length() / GRAV;
      // bank: angle of that force about the velocity, measured from the "up" side of the horizon
      _u.copy(UP).addScaledVector(_v, -_v.y); if (_u.lengthSq() < 1e-6) _u.copy(A.up(_r)); _u.normalize();
      _r.crossVectors(_v, _u).normalize();   // right of the path
      let phi = Math.atan2(_f.dot(_r), _f.dot(_u));
      if (push && Math.abs(phi) > 2.1 && n < 2.2) { phi = wrap(phi + Math.PI); n = -Math.min(n, -FD.gmin); }   // push rather than roll inverted for small corrections
      const bankErr = Math.abs(wrap(phi - A.attitude().roll));
      if (bankErr > 0.6 && n > 1.5) n = Math.max(Math.cos(A.attitude().pitch), n * clamp(1.4 - bankErr, 0.25, 1));   // roll first, then pull
      FD.bankCmd = phi; FD.nzCmd = clamp(n, FD.gmin, gmax);
      FD.ctl.roll = FD.rollFor(phi); FD.ctl.pitch = FD.pitchFor(FD.nzCmd, dt);
      FD.ctl.yaw = law === 'ndi' ? 0 : clamp(A.beta * 3, -0.6, 0.6);   // keep the ball in the middle
      if (eas !== null) FD.setThrottle(FD.throttleFor(eas, dt, ab));
      return ang;
    },
    // direction toward a world point, with a climb / dive angle limit
    dirTo(x, y, z, out = _d, maxGam = 0.5) {
      out.set(x - A.pos.x, y - A.pos.y, z - A.pos.z); const hz = Math.hypot(out.x, out.z) || 1;
      const gam = clamp(Math.atan2(out.y, hz), -maxGam, maxGam);
      out.set(out.x / hz * Math.cos(gam), Math.sin(gam), out.z / hz * Math.cos(gam)); return out;
    },
    // direction for heading (rad, 0 = -z, + toward +x) and climb angle
    dirHdg(hdg, gam, out = _d) { return out.set(Math.sin(hdg) * Math.cos(gam), Math.sin(gam), -Math.cos(hdg) * Math.cos(gam)); },
    // wings level, hold a pitch attitude-ish (used on the cat stroke, take-off)
    wingsLevel(n, dt) { FD.ctl.roll = FD.rollFor(0); FD.ctl.pitch = FD.pitchFor(n, dt); FD.ctl.yaw = law === 'ndi' ? 0 : clamp(A.beta * 3, -0.6, 0.6); },
    reset() { FD.gi = 0; FD.ti = 0.6; FD.thr = 0.6; },
  };
  return FD;
}
