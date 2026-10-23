#!/usr/bin/env node
// jetfingerprint.mjs - proves the HORNET flight model is bit-identical after a refactor of jetfm.js / the parametric
// airframe (game/js/units/air/airframe.js). Flies a fixed set of scenarios (CAS manoeuvres, DIRECT mode departure,
// engine start / flame-out, ground handling, catapult, arrested landing on a moving deck) and hashes every state
// float (position, velocity, attitude, rates, surfaces, engines, fuel, gear) after every frame.
//   node tools/jetfingerprint.mjs            compare with the stored reference
//   node tools/jetfingerprint.mjs --write    store a new reference (only when a change to the Hornet is intended)
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const { createJetSim, DECKOPS, HORNET } = await import('../game/js/jetfm.js');
const REF = new URL('./jetfingerprint.ref', import.meta.url);
const G = 9.0, DT = 1 / 60;
const hash = createHash('sha256'), f64 = new Float64Array(64), parts = {};
let nf = 0;
function absorb(name, A) {
  let i = 0; const put = v => { f64[i++] = typeof v === 'number' ? v : v ? 1 : 0; };
  for (const v of [A.pos, A.vel, A.w]) { put(v.x); put(v.y); put(v.z); }
  put(A.q.x); put(A.q.y); put(A.q.z); put(A.q.w);
  for (const k of ['stab', 'ail', 'rud', 'flap', 'lef', 'brake']) put(A.surf[k]);
  for (const e of A.eng) { put(e.n); put(e.ab); put(e.egt); put(e.thrust); put(e.ff); put(e.nozzle); put(e.run); }
  put(A.fuel); put(A.gear); put(A.hook); put(A.nz); put(A.alpha); put(A.beta); put(A.wow[0]); put(A.wow[1]); put(A.wow[2]); put(!!A.wire); put(A.dead ? 1 : 0); put(A.onGround);
  const b = Buffer.from(f64.buffer, 0, i * 8); hash.update(b);
  (parts[name] ||= createHash('sha256')).update(b); nf++;
}
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
function air(eas, alt = 300) {
  const A = createJetSim(G); A.reset(0, 0, 0, 0, { running: true, airborne: true, alt, speed: 0 });
  const rho = 4.9 * Math.exp(-A.pos.y / 6000); A.vel.set(0, 0, -eas * Math.sqrt(1.225 / rho)); for (const e of A.eng) e.n = 0.9; A.fuel = 1800; return A;
}
function fly(name, A, secs, c, env = sea) { for (let t = 0; t < secs; t += DT) { A.step(DT, typeof c === 'function' ? c(A, t) : c, env); env.tick && env.tick(DT); absorb(name, A); if (A.dead) return; } }
// 1. CAS: rolls, pulls, pushes, pedal, limiter, AB top speed, flaps/gear configuration
fly('cas', air(155), 30, (A, t) => ctl({ roll: Math.sin(t * 0.7), pitch: Math.sin(t * 0.37) * 0.9, yaw: t > 20 ? Math.sin(t * 2) : 0, thr: 0.5 + 0.5 * Math.sin(t * 0.2) }));
{ const A = air(110, 600); fly('limiter', A, 20, (A, t) => ctl({ pitch: 1, thr: t < 10 ? 0 : 1, roll: t > 12 ? 0.6 : 0 })); }
{ const A = air(250, 200); A.stores.bomb = [false, false, false, false]; fly('ab', A, 40, ctl({ thr: 1, pitch: 0.02 })); }
{ const A = air(120, 400); A.gearCmd = 1; A.flapSel = 2; A.brakeCmd = 1; A.hookCmd = 1; fly('config', A, 15, (A, t) => ctl({ pitch: 0.3 * Math.sin(t), thr: 0.7 })); }
// 2. DIRECT mode: a departure, damaged hydraulics, an engine shut down and restarted, flame-out on empty tanks
{ const A = air(130, 800); A.cas = false; fly('direct', A, 15, (A, t) => ctl({ pitch: t < 4 ? 1 : 0, roll: t > 2 && t < 6 ? 1 : 0, yaw: t > 3 ? -1 : 0, thr: 0.9 })); }
{ const A = air(150, 500); const env = { ...sea, mods: { eng: [0.4, 1], hyd: 0.2, fcsOk: true, gearOk: true, hookOk: true, fire: [true, false] } }; fly('mods', A, 10, ctl({ roll: 0.5, thr: 1 }), env); }
{ const A = air(150, 500); A.eng[0].run = false; fly('restart', A, 4, ctl({ thr: 0.6 })); A.eng[0].start = 0.01; fly('restart', A, 20, ctl({ thr: 0.6 })); A.fuel = 5; fly('restart', A, 10, ctl({ thr: 1 })); }
// 3. ground: settle, taxi, steer, brake; cold start
{ const A = createJetSim(G); A.reset(0, 0, 0, 0.3, { running: true }); fly('ground', A, 3, ctl({ thr: 0, brakeL: 1, brakeR: 1 }), land); fly('ground', A, 10, (A) => ctl({ thr: A.vel.length() < 5 ? 0.2 : 0, yaw: 0.7 }), land); fly('ground', A, 5, ctl({ thr: 0, brakeL: 1, brakeR: 0.3 }), land); }
{ const A = createJetSim(G); A.reset(5, 0, 5, 0, { running: false }); A.eng[0].start = 0.01; A.eng[1].start = 0.01; fly('cold', A, 25, ctl({ thr: 0 }), land); }
// 4. carrier: catapult, then an arrested landing (same pilots as jetbench)
{ const W = carrierWorld({ x: 0, z: 0, yaw: 0.2, speed: 6, w: 0.01 }); const C = createJetSim(G); C.reset(0, 8, 0, 0, { running: true }); C.attachCat(W); fly('cat', C, 12, (C, t) => ctl({ thr: t < 0.5 ? 0.3 : 0.8 }), W); }
{
  const W = carrierWorld({ x: 0, z: 0, yaw: 0, speed: 6 }); const L = createJetSim(G); L.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 0 });
  L.gear = L.gearCmd = 1; L.flapSel = 2; L.surf.flap = 1; L.hook = L.hookCmd = 1; L.fuel = 1000; L.stores.bomb = [false, false, false, false];
  const aimZ = 41 - HORNET.HOOK_TIP[2], gs = 3.5 * Math.PI / 180, dist = 450;
  L.pos.set(DECKOPS.LAND_X, 8 + 2.3 + Math.tan(gs) * dist, aimZ + dist); L.vel.set(0, -Math.tan(gs) * 27.5, -33.5); for (const e of L.eng) e.n = 0.86;
  let trap = false, thrI = 0.62;
  const casStick = (A, n) => { const c = Math.cos(A.attitude().pitch); return Math.max(-1, Math.min(1, n >= c ? (n - c) / (3.5 - c) : (n - c) / (c + 1))); };
  fly('trap', L, 40, (L) => {
    if (L.wire) trap = true;
    if (trap) return ctl({ thr: L.wire && L.wire.held === 0 ? 0.8 : 0, brakeL: L.wire ? 0 : 1, brakeR: L.wire ? 0 : 1 });
    if (L.onGround) return ctl({ thr: 0.8 });
    const [lx, lz] = W.loc(L.pos.x, L.pos.z), R = lz - aimZ, yDes = 8 + 2.3 + Math.tan(gs) * Math.max(0, R);
    const vyDes = -Math.tan(gs) * 27.5 + 0.25 * (yDes - L.pos.y), aerr = L.alpha - 0.1414;
    thrI = Math.max(0, Math.min(0.79, thrI + aerr * 0.8 * DT));
    return ctl({ thr: Math.max(0, Math.min(1, thrI + aerr * 3)), pitch: casStick(L, 1 + 0.12 * (vyDes - L.vel.y)), roll: Math.max(-1, Math.min(1, (-(lx - DECKOPS.LAND_X) * 0.01 - L.vel.x * 0.04 - L.attitude().roll) * 1.5)) });
  }, W);
}
// 5. a crash into the sea and a hull scrape on land
{ const A = air(100, 30); fly('crash', A, 10, ctl({ pitch: -0.6, thr: 0.3 })); }
const digest = hash.digest('hex'), lines = [`all ${digest}`, ...Object.entries(parts).map(([k, h]) => `${k} ${h.digest('hex')}`)];
if (process.argv.includes('--write')) { fs.writeFileSync(REF, lines.join('\n') + '\n'); console.log(`reference written (${nf} frames)\n` + lines.join('\n')); process.exit(0); }
const ref = fs.existsSync(REF) ? fs.readFileSync(REF, 'utf8').trim().split('\n') : [];
let bad = 0;
for (const l of lines) { const k = l.split(' ')[0], r = ref.find(x => x.split(' ')[0] === k); const ok = r === l; if (!ok) bad++; console.log(`${ok ? 'SAME' : 'DIFF'}  ${l}`); }
console.log(bad ? `\nHORNET CHANGED: ${bad} scenario hashes differ (${nf} frames)` : `\nHORNET bit-identical (${nf} frames, ${lines.length - 1} scenarios)`);
process.exit(bad ? 1 : 0);
