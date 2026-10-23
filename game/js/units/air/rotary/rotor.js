// rotor.js - one rotor or proprotor disc, for the AI rotorcraft (CH-46 tandem, MV-22 proprotors). Pure JS, runs in node.
//
// The Huey's rotor (hueyfm.js) in a reusable form, with blade-element strips instead of the closed-form thrust so the
// same code holds a lifting rotor in hover and forward flight AND a proprotor in high axial inflow (airplane mode):
// - Thrust / torque: N radial strips (root cut-out to tip, Prandtl-like tip loss on lift), each with the
//   azimuth-mean tangential speed U_T^2 = (Omega r)^2 + V_edge^2 / 2 (this reproduces the classic
//   CT = sigma a/2 (theta0 (1/3 + mu^2/2) + ...) exactly at small angles) and the uniform inflow angle
//   phi = atan(lambda Omega R / U_T); lift with a soft stall to a flat plate, profile drag cd0 + d2 alpha^2.
//   Induced power comes out of phi by itself, so torque = thrust x inflow + profile.
// - Inflow: momentum (Glauert) with a first-order lag (dynamic inflow, Pitt-Peters time constant), Johnson's
//   empirical vortex-ring curve in slow descent, Cheeseman-Bennett ground effect, and an external inflow term for
//   rotor-on-rotor interference (tandem overlap, the front rotor's wake on the aft rotor).
// - Tip-path plane: commanded cyclic tilt + flapback (a1) and lateral flapping (b1, signed by the rotation sense),
//   lag behind body rates (16 / (gamma Omega)) and the gyroscopic cross term, first-order with the rotor's own time
//   constant. Thrust acts along the TPP normal; an articulated hub (hinge offset) or a gimbal spring adds a hub
//   moment proportional to the TPP tilt; an in-plane H-force from profile drag.
// Shaft axes (s): x forward in the hub plane, y right, z down the shaft (thrust is toward -z). For a proprotor the
// caller rotates these with the nacelle.
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// induced inflow target: Glauert momentum in climb / forward flight / windmill brake, Johnson's empirical vortex-ring
// curve in slow axial descent (copied from hueyfm.js, which carries the derivation). ct thrust coeff, lc climb inflow
// (+ = air down through the disc), mu advance ratio. Returns lambda_i (+ = down).
export function inflowTarget(ct, lc, mu) {
  const s = ct < 0 ? -1 : 1, c = Math.abs(ct), lh = Math.sqrt(c / 2) + 1e-6;
  const x = s * lc / lh;
  let li = lh;
  for (let k = 0; k < 6; k++) { const l = x * lh + li, r = Math.sqrt(mu * mu + l * l), f = li * r - lh * lh, df = r + li * l / r; li = Math.max(1e-6, li - f / df); }
  if (x < 0) {
    const m = mu / lh, xc = Math.max(x, -2), emp = lh * (1.15 - 1.125 * xc - 1.372 * xc * xc - 1.718 * xc ** 3 - 0.655 * xc ** 4);
    const wbs = x < -2 ? lh * (-x / 2 - Math.sqrt(x * x / 4 - 1)) : emp;
    const w = (1 - sstep(0.6, 1.5, m)) * sstep(0, 0.25, -x);
    li = li + (wbs - li) * w;
  }
  return s * li;
}
export const vrsLevel = (ct, lc, mu) => { const lh = Math.sqrt(Math.abs(ct) / 2) + 1e-6, x = -lc / lh, m = mu / lh; return sstep(0.25, 0.6, x) * (1 - sstep(1.3, 2.0, x)) * (1 - sstep(0.5, 1.2, m)); };

// P: { R, nb, chord, root (cut-out, fraction of R), twist (rad over the radius, linear, - = washout), a (lift slope),
//      cd0, d2, aStall, omega0, dir (+1 = counter-clockwise seen from the thrust side), lock, e (hinge offset, fraction),
//      Sb (blade first mass moment about the hinge, kg m), kSpring (hub / gimbal spring, N m/rad), tipLoss, N (strips) }
export function createRotor(P) {
  const N = P.N || 8, A = Math.PI * P.R * P.R, sigma = P.nb * P.chord / (Math.PI * P.R), B = P.tipLoss ?? 0.97;
  const xs = [], dx = (1 - P.root) / N; for (let i = 0; i < N; i++) xs.push(P.root + (i + 0.5) * dx);
  const R = {
    P, A, sigma,
    li: 0.05, tx: 0, ty: 0,                        // state: induced inflow, TPP tilt (forward, right) relative to the shaft
    T: 0, Q: 0, ct: 0, cq: 0, mu: 0, lam: 0, lc: 0, stall: 0, vrs: 0, ge: 0, aRet: 0, power: 0,
    F: [0, 0, 0], M: [0, 0, 0],                    // force (N) and hub moment (N m) on the airframe, shaft axes
    vi: 0,                                         // induced velocity (m/s), for downwash on the airframe and other rotors
    reset(li = 0.05) { R.li = li; R.tx = R.ty = 0; R.stall = 0; R.vrs = 0; },
    // inp: { u, v, w: hub velocity in shaft axes (m/s); p, q: body rates about the shaft x / y axes (rad/s);
    //        th75: blade pitch at 0.75 R (rad); lon / lat: commanded TPP tilt forward / right (rad); om: rotor speed (rad/s);
    //        zg: hub height over the ground (m, Infinity = none); lx: external inflow (m/s, + = down through the disc);
    //        rho: air density; lift: damage factor 0..1 }
    step(h, I) {
      const om = Math.max(I.om, 0.5), VT = om * P.R, rho = I.rho ?? 1.225, kLift = I.lift ?? 1;
      const mx = I.u / VT, my = I.v / VT, mu = Math.hypot(mx, my); R.mu = mu;
      const lc = -I.w / VT + mx * R.tx + my * R.ty, lx = (I.lx || 0) / VT;   // climb + disc-tilt inflow, external inflow
      const lam = R.li + lc + lx; R.lc = lc; R.lam = lam;
      // ---- blade-element strips
      let T = 0, Q = 0; const ip = Math.hypot(I.u, I.v);
      const half = mu * mu / 2, Up = lam * VT, th75 = I.th75, tw = P.twist;
      for (let i = 0; i < N; i++) {
        const x = xs[i], Ut = VT * Math.sqrt(x * x + half), phi = Math.atan2(Up, Ut), U2 = Ut * Ut + Up * Up;
        const al = th75 + tw * (x - 0.75) - phi, aa = Math.abs(al), ws = sstep(P.aStall, P.aStall + 0.14, aa);
        const mAdv = (VT * x + ip) / 340, cl = (P.a * al * (1 - ws) + 1.1 * Math.sin(2 * al) * ws) * kLift;
        const cd = P.cd0 + P.d2 * al * al + 1.6 * ws * Math.sin(al) ** 2 + 0.3 * Math.max(0, mAdv - 0.85) ** 2;   // + drag rise on the advancing side
        const q = 0.5 * rho * P.chord * U2 * P.nb * dx * P.R, c = Math.cos(phi), s = Math.sin(phi);
        if (x <= B) T += q * (cl * c - cd * s);
        Q += q * (cl * s + cd * c) * x * P.R;
      }
      // retreating-side stall (at 0.75 R on the retreating side)
      const Uret = Math.max(0.1 * VT, VT * (0.75 - mu)), aRet = th75 - Math.atan2(Up, Uret) + Math.max(0, R.tx) * 0.5;
      R.aRet = aRet; R.stall = sstep(P.aStall, P.aStall + 0.08, aRet) * sstep(0.12, 0.25, mu);
      T *= 1 - 0.2 * R.stall; Q *= 1 + 0.15 * R.stall;
      let ct = T / (rho * A * VT * VT);
      // ---- inflow: momentum target with ground effect, first-order lag
      const lh = Math.sqrt(Math.abs(ct) / 2) + 1e-4, zr = Math.max(I.zg ?? Infinity, 0.55 * P.R);
      const ge = isFinite(zr) ? (P.R / (4 * zr)) ** 2 / (1 + (mu / lh) ** 2 * 1.5) : 0; R.ge = ge;
      const tgt = inflowTarget(ct, lc + lx, mu) * (1 - ge) * (P.kInd ?? 1.12);   // non-uniform inflow / induced power factor (~1.1-1.2, INFERRED)
      const tau = clamp(0.849 / (4 * Math.max(0.02, Math.abs(lam)) * om), 0.03, 0.35);
      R.li += (tgt - R.li) * (1 - Math.exp(-h / tau));
      R.vrs = vrsLevel(ct, lc + lx, mu);
      if (R.vrs > 0.05) { const k = 1 - R.vrs * (0.1 + 0.12 * Math.sin((R._t = (R._t || 0) + h) * 7.3) * Math.sin(R._t * 2.9 + 1)); T *= k; ct *= k; }
      R.T = T; R.Q = Q; R.ct = ct; R.cq = Q / (rho * A * VT * VT * P.R); R.vi = R.li * VT; R.power = Q * om;
      // ---- tip-path plane
      const th0 = th75 - 0.75 * tw, cone = clamp(P.lock / 8 * (th75 - 4 / 3 * lam) * 0.8, 0, 0.14);
      const a1 = mu * (8 / 3 * th0 + 2 * tw - 2 * lam) / (1 - mu * mu / 2);
      let ttx = I.lon, tty = I.lat;
      if (mu > 1e-4) {   // flapback away from the edgewise wind, lateral flapping 90 degrees round in the rotation sense
        const ux = mx / mu, uy = my / mu, kx = Math.tan(Math.atan2(mu, Math.max(1e-4, Math.abs(lam))) / 2);
        const b1 = (4 / 3 * mu * cone + kx * R.li * 1.1) / (1 + mu * mu / 2) * P.dir;
        ttx += -a1 * ux - b1 * uy; tty += -a1 * uy + b1 * ux;
      }
      const tf = 16 / (P.lock * om);
      ttx += tf * I.q - P.dir * I.p / om; tty += -tf * I.p - P.dir * I.q / om;   // the disc lags the shaft; gyroscopic cross term
      const k = 1 - Math.exp(-h / Math.max(0.01, tf));
      R.tx += (clamp(ttx, -0.3, 0.3) - R.tx) * k; R.ty += (clamp(tty, -0.3, 0.3) - R.ty) * k;
      // ---- loads on the airframe (shaft axes): thrust along the TPP normal, H-force, hub moment, torque reaction
      const nl = Math.hypot(R.tx, R.ty, 1);
      R.F[0] = T * R.tx / nl; R.F[1] = T * R.ty / nl; R.F[2] = -T / nl;
      if (ip > 0.1) { const Hf = sigma * P.cd0 / 4 * mu * rho * A * VT * VT; R.F[0] -= Hf * I.u / ip; R.F[1] -= Hf * I.v / ip; }
      const kHub = (P.kSpring || 0) + P.nb / 2 * (P.e || 0) * P.R * (P.Sb || 0) * om * om;
      R.M[0] = kHub * R.ty; R.M[1] = -kHub * R.tx; R.M[2] = P.dir * Q;   // roll right, pitch up, torque reaction about +z (down)
      return R;
    },
  };
  return R;
}
