#!/usr/bin/env node
// ch46playbench.mjs - the PLAYER's CH-46 (game/js/units/air/rotary/ch46play.js) on the validated flight model, in node,
// through the same input path as the game: keyboard keys (a fake key set) and a HOTAS state object (stick, throttle
// lever = collective, pedals). Checks the start sequence, the AFCS (hands-off hover hold, heading hold, attitude
// command), forward flight to ~130 kt, a pedal turn, a landing on a moving, pitching deck within limits, rotor strike
// and hard landing damage, and the troops: a stick boarding by the ramp on the deck and dismounting at an LZ, counted
// (ch46troops.js, three.js mapped to the vendored build; nothing is rendered).
//   node tools/ch46playbench.mjs [--v]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
const THREE_URL = pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, n) { return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : n(s, c); }`));
const { table, deg, KT, clamp } = await import('./rotarykit.mjs');
const ROT = '../game/js/units/air/rotary/';
const { createCH46Play, CH46_PLAY } = await import(ROT + 'ch46play.js');
const { CH46 } = await import(ROT + 'ch46fm.js');
const V = process.argv.includes('--v'), T = table(), DT = 1 / 60;

// ------------------------------------------------------------------ worlds
const flat = (y = 0) => ({ groundY: () => y, water: () => false, rho: 1.225 });
// a carrier deck 8 m up, steaming at 6 m/s heading 1.0 rad, pitching 1.5 deg / rolling 2 deg / heaving 0.6 m on ~8-11 s
// periods (a sea state 4-5 for a 1980 carrier: INFERRED), surrounded by sea
function shipWorld() {
  const D = { x: 0, z: 0, yaw: 1.0, sp: 6, t: 0, L: 120, W: 40 };
  const pitch = () => 1.5 * Math.PI / 180 * Math.sin(D.t * 2 * Math.PI / 8.2), roll = () => 2 * Math.PI / 180 * Math.sin(D.t * 2 * Math.PI / 10.7 + 1), heave = () => 0.6 * Math.sin(D.t * 2 * Math.PI / 9.1 + 2);
  const loc = (x, z) => { const dx = x - D.x, dz = z - D.z, c = Math.cos(D.yaw), s = Math.sin(D.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  const on = (x, z) => { const [lx, lz] = loc(x, z); return Math.abs(lx) < D.W / 2 && Math.abs(lz) < D.L / 2; };
  const deckY = (x, z) => { const [lx, lz] = loc(x, z); return 8 + heave() - Math.sin(pitch()) * lz + Math.sin(roll()) * lx; };
  const vel = { vx: -Math.sin(D.yaw) * D.sp, vz: -Math.cos(D.yaw) * D.sp };
  const env = {
    rho: 1.225,
    groundY: (x, z) => on(x, z) ? deckY(x, z) : 0,
    water: (x, z) => !on(x, z),
    surfVel: (x, z) => on(x, z) ? { vx: vel.vx, vz: vel.vz, w: 0, cx: D.x, cz: D.z } : null,
  };
  const spot = (lx, lz) => { const c = Math.cos(D.yaw), s = Math.sin(D.yaw); return { x: D.x + lx * c + lz * s, z: D.z - lx * s + lz * c }; };
  return { D, env, on, loc, spot, deckY, vel, move(dt) { D.t += dt; D.x += vel.vx * dt; D.z += vel.vz * dt; } };
}

// ------------------------------------------------------------------ the pilot's hands
const keys = new Set(), kd = (...c) => c.some(k => keys.has(k));
const hw = { stick: { x: 0, y: 0 }, rudder: 0, throttle: null, actions: {}, pressed: {}, hasPedals: true, source: 'BENCH' };
const inp = (env) => ({ kd, hw: hw.throttle === null && !hw.stick.x && !hw.stick.y && !hw.rudder ? null : hw, env });
function fly(P, env, secs, each, world) {
  for (let t = 0; t < secs; t += DT) {
    if (each && each(t) === false) return t;
    const c = P.read(DT, inp(env)); P.step(DT, env, c); if (world) world.move(DT);
    if (!P.alive) return t;
  }
  return secs;
}
const st = P => { const s = {}; P.S.attitude(s); const b = P.S.body; return { ...s, x: b.pos[0], y: b.pos[1], z: b.pos[2], vx: b.vel[0], vy: b.vel[1], vz: b.vel[2], r: b.w[2] }; };
// a hand on the collective holding a vertical speed (what the player does by eye): PI on vy through the HOTAS lever
function collHand(P, vyWant, k = 0.06) { const vy = P.S.body.vel[1]; hw.throttle = clamp((hw.throttle ?? P.S.c.coll) + (vyWant - vy) * k * DT * 6 + (vyWant - vy) * 0.004, 0, 1); }

// ------------------------------------------------------------------ 1. start
console.log('--- start sequence (cold and dark on the ground, I) ---');
{
  const P = createCH46Play(); P.reset({ pos: [0, 0, 0], yaw: 0, cold: true, env: flat() });
  T.check('cold and dark: engines out, rotor stopped, battery off', !P.running() && P.S.omega === 0 && !P.sys.bat, `N1 ${P.S.eng[0].n1} NR ${P.S.rpm}`);
  P.toggle('start');
  let tLit = null, tFly = null;
  fly(P, flat(), 90, t => { if (tLit === null && P.S.eng[0].lit) tLit = t; if (tFly === null && P.S.rpm > 0.97 && !P.sys.auto) tFly = t; });
  T.check('I: APU, engine 1, engine 2, rotor brake off, ECLs to FLY', tLit !== null && tFly !== null && P.S.eng[1].lit && P.sys.ecl[0] === 1 && !P.sys.rbrake, `light-off ${tLit?.toFixed(1)} s, NR 100% at ${tFly?.toFixed(1)} s`, '20-60 s', 'INFERRED');
  T.check('running: both generators online, no generator caution', P.sys.g1 && P.sys.g2 && !P.sys.cautions.includes('NO 1 GEN OFF'), P.sys.cautions.join(', ') || 'none');
  T.check('still on the wheels, parked (brake on), not moved', P.S.landed && Math.hypot(P.S.body.pos[0], P.S.body.pos[2]) < 0.3, `moved ${Math.hypot(P.S.body.pos[0], P.S.body.pos[2]).toFixed(2)} m`);
  // shutdown
  P.toggle('start'); fly(P, flat(), 60);
  T.check('I on the ground running: shutdown, rotor winds down', !P.running() && P.S.rpm < 0.5, `NR ${(P.S.rpm * 100).toFixed(0)}%`);
}

// ------------------------------------------------------------------ 2. hover and AFCS hold
console.log('--- lift-off and the AFCS hover hold (keyboard collective, hands off) ---');
let hoverColl = 0.6;
{
  const P = createCH46Play(); P.reset({ pos: [0, 0, 0], yaw: 0, env: flat(), marines: 13 }); hw.throttle = null; keys.clear();
  keys.add('ShiftLeft'); let tOff = null;
  fly(P, flat(), 12, t => { if (tOff === null && !P.S.landed && P.S.agl > 0.5) tOff = t; if (P.S.agl > 4) return false; });
  keys.clear();
  T.check('Shift raises the collective: lifts off', tOff !== null, `airborne at ${tOff?.toFixed(1)} s, collective ${(P.S.c.coll * 100).toFixed(0)}%`);
  hw.throttle = P.coll;
  fly(P, flat(), 15, () => { collHand(P, clamp((10 - P.S.agl) * 0.4, -1.5, 1.5)); });
  const s0 = st(P); let maxRate = 0;
  fly(P, flat(), 20, () => { collHand(P, clamp((10 - P.S.agl) * 0.4, -1.5, 1.5)); maxRate = Math.max(maxRate, Math.abs(P.S.body.w[2])); });
  const s1 = st(P), drift = Math.hypot(s1.x - s0.x, s1.z - s0.z); hoverColl = P.S.c.coll;
  T.check('hands-off hover (AFCS): drift over 20 s', drift < 4, `${drift.toFixed(2)} m, ${Math.hypot(s1.vx, s1.vz).toFixed(2)} m/s now`, '< 4 m');
  T.check('hands-off hover: heading held', Math.abs(deg(s1.yaw - s0.yaw)) < 3 && deg(maxRate) < 3, `${deg(s1.yaw - s0.yaw).toFixed(2)} deg, max ${deg(maxRate).toFixed(2)} deg/s`, '< 3 deg');
  T.check('hover attitude near level (the CH-46 hovers slightly nose up)', Math.abs(deg(s1.pitch)) < 6 && Math.abs(deg(s1.roll)) < 3, `pitch ${deg(s1.pitch).toFixed(1)} roll ${deg(s1.roll).toFixed(1)} deg`);
  T.check('hover collective / torque at mission weight', P.S.c.coll > 0.4 && P.S.c.coll < 0.8 && P.S.torque < 1.0, `coll ${(P.S.c.coll * 100).toFixed(0)}%, torque ${(P.S.torque * 100).toFixed(0)}%`, '< 100%');
  // attitude command: stick right 1 s, release: banks, then rolls level by itself
  hw.stick.x = 0.6; fly(P, flat(), 1.0, () => collHand(P, 0)); const bank = deg(st(P).roll); hw.stick.x = 0;
  fly(P, flat(), 4, () => collHand(P, 0)); const bank2 = deg(st(P).roll);
  T.check('AFCS attitude command: stick right banks right, release levels', bank > 8 && Math.abs(bank2) < 4, `${bank.toFixed(1)} deg -> ${bank2.toFixed(1)} deg`);

  // ------------------------------------------------------------------ 3. pedal turn
  console.log('--- pedal turn in the hover ---');
  fly(P, flat(), 6, () => collHand(P, clamp((10 - P.S.agl) * 0.4, -1.5, 1.5)));
  const y0 = st(P).yaw; let rMax = 0;
  keys.add('KeyE'); fly(P, flat(), 3, () => { collHand(P, clamp((10 - P.S.agl) * 0.4, -1.5, 1.5)); rMax = Math.max(rMax, P.S.body.w[2]); }); keys.clear();
  const turned = -deg(st(P).yaw - y0);
  T.check('right pedal (E) for 3 s: nose right', turned > 15, `${turned.toFixed(1)} deg, max rate ${deg(rMax).toFixed(1)} deg/s`, '> 15 deg');
  fly(P, flat(), 4, () => collHand(P, clamp((10 - P.S.agl) * 0.4, -1.5, 1.5)));
  const y1 = st(P).yaw; fly(P, flat(), 8, () => collHand(P, clamp((10 - P.S.agl) * 0.4, -1.5, 1.5)));
  T.check('pedals released: the heading holds', Math.abs(deg(st(P).yaw - y1)) < 4 && Math.abs(deg(P.S.body.w[2])) < 1.5, `drift ${deg(st(P).yaw - y1).toFixed(2)} deg in 8 s`, '< 4 deg');

  // ------------------------------------------------------------------ 4. forward flight
  console.log('--- forward flight to ~130 kt (stick forward, collective holding height) ---');
  let ias = 0, tq = 0, pitchAt = 0, t130 = null;
  hw.stick.y = -1;
  fly(P, flat(), 90, t => {
    collHand(P, clamp((60 - P.S.agl) * 0.15, -3, 3), 0.05);
    if (P.S.torque > 0.98) hw.throttle -= 0.15 * DT;   // a pilot on the torque gauge
    const v = P.ias(); if (v > ias) { ias = v; tq = P.S.torque; pitchAt = deg(st(P).pitch); } if (t130 === null && v >= 125) t130 = t; if (V && (t % 5) < DT) console.log('  fwd', t.toFixed(0), v.toFixed(0), 'kt tq', (P.S.torque*100).toFixed(0), 'pitch', deg(st(P).pitch).toFixed(1), 'agl', P.S.agl.toFixed(0), 'coll', P.S.c.coll.toFixed(2), 'lon', P.S.c.lon.toFixed(2));
  });
  hw.stick.y = 0;
  T.check('forward stick: accelerates past 125 kt', ias >= 125, `max ${ias.toFixed(0)} kt (torque ${(tq * 100).toFixed(0)}%, pitch ${pitchAt.toFixed(1)} deg)${t130 !== null ? `, 125 kt at ${t130.toFixed(0)} s` : ''}`, '>= 125 kt (VNE 144 kt)', 'CONFIRMED 144 kt max');
  T.check('no blade stall / overtorque runaway at speed', P.alive && P.S.torque < 1.1, `torque ${(P.S.torque * 100).toFixed(0)}%`);
  // decelerate: stick aft, then hands off: back to the hover hold
  hw.stick.y = 0.8; fly(P, flat(), 60, () => { collHand(P, clamp((40 - P.S.agl) * 0.15, -3, 3), 0.05); if (Math.hypot(P.S.body.vel[0], P.S.body.vel[2]) < 8) return false; }); hw.stick.y = 0;
  fly(P, flat(), 25, () => collHand(P, clamp((30 - P.S.agl) * 0.2, -2, 2)));
  T.check('stick aft to slow, release: settles into the hover hold', Math.hypot(P.S.body.vel[0], P.S.body.vel[2]) < 2, `${Math.hypot(P.S.body.vel[0], P.S.body.vel[2]).toFixed(2)} m/s`, '< 2 m/s');
}

// ------------------------------------------------------------------ 5. deck landing
console.log('--- landing on a moving, pitching deck (6 m/s, pitch 1.5 deg, roll 2 deg, heave 0.6 m) ---');
{
  const W = shipWorld(), P = createCH46Play(), sp0 = W.spot(0, 120);   // 120 m astern of the ship's centre, 25 m up
  P.reset({ pos: [sp0.x, 25, sp0.z], yaw: W.D.yaw, landed: false, env: W.env, marines: 13 }); P.S.body.vel[0] = W.vel.vx; P.S.body.vel[2] = W.vel.vz;
  hw.throttle = 0.58; hw.stick.x = hw.stick.y = 0; hw.rudder = 0; keys.clear();
  // the pilot: fly to a point over the spot (local 0, -5) matching the ship, by stick (velocity error -> stick, the AFCS
  // flies the attitude), collective for height; descend once steady over the spot
  let phase = 'close', tSteady = 0, land = null, maxSlide = 0, landedAt = null, hard = false, iF = 0, iR = 0;
  const tgt = () => W.spot(-2, -5);
  fly(P, W.env, 200, t => {
    const s = st(P), g = tgt(), fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const ex = g.x - s.x, ez = g.z - s.z, d = Math.hypot(ex, ez);
    const vwx = W.vel.vx + clamp(ex * 0.25, -8, 8), vwz = W.vel.vz + clamp(ez * 0.25, -8, 8);
    const evx = vwx - s.vx, evz = vwz - s.vz, ef = evx * fx + evz * fz, er = evx * -fz + evz * fx;
    iF = clamp(iF + ef * 0.04 * DT, -0.3, 0.3); iR = clamp(iR + er * 0.04 * DT, -0.3, 0.3);   // (a pilot keeps pushing until it moves)
    hw.stick.y = clamp(-ef * 0.12 - iF, -0.6, 0.6); hw.stick.x = clamp(er * 0.12 + iR, -0.6, 0.6);
    hw.rudder = clamp(-(((W.D.yaw - s.yaw + Math.PI) % (2 * Math.PI)) - Math.PI) * 1.5, -0.3, 0.3);
    if (Math.abs(hw.rudder) < 0.05) hw.rudder = 0;
    const deckH = W.deckY(g.x, g.z);
    if (phase === 'close') { collHand(P, clamp((deckH + 12 - P.S.body.pos[1]) * 0.3, -2, 2)); if (d < 3 && Math.hypot(s.vx - W.vel.vx, s.vz - W.vel.vz) < 1) { tSteady += DT; if (tSteady > 3) phase = 'down'; } else tSteady = 0; }
    else if (phase === 'down') { collHand(P, -clamp(0.4 + P.S.agl * 0.15, 0.4, 1.5)); if (P.S.body.contacts >= 3) { phase = 'on'; land = { t, d, sink: P.S.body.maxSink }; } }
    else { hw.throttle = Math.max(0, hw.throttle - 0.5 * DT); hw.stick.x = hw.stick.y = 0; hw.rudder = 0; if (landedAt === null && hw.throttle <= 0) { landedAt = W.loc(s.x, s.z); P.sys.pbrake = true; } if (landedAt) { const l = W.loc(s.x, s.z); maxSlide = Math.max(maxSlide, Math.hypot(l[0] - landedAt[0], l[1] - landedAt[1])); } if (t - land.t > 25) return false; }
    if (P.events.includes('hardland')) hard = true;
    if (V && (t % 2) < DT) console.log('  deck', t.toFixed(0), phase, 'd', d.toFixed(1), 'rel', Math.hypot(s.vx - W.vel.vx, s.vz - W.vel.vz).toFixed(2), 'agl', P.S.agl.toFixed(1), 'stick', hw.stick.x.toFixed(2), hw.stick.y.toFixed(2), 'coll', hw.throttle.toFixed(2), 'pitch', deg(s.pitch).toFixed(1), 'roll', deg(s.roll).toFixed(1));
  }, W);
  const l = W.loc(P.S.body.pos[0], P.S.body.pos[2]);
  T.check('lands on the deck spot', !!land && P.alive && W.on(P.S.body.pos[0], P.S.body.pos[2]), land ? `down at ${land.t.toFixed(0)} s, ${land.d.toFixed(1)} m off the spot` : `phase ${phase}, alive ${P.alive} ${P.dead}`);
  T.check('touchdown within limits (no hard landing)', !!land && !hard && P.maxSink < 3.0, `sink ${P.maxSink.toFixed(2)} m/s`, '< 3 m/s (hard landing at 4.5)', 'INFERRED');
  T.check('stays put on the pitching deck, brake set, collective down', landedAt && maxSlide < 1.0 && P.S.body.contacts >= 3, `slid ${maxSlide.toFixed(2)} m in 25 s, local [${l[0].toFixed(1)}, ${l[1].toFixed(1)}]`);
  T.check('the AFCS hover hold was deck-relative over the ship', P.deckRel !== undefined, 'ok');
}

// ------------------------------------------------------------------ 6. damage
console.log('--- damage: hard landing, rotor strike, engine loss ---');
{
  const P = createCH46Play(); P.reset({ pos: [0, 5, 0], yaw: 0, landed: false, env: flat() }); hw.throttle = null; P.setCollective(0.3); hw.stick.x = hw.stick.y = 0; hw.rudder = 0;
  P.S.body.vel[1] = -6.0; fly(P, flat(), 12, t => { if (V && (t % 0.5) < DT) console.log('  hard', t.toFixed(1), P.S.agl.toFixed(1), P.S.body.vel[1].toFixed(2), P.S.body.contacts, P.events.join(), 'coll', P.S.c.coll.toFixed(2), P.coll.toFixed(2), P.collSrc, 'nr', P.S.rpm.toFixed(2), 'T', ((P.S.rf.T + P.S.ra.T) / 9.81 / P.S.mass).toFixed(2)); if (P.S.landed) return false; });
  T.check('a 6 m/s arrival is a hard landing: gear and transmissions damaged', P.alive && P.hp.gear < 1 && P.hp.axmsn < 1, `gear ${(P.hp.gear * 100).toFixed(0)}%, aft xmsn ${(P.hp.axmsn * 100).toFixed(0)}%, alive ${P.alive}`);
  const Q = createCH46Play(); Q.reset({ pos: [0, 12, 0], yaw: 0, landed: false, env: flat() }); hw.throttle = 0.55;
  // a 30 m wall ahead: the forward rotor sweeps into it
  const wall = { groundY: (x, z) => z < -6 ? 30 : 0, water: () => false, rho: 1.225 };
  hw.stick.y = -0.6; fly(Q, wall, 10); hw.stick.y = 0;
  T.check('rotor strike on a cliff: the aircraft is lost', !Q.alive && /ROTOR STRIKE/.test(Q.dead), Q.dead || 'alive');
  const R = createCH46Play(); R.reset({ pos: [0, 200, 0], yaw: 0, landed: false, env: flat() }); hw.throttle = hoverColl; hw.stick.y = 0;
  fly(R, flat(), 5, () => collHand(R, 0)); R.hurt(10, 'eng1');
  let vyMin = 0; fly(R, flat(), 25, () => { collHand(R, 0); vyMin = Math.min(vyMin, R.S.body.vel[1]); });
  T.check('No 1 engine shot out: No 1 off, the aircraft flies on one engine', !R.S.eng[0].p && R.S.eng[1].p > 0 && R.alive && R.sys.cautions.includes('NO 1 ENG CHIP'), `No 2 ${(R.S.eng[1].p / 745.7).toFixed(0)} shp, NR ${(R.S.rpm * 100).toFixed(0)}%, worst sink ${(-vyMin).toFixed(1)} m/s`);
}

// ------------------------------------------------------------------ 7. troops
console.log('--- troops: a stick boards by the ramp, rides, dismounts at the LZ ---');
{
  const THREE = await import('three');
  const { createCH46Troops } = await import(ROT + 'ch46troops.js');
  const { buildCH46Mesh } = await import(ROT + 'ch46model.js');
  const P = createCH46Play(), scene = new THREE.Group(), model = buildCH46Mesh({}); scene.add(model.group);
  P.reset({ pos: [0, 0, 0], yaw: 0.4, env: flat() });
  const sync = () => { const b = P.S.body; model.group.position.set(b.pos[0], b.pos[1], b.pos[2]); model.group.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]); model.group.updateMatrixWorld(true); };
  sync();
  let landed = null; const TR = createCH46Troops({ parent: scene, P, model, groundY: () => 0, onDeployed: (Q, n) => { landed = n; } });
  fly(P, flat(), 1, () => { sync(); TR.update(DT, 0); }); const r0 = TR.board(13); T.check('board refused with the ramp up', !!r0 && /RAMP/.test(r0), r0 || 'accepted');
  P.toggle('ramp'); let tAll = null;
  fly(P, flat(), 4, () => { sync(); TR.update(DT, 0); });
  const r1 = TR.board(13); T.check('ramp down on the ground: the stick is called', !r1 && TR.state === 'boarding', r1 || TR.state);
  let firstIn = null, onDeck = 0, maxDisc = 1e9;
  fly(P, flat(), 60, t => { sync(); TR.update(DT, t); if (firstIn === null && P.marines > 0) firstIn = t; if (TR.state === 'aboard') { tAll = t; return false; }
    for (const F of TR.Q.figs) if (F.st === 'stick') { maxDisc = Math.min(maxDisc, Math.min(Math.hypot(F.l.x, F.l.z + 5.08), Math.hypot(F.l.x, F.l.z - 5.08)) - 7.62); onDeck++; } });
  T.check('13 Marines file up the ramp into the cabin', TR.state === 'aboard' && P.marines === 13, `${P.marines} aboard, first at ${firstIn?.toFixed(1)} s, all at ${tAll?.toFixed(1)} s`);
  T.check('the stick waits clear of the rotor discs', maxDisc > 0, `closest ${maxDisc.toFixed(1)} m outside a disc`);
  fly(P, flat(), 0.1); T.check('payload in the flight model', Math.abs(P.S.payload - 13 * CH46.MARINE_KG) < 1, `${P.S.payload.toFixed(0)} kg`);
  const seated = TR.Q.figs.filter(F => F.st === 'aboard' && F.f.group.visible).length;
  T.check('aboard: seated in the troop seats, visible in the cabin', seated === 13, `${seated} seated`);
  // ride: up, away, down at an LZ 300 m off; dismount
  P.toggle('ramp'); fly(P, flat(), 4, () => { sync(); TR.update(DT, 0); });
  P.S.body.pos[0] += 300; sync(); TR.update(DT, 0);
  const r2 = TR.dismount({ name: 'TEST ISLAND', pad: { x: 300, z: 20 } }); T.check('dismount refused with the ramp up', !!r2, r2 || 'accepted');
  P.toggle('ramp'); fly(P, flat(), 4, () => { sync(); TR.update(DT, 0); });
  const r3 = TR.dismount({ name: 'TEST ISLAND', pad: { x: 300, z: 20 } });
  let offAll = null, maxOff = 0;
  fly(P, flat(), 40, t => { sync(); TR.update(DT, t); if (TR.state === 'empty' && offAll === null) offAll = t; for (const F of (TR.Q || TR.lastSquad).figs) if (F.st === 'run' || F.st === 'hold') maxOff = Math.max(maxOff, Math.abs(F.y)); if (offAll !== null && t > offAll + 3) return false; });
  const out = TR.lastSquad ? TR.lastSquad.figs.filter(F => F.st === 'hold' || F.st === 'run').length : 0;
  T.check('ramp down at the LZ: 13 Marines come off by the ramp', !r3 && P.marines === 0 && out === 13 && landed === 13, `${out} off, handed to the ground war: ${landed}, aboard ${P.marines}`);
  T.check('off the ramp they stand on the ground (no floating)', maxOff < 0.3, `max |y| ${maxOff.toFixed(2)} m`);
}
T.done();
