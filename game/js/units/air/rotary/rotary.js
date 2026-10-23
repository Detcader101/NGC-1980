// rotary.js - the war's AI rotorcraft and the troops they carry, behind a few hooks in war.js:
//   'drone'     -> CH-46E Sea Knight + 13 Marines (ours; command 1)        u.kind = 'ch46'
//   'transport' -> MV-22B Osprey + machine troopers (RUNAWAY)              u.kind = 'mv22'
//   'gunship'   -> RW-3 WASP ducted-fan attack drone (RUNAWAY)             u.kind = 'wasp'
//   'squad'     -> the troops on the ground: they hold the pad (capture), fire, die figure by figure
// The unit objects keep war.js's contract (p, v, yaw, hp, hpMax, r, side, target, landed, dying, dead, mesh), so the
// unit list, the targeting, the damage and the capture code in war.js work on them unchanged; everything that moves
// is flown physically by its flight model and AI (see ch46unit.js, mv22unit.js, waspunit.js).
import * as THREE from 'three';
import { createCH46Unit } from './ch46unit.js';
import { createSquad, padSlots } from './squad.js';
import { attitude } from './rb.js';
import { stateOf } from './pilot.js';

const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _att = {};
// deck spots on a carrier (local x, z): the CH-46s take the middle and bow spots (the Huey lives on the aft one)
const SPOTS = { ch46: [[-2, -2], [-2, -35]], mv22: [[-1, -36], [-1, 34]] };

export function createRotary(ctx) {
  const { W, scene, fx, terrainH, isWater } = ctx;
  const root = new THREE.Group(); root.name = 'rotary'; scene.add(root);
  const R = { squads: [], time: 0 };
  // the environment the flight models fly in: terrain, sea, ship decks (moving)
  const groundY = (x, z) => Math.max(terrainH(x, z), 0, W.deckY(x, z));
  const env = { groundY, water: (x, z) => isWater(x, z) && W.deckY(x, z) < -1e8, surfVel: (x, z) => W.surfVel(x, z) };
  const world = { groundY, floorAlong(x, z, ux, uz, L) { let m = groundY(x, z); for (let s = 12; s <= L; s += 12) m = Math.max(m, groundY(x + ux * s, z + uz * s)); return m; } };

  // ---- where to sit down: a deck spot on our carrier (moving) or the home island pad
  function carrierOf(side) { const c = side === 1 ? W.carrier : W.enemyCarrier; return c && c.sinking === undefined && !(c.sky && c.sky.up) ? c : null; }
  function deckSpot(c, lx, lz) {
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), x = c.p.x + lx * cs + lz * sn, z = c.p.z - lx * sn + lz * cs;
    return { x, y: 8 + Math.max(0, c.p.y), z, hdg: c.yaw, vx: c.v.x + c.w * (z - c.p.z), vz: c.v.z - c.w * (x - c.p.x) };
  }
  function homePad(side) { const I = W.islands.find(I => I.kind === 'hq' && I.owner0 === side); return { x: I.pad.x + 14, y: I.pad.h, z: I.pad.z, hdg: 0, vx: 0, vz: 0 }; }
  function freeSpot(kind, side) {   // a deck spot nobody of ours is sitting on
    const c = carrierOf(side); if (!c) return null;
    for (const [lx, lz] of SPOTS[kind]) { const s = deckSpot(c, lx, lz); if (!W.units.some(u => u.rot && Math.hypot(u.p.x - s.x, u.p.z - s.z) < 14 && u.p.y < s.y + 6)) return { lx, lz, ...s }; }
    return null;
  }
  // a landing zone beside the island's pad: room for the rotors and the fuselage clear of every building, flat ground,
  // tail toward the pad (the ramp opens onto it). foot = local circles [x, z, r] (nose -z) that must stay clear.
  function chooseLZ(I, foot, offs = [18, 16, 21, 13, 0]) {
    const p = I.pad; let best = null;
    for (const off of offs) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, x = p.x + Math.cos(a) * off, z = p.z + Math.sin(a) * off;
      const hdgs = off ? [Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI] : [0, Math.PI / 2, Math.PI, -Math.PI / 2];   // nose away from the pad
      for (const hdg of hdgs) {
        const cs = Math.cos(hdg), sn = Math.sin(hdg); let ok = true, flat = 0;
        for (const [lx, lz, r] of foot) {
          const wx = x + lx * cs + lz * sn, wz = z - lx * sn + lz * cs;
          for (const s of I.structs) if (Math.hypot(s.x - wx, s.z - wz) < s.r * 0.9 + r + 1) { ok = false; break; }
          if (!ok) break;
          const gy = groundY(wx, wz); if (r < 3) { flat = Math.max(flat, Math.abs(gy - p.h)); if (isWater(wx, wz)) ok = false; }
        }
        if (!ok || flat > 1.2) continue;
        const score = Math.abs(off - 18) + flat * 4;
        if (!best || score < best.score) best = { x, y: p.h, z, hdg, vx: 0, vz: 0, score };
      }
      if (best && off === offs[0]) break;
    }
    return best || { x: p.x, y: p.h, z: p.z, hdg: 0, vx: 0, vz: 0 };
  }
  const CH46_FOOT = [[0, 0, 1.8], [0, -4.5, 1.6], [0, 4.5, 1.6], [0, -5.08, 7.62], [0, 5.08, 7.62]];

  // ---- make: called from war.js makeAir(); returns a unit or null (= not ours, war builds it)
  R.make = (type, side, x, y, z, extra = {}) => {
    if (type === 'drone') return makeCH46(side, extra);
    return null;
  };
  function makeCH46(side, extra) {
    const sp = freeSpot('ch46', side), start = sp ? { x: sp.x, y: sp.y, z: sp.z, yaw: sp.hdg } : { ...homePad(side), yaw: 0 };
    const I = extra.target, lz = chooseLZ(I, CH46_FOOT);
    const u = { type: 'drone', kind: 'ch46', side, p: new THREE.Vector3(start.x, start.y + 2, start.z), v: new THREE.Vector3(), yaw: start.yaw, hp: 10, hpMax: 10, r: 7, cd: 0, ph: 0, state: 'go', landed: false, ...extra };
    const spot = sp ? [sp.lx, sp.lz] : null;
    const home = () => { const c = carrierOf(side); return c && spot ? deckSpot(c, spot[0], spot[1]) : homePad(side); };
    const U = createCH46Unit({ parent: scene, env, world, lz: () => u.lz, home, pad: I.pad, start, modex: 1 + Math.floor(rnd(30)), squad: 13,
      onParked: () => { u.dead = true; u.stowed = true; if (!U.squadExternal) U.squad.dispose(); } });
    u.lz = lz; u.rot = U; u.mesh = U.model.group;
    // the Marines become a ground unit of their own when they come off the ramp
    const unload = U.AI.hooks.unload;
    U.AI.hooks.unload = (ai, dt) => { const done = unload(ai, dt); if (U.deployed && !u.squadUnit) { u.squadUnit = addSquad(U.squad, side, u.target, 9); U.squadExternal = true; } return done; };
    return u;
  }
  function addSquad(Q, side, I, capTime) {
    const s = { type: 'squad', side, p: new THREE.Vector3(I.pad.x, I.pad.h + 1, I.pad.z), v: new THREE.Vector3(), yaw: 0, hp: Q.alive, hpMax: Q.alive, r: 7, cd: rnd(1, 3),
      target: I, landed: false, capTime, mesh: new THREE.Object3D(), squad: Q, rot: { squad: true } };
    scene.add(s.mesh); W.units.push(s); R.squads.push({ Q, u: s, I, side, t: 0 });
    return s;
  }

  // ---- per-frame update of one unit (war.js updateAir hook): returns true when handled
  R.update = (u, dt, pl, peace) => {
    if (u.type === 'squad') return updateSquad(u, dt, pl, peace);
    const U = u.rot; R.time = W.time;
    if (u.kind === 'ch46') updateTransport(u, U, dt);
    return true;
  };
  function updateTransport(u, U, dt) {
    const S = U.S, I = u.target;
    // mission changes: target taken by us already before the Marines got there -> home with them aboard
    if (!u.dying && I && I.owner === u.side && !U.deployed && U.AI.phase !== 'rtb' && U.AI.phase !== 'descend2' && U.AI.phase !== 'parked') { U.AI.goHome(); u.target = null; }
    // damage: below half an engine quits (single-engine: abort, go home); dying = both out, autorotate down
    if (!u.engHit && u.hp < u.hpMax * 0.5 && !u.dying) { u.engHit = true; S.eng[Math.random() < 0.5 ? 0 : 1].ok = false; if (!U.deployed) { U.AI.goHome(); } ctx.feed(`SEA KNIGHT ${u.side === 1 ? '' : ''}HIT  -  ONE ENGINE OUT${U.deployed ? '' : ', RETURNING'}`, 'bad'); }
    if (u.dying && !u.crashing) startCrash(u, U);
    if (u.crashing) crashStep(u, U, dt); else U.update(dt, W.time);
    const b = S.body; u.p.set(b.pos[0], b.pos[1], b.pos[2]); u.v.set(b.vel[0], b.vel[1], b.vel[2]); attitude(b.q, _att); u.yaw = _att.yaw;
    if (U.dead && !u.crashed) crash(u, U);
    if (u.hp < u.hpMax * 0.6 && Math.random() < 0.5) fx.trail(u.p.x + rnd(-1, 1), u.p.y + 2.5, u.p.z + rnd(-1, 1), 1.2);
    downwash(u, S.agl, (S.rf.T + S.ra.T) / 2, 7.62);
  }
  // shot down: both engines out (or a rotor gone), the AI pilot autorotates for the ground, the wreck burns
  function startCrash(u, U) {
    u.crashing = true; u.crashT = 0; const S = U.S; S.eng[0].ok = S.eng[1].ok = false;
    u.catastrophic = Math.random() < 0.4; if (u.catastrophic) S.mods = { liftA: 0.2 };
    if (!U.squadExternal) { U.squad.killAll(); ctx.feed(u.side === 1 ? 'SEA KNIGHT GOING DOWN  -  MARINES ABOARD' : 'ENEMY TRANSPORT GOING DOWN', u.side === 1 ? 'bad' : 'good'); }
  }
  const _st = {};
  function crashStep(u, U, dt) {
    const S = U.S, P = U.P; u.crashT += dt;
    // autorotation: collective holds rotor rpm, nose for ~70 kt, flare low, cushion at the bottom
    stateOf(S.body, _st);
    const flare = S.agl < 25, cushion = S.agl < 5;
    P.i.coll = Math.max(0, Math.min(1, P.i.coll + (S.rpm - 1.0) * 1.2 * dt));
    const coll = cushion ? Math.min(1, P.i.coll + 0.4) : P.i.coll;
    const fx_ = -Math.sin(_st.yaw), fz = -Math.cos(_st.yaw), vf = flare ? 0 : 36;
    const c = P.step(_st, dt, { vx: fx_ * vf, vz: fz * vf, hdg: _st.yaw, collFix: coll, pitch: flare ? 0.25 : undefined });
    c.eng0 = c.eng1 = false;
    const e = S.step(dt, c, env); U.sync(dt, W.time); if (!U.squadExternal) U.squad.update(dt, W.time);
    if (S.dead || e === 'land' || e === 'hardland' || e === 'crash' || u.crashT > 40 || (S.body.contacts && u.crashT > 2)) U.dead = U.dead || 'crash';
    if (Math.random() < 0.8) { fx.trail(u.p.x, u.p.y + 2, u.p.z, 1.6); fx.add.spawn(u.p.x, u.p.y + 2, u.p.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.3, 0.6), 1.6, 0.5, 1, rnd(.4, .6), .1, 0.9, -1, 1); }
  }
  function crash(u, U) {
    u.crashed = true; const gy = groundY(u.p.x, u.p.z), wet = env.water(u.p.x, u.p.z);
    fx.explode(u.p.x, gy + 1, u.p.z, 3, { fire: wet ? 0 : 80, oil: wet, debris: 14, color: u.side === 1 ? 0x46553b : 0x5a5650 });
    ctx.boomAt(u.p.x, gy, u.p.z, 1.1); ctx.blast(u.p.x, gy + 1, u.p.z, 9, 4, u.side);
    u.dead = true; u.dying = true;
    if (!U.squadExternal) U.squad.dispose();   // the Marines aboard died with her
  }
  // dust or spray thrown out under a rotor in ground effect (the Huey's wash, scaled by disc loading)
  function downwash(u, agl, T, Rr) {
    if (agl > Rr * 2.5 || T < 5000) return;
    const k = (1 - agl / (Rr * 2.5)) * Math.min(1, T / 60000), wet = env.water(u.p.x, u.p.z), gy = groundY(u.p.x, u.p.z);
    for (let i = 0; i < 4; i++) if (Math.random() < k) {
      const a = rnd(6.283), sp = rnd(10, 22), rr = rnd(2, Rr);
      if (wet) fx.mix.spawn(u.p.x + Math.cos(a) * rr, gy + 0.3, u.p.z + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.1), 0.7, 3, .85, .92, .97, 0.4, 2, 1.4, 0.3);
      else fx.mix.spawn(u.p.x + Math.cos(a) * rr, gy + 0.3, u.p.z + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.2), 0.8, 3.4, .55, .48, .36, 0.45, 1.5, 1.5, 0.3);
    }
  }

  // ---- squads on the ground: hold the pad, shoot at enemies near, lose figures to hits
  function updateSquad(u, dt, pl, peace) {
    const Q = u.squad;
    if (u.dying || u.hp <= 0) { Q.killAll(); u.dead = true; ctx.feed(u.side === 1 ? `${u.target.name}: MARINE SQUAD WIPED OUT` : `${u.target.name}: ENEMY LANDING PARTY DESTROYED`, u.side === 1 ? 'bad' : 'good'); if (u.side === 2) ctx.addScore(300); return true; }
    const lost = Q.alive - Math.ceil(u.hp); if (lost > 0) Q.hit(lost);
    if (Q.center(_v)) u.p.set(_v.x, _v.y + 1, _v.z);
    u.landed = Q.holding > 0 && Math.hypot(u.p.x - u.target.pad.x, u.p.z - u.target.pad.z) < 14;
    // small arms: holding figures fire at the nearest enemy aircraft or troops in reach (game level)
    u.cd -= dt;
    if (u.cd <= 0 && Q.holding && !(peace && u.side === 2)) {
      u.cd = rnd(0.5, 1.4) * 6 / Math.max(1, Q.holding);
      let best = null, bd = u.side === 1 ? 130 : 110;
      for (const o of W.units) if (o.side !== u.side && o.side !== 0 && o.p && !o.dims && !o.dead && !o.dying) { const d = o.p.distanceTo(u.p); if (d < bd) { bd = d; best = o; } }
      if (!best && u.side === 2 && pl.alive && !pl.inCave && pl.pos.distanceTo(u.p) < 110) best = { p: pl.pos, v: pl.vel };
      if (best) {
        const f = Q.figs.find(F => F.st === 'hold' && Math.random() < 0.5) || Q.figs.find(F => F.st === 'hold');
        const sx = f.x, sy = f.y + 1.3, sz = f.z, t = bd / 90, e = 0.035 + bd / 4000;
        _v.set(best.p.x + best.v.x * t - sx, best.p.y + best.v.y * t - sy, best.p.z + best.v.z * t - sz).normalize();
        ctx.shoot('b', u.side, sx, sy, sz, (_v.x + rnd(-e, e)) * 90, (_v.y + rnd(-e, e)) * 90, (_v.z + rnd(-e, e)) * 90, 1.6);
        fx.add.spawn(sx + _v.x * 0.9, sy + _v.y * 0.9, sz + _v.z * 0.9, 0, 0, 0, 0.05, 0.6, 0.3, 1, .85, .5, 1);
        if (ctx.hear(sx, sy, sz, 220) > 0.05 && Math.random() < 0.5) ctx.sfx.blip?.(u.side === 1 ? 700 : 1300, 200, 0.06, 'square', 0.05 * ctx.hear(sx, sy, sz, 220));
      }
    }
    return true;
  }
  // ---- after the war is done with a unit: garrisons stay on their island, the dead lie a while
  R.tick = (dt) => {
    R.time = W.time;
    for (let i = R.squads.length - 1; i >= 0; i--) {
      const s = R.squads[i], Q = s.Q;
      if (s.u.dead && !s.gone) { s.gone = true; if (Q.alive && s.I.owner === s.side) Q.garrison(); }
      if (s.gone) {
        s.t += dt;
        if (Q.state === 'garrison' && s.I.owner !== s.side) { Q.killAll(); Q.state = 'dead'; }   // the island fell: the garrison is gone
        if ((Q.state !== 'garrison' && s.t > 45) || (Q.state === 'garrison' && R.squads.filter(o => o.I === s.I && o.Q.state === 'garrison').length > 1 && s.t > 60)) { Q.dispose(); R.squads.splice(i, 1); continue; }
      }
      Q.update(dt, W.time);
      if (s.side === 2) Q.root.visible = s.u.dead ? true : s.u.mesh.visible;
    }
  };
  R.reset = () => { for (const s of R.squads) s.Q.dispose(); R.squads.length = 0; };
  R.chooseLZ = chooseLZ; R.env = env; R.root = root;
  return R;
}
