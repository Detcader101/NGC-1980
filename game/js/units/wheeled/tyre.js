import { hypot2 } from '../../hypot.js';   // (ngc/perf-cpu) Math.hypot without the garbage, same bits
// tyre.js - the tyre and the ground under it, for the NGC-1980 wheeled vehicles. Pure JS (no THREE, no DOM): node runs it.
//
// Model
// - Pacejka "magic formula" shape  y = D sin(C atan(B s - E (B s - atan(B s))))  for the longitudinal and the lateral force,
//   evaluated on NORMALISED slip (slip / slip at the force peak), so combined slip is the classic similarity method: one
//   resultant slip s = |(sx, sy)|, each component takes its share sx/s, sy/s of its own curve (Pacejka, "Tyre and Vehicle
//   Dynamics", 3rd ed., ch. 4.3; the "friction ellipse" emerges). Peak slip follows from the tyre's slip stiffnesses
//   (CK = cK Fz, Calpha = cA Fz) and the friction coefficient, so a stiff radial and a soft bias-ply cross-country tyre
//   differ the way they do in life (the cross-country tyre peaks late and gently).
// - Load sensitivity: mu falls as the load rises past the rated load (Pacejka's pDx2 / pDy2, about -0.1..-0.2), the
//   cornering stiffness per unit load falls too (pKy2).
// - Camber thrust (cG Fz gamma) and the drop of lateral peak with camber: this is what makes swing axles and semi-trailing
//   arms "tuck under" when the wheel droops (Beetle, M151).
// - Transient: slip states are tyre DEFLECTIONS u (metres) with relaxation lengths Lx, Ly (Pacejka ch. 7):
//   du/dt = v_slip - |vx| u / L, slip = u / L. At speed this is the usual first-order lag; at standstill the tyre is a
//   spring (so a parked car stays parked on a slope), with extra damping below ~3 m/s so it doesn't buzz.
// - Surfaces: friction, curve shape, rolling resistance, sinkage (Bekker-style: depth from ground pressure, deeper with wheel
//   spin, dug-in wheels add bulldozing resistance), and the tread factor (military NDT cross-country tread bites in mud
//   and sand, a road tyre doesn't).
// Numbers: friction coefficients from the usual vehicle-dynamics tables (Wong, "Theory of Ground Vehicles", 4th ed.,
// tables 1.4 / 2.2: asphalt dry 0.8-0.9, wet 0.5-0.7, gravel 0.6, dry sand 0.6 with crr 0.15-0.3, clay/mud 0.2-0.4,
// grass 0.4-0.5) - CONFIRMED ranges; the exact values and curve shapes picked inside the ranges are INFERRED.

export const SURF_NAMES = ['tarmac', 'wet', 'dirt', 'grass', 'sand', 'mud', 'deck', 'rock', 'snow'];
// mu: peak friction (rated load, road tyre); C/E: curve shape x (long.) / y (lat.); crr: rolling resistance coefficient
// on this surface for a road tyre (multiplied by the tyre's own crr factor); sink: max sinkage m (soft soils);
// kc: how fast a spinning wheel digs in (m/s per unit slip); rough: bump amplitude m (for the sim's surface noise and
// the dust / sound layers); tread: how much a cross-country tread adds (x mu) on this surface; dust: 0..1 for the FX.
export const SURFACES = [
  { name: 'tarmac', mu: 0.95, Cx: 1.65, Ex: 0.10, Cy: 1.30, Ey: -0.60, crr: 0.012, sink: 0, kc: 0, rough: 0.002, tread: 0.92, dust: 0.0 },
  { name: 'wet',    mu: 0.62, Cx: 1.60, Ex: 0.30, Cy: 1.30, Ey: -0.40, crr: 0.014, sink: 0, kc: 0, rough: 0.002, tread: 0.95, dust: 0.0 },
  { name: 'dirt',   mu: 0.68, Cx: 1.35, Ex: 0.60, Cy: 1.15, Ey: 0.30, crr: 0.035, sink: 0.01, kc: 0.004, rough: 0.012, tread: 1.08, dust: 0.8 },
  { name: 'grass',  mu: 0.48, Cx: 1.30, Ex: 0.50, Cy: 1.15, Ey: 0.20, crr: 0.055, sink: 0.03, kc: 0.01, rough: 0.015, tread: 1.10, dust: 0.15 },
  { name: 'sand',   mu: 0.55, Cx: 1.15, Ex: 0.85, Cy: 1.05, Ey: 0.70, crr: 0.12, sink: 0.10, kc: 0.05, rough: 0.008, tread: 1.10, dust: 1.0 },
  { name: 'mud',    mu: 0.33, Cx: 1.10, Ex: 0.90, Cy: 1.05, Ey: 0.80, crr: 0.10, sink: 0.20, kc: 0.08, rough: 0.010, tread: 1.30, dust: 0.0 },
  { name: 'deck',   mu: 0.90, Cx: 1.60, Ex: 0.10, Cy: 1.30, Ey: -0.50, crr: 0.012, sink: 0, kc: 0, rough: 0.001, tread: 0.95, dust: 0.0 },   // non-skid deck coating
  { name: 'rock',   mu: 0.75, Cx: 1.45, Ex: 0.30, Cy: 1.20, Ey: 0.00, crr: 0.030, sink: 0, kc: 0, rough: 0.035, tread: 1.05, dust: 0.3 },
  { name: 'snow',   mu: 0.25, Cx: 1.20, Ex: 0.70, Cy: 1.10, Ey: 0.50, crr: 0.04, sink: 0.06, kc: 0.02, rough: 0.004, tread: 1.25, dust: 0.0 },
];
export const SURF = Object.fromEntries(SURF_NAMES.map((n, i) => [n, i]));
export const surfIndex = s => typeof s === 'number' ? (s | 0) : (SURF[s] ?? 0);

// Tyre types. kz: vertical stiffness N/m (static deflection ~ 8-12% of the section at the rated load: Wong fig. 1.30 /
// Pacejka ch. 9; 6-ply bias light truck ~150-200 kN/m, 12-ply 11.00-20 ~500 kN/m - INFERRED); r: unloaded radius m; w: section width m; Fz0: rated load N; cK, cA: longitudinal / cornering stiffness per
// unit load (1/unit slip, 1/rad); dK, dA: their fall with load (per unit Fz/Fz0 - 1); dMu: mu fall with load; cG: camber
// thrust per unit load (1/rad); Lx, Ly: relaxation lengths m; crr: rolling resistance factor (x surface crr); press: kPa;
// tread: 'xc' (military non-directional cross-country, NDT) or 'road'; I: wheel + tyre + hub polar inertia kg m2.
// Sources: sizes from the vehicle TMs / owner's handbooks (CONFIRMED); bias-ply stiffnesses from Wong ch. 1 fig. 1.20 / 1.24
// (bias truck tyres ~ 6-10 /rad, car radials ~ 15-20 /rad) and Pacejka ch. 4 - INFERRED within those ranges.
export const TYRES = {
  // M151A2: 7.00-16 6-ply NDT bias, 0.38 m (TM 9-2320-218-10: tyre 7.00x16, 30 psi front / 30 rear cross-country) - CONFIRMED size
  '7.00-16 NDT': { kz: 170e3, r: 0.381, w: 0.18, Fz0: 3600, cK: 13, cA: 9.5, dK: -0.15, dA: -0.25, dMu: -0.12, cG: 0.9, Lx: 0.30, Ly: 0.45, crr: 1.25, press: 205, tread: 'xc', I: 1.6 },
  // M35A2: 9.00-20, rear duals. Size CONFIRMED: Army AE Reg 750-1 table K-1;
  // radius/stiffness/load/inertia INFERRED for a period bias-ply tyre (not a certified tyre curve).
  '9.00-20 NDT': { kz: 390e3, r: 0.508, w: 0.229, Fz0: 12000, cK: 11, cA: 7.0, dK: -0.15, dA: -0.25, dMu: -0.10, cG: 0.7, Lx: 0.45, Ly: 0.70, crr: 1.15, press: 310, tread: 'xc', I: 10 },
  // Alternative single truck tyre retained for experiments; not the standard M35A2 fitment.
  '11.00-20 NDT': { kz: 520e3, r: 0.546, w: 0.28, Fz0: 15000, cK: 11, cA: 7.0, dK: -0.15, dA: -0.25, dMu: -0.10, cG: 0.7, Lx: 0.45, Ly: 0.70, crr: 1.15, press: 310, tread: 'xc', I: 14 },
  // Land Rover Series III 109: 7.50-16 bias (owner's handbook) - CONFIRMED size
  '7.50-16': { kz: 190e3, r: 0.400, w: 0.19, Fz0: 4500, cK: 13, cA: 9.0, dK: -0.15, dA: -0.25, dMu: -0.12, cG: 0.9, Lx: 0.32, Ly: 0.48, crr: 1.15, press: 230, tread: 'xc', I: 1.9 },
  // Toyota Hilux 4WD (RN36/38): 7.00-15 6PR (CONFIRMED size, Toyota brochure 1979-80)
  '7.00-15': { kz: 180e3, r: 0.370, w: 0.18, Fz0: 4000, cK: 14, cA: 10.5, dK: -0.15, dA: -0.25, dMu: -0.12, cG: 0.9, Lx: 0.28, Ly: 0.42, crr: 1.05, press: 220, tread: 'road', I: 1.4 },
  // VW Beetle 1200: 5.60-15 bias (155SR15 radial option) (VW owner's manual) - CONFIRMED size
  '5.60-15': { kz: 140e3, r: 0.318, w: 0.145, Fz0: 3000, cK: 14, cA: 11, dK: -0.15, dA: -0.25, dMu: -0.12, cG: 1.0, Lx: 0.24, Ly: 0.36, crr: 1.0, press: 170, tread: 'road', I: 0.75 },
  // Lada 2101: 155SR13 radial (VAZ factory data) - CONFIRMED size
  '155SR13': { kz: 165e3, r: 0.287, w: 0.155, Fz0: 3200, cK: 18, cA: 15, dK: -0.15, dA: -0.25, dMu: -0.10, cG: 0.8, Lx: 0.20, Ly: 0.32, crr: 0.85, press: 180, tread: 'road', I: 0.65 },
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// lateral bulldozing force per unit load at sqrt(rut depth / radius) = 1 (INFERRED: tuned so SSF ~1.1 vehicles trip at
// NHTSA soil-trip lateral speeds, 25-45 km/h); mutable for experiments
export const TYRE_TUNING = { plowK: 3.2 };
// magic formula on normalised slip x (peak at x = 1, value 1 there): B solved per (C, E) once and cached
const _B = new Map();
function peakB(C, E) {
  const k = C * 1000 + E; let b = _B.get(k); if (b !== undefined) return b;
  // find B with the maximum of sin(C atan(B x - E(B x - atan B x))) at x = 1: C * atan(phi(B)) = pi/2
  const target = Math.tan(Math.PI / (2 * C));
  let lo = 0.01, hi = 50;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, phi = m - E * (m - Math.atan(m)); if (phi < target) lo = m; else hi = m; }
  b = (lo + hi) / 2; _B.set(k, b); return b;
}
export function mf(x, C, E) {
  const B = peakB(C, E), bx = B * x;
  return Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
}
// slope of the normalised curve at 0 (= B C): converts a slip stiffness into the peak slip
export const mfSlope = (C, E) => peakB(C, E) * C;

// per-wheel tyre state
export function tyreState() {
  return { ux: 0, uy: 0, sink: 0, plow: 0, bull: 0, kappa: 0, alpha: 0, Fx: 0, Fy: 0, slide: 0, mu: 0, crr: 0, slipV: 0, pressure: 1, flat: 0 };
}

// One tyre step. T: tyre type; st: state; surf: SURFACES entry; Fz: normal load N; vx, vy: contact-patch velocity along the
// wheel heading and to the wheel's right (m/s, relative to the ground); wr: wheel speed x radius (m/s); gamma: camber (rad,
// + = top leaning to the wheel's right); dt: step. Updates st (Fx forward, Fy to the right, N) and returns st.
// flat (0..1) and pressure come from the damage model: a flat tyre on the rim has less grip and huge rolling resistance.
export function tyreStep(T, st, surf, Fz, vx, vy, wr, gamma, dt) {
  if (!(Fz > 0)) { st.ux *= 0.5; st.uy *= 0.5; st.Fx = st.Fy = 0; st.kappa = st.alpha = 0; st.slide = 0; st.slipV = 0; st.mu = 0; return st; }
  const flat = st.flat, xc = T.tread === 'xc';
  const dfz = Fz / T.Fz0 - 1;
  // friction: surface x tread x load sensitivity x flat (a tyre on the rim keeps ~45%)
  const tread = xc ? surf.tread : 1 / Math.max(0.9, surf.tread * 0.92);
  // rubber friction falls with sliding speed (Pacejka 2006 eq. 4.E23 form) and levels off: a locked-wheel skid on dry
  // asphalt keeps ~75% of the peak (skid-mark friction 0.65-0.75 vs peak 0.85-1.0, Wong ch. 1.4; INFERRED shape)
  const vSlide = hypot2(wr - vx, vy);
  const mu = surf.mu * tread * clamp(1 + T.dMu * dfz, 0.6, 1.15) * (1 - 0.55 * flat) * (1 - 0.25 * clamp((vSlide - 0.5) / 8, 0, 1));
  const CK = Math.max(0.2, T.cK * (1 + T.dK * dfz)) * Fz * (1 - 0.5 * flat), CA = Math.max(0.2, T.cA * (1 + T.dA * dfz)) * Fz * (1 - 0.6 * flat);
  const Lx = T.Lx * (1 + flat), Ly = T.Ly * (1 + flat), avx = Math.abs(vx);
  // deflection states (transient slip); low-speed damping blends in below ~3 m/s
  const sx = wr - vx;                      // longitudinal slip velocity (+ = wheel faster than the ground: drive)
  st.ux += (sx - avx * st.ux / Lx) * dt;
  st.uy += (-vy - avx * st.uy / Ly) * dt;   // lateral: the patch is dragged opposite the sliding velocity
  // keep the deflection where the force is saturated (no wind-up while sliding at a standstill)
  const kPx = mfSlope(surf.Cx, surf.Ex) * mu * Fz / CK, aPy = mfSlope(surf.Cy, surf.Ey) * mu * Fz / CA;   // peak slips
  st.ux = clamp(st.ux, -Lx * kPx * 4, Lx * kPx * 4); st.uy = clamp(st.uy, -Ly * aPy * 4, Ly * aPy * 4);
  const kappa = st.ux / Lx, tanA = st.uy / Ly;   // tanA + = force to the right (patch dragged left)
  // camber: thrust towards the lean (+gamma = top to the right -> force to the right); as an equivalent slip
  const tanAe = tanA + T.cG * gamma / T.cA;
  const nx = kappa / kPx, ny = tanAe / aPy, s = hypot2(nx, ny);
  let Fx = 0, Fy = 0;
  if (s > 1e-9) {
    const muy = mu * (1 - 0.6 * gamma * gamma);   // lateral peak falls with camber
    Fx = mu * Fz * mf(s, surf.Cx, surf.Ex) * nx / s;
    Fy = muy * Fz * mf(s, surf.Cy, surf.Ey) * ny / s;
  }
  // low-speed damping (the deflection spring would otherwise ring at standstill); fades out by 3 m/s
  const lw = clamp(1 - hypot2(vx, vy) / 3, 0, 1);   // the contact speed, not just the rolling speed: a sideways slide is not "low speed"
  if (lw > 0) {
    const m = Fz / 9.81;  // the corner's share of the mass is close to Fz / g
    Fx += lw * 2 * 0.7 * Math.sqrt(CK / Lx * m) * sx * 0.5;
    Fy += lw * 2 * 0.7 * Math.sqrt(CA / Ly * m) * (-vy) * 0.5;
    const cap = mu * Fz * 1.05, f = hypot2(Fx, Fy); if (f > cap) { Fx *= cap / f; Fy *= cap / f; }
  }
  // soil bulldozing: a tyre sliding sideways on soft ground digs a rut and pushes a wedge of soil (passive earth
  // pressure on the sidewall, Bekker / Wong ch. 2.5). The lateral resistance can then pass the friction limit - the
  // mechanism of the "tripped" rollover (most real rollovers, the M151's included). Grows with the side-slip sinkage.
  if (surf.sink > 0 && st.plow > 0.002) {
    const cap = Fz * TYRE_TUNING.plowK * Math.sqrt(st.plow / T.r) * (xc ? 1.1 : 1), vyl = Math.abs(vy);
    Fy += -Math.sign(vy) * cap * Math.min(1, vyl / 0.6);
  }
  st.Fx = Fx; st.Fy = Fy; st.kappa = kappa; st.alpha = Math.atan(tanA); st.mu = mu;
  st.slide = clamp(s - 1, 0, 3);                     // > 0 past the peak: squeal / scrub / gravel spray
  st.slipV = hypot2(sx, vy);
  // sinkage: static depth from ground pressure on soft soils, deeper with wheel spin, recovers while rolling freely.
  // dug in, the wheel bulldozes: extra rolling resistance ~ (z / r), and the effective radius drops (the sim lowers the contact)
  if (surf.sink > 0) {
    // mean ground pressure of a pneumatic tyre ~ its inflation pressure, a little more when overloaded (a soft or flat
    // tyre floats better: the CTIS idea), normalised to 200 kPa
    const pz = Math.max(0.25, T.press * (1 - 0.6 * flat) / 200) * (1 + 0.3 * (Fz / T.Fz0 - 1));
    const zs = surf.sink * clamp(0.2 + 0.35 * pz, 0.15, 1);                     // static sinkage
    const spin = clamp(Math.abs(kappa) - 0.15, 0, 2);
    const target = Math.min(surf.sink * 1.6, zs + surf.sink * 0.9 * spin);
    const rate = st.sink < target ? (0.03 + surf.kc * 2 * spin) : 0.03 + 0.02 * avx;   // digs in while spinning (cm per second), climbs out while rolling
    st.sink += clamp(target - st.sink, -rate * dt, rate * dt);
    // side-slip rut: digs in while the tyre slides sideways (vy), fills / climbs out while rolling straight
    const lat = Math.max(0, Math.abs(vy) - 0.5);
    st.plow += (lat > 0 ? Math.min(surf.sink * 1.2, st.plow + 0.001) - st.plow : -st.plow) * Math.min(1, dt * (lat > 0 ? 5 * lat : 3 + avx * 0.5));
  } else { st.sink = Math.max(0, st.sink - 0.5 * dt); st.plow = 0; }
  // rolling resistance rises with speed (hysteresis; steeper for a bias-ply cross-country tread - Wong fig. 1.10 / 1.11)
  st.crr = surf.crr * T.crr * (1 + avx / (xc ? 40 : 70)) * (1 + 9 * flat);
  // a wheel dug in pushes soil ahead of it (compaction + bulldozing): a drag on the wheel through the soil wedge, not a
  // brake on its rotation (vehiclefm applies bull x Fz against the travel at the contact)
  st.bull = 0.55 * Math.min(0.35, st.sink / T.r);
  return st;
}
