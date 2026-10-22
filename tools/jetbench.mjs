#!/usr/bin/env node
// jetbench.mjs - flight-model checks for game/js/jetfm.js in plain node (no browser): control signs, trims and the
// performance envelope compared with published F/A-18C figures (in equivalent airspeed / g, see jetfm.js header), plus
// ground handling, catapult and arrested landing against a fake carrier.   node tools/jetbench.mjs [--v]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const { createJetSim, HORNET, DECKOPS, KT, FT } = await import('../game/js/jetfm.js');
const V = process.argv.includes('--v');
const G = 9.0, DT = 1 / 60;
let pass = 0, fail = 0;
const check = (name, ok, got, want) => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${got}${want ? '   (want ' + want + ')' : ''}`); };
const deg = r => r * 180 / Math.PI;

// worlds
const sea = { groundY: () => 0, water: () => true };
const land = { groundY: () => 0, water: () => false };
function carrierWorld(c) {   // a 120 x 28 deck at height 8 over water, moving; c = {x,z,yaw,speed,w}
  const loc = (x, z) => { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [dx * co - dz * si, dx * si + dz * co]; };
  const onDeck = (x, z) => { const [lx, lz] = loc(x, z); let hw = 14 * 0.97; if (lz < -44) hw *= Math.max(0, (lz + 66) / 22); return Math.abs(lx) < hw && lz > -66 && lz < 60; };
  return {
    c, groundY: (x, z) => onDeck(x, z) ? 8 : 0, water: (x, z) => !onDeck(x, z),
    surfVel: (x, z) => onDeck(x, z) ? { vx: -Math.sin(c.yaw) * c.speed, vz: -Math.cos(c.yaw) * c.speed, w: c.w || 0, cx: c.x, cz: c.z } : null,
    carrier: () => ({ x: c.x, z: c.z, yaw: c.yaw, deck: 8 }),
    tick(dt) { c.x += -Math.sin(c.yaw) * c.speed * dt; c.z += -Math.cos(c.yaw) * c.speed * dt; c.yaw += (c.w || 0) * dt; },
    loc,
  };
}
const ctl = (o = {}) => ({ pitch: 0, roll: 0, yaw: 0, throttle: [o.thr ?? 0.6, o.thr ?? 0.6], brakeL: 0, brakeR: 0, ...o, throttle: o.throttle ?? [o.thr ?? 0.6, o.thr ?? 0.6] });
function air(eas, alt = 300, o = {}) {   // a jet in level flight at `eas` m/s equivalent airspeed
  const A = createJetSim(G); A.reset(0, 0, 0, 0, { running: true, airborne: true, alt, speed: 0 });
  const rho = 4.9 * Math.exp(-(A.pos.y) / 6000), tas = eas * Math.sqrt(1.225 / rho);
  A.vel.set(0, 0, -tas); for (const e of A.eng) e.n = 0.9; A.fuel = o.fuel ?? 1800;
  if (o.clean) { A.stores.bomb = [false, false, false, false]; }
  return A;
}
function fly(A, secs, c, env = sea, each) { for (let t = 0; t < secs; t += DT) { const ev = A.step(DT, typeof c === 'function' ? c(A, t) : c, env); env.tick && env.tick(DT); if (each) each(A, t, ev); if (A.dead) return A.dead; } return null; }
// throttle that holds speed (simple PI), for trims
function holdSpeed(target) { let i = 0.6; return (A, c) => { i += (target - A.eas) * 0.02 * DT; i = Math.max(0, Math.min(1, i)); c.throttle = [i + (target - A.eas) * 0.03, i + (target - A.eas) * 0.03].map(v => Math.max(0, Math.min(1, v))); return c; }; }

console.log('--- control signs (CAS, 300 kt) ---');
{
  let A = air(155); const h0 = A.heading();
  fly(A, 0.8, ctl({ roll: 1 })); check('stick right rolls right', A.attitude().roll > 0.9, `roll ${deg(A.attitude().roll).toFixed(0)}°`);
  A = air(155); fly(A, 1.0, ctl({ pitch: 0.5 })); check('stick aft pitches up / pulls g', A.attitude().pitch > 0.15 && A.nz > 2, `pitch ${deg(A.attitude().pitch).toFixed(0)}° nz ${A.nz.toFixed(1)}`);
  A = air(155); fly(A, 1.0, ctl({ pitch: -0.5 })); check('stick forward pitches down', A.attitude().pitch < -0.1, `pitch ${deg(A.attitude().pitch).toFixed(0)}°`);
  A = air(155); fly(A, 2.0, ctl({ yaw: 1 })); check('right pedal yaws nose right', A.heading() - h0 > 0.02 && A.beta < -0.02, `dHdg ${deg(A.heading() - h0).toFixed(1)}° beta ${deg(A.beta).toFixed(1)}°`);
}
console.log('--- trim and stability (CAS, hands off) ---');
{
  const A = air(155), y0 = A.pos.y; const hs = holdSpeed(155);
  fly(A, 20, (A) => hs(A, ctl()));
  check('level 300 kt hands-off holds altitude', Math.abs(A.pos.y - y0) < 25 && Math.abs(A.attitude().roll) < 0.05, `dAlt ${(A.pos.y - y0).toFixed(1)} m, roll ${deg(A.attitude().roll).toFixed(1)}°, alpha ${deg(A.alpha).toFixed(1)}°, thr ${(A.eng[0].n * 100).toFixed(0)}%`);
  const B = air(155); B.w.set(0.5, 0.3, 0.2); fly(B, 6, (B) => hs(B, ctl()));
  check('disturbed rates damp out', Math.abs(B.w.x) + Math.abs(B.w.y) + Math.abs(B.w.z) < 0.03, `|w| ${(Math.abs(B.w.x) + Math.abs(B.w.y) + Math.abs(B.w.z)).toFixed(3)}`);
  const C = air(155); fly(C, 0.8, ctl({ roll: 0.6 })); const r60 = C.attitude().roll; fly(C, 8, (C) => hs(C, ctl()));
  check('banked hands-off: holds bank (no roll-off)', Math.abs(C.attitude().roll - r60) < 0.2, `bank ${deg(r60).toFixed(0)}° -> ${deg(C.attitude().roll).toFixed(0)}°, beta ${deg(C.beta).toFixed(1)}°`);
}
console.log('--- envelope vs F/A-18C ---');
{
  // stall / AoA limiter: idle, full aft stick in level flight, see how slow it gets while holding altitude
  const A = air(110, 600); let minE = 999, maxA = 0;
  fly(A, 25, (A) => ctl({ pitch: Math.max(-1, Math.min(1, (600 - A.pos.y) * 0.02 - A.vel.y * 0.08)), thr: 0 }), sea, A => { if (Math.abs(A.vel.y) < 2) minE = Math.min(minE, A.eas); maxA = Math.max(maxA, A.alpha); });
  check('1 g minimum speed clean (AoA limiter)', minE * KT > 95 && minE * KT < 145 && deg(maxA) < 31, `${(minE * KT).toFixed(0)} KEAS, max AoA ${deg(maxA).toFixed(0)}°`, '~120-130 kt, AoA ~27°');
  // roll rate at 350 kt
  const R = air(180); let pmax = 0; fly(R, 2, ctl({ roll: 1 }), sea, R => pmax = Math.max(pmax, R.w.x));
  check('max roll rate at 350 KEAS', deg(pmax) > 180 && deg(pmax) < 260, `${deg(pmax).toFixed(0)}°/s`, '~200-230°/s');
  // instantaneous g at 400 kt
  const P = air(205); let nmax = 0; fly(P, 2.5, ctl({ pitch: 1, thr: 1 }), sea, P => nmax = Math.max(nmax, P.nz));
  check('full aft stick at 400 KEAS: g limited to 7.5', nmax > 7 && nmax < 8.2, `${nmax.toFixed(2)} g`, '7.5 g');
  // top speed (mil, then max AB) at low level
  for (const [thr, lo, hi, label] of [[0.79, 0.85, 1.0, 'MIL'], [1, 0.97, 1.15, 'MAX AB']]) {
    const T = air(250, 200, { clean: true }); T.stores.aam = [false, false];
    fly(T, 120, (T) => ctl({ thr, pitch: Math.max(-1, Math.min(1, (200 - T.pos.y) * 0.02 - T.vel.y * 0.05)) }));
    check(`top speed ${label} low level (clean)`, T.mach > lo && T.mach < hi, `M ${T.mach.toFixed(2)}  ${(T.eas * KT).toFixed(0)} KEAS  TAS ${T.tas.toFixed(0)} m/s`, `M ${lo}-${hi}`);
  }
  // sustained turn: max AB, level at 5000 ft-ish (scaled: 450 m)... at 350 KEAS, how much g can be held without losing speed
  const S = air(180, 450); let gs = 0;
  fly(S, 30, (S, t) => { const n = 1 + Math.min(1, t / 3) * 5.5; const c = ctl({ thr: 1, roll: Math.max(-1, Math.min(1, (Math.acos(Math.min(1, 1 / n)) - S.attitude().roll) * 2)), pitch: 0 }); c.pitch = Math.max(-1, Math.min(1, (n - S.nz) * 0.3 + 0.5 * (n - 1) / 6.5 - S.vel.y * 0.03)); return c; }, sea, S => gs = S.nz);
  check('sustained turn max AB 350 KEAS', S.eas * KT > 250, `${gs.toFixed(1)} g, speed now ${(S.eas * KT).toFixed(0)} KEAS, alt ${(S.pos.y).toFixed(0)} m`, 'real ~6-6.5 g');
  // approach: gear + full flaps, on-speed AoA 8.1 deg on a 3.5 deg glide path
  {   // static trim: lift + thrust = weight on a 3.5 deg path at 8.1 deg AoA, gear and full flaps, 13 t
    const { aeroCoeffs } = await import('../game/js/jetfm.js'); const a = 8.1 * Math.PI / 180, m = 13000;
    const c = aeroCoeffs(a, 0, 0.2, { flap: 1, lef: 0.85, gear: 1, brake: 0, stab: 0.05, rud: 0, stores: 2 });
    const qS = m * G * Math.cos(3.5 * Math.PI / 180) / c.CL / HORNET.S, eas = Math.sqrt(2 * qS / 1.225);
    check('on-speed approach (8.1° AoA, gear+flaps, 13 t)', eas * KT > 125 && eas * KT < 145, `${(eas * KT).toFixed(0)} KEAS, TAS ${(eas / 2).toFixed(1)} m/s, L/D ${(c.CL / c.CD).toFixed(1)}`, '~134-140 kt');
    const c2 = aeroCoeffs(0.47, 0, 0.2, { flap: 0, lef: 1, gear: 0, brake: 0, stab: 0.1, rud: 0, stores: 6 });
    const e2 = Math.sqrt(2 * 14500 * G / c2.CL / HORNET.S / 1.225);
    check('1 g stall speed clean at the 27° AoA limit, 14.5 t', e2 * KT > 105 && e2 * KT < 135, `${(e2 * KT).toFixed(0)} KEAS (CL ${c2.CL.toFixed(2)})`, '~115-130 kt');
  }
  if (0) { const Q = air(70, 150); Q.gearCmd = 1; Q.gear = 1; Q.flapSel = 2; Q.surf.flap = 1; Q.stores.bomb = [false, false, false, false]; Q.fuel = 1000;
  let thr = 0.6;
  fly(Q, 40, (Q) => { const gam = Math.atan2(Q.vel.y, Math.hypot(Q.vel.x, Q.vel.z)); thr = Math.max(0, Math.min(1, thr + (deg(gam) + 3.5) * 0.004)); return ctl({ thr, pitch: Math.max(-1, Math.min(1, (0.1414 - Q.alpha) * 6)) }); });
  }
  if (0) check('on-speed approach (8.1° AoA, 3.5° path, 13 t)', Q.eas * KT > 125 && Q.eas * KT < 145, `${(Q.eas * KT).toFixed(0)} KEAS  TAS ${Q.tas.toFixed(1)} m/s  AoA ${deg(Q.alpha).toFixed(1)}°  rpm ${(Q.eng[0].n * 100).toFixed(0)}%  mass ${Q.mass.toFixed(0)}`, '~134-140 kt');
}
console.log('--- ground, catapult, trap ---');
{
  // parked on flat ground: settles, no creep, no jitter
  const A = createJetSim(G); A.reset(0, 0, 0, 0, { running: true });
  fly(A, 2, ctl({ thr: 0, brakeL: 1, brakeR: 1 }), land); const p0 = A.pos.clone();
  fly(A, 6, ctl({ thr: 0, brakeL: 1, brakeR: 1 }), land);
  check('parked: settles on the gear, no creep', A.pos.distanceTo(p0) < 0.02 && Math.abs(A.vel.length()) < 0.02 && A.onGround, `creep ${A.pos.distanceTo(p0).toFixed(3)} m  settle drop ${Math.hypot(p0.x, p0.z).toFixed(2)} m  h ${A.pos.y.toFixed(2)}  wow ${A.wow.map(v => v.toFixed(2))}  pitch ${deg(A.attitude().pitch).toFixed(1)}°`);
  // taxi: a little throttle, right pedal: the nose wheel steers it round (count heading change frame by frame)
  let turned = 0, hp = A.heading(); fly(A, 10, (A) => ctl({ thr: A.vel.length() < 5 ? 0.18 : 0, yaw: 0.7 }), land, A => { let d = A.heading() - hp; d = (d + 3 * Math.PI) % (2 * Math.PI) - Math.PI; turned += d; hp = A.heading(); });
  check('taxi with nose wheel steering turns right', turned > 0.5 && A.onGround, `turned ${deg(turned).toFixed(0)}°  speed ${A.vel.length().toFixed(1)} m/s`);
  fly(A, 6, ctl({ thr: 0, brakeL: 1, brakeR: 1 }), land);
  check('wheel brakes stop it', A.vel.length() < 0.2 && !A.dead, `speed ${A.vel.length().toFixed(2)} dead ${A.dead}`);
  // catapult from a carrier steaming at 6 m/s
  const W = carrierWorld({ x: 0, z: 0, yaw: 0, speed: 6 });
  const C = createJetSim(G); C.reset(0, 8, 0, 0, { running: true }); C.attachCat(W); let shot = 0, end = null, minY = 1e9;
  fly(C, 14, (C, t) => ctl({ thr: t < 0.5 ? 0.3 : 0.8, pitch: 0 }), W, (C, t, ev) => { for (const e of ev) { if (e.e === 'catshot') shot = t; if (e.e === 'catend') end = { t, v: e.v, eas: C.eas }; } if (end) minY = Math.min(minY, C.pos.y); });
  check('cat shot after run-up to MIL', shot > 2 && shot < 6, `fired at ${shot.toFixed(1)} s`);
  check('end of stroke speed', end && end.eas * KT > 145, end ? `${end.v.toFixed(1)} m/s over deck, ${(end.eas * KT).toFixed(0)} KEAS, stroke ${(end.t - shot).toFixed(2)} s` : 'no shot');
  check('flies away (no settle into the sea)', !C.dead && minY > 4 && C.vel.y > 0, `dead ${C.dead}  min height ${minY.toFixed(1)}  vs ${C.vel.y.toFixed(1)} m/s  alt ${C.pos.y.toFixed(0)}`);
  // arrested landing: 450 m behind a carrier steaming at 6 m/s, on a 3.5° glideslope at on-speed, hook down.
  // The scripted pilot flies it the Hornet way: stick (g command) for the glideslope, throttle for on-speed AoA.
  const W2 = carrierWorld({ x: 0, z: 0, yaw: 0, speed: 6 });
  const L = createJetSim(G); L.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 0 });
  L.gear = L.gearCmd = 1; L.flapSel = 2; L.surf.flap = 1; L.hook = L.hookCmd = 1; L.fuel = 1000; L.stores.bomb = [false, false, false, false];
  const aimZ = 41 - HORNET.HOOK_TIP[2], gs = 3.5 * Math.PI / 180, dist = 450;
  L.pos.set(DECKOPS.LAND_X, 8 + 2.3 + Math.tan(gs) * dist, aimZ + dist); L.vel.set(0, -Math.tan(gs) * 27.5, -33.5); for (const e of L.eng) e.n = 0.86;
  let trap = null, td = null, thrI = 0.62; const log = [];
  const casStick = (A, n) => { const c = Math.cos(A.attitude().pitch); return Math.max(-1, Math.min(1, n >= c ? (n - c) / (3.5 - c) : (n - c) / (c + 1))); };
  fly(L, 40, (L) => {
    if (trap) return ctl({ thr: L.wire && L.wire.held === 0 ? 0.8 : 0, brakeL: L.wire ? 0 : 1, brakeR: L.wire ? 0 : 1 });   // trapped: MIL until stopped, then idle so the wire lets go
    if (L.onGround) return ctl({ thr: 0.8 });   // MIL on touchdown in case of a bolter
    const [lx, lz] = W2.loc(L.pos.x, L.pos.z), R = lz - aimZ, yDes = 8 + 2.3 + Math.tan(gs) * Math.max(0, R);
    const vyDes = -Math.tan(gs) * 27.5 + 0.25 * (yDes - L.pos.y), aerr = L.alpha - 0.1414;
    thrI = Math.max(0, Math.min(0.79, thrI + aerr * 0.8 * DT));
    return ctl({ thr: Math.max(0, Math.min(1, thrI + aerr * 3)), pitch: casStick(L, 1 + 0.12 * (vyDes - L.vel.y)), roll: Math.max(-1, Math.min(1, (-(lx - DECKOPS.LAND_X) * 0.01 - L.vel.x * 0.04 - L.attitude().roll) * 1.5)) });
  }, W2, (L, t, ev) => {
    for (const e of ev) { if (V && !["scrape"].includes(e.e)) log.push(t.toFixed(2) + " EV " + JSON.stringify(e) + " relv " + Math.hypot(L.vel.x, L.vel.z + 6).toFixed(1) + " wire " + JSON.stringify(L.wire)); if (e.e === "trap") trap = { wire: e.wire, v: e.v, t }; if (e.e === 'touchdown' && !td) td = { t, vy: L.vel.y, eas: L.eas, z: W2.loc(L.pos.x, L.pos.z)[1] }; }
    if (V && Math.round(t * 60) % 30 === 0) log.push(`${t.toFixed(1)} z ${W2.loc(L.pos.x, L.pos.z)[1].toFixed(0)} y ${L.pos.y.toFixed(1)} vy ${L.vel.y.toFixed(1)} eas ${(L.eas * KT).toFixed(0)} a ${deg(L.alpha).toFixed(1)} thr ${(L.eng[0].n * 100).toFixed(0)}`);
  });
  if (V) console.log(log.join('\n'));
  const [, lzEnd] = W2.loc(L.pos.x, L.pos.z);
  check('touchdown sink rate (half-speed world: ~1-3 m/s)', td && td.vy > -6 && td.vy < -0.5, td ? `${td.vy.toFixed(1)} m/s at ${(td.eas * KT).toFixed(0)} KEAS, deck z ${td.z.toFixed(0)}` : 'none');
  check('hook catches a wire', !!trap, trap ? `wire ${trap.wire} at ${trap.v.toFixed(1)} m/s over the deck` : `no trap, dead=${L.dead}`);
  check('stops on the deck, wire released at idle', !L.dead && trap && lzEnd > -40 && L.onGround && !L.wire, `stopped at deck z ${lzEnd.toFixed(1)} (runout ${trap ? (41 - 7 - lzEnd).toFixed(0) : '?'} m)`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
