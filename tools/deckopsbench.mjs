#!/usr/bin/env node
// deckopsbench.mjs - (ngc/bugsweep) DECK OPS on the ALBATROSS (game/js/units/naval/deckops.js): the launch queue and the
// taxi simulation, with the real airframes (F-14A TOMCAT, F/A-18A HORNET) on the game's live deck (buildAlbatross's
// localDeck, seamotion heave / pitch / roll, the carrier steaming and turning), stepped the way the war steps them.
// Checks: queue order (first come, first launched; the commander's bump goes next), no two aircraft on the same cat or
// taxi segment and no two jets closer than their footprints, the launch rate in game time, a fouled deck (a helicopter
// on the lane) and a recovery hold the queue, nothing moves into the landing area while one wants to land, and every
// jet is airborne, alive and climbing.   node tools/deckopsbench.mjs [--v]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const ctx2 = new Proxy({}, { get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : /Gradient|Pattern/.test(k) ? () => ({ addColorStop() {} }) : /ImageData/.test(k) ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}, set: (t, k, v) => (t[k] = v, true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2 }) };
const { buildAlbatross } = await import('../game/js/units/naval/albatross.js');
const { SHIPS, makeSea, createShipMotion, shipPointY, shipPointVY } = await import('../game/js/units/naval/seamotion.js');
const { createTomcatSim } = await import('../game/js/units/air/tomcatfm.js');
const { createJetSim } = await import('../game/js/jetfm.js');
const { createDeckOps, DECK_OPS: O } = await import('../game/js/units/naval/deckops.js');
const V = process.argv.includes('--v');
const parts = buildAlbatross(1, {});
let pass = 0, fail = 0;
const check = (name, ok, got, want) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${got}   (want ${want})`); };

function makeShip(ss, seed) {
  const mo = createShipMotion(SHIPS.albatross, makeSea(ss, -1.2, 11 + seed), 31 + seed * 7);
  const u = { p: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, yaw: 0.7, w: 0, sp: 6, t: 0, att: { heave: 0, pitch: 0, roll: 0, vHeave: 0, vPitch: 0, vRoll: 0 }, DECK: 8 };
  const toLocal = (x, z) => { const dx = x - u.p.x, dz = z - u.p.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  u.toLocal = toLocal;
  u.sail = dt => { u.t += dt; const wT = Math.sin(u.t / 40) * 0.05; u.w += Math.max(-0.015 * dt, Math.min(0.015 * dt, wT - u.w)); u.v.x = -Math.sin(u.yaw) * u.sp; u.v.z = -Math.cos(u.yaw) * u.sp; u.p.x += u.v.x * dt; u.p.z += u.v.z * dt; u.yaw += u.w * dt; Object.assign(u.att, mo.step(dt, u.sp, u.yaw, u.w)); };
  for (let t = 0; t < 30; t += 0.05) mo.step(0.05, u.sp, u.yaw, 0);
  const deckY = (x, z) => { const [lx, lz] = toLocal(x, z); const h = parts.localDeck(lx, lz); if (h < -1e8) return -1e9; const a = u.att; return shipPointY(0, a.heave, a.pitch, a.roll, lx, h, lz); };
  const env = {
    groundY: (x, z) => Math.max(0, deckY(x, z)), water: (x, z) => !(deckY(x, z) > -1e8), mods: null,
    surfVel: (x, z) => { const [lx, lz] = toLocal(x, z); if (Math.abs(lx) > 14 || Math.abs(lz) > 64) return null; const a = u.att, h = Math.max(0, parts.localDeck(lx, lz)); return { vx: u.v.x, vz: u.v.z, w: u.w, cx: u.p.x, cz: u.p.z, vy: shipPointVY(a.vHeave, a.pitch, a.roll, a.vPitch, a.vRoll, lx, h, lz) }; },
    carrier: () => ({ x: u.p.x, z: u.p.z, yaw: u.yaw, deck: u.DECK, vx: u.v.x, vz: u.v.z, speed: u.sp, w: u.w, att: u.att, deckAt: (x, z) => { const [lx, lz] = toLocal(x, z), a = u.att; return shipPointY(0, a.heave, a.pitch, a.roll, lx, u.DECK, lz); } }),
  };
  return { u, env };
}

// one deck cycle: requests at the given times, optional foul / landing windows; returns the record
function run({ dt = 0.1, jets, foul = null, landing = null, bumpAt = null, T = 420, seed = 1 }) {
  const { u, env } = makeShip(4, seed);
  let t = 0;
  const DO = createDeckOps({ now: () => t });
  const rec = { launches: [], conflicts: [], minSep: 99, crashed: [], movedInFoul: 0, movedInLanding: 0, deckClearBad: 0, maxSlot: {} };
  const J = jets.map((j, i) => ({ ...j, i, A: j.kind === 'tomcat' ? createTomcatSim(9) : createJetSim(9), e: null, up: null }));
  for (const j of J) { j.A.reset(0, 0, 0, u.yaw, { running: true }); if (j.kind === 'tomcat') j.A.sweep = 20; }
  for (; t < T; t += dt) {
    u.sail(dt);
    for (const j of J) if (!j.e && !j.up && t >= j.at) {
      j.e = DO.request({ name: j.name, A: j.A, kind: j.kind, player: !!j.player, attach: () => j.A.attachCat(env), onAirborne: () => { j.up = t; rec.launches.push({ name: j.name, t }); } });
    }
    if (bumpAt && t >= bumpAt.t && !bumpAt.done) { bumpAt.done = true; const j = J.find(j => j.name === bumpAt.name); DO.bump(j.e); }
    const fouled = foul && t >= foul.t0 && t < foul.t1, land = landing && t >= landing.t0 && t < landing.t1;
    const before = DO.entries.map(e => [e, e.state]);
    DO.update(dt, { ship: true, obstacles: fouled ? [{ lx: 4.5, lz: 16, r: 7.5, why: 'HELICOPTER ON THE LANE' }] : [], landing: land });
    for (const [e, s] of before) if (DO.entries.includes(e) && s === 'spot' && e.state === 'taxi') { if (fouled) rec.movedInFoul++; if (land) rec.movedInLanding++; }
    if (DO.deckClear() === '' && DO.entries.some(e => ['taxi', 'hold'].includes(e.state))) rec.deckClearBad++;
    // one per segment
    for (const st of ['taxi', 'hold', 'oncat', 'tension', 'shot']) { const n = DO.entries.filter(e => e.state === st).length; rec.maxSlot[st] = Math.max(rec.maxSlot[st] || 0, n); }
    if (DO.entries.filter(e => ['oncat', 'tension', 'shot'].includes(e.state)).length > 1) rec.conflicts.push(t);
    // the jets: on the deck (tow / cat) or flying hands off after the shot
    for (const j of J) {
      if (j.gone) continue;
      const onCat = !!j.A.cat, thr = onCat ? (j.kind === 'tomcat' ? 0.86 : 0.8) : j.up !== null ? (j.kind === 'tomcat' ? 0.86 : 0.8) : 0.1;
      if ((j.e && j.e.state !== "hangar") || j.up !== null) { const ev = j.A.step(dt, { pitch: 0, roll: 0, yaw: 0, brakeL: 0, brakeR: 0, throttle: [thr, thr] }, env); if (j.A.dead && !j.crashed) { j.crashed = j.A.dead; rec.crashed.push(`${j.name} ${j.A.dead} (${j.e ? j.e.state : 'air'})`); } void ev; }
      if (j.up !== null && t - j.up > 8) { j.gone = true; j.final = { y: j.A.pos.y, vy: j.A.vel.y }; }
    }
    // footprints: every pair of jets on the deck
    const on = J.filter(j => j.e && DO.entries.includes(j.e) && j.e.state !== 'hangar').map(j => u.toLocal(j.A.pos.x, j.A.pos.z));
    const onJ = J.filter(j => j.e && DO.entries.includes(j.e) && j.e.state !== "hangar");
    for (let a = 0; a < on.length; a++) for (let b = a + 1; b < on.length; b++) { const d = Math.hypot(on[a][0] - on[b][0], on[a][1] - on[b][1]); if (d < rec.minSep) { rec.minSep = d; rec.minAt = `${t.toFixed(1)} ${onJ[a].name}:${onJ[a].e.state} ${onJ[b].name}:${onJ[b].e.state} ${on[a].map(v=>v.toFixed(1))} ${on[b].map(v=>v.toFixed(1))}`; } }
    if (V && Math.round(t * 10) % 50 === 0) console.log(`  ${t.toFixed(0).padStart(4)} ${DO.entries.map(e => e.name + ':' + e.state).join(' ')}  ${DO.why}`);
    if (J.every(j => j.gone)) break;
  }
  rec.J = J; rec.DO = DO; rec.t = t;
  return rec;
}

const five = [{ name: 'VICTORY 201', kind: 'tomcat', at: 0 }, { name: 'VICTORY 202', kind: 'tomcat', at: 1 }, { name: 'RAIDER 301', kind: 'hornet', at: 2 }, { name: 'VICTORY 203', kind: 'tomcat', at: 3 }, { name: 'HORNET (YOU)', kind: 'hornet', at: 4 }];
for (const dt of [1 / 30, 0.1]) {
  const tag = dt < 0.05 ? '1/30' : '0.1 ';
  console.log(`--- five jets asked for within 4 s, frame ${tag} ---`);
  const r = run({ dt, jets: five });
  const order = r.launches.map(l => l.name).join(' > ');
  check(`dt ${tag}: all five launched, in the order they asked`, r.launches.length === 5 && order === five.map(j => j.name).join(' > '), order, 'first come, first launched');
  const gaps = r.launches.slice(1).map((l, i) => l.t - r.launches[i].t);
  check(`dt ${tag}: one at a time off cat 1, the cat reset between`, !r.conflicts.length && Math.min(...gaps) >= O.CAT_GAP && Object.values(r.maxSlot).every(n => n <= 1), `gaps ${gaps.map(g => g.toFixed(0)).join(' / ')} s, most per segment ${JSON.stringify(r.maxSlot)}`, `>= ${O.CAT_GAP} s, one per segment`);
  check(`dt ${tag}: launch rate (game time)`, r.launches[4] && r.launches[4].t < 200 && gaps.every(g => g < 45), `5 off in ${r.launches[4] ? r.launches[4].t.toFixed(0) : '-'} s, ${(r.launches.length / ((r.launches[4] || { t: 1 }).t / 60)).toFixed(1)} a minute`, 'under 200 s, < 45 s apart');
  check(`dt ${tag}: no two jets inside each other's footprint`, r.minSep > 2 * O.JET_R - 1, `closest ${r.minSep.toFixed(1)} m ${r.minSep < 10 ? r.minAt : ""}`, `> ${2 * O.JET_R - 1.5} m`);
  const fin = r.J.map(j => j.final), ok = !r.crashed.length && fin.every(f => f && f.y > 25 && f.vy > 0);
  check(`dt ${tag}: every jet airborne, alive and climbing 8 s after its shot`, ok, r.crashed.length ? r.crashed.join('; ') : fin.map(f => f ? f.y.toFixed(0) + ' m' : '-').join(', '), 'no crash, > 25 m');
}
{
  console.log('--- a fouled deck: a helicopter on the lane from 10 s to 70 s ---');
  const r = run({ jets: five.slice(0, 3), foul: { t0: 10, t1: 70 } });
  const first = r.launches[0], second = r.launches[1];
  check('nothing taxis past the helicopter; the queue resumes when it lifts', r.movedInFoul === 0 && second && second.t > 70 && r.launches.length === 3, `${r.movedInFoul} moves while fouled, launches at ${r.launches.map(l => l.t.toFixed(0)).join(', ')} s`, 'none moved, 2nd after 70 s');
  void first;
}
{
  console.log('--- a recovery: an aircraft in the pattern from 15 s to 75 s ---');
  const r = run({ jets: five.slice(0, 3), landing: { t0: 15, t1: 75 } });
  check('no jet moves into the landing area while one wants to land', r.movedInLanding === 0 && r.launches.length === 3, `${r.movedInLanding} moves, launches at ${r.launches.map(l => l.t.toFixed(0)).join(', ')} s`, 'none, all three launched after');
  check('deckClear() is false while a jet is on the lane or at the hold-short line', r.deckClearBad === 0, `${r.deckClearBad} frames wrong`, '0');
}
{
  console.log('--- the commander bumps the last jet (5 again: priority) ---');
  const r = run({ jets: five, bumpAt: { t: 6, name: 'HORNET (YOU)' } });
  const order = r.launches.map(l => l.name);
  check('the bumped jet goes next, the rest keep their order', order[1] === 'HORNET (YOU)' && order.filter(n => n !== 'HORNET (YOU)').join() === five.map(j => j.name).filter(n => n !== 'HORNET (YOU)').join() && !r.crashed.length, order.join(' > '), 'VICTORY 201 (already on the cat) > HORNET (YOU) > the rest');
}
{
  console.log('--- three AI Tomcats, then the player asks (every spot taken: the last AI one goes back down) ---');
  const r = run({ jets: [...five.slice(0, 2), five[3], { name: 'HORNET (YOU)', kind: 'hornet', at: 4, player: true }] });
  const order = r.launches.map(l => l.name);
  check('the player is spotted at once and goes after the jet ahead on the deck', order.join() === ['VICTORY 201', 'HORNET (YOU)', 'VICTORY 202', 'VICTORY 203'].join() && !r.crashed.length && r.minSep > 2 * O.JET_R - 1.5, order.join(' > ') + `, closest ${r.minSep.toFixed(1)} m`, '201 > YOU > 202 > 203, no crash');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
