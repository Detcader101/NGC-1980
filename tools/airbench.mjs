#!/usr/bin/env node
// airbench.mjs - the AI pilot (game/js/units/air/pilot.js) flying the real flight models in node, only through stick,
// pedals and throttles: a full Tomcat sortie off a fake carrier (cat -> climb -> CAP -> bingo -> pattern -> trap),
// terrain look-ahead against a mountain, and air combat: Tomcat vs RW-4 SHRIKE with game-level weapons (the same
// missile homing the game uses, units/air/gameproj.js).        node tools/airbench.mjs [--v] [--only=name]
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const THREE = await import('three');
const { createTomcatSim, STATIONS } = await import('../game/js/units/air/tomcatfm.js');
const { createPilot } = await import('../game/js/units/air/pilot.js');
const { homeAAM, AAM, decoyCheck } = await import('../game/js/units/air/gameproj.js');
const rw = await import('../game/js/units/air/rwfm.js').catch(() => null);
const V = process.argv.includes('--v'), ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const G = 9.0, DT = 1 / 60, KT = 1.94384;
let pass = 0, fail = 0;
const check = (name, ok, got, want = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${got}${want ? '   (want ' + want + ')' : ''}`); };
const deg = r => r * 180 / Math.PI, clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------------------------------------------- worlds
// the ALBATROSS as war.js has it: 120 m x 28 m deck 8 m up, island (tower) to starboard, sailing at `speed`
function carrierWorld(c, terrain = () => 0) {
  const loc = (x, z) => { const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [dx * co - dz * si, dx * si + dz * co]; };
  const deckAt = (x, z) => {
    const [lx, lz] = loc(x, z); let hw = 14 * 0.97, h = -1e9; if (lz < -44) hw *= Math.max(0, (lz + 66) / 22);
    if (Math.abs(lx) < hw && lz > -66 && lz < 60) h = 8;
    if (Math.abs(lx - 10.5) < 2.9 && Math.abs(lz - 6) < 9) h = 8 + 17;
    return h;
  };
  const W = {
    c, loc, terrain: (x, z) => Math.max(0, terrain(x, z)),
    groundY: (x, z) => Math.max(terrain(x, z), 0, deckAt(x, z)), water: (x, z) => terrain(x, z) <= 0 && deckAt(x, z) < 0,
    surfVel: (x, z) => deckAt(x, z) > 0 ? { vx: -Math.sin(c.yaw) * c.speed, vz: -Math.cos(c.yaw) * c.speed, w: c.w || 0, cx: c.x, cz: c.z } : null,
    carrier: () => ({ x: c.x, z: c.z, yaw: c.yaw, deck: 8, vx: -Math.sin(c.yaw) * c.speed, vz: -Math.cos(c.yaw) * c.speed, speed: c.speed, w: c.w || 0 }),
    anchor: () => ({ x: c.x, y: 8, z: c.z }),
    tick(dt) { c.x += -Math.sin(c.yaw) * c.speed * dt; c.z += -Math.cos(c.yaw) * c.speed * dt; c.yaw += (c.w || 0) * dt; },
  };
  return W;
}
function logState(t, P, A, W, every) { const [lx, lz] = W.loc(A.pos.x, A.pos.z); console.log(`${t.toFixed(0).padStart(4)} ${P.state.padEnd(8)} wp${P.wp} pos ${lx.toFixed(0)},${lz.toFixed(0)} y ${A.pos.y.toFixed(0)} eas ${(A.eas * KT).toFixed(0)} a ${deg(A.alpha).toFixed(1)} nz ${A.nz.toFixed(1)} fuel ${A.fuel.toFixed(0)} thr ${P.FD.thr.toFixed(2)} sw ${A.sweep.toFixed(0)} g${A.gear.toFixed(1)} f${A.surf.flap.toFixed(1)}${P.lso ? ` lso R${P.lso.R.toFixed(0)} lat${P.lso.latErr.toFixed(1)} h${P.lso.hErr.toFixed(1)}` : ''}`); }
// a few seconds of a sim, one frame at a time
function run(secs, each) { for (let t = 0; t < secs; t += DT) if (each(t) === false) return t; return secs; }

// ------------------------------------------------------------------------------------------------- game-level weapons
function arena(env, units, seed = 1) {
  let rs = seed * 9301 + 49297; const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280;
  const proj = [];
  env.foes = function* (side) { for (const u of units) if (u.side !== side && !u.dead && !u.dying) yield u; };
  env.missiles = function* (side) { for (const b of proj) if (b.kind === 'aam' && b.side !== side) yield b; };
  env.inFlight = t => proj.filter(b => b.kind === 'aam' && b.tgt === t).length;
  env.fire = (kind, A, st, tgt, W) => {
    const u = units.find(u => u.A === A);
    if (kind === 'gun') {
      A.forward(_f); const s = W.speed;
      proj.push({ kind: 'gun', side: u.side, p: A.pos.clone().addScaledVector(_f, 9), v: _f.clone().multiplyScalar(s).add(A.vel).add(new THREE.Vector3((Math.random() - .5) * 8, (Math.random() - .5) * 8, (Math.random() - .5) * 8)), life: 1.3 });
      u.shots = (u.shots || 0) + 1; return;
    }
    const sp = (A.P.STATIONS || STATIONS)[st.st] || [0, -1, 0], p = A.worldPoint(sp);
    A.forward(_f); proj.push({ kind: 'aam', side: u.side, p, v: _f.clone().multiplyScalar(W.v0).add(A.vel), tgt, age: 0, spd: A.vel.length() + W.v0, life: W.life, w: kind });
    u.missiles = (u.missiles || 0) + 1;
  };
  const _f = new THREE.Vector3(), _p = new THREE.Vector3();
  const hit = (t, dmg, by) => { t.hp -= dmg; if (t.hp <= 0 && !t.dying) { t.dying = true; t.killedBy = by; } };
  return {
    proj,
    step(dt) {
      for (let i = proj.length - 1; i >= 0; i--) {
        const b = proj[i]; b.life -= dt; _p.copy(b.p);
        if (b.kind === 'aam') {   // decoys: the game rule in gameproj.js
          const t = b.tgt, tu = t && units.find(u => u === t);
          decoyCheck(b, tu, rnd);
          homeAAM(b, dt);
        } else b.v.y -= 9 * dt;
        b.p.addScaledVector(b.v, dt);
        let done = b.life <= 0 || b.p.y < env.terrain(b.p.x, b.p.z);
        for (const u of units) {
          if (u.side === b.side || u.dying || done) continue;
          // closest approach along this step
          const sx = b.p.x - _p.x, sy = b.p.y - _p.y, sz = b.p.z - _p.z, L2 = sx * sx + sy * sy + sz * sz || 1;
          const k = Math.max(0, Math.min(1, ((u.A.pos.x - _p.x) * sx + (u.A.pos.y - _p.y) * sy + (u.A.pos.z - _p.z) * sz) / L2));
          const d = Math.hypot(_p.x + sx * k - u.A.pos.x, _p.y + sy * k - u.A.pos.y, _p.z + sz * k - u.A.pos.z);
          if (b.kind === 'aam' && b.tgt === u && d < AAM.FUSE) { hit(u, 9, b.w); done = true; u.hitBy = (u.hitBy || 0) + 1; }
          else if (b.kind === 'gun' && d < u.r) { hit(u, 1.4, 'gun'); done = true; u.gunHits = (u.gunHits || 0) + 1; }
        }
        if (done) proj.splice(i, 1);
      }
    },
  };
}

// ------------------------------------------------------------------------------------------------- 1. the sortie
if (!ONLY || ONLY === 'sortie') {
  console.log('--- Tomcat sortie: cat, climb, CAP over the ship, bingo, pattern, trap ---');
  for (const [label, speed, turn] of [['ship 6 m/s straight', 6, 0], ['ship 4 m/s, turns during CAP', 4, 0.012]]) {
    const W = carrierWorld({ x: 0, z: 0, yaw: 0.4, speed, w: 0 });
    const A = createTomcatSim(G, { fuelX: 10 }); A.reset(0, 8, 0, 0, { running: true });
    A.fuel = 5200;
    const P = createPilot(A, { side: 1, name: 'VICTORY 201', hookLead: process.env.HL ? +process.env.HL : undefined });
    P.launch(W);
    const seen = {}, t0 = {}; let maxR = 0, minR = 1e9, capAlt = [], nzMax = 0, trapT = null, ok = true;
    const T = run(900, t => {
      if (turn && P.state === 'cap' && t > 60 && t < 120) W.c.w = turn; else W.c.w = 0;   // the ship turns while the jet is on CAP (not during recovery)
      P.update(DT, W); W.tick(DT);
      if (process.env.HOOKLOG && P.lso && P.lso.R < 40 && !P.trapped) { const h = A.hookTip(); const [, hz] = W.loc(h.x, h.z); console.log(`hook lz ${hz.toFixed(1)} above ${(h.y - 8).toFixed(2)}  cg R ${P.lso.R.toFixed(1)} y ${(A.pos.y - 8).toFixed(2)} pitch ${deg(A.attitude().pitch).toFixed(1)}`); }
      if (!seen[P.state]) { seen[P.state] = true; t0[P.state] = t; }
      if (P.state === 'cap' && P.stateT > 20) { const r = Math.hypot(A.pos.x - W.c.x, A.pos.z - W.c.z); maxR = Math.max(maxR, r); minR = Math.min(minR, r); capAlt.push(A.pos.y); }
      if (!A.onGround) nzMax = Math.max(nzMax, A.nz);
      if (V && Math.round(t * 60) % 300 === 0) logState(t, P, A, W);
      if (A.dead) { ok = false; return false; }
      if (P.recovered) { trapT = t; return false; }
    });
    if (V || !P.recovered) console.log(P.log.map(l => `   ${l.t} ${l.msg}`).join('\n'));
    const ca = capAlt.length ? capAlt.reduce((a, b) => a + b) / capAlt.length : 0;
    check(`[${label}] cat shot and climb-out`, seen.climb && seen.cap && t0.cap < 60, `cap reached at ${t0.cap?.toFixed(0)} s`, '< 60 s');
    check(`[${label}] CAP orbit over the ship`, minR > 250 && maxR < 900 && ca > 180 && ca < 320, `r ${minR.toFixed(0)}-${maxR.toFixed(0)} m, alt ${ca.toFixed(0)} m`, 'r 250-900, alt ~240');
    check(`[${label}] bingo -> RTB`, seen.rtb, `rtb at ${t0.rtb?.toFixed(0)} s`);
    check(`[${label}] trap`, !!P.trapped && P.recovered && ok, P.trapped ? `${P.trapped.wire} wire at ${T.toFixed(0)} s, ${P.waveoffs} wave-offs, ${P.bolters} bolters, td ${P.td?.vy.toFixed(1)} m/s` : `no trap: ${A.dead || P.state} ${P.why}`);
    check(`[${label}] never over 7.5 g, never below 60 m AGL (bar the approach)`, nzMax < 7.5 && P.minAGL > 60, `${nzMax.toFixed(1)} g, ${P.minAGL.toFixed(0)} m`);
  }
}

// ------------------------------------------------------------------------------------------------- 1b. wave-off, bolter
if (!ONLY || ONLY === 'recovery') {
  console.log('--- recovery: a wave-off (shoved off the centreline in close), a bolter (hook skips) ---');
  for (const kind of ['waveoff', 'bolter']) {
    const W = carrierWorld({ x: 0, z: 0, yaw: -0.7, speed: 5 });
    const A = createTomcatSim(G, { fuelX: 10 }); A.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 200, speed: 70 });
    const [x, z] = [W.c.x + Math.sin(0.7) * -900 + 0, W.c.z + Math.cos(0.7) * 900];
    A.pos.set(x - 600, 130, z); for (const e of A.eng) e.n = 0.85; A.fuel = 4500;
    const P = createPilot(A, { side: 1 }); P.spawnAir('rtb');
    let shoved = false, events = [], hookBad = kind === 'bolter';
    const mods = { eng: [1, 1], hyd: 1, fcsOk: true, gearOk: true, hookOk: true };
    W.mods = mods;
    run(600, t => {
      mods.hookOk = !(hookBad && P.bolters === 0);
      if (!hookBad) A.hookCmd = A.hookCmd;   // hook works
      if (kind === 'waveoff' && !shoved && P.lso && P.lso.R < 250 && P.state === 'final') { shoved = true; A.pos.x += Math.cos(W.c.yaw) * 14; A.pos.z -= Math.sin(W.c.yaw) * 14; }
      P.update(DT, W); W.tick(DT);
      if (V && Math.round(t * 60) % (P.state === 'final' || P.state === 'waveoff' || P.state === 'bolter' ? 60 : 300) === 0) logState(t, P, A, W);
      if (A.dead || P.recovered) return false;
    });
    if (V || !P.recovered) console.log(P.log.map(l => `   ${l.t} ${l.msg}`).join('\n'));
    if (kind === 'waveoff') check('wave-off in close, round again, trap', P.waveoffs >= 1 && P.recovered && !A.dead, `${P.waveoffs} wave-offs, ${P.trapped ? P.trapped.wire + ' wire' : 'no trap'}, dead ${A.dead}`);
    else check('bolter (hook skips), round again, trap', P.bolters >= 1 && P.recovered && !A.dead, `${P.bolters} bolters, ${P.waveoffs} wave-offs, ${P.trapped ? P.trapped.wire + ' wire' : 'no trap'}, dead ${A.dead}`);
    void events;
  }
}

// ------------------------------------------------------------------------------------------------- 2. terrain
if (!ONLY || ONLY === 'terrain') {
  console.log('--- terrain look-ahead: low CAP point in front of a 700 m ridge ---');
  const ridge = (x, z) => 700 * Math.exp(-((z + 2200) ** 2) / (2 * 300 ** 2)) * (1 - Math.min(1, Math.abs(x) / 4000)) + 50 * Math.exp(-((x - 300) ** 2 + (z + 900) ** 2) / 20000);
  const W = carrierWorld({ x: 0, z: 3000, yaw: 0, speed: 0 }, ridge);
  const A = createTomcatSim(G); A.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 150, speed: 75 }); for (const e of A.eng) e.n = 0.9;
  const P = createPilot(A, { side: 1 }); P.anchor = { x: 0, y: 0, z: -4000 }; P.spawnAir('cap');   // CAP point beyond the ridge, at its foot
  let minClr = 1e9;
  run(90, (t) => { P.update(DT, W); const g = ridge(A.pos.x, A.pos.z); minClr = Math.min(minClr, A.pos.y - g); if (V && Math.round(t * 60) % 60 === 0) console.log(`${t.toFixed(0)} ${P.state} x ${A.pos.x.toFixed(0)} z ${A.pos.z.toFixed(0)} y ${A.pos.y.toFixed(0)} gnd ${g.toFixed(0)} eas ${(A.eas * KT).toFixed(0)} gam ${deg(Math.asin(A.vel.y / A.tas)).toFixed(0)} a ${deg(A.alpha).toFixed(0)} roll ${deg(A.attitude().roll).toFixed(0)} pull ${P.terrainPull} thr ${P.FD.thr.toFixed(2)}`); if (A.dead) return false; });
  check('flies over / round a 700 m ridge', !A.dead && minClr > 25, `min clearance ${minClr.toFixed(0)} m, dead ${A.dead}`, '> 25 m');
  const B = createTomcatSim(G); B.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 120, speed: 80 }); for (const e of B.eng) e.n = 0.9;
  const Q = createPilot(B, { side: 1 }); Q.anchor = { x: 0, y: 0, z: -2200 }; Q.spawnAir('cap'); B.vel.set(0, -15, -80);   // diving at the ridge itself
  minClr = 1e9; run(60, () => { Q.update(DT, W); minClr = Math.min(minClr, B.pos.y - ridge(B.pos.x, B.pos.z)); if (B.dead) return false; });
  check('CAP point on the ridge top: stays clear', !B.dead && minClr > 20, `min clearance ${minClr.toFixed(0)} m`);
}

// ------------------------------------------------------------------------------------------------- RUNAWAY aircraft
if ((!ONLY || ONLY === 'rw') && rw) {
  console.log('--- RUNAWAY aircraft: SHRIKE, REAPER, SHAHED ---');
  const sea = { groundY: () => 0, water: () => true, terrain: () => 0 };
  const level = (A, alt) => { const FD = (A._fd ||= (createPilot(A, {}).FD)); const n = Math.cos(A.attitude().pitch) + clamp((alt - A.pos.y) * 0.02 - A.vel.y * 0.1, -0.6, 0.6); FD.ctl.pitch = FD.pitchFor(n, DT); FD.ctl.roll = FD.rollFor(0); return FD.ctl; };
  // SHRIKE: top speed level at full power, peak g, roll rate
  { const S = rw.createShrikeSim(G); S.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 300, speed: 80 }); for (const e of S.eng) e.n = 0.9;
    run(120, () => { const c = level(S, 300); c.throttle[0] = 1; S.step(DT, c, sea); });
    check('SHRIKE top speed, full power, low level (FICTIONAL)', S.mach > 0.8 && S.mach < 1.0, `M ${S.mach.toFixed(2)} ${(S.eas * KT).toFixed(0)} KEAS`, 'M 0.8-1.0, slower than a Tomcat in AB');
    const P = rw.createShrikeSim(G); P.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 300, speed: 85 }); for (const e of P.eng) e.n = 0.9; let nmax = 0, pmax = 0;
    run(4, t => { P.step(DT, { pitch: t < 2.5 ? 1 : 0, roll: t > 2.5 ? 1 : 0, yaw: 0, throttle: [1], brakeL: 0, brakeR: 0 }, sea); nmax = Math.max(nmax, P.nz); pmax = Math.max(pmax, P.w.x); });
    check('SHRIKE pulls 9+ g (11 g FCS), rolls > 250°/s (FICTIONAL)', nmax > 9 && nmax < 13 && deg(pmax) > 250, `${nmax.toFixed(1)} g, ${deg(pmax).toFixed(0)}°/s`); }
  // REAPER: cruise at 70% power, stall, an orbit
  { const R = rw.createReaperSim(G); R.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 300, speed: 30 }); R.eng[0].n = 0.7;
    run(120, () => { const c = level(R, 300); c.throttle[0] = 0.7; R.step(DT, c, sea); });
    check('REAPER cruise at 70% power', R.eas * KT > 130 && R.eas * KT < 200, `${(R.eas * KT).toFixed(0)} KEAS (true ${(R.tas * KT).toFixed(0)} kt here), ${(R.eng[0].thrust / 1000).toFixed(1)} kN`, '~150-200 kt (GA-ASI: cruise ~170 kt)');
    run(60, () => { const c = level(R, 300); c.throttle[0] = 0; R.step(DT, c, sea); });
    const vmin = R.eas * KT; check('REAPER slow flight at the AoA limit', vmin > 60 && vmin < 100 && !R.dead, `${vmin.toFixed(0)} KEAS, AoA ${deg(R.alpha).toFixed(1)}°`);
    const Q = rw.createReaperSim(G); Q.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 260, speed: 28 }); Q.eng[0].n = 0.6;
    const PQ = createPilot(Q, { side: 2 }); PQ.anchor = { x: 300, y: 0, z: -300 }; PQ.spawnAir('patrol'); let rmin = 1e9, rmax = 0;
    run(240, t => { PQ.update(DT, sea); if (t > 120) { const r = Math.hypot(Q.pos.x - 300, Q.pos.z + 300); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); } });
    check('REAPER orbits its spot', rmin > 150 && rmax < 500 && Math.abs(Q.pos.y - 260) < 60, `r ${rmin.toFixed(0)}-${rmax.toFixed(0)} m, alt ${Q.pos.y.toFixed(0)} m, ${(Q.eas * KT).toFixed(0)} KEAS`); }
  // SHAHED: off the rail, cruise, find a target 1.2 km away over a 40 m hill and dive on it
  { const D = rw.createShahedSim(G); const hill = (x, z) => 40 * Math.exp(-((x) ** 2 + (z + 600) ** 2) / 30000);
    D.launch(0, 2, 0, 0.1); const tgt = { x: 120, y: 0, z: -1200 }; let vmax = 0, minClr = 1e9, hit = null;
    run(120, t => { rw.shahedGuide(D, tgt, hill); D.step(DT); if (t > 6 && !D.diving) { vmax = Math.max(vmax, D.eas); minClr = Math.min(minClr, D.pos.y - hill(D.pos.x, D.pos.z)); } if (D.pos.y <= hill(D.pos.x, D.pos.z)) { hit = Math.hypot(D.pos.x - tgt.x, D.pos.z - tgt.z); return false; } });
    check('SHAHED: rail launch, cruise speed (GAME)', vmax * KT > 80 && vmax * KT < 130, `${(vmax * KT).toFixed(0)} KEAS, true ${(D.V).toFixed(0)} m/s`);
    check('SHAHED: clears the hill, dives onto the target', hit !== null && hit < 12 && minClr > 15, `impact ${hit?.toFixed(1)} m from the aim point, min clearance ${minClr.toFixed(0)} m`); }
}

// ------------------------------------------------------------------------------------------------- 3. air combat
// BVR: CAP loadout from 2-2.5 km. MERGE: head-on pass at 900 m, the Tomcat with AIM-9s and the gun only, so it has to
// turn with a drone that pulls 11 g. Both sides have decoys (flares, game rule: a decoy seduces half the missiles).
function fight(seed, mode) {
  const W = carrierWorld({ x: 0, z: 0, yaw: 0, speed: 0 });
  const A = createTomcatSim(G, { seed }); A.reset(0, 0, 0, 0, { running: true, airborne: true, alt: 250, speed: 75 }); for (const e of A.eng) e.n = 0.9; A.fuel = 5000;
  const S = rw.createShrikeSim(G, { seed }); const ang = seed * 1.1;
  if (mode === 'bvr') S.reset(Math.sin(ang) * 2200, 0, -1500 + Math.cos(ang) * 1200, ang + Math.PI * (seed % 2 ? 1 : 0.6), { running: true, airborne: true, alt: 200 + seed * 20, speed: 80 });
  else { S.reset((seed - 3.5) * 40, 0, -900, Math.PI + (seed - 3.5) * 0.1, { running: true, airborne: true, alt: 230 + seed * 10, speed: 80 }); A.stores = A.stores.filter(s => s.w === 'aim9'); }
  for (const e of S.eng) e.n = 0.9;
  const units = [{ A, side: 1, hp: 4, r: 4.5, name: 'TOMCAT', decoys: 6 }, { A: S, side: 2, hp: 2, r: 3.5, name: 'SHRIKE', decoys: 2 }];
  for (const u of units) { u.p = u.A.pos; u.v = u.A.vel; u.air = true; u.type = u.name; }
  const PT = createPilot(A, { side: 1 }), PS = createPilot(S, { side: 2 });
  PT.anchor = { x: 0, y: 0, z: -500 }; PS.anchor = { x: 0, y: 0, z: -500 }; PT.spawnAir('cap'); PS.spawnAir('cap');
  units[0].pilot = PT; units[1].pilot = PS; PT.unit = units[0]; PS.unit = units[1];
  const AR = arena(W, units, seed), modes = new Set();
  let end = null, minAlt = 1e9; const t = run(150, t => {
    for (const u of units) if (!u.dying) { u.pilot.update(DT, W); modes.add(u.pilot.mode); if (u.A.dead) u.dying = true, u.killedBy = u.killedBy || 'ground'; }
    minAlt = Math.min(minAlt, A.pos.y, S.pos.y);
    if (process.env.FLOG && +process.env.FLOG === seed && Math.round(t * 60) % 30 === 0) { const r = S.pos.clone().sub(A.pos), R = r.length(), fa = A.forward(new THREE.Vector3()), fs = S.forward(new THREE.Vector3()); console.log(`${t.toFixed(1)} R ${R.toFixed(0)} T[${PT.mode} y${A.pos.y.toFixed(0)} ${(A.eas * KT).toFixed(0)}kt ${A.nz.toFixed(1)}g ata ${deg(Math.acos(fa.dot(r) / R)).toFixed(0)}] S[${PS.mode} y${S.pos.y.toFixed(0)} ${(S.eas * KT).toFixed(0)}kt ${S.nz.toFixed(1)}g ata ${deg(Math.acos(-fs.dot(r) / R)).toFixed(0)}]`); }
    AR.step(DT);
    if (units[1].dying) { end = 'win'; return false; } if (units[0].dying) { end = 'loss'; return false; }
  });
  const line = `   ${mode} seed ${seed}: ${end || 'draw'} at ${t.toFixed(0)} s by ${(end === 'win' ? units[1] : end ? units[0] : {}).killedBy || '-'}  T: ${units[0].missiles || 0} msl ${units[0].shots || 0} rds ${units[0].hitBy || 0}+${units[0].gunHits || 0} hits taken, ${A.nzMax.toFixed(1)} g | S: ${units[1].missiles || 0} msl ${units[1].shots || 0} rds, ${S.nzMax.toFixed(1)} g | min alt ${minAlt.toFixed(0)}`;
  if (V) console.log(PT.log.map(l => `     T ${l.t} ${l.msg}`).join('\n') + '\n' + PS.log.map(l => `     S ${l.t} ${l.msg}`).join('\n'));
  return { end, line, modes, units, minAlt };
}
if ((!ONLY || ONLY === 'fight') && rw) {
  console.log('--- Tomcat vs RW-4 SHRIKE (game-level weapons, decoys) ---');
  for (const mode of ['bvr', 'merge']) {
    const R = [1, 2, 3, 4, 5, 6].map(s => fight(s, mode)); console.log(R.map(r => r.line).join('\n'));
    const wins = R.filter(r => r.end === 'win').length, losses = R.filter(r => r.end === 'loss').length, crashed = R.filter(r => r.units.some(u => u.killedBy === 'ground')).length;
    const modes = new Set(R.flatMap(r => [...r.modes]));
    if (mode === 'bvr') check('BVR: the Tomcat wins most fights', wins >= 4, `${wins} wins / ${losses} losses / ${6 - wins - losses} draws`, '>= 4 of 6');
    else {
      check('MERGE: a real fight (guns and missiles), the Tomcat wins some', R.some(r => r.units[1].shots > 0) && wins >= 2, `${wins} wins / ${losses} losses / ${6 - wins - losses} draws`);
      check('MERGE: pursuit modes used (lead / pure / lag / break)', ['lead', 'pure', 'lag', 'break'].every(m => modes.has(m)), [...modes].join(' '));
    }
    check(`${mode.toUpperCase()}: nobody flies into the sea`, crashed === 0, `${crashed} crashed`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
