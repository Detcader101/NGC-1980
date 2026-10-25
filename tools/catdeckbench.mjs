#!/usr/bin/env node
// catdeckbench.mjs - (ngc/bugsweep) the catapult shot on the live ALBATROSS deck, for the F-14A TOMCAT and the F/A-18A
// HORNET on the parametric airframe, in plain node. The deck is the game's own: buildAlbatross()'s localDeck with the
// parked aircraft and lifts in it (war.js deckY), heaving, pitching and rolling in a seaway (units/naval/seamotion.js),
// the carrier steaming at 6 m/s and turning (so she heels), stepped the way the game steps it (the ship first, then the
// jet's step(dt), which substeps at 240 Hz). Frames of 1/60 s (a desktop), 1/30 s and 0.1 s (headless Chrome; main.js caps a frame at 0.1 s).
// The bug this guards: every Tomcat died at the end of the cat stroke (46-55 g, breakup): the gear met the heeling deck
// or a parked Hornet that the shuttle's flat-deck pose ignored. Checks per run: no overstress / breakup / crash from
// the shot to 6 s after the end of the stroke, hands off (the airframe's own launch rotation, MIL power), and she
// climbs away (> 25 m above the sea and climbing at the end).
//   node tools/catdeckbench.mjs [--v]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
// albatross.js paints its decals on a canvas: a do-nothing 2D context is enough for the geometry
const ctx2 = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : /Gradient|Pattern/.test(k) ? () => ({ addColorStop() {} }) : /ImageData/.test(k) ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}, set: (t, k, v) => (t[k] = v, true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2 }) };
const { buildAlbatross } = await import('../game/js/units/naval/albatross.js');
const { SHIPS, makeSea, createShipMotion, shipPointY, shipPointVY } = await import('../game/js/units/naval/seamotion.js');
const { createTomcatSim } = await import('../game/js/units/air/tomcatfm.js');
const { createJetSim } = await import('../game/js/jetfm.js');
const V = process.argv.includes('--v');
const G = 9.0, deg = r => r * 180 / Math.PI;
const parts = buildAlbatross(1, {});
let pass = 0, fail = 0;
const check = (name, ok, got, want) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${got}   (want ${want})`); };

function makeShip(ss, seed, turn) {
  const mo = createShipMotion(SHIPS.albatross, makeSea(ss, -1.2, 11 + seed), 31 + seed * 7);
  const u = { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, yaw: 0.7, w: 0, sp: 6, t: 0, att: { heave: 0, pitch: 0, roll: 0, vHeave: 0, vPitch: 0, vRoll: 0 }, DECK: 8 };
  const toLocal = (x, z) => { const dx = x - u.p.x, dz = z - u.p.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  u.sail = dt => {   // war.js sailShip, a steady turn at the war's turn rate when asked (the heel)
    u.t += dt; const ACC = 0.015, wT = turn * 0.09;
    u.w += Math.max(-ACC * dt, Math.min(ACC * dt, wT - u.w));
    u.v.x = -Math.sin(u.yaw) * u.sp; u.v.z = -Math.cos(u.yaw) * u.sp; u.p.x += u.v.x * dt; u.p.z += u.v.z * dt; u.yaw += u.w * dt;
    const m = mo.step(dt, u.sp, u.yaw, u.w); Object.assign(u.att, m);
  };
  for (let t = 0; t < 30; t += 0.05) mo.step(0.05, u.sp, u.yaw, 0);   // a sea already running
  for (let t = 0; t < 12; t += 0.05) u.sail(0.05);                    // and the ship settled into her turn
  // the war's env (war.js deckY / deckAt / surfVel, jetplay / tomcatplay / airwar env.carrier)
  const deckY = (x, z) => { const [lx, lz] = toLocal(x, z); const h = parts.localDeck(lx, lz); if (h < -1e8) return -1e9; const a = u.att; return shipPointY(0, a.heave, a.pitch, a.roll, lx, h, lz); };
  const on = (x, z) => { const [lx, lz] = toLocal(x, z); return Math.abs(lx) < (parts.halfW || 14) && Math.abs(lz) < 64; };
  const env = {
    groundY: (x, z) => Math.max(0, deckY(x, z)), water: (x, z) => !(deckY(x, z) > -1e8), mods: null,   // main.js waterAt / jetGroundY
    surfVel: (x, z) => { if (!on(x, z)) return null; const a = u.att, [lx, lz] = toLocal(x, z), h = Math.max(0, parts.localDeck(lx, lz)); return { vx: u.v.x, vz: u.v.z, w: u.w, cx: u.p.x, cz: u.p.z, vy: shipPointVY(a.vHeave, a.pitch, a.roll, a.vPitch, a.vRoll, lx, h, lz) }; },
    carrier: () => ({ x: u.p.x, z: u.p.z, yaw: u.yaw, deck: u.DECK, vx: u.v.x, vz: u.v.z, speed: u.sp, w: u.w, att: u.att, deckAt: (x, z) => { const [lx, lz] = toLocal(x, z), a = u.att; return shipPointY(0, a.heave, a.pitch, a.roll, lx, u.DECK, lz); } }),
  };
  return { u, env };
}

function shot(kind, ss, seed, turn, dt) {
  const { u, env } = makeShip(ss, seed, turn);
  const A = kind === 'tomcat' ? createTomcatSim(G) : createJetSim(G);
  A.reset(0, 0, 0, u.yaw, { running: true });
  A.attachCat(env);
  const ctl = { pitch: 0, roll: 0, yaw: 0, brakeL: 0, brakeR: 0, throttle: [kind === 'tomcat' ? 0.86 : 0.8, kind === 'tomcat' ? 0.86 : 0.8] };
  const r = { bad: [], nz: 0, minAgl: 99, end: null, t: 0, maxRoll: 0 };
  let tEnd = null;
  for (let t = 0; t < 40; t += dt) {
    u.sail(dt);
    const ev = A.step(dt, ctl, env);
    for (const e of ev) { if (['overstress', 'breakup', 'crash', 'crashed', 'ditch', 'gearcollapse'].includes(e.e) || A.dead) r.bad.push(e.e + (e.g ? ' ' + e.g.toFixed(0) + ' g' : '')); if (e.e === 'catend') { tEnd = t; r.vEnd = e.v; } }
    if (A.dead && !r.bad.length) r.bad.push('dead: ' + A.dead);
    if (A.dead) break;
    if (tEnd !== null) {
      r.nz = Math.max(r.nz, A.nz); r.minAgl = Math.min(r.minAgl, A.pos.y); r.maxRoll = Math.max(r.maxRoll, Math.abs(A.attitude().roll));
      if (t - tEnd >= 6) { r.end = { y: A.pos.y, vy: A.vel.y, eas: A.eas }; break; }
    }
    if (V && Math.round(t / dt) % Math.round(1 / dt) === 0) console.log(`   ${kind} ${t.toFixed(1)} cat ${A.cat ? A.cat.state : '-'} y ${A.pos.y.toFixed(2)} nz ${A.nz.toFixed(1)} heel ${deg(u.att.roll).toFixed(1)}`);
  }
  r.launched = tEnd !== null;
  return r;
}

for (const kind of ['tomcat', 'hornet']) {
  console.log(`--- ${kind === 'tomcat' ? 'F-14A TOMCAT' : 'F/A-18A HORNET'} off the bow cat (x ${-2.5}), sea states 3 / 5 / 6, straight and turning, frames 1/60, 1/30, 0.1 s (main.js caps a frame at 0.1 s) ---`);
  for (const dt of [1 / 60, 1 / 30, 0.1]) for (const ss of [3, 5, 6]) {
    const runs = [];
    for (const seed of [1, 2]) for (const turn of [0, 1, -1]) runs.push(shot(kind, ss, seed, turn, dt));
    const bad = runs.filter(r => !r.launched || r.bad.length || !r.end || r.end.y < 25 || r.end.vy < 0);
    const nz = Math.max(...runs.map(r => r.nz)), sink = Math.min(...runs.map(r => r.minAgl)), roll = Math.max(...runs.map(r => r.maxRoll));
    check(`${kind} dt ${dt < 0.02 ? "1/60" : dt < 0.05 ? "1/30" : "0.1 "} SS${ss}: the shot and the climb-out`, !bad.length && nz < 7.5,
      `${runs.length - bad.length}/${runs.length} away${bad.length ? ' [' + bad.map(r => r.bad.join(',') || (r.launched ? 'y ' + (r.end ? r.end.y.toFixed(0) : '?') : 'no shot')).join('; ') + ']' : ''}, nz max ${nz.toFixed(1)} g, lowest ${sink.toFixed(1)} m above the sea, bank <= ${deg(roll).toFixed(1)} deg`,
      'no overstress / crash, < 7.5 g, climbing past 25 m');
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
