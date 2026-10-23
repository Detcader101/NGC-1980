// RW-1 STRIDER: the RUNAWAY's bipedal machine soldier. Locomotion + body simulation. Pure (no THREE, no DOM): runs in
// node (tools/runawaybench.mjs) and in the browser (stridermodel.js poses the mesh from S.pose()).
//
// Frames: three.js world axes (x right, y up, z toward the viewer); yaw 0 faces -z, forward = (-sin yaw, 0, -cos yaw),
// left = (-cos yaw, 0, sin yaw). Units SI.
//
// The body is a balancing physical system, not an animation:
// - CoM dynamics: a 3D variable-height LINEAR INVERTED PENDULUM over the centre of pressure (CoP). The legs are light
//   (a few % of the mass) so the stance leg is a telescoping strut pushing from the CoP to the CoM: horizontal
//   acceleration = (g + ay) (c - p) / (cy - py); the vertical is a stiff height servo (leg force >= 0).
//   The CoP can only be inside the support polygon (the stance foot pad, or the hull of both pads), which is what
//   makes balance hard: push the CoM too far and the only way out is a step.
// - Stepping: Divergent Component of Motion (DCM, "capture point") control, Englsberger et al. 2015 / Pratt 2006.
//   xi = c + v / omega diverges from the CoP; each swing foot is placed so that the DCM at touchdown sits at the
//   offset that yields the commanded walking velocity next step (sagittal b = vT / (e^wT - 1), lateral
//   b = -s w / (e^wT + 1)). Errors from pushes, hits or terrain are absorbed by the same rule (it is deadbeat in the
//   DCM). If the DCM runs away faster than a normal step can catch, step timing shortens (quick recovery steps, the
//   STUMBLE); if no reachable foothold can capture it, the machine FALLS.
// - Falling: the body becomes a rigid pendulum tipping over the support edge (theta'' = g / L sin theta), hits the
//   ground (impact event), lies there, and GETS UP with a mechanical, unnatural motion (one fast swing, a dead stop,
//   then the rest) unless a leg or the gyro is wrecked.
// - Legs: digitigrade (thigh forward, shin back to a raised hock, metatarsal down to a toe pad). Analytic 2-bone IK
//   hip -> hock; the hock sits a fixed offset above / behind the toe pad on the local terrain normal.
// - Hits: the hit-info contract (hit.js). Momentum pushes the CoM (and spins the torso); energy that gets through the
//   armour damages the part and glitches its servos for a moment (a leg hit in stance sags and loses CoP control) -
//   which is what makes a burst of heavy fire knock a STRIDER off its stride.
// - Uncanny by design: the CoM glides level (no bob), the sensor head is gyro-stabilised in space (holds still while
//   the body moves), the torso + weapon snap onto targets with a hard rate limit and stop dead, and a recovering
//   machine keeps its weapon on the target while its legs scramble.
//
// All numbers are DESIGN values for a fictional machine (INFERRED), anchored where sensible to real legged robots
// (Boston Dynamics Atlas: 89 kg, 1.5 m, ~2.5 m/s) and to human gait data (natural step period 0.5-0.6 s walking).

import { normalizeHit, machineDamage, resolvePart } from './hit.js';

export const STRIDER = {
  G: 9.81,
  MASS: 150,                    // kg (INFERRED: thin ceramic / composite body, 2.15 m tall)
  I_TORSO: 14,                  // kg m^2 about the hip for hit spin (INFERRED)
  H: 2.2,                       // m, standing height to the top of the sensor head
  PELVIS_H: 1.2,                // m, nominal pelvis height over the ground
  COM_UP: 0.2,                  // m, CoM above the pelvis (heavy torso: power cell + coil capacitors)
  HIP_HALF: 0.13,               // m, hip joints either side of the pelvis
  THIGH: 0.52, SHIN: 0.58,      // m, hip -> knee -> hock
  HOCK_UP: 0.4, HOCK_BACK: 0.17,    // m, the hock above / behind the toe pad (a long metatarsal, ~0.43 m: the reverse knee)
  FOOT_L: 0.30, FOOT_W: 0.14,   // m, toe pad (the support polygon)
  FOOT_FWD: 0.04,               // m, pad centre ahead of the contact reference
  STEP_W: 0.26,                 // m, nominal lateral distance between the feet
  WALK: 1.6, RUN: 4.6,          // m/s
  ACC: 3.2,                     // m/s^2 commanded acceleration limit
  A_LAT: 1.6,                   // m/s^2 cornering (the reference velocity's rate of turn = A_LAT / speed)
  T_WALK: 0.56, T_RUN: 0.27, T_MIN: 0.19,   // s, step period
  CLEAR_WALK: 0.12, CLEAR_RUN: 0.22,       // m, swing foot clearance
  TURN: 3.0, TURN_STAND: 4.5,  // rad/s body yaw rate limit (walking / standing)
  AIM_RATE: 7.0,                // rad/s torso + weapon slew (then it stops dead)
  AIM_LIMIT: 1.25,              // rad, torso twist relative to the hips
  LEAN_K: 160, LEAN_D: 22,      // torso lean servo (1/s^2, 1/s)
  CROUCH: 0.3,                  // m, pelvis drop at full crouch
  GETUP_T: 1.9, DOWN_T: 1.1,    // s
  // armour (game armour points, see hit.js) and hit points per part: GAME-TUNED so rifles hurt limbs and the head and
  // need many hits for the core, machine guns do real work, a rocket is overkill
  ARMOUR: { head: 3, thorax: 7, stomach: 6, armL: 4, armR: 4, legL: 5, legR: 5, weapon: 3 },
  HP: { head: 18, thorax: 60, stomach: 40, armL: 22, armR: 22, legL: 34, legR: 34, weapon: 14 },
};

const S_ = STRIDER, G = S_.G;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const fwdOf = yaw => [-Math.sin(yaw), -Math.cos(yaw)];       // xz
const leftOf = yaw => [-Math.cos(yaw), Math.sin(yaw)];       // xz

// terrain normal by central differences
export function terrainNormal(env, x, z, e = 0.25) {
  if (env.normal) return env.normal(x, z);
  const hx = env.height(x + e, z) - env.height(x - e, z), hz = env.height(x, z + e) - env.height(x, z - e);
  const nx = -hx / (2 * e), nz = -hz / (2 * e), l = Math.hypot(nx, 1, nz);
  return [nx / l, 1 / l, nz / l];
}

// Analytic 2-bone IK: root a, target t, lengths l1 l2, bend hint (unit-ish vector the middle joint should go toward).
// Returns the middle joint and the (possibly clamped) end; stretch = |t - a| / (l1 + l2).
export function ik2(a, t, l1, l2, hint, out = {}) {
  let dx = t[0] - a[0], dy = t[1] - a[1], dz = t[2] - a[2];
  const d0 = Math.hypot(dx, dy, dz) || 1e-6, dmax = (l1 + l2) * 0.9995, dmin = Math.abs(l1 - l2) + 1e-3;
  const d = clamp(d0, dmin, dmax), ux = dx / d0, uy = dy / d0, uz = dz / d0;
  // bend direction: hint minus its component along u
  const hd = hint[0] * ux + hint[1] * uy + hint[2] * uz;
  let nx = hint[0] - hd * ux, ny = hint[1] - hd * uy, nz = hint[2] - hd * uz; const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  const ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
  out.mid = [a[0] + l1 * (ca * ux + sa * nx), a[1] + l1 * (ca * uy + sa * ny), a[2] + l1 * (ca * uz + sa * nz)];
  out.end = [a[0] + ux * d, a[1] + uy * d, a[2] + uz * d];
  out.stretch = d0 / (l1 + l2);
  return out;
}

// clamp a point (x, z) into the convex hull of the support pads; returns [x, z, inside, distOutside]
function padCorners(f, out) {
  const [fx, fz] = fwdOf(f.yaw), [lx, lz] = leftOf(f.yaw), cx = f.x + fx * S_.FOOT_FWD, cz = f.z + fz * S_.FOOT_FWD;
  for (const [a, b] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) out.push([cx + fx * a * S_.FOOT_L / 2 + lx * b * S_.FOOT_W / 2, cz + fz * a * S_.FOOT_L / 2 + lz * b * S_.FOOT_W / 2]);
  return out;
}
function hull(pts) {   // monotone chain, CCW
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
export function clampToPoly(poly, x, z) {
  let inside = true;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) { inside = false; break; } }
  if (inside) return [x, z, true, 0];
  let bx = x, bz = z, bd = 1e9;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1e-9;
    const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / L2, 0, 1), px = a[0] + ex * t, pz = a[1] + ez * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; bx = px; bz = pz; }
  }
  return [bx, bz, false, bd];
}

// ------------------------------------------------------------------------------------------------- the machine
export function createStrider(opt = {}) {
  const S = {
    id: opt.id ?? 0, side: 2, kind: 'strider',
    c: [0, 0, 0], v: [0, 0, 0],      // CoM position / velocity
    yaw: 0, aimYaw: 0, aimPitch: 0, headYaw: 0, headPitch: 0,
    lean: [0, 0], leanV: [0, 0],     // torso pitch (+ nose down / forward), roll (+ right side down), in the body frame
    feet: [0, 1].map(i => ({ i, x: 0, y: 0, z: 0, yaw: 0, n: [0, 1, 0], stance: true, lift: 0, sw: null, glitch: 0 })),
    stance: -1,                      // -1 double support, else the index of the stance foot
    vI: [0, 0],                      // per-step speed integral (see balanceStep)
    t: 0, T: S_.T_WALK, vRef: [0, 0], cop: [0, 0, 0], xi: [0, 0], omega: 3,
    mode: 'stand',                   // stand | walk | fall | down | getup | dead | disabled
    stumble: 0,                      // 0..1 how hard it is fighting for balance (for AI / audio / overlay)
    fall: null, getup: 0, downT: 0,
    hp: { ...S_.HP }, dmgTaken: 0, glitch: { gyro: 0, arms: 0 }, blind: false, armed: true, alive: true,
    crouch: 0, run: 0, speed: 0, servo: 0, events: [], time: 0, stepCount: 0, falls: 0,
    bodyH: 0,                        // pelvis height target used (for the bench)
    stats: { maxStretch: 0, minFootClear: 1e9 },
    // ---------------------------------------------------------------- setup
    place(x, z, yaw, env) {
      S.yaw = S.aimYaw = S.headYaw = yaw; S.aimPitch = S.headPitch = 0;
      const [lx, lz] = leftOf(yaw);
      for (const f of S.feet) { const s = f.i === 0 ? 1 : -1; f.x = x + lx * s * S_.STEP_W / 2; f.z = z + lz * s * S_.STEP_W / 2; f.y = env.height(f.x, f.z); f.yaw = yaw; f.n = terrainNormal(env, f.x, f.z); f.stance = true; f.sw = null; f.lift = 0; }
      const gy = (S.feet[0].y + S.feet[1].y) / 2;
      S.c = [x, gy + S_.PELVIS_H + S_.COM_UP, z]; S.v = [0, 0, 0]; S.lean = [0, 0]; S.leanV = [0, 0];
      S.stance = -1; S.mode = 'stand'; S.fall = null; S.t = 0; S.vRef = [0, 0]; S.prep = null;
      return S;
    },
    // ---------------------------------------------------------------- queries
    forward() { return fwdOf(S.yaw); },
    pos() { return [S.c[0], S.c[1] - S_.COM_UP - S_.PELVIS_H, S.c[2]]; },      // feet-level reference point
    get up() { return S.mode === 'stand' || S.mode === 'walk'; },
    // world muzzle point and aim direction (the weapon is carried at the right shoulder)
    aimDir(out = [0, 0, 0]) { const cp = Math.cos(S.aimPitch); out[0] = -Math.sin(S.aimYaw) * cp; out[1] = Math.sin(S.aimPitch); out[2] = -Math.cos(S.aimYaw) * cp; return out; },
    muzzle(out = [0, 0, 0]) { const P = S.pose(); return (out[0] = P.muzzle[0], out[1] = P.muzzle[1], out[2] = P.muzzle[2], out); },
    // aim error (rad, 1 sigma) from the body's state: stillness is the machine's accuracy
    aimError() {
      if (!S.up) return 0.3;
      const sp = Math.hypot(S.v[0], S.v[2]);
      return 0.0012 + 0.004 * sp + 0.08 * S.stumble + 0.02 * Math.min(1, S.glitch.arms * 4) + (S.hp.armR <= 0 ? 0.05 : 0) + (S.hp.armL <= 0 ? 0.015 : 0);
    },
    // ---------------------------------------------------------------- damage (hit-info contract, see hit.js)
    hit(raw) {
      const h = normalizeHit(raw);
      if (!S.alive) return { part: h.part, dmg: 0, pen: false };
      if (!h.part) {
        if (h.point) {   // where on the body did it land?
          const P = S.pose(), [lx, lz] = leftOf(S.yaw), gy = P.ground;
          const lat = h.point.x - S.c[0], latz = h.point.z - S.c[2];
          h.part = S.up ? resolvePart(h.point.y - gy, lat * lx + latz * lz, S_.H) : ['thorax', 'stomach', 'legL', 'legR', 'armL', 'armR'][Math.floor(Math.random() * 6)];
        } else h.part = 'thorax';
      }
      // a round that hits the weapon side-on
      const part = S_.ARMOUR[h.part] !== undefined ? h.part : 'thorax';
      const r = machineDamage(h, S_.ARMOUR[part], null);
      const dmg = r.dmg * (h.type === 'blast' ? 1 : 1);
      S.hp[part] = Math.max(0, S.hp[part] - dmg); S.dmgTaken += dmg;
      // momentum: a blast pushes the whole body; a projectile's momentum is mostly absorbed (stopped) by the body
      const J = h.impulse * (r.pen ? 0.55 : 1), d = h.direction;
      S.v[0] += d.x * J / S_.MASS; S.v[1] += d.y * J / S_.MASS * 0.3; S.v[2] += d.z * J / S_.MASS;
      // torso spin from the off-centre impact (hit height over the CoM)
      const arm = { head: 0.75, thorax: 0.35, stomach: 0.05, armL: 0.35, armR: 0.35, legL: -0.6, legR: -0.6, weapon: 0.3 }[part];
      const [fx, fz] = fwdOf(S.yaw), [lx, lz] = leftOf(S.yaw), jf = (d.x * fx + d.z * fz) * J, jl = (d.x * lx + d.z * lz) * J;
      S.leanV[0] += jf * arm / S_.I_TORSO; S.leanV[1] -= jl * arm / S_.I_TORSO;
      // servo glitch: energy that reached the internals jolts the part's actuators (a leg in stance sags)
      const eIn = h.energy * r.residual + (h.type === 'blast' ? h.energy : 0);
      const gl = Math.min(0.45, eIn / 6000 + (dmg > 4 ? 0.06 : 0));
      if (part === 'legL' || part === 'legR') { const f = S.feet[part === 'legL' ? 0 : 1]; f.glitch = Math.max(f.glitch, gl); }
      else if (part === 'stomach' || part === 'thorax') S.glitch.gyro = Math.max(S.glitch.gyro, gl * 0.7);
      else if (part === 'armL' || part === 'armR' || part === 'weapon') S.glitch.arms = Math.max(S.glitch.arms, gl);
      if (h.type === 'blast') { S.glitch.gyro = Math.max(S.glitch.gyro, Math.min(0.6, h.energy / 20000)); for (const f of S.feet) f.glitch = Math.max(f.glitch, Math.min(0.5, h.energy / 25000)); }
      // consequences
      if (S.hp.head <= 0 && !S.blind) { S.blind = true; S.events.push({ e: 'blind' }); }
      if ((S.hp.armR <= 0 || S.hp.weapon <= 0) && S.armed) { S.armed = false; S.events.push({ e: 'disarmed' }); }
      if (S.hp.thorax <= 0) S.kill();
      else if ((S.hp.legL <= 0 || S.hp.legR <= 0) && S.up) startFall(S.hp.legL <= 0 ? 0 : 1, 'leg');
      S.events.push({ e: 'hit', part, dmg, pen: r.pen });
      return { part, dmg, pen: r.pen };
    },
    kill() { if (!S.alive) return; S.alive = false; S.armed = false; S.events.push({ e: 'destroyed' }); if (S.up) startFall(-1, 'dead'); else S.mode = 'dead'; },
    // push the whole body (explosions nearby, collisions): impulse N s
    push(jx, jy, jz) { S.v[0] += jx / S_.MASS; S.v[1] += jy / S_.MASS; S.v[2] += jz / S_.MASS; },

    // ---------------------------------------------------------------- simulation
    // cmd: { vx, vz } desired ground velocity (world), crouch 0..1, aim: [x, y, z] world point or null,
    //      face: yaw to turn to when standing (default: the aim or the motion), run: bool (allows RUN speed)
    // env: { height(x, z), normal?(x, z) }
    step(dt, cmd, env) {
      S.events.length = 0;
      const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (let i = 0; i < n; i++) sub(h, cmd, env);
      return S.events;
    },
  };

  // ------------------------------------------------------------------------------------------- internals
  const support = [];
  function supportPoly() {
    support.length = 0;
    if (S.stance >= 0) padCorners(S.feet[S.stance], support);
    else { padCorners(S.feet[0], support); padCorners(S.feet[1], support); }
    return S.stance >= 0 ? support : hull(support);
  }
  // where the hip of foot i is (world), for the CoM at c
  function hipOf(i, c, out = [0, 0, 0]) {
    const [lx, lz] = leftOf(S.yaw), s = i === 0 ? 1 : -1;
    out[0] = c[0] + lx * s * S_.HIP_HALF; out[1] = c[1] - S_.COM_UP; out[2] = c[2] + lz * s * S_.HIP_HALF; return out;
  }
  function hockOf(f, out = [0, 0, 0]) {
    const [fx, fz] = fwdOf(f.yaw), n = f.n;
    // the hock: up the local normal, back along the foot (pitched with the toe-off when lifting)
    const back = S_.HOCK_BACK * (1 - 0.6 * f.lift), up = S_.HOCK_UP + 0.05 * f.lift;
    out[0] = f.x + n[0] * up - fx * back; out[1] = f.y + n[1] * up + 0.0; out[2] = f.z + n[2] * up - fz * back; return out;
  }
  const _h = [0, 0, 0], _k = [0, 0, 0];
  const LEG = (S_.THIGH + S_.SHIN) * 0.985;
  // highest pelvis the foot f allows with the CoM horizontally at (cx, cz)
  function maxPelvisFor(f, cx, cz) {
    hipOf(f.i, [cx, 0, cz], _h); hockOf(f, _k);
    const dh = Math.hypot(_h[0] - _k[0], _h[2] - _k[2]);
    return dh >= LEG ? _k[1] : _k[1] + Math.sqrt(LEG * LEG - dh * dh);
  }

  function startFall(footIdx, why) {
    if (S.mode === 'fall' || S.mode === 'down' || S.mode === 'dead') return;
    // pivot: the support point nearest the CoM's escape direction
    let px, pz, py;
    const poly = supportPoly(), [cx2, cz2] = clampToPoly(poly, S.xi[0], S.xi[1]);
    px = cx2; pz = cz2; py = S.stance >= 0 ? S.feet[S.stance].y : (S.feet[0].y + S.feet[1].y) / 2;
    if (footIdx >= 0) { const f = S.feet[footIdx]; px = f.x; pz = f.z; py = f.y; }
    let dx = S.c[0] - px, dz = S.c[2] - pz, dl = Math.hypot(dx, dz);
    if (dl < 0.03) { dx = S.v[0] || -Math.sin(S.yaw) * 0.1; dz = S.v[2] || -Math.cos(S.yaw) * 0.1; dl = Math.hypot(dx, dz) || 1; }
    const dir = [dx / dl, dz / dl], L = Math.hypot(S.c[0] - px, S.c[1] - py, S.c[2] - pz);
    const th = Math.atan2(Math.hypot(S.c[0] - px, S.c[2] - pz), S.c[1] - py);
    const vh = S.v[0] * dir[0] + S.v[2] * dir[1], thd = (vh * Math.cos(th) - S.v[1] * Math.sin(th)) / L;
    S.fall = { px, py, pz, dir, L, L0: L, th, thd: Math.max(thd, 0.15), why, yaw: S.yaw, settle: 0, impact: false,
      // which way the body faces relative to the fall (forward fall = face down)
      fwdDot: dir[0] * -Math.sin(S.yaw) + dir[1] * -Math.cos(S.yaw) };
    S.mode = 'fall'; S.falls++; S.prep = null; S.stance = -1; for (const f of S.feet) { f.sw = null; f.stance = true; }
    S.events.push({ e: 'fall', why });
  }

  function sub(h, cmd, env) {
    S.time += h;
    for (const f of S.feet) f.glitch = Math.max(0, f.glitch - h);
    S.glitch.gyro = Math.max(0, S.glitch.gyro - h); S.glitch.arms = Math.max(0, S.glitch.arms - h);
    aim(h, cmd);
    if (S.mode === 'fall') return fallStep(h, env);
    if (S.mode === 'down' || S.mode === 'dead' || S.mode === 'disabled') return downStep(h, env);
    if (S.mode === 'getup') return getupStep(h, env);
    balanceStep(h, cmd, env);
  }

  // torso / weapon aim and the stabilised head
  function aim(h, cmd) {
    let ty = S.aimYaw, tp = 0;
    if (cmd.aim && !S.blind) { const dx = cmd.aim[0] - S.c[0], dz = cmd.aim[2] - S.c[2], dy = cmd.aim[1] - (S.c[1] + 0.35); ty = Math.atan2(-dx, -dz); tp = Math.atan2(dy, Math.hypot(dx, dz)); }
    else if (cmd.aimYaw !== undefined) { ty = cmd.aimYaw; tp = cmd.aimPitch || 0; }
    else ty = S.yaw;
    // twist limit relative to the hips: past it the body has to turn
    const rel = clamp(angDiff(S.yaw, ty), -S_.AIM_LIMIT, S_.AIM_LIMIT);
    ty = S.yaw + rel;
    const r = S_.AIM_RATE * h * (S.glitch.arms > 0 ? 0.3 : 1), dy = angDiff(S.aimYaw, ty), dp = tp - S.aimPitch;
    S.aimYaw += clamp(dy, -r, r); S.aimPitch += clamp(dp, -r * 0.6, r * 0.6);
    S.aimPitch = clamp(S.aimPitch, -0.9, 1.0);
    // the head saccades: jumps to the look direction in 60 ms and holds
    const hy = cmd.look !== undefined ? cmd.look : S.aimYaw, k = Math.min(1, h / 0.06);
    S.headYaw += angDiff(S.headYaw, hy) * k; S.headPitch += (S.aimPitch * 0.8 - S.headPitch) * k;
  }

  function balanceStep(h, cmd, env) {
    const c = S.c, v = S.v;
    // ---- commanded velocity (acceleration limited), speed limits from damage
    // (a grade costs power: climbing 20° at a run is a 1.6 m/s vertical climb, ~2.4 kW for 150 kg - the drives are
    // rated for less, so uphill the top speed falls; downhill the legs brake, so it falls a little too)
    const sl0 = S.slope || 0, grade = sl0 > 0 ? 1 - 1.5 * sl0 : 1 + 0.5 * sl0;
    const gyroOk = S.hp.stomach > 0, maxSp = (cmd.run ? Math.max(S_.WALK, S_.RUN * clamp(grade, 0.4, 1)) : S_.WALK) * (gyroOk ? 1 : 0.5) * (S.hp.legL < 12 || S.hp.legR < 12 ? 0.6 : 1);
    let cvx = cmd.vx || 0, cvz = cmd.vz || 0; const cs = Math.hypot(cvx, cvz); if (cs > maxSp) { cvx *= maxSp / cs; cvz *= maxSp / cs; }
    // the reference velocity turns with a bounded lateral acceleration (a tight turn is taken slower, a reversal
    // stops and pivots) and changes speed at ACC: legged bodies cannot corner like a cursor
    {
      let sr = Math.hypot(S.vRef[0], S.vRef[1]), th = Math.atan2(S.vRef[0], S.vRef[1]);
      const sd = Math.hypot(cvx, cvz), thd = sd > 1e-3 ? Math.atan2(cvx, cvz) : th, dth = angDiff(th, thd);
      let sTgt = sd;
      if (sr < 0.3) th = thd;
      else { const rmax = S_.A_LAT / Math.max(sr, 0.6) * h; th += clamp(dth, -rmax, rmax); sTgt = sd * clamp(Math.cos(dth), 0.12, 1); }
      sr += clamp(sTgt - sr, -S_.ACC * 1.5 * h, S_.ACC * h);
      S.vRef[0] = sr * Math.sin(th); S.vRef[1] = sr * Math.cos(th);
    }
    const vr = Math.hypot(S.vRef[0], S.vRef[1]);
    S.run = clamp((vr - S_.WALK) / (S_.RUN - S_.WALK), 0, 1);
    S.crouch += clamp((cmd.crouch || 0) - S.crouch, -h * 2.5, h * 2.5);
    // ---- body yaw: toward the motion when moving, else toward `face` / the aim
    let face = cmd.face;
    // (the hips follow the body's actual travel, with a little lead from the command: facing the command while the
    // body still lags it would make the feet cross over in a turn)
    if (face === undefined) face = vr > 0.4 ? Math.atan2(-(S.vRef[0] * 0.1 + v[0] * 0.9), -(S.vRef[1] * 0.1 + v[2] * 0.9)) : S.aimYaw;
    if (vr > 0.4 && cmd.face === undefined) {   // moving: face the motion unless it would point the hips >90° from the aim (then strafe / back-step)
      const back = Math.abs(angDiff(face, S.aimYaw)) > 1.9; if (back) face = face + Math.PI;
    }
    const yr = (vr > 0.4 ? S_.TURN : S_.TURN_STAND) * h; S.yaw += clamp(angDiff(S.yaw, face), -yr, yr);

    // ---- slope along the motion: shorter, quicker steps on a grade (keeps both feet within reach)
    const gC = env.height(c[0], c[2]);
    let slope = 0;
    if (vr > 0.2) { const ux = S.vRef[0] / vr, uz = S.vRef[1] / vr; slope = (env.height(c[0] + ux * 0.6, c[2] + uz * 0.6) - env.height(c[0] - ux * 0.6, c[2] - uz * 0.6)) / 1.2; }
    S.slope = slope;
    const T0 = Math.max(S_.T_MIN + 0.04, (S_.T_WALK + (S_.T_RUN - S_.T_WALK) * Math.sqrt(S.run)) / (1 + 1.3 * Math.abs(slope)));

    // ---- height: pelvis target over the terrain, limited by what the stance leg(s) can reach
    let pelvis = gC + S_.PELVIS_H - S_.CROUCH * S.crouch - 0.12 * S.run - (0.25 + 0.3 * S.run) * Math.abs(slope) - 0.12 * S.stumble;
    // a leg that is glitching sags; a wrecked gyro makes it crouch to keep the CoM low
    if (!gyroOk) pelvis -= 0.15;
    for (const f of S.feet) if (f.stance) { pelvis = Math.min(pelvis, maxPelvisFor(f, c[0], c[2]) - 0.02); if (f.glitch > 0) pelvis -= 0.22 * Math.min(1, f.glitch * 5); }
    S.bodyH = pelvis - gC;
    const yT = pelvis + S_.COM_UP;
    // (velocity feed-forward: the ground under the CoM rises / falls at grad(h) . v, so the servo does not lag on a grade)
    const gx = (env.height(c[0] + 0.3, c[2]) - env.height(c[0] - 0.3, c[2])) / 0.6, gz = (env.height(c[0], c[2] + 0.3) - env.height(c[0], c[2] - 0.3)) / 0.6;
    const vyT = clamp(gx * v[0] + gz * v[2], -3, 3);
    let ay = 120 * (yT - c[1]) + 24 * (vyT - v[1]);
    ay = clamp(ay, -G * 0.6, G * 1.2);

    // ---- CoP and the pendulum
    const poly = supportPoly();
    const py = S.stance >= 0 ? S.feet[S.stance].y : (S.feet[0].y + S.feet[1].y) / 2;
    const hh = Math.max(0.4, c[1] - py), om = Math.sqrt(G / hh); S.omega = om;
    const xi = S.xi; xi[0] = c[0] + v[0] / om; xi[1] = c[2] + v[2] / om;
    // the velocity the next foothold aims for: the command, but at most 1 m/s from what the body does now
    // (+ a slow integral on the per-step average speed: on a grade the pendulum height changes through the step and a
    // pure LIPM prediction runs a little fast uphill / slow downhill)
    if (vr < 0.05) { S.vI[0] = 0; S.vI[1] = 0; }
    const vpx0 = S.vRef[0] + S.vI[0] - v[0], vpz0 = S.vRef[1] + S.vI[1] - v[2], vpl = Math.hypot(vpx0, vpz0), vpk = vpl > 1 ? 1 / vpl : 1;
    const vPx = v[0] + vpx0 * vpk, vPz = v[2] + vpz0 * vpk;
    const eT = Math.exp(om * T0), bs = T0 / (eT - 1), bl = S_.STEP_W / (eT + 1);
    let px, pz;
    const gyroGl = S.glitch.gyro > 0;
    if (S.stance < 0) {
      // double support: DCM servo toward the middle of the feet
      // (before the first step: shift the weight onto the stance foot and let the body start falling the right way)
      let mx = (S.feet[0].x + S.feet[1].x) / 2, mz = (S.feet[0].z + S.feet[1].z) / 2;
      const k = gyroGl ? 0.5 : S.prep ? 6.0 : 3.0;
      if (S.prep) {
        const st = S.feet[S.prep.st], ot = S.feet[1 - S.prep.st], [fx, fz] = fwdOf(st.yaw), sx = st.x + fx * S_.FOOT_FWD, sz = st.z + fz * S_.FOOT_FWD;
        const ix = ot.x - st.x, iz = ot.z - st.z, il = Math.hypot(ix, iz) || 1, sb = Math.min(1, 0.12 / Math.max(1e-6, vr * bs));
        mx = sx + ix / il * bl + S.vRef[0] * bs * sb; mz = sz + iz / il * bl + S.vRef[1] * bs * sb; S.prep.dx = mx; S.prep.dz = mz;
      }
      px = xi[0] + (k / om) * (xi[0] - mx); pz = xi[1] + (k / om) * (xi[1] - mz);
    } else {
      const f = S.feet[S.stance], [fx, fz] = fwdOf(f.yaw);
      const cx0 = f.x + fx * S_.FOOT_FWD, cz0 = f.z + fz * S_.FOOT_FWD;
      // ankle strategy: shift the CoP against the DCM's deviation from the plan made at touchdown
      const e = Math.exp(om * S.t), ex = cx0 + S.plan[0] * e, ez = cz0 + S.plan[1] * e;
      const kA = f.glitch > 0 || gyroGl ? 0 : 1.2;
      S.dev = Math.hypot(xi[0] - ex, xi[1] - ez);
      px = cx0 + kA * (xi[0] - ex); pz = cz0 + kA * (xi[1] - ez);
    }
    const [qx, qz] = clampToPoly(poly, px, pz);
    S.cop[0] = qx; S.cop[1] = py; S.cop[2] = qz;
    const k = (G + ay) / hh;
    v[0] += k * (c[0] - qx) * h; v[2] += k * (c[2] - qz) * h; v[1] += ay * h;
    c[0] += v[0] * h; c[1] += v[1] * h; c[2] += v[2] * h;
    // the stance leg is a strut of limited length: past full extension the body swings on it (a compass gait), it
    // cannot be pushed further away
    for (const f of S.feet) if (f.stance && f.glitch <= 0) {
      hipOf(f.i, c, _h); hockOf(f, _k);
      const dx = _h[0] - _k[0], dy = _h[1] - _k[1], dz = _h[2] - _k[2], d = Math.hypot(dx, dy, dz), Lm = (S_.THIGH + S_.SHIN) * 0.995;
      if (d > Lm) {
        const ux = dx / d, uy = dy / d, uz = dz / d, e = d - Lm;
        c[0] -= ux * e; c[1] -= uy * e; c[2] -= uz * e;
        const vo = v[0] * ux + v[1] * uy + v[2] * uz; if (vo > 0) { v[0] -= vo * ux; v[1] -= vo * uy; v[2] -= vo * uz; S.stats.legStop = (S.stats.legStop || 0) + vo; }
      }
    }
    xi[0] = c[0] + v[0] / om; xi[1] = c[2] + v[2] / om;

    // ---- stepping
    if (S.stance < 0) {
      // standing: start stepping when asked to move, when the DCM leaves the feet, or to turn the feet
      const [, , inPoly, dOut] = clampToPoly(poly, xi[0], xi[1]);
      const feetYaw = S.feet[0].yaw + angDiff(S.feet[0].yaw, S.feet[1].yaw) / 2, twist = Math.abs(angDiff(feetYaw, S.yaw));
      const urgent = !inPoly && dOut > 0.015;
      if (!S.prep && (vr > 0.08 || urgent || twist > 0.5)) {
        // swing the foot on the side the DCM / the motion is heading to (else alternate)
        const [lx, lz] = leftOf(S.yaw), mx = (S.feet[0].x + S.feet[1].x) / 2, mz = (S.feet[0].z + S.feet[1].z) / 2;
        const tx = (xi[0] - mx) + S.vRef[0] * 0.3, tz = (xi[1] - mz) + S.vRef[1] * 0.3, lat = tx * lx + tz * lz;
        const sw = Math.abs(lat) > 0.03 ? (lat > 0 ? 0 : 1) : (S.stepCount % 2);
        S.prep = { st: 1 - sw, t: 0 };
        if (urgent) { beginStep(1 - sw, env, T0 * 0.75); S.prep = null; }
      } else if (S.prep) {
        S.prep.t += h;
        if (S.prep.t > 0.4 || urgent || Math.hypot(xi[0] - S.prep.dx, xi[1] - S.prep.dz) < 0.025) { const st = S.prep.st; S.prep = null; beginStep(st, env, T0); }
      }
    } else {
      S.t += h;
      const st = S.feet[S.stance], sw = S.feet[1 - S.stance];
      // ---- foothold + step timing, chosen together (DCM stepping with timing adaptation):
      // for candidate remaining times tau (longest first) predict the CoM / DCM at touchdown with the CoP held at the
      // stance pad, place the foot at DCM_T - b, and take the longest tau for which (1) the foot is within reach of
      // its hip, (2) the stance leg is still long enough, (3) the swing foot can physically get there in time.
      const [fx, fz] = fwdOf(st.yaw), cx0 = st.x + fx * S_.FOOT_FWD, cz0 = st.z + fz * S_.FOOT_FWD;
      // the gait frame: the direction of travel, folded to forward / back and kept within 0.6 rad of the hips (so a
      // side-step still steps sideways), sets the step width
      let gy = S.yaw; const vpl2 = Math.hypot(vPx, vPz);
      if (vpl2 > 0.3) { let ty = Math.atan2(-vPx, -vPz), d = angDiff(S.yaw, ty); if (d > Math.PI / 2) d -= Math.PI; if (d < -Math.PI / 2) d += Math.PI; gy = S.yaw + clamp(d, -0.6, 0.6); }
      const s = sw.i === 0 ? 1 : -1, [lx, lz] = leftOf(gy), [blx, blz] = leftOf(S.yaw), [nfx, nfz] = fwdOf(S.yaw);
      const reach = Math.sqrt(Math.max(0.01, LEG * LEG - (S.bodyH - S_.HOCK_UP) ** 2)) + 0.04;
      hockOf(st, _k);
      const dyS = c[1] - S_.COM_UP - _k[1];
      const tauNom = Math.max(0.012, T0 - S.t), tauMin = Math.min(tauNom, Math.max(0.012, S_.T_MIN - S.t));
      const locked = sw.sw.lock;
      let best = null;
      const NC = locked ? 1 : 9;
      for (let i = 0; i < NC; i++) {
        const tau = locked ? Math.max(0, S.T - S.t) : tauNom + (tauMin - tauNom) * i / (NC - 1);
        const ch = Math.cosh(om * tau), sh = Math.sinh(om * tau), e = ch + sh;
        const cTx = cx0 + (c[0] - cx0) * ch + v[0] / om * sh, cTz = cz0 + (c[2] - cz0) * ch + v[2] / om * sh;
        const xTx = cx0 + (xi[0] - cx0) * e, xTz = cz0 + (xi[1] - cz0) * e;
        // foothold (the new pad's centre sits FOOT_FWD ahead of its reference point)
        let tx = xTx - vPx * bs + lx * s * bl - nfx * S_.FOOT_FWD, tz = xTz - vPz * bs + lz * s * bl - nfz * S_.FOOT_FWD;
        if (locked) { tx = sw.sw.tx; tz = sw.sw.tz; }
        // never cross over (body frame, relative to the stance foot)
        const latRel = (tx - st.x) * blx + (tz - st.z) * blz;
        if (s * latRel < 0.08) { tx += blx * s * (0.08 - s * latRel); tz += blz * s * (0.08 - s * latRel); }
        const hx = cTx + blx * s * S_.HIP_HALF, hz = cTz + blz * s * S_.HIP_HALF, over = Math.max(0, Math.hypot(tx - hx, tz - hz) - reach);
        // (on a grade the hip also climbs / drops away from the stance foot as the body moves on)
        const dyT = dyS + vyT * tau, dmaxS = Math.sqrt(Math.max(0.01, LEG * LEG - dyT * dyT)) * 0.98;
        const shx = cTx - blx * s * S_.HIP_HALF - _k[0], shz = cTz - blz * s * S_.HIP_HALF - _k[2], overS = Math.max(0, Math.hypot(shx, shz) - dmaxS);
        const overT = Math.max(0, Math.hypot(tx - sw.x, tz - sw.z) - 7.5 * tau - 0.03);
        const cost = over + overS + overT * 0.5;
        if (!best || cost < best.cost - 1e-4) best = { tau, tx, tz, cost, over, hx, hz };
        if (cost < 1e-4) break;
      }
      let { tau, tx, tz, cost } = best;
      // a foothold beyond reach is clamped to it (the leg lunges as far as it can)
      if (best.over > 0) { const dx = tx - best.hx, dz = tz - best.hz, dl = Math.hypot(dx, dz), r = reach * 1.08; if (dl > r) { tx = best.hx + dx * r / dl; tz = best.hz + dz * r / dl; } }
      if (!locked) { S.T = S.t + tau; sw.sw.tx = tx; sw.sw.tz = tz; if (tau < 0.07) sw.sw.lock = true; }
      // stumble: how much the step had to be hurried (or could not be made)
      const need = tauNom > 0.08 && !locked ? clamp((1 - tau / tauNom) * 1.4 + cost * 4, 0, 1) : clamp(cost * 4, 0, 1);
      S.stumble = Math.max(S.stumble - h * 1.2, need);
      // unrecoverable: no reachable foothold catches the DCM even with the quickest step
      if (cost > 0.4 && (locked || tau <= tauMin + 1e-6)) { S.dbgFall = { cost, over: best.over, tau, t: S.t }; startFall(-1, 'balance'); return; }
      if (S.hp.stomach <= 0 && S.glitch.gyro > 0.2 && need > 0.6) { startFall(-1, 'gyro'); return; }
      swingFoot(sw, h, env);
      if (S.t >= S.T - 1e-6) touchdown(sw, env, vr, T0);
    }
    // ---- torso lean: into the acceleration + hit spin, a stiff servo (softer while the gyro is glitched)
    const fwd = fwdOf(S.yaw), lf = leftOf(S.yaw);
    const accF = (k * (c[0] - qx) * fwd[0] + k * (c[2] - qz) * fwd[1]) / G, accL = (k * (c[0] - qx) * lf[0] + k * (c[2] - qz) * lf[1]) / G;
    const lp = clamp(accF * 0.35 + 0.06 * S.run + 0.1 * S.crouch, -0.5, 0.5), lr = clamp(-accL * 0.25, -0.3, 0.3);
    const kk = gyroGl ? 0.25 : 1;
    for (let j = 0; j < 2; j++) { const tgt = j ? lr : lp; S.leanV[j] += (S_.LEAN_K * kk * (tgt - S.lean[j]) - S_.LEAN_D * Math.sqrt(kk) * S.leanV[j]) * h; S.lean[j] += S.leanV[j] * h; }
    if (Math.abs(S.lean[0]) > 0.85 || Math.abs(S.lean[1]) > 0.75) { startFall(-1, 'lean'); return; }
    S.speed = Math.hypot(v[0], v[2]);
    S.servo = clamp(S.speed / S_.RUN + 3 * Math.hypot(...S.leanV) * 0.05 + S.stumble * 0.6, 0, 1.5);
    // stats for the bench
    for (const f of S.feet) if (f.stance) { hipOf(f.i, c, _h); hockOf(f, _k); S.stats.maxStretch = Math.max(S.stats.maxStretch, Math.hypot(_h[0] - _k[0], _h[1] - _k[1], _h[2] - _k[2]) / (S_.THIGH + S_.SHIN)); }
    S.mode = S.stance < 0 ? 'stand' : 'walk';
  }

  function beginStep(stanceIdx, env, T) {
    S.stance = stanceIdx; S.t = 0; S.T = T;
    const st = S.feet[stanceIdx], sw = S.feet[1 - stanceIdx];
    st.stance = true; sw.stance = false;
    sw.sw = { x0: sw.x, y0: sw.y, z0: sw.z, yaw0: sw.yaw, tx: sw.x, tz: sw.z, lock: false };
    // the plan: the DCM offset from the pad centre now (the ankle servo corrects deviations from its growth)
    const [fx, fz] = fwdOf(st.yaw), om = S.omega;
    S.plan = [S.c[0] + S.v[0] / om - (st.x + fx * S_.FOOT_FWD), S.c[2] + S.v[2] / om - (st.z + fz * S_.FOOT_FWD)];
  }
  // the swing foot: lifts, glides straight to the (moving) target at the speed that lands it on time, plants.
  // A machine's step: no arc-and-float, a precise lift / traverse / set-down.
  function swingFoot(f, h, env) {
    const w = f.sw, tau = Math.max(h, S.T - S.t + h);
    const dx = w.tx - f.x, dz = w.tz - f.z, d = Math.hypot(dx, dz), k = Math.min(1, h / tau), vmax = 7.5 * h;
    const mv = Math.min(d * k * (tau > 0.12 ? 1.25 : 1), vmax), kk = d > 1e-6 ? Math.min(1, mv / d) : 1;
    const x = f.x + dx * kk, z = f.z + dz * kk;
    const clr = (S_.CLEAR_WALK + (S_.CLEAR_RUN - S_.CLEAR_WALK) * S.run) * (1 - 0.4 * S.stumble);
    const g = env.height(x, z), gT = env.height(w.tx, w.tz);
    const up = sstep(S.t / 0.07) * sstep((S.T - S.t) / 0.09);
    // clear the ground under the foot and the landing spot, and anything in between
    const gm = Math.max(g, gT * sstep(1 - (S.T - S.t) / 0.15) + g * (1 - sstep(1 - (S.T - S.t) / 0.15)), env.height(x + dx * 0.3, z + dz * 0.3));
    const yT = Math.max(gm, Math.min(w.y0, gm + 0.5)) * 0 + gm + clr * up;
    f.y += (yT - f.y) * Math.min(1, h / 0.025);
    f.y = Math.max(f.y, g);
    f.x = x; f.z = z; f.yaw += angDiff(f.yaw, S.yaw) * Math.min(1, h / Math.max(h, tau) * 1.5);
    f.lift = up; f.n = terrainNormal(env, x, z);
    if (S.t > 0.08 && S.T - S.t > 0.08) S.stats.minFootClear = Math.min(S.stats.minFootClear, f.y - g);
  }
  function touchdown(f, env, vr, T0) {
    f.x = f.sw.tx; f.z = f.sw.tz; f.y = env.height(f.x, f.z); f.n = terrainNormal(env, f.x, f.z); f.yaw = S.yaw; f.lift = 0;
    const impactV = Math.abs(S.v[1]) + 0.4 + 1.2 * S.speed / S_.RUN + S.stumble;
    if (S.stepT0 !== undefined && S.time - S.stepT0 > 0.1 && S.stumble < 0.3) {   // per-step average speed vs the command
      const dt = S.time - S.stepT0, ex = S.vRef[0] - (S.c[0] - S.stepC[0]) / dt, ez = S.vRef[1] - (S.c[2] - S.stepC[1]) / dt;
      if (Math.hypot(ex, ez) < 0.9 && Math.hypot(S.vRef[0] - S.vRefStep[0], S.vRef[1] - S.vRefStep[1]) < 0.05) { S.vI[0] = clamp(S.vI[0] + 0.25 * ex, -0.8, 0.8); S.vI[1] = clamp(S.vI[1] + 0.25 * ez, -0.8, 0.8); }   // steady walking only
    }
    S.stepT0 = S.time; S.stepC = [S.c[0], S.c[2]]; S.vRefStep = [S.vRef[0], S.vRef[1]];
    f.sw = null; f.stance = true; S.stepCount++;
    S.events.push({ e: 'step', foot: f.i, x: f.x, y: f.y, z: f.z, v: impactV, run: S.run, stumble: S.stumble });
    const old = S.feet[S.stance];
    // come to rest in double support when asked to stop and the DCM is between the feet
    const mx = (f.x + old.x) / 2, mz = (f.z + old.z) / 2;
    const xiOff = Math.hypot(S.xi[0] - mx, S.xi[1] - mz);
    const twist = Math.abs(angDiff(f.yaw + angDiff(f.yaw, old.yaw) / 2, S.yaw));
    if (vr < 0.08 && xiOff < 0.1 && Math.hypot(S.v[0], S.v[2]) < 0.25 && twist < 0.3) { S.stance = -1; old.stance = true; return; }
    beginStep(f.i, env, T0);
  }
  // ---- falling: a rigid pendulum about the support edge, then lying, then the get-up
  function fallStep(h, env) {
    const F = S.fall;
    F.thd += (G / F.L * Math.sin(F.th)) * h; F.th += F.thd * h;
    // a dead / leg-shot machine crumples: the pendulum shortens as the knees go
    if (F.why === 'dead' || F.why === 'leg') F.L = Math.max(F.L0 * 0.55, F.L - h * 1.4);
    const gy = env.height(F.px + F.dir[0] * F.L * Math.sin(F.th), F.pz + F.dir[1] * F.L * Math.sin(F.th));
    const lieTh = Math.PI / 2 - Math.asin(clamp(0.3 / F.L, 0, 1)) + Math.atan2(F.py - gy, F.L);   // the torso is ~0.3 m thick lying
    setFallPose();
    if (F.th >= lieTh) {
      F.th = lieTh;
      if (!F.impact) { F.impact = true; S.events.push({ e: 'impact', x: S.c[0], y: S.c[1], z: S.c[2], v: F.thd * F.L }); }
      F.thd = -F.thd * 0.18; if (Math.abs(F.thd) < 0.25) { F.thd = 0; S.mode = S.alive ? 'down' : 'dead'; S.downT = 0; S.v = [0, 0, 0]; }
    }
    S.stumble = 1; S.speed = 0; S.servo = 0.3;
  }
  function setFallPose() {
    const F = S.fall, s = Math.sin(F.th), c = Math.cos(F.th);
    S.c[0] = F.px + F.dir[0] * F.L * s; S.c[1] = F.py + F.L * c; S.c[2] = F.pz + F.dir[1] * F.L * s;
  }
  function downStep(h, env) {
    S.downT += h; S.speed = 0; S.stumble = 0; S.servo = 0;
    if (S.mode === 'down') {
      const canStand = S.alive && S.hp.legL > 0 && S.hp.legR > 0;
      if (!canStand) { S.mode = 'disabled'; S.events.push({ e: 'disabled' }); return; }
      if (S.downT > S_.DOWN_T + (S.hp.stomach <= 0 ? 1.5 : 0)) { S.mode = 'getup'; S.getup = 0; S.events.push({ e: 'getup' }); }
    }
  }
  function getupStep(h, env) {
    const F = S.fall; S.getup += h / S_.GETUP_T;
    // the unnatural profile: a fast swing through 75%, a dead stop, then a slow mechanical finish
    const u = S.getup, k = u < 0.35 ? 0.75 * sstep(u / 0.35) : u < 0.55 ? 0.75 : 0.75 + 0.25 * sstep((u - 0.55) / 0.45);
    if (F.th0 === undefined) { F.th0 = F.th; F.Lg = F.L; }
    const L1 = S_.PELVIS_H + S_.COM_UP - 0.05;
    F.th = F.th0 * (1 - k); F.L = F.Lg + (L1 - F.Lg) * k;
    setFallPose(); S.servo = u < 0.35 || u > 0.55 ? 1.2 : 0;
    if (S.getup >= 1) {
      // stand back up over the pivot, feet under the hips
      const x = F.px, z = F.pz; S.mode = 'stand'; S.fall = null;
      const yaw = S.yaw, [lx, lz] = leftOf(yaw);
      for (const f of S.feet) { const s = f.i === 0 ? 1 : -1; f.x = x + lx * s * S_.STEP_W / 2; f.z = z + lz * s * S_.STEP_W / 2; f.y = env.height(f.x, f.z); f.yaw = yaw; f.n = terrainNormal(env, f.x, f.z); f.stance = true; f.sw = null; f.lift = 0; f.glitch = 0; }
      S.c = [x, S.c[1], z]; S.v = [0, 0, 0]; S.lean = [0, 0]; S.leanV = [0, 0]; S.vRef = [0, 0]; S.stance = -1; S.stumble = 0;
      S.events.push({ e: 'up' });
    }
  }

  // ------------------------------------------------------------------------------------------- pose (for the mesh)
  // Returns world-space joints + the body basis. Allocation-light: one cached object.
  const P = { ground: 0, pelvis: [0, 0, 0], basis: { f: [0, 0, -1], u: [0, 1, 0], l: [-1, 0, 0] }, torso: { f: [0, 0, -1], u: [0, 1, 0], l: [-1, 0, 0] },
    chest: [0, 0, 0], head: [0, 0, 0], headYaw: 0, headPitch: 0, legs: [{}, {}], arms: [{}, {}], muzzle: [0, 0, 0], gun: { pos: [0, 0, 0], f: [0, 0, -1], u: [0, 1, 0], l: [-1, 0, 0] } };
  const add3 = (o, a, b, s = 1) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; return a; };
  // rotate vector v about unit axis k by angle a (Rodrigues)
  const rot = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2], x = cross(k, v); return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)]; };
  S.pose = () => {
    const B = P.basis, [fx, fz] = fwdOf(S.yaw), [lx, lz] = leftOf(S.yaw);
    let f = [fx, 0, fz], u = [0, 1, 0], l = [lx, 0, lz];
    // lean: pitch about the left axis (+ = nose down), roll about forward
    f = rot(f, l, -S.lean[0]); u = rot(u, l, -S.lean[0]); u = rot(u, f, S.lean[1]); l = rot(l, f, S.lean[1]);
    let fallAxis = null, fallAng = 0;
    if (S.fall) { fallAxis = norm([S.fall.dir[1], 0, -S.fall.dir[0]]); fallAng = S.fall.th; f = rot(f, fallAxis, fallAng); u = rot(u, fallAxis, fallAng); l = rot(l, fallAxis, fallAng); }
    B.f = f; B.u = u; B.l = l;
    const pel = add3(P.pelvis, S.c, u, -S_.COM_UP);
    P.ground = S.fall ? S.fall.py : Math.min(S.feet[0].y, S.feet[1].y);
    // torso: twisted toward the aim (yaw relative to the hips), pitched with the aim a little
    const tw = angDiff(S.yaw, S.aimYaw);
    const T = P.torso; T.f = rot(f, u, tw); T.l = rot(l, u, tw); T.u = u;
    const tp = S.aimPitch * 0.3; T.f = rot(T.f, T.l, -tp); T.u = rot(u, T.l, -tp);
    add3(P.chest, pel, T.u, 0.42);
    // head: on a short neck, gyro-stabilised in WORLD yaw/pitch while up
    add3(P.head, P.chest, T.u, 0.31); add3(P.head, P.head, T.f, 0.02);
    P.headYaw = S.headYaw; P.headPitch = S.headPitch;
    // legs
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1, L = P.legs[i], ft = S.feet[i];
      L.hip = add3([0, 0, 0], pel, l, s * S_.HIP_HALF);
      let toe, hock, n;
      if (S.mode === 'stand' || S.mode === 'walk') {
        toe = [ft.x, ft.y, ft.z]; hock = hockOf(ft, [0, 0, 0]); n = ft.n;
      } else {
        // fallen / getting up: legs tuck in body frame, the pivot side stays near the ground
        const g = S.mode === 'getup' ? clamp(S.getup * 1.2, 0, 1) : 0;
        const bend = S.mode === 'getup' ? 0.35 + 0.5 * (1 - g) : S.alive ? 0.25 : 0.55;
        toe = add3([0, 0, 0], L.hip, u, -(S_.PELVIS_H - 0.05) * (1 - bend * 0.5)); add3(toe, toe, f, 0.15 + bend * 0.25);
        hock = add3([0, 0, 0], toe, u, S_.HOCK_UP); add3(hock, hock, f, -S_.HOCK_BACK);
        n = u;
      }
      // knees bend forward (and a touch outward)
      const hint = [f[0] + l[0] * s * 0.15, f[1] + l[1] * s * 0.15, f[2] + l[2] * s * 0.15];
      const r = ik2(L.hip, hock, S_.THIGH, S_.SHIN, hint, L.ik || (L.ik = {}));
      L.knee = r.mid; L.hock = r.end; L.toe = toe; L.n = n; L.stretch = r.stretch; L.lift = ft.lift;
      L.footF = [-Math.sin(ft.yaw), 0, -Math.cos(ft.yaw)];
    }
    // weapon: held at the right shoulder, pointing along the aim (world), stabilised against walking sway
    const G2 = P.gun, ad = S.aimDir([0, 0, 0]);
    let gf = ad;
    if (!S.up) gf = T.f;
    const gl = norm(cross([0, 1, 0], gf)), gu = cross(gf, gl);
    G2.f = gf; G2.l = gl; G2.u = gu;
    const sh = [add3([0, 0, 0], P.chest, T.l, 0.24), add3([0, 0, 0], P.chest, T.l, -0.24)];   // shoulders L, R
    for (const q of sh) add3(q, q, T.u, 0.12);
    // gun grip ~ 0.25 below and 0.1 right of the right shoulder, pulled forward
    G2.pos = add3([0, 0, 0], sh[1], gu, -0.16); add3(G2.pos, G2.pos, gf, 0.32); add3(G2.pos, G2.pos, gl, 0.04);
    add3(P.muzzle, G2.pos, gf, 0.78);
    // arms: right hand on the grip, left hand on the fore-end
    const hands = [add3([0, 0, 0], G2.pos, gf, 0.42), add3([0, 0, 0], G2.pos, gu, -0.04)];
    for (let i = 0; i < 2; i++) {
      const A = P.arms[i], s = i === 0 ? 1 : -1;
      A.sh = sh[i];
      const armOk = S.hp[i === 0 ? 'armL' : 'armR'] > 0 && S.up;
      const tgt = armOk && S.armed ? hands[i] : add3(add3([0, 0, 0], sh[i], T.u, -0.62), sh[i], T.f, 0.05);
      const hint = [T.l[0] * s * 0.6 - T.u[0] * 0.8 - T.f[0] * 0.2, T.l[1] * s * 0.6 - T.u[1] * 0.8 - T.f[1] * 0.2, T.l[2] * s * 0.6 - T.u[2] * 0.8 - T.f[2] * 0.2];
      const r = ik2(A.sh, tgt, 0.36, 0.38, hint, A.ik || (A.ik = {}));
      A.elbow = r.mid; A.hand = r.end;
    }
    return P;
  };
  return S;
}

// flat-ground / slope test worlds (used by the bench; any {height(x, z)} works)
export const flatEnv = (y = 0) => ({ height: () => y });
export const slopeEnv = (deg, dirYaw = 0) => {   // a plane rising toward the yaw direction
  const t = Math.tan(deg * Math.PI / 180), [fx, fz] = fwdOf(dirYaw);
  return { height: (x, z) => (x * fx + z * fz) * t, normal: () => { const l = Math.hypot(t, 1); return [-fx * t / l, 1 / l, -fz * t / l]; } };
};
