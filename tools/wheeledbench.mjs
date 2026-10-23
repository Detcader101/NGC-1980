#!/usr/bin/env node
// wheeledbench.mjs - the NGC-1980 wheeled vehicles (game/js/units/wheeled/vehiclefm.js + tyre.js + driver.js) against
// published data, in plain node: static ride, top speed, acceleration, gradeability, braking, the M151's rollover
// threshold (static stability factor, tilt table, the dynamic J-turn), lift-off oversteer, fording, fuel economy and
// range, turning circle, soft ground (2WD vs 4WD, the M35's sprag), split-mu with open differentials, the walking bogie,
// stalling and starting.                                                         node tools/wheeledbench.mjs [--v] [--only m151]
// Every check prints the published figure and its tag:
//   CONFIRMED = number from the source named (TM 9-2320-218-10 "TM151", TM 9-2320-209-10 "TM35", factory data for the cars)
//   INFERRED  = a target derived from physics / typical data, the source of the range named
//   UNVERIFIED = a remembered figure not checked against a primary source
// Real gravity (9.81) here; the game runs at 9.0.
import { createVehicleSim, KMH } from '../game/js/units/wheeled/vehiclefm.js';
import { createDriver } from '../game/js/units/wheeled/driver.js';
import { SURF } from '../game/js/units/wheeled/tyre.js';
import { M151 } from '../game/js/units/wheeled/m151.js';
import { M35 } from '../game/js/units/wheeled/m35.js';
import { LANDROVER, HILUX, BEETLE, LADA } from '../game/js/units/wheeled/civilian.js';
import { createDamage } from '../game/js/units/wheeled/vehicledamage.js';
import { createWheeledSim, makeTerrainEnv, createFollower, WHEELED_IDS } from '../game/js/units/wheeled/index.js';

const V = process.argv.includes('--v'), ONLY = (process.argv.indexOf('--only') > 0 ? process.argv[process.argv.indexOf('--only') + 1] : null);
const G = 9.81, DT = 1 / 60, D2R = Math.PI / 180;
let pass = 0, fail = 0; const rows = [];
const check = (name, ok, got, want = '', tag = '') => { (ok ? pass++ : fail++); rows.push({ name, ok, got, want, tag }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${got}${want ? '   (want ' + want + ')' : ''}${tag ? '  [' + tag + ']' : ''}`); };
const head = s => console.log('\n--- ' + s + ' ---');
const want = id => !ONLY || ONLY === id;

// ------------------------------------------------------------------------------------------------ test grounds
// flat(surf), slope along -z (forward = uphill) with a run-up, side slope (tilt), water, split-mu, a ramp under one wheel
const flat = (surf = SURF.tarmac, extra = {}) => ({ g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = surf; o.vx = o.vy = o.vz = 0; return o; }, ...extra });
const grade = (g, surf = SURF.tarmac, z0 = -2) => {   // level until z0, then climbing towards -z at grade g (rise / run)
  const n = Math.hypot(g, 1);
  return { g: G, ground: (x, z, o) => { const up = z < z0; o.h = up ? (z0 - z) * g : 0; o.nx = 0; o.ny = up ? 1 / n : 1; o.nz = up ? g / n : 0; o.surf = surf; o.vx = o.vy = o.vz = 0; return o; } };
};
const tilt = (th, surf = SURF.tarmac) => ({ g: G, ground: (x, z, o) => { o.h = -x * Math.tan(th); o.nx = Math.sin(th); o.ny = Math.cos(th); o.nz = 0; o.surf = surf; o.vx = o.vy = o.vz = 0; return o; } });   // right side low
// a ford: the bank slopes down at 1 in 6 from z0 to the bed (depth below the water surface at y = 0)
const pond = (depth, z0 = -20, bed = SURF.dirt) => {
  const L = depth * 6, n = Math.hypot(1, 1 / 6);
  return { g: G, ground: (x, z, o) => { const t = z0 - z; o.h = t <= 0 ? 0 : -Math.min(depth, t / 6); const s = t > 0 && t < L; o.nx = 0; o.ny = s ? 1 / n : 1; o.nz = s ? -(1 / 6) / n : 0; o.surf = bed; o.vx = o.vy = o.vz = 0; return o; },
    water: (x, z) => z < z0 ? 0 : -Infinity };
};

// a sim + driver on a ground; run(t, input | fn) with optional per-step probe
function make(spec, o = {}) {
  const S = createVehicleSim(spec), D = createDriver(spec, o.mode || 'auto');
  S.reset(o.pos || [0, 0, 0], o.yaw || 0, { running: o.running !== false, fwd: o.fwd, gear: o.gear });
  if (o.load) S.setLoad(o.load);
  if (o.dmg) S.dmg = createDamage(spec, S);
  D.reset(S);
  return { S, D, env: o.env || flat() };
}
function run(V_, t, input, probe) {
  const { S, D, env } = V_;
  for (let k = 0, n = Math.round(t / DT); k < n; k++) {
    const inp = typeof input === 'function' ? input(S, k * DT) : input;
    const c = inp.raw ? inp.raw : D.update(S, inp, DT);
    if (inp.range) c.range = inp.range; if (inp.fwd !== undefined) c.fwd = inp.fwd; if (inp.lock !== undefined) c.lock = inp.lock;
    S.step(DT, c, env);
    if (probe && probe(S, (k + 1) * DT) === false) break;
  }
  return S;
}
const settle = (V_, t = 2) => run(V_, t, { brake: 0 });
const kmh = v => (v * KMH).toFixed(1) + ' km/h';
const fmt = (v, d = 1) => (+v).toFixed(d);

// ------------------------------------------------------------------------------------------------ 1. static ride
head('static ride: settles on the springs at the model ride height');
for (const spec of [M151, M35, LANDROVER, HILUX, BEETLE, LADA]) {
  if (!want(spec.id)) continue;
  const v = make(spec); let maxV = 0;
  run(v, 3, {}, S => { maxV = Math.max(maxV, Math.abs(S.vel[1])); });
  const S = v.S;
  check(`${spec.id}: at rest, ride height and level`, Math.abs(S.pos[1]) < 0.01 && Math.abs(S.pitch) < 0.01 && Math.abs(S.speed) < 0.01, `y ${fmt(S.pos[1] * 1000, 1)} mm, pitch ${fmt(S.pitch / D2R, 2)}°, creep ${fmt(S.speed * 1000, 1)} mm/s`, '0 +- 10 mm', 'INFERRED (model frame)');
}

// ------------------------------------------------------------------------------------------------ 2. top speed and acceleration
head('top speed and acceleration (level dry tarmac, full throttle, automatic shifts)');
const PUB = {
  m151: { vmax: [106, 'TM151 66 mph', 'CONFIRMED'], a60: [null] },
  m35: { vmax: [90, 'TM35 56 mph', 'CONFIRMED'] },
  landrover: { vmax: [105, 'LR ~65 mph', 'CONFIRMED ~'] },
  hilux: { vmax: [145, 'HX ~90 mph', 'UNVERIFIED'] },
  beetle: { vmax: [115, 'VW 115 km/h', 'CONFIRMED'], a100: [32, 'VW 1200 ~30-33 s (period tests)', 'UNVERIFIED'] },
  lada: { vmax: [142, 'LD 142 km/h', 'CONFIRMED'], a100: [20, 'LD 20 s', 'CONFIRMED'] },
};
const perf = {};
for (const spec of [M151, M35, LANDROVER, HILUX, BEETLE, LADA]) {
  if (!want(spec.id)) continue;
  const v = make(spec); settle(v, 1);
  let t60 = 0, t100 = 0, t = 0, vmax = 0;
  run(v, 120, { throttle: 1 }, S => { t += DT; if (!t60 && S.kmh >= 60) t60 = t; if (!t100 && S.kmh >= 100) t100 = t; vmax = Math.max(vmax, S.kmh); });
  perf[spec.id] = { t60, t100, vmax };
  const p = PUB[spec.id];
  check(`${spec.id}: top speed`, Math.abs(vmax - p.vmax[0]) / p.vmax[0] < 0.06, `${fmt(vmax)} km/h (rpm ${fmt(v.S.eng.rpm, 0)}, gear ${v.S.gear})`, `${p.vmax[0]} km/h, ${p.vmax[1]}`, p.vmax[2]);
  console.log(`      ${spec.id}: 0-60 km/h ${fmt(t60)} s, 0-100 km/h ${t100 ? fmt(t100) + ' s' : '-'}`);
  if (p.a100) check(`${spec.id}: 0-100 km/h`, t100 > 0 && Math.abs(t100 - p.a100[0]) / p.a100[0] < 0.2, `${fmt(t100)} s`, `${p.a100[0]} s, ${p.a100[1]}`, p.a100[2]);
}
if (want('m151')) check('m151: 0-60 km/h (jeep class: 7-11 s)', perf.m151.t60 > 6 && perf.m151.t60 < 12, `${fmt(perf.m151.t60)} s`, '~ 8-10 s (period tests of 70 hp 1-tonne 4x4s; no TM figure)', 'INFERRED');
if (want('m35')) check('m35: 0-60 km/h empty (deuce class: 25-40 s)', perf.m35.t60 > 20 && perf.m35.t60 < 45, `${fmt(perf.m35.t60)} s`, '~ 30 s (134 hp / 5.9 t)', 'INFERRED');

// ------------------------------------------------------------------------------------------------ 3. gradeability
head('gradeability: climb from a standing start on dry concrete, lowest gear / low range');
function climbs(spec, g, o = {}) {
  // standing start with the front tyres at the foot of the slope
  const zF = Math.min(...spec.wheels.map(w => w.z)), r = Math.max(...spec.wheels.map(w => w.r ?? 0.4));
  const v = make(spec, { env: grade(g, o.surf ?? SURF.tarmac, -1.5), load: o.load, fwd: true, pos: [0, 0, -1.5 - zF + 0.45] });
  settle(v, 0.5); void r;
  let x0 = v.S.pos[2], maxUp = 0;
  run(v, o.t || 40, { throttle: 1, range: spec.transfer.low ? 'L' : 'H', fwd: true }, S => { maxUp = Math.max(maxUp, -S.pos[2] - 1.5); if (S.gear > 1 && S.speed < 1) return true; });
  return { up: maxUp, S: v.S };
}
for (const [spec, g, load, src, tag] of [
  [M151, 0.60, null, 'TM151 60% grade', 'CONFIRMED'], [M35, 0.60, [{ kg: M35.payload.xc, at: M35.cargoAt, size: [2, 0.6, 3.5] }], 'TM35 60% grade with 5,000 lb', 'CONFIRMED'], [LANDROVER, 0.45, null, 'LR ~45° approach / 45% climbing (low range)', 'UNVERIFIED']]) {
  if (!want(spec.id)) continue;
  const r = climbs(spec, g, { load });
  check(`${spec.id}: climbs ${g * 100}%${load ? ' loaded' : ''}`, r.up > 12, `${fmt(r.up)} m up the slope, ${kmh(r.S.speed)}, gear ${r.S.gear}${r.S.range}, stalled ${!r.S.eng.running}`, src, tag);
}
if (want('m151')) {
  let maxG = 0; for (const g of [0.6, 0.7, 0.8, 0.9, 1.0]) { if (climbs(M151, g, { t: 25 }).up > 12) maxG = g; }
  check('m151: steepest grade (traction / power limit)', maxG >= 0.6 && maxG <= 0.9, `${maxG * 100}%`, '60% rated, ~70-80% traction limit on concrete (mu ~0.85 bias NDT)', 'INFERRED');
}

// ------------------------------------------------------------------------------------------------ 4. braking
head('braking: full service brake, clutch down, dry tarmac');
function stopDist(spec, v0, o = {}) {
  const v = make(spec, { load: o.load, env: o.env }); settle(v, 0.5);
  const S = v.S; S.vel[2] = -v0 / 3.6; for (const W of S.wheels) S.solver.w[4 + W.i] = v0 / 3.6 / W.r; S.solver.w[1] = 0; S.solver.w[2] = S.solver.w[3] = 0;
  // propellers / gearbox spinning with the wheels
  const a0 = S.spec.axles.find(a => a.driven === 'R'); if (a0) { S.solver.w[2] = a0.final * v0 / 3.6 / S.wheels[a0.wheels[0]].r; S.solver.w[1] = S.solver.w[2] * S.spec.transfer.high; }
  const af = S.spec.axles.find(a => a.driven === 'F'); if (af) S.solver.w[3] = af.final * v0 / 3.6 / S.wheels[af.wheels[0]].r;
  const z0 = S.pos[2]; let locked = 0;
  run(v, 20, { raw: { throttle: 0, brake: 1, clutch: 1, gear: 0, steer: 0, ignition: true } }, S => { for (const W of S.wheels) if (Math.abs(W.omega) < 0.5 && Math.abs(S.speed) > 2) locked = Math.max(locked, 1); return Math.abs(S.speed) > 0.05; });
  return { d: Math.abs(S.pos[2] - z0), locked, S };
}
for (const [spec, v0, lo, hi, src, tag] of [
  [M151, 32, 4.5, 7.5, '20 mph stop in < 25 ft (MIL "service brake" class, ~0.65 g); dry concrete', 'INFERRED'],
  [M151, 80, 30, 48, '0.6-0.75 g from 50 mph', 'INFERRED'],
  [M35, 32, 5, 10, '20 mph within ~ 30 ft (air-hydraulic drums, MIL-STD class)', 'INFERRED'],
  [LADA, 80, 30, 45, 'period tests ~ 38 m from 80 km/h (0.65 g)', 'UNVERIFIED'],
]) {
  if (!want(spec.id)) continue;
  const r = stopDist(spec, v0);
  const dec = (v0 / 3.6) ** 2 / (2 * r.d) / G;
  check(`${spec.id}: stop from ${v0} km/h`, r.d > lo && r.d < hi, `${fmt(r.d)} m (${fmt(dec, 2)} g)${r.locked ? ', wheels lock' : ''}`, `${lo}-${hi} m: ${src}`, tag);
}

// ------------------------------------------------------------------------------------------------ 5. stability: SSF, tilt table, J-turn
head('rollover: static stability factor, tilt table, dynamic J-turn');
const ssf = spec => spec.dims.track / (2 * spec.cg[1]);
if (want('m151')) {
  check('m151: static stability factor T / 2h', ssf(M151) > 1.0 && ssf(M151) < 1.25, `${fmt(ssf(M151), 2)} (track ${fmt(M151.dims.track, 3)} m, CG ${fmt(M151.cg[1], 2)} m)`, '~1.1: SUV / CJ-class, NHTSA 1-2 star band (cars 1.3-1.5)', 'INFERRED (CG height not published)');
  console.log(`      comparison SSF: M35 ${fmt(ssf(M35), 2)}, Land Rover ${fmt(ssf(LANDROVER), 2)}, Hilux ${fmt(ssf(HILUX), 2)}, Beetle ${fmt(ssf(BEETLE), 2)}, Lada ${fmt(ssf(LADA), 2)}`);
}
// a tilt table: the platform tilts about the vehicle's centreline at 1 deg / 0.4 s, high-friction surface (a test
// platform has a lip; here mu x 2) until both uphill wheels unload
function tiltTable(spec, load) {
  const T = { th: 0 }, env = { g: G, ground: (x, z, o) => { const t = T.th; o.h = -x * Math.tan(t); o.nx = Math.sin(t); o.ny = Math.cos(t); o.nz = 0; o.surf = SURF.deck; o.mu = 2; o.vx = o.vy = o.vz = 0; return o; } };
  const v = make(spec, { env, running: false, load }); run(v, 1, { raw: { handbrake: 1, brake: 1, gear: 1, clutch: 0 } });
  for (let th = 0; th <= 60; th += 0.5) {
    T.th = th * D2R; run(v, 0.2, { raw: { handbrake: 1, brake: 1, gear: 1, clutch: 0 } });
    const up = v.S.wheels.filter(W => W.spec.x < 0);   // left = uphill (right side low)
    if (up.every(W => W.Fz < 50)) return { th, roll: v.S.roll / D2R };
  }
  return { th: 99 };
}
if (want('m151')) {
  const { th } = tiltTable(M151);
  check('m151: tilt-table angle (uphill wheels lift)', th > 36 && th < 48, `${th}° (tan = ${fmt(Math.tan(th * D2R), 2)} = tilt-table ratio vs SSF ${fmt(ssf(M151), 2)})`, 'below atan(SSF) = ' + fmt(Math.atan(ssf(M151)) / D2R, 0) + '° (suspension roll, TTR ~0.9 SSF), above the TM\'s 40% (22°) side-slope limit', 'INFERRED');
}
if (want('m35')) {
  const e = tiltTable(M35), l = tiltTable(M35, [{ kg: M35.payload.xc, at: [0, 2.0, 1.75], size: [2, 1.2, 3.5] }]);
  check('m35: tilt-table angle, empty / 2.3 t on the bed', e.th > 30 && e.th < 42 && l.th < e.th, `${e.th}° / ${l.th}°`, `below atan(SSF) = ${fmt(Math.atan(ssf(M35)) / D2R, 0)}°, above the TM 30% side-slope limit (17°)`, 'INFERRED');
}
// J-turn / fishhook: steady speed, steering-wheel input profile steer(t), throttle off after the input; records max roll,
// two-wheel lift, rollover, spin-out. The vehicle is pre-spun to speed in a suitable gear.
function manoeuvre(spec, v0, steerFn, surf = SURF.tarmac, load, T = 4) {
  const v = make(spec, { env: flat(surf), load }); settle(v, 0.5);
  const S = v.S, r0 = S.wheels[0].r;
  const gear = Math.min(spec.gearbox.ratios.length, v0 > 60 ? 4 : 3);
  S.vel[2] = -v0 / 3.6; for (const W of S.wheels) S.solver.w[4 + W.i] = v0 / 3.6 / W.r;
  const ar = spec.axles.find(a => a.driven === 'R'); S.solver.w[2] = ar.final * v0 / 3.6 / r0; S.solver.w[1] = S.solver.w[2] * spec.transfer.high;
  const af = spec.axles.find(a => a.driven === 'F'); if (af) S.solver.w[3] = af.final * v0 / 3.6 / r0;
  S.solver.w[0] = S.solver.w[1] * spec.gearbox.ratios[gear - 1]; S.gear = gear;
  let maxRoll = 0, lift = 0, rolled = false, spun = false, h0 = S.heading, maxLat = 0;
  run(v, T, (S, tt) => ({ raw: { throttle: tt < 0.2 ? 0.3 : 0, brake: 0, clutch: 0, gear, steer: steerFn(tt), ignition: true } }), S => {
    maxRoll = Math.max(maxRoll, Math.abs(S.roll)); maxLat = Math.max(maxLat, Math.abs(S.latG));
    if (S.wheels.filter(W => W.spec.x > 0).every(W => !W.contact) || S.wheels.filter(W => W.spec.x < 0).every(W => !W.contact)) lift = 1;
    if (S.up[1] < 0.2) rolled = true;
    // spun: the body turned well past the path (velocity direction vs. heading > 60 deg)
    const sp = Math.hypot(S.vel[0], S.vel[2]); if (sp > 3 && Math.abs(S.speed) / sp < 0.5) spun = true;
  });
  void h0; return { maxRoll, lift, rolled, spun, maxLat, S };
}
const jturnSteer = lock => t => Math.min(1, t / 0.3) * lock;                         // step to lock in 0.3 s
const fishSteer = lock => t => t < 0.35 ? t / 0.35 * lock : t < 0.85 ? lock - (t - 0.35) / 0.25 * lock : -lock;   // NHTSA-style fishhook
const sweep = (spec, fn, surf, from, to, step = 5) => { for (let v0 = from; v0 <= to; v0 += step) { const r = manoeuvre(spec, v0, fn, surf); if (V) console.log(`      ${spec.id} ${v0} km/h on ${surf}: roll ${fmt(r.maxRoll / D2R)}° lat ${fmt(r.maxLat, 2)} g lift ${r.lift} rolled ${r.rolled} spun ${r.spun}`); if (r.rolled) return { v: v0, r }; } return { v: 0 }; };
// steady-state roll gradient: constant-radius circle, rising speed
function rollGradient(spec) {
  const v = make(spec); settle(v, 0.5); let pts = [];
  run(v, 30, (S, t) => ({ throttle: S.kmh < 10 + t * 1.2 ? 0.5 : 0.2, steer: 0.25, steerAbs: true }), S => { if (S.odometer > 20 && Math.abs(S.latG) > 0.15 && Math.abs(S.latG) < 0.5) pts.push(Math.abs(S.roll) / D2R / Math.abs(S.latG)); });
  return pts.length ? pts.reduce((a, b) => a + b) / pts.length : 0;
}
if (want('m151')) {
  const rg = rollGradient(M151);
  check('m151: roll gradient (steady circle)', rg > 3 && rg < 8, `${fmt(rg, 1)}°/g`, 'soft-sprung utility 4x4: ~4-7°/g', 'INFERRED');
  // dry tarmac: bias-ply mu ~0.85 < SSF 1.12: the jeep slides or spins before it tips on a flat road
  const js = []; for (const v0 of [40, 60, 80]) js.push([v0, manoeuvre(M151, v0, jturnSteer(1))]);
  const anyRoll = js.some(([, r]) => r.rolled);
  check('m151: J-turn on dry tarmac: slides / spins, peak lateral g near the tyre limit', !anyRoll && js.every(([, r]) => r.maxLat > 0.6), js.map(([v0, r]) => `${v0}: ${fmt(r.maxLat, 2)} g ${fmt(r.maxRoll / D2R)}°${r.lift ? ' LIFT' : ''}${r.spun ? ' spun' : ''}`).join(', '), 'untripped rollover needs a_y > ~SSF; tyre mu 0.85 < 1.12', 'CONFIRMED (physics) / INFERRED (mu)');
  const fh = sweep(M151, fishSteer(1), SURF.tarmac, 50, 100, 10);
  console.log(`      m151 fishhook on tarmac: ${fh.v ? 'rolls at ' + fh.v + ' km/h' : 'no rollover to 100 km/h'}`);
  const gj = sweep(M151, jturnSteer(1), SURF.grass, 30, 90, 10);
  console.log(`      m151 J-turn on grass: ${gj.v ? 'rolls at ' + gj.v + ' km/h' : 'spins out, no rollover to 90 km/h'}`);
}
// tripped rollover: sliding sideways off the tarmac onto a soft verge (wheels locked). The tyres dig in, the soil wedge
// builds lateral force past the friction limit and the vehicle trips - how most real rollovers happen, the M151's
// included (NHTSA soil-trip tests: SUV-class vehicles trip at ~25-45 km/h lateral speed).
function sideTrip(spec, surf) {
  for (let v0 = 10; v0 <= 70; v0 += 5) {
    const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = x > 0.5 ? surf : SURF.tarmac; o.vx = o.vy = o.vz = 0; return o; } };
    const v = make(spec, { env, pos: [-3, 0, 0] }); run(v, 0.5, { raw: { gear: 0, clutch: 0 } });
    v.S.vel[0] = v0 / 3.6; let rolled = false;
    run(v, 4, { raw: { gear: 0, clutch: 1, brake: 0.3 } }, S => { if (S.up[1] < 0.2) rolled = true; });
    if (rolled) return v0;
  }
  return 0;
}
if (want('m151')) {
  const T = {}; for (const s of [M151, LANDROVER, M35, HILUX, BEETLE, LADA]) T[s.id] = [sideTrip(s, SURF.grass), sideTrip(s, SURF.dirt), sideTrip(s, SURF.sand)];
  const f = a => a.map(v => v || '>70').join(' / ');
  console.log('      sideways trip speed km/h (grass / dirt / sand): ' + Object.entries(T).map(([k, a]) => `${k} ${f(a)}`).join(', '));
  const m = T.m151, lada = T.lada, mean = a => a.reduce((s, v) => s + (v || 80), 0) / a.length;
  check('m151: trips sliding sideways onto soft ground', m.every(v => v > 0 && v <= 55), `${f(m)} km/h`, 'tripped at moderate lateral speed (NHTSA soil-trip class for SSF ~1.1)', 'INFERRED');
  check('trip order follows stability: LR, M35 < M151 < Lada', mean(T.landrover) < mean(m) && mean(T.m35) < mean(m) && mean(m) < mean(lada), `means LR ${fmt(mean(T.landrover), 0)}, M35 ${fmt(mean(T.m35), 0)}, M151 ${fmt(mean(m), 0)}, Hilux ${fmt(mean(T.hilux), 0)}, Beetle ${fmt(mean(T.beetle), 0)}, Lada ${fmt(mean(lada), 0)}`, 'SSF 0.84 / 0.87 / 1.12 / 1.25; the M151\'s jacking rear costs it vs. its SSF', 'INFERRED');
}

// lift-off: a steady turn in 3rd near the limit, then lift: weight goes forward, engine braking loads the rear tyres
// (combined slip) and the semi-trailing arms toe / camber the unloaded rear: the line tightens
if (want('m151')) {
  const v = make(M151, { mode: 'semi' }); settle(v, 0.5); let t = 0;
  run(v, 18, S => { t += DT; return { throttle: S.kmh < 35 ? 0.8 : 0.3, steer: t > 4 ? 0.3 : 0, steerAbs: true, gear: t < 2 ? 1 : t < 5 ? 2 : 3 }; });
  // path curvature (yaw rate / speed) before and after the lift: tuck-in = the curvature grows at fixed steering
  const v1 = v.S.speed, g1 = v.S.latG, k1 = Math.abs(v.S.yawRate) / Math.max(1, Math.abs(v1));
  let kMax = 0; run(v, 1.5, { throttle: 0, steer: 0.3, steerAbs: true, gear: 3 }, S => { kMax = Math.max(kMax, Math.abs(S.yawRate) / Math.max(1, Math.abs(S.speed))); });
  check('m151: lift-off in a hard turn tightens the line (tuck-in)', kMax > k1 * 1.05, `curvature ${fmt(k1, 3)} /m at ${kmh(v1)} (${fmt(Math.abs(g1), 2)} g, gear ${v.S.gear}) -> ${fmt(kMax, 3)} /m after lifting (+${fmt((kMax / k1 - 1) * 100, 0)}%)`, 'lift-off oversteer of the semi-trailing-arm rear (Army M151 handling / driver-training notes)', 'INFERRED');
}

// ------------------------------------------------------------------------------------------------ 6. turning circle
head('turning circle (full lock, walking pace; outer front tyre path, kerb to kerb)');
for (const spec of [M151, M35, LANDROVER]) {
  if (!want(spec.id)) continue;
  const v = make(spec); settle(v, 0.3);
  const fl = spec.wheels.find(w => w.id === 'FL'), p = [fl.x - 0.1, 0, fl.z], q = [0, 0, 0];   // outer (left) tyre in a right turn
  let xmin = 1e9, xmax = -1e9;
  run(v, 60, (S) => ({ throttle: S.kmh < 5 ? 0.35 : 0, brake: S.kmh > 7 ? 0.3 : 0, steer: 1, steerAbs: true }), S => { if (S.odometer > 3) { S.worldPoint(p, q); xmin = Math.min(xmin, q[0]); xmax = Math.max(xmax, q[0]); } });
  const d = xmax - xmin, pub = spec.published.turnCircle;
  check(`${spec.id}: turning circle`, Math.abs(d - pub) / pub < 0.12, `${fmt(d)} m`, `${fmt(pub)} m`, spec.id === 'm151' ? 'UNVERIFIED (AMG 35 ft 9 in)' : spec.id === 'm35' ? 'CONFIRMED ~ (TM35 ~72 ft)' : 'CONFIRMED ~ (LR 47 ft)');
}

// ------------------------------------------------------------------------------------------------ 7. fuel economy and range
head('fuel economy: steady speed on level tarmac -> range vs published');
function economy(spec, kph, o = {}) {
  const v = make(spec, { load: o.load }); settle(v, 0.5);
  run(v, 60, S => ({ throttle: Math.max(0, Math.min(1, (kph - S.kmh) * 0.2 + 0.25)) }));
  const f0 = v.S.tripFuel, x0 = v.S.odometer;
  run(v, 120, S => ({ throttle: Math.max(0, Math.min(1, (kph - S.kmh) * 0.15 + 0.25)) }));
  const l = v.S.tripFuel - f0, km = (v.S.odometer - x0) / 1000;
  return { l100: l / km * 100, gear: v.S.gear, rpm: v.S.eng.rpm };
}
for (const [spec, kph, src, tag] of [
  [M151, 55, 'TM151: 17 gal for 300 mi -> 13.3 l/100 km (mixed military use)', 'CONFIRMED (range)'],
  [M35, 50, 'TM35: 50 gal for ~350 mi -> 34 l/100 km (mixed, partly loaded)', 'CONFIRMED (range)'],
  [BEETLE, 80, 'VW 1200: ~7.5-8.5 l/100 km at 80-90 km/h (DIN 70030)', 'UNVERIFIED'],
  [LADA, 80, 'VAZ-2101: 7.0 l/100 km at 80 km/h (factory)', 'UNVERIFIED'],
]) {
  if (!want(spec.id)) continue;
  const e = economy(spec, kph), cap = spec.fuel.capacity, pub = spec.published.range;
  const range = cap / e.l100 * 100;
  const target = pub ? cap / (pub / 1000) * 100 : (spec.id === 'beetle' ? 8 : 7);
  // a steady cruise should beat the mixed-use figure, but not by more than ~45%
  const ok = pub ? (e.l100 < target * 1.1 && e.l100 > target * 0.55) : Math.abs(e.l100 - target) / target < 0.25;
  check(`${spec.id}: ${kph} km/h steady`, ok, `${fmt(e.l100)} l/100 km (gear ${e.gear}, ${fmt(e.rpm, 0)} rpm) -> range ${fmt(range, 0)} km`, `${fmt(target)} l/100 km: ${src}`, tag);
}

// ------------------------------------------------------------------------------------------------ 8. fording
head('fording and water: wading depth, hydrolock, the deep-water kit');
function ford(spec, depth, kit = false) {
  const env = pond(depth, -12);
  const v = make(spec, { env, dmg: true }); settle(v, 0.5);
  const evs = new Set(); let maxD = 0;
  run(v, 30, S => ({ throttle: S.kmh < 6 ? 0.45 : 0.1, kit, range: spec.transfer.low ? 'L' : 'H', fwd: true }), S => { S.events.forEach(e => evs.add(e.e)); maxD = Math.max(maxD, S.depth); return S.pos[2] > -30; });
  return { evs, S: v.S, maxD, dist: -v.S.pos[2] };
}
for (const [spec, src] of [[M151, 'TM151 21 in (0.53 m) / 60 in with kit (1.52 m)'], [M35, 'TM35 30 in (0.76 m) / 72 in with kit (1.83 m)']]) {
  if (!want(spec.id)) continue;
  const W = spec.water;
  let r = ford(spec, W.ford);
  check(`${spec.id}: fords ${fmt(W.ford, 2)} m`, r.S.eng.running && !r.evs.has('hydrolock') && r.dist > 25, `ran ${fmt(r.dist)} m through ${fmt(r.maxD, 2)} m deep water, engine ${r.S.eng.running ? 'running' : 'stopped'}`, src, 'CONFIRMED');
  r = ford(spec, spec.water.intake[1] + 0.15);
  check(`${spec.id}: drowns above the air intake (${fmt(spec.water.intake[1], 2)} m)`, r.evs.has('hydrolock') && !r.S.eng.running, `events: ${[...r.evs].join(' ')}`, 'hydrolock', 'INFERRED (intake height)');
  r = ford(spec, W.kitFord * 0.95, true);
  check(`${spec.id}: with the fording kit at ${fmt(W.kitFord * 0.95, 2)} m`, !r.evs.has('hydrolock'), `events: ${[...r.evs].join(' ') || 'none'}, reached ${fmt(r.dist)} m`, src, 'CONFIRMED');
}
if (want('beetle')) {
  const r = ford(BEETLE, 0.6);
  check('beetle: wet ignition stalls in 0.6 m water', !r.S.eng.running, `events: ${[...r.evs].join(' ')}`, 'distributor low on the engine: civilian cars drown their ignition', 'INFERRED');
}

// ------------------------------------------------------------------------------------------------ 9. soft ground and the drivetrain
head('soft ground and drivetrain: 4WD, sprag, open differentials, the bogie');
if (want('m151')) {
  const mud = (fwd) => { const v = make(M151, { env: grade(0.12, SURF.mud, -1.5) }); settle(v, 0.5); run(v, 25, { throttle: 0.8, fwd }); return { up: -v.S.pos[2] - 1.5, sink: Math.max(...v.S.wheels.map(W => W.ts.sink)) }; };
  const a = mud(false), b = mud(true);
  check('m151: 12% muddy slope: 4WD gets up, 2WD digs in', b.up > 30 && a.up < b.up * 0.7, `2WD ${fmt(a.up)} m (sink ${fmt(a.sink * 100, 0)} cm), 4WD ${fmt(b.up)} m`, 'TM151: engage front drive for mud / sand', 'CONFIRMED (procedure)');
}
if (want('m35')) {
  // sprag: rear on ice, front on dirt: the front axle picks up the drive without a lever
  const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = z > 0.3 ? SURF.snow : SURF.dirt; o.vx = o.vy = o.vz = 0; return o; } };
  // ice under the bogie: mu 0.25 snow already; make it slicker via a wet-mud hybrid: use mud
  env.ground = (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = z > 0.3 ? SURF.mud : SURF.tarmac; o.vx = o.vy = o.vz = 0; return o; };
  const v = make(M35, { env }); settle(v, 0.5); let spr = 0;
  run(v, 3, { throttle: 1 }, S => { spr = Math.max(spr, S.spragTq || 0); });
  check('m35: sprag drives the front axle when the rear slips', spr > 300, `sprag torque peak ${fmt(spr, 0)} N m, ${kmh(v.S.speed)} after 3 s`, 'TM35: front axle engages automatically through the sprag unit', 'CONFIRMED (behaviour)');
  const v2 = make(M35); settle(v2, 0.5); let spr2 = 0; run(v2, 30, S => ({ throttle: S.kmh < 40 ? 0.5 : 0.25 }));
  run(v2, 5, S => ({ throttle: S.kmh < 40 ? 0.35 : 0.2 }), S => { spr2 = Math.max(spr2, S.spragTq || 0); });
  check('m35: sprag overruns cruising on a good surface (front not driven)', spr2 < 50, `sprag torque ${fmt(spr2, 0)} N m at ${kmh(v2.S.speed)}`, 'freewheels while the rear grips', 'CONFIRMED (behaviour)');
}
if (want('lada')) {
  // split mu: right rear on mud, left rear on tarmac, open diff: the mud wheel spins, little drive
  const env = { g: G, ground: (x, z, o) => { o.h = 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = x > 0 ? SURF.mud : SURF.tarmac; o.vx = o.vy = o.vz = 0; return o; } };
  const v = make(LADA, { env }); settle(v, 0.5); run(v, 3, { throttle: 1 });
  const L = v.S.wheels[2], R = v.S.wheels[3];
  check('lada: open differential on split-mu: the low-grip wheel spins', Math.abs(R.omega) > Math.abs(L.omega) * 1.4, `rear L ${fmt(L.omega * L.r * 3.6)} km/h, R ${fmt(R.omega * R.r * 3.6)} km/h, car ${kmh(v.S.speed)}`, 'equal torque split', 'CONFIRMED (physics)');
}
if (want('m35')) {
  // walking bogie: drive the right side over a 0.2 m ledge (a 0.3 m one cross-axles it: open diffs, see MODLOG)
  const env = { g: G, ground: (x, z, o) => { const s = x > 0 && z < -3 && z > -3.9; o.h = s ? 0.2 : 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = SURF.dirt; o.vx = o.vy = o.vz = 0; return o; } };
  // a driver takes a ledge in low range: walking pace, full throttle in first; average the lighter of the two right-rear
  // wheels while the bogie straddles the block (one wheel up on it, the other down)
  const v = make(M35, { env }); settle(v, 0.5); let sum = 0, n = 0;
  run(v, 25, S => ({ throttle: S.kmh < 4 ? 1 : 0.3, range: 'L' }), S => {
    const m = S.wheels[3], r = S.wheels[5], up = [m, r].filter(W => W.cy > 0.1).length;
    if (up === 1) { sum += Math.min(m.Fz, r.Fz); n++; }
    return S.pos[2] > -9;
  });
  const avg = n ? sum / n : 0, st = v.S.spec._prep.wheelLoad[3];
  check('m35: walking bogie keeps both rear axles loaded over a 0.2 m ledge', n > 20 && avg > 0.5 * st, `lighter wheel averages ${fmt(avg / 1000)} kN while straddling (static ${fmt(st / 1000)} kN), crossed to z ${fmt(v.S.pos[2])}`, 'the trunnion equalises the tandem (TM35: bogie articulation)', 'CONFIRMED (behaviour)');
  // vertical step: 18 in (0.46 m) from rest in low range
  const env2 = { g: G, ground: (x, z, o) => { o.h = z < -3.0 ? 0.457 : 0; o.nx = 0; o.ny = 1; o.nz = 0; o.surf = SURF.tarmac; o.vx = o.vy = o.vz = 0; return o; } };
  const w = make(M35, { env: env2, pos: [0, 0, -3.0 + 1.955 + 0.6] }); settle(w, 0.5);
  run(w, 40, { throttle: 1, range: 'L' }, S => S.pos[2] > -9);
  check('m35: climbs an 18 in vertical step in low range', w.S.pos[2] < -9 && w.S.pos[1] > 0.4, `${w.S.pos[2] < -9 ? 'all three axles over' : 'stuck at z ' + fmt(w.S.pos[2])}, y ${fmt(w.S.pos[1], 2)} m`, 'vertical wall 18 in (Jane\'s / TM tabulated "vertical obstacle")', 'UNVERIFIED');
}

// ------------------------------------------------------------------------------------------------ 10. engine: start, stall, idle
head('engine: start, idle, stall, fuel at idle');
for (const spec of [M151, M35]) {
  if (!want(spec.id)) continue;
  const v = make(spec, { running: false }); let tStart = 0;
  run(v, 6, { raw: { starter: true, ignition: true, gear: 0, clutch: 0, throttle: 0 } }, (S, t) => { if (S.eng.running && !tStart) { tStart = t; return false; } });
  run(v, 4, { raw: { starter: false, ignition: true, gear: 0, clutch: 0, throttle: 0 } });
  const idleLh = v.S.eng.fuelFlow * 3600 / (spec.engine.diesel ? 0.84 : 0.74);
  check(`${spec.id}: starts and idles`, tStart > 0 && Math.abs(v.S.eng.rpm - spec.engine.idle) < 120 && idleLh > 0.5 && idleLh < 1.6, `catches after ${fmt(tStart)} s cranking, idles ${fmt(v.S.eng.rpm, 0)} rpm, ${fmt(v.S.eng.fuelFlow * 3600 / (spec.engine.diesel ? 0.84 : 0.74), 2)} l/h`, `${spec.engine.idle} rpm, ~0.6-1.5 l/h idle`, 'CONFIRMED (idle rpm) / INFERRED (idle burn)');
  // dump the clutch in top gear from rest: stalls
  const s = make(spec, { mode: 'manual' }); settle(s, 0.3);
  run(s, 3, (S, t) => ({ throttle: 0.2, clutch: t < 0.5 ? 1 : 0, gear: spec.gearbox.ratios.length }));
  check(`${spec.id}: clutch dumped in top gear from rest stalls`, !s.S.eng.running, `engine ${s.S.eng.running ? 'running ' + fmt(s.S.eng.rpm, 0) : 'stalled'}`, 'stall', 'CONFIRMED (physics)');
}

// ------------------------------------------------------------------------------------------------ 11. damage effects
head('damage: flat tyre pull, fuel leak, overheating, fire');
if (want('m151')) {
  const v = make(M151, { dmg: true }); settle(v, 0.5);
  run(v, 8, S => ({ throttle: S.kmh < 50 ? 0.7 : 0.25 }));
  v.S.dmg.puncture(1, 1);   // right front flat
  const y0 = v.S.heading; run(v, 3, { throttle: 0.25 });
  const dy = (v.S.heading - y0) / D2R;
  check('m151: right front flat pulls right', dy > 1.5, `heading ${fmt(dy)}° in 3 s hands-off`, 'pulls towards the flat', 'CONFIRMED (physics)');
  const d = make(M151, { dmg: true }); settle(d, 0.3); d.S.dmg.state.coolant = 0.1; const evs = new Set();
  run(d, 600, S => ({ throttle: S.kmh < 70 ? 0.8 : 0.4 }), S => { S.events.forEach(e => evs.add(e.e)); });
  check('m151: radiator drained: overheats and seizes', evs.has('overheat') && (evs.has('seized') || d.S.dmg.state.engine < 0.5), `temp ${fmt(d.S.eng.temp, 0)} °C, engine ${fmt(d.S.dmg.state.engine * 100, 0)}%, events ${[...evs].join(' ')}`, 'overheat warning then engine damage', 'INFERRED');
  // a fuel-tank burst: leak, then fire (hot engine), crew exposed, wreck within ~75 s unless put out
  const f = make(M151, { dmg: true }); settle(f, 0.3); f.S.dmg.setOccupant('front', true); const fe = new Set();
  for (let i = 0; i < 6; i++) f.S.dmg.hit([-1.2, 0.5, 0.25 + i * 0.04], [1, 0, 0], 'hmg');
  f.S.events.forEach(e => fe.add(e.e));   // the hits' own events (leak, maybe fire at once)
  f.S.eng.temp = 105;
  run(f, 120, { throttle: 0.2 }, S => { S.events.forEach(e => fe.add(e.e)); return !S.dmg.state.wrecked; });
  check('m151: .50 burst through the fuel tank: leak, fire, wreck', fe.has('fuelLeak') && fe.has('fire') && f.S.dmg.state.wrecked, `events ${[...fe].join(' ')}; fuel ${fmt(f.S.fuelL, 1)} L left, crew ${f.S.dmg.state.seats.filter(s => s.occupied).map(s => s.id + ' ' + fmt(s.hp * 100, 0) + '%').join(', ')}`, 'gasoline vehicles burn readily when the tank is holed', 'INFERRED');
}

// ------------------------------------------------------------------------------------------------ 12. wave-2 interfaces
head('interfaces for the host: terrain adapter, road traffic follower, level of detail');
{
  // a lumpy terrain through makeTerrainEnv (numerical normals), a Lada following a 60 x 40 m loop of waypoints at 50 km/h
  const env = makeTerrainEnv({ height: (x, z) => 0.3 * Math.sin(x / 9) * Math.cos(z / 11), surface: (x, z) => Math.abs(z) < 25 ? 'tarmac' : 'dirt', g: G });
  const loop = []; for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; loop.push({ x: 60 * Math.cos(a), z: 40 * Math.sin(a) }); }
  for (const [id, lod] of [['lada', 'near'], ['m35', 'far'], ['m151', 'far'], ['beetle', 'mid']]) {
    const v = createWheeledSim(id, { lod }); v.sim.reset([60, 0, 0], Math.PI, { running: true }); v.sim.placeOnGround(env); v.driver.reset(v.sim);
    const F = createFollower(loop, { speed: 14, loop: true, latG: 0.3 }); let maxErr = 0, dist = 0, t = 0;
    for (let k = 0; k < 60 * 90; k++) {
      v.sim.step(DT, v.driver.update(v.sim, F.update(v.sim), DT), env); t += DT;
      const r = Math.hypot(v.sim.pos[0] / 60, v.sim.pos[2] / 40); if (t > 10) maxErr = Math.max(maxErr, Math.abs(r - 1) * 50);
      dist += Math.abs(v.sim.speed) * DT;
    }
    check(`${id} (${lod} LOD) follows a road loop`, maxErr < 3 && dist > 600 && v.sim.up[1] > 0.9, `${fmt(dist, 0)} m in 90 s, max cross-track ~${fmt(maxErr, 1)} m, upright ${v.sim.up[1] > 0.9}`, 'traffic for the WORLD layer: stays on its lane, no spin-outs', 'INFERRED');
  }
  // the far LOD is cheap
  const perf = (lod) => { const v = createWheeledSim('m35', { lod }); v.sim.reset([60, 0, 0], Math.PI); v.sim.placeOnGround(env); const t0 = performance.now(); for (let k = 0; k < 600; k++) v.sim.step(DT, v.driver.update(v.sim, { throttle: 0.5 }, DT), env); return (performance.now() - t0) / 600; };
  const pn = perf('near'), pf = perf('far');
  check('far LOD costs a fraction of the near one', pf < pn * 0.45, `M35 per 60 Hz frame: near ${fmt(pn, 3)} ms, far ${fmt(pf, 3)} ms`, '<= ~40% (fewer probes, 240 Hz)', 'INFERRED');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
