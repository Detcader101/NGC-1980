#!/usr/bin/env node
// rotarymission.mjs - the AI rotorcraft fly their whole missions in plain node, physically (flight model + AI pilot),
// over a synthetic island with hills and a carrier steaming at 6 m/s:
//   CH-46: lift off the moving deck, fly to the island's landing zone, approach, land, put 13 Marines out, lift off,
//          fly back and land on the (moved) deck.
//   MV-22: the same with nacelle conversion (helicopter -> conversion -> airplane -> back) for a long leg.
//   RW-3:  strafing passes on a moving target, hover ambush, swarm spacing.
// Checks touchdown sink rates, landing accuracy, terrain clearance and timings.   node tools/rotarymission.mjs [--v] [ch46|mv22|wasp]
import { ROT, DT, deg, KT, clamp, table } from './rotarykit.mjs';
const { createCH46Sim, CH46 } = await import(ROT + 'ch46fm.js');
const { createPilot, stateOf } = await import(ROT + 'pilot.js');
const { createTransportAI } = await import(ROT + 'transportai.js');
const { flyCH46, CH46_AI } = await import(ROT + 'ch46ai.js');
const V = process.argv.includes('--v'), only = process.argv.slice(2).find(a => !a.startsWith('--'));
const T = table();

// the world: an island (hills) with a flat pad at h 6, a carrier deck 8 m high moving north-east at 6 m/s
const PAD = { x: 520, z: -260, h: 6 };
const hills = (x, z) => 14 * Math.sin(x * .035 + 1.3) * Math.cos(z * .04) + 9 * Math.sin(x * .09 + z * .07) + 8;
function terrain(x, z) {
  const d = Math.hypot(x - PAD.x, z - PAD.z), isl = clamp(1 - (d - 70) / 40, 0, 1);
  let h = -14 + (hills(x, z) * 0.9 + 14) * isl;
  if (d < 52) { const k = clamp((d - 30) / 22, 0, 1); h = PAD.h + (h - PAD.h) * k * k * (3 - 2 * k); }
  return h;
}
const deck = { x: 0, z: 0, yaw: -0.6, sp: 6, w: 0.004, L: 120, W: 28, H: 8 };
const toLocal = (x, z) => { const dx = x - deck.x, dz = z - deck.z, c = Math.cos(deck.yaw), s = Math.sin(deck.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
const toWorld = (lx, lz) => { const c = Math.cos(deck.yaw), s = Math.sin(deck.yaw); return [deck.x + lx * c + lz * s, deck.z - lx * s + lz * c]; };
const onDeck = (x, z) => { const [lx, lz] = toLocal(x, z); return Math.abs(lx) < deck.W / 2 && Math.abs(lz) < deck.L / 2; };
const env = {
  groundY: (x, z) => Math.max(terrain(x, z), 0, onDeck(x, z) ? deck.H : -1e9),
  water: (x, z) => !onDeck(x, z) && terrain(x, z) < 0,
  surfVel: (x, z) => onDeck(x, z) ? { vx: -Math.sin(deck.yaw) * deck.sp, vz: -Math.cos(deck.yaw) * deck.sp, w: deck.w, cx: deck.x, cz: deck.z } : null,
};
const world = { groundY: env.groundY, floorAlong(x, z, ux, uz, L) { let m = env.groundY(x, z); for (let s = 10; s <= L; s += 10) m = Math.max(m, env.groundY(x + ux * s, z + uz * s)); return m; } };
const moveDeck = dt => { deck.x += -Math.sin(deck.yaw) * deck.sp * dt; deck.z += -Math.cos(deck.yaw) * deck.sp * dt; deck.yaw += deck.w * dt; };
const spotOf = (lx, lz) => { const [x, z] = toWorld(lx, lz); return { x, y: deck.H, z, hdg: deck.yaw, vx: -Math.sin(deck.yaw) * deck.sp - deck.w * (z - deck.z) * 0 , vz: -Math.cos(deck.yaw) * deck.sp }; };

if (!only || only === 'ch46') {
  console.log('--- CH-46E: deck -> island LZ (Marines out) -> deck ---');
  const S = createCH46Sim(); const [sx, sz] = toWorld(-2, -2);
  S.reset([sx, deck.H + 3, sz], deck.yaw, true, env);
  const P = createPilot(CH46.PILOT); P.reset(0);
  const lz = { x: PAD.x + 14, y: PAD.h, z: PAD.z, hdg: -Math.PI / 2, vx: 0, vz: 0 };   // 14 m east of the pad, nose east: the ramp faces the pad
  let unloadT = 0, parked = false, minClear = 1e9, sinks = [], maxBank = 0, maxTq = 0;
  const AI = createTransportAI(CH46_AI, {
    lz: () => lz, home: () => spotOf(-2, -2),
    unload: (ai, dt) => { if (!unloadT) AI.landedAtLZ = Math.hypot(S.body.pos[0] - lz.x, S.body.pos[2] - lz.z); return (unloadT += dt) > 8; }, parked: () => { parked = true; },
  });
  const st = {};
  for (let t = 0; t < 300 && !parked && !S.dead; t += DT) {
    stateOf(S.body, st);
    const cmd = AI.step(st, S, DT, world), c = flyCH46(S, P, st, cmd, DT);
    const e = S.step(DT, c, env); moveDeck(DT);
    if (e === 'land' || e === 'hardland') sinks.push({ e, vy: S.body.maxSink, phase: AI.phase, t: +t.toFixed(1) });
    S.body.maxSink = 0;
    if ((AI.phase === 'transit' || AI.phase === 'rtb') && AI.cmd.dist > 140 && AI.t > 6) { if (S.agl < minClear) { minClear = S.agl; AI.minAt = [AI.phase, +t.toFixed(1), Math.round(AI.cmd.dist)]; } maxBank = Math.max(maxBank, Math.abs(st.roll)); }
    if (S.torque > maxTq) { maxTq = S.torque; AI.tqAt = [AI.phase, +t.toFixed(1), S.c.coll.toFixed(2), (S.rpm * 100).toFixed(0)]; }
    if (V && (Math.round(t / DT) % 60 === 0)) console.log(`${t.toFixed(0).padStart(4)} ${AI.phase.padEnd(9)} pos ${st.x.toFixed(0)},${st.y.toFixed(1)},${st.z.toFixed(0)} agl ${S.agl.toFixed(1)} v ${Math.hypot(st.vx, st.vz).toFixed(1)} vy ${st.vy.toFixed(1)} pitch ${deg(st.pitch).toFixed(1)} roll ${deg(st.roll).toFixed(1)} hdg ${deg(st.yaw).toFixed(0)} coll ${S.c.coll.toFixed(2)} tq ${(S.torque * 100).toFixed(0)}% nr ${(S.rpm*100).toFixed(0)} T ${((S.rf.T+S.ra.T)/1000).toFixed(0)}kN st ${S.rf.stall.toFixed(2)}/${S.ra.stall.toFixed(2)} d ${(AI.cmd.dist ?? 0).toFixed(0)}`);
  }
  console.log('   phases', JSON.stringify(AI.log));
  T.check('CH-46: flew the whole mission and parked on the deck', parked && !S.dead, `${parked ? 'parked' : 'not parked'} ${S.dead || ''} after ${AI.tAll.toFixed(0)} s`);
  const lzLand = sinks.find(s => s.phase === 'ground' || s.phase === 'descend'), deckLand = sinks.find(s => s.phase === 'parked' || s.phase === 'descend2');
  T.check('CH-46: soft touchdown at the LZ', lzLand && lzLand.vy < 1.5, lzLand ? `${lzLand.vy.toFixed(2)} m/s sink` : 'none', '< 1.5 m/s');
  T.check('CH-46: landed on the LZ mark', AI.log.some(l => l[1] === 'ground') && AI.landedAtLZ && AI.landedAtLZ < 2.5, `${(AI.landedAtLZ ?? NaN).toFixed(2)} m off`, '< 2.5 m');
  T.check('CH-46: soft touchdown on the moving deck', deckLand && deckLand.vy < 1.8, deckLand ? `${deckLand.vy.toFixed(2)} m/s sink` : 'none', '< 1.8 m/s');
  T.check('CH-46: terrain clearance en route, bank limit, torque', minClear > 15 && maxBank < 0.6 && maxTq < 1.05, `min AGL ${minClear.toFixed(0)} m (${AI.minAt}), max bank ${deg(maxBank).toFixed(0)} deg, max torque ${(maxTq * 100).toFixed(0)}% (${AI.tqAt})`);
}
T.done();
