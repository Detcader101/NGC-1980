#!/usr/bin/env node
// mv22bench.mjs - the MV-22B tiltrotor flight model (game/js/units/air/rotary/mv22fm.js) against published figures, in
// plain node: control signs in both modes, hover power / figure of merit / wing download, level-flight trims across the
// conversion corridor (helicopter -> conversion -> airplane), maximum speed, climb, the 12 s conversion, the 412 / 333
// rpm switch, one engine out through the cross-shaft, and the ground.          node tools/mv22bench.mjs [--v]
import { ROT, DT, deg, rad, KT, FPM, HP, clamp, sea, land, table, run } from './rotarykit.mjs';
const { createMV22Sim, MV22 } = await import(ROT + 'mv22fm.js');
const { createTiltPilot, nacFor } = await import(ROT + 'tiltpilot.js');
const { stateOf } = await import(ROT + 'pilot.js');
const V = process.argv.includes('--v');
const T = table(), LB = 2.20462;
const MISSION = () => MV22.EMPTY + MV22.CREW + MV22.FUEL_KG + 12 * MV22.TROOPER_KG;
function mk(o = {}) {
  const S = createMV22Sim(); const kt = o.kt ?? 0, nac = o.nac ?? nacFor(kt, 151);
  if (o.gw) S.payload = o.gw - (MV22.EMPTY + MV22.CREW + S.fuelKg);
  S.reset([0, o.alt ?? 600, 0], 0, false, null, nac); S.body.vel[2] = -kt / KT; S.gear = S.gearCmd = kt > 80 ? 0 : 1;
  const P = createTiltPilot(MV22.PILOT, S); P.reset(0.5);
  return { S, P, st: {} };
}
const keys = A => ({ tcl: () => A.S.c.tcl, lon: () => A.S.c.lon, lat: () => A.S.c.lat, ped: () => A.S.c.ped, pitch: () => deg(A.st.pitch), roll: () => deg(A.st.roll), nac: () => deg(A.S.nac),
  shp: () => (A.S.rR.power + A.S.rL.power) / HP, T: () => A.S.rR.T + A.S.rL.T, rpm: () => A.S.rpm, kt: () => A.st.vf * KT, vy: () => A.st.vy, dl: () => A.S.download, wing: () => A.S.wingL, alpha: () => deg(A.S.alpha) });
function trim(A, kt, secs = 50, cmd = {}, env = sea()) { return run(A.S, secs, () => { stateOf(A.S.body, A.st); return A.P.step(A.st, DT, { vx: 0, vz: -kt / KT, vy: 0, hdg: 0, agl: 600, ...cmd }); }, env, keys(A), 6); }

console.log('--- control signs (0.3 input for 0.8 s from trim, SAS on) ---');
{
  const resp = (kt, mod) => { const A = mk({ kt }); trim(A, kt, 30); const c = { ...A.P.ctl }; mod(c); const s0 = { ...stateOf(A.S.body, {}) }; run(A.S, 0.8, () => c, sea()); return { s0, s1: stateOf(A.S.body, {}) }; };
  for (const [kt, mode] of [[0, 'helicopter'], [240, 'airplane']]) {
    let r = resp(kt, c => c.lon += 0.3); T.check(`${mode}: stick aft -> nose up (${kt ? 'elevator' : 'cyclic'})`, r.s1.q > 0.02, `q ${deg(r.s1.q).toFixed(1)} deg/s`);
    r = resp(kt, c => c.lat += 0.3); T.check(`${mode}: stick right -> roll right (${kt ? 'flaperons' : 'differential collective'})`, r.s1.p > 0.03, `p ${deg(r.s1.p).toFixed(1)} deg/s`);
    r = resp(kt, c => c.ped += 0.3); T.check(`${mode}: right pedal -> nose right (${kt ? 'rudders' : 'differential cyclic'})`, r.s1.r > 0.01, `r ${deg(r.s1.r).toFixed(1)} deg/s`);
  }
  const r = resp(0, c => c.tcl += 0.08); T.check('helicopter: thrust lever up -> climbs', r.s1.vy > 0.5, `vy ${r.s1.vy.toFixed(2)} m/s`);
}

console.log('--- hover (OGE, sea level) ---');
{
  const gw = 47500 / LB, A = mk({ gw }), h = trim(A, 0, 40);
  const DLd = gw * LB / 2268, Tr = h.T / 2, Ar = Math.PI * MV22.R ** 2, Pid = 2 * Tr * Math.sqrt(Tr / (2 * 1.225 * Ar)), FM = Pid / (h.shp * HP);
  T.check('disc loading at 47,500 lb', Math.abs(DLd - MV22.PUB.DL) < 0.3, `${DLd.toFixed(1)} lb/ft2`, `${MV22.PUB.DL} lb/ft2`, 'CONFIRMED');
  T.check('hover power within the two engines', h.shp < 2 * 6150 && h.shp > 6000, `${h.shp.toFixed(0)} shp for ${(gw * LB).toFixed(0)} lb (${(100 * h.shp / 12300).toFixed(0)}% of 12,300)`, '< 12,300 shp', 'CONFIRMED rating');
  T.check('proprotor figure of merit in the hover', FM > 0.68 && FM < 0.82, `${FM.toFixed(2)}`, '~0.75-0.8 (V-22 rotor tests)', 'INFERRED');
  T.check('wing download in the hover', h.dl / h.T > 0.07 && h.dl / h.T < 0.14, `${(100 * h.dl / h.T).toFixed(1)}% of thrust`, '~10-12%', 'INFERRED (tiltrotor download literature)');
  T.check('hover attitude near level', Math.abs(h.pitch) < 5 && Math.abs(h.roll) < 1, `pitch ${h.pitch.toFixed(1)}, roll ${h.roll.toFixed(1)} deg`);
}

console.log('--- level flight across the conversion corridor (mission weight) ---');
{
  const S0 = createMV22Sim(); console.log(`   mission weight ${MISSION().toFixed(0)} kg = ${(MISSION() * LB).toFixed(0)} lb, flapped wing stall ${S0.vStall.toFixed(0)} kt`);
  console.log('    KIAS  nacelle  pitch  alpha   TCL   shp    rpm   wing kN   vy');
  let worst = 0, ok = true;
  for (const kt of [0, 40, 80, 110, 140, 170, 200, 230, 260]) {
    const A = mk({ kt }), r = trim(A, kt, 55); const cor = A.S.corridor(r.nac);
    console.log(`    ${String(kt).padStart(4)}  ${r.nac.toFixed(0).padStart(5)}  ${r.pitch.toFixed(1).padStart(6)}  ${r.alpha.toFixed(1).padStart(5)}  ${r.tcl.toFixed(2).padStart(5)}  ${r.shp.toFixed(0).padStart(5)}  ${(r.rpm * 412).toFixed(0).padStart(5)}  ${(r.wing / 1000).toFixed(0).padStart(6)}  ${r.vy.toFixed(2)}`);
    const inCor = kt >= cor.min - 3 && kt <= cor.max + 3, held = Math.abs(r.kt - kt) < 3 && Math.abs(r.vy) < 0.5 && Math.abs(r.pitch) < 12 && r.tcl < 0.99;
    if (!inCor || !held) ok = false; worst = Math.max(worst, Math.abs(r.pitch));
  }
  T.check('trims level at every speed, inside the corridor', ok, `max |pitch| ${worst.toFixed(1)} deg`, 'hover .. 260 kt', 'INFERRED corridor shape');
}

console.log('--- performance ---');
{
  // maximum level speed at full power (2 x 6,150 shp), airplane mode, 43,000 lb
  let vmax = 0;
  for (const kt of [250, 260, 270, 280, 290, 300, 310]) {
    const A = mk({ kt, nac: 0 }); let tcl = 0.8;
    const r = run(A.S, 45, () => { stateOf(A.S.body, A.st); const c = A.P.step(A.st, DT, { vx: 0, vz: -kt / KT, vy: 0, hdg: 0, agl: 600, nac: 0 }); return c; }, sea(), keys(A), 6);
    if (V) console.log(`   ${kt} kt: ${r.shp.toFixed(0)} shp, tcl ${r.tcl.toFixed(2)}, held ${r.kt.toFixed(0)} kt`);
    if (r.tcl < 0.98 && Math.abs(r.kt - kt) < 3) vmax = kt;
  }
  T.check('max level speed, sea level, full power', Math.abs(vmax - MV22.PUB.VMAX) <= 15, `${vmax} kt`, `${MV22.PUB.VMAX} kt`, 'CONFIRMED');
  // climb, airplane mode at the best-climb speed 154 KCAS (AOPA / Bell-Boeing figure), full power
  const A = mk({ kt: 154, nac: 0, gw: MV22.MTOW_V });
  let pI = 0.1;   // speed on the pitch attitude, full power: a best-rate climb
  const c = run(A.S, 40, () => { stateOf(A.S.body, A.st); const e = A.st.vf * KT - 154; pI = clamp(pI + e * 0.0015 * DT, -0.1, 0.4); const k = A.P.step(A.st, DT, { vx: 0, vz: -154 / KT, vy: 0, hdg: 0, agl: 600, nac: 0, pitch: clamp(pI + e * 0.01, -0.1, 0.45) }); k.tcl = 1; return k; }, sea(), keys(A), 8);
  const fpm = c.vy * FPM;
  T.check('climb, airplane mode, 154 KCAS, full power, 52,600 lb', fpm >= MV22.PUB.ROC[0] * 0.9 && fpm <= MV22.PUB.ROC[1] * 1.15, `${fpm.toFixed(0)} fpm at ${c.kt.toFixed(0)} kt`, '2,320-4,000 fpm', 'CONFIRMED (154 KCAS: AOPA; weight INFERRED)');
  // the wing's power-on stall with the nacelles down, at gross weight (published 110 kt)
  const S1 = createMV22Sim(); S1.payload = MV22.GROSS - (MV22.EMPTY + MV22.CREW + S1.fuelKg);
  T.check('flapped wing stall at 39,500 lb vs published stall speed', S1.vStall > 100 && S1.vStall < 150, `${S1.vStall.toFixed(0)} kt (wing alone)`, '110 kt published', 'CONFLICT: the published figure must include rotor lift / a light weight');
}

console.log('--- conversion, rotor speed, one engine ---');
{
  // nacelles 90 -> 0 time at the actuator rate
  const A = mk({ kt: 0 }); let t0 = 0; A.S.nacCmd = 0;
  run(A.S, 20, () => ({ tcl: 0.69, nac: 0 }), sea(), {}, 0, (t) => { if (!t0 && A.S.nac < rad(0.5)) t0 = t; });
  T.check('conversion 90 -> 0 deg nacelles', t0 > 10 && t0 < 14, `${t0.toFixed(1)} s`, '~12 s', 'CONFIRMED');
  const B = mk({ kt: 240, nac: 0 }), rb = trim(B, 240, 30, { nac: 0 }), H = mk({ kt: 0 }), rh = trim(H, 0, 20);
  T.check('rotor speed: 412 rpm helicopter, 333 rpm airplane', Math.abs(rh.rpm * 412 - 412) < 6 && Math.abs(rb.rpm * 412 - 333) < 6, `${(rh.rpm * 412).toFixed(0)} / ${(rb.rpm * 412).toFixed(0)} rpm`, '412 / 333', 'CONFIRMED');
  // one engine out at 200 kt in airplane mode: the cross-shaft drives both rotors, level flight holds
  const E = mk({ kt: 200, nac: 0 }); trim(E, 200, 25, { nac: 0 }); E.S.eng[0].ok = false;
  const re = trim(E, 200, 35, { nac: 0 });
  T.check('one engine out at 200 kt: both rotors still turn, level flight', Math.abs(re.vy) < 1 && re.rpm > 0.77 && Math.abs(re.roll) < 3, `vy ${re.vy.toFixed(2)} m/s, ${(re.rpm * 412).toFixed(0)} rpm, roll ${re.roll.toFixed(1)}, ${re.shp.toFixed(0)} shp`, 'cross-shafted', 'CONFIRMED (drive shafts to a common gearbox)');
}

console.log('--- ground ---');
{
  const S = createMV22Sim(); const env = land(); S.reset([2, 0, 3], 0.3, true, env); S.step(DT, { tcl: 0 }, env); const p0 = [...S.body.pos];
  run(S, 10, () => ({ tcl: 0, nac: 90, gear: 1 }), env);
  T.check('parked, rotors turning: holds still on its wheels', S.landed && Math.hypot(S.body.pos[0] - p0[0], S.body.pos[2] - p0[2]) < 0.1, `drift ${Math.hypot(S.body.pos[0] - p0[0], S.body.pos[2] - p0[2]).toFixed(3)} m, CG ${S.body.pos[1].toFixed(2)} m`);
  run(S, 6, () => ({ tcl: 0, nac: 0, gear: 1 }), env);
  T.check('nacelles lowered on the ground: proprotor strike', S.dead === 'proprotor strike', `${S.dead || 'no strike'}`);
}
T.done();
