#!/usr/bin/env node
// waspbench.mjs - the RW-3 WASP ducted-fan drone (game/js/units/air/rotary/waspfm.js) against ducted-fan theory and the
// published wind-tunnel behaviour of shrouded fans (it is a fictional machine: these are physics checks, not a type
// certificate). Hover power vs momentum theory with wake expansion, the duct's share of the thrust, climb and descent,
// edgewise momentum drag and the nose-up lip moment the vanes must trim, open-loop instability, control signs, top
// speed, landing.       node tools/waspbench.mjs [--v]
import { ROT, DT, deg, KT, clamp, sea, land, table, run } from './rotarykit.mjs';
const { createWaspSim, WASP } = await import(ROT + 'waspfm.js');
const { createPilot, stateOf } = await import(ROT + 'pilot.js');
const T = table(), V = process.argv.includes('--v'), G = 9.81, W = WASP.MASS * G, A = Math.PI * WASP.R_FAN ** 2;
const PIL = (await import(ROT + 'waspai.js')).WASP_PILOT;
const mk = (o = {}) => { const S = createWaspSim(); S.reset([0, o.alt ?? 200, 0], 0, false); S.body.vel[2] = -(o.speed ?? 0); S.power = 0.55 * WASP.P_MAX; const P = createPilot(PIL); P.reset(0.55); return { S, P, st: {} }; };
const fly = (A_, c) => { stateOf(A_.S.body, A_.st); const k = A_.P.step(A_.st, DT, c); return { thr: k.coll, pitch: k.lon, roll: k.lat, yaw: k.ped }; };
const keys = A_ => ({ thr: () => A_.S.c.thr ?? A_.S.thrCmd, P: () => A_.S.power, T: () => A_.S.thrust, pitch: () => deg(A_.st.pitch), roll: () => deg(A_.st.roll), vy: () => A_.st.vy, vf: () => A_.st.vf, md: () => A_.S.momDrag, lip: () => A_.S.lipM, pc: () => A_.P.ctl.lon });
const trim = (A_, Vf, secs = 25, cmd = {}) => run(A_.S, secs, () => fly(A_, { vx: 0, vz: -Vf, vy: 0, hdg: 0, ...cmd }), sea(), keys(A_), 5);

console.log('--- hover: momentum theory for a shrouded fan ---');
{
  const A_ = mk(), h = trim(A_, 0);
  const Pid = W ** 1.5 / Math.sqrt(4 * WASP.SIGMA * 1.225 * A), Popen = W ** 1.5 / Math.sqrt(2 * 1.225 * A), FM = Pid / h.P;
  T.check('hover power vs ideal (wake expanded to the exit)', FM > 0.7 && FM < 0.85, `${(h.P / 1000).toFixed(0)} kW, figure of merit ${FM.toFixed(2)}`, '0.7-0.85 (shrouded fans)', 'Leishman ch. 15 / Pereira 2008');
  T.check('the shroud saves power over an open rotor of the same disc', h.P < Popen / 0.7, `${(h.P / 1000).toFixed(0)} kW vs ~${(Popen / 0.7 / 1000).toFixed(0)} kW open (FM 0.7)`, `ratio sqrt(2 sigma) = ${Math.sqrt(2 * WASP.SIGMA).toFixed(2)}`, 'theory');
  const B = createWaspSim(), fl = B.flowFor(h.P, 1.225, 0), Tfan = 0.5 * 1.225 * (fl.u / WASP.SIGMA) ** 2 * A;   // fan thrust = its pressure jump x disc
  T.check('duct lip share of the thrust (from the fan pressure jump)', Math.abs(1 - Tfan / fl.T - (1 - 1 / (2 * WASP.SIGMA))) < 0.02, `${(100 * (1 - Tfan / fl.T)).toFixed(0)}% (sigma ${WASP.SIGMA})`, '1 - 1/(2 sigma) = 55%; ~50% at sigma 1 in tests', 'Pereira 2008');
  T.check('hover at a sensible power fraction', h.P / WASP.P_MAX > 0.35 && h.P / WASP.P_MAX < 0.75, `${(100 * h.P / WASP.P_MAX).toFixed(0)}% of ${WASP.P_MAX / 1000} kW`, 'thrust margin for manoeuvre');
}

console.log('--- edgewise flight ---');
{
  const rows = [];
  for (const v of [0, 10, 20, 30, 40]) { const A_ = mk({ speed: v }), r = trim(A_, v, 25); r.v = v; rows.push(r); }
  if (V) for (const r of rows) console.log(`   ${r.v} m/s  pitch ${r.pitch.toFixed(1)}  vane ${r.pc.toFixed(2)}  mom drag ${r.md.toFixed(0)} N  lip ${r.lip.toFixed(0)} N m  P ${(r.P / 1000).toFixed(0)} kW`);
  const r20 = rows[2], r40 = rows[4];
  T.check('momentum drag grows with edgewise speed', r20.md > 300 && r40.md > 1.6 * r20.md, `${r20.md.toFixed(0)} N at 20 m/s, ${r40.md.toFixed(0)} N at 40 m/s`, 'mass flow x speed', 'Fleming 2003 (qualitative)');
  T.check('nose-up lip moment: the vanes trim nose-down', r20.lip > 0 && r20.pc < rows[0].pc && r40.pc < r20.pc, `vane ${rows[0].pc.toFixed(2)} -> ${r20.pc.toFixed(2)} -> ${r40.pc.toFixed(2)} (+ = nose up)`, 'more nose-down vane with speed', 'Fleming 2003 / Abrego & Bulaga 2002');
  T.check('holds 40 m/s level', Math.abs(r40.vf - 40) < 1.5 && Math.abs(r40.vy) < 0.5, `${r40.vf.toFixed(1)} m/s at ${r40.pitch.toFixed(0)} deg pitch, ${(r40.P / 1000).toFixed(0)} kW`);
}

console.log('--- stability and control ---');
{
  const A_ = mk({ speed: 10 }); trim(A_, 10, 10); A_.S.sas = false; const c = { thr: A_.S.thrCmd, pitch: 0, roll: 0, yaw: 0 }; let maxP = 0;
  run(A_.S, 3, () => c, sea(), {}, 0, () => { maxP = Math.max(maxP, Math.abs(stateOf(A_.S.body, {}).pitch)); });
  T.check('open loop (stabiliser off, hands off): pitches away', maxP > 0.25, `${deg(maxP).toFixed(0)} deg within 3 s at 10 m/s`, 'ducted fans are unstable without feedback', 'CONFIRMED qualitative');
  const resp = mod => { const B = mk(); trim(B, 0, 15); const k = { thr: B.S.thrCmd, pitch: 0, roll: 0, yaw: 0 }; mod(k); run(B.S, 0.6, () => k, sea()); return stateOf(B.S.body, {}); };
  T.check('pitch vane +: nose up', resp(k => k.pitch = 0.4).q > 0.05, '');
  T.check('roll vane +: roll right', resp(k => k.roll = 0.4).p > 0.05, '');
  T.check('fan torque split +: yaw right', resp(k => k.yaw = 0.5).r > 0.05, '');
  // top speed at full power, tilt limited by the pilot (0.6 rad)
  const B = mk({ speed: 40 }); let thr = 1;
  const r = run(B.S, 30, () => { const k = fly(B, { vx: 0, vz: -80, vy: 0, hdg: 0 }); return k; }, sea(), keys(B), 5);
  T.check('top speed (full power, 35 deg tilt limit)', r.vf > 45 && r.vf < 75, `${r.vf.toFixed(0)} m/s = ${(r.vf * KT).toFixed(0)} kt at ${r.pitch.toFixed(0)} deg`, '~50-70 m/s (INFERRED for this machine)');
}

console.log('--- landing ---');
{
  const A_ = mk({ alt: 15 }); const env = land(); let td = null;
  run(A_.S, 25, (t) => fly(A_, { vx: 0, vz: 0, vy: -clamp(0.3 + A_.S.agl * 0.3, 0.3, 2), hdg: 0 }), env, {}, 0, (t, e) => { if (e && !td) td = { e, t, vy: A_.S.body.maxSink }; });
  T.check('lands on its three feet', td && td.e === 'land' && td.vy < 1.5, td ? `${td.e} at ${td.t.toFixed(1)} s, ${td.vy.toFixed(2)} m/s` : 'no touchdown');
}
T.done();
