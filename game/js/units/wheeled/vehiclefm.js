// vehiclefm.js - wheeled vehicle dynamics for NGC-1980 (M151A2, M35A2 and the 1980 civilian cars). Pure JS: no THREE, no
// DOM, no game imports, so node runs it (tools/wheeledbench.mjs).
//
// FRAMES. The model frame is the game's: x right, y up, nose along -z, origin on the ground under the middle of the
// wheelbase at static ride height (the meshes use the same frame). sim.pos / sim.q place that origin in the world, so a
// mesh copies them as they are. Internally the body integrates about its centre of gravity (spec.cg, model frame).
//
// WHAT IS MODELLED (per 1/600 s substep)
// - Rigid body, 6 DOF: gravity, suspension and tyre forces, aerodynamic drag, hull and obstacle contacts, buoyancy and
//   water drag. Euler's equations in body axes with the vehicle's inertia.
// - Suspension per wheel: a strut along the body's vertical through the wheel centre; spring (from the corner's static
//   load and a ride frequency), separate bump / rebound damping, progressive bump stops, anti-roll bars, the M35's walking
//   (trunnion) bogie that shares one spring between the two rear axles of a side.
//   Roll-centre geometry: the lateral tyre force reaches the body at the roll centre and the rest of the load transfer
//   goes straight down the links ("geometric" transfer). On an independent axle with a high roll centre (swing axle,
//   semi-trailing arm) that is a net JACKING force that lifts the tail in a hard turn; with camber gain the drooping
//   wheel tucks under, loses grip and the car oversteers. The M151's rollover habit and the Beetle's swing-axle tuck-under
//   come out of this, nothing is scripted. Solid axles get the same transfer as a pure couple (no jacking) and wheels
//   that stay square to the road.
// - Tyres: tyre.js (magic formula, combined slip, transient slip, camber, surfaces, rolling resistance, sinkage).
// - Drivetrain as rigid-body constraints between shafts, solved exactly every substep (a small mixed LCP by active set):
//   engine -- CLUTCH (friction, capacity from the pedal) -- GEARBOX ratio -- TRANSFER CASE (high / low range; rear always
//   driven; front part-time 4WD locked, or the M35's sprag overrunning clutch that drives the front axle only when the rear
//   slips) -- axle DIFFERENTIALS (open: equal torque; locked: equal speed; the M35's tandem rear axles are tied to one
//   propeller shaft with no inter-axle differential) -- WHEELS. Brakes, rolling resistance, the transmission parking
//   brake and engine friction are Coulomb friction rows in the same solve, so wheels lock and unlock cleanly, engines stall
//   when lugged, and a dragged clutch slips with the right torque.
// - Engine: full-load torque curve, friction / pumping torque (engine braking), idle control, rev limit or governor
//   (the LDT-465 multifuel diesel's governor and turbo lag), starter, stalling, fuel flow from indicated power and an
//   indicated efficiency (so idle burn and the fuel economy follow from the physics), coolant temperature with a
//   thermostat, oil pressure, charging, air brakes (M35).
// - Steering: Ackermann geometry from the steering-wheel position; brakes with the published front / rear split.
// - Water: fording depth, wet ignition (civilian), hydrolock above the air intake, deep-water fording kit, buoyancy.
// - Damage hooks: vehicledamage.js owns the component health; the sim reads the effects (flat tyres, engine power, leaks,
//   seizure) and reports crashes, rollovers and water ingestion to it.
//
// ENVIRONMENT INTERFACE (what the host passes as env; every field optional except ground):
//   env.ground(x, z, out)  -> fills out = { h, nx, ny, nz, surf, vx, vy, vz, mu } and returns it: terrain height (m) at the
//                             world point, unit surface normal, surface type (tyre.js SURF index or name: 'tarmac' 'wet'
//                             'dirt' 'grass' 'sand' 'mud' 'deck' 'rock' 'snow'), the velocity of the surface (moving decks;
//                             0 for terrain) and optionally mu, a grip multiplier (oil, ice patch; default 1). The sim samples
//                             it under every wheel (5 probes each) and hull point each substep, so keep it cheap.
//   env.water(x, z)        -> water surface height (m) at the point, or -Infinity / undefined for none.
//   env.collide(x, y, z, r, out) -> obstacle query for a sphere (centre world, radius r): return null (no contact) or fill
//                             out = { depth, nx, ny, nz, vx, vy, vz, mu, id } (penetration m > 0, unit normal pointing OUT of the
//                             obstacle towards the sphere, obstacle velocity, friction, any id for events) and return it.
//                             Static scenery (buildings, trees, walls) and other vehicles go through here; the host applies
//                             the opposite impulse to a dynamic obstacle from the 'impact' event or sim.contactForce.
//   env.g                  -> gravity (default 9.81; the game runs at 9.0).
//   env.wind               -> [x, y, z] m/s (optional).
// CONTROLS (ctl): { throttle 0..1, brake 0..1, clutch 0..1 (pedal down = 1 = disengaged), steer -1..1 (+ right; the
//   steering wheel position), handbrake 0..1, gear (-1 reverse, 0 neutral, 1..n), range 'H' | 'L' | 'N', fwd (bool, part-time
//   4WD lever), lock (bool, diff locks where fitted), ignition (bool), starter (bool), horn (bool), kit (bool, fording kit) }.
//   driver.js turns keyboard / gamepad intent into these (automatic clutch and gearbox, AI path following).
import { SURFACES, TYRES, tyreState, tyreStep, surfIndex } from './tyre.js';

export const KMH = 3.6, HP = 745.7, LBFT = 1.3558, MPH = 2.23694, IN = 0.0254, FT = 0.3048, LB = 0.45359, GAL = 3.78541;
const RHO_AIR = 1.225, RHO_W = 1000;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
export function table(pts, x) {   // piecewise-linear [[x, y], ...]
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return pts[pts.length - 1][1];
}
const RPM = 60 / (2 * Math.PI);   // rad/s -> rpm

// ------------------------------------------------------------------------------------------------ small vector maths
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossTo = (a, b, o) => { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; };
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; return a; };
// quaternion [x, y, z, w]; R = rotation matrix columns (body axes in world): R[0..2] = X, R[3..5] = Y, R[6..8] = Z
function qToR(q, R) {
  const [x, y, z, w] = q, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  R[0] = 1 - 2 * (yy + zz); R[1] = 2 * (xy + wz); R[2] = 2 * (xz - wy);
  R[3] = 2 * (xy - wz); R[4] = 1 - 2 * (xx + zz); R[5] = 2 * (yz + wx);
  R[6] = 2 * (xz + wy); R[7] = 2 * (yz - wx); R[8] = 1 - 2 * (xx + yy);
}
const bw = (R, b, o) => { o[0] = R[0] * b[0] + R[3] * b[1] + R[6] * b[2]; o[1] = R[1] * b[0] + R[4] * b[1] + R[7] * b[2]; o[2] = R[2] * b[0] + R[5] * b[1] + R[8] * b[2]; return o; };   // body -> world
const wb = (R, w, o) => { const x = w[0], y = w[1], z = w[2]; o[0] = R[0] * x + R[1] * y + R[2] * z; o[1] = R[3] * x + R[4] * y + R[5] * z; o[2] = R[6] * x + R[7] * y + R[8] * z; return o; };   // world -> body

// ------------------------------------------------------------------------------------------------ the drivetrain solver
// Shafts (nodes) with inertia, joined by linear velocity constraints sum(c_k w_k) = 0 whose torque impulse is bounded
// (lo..hi; +-Infinity = rigid). Exact solve of the small dense system with an active set for the bounded rows.
const MAXR = 24;
function createSolver(nNodes) {
  const S = {
    n: nNodes, invI: new Float64Array(nNodes), w: new Float64Array(nNodes),
    nr: 0, idx: new Int32Array(MAXR * 3), c: new Float64Array(MAXR * 3), cnt: new Int32Array(MAXR), lo: new Float64Array(MAXR), hi: new Float64Array(MAXR),
    lam: new Float64Array(MAXR), st: new Int8Array(MAXR), A: new Float64Array(MAXR * MAXR), b: new Float64Array(MAXR), M: new Float64Array(MAXR * (MAXR + 1)), map: new Int32Array(MAXR), x: new Float64Array(MAXR),
    clear() { S.nr = 0; },
    // a row: pairs [node, coeff] (1..3), bounds; returns the row index (lam[row] = torque impulse after the solve)
    row(a, ca, b, cb, c, cc, lo = -Infinity, hi = Infinity) {
      const r = S.nr++, o = r * 3; let k = 0;
      S.idx[o] = a; S.c[o] = ca; k = 1;
      if (b >= 0) { S.idx[o + 1] = b; S.c[o + 1] = cb; k = 2; }
      if (c >= 0) { S.idx[o + 2] = c; S.c[o + 2] = cc; k = 3; }
      S.cnt[r] = k; S.lo[r] = lo; S.hi[r] = hi; return r;
    },
    solve() {
      const nr = S.nr, A = S.A, b = S.b; if (!nr) return;
      for (let i = 0; i < nr; i++) {
        let v = 0; const oi = i * 3; for (let k = 0; k < S.cnt[i]; k++) v += S.c[oi + k] * S.w[S.idx[oi + k]];
        b[i] = -v;
        for (let j = 0; j <= i; j++) {
          let a = 0; const oj = j * 3;
          for (let k = 0; k < S.cnt[i]; k++) for (let l = 0; l < S.cnt[j]; l++) if (S.idx[oi + k] === S.idx[oj + l]) a += S.c[oi + k] * S.c[oj + l] * S.invI[S.idx[oi + k]];
          A[i * MAXR + j] = A[j * MAXR + i] = a;
        }
        A[i * MAXR + i] += 1e-9;
        S.st[i] = 0;   // 0 free, -1 at lo, +1 at hi
      }
      for (let it = 0; it < 12; it++) {
        // solve the free rows with the clamped rows' impulses fixed
        let nf = 0;
        for (let i = 0; i < nr; i++) if (!S.st[i]) S.map[nf++] = i; else S.lam[i] = S.st[i] < 0 ? S.lo[i] : S.hi[i];
        const M = S.M, W = nf + 1;
        for (let a = 0; a < nf; a++) {
          const i = S.map[a]; let rhs = b[i];
          for (let j = 0; j < nr; j++) if (S.st[j]) rhs -= A[i * MAXR + j] * S.lam[j];
          for (let c = 0; c < nf; c++) M[a * W + c] = A[i * MAXR + S.map[c]];
          M[a * W + nf] = rhs;
        }
        // gaussian elimination, partial pivoting
        for (let col = 0; col < nf; col++) {
          let p = col, best = Math.abs(M[col * W + col]);
          for (let r = col + 1; r < nf; r++) { const v = Math.abs(M[r * W + col]); if (v > best) { best = v; p = r; } }
          if (p !== col) for (let c = col; c < W; c++) { const t = M[col * W + c]; M[col * W + c] = M[p * W + c]; M[p * W + c] = t; }
          const d = M[col * W + col] || 1e-12;
          for (let r = col + 1; r < nf; r++) { const f = M[r * W + col] / d; if (f) for (let c = col; c < W; c++) M[r * W + c] -= f * M[col * W + c]; }
        }
        for (let r = nf - 1; r >= 0; r--) { let s = M[r * W + nf]; for (let c = r + 1; c < nf; c++) s -= M[r * W + c] * S.x[c]; S.x[r] = s / (M[r * W + r] || 1e-12); }
        for (let a = 0; a < nf; a++) S.lam[S.map[a]] = S.x[a];
        // bounds: clamp the worst violator; release clamped rows that pull the wrong way
        let changed = false, worst = -1, wv = 0;
        for (let i = 0; i < nr; i++) if (!S.st[i]) { const v = S.lam[i] > S.hi[i] ? S.lam[i] - S.hi[i] : S.lam[i] < S.lo[i] ? S.lo[i] - S.lam[i] : 0; if (v > wv) { wv = v; worst = i; } }
        if (worst >= 0) { S.st[worst] = S.lam[worst] > S.hi[worst] ? 1 : -1; changed = true; }
        else for (let i = 0; i < nr; i++) if (S.st[i]) {
          let r = -b[i]; for (let j = 0; j < nr; j++) r += A[i * MAXR + j] * S.lam[j];   // constraint velocity after the solve
          if ((S.st[i] > 0 && r > 1e-7) || (S.st[i] < 0 && r < -1e-7)) { S.st[i] = 0; changed = true; }
        }
        if (!changed) break;
      }
      // apply
      for (let i = 0; i < nr; i++) { const oi = i * 3, l = S.lam[i]; for (let k = 0; k < S.cnt[i]; k++) { const n = S.idx[oi + k]; S.w[n] += S.c[oi + k] * l * S.invI[n]; } }
    },
  };
  return S;
}

// ------------------------------------------------------------------------------------------------ spec preparation
// Fills in what follows from the published numbers: static corner loads, spring rates from ride frequencies, preloads,
// inertia from the dimensions, the node layout of the drivetrain.
export function prepareSpec(spec) {
  if (spec._prep) return spec;
  const P = spec._prep = {};
  const g = 9.81, m = spec.mass, cg = spec.cg;
  // axle groups: a bogie (M35 rear tandem) shares its load equally
  const groups = new Map();
  spec.axles.forEach((a, i) => { const k = a.bogie ?? ('a' + i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); });
  const G = [...groups.values()].map(ax => ({ ax, z: ax.reduce((s, i) => s + spec.axles[i].z, 0) / ax.length }));
  // two-support lever rule between the front-most and rear-most group (more groups: least-squares with equal stiffness)
  const loads = new Array(spec.axles.length).fill(0);
  if (G.length === 2) {
    const [f, r] = G[0].z < G[1].z ? [G[0], G[1]] : [G[1], G[0]], L = r.z - f.z;
    const Lf = m * g * (r.z - cg[2]) / L, Lr = m * g - Lf;
    f.ax.forEach(i => loads[i] = Lf / f.ax.length); r.ax.forEach(i => loads[i] = Lr / r.ax.length);
  } else throw new Error('vehiclefm: need two axle groups');
  P.axleLoad = loads;
  P.wheelLoad = spec.wheels.map(w => loads[w.axle] / spec.axles[w.axle].wheels.length);
  // springs: k from the ride frequency of the corner's sprung mass, preload so the static wheel sits at the model's ride height
  P.wk = spec.wheels.map((w, i) => {
    const a = spec.axles[w.axle], T = TYRES[w.tyre], ms = P.wheelLoad[i] / g;
    const k = a.k ?? ms * (2 * Math.PI * a.freq) ** 2;
    const travel = a.bump + a.droop, s0 = a.bump;          // extension at static ride (0 = full bump)
    const sFree = s0 + P.wheelLoad[i] / k;                   // extension where the spring would be free
    const cCrit = 2 * Math.sqrt(k * ms);
    const kbs = k * 6;
    return { k, travel, s0, sFree, cb: a.zeta[0] * cCrit, cr: a.zeta[1] * cCrit, kbs, cbs: 2 * 0.15 * Math.sqrt(kbs * 3 * ms), T, r: T.r, yTop: T.r + a.bump - (a.sag ?? 0), arb: a.arb ?? 0 };
  });
  // inertia in body axes [x pitch, y yaw, z roll] from the box with a mass-distribution factor (INFERRED; spec.inertia
  // overrides, same order)
  const [L, W, H] = spec.dims.box;
  P.I = spec.inertia ?? [m / 12 * (L * L + H * H) * 0.82, m / 12 * (L * L + W * W) * 0.85, m / 12 * (W * W + H * H) * 0.85];
  // drivetrain nodes: 0 engine, 1 gearbox output, 2 rear propeller, 3 front propeller, 4.. wheels
  P.nNodes = 4 + spec.wheels.length;
  return spec;
}

// ------------------------------------------------------------------------------------------------ the sim
export function createVehicleSim(spec, opts = {}) {
  prepareSpec(spec);
  const P = spec._prep, E = spec.engine, GB = spec.gearbox, TC = spec.transfer, NW = spec.wheels.length;
  const SUB = opts.sub || 1 / 600;
  const solver = createSolver(P.nNodes);
  const R = new Float64Array(9);
  const _a = v3(), _b = v3(), _c = v3(), _d = v3(), _e = v3(), _f = v3(), _n = v3(), _p = v3(), _r = v3(), _v = v3(), _t = v3(), _ex = v3(), _ey = v3(), _gw = v3();
  // tyre probes along the lower arc, as fractions of the radius ahead (+) / behind (-) the contact; opts.probes = 1 turns
  // them off (cheap AI traffic far from the camera)
  const PROBES = opts.probes ?? 9, PROBE_OFF = PROBES > 5 ? [0.25, -0.25, 0.5, -0.5, 0.7, -0.7, 0.87, -0.87] : PROBES > 1 ? [0.5, -0.5, 0.87, -0.87] : [];
  const gout2 = { h: 0, nx: 0, ny: 1, nz: 0, surf: 0, vx: 0, vy: 0, vz: 0 };
  const gout = { h: 0, nx: 0, ny: 1, nz: 0, surf: 0, vx: 0, vy: 0, vz: 0 }, cout = { depth: 0, nx: 0, ny: 1, nz: 0, vx: 0, vy: 0, vz: 0, mu: 0.5, id: null };
  const F = v3(), Tq = v3();   // force / torque accumulators (world)

  const wheels = spec.wheels.map((w, i) => ({
    id: w.id, i, spec: w, ts: tyreState(), s: P.wk[i].s0, sPrev: P.wk[i].s0, contact: false, wasContact: false, Fz: 0, Fs: 0, Fbx: 0, Fjack: 0, steer: 0, spin: 0, omega: 0,
    surf: 0, camber: 0, cx: 0, cy: 0, cz: 0, vx: 0, vy: 0, r: P.wk[i].r, rEff: P.wk[i].r, slide: 0, sinkVis: 0, air: true, depthW: 0, brakeT: 0,
  }));

  const S = {
    spec, pos: v3(), q: [0, 0, 0, 1], vel: v3(), w: v3(), L: v3(), cgw: v3(), cgb: [...spec.cg], massNow: spec.mass, I: [...P.I], loadKg: 0,
    wheels, solver,
    // drivetrain
    gear: 0, range: TC.low ? 'H' : 'H', fwd: false, lock: false, clutchEng: 1, shiftT: 0,
    // engine
    eng: { rpm: 0, running: false, thr: 0, tq: 0, tqInd: 0, power: 0, fuelFlow: 0, boost: 0, temp: 20, oilP: 0, starter: false, crank: 0, misfire: 0, wet: 0, smoke: 0, seized: false, hydrolock: false, load: 0, governed: false },
    fuelL: spec.fuel.capacity, airPsi: spec.brakes.air ? 0 : 0, battery: 1, genOn: false, volts: spec.electrics?.volts ?? 12, amps: 0,
    // outputs
    speed: 0, kmh: 0, slipMax: 0, yawRate: 0, latG: 0, lonG: 0, up: v3(0, 1, 0), fwdv: v3(0, 0, -1), roll: 0, pitch: 0, heading: 0,
    inWater: 0, depth: 0, hullContact: 0, odometer: 0, tripFuel: 0, onGround: false, upsideDown: false, contactForce: 0,
    events: [], dmg: null, mods: { power: 1, seized: false, flat: null, brake: 1 }, _acc: v3(), _t: 0, _evCool: {},
    kit: false, horn: false, lights: false, lastCtl: null,
    // reset the vehicle: model origin at pos, heading yaw (rad, 0 = nose along -z, + = turn LEFT as three's y rotation),
    // o: { running (engine on), gear, fuel (litres) }
    reset(pos, yaw = 0, o = {}) {
      S.q[0] = 0; S.q[1] = Math.sin(yaw / 2); S.q[2] = 0; S.q[3] = Math.cos(yaw / 2);
      S.pos[0] = pos[0]; S.pos[1] = pos[1]; S.pos[2] = pos[2];
      qToR(S.q, R); bw(R, S.cgb, _a);
      S.cgw[0] = pos[0] + _a[0]; S.cgw[1] = pos[1] + _a[1]; S.cgw[2] = pos[2] + _a[2];
      S.vel.fill(0); S.w.fill(0); S.L.fill(0); solver.w.fill(0); S.events.length = 0;
      for (const W of wheels) { const k = P.wk[W.i]; W.s = W.sPrev = k.s0; W.ts = tyreState(); W.contact = W.wasContact = false; W.Fbx = 0; W.omega = 0; }
      const run = o.running !== false;
      Object.assign(S.eng, { rpm: run ? E.idle : 0, running: run, thr: 0, temp: o.temp ?? (run ? 82 : 20), boost: 0, crank: 0, misfire: 0, wet: 0, seized: false, hydrolock: false, smoke: 0 });
      solver.w[0] = S.eng.rpm / RPM;
      S.gear = o.gear ?? 0; S.range = 'H'; S.fwd = !!o.fwd; S.fuelL = o.fuel ?? spec.fuel.capacity; S.airPsi = spec.brakes.air ? (run ? spec.brakes.air.max : 0) : 0;
      S.clutchEng = 1; S.onGround = false; S.upsideDown = false; S.odometer = 0; S.tripFuel = 0; S._lastUp = 1;
      updatePose();
    },
    // spawn helper: after reset(), sit the vehicle on the ground under it (pitch and roll from the wheel contact heights,
    // the origin at their mean height), at rest on its springs
    placeOnGround(env) {
      const g = { h: 0, nx: 0, ny: 1, nz: 0 }, yaw = S.heading, c = Math.cos(yaw), s = Math.sin(yaw);
      let hf = 0, hr = 0, hl = 0, hrr = 0, nf = 0, nr = 0, nl = 0, nrr = 0, sum = 0;
      const zs = spec.wheels.map(w => w.z), zMid = (Math.min(...zs) + Math.max(...zs)) / 2;
      for (const w of spec.wheels) {
        // model frame -> world with the yaw only (fwd = (sin yaw, 0, -cos yaw), right = (cos yaw, 0, sin yaw))
        const wx = S.pos[0] + w.x * c - w.z * s, wz = S.pos[2] + w.x * s + w.z * c;
        env.ground(wx, wz, g); sum += g.h;
        if (w.z < zMid) { hf += g.h; nf++; } else { hr += g.h; nr++; }
        if (w.x < 0) { hl += g.h; nl++; } else { hrr += g.h; nrr++; }
      }
      const zf = Math.min(...zs), zr = Math.max(...zs), xl = Math.min(...spec.wheels.map(w => w.x)), xr = Math.max(...spec.wheels.map(w => w.x));
      const pitch = Math.atan2(hf / nf - hr / nr, zr - zf), roll = Math.atan2(hl / nl - hrr / nrr, xr - xl);   // + pitch nose up; + roll = right side low
      const y = sum / spec.wheels.length;
      // q = yaw (about y) * pitch (about x) * roll (about z)
      const cy = Math.cos(yaw / 2), sy = Math.sin(-yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2), cr = Math.cos(-roll / 2), sr = Math.sin(-roll / 2);
      // yaw rotation in three is about +y with + = left; S.heading + = right, so use -yaw
      const qy = [0, sy, 0, cy], qx = [sp, 0, 0, cp], qz = [0, 0, sr, cr];
      const mul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
      const q = mul(mul(qy, qx), qz); S.q[0] = q[0]; S.q[1] = q[1]; S.q[2] = q[2]; S.q[3] = q[3];
      qToR(S.q, R); bw(R, S.cgb, _a);
      S.cgw[0] = S.pos[0] + _a[0]; S.cgw[1] = y + _a[1]; S.cgw[2] = S.pos[2] + _a[2];
      S.vel.fill(0); S.w.fill(0); S.L.fill(0);
      updatePose();
    },
    // payload (cargo, passengers): kg at a model-frame point; recomputes mass, CG and inertia (point-mass parallel axis)
    setLoad(items) {
      const m0 = spec.mass; let m = m0, cx = spec.cg[0] * m0, cy = spec.cg[1] * m0, cz = spec.cg[2] * m0;
      for (const it of items || []) { m += it.kg; cx += it.at[0] * it.kg; cy += it.at[1] * it.kg; cz += it.at[2] * it.kg; }
      const ncg = [cx / m, cy / m, cz / m], I = [...P.I];
      I[0] += m0 * ((spec.cg[1] - ncg[1]) ** 2 + (spec.cg[2] - ncg[2]) ** 2); I[1] += m0 * ((spec.cg[0] - ncg[0]) ** 2 + (spec.cg[2] - ncg[2]) ** 2); I[2] += m0 * ((spec.cg[0] - ncg[0]) ** 2 + (spec.cg[1] - ncg[1]) ** 2);
      for (const it of items || []) { const d = [it.at[0] - ncg[0], it.at[1] - ncg[1], it.at[2] - ncg[2]], sz = it.size || [0.5, 0.5, 0.5];
        I[0] += it.kg * (d[1] ** 2 + d[2] ** 2 + (sz[1] ** 2 + sz[2] ** 2) / 12); I[1] += it.kg * (d[0] ** 2 + d[2] ** 2 + (sz[0] ** 2 + sz[2] ** 2) / 12); I[2] += it.kg * (d[0] ** 2 + d[1] ** 2 + (sz[0] ** 2 + sz[1] ** 2) / 12); }
      // keep the model origin where it is: move the CG point
      qToR(S.q, R); bw(R, S.cgb, _a); const ox = S.cgw[0] - _a[0], oy = S.cgw[1] - _a[1], oz = S.cgw[2] - _a[2];
      S.cgb = ncg; S.massNow = m; S.I = I; S.loadKg = m - m0; S._LFromW();
      bw(R, S.cgb, _a); S.cgw[0] = ox + _a[0]; S.cgw[1] = oy + _a[1]; S.cgw[2] = oz + _a[2];
    },
    // the world position of a model-frame point (seats, muzzles, exhaust, dust emitters)
    worldPoint(p, out = v3()) { qToR(S.q, R); bw(R, p, out); out[0] += S.pos[0]; out[1] += S.pos[1]; out[2] += S.pos[2]; return out; },
    // velocity of a model-frame point (world)
    pointVel(p, out = v3()) { qToR(S.q, R); _t[0] = p[0] - S.cgb[0]; _t[1] = p[1] - S.cgb[1]; _t[2] = p[2] - S.cgb[2]; bw(R, _t, _a); crossTo(S.w, _a, out); out[0] += S.vel[0]; out[1] += S.vel[1]; out[2] += S.vel[2]; return out; },
    // push the body (impulse N s at a world point, world direction), e.g. from a collision with another vehicle or a blast
    impulse(at, J) {
      S.vel[0] += J[0] / S.massNow; S.vel[1] += J[1] / S.massNow; S.vel[2] += J[2] / S.massNow;
      _a[0] = at[0] - S.cgw[0]; _a[1] = at[1] - S.cgw[1]; _a[2] = at[2] - S.cgw[2]; crossTo(_a, J, _b);
      S.L[0] += _b[0]; S.L[1] += _b[1]; S.L[2] += _b[2]; qToR(S.q, R); wFromL(R);
    },
    step(dt, ctl, env) {
      S.events.length = 0; S.lastCtl = ctl;
      dt = Math.min(dt, 0.1);
      const n = Math.max(1, Math.ceil(dt / SUB - 1e-6)), h = dt / n;
      frameControls(dt, ctl, env);
      for (let i = 0; i < n; i++) sub(h, ctl, env);
      systems(dt, ctl, env);
      updatePose();
      return S.events;
    },
    get rpm() { return S.eng.rpm; },
    get mass() { return S.massNow; },
  };
  const ev = (e, x, cool = 0) => { if (cool) { const t = S._evCool[e] || 0; if (S._t < t) return; S._evCool[e] = S._t + cool; } S.events.push(x ? { e, ...x } : { e }); if (S.dmg) S.dmg.onEvent?.(S, e, x); };
  S.ev = ev;

  function updatePose() {
    qToR(S.q, R); bw(R, S.cgb, _a);
    S.pos[0] = S.cgw[0] - _a[0]; S.pos[1] = S.cgw[1] - _a[1]; S.pos[2] = S.cgw[2] - _a[2];
    S.up[0] = R[3]; S.up[1] = R[4]; S.up[2] = R[5]; S.fwdv[0] = -R[6]; S.fwdv[1] = -R[7]; S.fwdv[2] = -R[8];
    S.speed = dot(S.vel, S.fwdv); S.kmh = S.speed * KMH;
    S.heading = Math.atan2(S.fwdv[0], -S.fwdv[2]);
    S.pitch = Math.asin(clamp(S.fwdv[1], -1, 1)); S.roll = Math.atan2(R[1], R[4]);   // + = right side down
    S.yawRate = dot(S.w, S.up);
    S.upsideDown = S.up[1] < -0.1;
  }

  // ---------------------------------------------------------------------------------------------- per-frame controls
  let steerC = 0, throttleCmd = 0;
  function frameControls(dt, ctl, env) {
    // gear lever: the sim accepts any requested gear but a non-synchro gear grinds (and stays out) unless the shafts are
    // close to synchronous or the box is stopped; the clutch must be down (or the throttle relieved and speeds matched)
    const want = clamp(ctl.gear | 0, -1, GB.ratios.length);
    if (want !== S.gear) {
      const clutchDown = (ctl.clutch ?? 0) > 0.7;
      let ok = clutchDown || want === 0;
      if (ok && want !== 0) {
        const ratio = want < 0 ? -GB.reverse : GB.ratios[want - 1];
        const syn = want > 0 && GB.synchro[want - 1];
        const wOut = solver.w[1], wIn = S.eng.rpm / RPM;   // with the clutch down the input shaft spins down with the clutch disc
        const mismatch = Math.abs(wOut * ratio) - (clutchDown ? Math.abs(wOut * ratio) : wIn);   // clutch down: the synchro matches the input shaft
        if (!syn && Math.abs(wOut) > 0.6 && want !== 0) { ok = false; ev('grind', { gear: want }, 0.4); }      // non-synchro: only from (near) rest
        if (want < 0 && S.speed > 1.5) { ok = false; ev('grind', { gear: want }, 0.4); }
        if (want > 0 && S.speed < -1.5) { ok = false; ev('grind', { gear: want }, 0.4); }
        void mismatch;
      }
      if (ok) { S.gear = want; S.shiftT = 0.25; }
    }
    if (TC.low) {
      const r = ctl.range || 'H';
      if (r !== S.range && (Math.abs(S.speed) < 1.5 || (ctl.clutch ?? 0) > 0.7)) S.range = r;
    }
    S.fwd = TC.front === 'parttime' ? !!ctl.fwd : TC.front === 'full';
    S.lock = !!ctl.lock;
    S.kit = !!ctl.kit && !!spec.water.kit;
    // steering: road-wheel angle of the virtual middle wheel, then Ackermann per wheel
    steerC = clamp(ctl.steer || 0, -1, 1) * spec.steer.max;
    const zr = spec.steer.zRef;   // rear reference line (rear axle / bogie centre)
    for (const W of wheels) {
      const ws = W.spec; if (!ws.steer) { W.steer = 0; continue; }
      const Lw = zr - ws.z;
      if (Math.abs(steerC) < 1e-4) { W.steer = 0; continue; }
      const R0 = Lw / Math.tan(Math.abs(steerC)), sgn = Math.sign(steerC);
      const ack = Math.atan(Lw / (R0 - sgn * ws.x)) * sgn;
      W.steer = lerp(steerC, ack, spec.steer.ackermann ?? 0.9);
    }
    S.horn = !!ctl.horn;
    throttleCmd = clamp(ctl.throttle || 0, 0, 1);
  }

  // ---------------------------------------------------------------------------------------------- engine torque
  function engineTorque(h, ctl, env) {
    const e = S.eng, w = solver.w[0], rpm = Math.max(0, w * RPM);
    e.rpm = rpm;
    const ign = ctl.ignition !== false;
    const fuelOk = S.fuelL > 0.05;
    const powerMod = S.mods.power;
    // starter motor: drags the engine to cranking speed (and drains the battery)
    e.starter = !!ctl.starter && !e.running && S.battery > 0.05 && !e.seized && !e.hydrolock;
    let tStart = 0;
    if (e.starter) { tStart = E.starter.torque * Math.max(0, 1 - rpm / E.starter.rpm) * Math.min(1, S.battery * 2); e.crank += h; }
    else e.crank = 0;
    // catching: needs ignition (petrol) / fuel, the cranking speed and, for the diesel, a few compression cycles
    if (!e.running && e.starter && ign && fuelOk && rpm > E.starter.catch && e.crank > (E.starter.crankTime ?? 0.4) && !e.seized && !e.hydrolock && e.wet < 0.8) {
      e.running = true; e.runT = 0; ev('start');
    }
    if (e.running) e.runT = (e.runT || 0) + h;
    // a stall: below the stall speed once it has caught and run up (cranking speed is below the stall speed)
    const stalled = rpm < E.stall && (e.runT > 0.8 || rpm < E.stall * 0.45);
    const drowned = e.wet >= 0.95;   // distributor / coil under water: the ignition is gone
    if (e.running && (!ign || !fuelOk || e.seized || e.hydrolock || stalled || drowned)) {
      e.running = false; ev(e.hydrolock ? 'hydrolock' : e.seized ? 'seized' : !fuelOk ? 'outOfFuel' : !ign ? 'engineOff' : drowned ? 'drowned' : 'stall');
    }
    // throttle with the idle control (carburettor idle stop / diesel idle governor): holds idle unloaded, can't stop a lugged engine
    let thr = throttleCmd;
    if (e.running) {
      // idle control; while it runs up from cranking it gets full fuel (diesel excess-fuel start, choke / pump shot)
      const idleThr = clamp(E.idleThr + E.idleGain * (E.idle - rpm) / E.idle, 0, (e.runT || 0) < 1.5 && rpm < E.idle * 0.9 ? 1 : E.idleMax);
      thr = Math.max(thr, idleThr);
      // over-speed: petrol fuel / ignition cut, diesel governor ramp (LDT-465: governed 2600 full load / ~2850 high idle)
      if (E.governor) { const gv = clamp((E.governor[1] - rpm) / (E.governor[1] - E.governor[0]), 0, 1); e.governed = gv < 0.99; thr = Math.min(thr, gv); }
      else if (rpm > E.redline) thr = 0;
      // a wet ignition / water in the intake misfires
      if (e.misfire > 0 && Math.random() < e.misfire * 0.5) thr *= 0.2;
    } else thr = 0;
    e.thr = thr;
    // turbo (LDT-465): boost builds with exhaust energy (rpm x load), first-order lag; the curve without boost is the NA engine
    if (E.turbo) { const tgt = clamp((rpm - E.turbo.rpm0) / (E.turbo.rpm1 - E.turbo.rpm0), 0, 1) * clamp(thr * 1.2, 0, 1); e.boost += (tgt - e.boost) * Math.min(1, h / E.turbo.lag); }
    let full = table(E.curve, rpm) * (E.installed ?? 1);   // published (often SAE gross) -> as installed
    if (E.turbo) full *= lerp(E.turbo.na, 1, e.boost);
    const fric = E.fric[0] + E.fric[1] * rpm / 1000 + E.fric[2] * (rpm / 1000) ** 2;
    const tInd = e.running ? thr * (full + fric) * powerMod : 0;
    e.tqInd = tInd; e.fric = fric;
    e.smoke = E.diesel ? clamp(thr - e.boost * 0.9 - 0.2, 0, 1) * (rpm > 600 ? 1 : 0) : 0;
    return tInd + tStart;
  }

  // ---------------------------------------------------------------------------------------------- substep
  let lamClutch = 0;
  const rowW = new Int32Array(NW).fill(-1);
  function sub(h, ctl, env) {
    S._t += h;
    const g = env.g ?? 9.81, m = S.massNow, cg = S.cgb;
    qToR(S.q, R);
    F[0] = 0; F[1] = -m * g; F[2] = 0; Tq[0] = Tq[1] = Tq[2] = 0;
    const X = [R[0], R[1], R[2]], Y = [R[3], R[4], R[5]], Z = [R[6], R[7], R[8]];
    const addF = (fx, fy, fz, px, py, pz) => {   // force (world) at a world point
      F[0] += fx; F[1] += fy; F[2] += fz;
      const rx = px - S.cgw[0], ry = py - S.cgw[1], rz = pz - S.cgw[2];
      Tq[0] += ry * fz - rz * fy; Tq[1] += rz * fx - rx * fz; Tq[2] += rx * fy - ry * fx;
    };
    const velAt = (px, py, pz, o) => { const rx = px - S.cgw[0], ry = py - S.cgw[1], rz = pz - S.cgw[2]; o[0] = S.vel[0] + S.w[1] * rz - S.w[2] * ry; o[1] = S.vel[1] + S.w[2] * rx - S.w[0] * rz; o[2] = S.vel[2] + S.w[0] * ry - S.w[1] * rx; return o; };
    const water = env.water;
    // ---------------- suspension geometry and spring forces
    const brakeScale = S.mods.brake * (spec.brakes.air ? clamp((S.airPsi - 15) / 55, 0, 1) : 1);
    let onG = 0;
    for (const W of wheels) {
      const ws = W.spec, k = P.wk[W.i], T = k.T;
      W.wasContact = W.contact;
      // hardpoint: wheel centre at full bump (model frame), relative to the CG, to world
      _a[0] = ws.x - cg[0]; _a[1] = k.yTop - cg[1]; _a[2] = ws.z - cg[2]; bw(R, _a, _b);
      const Hx = S.cgw[0] + _b[0], Hy = S.cgw[1] + _b[1], Hz = S.cgw[2] + _b[2];
      // flat tyre: the tyre squashes towards the rim
      const flat = W.ts.flat;
      W.rEff = k.r * (1 - 0.22 * flat) - W.ts.sink;
      // ground under the wheel: the plane under the contact (exact on slopes), plus point probes along the tyre's lower
      // arc ahead and behind (circle against the ground points), so a kerb, a step or a slope kink is met by the front of
      // the tyre with a tilted contact normal instead of the strut bottoming out. The probe that lifts the wheel most wins.
      const r = W.rEff, sx = Hx - Y[0] * (W.s + r), sz = Hz - Y[2] * (W.s + r);
      env.ground(sx, sz, gout);
      _n[0] = gout.nx; _n[1] = gout.ny; _n[2] = gout.nz;
      const nd = -(dot(_n, Y));   // n . d with d = -Y
      const hp = _n[0] * (Hx - sx) + _n[1] * (Hy - gout.h) + _n[2] * (Hz - sz);   // hardpoint above the ground plane
      let s = nd < -0.25 ? (r - hp) / nd : Infinity, surf = gout.surf, gvx = gout.vx || 0, gvy = gout.vy || 0, gvz = gout.vz || 0, pt = false, mu = gout.mu ?? 1;
      if (PROBES > 1 && s < k.travel + 0.3) {
        // heading on the ground (no steer needed for the probe offsets: the arc is short)
        const hx = -Z[0], hz = -Z[2], hl = Math.hypot(hx, hz) || 1, fx = hx / hl, fz = hz / hl;
        for (let p = 0; p < PROBE_OFF.length; p++) {
          const off = PROBE_OFF[p] * r, px = sx + fx * off, pz = sz + fz * off;
          env.ground(px, pz, gout2);
          // circle (centre on the strut line) touching the ground point G: |H - Y s - G| = r, smaller root
          const dx = Hx - px, dy = Hy - gout2.h, dz = Hz - pz, b = Y[0] * dx + Y[1] * dy + Y[2] * dz, c = dx * dx + dy * dy + dz * dz - r * r, disc = b * b - c;
          if (disc < 0) continue;
          const sp = b - Math.sqrt(disc);
          if (sp < s - 0.002) {
            s = sp; pt = true; surf = gout2.surf; mu = gout2.mu ?? 1; gvx = gout2.vx || 0; gvy = gout2.vy || 0; gvz = gout2.vz || 0;
            // contact normal: from the ground point to the wheel centre
            const cx_ = Hx - Y[0] * sp - px, cy_ = Hy - Y[1] * sp - gout2.h, cz_ = Hz - Y[2] * sp - pz, l = Math.hypot(cx_, cy_, cz_) || 1;
            _n[0] = cx_ / l; _n[1] = cy_ / l; _n[2] = cz_ / l;
            // on a smooth slope the point probe agrees with the plane: keep the true surface normal
            if (gout2.ny * _n[1] + gout2.nx * _n[0] + gout2.nz * _n[2] > 0.995) { _n[0] = gout2.nx; _n[1] = gout2.ny; _n[2] = gout2.nz; }
          }
        }
      }
      W.surf = surfIndex(surf); W.muScale = mu;
      if (s >= k.travel) { W.contact = false; s = k.travel; }
      else W.contact = true;
      W.s = s;
      const sdot = W.wasContact && W.contact ? clamp((s - W.sPrev) / h, -8, 8) : 0;
      W.sPrev = s;
      if (!W.contact) { W.Fs = 0; W.Fd = 0; W.Fz = 0; W.air = true; continue; }
      W.air = false; onG++;
      let Fs = k.k * (k.sFree - Math.max(s, 0)), Fd = -(sdot < 0 ? k.cb : k.cr) * sdot;
      // progressive bump stop (rubber) and, past it, the tyre carcass: both damped
      // progressive bump stop (rubber) and, past it, the tyre carcass: both damped; the crush is capped (a penalty spring
      // fed a metre of penetration in one substep - a cliff edge in a heightfield - would launch the vehicle)
      if (s < 0.025) { const sc = Math.max(s, -0.12); Fs += k.kbs * (0.025 - sc) + (sc < 0 ? k.kbs * 2 * -sc : 0); if (sdot < 0) Fd -= k.cbs * Math.max(sdot, -3); }
      W.Fs = Math.max(0, Fs);
      W.Fd = Fd;
      W.nDotY = Math.max(0.6, dot(_n, Y));   // a kerb face pushes back, but never more than ~1.7 x the strut load
      // contact frame
      W.cx = Hx - Y[0] * s - _n[0] * r; W.cy = Hy - Y[1] * s - _n[1] * r; W.cz = Hz - Y[2] * s - _n[2] * r;
      W.nx = _n[0]; W.ny = _n[1]; W.nz = _n[2]; W.gvx = gvx; W.gvy = gvy; W.gvz = gvz; W.pt = pt;
      W.Hx = Hx; W.Hy = Hy; W.Hz = Hz;
      // water at the wheel (fords: wet brakes, drag)
      W.depthW = water ? Math.max(0, (water(W.cx, W.cz) ?? -Infinity) - W.cy) : 0;
    }
    S.onGround = onG > 0;
    // anti-roll bars and the walking bogie (shared spring), then the roll-centre load transfer (jacking)
    for (const a of spec.axles) {
      const [li, ri] = a.wheels, L = wheels[li], Rw = wheels[ri];
      if (a.arb && L.contact && Rw.contact) { const d = (P.wk[li].travel - L.s) - (P.wk[ri].travel - Rw.s); L.Fs += a.arb * d; Rw.Fs -= a.arb * d; }
    }
    if (spec.bogiePairs) for (const [i, j] of spec.bogiePairs) {   // trunnion: one leaf spring, centre pivot; equal loads
      const A = wheels[i], B = wheels[j];
      if (A.contact && B.contact) { const f = (A.Fs + B.Fs) / 2; A.Fs = B.Fs = f; }
      else if (A.contact !== B.contact) { const W = A.contact ? A : B; W.Fs *= 0.5 + 0.5 * clamp(W.s / P.wk[W.i].travel, 0, 1); }   // beam on its stop
    }
    for (const a of spec.axles) {
      const [li, ri] = a.wheels, L = wheels[li], Rw = wheels[ri], half = Math.abs(spec.wheels[ri].x - spec.wheels[li].x) / 2;
      for (const W of [L, Rw]) {
        if (!W.contact) { W.Fjack = 0; continue; }
        const side = Math.sign(W.spec.x), hrc = Math.max(0, a.rc - (P.wk[W.i].yTop - W.s - W.rEff));   // roll centre above the contact
        W.Fjack = a.solid ? -side * (L.Fbx + Rw.Fbx) * hrc / (2 * half) : -side * W.Fbx * hrc / half;
      }
    }
    // ---------------- tyres
    for (const W of wheels) {
      const ws = W.spec, k = P.wk[W.i], a = spec.axles[ws.axle];
      const node = 4 + W.i;
      W.omega = solver.w[node];
      if (!W.contact) { W.ts.Fx = W.ts.Fy = 0; W.Fbx *= 0.9; W.Fz = 0; W.slide = 0; W.tq = 0; continue; }
      // the strut and links carry Fs + Fd + Fjack along the body vertical; for a massless wheel the ground's normal
      // reaction N satisfies N (n . Y) = that, so a tilted contact (kerb, step, the front of the tyre on a slope kink)
      // pushes back as well as up
      // (capped at ~10 x the static corner load: beyond that the tyre bottoms on the rim and the stops; no real contact
      // transmits more, and a penalty contact that did would launch the vehicle off a kerb)
      const Fz = Math.min(P.wheelLoad[W.i] * 10, Math.max(0, W.Fs + W.Fd + W.Fjack)) / W.nDotY;
      W.Fz = Fz;
      _n[0] = W.nx; _n[1] = W.ny; _n[2] = W.nz;
      // heading: body forward rotated by the steer angle (+ the axle's toe change with travel: a semi-trailing arm toes
      // out as it droops, so a lift-off that raises the tail steers the rear out), flattened onto the ground plane
      const toe = a.toeGain ? Math.sign(ws.x) * a.toeGain * (W.s - k.s0) : 0;
      W.toe = toe;
      const sd = Math.sin(W.steer + toe), cd = Math.cos(W.steer + toe);
      _f[0] = X[0] * sd - Z[0] * cd; _f[1] = X[1] * sd - Z[1] * cd; _f[2] = X[2] * sd - Z[2] * cd;
      const fn = dot(_f, _n); _ex[0] = _f[0] - _n[0] * fn; _ex[1] = _f[1] - _n[1] * fn; _ex[2] = _f[2] - _n[2] * fn; norm(_ex);
      crossTo(_ex, _n, _ey);   // right
      velAt(W.cx, W.cy, W.cz, _v); _v[0] -= W.gvx; _v[1] -= W.gvy; _v[2] -= W.gvz;
      const vx = dot(_v, _ex), vy = dot(_v, _ey); W.vx = vx; W.vy = vy;
      // camber against the road: independent wheels lean with the body plus their camber curve; solid axles stay square
      let gam = 0;
      if (!a.solid) {
        const side = Math.sign(ws.x), gb = (a.camber0 ?? 0) + (a.camberGain ?? 0) * (W.s - k.s0);   // + = top outward
        const cg_ = Math.cos(gb), sg = Math.sin(gb) * side;
        _t[0] = Y[0] * cg_ + X[0] * sg; _t[1] = Y[1] * cg_ + X[1] * sg; _t[2] = Y[2] * cg_ + X[2] * sg;
        gam = Math.asin(clamp(dot(_t, _ey), -1, 1));
      }
      W.camber = gam;
      // water on the contact: aquaplaning-light (a ford's mud bed): grip drops with depth
      const surf = SURFACES[W.surf] || SURFACES[0];
      const sf = SCALED(W.depthW > 0.05 ? WET_OF(surf) : surf, W.muScale);
      tyreStep(k.T, W.ts, sf, Fz, vx, vy, W.omega * W.rEff, gam, h);
      const Fx = W.ts.Fx, Fy = W.ts.Fy;
      W.slide = W.ts.slide;
      const tx = Fx * _ex[0] + Fy * _ey[0], ty = Fx * _ex[1] + Fy * _ey[1], tz = Fx * _ex[2] + Fy * _ey[2];
      // the tyre force is the external force and acts at the contact. The roll-centre geometry only decides how the
      // resulting load transfer reaches the wheel: through the links (Fjack, no body roll; a net lift on an independent
      // axle) or through the springs (body roll). Fbx (lateral along the body) feeds next substep's Fjack.
      W.Fbx = tx * X[0] + ty * X[1] + tz * X[2];
      addF(tx, ty, tz, W.cx, W.cy, W.cz);
      // the ground's normal reaction through the contact (and the wheel centre)
      addF(_n[0] * Fz, _n[1] * Fz, _n[2] * Fz, W.cx, W.cy, W.cz);
      W.tq = -Fx * W.rEff;
      // soil drag of a dug-in wheel (sinkage), opposing the travel along the heading
      if (W.ts.bull > 0) { const fb = -W.ts.bull * Fz * Math.max(-1, Math.min(1, vx / 0.3)); addF(fb * _ex[0], fb * _ex[1], fb * _ex[2], W.cx, W.cy + W.rEff * 0.3, W.cz); }
      // wading: water drag on the wheel
      if (W.depthW > 0.05) { const dv = Math.min(1, W.depthW / (2 * k.r)), A = 2 * k.r * k.T.w * dv * 0.9, sp = Math.hypot(_v[0], _v[2]); if (sp > 0.05) { const f = 0.5 * RHO_W * 1.0 * A * sp; addF(-f * _v[0], 0, -f * _v[2], W.cx, W.cy + 0.3, W.cz); } }
    }
    // ---------------- drivetrain (one exact solve per substep)
    const tE = engineTorque(h, ctl, env);
    const I = spec.drive;
    solver.invI[0] = 1 / E.inertia; solver.invI[1] = 1 / I.gbI; solver.invI[2] = 1 / I.propI; solver.invI[3] = 1 / I.propI;
    for (const W of wheels) solver.invI[4 + W.i] = 1 / P.wk[W.i].T.I;
    solver.w[0] += tE * h / E.inertia;
    for (const W of wheels) solver.w[4 + W.i] += (W.tq || 0) * h / P.wk[W.i].T.I;
    solver.clear();
    // engine friction (Coulomb: a stopped engine stays stopped)
    solver.row(0, 1, -1, 0, -1, 0, -S.eng.fric * h, S.eng.fric * h);
    // clutch
    const ped = clamp(ctl.clutch ?? 0, 0, 1);
    S.clutchEng = clamp((1 - ped - 0.08) / 0.62, 0, 1);   // free play at the top, bites through the middle
    let rC = -1;
    if (S.gear !== 0) {
      const ratio = S.gear < 0 ? -GB.reverse : GB.ratios[S.gear - 1];
      const cap = E.clutchCap * S.clutchEng ** 1.5 * h;
      if (cap > 0) rC = solver.row(0, 1, 1, -ratio, -1, 0, -cap, cap);
    }
    // transfer case
    const rng = S.range === 'L' ? TC.low : S.range === 'N' ? 0 : TC.high;
    let rT = -1;
    if (rng) {
      solver.row(1, 1, 2, -rng, -1, 0);   // rear always driven
      if (TC.front === 'sprag') {
        // M35: forward drive through the sprag (front driven when the rear would outrun it); low range locks it in
        if (S.range === 'L' || S.fwd) solver.row(1, 1, 3, -rng, -1, 0);
        else rT = solver.row(3, rng * (spec.drive.spragLead ?? 1), 1, -1, -1, 0, 0, Infinity);
      } else if (TC.front === 'full' || (TC.front === 'parttime' && (S.fwd || (S.range === 'L' && TC.lowLocks)))) solver.row(1, 1, 3, -rng, -1, 0);
    }
    // gearbox / transfer drag (losses): Coulomb on the output, from the torque going through
    const tLoss = (I.loss ?? 0.08) * Math.abs(lamClutch / h) * Math.abs(S.gear ? (S.gear < 0 ? GB.reverse : GB.ratios[S.gear - 1]) : 0) + I.spinLoss;
    solver.row(1, 1, -1, 0, -1, 0, -tLoss * h, tLoss * h);
    // axles: differentials
    for (const a of spec.axles) {
      if (!a.driven) continue;
      const [li, ri] = a.wheels, prop = a.driven === 'F' ? 3 : 2;
      solver.row(4 + li, 0.5 * a.final, 4 + ri, 0.5 * a.final, prop, -1);   // prop = final x mean wheel speed
      if (a.diff === 'locked' || (a.diff === 'lockable' && S.lock)) solver.row(4 + li, 1, 4 + ri, -1, -1, 0);
    }
    // brakes + rolling resistance + parking brake
    const brk = clamp(ctl.brake || 0, 0, 1) * brakeScale;
    const hb = clamp(ctl.handbrake || 0, 0, 1);
    for (const W of wheels) {
      const ws = W.spec, k = P.wk[W.i];
      let Tb = brk * (ws.front ? spec.brakes.front : spec.brakes.rear) * (W.depthW > 0.2 || S._wetBrakes > 0 ? 0.5 : 1);
      if (hb && spec.brakes.park === 'rear' && !ws.front) Tb += hb * spec.brakes.parkT;
      const Trr = W.contact ? W.ts.crr * W.Fz * W.rEff : 0.5;
      W.brakeT = Tb;
      rowW[W.i] = solver.row(4 + W.i, 1, -1, 0, -1, 0, -(Tb + Trr) * h, (Tb + Trr) * h);
    }
    if (hb && spec.brakes.park === 'prop') solver.row(2, 1, -1, 0, -1, 0, -hb * spec.brakes.parkT * h, hb * spec.brakes.parkT * h);
    solver.solve();
    lamClutch = rC >= 0 ? solver.lam[rC] : 0;
    S.clutchTq = lamClutch / h; S.spragTq = rT >= 0 ? solver.lam[rT] / h : null;
    S.eng.tq = (tE - (S.eng.starter ? 0 : 0)) ; S.eng.load = clamp(S.eng.thr, 0, 1);
    for (const W of wheels) { W.omega = solver.w[4 + W.i]; W.spin = (W.spin + W.omega * h) % (Math.PI * 2); }
    // ---------------- hull contacts (anything but the tyres touching the ground: bellies, rollovers)
    let hullC = 0;
    for (const p of spec.hull) {
      _a[0] = p[0] - cg[0]; _a[1] = p[1] - cg[1]; _a[2] = p[2] - cg[2]; bw(R, _a, _b);
      const px = S.cgw[0] + _b[0], py = S.cgw[1] + _b[1], pz = S.cgw[2] + _b[2];
      env.ground(px, pz, gout);
      const depth = (gout.h - py) * gout.ny;
      if (depth <= 0) continue;
      hullC++;
      velAt(px, py, pz, _v); _v[0] -= gout.vx || 0; _v[1] -= gout.vy || 0; _v[2] -= gout.vz || 0;
      const vn = _v[0] * gout.nx + _v[1] * gout.ny + _v[2] * gout.nz;
      const kh = m * g * 12, ch = 2 * 0.6 * Math.sqrt(kh * m / 4);
      const fn = Math.max(0, kh * Math.min(depth, 0.2) - ch * vn);   // penetration capped (heightfield cliffs)
      if (vn < -3) ev('scrape', { speed: -vn, at: [px, py, pz] }, 0.3);
      const tx = _v[0] - gout.nx * vn, ty = _v[1] - gout.ny * vn, tz = _v[2] - gout.nz * vn, vt = Math.hypot(tx, ty, tz);
      const mu = 0.55, ft = mu * fn / Math.max(vt, 0.25);
      addF(gout.nx * fn - tx * ft, gout.ny * fn - ty * ft, gout.nz * fn - tz * ft, px, py, pz);
    }
    S.hullContact = hullC;
    // ---------------- obstacles (host collision)
    S.contactForce = 0;
    if (env.collide) for (const c of spec.collide) {
      _a[0] = c[0] - cg[0]; _a[1] = c[1] - cg[1]; _a[2] = c[2] - cg[2]; bw(R, _a, _b);
      const px = S.cgw[0] + _b[0], py = S.cgw[1] + _b[1], pz = S.cgw[2] + _b[2];
      const hit = env.collide(px, py, pz, c[3], cout);
      if (!hit || !(hit.depth > 0)) continue;
      velAt(px, py, pz, _v); _v[0] -= hit.vx || 0; _v[1] -= hit.vy || 0; _v[2] -= hit.vz || 0;
      const vn = _v[0] * hit.nx + _v[1] * hit.ny + _v[2] * hit.nz;
      const kc = m * 400, cc = 2 * 0.5 * Math.sqrt(kc * m);
      const fn = Math.max(0, kc * Math.min(hit.depth, 0.25) - cc * vn);
      if (vn < -2) ev('impact', { speed: -vn, at: [px, py, pz], n: [hit.nx, hit.ny, hit.nz], id: hit.id, local: [c[0], c[1], c[2]] }, 0.25);
      const tx = _v[0] - hit.nx * vn, ty = _v[1] - hit.ny * vn, tz = _v[2] - hit.nz * vn, vt = Math.hypot(tx, ty, tz);
      const ft = (hit.mu ?? 0.4) * fn / Math.max(vt, 0.3);
      addF(hit.nx * fn - tx * ft, hit.ny * fn - ty * ft, hit.nz * fn - tz * ft, px, py, pz);
      S.contactForce += fn;
    }
    // ---------------- water: buoyancy of the (leaky) hull and drag
    S.inWater = 0;
    if (water) {
      const B = spec.water;
      for (const p of B.points) {
        _a[0] = p[0] - cg[0]; _a[1] = p[1] - cg[1]; _a[2] = p[2] - cg[2]; bw(R, _a, _b);
        const px = S.cgw[0] + _b[0], py = S.cgw[1] + _b[1], pz = S.cgw[2] + _b[2];
        const wy = water(px, pz); if (!(wy > py)) continue;
        const sub_ = Math.min(1, (wy - py) / B.hullH);
        S.inWater = Math.max(S.inWater, sub_);
        const fb = RHO_W * g * B.vol * sub_ / B.points.length;
        velAt(px, py, pz, _v);
        const A = B.area * sub_ / B.points.length, sp = Math.hypot(_v[0], _v[1], _v[2]);
        const fd = 0.5 * RHO_W * 1.1 * A * sp;
        addF(-fd * _v[0], fb - fd * _v[1] * 2, -fd * _v[2], px, py, pz);
      }
    }
    // ---------------- aerodynamic drag
    {
      const wind = env.wind, vx = S.vel[0] - (wind ? wind[0] : 0), vy = S.vel[1] - (wind ? wind[1] : 0), vz = S.vel[2] - (wind ? wind[2] : 0);
      const sp = Math.hypot(vx, vy, vz);
      if (sp > 0.1) { const k = 0.5 * RHO_AIR * spec.aero.CdA * sp; F[0] -= k * vx; F[1] -= k * vy; F[2] -= k * vz; }
    }
    // ---------------- integrate the body
    S._acc[0] = F[0] / m; S._acc[1] = F[1] / m + g; S._acc[2] = F[2] / m;
    S.vel[0] += F[0] / m * h; S.vel[1] += F[1] / m * h; S.vel[2] += F[2] / m * h;
    // rotation through the world angular momentum: L += T h, w = R I^-1 R^T L. The gyroscopic coupling comes out of the
    // changing orientation exactly, and a tumbling body can't gain energy the way explicit Euler on w x (I w) does.
    const L = S.L;
    L[0] += Tq[0] * h; L[1] += Tq[1] * h; L[2] += Tq[2] * h;
    wFromL(R);
    S.cgw[0] += S.vel[0] * h; S.cgw[1] += S.vel[1] * h; S.cgw[2] += S.vel[2] * h;
    const q = S.q, wx = S.w[0] * h * 0.5, wy = S.w[1] * h * 0.5, wz = S.w[2] * h * 0.5;
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    q[0] += wx * qw + wy * qz - wz * qy; q[1] += wy * qw + wz * qx - wx * qz; q[2] += wz * qw + wx * qy - wy * qx; q[3] += -wx * qx - wy * qy - wz * qz;
    const ql = Math.hypot(q[0], q[1], q[2], q[3]); q[0] /= ql; q[1] /= ql; q[2] /= ql; q[3] /= ql;
    qToR(q, R); wFromL(R);   // w for the new orientation (the next substep's contact velocities)
    S.odometer += Math.abs(dot(S.vel, S.fwdv)) * h;
  }
  // w (world) from the angular momentum and the inertia in body axes; a safety cap at 40 rad/s
  function wFromL(Rm) {
    wb(Rm, S.L, _b); _b[0] /= S.I[0]; _b[1] /= S.I[1]; _b[2] /= S.I[2];
    const wl = Math.hypot(_b[0], _b[1], _b[2]); if (wl > 40) { const k = 40 / wl; _b[0] *= k; _b[1] *= k; _b[2] *= k; S.L[0] *= k; S.L[1] *= k; S.L[2] *= k; }
    bw(Rm, _b, S.w);
  }
  // keep L consistent after w was set from outside (reset, impulses)
  function LFromW(Rm) { wb(Rm, S.w, _b); _b[0] *= S.I[0]; _b[1] *= S.I[1]; _b[2] *= S.I[2]; bw(Rm, _b, S.L); }
  S._LFromW = () => { qToR(S.q, R); LFromW(R); };

  // ---------------------------------------------------------------------------------------------- slow systems (per frame)
  function systems(dt, ctl, env) {
    const e = S.eng, rpm = e.rpm, C = spec.cooling;
    // fuel: indicated power / (indicated efficiency x heating value); idle burn comes from the friction it overcomes
    const w = rpm / RPM, Pind = Math.max(0, e.tqInd) * w;
    // a carburettor runs rich at idle and light throttle (and part of the charge is wasted pumping); a diesel much less so
    const enrich = E.diesel ? 0.85 + 0.15 * clamp(e.thr / 0.3, 0, 1) : 0.4 + 0.6 * clamp(e.thr / 0.35, 0, 1);
    const eta = (E.etaInd[0] + (E.etaInd[1] - E.etaInd[0]) * clamp(e.thr, 0, 1)) * enrich;
    const LHV = E.diesel ? 42.8e6 : 43.5e6, dens = E.diesel ? 0.84 : 0.74;
    e.fuelFlow = e.running ? Pind / (eta * LHV) : 0;   // kg/s
    e.power = Math.max(0, (e.tqInd - e.fric)) * w;
    const used = e.fuelFlow * dt / dens;               // litres
    S.fuelL = Math.max(0, S.fuelL - used); S.tripFuel += used;
    // coolant: heat into the water ~ 30% of the fuel energy; radiator rejection with the thermostat, fan and ram air
    if (C) {
      const qIn = e.fuelFlow * LHV * C.heatFrac + (e.running ? 0 : 0);
      const open = clamp((e.temp - C.thermostat) / 10 + 0.08, 0.08, 1);
      const air = clamp(0.25 + 0.75 * rpm / E.redline + Math.abs(S.speed) / 20, 0, 2);
      const lvl = S.dmg ? S.dmg.coolant : 1;
      const qOut = C.UA * (e.temp - (env.ambient ?? 24)) * open * air * (0.15 + 0.85 * lvl) + 20 * (e.temp - (env.ambient ?? 24));
      e.temp += (qIn - qOut) / (C.heatCap * (0.4 + 0.6 * lvl)) * dt;
      if (S.inWater > 0.3) e.temp += ((env.ambient ?? 24) - e.temp) * 0.02 * dt;
    }
    // oil pressure: pump output rises with rpm, falls with a low sump and hot thin oil
    const oil = S.dmg ? S.dmg.oil : 1;
    e.oilP = rpm > 50 ? E.oilPsi * clamp((rpm / E.oilRpm) ** 0.6, 0, 1.08) * clamp(oil * 1.6 - 0.1, 0, 1) * clamp(1.25 - (e.temp - 60) / 160, 0.55, 1.2) : 0;
    // charging: the generator cuts in above ~ idle; the starter drains the battery
    S.genOn = e.running && rpm > E.idle * 0.85 && !(S.dmg && S.dmg.genDead);
    if (e.starter) S.battery = Math.max(0, S.battery - dt * 0.004);
    else if (S.genOn) S.battery = Math.min(1, S.battery + dt * 0.002);
    S.amps = e.starter ? -150 : S.genOn ? (S.battery < 0.98 ? 25 : 4) - (S.lights ? 8 : 0) : -(S.lights ? 8 : 1);
    // air brakes (M35): compressor 105 -> 120 psi governed (TM 9-2320-209-10), each application uses air
    if (spec.brakes.air) {
      const A = spec.brakes.air, b = clamp(ctl.brake || 0, 0, 1);
      if (e.running && S.airPsi < A.max) S.airPsi = Math.min(A.max, S.airPsi + A.fill * (rpm / E.redline) * dt);
      const db = b - (S._lastBrake || 0); if (db > 0) S.airPsi = Math.max(0, S.airPsi - db * A.use);
      S._lastBrake = b;
      if (S.airPsi < A.warn && e.running) ev('lowAir', null, 2);
    }
    // wet brakes dry out after a ford
    S._wetBrakes = Math.max(0, (S._wetBrakes || 0) - dt * 0.05);
    for (const W of wheels) if (W.depthW > 0.25) S._wetBrakes = 1;
    // water: ignition / intake depth (the deep-water fording kit raises the intake and seals the ignition)
    const Wt = spec.water;
    if (env.water) {
      const intake = S.worldPoint(S.kit ? Wt.kitIntake : Wt.intake, _p), wy = env.water(intake[0], intake[2]);
      S.depth = 0; for (const W of wheels) S.depth = Math.max(S.depth, W.depthW);
      if (wy > intake[1] && e.running) { e.hydrolock = true; ev('hydrolock'); }
      const ign = S.worldPoint(Wt.ignition, _p), wi = env.water(ign[0], ign[2]);
      e.wet = clamp(e.wet + ((wi > ign[1] && !Wt.sealed && !S.kit) ? dt * 0.8 : -dt * 0.05), 0, 1);
      e.misfire = e.wet;
      if (S.depth > (S.kit ? Wt.kitFord : Wt.ford)) ev('deepWater', { depth: S.depth }, 3);
    }
    // a hard landing / rollover / crash goes to the damage model
    if (!S._wasUpside && S.up[1] < 0.2 && S.onGround === false) { /* in the air, tumbling */ }
    if (S.up[1] < 0.35 && (S._lastUp ?? 1) >= 0.35) ev('rollover', { speed: Math.abs(S.speed) });
    S._lastUp = S.up[1];
    S.slipMax = 0; for (const W of wheels) S.slipMax = Math.max(S.slipMax, W.slide);
    S.latG = dot(S._acc, [R[0], R[1], R[2]]) / 9.81; S.lonG = dot(S._acc, S.fwdv) / 9.81;
    if (S.dmg) S.dmg.update(S, dt, env);
    if (S.horn && S.battery < 0.02) S.horn = false;
  }
  S.reset([0, 0, 0], 0);
  return S;
}
// a wet version of a surface (ford beds, puddles): mud stays mud, hard surfaces get the wet friction
const _wetCache = new Map();
function WET_OF(s) {
  let w = _wetCache.get(s); if (w) return w;
  w = { ...s, mu: Math.min(s.mu, s.name === 'tarmac' || s.name === 'deck' ? 0.6 : s.mu * 0.8), Cy: s.Cy, Ey: s.Ey }; _wetCache.set(s, w); return w;
}
// a surface with its friction scaled by the ground query's optional mu (oil, ice patches, a test rig)
const _muCache = new Map();
function SCALED(s, k) {
  if (!(k > 0) || k === 1) return s;
  const key = s.name + ':' + Math.round(k * 100);
  let o = _muCache.get(key); if (!o) { o = { ...s, mu: s.mu * k }; _muCache.set(key, o); } return o;
}
