#!/usr/bin/env node
// ch46bench.mjs - the CH-46E Sea Knight flight model (game/js/units/air/rotary/ch46fm.js) against published data, in
// plain node: control signs, hover and level-flight trims, the power curve, maximum speed, climb, hover ceilings in and
// out of ground effect, tandem rotor interference, single-engine flight, autorotation, pitch stability with the SAS
// off, ground handling and a moving deck.          node tools/ch46bench.mjs [--v]
import { ROT, DT, deg, rad, KT, FT, FPM, HP, clamp, isaRho, sea, land, table, run } from './rotarykit.mjs';
const { createCH46Sim, CH46 } = await import(ROT + 'ch46fm.js');
const { createPilot, stateOf } = await import(ROT + 'pilot.js');
const V = process.argv.includes('--v');
const T = table();
const MISSION = CH46.EMPTY + CH46.CREW + CH46.FUEL_KG + 13 * CH46.MARINE_KG;
// an aircraft at a given gross weight (payload adjusted), altitude and speed, flown by the AI pilot
function mk(o = {}) {
  const S = createCH46Sim(); S.reset([0, o.alt ?? 300, 0], 0, false); S.body.vel[2] = -(o.speed ?? 0);
  if (o.gw) S.payload = o.gw - (CH46.EMPTY + CH46.CREW + S.fuelKg);
  const P = createPilot(CH46.PILOT); P.reset(o.coll ?? 0.5);
  return { S, P, st: {} };
}
const avgKeys = (A) => ({ coll: () => A.S.c.coll, lon: () => A.S.c.lon, lat: () => A.S.c.lat, ped: () => A.S.c.ped, pitch: () => deg(A.st.pitch), roll: () => deg(A.st.roll),
  shp: () => (A.S.rf.power + A.S.ra.power) / HP, pf: () => A.S.rf.power / HP, pa: () => A.S.ra.power / HP, vy: () => A.S.body.vel[1], vf: () => A.st.vf, rpm: () => A.S.rpm, tq: () => A.S.torque, lct: () => deg(A.S.lct) });
function trim(A, Vf, env = sea(), secs = 40, cmd = {}, agl) {   // agl: hold this wheel height (in ground effect)
  return run(A.S, secs, () => { stateOf(A.S.body, A.st); return A.P.step(A.st, DT, { vx: 0, vz: -Vf, vy: agl === undefined ? 0 : clamp((agl - A.S.agl) * 0.8, -1, 1), hdg: 0, ...cmd }); }, env, avgKeys(A), 6);
}
// collective held by a power loop at `limit` (W) while the pilot holds speed: climb performance
function climb(A, Vf, limit, env = sea(), secs = 45) {
  let c = A.S.c.coll || 0.5;
  return run(A.S, secs, () => { stateOf(A.S.body, A.st); const k = A.P.step(A.st, DT, { vx: 0, vz: -Vf, vy: 0, hdg: 0, collFix: c }); c = clamp(c + (limit - A.S.rf.power - A.S.ra.power) / limit * 0.6 * DT, 0, 1); return k; }, env, avgKeys(A), 8);
}

console.log(`--- control signs (trimmed hover at ${MISSION.toFixed(0)} kg = ${(MISSION * 2.2046).toFixed(0)} lb, 0.3 input for 0.8 s, SAS off) ---`);
{
  const resp = (mod) => { const A = mk(); trim(A, 0, sea(), 25); const c = { ...A.P.ctl, sas: false }; mod(c); const s0 = { ...stateOf(A.S.body, {}) }; run(A.S, 0.8, () => c, sea()); return { s0, s1: stateOf(A.S.body, {}) }; };
  let r = resp(c => c.lon += 0.3); T.check('stick aft (DCP): nose up', r.s1.q > 0.02 && r.s1.pitch > r.s0.pitch, `q ${deg(r.s1.q).toFixed(1)} deg/s`);
  r = resp(c => c.lat += 0.3); T.check('stick right (lateral cyclic): roll right', r.s1.p > 0.03 && r.s1.roll > r.s0.roll, `p ${deg(r.s1.p).toFixed(1)} deg/s`);
  r = resp(c => c.ped += 0.3); T.check('right pedal (differential lateral cyclic): nose right', r.s1.r > 0.02, `r ${deg(r.s1.r).toFixed(1)} deg/s`);
  r = resp(c => c.coll += 0.08); T.check('collective up: climbs', r.s1.vy > 0.5, `vy ${r.s1.vy.toFixed(2)} m/s`);
}

console.log('--- hover and level flight (mission weight: 4 crew, 13 Marines, full fuel) ---');
const sweep = [];
{
  const H = trim(mk(), 0);
  T.check('hover OGE power within the transmission limit', H.shp > 1500 && H.shp < 2800, `${H.shp.toFixed(0)} shp (front ${H.pf.toFixed(0)} / aft ${H.pa.toFixed(0)}), ${(H.tq * 100).toFixed(0)}% xmsn torque`, '< 2,800 shp', 'INFERRED');
  T.check('hover attitude near level, wings level', Math.abs(H.pitch - 2.5) < 3 && Math.abs(H.roll) < 2, `pitch ${H.pitch.toFixed(1)} deg, roll ${H.roll.toFixed(1)} deg`, '~0..5 deg nose up', 'INFERRED');
  for (const kt of [0, 20, 40, 60, 80, 100, 120, 140]) { const r = trim(mk({ speed: kt / KT }), kt / KT); r.kt = kt; sweep.push(r); }
  console.log('   KIAS  coll%  DCP(lon)  pitch  LCT   shp   front / aft shp');
  for (const r of sweep) console.log(`   ${String(r.kt).padStart(4)}  ${(r.coll * 100).toFixed(0).padStart(4)}  ${r.lon.toFixed(2).padStart(6)}  ${r.pitch.toFixed(1).padStart(6)}  ${r.lct.toFixed(1).padStart(4)}  ${r.shp.toFixed(0).padStart(5)}   ${r.pf.toFixed(0)} / ${r.pa.toFixed(0)}`);
  const mi = sweep.reduce((b, r, i) => r.shp < sweep[b].shp ? i : b, 0);
  T.check('power bucket (minimum power speed)', sweep[mi].kt >= 60 && sweep[mi].kt <= 100, `${sweep[mi].shp.toFixed(0)} shp at ${sweep[mi].kt} kt`, '60-100 kt', 'INFERRED');
  const s60 = sweep.find(r => r.kt === 60), s120 = sweep.find(r => r.kt === 120);
  T.check('tandem: the aft rotor needs more power in forward flight', s60.pa > s60.pf * 1.05 && s120.pa > s120.pf, `60 kt ${s60.pf.toFixed(0)} / ${s60.pa.toFixed(0)}, 120 kt ${s120.pf.toFixed(0)} / ${s120.pa.toFixed(0)} shp`, 'aft > front (front-rotor wake)', 'CONFIRMED qualitative (Stepniewski & Keys, Harris)');
  T.check('fuselage near level in cruise (LCT at work)', Math.abs(s120.pitch) < 5, `${s120.pitch.toFixed(1)} deg at 120 kt, LCT ${s120.lct.toFixed(1)} deg`, '|pitch| < 5 deg');
}

console.log('--- performance (sea level ISA) ---');
{
  // maximum level speed at the transmission limit, max gross weight
  let vmax = 0;
  for (const kt of [130, 135, 140, 144, 148, 152, 156, 160]) {
    const A = mk({ speed: kt / KT, gw: CH46.MTOW }), r = trim(A, kt / KT, sea(), 35);
    if (V) console.log(`   ${kt} kt  ${r.shp.toFixed(0)} shp  coll ${(r.coll * 100).toFixed(0)}%  pitch ${r.pitch.toFixed(1)}  vf ${(r.vf * KT).toFixed(1)}`);
    if (r.shp <= CH46.XMSN / HP && Math.abs(r.vf * KT - kt) < 2) vmax = kt;
  }
  T.check('max level speed at the 2,800 shp limit, 24,300 lb', Math.abs(vmax - CH46.PUB.VMAX) <= 8, `${vmax} kt`, `${CH46.PUB.VMAX} kt (max speed SL)`, 'CONFIRMED');
  // climb at max gross at the best-rate speed, transmission-limited power
  const c = climb(mk({ speed: 75 / KT, gw: CH46.MTOW }), 75 / KT, CH46.XMSN);
  T.check('max rate of climb at 24,300 lb, 75 kt, 2,800 shp', Math.abs(c.vy * FPM - CH46.PUB.ROC) < 0.25 * CH46.PUB.ROC, `${(c.vy * FPM).toFixed(0)} fpm (${c.vy.toFixed(1)} m/s)`, `${CH46.PUB.ROC} fpm`, 'CONFIRMED (weight / speed INFERRED)');
  // hover ceilings: highest altitude where the hover needs no more than the power available (engines lapse, xmsn cap)
  const ceiling = (gw, wheels) => {
    let best = 0;
    for (let ft = 0; ft <= 14000; ft += 500) {
      const rho = isaRho(ft / FT), env = wheels === undefined ? sea(rho) : land(rho), A = mk({ gw, alt: wheels === undefined ? 300 : CH46.CG_H + wheels });
      const r = trim(A, 0, env, 25, {}, wheels);
      const avail = Math.min(CH46.XMSN, 2 * CH46.P_ENG * (rho / 1.225) ** 1.15);
      if (V) console.log(`   ${ft} ft ${wheels === undefined ? 'OGE' : 'IGE'}  need ${r.shp.toFixed(0)} shp, available ${(avail / HP).toFixed(0)}`);
      if (r.shp * HP <= avail && Math.abs(r.vy) < 0.3 && (wheels === undefined || Math.abs(A.S.agl - wheels) < 0.5)) best = ft; else break;
    }
    return best;
  };
  const oge = ceiling(CH46.MTOW), ige = ceiling(CH46.MTOW, 3.05);
  T.check('hover ceiling OGE, 24,300 lb', Math.abs(oge - CH46.PUB.HOGE) <= 1000, `${oge} ft`, `${CH46.PUB.HOGE} ft`, 'CONFIRMED (weight INFERRED)');
  T.check('hover ceiling IGE (10 ft wheel height), 24,300 lb', Math.abs(ige - CH46.PUB.HIGE) <= 1500 && ige > oge + 2000, `${ige} ft`, `${CH46.PUB.HIGE} ft`, 'CONFIRMED (weight, height INFERRED)');
}

console.log('--- engines out ---');
{
  // single engine at mission weight, 70 kt: level flight possible (the T58-GE-16 upgrade bought single-engine capability)
  const A = mk({ speed: 36 }); trim(A, 36, sea(), 20); A.S.eng[1].ok = false;
  const r = climb(A, 36, CH46.P_ENG, sea(), 40);
  T.check('one engine out at 70 kt, mission weight: holds height', r.vy > -0.3 && r.rpm > 0.95, `climb ${(r.vy * FPM).toFixed(0)} fpm at ${r.shp.toFixed(0)} shp, NR ${(r.rpm * 100).toFixed(0)}%`, '>= 0 fpm', 'INFERRED (CH-46E single-engine capability)');
  // both engines out at 80 kt: autorotation, collective holds 100% NR
  const B = mk({ speed: 41 }); trim(B, 41, sea(), 20); B.S.eng[0].ok = B.S.eng[1].ok = false;
  let c = 0.25;
  const a = run(B.S, 40, () => { stateOf(B.S.body, B.st); const k = B.P.step(B.st, DT, { vx: 0, vz: -41, hdg: 0, collFix: c }); c = clamp(c + (B.S.rpm - 1.0) * 1.2 * DT, 0, 1); return k; }, sea(), avgKeys(B), 8);
  T.check('autorotation at 80 kt, both engines out: rotor rpm held', a.rpm > 0.94 && a.rpm < 1.1, `NR ${(a.rpm * 100).toFixed(0)}%, descent ${(-a.vy * FPM).toFixed(0)} fpm, coll ${(a.coll * 100).toFixed(0)}%`, '94-110% NR', 'CONFIRMED limits');
  T.check('autorotation descent rate', -a.vy * FPM > 1500 && -a.vy * FPM < 3800, `${(-a.vy * FPM).toFixed(0)} fpm`, '~2,000-3,500 fpm', 'UNVERIFIED (tandems autorotate steeply)');
}

console.log('--- stability ---');
{
  // SAS off at 100 kt, hands fixed after a small pitch kick: the tandem fuselage diverges in pitch (no tail plane)
  const A = mk({ speed: 51 }); trim(A, 51, sea(), 25); const c = { ...A.P.ctl, sas: false }; A.S.body.w[1] = 0.03; let th0 = stateOf(A.S.body, {}).pitch, maxd = 0;
  run(A.S, 6, () => c, sea(), {}, 0, () => { maxd = Math.max(maxd, Math.abs(stateOf(A.S.body, {}).pitch - th0)); });
  const B = mk({ speed: 51 }); trim(B, 51, sea(), 25); const cb = { ...B.P.ctl, sas: true }; B.S.body.w[1] = 0.03; th0 = stateOf(B.S.body, {}).pitch; let maxs = 0;
  run(B.S, 6, () => cb, sea(), {}, 0, () => { maxs = Math.max(maxs, Math.abs(stateOf(B.S.body, {}).pitch - th0)); });
  T.check('SAS off at 100 kt: pitch diverges; SAS on: held', maxd > 2 * maxs && maxs < rad(6), `6 s after a 1.7 deg/s kick: ${deg(maxd).toFixed(1)} deg off vs ${deg(maxs).toFixed(1)} deg with SAS`, 'tandem needs its SAS', 'CONFIRMED qualitative');
}

console.log('--- ground ---');
{
  const S = createCH46Sim(); const env = land(); S.reset([3, 0, 4], 0.4, true, env); S.step(DT, { coll: 0 }, env); const p0 = [...S.body.pos];
  run(S, 12, () => ({ coll: 0 }), env);
  const drift = Math.hypot(S.body.pos[0] - p0[0], S.body.pos[2] - p0[2]);
  T.check('parked, rotors turning, collective down: holds still', S.landed && drift < 0.1, `drift ${drift.toFixed(3)} m, wheels ${S.body.contacts}`);
  T.check('stands on its wheels at the CG height', Math.abs(S.body.pos[1] - CH46.CG_H) < 0.15, `CG ${S.body.pos[1].toFixed(2)} m over the ground`, `${CH46.CG_H} m`);
  // lift off and hover at 3 m, then land
  const P = createPilot(CH46.PILOT); P.reset(0.2); const st = {}; let off = -1, td = null;
  run(S, 30, (t) => { stateOf(S.body, st); const vy = t < 12 ? clamp(3 - S.agl, -1, 1.5) : -0.6; return P.step(st, DT, { vx: 0, vz: 0, vy, hdg: 0.4 }); }, env, {}, 0, (t, e) => { if (off < 0 && S.agl > 0.5) off = t; if (t > 12 && e && !td) td = { e, t }; });
  T.check('lift-off, hover at 3 m, set down', off > 0 && td && td.e === 'land', `airborne at ${off.toFixed(1)} s, ${td ? td.e : 'no touchdown'}${td ? ' at ' + td.t.toFixed(1) + ' s' : ''}`);
  // on a moving, turning deck (the ALBATROSS at 6 m/s)
  const deck = { x: 0, z: 0, yaw: 0, sp: 6, w: 0.01 };
  const denv = { groundY: (x, z) => Math.hypot(x - deck.x, z - deck.z) < 50 ? 8 : -500, water: () => false, surfVel: () => ({ vx: -Math.sin(deck.yaw) * deck.sp, vz: -Math.cos(deck.yaw) * deck.sp, w: deck.w, cx: deck.x, cz: deck.z }) };
  const D = createCH46Sim(); D.reset([4, 9, 5], 0, true, denv); const rel0 = [D.body.pos[0] - deck.x, D.body.pos[2] - deck.z];
  for (let t = 0; t < 20; t += DT) { D.step(DT, { coll: 0 }, denv); deck.x += -Math.sin(deck.yaw) * deck.sp * DT; deck.z += -Math.cos(deck.yaw) * deck.sp * DT; deck.yaw += deck.w * DT; }
  const co = Math.cos(deck.yaw), si = Math.sin(deck.yaw), lx = (D.body.pos[0] - deck.x) * co - (D.body.pos[2] - deck.z) * si, lz = (D.body.pos[0] - deck.x) * si + (D.body.pos[2] - deck.z) * co;
  T.check('rides a moving, turning deck', Math.hypot(lx - rel0[0], lz - rel0[1]) < 0.4 && D.landed, `slid ${Math.hypot(lx - rel0[0], lz - rel0[1]).toFixed(2)} m in 20 s`);
}
T.done();
