// Fixed-wing flight model for the dropship: a rigid body with thrust, lift (with a stall past the critical angle of
// attack), drag (parasite + induced + sideslip), a side force, and pitch / roll / yaw dynamics from the controls,
// static stability (angle of attack, weathervane, dihedral) and damping - all scaled by dynamic pressure, so it gets
// mushy when slow and stalls if you pull too hard. Body frame like everything else: nose -z, up +y, right +x.
// Plus an autopilot that flies it with the same stick inputs a pilot would use.
import * as THREE from 'three';

export const PLANE = {
  KL: 0.0098, CL0: 0.25, CLA: 4.5, A_STALL: 0.22, CD0: 0.032, KI: 0.055, THRUST: 2.6, G: 9.8,
  PITCH: 1.7, ROLL: 2.2, YAW: 0.9, M_ALPHA: 6, A_TRIM: 0.03, N_BETA: 3.2, DIHEDRAL: 1.0,
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

export function createPlaneSim() {
  const P = PLANE;
  const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _vb = new THREE.Vector3(), _a = new THREE.Vector3(), _l = new THREE.Vector3();
  const _qi = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _ax = new THREE.Vector3();
  const s = {
    p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
    thr: 0.5, engines: 1, V: 0, alpha: 0, beta: 0, stall: false, ap: { I: 0, It: 0 },
    reset(p, yaw, speed) {
      s.p.copy(p); s.q.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ')); s.w.set(0, 0, 0);
      s.v.set(-Math.sin(yaw) * speed, 0, -Math.cos(yaw) * speed); s.thr = 0.45; s.ap.I = 0.05; s.ap.It = 0;
    },
    forward(o = _f) { return o.set(0, 0, -1).applyQuaternion(s.q); },
    up(o = _u) { return o.set(0, 1, 0).applyQuaternion(s.q); },
    right(o = _r) { return o.set(1, 0, 0).applyQuaternion(s.q); },
    get heading() { const f = s.forward(); return Math.atan2(-f.x, -f.z); },   // yaw: 0 = -z, turning right decreases it
    get bank() { return Math.asin(clamp(-s.right().y, -1, 1)); },              // + = right wing down
    get pitch() { return Math.asin(clamp(s.forward().y, -1, 1)); },
    // c = { roll, pitch, yaw, thr }: stick right / back / right pedal positive, throttle 0..1
    step(dt, c) {
      s.thr += (clamp(c.thr, 0, 1) - s.thr) * (1 - Math.exp(-1.5 * dt));   // engines spool
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      for (let i = 0; i < n; i++) sub(h, c);
    },
  };
  function sub(dt, c) {
    const V = Math.max(0.1, s.v.length()); s.V = V;
    _qi.copy(s.q).invert(); _vb.copy(s.v).applyQuaternion(_qi);
    s.alpha = Math.atan2(-_vb.y, -_vb.z); s.beta = Math.asin(clamp(_vb.x / V, -1, 1));
    const a = s.alpha, aa = Math.abs(a);
    s.stall = aa > P.A_STALL;
    const CL = !s.stall ? P.CL0 + P.CLA * a : Math.sign(a) * Math.max(0.45, P.CL0 + P.CLA * P.A_STALL - (aa - P.A_STALL) * 3);
    const qd = V * V, f = s.forward(), u = s.up(), r = s.right();
    _l.copy(s.v).multiplyScalar(1 / V);                                      // velocity direction
    _a.copy(u).addScaledVector(_l, -u.dot(_l)).normalize();                  // lift: square to the airflow, in the wings' up plane
    const lift = P.KL * qd * CL, drag = P.KL * qd * (P.CD0 + P.KI * CL * CL + 0.4 * s.beta * s.beta + (s.stall ? 0.08 : 0));
    _a.multiplyScalar(lift).addScaledVector(_l, -drag).addScaledVector(r, -0.004 * qd * s.beta).addScaledVector(f, P.THRUST * s.thr * s.engines);
    _a.y -= P.G;
    s.v.addScaledVector(_a, dt); s.p.addScaledVector(s.v, dt);
    // rotation: control power and stability go with dynamic pressure, damping with airspeed
    const k = clamp(qd / 2500, 0, 2.5), kd = Math.sqrt(k);
    s.w.x += (P.PITCH * c.pitch * k - 2.4 * s.w.x * kd - P.M_ALPHA * (a - P.A_TRIM) * k - (s.stall ? 0.8 * k : 0)) * dt;
    s.w.z += (-P.ROLL * c.roll * k - 2.6 * s.w.z * kd + P.DIHEDRAL * s.beta * k + (c.wobble || 0)) * dt;
    s.w.y += (-P.YAW * c.yaw * k - 1.6 * s.w.y * kd - P.N_BETA * s.beta * k) * dt;
    const wl = s.w.length();
    if (wl > 1e-6) { _dq.setFromAxisAngle(_ax.copy(s.w).multiplyScalar(1 / wl), wl * dt); s.q.multiply(_dq).normalize(); }
  }
  // Autopilot: fly to (tx, tz) at height alt and airspeed spd, through the same stick a pilot uses.
  s.autopilot = (dt, tx, tz, alt, spd) => {
    const e = angDiff(s.heading, Math.atan2(-(tx - s.p.x), -(tz - s.p.z)));
    const bankWant = clamp(-e * 1.5, -0.5, 0.5), bank = s.bank;
    const roll = clamp((bankWant - bank) * 2.2 + s.w.z * 0.9, -1, 1);
    const vyWant = clamp((alt - s.p.y) * 0.3, -7, 7), ev = vyWant - s.v.y;
    s.ap.I = clamp(s.ap.I + ev * 0.04 * dt, -0.5, 0.8);
    const pitch = clamp(s.ap.I + ev * 0.15 - s.w.x * 0.5 + 0.25 * (1 / Math.max(0.5, Math.cos(bank)) - 1), -1, 1);
    s.ap.It = clamp(s.ap.It + (spd - s.V) * 0.01 * dt, -0.3, 0.4);
    const thr = clamp(0.42 + (spd - s.V) * 0.08 + s.ap.It, 0, 1);
    return { roll, pitch, yaw: clamp(s.beta * 3, -1, 1), thr };
  };
  return s;
}
