// sling.js - an external (sling) load under a helicopter's cargo hook. Pure: plain JS arrays, no THREE, no DOM; runs in
// node (tools/slingbench.mjs).
//
// The load is a rigid body hung from a single point: the hook -> a nylon pendant (strop) -> the sling's apex -> a
// four-leg bridle to the vehicle's lifting provisions. The pendant is the only flexible part, so the load swings as a
// pendulum of length strop + (apex to the load's CG) about the hook, and bounces on the pendant's stretch (the "vertical
// bounce" mode, ~1 Hz). The rope pulls only (slack below its length). Integrated in the helicopter's own substep
// (hueyfm.js env.ext, 240 Hz), so the tension at the hook goes straight back into the airframe: the load's weight, its
// swing and its drag reach the helicopter through the hook point, below the CG - the coupling is the physics, not a
// handling rule.
//
// Forces on the load: gravity, the pendant tension, aerodynamic drag of a bluff body in the relative air (the wind and
// the rotor's downwash, which adds download in the hover), the ground (spring / damper / friction: a load set down sits
// and the rope goes slack) and the sea (drag and some buoyancy: a dunked vehicle is a drowned vehicle). Above the load's
// stable airspeed a bluff vehicle starts to fly sideways and oscillate (FM 55-450-2: loads are limited to the speed at
// which they ride steadily); modelled as an oscillating side force growing with (V / Vlim)^2 near the pendulum's own
// frequency, so the swing builds in the pendulum mode the way it does in the air (INFERRED, game-level).
//
// Numbers carry tags: CONFIRMED (published), INFERRED (derived / estimated).
export const G = 9.81, RHO = 1.225;
const KT = 1.94384, LB = 0.45359237;

// cargo hooks. at = hook position in the airframe (three body axes: x right, y up, -z forward, from the CG)
export const HOOKS = {
  // UH-1H: cargo suspension (hook) rated 4,000 lb (TM 55-1520-210-10, cargo hook system: CONFIRMED); max gross weight
  // 9,500 lb (CONFIRMED); the hook hangs under the cabin floor at the CG station (position INFERRED from the model)
  uh1h: { name: 'UH-1H', limit: 4000 * LB, ult: 2.5, maxGross: 9500 * LB, at: [0, -1.28, 0.15] },
  // CH-46E Sea Knight: 10,000 lb hook (NATOPS: CONFIRMED)
  ch46e: { name: 'CH-46E', limit: 10000 * LB, ult: 2.5, at: [0, -1.65, 0.2] },
  // CH-53D Sea Stallion: 20,000 lb external (CONFIRMED order of magnitude; quoted for the TOO HEAVY messages)
  ch53d: { name: 'CH-53D', limit: 20000 * LB, ult: 2.5 },
};

// what a load is, per vehicle type: mass (kg, the vehicle sims' own figures where they exist), areas (m2: front, side,
// top - bluff, Cd ~1), the CG and the sling's apex above the model's origin (its wheels / tracks on the ground), the
// pendant length and the airspeed it rides steadily to (kt, INFERRED from FM 55-450-2 practice for light vehicles)
export const LOADS = {
  m151: { label: 'M151A2', mass: 1100, A: [2.6, 4.6, 5.5], cg: 0.60, apex: 3.4, strop: 3.0, vKt: 60 },
  landrover: { label: 'LAND ROVER 109', mass: 1530, A: [3.0, 5.6, 7.4], cg: 0.78, apex: 3.6, strop: 3.0, vKt: 60 },
  hilux: { label: 'HILUX', mass: 1360, A: [2.7, 5.4, 7.0], cg: 0.68, apex: 3.4, strop: 3.0, vKt: 60 },
  beetle: { label: 'VW BEETLE', mass: 800, A: [2.2, 4.2, 5.8], cg: 0.52, apex: 3.2, strop: 3.0, vKt: 60 },
  lada: { label: 'LADA 2101', mass: 955, A: [2.2, 4.7, 6.1], cg: 0.54, apex: 3.2, strop: 3.0, vKt: 60 },
  m35: { label: 'M35A2', mass: 13030 * LB, A: [6.5, 16, 16], cg: 1.05, apex: 4.9, strop: 4.0, vKt: 70 },
  m113: { label: 'M113A2', mass: 11343, A: [5.0, 10.5, 13.5], cg: 1.0, apex: 4.4, strop: 4.0, vKt: 70 },
  m60: { label: 'M60A3', mass: 52617, A: [8.5, 21, 25], cg: 1.4, apex: 5.2, strop: 4.0, vKt: 50 },
};
export const loadOf = (type, mass) => { const L = LOADS[type] || LOADS.m151; return mass ? { ...L, mass } : L; };
// can this hook take that load? '' or the reason, with the numbers (kg and lb, 1980 crews worked in pounds)
export function hookCheck(hook, load) {
  if (load.mass <= hook.limit) return '';
  const lb = v => Math.round(v / LB / 10) * 10;
  return `TOO HEAVY: ${load.label} ${Math.round(load.mass).toLocaleString('en-US')} KG (${lb(load.mass).toLocaleString('en-US')} LB)  -  ${hook.name} HOOK LIMIT ${Math.round(hook.limit).toLocaleString('en-US')} KG (${lb(hook.limit).toLocaleString('en-US')} LB)`;
}

// o: a LOADS entry (+ mass). The pendant stretches 8 % at 1 g (nylon pendants: ~8-12 % at working load, INFERRED) and
// damps at 15 % of critical (nylon hysteresis, INFERRED); vertical bounce sqrt(g / (0.08 strop)) ~ 1 Hz for a 3 m pendant.
export function createSling(o) {
  const m = o.mass, Lb = o.apex - o.cg, strop = o.strop;
  const k = m * G / (0.08 * strop), c = 2 * 0.15 * Math.sqrt(k * m);
  const S = {
    m, strop, Lb, L: strop + Lb, k, c, spec: o,
    p: [0, 0, 0], v: [0, 0, 0], F: [0, 0, 0],   // load CG (world), its velocity; F = force on the hook (world)
    T: 0, Tg: 0, Tpeak: 0, taut: false, ground: false, wet: false, depth: 0, gN: 0, impact: 0,
    swing: [0, 0], swingDeg: 0, yaw: 0, oscPh: 0, air: 0, wash: 0, parted: false, over: 0,
    // the load at rest at (x, y-ground, z): its CG over the origin height
    place(x, gy, z, yaw = 0) { S.p[0] = x; S.p[1] = gy + o.cg; S.p[2] = z; S.v[0] = S.v[1] = S.v[2] = 0; S.yaw = yaw; S.T = 0; S.Tpeak = 0; S.parted = false; S.over = 0; S.impact = 0; },
    pendulumPeriod() { return 2 * Math.PI * Math.sqrt(S.L / G); },
    // one substep. hp, hv: hook position and velocity (world, arrays); env: { ground(x, z), water(x, z), wind: [x, z]?,
    // wash: vertical air speed (m/s, + down) at the load from the rotor, hookYaw: the helicopter's heading (rad, three yaw),
    // limit: hook rated load (kg) and ult (ultimate factor) for the weak link, free: true = no rope (jettisoned / falling) }
    // returns F, the force the rope puts on the hook (world, N)
    step(h, hp, hv, env) {
      const p = S.p, v = S.v, F = S.F;
      let fx = 0, fy = -m * G, fz = 0;
      F[0] = F[1] = F[2] = 0;
      // ---- the pendant (pulls only)
      const dx = p[0] - hp[0], dy = p[1] - hp[1], dz = p[2] - hp[2], d = Math.hypot(dx, dy, dz) || 1e-6;
      const ux = dx / d, uy = dy / d, uz = dz / d;
      S.T = 0; S.taut = false;
      if (!env.free && d > S.L) {
        const rate = (v[0] - hv[0]) * ux + (v[1] - hv[1]) * uy + (v[2] - hv[2]) * uz;
        S.T = Math.max(0, k * (d - S.L) + c * rate); S.taut = S.T > 0;
        fx -= S.T * ux; fy -= S.T * uy; fz -= S.T * uz;
        F[0] = S.T * ux; F[1] = S.T * uy; F[2] = S.T * uz;
      }
      S.Tg = S.T / (m * G);
      // the weak link: a snatch past the hook's ultimate load parts the load (it falls)
      if (env.limit && !env.free) {
        if (S.T > env.limit * G * (env.ult || 2.5)) { S.over += h; if (S.over > 0.06) S.parted = true; } else S.over = Math.max(0, S.over - h);
      }
      // ---- the air: wind, downwash, the load's own motion; a bluff body (Cd ~ 1) on its front / side / top areas
      const wx = env.wind ? env.wind[0] : 0, wz = env.wind ? env.wind[1] : 0, wash = env.wash || 0;
      S.wash = wash;
      const ax = v[0] - wx, ay = v[1] + wash, az = v[2] - wz, V = Math.hypot(ax, ay, az);
      if (V > 0.05) {
        const vh = Math.hypot(ax, az), cs = Math.cos(S.yaw), sn = Math.sin(S.yaw);
        // horizontal area by the angle of the air to the load's nose (front vs side), vertical by the top
        const along = vh > 0.01 ? Math.abs((ax * -sn + az * -cs) / vh) : 1, Ah = o.A[0] * along + o.A[1] * (1 - along);
        const fh = vh / V, fv = Math.abs(ay) / V, A = Ah * fh * fh + o.A[2] * fv * fv, q = 0.5 * RHO * V;
        fx -= q * A * ax; fy -= q * A * ay; fz -= q * A * az;
        // flying a bluff load faster than it rides steadily: it sails and oscillates sideways near the pendulum frequency
        const vlim = o.vKt / KT, r = vh / vlim;
        S.air = vh;
        if (r > 0.75 && vh > 1) {
          S.oscPh += h * Math.sqrt(G / S.L) * (1 + 0.04 * Math.sin(S.oscPh * 0.13));
          const amp = 0.25 * (r * r - 0.56) * 0.5 * RHO * vh * vh * o.A[0], s = Math.sin(S.oscPh);
          fx += amp * s * (-az / vh); fz += amp * s * (ax / vh);   // perpendicular to the airflow, in the horizontal
        }
      } else S.air = 0;
      // ---- the ground under the load (its wheels / tracks), and the sea
      const gy = env.ground(p[0], p[2]), bottom = p[1] - o.cg, pen = gy - bottom;
      S.ground = false; S.gN = 0;
      if (pen > 0) {
        const kg = m * 900, cg = 2 * Math.sqrt(kg * m) * 0.7;   // tyres / tracks and soil: stiff, well damped (INFERRED)
        if (v[1] < -0.5 && S.impact < -v[1]) S.impact = -v[1];
        const N = Math.max(0, kg * Math.min(pen, 0.4) - cg * v[1] + (pen > 0.4 ? m * 400 * (pen - 0.4) : 0));
        fy += N; S.ground = true; S.gN = N;
        // friction: holds it still (deadbeat), up to mu N
        const vh = Math.hypot(v[0], v[2]);
        if (vh > 1e-4) { const want = m * vh / h * 0.5, f = Math.min(want, 0.7 * N); fx -= f * v[0] / vh; fz -= f * v[2] / vh; }
      }
      const wet = env.water && env.water(p[0], p[2]) && bottom < 0;
      S.wet = !!wet; S.depth = wet ? Math.min(-bottom, 3) : 0;
      if (wet) {
        const sub = Math.min(1, -bottom / (o.cg * 2.2));
        fy += m * G * 0.35 * sub;                                   // displaced water (a vehicle floats a little)
        fx -= 900 * o.A[0] * v[0] * sub; fy -= 900 * o.A[2] * v[1] * sub; fz -= 900 * o.A[0] * v[2] * sub;
      }
      // ---- integrate (semi-implicit)
      v[0] += fx / m * h; v[1] += fy / m * h; v[2] += fz / m * h;
      p[0] += v[0] * h; p[1] += v[1] * h; p[2] += v[2] * h;
      S.Tpeak = Math.max(S.Tpeak * Math.exp(-h / 3), S.T);
      // swing: the pendant's angle from the vertical (world x / z components, rad)
      S.swing[0] = Math.atan2(p[0] - hp[0], hp[1] - p[1]); S.swing[1] = Math.atan2(p[2] - hp[2], hp[1] - p[1]);
      S.swingDeg = Math.hypot(S.swing[0], S.swing[1]) * 180 / Math.PI;
      // the load's yaw: the swivel lets it turn; it weathervanes slowly toward the airflow and is turned by the bridle
      // back toward the helicopter's heading (INFERRED: a visual, the dynamics above use it only for its area)
      if (env.hookYaw !== undefined && !S.ground) { let e = env.hookYaw - S.yaw; e = Math.atan2(Math.sin(e), Math.cos(e)); S.yaw += e * Math.min(1, h * 0.25); }
      return F;
    },
  };
  return S;
}

// the coupled two-body pendulum (helicopter of mass M holding its height with thrust = (M + m) g, load m on a pendant
// of length L): omega^2 = g (M + m) / (M L) - the hanging load swings faster under a lighter helicopter (CONFIRMED,
// textbook mechanics). Used by the bench.
export const coupledPeriod = (M, m, L) => 2 * Math.PI / Math.sqrt(G * (M + m) / (M * L));

// rotate v (array) by the quaternion q ({x, y, z, w}) into out
function qrot(q, v, out) {
  const x = v[0], y = v[1], z = v[2], qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy; out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz; out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return out;
}
// the hook of a hueyfm.js airframe: hueyfm's env.ext(h, H, Fw, Tw) callback, run in its 240 Hz substep. at = the hook in
// three body axes (HOOKS.uh1h.at). envOf(H) -> the sling's env for this substep (ground, water, wind, wash, ...).
// The rope's pull on the hook goes into the airframe's world force Fw and its torque about the CG Tw.
export function hookExt(getSling, at, envOf) {
  const r = [0, 0, 0], w = [0, 0, 0], hp = [0, 0, 0], hv = [0, 0, 0];
  const ext = (h, H, Fw, Tw) => {
    const S = getSling(); if (!S) return;
    qrot(H.q, at, r); qrot(H.q, [H.w.x, H.w.y, H.w.z], w);   // lever (world) and the world angular velocity
    hp[0] = H.pos.x + r[0]; hp[1] = H.pos.y + r[1]; hp[2] = H.pos.z + r[2];
    hv[0] = H.vel.x + w[1] * r[2] - w[2] * r[1]; hv[1] = H.vel.y + w[2] * r[0] - w[0] * r[2]; hv[2] = H.vel.z + w[0] * r[1] - w[1] * r[0];
    const F = S.step(h, hp, hv, envOf(H, S));
    Fw.x += F[0]; Fw.y += F[1]; Fw.z += F[2];
    Tw.x += r[1] * F[2] - r[2] * F[1]; Tw.y += r[2] * F[0] - r[0] * F[2]; Tw.z += r[0] * F[1] - r[1] * F[0];
    ext.hp = hp; ext.hv = hv;
  };
  ext.hookWorld = (H, out = [0, 0, 0]) => { qrot(H.q, at, r); out[0] = H.pos.x + r[0]; out[1] = H.pos.y + r[1]; out[2] = H.pos.z + r[2]; return out; };
  return ext;
}
// the rotor's downwash at a point below the disc (m/s, + down): ~2 vi in the far wake under the disc, fading outside
// it and blown back as the helicopter picks up speed (momentum theory; the skew INFERRED). vi from the sim's inflow.
export function downwashAt(H, R, px, pz) {
  const vi = Math.max(0, H.li || 0) * Math.max(H.omega || 0, 0) * R;
  const sp = Math.hypot(H.vel.x, H.vel.z), d = Math.hypot(px - H.pos.x, pz - H.pos.z);
  const under = Math.max(0, 1 - Math.max(0, d - R * 0.6) / (R * 0.6));
  return 2 * vi * under * Math.max(0, 1 - sp / 12);
}
