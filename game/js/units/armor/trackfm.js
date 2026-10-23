// trackfm.js - tracked-vehicle dynamics (M60A3, M113A2 and anything else on tracks). PURE: plain JS, no THREE, no DOM,
// no game imports, runs in node (tools/tankbench.mjs). Real units (SI), real gravity.
//
// What is simulated, per fixed substep (default 1/240 s):
// - A 6-DOF rigid hull (CG, diagonal inertia, quaternion attitude, body rates).
// - Running gear: per roadwheel a torsion-bar spring (preloaded, linear rate), a damper on the stations that have
//   shock absorbers, rebound and bump stops. The wheel is massless: its travel is wherever the ground puts it, found by
//   sampling the ground under the wheel circle (5 points), so a wheel rolls up a kerb instead of popping. The idler,
//   the sprocket and the inclined front and rear track runs are rigid contacts sampled along the track envelope: they
//   are what meets a step face or the far wall of a trench, and the track links moving over them pull the vehicle up.
// - Track-ground shear (Wong, "Theory of Ground Vehicles" 3rd ed. 2001, ch. 2.4): shear stress develops with shear
//   displacement j as  tau = tau_max (1 - exp(-|j| / K)),  tau_max = c A + N tan(phi)  (Mohr-Coulomb). Every contact
//   keeps a 2-D shear displacement vector in the ground plane. It grows with the slip velocity of the track link over the
//   ground and relaxes as fresh links arrive (dj/dt = u - j |v_link| / x, x = distance from where links enter the patch),
//   so in steady state j = i x (Wong's equation 2.56, the drawbar pull / slip curve) and at standstill it is a stiff
//   non-linear spring that holds the vehicle on a slope with the brakes on. Longitudinal slip, lateral slip, skid steer
//   and pivot turns all come out of the same law (Wong & Chiang skid-steer theory, simplified to point contacts).
// - Soil: Bekker pressure-sinkage  p = (kc / b + kphi) z^n  gives sinkage and compaction resistance per track; cohesion c,
//   friction angle phi and shear modulus K per surface (SOILS, values from Wong's table 2.3). Hard surfaces (road, rock)
//   use rubber-pad friction instead. Internal track resistance from Wong: R_in = W (222 + 3 V) N, W in t, V in km/h.
// - Drivetrain as four rotating bodies (engine, torque-converter turbine, left and right sprockets) joined by
//   torque-limited constraints solved with sequential impulses: range clutch, steer brake, steer clutch, service brakes.
//   That covers a cross-drive (geared steer, pivot in neutral: CD-850) and a controlled differential (no pivot: M113).
//   Diesel with an all-speed governor and a net torque curve; a Trilok torque converter (capacity factor + torque ratio).
//   The ground load on each sprocket is treated implicitly (its slope with sprocket speed), so stiff soil is stable.
// - Water: buoyancy from hull columns, hydrodynamic drag, track propulsion when swimming (paddle thrust from the
//   track's slip through the water), the engine flooding when the air intake goes under, a swimming hull leaking.
// - Hull contacts (belly, nose, tail, sides, roof, turret, gun muzzle) for high-centring, rollovers and digging the gun
//   in; vertical-cylinder / box obstacles (trees, walls, other vehicles) from the environment.
//
// THE ENVIRONMENT INTERFACE (what a game host passes to step()):
//   env.height(x, z)          -> terrain surface height (m) at world x, z.                                   REQUIRED
//   env.surface?(x, z)        -> surface id, a key of SOILS ('paved', 'rock', 'dirt', 'grass', 'sand', 'mud', 'bog',
//                                'snow'); default 'dirt'. Unknown ids fall back to 'dirt'.
//   env.water?(x, z)          -> water surface height (m) or -Infinity where there is no water.
//   env.obstacles?(x, z, r)   -> array of obstacles near (x, z) within r: { kind: 'cyl', x, z, r, top, id, breakN? } or
//                                { kind: 'box', x, z, hx, hz, yaw, top, id, breakN? } (plan-view shapes with a top
//                                height). breakN = force (N) above which it gives way (a tree) -> event 'knockdown'.
//                                Called once per step with the hull's bounding radius; may return the same array.
//   env.wind?                 -> unused here (ballistics read it).
// World axes are three.js: x east, y up, z south. Body axes: x right, y up, z AFT (forward is -z), like the jet.
// The hull frame origin is on the ground plane at static ride height, half way along the track contact, on the centre
// line; params give everything in that frame and CG is an offset in it. sim.pos is the CG; sim.origin() the hull frame.
//
// Controls (sim.ctl): throttle 0..1 (accelerator: governor setting), brake 0..1 (service brake), steer -1..1 (T-bar or
// laterals; + = right), range: one of P.TRANS.ranges names ('R', 'N', 'L', 'H', ...), park (bool), starter (bool),
// fuelOn (bool). M113 automatic ranges: '1'..'3' are upper limits of the automatic shift.
// Output per step: an array of events { type, ... } (see EVENTS below).

export const G0 = 9.81, RHO_W = 1000, RHO_A = 1.225, KMH = 3.6, RPM = 30 / Math.PI;

// --------------------------------------------------------------------------------------------------- surfaces
// Bekker / Mohr-Coulomb soil values: n, kc (kN/m^(n+1)), kphi (kN/m^(n+2)), c (kPa), phi (deg), K (m, shear modulus).
// Sources: Wong 2001 table 2.3 (Bekker data: Land Locomotion Lab / WES / Thailand), K from Wong table 2.5 / ch 2.4.
// CONFIRMED for n, kc, kphi, c, phi of the named soils; the mapping of game surfaces to soils and K are INFERRED.
// mu: track pad friction for hard surfaces (rubber pads on dry road / rock: 0.75 / 0.6, INFERRED, typical tyre-rubber).
// roll: extra rolling resistance coefficient (vegetation, ruts) on top of internal + compaction, INFERRED.
export const SOILS = {
  paved: { hard: true, mu: 0.75, K: 0.004, roll: 0.0, color: '#5a5a58' },
  rock: { hard: true, mu: 0.62, K: 0.006, roll: 0.005, color: '#77736a' },
  dirt: { n: 0.2, kc: 16.43, kphi: 1724.69, c: 6.9, phi: 30, K: 0.015, roll: 0.01, color: '#7a6a4a' },     // lean clay 22% moisture (WES), cohesion cut from 68.95 (packed track) INFERRED
  grass: { n: 0.9, kc: 52.53, kphi: 1127.97, c: 4.83, phi: 20, K: 0.025, roll: 0.02, color: '#55703a' },    // sandy loam 11% (LLL, Michigan)
  sand: { n: 1.1, kc: 0.99, kphi: 1528.43, c: 1.04, phi: 28, K: 0.025, roll: 0.02, color: '#c8b27a' },      // dry sand (LLL)
  mud: { n: 0.11, kc: 1.84, kphi: 103.27, c: 20.69, phi: 6, K: 0.04, roll: 0.03, color: '#4d3f2c' },        // heavy clay 40% (WES)
  bog: { n: 0.5, kc: 0.8, kphi: 32.0, c: 3.0, phi: 4, K: 0.05, roll: 0.05, color: '#3b3a25' },              // saturated peat / muskeg, INFERRED (Wong's muskeg data are a different model)
  snow: { n: 1.6, kc: 4.37, kphi: 196.72, c: 1.03, phi: 19.7, K: 0.04, roll: 0.02, color: '#e8ecef' },      // snow (US, Wong)
};
for (const s of Object.values(SOILS)) if (!s.hard) s.tanphi = Math.tan(s.phi * Math.PI / 180);

// ------------------------------------------------------------------------------------------------- tiny maths
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sgn = v => v > 0 ? 1 : v < 0 ? -1 : 0;
export function interp(tab, x) {   // piecewise linear over [[x, y], ...] (sorted), clamped at the ends
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return tab[tab.length - 1][1];
}
// quaternion {x,y,z,w} -> row-major 3x3 (body -> world: v_w = R v_b; columns are the body axes in world)
function quatToMat(q, m) {
  const { x, y, z, w } = q, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = 1 - (yy + zz); m[1] = xy - wz; m[2] = xz + wy;
  m[3] = xy + wz; m[4] = 1 - (xx + zz); m[5] = yz - wx;
  m[6] = xz - wy; m[7] = yz + wx; m[8] = 1 - (xx + yy);
  return m;
}
export function quatFromYPR(yaw, pitch = 0, roll = 0) {   // three.js 'YXZ' order: heading about y (left +), pitch about x, roll about z
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2), cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
  // q = qy * qx * qz
  return { x: cy * sp * cr + sy * cp * sr, y: sy * cp * cr - cy * sp * sr, z: cy * cp * sr - sy * sp * cr, w: cy * cp * cr + sy * sp * sr };
}

// ------------------------------------------------------------------------------------------------- events
// { type: 'stall' }                       engine stopped (lugged below its idle, out of fuel, flooded)
// { type: 'flooded', where: 'engine'|'crew' }  water over the air intake / into the crew compartment
// { type: 'thrown', side: 0|1 }           a track came off (side load while turning hard at speed, or damage)
// { type: 'bellied' }                     high-centred: the hull carries most of the weight
// { type: 'rollover' }                    on its side or roof
// { type: 'swimming', on: bool }          afloat (buoyancy carries the vehicle) / grounded again
// { type: 'sinking' }                     taking water faster than the pumps clear it while afloat
// { type: 'knockdown', id }               pushed over an obstacle that has breakN
// { type: 'impact', speed, where }        hull struck the ground / an obstacle hard (m/s into the contact)
// { type: 'gunDug' }                      the gun muzzle went into the ground (barrel obstruction)

// ------------------------------------------------------------------------------------------------- the sim
export function createTrackSim(P, opt = {}) {
  const T = P.TRACK, S = P.SUSP, E = P.ENGINE, X = P.TRANS, W = P.WATER || {};
  const sim = {
    P, h: opt.substep || 1 / 240, t: 0,
    mass: P.MASS, I: P.I.slice(), pos: [0, 0, 0], vel: [0, 0, 0], q: { x: 0, y: 0, z: 0, w: 1 }, w: [0, 0, 0], R: new Float64Array(9),
    ctl: { throttle: 0, brake: 0, steer: 0, range: 'N', park: true, starter: false, fuelOn: true },
    eng: { w: 0, running: false, crank: 0, fuel: P.FUEL_L ?? 1000, torque: 0, power: 0, load: 0, inj: 0, temp: 70, oilP: 0, flooded: false },
    turb: 0, spr: [0, 0], sprAng: [0, 0], trackPos: [0, 0], range: 'N', shiftT: 0, autoGear: 1,
    dmg: { engine: 1, trans: 1, finalL: 1, finalR: 1, susp: null, thrown: [false, false], steer: 1, brakes: 1 },
    water: { depth: 0, afloat: false, inside: 0, pumps: !!W.PUMPS, vane: false, ingress: 0, sunk: false, bilge: 0 },
    soil: ["dirt", "dirt"], sink: [0, 0], loadF: [0, 0], slipF: [0, 0], slip: [0, 0], load: [0, 0], wheels: [[], []], contacts: [], hullLoad: 0,
    state: { rolled: false, bellied: false, rollT: 0, belT: 0, throwT: [0, 0] },
    out: { speed: 0, fwd: 0, yawRate: 0, pitch: 0, roll: 0, heading: 0, drawbar: 0, sprTorque: [0, 0], conv: { sr: 0, tr: 1 }, impact: 0 },
    events: [],
  };
  const R = sim.R;
  // ---- running gear layout (hull frame, origin on the ground at static ride, centre of contact)
  const B2 = T.GAUGE / 2, RW = T.WHEEL_R + T.THICK;            // wheel radius to the track's ground face
  const nW = T.WHEELS.length, wheelLoad0 = P.MASS * G0 / (2 * nW);
  const zFront = Math.min(...T.WHEELS), zRear = Math.max(...T.WHEELS), contactLen = (zRear - zFront) + 2 * RW * 0.32;
  for (let s = 0; s < 2; s++) for (let i = 0; i < nW; i++) {
    const k = S.K[i] ?? S.K, c = S.C[i] ?? 0;
    sim.wheels[s].push({ z: T.WHEELS[i], k, c, pre: wheelLoad0 / k * (S.LOADF ? S.LOADF[i] : 1), s: 0, sPrev: 0, ds: 0, N: 0, on: false, j: [0, 0, 0], a: 0, hp: 1 });
  }
  // rigid envelope samples: idler + sprocket arcs, front + rear runs.  type 'run' -> track links (drive), 'hull' -> plain
  const env0 = [];   // { b:[x,y,z] body, n:[..] outward normal, t:[..] link direction for +omega, x: patch distance, side, kind }
  const front = T.FRONT, rear = T.REAR;   // { z, y, r } of the front and rear wheel (idler or sprocket)
  for (let s = 0; s < 2; s++) {
    const x = s ? B2 : -B2;
    // arcs: angles in the y-z plane from straight down (0) toward forward (front arc) / aft (rear arc)
    const arc = (c, sideSign, n) => {
      const rr = c.r + T.THICK;
      for (let k = 0; k < n; k++) {
        const a = (k + 0.5) / n * Math.PI * 0.62 + 0.05;     // ~3..115 deg from down
        const ry = -Math.cos(a), rz = sideSign * Math.sin(a); // unit radius (y, z); sideSign -1 = forward (front arc)
        env0.push({ b: [x, c.y + ry * rr, c.z + rz * rr], n: [0, ry, rz], t: [0, rz, -ry], x: 0.2, side: s, kind: 'run', mu: 1 });
      }
    };
    arc(front, -1, 6); arc(rear, +1, 6);
    // runs: front run from the front wheel's bottom-tangent to wheel 1's bottom, rear run from the last wheel to the rear wheel
    const run = (z0, y0, z1, y1, n) => {   // from (z0,y0) toward (z1,y1); link direction from front toward rear on the bottom
      const dz = z1 - z0, dy = y1 - y0, L = Math.hypot(dz, dy), tz = dz / L, ty = dy / L;
      // outward normal: perpendicular, pointing down (away from the hull interior)
      let ny = -tz, nz = ty; if (ny > 0) { ny = -ny; nz = -nz; }
      for (let k = 1; k <= n; k++) { const f = k / (n + 1); env0.push({ b: [x, y0 + dy * f, z0 + dz * f], n: [0, ny, nz], t: [0, ty, tz], x: 0.2, side: s, kind: 'run', mu: 1 }); }
    };
    run(front.z + 0.15, front.y - front.r * 0.75, zFront - 0.05, 0.0, 4);
    run(zRear + 0.05, 0.0, rear.z - 0.15, rear.y - rear.r * 0.75, 4);
  }
  for (const h of P.HULL.PROBES) env0.push({ b: h.p, n: h.n, t: [0, 0, 0], x: 1, side: -1, kind: 'hull', mu: h.mu ?? 0.5, name: h.name, j: [0, 0, 0] });
  for (const c of env0) { c.j = [0, 0, 0]; c.N = 0; c.d = 0; c.on = false; }
  sim.contacts = env0;
  // ---- buoyancy columns: P.HULL.COLS = [{ x, z, ax, az, y0, y1 }]: centre (x, z), half sizes, bottom / top heights
  const COLS = P.HULL.COLS || [];
  const extraVol = W.RUNNING_GEAR_VOL || 0;   // track + wheels displacement, m3, spread over the bottom row
  const colVolBelow = extraVol / Math.max(1, COLS.length);
  // ---- effective inertias
  const Js = T.J_SPROCKET;   // track + wheels + final drive reflected to one sprocket, kg m2
  // bounding radius for obstacle queries
  let bound = 0; for (const c of env0) bound = Math.max(bound, Math.hypot(c.b[0], c.b[2])); bound += 0.5;

  // ---------------------------------------------------------------------------------------------- reset / pose
  sim.reset = (x, z, yaw = 0, env = null, o = {}) => {
    // sit on the ground: fit a plane through the ground under the four corners of the track contact (unless given)
    let pitch = o.pitch, roll = o.roll, gy = o.y;
    if (env) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), L2 = contactLen / 2;
      const h = (a, b) => env.height(x + fx * a + rx * b, z + fz * a + rz * b);
      const hFL = h(L2, -B2), hFR = h(L2, B2), hRL = h(-L2, -B2), hRR = h(-L2, B2);
      pitch ??= Math.atan2((hFL + hFR) - (hRL + hRR), 2 * contactLen);
      roll ??= Math.atan2((hFR + hRR) - (hFL + hRL), 2 * T.GAUGE);
      gy ??= Math.max((hFL + hFR + hRL + hRR) / 4, env.height(x, z) - 0.3);
    }
    const q = quatFromYPR(yaw, pitch || 0, roll || 0); Object.assign(sim.q, q); quatToMat(sim.q, R);
    const cg = P.CG, oy = (gy ?? 0) + (o.drop ?? 0);
    // CG world = origin + R cg
    sim.pos[0] = x + R[0] * cg[0] + R[1] * cg[1] + R[2] * cg[2]; sim.pos[1] = oy + R[3] * cg[0] + R[4] * cg[1] + R[5] * cg[2]; sim.pos[2] = z + R[6] * cg[0] + R[7] * cg[1] + R[8] * cg[2];
    sim.sink.fill(0); sim.loadF.fill(P.MASS * G0 / 2); sim.slipF.fill(0);
    sim.vel.fill(0); sim.w.fill(0); sim.spr.fill(0); sim.turb = 0;
    if (o.speed) { const fx = -R[2], fz = -R[8]; sim.vel[0] = fx * o.speed; sim.vel[2] = fz * o.speed; sim.spr[0] = sim.spr[1] = o.speed / T.SPROCKET_R; }
    for (const side of sim.wheels) for (const w of side) { w.s = w.sPrev = 0; w.j.fill(0); }
    for (const c of env0) c.j.fill(0);
    const run = o.running ?? true;
    Object.assign(sim.eng, { running: run, w: run ? E.IDLE / RPM : 0, flooded: false, inj: 0 });
    sim.ctl.range = o.range ?? 'N'; sim.range = sim.ctl.range; sim.ctl.park = o.park ?? !o.speed; sim.ctl.throttle = 0; sim.ctl.brake = 0; sim.ctl.steer = 0;
    if (o.speed && X.ranges[sim.ctl.range]) { sim.turb = sim.spr[0] * rangeRatio(sim.ctl.range); sim.eng.w = Math.max(sim.eng.w, sim.turb * 1.05); }
    Object.assign(sim.water, { afloat: false, inside: 0, ingress: 0, sunk: false });
    sim.dmg.thrown = [false, false]; Object.assign(sim.state, { rolled: false, bellied: false, rollT: 0, belT: 0, throwT: [0, 0] });
    sim.t = 0; sim.events.length = 0;
    return sim;
  };
  sim.origin = (out = [0, 0, 0]) => {   // hull frame origin in world
    const c = P.CG; out[0] = sim.pos[0] - (R[0] * c[0] + R[1] * c[1] + R[2] * c[2]); out[1] = sim.pos[1] - (R[3] * c[0] + R[4] * c[1] + R[5] * c[2]); out[2] = sim.pos[2] - (R[6] * c[0] + R[7] * c[1] + R[8] * c[2]); return out;
  };
  // body point (hull frame) -> world
  sim.toWorld = (b, out = [0, 0, 0]) => {
    const dx = b[0] - P.CG[0], dy = b[1] - P.CG[1], dz = b[2] - P.CG[2];
    out[0] = sim.pos[0] + R[0] * dx + R[1] * dy + R[2] * dz; out[1] = sim.pos[1] + R[3] * dx + R[4] * dy + R[5] * dz; out[2] = sim.pos[2] + R[6] * dx + R[7] * dy + R[8] * dz; return out;
  };
  sim.attitude = () => {   // heading (rad, 0 = facing -z / north, + = left / CCW like three.js), pitch (+ nose up), roll (+ right side UP, three.js z sense)
    const fx = -R[2], fy = -R[5], fz = -R[8];
    return { heading: Math.atan2(-fx, -fz), pitch: Math.asin(clamp(fy, -1, 1)), roll: Math.atan2(R[3], R[4]) };
  };
  function rangeRatio(name) { const r = X.ranges[name]; return r ? r.ratio * X.FINAL : 0; }   // turbine / sprocket
  sim.rangeRatio = rangeRatio;

  // ---------------------------------------------------------------------------------------------- engine maps
  const Tmax = rpm => interp(E.CURVE, rpm);                       // net torque at the flywheel, N m (full rack)
  const Tfric = rpm => E.FRICTION[0] + E.FRICTION[1] * rpm / 1000; // motoring friction + pumping, N m
  const C = P.CONV;
  // torque converter: impeller torque = (w_e / Kf(sr))^2 (Kf in (rad/s)/sqrt(N m)), turbine torque = TR(sr) x impeller
  function converter(we, wt) {
    if (we < 1 && Math.abs(wt) < 1) return [0, 0, 0, 1];
    if (wt <= we * 1.0) {   // driving
      const sr = we > 1e-3 ? clamp(wt / we, -1, 1) : 0;
      const tr = sr < C.COUPLING ? lerp(C.STALL_TR, 1, Math.max(0, sr) / C.COUPLING) : 1;
      const kf = C.KF * (sr < C.COUPLING ? 1 : 1 / Math.sqrt(Math.max(0.004, (1 - sr) / (1 - C.COUPLING))));
      const tp = (we / kf) ** 2 * (sr < 0 ? 1 + 0.5 * -sr : 1);
      return [tp, tp * tr, sr, tr];
    }
    // overrun (vehicle drives the engine: engine braking through the converter), roughly symmetric, softer
    const sr = wt / Math.max(we, 1), kf = C.KF * C.OVERRUN / Math.sqrt(Math.max(0.004, (sr - 1) / (1 - C.COUPLING)));
    const tp = -((wt / kf) ** 2); return [tp, tp, sr, 1];
  }

  // ---------------------------------------------------------------------------------------------- contact helpers
  const _p = [0, 0, 0], _v = [0, 0, 0], _r = [0, 0, 0];
  // depth of world point p inside the terrain measured along direction e (unit; the way the point must move to get out).
  // Heightfield marching with a bisection refine; e is the contact's inward normal (into the vehicle).
  function depthAlong(env, px, py, pz, ex, ey, ez, h0) {
    if (py >= h0) return 0;
    // flat-ground guess
    if (ey > 0.35) { const t0 = (h0 - py) / ey; if (t0 < 0.03 || py + t0 * ey >= env.height(px + t0 * ex, pz + t0 * ez) - 1e-3) return Math.min(t0, 1.2); }
    let lo = 0, hi = -1;
    for (let t = 0.06; t <= 1.2; t += 0.06) { if (py + t * ey >= env.height(px + t * ex, pz + t * ez)) { hi = t; break; } lo = t; }
    if (hi < 0) return 1.2;
    for (let k = 0; k < 4; k++) { const m = (lo + hi) / 2; if (py + m * ey >= env.height(px + m * ex, pz + m * ez)) hi = m; else lo = m; }
    return hi;
  }
  function soilAt(env, x, z) { const id = env.surface ? env.surface(x, z) : 'dirt'; return SOILS[id] ? id : 'dirt'; }

  // shear force at a contact (Wong's exponential law on a 2-D shear displacement). Writes the world force into F,
  // returns dF_fwd/d(omega) / r^2 for the implicit sprocket term (only meaningful for track contacts).
  const _u = [0, 0, 0];
  function shear(c, N, n, u, relax, tauMax, K, damp, dt, F, commit) {
    // project the shear displacement and the slip velocity on the ground tangent plane
    const jn = c.j[0] * n[0] + c.j[1] * n[1] + c.j[2] * n[2];
    let jx = c.j[0] - n[0] * jn, jy = c.j[1] - n[1] * jn, jz = c.j[2] - n[2] * jn;
    const un = u[0] * n[0] + u[1] * n[1] + u[2] * n[2], ux = u[0] - n[0] * un, uy = u[1] - n[1] * un, uz = u[2] - n[2] * un;
    const f = 1 / (1 + relax * dt);   // implicit relaxation
    jx = (jx + ux * dt) * f; jy = (jy + uy * dt) * f; jz = (jz + uz * dt) * f;
    let jm = Math.hypot(jx, jy, jz); const jcap = 3 * K;
    if (jm > jcap) { const s = jcap / jm; jx *= s; jy *= s; jz *= s; jm = jcap; }
    const e = Math.exp(-jm / K), tau = tauMax * (1 - e), kj = jm > 1e-9 ? tau / jm : tauMax / K;
    let fx = -kj * jx - damp * ux, fy = -kj * jy - damp * uy, fz = -kj * jz - damp * uz;
    const fm = Math.hypot(fx, fy, fz);
    if (fm > tauMax && fm > 0) { const s = tauMax / fm; fx *= s; fy *= s; fz *= s; }
    F[0] = fx; F[1] = fy; F[2] = fz;
    if (commit) { c.j[0] = jx; c.j[1] = jy; c.j[2] = jz; }
    // slope of the force with the slip velocity (the small-displacement stiffness) -> implicit drivetrain term
    return fm > tauMax ? damp * 0.2 : (tauMax / K) * e * dt * f + damp;
  }

  // ---------------------------------------------------------------------------------------------- one substep
  const F = [0, 0, 0], Tq = [0, 0, 0], Fc = [0, 0, 0], nW_ = [0, 0, 0], dW = [0, 0, 0], tW = [0, 0, 0], linkV = [0, 0, 0];
  const sideD = [0, 0], sideF0 = [0, 0], sideN = [0, 0], sideLat = [0, 0], sideCnt = [0, 0];
  let obsList = [];
  const lastEv = {};
  // contact list for this substep (filled by the geometry pass, consumed by the force pass)
  const act = [];   // { c (wheel or envelope contact), px,py,pz (world contact point), n (world), N, side, kind, tauMax, K, damp, relax, linkDir (world unit) }
  for (let i = 0; i < 160; i++) act.push({ c: null, p: [0, 0, 0], n: [0, 0, 0], t: [0, 0, 0], N: 0, side: 0, kind: '', tauMax: 0, K: 0, damp: 0, relax: 0, r: [0, 0, 0] });
  let nAct = 0;

  function addAct(c, p, n, t, N, side, kind, soil, mu, relax) {
    const a = act[nAct++]; a.c = c; a.p[0] = p[0]; a.p[1] = p[1]; a.p[2] = p[2]; a.n[0] = n[0]; a.n[1] = n[1]; a.n[2] = n[2];
    a.t[0] = t[0]; a.t[1] = t[1]; a.t[2] = t[2]; a.N = N; a.side = side; a.kind = kind; a.relax = relax;
    a.r[0] = p[0] - sim.pos[0]; a.r[1] = p[1] - sim.pos[1]; a.r[2] = p[2] - sim.pos[2];
    const S0 = SOILS[soil];
    if (kind === 'hull') { a.tauMax = N * mu * (S0.hard ? 1 : 0.8); a.K = 0.01; }
    else if (S0.hard) { a.tauMax = N * S0.mu * mu; a.K = S0.K; }
    else { const area = T.WIDTH * contactLen / (nW + 2); a.tauMax = (S0.c * 1000 * area * (N > 0 ? Math.min(1, N / (wheelLoad0 * 0.25)) : 0) + N * S0.tanphi) * mu; a.K = S0.K; }
    // shear damping ~ critical for the contact's share of the mass, never more than the friction limit allows
    a.damp = 0.6 * Math.sqrt(Math.max(1, a.tauMax / a.K) * sim.mass / 14);
    return a;
  }

  function substep(dt, env) {
    const ctl = sim.ctl, ev = sim.events;
    const once = (type, e) => { if (sim.t - (lastEv[type] ?? -9) < 0.6) return; lastEv[type] = sim.t; e.type = type; ev.push(e); };   // rate-limited events
    quatToMat(sim.q, R);
    const up = [R[1], R[4], R[7]];
    // world angular velocity
    const wx = R[0] * sim.w[0] + R[1] * sim.w[1] + R[2] * sim.w[2], wy = R[3] * sim.w[0] + R[4] * sim.w[1] + R[5] * sim.w[2], wz = R[6] * sim.w[0] + R[7] * sim.w[1] + R[8] * sim.w[2];
    const pointVel = (p, out) => { const rx = p[0] - sim.pos[0], ry = p[1] - sim.pos[1], rz = p[2] - sim.pos[2]; out[0] = sim.vel[0] + wy * rz - wz * ry; out[1] = sim.vel[1] + wz * rx - wx * rz; out[2] = sim.vel[2] + wx * ry - wy * rx; return out; };
    const bodyToWorldDir = (b, out) => { out[0] = R[0] * b[0] + R[1] * b[1] + R[2] * b[2]; out[1] = R[3] * b[0] + R[4] * b[1] + R[5] * b[2]; out[2] = R[6] * b[0] + R[7] * b[1] + R[8] * b[2]; return out; };
    F[0] = 0; F[1] = -sim.mass * G0; F[2] = 0; Tq[0] = Tq[1] = Tq[2] = 0;
    const addF = (p, f) => { F[0] += f[0]; F[1] += f[1]; F[2] += f[2]; const rx = p[0] - sim.pos[0], ry = p[1] - sim.pos[1], rz = p[2] - sim.pos[2]; Tq[0] += ry * f[2] - rz * f[1]; Tq[1] += rz * f[0] - rx * f[2]; Tq[2] += rx * f[1] - ry * f[0]; };
    nAct = 0; sideN[0] = sideN[1] = 0; sideCnt[0] = sideCnt[1] = 0;
    let hullN = 0, maxImpact = 0;
    // soil under each track (at the track centre)
    for (let s = 0; s < 2; s++) { sim.toWorld([s ? B2 : -B2, 0, 0], _p); sim.soil[s] = soilAt(env, _p[0], _p[2]); }

    // ---- 1. roadwheels (sprung)
    const rebound = S.REBOUND, bump = S.BUMP;
    for (let s = 0; s < 2; s++) {
      const x = s ? B2 : -B2, soil = SOILS[sim.soil[s]], sink = sim.sink[s], thrown = sim.dmg.thrown[s];
      const rad = thrown ? T.WHEEL_R : RW;
      for (const wh of sim.wheels[s]) {
        // sample the wheel circle (track face) at 5 points along the hull's fore-aft axis; travel needed at each
        let best = -1e9, bestA = 0, bh = 0;
        const hubY = RW;   // nominal hub height (s = 0)
        for (let k = -2; k <= 2; k++) {
          const a = k * 0.36 * rad, yb = hubY - Math.sqrt(rad * rad - a * a);
          sim.toWorld([x, yb, wh.z + a], _p);
          const gh = env.height(_p[0], _p[2]) - sink;
          const lift = (gh - _p[1]) / Math.max(0.35, up[1]);
          if (lift > best) { best = lift; bestA = a; bh = gh; }
        }
        wh.sPrev = wh.s;
        if (wh.hp <= 0) { wh.on = false; wh.s = 0; continue; }
        if (best < -rebound) { wh.on = false; wh.s = -rebound; wh.raw = -rebound + sink; wh.N = 0; wh.ds = 0; continue; }
        const sNew = best, raw = best + sink;   // the damper sees the motion over the unsunk ground (sinkage is plastic)
        wh.ds = clamp((raw - (wh.raw ?? raw)) / dt, -2.5, 2.5); wh.raw = raw; wh.s = sNew;
        // the preloaded torsion bar holds the arm on its rebound stop until the ground load exceeds the preload: in
        // between, the stop is a stiff spring (no force step when a hanging wheel touches down)
        let Fs = Math.min(wh.k * (sNew + wh.pre), S.BUMP_K * (sNew + rebound));
        if (sNew > bump) Fs += S.BUMP_K * (sNew - bump) + S.BUMP_C * Math.max(0, wh.ds);
        Fs += wh.c * wh.ds;
        if (sNew > bump + 0.12) maxImpact = Math.max(maxImpact, wh.ds);
        const N = Math.max(0, Fs) * (wh.hp < 1 ? 0.5 + 0.5 * wh.hp : 1);
        wh.N = N; wh.on = N > 0; wh.a = bestA;
        if (!wh.on) continue;
        // contact point and normal (from the contact toward the wheel centre: up and back when a kerb is ahead)
        const ry = Math.sqrt(Math.max(0, rad * rad - bestA * bestA));
        const yb = hubY + sNew - ry;
        sim.toWorld([x, yb, wh.z + bestA], _p);
        bodyToWorldDir([0, ry / rad, -bestA / rad], nW_);
        bodyToWorldDir([0, 0, 1], tW);   // link motion on the bottom run for +omega: aft
        const xpatch = Math.max(0.15, wh.z - zFront + 0.2);
        { const a = addAct(wh, _p, nW_, tW, N, s, thrown ? 'wheel' : 'track', sim.soil[s], 1, 0); a.xp = sim.spr[s] >= 0 ? xpatch : Math.max(0.15, contactLen - xpatch + 0.4); }
        sideN[s] += N; sideCnt[s]++;
      }
    }
    // ---- 2. rigid envelope (idler / sprocket arcs, runs) and hull probes
    if (env.obstacles) obsList = env.obstacles(sim.pos[0], sim.pos[2], bound) || [];
    for (const c of env0) {
      if (c.kind === 'run' && sim.dmg.thrown[c.side]) continue;
      sim.toWorld(c.b, _p);
      bodyToWorldDir(c.n, nW_);
      const sink = c.side >= 0 ? sim.sink[c.side] : 0;
      const gh = env.height(_p[0], _p[2]) - sink;
      let d = 0, nx = -nW_[0], ny = -nW_[1], nz = -nW_[2];   // inward normal (direction to push the hull)
      if (_p[1] < gh) d = depthAlong(env, _p[0], _p[1], _p[2], nx, ny, nz, gh);
      // obstacles (plan view), pushing horizontally out
      let od = 0, onx = 0, onz = 0, oid = null, obr = 0;
      for (const o of obsList) {
        if (_p[1] > o.top) continue;
        if (o.kind === 'cyl') { const dx = _p[0] - o.x, dz = _p[2] - o.z, dd = Math.hypot(dx, dz); if (dd < o.r && o.r - dd > od) { od = o.r - dd; onx = dd > 1e-6 ? dx / dd : 1; onz = dd > 1e-6 ? dz / dd : 0; oid = o; } }
        else if (o.kind === 'box') {
          const co = Math.cos(o.yaw || 0), si = Math.sin(o.yaw || 0), dx = _p[0] - o.x, dz = _p[2] - o.z, lx = dx * co - dz * si, lz = dx * si + dz * co;
          const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
          if (px > 0 && pz > 0) { const m = Math.min(px, pz); if (m > od) { od = m; oid = o; if (px < pz) { const sx = sgn(lx); onx = sx * co; onz = -sx * si; } else { const sz = sgn(lz); onx = sz * si; onz = sz * co; } } }
        }
      }
      if (od > d) { d = od; nx = onx; ny = 0; nz = onz; }
      c.on = d > 0; c.d = d;
      if (!c.on) { c.N = 0; c.j[0] *= 0.9; c.j[1] *= 0.9; c.j[2] *= 0.9; continue; }
      d = Math.min(d, 0.5);
      pointVel(_p, _v);
      const dn = -(_v[0] * nx + _v[1] * ny + _v[2] * nz);   // closing speed
      if (dn > 1.5) maxImpact = Math.max(maxImpact, dn);
      const k = c.kind === 'hull' ? P.HULL.K : T.RUN_K, cd = c.kind === 'hull' ? P.HULL.C : T.RUN_C;
      const N = Math.max(0, k * d + cd * dn);
      c.N = N;
      if (oid && od === d && oid.breakN && N > oid.breakN) { ev.push({ type: 'knockdown', id: oid.id }); oid.top = -1e9; }
      // contact point on the surface
      _p[0] += nx * d; _p[1] += ny * d; _p[2] += nz * d;
      nW_[0] = nx; nW_[1] = ny; nW_[2] = nz;
      if (c.kind === 'run') { bodyToWorldDir(c.t, tW); const a = addAct(c, _p, nW_, tW, N, c.side, 'track', sim.soil[c.side], 1, 0); a.xp = 0.15; sideN[c.side] += N; }
      else { const a = addAct(c, _p, nW_, [0, 0, 0], N, -1, 'hull', soilAt(env, _p[0], _p[2]), c.mu, 0); a.xp = 1; hullN += N; if (c.name === 'muzzle' && d > 0.05) once('gunDug', {}); }
    }
    sim.out.impact = maxImpact;
    if (maxImpact > 4) once('impact', { speed: maxImpact });

    // ---- 3. soil: sinkage per track from the mean ground pressure (Bekker), compaction resistance
    const resist = [0, 0];
    for (let s = 0; s < 2; s++) {
      const so = SOILS[sim.soil[s]]; sim.load[s] = sideN[s];
      if (so.hard) { sim.sink[s] = 0; continue; }
      // soil deforms plastically and slowly: sinkage follows a low-passed load and slip (no 240 Hz feedback loop)
      sim.loadF[s] = lerp(sim.loadF[s], sideN[s], Math.min(1, dt / 0.5)); sim.slipF[s] = lerp(sim.slipF[s], clamp(sim.slip[s], 0, 1), Math.min(1, dt / 0.8));
      const b = sim.dmg.thrown[s] ? 0.25 : T.WIDTH, p = sim.loadF[s] / (b * contactLen) / 1000;   // kPa
      const z0 = Math.pow(Math.max(0, p) / (so.kc / b + so.kphi), 1 / so.n);
      const zt = Math.min(P.HULL.CLEAR + 0.25, z0 * (1 + 1.2 * sim.slipF[s]));      // slip sinkage, INFERRED
      // sinks quickly, recovers only slowly (the rut stays): rate limited
      const rate = zt > sim.sink[s] ? 0.25 : 0.05;
      sim.sink[s] += clamp(zt - sim.sink[s], -rate * dt, rate * dt);
      // compaction resistance per track (Wong eq. 2.83): R = b (kc/b + kphi) z^(n+1) / (n+1)
      resist[s] = b * (so.kc / b + so.kphi) * 1000 * Math.pow(sim.sink[s], so.n + 1) / (so.n + 1);
    }

    // ---- 4. drivetrain: predicted ground load on each sprocket and its slope (implicit), then the constraint solve
    const r = T.SPROCKET_R;
    sideD[0] = sideD[1] = 0; sideF0[0] = sideF0[1] = 0;
    for (let i = 0; i < nAct; i++) {
      const a = act[i]; if (a.kind !== 'track') continue;
      const om = sim.spr[a.side] * (sim.dmg.thrown[a.side] ? 0 : 1);
      pointVel(a.p, _u); _u[0] += a.t[0] * r * om; _u[1] += a.t[1] * r * om; _u[2] += a.t[2] * r * om;
      const relax = Math.abs(r * om) / a.xp + 0.0;
      const dFdu = shear(a.c, a.N, a.n, _u, relax, a.tauMax, a.K, a.damp, dt, Fc, false);
      const ft = Fc[0] * a.t[0] + Fc[1] * a.t[1] + Fc[2] * a.t[2];   // force on the link along its motion
      sideF0[a.side] += ft * r;                                       // torque the ground puts on the sprocket (+ = helps +omega)
      const tl = a.t[0] * a.t[0] + a.t[1] * a.t[1] + a.t[2] * a.t[2];
      sideD[a.side] += r * r * dFdu * tl;
    }
    drivetrain(dt, env, resist);

    // ---- 5. final shear forces with the new sprocket speeds -> hull
    sideLat[0] = sideLat[1] = 0;
    let slipNum = [0, 0], slipDen = [0, 0];
    for (let i = 0; i < nAct; i++) {
      const a = act[i];
      // normal force
      Fc[0] = a.n[0] * a.N; Fc[1] = a.n[1] * a.N; Fc[2] = a.n[2] * a.N; addF(a.p, Fc);
      pointVel(a.p, _u);
      let relax = 0;
      if (a.kind === 'track') {
        const om = sim.spr[a.side] * (sim.dmg.thrown[a.side] ? 0 : 1);
        _u[0] += a.t[0] * r * om; _u[1] += a.t[1] * r * om; _u[2] += a.t[2] * r * om; relax = Math.abs(r * om) / a.xp;
        slipNum[a.side] += Math.abs(_u[0] * a.t[0] + _u[1] * a.t[1] + _u[2] * a.t[2]) * a.N; slipDen[a.side] += Math.max(0.3, Math.abs(r * om)) * a.N;
      } else if (a.kind === 'wheel') {   // a roadwheel without its track: rolls freely fore-aft, resists sideways
        const tx = a.t[0], ty = a.t[1], tz = a.t[2], ut = _u[0] * tx + _u[1] * ty + _u[2] * tz;
        _u[0] -= tx * ut; _u[1] -= ty * ut; _u[2] -= tz * ut; relax = 2;
      } else relax = 0.5;   // hull: slow creep relaxation
      shear(a.c, a.N, a.n, _u, relax, a.tauMax, a.K, a.damp, dt, Fc, true);
      addF(a.p, Fc);
      if (a.side >= 0) { bodyToWorldDir([1, 0, 0], dW); sideLat[a.side] += Fc[0] * dW[0] + Fc[1] * dW[1] + Fc[2] * dW[2]; }
    }
    for (let s = 0; s < 2; s++) sim.slip[s] = slipDen[s] > 0 ? slipNum[s] / slipDen[s] : 0;
    sim.hullLoad = hullN;

    // ---- 6. motion resistance (compaction + extra rolling) on the hull, opposing the ground speed along the hull
    bodyToWorldDir([0, 0, -1], dW);
    const vf = sim.vel[0] * dW[0] + sim.vel[1] * dW[1] + sim.vel[2] * dW[2];
    for (let s = 0; s < 2; s++) {
      const so = SOILS[sim.soil[s]], Rt = resist[s] + so.roll * sideN[s];
      const f = -Rt * vf / (Math.abs(vf) + 0.15);
      sim.toWorld([s ? B2 : -B2, 0, 0], _p); Fc[0] = dW[0] * f; Fc[1] = dW[1] * f; Fc[2] = dW[2] * f; addF(_p, Fc);
    }
    // aerodynamic drag (small)
    const vm = Math.hypot(sim.vel[0], sim.vel[1], sim.vel[2]);
    if (vm > 0.1) { const k = -0.5 * RHO_A * (P.AERO_CDA || 8) * vm; F[0] += k * sim.vel[0]; F[1] += k * sim.vel[1]; F[2] += k * sim.vel[2]; }

    // ---- 7. water: buoyancy + drag + track propulsion + ingress
    water(dt, env, addF, pointVel, bodyToWorldDir, up);

    // ---- 8. integrate the rigid body (semi-implicit Euler)
    const im = 1 / sim.mass;
    sim.vel[0] += F[0] * im * dt; sim.vel[1] += F[1] * im * dt; sim.vel[2] += F[2] * im * dt;
    sim.pos[0] += sim.vel[0] * dt; sim.pos[1] += sim.vel[1] * dt; sim.pos[2] += sim.vel[2] * dt;
    // torque to body
    const tb0 = R[0] * Tq[0] + R[3] * Tq[1] + R[6] * Tq[2], tb1 = R[1] * Tq[0] + R[4] * Tq[1] + R[7] * Tq[2], tb2 = R[2] * Tq[0] + R[5] * Tq[1] + R[8] * Tq[2];
    const [Ix, Iy, Iz] = sim.I, w = sim.w;
    const g0 = (Iy - Iz) * w[1] * w[2], g1 = (Iz - Ix) * w[2] * w[0], g2 = (Ix - Iy) * w[0] * w[1];
    w[0] += (tb0 + g0) / Ix * dt; w[1] += (tb1 + g1) / Iy * dt; w[2] += (tb2 + g2) / Iz * dt;
    const q = sim.q, hx = w[0] * dt * 0.5, hy = w[1] * dt * 0.5, hz = w[2] * dt * 0.5;
    const qx = q.x + (q.w * hx + q.y * hz - q.z * hy), qy = q.y + (q.w * hy + q.z * hx - q.x * hz), qz = q.z + (q.w * hz + q.x * hy - q.y * hx), qw = q.w - (q.x * hx + q.y * hy + q.z * hz);
    const qn = 1 / Math.hypot(qx, qy, qz, qw); q.x = qx * qn; q.y = qy * qn; q.z = qz * qn; q.w = qw * qn;

    // ---- 9. state checks: rollover, bellied, track throw
    const st = sim.state;
    if (R[4] < 0.35) { st.rollT += dt; if (st.rollT > 1.5 && !st.rolled) { st.rolled = true; ev.push({ type: 'rollover' }); } } else { st.rollT = 0; if (R[4] > 0.7) st.rolled = false; }
    const totalN = sideN[0] + sideN[1] + hullN;
    if (totalN > 0 && hullN > 0.5 * totalN && vm < 1) { st.belT += dt; if (st.belT > 2 && !st.bellied) { st.bellied = true; ev.push({ type: 'bellied' }); } } else { st.belT = 0; st.bellied = false; }
    // track throw: very high side load on a track while moving fast (turning hard at speed, side slope), INFERRED limits
    const sp = Math.abs(vf);
    for (let s = 0; s < 2; s++) {
      if (sim.dmg.thrown[s]) continue;
      const lat = Math.abs(sideLat[s]), lim = (P.THROW_LAT || 0.55) * Math.max(1, sideN[s]);
      if (sp > (P.THROW_SPEED || 6) && lat > lim) st.throwT[s] += dt; else st.throwT[s] = Math.max(0, st.throwT[s] - dt * 0.5);
      if (st.throwT[s] > (P.THROW_TIME || 0.6)) { sim.dmg.thrown[s] = true; ev.push({ type: 'thrown', side: s }); }
    }
    sim.t += dt;
  }

  // ---------------------------------------------------------------------------------------------- drivetrain
  // bodies 0 engine, 1 turbine, 2 left sprocket, 3 right sprocket. Explicit torques, implicit ground slope, then
  // torque-limited velocity constraints (sequential impulses).
  const Ib = [E.J, X.J_TURBINE, Js, Js], wv = [0, 0, 0, 0], Tb = [0, 0, 0, 0], Ie = [0, 0, 0, 0];
  const cons = []; for (let i = 0; i < 8; i++) cons.push({ J: [0, 0, 0, 0], lo: 0, hi: 0, lam: 0, bias: 0 });
  function drivetrain(dt, env, resist) {
    const ctl = sim.ctl, eng = sim.eng, ev = sim.events, r = T.SPROCKET_R;
    // range selection: shifts take X.SHIFT_T seconds with the range clutch slipping in
    let want = ctl.range; if (!X.ranges[want] && want !== 'N') want = 'N';
    if (X.AUTO && X.ranges[want] && X.ranges[want].auto) want = autoShift(want);
    // downshift inhibitor: a range that would over-speed the engine (or a reversal while rolling) is held off
    if (want !== sim.range && X.ranges[want]) {
      const wm = (sim.spr[0] + sim.spr[1]) / 2, tw = wm * rangeRatio(want);
      if (tw * RPM > E.CUTOFF * 1.05 || tw * RPM < -E.CUTOFF * 0.3) want = sim.range;
    }
    if (want !== sim.range) { sim.range = want; sim.shiftT = 0; }
    sim.shiftT += dt;
    const inGear = sim.range !== 'N' && sim.dmg.trans > 0.05;
    const G = inGear ? rangeRatio(sim.range) : 0;
    // ---- engine
    const rpm = eng.w * RPM, gov = E.GOV * (eng.flooded ? 0 : 1);
    if (eng.running) {
      if (!ctl.fuelOn || eng.fuel <= 0 || eng.flooded || sim.dmg.engine <= 0) { eng.running = false; ev.push({ type: 'stall', why: eng.flooded ? 'flooded' : eng.fuel <= 0 ? 'fuel' : sim.dmg.engine <= 0 ? 'damage' : 'off' }); }
      else if (rpm < E.STALL_RPM) { eng.running = false; ev.push({ type: 'stall', why: 'lugged' }); }
    } else if (ctl.starter && ctl.fuelOn && eng.fuel > 0 && !eng.flooded && sim.dmg.engine > 0 && rpm > E.LIGHT_RPM) { eng.running = true; ev.push({ type: 'start' }); }
    const wSet = (E.IDLE + clamp(ctl.throttle, 0, 1) * (gov - E.IDLE)) / RPM;
    const tmax = Tmax(rpm) * (0.35 + 0.65 * sim.dmg.engine);
    let tCmd = eng.running ? clamp(E.KGOV * (wSet - eng.w), 0, tmax) : 0;
    if (eng.running && rpm > E.CUTOFF) tCmd = 0;
    eng.inj += (tCmd - eng.inj) * Math.min(1, dt / E.TAU);   // injection / turbo lag
    const starterT = ctl.starter && !eng.running ? E.STARTER * clamp(1 - rpm / E.STARTER_RPM, 0, 1) : 0;
    const [tp, tt, sr, tr] = converter(eng.w, sim.turb);
    sim.out.conv.sr = sr; sim.out.conv.tr = tr;
    // the curve is NET output; motoring friction only shows when the injection is cut back (engine braking, run-down)
    Tb[0] = eng.inj + starterT - Tfric(rpm) * sgn(eng.w) * Math.min(1, Math.abs(eng.w) / 5) * clamp(1 - eng.inj / Math.max(1, tmax), 0, 1) - tp;
    Tb[1] = tt - X.TURB_DRAG * sim.turb;
    // ---- sprockets: ground (explicit part) + internal track resistance (Wong) + water
    const vKmh = Math.abs(r * (sim.spr[0] + sim.spr[1]) / 2) * KMH;
    for (let s = 0; s < 2; s++) {
      const om = sim.spr[s], thrown = sim.dmg.thrown[s];
      const Win = (sim.load[s] + 1e3) / 1000 / G0;   // tonnes on this track
      const Rin = Win * (222 + 3 * vKmh) * (P.TRACK.INTERNAL || 1);
      Tb[2 + s] = (thrown ? 0 : sideF0[s]) - Rin * r * Math.tanh(om / 0.4) - (sim.waterTrq ? sim.waterTrq[s] : 0);
      Ie[2 + s] = Ib[2 + s] + (thrown ? 0 : sideD[s]) * dt;   // implicit ground stiffness
    }
    Ie[0] = Ib[0]; Ie[1] = Ib[1];
    wv[0] = eng.w + dt * Tb[0] / Ie[0]; wv[1] = sim.turb + dt * Tb[1] / Ie[1];
    wv[2] = sim.spr[0] + dt * Tb[2] / Ie[2]; wv[3] = sim.spr[1] + dt * Tb[3] / Ie[3];
    // ---- constraints
    let nc = 0;
    const con = (j0, j1, j2, j3, cap, bias = 0) => { const c = cons[nc++]; c.J[0] = j0; c.J[1] = j1; c.J[2] = j2; c.J[3] = j3; c.lo = -cap * dt; c.hi = cap * dt; c.lam = 0; c.bias = bias; return c; };
    const st = clamp(ctl.steer, -1, 1) * sim.dmg.steer, ast = Math.abs(st), ss = sgn(st);
    const capR = X.CLUTCH_CAP * clamp(sim.shiftT / X.SHIFT_T, 0.02, 1) * (sim.dmg.trans > 0.4 ? 1 : sim.dmg.trans * 2.5);
    if (inGear) con(0, -1, G / 2, G / 2, capR);
    // converter lock-up clutch (direct drive) in the ranges that have it, above a turbine speed
    const LU = X.LOCKUP;
    if (LU && inGear && LU.ranges.includes(sim.range)) {
      const trpm = sim.turb * RPM;
      if (!sim.lockup && trpm > LU.ON_RPM && sr > LU.SR && ctl.throttle > 0.05) sim.lockup = true;
      else if (sim.lockup && (trpm < LU.OFF_RPM || ctl.throttle < 0.02)) sim.lockup = false;
    } else sim.lockup = false;
    if (sim.lockup) con(1, -1, 0, 0, LU.CAP);
    // steering. 'input': steer speed difference from the turbine (cross-drive: pivots in neutral; radius grows with range)
    //           'output': difference proportional to the output speed (controlled differential: fixed radius, no pivot)
    const SX = X.STEER, capS = SX.CAP;
    // brake / lock that holds both tracks together (released as the steer comes in)
    if (!(SX.FREE_DIFF)) con(0, 0, 1, -1, capS * (1 - ast) + 1);
    if (ast > 0.01) {
      // target: omegaL - omegaR = ss * k * (turbine or mean output)
      if (SX.REF === 'input') { if (inGear || SX.PIVOT) con(0, -ss * SX.K, 1, -1, capS * ast); }
      else con(0, 0, 1 - ss * SX.K / 2, -1 - ss * SX.K / 2, capS * ast);
    }
    // service brakes (+ the inner track's steer brake on laterals: X.STEER.BRAKE_STEER) and the parking brake
    const brk = clamp(ctl.brake, 0, 1) * X.BRAKE * sim.dmg.brakes, pk = ctl.park ? X.BRAKE * 0.8 : 0;
    const bs = SX.BRAKE_STEER ? Math.max(0, ast - SX.BRAKE_STEER) / (1 - SX.BRAKE_STEER) * X.BRAKE * 0.5 : 0;
    con(0, 0, 1, 0, brk + pk + (ss > 0 ? 0 : bs)); con(0, 0, 0, 1, brk + pk + (ss > 0 ? bs : 0));
    // final drives damaged -> that sprocket freewheels (we just let the brake constraint stand)
    for (let it = 0; it < 14; it++) for (let k = 0; k < nc; k++) {
      const c = cons[k], J = c.J;
      let jv = 0, em = 0; for (let b = 0; b < 4; b++) { if (J[b]) { jv += J[b] * wv[b]; em += J[b] * J[b] / Ie[b]; } }
      if (em <= 0) continue;
      let dl = -(jv - c.bias) / em; const old = c.lam; c.lam = clamp(old + dl, c.lo, c.hi); dl = c.lam - old;
      if (dl) for (let b = 0; b < 4; b++) if (J[b]) wv[b] += J[b] * dl / Ie[b];
    }
    // engine can't run backwards
    if (wv[0] < 0) wv[0] = 0;
    eng.w = wv[0]; sim.turb = wv[1]; sim.spr[0] = wv[2]; sim.spr[1] = wv[3];
    for (let s = 0; s < 2; s++) { sim.sprAng[s] += sim.spr[s] * dt; sim.trackPos[s] += sim.spr[s] * r * dt; sim.out.sprTorque[s] = sideF0[s]; }
    // engine outputs, fuel
    eng.torque = eng.inj; eng.power = eng.inj * eng.w; eng.load = tmax > 0 ? eng.inj / tmax : 0;
    if (eng.running) eng.fuel = Math.max(0, eng.fuel - (E.SFC * (Math.max(0, eng.power) + E.FAN_W * (eng.w * RPM / E.GOV) ** 3) + E.IDLE_FUEL) * dt / (E.FUEL_DENS || 0.84));
    eng.oilP = eng.running ? clamp(eng.w * RPM / E.GOV * 1.2, 0.3, 1) : Math.max(0, eng.oilP - dt);
    eng.temp += ((eng.running ? 82 + 20 * eng.load : 30) - eng.temp) * dt / 120;
  }
  // M113-style automatic: shift between 1..max on turbine speed (with a little hysteresis)
  function autoShift(sel) {
    const max = X.ranges[sel].auto, names = X.AUTO;   // e.g. ['1','2','3']
    let g = clamp(sim.autoGear, 1, max);
    const tw = Math.abs(sim.spr[0] + sim.spr[1]) / 2 * rangeRatio(names[g - 1]) * RPM;
    if (tw > X.UP_RPM && g < max && sim.shiftT > 1) g++;
    else if (g > 1) { const lowerW = Math.abs(sim.spr[0] + sim.spr[1]) / 2 * rangeRatio(names[g - 2]) * RPM; if (lowerW < X.DOWN_RPM && sim.shiftT > 1) g--; }
    sim.autoGear = g; return names[g - 1];
  }

  // ---------------------------------------------------------------------------------------------- water
  sim.waterTrq = [0, 0];
  function water(dt, env, addF, pointVel, bodyToWorldDir, up) {
    const wst = sim.water; sim.waterTrq[0] = sim.waterTrq[1] = 0;
    if (!env.water) { wst.depth = 0; wst.afloat = false; return; }
    const o = sim.origin(_r), wl = env.water(o[0], o[2]);
    // depth of water over the hull frame origin (ground at static ride) -> fording depth
    wst.depth = Math.max(0, wl - o[1]);
    if (!(wl > -1e8) || wst.depth <= 0) { if (wst.afloat) sim.events.push({ type: 'swimming', on: false }); wst.afloat = false; wst.drain(dt); return; }
    let buoy = 0, subVolTot = 0;
    for (const col of COLS) {
      // column bottom / top in world (centre line of the column)
      sim.toWorld([col.x, col.y0, col.z], _p); const yb = _p[1]; sim.toWorld([col.x, col.y1, col.z], _v); const yt = _v[1];
      const wlc = env.water(_p[0], _p[2]);
      const hgt = col.y1 - col.y0, sub = clamp((wlc - yb) / Math.max(0.05, yt - yb), 0, 1);
      if (sub <= 0) continue;
      const vol = 4 * col.ax * col.az * hgt * sub + colVolBelow * clamp((wlc - yb + 0.3) / 0.3, 0, 1);
      subVolTot += vol;
      const fb = RHO_W * G0 * vol; buoy += fb;
      // buoyant force at the submerged centroid of the column
      const cp = [_p[0] + (_v[0] - _p[0]) * sub * 0.5, _p[1] + (_v[1] - _p[1]) * sub * 0.5, _p[2] + (_v[2] - _p[2]) * sub * 0.5];
      addF(cp, [0, fb, 0]);
      // hydrodynamic drag on the column (heave + surge + sway), quadratic
      pointVel(cp, _u);
      const fw = W.CD_V * 0.5 * RHO_W * 4 * col.ax * col.az;
      // horizontal drag on the projected areas
      bodyToWorldDir([0, 0, -1], dW); bodyToWorldDir([1, 0, 0], tW);
      const uf = _u[0] * dW[0] + _u[2] * dW[2], us = _u[0] * tW[0] + _u[2] * tW[2], subH = hgt * sub;
      // columns come in 2 layers (lower hull, upper hull) of 2 across: each carries its share of the frontal and side areas
      const kf = -0.5 * RHO_W * W.CD_X * (W.FRONT_W * 2 / COLS.length) * subH * Math.abs(uf) * uf, ks = -0.5 * RHO_W * W.CD_Y * col.az * subH * Math.abs(us) * us;
      addF(cp, [dW[0] * kf + tW[0] * ks, -fw * Math.abs(_u[1]) * _u[1], dW[2] * kf + tW[2] * ks]);
    }
    // trim vane (M113): raised, it stands out ahead of the bow, keeps the bow wave off the deck and adds bow lift
    // (buoyancy of its foam-filled / planing surface + the trapped bow wave), INFERRED magnitude
    if (W.VANE && wst.vane) {
      sim.toWorld([0, W.VANE_Y, W.VANE_Z], _p);
      const sub = clamp((env.water(_p[0], _p[2]) - _p[1]) / 0.6 + 0.5, 0, 1);
      if (sub > 0) { const fb = RHO_W * G0 * W.VANE_VOL * sub; buoy += fb; addF(_p, [0, fb, 0]); }
    }
    // afloat with hysteresis: buoyancy carries the vehicle and the tracks carry (almost) nothing
    const trackW = (sim.load[0] + sim.load[1]) / (sim.mass * G0);
    const afloat = wst.afloat ? trackW < 0.15 : buoy > 0.9 * sim.mass * G0 && trackW < 0.04;
    if (afloat !== wst.afloat) { wst.afloat = afloat; sim.events.push({ type: 'swimming', on: afloat }); }
    // water taken aboard adds mass (sinking)
    // track propulsion (paddle): thrust from each track's slip through the water, a reaction torque on its sprocket.
    if (W.TRACK_CA) {
      bodyToWorldDir([0, 0, -1], dW);
      const vfw = sim.vel[0] * dW[0] + sim.vel[2] * dW[2], wet = clamp(wst.depth / (P.HULL.CLEAR + 0.4), 0, 1);
      for (let s = 0; s < 2; s++) {
        if (sim.dmg.thrown[s]) continue;
        const vt = sim.spr[s] * T.SPROCKET_R, du = vt - vfw;
        const thrust = 0.5 * RHO_W * W.TRACK_CA * wet * du * Math.abs(du);
        sim.toWorld([s ? B2 : -B2, 0.2, 0], _p);
        addF(_p, [dW[0] * thrust, 0, dW[2] * thrust]);
        sim.waterTrq[s] = thrust * T.SPROCKET_R + W.TRACK_LOSS * wet * vt * Math.abs(vt) * T.SPROCKET_R;
      }
    }
    // ingress: deep fording floods the engine through its air intake; a swimmer leaks and its pumps clear it
    const intakeY = P.HULL.INTAKE_Y;
    sim.toWorld([0, intakeY, P.HULL.INTAKE_Z || 1.5], _p);
    // the intake swallows water only when held under (a splash over the grille is not enough): ~0.8 s of submersion
    const under = env.water(_p[0], _p[2]) - _p[1];
    wst.intakeT = Math.max(0, (wst.intakeT || 0) + (under > 0 ? dt * Math.min(3, 0.5 + under / 0.1) : -dt * 0.5));
    if (!sim.eng.flooded && wst.intakeT > (W.INTAKE_T || 0.8)) { sim.eng.flooded = true; sim.events.push({ type: 'flooded', where: 'engine' }); }
    const swimmer = !!W.SWIMS;
    const ready = swimmer && (!W.VANE || wst.vane);
    let leak = 0;
    sim.toWorld([0, P.HULL.DECK_Y, (P.HULL.DECK_Z || 0)], _p);
    const over = env.water(_p[0], _p[2]) - _p[1];   // water over the lowest deck opening line
    if (over > 0) leak += (ready ? W.LEAK_OVER * 0.25 : W.LEAK_OVER) * Math.min(1, over / 0.3);
    if (subVolTot > 0) leak += swimmer ? W.LEAK : W.LEAK_FORD;
    const pump = wst.pumps && wst.inside > 0 ? W.PUMP : 0;
    wst.ingress = leak; wst.bilge = pump;
    wst.inside = clamp(wst.inside + (leak - pump) * dt, 0, W.MAX_INSIDE || 20);
    if (wst.inside > (W.FLOOD_CREW || 2) && !wst.crewFlood) { wst.crewFlood = true; sim.events.push({ type: 'flooded', where: 'crew' }); }
    if (wst.inside > 0.3 && leak > pump && !wst.sinkWarn) { wst.sinkWarn = true; sim.events.push({ type: 'sinking' }); }
    if (wst.inside < 0.05) wst.sinkWarn = false;
  }
  sim.water.drain = function (dt) { if (this.inside > 0) this.inside = Math.max(0, this.inside - (this.pumps ? W.PUMP || 0.01 : 0.002) * dt - 0.004 * dt); };

  // ---------------------------------------------------------------------------------------------- public step
  // returns the events of this call (sim.events is cleared at the start)
  sim.step = (dt, env) => {
    sim.events.length = 0;
    // mass grows with the water inside (sinking)
    sim.mass = P.MASS + sim.water.inside * RHO_W + (sim.eng.fuel - (P.FUEL_L ?? 0)) * 0.84;
    const n = Math.max(1, Math.round(dt / sim.h)), h = dt / n;
    for (let i = 0; i < n; i++) substep(h, env);
    // outputs
    quatToMat(sim.q, R);
    const fx = -R[2], fy = -R[5], fz = -R[8];
    sim.out.fwd = sim.vel[0] * fx + sim.vel[1] * fy + sim.vel[2] * fz;
    sim.out.speed = Math.hypot(sim.vel[0], sim.vel[1], sim.vel[2]);
    sim.out.yawRate = R[3] * sim.w[0] + R[4] * sim.w[1] + R[5] * sim.w[2];
    const at = sim.attitude(); sim.out.heading = at.heading; sim.out.pitch = at.pitch; sim.out.roll = at.roll;
    return sim.events;
  };
  // an impulse (N s, world) at a world point: recoil, a hit, a collision handled by the host
  sim.impulse = (p, J) => {
    quatToMat(sim.q, R);
    sim.vel[0] += J[0] / sim.mass; sim.vel[1] += J[1] / sim.mass; sim.vel[2] += J[2] / sim.mass;
    const rx = p[0] - sim.pos[0], ry = p[1] - sim.pos[1], rz = p[2] - sim.pos[2];
    const tx = ry * J[2] - rz * J[1], ty = rz * J[0] - rx * J[2], tz = rx * J[1] - ry * J[0];
    sim.w[0] += (R[0] * tx + R[3] * ty + R[6] * tz) / sim.I[0]; sim.w[1] += (R[1] * tx + R[4] * ty + R[7] * tz) / sim.I[1]; sim.w[2] += (R[2] * tx + R[5] * ty + R[8] * tz) / sim.I[2];
  };
  // the travel of each roadwheel for the model (m, + = up), the track belt position per side (m) and sprocket angle
  sim.wheelTravel = (side, i) => sim.wheels[side][i].s;
  sim.contactLen = contactLen;
  return sim;
}

// a tiny test-ground environment builder for benches and the dev page: piecewise features on a flat plane
export function flatEnv(o = {}) {
  const h0 = o.h ?? 0, soil = o.surface ?? 'dirt';
  return { height: () => h0, surface: () => soil, water: o.water != null ? () => o.water : null };
}
