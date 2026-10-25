// slingbench.mjs - AIRLIFT: the sling load (units/air/airlift/sling.js) on its own and under the UH-1H flight model
// (hueyfm.js through its env.ext hook), and the C-130 heavy drop's descent (units/air/airlift/heavydrop.js).
//   node tools/slingbench.mjs [--v]
import { FM, THREE, air, pilot, trim, fly, state, DT, deg, sea } from './hueypilot.mjs';
const SL = await import('../game/js/units/air/airlift/sling.js');
const HD = await import('../game/js/units/air/airlift/heavydrop.js');
const { createSling, LOADS, HOOKS, hookCheck, coupledPeriod, hookExt, downwashAt, G } = SL;
const KT = 1.94384, LB = 0.45359237;
let pass = 0, fail = 0;
const check = (name, ok, got, want, tag = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${got}${want ? '   (want ' + want + ')' : ''}${tag ? '  [' + tag + ']' : ''}`); };
const V = process.argv.includes('--v');
const flat = { ground: () => -50, water: () => false };
const h = 1 / 240;

// a load hanging from a hook held still (kinematic), released at an angle: zero crossings give the period
function swingTest(type, deg0 = 5, secs = 60, hookV = [0, 0, 0]) {
  const L = typeof type === 'string' ? LOADS[type] : type, S = createSling(L), hp = [0, 100, 0];
  const a = deg0 * Math.PI / 180, Ls = S.L * (1 + 0.08 * L.strop / S.L);   // hanging at its stretched length
  S.p[0] = Math.sin(a) * Ls; S.p[1] = 100 - Math.cos(a) * Ls; S.p[2] = 0;
  const xs = [], amp = []; let last = S.p[0], t = 0, peak = 0;
  for (; t < secs; t += h) {
    S.step(h, hp, hookV, flat);
    if (last < 0 && S.p[0] >= 0) xs.push(t);
    peak = Math.max(peak, Math.abs(S.p[0])); if (last < 0 && S.p[0] >= 0) { amp.push(peak); peak = 0; }
    last = S.p[0];
  }
  const T = xs.length > 2 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : 0;
  return { T, amp, S };
}

console.log('--- the pendant: pendulum, bounce, tension ---');
for (const type of ['m151', 'm35']) {
  const r = swingTest(type), L = LOADS[type], T0 = 2 * Math.PI * Math.sqrt((r.S.L + 0.08 * L.strop) / G);
  check(`${L.label}: pendulum period (hook fixed, 5° swing)`, Math.abs(r.T - T0) / T0 < 0.03, `${r.T.toFixed(2)} s (L ${r.S.L.toFixed(1)} m)`, `2π√(L/g) = ${T0.toFixed(2)} s`, 'CONFIRMED (mechanics)');
}
{
  // the period against the line length: an M151A2 on pendants of 1.5 to 9 m (L = pendant + apex-to-CG, stretched 8 %)
  const rows = [];
  for (const strop of [1.5, 3, 4.5, 6, 9]) { const spec = { ...LOADS.m151, strop }, r = swingTest(spec, 5, 80), L = r.S.L + 0.08 * strop, T0 = 2 * Math.PI * Math.sqrt(L / G); rows.push({ strop, L, T: r.T, T0 }); }
  const worst = Math.max(...rows.map(r => Math.abs(r.T - r.T0) / r.T0));
  check('M151A2: swing period vs pendant length (1.5 / 3 / 4.5 / 6 / 9 m)', worst < 0.03, rows.map(r => `${r.strop} m: ${r.T.toFixed(2)} s`).join(', '), '2π√(L/g) each, within 3 %', 'CONFIRMED (mechanics)');
  const ratio = rows[4].T / rows[0].T, want = Math.sqrt(rows[4].L / rows[0].L);
  check('...the period grows as √L (9 m vs 1.5 m pendant)', Math.abs(ratio / want - 1) < 0.03, `x${ratio.toFixed(2)}`, `x${want.toFixed(2)}`, 'CONFIRMED (mechanics)');
}
{
  const r = swingTest('m151', 10, 70), a0 = r.amp[1], a10 = r.amp[Math.min(11, r.amp.length - 1)], ratio = a10 / a0;
  check('M151A2: swing damping in still air (10 cycles)', ratio > 0.55 && ratio < 0.99, `amplitude ${(ratio * 100).toFixed(0)} % after 10 cycles`, 'lightly damped: drag only (pilots must damp it)', 'INFERRED');
  // static tension and stretch
  const S = createSling(LOADS.m151), hp = [0, 50, 0]; S.p[1] = 50 - S.L - 0.3;
  for (let t = 0; t < 15; t += h) S.step(h, hp, [0, 0, 0], flat);
  const stretch = (50 - S.p[1] - S.L) / LOADS.m151.strop;
  check('hanging still: tension 1.00 g, pendant stretch ~8 %', Math.abs(S.Tg - 1) < 0.01 && Math.abs(stretch - 0.08) < 0.005, `${S.Tg.toFixed(3)} g, ${(stretch * 100).toFixed(1)} %`, '1 g; nylon 8-12 % at working load', 'INFERRED');
  // vertical bounce: a 10 cm pull, count the bounces
  S.v[1] = -0.6; const ys = []; let last = 0, t0 = 0, n = 0, first = 0;
  for (let t = 0; t < 8; t += h) { S.step(h, hp, [0, 0, 0], flat); const y = S.p[1] - (50 - S.L - 0.08 * 3); if (last < 0 && y >= 0) { if (!n) first = t; n++; t0 = t; } last = y; }
  const f = (n - 1) / (t0 - first);
  check('vertical bounce mode (pendant stretch)', f > 0.8 && f < 1.3, `${f.toFixed(2)} Hz`, '~1 Hz (√(g / 0.08 L) / 2π)', 'INFERRED');
}
{
  // the coupled pendulum: a free "helicopter" (point mass M, thrust = (M + m) g straight up) and the load
  const L = LOADS.m151, S = createSling(L), M = 3700;
  const hp = [0, 100, 0], hv = [0, 0, 0], a = 4 * Math.PI / 180, Ls = S.L + 0.08 * L.strop;
  S.p[0] = Math.sin(a) * Ls; S.p[1] = 100 - Math.cos(a) * Ls;
  let last = 0, xs = [];
  for (let t = 0; t < 60; t += h) {
    const F = S.step(h, hp, hv, flat);
    hv[0] += F[0] / M * h; hv[1] += (F[1] + S.m * G) / M * h; hv[2] += F[2] / M * h;   // thrust balances the weights
    hp[0] += hv[0] * h; hp[1] += hv[1] * h; hp[2] += hv[2] * h;
    const x = S.p[0] - hp[0]; if (last < 0 && x >= 0) xs.push(t); last = x;
  }
  const T = (xs[xs.length - 1] - xs[0]) / (xs.length - 1), T0 = coupledPeriod(M, S.m, Ls);
  check('coupled: helicopter + load swing period', Math.abs(T - T0) / T0 < 0.03, `${T.toFixed(2)} s`, `2π/√(g(M+m)/(ML)) = ${T0.toFixed(2)} s`, 'CONFIRMED (mechanics)');
}
{
  // snatch: the hook goes up at v with the pendant just taut
  const snatch = v => { const S = createSling(LOADS.m151), hp = [0, 0, 0]; S.place(0, 0, 0); hp[1] = S.L + 0.6; let peak = 0; for (let t = 0; t < 4; t += h) { hp[1] += v * h; S.step(h, hp, [0, v, 0], { ...flat, ground: () => 0, limit: HOOKS.uh1h.limit, ult: 2.5 }); peak = Math.max(peak, S.Tg); if (S.parted) break; } return { peak, parted: S.parted }; };
  const a = snatch(1.0), b = snatch(8.0);
  check('lift-off at 1 m/s with the pendant taut: no overload', !a.parted && a.peak < 2.5, `peak ${a.peak.toFixed(2)} g`, 'a smooth lift', 'INFERRED');
  check('snatch at 8 m/s: past 2.5 x the hook rating, the load parts', b.parted, `peak ${b.peak.toFixed(2)} g, ${b.parted ? 'PARTED' : 'held'}`, 'snatch loads break slings', 'INFERRED');
}

console.log('--- hook limits ---');
check('UH-1H hook: 4,000 lb', Math.abs(HOOKS.uh1h.limit / LB - 4000) < 1, `${Math.round(HOOKS.uh1h.limit)} kg`, '4,000 lb (TM 55-1520-210-10)', 'CONFIRMED');
check('UH-1H lifts the M151A2 (1,100 kg)', hookCheck(HOOKS.uh1h, LOADS.m151) === '', hookCheck(HOOKS.uh1h, LOADS.m151) || 'OK', '');
check('UH-1H: the M35A2 is TOO HEAVY', /TOO HEAVY/.test(hookCheck(HOOKS.uh1h, LOADS.m35)), hookCheck(HOOKS.uh1h, LOADS.m35), '');
check('UH-1H: the M113A2 is TOO HEAVY', /TOO HEAVY/.test(hookCheck(HOOKS.uh1h, LOADS.m113)), hookCheck(HOOKS.uh1h, LOADS.m113).slice(0, 40) + '...', '');
check('CH-46E (10,000 lb) lifts the M151, not the M35A2', !hookCheck(HOOKS.ch46e, LOADS.m151) && !!hookCheck(HOOKS.ch46e, LOADS.m35), `M35 ${Math.round(LOADS.m35.mass)} kg vs ${Math.round(HOOKS.ch46e.limit)} kg`, '');

console.log('--- the Huey with a load on the hook ---');
// a Huey in a hover with the M151 hung under it (load started hanging still under the hook)
function hueyWith(type, { speed = 0, fuel = 50, alt = 300 } = {}) {
  const H = air(9.81, { alt, speed, fuel }); const S = type ? createSling(LOADS[type]) : null;
  const ext = hookExt(() => S, HOOKS.uh1h.at, (H, S) => (env.sl.wash = downwashAt(H, FM.UH1H.R, S.p[0], S.p[2]), env.sl.hookYaw = 0, env.sl));
  const env = { ...sea, ext: S ? ext : undefined, sl: { ground: () => -500, water: () => false, wind: null, wash: 0, limit: HOOKS.uh1h.limit, ult: 2.5 } };
  if (S) { const hk = ext.hookWorld(H); S.p[0] = hk[0]; S.p[1] = hk[1] - S.L - 0.08 * S.strop; S.p[2] = hk[2]; S.v[0] = H.vel.x; S.v[2] = H.vel.z; }
  return { H, S, env };
}
const hoverTrim = (type, mass) => { const { H, S, env } = hueyWith(type); if (mass) H.extraMass = mass; const P = pilot({ V: 0 }); const r = trim(H, P, 40, 6, env); return { r, H, S }; };
{
  const clean = hoverTrim(null), slung = hoverTrim('m151'), inside = hoverTrim(null, LOADS.m151.mass);
  if (V) console.log(`   clean ${clean.r.psi.toFixed(1)} psi coll ${(clean.r.coll * 100).toFixed(0)}%  | M151 on the hook ${slung.r.psi.toFixed(1)} psi coll ${(slung.r.coll * 100).toFixed(0)}% pitch ${deg(slung.r.pitch).toFixed(1)} roll ${deg(slung.r.roll).toFixed(1)} | 1,100 kg inside ${inside.r.psi.toFixed(1)} psi`);
  const dl = slung.r.psi / inside.r.psi - 1;
  check('hover OGE with the M151 slung: more torque than clean', slung.r.psi > clean.r.psi * 1.15, `${clean.r.psi.toFixed(1)} -> ${slung.r.psi.toFixed(1)} psi`, '', 'model');
  check('...the downwash on the load adds download (vs the mass inside)', dl > 0.0 && dl < 0.15, `+${(dl * 100).toFixed(1)} % torque`, '0-15 % (download ~5-10 % of the load)', 'INFERRED');
  check('...gross weight over the UH-1H max (9,500 lb) at half fuel + door gun / rockets', slung.H.mass + LOADS.m151.mass > HOOKS.uh1h.maxGross, `${Math.round((slung.H.mass + LOADS.m151.mass) / LB)} lb`, '> 9,500 lb: a heavy, marginal lift', 'CONFIRMED (limit)');
  check('...hover trim attitude stays close to clean', Math.abs(deg(slung.r.pitch - clean.r.pitch)) < 2.5 && Math.abs(deg(slung.r.roll - clean.r.roll)) < 2.5, `pitch ${deg(slung.r.pitch).toFixed(1)}° (clean ${deg(clean.r.pitch).toFixed(1)}°), roll ${deg(slung.r.roll).toFixed(1)}°`, 'hook near the CG: little trim change', 'INFERRED');
  check('...the load hangs steady in the hover', slung.S.swingDeg < 3 && slung.S.Tg > 1.03 && slung.S.Tg < 1.2, `swing ${slung.S.swingDeg.toFixed(1)}°, tension ${slung.S.Tg.toFixed(2)} g (with the download)`, '< 3°, 1.03-1.2 g', 'INFERRED');
}
{
  // a swing in the hover upsets the helicopter: kick the load 15° and watch the airframe roll / pitch rates
  const { H, S, env } = hueyWith('m151'); const P = pilot({ V: 0 }); trim(H, P, 30, 2, env);
  S.v[0] += 2.0; let maxRate = 0, maxSw = 0;
  fly(H, 8, (H) => P.step(H, DT), env, (H) => { const s = state(H); maxRate = Math.max(maxRate, Math.abs(s.p), Math.abs(s.q)); maxSw = Math.max(maxSw, S.swingDeg); });
  check('a swinging load rocks the helicopter (coupling through the hook)', maxRate > 0.02 && maxSw > 8, `swing ${maxSw.toFixed(0)}°, airframe rate ${deg(maxRate).toFixed(1)}°/s`, 'the swing reaches the airframe', 'model');
}
{
  // forward flight: the load trails back at atan(drag / weight); torque up; over its speed the swing builds
  const cruise = kt => { const v = kt / KT, { H, S, env } = hueyWith('m151', { speed: v }); S.v[2] = -v; const P = pilot({ V: v }); const r = trim(H, P, 45, 8, env); let mx = 0; fly(H, 25, (H) => P.step(H, DT), env, () => mx = Math.max(mx, S.swingDeg)); return { r, S, mx, H }; };
  const c50 = cruise(50), c70 = cruise(70), c95 = cruise(95);
  if (V) console.log(`   70 kt: max swing ${c70.mx.toFixed(1)}° psi ${c70.r.psi.toFixed(1)}`);
  const q = 0.5 * SL.RHO * (50 / KT) ** 2, want = deg(Math.atan(q * LOADS.m151.A[0] / (LOADS.m151.mass * G)));
  const trail = deg(Math.atan2(Math.abs(c50.S.swing[1]) > 0 ? Math.tan(Math.abs(c50.S.swing[1])) : 0, 1));
  if (V) console.log(`   50 kt: swing ${c50.S.swingDeg.toFixed(1)}° max ${c50.mx.toFixed(1)}° psi ${c50.r.psi.toFixed(1)}  |  95 kt: max swing ${c95.mx.toFixed(1)}° psi ${c95.r.psi.toFixed(1)}`);
  check('50 kt: the load trails back at atan(drag / weight)', Math.abs(c50.S.swingDeg - want) < 2.5, `${c50.S.swingDeg.toFixed(1)}° (trail ${trail.toFixed(1)}°)`, `${want.toFixed(1)}°`, 'CONFIRMED (statics)');
  check('50 kt (under its 60 kt limit): it rides steadily', c50.mx < c50.S.swingDeg + 3, `max ${c50.mx.toFixed(1)}°`, 'steady', 'INFERRED');
  check('95 kt (over its limit): the swing builds', c95.mx > c50.mx + 6, `max ${c95.mx.toFixed(1)}°`, 'unstable above the load\'s speed', 'INFERRED (FM 55-450-2)');
}
{
  // set it down: lower the hovering Huey until the load's wheels take the weight; the pendant goes slack
  const { H, S, env } = hueyWith('m151', { alt: 20 }); env.groundY = () => 0; env.water = () => false; env.sl.ground = () => 0;
  const P = pilot({ V: 0, vz: 0 }); trim(H, P, 20, 2, env);
  P.vz = -0.5; let down = 0;
  fly(H, 40, (H) => { if (S.ground && S.Tg < 0.2) P.vz = 0; return P.step(H, DT); }, env, (H, t) => { if (!down && S.ground && S.Tg < 0.2) down = t; });
  check('set-down: the load\'s wheels take the weight, the pendant slackens', down > 0 && S.ground && !H.landed && S.impact < 1.5, `at ${down.toFixed(1)} s, touch ${S.impact.toFixed(2)} m/s, Huey ${(H.pos.y - 1.84).toFixed(1)} m up`, 'load down, helicopter still hovering', '');
}

{
  // release in the hover: the load goes, the helicopter balloons with the collective still set for the load; the pilot's
  // loops then settle her back to the clean trim (the attitude barely changes: the hook is near the CG)
  const box = { S: null }, H0 = air(9.81, { alt: 300, fuel: 50 }), S0 = createSling(LOADS.m151);
  const ext = hookExt(() => box.S, HOOKS.uh1h.at, (H, S) => (env.sl.wash = downwashAt(H, FM.UH1H.R, S.p[0], S.p[2]), env.sl.hookYaw = 0, env.sl));
  const env = { ...sea, ext, sl: { ground: () => -500, water: () => false, wind: null, wash: 0, limit: HOOKS.uh1h.limit, ult: 2.5 } };
  box.S = S0; { const hk = ext.hookWorld(H0); S0.p[0] = hk[0]; S0.p[1] = hk[1] - S0.L - 0.08 * S0.strop; S0.p[2] = hk[2]; }
  const P = pilot({ V: 0 }), before = trim(H0, P, 40, 4, env);
  const c0 = { ...P.step(H0, DT) };
  box.S = null;   // R: the hook opens
  let vz2 = 0; fly(H0, 2, () => c0, env, (H, t) => { if (t <= 2) vz2 = H.vel.y; });
  const after = trim(H0, P, 30, 4, env), clean = hoverTrim(null).r;
  if (V) console.log(`   release: vz after 2 s with the collective held ${vz2.toFixed(2)} m/s; torque ${before.psi.toFixed(1)} -> ${after.psi.toFixed(1)} psi (clean ${clean.psi.toFixed(1)})`);
  check('release in the hover, collective held: she balloons', vz2 > 1.0 && vz2 < 6, `+${vz2.toFixed(1)} m/s after 2 s`, '1-6 m/s up (1,100 kg off a ~4,500 kg machine)', 'model');
  check('...retrimmed: torque back to the clean hover, attitude close', Math.abs(after.psi - clean.psi) < 1.5 && Math.abs(deg(after.pitch - before.pitch)) < 2 && Math.abs(deg(after.roll - before.roll)) < 2, `${after.psi.toFixed(1)} psi (clean ${clean.psi.toFixed(1)}), pitch ${deg(before.pitch).toFixed(1)}° -> ${deg(after.pitch).toFixed(1)}°`, 'clean torque, < 2° attitude change', 'model');
}

console.log('--- C-130 heavy drop: G-11A clusters ---');
for (const type of ['m151', 'm35', 'm113']) {
  const R = HD.rigging(type), d = HD.simulateDrop(R, { v0: [0, 0, -60], alt: 335, wind: [4, 0] });
  check(`${R.label}: ${R.chutes} x G-11A, rigged ${Math.round(R.rigged).toLocaleString('en-US')} kg: descent rate`, d.vz > 6.0 && d.vz < 9.5, `${d.vz.toFixed(1)} m/s (${(d.vz * 3.28).toFixed(0)} ft/s)`, '~28 ft/s (8.5 m/s) at rated load', 'CONFIRMED (G-11A)');
  if (V) console.log(`   ${R.label}: opening shock ${d.gMax.toFixed(1)} g, drift ${d.drift.toFixed(0)} m, forward throw ${d.throw.toFixed(0)} m, ${d.t.toFixed(0)} s`);
}
{
  const R = HD.rigging('m113'), d = HD.simulateDrop(R, { v0: [0, 0, -60], alt: 335, wind: [4, 0] });
  check('M113A2 drop: opening shock within the platform\'s design', d.gMax > 1.5 && d.gMax < 6, `${d.gMax.toFixed(1)} g`, '~3-4 g reefed opening', 'INFERRED');
  check('wind drift over the descent (4 m/s wind, 1,100 ft)', Math.abs(d.drift - 4 * d.t) / (4 * d.t) < 0.25, `${d.drift.toFixed(0)} m in ${d.t.toFixed(0)} s`, `≈ wind x time = ${(4 * d.t).toFixed(0)} m`, 'CONFIRMED (kinematics)');
  check('C-130H: the M60A3 is too heavy to drop', !!HD.c130Check('m60') && !HD.c130Check('m113'), HD.c130Check('m60'), 'C-130H max payload ~19.4 t', 'CONFIRMED');
  const crash = HD.landingOutcome({ slope: 0.05, water: 0, clear: true, vz: 8.2 }), steep = HD.landingOutcome({ slope: 0.55, water: 0, clear: true, vz: 8.2 }), sea_ = HD.landingOutcome({ slope: 0, water: 4, clear: true, vz: 8.2 }), stream = HD.landingOutcome({ slope: 0.05, water: 0, clear: true, vz: 14 });
  check('landing: flat ground ok; steep slope tips it; deep water loses it; a streamer smashes it', crash.ok && !crash.damage && steep.damage > 0.4 && sea_.lost && stream.damage > 0.4, `${crash.why} / ${steep.why} / ${sea_.why} / ${stream.why}`, '');
}

console.log(`\nslingbench: ${pass}/${pass + fail} pass`);
process.exit(fail ? 1 : 0);
