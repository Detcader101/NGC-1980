#!/usr/bin/env node
// hueybench.mjs - the UH-1H flight model (game/js/hueyfm.js) against published data, in plain node:
// control signs, hover / level-flight trims vs Heffley (NASA CR-3144, 8000 lb), the power bucket, climb, VNE and
// retreating blade stall, vortex ring state, autorotation (descent rate, rotor rpm, a flared landing), tail rotor loss,
// pedal steps, rotor droop, engine start, ground effect and skids on a moving deck.     node tools/hueybench.mjs [--v]
// Real gravity (9.81) for the comparisons; the game runs at 9.0, i.e. the same Huey ~8% lighter.
import { FM, THREE, air, pilot, trim, fly, state, ctl0, sea, land, deg, clamp, rootDeg, tailDeg, U, DT, autoLand } from './hueypilot.mjs';
const { KT, FPM } = FM;
const G = 9.81, NOM = 3629 - U.MASS_OP;   // Heffley's 8000 lb case: fuel to make 3629 kg
let pass = 0, fail = 0; const rows = [];
const check = (name, ok, got, want, tag = '') => { (ok ? pass++ : fail++); rows.push({ name, ok, got, want, tag }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(50)} ${got}${want ? '   (want ' + want + ')' : ''}${tag ? '  [' + tag + ']' : ''}`); };
const nominal = (o = {}) => { const H = air(G, o); H.fuelKg = NOM; return H; };
const fix = (H) => { H.fuelKg = NOM; };   // keep the mass constant (env.fuel undefined)

console.log('--- control signs (from a trimmed hover, 0.4 input for 0.6 s) ---');
{
  const base = () => { const H = nominal(); const P = pilot(); trim(H, P, 25, 2); return { H, P }; };
  const resp = (mod) => { const { H, P } = base(); const c = { ...P.ctl }; mod(c); const s0 = state(H); fly(H, 0.6, c); return { s0, s1: state(H), H }; };
  let r = resp(c => c.cy -= 0.4); check('forward cyclic: nose down', r.s1.q < -0.03 && r.s1.pitch < r.s0.pitch, `q ${deg(r.s1.q).toFixed(1)}°/s`);
  r = resp(c => c.cx += 0.4); check('right cyclic: roll right', r.s1.p > 0.05 && r.s1.roll > r.s0.roll, `p ${deg(r.s1.p).toFixed(1)}°/s`);
  r = resp(c => c.pedal += 0.4); check('right pedal: nose right', r.s1.r > 0.05, `r ${deg(r.s1.r).toFixed(1)}°/s`);
  r = resp(c => c.coll += 0.1); check('collective up: climbs', r.s1.vz > 0.5, `vz ${r.s1.vz.toFixed(2)} m/s`);
}

console.log('--- hover and level-flight trims vs Heffley case 122-128 (3629 kg, SL) ---');
const HEF = { V: [0.51, 10.29, 20.58, 30.87, 41.16, 51.44, 61.73], coll: [14.51, 13.57, 12.76, 12.58, 12.81, 13.42, 14.46], pitch: [4.04, 3.7, 4.15, 3.91, 3.56, 3.02, 2.22], roll: [-1.07, -0.86, -0.68, -0.65, -0.73, -0.94, -1.29], tail: [6.44, 4.59, 2.71, 2.1, 2.07, 2.41, 3.03],
  psi: [38.4, 31.9, 24.6, 22.8, 24.6, 29.4, 37.2] };
const trims = [];
for (let i = 0; i < HEF.V.length; i++) {
  const V = HEF.V[i], H = nominal({ speed: V }), r = trim(H, pilot({ V }), 40, 6); r.V = V; trims.push(r);
}
{
  console.log('  KIAS   coll° (H)      pitch° (H)     roll° (H)      tail° (H)      torque psi (est)');
  trims.forEach((r, i) => console.log(`  ${(HEF.V[i] * KT).toFixed(0).padStart(4)}   ${rootDeg(r.coll).toFixed(1).padStart(5)} (${HEF.coll[i]})  ${deg(r.pitch).toFixed(1).padStart(5)} (${HEF.pitch[i]})  ${deg(r.roll).toFixed(1).padStart(5)} (${HEF.roll[i]})  ${tailDeg(r.ped).toFixed(1).padStart(5)} (${HEF.tail[i]})  ${r.psi.toFixed(1).padStart(5)} (${HEF.psi[i]})`));
  const h = trims[0];
  check('hover OGE torque', h.psi > 32 && h.psi < 42, `${h.psi.toFixed(1)} psi = ${(h.psi * 2).toFixed(0)}%`, '32-40 psi (DCS manual / est 38.4)', 'CONFIRMED range');
  check('hover collective (root)', Math.abs(rootDeg(h.coll) - 14.51) < 1.2, `${rootDeg(h.coll).toFixed(1)}° (${(h.coll * 100).toFixed(0)}% travel)`, '14.5° (H)', 'CONFIRMED');
  check('hover pitch attitude nose up', Math.abs(deg(h.pitch) - 4.04) < 1.2, `${deg(h.pitch).toFixed(1)}°`, '+4.0° (H)', 'CONFIRMED');
  check('hover roll: left skid low', deg(h.roll) < -0.3 && deg(h.roll) > -2.5, `${deg(h.roll).toFixed(1)}°`, '-1.1° (H)', 'CONFIRMED');
  check('hover pedal: left, 1/4-1/3 travel', h.ped < -0.15 && h.ped > -0.4, `${(-h.ped * 100).toFixed(0)}% left, tail rotor ${tailDeg(h.ped).toFixed(1)}°`, '1/4-1/3 left (DCS), 6.4° (H)', 'CONFIRMED');
  check('hover lateral cyclic left of centre', h.lat < 0, `${(h.lat * 100).toFixed(0)}%`, 'left (H A1s -1.6°)');
  const maxErr = k => Math.max(...trims.map((r, i) => Math.abs((k === 'coll' ? rootDeg(r.coll) : k === 'tail' ? tailDeg(r.ped) : deg(r[k])) - HEF[k][i])));
  check('collective vs speed within 1.2° of Heffley', maxErr('coll') < 1.2, `max err ${maxErr('coll').toFixed(2)}°`, '', 'CONFIRMED');
  check('pitch attitude vs speed within 2.2° of Heffley', maxErr('pitch') < 2.2, `max err ${maxErr('pitch').toFixed(2)}°`, '', 'CONFIRMED');
  check('tail rotor pitch vs speed within 1.5° of Heffley', maxErr('tail') < 1.5, `max err ${maxErr('tail').toFixed(2)}°`, '', 'CONFIRMED');
  const mi = trims.reduce((b, r, i) => r.psi < trims[b].psi ? i : b, 0);
  check('power bucket: minimum torque near 60 kt (Vy)', HEF.V[mi] * KT > 45 && HEF.V[mi] * KT < 85, `min ${trims[mi].psi.toFixed(1)} psi at ${(HEF.V[mi] * KT).toFixed(0)} kt`, '55-65 kt', 'INFERRED (est bucket, TM climb 55 KIAS)');
}

console.log('--- performance ---');
{
  // ground effect: hover with the skids 1 m up vs. out of ground effect
  const H = nominal({ alt: 2.84 }), P = pilot(), env = { groundY: () => 0, water: () => false };
  const r = trim(H, P, 25, 5, env);
  check('ground effect: IGE (1 m skid height) torque < OGE', r.psi < trims[0].psi - 2.5, `${r.psi.toFixed(1)} vs ${trims[0].psi.toFixed(1)} psi OGE (-${(100 * (1 - r.psi / trims[0].psi)).toFixed(0)}%)`, '~10-20% less', 'INFERRED');
  // max-power vertical climb and at 60 kt: collective to 50 psi
  const climb = (V) => { const H = nominal({ speed: V }), P = pilot({ V }); let c = 0.45; const r = trim(H, { step: (H, dt) => { const k = P.step(H, dt); c = clamp(c + (50 - H.torque) * 0.004 * dt, 0, 1); k.coll = c; return k; } }, 40, 8); return r; };
  const c0 = climb(0), c60 = climb(30.9);
  check('climb at 50 psi, vertical (fuselage download included)', c0.vz > 5 && c0.vz < 14, `${c0.vz.toFixed(1)} m/s = ${(c0.vz * FPM).toFixed(0)} fpm`, '11.1 m/s at "max power" (H model, likely > 50 psi)', 'CONFIRMED order');
  check('climb at 50 psi, 60 kt', c60.vz > 9 && c60.vz < 16, `${c60.vz.toFixed(1)} m/s = ${(c60.vz * FPM).toFixed(0)} fpm`, '12.4 m/s (H)', 'CONFIRMED');
  // VNE / retreating blade stall: level flight at rising speed, power available
  let onset = 0, maxV = 0;
  for (const kt of [110, 115, 120, 124, 128, 132, 136, 140, 145]) {
    const V = kt / KT, H = nominal({ speed: V }), r = trim(H, pilot({ V }), 30, 5);
    if (!onset && r.stall > 0.15) onset = kt; if (r.psi < 54 && Math.abs(r.u - V) < 1.5) maxV = kt;
    if (process.argv.includes('--v')) console.log(`   ${kt} kt  psi ${r.psi.toFixed(1)} stall ${r.stall.toFixed(2)} pitch ${deg(r.pitch).toFixed(1)} coll ${(r.coll * 100).toFixed(0)}%`);
  }
  check('retreating blade stall onset near VNE (124 kt)', onset >= 118 && onset <= 140, `${onset || '>145'} kt`, '~120-130 kt (DCS: left roll approaching 120 kt)', 'CONFIRMED (DCS p.122)');
  check('level flight reaches VNE within ~54 psi', maxV >= 124, `${maxV} kt`, '>= 124 kt red line (DCS p.48)', 'CONFIRMED');
}

console.log('--- vortex ring state ---');
{
  const H = nominal(), P = pilot(); trim(H, P, 20, 2);
  const c = { ...P.ctl }; c.coll -= 0.1; let vmax = 0, vrs = 0;
  fly(H, 12, (H, t) => { const k = P.step(H, DT); k.coll = c.coll; return k; }, sea, H => { vmax = Math.max(vmax, -H.vel.y); vrs = Math.max(vrs, H.vrs); });
  check('collective -10% from an OGE hover: settles fast in the ring', vmax > 7 && vrs > 0.5, `max descent ${vmax.toFixed(1)} m/s (${(vmax * FPM).toFixed(0)} fpm), ring ${vrs.toFixed(2)}`, '>500 fpm runs to ~2000 fpm (DCS p.121)', 'CONFIRMED (qualitative)');
  // power on, then forward cyclic: flying out of it
  const P2 = pilot({ V: 15 }); P2.i.c = c.coll; let t15 = 0;
  fly(H, 12, (H, t) => P2.step(H, DT), sea, (H, t) => { if (!t15 && H.vrs < 0.1 && state(H).u > 6) t15 = t; });
  check('recovery: forward speed flies out of the ring', t15 > 0 && t15 < 10, `${t15.toFixed(1)} s`, '');
}

console.log('--- autorotation ---');
{
  const H = nominal({ speed: 36 }), P = pilot({ V: 36 }); trim(H, P, 25, 2);
  const A = pilot({ V: 36, rpmHold: true, c0: 0.1 }); Object.assign(A.i, { lon: P.i.lon, lat: P.i.lat, ped: P.i.ped, th: P.i.th, ph: P.i.ph });
  A.ctl.fuel = false; let n2drop = 9;
  const r = trim(H, A, 45, 10); r.rpm;
  check('engine out: freewheel splits the needles (N2 < NR)', H.n2 < H.rpm - 0.2, `N2 ${(H.n2 * 100).toFixed(0)}% NR ${(H.rpm * 100).toFixed(0)}%`, '');
  check('autorotation 70 kt, NR held at 100%: descent', -r.vz > 7 && -r.vz < 11, `${(-r.vz).toFixed(1)} m/s = ${(-r.vz * FPM).toFixed(0)} fpm, coll ${(r.coll * 100).toFixed(0)}%`, '1500-2000 fpm (TM: ~8.6 m/s)', 'CONFIRMED (TM 9-2.1)');
  check('autorotation pitch attitude', deg(r.pitch) > -2 && deg(r.pitch) < 7, `${deg(r.pitch).toFixed(1)}°`, '+3.1° at 60 kt (H)', 'CONFIRMED');
  check('autorotation: right pedal (no torque to cancel)', r.ped > -0.05, `pedal ${(r.ped * 100).toFixed(0)}% (tail ${tailDeg(r.ped).toFixed(1)}°)`, 'tail ~0° (H)', 'CONFIRMED');
  // full down collective rpm at 70 kt
  const D = nominal({ speed: 36 }), Q = pilot({ V: 36, coll: 0 }); trim(D, pilot({ V: 36 }), 20, 2); Q.ctl.fuel = false; Object.assign(Q.i, { th: 0.03 });
  const rd = trim(D, Q, 40, 8);
  check('full-down collective rotor rpm at 70 kt', rd.rpm * 324 > 315 && rd.rpm * 324 < 345, `${(rd.rpm * 324).toFixed(0)} rpm`, '320-340 rpm (DCS p.128)', 'CONFIRMED');
  // engine failure in cruise: rotor rpm decay with a 2 s reaction
  const E = nominal({ speed: 46 }), PE = pilot({ V: 46 }); trim(E, PE, 25, 2); let minR = 2;
  fly(E, 2, (H) => { const k = PE.step(H, DT); k.fuel = false; return k; }, sea, H => minR = Math.min(minR, H.rpm));
  check('engine failure at 90 kt: rpm after 2 s without collective', minR * 324 > 250 && minR * 324 < 310, `${(minR * 324).toFixed(0)} rpm`, 'decays toward ~280 within 2-5 s (DCS p.128)', 'CONFIRMED (qualitative)');
  // the whole thing: power off at 500 ft / 70 kt, glide at 100% NR, flare (~80 ft), cushion with the collective
  const L = nominal({ alt: 152, speed: 36 }), td = autoLand(L, 25, 0.016, 8, process.argv.includes('--v'));
  check('autorotation 500 ft / 70 kt -> flare -> cushioned landing', (td.e === 'land' || td.e === 'hardland') && td.vy > -4.5, `${td.e}: sink ${(-td.vy).toFixed(1)} m/s, ground speed ${td.hs.toFixed(1)} m/s (${(td.hs * KT).toFixed(0)} kt) after ${td.t.toFixed(0)} s`, 'skids intact, < 900 fpm; 12-15 s from 200 ft (DCS p.129)', 'CONFIRMED profile');
}

console.log('--- yaw: tail rotor, pedal steps, tail rotor loss ---');
{
  const step = (dp) => { const H = nominal(), P = pilot(); trim(H, P, 25, 2); const c = { ...P.ctl }; c.pedal += dp; const out = []; let t = 0; fly(H, 4.01, (H) => { const k = P.step(H, DT); k.pedal = c.pedal; return k; }, sea, (H, tt) => { t = tt; for (const ts of [0.5, 2, 4]) if (Math.abs(tt - ts) < DT / 2) out.push(deg(state(H).r)); }); return out; };
  const R = step(0.1), L = step(-0.1);
  console.log(`   +10% pedal: r ${R.map(v => v.toFixed(1)).join(' / ')} °/s at 0.5/2/4 s;  -10%: ${L.map(v => v.toFixed(1)).join(' / ')}`);
  check('pedal steps ±10%: same order both ways, settle', Math.abs(R[2]) < 2 * Math.abs(L[2]) && Math.abs(L[2]) < 2 * Math.abs(R[2]) && Math.abs(R[2]) < 1.35 * Math.abs(R[1]) && Math.abs(L[2]) < 1.35 * Math.abs(L[1]) && R[2] > 2 && L[2] < -2, `${R[2].toFixed(1)} / ${L[2].toFixed(1)} °/s at 4 s (right faster: thrust is concave in pitch)`, 'within 2x, no runaway');
  // tail rotor shot away in a hover: torque spins the nose right; cutting the engine stops it
  const H = nominal(), P = pilot(); trim(H, P, 20, 2); const env = { ...sea, mods: { ...{ engineOk: true, power: 1, xmsnOk: true, lift: 1, tail: 0, hyd: 1, hydOk: true, skidTol: 1, vib: 0 } } };
  let r25 = 0; fly(H, 2.5, (H) => P.step(H, DT), env, H => r25 = state(H).r);
  check('tail rotor lost in a hover: nose-right spin', r25 > 0.8, `${deg(r25).toFixed(0)}°/s after 2.5 s`, 'violent spin to the right');
  const A = pilot({ rpmHold: true, c0: 0.2 }); Object.assign(A.i, P.i); A.rpmHold = true; A.ctl.fuel = false; let r3 = 0;
  fly(H, 4, (H) => { const k = A.step(H, DT); k.pedal = 0; return k; }, env, H => r3 = state(H).r);
  check('...engine cut: spin dies away in autorotation', Math.abs(r3) < 0.5 * Math.abs(r25) || Math.abs(r3) < 0.6, `${deg(r3).toFixed(0)}°/s 4 s later`, '');
  // tail rotor lost at 100 kt: lower the collective (-8%, ~18 psi), hold the attitude wings level: the fin holds it
  const F = nominal({ speed: 51 }), PF = pilot({ V: 51 }), tr = trim(F, PF, 20, 3); let rs = 0, ns = 0, beta = 0, V = 0;
  fly(F, 12, (H) => { const s = state(H), c = PF.ctl; c.coll = tr.coll - 0.08; c.cy = clamp(tr.lon + (tr.pitch - s.pitch) * 3 - s.q * 1.2, -1, 1); c.cx = clamp(tr.lat - s.roll * 3 - s.p * 0.8, -1, 1); return c; }, env,
    (H, t) => { const s = state(H); beta = Math.atan2(s.v, s.u); V = Math.hypot(H.vel.x, H.vel.z); if (t > 7) { rs += Math.abs(s.r); ns++; } });
  check('tail rotor lost at 100 kt, power reduced: fin holds it', rs / ns < 0.07, `mean |yaw rate| ${deg(rs / ns).toFixed(1)}°/s, sideslip ${deg(beta).toFixed(0)}°, ${(V * KT).toFixed(0)} kt`, 'flyable with sideslip (-10 manual: reduce power, keep airspeed)', 'CONFIRMED (qualitative)');
  // ... and in a hover the same loss with power on is not
  const F2 = nominal({ speed: 15 }), PF2 = pilot({ V: 15 }), tr2 = trim(F2, PF2, 20, 3); let r15 = 0;
  fly(F2, 4, (H) => { const s = state(H), c = PF2.ctl; c.coll = tr2.coll; c.cy = clamp(tr2.lon + (tr2.pitch - s.pitch) * 3 - s.q * 1.2, -1, 1); c.cx = clamp(tr2.lat - s.roll * 3 - s.p * 0.8, -1, 1); return c; }, env, H => r15 = state(H).r);
  check('tail rotor lost at 30 kt: it spins', r15 > 0.5, `${deg(r15).toFixed(0)}°/s after 4 s`, '');
}

console.log('--- rotor speed, engine ---');
{
  const H = nominal(), P = pilot(); trim(H, P, 20, 2); let minR = 2, maxEgt = 0;
  fly(H, 6, (H) => { const k = P.step(H, DT); k.coll = P.i.c + 0.12; return k; }, sea, H => { minR = Math.min(minR, H.rpm); maxEgt = Math.max(maxEgt, H.egt); });
  check('collective +12% from hover: governor droop', minR * 324 > 312 && minR * 324 < 322, `${(324 - minR * 324).toFixed(1)} rpm sag`, '3-5 rpm (DCS p.117)', 'CONFIRMED (qualitative)');
  // cold start: battery, throttle at idle, starter held to 40% N1, then throttle open
  const S = FM.createHueySim(G); S.reset(new THREE.Vector3(0, 1.84, 0), 0, true, -1); const c = { ...ctl0(), coll: 0, pedal: 0, throttle: 0.15, starter: false };
  let t = 0, lit = -1, idle = -1, gov = -1, peak = 0;
  for (; t < 90; t += DT) {
    c.starter = S.n1 < 0.4 && t > 1; if (idle > 0 && t > idle + 3) c.throttle = 1;
    S.step(DT, c, land); peak = Math.max(peak, S.egt);
    if (lit < 0 && S.run) lit = t; if (idle < 0 && S.n1 > 0.68) idle = t; if (gov < 0 && S.rpm > 0.985 && c.throttle === 1) gov = t;
  }
  check('cold start: light-off ~15% N1, idle, governed', lit > 0 && idle > lit && gov > idle && peak < 760, `light-off ${lit.toFixed(1)} s, idle ${idle.toFixed(1)} s, 6600 rpm ${gov.toFixed(1)} s, EGT peak ${peak.toFixed(0)}°C, still on skids ${S.landed}`, 'DCS procedure: 40% starter release, idle 68-72%');
  const Hs = FM.createHueySim(G); Hs.reset(new THREE.Vector3(0, 1.84, 0), 0, true, -1); let hung = false;
  for (let t = 0; t < 40; t += DT) { const k = { ...ctl0(), coll: 0, pedal: 0, throttle: 0.15, starter: t < 6 }; Hs.step(DT, k, land); if (Hs.hung) hung = true; }
  const Ro = FM.createHueySim(G); Ro.reset(new THREE.Vector3(0, 0, 0), 0, true, 0); let grip = 0.18, mx = 0;
  for (let t = 0; t < 15; t += DT) { grip = Math.min(1, grip + 0.4 * DT); Ro.step(DT, { ...ctl0(), coll: 0, pedal: 0, throttle: grip }, land); mx = Math.max(mx, Ro.rpm); }
  check('throttle roll-on from flight idle: governed, no overspeed', mx < 1.02 && Ro.rpm > 0.985, `peak NR ${(mx * 100).toFixed(1)}%, then ${(Ro.rpm * 100).toFixed(1)}% at N1 ${(Ro.n1 * 100).toFixed(0)}%`, 'no overspeed past 339 rpm');
  check('starter released early: hung start', hung && Hs.n1 < 0.45, `N1 ${(Hs.n1 * 100).toFixed(0)}% EGT ${Hs.egt.toFixed(0)}°C`, '');
}

console.log('--- skids ---');
{
  const H = FM.createHueySim(G); H.reset(new THREE.Vector3(3, 0, 4), 0.5, true, 0); H.step(DT, { ...ctl0(), coll: 0, pedal: 0 }, land); const p0 = H.pos.clone();
  fly(H, 15, { ...ctl0(), coll: 0, pedal: 0, throttle: 1 }, land);
  check('parked at flight rpm, collective down: holds still', H.landed && H.pos.distanceTo(p0) < 0.12, `drift ${H.pos.distanceTo(p0).toFixed(3)} m, NR ${(H.rpm * 100).toFixed(0)}%`, '');
  // a moving, turning deck
  const deck = { x: 0, z: 0, yaw: 0, sp: 9, w: 0.02 };
  const env = { groundY: (x, z) => Math.hypot(x - deck.x, z - deck.z) < 40 ? 8 : -500, water: () => false, surfVel: () => ({ vx: -Math.sin(deck.yaw) * deck.sp, vz: -Math.cos(deck.yaw) * deck.sp, w: deck.w, cx: deck.x, cz: deck.z }) };
  const D = FM.createHueySim(G); D.reset(new THREE.Vector3(5, 8 + 1.84, 6), 0, true, 1);
  const rel0 = [D.pos.x - deck.x, D.pos.z - deck.z];
  for (let t = 0; t < 20; t += DT) { D.step(DT, { ...ctl0(), coll: 0, pedal: 0 }, env); deck.x += -Math.sin(deck.yaw) * deck.sp * DT; deck.z += -Math.cos(deck.yaw) * deck.sp * DT; deck.yaw += deck.w * DT; }
  const co = Math.cos(deck.yaw), si = Math.sin(deck.yaw), lx = (D.pos.x - deck.x) * co - (D.pos.z - deck.z) * si, lz = (D.pos.x - deck.x) * si + (D.pos.z - deck.z) * co;
  check('rides a moving, turning deck', Math.hypot(lx - rel0[0], lz - rel0[1]) < 0.4 && D.landed, `slid ${Math.hypot(lx - rel0[0], lz - rel0[1]).toFixed(2)} m in 20 s`, '');
  // lift off from the ground with the collective, hover in ground effect
  const T = FM.createHueySim(G); T.reset(new THREE.Vector3(0, 0, 0), 0, true, 1); let off = -1;
  fly(T, 8, (H, t) => ({ ...ctl0(), coll: Math.min(0.48, t * 0.12), pedal: -0.22 }), land, (H, t) => { if (off < 0 && !H.landed && H.agl > 0.3) off = t; });
  check('lift-off with the collective', off > 0, `airborne at ${off.toFixed(1)} s, ${T.agl.toFixed(1)} m`, '');
}

console.log('--- small-perturbation derivatives in the hover (rate step, controls frozen, 0.25 s) ---');
{
  const der = (ax, d) => { const H = nominal(), P = pilot(); trim(H, P, 25, 2); const c = { ...P.ctl }; const s0 = state(H); H.w[ax] += d; const s1 = state(H); let a = 0; const n = 15; for (let i = 0; i < n; i++) { const b = state(H); H.step(DT, c, sea); a = 0; } const s2 = state(H); return { s0, s1, s2 }; };
  const rd = (ax, key, d) => { const { s1, s2 } = der(ax, d); return (s2[key] - s1[key]) / 0.25 / (s1[key] - (key === 'p' ? 0 : 0)); };
  const Nr = rd('y', 'r', -0.1), Lp = rd('z', 'p', -0.1), Mq = rd('x', 'q', 0.1);
  console.log(`   decay rates (1/s, ~ derivative): Nr ${Nr.toFixed(2)} (H -0.71)  Lp ${Lp.toFixed(2)} (H -0.57)  Mq ${Mq.toFixed(2)} (H -0.19)  [stabilizer bar + flapping lag included]`);
  check('yaw damping Nr in the hover', Nr < -0.3 && Nr > -2.5, `${Nr.toFixed(2)} /s`, '-0.71 (H, bar on)', 'CONFIRMED order');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
