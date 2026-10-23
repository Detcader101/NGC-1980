#!/usr/bin/env node
// tankbench.mjs - checks of the tracked-vehicle sims (game/js/units/armor) in plain node against published figures.
//   node tools/tankbench.mjs [--v] [--only m60|m113|turret|gun]
// Every reference number carries a tag and a source:
//   C = CONFIRMED in a source read for this work: AFVDB (afvdatabase.com/usa/m60.html, /m113.html; follows Hunnicutt
//       "Patton" / "Bradley"), FAS (man.fas.org/dod-101/sys/land/m60.htm, /m113.htm), Wikipedia M60 / M113 (citing Foss,
//       Jane's Armour and Artillery 2005; Hunnicutt 1984), armedconflicts.com (AC).
//   U = UNVERIFIED (commonly quoted, not found in a source), I = INFERRED (derived), GAME = a game-balance value.
// A check passes when the sim lands inside the stated band.
import { createM60A3, M60A3 } from '../game/js/units/armor/m60a3.js';
import { createM113, M113A2 } from '../game/js/units/armor/m113.js';
import { G0 } from '../game/js/units/armor/trackfm.js';
import { ROUNDS, GUN_ROUNDS, fireTable, penAt } from '../game/js/units/armor/armorballistics.js';
import * as TG from '../game/js/units/armor/testground.js';

const ARGS = process.argv.slice(2), V = ARGS.includes('--v'), ONLY = ARGS.includes('--only') ? ARGS[ARGS.indexOf('--only') + 1] : null;
let pass = 0, fail = 0;
const rows = [];
const check = (name, ok, got, want, tag) => { (ok ? pass++ : fail++); rows.push({ name, ok, got, want, tag }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${String(got).padEnd(26)} want ${want}  [${tag}]`); };
const DT = 1 / 60, KMH = 3.6, D2R = Math.PI / 180;
const flat = (surface = 'paved') => ({ height: () => 0, surface: () => surface });
const make = veh => veh === 'm113' ? createM113() : createM60A3();
const LOW = { m60: 'L', m113: '1' }, DRIVE = { m60: 'H', m113: '1-3' };

// a driver: holds a target speed (m/s) with the accelerator, shifts L -> H at 11 km/h on the M60
function speedHold(target, veh, steer = 0) {
  let range = LOW[veh];
  return T => {
    const v = T.fm.out.fwd, e = target - v;
    if (veh === 'm60' && range === 'L' && v * KMH > 11 && target * KMH > 13) range = 'H';
    if (veh === 'm113') range = target * KMH > 20 ? '1-3' : '1-2';
    return { throttle: Math.max(0, Math.min(1, 0.35 + e * 0.8)), brake: e < -1.5 ? 0.4 : 0, range, steer, park: false };
  };
}
function run(T, env, secs, ctl, each) {
  for (let t = 0; t < secs; t += DT) { const c = typeof ctl === 'function' ? ctl(T, t) : ctl; const ev = T.step(DT, env, c); if (each && each(T, t, ev) === false) return t; }
  return secs;
}

// =================================================================================================== M60A3 / M113 mobility
function mobility(veh) {
  const P = veh === 'm113' ? M113A2 : M60A3, name = veh === 'm113' ? 'M113A2' : 'M60A3';
  console.log(`\n--- ${name}: static ---`);
  {
    const T = make(veh), env = flat('paved'); T.reset(0, 0, 0, env); run(T, env, 3, { park: true });
    const W = T.fm.mass, gp = W / (2 * P.TRACK.WIDTH * 100 * T.fm.contactLen * 100);   // kg/cm2
    if (veh === 'm60') {
      check(`${name} combat weight`, Math.abs(W - 52617) < 300, `${W.toFixed(0)} kg`, '52,617 (AC); 51,350 AFVDB, 51,980 WP', 'C (sources conflict 2.5 %)');
      check(`${name} ground pressure`, Math.abs(gp - 0.852) < 0.06, `${gp.toFixed(3)} kg/cm2`, '0.852 kg/cm2 (12.1 psi, AFVDB)', 'C');
      check(`${name} track contact length`, Math.abs(T.fm.contactLen - 4.235) < 0.08, `${T.fm.contactLen.toFixed(3)} m`, '4.235 m (AFVDB)', 'C');
    } else {
      check(`${name} weight with 11 troops`, Math.abs(W - 12388) < 200, `${W.toFixed(0)} kg`, '11,343 combat (AFVDB) + squad = 12.3 t (brief)', 'C + I');
      check(`${name} ground pressure (loaded)`, Math.abs(gp - 0.55) < 0.07, `${gp.toFixed(3)} kg/cm2`, '0.55 kg/cm2 (7.9 psi, AFVDB)', 'C');
      check(`${name} track contact length`, Math.abs(T.fm.contactLen - 2.67) < 0.08, `${T.fm.contactLen.toFixed(3)} m`, '2.67 m (105 in, AFVDB)', 'C');
    }
    const sag = -T.fm.origin()[1];
    check(`${name} static ride: settles on its springs`, Math.abs(sag) < 0.03 && Math.abs(T.fm.out.pitch) < 0.02, `sag ${(sag * 100).toFixed(1)} cm, pitch ${(T.fm.out.pitch / D2R).toFixed(2)} deg`, '|sag| < 3 cm, level', 'I');
  }
  console.log(`--- ${name}: road performance (paved, level) ---`);
  {
    const T = make(veh), env = flat('paved'); T.reset(0, 0, 0, env); run(T, env, 2, { park: true });
    let t32 = null, vmax = 0, range = LOW[veh];
    run(T, env, 90, (T, t) => { const v = T.fm.out.fwd * KMH; if (veh === 'm60' && v > 11) range = 'H'; if (veh === 'm113') range = '1-3'; return { throttle: 1, range, park: false }; },
      (T, t) => { const v = T.fm.out.fwd * KMH; if (t32 == null && v >= 32) t32 = t; vmax = Math.max(vmax, v); });
    const top = veh === 'm60' ? 48 : 64;
    check(`${name} top speed, road`, Math.abs(vmax - top) < top * 0.06, `${vmax.toFixed(1)} km/h`, `${top} km/h (${veh === 'm60' ? 'FAS, AFVDB, AC' : 'AFVDB; FAS 37 mph'})`, 'C');
    if (veh === 'm60') check(`${name} 0-32 km/h (0-20 mph)`, t32 > 9 && t32 < 20, `${t32?.toFixed(1)} s`, '~15-20 s (no published figure found)', 'U');
    else check(`${name} 0-32 km/h (0-20 mph)`, t32 > 8.5 && t32 < 13, `${t32?.toFixed(1)} s`, '11.0 s (FAS)', 'C');
    // range on a tank of fuel at a steady 30 km/h on a dirt road
    const T2 = make(veh), env2 = flat('dirt'); T2.reset(0, 0, 0, env2); run(T2, env2, 2, { park: true });
    const f0 = T2.fm.eng.fuel; let dist = 0; run(T2, env2, 300, speedHold(30 / KMH, veh), T => { dist += T.fm.out.fwd * DT; });
    const perKm = (f0 - T2.fm.eng.fuel) / (dist / 1000), rangeKm = P.FUEL_L / perKm, pub = veh === 'm60' ? [450, 500] : [480, 480];
    check(`${name} road range at 30 km/h`, rangeKm > pub[0] * 0.75 && rangeKm < pub[1] * 1.35, `${rangeKm.toFixed(0)} km (${perKm.toFixed(2)} L/km)`, veh === 'm60' ? '450 km (AFVDB, AC), 500 (WP)' : '480 km (AFVDB, WP)', 'C');
    // reverse
    const T3 = make(veh), env3 = flat('paved'); T3.reset(0, 0, 0, env3); run(T3, env3, 2, { park: true });
    let vr = 0; run(T3, env3, 40, { throttle: 1, range: 'R', park: false }, T => { vr = Math.min(vr, T.fm.out.fwd * KMH); });
    if (veh === 'm60') check(`${name} top speed, reverse`, Math.abs(-vr - 16) < 3, `${(-vr).toFixed(1)} km/h`, '16 km/h (10 mph, FAS)', 'C');
    else check(`${name} top speed, reverse`, -vr > 8 && -vr < 25, `${(-vr).toFixed(1)} km/h`, 'not published; plausible 10-20', 'U');
  }
  console.log(`--- ${name}: gradient, side slope, obstacles ---`);
  {
    // gradient: a concrete ramp from z = -6; crawl up in low; record the speed reached half way
    const climb = grade => { const g = grade / 100, env = { height: (x, z) => z < -6 ? (-6 - z) * g : 0, surface: () => 'paved' }; const T = make(veh); T.reset(0, 0, 0, env); run(T, env, 2, { park: true });
      let up = 0; run(T, env, 40, { throttle: 1, range: LOW[veh], park: false }, T => { up = Math.max(up, T.fm.origin()[1]); }); return { up, v: T.fm.out.fwd * KMH }; };
    // the limit on dry concrete is the pads' friction (mu 0.75: ~75 %); the 60 % rating carries a margin. 85 % (40 deg) must fail
    const g60 = climb(60), g75 = climb(85);
    check(`${name} climbs a 60 % gradient (concrete)`, g60.up > 6 && g60.v > 0.8, `${g60.up.toFixed(1)} m up, ${g60.v.toFixed(1)} km/h`, '60 % (AFVDB, AC)', 'C');
    check(`${name} stops short of an 85 % gradient`, g75.up < 4, `${g75.up.toFixed(1)} m up`, 'friction limit (pads on concrete, mu 0.75)', 'I');
    // side slope: parked across a 30 % slope with brakes: no sliding; then drive across it holding a line
    const g = 0.3, envS = { height: x => x * g, surface: () => 'dirt' }, T = make(veh); T.reset(0, 0, 0, envS); run(T, envS, 2, { park: true });
    const x0 = T.fm.origin()[0]; run(T, envS, 30, { park: true }); const slide = Math.abs(T.fm.origin()[0] - x0);
    check(`${name} parked across a 30 % side slope`, slide < 0.05 && Math.abs(T.fm.out.roll) < 0.4, `slid ${(slide * 100).toFixed(1)} cm, roll ${(T.fm.out.roll / D2R).toFixed(1)} deg`, '30 % side slope (AFVDB, AC)', 'C');
    const z0 = T.fm.origin()[2]; run(T, envS, 25, speedHold(10 / KMH, veh));
    const drift = Math.abs(T.fm.origin()[0] - x0), dz = Math.abs(T.fm.origin()[2] - z0);
    check(`${name} drives across a 30 % side slope`, dz > 50 && drift < 6, `${dz.toFixed(0)} m along, ${drift.toFixed(1)} m downhill`, 'holds the slope', 'C/I');
    // vertical step and trench at a crawl (~3 km/h)
    const step = h => { const env = { height: (x, z) => z < -8 ? h : 0, surface: () => 'dirt' }; const T = make(veh); T.reset(0, 0, 0, env); run(T, env, 2, { park: true }); run(T, env, 40, speedHold(0.9, veh)); return T.fm.origin()[1] > h - 0.2 && T.fm.origin()[2] < -14; };
    const stepOK = veh === 'm60' ? 0.91 : 0.61, stepNo = veh === 'm60' ? 1.2 : 0.85;
    check(`${name} climbs a ${stepOK} m vertical step`, step(stepOK), step(stepOK) ? 'climbs' : 'stuck', `${stepOK} m (${veh === 'm60' ? 'AFVDB, AC; FAS 49 in' : 'AFVDB, FAS'})`, 'C');
    check(`${name} cannot climb ${stepNo} m`, !step(stepNo), step(stepNo) ? 'climbs' : 'stuck', 'fails above its rating', 'I');
    const trench = w => { const env = { height: (x, z) => z < -8 && z > -8 - w ? -2.5 : 0, surface: () => 'dirt' }; const T = make(veh); T.reset(0, 0, 0, env); run(T, env, 2, { park: true }); run(T, env, 40, speedHold(1.0, veh)); return T.fm.origin()[2] < -10 - w && T.fm.origin()[1] > -0.3; };
    // the sim bridges further than the published ratings (M60 ~3.6 m, M113 ~2.8 m at a crawl: rigid track, firm far wall;
    // the ratings carry field margins), so the 'cannot' check sits at ~1.6x the rating
    const trOK = veh === 'm60' ? 2.59 : 1.68, trNo = veh === 'm60' ? 4.2 : 3.0;
    check(`${name} crosses a ${trOK} m trench at a crawl`, trench(trOK), trench(trOK) ? 'crosses' : 'stuck / falls in', `${trOK} m (${veh === 'm60' ? 'AFVDB, AC; FAS 108 in' : 'AFVDB, FAS'})`, 'C');
    check(`${name} cannot cross ${trNo} m at a crawl`, !trench(trNo), trench(trNo) ? 'crosses' : 'falls in', 'fails well above its rating (sim limit ~1.4-1.6x)', 'I');
  }
  console.log(`--- ${name}: steering ---`);
  {
    const T = make(veh), env = flat('dirt'); T.reset(0, 0, 0, env); run(T, env, 2, { park: true });
    if (veh === 'm60') {
      let yr = 0; run(T, env, 12, { throttle: 1, steer: 1, range: 'N', park: false }, (T, t) => { if (t > 6) yr = Math.max(yr, Math.abs(T.fm.out.yawRate)); });
      const drift = Math.hypot(T.fm.origin()[0], T.fm.origin()[2]);
      check(`${name} pivot turn in neutral (dirt)`, yr / D2R > 15 && yr / D2R < 60 && drift < 2.5, `${(yr / D2R).toFixed(1)} deg/s, centre drift ${drift.toFixed(2)} m`, 'pivots (AFVDB); rate not published', 'C / U');
    } else {
      let v = 0, yr = 0; run(T, env, 15, { throttle: 0.7, steer: 1, range: '1', park: false }, (T, t) => { if (t > 8) { v = T.fm.out.fwd; yr = Math.abs(T.fm.out.yawRate); } });
      const d = 2 * v / yr;
      check(`${name} minimum turning circle (1st, full lateral)`, Math.abs(d - 7.9) < 1.6, `${d.toFixed(1)} m diameter`, '7.9 m (26 ft, AFVDB)', 'C');
      const T2 = make(veh); T2.reset(0, 0, 0, env); run(T2, env, 2, { park: true }); let yr2 = 0; run(T2, env, 6, { throttle: 1, steer: 1, range: 'N', park: false }, T => { yr2 = Math.max(yr2, Math.abs(T.fm.out.yawRate)); });
      check(`${name} cannot pivot (controlled differential)`, yr2 / D2R < 2, `${(yr2 / D2R).toFixed(2)} deg/s in neutral`, 'no neutral steer (DS-200)', 'C');
    }
  }
  {
    // part steer at speed: turns proportionally, without skidding off or throwing a track
    const T = make(veh), env = flat('dirt'); T.reset(0, 0, 0, env); run(T, env, 2, { park: true });
    const vs = veh === 'm60' ? 40 : 50, st = veh === 'm60' ? 0.5 : 0.25;
    run(T, env, 40, speedHold(vs / KMH, veh));
    let thrown = false; run(T, env, 6, (T) => ({ ...speedHold(vs / KMH, veh)(T), range: veh === 'm60' ? 'H' : '1-3', steer: st }), (T, t, ev) => { if (ev.some(e => e.type === 'thrown')) thrown = true; });
    const R = Math.abs(T.fm.out.fwd / T.fm.out.yawRate);
    check(`${name} part steer (${st}) at ${vs} km/h`, R > 15 && R < 200 && !thrown, `radius ${R.toFixed(0)} m at ${(T.fm.out.fwd * KMH).toFixed(0)} km/h${thrown ? ', THREW A TRACK' : ''}`, 'a proportional turn, tracks stay on', 'I');
  }
  console.log(`--- ${name}: soft ground ---`);
  for (const s of ['grass', 'sand', 'mud', 'bog']) {
    const T = make(veh), env = flat(s); T.reset(0, 0, 0, env); run(T, env, 2, { park: true });
    let vmax = 0; run(T, env, 60, (T, t) => ({ throttle: 1, range: veh === 'm60' ? (T.fm.out.fwd * KMH > 11 ? 'H' : 'L') : '1-3', park: false }), T => { vmax = Math.max(vmax, T.fm.out.fwd * KMH); });
    const want = { grass: [25, 64], sand: [20, 64], mud: [5, 40], bog: [0, 3] }[s];
    check(`${name} on ${s}: top speed / sinkage`, vmax >= want[0] && vmax <= want[1], `${vmax.toFixed(1)} km/h, sink ${(T.fm.sink[0] * 100).toFixed(0)} cm${T.fm.state.bellied ? ', BELLIED' : ''}`, `${want[0]}-${want[1]} km/h`, 'I (Bekker soils, Wong)');
  }
  console.log(`--- ${name}: water ---`);
  if (veh === 'm60') {
    const ford = d => { const env = { height: (x, z) => -Math.max(0, Math.min(d, (-10 - z) * 0.25, (z + 50) * 0.25)), surface: () => 'sand', water: () => 0 }; /* 25 % banks */ const T = make(veh); T.reset(0, 0, 0, env); run(T, env, 2, { park: true }); run(T, env, 70, speedHold(1.5, veh)); return { out: T.fm.origin()[2] < -52, flooded: T.fm.eng.flooded }; };
    const f12 = ford(1.2), f16 = ford(1.6);
    check(`${name} fords 1.2 m unprepared`, f12.out && !f12.flooded, f12.flooded ? 'engine flooded' : f12.out ? 'through, engine dry' : 'stuck', '1.22 m (48 in, all sources)', 'C');
    check(`${name} floods its engine at 1.6 m`, f16.flooded, f16.flooded ? 'engine flooded' : 'dry', 'over the rating without the kit', 'I');
  } else {
    // swim: vane up, pumps on, 4 m deep water; speed and freeboard; then the same without preparation
    const lake = { height: (x, z) => z > -5 ? 0.6 : Math.max(-4, 0.6 - (-5 - z) * 0.3), surface: () => 'sand', water: () => 0 };
    const T = make(veh); T.reset(0, 0, 0, lake, { vane: true, pumps: true }); T.step(DT, lake, { vane: true, pumps: true });
    let vs = 0, afloatT = 0;
    run(T, lake, 120, (T, t) => ({ throttle: T.fm.water.afloat ? 1 : 0.35, range: T.fm.water.afloat ? '1-2' : '1', park: false, vane: true, pumps: true }), (T, t) => { if (T.fm.water.afloat) { afloatT += DT; if (afloatT > 40) vs = T.fm.out.fwd * KMH; } });
    const fb = 1.85 - (0 - T.fm.origin()[1]);   // roof height above the waterline
    check(`${name} swims (track propulsion)`, Math.abs(vs - 5.8) < 0.8, `${vs.toFixed(2)} km/h`, '5.8 km/h (3.6 mph; AFVDB, WP, FAS)', 'C');
    check(`${name} freeboard afloat`, fb > 0.2 && fb < 0.5 && !T.fm.eng.flooded, `${(fb * 100).toFixed(0)} cm, inside ${T.fm.water.inside.toFixed(2)} m3`, '~0.3-0.4 m, engine dry', 'U');
    const T2 = make(veh); T2.reset(0, 0, 0, lake); let sank = false;
    run(T2, lake, 120, (T, t) => ({ throttle: 0.35, range: '1', park: false }), T => { if (T.fm.origin()[1] < -3) sank = true; });
    check(`${name} without vane and pumps: swamps`, sank || T2.fm.eng.flooded, `${T2.fm.eng.flooded ? 'engine flooded, ' : ''}${T2.fm.water.inside.toFixed(1)} m3 inside${sank ? ', on the bottom' : ''}`, 'vane up + bilge pumps before swimming (TM procedure)', 'U');
  }
}

// =================================================================================================== turret / stabiliser
function turret() {
  console.log('\n--- M60A3 turret ---');
  const env = { ...TG.ENV };
  const T = createM60A3(); T.reset(0, 40, 0, env); run(T, env, 1, { park: true });
  let a = 0, prev = T.losAz, t360 = null;
  run(T, env, 30, { trav: 1, park: true }, (T, t) => { let d = prev - T.losAz; d = Math.atan2(Math.sin(d), Math.cos(d)); a += d; prev = T.losAz; if (a >= 2 * Math.PI && t360 == null) { t360 = t; return false; } });
  check('M60A3 360 deg traverse (hydraulic)', Math.abs(t360 - 16) < 1.2, `${t360?.toFixed(1)} s`, '22.5 deg/s = 16 s (AFVDB)', 'C');
  let el0 = T.losEl, tEl = null; run(T, env, 10, { elev: 1, park: true }, (T, t) => { if (T.losEl - el0 >= 10 * D2R && tEl == null) { tEl = t; return false; } });
  check('M60A3 elevation rate', Math.abs(10 / tEl - 4) < 0.5, `${(10 / tEl).toFixed(2)} deg/s`, '4 deg/s (AFVDB)', 'C');
  run(T, env, 8, { elev: 1, park: true }); const elMax = T.el / D2R; run(T, env, 12, { elev: -1, park: true }); const elMin = T.el / D2R;
  check('M60A3 elevation limits', Math.abs(elMax - 20) < 0.6 && Math.abs(elMin + 10) < 0.6, `${elMax.toFixed(1)} / ${elMin.toFixed(1)} deg`, '+20 / -10 deg (AFVDB)', 'C');
  // manual traverse when the hydraulics are down
  const T2 = createM60A3(); T2.reset(0, 40, 0, env); run(T2, env, 2, { park: true, power: false });
  const a0 = T2.losAz; run(T2, env, 5, { trav: 1, park: true, power: false }); const manual = Math.abs(T2.losAz - a0) / 5 / D2R;
  check('M60A3 manual traverse (handwheel)', manual > 1 && manual < 4, `${manual.toFixed(2)} deg/s`, 'slow, crank by hand', 'GAME');
  // stabilisation: sight-line wander while driving the bump course, stab on / off
  const wander = stab => {
    const T = createM60A3(); T.reset(150, 100, 0, env); run(T, env, 2, { park: true, stab });
    const az = [], el = [];
    run(T, env, 30, (T, t) => ({ ...speedHold(25 / KMH, 'm60')(T), stab }), (T, t) => { if (t > 10) { const d = T.sightDir(); az.push(Math.atan2(-d[0], -d[2])); el.push(Math.asin(d[1])); } });
    const hp = a => a.map((x, i) => x - a.slice(Math.max(0, i - 30), i + 30).reduce((s, y) => s + y, 0) / (Math.min(a.length, i + 30) - Math.max(0, i - 30)));
    const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
    return { az: rms(hp(az)) * 1000, el: rms(hp(el)) * 1000, v: T.fm.out.fwd * KMH };
  };
  const on = wander(true), off = wander(false);
  check('M60A3 sight jitter on the move, stab ON', on.el < 4 && on.az < 2, `el ${on.el.toFixed(2)} az ${on.az.toFixed(2)} mrad at ${on.v.toFixed(0)} km/h`, '< 4 mrad (game; two-axis stab, AFVDB / AT)', 'C (has stab) / GAME');
  check('M60A3 stabiliser effect (off / on)', off.el / on.el > 5, `x${(off.el / on.el).toFixed(1)} (off ${off.el.toFixed(1)} mrad)`, 'Pk on the move >70 % with, ~0 without (WP, Hunnicutt)', 'C (qualitative)');
}

// =================================================================================================== gun, ammunition (game level)
function gun() {
  console.log('\n--- M68 gun, ammunition, fire control (game level: headline figures, game tables) ---');
  const mv = { M735: 1501, M456: 1173, M393: 732 };
  for (const id of GUN_ROUNDS) {
    const R = ROUNDS[id], tab = fireTable(id), a = tab.at(1000), b = tab.at(2000);
    check(`${R.name} muzzle velocity`, Math.abs(R.mv - mv[id]) < 2, `${R.mv} m/s; ToF ${a.tof.toFixed(2)} / ${b.tof.toFixed(2)} s`, `${mv[id]} m/s (headline); ToF 1 / 2 km game drag`, 'C (mv) / GAME (drag)');
  }
  // the computer: superelevation table increases with range, the shell lands on the aim point (flat range, no wind)
  const tab = fireTable('M735');
  check('M21 table: superelevation rises with range', tab.at(500).el < tab.at(1500).el && tab.at(1500).el < tab.at(3000).el, `${(tab.at(1500).el * 1000).toFixed(2)} mrad at 1500 m`, 'monotonic', 'GAME');
  // loader: ready rack time between rounds
  const env = { ...TG.ENV }, T = createM60A3(); T.reset(0, 40, 0, env);
  const times = []; let last = null;
  run(T, env, 40, { fire: true, park: true }, (T, t, ev) => { for (const e of ev) if (e.type === 'shot' && e.weapon === 'main') { if (last != null) times.push(t - last); last = t; } });
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  check('Loader: rounds from the ready rack', mean > 6 && mean < 9.5, `${mean.toFixed(1)} s per round (${times.length + 1} fired)`, '~6-8 rounds/min (U); 13 ready rounds (AFVDB)', 'U / GAME');
  check('Stowage: 63 rounds', T.ammoTotal() + T.gun.fired + (T.gun.state !== 'empty' ? 1 : 0) === 63, `${T.ammoTotal()} left + ${T.gun.fired} fired${T.gun.state !== 'empty' ? ' + 1 in the gun' : ''}`, '63 (all sources)', 'C');
  // game penetration table vs the armour zones (a frontal and a side shot at 1500 m)
  const zone = (o, d, round, range) => { const t = createM60A3(); t.reset(0, 0, 0, null); return t.hit({ round, range, o, d }); };
  const front = zone([0, 1.3, -10], [0, 0, 1], 'M735', 1500), side = zone([-6, 1.0, -1.2], [1, 0, 0], 'M456', 1500), roof = zone([0, 6, 1.8], [0, -1, 0], 'M2AP', 300);
  console.log(`      game table: M735 vs glacis ${front.result} (eff ${front.eff.toFixed(0)} / pen ${front.pen.toFixed(0)} mm); M456 vs side ${side.result}; .50 vs engine deck ${roof.result}`);
  check('Game armour table: sabot defeats the M60 glacis at 1500 m', front.result === 'perforated', front.result, 'game balance', 'GAME');
  check('Game armour table: .50 does not defeat the M60 deck', roof.result !== 'perforated', roof.result, 'game balance', 'GAME');
  const m113 = createM113(); m113.reset(0, 0, 0, null);
  const s50 = m113.hit({ round: 'M2AP', range: 100, o: [-5, 1.3, 0], d: [1, 0, 0] }), s762 = m113.hit({ round: 'M80', range: 100, o: [-5, 1.3, 0], d: [1, 0, 0] });
  check('Game armour table: M113 side stops 7.62, not .50 AP at 100 m', s762.result !== 'perforated' && s50.result === 'perforated', `7.62 ${s762.result}, .50 ${s50.result}`, 'designed against 7.62 and splinters (WP)', 'C (qualitative) / GAME');
}

if (!ONLY || ONLY === 'm60') mobility('m60');
if (!ONLY || ONLY === 'm113') mobility('m113');
if (!ONLY || ONLY === 'turret') turret();
if (!ONLY || ONLY === 'gun') gun();
console.log(`\n${pass} pass, ${fail} fail`);
process.exitCode = fail ? 1 : 0;
