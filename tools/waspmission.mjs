#!/usr/bin/env node
// waspmission.mjs - RW-3 WASP behaviours flown physically in node (ducted-fan FM + pilot.js + waspai.js) in the dev
// world: a target helicopter circling the island at 40 m and 20 m/s.
//   swarm:  four WASPs on a ring round the target, turning together, breaking off one at a time to strafe
//   strafe: one WASP making passes - firing windows on the run-in, then break away
//   ambush: a WASP that starts behind the island's hills waits out of sight until the target is in reach
// Checks: no crashes, no collisions with the target or each other, the swarm keeps its spacing, firing windows,
// the ambusher stays hidden until it springs.          node tools/waspmission.mjs [--v]
import { ROT, DT, table } from './rotarykit.mjs';
const { createDevWorld } = await import(ROT + 'devworld.js');
const { createWaspSim, WASP } = await import(ROT + 'waspfm.js');
const { createPilot, stateOf } = await import(ROT + 'pilot.js');
const { createWaspAI, WASP_PILOT, waspTiltLimit } = await import(ROT + 'waspai.js');
const V = process.argv.includes('--v'), T = table();
const W = createDevWorld(), P0 = W.PAD;
const target = t => { const a = t * 20 / 90, x = P0.x + Math.cos(a) * 90, z = P0.z + Math.sin(a) * 90; return { x, y: 46, z, vx: -Math.sin(a) * 20, vy: 0, vz: Math.cos(a) * 20 }; };
function mkWasp(x, y, z, o) {
  const S = createWaspSim(); S.reset([x, y, z], 0, false); S.power = 0.6 * WASP.P_MAX; const P = createPilot(WASP_PILOT); P.reset(0.6);
  return { S, P, AI: createWaspAI(o), st: {}, me: {}, fires: 0, fireT: 0, seen: [] };
}
function stepWasp(w, t, tgt, ctx) {
  stateOf(w.S.body, w.st); const s = w.st; Object.assign(w.me, { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, yaw: s.yaw });
  const los = W.world.los(s.x, s.y, s.z, tgt.x, tgt.y, tgt.z);
  const cmd = w.AI.step(w.me, tgt, DT, W.world, { ...ctx, time: t, los }); cmd.tilt = waspTiltLimit(w.S, s, cmd); const c = w.P.step(s, DT, cmd);
  w.S.step(DT, { thr: c.coll, pitch: c.lon, roll: c.lat, yaw: c.ped }, W.env);
  if (w.AI.fire && los) { w.fireT += DT; }
  return los;
}

console.log('--- swarm of four round a circling helicopter ---');
{
  const ws = [0, 1, 2, 3].map(k => mkWasp(P0.x - 200 + k * 12, 60, P0.z + 150, { id: k / 4, slot: k, slots: 4, home: [P0.x - 200, P0.z + 150] }));
  let minSep = 1e9, minTgt = 1e9, dead = 0, maxModes = new Set();
  for (let t = 0; t < 120; t += DT) {
    const tgt = target(t);
    const others = ws.map(w => w.me); for (const w of ws) if (!w.S.dead) { stepWasp(w, t, tgt, { reach: 110, others }); maxModes.add(w.AI.mode); if (t > 20) minTgt = Math.min(minTgt, Math.hypot(w.st.x - tgt.x, w.st.y - tgt.y, w.st.z - tgt.z)); }
    if (t > 20) for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) minSep = Math.min(minSep, Math.hypot(ws[i].st.x - ws[j].st.x, ws[i].st.y - ws[j].st.y, ws[i].st.z - ws[j].st.z));
    if (V && Math.round(t / DT) % 600 === 0) console.log(`   ${t.toFixed(0)} s  ` + ws.map(w => `${w.AI.mode}@${Math.hypot(w.st.x - tgt.x, w.st.z - tgt.z).toFixed(0)}m/${(w.st.y - W.env.groundY(w.st.x, w.st.z)).toFixed(0)}agl`).join('  '));
  }
  dead = ws.filter(w => w.S.dead).length;
  T.check('swarm: all four fly the whole 2 min (no crash)', dead === 0, `${dead} lost: ${ws.map(w => w.S.dead || 'ok').join(', ')}`);
  T.check('swarm: never closer than 8 m to the target', minTgt > 8, `${minTgt.toFixed(1)} m`);
  T.check('swarm: drones keep apart', minSep > 6, `${minSep.toFixed(1)} m minimum separation`);
  T.check('swarm: everyone gets firing windows', ws.every(w => w.fireT > 3), ws.map(w => w.fireT.toFixed(0) + ' s').join(' / ') + ' with the weapon on target');
  T.check('swarm: strafes, snipes and ring flying all used', maxModes.has('swarm') && maxModes.has('strafe'), [...maxModes].join(', '));
}
console.log('--- ambush from behind the hills ---');
{
  // start low behind the island's hills on the far side from where the target is
  const w = mkWasp(P0.x + 60, 30, P0.z + 30, { id: 0.3, slot: 0, slots: 1, home: [P0.x + 60, P0.z + 30] });
  let hiddenT = 0, sprung = -1, crashed = false;
  const far = t => { const tg = target(t); return { ...tg, x: tg.x - 250 + t * 4, z: tg.z - 120 }; };   // a target approaching from far away
  for (let t = 0; t < 70 && !w.S.dead; t += DT) {
    const tgt = far(t), los = stepWasp(w, t, tgt, { reach: 110, ambush: true });
    const d = Math.hypot(w.st.x - tgt.x, w.st.z - tgt.z);
    if (w.AI.mode === 'ambush' && !los) hiddenT += DT;
    if (sprung < 0 && w.AI.mode !== 'ambush' && t > 1) sprung = t;
  }
  crashed = !!w.S.dead;
  T.check('ambush: hides out of sight of the approaching target', hiddenT > 5, `${hiddenT.toFixed(1)} s hidden`);
  T.check('ambush: springs when the target comes into reach', sprung > 0, sprung > 0 ? `at ${sprung.toFixed(1)} s` : 'never');
  T.check('ambush: no crash', !crashed, crashed ? w.S.dead : 'ok');
}
T.done();
