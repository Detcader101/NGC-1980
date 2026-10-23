// rb.js - rigid body for the AI rotorcraft (CH-46, MV-22, RW-3): 6-DOF in body axes, gear / skid contacts on the
// ground and on moving decks. Pure JS (no three.js, no DOM): runs in node for the benches.
//
// Frames (the same as hueyfm.js): the world is three.js style (x east, y up, z south); the airframe's quaternion q
// maps three-style body axes (x right, y up, nose along -z) to the world, so a mesh takes q as it is. The dynamics run
// in FRD body axes (x forward, y right, z down; p roll right, q pitch up, r yaw right) like the flight-test literature.
// Arrays are [x, y, z]. Every hot-path temporary is preallocated (no per-step garbage).
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// three body <-> FRD
export const toF = (v, o) => { const x = v[0], y = v[1], z = v[2]; o[0] = -z; o[1] = x; o[2] = -y; return o; };
export const fromF = (f, o) => { const x = f[0], y = f[1], z = f[2]; o[0] = y; o[1] = -z; o[2] = -x; return o; };
export const cross = (a, b, o) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; };
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = a => Math.hypot(a[0], a[1], a[2]);
// quaternion [x, y, z, w]
export function qrot(q, v, o) {   // o = q v q*
  const [qx, qy, qz, qw] = q, x = v[0], y = v[1], z = v[2];
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  o[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy; o[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz; o[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx; return o;
}
export function qinv(q, v, o) { const c = [-q[0], -q[1], -q[2], q[3]]; return qrot(c, v, o); }
export function qmul(a, b, o) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = ax * bw + aw * bx + ay * bz - az * by; o[1] = ay * bw + aw * by + az * bx - ax * bz; o[2] = az * bw + aw * bz + ax * by - ay * bx; o[3] = aw * bw - ax * bx - ay * by - az * bz; return o;
}
export function qnorm(q) { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= n; q[1] /= n; q[2] /= n; q[3] /= n; return q; }
// yaw (heading, rad, 0 = nose north = -z, + = turning left as in three.js rotation.y), pitch (+ nose up), roll (+ right wing down)
export function qFromYPR(yaw, pitch, roll, o = [0, 0, 0, 1]) {   // three.js Euler order 'YXZ' with x = pitch, z = -roll
  const c1 = Math.cos(yaw / 2), s1 = Math.sin(yaw / 2), c2 = Math.cos(pitch / 2), s2 = Math.sin(pitch / 2), c3 = Math.cos(-roll / 2), s3 = Math.sin(-roll / 2);
  o[0] = s2 * c1 * c3 + c2 * s1 * s3; o[1] = c2 * s1 * c3 - s2 * c1 * s3; o[2] = c2 * c1 * s3 - s2 * s1 * c3; o[3] = c2 * c1 * c3 + s2 * s1 * s3; return o;
}
const _a = [0, 0, 0], _b = [0, 0, 0], _F = [0, 0, -1], _R = [1, 0, 0];
// heading / pitch / roll from the quaternion: yaw like three's rotation.y (0 = nose to -z, + = left), pitch + nose up,
// roll + right wing down (measured against the horizontal right direction)
export function attitude(q, out = {}) {
  const f = qrot(q, _F, _a), r = qrot(q, _R, _b);
  out.yaw = Math.atan2(-f[0], -f[2]); out.pitch = Math.asin(clamp(f[1], -1, 1));
  const hl = Math.hypot(f[0], f[2]) || 1, rx = -f[2] / hl, rz = f[0] / hl;
  out.roll = Math.atan2(-r[1], r[0] * rx + r[2] * rz);
  return out;
}

// ------------------------------------------------------------------------------------------- body + gear
// P: { mass(), I: [Ixx, Iyy, Izz] (FRD, kg m2), gear: [{ at: [x, y, z] FRD m, k, c, mu, side }], strike(): optional }
// env: { groundY(x, z), water(x, z) -> bool, surfVel(x, z) -> { vx, vz, w, cx, cz } | null }
export function createBody(P) {
  const B = {
    pos: [0, 0, 0], vel: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0],   // w = FRD body rates (p, q, r)
    F: [0, 0, 0], M: [0, 0, 0],                                          // FRD force / moment accumulators (cleared by integrate)
    contacts: 0, load: 0, landed: false, agl: 0, touch: null, wet: false, gearDown: true, maxSink: 0,
    reset(pos, yaw = 0, onGround = true, env = null) {
      B.pos[0] = pos[0]; B.pos[1] = pos[1]; B.pos[2] = pos[2]; B.vel.fill(0); B.w.fill(0); qFromYPR(yaw, 0, 0, B.q);
      B.landed = onGround; B.touch = null; for (const s of slip) s[0] = s[1] = 0; wasDown = onGround;
      if (onGround && env) {   // stand on the gear at the highest ground below it
        let g = -1e9, low = 0;
        for (const G of P.gear) { B.worldPoint(G.at, _p); g = Math.max(g, env.groundY(_p[0], _p[2])); low = Math.max(low, G.at[2]); }
        B.pos[1] = g + low - 0.02; surfVel(env, B.pos[0], B.pos[2], B.vel); B.vel[1] = 0;
      }
    },
    worldPoint(fr, out = [0, 0, 0]) { fromF(fr, _t); qrot(B.q, _t, out); out[0] += B.pos[0]; out[1] += B.pos[1]; out[2] += B.pos[2]; return out; },
    worldDir(fr, out = [0, 0, 0]) { fromF(fr, _t); return qrot(B.q, _t, out); },
    bodyVel(out = [0, 0, 0]) { qinv(B.q, B.vel, _t); return toF(_t, out); },   // FRD velocity
    toBody(vw, out = [0, 0, 0]) { qinv(B.q, vw, _t); return toF(_t, out); },
    // integrate one substep: F, M (FRD) from the caller + gravity + gear; returns nothing, sets touch on touchdown
    integrate(h, env, g = 9.81) {
      const m = P.mass(), [Ixx, Iyy, Izz] = P.I;
      _Fw[0] = _Fw[1] = _Fw[2] = 0; _Tw[0] = _Tw[1] = _Tw[2] = 0;
      if (B.gearDown) gear(h, env, m); else B.contacts = 0;
      fromF(B.F, _t); qrot(B.q, _t, _f); _f[0] += _Fw[0]; _f[1] += _Fw[1] - m * g; _f[2] += _Fw[2];
      for (let i = 0; i < 3; i++) { B.vel[i] += _f[i] * h / m; B.pos[i] += B.vel[i] * h; }
      qinv(B.q, _Tw, _t); toF(_t, _r); B.M[0] += _r[0]; B.M[1] += _r[1]; B.M[2] += _r[2];
      const p = B.w[0], q = B.w[1], r = B.w[2];
      B.w[0] += (B.M[0] + (Iyy - Izz) * q * r) / Ixx * h;
      B.w[1] += (B.M[1] + (Izz - Ixx) * p * r) / Iyy * h;
      B.w[2] += (B.M[2] + (Ixx - Iyy) * p * q) / Izz * h;
      // rotate: body rates (FRD) -> three body axis, then q = q * dq
      fromF(B.w, _t); const ang = len(_t) * h;
      if (ang > 1e-12) { const s = Math.sin(ang / 2) / (len(_t) * h) * h; _dq[0] = _t[0] * s; _dq[1] = _t[1] * s; _dq[2] = _t[2] * s; _dq[3] = Math.cos(ang / 2); qmul(B.q, _dq, B.q); qnorm(B.q); }
      B.F[0] = B.F[1] = B.F[2] = 0; B.M[0] = B.M[1] = B.M[2] = 0;
    },
  };
  const _t = [0, 0, 0], _f = [0, 0, 0], _r = [0, 0, 0], _p = [0, 0, 0], _w = [0, 0, 0], _ow = [0, 0, 0], _sv = [0, 0, 0], _Fw = [0, 0, 0], _Tw = [0, 0, 0], _dq = [0, 0, 0, 1];
  const _fwd = [0, 0, 0], _lat = [0, 0, 0], _e = [0, 0, 0], _eb = [0, 0, 0], _c = [0, 0, 0];
  const slip = P.gear.map(() => [0, 0]); let wasDown = true, nsumPrev = 0;
  function surfVel(env, x, z, out) {
    const sv = env.surfVel ? env.surfVel(x, z) : null;
    if (!sv) { out[0] = out[1] = out[2] = 0; return out; }
    out[0] = sv.vx + sv.w * (z - sv.cz); out[1] = 0; out[2] = sv.vz - sv.w * (x - sv.cx); return out;
  }
  // the mass a push along d (world) at lever r (world) feels: 1 / (1/m + (r x d) . I^-1 (r x d)) - keeps the friction deadbeat
  function effMass(r, d, m) {
    cross(r, d, _e); qinv(B.q, _e, _c); toF(_c, _eb); const [Ixx, Iyy, Izz] = P.I;
    return 1 / (1 / m + _eb[0] * _eb[0] / Ixx + _eb[1] * _eb[1] / Iyy + _eb[2] * _eb[2] / Izz);
  }
  function gear(h, env, m) {
    fromF(B.w, _t); qrot(B.q, _t, _ow);                 // world angular velocity
    let n = 0, nsum = 0, first = null, gmin = 1e9; B.wet = false;
    qrot(B.q, [0, 0, -1], _fwd); _fwd[1] = 0; { const l = Math.hypot(_fwd[0], _fwd[2]) || 1; _fwd[0] /= l; _fwd[2] /= l; } _lat[0] = -_fwd[2]; _lat[1] = 0; _lat[2] = _fwd[0];
    for (let i = 0; i < P.gear.length; i++) {
      const G = P.gear[i];
      fromF(G.at, _t); qrot(B.q, _t, _r); _p[0] = _r[0] + B.pos[0]; _p[1] = _r[1] + B.pos[1]; _p[2] = _r[2] + B.pos[2];
      const gy = env.groundY(_p[0], _p[2]), pen = gy - _p[1]; if (-pen < gmin) gmin = -pen;
      if (pen <= 0) { slip[i][0] = slip[i][1] = 0; continue; }
      if (env.water && env.water(_p[0], _p[2])) B.wet = true;
      cross(_ow, _r, _w); _w[0] += B.vel[0] - surfVel(env, _p[0], _p[2], _sv)[0]; _w[1] += B.vel[1]; _w[2] += B.vel[2] - _sv[2];
      if (!first) first = { vy: _w[1], hs: Math.hypot(_w[0], _w[2]) };
      let N = G.k * Math.min(pen, 0.3) - G.c * _w[1] * (_w[1] < 0 ? 1 : 0.3) + (pen > 0.3 ? 40 * G.k * (pen - 0.3) : 0);
      N = Math.max(0, N); n++; nsum += N;
      // friction (brakes set / skids): deadbeat on the effective mass, shared by load, with a slip anchor so it holds still
      const vl = dot(_w, _fwd), vs = dot(_w, _lat), share = N / Math.max(N, nsumPrev, 1) * 0.5 / h;
      slip[i][0] += vl * h; slip[i][1] += vs * h;
      const fl = -(vl + slip[i][0] * 6) * effMass(_r, _fwd, m) * share, fs = -(vs + slip[i][1] * 6) * effMass(_r, _lat, m) * share, ml = G.mu * N, ms = (G.muS ?? G.mu) * N;
      if (Math.abs(fl) > ml) slip[i][0] = 0; if (Math.abs(fs) > ms) slip[i][1] = 0;
      const Fl = clamp(fl, -ml, ml), Fs = clamp(fs, -ms, ms);
      _f[0] = _fwd[0] * Fl + _lat[0] * Fs; _f[1] = N; _f[2] = _fwd[2] * Fl + _lat[2] * Fs;
      _Fw[0] += _f[0]; _Fw[1] += _f[1]; _Fw[2] += _f[2]; cross(_r, _f, _c); _Tw[0] += _c[0]; _Tw[1] += _c[1]; _Tw[2] += _c[2];
    }
    B.agl = Math.max(0, gmin); B.contacts = n; nsumPrev = nsum; B.load = nsum;
    if (n && !wasDown && first) { B.touch = first; if (-first.vy > B.maxSink) B.maxSink = -first.vy; }
    wasDown = n > 0;
    surfVel(env, B.pos[0], B.pos[2], _sv);
    B.landed = n >= 2 && nsum > 0.15 * m * 9.81 && Math.hypot(B.vel[0] - _sv[0], B.vel[1], B.vel[2] - _sv[2]) < 2;
  }
  return B;
}
