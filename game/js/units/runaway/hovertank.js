// RW-7 hover tank: ducted-fan air-cushion vehicle. Pure (no THREE, no DOM): runs in node and the browser.
//
// Frames: three.js world axes (y up); hull local axes: +x right, +y up, -z forward. Units SI.
//
// Physics (per 1/240 s substep), a rigid body with 6 degrees of freedom:
// - Four lift fans (one per corner, ducted, ~1.6 m) blow into four skirt CELLS (a segmented skirt, like a hovercraft's
//   bag-and-finger skirt split into quadrants). Each cell's plenum pressure follows from its fan curve and its
//   leakage under the skirt hem: fan  Q = Qmax * n * (1 - p / pmax);  leak  Q = perimeter * gap * Cd * sqrt(2 p / rho).
//   The pressure settles fast (first-order plenum lag); lift = p * area, pushing along the hull's up axis at the
//   cell centre. Lower a corner and its gap shrinks, its pressure rises and it pushes back: the cushion is a soft,
//   naturally damped spring that follows the terrain, with no "hover height" servo in the physics.
// - Skirt hem: when a cell's gap goes negative the skirt fingers compress against the ground (stiff spring + damper)
//   and drag (friction proportional to the contact load): grounding on a crest slows and spins the hull.
// - Thrust vectoring: louvres under the fans deflect the fan flow; up to VEC_MAX x weight of horizontal force in any
//   direction in the hull plane, plus yaw torque from differential vectoring. There is no grip: the hull slides,
//   so turns DRIFT (a hover tank corners like a hovercraft, nose and travel decouple).
// - Attitude: an active trim (per-fan speed) keeps the hull near level / slightly into the terrain; the heavy turret
//   off the centreline and the coilgun's recoil move it (weight shift), which the trim then works off.
// - Drag: air (0.5 rho Cd A v^2 per axis) + cushion momentum drag.
// - Damage via the hit-info contract (hit.js): hull plates, turret, fans (a dead fan drops its corner), skirt.
// All numbers are DESIGN values for a fictional vehicle, kept physically consistent (cushion pressure x area = weight).

import { normalizeHit, machineDamage } from './hit.js';

export const RW7 = {
  G: 9.81, RHO: 1.225,
  MASS: 16500,                  // kg
  L: 7.8, W: 3.9, HULL_H: 1.25, // m: hull length / width / height above the skirt hem line
  I: [26000, 105000, 92000],    // kg m^2 about x (pitch), y (yaw), z (roll)
  CELLS: [[-0.95, 1.9], [0.95, 1.9], [-0.95, -1.9], [0.95, -1.9]],   // cell centres (x, z) local: FL? see CELL_NAMES
  CELL_NAMES: ['rearL', 'rearR', 'frontL', 'frontR'],
  CELL_A: 6.4,                  // m^2 per cell (4 cells ~ 25.6 m^2 of cushion: ~6.3 kPa at full weight)
  CELL_PERIM: 10.2,             // m of skirt hem per cell (outer edges)
  CD_LEAK: 0.6,
  PMAX: 14000,                  // Pa fan stall pressure
  QMAX: 260,                    // m^3/s per fan at zero back-pressure (big ducted fans: the hem stands ~0.3 m clear)
  PLENUM_T: 0.03,               // s pressure lag
  GAP_T: 0.32,                  // m hem clearance the ride control holds
  SKIRT_Y: -0.55,               // skirt hem below the hull origin (origin = hull centre at the hem line + 0.55)
  SKIRT_K: 2.4e6, SKIRT_D: 1.6e5, SKIRT_MU: 0.45,
  VEC_MAX: 0.45,                // horizontal vectored force / weight (enough to hold and climb a 20° grade, barely)
  YAW_MAX: 0.75,                // rad/s commanded yaw-rate limit
  CDA: [7.5, 4.0, 18.0],        // drag area m^2: forward (x along -z), vertical, lateral
  TOP: 19,                      // m/s (~68 km/h) governed top speed
  TURRET_MASS: 3800, TURRET_Y: 1.0, TURRET_OFF: 0.55,   // turret CoM is 0.55 m forward of the ring centre
  RECOIL: 7200,                 // N s per coilgun shot (game value)
  ARMOUR: { front: 120, side: 60, rear: 40, top: 30, turret: 140, fan: 20, skirt: 5 },
  HP: { hull: 420, turret: 220, fan: 70, skirt: 60, weapon: 90, pd: 40 },
};
const R = RW7, G = R.G;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
// quaternion helpers ([x, y, z, w])
function qmul(a, b, o) { const x = a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], y = a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], z = a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], w = a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]; o[0] = x; o[1] = y; o[2] = z; o[3] = w; return o; }
function qrot(q, v, o) {   // rotate v by q
  const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  o[0] = ix * w + iw * -x + iy * -z - iz * -y; o[1] = iy * w + iw * -y + iz * -x - ix * -z; o[2] = iz * w + iw * -z + ix * -y - iy * -x; return o;
}
const qconj = q => [-q[0], -q[1], -q[2], q[3]];
function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l; return q; }
export function qFromYaw(y) { return [0, Math.sin(y / 2), 0, Math.cos(y / 2)]; }

export function createHoverTank(opt = {}) {
  const T = {
    id: opt.id ?? 0, side: 2, kind: 'hovertank',
    p: [0, 0, 0], v: [0, 0, 0], q: [0, 0, 0, 1], w: [0, 0, 0],   // w in body axes (x pitch, y yaw, z roll)
    vInt: [0, 0], fan: [1, 1, 1, 1], fanCmd: [1, 1, 1, 1], press: [0, 0, 0, 0], gap: [0.4, 0.4, 0.4, 0.4], gapRate: [0, 0, 0, 0], contact: [0, 0, 0, 0],
    turretYaw: 0, gunPitch: 0, turretTgt: 0, gunTgt: 0,
    hp: { ...R.HP }, fanHp: [R.HP.fan, R.HP.fan, R.HP.fan, R.HP.fan], alive: true, events: [], time: 0,
    lift: 1, speed: 0, drift: 0, vec: [0, 0], recoil: 0, charge: 1, pdCool: 0,
    stats: { minGap: 9, maxTilt: 0, scrape: 0 },
    // set down on the cushion at (x, z), hull parallel to the ground under it
    place(x, z, yaw, env) {
      const fx = -Math.sin(yaw) * 3, fz = -Math.cos(yaw) * 3, rx = Math.cos(yaw) * 1.8, rz = -Math.sin(yaw) * 1.8;
      const pt = Math.atan2(env.height(x + fx, z + fz) - env.height(x - fx, z - fz), 6), rl = Math.atan2(env.height(x - rx, z - rz) - env.height(x + rx, z + rz), 3.6);
      T.q = qmul(qmul(qFromYaw(yaw), [Math.sin(pt / 2), 0, 0, Math.cos(pt / 2)], [0, 0, 0, 1]), [0, 0, Math.sin(-rl / 2), Math.cos(rl / 2)], [0, 0, 0, 1]);
      T.p = [x, env.height(x, z) - R.SKIRT_Y + R.GAP_T, z]; T.v = [0, 0, 0]; T.w = [0, 0, 0]; T.vInt = [0, 0];
      T.press = [6300, 6300, 6300, 6300]; T.gap = [R.GAP_T, R.GAP_T, R.GAP_T, R.GAP_T]; T.gapRate = [0, 0, 0, 0]; return T;
    },
    get yaw() { const f = qrot(T.q, [0, 0, -1], [0, 0, 0]); return Math.atan2(-f[0], -f[2]); },
    up(o = [0, 0, 0]) { return qrot(T.q, [0, 1, 0], o); },
    forward(o = [0, 0, 0]) { return qrot(T.q, [0, 0, -1], o); },
    toWorld(l, o = [0, 0, 0]) { qrot(T.q, l, o); o[0] += T.p[0]; o[1] += T.p[1]; o[2] += T.p[2]; return o; },
    tilt() { const u = T.up(); return Math.acos(clamp(u[1], -1, 1)); },
    // the gun: muzzle and direction in world
    muzzle(o = [0, 0, 0]) { const c = Math.cos(T.turretYaw), s = Math.sin(T.turretYaw), cp = Math.cos(T.gunPitch), L = 5.2; return T.toWorld([-s * cp * L, R.TURRET_Y + 0.25 + Math.sin(T.gunPitch) * L, -c * cp * L], o); },
    gunDir(o = [0, 0, 0]) { const c = Math.cos(T.turretYaw), s = Math.sin(T.turretYaw), cp = Math.cos(T.gunPitch); return qrot(T.q, [-s * cp, Math.sin(T.gunPitch), -c * cp], o); },
    // fire the coilgun (the caller spawns the slug): recoil kicks the hull back and up at the turret
    fire() {
      if (T.charge < 1 || T.hp.weapon <= 0 || !T.alive) return false;
      T.charge = 0; const d = T.gunDir(); for (let k = 0; k < 3; k++) T.v[k] -= d[k] * R.RECOIL / R.MASS;
      // pitch kick from the turret height (body axes): rotate the impulse into the body frame
      const db = qrot(qconj(T.q), d, [0, 0, 0]), arm = R.TURRET_Y + 0.25;
      T.w[0] += -db[2] * R.RECOIL * arm / R.I[0] * -1; T.w[2] += db[0] * R.RECOIL * arm / R.I[2];
      T.events.push({ e: 'fire' }); return true;
    },
    hit(raw) {
      const h = normalizeHit(raw); if (!T.alive) return { dmg: 0 };
      // which face: from the impact direction in hull axes (or the given part)
      const db = qrot(qconj(T.q), [h.direction.x, h.direction.y, h.direction.z], [0, 0, 0]);
      let part = h.part;
      if (!part) part = db[1] < -0.6 ? 'top' : Math.abs(db[2]) > Math.abs(db[0]) ? (db[2] > 0 ? 'front' : 'rear') : 'side';
      if (part === 'top' && h.point && h.point.y > T.p[1] + 0.9) part = 'turret';
      const r = machineDamage(h, R.ARMOUR[part] ?? 60, null, 1 / 400);
      let dmg = r.dmg;
      if (part === 'turret') { T.hp.turret -= dmg; if (r.pen && Math.random() < 0.3) T.hp.weapon -= dmg; }
      else if (part === 'fan') { const i = raw.fan ?? 0; T.fanHp[i] = Math.max(0, T.fanHp[i] - dmg); }
      else T.hp.hull -= dmg;
      if (r.pen && (part === 'side' || part === 'rear')) { const i = Math.floor(Math.random() * 4); T.fanHp[i] = Math.max(0, T.fanHp[i] - dmg * 0.4); }
      for (let k = 0; k < 3; k++) T.v[k] += [h.direction.x, h.direction.y, h.direction.z][k] * h.impulse / R.MASS;
      if (T.hp.hull <= 0 || T.hp.turret <= 0) T.kill();
      T.events.push({ e: 'hit', part, dmg, pen: r.pen });
      return { part, dmg, pen: r.pen };
    },
    kill() { if (!T.alive) return; T.alive = false; T.events.push({ e: 'destroyed' }); },
    // cmd: { lift 0..1, fwd -1..1, strafe -1..1, yaw -1..1 (rate), turret: world yaw, gun: pitch }  or the autopilot:
    //      { vx, vz (desired world velocity), face (yaw) }
    step(dt, cmd, env) {
      T.events.length = 0;
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n; i++) sub(h, cmd, env);
      return T.events;
    },
  };
  const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0];

  function sub(h, cmd, env) {
    T.time += h; T.charge = Math.min(1, T.charge + h / 5.5); T.pdCool = Math.max(0, T.pdCool - h);
    const yaw = T.yaw;
    // ---- controls: the autopilot turns a desired velocity / heading into vectoring + yaw rate
    let fwd = cmd.fwd || 0, str = cmd.strafe || 0, yr = cmd.yaw || 0;
    const fwdW = T.forward([0, 0, 0]), rgtW = qrot(T.q, [1, 0, 0], [0, 0, 0]);
    if (cmd.vx !== undefined) {
      const ex = cmd.vx - T.v[0], ez = cmd.vz - T.v[2];
      // feed-forward the drag + a PD on the velocity error, into the hull plane
      // (PI: the integral holds station against a slope's pull or the turret's weight shift)
      T.vInt[0] = clamp(T.vInt[0] + ex * h * 0.6, -3, 3); T.vInt[1] = clamp(T.vInt[1] + ez * h * 0.6, -3, 3);
      const ax = clamp(ex * 0.9 + T.vInt[0], -5, 5), az = clamp(ez * 0.9 + T.vInt[1], -5, 5);
      fwd = (ax * fwdW[0] + az * fwdW[2]) / (R.VEC_MAX * G); str = (ax * rgtW[0] + az * rgtW[2]) / (R.VEC_MAX * G);
      const sp = Math.hypot(cmd.vx, cmd.vz), face = cmd.face ?? (sp > 1 ? Math.atan2(-cmd.vx, -cmd.vz) : yaw);
      yr = clamp(angDiff(yaw, face) * 1.6, -1, 1);
    }
    // vectoring is shared: forward + strafe can't exceed the louvre authority
    const vl = Math.hypot(fwd, str); if (vl > 1) { fwd /= vl; str /= vl; }
    T.vec[0] = fwd; T.vec[1] = str;
    const liftCmd = cmd.lift ?? 1;
    // ---- attitude trim: per-fan speed against pitch / roll error (and pitch rate / roll rate)
    const up = T.up(_c), f = fwdW;
    const pitch = Math.asin(clamp(f[1], -1, 1)), right = rgtW, roll = Math.asin(clamp(-right[1], -1, 1));   // pitch + nose up, roll + right down
    // targets: parallel to the ground under the hull (else one end's hem lifts clear and dumps its cushion), the nose
    // dipping a touch when accelerating
    const yawH = yaw, hfx = -Math.sin(yawH) * 3, hfz = -Math.cos(yawH) * 3, hrx = Math.cos(yawH) * 1.8, hrz = -Math.sin(yawH) * 1.8;
    const gP = Math.atan2(env.height(T.p[0] + hfx, T.p[2] + hfz) - env.height(T.p[0] - hfx, T.p[2] - hfz), 6);
    const gR = Math.atan2(env.height(T.p[0] - hrx, T.p[2] - hrz) - env.height(T.p[0] + hrx, T.p[2] + hrz), 3.6);
    const tp = clamp(gP * 0.9 - fwd * 0.04, -0.45, 0.45), tr = clamp(gR * 0.9, -0.45, 0.45);
    const ep = (pitch - tp) * 2.2 + T.w[0] * 0.55, er = (roll - tr) * 2.2 - T.w[2] * 0.55;
    for (let i = 0; i < 4; i++) {
      const [cx, cz] = R.CELLS[i], front = cz < 0 ? 1 : -1, rightSide = cx > 0 ? 1 : -1;
      // active ride control: each fan also works against its own cell's gap error and heave rate (a bare cushion is
      // a lightly damped spring; the machine damps it - and holds the hem ~0.32 m clear)
      const ride = 0.5 * (R.GAP_T - T.gap[i]) - 0.35 * T.gapRate[i];
      T.fanCmd[i] = clamp(liftCmd * (0.9 + ride - ep * front * 0.25 + er * rightSide * 0.25), 0, 1);
      const alive = T.fanHp[i] > 0 && T.alive ? 1 : 0;
      T.fan[i] += clamp(T.fanCmd[i] * alive - T.fan[i], -h / 0.15, h / 0.12);   // variable-pitch fan: quick response
    }
    // ---- forces (world) and moments (body)
    const F = [0, -R.MASS * G, 0], M = [0, 0, 0];
    const qi = qconj(T.q);
    const addAt = (fw, lp) => {   // force fw (world) at local point lp
      F[0] += fw[0]; F[1] += fw[1]; F[2] += fw[2];
      const fb = qrot(qi, fw, [0, 0, 0]);
      M[0] += lp[1] * fb[2] - lp[2] * fb[1]; M[1] += lp[2] * fb[0] - lp[0] * fb[2]; M[2] += lp[0] * fb[1] - lp[1] * fb[0];
    };
    T.lift = 0; let scrape = 0;
    for (let i = 0; i < 4; i++) {
      const [cx, cz] = R.CELLS[i], lp = [cx, R.SKIRT_Y, cz], wp = T.toWorld(lp, [0, 0, 0]);
      // gap: the hem's height over the ground, sampled over the cell (lowest point counts most)
      let g = 1e9; for (const [ox, oz] of [[0, 0], [0.8, 0.9], [-0.8, 0.9], [0.8, -0.9], [-0.8, -0.9]]) { const pp = T.toWorld([cx + ox, R.SKIRT_Y, cz + oz], _a); g = Math.min(g, pp[1] - env.height(pp[0], pp[2])); }
      const gw = wp[1] - env.height(wp[0], wp[2]); g = Math.min(g * 0.6 + gw * 0.4, gw);
      const gdot = clamp((g - T.gap[i]) / h, -6, 6); T.gapRate[i] += (gdot - T.gapRate[i]) * Math.min(1, h / 0.03);
      T.gap[i] = g; T.stats.minGap = Math.min(T.stats.minGap, g);
      // plenum pressure: equilibrium of fan curve and hem leakage, approached with a lag
      const n = T.fan[i], leakA = R.CELL_PERIM * Math.max(0.004, g) * R.CD_LEAK;
      // solve Qmax n (1 - p/pmax) = leakA sqrt(2p/rho) for p (monotonic: bisection on sqrt p)
      let lo = 0, hi = Math.sqrt(R.PMAX * Math.max(n, 1e-3));
      // (+ the cell's volume change: a closing gap pumps air into the plenum, an opening one draws it - the heave damping)
      const pump = R.CELL_A * T.gapRate[i] * 1.0;
      for (let it = 0; it < 18; it++) { const m = (lo + hi) / 2, p = m * m; if (R.QMAX * n * (1 - p / R.PMAX) > leakA * Math.sqrt(2 * p / R.RHO) + pump) lo = m; else hi = m; }
      if (pump < 0 && lo >= hi - 1e-6) lo = Math.sqrt(R.PMAX);
      const pe = lo * lo; T.press[i] += (pe - T.press[i]) * Math.min(1, h / R.PLENUM_T);
      const up = T.up(_b), L = T.press[i] * R.CELL_A;
      T.lift += L;
      addAt([up[0] * L, up[1] * L, up[2] * L], [cx, R.SKIRT_Y, cz]);
      // skirt contact (the hem fingers on the ground)
      T.contact[i] = 0;
      if (g < 0.05) {
        const pen = 0.05 - g, vel = pointVel([cx, R.SKIRT_Y, cz]), nrm = env.normal ? env.normal(wp[0], wp[2]) : [0, 1, 0];
        const vn = vel[0] * nrm[0] + vel[1] * nrm[1] + vel[2] * nrm[2];
        const N = Math.max(0, R.SKIRT_K * pen * pen * 8 - R.SKIRT_D * vn * Math.min(1, pen * 10));
        T.contact[i] = N; scrape += N;
        const vt = [vel[0] - vn * nrm[0], vel[1] - vn * nrm[1], vel[2] - vn * nrm[2]], vtl = Math.hypot(vt[0], vt[1], vt[2]) || 1;
        const fr = Math.min(R.SKIRT_MU * N, R.MASS * 0.25 * vtl / h * 0.1);
        addAt([nrm[0] * N - vt[0] / vtl * fr, nrm[1] * N - vt[1] / vtl * fr, nrm[2] * N - vt[2] / vtl * fr], [cx, R.SKIRT_Y, cz]);
      }
    }
    T.stats.scrape = scrape;
    // vectoring (needs fan flow: scales with the mean fan speed), in the hull plane; yaw torque from differential louvres
    const fl = (T.fan[0] + T.fan[1] + T.fan[2] + T.fan[3]) / 4, VF = R.VEC_MAX * R.MASS * G * fl;
    for (let k = 0; k < 3; k++) F[k] += (fwdW[k] * fwd + rgtW[k] * str) * VF;
    // yaw: rate command against the measured rate, torque-limited
    const yawRateCmd = yr * R.YAW_MAX, yawTorqMax = R.I[1] * 1.2 * fl;
    M[1] += clamp((yawRateCmd - T.w[1]) * R.I[1] * 3, -yawTorqMax, yawTorqMax);
    // turret weight shift: its CoM sits forward of the ring, so slewing it moves the load around the hull
    // (the hull's design CoM has the turret facing forward: only the deviation acts - traversed aft the nose lifts,
    // traversed right the right side sinks)
    const tm = R.TURRET_MASS * G * R.TURRET_OFF;
    M[0] += tm * (1 - Math.cos(T.turretYaw)); M[2] += tm * Math.sin(T.turretYaw);
    // drag (body axes): air + cushion momentum drag
    const vb = qrot(qi, T.v, [0, 0, 0]), q2 = 0.5 * R.RHO;
    const Db = [-Math.sign(vb[0]) * q2 * R.CDA[2] * vb[0] * vb[0] - vb[0] * 900, -Math.sign(vb[1]) * q2 * R.CDA[1] * vb[1] * vb[1] * 6, -Math.sign(vb[2]) * q2 * R.CDA[0] * vb[2] * vb[2] - vb[2] * 500];
    const Dw = qrot(T.q, Db, [0, 0, 0]); for (let k = 0; k < 3; k++) F[k] += Dw[k];
    // governor: louvres back off near the top speed
    const sp = Math.hypot(T.v[0], T.v[2]);
    if (sp > R.TOP) { const k = (sp - R.TOP) * R.MASS * 2; F[0] -= T.v[0] / sp * k; F[2] -= T.v[2] / sp * k; }
    // angular damping (aero + skirt), then integrate
    M[0] -= T.w[0] * 9000; M[1] -= T.w[1] * 18000; M[2] -= T.w[2] * 9000;
    for (let k = 0; k < 3; k++) { T.v[k] += F[k] / R.MASS * h; T.p[k] += T.v[k] * h; }
    for (let k = 0; k < 3; k++) T.w[k] += M[k] / R.I[k] * h;
    const dq = [T.w[0] * h / 2, T.w[1] * h / 2, T.w[2] * h / 2, 1]; qmul(T.q, dq, T.q); qnorm(T.q);
    // the hull can't go through the ground (hard stop under the hem, in case the skirt springs are overrun)
    const gy = env.height(T.p[0], T.p[2]); if (T.p[1] < gy + 0.25) { T.p[1] = gy + 0.25; if (T.v[1] < 0) T.v[1] = 0; }
    // turret / gun slew
    if (cmd.turret !== undefined) T.turretTgt = angDiff(yaw, cmd.turret);
    if (cmd.gun !== undefined) T.gunTgt = clamp(cmd.gun, -0.12, 0.35);
    T.turretYaw += clamp(angDiff(T.turretYaw, T.turretTgt), -0.9 * h, 0.9 * h);
    T.gunPitch += clamp(T.gunTgt - T.gunPitch, -0.5 * h, 0.5 * h);
    // telemetry
    T.speed = sp; const vbn = qrot(qi, T.v, _a); T.drift = sp > 1 ? Math.atan2(vbn[0], -vbn[2]) : 0;
    T.stats.maxTilt = Math.max(T.stats.maxTilt, T.tilt());
    if (!T.alive) for (let i = 0; i < 4; i++) T.fanHp[i] = Math.max(0, T.fanHp[i] - h * 40);
  }
  function pointVel(lp) {   // world velocity of a local point
    const wb = T.w, cr = [wb[1] * lp[2] - wb[2] * lp[1], wb[2] * lp[0] - wb[0] * lp[2], wb[0] * lp[1] - wb[1] * lp[0]];
    const cw = qrot(T.q, cr, [0, 0, 0]); return [T.v[0] + cw[0], T.v[1] + cw[1], T.v[2] + cw[2]];
  }
  T.pointVel = pointVel;
  return T;
}
