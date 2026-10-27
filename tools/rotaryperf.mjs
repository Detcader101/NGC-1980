#!/usr/bin/env node
// rotaryperf.mjs - CPU cost of the AI rotorcraft flight models + pilots, per aircraft per simulated second (node, one
// core). A busy war has ~3 CH-46, ~2 MV-22 and up to ~12 WASPs aloft.        node tools/rotaryperf.mjs
import { ROT, DT } from './rotarykit.mjs';
const { createCH46Sim, CH46 } = await import(ROT + 'ch46fm.js');
const { createMV22Sim, MV22 } = await import(ROT + 'mv22fm.js');
const { createWaspSim } = await import(ROT + 'waspfm.js');
const { createPilot, stateOf } = await import(ROT + 'pilot.js');
const { createTiltPilot } = await import(ROT + 'tiltpilot.js');
const { WASP_PILOT, waspTiltLimit } = await import(ROT + 'waspai.js');
const env = { groundY: () => -500, water: () => false };
function cost(name, mk, step, secs = 60) {
  const S = mk(), st = {}; let t0 = performance.now();
  for (let t = 0; t < secs; t += DT) step(S, st);
  const ms = (performance.now() - t0) / secs;
  console.log(`${name.padEnd(8)} ${ms.toFixed(2)} ms of CPU per simulated second  (${(ms / 60 * 1000).toFixed(0)} us per 60 fps frame)`);
  return ms;
}
const a = cost('CH-46', () => { const S = createCH46Sim(); S.reset([0, 300, 0], 0, false); S.P = createPilot(CH46.PILOT); return S; }, (S, st) => { stateOf(S.body, st); const c = S.P.step(st, DT, { vx: 0, vz: -30, vy: 0, hdg: 0 }); S.step(DT, c, env); });
const b = cost('MV-22', () => { const S = createMV22Sim(); S.reset([0, 300, 0], 0, false, null, 80); S.P = createTiltPilot(MV22.PILOT, S); return S; }, (S, st) => { stateOf(S.body, st); const c = S.P.step(st, DT, { vx: 0, vz: -40, vy: 0, hdg: 0, agl: 300 }); S.step(DT, c, env); });
const c = cost('WASP', () => { const S = createWaspSim(); S.reset([0, 300, 0], 0, false); S.power = 150e3; S.P = createPilot(WASP_PILOT); return S; }, (S, st) => { stateOf(S.body, st); const cmd = { vx: 0, vz: -25, vy: 0, hdg: 0 }; cmd.tilt = waspTiltLimit(S, st, cmd); const k = S.P.step(st, DT, cmd); S.step(DT, { thr: k.coll, pitch: k.lon, roll: k.lat, yaw: k.ped }, env); });
const war = 3 * a + 2 * b + 12 * c;
console.log(`\na busy war (3 CH-46, 2 MV-22, 12 WASP): ${war.toFixed(1)} ms per second = ${(war / 60).toFixed(2)} ms per 60 fps frame`);
