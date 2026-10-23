#!/usr/bin/env node
// navalbench.mjs - the ship motion model (game/js/units/naval/seamotion.js) against published seakeeping numbers,
// in plain node: sea-state table, significant motions of a big-deck carrier by sea state, heading and speed, the
// encounter period, the turn heel, and the deck-height maths used by war.js deckY().   node tools/navalbench.mjs [--v]
import { SEA_STATES, SHIPS, makeSea, createShipMotion, shipPointY, shipPointVY } from '../game/js/units/naval/seamotion.js';

let pass = 0, fail = 0;
const check = (name, ok, got, want, tag = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${got}${want ? '   (want ' + want + ')' : ''}${tag ? '  [' + tag + ']' : ''}`); };
const deg = r => r * 180 / Math.PI;
const verbose = process.argv.includes('--v');

// significant single amplitude (2 sigma) of each motion over a long run; heading mu = wave direction - ship yaw
function stats(ship, ss, mu, U, { T = 1800, dt = 0.1, seed = 3, spread = true } = {}) {
  const P = SHIPS[ship], sea = makeSea(ss, mu, seed, 14, spread), mo = createShipMotion(P, sea, seed);
  let n = 0; const s = { h: 0, p: 0, r: 0, vz: 0 }; let zc = 0, last = 0, firstCross = -1, lastCross = 0;
  for (let t = 0; t < T; t += dt) {
    mo.step(dt, U * P.scale, 0, 0);
    const vz = shipPointVY(mo.vHeave / P.scale, mo.pitch, mo.roll, mo.vPitch, mo.vRoll, 0, 0, P.L * 0.48);   // at the ramp, real m/s
    s.h += (mo.heave / P.scale) ** 2; s.p += mo.pitch ** 2; s.r += mo.roll ** 2; s.vz += vz ** 2; n++;
    const pz = mo.pitch - mo.trim; if (last < 0 && pz >= 0) { zc++; if (firstCross < 0) firstCross = t; lastCross = t; }
    last = pz;
  }
  const sa = v => 2 * Math.sqrt(v / n);
  return { heave: sa(s.h), pitch: deg(sa(s.p)), roll: deg(sa(s.r)), vz: sa(s.vz), Tz: zc > 1 ? (lastCross - firstCross) / (zc - 1) : 0 };
}

console.log('--- sea state table ---');
{
  const ok = SEA_STATES[3].hs >= 0.5 && SEA_STATES[3].hs <= 1.25 && SEA_STATES[4].hs >= 1.25 && SEA_STATES[4].hs <= 2.5 && SEA_STATES[5].hs >= 2.5 && SEA_STATES[5].hs <= 4 && SEA_STATES[6].hs >= 4 && SEA_STATES[6].hs <= 6;
  check('Hs inside the WMO / NATO ranges for SS3..6', ok, SEA_STATES.slice(3, 7).map(s => s.hs).join(' / ') + ' m', '0.5-1.25 / 1.25-2.5 / 2.5-4 / 4-6', 'CONFIRMED (WMO code 3700)');
  const sea = makeSea(5, 0, 9), m0 = sea.comps.reduce((s, c) => s + c.a * c.a / 2, 0);
  check('discretised sea reproduces Hs = 4 sqrt(m0)', Math.abs(4 * Math.sqrt(m0) - 3.25) < 0.01, `${(4 * Math.sqrt(m0)).toFixed(2)} m`, '3.25 m');
}

console.log('--- ALBATROSS (Midway-class, 274 m LWL) significant single amplitudes ---');
const head = 'ship  SS  heading      kn   heave m  pitch°  roll°   ramp vz m/s  Tz(pitch) s';
console.log('  ' + head);
const row = (ship, ss, mu, kn, r) => console.log(`  ${ship.slice(0, 4)}  ${ss}   ${String(Math.round(deg(mu))).padStart(3)}° ${(['following', 'quartering', 'beam', 'bow', 'head'][Math.round(deg(mu) / 45)] || '').padEnd(10)} ${String(kn).padStart(3)}   ${r.heave.toFixed(2).padStart(6)}  ${r.pitch.toFixed(2).padStart(5)}  ${r.roll.toFixed(2).padStart(5)}   ${r.vz.toFixed(2).padStart(6)}       ${r.Tz.toFixed(1)}`);
const KN = 0.5144, HEAD = Math.PI, BEAM = Math.PI / 2, BOW = Math.PI * 0.75;
const A = {};
for (const ss of [3, 4, 5, 6]) { A[ss] = stats('albatross', ss, HEAD, 15 * KN); row('albatross', ss, HEAD, 15, A[ss]); }
const beam5 = stats('albatross', 5, BEAM, 15 * KN), bow5 = stats('albatross', 5, BOW, 15 * KN), beam5s = stats('albatross', 6, BEAM, 28 * KN, { spread: false }), beam5z = stats('albatross', 6, BEAM, 0, { spread: false }), head5l = stats('albatross', 5, HEAD, 15 * KN, { spread: false }), beam5l = stats('albatross', 5, BEAM, 15 * KN, { spread: false });
row('albatross', 5, BEAM, 15, beam5); row('albatross', 5, BEAM, 28, beam5s); row('albatross', 5, BEAM, 0, beam5z); row('albatross', 5, BOW, 15, bow5);
// Reference bands for a 270-320 m carrier, head seas ~15 kn (INFERRED from published CV / CVN seakeeping summaries:
// pitch rarely exceeds ~1 deg SA below SS5 and stays within ~2.5 deg in SS6; flight ops limits (STANAG 4154 / NAVAIR)
// pitch 1-1.5 deg, roll 2-4 deg, ramp vertical velocity ~2-3 m/s are reached around SS5-6).
check('SS3 head seas: deck nearly still (pitch < 0.35°)', A[3].pitch < 0.35, `${A[3].pitch.toFixed(2)}°`, '< 0.35°', 'INFERRED');
check('SS4 head seas: pitch 0.2-0.9° SA', A[4].pitch > 0.2 && A[4].pitch < 0.9, `${A[4].pitch.toFixed(2)}°`, '0.2-0.9°', 'INFERRED');
check('SS5 head seas: pitch 0.6-1.6° SA', A[5].pitch > 0.6 && A[5].pitch < 1.6, `${A[5].pitch.toFixed(2)}°`, '0.6-1.6°', 'INFERRED');
check('SS6 head seas: pitch 1.2-2.8° SA', A[6].pitch > 1.2 && A[6].pitch < 2.8, `${A[6].pitch.toFixed(2)}°`, '1.2-2.8°', 'INFERRED');
check('SS5 head seas: heave 0.2-1.4 m SA', A[5].heave > 0.2 && A[5].heave < 1.4, `${A[5].heave.toFixed(2)} m`, '0.2-1.4 m', 'INFERRED');
check('SS5 ramp vertical velocity 0.5-2.5 m/s SA', A[5].vz > 0.5 && A[5].vz < 2.5, `${A[5].vz.toFixed(2)} m/s`, '0.5-2.5 m/s', 'INFERRED (NAVAIR recovery limit ~3 m/s)');
check('SS5 beam seas: roll 0.7-5° SA', beam5.roll > 0.7 && beam5.roll < 5, `${beam5.roll.toFixed(2)}°`, '0.7-5°', 'INFERRED');
check('beam seas roll more than head seas', beam5.roll > 3 * A[5].roll, `${beam5.roll.toFixed(2)}° vs ${A[5].roll.toFixed(2)}°`, '');
check('long-crested: head seas pitch far more than beam seas', head5l.pitch > 3 * beam5l.pitch, `${head5l.pitch.toFixed(2)}° vs ${beam5l.pitch.toFixed(2)}°`, '');
check('motions grow monotonically with sea state', A[3].pitch < A[4].pitch && A[4].pitch < A[5].pitch && A[5].pitch < A[6].pitch, [3, 4, 5, 6].map(s => A[s].pitch.toFixed(2)).join(' < '));
check('roll damping grows with speed (long-crested SS6 beam: 28 kn rolls less than 0 kn)', beam5s.roll < beam5z.roll, `${beam5s.roll.toFixed(2)}° at 28 kn vs ${beam5z.roll.toFixed(2)}° stopped`, '', 'CONFIRMED trend (Ikeda lift damping)');

console.log('--- encounter period ---');
{
  const h = stats('albatross', 5, HEAD, 25 * KN), f = stats('albatross', 5, 0, 25 * KN);
  console.log(`  pitch zero-crossing period at 25 kn: head ${h.Tz.toFixed(1)} s, following ${f.Tz.toFixed(1)} s`);
  check('head seas: shorter encounter period than following seas', h.Tz < f.Tz, `${h.Tz.toFixed(1)} s < ${f.Tz.toFixed(1)} s`, '', 'CONFIRMED (we = w - k U cos mu)');
}

console.log('--- size: small ships move more ---');
{
  const k = stats('kraken', 5, HEAD, 15 * KN), l = stats('leviathan', 5, HEAD, 15 * KN), c = stats('container', 5, BEAM, 10 * KN), cb = stats('albatross', 5, BEAM, 10 * KN);
  row('kraken', 5, HEAD, 15, k); row('leviathan', 5, HEAD, 15, l); row('container', 5, BEAM, 10, c);
  check('Ford-class pitches less than the Midway-class', k.pitch < A[5].pitch, `${k.pitch.toFixed(2)}° < ${A[5].pitch.toFixed(2)}°`, '');
  check('96 m monitor: SS5 head-sea pitch 2-6° SA (frigate-size)', l.pitch > 2 && l.pitch < 6, `${l.pitch.toFixed(2)}°`, '2-6°', 'INFERRED (frigates ~3-5° SS5)');
  check('80 m feeder: SS5 beam-sea roll 4-14° SA', c.roll > 4 && c.roll < 14, `${c.roll.toFixed(2)}°`, '4-14°', 'INFERRED');
  check('feeder rolls far more than the carrier', c.roll > 2 * cb.roll, `${c.roll.toFixed(2)}° vs ${cb.roll.toFixed(2)}°`, '');
}

console.log('--- turn heel ---');
{
  const P = SHIPS.albatross, mo = createShipMotion(P, makeSea(0, 0, 1), 1), U = 30 * KN, r = 1.5 * Math.PI / 180;
  for (let t = 0; t < 60; t += 0.1) mo.step(0.1, U * P.scale, 0, r);
  const want = -Math.atan(U * r / 9.81 * P.kh);
  console.log(`  30 kn, 1.5°/s turn to port: heel ${deg(mo.roll).toFixed(2)}° (theory ${deg(want).toFixed(2)}°)`);
  check('steady heel outward (to starboard in a port turn)', mo.roll < 0 && Math.abs(mo.roll - want) < 0.1 * Math.abs(want), `${deg(mo.roll).toFixed(2)}°`, `${deg(want).toFixed(2)}° (tan phi = V r / g (KG - T/2) / GM)`, 'CONFIRMED formula, INFERRED KG/GM');
  check('carrier hard-turn heel 3-8°', Math.abs(deg(mo.roll)) > 3 && Math.abs(deg(mo.roll)) < 8, `${Math.abs(deg(mo.roll)).toFixed(1)}°`, '3-8°', 'INFERRED (CVs heel several degrees at 30 kn)');
}

console.log('--- deck height maths (war.js deckY) ---');
{
  // compare with an explicit rotation matrix: R = Ry(yaw) Rx(pitch) Rz(roll), 'YXZ'
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const p = (Math.random() - 0.5) * 0.2, r = (Math.random() - 0.5) * 0.3, lx = (Math.random() - 0.5) * 28, ly = 8, lz = (Math.random() - 0.5) * 120;
    const x1 = lx * Math.cos(r) - ly * Math.sin(r), y1 = lx * Math.sin(r) + ly * Math.cos(r), z1 = lz;
    const y2 = y1 * Math.cos(p) - z1 * Math.sin(p);
    worst = Math.max(worst, Math.abs(y2 - shipPointY(0, 0, p, r, lx, ly, lz)));
    // and the rate by finite differences
    const dt = 1e-5, vp = (Math.random() - 0.5) * 0.05, vr = (Math.random() - 0.5) * 0.05;
    const fd = (shipPointY(0, 0, p + vp * dt, r + vr * dt, lx, ly, lz) - shipPointY(0, 0, p, r, lx, ly, lz)) / dt;
    worst = Math.max(worst, Math.abs(fd - shipPointVY(0, p, r, vp, vr, lx, ly, lz)));
  }
  check('shipPointY / VY match the mesh rotation (YXZ)', worst < 1e-4, `max err ${worst.toExponential(1)}`, '< 1e-4');
  const P = SHIPS.albatross, mo = createShipMotion(P, makeSea(4, Math.PI, 2), 2); let maxAft = 0;
  for (let t = 0; t < 600; t += 0.1) { mo.step(0.1, 6, 0, 0); maxAft = Math.max(maxAft, Math.abs(shipPointY(0, mo.heave, mo.pitch, mo.roll, -2.5, 8, 40) - 8)); }
  check('SS4 (game default 3): deck at the wires stays within 1 game m', maxAft < 1, `${maxAft.toFixed(2)} m peak`, '< 1 m', 'gameplay');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
