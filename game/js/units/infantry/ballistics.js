// NGC-1980 infantry: exterior and terminal ballistics. PURE: plain JS, no THREE, no DOM, no game imports (runs in node).
//
// Exterior: 3-DOF point mass. Drag from the standard G1 / G7 drag functions (Cd vs Mach, the Ingalls/Mayevski G1 and
// the BRL G7 tables as tabulated by McCoy, "Modern Exterior Ballistics", 1999) scaled by a published ballistic
// coefficient, or from a constant Cd and reference area for the low-speed finned / spun rounds (40 mm, 66 mm LAW).
//   decel = rho * v^2 * Cd_std(M) * pi / (8 * BC)          BC in kg/m^2 (1 lb/in^2 = 703.07 kg/m^2)
// with v relative to the air (wind), M = v / c(T), rho from temperature, pressure and humidity, plus gravity.
// Integration: Heun (2nd order), allocation-free, so the game can step every live round each frame.
// Not modelled: spin drift, aerodynamic jump, Coriolis, yaw of repose (point mass), transonic instability.
//
// Terminal: penetration by De Marre (hard plates) or energy per presented area (soft media), ricochet by grazing angle,
// and the HIT INFO structure the medical / damage model (MEDINV) consumes. See makeHitInfo().
//
// Units: SI everywhere (m, s, kg, J, Pa, deg C, hPa for pressure). World axes: three.js style, +y up.

export const G0 = 9.80665;
export const KGM2_PER_LBIN2 = 703.0696;   // 1 lb/in^2 -> kg/m^2
const PI = Math.PI;

// ------------------------------------------------------------------------------------------------ drag functions
// Standard drag functions (Cd vs Mach). G1: flat-base, 2-caliber ogive (Ingalls); G7: 7.5 deg boat tail, 10-cal
// tangent ogive (modern "VLD" reference). Values as tabulated in McCoy 1999 / JBM; INFERRED (reproduced from those tables).
const G1T = [
  [0, .2629], [.05, .2558], [.1, .2487], [.15, .2413], [.2, .2344], [.25, .2278], [.3, .2214], [.35, .2155], [.4, .2104], [.45, .2061],
  [.5, .2032], [.55, .2020], [.6, .2034], [.7, .2165], [.725, .2230], [.75, .2313], [.775, .2417], [.8, .2546], [.825, .2706], [.85, .2901],
  [.875, .3136], [.9, .3415], [.925, .3734], [.95, .4084], [.975, .4448], [1, .4805], [1.025, .5136], [1.05, .5427], [1.075, .5677], [1.1, .5883],
  [1.125, .6053], [1.15, .6191], [1.2, .6393], [1.25, .6518], [1.3, .6589], [1.35, .6621], [1.4, .6625], [1.45, .6607], [1.5, .6573], [1.55, .6528],
  [1.6, .6474], [1.65, .6413], [1.7, .6347], [1.75, .6280], [1.8, .6210], [1.85, .6141], [1.9, .6072], [1.95, .6003], [2, .5934], [2.05, .5867],
  [2.1, .5804], [2.15, .5743], [2.2, .5685], [2.25, .5630], [2.3, .5577], [2.35, .5527], [2.4, .5481], [2.45, .5438], [2.5, .5397], [2.6, .5325],
  [2.7, .5264], [2.8, .5211], [2.9, .5168], [3, .5133], [3.2, .5084], [3.4, .5054], [3.6, .5030], [3.8, .5016], [4, .5006], [5, .4995],
];
const G7T = [
  [0, .1198], [.1, .1196], [.2, .1193], [.3, .1194], [.4, .1193], [.5, .1194], [.6, .1194], [.65, .1197], [.7, .1202], [.725, .1207],
  [.75, .1215], [.775, .1226], [.8, .1242], [.825, .1266], [.85, .1306], [.875, .1368], [.9, .1464], [.925, .1660], [.95, .2054], [.975, .2993],
  [1, .3803], [1.025, .4015], [1.05, .4043], [1.075, .4034], [1.1, .4014], [1.125, .3987], [1.15, .3955], [1.2, .3884], [1.25, .3810], [1.3, .3732],
  [1.35, .3657], [1.4, .3580], [1.5, .3440], [1.6, .3315], [1.7, .3209], [1.8, .3117], [1.9, .3042], [2, .2980], [2.2, .2864], [2.4, .2752],
  [2.6, .2643], [2.8, .2537], [3, .2434], [3.5, .2205], [4, .2034], [5, .1800],
];
const LUT_STEP = 0.005, LUT_N = 1001;   // Mach 0 .. 5
function buildLut(t) {
  const out = new Float32Array(LUT_N);
  for (let i = 0, j = 0; i < LUT_N; i++) {
    const m = i * LUT_STEP; while (j < t.length - 2 && t[j + 1][0] < m) j++;
    const [m0, c0] = t[j], [m1, c1] = t[j + 1]; out[i] = c0 + (c1 - c0) * Math.min(1, Math.max(0, (m - m0) / (m1 - m0)));
  }
  return out;
}
const LUT = { G1: buildLut(G1T), G7: buildLut(G7T) };
export function cdStd(model, mach) {
  const L = LUT[model]; const f = Math.min(LUT_N - 1.001, Math.max(0, mach / LUT_STEP)), i = f | 0, a = f - i;
  return L[i] + (L[i + 1] - L[i]) * a;
}

// ------------------------------------------------------------------------------------------------ atmosphere
// Moist-air density (ideal gas mix, Tetens saturation pressure) and the speed of sound. ICAO sea level: 15 C,
// 1013.25 hPa, dry -> 1.2250 kg/m^3, 340.3 m/s (CONFIRMED, ICAO Doc 7488).
export function airDensity(T = 15, pHpa = 1013.25, rh = 0) {
  const Tk = T + 273.15, es = 6.1078 * Math.pow(10, 7.5 * T / (T + 237.3)), pv = rh * es * 100, pd = pHpa * 100 - pv;
  return pd / (287.058 * Tk) + pv / (461.495 * Tk);
}
export const speedOfSound = (T = 15) => 331.3 * Math.sqrt(1 + T / 273.15);
// atmosphere at altitude (barometric formula from the given sea-level pressure, 6.5 K/km lapse)
export function atmosphere({ T = 15, p = 1013.25, rh = 0.5, alt = 0, wind = null, g = G0 } = {}) {
  const Ta = T - 0.0065 * alt, pa = p * Math.pow(1 - 0.0065 * alt / (T + 273.15), 5.2559);
  return { T: Ta, p: pa, rh, rho: airDensity(Ta, pa, rh), c: speedOfSound(Ta), wind: wind || [0, 0, 0], g };
}
export const STD_ATMOS = atmosphere({ T: 15, p: 1013.25, rh: 0 });

// ------------------------------------------------------------------------------------------------ ammunition
// cal (m), mass = projectile mass (kg), cart = complete cartridge mass (kg), mv = nominal muzzle velocity (m/s) from the
// issue weapon, mvSd = shot-to-shot standard deviation, drag model + BC (lb/in^2) or { cd, area }.
// core: 'lead' (FMJ lead core), 'pistol' (blunt FMJ), 'heat' (shaped charge), 'hedp' (dual purpose grenade).
// Sources: TM 43-0001-27 (Army ammunition data sheets, small calibre), FM 23-9 (M16A1, 1974), FM 23-67 (M60, 1964/84),
// FM 23-35 (pistols, 1971), FM 23-31 (M203/M79, 1972), FM 23-33 (M72A1/A2 LAW, 1977).
export const ROUNDS = {
  M193: {   // 5.56x45 Ball M193: 55 gr FMJBT lead core, 3,250 fps from the 20 in M16A1 barrel
    name: '5.56mm Ball M193', cal: 0.00556, mass: 0.003564, cart: 0.0118, mv: 991, mvSd: 6,   // mv CONFIRMED (TM 43-0001-27: 3,250 fps); mass CONFIRMED (55 gr); cart INFERRED (~182 gr)
    model: 'G7', bc: 0.120,             // INFERRED: G7 0.120 (Litz-style G7 for 55 gr FMJBT; G1 equivalent ~0.24). G7 tracks the
                                        // published maximum range better than G1 (+8% vs +16%, see the bench)
    core: 'lead', fragV: 823,           // INFERRED: M193 yaws and fragments in tissue above ~2,700 fps impact (Fackler, Letterman Army Inst. 1980s)
    maxRange: 2653,                     // CONFIRMED: FM 23-9 (M16A1 maximum range 2,653 m)
  },
  M196: {   // 5.56 tracer M196 (red, burnout ~ 450 m), same ballistics as M193 to the eye
    name: '5.56mm Tracer M196', cal: 0.00556, mass: 0.00350, cart: 0.0117, mv: 991, mvSd: 7, model: 'G7', bc: 0.115, core: 'lead', fragV: 823,
    tracer: 450,                        // INFERRED: M196 trace visible to ~450 m (TM 43-0001-27 lists 450 m)
  },
  M80: {    // 7.62x51 Ball M80: 147 gr FMJBT, 2,800 fps from the M60
    name: '7.62mm Ball M80', cal: 0.00782, mass: 0.00953, cart: 0.0254, mv: 853, mvSd: 6,   // mv CONFIRMED (FM 23-67 / TM 43-0001-27 2,750-2,800 fps); mass CONFIRMED (147 gr)
    model: 'G7', bc: 0.200,             // INFERRED: 147 gr M80 G7 ~0.20 (G1 ~0.39-0.40, Litz / Sierra)
    core: 'lead', fragV: 2000,          // M80 yaws but rarely fragments: no fragmentation threshold in the combat envelope
    maxRange: 3725,                     // CONFIRMED: FM 23-67 (M60 maximum range 3,725 m)
  },
  M62: {    // 7.62 tracer M62 (4 ball : 1 tracer in M60 belts), trace to 900 m
    name: '7.62mm Tracer M62', cal: 0.00782, mass: 0.00926, cart: 0.0248, mv: 838, mvSd: 7, model: 'G7', bc: 0.19, core: 'lead', fragV: 2000,
    tracer: 900,                        // CONFIRMED: FM 23-67 (tracer burns out at ~900 m)
  },
  M1911: {  // .45 ACP Ball M1911: 230 gr FMJ round nose, 830 fps
    name: '.45 Ball M1911', cal: 0.01143, mass: 0.0149, cart: 0.0213, mv: 253, mvSd: 5,   // mv CONFIRMED (FM 23-35: 830 fps); mass CONFIRMED (230 gr)
    model: 'G1', bc: 0.16,              // INFERRED: 230 gr FMJ RN G1 ~0.15-0.19
    core: 'pistol', fragV: 9999,
    maxRange: 1500,                     // CONFIRMED: FM 23-35 (M1911A1 maximum range 1,500 m)
  },
  M433: {   // 40x46 mm HEDP M433 (M203 / M79): spin stabilised, 250 fps
    name: '40mm HEDP M433', cal: 0.040, mass: 0.180, cart: 0.230, mv: 76, mvSd: 1.2,   // mv CONFIRMED (FM 23-31: 76 m/s); cart CONFIRMED (~0.23 kg); projectile INFERRED
    model: 'CD', cd: 0.26,              // INFERRED: fitted so the maximum range is ~400 m (FM 23-31 maximum range 400 m)
    core: 'hedp', arm: [14, 27],        // CONFIRMED: FM 23-31, arms between 14 and 27 m from the muzzle
    heatPen: 50, killR: 5, casualtyR: 15,   // CONFIRMED: penetrates 2 in (50 mm) of steel; 5 m kill radius (FM 23-31). casualtyR INFERRED
    maxRange: 400,                      // CONFIRMED: FM 23-31
  },
  M72: {    // 66 mm HEAT M72A2 rocket: motor burns out inside the tube, fin stabilised, 475 fps
    name: '66mm HEAT M72A2', cal: 0.066, mass: 1.0, cart: 1.0, mv: 145, mvSd: 2,   // mv CONFIRMED (FM 23-33: 145 m/s); rocket mass INFERRED (~1.0 kg)
    model: 'CD', cd: 0.40,              // INFERRED: fitted so the maximum range is ~1,000 m (FM 23-33 maximum range 1,000 m)
    core: 'heat', arm: [10, 10],        // INFERRED: arms ~10 m from the muzzle
    heatPen: 300, killR: 1.5, casualtyR: 8,   // UNVERIFIED: 300 mm RHA is the commonly quoted M72A2 figure (FM 23-33 says "up to 12 in")
    maxRange: 1000,                     // CONFIRMED: FM 23-33
  },
};
for (const [k, r] of Object.entries(ROUNDS)) {
  r.key = k; r.area = PI * r.cal * r.cal / 4;
  r.bcSI = r.model === 'CD' ? 0 : r.bc * KGM2_PER_LBIN2;
  r.kCD = r.model === 'CD' ? r.cd * r.area / (2 * r.mass) : 0;    // decel = kCD * rho * v^2
  r.kG = r.model === 'CD' ? 0 : PI / (8 * r.bcSI);                 // decel = kG * rho * v^2 * Cd_std(M)
}

// ------------------------------------------------------------------------------------------------ flight
// A live projectile. Plain object so the host can pool them. dir need not be unit length.
export function createProjectile(round, x, y, z, dx, dy, dz, v, o = {}) {
  const R = typeof round === 'string' ? ROUNDS[round] : round, n = Math.hypot(dx, dy, dz) || 1, sp = v ?? R.mv;
  return {
    round: R, x, y, z, px: x, py: y, pz: z, ox: x, oy: y, oz: z,
    vx: dx / n * sp, vy: dy / n * sp, vz: dz / n * sp, v: sp, t: 0, dist: 0, alive: true, armed: !R.arm, pens: 0, rics: 0,
    owner: o.owner ?? null, side: o.side ?? 0, tracer: !!R.tracer, id: o.id ?? 0, maxT: o.maxT ?? 30,
    armDist: R.arm ? (o.armDist ?? (R.arm[0] + R.arm[1]) / 2) : 0,
  };
}
// acceleration (drag + gravity) for a velocity, written into A[0..2]
function accel(R, vx, vy, vz, at, A) {
  const w = at.wind, rx = vx - w[0], ry = vy - w[1], rz = vz - w[2], V = Math.hypot(rx, ry, rz);
  const k = R.model === 'CD' ? R.kCD * at.rho * V : R.kG * at.rho * V * cdStd(R.model, V / at.c);
  A[0] = -k * rx; A[1] = -k * ry - at.g; A[2] = -k * rz;
}
const _a1 = [0, 0, 0], _a2 = [0, 0, 0];
// advance by dt (internally sub-stepped to <= maxH); keeps the segment start in px/py/pz for hit tests
export function stepProjectile(P, dt, at = STD_ATMOS, maxH = 1 / 400) {
  P.px = P.x; P.py = P.y; P.pz = P.z;
  const n = Math.max(1, Math.ceil(dt / maxH)), h = dt / n, R = P.round;
  for (let i = 0; i < n; i++) {
    accel(R, P.vx, P.vy, P.vz, at, _a1);
    const ex = P.vx + _a1[0] * h, ey = P.vy + _a1[1] * h, ez = P.vz + _a1[2] * h;
    accel(R, ex, ey, ez, at, _a2);
    const nx = P.vx + 0.5 * (_a1[0] + _a2[0]) * h, ny = P.vy + 0.5 * (_a1[1] + _a2[1]) * h, nz = P.vz + 0.5 * (_a1[2] + _a2[2]) * h;
    const sx = 0.5 * (P.vx + nx) * h, sy = 0.5 * (P.vy + ny) * h, sz = 0.5 * (P.vz + nz) * h;
    P.x += sx; P.y += sy; P.z += sz; P.vx = nx; P.vy = ny; P.vz = nz; P.dist += Math.hypot(sx, sy, sz);
  }
  P.t += dt; P.v = Math.hypot(P.vx, P.vy, P.vz);
  if (!P.armed && R.arm && P.dist >= P.armDist) P.armed = true;
  if (P.t > P.maxT) P.alive = false;
  return P;
}
export const energy = (R, v) => 0.5 * R.mass * v * v;

// 2D trajectory in the vertical plane for range cards and the bench. The bore starts sightHeight below the line of
// sight (LOS horizontal unless losAngle), elevated `angle` (rad) above the LOS. Returns samples every `every` metres
// of horizontal range: { x, y (height above the LOS, m), v, E, t, drift (crosswind drift, m) }.
export function trajectory(round, { angle = 0, sightHeight = 0, mv, atmos = STD_ATMOS, xMax = 1000, every = 25, crossWind = 0, losAngle = 0, h = 1 / 2000 } = {}) {
  const R = typeof round === 'string' ? ROUNDS[round] : round, at = { ...atmos, wind: [0, 0, crossWind] };
  // work in LOS-aligned coordinates: gravity tilted by the LOS angle
  const P = createProjectile(R, 0, -sightHeight, 0, Math.cos(angle), Math.sin(angle), 0, mv ?? R.mv);
  const cl = Math.cos(losAngle), sl = Math.sin(losAngle), out = [];
  let next = 0;
  const gx = -at.g * sl, gy = -at.g * cl;
  const A1 = [0, 0, 0], A2 = [0, 0, 0], at0 = { ...at, g: 0 };
  while (P.t < 60) {
    if (P.x >= next - 1e-9) {
      out.push({ x: next, y: P.y, v: P.v, E: energy(R, P.v), t: P.t, drift: P.z });
      next += every; if (next > xMax + 1e-9) break;
    }
    // one Heun step with tilted gravity
    accel(R, P.vx, P.vy, P.vz, at0, A1); A1[0] += gx; A1[1] += gy;
    const ex = P.vx + A1[0] * h, ey = P.vy + A1[1] * h, ez = P.vz + A1[2] * h;
    accel(R, ex, ey, ez, at0, A2); A2[0] += gx; A2[1] += gy;
    const nx = P.vx + 0.5 * (A1[0] + A2[0]) * h, ny = P.vy + 0.5 * (A1[1] + A2[1]) * h, nz = P.vz + 0.5 * (A1[2] + A2[2]) * h;
    const x0 = P.x, y0 = P.y, z0 = P.z;
    P.x += 0.5 * (P.vx + nx) * h; P.y += 0.5 * (P.vy + ny) * h; P.z += 0.5 * (P.vz + nz) * h;
    P.vx = nx; P.vy = ny; P.vz = nz; P.t += h; P.v = Math.hypot(nx, ny, nz);
    // interpolate the sample exactly at `next`
    if (P.x >= next && x0 < next) {
      const f = (next - x0) / (P.x - x0);
      out.push({ x: next, y: y0 + (P.y - y0) * f, v: P.v, E: energy(R, P.v), t: P.t - h * (1 - f), drift: z0 + (P.z - z0) * f });
      next += every; if (next > xMax + 1e-9) break;
    }
    if (P.y < -5000 || P.vx <= 0) break;
  }
  return out;
}
// height above the LOS at range x for a bore elevation angle
function heightAt(R, angle, x, o) {
  const tr = trajectory(R, { ...o, angle, xMax: x, every: x });
  return tr.length > 1 ? tr[tr.length - 1].y : -1e9;
}
// bore elevation (rad, relative to the LOS) that puts the round back on the LOS at zeroRange (the flat solution)
export function zeroAngle(round, zeroRange, o = {}) {
  const R = typeof round === 'string' ? ROUNDS[round] : round;
  let a0 = 0, a1 = 0.02, f0 = heightAt(R, a0, zeroRange, o), f1 = heightAt(R, a1, zeroRange, o);
  for (let i = 0; i < 40 && Math.abs(f1) > 1e-5; i++) {
    const a2 = a1 - f1 * (a1 - a0) / (f1 - f0); a0 = a1; f0 = f1; a1 = Math.max(-0.2, Math.min(0.7, a2)); f1 = heightAt(R, a1, zeroRange, o);
  }
  return a1;
}
// elevation (rad above horizontal) to land on flat ground at range (indirect fire: M203 quadrant, LAW range lines)
export function elevationFor(round, range, o = {}) {
  const R = typeof round === 'string' ? ROUNDS[round] : round;
  const land = a => { const tr = groundRange(R, a, o); return tr; };
  let lo = 0.0005, hi = Math.PI / 4;
  if (land(hi) < range) return null;   // out of reach
  for (let i = 0; i < 50; i++) { const m = 0.5 * (lo + hi); if (land(m) < range) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}
// horizontal distance where the round comes back to launch height, fired at elevation a (rad); also time of flight
export function groundRange(round, a, { mv, atmos = STD_ATMOS, h = 1 / 1000, info = null } = {}) {
  const R = typeof round === 'string' ? ROUNDS[round] : round;
  const P = createProjectile(R, 0, 0, 0, Math.cos(a), Math.sin(a), 0, mv ?? R.mv); P.maxT = 1e9;
  let px = 0, py = 0, apex = 0;
  while (P.t < 200) {
    px = P.x; py = P.y; stepProjectile(P, h, atmos, h); apex = Math.max(apex, P.y);
    if (P.y < 0 && P.vy < 0) { const f = py / (py - P.y), x = px + (P.x - px) * f; if (info) Object.assign(info, { t: P.t - h * (1 - f), v: P.v, apex, angleImpact: Math.atan2(-P.vy, P.vx) }); return x; }
  }
  return P.x;
}
// maximum range on flat ground (golden-section search over the elevation)
export function maxRange(round, o = {}) {
  let a = 0.2, b = 1.1; const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = groundRange(round, c, o), fd = groundRange(round, d, o);
  for (let i = 0; i < 30; i++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = groundRange(round, c, o); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = groundRange(round, d, o); } }
  return { range: Math.max(fc, fd), angle: (a + b) / 2 };
}

// ------------------------------------------------------------------------------------------------ terminal
// Materials. Hard plates: perforation thickness by De Marre, t = C * f * (m v^2 / d^1.5)^0.714 / hard (mm), calibrated so
// the M1 helmet (1.12 mm Hadfield manganese steel) just stops a .45 ACP ball at 800 fps: CONFIRMED anchor (the M1 shell
// spec / WWII acceptance test: resist .45 ACP at 800 ft/s). Soft media: depth = f * E / (A * res) (mm), res values tuned
// to the order of FM 5-103 (Survivability, 1985) protection thicknesses: UNVERIFIED.
// ricochet: grazing angle (deg) below which a hit glances off; keep: velocity fraction kept on a ricochet. INFERRED.
export const MATERIALS = {
  rha:        { kind: 'plate', hard: 1.00, ricochet: 25, keep: 0.6 },   // rolled homogeneous armour (tanks)
  hadfield:   { kind: 'plate', hard: 0.88, ricochet: 20, keep: 0.6 },   // M1 helmet shell steel
  steel:      { kind: 'plate', hard: 0.55, ricochet: 22, keep: 0.6 },   // mild steel (targets, vehicle bodies, plates)
  sheet:      { kind: 'plate', hard: 0.45, ricochet: 12, keep: 0.7 },   // car / truck sheet metal
  aluminium:  { kind: 'plate', hard: 0.30, ricochet: 15, keep: 0.6 },
  nylon:      { kind: 'plate', hard: 0.42, ricochet: 0, keep: 0 },      // M1955 flak vest: ballistic nylon (fragments, pistol)
  glass:      { kind: 'plate', hard: 0.15, ricochet: 8, keep: 0.8 },
  wood:       { kind: 'soft', res: 1.6e5, ricochet: 8, keep: 0.5 },    // pine, J per m^2 per mm
  soil:       { kind: 'soft', res: 3.2e5, ricochet: 12, keep: 0.4 },
  sandbag:    { kind: 'soft', res: 3.6e5, ricochet: 10, keep: 0.4 },
  brick:      { kind: 'soft', res: 1.1e6, ricochet: 15, keep: 0.4 },
  concrete:   { kind: 'soft', res: 2.0e6, ricochet: 18, keep: 0.45 },
  water:      { kind: 'fluid', rho: 1000, breakup: 2.5, ricochet: 7, keep: 0.7 },   // fast rifle bullets break up in water
  flesh:      { kind: 'fluid', rho: 1060, breakup: 1, ricochet: 0, keep: 0 },     // through-and-through checks only; wounds are MEDINV's
};
// calibrated (see above): .45 ball (pistol core factor 1) at 243.8 m/s (800 fps) -> exactly 1.12 mm of Hadfield steel
const demarreX = (m, v, d) => Math.pow(m * v * v / Math.pow(d, 1.5), 0.714);
const DEMARRE_C = 1.12 * 0.88 / demarreX(0.0149, 243.84, 0.01143);
// core factors: how well the round's core penetrates hard plate / soft media relative to a rigid blunt slug
// INFERRED: lead-core rifle bullets deform on steel (0.5); a slow blunt pistol slug does not deform in wood or earth, so
// it goes ~6x deeper than its energy alone suggests (fitted: .45 ball ~150 mm of pine, the old Ordnance pine-board figure, UNVERIFIED)
const CORE = { lead: [0.5, 1.0], pistol: [1.0, 6.0], ap: [1.6, 1.3], hedp: [1, 1], heat: [1, 1] };
// thickness (mm) of `material` this round defeats at speed v (normal incidence)
export function penetration(round, v, material) {
  const R = typeof round === 'string' ? ROUNDS[round] : round, M = typeof material === 'string' ? MATERIALS[material] : material;
  if (R.core === 'heat' || R.core === 'hedp') return M.kind === 'plate' ? R.heatPen / M.hard : R.heatPen * 4 * (1.1e6 / (M.res || 2e5));   // shaped charge jet: velocity independent
  const cf = CORE[R.core] || CORE.lead;
  // lead cores mushroom on hard plate, more the faster they hit (0.5 at >= 700 m/s rising to 1 at <= 300 m/s): INFERRED
  if (M.kind === 'plate') return DEMARRE_C * (R.core === 'lead' ? cf[0] + (1 - cf[0]) * Math.min(1, Math.max(0, (700 - v) / 400)) : cf[0]) * demarreX(R.mass, v, R.cal) / M.hard;
  // fluids (water, tissue): drag penetration x = 2 (m/A) / (rho Cd) ln(v / 30 m/s); Cd 0.6 for a stable blunt pistol
  // bullet, 1.0 for a yawing rifle bullet, 2.0 once it fragments; fast rifle bullets break up in water (x breakup).
  // INFERRED: gives ~0.6-0.9 m of tissue for .45 / M80, ~0.4 m for fragmenting M193, < 1 m of water for rifles.
  if (M.kind === 'fluid') {
    const cdE = (R.core === 'pistol' ? 0.6 : v > R.fragV ? 2 : 1) * (R.core !== 'pistol' && v > 500 ? M.breakup : 1);
    return v <= 30 ? 0 : 1000 * 2 * (R.mass / R.area) / (M.rho * cdE) * Math.log(v / 30);
  }
  // soft media: energy per presented area, weighted by sectional density (long heavy bullets go deeper); M193 above
  // its fragmentation speed breaks up and goes LESS deep up close (FM 90-10-1: 5.56 penetrates masonry best at ~200 m)
  const sd = Math.sqrt(R.mass / (R.cal * R.cal) / 156), frag = v > R.fragV ? 0.5 : 1;
  return cf[1] * sd * frag * energy(R, v) / (R.area * M.res);
}
// impact of a live projectile on a surface: normal (unit, facing the shooter), material, thickness (mm) of the
// obstacle. Mutates P (velocity/direction) and returns { result: 'stop' | 'pen' | 'ricochet', v0, v1, grazing (deg) }.
// rng() -> [0,1). Penetrations leave with the residual energy (E1 = E0 (1 - t / tmax)) and a small deflection.
export function impact(P, nx, ny, nz, material, thickness = 1e9, rng = Math.random) {
  const R = P.round, M = typeof material === 'string' ? MATERIALS[material] : material, v0 = P.v || Math.hypot(P.vx, P.vy, P.vz);
  const ux = P.vx / v0, uy = P.vy / v0, uz = P.vz / v0, cosI = -(ux * nx + uy * ny + uz * nz);   // cos of the angle to the normal
  const grazing = 90 - Math.acos(Math.max(-1, Math.min(1, cosI))) * 180 / PI;
  const out = { result: 'stop', v0, v1: 0, grazing };
  if (R.core === 'heat' || R.core === 'hedp') { P.alive = false; out.result = 'detonate'; return out; }
  // ricochet: likely below the critical grazing angle, never above 1.5x it
  if (M.ricochet > 0 && grazing < M.ricochet * 1.5) {
    const pr = grazing < M.ricochet ? 0.85 - 0.5 * grazing / M.ricochet : 0.35 * (1.5 - grazing / M.ricochet) / 0.5;
    if (rng() < pr) {
      const d = 2 * (ux * nx + uy * ny + uz * nz);
      let rx = ux - d * nx, ry = uy - d * ny, rz = uz - d * nz;
      // the outgoing path is flatter than the incoming (pulls toward the surface) and scattered
      const pull = 0.5; rx -= nx * (rx * nx + ry * ny + rz * nz) * pull; ry -= ny * (rx * nx + ry * ny + rz * nz) * pull; rz -= nz * (rx * nx + ry * ny + rz * nz) * pull;
      const s = 0.12; rx += (rng() - 0.5) * s; ry += (rng() - 0.5) * s * 0.5; rz += (rng() - 0.5) * s;
      const rn = Math.hypot(rx, ry, rz), v1 = v0 * M.keep * (0.8 + 0.2 * rng());
      P.vx = rx / rn * v1; P.vy = ry / rn * v1; P.vz = rz / rn * v1; P.v = v1; P.rics++;
      Object.assign(out, { result: 'ricochet', v1 }); return out;
    }
  }
  // penetration: effective thickness grows with obliquity
  const tEff = thickness / Math.max(0.2, cosI), tMax = penetration(R, v0, M);
  if (tMax > tEff) {
    const v1 = v0 * Math.sqrt(1 - tEff / tMax), s = 0.04 + 0.1 * (tEff / tMax);
    let rx = ux + (rng() - 0.5) * s, ry = uy + (rng() - 0.5) * s, rz = uz + (rng() - 0.5) * s; const rn = Math.hypot(rx, ry, rz);
    P.vx = rx / rn * v1; P.vy = ry / rn * v1; P.vz = rz / rn * v1; P.v = v1; P.pens++;
    Object.assign(out, { result: 'pen', v1 }); return out;
  }
  P.alive = false; return out;
}

// ------------------------------------------------------------------------------------------------ hit info
// THE CONTRACT WITH THE MEDICAL / DAMAGE MODEL (MEDINV). One object per projectile strike on a body:
// {
//   kind: 'bullet' | 'fragment' | 'blast',
//   round: 'M193' | 'M80' | ... (ROUNDS key), name, calibre (m), mass (kg),
//   velocity (m/s at impact), energy (J), momentum (N s),
//   dir: [x, y, z] unit travel direction, point: [x, y, z] world impact point,
//   range (m travelled), part: 'head' | 'neck' | 'thorax' | 'stomach' | 'armL' | 'armR' | 'legL' | 'legR' (soldiermodel HITBOXES),
//   penetratedArmour: [{ material, thickness }] (helmet / vest it went through first), stopped: bool (armour stopped it),
//   fragments: bool (M193 above ~823 m/s yaws and breaks up: bigger wound), tracer: bool,
//   ownerId, side, time (s of flight)
// }
export function makeHitInfo(P, part, px, py, pz, extra = {}) {
  const R = P.round, v = P.v;
  return {
    kind: extra.kind || 'bullet', round: R.key, name: R.name, calibre: R.cal, mass: R.mass,
    velocity: v, energy: energy(R, v), momentum: R.mass * v,
    dir: [P.vx / v, P.vy / v, P.vz / v], point: [px, py, pz], range: P.dist, part,
    penetratedArmour: extra.armour || [], stopped: !!extra.stopped, fragments: v > R.fragV, tracer: !!R.tracer,
    ownerId: P.owner, side: P.side, time: P.t,
  };
}
// explosion description for HEDP / HEAT detonations (the host applies blast + fragments to everything in range)
export function explosionInfo(P, x, y, z) {
  const R = P.round;
  return { kind: 'explosion', round: R.key, name: R.name, point: [x, y, z], armed: P.armed, killRadius: P.armed ? R.killR : 0,
    casualtyRadius: P.armed ? R.casualtyR : 0, heatPen: P.armed ? R.heatPen : 0, ownerId: P.owner, side: P.side, dud: !P.armed };
}

// ------------------------------------------------------------------------------------------------ misc
// seeded RNG (mulberry32) for deterministic tests
export function rngSeeded(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// normal deviate (Box-Muller)
export function gauss(rng = Math.random) { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * rng()); }
export const MOA = PI / (180 * 60), MIL = 1 / 1000;
