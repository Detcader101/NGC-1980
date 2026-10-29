#!/usr/bin/env node
// sr71bench.mjs - flight-model checks for game/js/units/air/sr71fm.js in plain node, against the SR-71A-1 flight manual
// and NASA TM-104330 (sources and tags in sr71fm.js).   node tools/sr71bench.mjs [--v]
//
// World scale (see sr71fm.js): forces, KEAS / KIAS and g are real; world true speeds are half; the altimeter reads the
// ISA altitude with the world air's density. Times and distances are reported as flown in the world; where the real
// aircraft's number is a time to climb or a ground roll, the real-equivalent is given too (ground roll x4: same forces at
// half the speed; climb time: see the note at the climb test).
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const { createSR71Sim, SR71, aero, j58, spikeSched, worldHOfFt, KT, FT, LB, K_EQ } = await import('../game/js/units/air/sr71fm.js');
const THREE = await import('three');
// deterministic: every sim gets the same seeded generator for its random unstarts (mulberry32)
const seeded = (a = 12345) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const _create = createSR71Sim; const mk = () => { const A = _create(); A.rand = () => 1; return A; };   // (no random unstarts in the performance checks: test 7 forces one)
const VERBOSE = process.argv.includes('--v');
let pass = 0, fail = 0;
const results = [];
const check = (name, ok, got, want, tag = '') => { (ok ? pass++ : fail++); results.push({ name, ok, got, want, tag }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${(tag ? `[${tag}] ` : '') + name}`.padEnd(78) + ` ${got}${want ? '   (want ' + want + ')' : ''}`); };
const land = { groundY: () => 0, water: () => false }, sky = { groundY: () => -1e5, water: () => false };
const ctl = (o = {}) => ({ pitch: 0, roll: 0, yaw: 0, throttle: [0.5, 0.5], brakeL: 0, brakeR: 0, ...o });
const lbf = n => n / 4.44822;
const DT = 1 / 50;
// world TAS for a KEAS at a height (q real: 0.5 rho V^2 = 0.5 1.225 EAS^2)
const tasFor = (keas, h) => { const rho = 4.9 * Math.exp(-h / 6000); return keas / KT * Math.sqrt(1.225 / rho); };
// in the air, trimmed for 1 g: o.mach instead of a KEAS; the attitude is the alpha for 1 g (the lift curve inverted)
const air = (ft, keas, fuelLb, o = {}) => {
  const A = mk(); const h = worldHOfFt(ft), sigR = Math.exp(-h / 6000);
  const T = 288.15 - 0.0065 * Math.min(ft / FT, 11000) + (ft / FT > 20000 ? 0.001 * (ft / FT - 20000) : 0), aS = Math.sqrt(1.4 * 287.05 * T);
  const V = o.mach ? o.mach * aS / K_EQ : tasFor(keas, h), M = V * K_EQ / aS, q = 0.5 * 4.9 * sigR * V * V, W = (60000 + fuelLb) / LB * 9.80665;
  let al = 0.02; for (let i = 0; i < 40; i++) { const c = aero(al, 0, M, { gear: 0, rud: 0, extra: 0, flapE: 0 }); al += (W / (q * SR71.S) - c.CL) * 0.2; al = Math.max(-0.1, Math.min(0.4, al)); }
  A.reset(new THREE.Vector3(0, h, 0), 0, V, { fuel: fuelLb / LB, gear: 0, thr: o.thr ?? 0.8, pitch: al });
  const c = Math.cos(al), s = Math.sin(al); A.vel.set(0, 0, -V); A.ap.att = al; return A; };

// ---- 1. the J58 numbers
{
  const T0 = lbf(j58(1, 0, 1, 0)), T200 = lbf(j58(1, 0.3, 1, 200)), Tmil = lbf(j58(0.66, 0, 1, 0)), Tmin = lbf(j58(0.6601, 0, 1, 0));
  check('J58 max AB, SL static, per engine (fig. 1-3, 15 C)', Math.abs(T0 - 25500) < 600, T0.toFixed(0) + ' lbf', '25,500', 'CONFIRMED');
  check('J58 max AB at 200 KIAS, SL (fig. 1-3: ~28,100)', Math.abs(T200 - 28100) < 1200, T200.toFixed(0) + ' lbf', '~28,100', 'CONFIRMED');
  check('minimum AB / max AB at SL (manual: ~85 %)', Math.abs(Tmin / T0 - 0.85) < 0.02, (Tmin / T0).toFixed(3), '0.85', 'CONFIRMED');
  { const sg = Math.exp(-worldHOfFt(80000) / 6000), r = j58(0.6601, 3.2, sg) / j58(1, 3.2, sg); check('minimum AB / max AB at altitude (manual: ~55 %)', Math.abs(r - 0.55) < 0.02, r.toFixed(3), '0.55', 'CONFIRMED'); }
  check('MIL / max AB, SL static (fig. 1-4: ~17,500 lbf at 15 C)', Math.abs(Tmil - 17500) < 900, Tmil.toFixed(0) + ' lbf', '~17,500', 'CONFIRMED');
  const sig80 = Math.exp(-worldHOfFt(80000) / 6000), T32 = lbf(j58(1, 3.2, sig80, 0));
  check('J58 max AB at Mach 3.2 / 80,000 ft, per engine', T32 > 8500 && T32 < 14000, T32.toFixed(0) + ' lbf', '8.5-14 k (cruise ~8.5 k needed)', 'INFERRED');
  check('spike: forward below Mach 1.6, 26 in aft at 3.2', spikeSched(1.5) === 0 && spikeSched(3.2) === 1 && Math.abs(spikeSched(2.4) - 0.5) < 1e-6, `${spikeSched(1.5)} / ${spikeSched(2.4)} / ${spikeSched(3.2)}`, '0 / 0.5 / 1', 'CONFIRMED');
}
// ---- 2. take-off at 125,000 lb (manual: ~210 KIAS, 8-10 deg attitude), full AB from brake release
{
  const A = mk(); A.resetGround(0, 0, 0, 0); A.fuel = (125000 - 60000) / LB;
  let t = 0, lift = null, x0 = A.pos.clone(), maxPitch = 0;
  while (t < 120 && !A.dead) {
    const kias = A.kias, rot = kias > 188, att = A.attitude().pitch;   // back pressure 15-25 kt below rotation speed (manual)
    const pitch = rot ? THREE.MathUtils.clamp((0.165 - att) * 8 - A.w.y * 2, -1, 1) : 0;
    const evs = A.step(DT, ctl({ throttle: [1, 1], pitch }), land); t += DT; maxPitch = Math.max(maxPitch, att);
    if (!lift && evs.some(e => e.e === 'airborne')) lift = { t, kias: A.kias, dist: A.pos.distanceTo(x0), att };
    if (lift && t > lift.t + 6) break;
  }
  check('take-off at 125,000 lb: lift-off KIAS', lift && Math.abs(lift.kias - 210) < 18, lift ? lift.kias.toFixed(0) + ' KIAS' : 'no lift-off', '~210', 'CONFIRMED');
  check('take-off: attitude at lift-off (manual 8-10 deg)', lift && lift.att * 57.3 > 7 && lift.att * 57.3 < 12.5, lift ? (lift.att * 57.3).toFixed(1) + ' deg' : '-', '8-10', 'CONFIRMED');
  if (lift) console.log(`      ground roll ${lift.dist.toFixed(0)} m world = ${(lift.dist * 4 * FT).toFixed(0)} ft real-equivalent, ${lift.t.toFixed(1)} s`);
}
// ---- 3. trimmed flight and the KEAS / Mach schedule: 400 KEAS at 20,000 ft, Mach 0.9 at 30,000 ft
for (const [ft, keas, fuel] of [[20000, 400, 70000], [30000, 324, 70000]]) {
  const A = air(ft, keas, fuel); A.ap.on = true; A.ap.pitch = 'alt'; A.ap.alt = A.pos.y; A.ap.roll = 'att'; A.ap.bank = 0;
  let thr = 0.6, t = 0; const sp = [];
  while (t < 120) { thr = THREE.MathUtils.clamp(thr + (keas - A.keas) * 0.0004, 0, 1); A.step(DT, ctl({ throttle: [thr, thr] }), sky); t += DT; if (t > 90) sp.push(A.keas); }
  const avg = sp.reduce((a, b) => a + b, 0) / sp.length;
  check(`level ${ft} ft at ${keas} KEAS: holds (alpha, throttle)`, Math.abs(avg - keas) < 8 && Math.abs(A.altFt - ft) < 600, `${avg.toFixed(0)} KEAS, ${A.altFt.toFixed(0)} ft, alpha ${(A.alpha * 57.3).toFixed(1)} deg, thr ${thr.toFixed(2)}, M ${A.mach.toFixed(2)}`, `${keas}`, 'INFERRED');
}
check('Mach 0.9 at 30,000 ft = 324 KEAS (manual)', (() => { const A = air(30000, 324, 70000); A.step(0.02, ctl(), sky); return Math.abs(A.mach - 0.9) < 0.03; })(), (() => { const A = air(30000, 324, 70000); A.step(0.02, ctl(), sky); return 'M ' + A.mach.toFixed(3); })(), 'M 0.90', 'CONFIRMED');
// ---- 4. the climb (TM-104330 fig. 10): from refuelling (Mach 0.75, 25,000 ft, 140,000 lb) on the 450 KEAS schedule to
// Mach 3 / 70,000 ft: 16-17 min real. Profile as the manual: Mach 0.9 climb to ~33,000 ft, the transonic dive to
// 28-30,000 ft, then 450 KEAS (bleeding off over Mach 2.6) at max AB.
let climb = null;
{
  const A = air(25000, 300, 80000); A.ap.on = true; A.ap.roll = 'att'; A.ap.bank = 0;
  let t = 0, phase = 'mach09', tM3 = null, tlog = 0;
  while (t < 3600 && !A.dead) {
    if (phase === 'mach09') { A.ap.pitch = 'mach'; A.ap.mach = 0.9; if (A.altFt > 33000) phase = 'dive'; }
    else if (phase === 'dive') { A.ap.pitch = 'keas'; A.ap.keas = 470; if (A.mach > 1.25) phase = 'climb'; }
    else { A.ap.pitch = 'keas'; A.ap.keas = A.mach < 2.6 ? 450 : 450 - (A.mach - 2.6) * 100; }
    A.step(DT, ctl({ throttle: [1, 1] }), sky); t += DT;
    if (VERBOSE && t - tlog > 60) { tlog = t; console.log(`   t ${(t / 60).toFixed(1)} min  ${phase}  M ${A.mach.toFixed(2)}  ${A.altFt.toFixed(0)} ft  ${A.keas.toFixed(0)} KEAS  fuel ${(A.fuel * LB).toFixed(0)}  alpha ${(A.alpha * 57.3).toFixed(1)}`); }
    if (!tM3 && A.mach >= 3.0 && A.altFt > 66000) { tM3 = t; break; }
  }
  climb = { t: tM3, fuel: A.fuel * LB, alt: A.altFt, mach: A.mach };
  // real-equivalent time: the speed changes take the same time (real forces on the real mass, half the world speed for
  // the same KEAS), the height takes twice as long (half the vertical speed for the same path angle); the climb is ~2/3
  // altitude-limited in the energy budget (kinetic energy at Mach 3 in the world is 1/4 of the real): ~1.6x
  check('climb Mach 0.75 / 25,000 ft -> Mach 3 / 70,000 ft (world time)', tM3 && tM3 / 60 / 2 > 14 && tM3 / 60 / 2 < 21, tM3 ? (tM3 / 60).toFixed(1) + ' min world = ' + (tM3 / 120).toFixed(1) + ' min real-equivalent' : 'not reached (' + A.mach.toFixed(2) + ', ' + A.altFt.toFixed(0) + ' ft)', '16-17 min real = ~32-34 world (heights at half the vertical speed)', 'CONFIRMED');
  if (tM3) check('climb fuel used (TM-104330: 140,000 lb start, ~21,400 lb left at M3 with N2O... clean ~ 30-40,000 used)', 80000 - climb.fuel > 20000 && 80000 - climb.fuel < 45000, (80000 - climb.fuel).toFixed(0) + ' lb', '20-45 k', 'INFERRED');
}
// ---- 5. cruise: Mach 3.2 at 80,000 ft (the design point) at partial AB, fuel flow, L/D
{
  const A = air(80000, 0, 45000, { mach: 3.2, thr: 0.85 }); const h = A.pos.y; A.ap.on = true; A.ap.pitch = 'alt'; A.ap.alt = h; A.ap.roll = 'att';
  let thr = 0.85, t = 0, ff = 0, n = 0;
  while (t < 240) { thr = THREE.MathUtils.clamp(thr + (3.2 - A.mach) * 0.02, 0.661, 1); A.step(DT, ctl({ throttle: [thr, thr] }), sky); t += DT; if (t > 180) { ff += A.eng[0].ff + A.eng[1].ff; n++; } }
  check('cruise Mach 3.2 / 80,000 ft: holds in partial AB', Math.abs(A.mach - 3.2) < 0.05 && thr < 0.999 && Math.abs(A.altFt - 80000) < 1500, `M ${A.mach.toFixed(2)} thr ${thr.toFixed(2)} alpha ${(A.alpha * 57.3).toFixed(1)} deg, ${A.keas.toFixed(0)} KEAS, CIT ${A.cit.toFixed(0)} C`, 'partial AB', 'CONFIRMED');
  check('cruise fuel flow (38-44,000 lb/h)', ff / n > 32000 && ff / n < 48000, (ff / n).toFixed(0) + ' lb/h', '38-44 k', 'INFERRED');
  check('cruise KEAS (manual: 310 min; ~310-350 at 80,000 ft / Mach 3.2)', A.keas > 300 && A.keas < 360, A.keas.toFixed(0) + ' KEAS', '310-350', 'CONFIRMED');
  check('CIT at Mach 3.2 below the 427 C limit', A.cit < 427 && A.cit > 330, A.cit.toFixed(0) + ' C', '< 427', 'CONFIRMED');
}
// ---- 6. full AB at 80,000 ft: the top speed is set by the CIT limit (Mach 3.3 max authorised if CIT <= 427 C)
{
  const A = air(80000, 0, 40000, { mach: 3.2, thr: 1 }); A.ap.on = true; A.ap.pitch = 'alt'; A.ap.alt = A.pos.y;
  let t = 0, citT = null, mMax = 0; while (t < 300) { A.step(DT, ctl({ throttle: [1, 1] }), sky); t += DT; mMax = Math.max(mMax, A.mach); if (!citT && A.cit > 427) citT = t; }
  check('full AB at 80,000 ft: past Mach 3.3 / CIT 427 C (the limit is the pilot\'s), thrust runs out by ~3.6', A.mach > 3.3 && A.mach < 3.7, `M ${A.mach.toFixed(2)}, CIT ${A.cit.toFixed(0)} C${citT ? ' (427 at ' + citT.toFixed(0) + ' s)' : ''}, ${A.eng[0].damaged ? 'engine damaged' : 'engines ok'}`, '> 3.3', 'CONFIRMED');
}
// ---- 7. an inlet unstart at Mach 3 (left): the nose yaws left hard, the restart brings both inlets back
{
  const A = air(75000, 0, 45000, { mach: 3.0, thr: 0.9 }); A.ap.on = true; A.ap.pitch = 'alt'; A.ap.alt = A.pos.y; A.ap.roll = 'att';
  for (let t = 0; t < 10; t += DT) A.step(DT, ctl({ throttle: [0.9, 0.9] }), sky);
  for (const e of A.eng) e.spike = 1 * (3.0 - 1.6) / 1.6;
  const h0 = A.heading; A.forceUnstart = 0; let unst = false, rest = false, maxYaw = 0, maxBeta = 0;
  for (let t = 0; t < 15; t += DT) { const evs = A.step(DT, ctl({ throttle: [0.9, 0.9] }), sky); for (const e of evs) { if (e.e === 'unstart') unst = true; if (e.e === 'restarted') rest = true; } maxYaw = Math.max(maxYaw, A.w.z * -1); maxBeta = Math.max(maxBeta, -A.beta); }
  check('unstart (left inlet, Mach 3): nose yaws left, then the auto restart', unst && rest && maxYaw > 0.005, `unstart ${unst}, restarted ${rest}, max yaw rate left ${(maxYaw * 57.3).toFixed(2)} deg/s, sideslip ${(maxBeta * 57.3).toFixed(2)} deg`, 'yaw left, restart', 'CONFIRMED');
}
// ---- 8. landing: 175 KIAS final with ~12,000 lb of fuel, 155 KIAS touchdown, chute below 210 KIAS, brakes at the end
{
  const A = mk(), h = 120; A.reset(new THREE.Vector3(0, h, 0), 0, tasFor(175, h), { fuel: 12000 / LB, gear: 1, thr: 0.55 }); A.gear = A.gearCmd = 1;
  let t = 0, td = null, x0 = null, stop = null, thr = 0.55, flare = false, chuteT = null, minAlpha = 1;
  while (t < 200 && !A.dead) {
    const att = A.attitude().pitch;
    let pitch;
    if (!td) {
      const gamma = Math.atan2(A.vel.y, Math.hypot(A.vel.x, A.vel.z)), want = A.pos.y > 14 ? -0.026 : -0.012;
      flare = A.pos.y < 14; const kt = flare ? 155 : 175;
      thr = THREE.MathUtils.clamp(thr + (kt - A.kias) * 0.001, 0.2, 0.66);
      pitch = THREE.MathUtils.clamp((want - gamma) * 5 - A.w.y * 2 + 0.05, -1, 1);
    } else { thr = 0; pitch = THREE.MathUtils.clamp((0 - att) * 1.5, -0.3, 0.3); if (!chuteT && A.kias < 205) { A.deployChute(); chuteT = t; } }
    const brk = td && A.kias < 80 ? 1 : 0;
    const evs = A.step(DT, ctl({ throttle: [thr, thr], pitch, brakeL: brk, brakeR: brk }), land); t += DT;
    for (const e of evs) if (e.e === 'touchdown' && !td) { td = { kias: e.kias, vy: e.vy, alpha: A.alpha * 57.3 }; x0 = A.pos.clone(); }
    if (td && Math.hypot(A.vel.x, A.vel.z) < 0.5) { stop = A.pos.distanceTo(x0); break; }
  }
  check('touchdown ~155 KIAS (manual: 155 + 1 kt / 1,000 lb over 10,000)', td && Math.abs(td.kias - 157) < 14, td ? `${td.kias.toFixed(0)} KIAS, sink ${(td.vy * K_EQ * FT * 60).toFixed(0)} fpm real, alpha ${td.alpha.toFixed(1)} deg` : 'no touchdown' + (A.dead ? ' (' + A.dead + ')' : ''), '~157', 'CONFIRMED');
  check('rollout with the drag chute: stops', stop !== null, stop ? `${stop.toFixed(0)} m world = ${(stop * 4 * FT).toFixed(0)} ft real-equivalent` : 'did not stop', '~ 3,000-5,000 ft', 'INFERRED');
}
// ---- 9. control: roll rate at 300 KEAS, pitch response
{
  const A = air(25000, 300, 50000); for (let t = 0; t < 1; t += DT) A.step(DT, ctl({ throttle: [0.6, 0.6] }), sky);
  let pmax = 0; for (let t = 0; t < 3; t += DT) { A.step(DT, ctl({ throttle: [0.6, 0.6], roll: 1 }), sky); pmax = Math.max(pmax, A.w.x); }
  check('full roll stick at 300 KEAS: roll rate', pmax * 57.3 > 25 && pmax * 57.3 < 90, (pmax * 57.3).toFixed(0) + ' deg/s', '25-90', 'UNVERIFIED');
  const B = air(25000, 300, 50000); for (let t = 0; t < 1; t += DT) B.step(DT, ctl({ throttle: [0.6, 0.6] }), sky);
  let nz = 0; for (let t = 0; t < 3; t += DT) { B.step(DT, ctl({ throttle: [0.6, 0.6], pitch: 0.5 }), sky); nz = Math.max(nz, B.nz); }
  check('half aft stick at 300 KEAS: pulls g (3 g limit)', nz > 1.8 && nz < 4.5, nz.toFixed(2) + ' g', '1.8-4.5', 'UNVERIFIED');
}
console.log(`\n${pass} passed, ${fail} failed`);
if (process.argv.includes('--json')) { const fs = await import('node:fs'); fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify({ pass, fail, results, climb }, null, 1)); }
process.exit(fail ? 1 : 0);
