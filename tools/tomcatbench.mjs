#!/usr/bin/env node
// tomcatbench.mjs - F-14A TOMCAT on the parametric airframe (game/js/units/air/tomcatfm.js) against published data,
// in plain node: control signs, trim and damping, the CADC sweep schedule, the envelope (stall, approach, roll, g,
// top speeds, sustained turn), the TF30 (spool, afterburner light-off, compressor stalls), deck operations
// (catapult, arrested landing) - and the HORNET stays bit-identical (jetfingerprint).   node tools/tomcatbench.mjs [--v]
// Speeds are equivalent airspeed (see jetfm.js: the air is 4x sea-level density, true speeds are half).
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const { createTomcatSim, TOMCAT, cadcSweep, loadout } = await import('../game/js/units/air/tomcatfm.js');
const { DECKOPS, KT, LB, aeroCoeffs } = await import('../game/js/units/air/airframe.js');
const V = process.argv.includes('--v');
const G = 9.0, DT = 1 / 60;
let pass = 0, fail = 0;
const check = (name, ok, got, want, src = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} ${got}${want ? '   (want ' + want + (src ? ', ' + src : '') + ')' : ''}`); };
const deg = r => r * 180 / Math.PI, clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sea = { groundY: () => 0, water: () => true };
const land = { groundY: () => 0, water: () => false };
function carrierWorld(c) {
  const loc = (x, z) => { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [dx * co - dz * si, dx * si + dz * co]; };
  const onDeck = (x, z) => { const [lx, lz] = loc(x, z); let hw = 14 * 0.97; if (lz < -44) hw *= Math.max(0, (lz + 66) / 22); return Math.abs(lx) < hw && lz > -66 && lz < 60; };
  return {
    c, groundY: (x, z) => onDeck(x, z) ? 8 : 0, water: (x, z) => !onDeck(x, z),
    surfVel: (x, z) => onDeck(x, z) ? { vx: -Math.sin(c.yaw) * c.speed, vz: -Math.cos(c.yaw) * c.speed, w: c.w || 0, cx: c.x, cz: c.z } : null,
    carrier: () => ({ x: c.x, z: c.z, yaw: c.yaw, deck: 8 }),
    tick(dt) { c.x += -Math.sin(c.yaw) * c.speed * dt; c.z += -Math.cos(c.yaw) * c.speed * dt; c.yaw += (c.w || 0) * dt; }, loc,
  };
}
const ctl = (o = {}) => ({ pitch: 0, roll: 0, yaw: 0, brakeL: 0, brakeR: 0, ...o, throttle: o.throttle ?? [o.thr ?? 0.6, o.thr ?? 0.6] });
function air(eas, alt = 300, o = {}) {
  const A = createTomcatSim(G, { seed: o.seed }); A.reset(0, 0, 0, 0, { running: true, airborne: true, alt, speed: 0 });
  const rho = 4.9 * Math.exp(-A.pos.y / 6000), tas = eas * Math.sqrt(1.225 / rho);
  A.vel.set(0, 0, -tas); for (const e of A.eng) e.n = 0.9; A.fuel = o.fuel ?? 4500;
  A.stores = loadout(o.load || 'cap'); A.sweep = cadcSweep(tas / 170); A.trim = o.trim ?? 0;
  return A;
}
function fly(A, secs, c, env = sea, each) { for (let t = 0; t < secs; t += DT) { const ev = A.step(DT, typeof c === 'function' ? c(A, t) : c, env); env.tick && env.tick(DT); if (each) each(A, t, ev); if (A.dead) return A.dead; } return null; }
// the bench pilot is the AI's own flight director (units/air/fd.js): PI on g with pitch-rate damping, bank, speed
const { createFD } = await import('../game/js/units/air/fd.js');
function pilot() {
  let fd = null; const get = A => fd && fd.A === A ? fd : (fd = createFD(A, { gmax: 9 }));
  return { g: (A, n) => get(A).pitchFor(n, DT), bank: (A, phi) => get(A).rollFor(phi), speed: (A, eas) => get(A).throttleFor(eas, DT), get gi() { return fd ? fd.gi : 0; } };
}
const levelG = (A) => { const att = A.attitude(); return Math.cos(att.pitch) / Math.max(0.2, Math.cos(att.roll)) - A.vel.y * 0.08; };

console.log('--- control signs (SAS, 300 KEAS) ---');
{
  let A = air(155); const h0 = A.heading();
  fly(A, 0.8, ctl({ roll: 1 })); check('stick right rolls right', A.attitude().roll > 0.6, `roll ${deg(A.attitude().roll).toFixed(0)}°`);
  A = air(155); fly(A, 1.0, ctl({ pitch: 0.4 })); check('stick aft pitches up / pulls g', A.attitude().pitch > 0.1 && A.nz > 2, `pitch ${deg(A.attitude().pitch).toFixed(0)}° nz ${A.nz.toFixed(1)}`);
  A = air(155); fly(A, 1.0, ctl({ pitch: -0.4 })); check('stick forward pitches down', A.attitude().pitch < -0.05, `pitch ${deg(A.attitude().pitch).toFixed(0)}°`);
  A = air(155); fly(A, 2.0, ctl({ yaw: 1 })); check('right pedal yaws nose right', A.heading() - h0 > 0.02 && A.beta < -0.01, `dHdg ${deg(A.heading() - h0).toFixed(1)}° beta ${deg(A.beta).toFixed(1)}°`);
}
console.log('--- trim and stability ---');
{
  // trim for 300 KEAS level: let the bench pilot fly level, then take its stick position as the trim and let go
  const A = air(155), pl = pilot();
  fly(A, 15, (A) => ctl({ pitch: pl.g(A, levelG(A)), roll: pl.bank(A, 0), thr: pl.speed(A, 155) }));
  A.trim = A.surf.stab; const y0 = A.pos.y, thr = A.eng[0].n; let th = pl.speed(A, 155);
  fly(A, 15, (A) => ctl({ thr: th }));
  check('trimmed 300 KEAS, hands off 15 s: holds altitude', Math.abs(A.pos.y - y0) < 40 && Math.abs(A.attitude().roll) < 0.1, `dAlt ${(A.pos.y - y0).toFixed(1)} m, roll ${deg(A.attitude().roll).toFixed(1)}°, AoA ${deg(A.alpha).toFixed(1)}°, trim ${deg(A.trim).toFixed(1)}°, sweep ${A.sweep.toFixed(0)}°`);
  const B = air(155, 300, { trim: A.trim }); B.w.set(0.5, 0.3, 0.2); fly(B, 6, ctl({ thr: th }));
  check('disturbed rates damp out (SAS)', Math.abs(B.w.x) + Math.abs(B.w.y) + Math.abs(B.w.z) < 0.06, `|w| ${(Math.abs(B.w.x) + Math.abs(B.w.y) + Math.abs(B.w.z)).toFixed(3)}`);
}
console.log('--- CADC wing sweep ---');
{
  const s = [0.3, 0.6, 0.75, 0.85, 0.95, 1.1].map(m => cadcSweep(m).toFixed(0)).join(' / ');
  check('program: M 0.3 / 0.6 / 0.75 / 0.85 / 0.95 / 1.1', cadcSweep(0.3) === 20 && Math.abs(cadcSweep(0.75) - 37.5) < 0.1 && cadcSweep(1.1) === 68, `${s}°`, '20 / 23 / 38 / 55 / 64 / 68', 'Heatblur manual table');
  const A = air(240, 300); A.sweep = 20; A.sweepMode = 'manual'; A.sweepCmd = 68; let t68 = null;
  fly(A, 5, ctl({ thr: 0.8, pitch: 0.02 }), sea, (A, t) => { if (t68 === null && A.sweep > 67.9) t68 = t; });
  check('sweeps 20° -> 68° at 15°/s', t68 > 3 && t68 < 3.5, `${t68?.toFixed(2)} s`, '3.2 s', 'Heatblur: ~15°/s');
  const F = air(105, 300); F.flapSel = 2; F.sweepMode = 'manual'; F.sweepCmd = 50; fly(F, 6, ctl({ thr: 0.6 }));
  check('flaps down lock the wings at 20°', F.sweep < 20.5, `${F.sweep.toFixed(1)}°`);
  const H = air(240, 300); H.sweepMode = 'manual'; H.sweepCmd = 20; fly(H, 4, ctl({ thr: 0.8 }));
  check('manual: no forward of the program', H.sweep >= cadcSweep(H.mach) - 1, `${H.sweep.toFixed(0)}° at M ${H.mach.toFixed(2)} (program ${cadcSweep(H.mach).toFixed(0)}°)`);
}
console.log('--- envelope vs F-14A ---');
{
  // clean (CAP loadout) 1 g minimum speed: idle, hold altitude with the stick until it won't
  const A = air(76, 600, { fuel: 3500 }); let minE = 999, maxA = 0; const pl = pilot();
  fly(A, 30, (A) => ctl({ pitch: pl.g(A, Math.cos(A.attitude().pitch) + clamp((600 - A.pos.y) * 0.02 - A.vel.y * 0.12, -0.6, 0.8)), roll: pl.bank(A, 0), thr: 0 }), sea, A => { if (Math.abs(A.vel.y) < 1.5) minE = Math.min(minE, A.eas); maxA = Math.max(maxA, A.alpha); });
  check('1 g minimum speed clean, 20°, 24.3 t', minE * KT > 100 && minE * KT < 135, `${(minE * KT).toFixed(0)} KEAS, max AoA ${deg(maxA).toFixed(0)}°, mass ${(A.mass / 1000).toFixed(1)} t`, '~115-125 kt', 'UNVERIFIED');
  // approach: gear + full flaps on 15 units (~10.5° AoA, UNVERIFIED conversion) at 51,800 lb max trap weight
  const a = 10.5 * Math.PI / 180, m = 51800 / LB, K = createTomcatSim(G).P.aeroAt({ sweep: 20, vane: 0 });
  const c = aeroCoeffs(K, a, 0, 0.2, { flap: 1, lef: 0.85, gear: 1, brake: 0, stab: 0.03, rud: 0, stores: 3 });
  const qS = m * G * Math.cos(3.5 * Math.PI / 180) / c.CL / TOMCAT.S, eas = Math.sqrt(2 * qS / 1.225);
  check('on-speed approach 15 units, 51,800 lb', eas * KT > 120 && eas * KT < 145, `${(eas * KT).toFixed(0)} KEAS, L/D ${(c.CL / c.CD).toFixed(1)}`, '~130-135 kt', 'UNVERIFIED (NATOPS approach chart)');
  // roll at 350 KEAS, full lateral stick, wings at the program
  const R = air(180); let pmax = 0; fly(R, 2, ctl({ roll: 1, thr: 0.8 }), sea, R => pmax = Math.max(pmax, R.w.x));
  check('max roll rate at 350 KEAS', deg(pmax) > 130 && deg(pmax) < 220, `${deg(pmax).toFixed(0)}°/s at sweep ${R.sweep.toFixed(0)}°`, '~150-180°/s', 'UNVERIFIED');
  const R2 = air(260); pmax = 0; fly(R2, 2, ctl({ roll: 1, thr: 1 }), sea, R => pmax = Math.max(pmax, R.w.x));
  check('roll rate at 500 KEAS, wings swept (no spoilers)', deg(pmax) > 60 && deg(pmax) < 180, `${deg(pmax).toFixed(0)}°/s at sweep ${R2.sweep.toFixed(0)}°`, 'less than wings-forward');
  // g: no limiter. Full aft stick at 400 KEAS goes past 7.5 g (the pilot has to hold it)
  const P = air(205); let nmax = 0; fly(P, 2.5, ctl({ pitch: 1, thr: 1 }), sea, P => nmax = Math.max(nmax, P.nz));
  check('full aft stick at 400 KEAS: more than 7.5 g (no limiter)', nmax > 7.5 && nmax < 13, `${nmax.toFixed(1)} g`, '> 7.5 g, overstress possible', 'NATOPS: 7.5 g limit, pilot-held');
  const P2 = air(205); nmax = 0; const pl2 = pilot(); fly(P2, 4, (A) => ctl({ pitch: pl2.g(A, 6.5), thr: 1 }), sea, P => nmax = Math.max(nmax, P.nz));
  check('a pilot holding 6.5 g gets it without overshoot', nmax > 6.2 && nmax < 7.5, `${nmax.toFixed(2)} g peak`);
  // top speeds at low level, clean (no stores)
  for (const [thr, lo, hi, label, want] of [[0.79, 0.82, 0.97, 'MIL', '~M 0.9 (INFERRED)'], [1, 1.1, 1.3, 'MAX AB', 'M 1.2 at sea level (Jane\'s)']]) {
    const T = air(250, 200, { load: 'clean' }); const pl = pilot();
    fly(T, 150, (T) => ctl({ thr, pitch: pl.g(T, 1 + clamp((200 - T.pos.y) * 0.02 - T.vel.y * 0.05, -0.5, 0.5)), roll: pl.bank(T, 0) }));
    check(`top speed ${label} low level (clean)`, T.mach > lo && T.mach < hi, `M ${T.mach.toFixed(2)}  ${(T.eas * KT).toFixed(0)} KEAS  sweep ${T.sweep.toFixed(0)}°`, want);
  }
  // sustained turn: max AB, level at 450 m (sea-level-ish), find the g that holds 350 KEAS (CAP loadout, half fuel)
  const S = air(180, 450); const ps = pilot(); let gs = 4.5, gI = 4.5, gAvg = 0, nAvg = 0;
  fly(S, 80, (S, t) => { gI = clamp(gI + (S.eas - 180) * 0.006 * DT, 1.5, 8); gs = clamp(gI + (S.eas - 180) * 0.05, 1.5, 8); if (t > 50) { gAvg += S.nz; nAvg++; } const ph = Math.acos(Math.min(1, Math.cos(S.attitude().pitch) / gs)) + clamp(S.vel.y * 0.04 + (S.pos.y - 450) * 0.003, -0.2, 0.2); return ctl({ thr: 1, roll: ps.bank(S, ph), pitch: ps.g(S, gs) }); }, sea, (S, t) => { if (V && Math.round(t * 60) % 120 === 0) console.log(t.toFixed(0), 'gs', gs.toFixed(2), 'nz', S.nz.toFixed(2), 'roll', deg(S.attitude().roll).toFixed(0), 'eas', (S.eas * KT).toFixed(0), 'a', deg(S.alpha).toFixed(1), 'y', S.pos.y.toFixed(0)); });
  gAvg /= nAvg; check('sustained turn max AB 350 KEAS', gAvg > 5 && gAvg < 7 && Math.abs(S.eas - 180) < 8, `${gAvg.toFixed(1)} g at ${(S.eas * KT).toFixed(0)} KEAS, alt ${S.pos.y.toFixed(0)} m, sweep ${S.sweep.toFixed(0)}°`, 'F-14A ~5.5-6.5 g at SL', 'INFERRED from EM charts');
}
console.log('--- TF30 ---');
{
  const A = air(150); for (const e of A.eng) e.n = 0.68; let t95 = null, tab = null;
  fly(A, 12, ctl({ thr: 1 }), sea, (A, t) => { if (t95 === null && A.eng[0].n > 0.95) t95 = t; if (tab === null && A.eng[0].ab > 0.5) tab = t; });
  check('spool idle -> 95% (slow TF30)', t95 > 3 && t95 < 8, `${t95?.toFixed(1)} s`, '~4-7 s', 'INFERRED (F404 ~2.5 s)');
  check('afterburner lights late (zones)', tab - t95 > 1, `half AB ${(tab - t95).toFixed(1)} s after 95%`);
  const ff = air(150); ff.fuel = 4000; fly(ff, 10, ctl({ thr: 0.79 })); const mil = ff.eng[0].ff, mil2 = ff.eng[0].thrust;
  fly(ff, 6, ctl({ thr: 1 })); const ab = ff.eng[0].ff;
  check('fuel flow MIL / max AB per engine', mil > 0.8 && mil < 1.4 && ab > 5 && ab < 8, `${(mil * 3600 * LB).toFixed(0)} / ${(ab * 3600 * LB).toFixed(0)} lb/h`, '~8,500 / 58,000 lb/h', 'TSFC 0.69 / 2.78, P&W');
  // compressor stalls: 60 s of ordinary flying (turns, power changes): none
  const N = air(170, 300, { seed: 7 }); let stalls = 0; const pn = pilot();
  fly(N, 60, (A, t) => ctl({ thr: 0.7 + 0.25 * Math.sin(t * 0.3), roll: pn.bank(A, Math.sin(t * 0.2) * 1.0), pitch: pn.g(A, 1 / Math.max(0.3, Math.cos(A.attitude().roll))) }), sea, (A, t, ev) => { for (const e of ev) if (e.e === 'compstall') stalls++; });
  check('no compressor stalls in normal flight (60 s)', stalls === 0, `${stalls} stalls`);
  // ...and 30 s at 30°+ AoA with full power and rudder (a departure in the making): they come
  let ns = 0, flame = 0, minN = 1;
  for (let seed = 1; seed <= 4; seed++) {
    const H = air(140, 900, { seed });
    fly(H, 30, (A, t) => ctl({ thr: 1, pitch: 1, yaw: t > 3 ? 0.6 : 0 }), sea, (A, t, ev) => { for (const e of ev) { if (e.e === 'compstall') ns++; if (e.e === 'flameout') flame++; } minN = Math.min(minN, A.eng[0].thrust / 93000); });
  }
  check('high AoA + sideslip at full power: compressor stalls', ns >= 2, `${ns} stalls in 4 x 30 s, ${flame} flame-outs`, 'the TF30 reputation');
  // a stall clears with the throttle at idle and the nose down
  const C = air(150, 600, { seed: 3 }); C.eng[0].stalled = true; C.eng[0].stallT = 0; C.eng[0].clearT = 0; let cleared = null;
  fly(C, 6, (A, t) => ctl({ thr: 0, pitch: -0.1 }), sea, (A, t, ev) => { for (const e of ev) if (e.e === 'stallclear' && cleared === null) cleared = t; });
  check('stall clears at idle, nose down', cleared !== null && C.eng[0].run, `cleared after ${cleared?.toFixed(1)} s`);
}
console.log('--- deck: catapult and arrested landing ---');
{
  const W = carrierWorld({ x: 0, z: 0, yaw: 0, speed: 6 });
  const C = createTomcatSim(G); C.reset(0, 8, 0, 0, { running: true }); C.catX = -7; C.attachCat(W); let shot = 0, end = null, minY = 1e9;
  fly(C, 16, (C, t) => ctl({ thr: t < 0.5 ? 0.3 : 1, pitch: end ? clamp((0.2 - C.attitude().pitch) * 2, -0.5, 0.5) : 0 }), W, (C, t, ev) => { for (const e of ev) { if (e.e === 'catshot') shot = t; if (e.e === 'catend') end = { t, v: e.v, eas: C.eas }; } if (end) minY = Math.min(minY, C.pos.y); });
  check('cat shot after the run-up (MIL + zone 5)', shot > 3 && shot < 10, `fired at ${shot.toFixed(1)} s, mass ${(C.mass / 1000).toFixed(1)} t`);
  check('end of stroke speed', end && end.eas * KT > 150, end ? `${end.v.toFixed(1)} m/s over deck, ${(end.eas * KT).toFixed(0)} KEAS` : 'no shot', '> approach speed');
  check('flies away from the bow', !C.dead && minY > 4 && C.vel.y > 0, `dead ${C.dead}  min height ${minY.toFixed(1)}  vs ${C.vel.y.toFixed(1)} m/s  alt ${C.pos.y.toFixed(0)}`);
  // trap: on-speed (15 units) on a 3.5° slope, stick for the slope (PI on g), throttle for AoA
  const W2 = carrierWorld({ x: 0, z: 0, yaw: 0, speed: 6 });
  const L = createTomcatSim(G); L.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 0 }); L.landX = -5;
  L.gear = L.gearCmd = 1; L.flapSel = 2; L.surf.flap = 1; L.hook = L.hookCmd = 1; L.fuel = 2500; L.stores = loadout('cap').slice(0, 2); L.sweep = 20;
  const aimZ = 41 - TOMCAT.HOOK_TIP[2], gs = 3.5 * Math.PI / 180, dist = 450, aoa = 10.5 * Math.PI / 180;
  L.pos.set(-5, 8 + 2.4 + Math.tan(gs) * dist, aimZ + dist); L.vel.set(0, -Math.tan(gs) * 28, -34); for (const e of L.eng) e.n = 0.85;
  let trap = null, td = null, thrI = 0.55; const pl = pilot(); const log = [];
  fly(L, 40, (L) => {
    if (trap) return ctl({ thr: L.wire && L.wire.held === 0 ? 0.8 : 0, brakeL: L.wire ? 0 : 1, brakeR: L.wire ? 0 : 1 });
    if (L.onGround) return ctl({ thr: 0.8 });
    const [lx, lz] = W2.loc(L.pos.x, L.pos.z), R = lz - aimZ, yDes = 8 + 2.4 + Math.tan(gs) * Math.max(0, R);
    const vyDes = -Math.tan(gs) * 28 + 0.25 * (yDes - L.pos.y), aerr = L.alpha - aoa;
    thrI = clamp(thrI + aerr * 0.8 * DT, 0, 0.79);
    return ctl({ thr: clamp(thrI + aerr * 3, 0, 1), pitch: pl.g(L, Math.cos(L.attitude().pitch) + 0.12 * (vyDes - L.vel.y)), roll: clamp((-(lx + 5) * 0.01 - L.vel.x * 0.04 - L.attitude().roll) * 1.5 - L.w.x * 0.2, -1, 1) });
  }, W2, (L, t, ev) => {
    for (const e of ev) { if (e.e === 'trap') trap = { wire: e.wire, v: e.v, t }; if (e.e === 'touchdown' && !td) td = { t, vy: L.vel.y, eas: L.eas, z: W2.loc(L.pos.x, L.pos.z)[1] }; }
    if (V && Math.round(t * 60) % 60 === 0) log.push(`${t.toFixed(1)} z ${W2.loc(L.pos.x, L.pos.z)[1].toFixed(0)} y ${L.pos.y.toFixed(1)} vy ${L.vel.y.toFixed(1)} eas ${(L.eas * KT).toFixed(0)} a ${deg(L.alpha).toFixed(1)} n ${(L.eng[0].n * 100).toFixed(0)} nz ${L.nz.toFixed(2)}`);
  });
  if (V) console.log(log.join('\n'));
  const [, lzEnd] = W2.loc(L.pos.x, L.pos.z);
  check('touchdown sink rate', td && td.vy > -6 && td.vy < -0.5, td ? `${td.vy.toFixed(1)} m/s at ${(td.eas * KT).toFixed(0)} KEAS, deck z ${td.z.toFixed(0)}` : 'none');
  check('hook catches a wire', !!trap, trap ? `wire ${trap.wire} at ${trap.v.toFixed(1)} m/s` : `no trap, dead=${L.dead}`);
  check('stops on the deck, wire released at idle', !L.dead && trap && lzEnd > -40 && L.onGround && !L.wire, `stopped at deck z ${lzEnd.toFixed(1)}`);
}
console.log('--- the HORNET is unchanged ---');
{
  let out = '', ok = true;
  try { out = execFileSync(process.execPath, [new URL('./jetfingerprint.mjs', import.meta.url).pathname], { encoding: 'utf8' }); } catch (e) { ok = false; out = e.stdout || String(e); }
  check('jetfingerprint: Hornet bit-identical', ok, out.trim().split('\n').pop());
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
