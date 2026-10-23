#!/usr/bin/env node
// rotarydeck.mjs - the AI transports (CH-46 off the ALBATROSS, MV-22 off the KRAKEN) lift off and land back on a deck
// that heaves, pitches and rolls in a seaway (units/naval/seamotion.js, the war's own sea and ship numbers), stepped the
// way the war steps them: one frame = the ship sails first (war.js W.update: ships come first in W.units), then the
// unit's update splits the frame into >= 30 Hz pilot steps. Frames of 1/30 s and of 0.1 s (the game's frame cap, and
// what tools/scenes/aisim.json uses), sea states 3..6, a few sea seeds. Checks: no rollover, no crash, the lift-off
// stays upright (bank / pitch against the deck), the deck landing is soft. The carrier zig-zags (a hard turn every 14 s)
// with war.js's turn rule, so the deck spot swings round and the ship heels in the turns.
//   node tools/rotarydeck.mjs [--v] [--at] [ch46|mv22]     SS=6 only that sea state; TRACE=mv22,3,1,0.1 the deck landing
//   of one run (kind, sea state, seed, frame) step by step
import { ROT, deg, table } from './rotarykit.mjs';
const { createPilot, stateOf } = await import(ROT + 'pilot.js');
const { createTransportAI } = await import(ROT + 'transportai.js');
const { attitude } = await import(ROT + 'rb.js');
const { SHIPS, makeSea, createShipMotion, shipPointY, shipPointVY } = await import('../game/js/units/naval/seamotion.js');
const V = process.argv.includes('--v'), only = process.argv.slice(2).find(a => !a.startsWith('--'));
const T = table();

// a carrier in a seaway (game size: 120 x 28 m, deck 8 m), steaming at 5 m/s, turning gently
function makeShip(kind, ss, seed) {
  const mo = createShipMotion(SHIPS[kind], makeSea(ss, -1.2, 11 + seed), 31 + seed * 7);
  const s = { x: 0, z: 0, yaw: 0.7, w: 0, sp: 6, tgt: 0.7, t: 0, seed, mo, a: { heave: 0, pitch: 0, roll: 0, vHeave: 0, vPitch: 0, vRoll: 0 }, L: 120, W: 28, H: 8 };
  s.toLocal = (x, z) => { const dx = x - s.x, dz = z - s.z, c = Math.cos(s.yaw), n = Math.sin(s.yaw); return [dx * c - dz * n, dx * n + dz * c]; };
  s.toWorld = (lx, lz) => { const c = Math.cos(s.yaw), n = Math.sin(s.yaw); return [s.x + lx * c + lz * n, s.z - lx * n + lz * c]; };
  s.on = (x, z) => { const [lx, lz] = s.toLocal(x, z); return Math.abs(lx) < s.W / 2 && Math.abs(lz) < s.L / 2 ? [lx, lz] : null; };
  s.vel = () => [-Math.sin(s.yaw) * s.sp, -Math.cos(s.yaw) * s.sp];
  s.sail = dt => {   // war.js sailShip: translate, turn, then the seaway
    s.t += dt; if (s.t % 14 < dt) s.tgt = s.yaw + ((Math.floor(s.t / 14) + s.seed) % 2 ? 1 : -1) * (0.6 + (s.t * 0.37 % 1.4));   // zig-zag: the carrier turns hard every 14 s
    const turn = Math.atan2(Math.sin(s.tgt - s.yaw), Math.cos(s.tgt - s.yaw)), rate = 0.09 * Math.min(1, Math.max(0.3, s.sp / 3));
    const ACC = 0.015, wT = Math.abs(turn) > 0.004 ? Math.sign(turn) * Math.min(rate, Math.sqrt(2 * ACC * Math.abs(turn))) : 0;   // war.js sailShip's turn rule (YAW_ACC)
    s.w += Math.max(-ACC * dt, Math.min(ACC * dt, wT - s.w));
    const [vx, vz] = s.vel(); s.x += vx * dt; s.z += vz * dt; s.yaw += s.w * dt;
    const m = s.mo.step(dt, s.sp, s.yaw, s.w); Object.assign(s.a, { heave: m.heave, pitch: m.pitch, roll: m.roll, vHeave: m.vHeave, vPitch: m.vPitch, vRoll: m.vRoll });
  };
  // a deck spot as rotary.js deckSpot() gives it
  s.spot = (lx, lz) => { const [x, z] = s.toWorld(lx, lz), [vx, vz] = s.vel(); return { x, y: s.H, z, hdg: s.yaw, vx: vx + s.w * (z - s.z), vz: vz - s.w * (x - s.x) }; };
  for (let t = 0; t < 30; t += 0.05) s.mo.step(0.05, s.sp, s.yaw, s.w);   // a sea already running
  s.sail(1e-3);
  return s;
}
// the war's env (rotary.js) over open sea with this one ship: groundY / water / surfVel exactly as war.js computes them
function makeEnv(s) {
  const deck = (x, z) => { const l = s.on(x, z); return l ? shipPointY(0, s.a.heave, s.a.pitch, s.a.roll, l[0], s.H, l[1]) : -1e9; };
  const groundY = (x, z) => Math.max(0, deck(x, z));
  const env = {
    groundY, water: (x, z) => !s.on(x, z),
    surfVel: (x, z) => { const l = s.on(x, z); if (!l) return null; const [vx, vz] = s.vel(); return { vx, vz, w: s.w, cx: s.x, cz: s.z, vy: shipPointVY(s.a.vHeave, s.a.pitch, s.a.roll, s.a.vPitch, s.a.vRoll, l[0], s.H, l[1]) }; },
  };
  const world = { groundY, floorAlong(x, z, ux, uz, L) { let m = groundY(x, z); for (let q = 12; q <= L; q += 12) m = Math.max(m, groundY(x + ux * q, z + uz * q)); return m; } };
  return { env, world };
}

// one sortie: spool on the spot, lift off to the transit height, fly a short way off, come home and land on the spot
function sortie(kind, ss, seed, dt) {
  const s = makeShip(kind === 'ch46' ? 'albatross' : 'kraken', ss, seed), { env, world } = makeEnv(s);
  const spot = kind === 'ch46' ? [-2, -35] : [-1, 34];   // rotary.js SPOTS: the bow / stern spots move the most
  let S, P, fly, AI, CG;
  const home = () => s.spot(...spot);
  let lz = null;
  return import(ROT + (kind === 'ch46' ? 'ch46fm.js' : 'mv22fm.js')).then(async fm => {
    const sp = home();
    if (kind === 'ch46') {
      const { flyCH46, CH46_AI } = await import(ROT + 'ch46ai.js');
      S = fm.createCH46Sim(); CG = fm.CH46.CG_H; S.payload = 13 * fm.CH46.MARINE_KG; S.reset([sp.x, sp.y + CG + 0.05, sp.z], sp.hdg, true, env);
      P = createPilot(fm.CH46.PILOT); P.reset(0); fly = (st, cmd, h) => flyCH46(S, P, st, cmd, h);
      AI = createTransportAI(CH46_AI, { lz: () => lz, home, unload: () => true });
    } else {
      const { createTiltPilot } = await import(ROT + 'tiltpilot.js');
      const { flyMV22, MV22_AI } = await import(ROT + 'mv22ai.js');
      S = fm.createMV22Sim(); CG = fm.MV22.CG_H; S.payload = 12 * fm.MV22.TROOPER_KG; S.reset([sp.x, sp.y + CG + 0.05, sp.z], sp.hdg, true, env, 90);
      P = createTiltPilot(fm.MV22.PILOT, S); P.reset(0); fly = (st, cmd, h) => flyMV22(S, P, st, cmd, h, S.agl);
      AI = createTransportAI(MV22_AI, { lz: () => lz, home, unload: () => true });
    }
    let parked = false; AI.hooks.parked = () => { parked = true; };
    const st = {}, att = {}, r = { maxRelBank: 0, maxRelPitch: 0, liftBank: 0, sinks: [], dead: null, phases: null, tq: 0 };
    let wentOut = false;
    for (let t = 0; t < 240 && !parked && !S.dead; t += dt) {
      s.sail(dt);                                             // the ship first (war.js order)
      const nS = Math.max(1, Math.ceil(dt * 30 - 1e-6)), h = dt / nS;   // then the unit, as ch46unit / mv22unit do
      for (let i = 0; i < nS && !S.dead; i++) {
        stateOf(S.body, st);
        const cmd = AI.step(st, S, h, world), c = fly(st, cmd, h);
        const e = S.step(h, c, env);
        if (e === 'land' || e === 'hardland') r.sinks.push({ e, vy: S.body.maxSink, phase: AI.phase });
        S.body.maxSink = 0;
      }
      // a point 260 m off the bow as soon as it is up, then home
      if (!wentOut && AI.phase === 'transit') { wentOut = true; const [x, z] = s.toWorld(0, -60); lz = { x: x - 200 * Math.sin(s.yaw), y: 0, z: z - 200 * Math.cos(s.yaw), hdg: s.yaw, vx: 0, vz: 0 }; }
      if (wentOut && AI.phase === 'transit' && AI.t > 8) AI.goHome();
      // attitude against the deck while on it or just off it
      attitude(S.body.q, att);
      if (S.body.contacts) {
        const [x, z] = [S.body.pos[0], S.body.pos[2]], rx = Math.cos(att.yaw), rz = -Math.sin(att.yaw), fx = -Math.sin(att.yaw), fz = -Math.cos(att.yaw);   // the deck slope under it, across and along
        const dRoll = -Math.atan((env.groundY(x + rx * 3, z + rz * 3) - env.groundY(x - rx * 3, z - rz * 3)) / 6), dPitch = Math.atan((env.groundY(x + fx * 3, z + fz * 3) - env.groundY(x - fx * 3, z - fz * 3)) / 6);
        r.dR = dRoll; const rb = Math.abs(att.roll - dRoll), rp = Math.abs(att.pitch - dPitch);
        if (rb > r.maxRelBank) r.at = [AI.phase, +t.toFixed(1), S.body.contacts, +S.agl.toFixed(2)]; r.maxRelBank = Math.max(r.maxRelBank, rb); r.maxRelPitch = Math.max(r.maxRelPitch, rp);
        if (['spool', 'lift'].includes(AI.phase)) r.liftBank = Math.max(r.liftBank, Math.abs(att.roll));
      }
      if (process.env.TRACE === `${kind},${ss},${seed},${dt}` && (AI.phase === "descend2" || AI.phase === "parked") && S.agl < 5) { const hm = home(); console.log(`  ${t.toFixed(1)} agl ${S.agl.toFixed(2)} n ${S.body.contacts} roll ${deg(att.roll).toFixed(1)} vrel ${(S.body.vel[0] - hm.vx).toFixed(2)},${(S.body.vel[2] - hm.vz).toFixed(2)} off ${(hm.x - S.body.pos[0]).toFixed(2)},${(hm.z - S.body.pos[2]).toFixed(2)} w ${s.w.toFixed(3)} vy ${S.body.vel[1].toFixed(2)} lat ${S.c.lat.toFixed(2)} col ${(S.c.tcl ?? S.c.coll).toFixed(2)} p ${S.body.w[0].toFixed(2)} ${AI.phase} dR ${deg(r.dR || 0).toFixed(1)}`); }
      if (V && Math.round(t / dt) % Math.round(1 / dt) === 0) console.log(`  ${t.toFixed(0).padStart(4)} ${AI.phase.padEnd(9)} agl ${S.agl.toFixed(2)} n ${S.body.contacts} roll ${deg(att.roll).toFixed(1)} pitch ${deg(att.pitch).toFixed(1)} vy ${S.body.vel[1].toFixed(2)} deck ${deg(s.a.pitch).toFixed(1)}/${deg(s.a.roll).toFixed(1)}`);
    }
    r.dead = S.dead; r.parked = parked; r.phases = AI.log.map(p => p[1]).join('>');
    r.deck = r.sinks.find(x => x.phase === 'parked' || x.phase === 'descend2');
    return r;
  });
}

for (const kind of ['ch46', 'mv22']) {
  if (only && only !== kind) continue;
  console.log(`--- ${kind === 'ch46' ? 'CH-46E off the ALBATROSS' : 'MV-22B off the KRAKEN'} (bow / stern spot), sea states 3..6, frames 1/30 and 0.1 s ---`);
  for (const dt of [1 / 30, 0.1]) for (const ss of (process.env.SS ? [+process.env.SS] : [3, 4, 5, 6])) {
    const runs = [];
    for (const seed of [1, 2, 3]) runs.push(await sortie(kind, ss, seed, dt));
    const bad = runs.filter(r => r.dead || !r.parked), worst = Math.max(...runs.map(r => r.maxRelBank)), lift = Math.max(...runs.map(r => r.liftBank)), sink = Math.max(...runs.map(r => r.deck ? r.deck.vy : 9));
    if (process.argv.includes('--at')) console.log(runs.map(r => JSON.stringify(r.at)).join(' '));
    T.check(`${kind} dt ${dt === 0.1 ? '0.1 ' : '1/30'} SS${ss}: off the deck, out, back, parked`, !bad.length && worst < 0.2 && sink < 2.2,
      `${bad.length ? bad.map(r => (r.dead || 'not parked') + ' [' + r.phases + ']').join('; ') : '3/3 parked'}, bank vs deck <= ${deg(worst).toFixed(1)} deg, lift-off bank ${deg(lift).toFixed(1)}, deck sink ${sink.toFixed(2)} m/s`,
      'no rollover, < 11 deg, < 2.2 m/s');
  }
}
T.done();
