// SIM MODE: the commander's own Hornet, flown by the AI. In the live game the player's F/A-18A is the task force's
// strike arm (Mk-82s with CCIP on the AA sites, the buildings, the ships); with no player in the sim, a CPU pilot
// flies the same jet: the HORNET flight model (jetfm.js) under the escorts' AI pilot (units/air/pilot.js, WINGMAN
// numbers), launched off the ALBATROSS, a run in at height, a dive on the target, the same 'bomb' projectile
// war.js drops for the player (W.dropBomb: 4 x Mk-82, game-level blast), the pull-out and home. A Hornet costs one
// from the fleet's reserve (fleet.js 'jet'); one that comes home goes back into it, one that is lost is written off.
//
//   const SW = createStrikeWing({ W, scene, feed, fleet, THREE, buildMesh })
//   SW.launch(target, why) -> '' | reason     target: a war.js structure ({ x, y, z, h, dead }) or ship ({ p, dims })
//   SW.update(dt)                              every frame, after war.update
//   SW.out -> Hornets airborne; SW.stats -> { sorties, bombs, lost, recovered, kills: { aa, building, ship } }
import { createJetSim } from '../jetfm.js';
import { createPilot } from '../units/air/pilot.js';
import { WINGMAN } from '../units/commander/wingman.js';
import { CARRIER } from '../ships.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const STRIKE = { MAX: 2, BOMBS: 4, IP_ALT: 230, DIVE_R: 1400, RELEASE_MISS: 11, HP: 4, R: 4.5, RECOVER_R: 750, TURN: 25 };

export function createStrikeWing({ W, terrainH, scene, feed = () => {}, fleet = null, THREE, buildMesh = null }) {
  const SW = { jets: [], stats: { sorties: 0, bombs: 0, lost: 0, recovered: 0, kills: { aa: 0, building: 0, ship: 0 }, dmgShip: 0 }, turnT: 0, modex: 300 };
  const _f = new THREE.Vector3();
  const ground = (x, z) => Math.max(terrainH(x, z), 0);
  const env = {
    terrain: ground,
    groundY: (x, z) => Math.max(terrainH(x, z), 0, W.deckY(x, z)),
    water: (x, z) => terrainH(x, z) <= 0 && W.deckY(x, z) < -1e8,
    surfVel: W.surfVel,
    carrier: () => { const c = W.carrier && W.carrier.sinking === undefined ? W.carrier : null; return c ? { x: c.p.x, z: c.p.z, yaw: c.yaw, deck: CARRIER.DECK + c.p.y, vx: c.v.x, vz: c.v.z, speed: c.speed, w: c.w || 0 } : null; },
    foes: function* () {}, missiles: function* () {}, inFlight: () => 0, fire: () => {},
  };
  const tpos = (t, out) => t.dims ? out.set(t.p.x, CARRIER.DECK * 0.6 + t.p.y, t.p.z) : out.set(t.x, t.y + Math.min(2, t.h || 1), t.z);
  const gone = t => !t || t.dead || t.gone || (t.dims && t.sinking !== undefined);
  SW.out = () => SW.jets.length;
  SW.launch = (target, why = '') => {
    const c = W.carrier; if (!c || c.sinking !== undefined) return 'NO DECK';
    if (SW.jets.length >= STRIKE.MAX) return 'TWO HORNETS ALREADY UP';
    if (SW.turnT > 0) return 'DECK TURNING THE LAST ONE ROUND';
    if (fleet && !fleet.take('jet')) { const r = fleet.buy('jet', W.P); if (r) return r; fleet.take('jet'); }
    const A = createJetSim(9), name = `RAIDER ${++SW.modex}`;
    const P = createPilot(A, { ...WINGMAN.HORNET, side: 1, name });
    A.reset(c.p.x, CARRIER.DECK + c.p.y, c.p.z, c.yaw, { running: true, airborne: true, alt: 60, speed: 95 });
    for (const e of A.eng) e.n = 0.95;
    P.anchor = { x: c.p.x, y: 0, z: c.p.z }; P.spawnAir('climb');
    const model = buildMesh ? buildMesh() : null, mesh = model ? model.group : new THREE.Object3D();   // (the browser: the HORNET model, control surfaces and gear moving)
    const u = { type: 'strike', side: 1, sim: A, ai: P, p: A.pos, v: A.vel, yaw: 0, hp: STRIKE.HP, hpMax: STRIKE.HP, mesh, parts: { group: mesh, animate: model ? (A, dt, t) => model.animate({ ...A.surf, gear: A.gear, wow: A.wow }, dt, t) : () => {} }, r: STRIKE.R, cd: 0, ph: 0, air: true, name,
      tgt: target, why, phase: 'ingress', bombs: STRIKE.BOMBS, aim: new THREE.Vector3(), t: 0, released: 0 };
    scene.add(mesh); W.units.push(u); SW.jets.push(u); SW.stats.sorties++; SW.turnT = STRIKE.TURN;
    feed(`${name} OFF THE ALBATROSS  -  STRIKE ${why}`);
    return '';
  };
  function retarget(u) {   // the target went down before we got there: anything else of theirs on that island, else home
    if (u.tgt && u.tgt.I) { const s = u.tgt.I.structs.find(s => !s.dead && s.side === 2 && s.kind === 'aa') || u.tgt.I.structs.find(s => !s.dead && s.side === 2); if (s) { u.tgt = s; return true; } }
    return false;
  }
  function home(u, why) { u.phase = 'home'; u.ai.T.radar = 0; u.ai.anchor = env.carrier() ? { x: W.carrier.p.x, y: 0, z: W.carrier.p.z } : u.ai.anchor; u.ai.set('climb', why); }
  function predictImpact(A, ty, out) {   // the bomb's fall (war.js: gravity 9, no drag) from the jet's state now
    const y0 = A.pos.y - ty, vy = A.vel.y, t = (vy + Math.sqrt(Math.max(0, vy * vy + 18 * y0))) / 9;
    out.fall = t; return out.set(A.pos.x + A.vel.x * t, ty, A.pos.z + A.vel.z * t);
  }
  const _t = new THREE.Vector3(), _i = new THREE.Vector3();
  SW.update = dt => {
    SW.turnT -= dt;
    for (let i = SW.jets.length - 1; i >= 0; i--) {
      const u = SW.jets[i], A = u.sim, P = u.ai; u.t += dt;
      if (u.dead || u.dying || A.dead) {
        SW.jets.splice(i, 1); if (u.recovered) continue;
        if (P.recovered && !u.dying && !A.dead) { u.recovered = true; SW.stats.recovered++; if (fleet) fleet.give('jet'); continue; }   // (trapped by the pilot's own pattern: airwar.js stows it)
        SW.stats.lost++; if (fleet) fleet.lose('jet', 'SHOT DOWN'); continue;
      }
      if (u.phase !== 'home' && gone(u.tgt) && !retarget(u)) home(u, 'TARGET GONE');
      if (u.phase === 'ingress') {   // to the IP: DIVE_R short of the target on the line in, at height
        tpos(u.tgt, _t); const dx = A.pos.x - _t.x, dz = A.pos.z - _t.z, d = Math.hypot(dx, dz) || 1;
        const ipY = Math.max(ground(_t.x, _t.z), _t.y) + STRIKE.IP_ALT;
        if (!u.ip) { const k = Math.max(d, STRIKE.DIVE_R) / d; u.ip = { x: _t.x + dx * Math.min(k, STRIKE.DIVE_R / d), z: _t.z + dz * Math.min(k, STRIKE.DIVE_R / d), in: false }; }   // fixed for this run in
        if (!u.ip.in && Math.hypot(A.pos.x - u.ip.x, A.pos.z - u.ip.z) < 260) u.ip.in = true;
        P.strike = u.ip.in ? { x: _t.x, y: ipY, z: _t.z } : { x: u.ip.x, y: ipY, z: u.ip.z };   // to the IP, then turn in level
        if (P.state !== 'strike' && P.stateT > 4) P.set('strike');
        const herr = Math.abs(Math.atan2(Math.sin(Math.atan2(-dx, -dz) - Math.atan2(A.vel.x, A.vel.z)), Math.cos(Math.atan2(-dx, -dz) - Math.atan2(A.vel.x, A.vel.z))));
        if (u.ip.in && d > STRIKE.DIVE_R * 0.5 && A.pos.y > ipY - 70 && P.state === 'strike' && herr < 1.2) { u.phase = 'dive'; u.aim.copy(_t); u.diveT = 0; u.off = 0; u.ip = null; }   // the run in: the CCIP steering below lines it up
        else if (u.ip.in && d < STRIKE.DIVE_R * 0.5) { u.ip = null; }   // too close to line up: out and in again
      } else if (u.phase === 'dive') {   // CCIP: steer the dive so the bomb's fall ends on the target
        u.diveT += dt;
        tpos(u.tgt, _t); predictImpact(A, _t.y, _i);
        if (u.tgt.dims && u.tgt.v) { _t.x += u.tgt.v.x * _i.fall; _t.z += u.tgt.v.z * _i.fall; }   // a ship under way: where she will be when the bombs get there
        // the CCIP pipper's error, along the track (+ = the bombs would fall past the target) and across it
        const vh = Math.hypot(A.vel.x, A.vel.z) || 1, ux = A.vel.x / vh, uz = A.vel.z / vh, ex = _i.x - _t.x, ez = _i.z - _t.z;
        const along = ex * ux + ez * uz, cross = -ex * uz + ez * ux;
        // steer out the cross-track error (aim point moves sideways); fly at the target, let the pipper run up to it
        // fly the velocity vector at the target (the pipper then runs along the line onto it); a slow integral takes out
        // what the pilot's tracking leaves (wind of the turn, a moving ship)
        u.off = clamp((u.off || 0) + cross * dt * 0.6, -60, 60); { const c = u.off; u.aim.x = _t.x + uz * c; u.aim.z = _t.z - ux * c; u.aim.y = _t.y; }
        P.strike = { x: u.aim.x, y: u.aim.y, z: u.aim.z };
        const miss = Math.hypot(ex, ez), agl = A.pos.y - ground(A.pos.x, A.pos.z), slant = A.pos.distanceTo(_t);
        const ahead = (_t.x - A.pos.x) * A.vel.x + (_t.z - A.pos.z) * A.vel.z > 0, crossed = u.along !== undefined && u.along < 0 && along >= 0;
        u.along = along;
        if (agl < 70 || (!ahead && u.diveT > 2) || (along > 0 && !crossed && u.diveT > 0.5) || u.diveT > 25) { if (SW.debug) SW.debug(u, { agl, ahead, diveT: u.diveT, miss, along, cross, slant }); u.along = undefined; P.anchor = { x: _t.x, y: 0, z: _t.z }; u.phase = 'reattack'; P.set('climb', 'NO SOLUTION  -  ROUND AGAIN'); }
        else if (crossed && Math.abs(cross) < STRIKE.RELEASE_MISS * 1.4) {
          u.along = undefined;
          const n = u.tgt.dims ? u.bombs : Math.min(2, u.bombs);   // a stick of two on a site, all four on a ship
          for (let k = 0; k < n; k++) { A.forward(_f); W.dropBomb({ x: A.pos.x - _f.x * k * 4, y: A.pos.y - 1.2, z: A.pos.z - _f.z * k * 4 }, A.vel.clone()); }
          u.bombs -= n; u.released += n; SW.stats.bombs += n; u.lastTgt = u.tgt; u.relT = u.t;
          if (u.bombs > 0 && !u.tgt.dims) { u.phase = 'reattack'; P.anchor = { x: _t.x, y: 0, z: _t.z }; P.set('climb', 'OFF TARGET'); }
          else home(u, 'BOMBS GONE');
        }
      } else if (u.phase === 'reattack') {   // round again for the second stick (or the next gun on the island)
        if (P.stateT > 10 && A.pos.y - ground(A.pos.x, A.pos.z) > 150) { if (gone(u.tgt) && !retarget(u)) home(u, 'TARGET GONE'); else { u.phase = 'ingress'; P.set('cap'); } }
      } else if (u.phase === 'home') {
        const c = W.carrier;
        if (!c || c.sinking !== undefined) { if (u.t - (u.relT || 0) > 60) { u.dead = true; u.recovered = false; } continue; }
        P.anchor = { x: c.p.x, y: 0, z: c.p.z };
        if (Math.hypot(A.pos.x - c.p.x, A.pos.z - c.p.z) < STRIKE.RECOVER_R && P.stateT > 8) { u.dead = true; u.recovered = true; SW.stats.recovered++; if (fleet) fleet.give('jet'); feed(`${u.name} RECOVERED`); }
      }
      if (u.lastTgt && gone(u.lastTgt) && !u.counted) { u.counted = true; const k = u.lastTgt.dims ? 'ship' : u.lastTgt.kind === 'aa' ? 'aa' : 'building'; SW.stats.kills[k]++; }
      if (A.fuel !== undefined && A.fuel < 250 && u.phase !== 'home') home(u, 'BINGO');
    }
  };
  SW.reset = () => { for (const u of SW.jets) { u.dead = true; } SW.jets.length = 0; SW.turnT = 0; SW.stats = { sorties: 0, bombs: 0, lost: 0, recovered: 0, kills: { aa: 0, building: 0, ship: 0 }, dmgShip: 0 }; };
  return SW;
}
