// THE GROUND WAR: the battles on the islands as a pure simulation (no THREE, no DOM; runs in node for the bench and
// the balance runs, and inside war.js through groundwar.js). It is runaway/sandbox.js's host loop lifted into the
// archipelago: the same unit adapters, AI hand-offs, fire cadences, projectiles and hit-info contract, with
//   * one BATTLE per island (its own baked map, a RUNAWAY squad AI and a Marine squad AI over the same world query),
//   * real 1980 Marines (marine.js bodies + marineai.js) instead of the sandbox's dummies,
//   * seized MBTs on trackfm (mbttrack.js), RW-7s crossing the sea (a hovercraft's transit), units joining battles,
//   * level of detail: a battle far from the camera thinks at 5 Hz and its STRIDERs / MBTs move kinematically along
//     what the AI wants (the balance sims and the MBT tracks come back where they left off when the camera returns),
//   * the outside world (the player, AA sites, aircraft) through host hooks, so this file never imports war.js.
//
//   const GS = createGroundSim({ terrainH, islands, seed, hooks })
//   hooks: { targetsFor(B, side) -> [targets in the squad-AI format, ids unique],
//            extSeg(p, ax, ay, az, bx, by, bz) -> { t, apply() } | null   (side-2 rounds vs the player / AA / aircraft)
//            extBlast(x, y, z, r, power, side)                            (side-2 blasts on the outside world) }
//   GS.battle(I) -> B;  GS.addStrider / addHover / addMBT / addMarine(B | null, ...) -> unit
//   GS.squadRW(B, units, order), GS.squadMarines(B, units, order) -> squad;  GS.order(squad, order)
//   GS.join(B, unit) (a unit arriving joins the island's machines);  GS.transit(unit, route, B)
//   GS.step(dt, { cam: {x, y, z}, peace }) -> events;  GS.segHit(...) / GS.blast(...) for the war's own rounds
import { createIslandMaps } from './gwmap.js';
import { createMarineAI, MAR_T } from './marineai.js';
import { createMarine, MARINE, segCyl } from './marine.js';
import { createTrackDrive } from './mbttrack.js';
import { createSquadAI } from '../runaway/squadai.js';
import { createStrider, STRIDER } from '../runaway/strider.js';
import { createHoverTank, RW7 } from '../runaway/hovertank.js';
import { createMBT, MBT } from '../runaway/mbt.js';
import { AMMO, normalizeHit } from '../runaway/hit.js';
import { WPN } from '../runaway/sandbox.js';
import { rng } from '../runaway/rwworld.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// GAME-LEVEL rounds the war's own weapons and the Marines fire into the ground war (hit.js format, game values)
export const GW_AMMO = {
  ...AMMO,
  m16: AMMO.rifle,                                                            // M16A1 (Marines; the player's rifle)
  m60: AMMO.mg,                                                               // the Huey's door gun / M60
  m203: { calibre: 40, mass: 0.23, velocity: 76, type: 'heat', pen: 60 },    // 40 mm M433 HEDP: lobbed; a small shaped charge (game pen) + fragments
  cannon20: { calibre: 20, mass: 0.1, velocity: 1030, type: 'ap', pen: 40 },  // the Hornet's M61
  ffar: { calibre: 70, mass: 6.2, velocity: 700, type: 'heat', pen: 220 },    // 2.75 in rockets
};
// Marine weapons (game): rate (rounds / min of aimed or burst fire), spread (rad, 1 sigma), ammo, sound radius
export const MAR_WPN = {
  rifle: { rpm: 50, spread: 0.0045, ammo: 'm16', loud: 330, v: 900 },
  auto: { rpm: 700, burst: [3, 6], pause: [0.9, 2.2], spread: 0.009, ammo: 'm16', loud: 360, v: 900 },
  mg: { rpm: 550, burst: [5, 9], pause: [0.7, 1.8], spread: 0.007, ammo: 'm60', loud: 450, v: 853 },   // the attached M60
  gl: { rpm: 10, spread: 0.02, ammo: 'm203', loud: 120, v: 76 },
  law: { rpm: 6, spread: 0.009, ammo: 'law', loud: 500, v: 145, aim: [1.2, 2.2] },
};
// damage a RUNAWAY round does to a Marine (HP on foot.js's body-part scale) and to the outside world (war.js units)
// (hp: on a Marine; war: on an AA site or a vehicle; air: on an aircraft (a CH-46 on its LZ, a helicopter low over the fight); heli: the player's helicopter)
export const RW_HURT = { xm7: { hp: 60, war: 0.15, air: 0.02, heli: 0.08 }, needle: { hp: 48, war: 0.12, air: 0.015, heli: 0.07 }, mg: { hp: 62, war: 0.15, air: 0.03, heli: 0.09 }, coil120: { hp: 600, war: 3.2, air: 2.5, heli: 0.7 }, mbt120: { hp: 600, war: 3.5, air: 3, heli: 0.8 }, mbt125: { hp: 600, war: 3.5, air: 3, heli: 0.8 }, pd: { hp: 30, war: 0.05, air: 0.03, heli: 0.05 } };
const HEIGHT = { strider: 2.1, hovertank: 2.6, mbt: 2.4, marine: 1.8 };
const NEAR = 560;      // m from the island's shore to the camera: inside = full simulation
const AIR_RANGE = 170;   // m: machines open up on an aircraft only inside this

export function createGroundSim(o) {
  const { terrainH, islands } = o, hooks = o.hooks || {};
  const R = rng(o.seed ?? 1980), gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += R(); return (u - 3) / Math.sqrt(0.5); };
  const maps = createIslandMaps({ terrainH, islands });
  const GS = { maps, battles: [], units: [], proj: [], events: [], time: 0, nextId: 1, stats: { shots: { 1: 0, 2: 0 }, hits: { 1: 0, 2: 0 }, kills: { 1: 0, 2: 0 }, kia: 0, wia: 0 }, cam: { x: 0, y: 0, z: 0 }, peace: false };
  const ev = (e, x) => { GS.events.push(Object.assign({ e, t: GS.time }, x)); };
  // the ground the sims stand on: the island's baked grid where there is one, the live terrain elsewhere; walkers stay
  // out of the sea, the hovercraft rides over it
  const hAt = (x, z) => { const I = maps.at(x, z); return I && maps.has(I) ? maps.get(I).height(x, z) : terrainH(x, z); };
  const envLand = { height: hAt };
  const envHover = { height: (x, z) => Math.max(hAt(x, z), 0) };
  const armorEnv = { height: hAt, surface: (x, z) => { const h = hAt(x, z); if (h < 1.2) return 'sand'; const e = 1, s = Math.hypot(hAt(x + e, z) - hAt(x - e, z), hAt(x, z + e) - hAt(x, z - e)) / 2; return s > 0.7 ? 'rock' : (Math.sin(x * 0.05) * Math.cos(z * 0.047) > 0.3 ? 'dirt' : 'grass'); }, water: (x, z) => (hAt(x, z) < 0 ? 0 : -Infinity) };

  // ------------------------------------------------------------------------------------------------- battles
  GS.battle = I => {
    let B = GS.battles.find(b => b.I === I); if (B) return B;
    const M = maps.get(I);
    B = { I, M, rw: createSquadAI(M.world, { seed: 7 + I.id }), mar: createMarineAI(M.world, { seed: 1980 + I.id }), units: [], near: true, acc: 0, tmap: new Map(), sq: 0 };
    GS.battles.push(B); return B;
  };
  const inBattle = (B, u) => { u.B = B; if (B && !B.units.includes(u)) B.units.push(u); };

  // ------------------------------------------------------------------------------------------------- units
  function unit(o) { const u = { id: GS.nextId++, alive: true, up: true, cd: R() * 1.5, rl: 0, firedT: 99, deadT: 0, vx: 0, vz: 0, lite: false, ...o }; GS.units.push(u); return u; }
  GS.addStrider = (B, x, z, yaw, o = {}) => {
    const S = createStrider({ id: GS.nextId }); S.place(x, z, yaw, envLand);
    const wn = o.weapon === 'coil' ? 'coil' : 'xm7', w = WPN[wn];
    const u = unit({ side: 2, kind: 'strider', sim: S, eye: 1.95, vehicle: false, weaponName: wn, weapon: { range: w.range, antiArmor: false, rpm: w.rpm }, mag: w.mag, h: 2.1, tag: o.tag });
    sync(u); inBattle(B, u); return u;
  };
  GS.addHover = (B, x, z, yaw, o = {}) => {
    const T = createHoverTank({ id: GS.nextId }); T.place(x, z, yaw, envHover);
    const u = unit({ side: 2, kind: 'hovertank', sim: T, eye: 2.6, gun: 1.6, vehicle: true, weapon: { range: 900, antiArmor: true, rpm: 11 }, mag: 1, coax: { mag: 60, cd: 0, rl: 0 }, h: 2.6, tag: o.tag });
    sync(u); inBattle(B, u); return u;
  };
  GS.addMBT = (type, B, x, z, yaw, o = {}) => {
    const T = createMBT(MBT[type], { id: GS.nextId, drive: o.placeholder ? undefined : createTrackDrive }); T.place(x, z, yaw, armorEnv);
    const u = unit({ side: 2, kind: 'mbt', mbtType: type, sim: T, eye: 2.6, gun: 2.0, vehicle: true, weapon: { range: 1200, antiArmor: true, rpm: 9 }, mag: 1, coax: { mag: 100, cd: 0, rl: 0 }, h: MBT[type].H, tag: o.tag });
    sync(u); inBattle(B, u); return u;
  };
  GS.addMarine = (B, role, x, z, yaw, o = {}) => {
    const body = createMarine({ id: GS.nextId, role, x, z, yaw, env: envLand, seed: o.seed });
    const u = unit({ side: 1, kind: 'marine', role, body, laws: body.laws, gl: body.gl, able: true, h: 1.8, burst: 0, lawT: 0, seed: o.seed ?? GS.nextId });
    sync(u); inBattle(B, u); return u;
  };
  function sync(u) {
    const s = u.sim;
    if (u.kind === 'marine') {
      const M = u.body; u.x = M.x; u.y = M.y; u.z = M.z; u.yaw = M.yaw; u.alive = M.alive; u.able = M.able; u.up = M.able; u.vx = M.vx; u.vz = M.vz; u.h = M.height(); u.laws = M.laws; u.gl = M.gl;
      u.hp = Object.values(M.hp).reduce((a, b) => a + b, 0) / 440;
    } else if (u.kind === 'strider') {
      if (u.lite) { u.alive = s.alive; return; }   // (the kinematic stand-in keeps x / y / z itself)
      u.x = s.c[0]; u.z = s.c[2]; u.y = s.pos()[1]; u.yaw = s.yaw; u.headYaw = s.headYaw; u.alive = s.alive; u.up = s.up; u.blind = s.blind; u.prone = s.alive && s.mode === 'disabled'; u.gun = s.muzzle()[1] - u.y;
      u.hp = Math.max(0, s.hp.thorax / STRIDER.HP.thorax); u.vx = s.v[0]; u.vz = s.v[2];
    } else if (u.kind === 'hovertank') {
      u.x = s.p[0]; u.z = s.p[2]; u.y = envHover.height(s.p[0], s.p[2]); u.yaw = s.yaw; u.alive = s.alive; u.up = s.alive; u.hp = Math.max(0, s.hp.hull / RW7.HP.hull); u.vx = s.v[0]; u.vz = s.v[2];
    } else {
      u.x = s.p[0]; u.z = s.p[2]; u.y = s.p[1]; u.yaw = s.yaw; u.alive = s.alive; u.up = s.alive; u.hp = Math.max(0, s.hp.hull / s.P.hp.hull);
      u.vx = -Math.sin(s.yaw) * s.speed; u.vz = -Math.cos(s.yaw) * s.speed;
    }
  }
  GS.sync = sync;

  // ------------------------------------------------------------------------------------------------- squads
  GS.squadRW = (B, members, order) => { const S = B.rw.addSquad({ id: `R${B.I.id}-${++B.sq}`, side: 2, members, order }); S.B = B; for (const m of members) m.squad = S; return S; };
  GS.squadMarines = (B, members, order) => { const S = B.mar.addSquad({ id: `M${B.I.id}-${++B.sq}`, side: 1, members, order }); S.B = B; S.marines = true; for (const m of members) m.squad = S; return S; };
  GS.order = (S, order) => { if (S.marines) S.B.mar.order(S.id, order); else S.B.rw.order(S.id, order); S.order = order; };
  // a machine arriving (a hover tank off the sea, an MBT off a landing craft) joins the island's machines, or leads its own
  GS.join = (B, u, order) => {
    inBattle(B, u); u.transit = null;
    const S = B.rw.squads.find(s => s.members.some(m => m.alive && !m.vehicle) && s.state !== 'dead');
    if (S) { B.rw.addMember(S.id, u); u.squad = S; return S; }
    return GS.squadRW(B, [u], order || { type: 'defend', x: B.I.pad.x, z: B.I.pad.z, r: 30 });
  };
  // a unit on its way over the sea (hover tank): follows the route at speed, then joins B
  GS.transit = (u, route, B, order) => { u.transit = { route, i: 0, B, order }; u.B = null; };

  // ------------------------------------------------------------------------------------------------- firing
  function shoot(side, src, ammo, from, aim, spread, speed, o = {}) {
    const A = GW_AMMO[ammo], v = speed ?? A.velocity, dx = aim[0] - from[0], dy = aim[1] - from[1], dz = aim[2] - from[2], d = Math.hypot(dx, dy, dz) || 1;
    let ux, uy, uz;
    if (o.lob) {   // a grenade launcher: the low-angle solution for the range (or 45 deg if out of reach)
      const hd = Math.hypot(dx, dz) || 1, g = 9.81, v2 = v * v, disc = v2 * v2 - g * (g * hd * hd + 2 * dy * v2);
      const th = disc > 0 ? Math.atan((v2 - Math.sqrt(disc)) / (g * hd)) : Math.PI / 4;
      ux = dx / hd * Math.cos(th); uz = dz / hd * Math.cos(th); uy = Math.sin(th);
    } else {
      const tf = d / v, drop = 0.5 * 9.81 * tf * tf;
      ux = dx / d; uy = (dy + drop) / d; uz = dz / d; const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    }
    const ex = gauss() * spread, ey = gauss() * spread, px = -uz, pz = ux, pl = Math.hypot(px, pz) || 1;
    ux += px / pl * ex; uz += pz / pl * ex; uy += ey;
    const l = Math.hypot(ux, uy, uz);
    const p = { side, src: src.id, ammo, x: from[0], y: from[1], z: from[2], vx: ux / l * v, vy: uy / l * v, vz: uz / l * v, life: o.life ?? Math.min(6, 1400 / v + 0.5), heat: A.type === 'heat', gl: ammo === 'm203', big: ammo === 'coil120' || ammo === 'mbt120' || ammo === 'mbt125', B: src.B, near: null };
    GS.proj.push(p); GS.stats.shots[side]++; src.firedT = 0;
    const loud = o.loud ?? 330, kind = A.type === 'heat' || p.big ? 'blast' : 'shot';
    const snd = { x: from[0], y: from[1], z: from[2], loud, side, kind, src: src.id };
    if (src.B) { src.B.rw.hear(snd); src.B.mar.hear(snd); }
    ev('shot', { side, src: src.id, ammo, x: from[0], y: from[1], z: from[2], dx: ux / l, dy: uy / l, dz: uz / l, kind: src.kind });
    return p;
  }
  GS.shoot = shoot;
  function cadence(st, w, dt, want) {
    st.cd = Math.max(0, st.cd - dt);
    if (st.rl > 0) { st.rl -= dt; if (st.rl <= 0) st.mag = w.mag; return false; }
    if (!want || st.cd > 0) return false;
    st.cd = 60 / w.rpm; st.mag--; if (st.mag <= 0 && w.reload > 0) st.rl = w.reload; else if (st.mag <= 0) st.mag = w.mag;
    return true;
  }

  // ------------------------------------------------------------------------------------------------- RUNAWAY units
  function driveRW(B, u, dt, peace, tmap) {
    const a = u.ai, s = u.sim; if (!a) return;
    if (peace) { a.fire = false; }
    if (u.kind === 'strider') {
      const sp = a.run ? 4.2 : 1.6, [vx, vz] = dry(u, B.rw.steerVel(u, sp), 2.5);
      if (u.lite) {   // far: kinematic, the AI's velocity over the ground (the body sim waits where it is)
        if (s.alive) { const v = Math.hypot(vx, vz), k = Math.min(1, dt * 3); u.vx += (vx - u.vx) * k; u.vz += (vz - u.vz) * k; u.x += u.vx * dt; u.z += u.vz * dt; u.y = hAt(u.x, u.z); if (v > 0.2) u.yaw = Math.atan2(-u.vx, -u.vz); }
      } else {
        const cmd = { vx, vz, run: a.run, crouch: a.crouch, aim: a.aim || undefined, look: a.aim ? undefined : a.look };
        if (!a.aim && a.move) { cmd.aimYaw = Math.atan2(-vx, -vz); if (Math.hypot(vx, vz) < 0.2) delete cmd.aimYaw; }
        for (const e of s.step(dt, cmd, envLand)) {
          if (e.e === 'step') ev('step', { id: u.id, x: e.x, y: e.y, z: e.z, v: e.v, stumble: e.stumble });
          else if (e.e === 'fall') ev('fall', { id: u.id, x: u.x, y: u.y, z: u.z, why: e.why });
          else if (e.e === 'impact') ev('thud', { id: u.id, x: e.x, y: e.y, z: e.z });
          else if (e.e === 'getup') ev('getup', { id: u.id, x: u.x, y: u.y, z: u.z });
          else if (e.e === 'destroyed') killed(u);
        }
        if (s.stumble > 0.6 && !u._stum) { u._stum = true; ev('stumble', { id: u.id, x: u.x, y: u.y, z: u.z }); } else if (s.stumble < 0.2) u._stum = false;
      }
      // GAME RULE (the war's, not the sim's): a machine broken in two places - blind, its weapon arm or a leg gone, its
      // gut torn open - shuts down after a few seconds (its seams go dark); only a hit through the thorax kills outright
      if (s.alive) {
        const broken = (s.hp.head <= 0) + (s.hp.armR <= 0 || s.hp.weapon <= 0) + (s.hp.legL <= 0) + (s.hp.legR <= 0) + (s.hp.stomach <= 0);
        if (broken >= 2) { u.shutT = (u.shutT || 0) + dt; if (u.shutT > 3) { s.kill(); u.shutdown = true; } }
      }
      if (!s.alive && u.alive) killed(u);
      const w = WPN[u.weaponName];
      // (an aircraft is engaged only close in: rifle fire at a distant helicopter wastes the volley)
      const tgA = a.aimId != null ? tmap.get(a.aimId) : null, airFar = tgA && tgA.kind === 'air' && Math.hypot(tgA.x - u.x, tgA.z - u.z) > AIR_RANGE;
      if (cadence(u, w, dt, a.fire && !airFar && s.armed && (u.lite || s.up || u.prone) && a.aim)) {
        if (u.lite) { shoot(2, u, w.ammo, [u.x, u.y + 1.6, u.z], a.aim, w.spread + 0.004 + a.supp * 0.01, undefined, { loud: w.loud }); }
        else {
          const mz = s.muzzle(), err = s.aimError() + a.supp * 0.01, ad = s.aimDir(), tx = a.aim[0] - mz[0], ty = a.aim[1] - mz[1], tz = a.aim[2] - mz[2], tl = Math.hypot(tx, ty, tz) || 1;
          if ((ad[0] * tx + ad[1] * ty + ad[2] * tz) / tl > 0.9993) shoot(2, u, w.ammo, mz, a.aim, w.spread + err, undefined, { loud: w.loud });
          else u.cd = 0.05;
        }
      }
    } else {
      if (a.move && u.kind !== 'hovertank' && hAt(a.move[0], a.move[1]) < 0.6) a.move = landward(B, a.move);   // never a firing position in the sea
      const vehSp = a.run ? 12 : 7, [vx, vz] = u.kind === 'mbt' ? dry(u, B.rw.steerVel(u, vehSp), 7) : B.rw.steerVel(u, vehSp);
      const cmd = { vx, vz };
      if (a.face !== undefined && Math.hypot(vx, vz) < 1) cmd.face = a.face;
      if (a.aim) { const mz = s.muzzle(), dx = a.aim[0] - mz[0], dz = a.aim[2] - mz[2]; cmd.turret = Math.atan2(-dx, -dz); cmd.gun = Math.atan2(a.aim[1] - mz[1], Math.hypot(dx, dz)); if (u.kind === 'hovertank') cmd.aimAt = a.aim; }
      if (u.kind === 'mbt' && hAt(u.x, u.z) < 0.3) { const dx = B.I.x - u.x, dz = B.I.z - u.z, d = Math.hypot(dx, dz) || 1; cmd.vx = dx / d * 4; cmd.vz = dz / d * 4; delete cmd.face; }   // wet tracks: drive up out of the water first
      vehicleStep(u, dt, cmd);
      if (!s.alive) return;
      const tg = a.aimId != null ? tmap.get(a.aimId) : null, gd = s.gunDir(), mz = s.muzzle();
      const onTgt = a.aim && (() => { const tx = a.aim[0] - mz[0], ty = a.aim[1] - mz[1], tz = a.aim[2] - mz[2], tl = Math.hypot(tx, ty, tz) || 1; return (gd[0] * tx + gd[1] * ty + gd[2] * tz) / tl > 0.9985; })();
      const main = u.kind === 'hovertank' ? WPN.coilgun : WPN.mbtgun, coax = u.kind === 'hovertank' ? WPN.coax : WPN.mbtmg;
      const bigTarget = tg && (tg.kind === 'vehicle' || tg.kind === 'at' || tg.kind === 'mg');
      if (a.fire && onTgt && bigTarget && s.fire()) { const am = u.kind === 'hovertank' ? 'coil120' : (u.mbtType === 't90m' ? 'mbt125' : 'mbt120'); shoot(2, u, am, mz, a.aim, 0.0005 + 0.003 * Math.min(1, Math.abs(s.speed || 0) / 10), undefined, { loud: main.loud }); ev('mainGun', { id: u.id, kind: u.kind, x: mz[0], y: mz[1], z: mz[2], dx: gd[0], dy: gd[1], dz: gd[2] }); }
      if (cadence(u.coax, coax, dt, a.fire && onTgt && tg && tg.kind !== 'vehicle' && !(tg.kind === 'air' && Math.hypot(tg.x - u.x, tg.z - u.z) > AIR_RANGE * 1.5))) shoot(2, u, coax.ammo, mz, a.aim, 0.002 + (tg.kind === 'air' ? 0.004 : 0), undefined, { loud: coax.loud });
    }
  }
  // walkers and tracks keep out of the sea: a commanded velocity that would take them into water within `look` m stops
  function dry(u, v, look) {
    const l = Math.hypot(v[0], v[1]); if (l < 0.05) return v;
    const x = u.x + v[0] / l * look, z = u.z + v[1] / l * look;
    if (hAt(x, z) < (u.kind === 'mbt' ? 0.4 : 0.15)) { v[0] = 0; v[1] = 0; }
    return v;
  }
  // a point in the sea pulled in toward the island's middle until it is on dry ground
  function landward(B, p) {
    const I = B.I; let x = p[0], z = p[1];
    for (let i = 0; i < 20 && hAt(x, z) < 0.6; i++) { x += (I.x - x) * 0.12; z += (I.z - z) * 0.12; }
    return [x, z];
  }
  function vehicleStep(u, dt, cmd) {
    const s = u.sim;
    if (u.kind === 'mbt' && s.drive.setDetail) s.drive.setDetail(!u.lite, armorEnv);
    const evs = s.step(dt, cmd, u.kind === 'hovertank' ? envHover : armorEnv);
    for (const e of evs) if (e.e === 'destroyed') killed(u);
    if (!s.alive && u.alive) killed(u);
  }
  function killed(u) {
    if (u.dead) return; u.dead = true; u.alive = false; u.deadT = 0;
    GS.stats.kills[u.side === 2 ? 1 : 2]++;
    ev('destroyed', { id: u.id, kind: u.kind, side: u.side, x: u.x, y: u.y + (u.kind === 'strider' ? 1.2 : 1.5), z: u.z, I: u.B?.I, mbtType: u.mbtType });
  }

  // ------------------------------------------------------------------------------------------------- Marines
  function driveMarine(B, u, dt, tmap) {
    const a = u.ai, M = u.body; if (!a) return;
    const sp = MAR_T.SPEED[a.pace] || 1.5, [vx, vz] = dry(u, B.mar.steerVel(u, sp), 2);
    for (const e of M.step(dt, { vx, vz, stance: a.stance, face: a.face }, envLand)) {
      if (e.e === 'kia' || e.e === 'wia') { /* reported where the hit was applied */ }
    }
    u.firedT += dt;
    if (!M.alive || !M.able || GS.peaceMar) return;
    // fire: aimed rifle, the AR's bursts, an M203 lob, a LAW (aim first)
    const w = a.fire && MAR_WPN[a.fire];
    u.cd = Math.max(0, u.cd - dt);
    if (a.law && u.laws > 0) { u.lawT += dt; u.wantLaw = true; } else { u.lawT = 0; u.wantLaw = false; }   // (the launcher comes out when he decides on it, not when the shot is clear)
    if (!w || !a.aim) { u.burst = 0; return; }
    if (u.cd > 0) return;
    const tg = tmap.get(a.aimId), moving = M.speed > 0.4, ey = M.stanceTo === 'prone' ? 0.32 : M.stanceTo === 'crouch' ? 1.0 : 1.5;
    const from = [M.x - Math.sin(M.yaw) * 0.6, M.y + ey, M.z - Math.cos(M.yaw) * 0.6];
    const spread = w.spread * (1 + 2.5 * Math.min(1, a.supp) + (moving ? 1.5 : 0) + M.wounded * 2) * (M.stanceTo === 'prone' ? 0.7 : 1);
    // lead a mover a little (people under-lead)
    const tof = Math.hypot(a.aim[0] - from[0], a.aim[2] - from[2]) / w.v, lead = tof * (a.fire === 'law' ? 0.9 : 0.7);   // (a LAW gunner leads properly; riflemen under-lead)
    const aim = tg ? [a.aim[0] + (tg.vx || 0) * lead, a.aim[1], a.aim[2] + (tg.vz || 0) * lead] : a.aim;
    if (a.fire === 'law') {
      if (u.laws <= 0) return;
      if (u.lawT < (u.lawAim || (u.lawAim = 1.2 + R()))) return;   // extend, arm, aim
      shoot(1, u, 'law', from, aim, spread, w.v, { loud: w.loud }); M.laws--; u.laws = M.laws; u.lawT = 0; u.lawAim = 0; u.cd = 2; ev('backblast', { x: M.x + Math.sin(M.yaw) * 1.5, y: M.y + ey, z: M.z + Math.cos(M.yaw) * 1.5, yaw: M.yaw });
      return;
    }
    if (a.fire === 'gl') { if (M.gl <= 0) return; shoot(1, u, 'm203', from, aim, spread, w.v, { lob: true, loud: w.loud }); M.gl--; u.gl = M.gl; u.cd = 60 / w.rpm * (0.8 + R() * 0.6); return; }
    if (a.fire === 'auto' || a.fire === 'mg') {
      if (u.burst <= 0) u.burst = w.burst[0] + Math.floor(R() * (w.burst[1] - w.burst[0] + 1));
      shoot(1, u, w.ammo, from, aim, spread * (1 + 0.15 * (6 - u.burst)), w.v, { loud: w.loud }); u.burst--;
      u.cd = u.burst > 0 ? 60 / w.rpm : w.pause[0] + R() * (w.pause[1] - w.pause[0]);
      return;
    }
    shoot(1, u, w.ammo, from, aim, spread, w.v, { loud: w.loud }); u.cd = 60 / w.rpm * (0.6 + R() * 0.9);
  }

  // ------------------------------------------------------------------------------------------------- targets
  const tgtCache = new Map();
  function targetsFor(B, side) {
    const out = [];
    for (const u of B.units) {
      if (u.side === side) continue;
      if (u.kind === 'marine') {
        if (!u.alive || !u.able) { out.push({ id: u.id, side: 1, kind: 'inf', x: u.x, y: u.y, z: u.z, h: 0.4, alive: false }); continue; }
        const lawUp = u.wantLaw || u.firedT < 3 && u.lastFire === 'law';
        out.push({ id: u.id, side: 1, kind: lawUp ? 'at' : u.role === 'ar' && u.firedT < 2 ? 'mg' : 'inf', x: u.x, y: u.y, z: u.z, vx: u.vx, vz: u.vz, h: u.h, alive: true, firing: u.firedT, cover: u.body.stanceTo === 'prone' ? 0.5 : u.body.stanceTo === 'crouch' ? 0.3 : 0 });
      } else out.push({ id: u.id, side: 2, kind: u.kind, x: u.x, y: u.y, z: u.z, vx: u.vx, vz: u.vz, h: HEIGHT[u.kind], alive: u.alive, firing: u.firedT, cover: 0 });
    }
    if (hooks.targetsFor) for (const t of hooks.targetsFor(B, side)) out.push(t);
    return out;
  }

  // ------------------------------------------------------------------------------------------------- the battle loop
  function stepBattle(B, dt, peace) {
    // (peace: the machines see nothing to fight)
    const tR = peace ? [] : targetsFor(B, 2), tM = targetsFor(B, 1), tmapR = new Map(), tmapM = new Map();
    for (const t of tR) tmapR.set(t.id, t); for (const t of tM) tmapM.set(t.id, t);
    B.rw.update(dt, tR); B.mar.update(dt, tM);
    for (const u of B.units) {
      if (u.kind === 'marine') { driveMarine(B, u, dt, tmapM); if (u.ai) u.lastFire = u.ai.fire || u.lastFire; }
      else if (!u.dead || u.kind === 'strider') driveRW(B, u, dt, peace, tmapR);
      u.firedT += u.kind === 'marine' ? 0 : dt;
      sync(u);
    }
  }
  function lod(B) {
    const c = GS.cam, I = B.I, d = Math.hypot(c.x - I.x, c.z - I.z) - I.r;
    const near = d < NEAR || o.full;
    if (near === B.near) return;
    B.near = near;
    for (const u of B.units) {
      if (u.kind === 'strider') {
        if (!near && u.sim.up && u.alive) { u.lite = true; }
        else if (near && u.lite) { u.lite = false; if (u.sim.alive) u.sim.place(u.x, u.z, u.yaw, envLand); }
      } else if (u.kind === 'mbt') u.lite = !near;
    }
  }
  GS.step = (dt, ctx = {}) => {
    GS.time += dt; GS.events.length = 0; if (ctx.cam) GS.cam = ctx.cam;
    const peace = !!ctx.peace; GS.peace = peace;
    maps.tick(ctx.bakeMs ?? 2);
    for (const B of GS.battles) {
      lod(B);
      if (!B.units.length) continue;
      for (const u of B.units) sync(u);
      if (B.near) stepBattle(B, dt, peace);
      else { B.acc += dt; if (B.acc >= 0.2) { const d = B.acc; B.acc = 0; stepBattle(B, d, peace); } }
    }
    // units in transit (hover tanks over the sea)
    for (const u of GS.units) if (u.transit && u.alive) stepTransit(u, dt);
    projStep(dt);
    // the dead lie a while, then go
    for (let i = GS.units.length - 1; i >= 0; i--) {
      const u = GS.units[i]; if (u.alive) continue;
      u.deadT += dt;
      if (u.deadT > (u.kind === 'marine' ? 120 : 150)) { GS.units.splice(i, 1); if (u.B) { const k = u.B.units.indexOf(u); if (k >= 0) u.B.units.splice(k, 1); } ev('remove', { id: u.id, u }); }
    }
    return GS.events;
  };
  function stepTransit(u, dt) {
    const T = u.transit, s = u.sim, rt = T.route;
    while (T.i < rt.length - 1 && Math.hypot(rt[T.i][0] - u.x, rt[T.i][1] - u.z) < 25) T.i++;
    const [tx, tz] = rt[T.i], dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz) || 1, last = T.i === rt.length - 1, sp = last ? Math.min(14, 2 + d * 0.4) : 15;
    vehicleStep(u, dt, { vx: dx / d * sp, vz: dz / d * sp });
    sync(u);
    if (last && d < 12) { const B = T.B; GS.join(B, u, T.order); ev('arrived', { id: u.id, kind: u.kind, I: B.I, x: u.x, z: u.z }); }
  }

  // ------------------------------------------------------------------------------------------------- projectiles
  const segBox = (ax, ay, az, bx, by, bz, cx, cy, cz, yaw, hx, hy, hz) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), L = (x, z) => [(x - cx) * c - (z - cz) * s, (x - cx) * s + (z - cz) * c];
    const [lax, laz] = L(ax, az), [lbx, lbz] = L(bx, bz); let t0 = 0, t1 = 1;
    for (const [p, q, h] of [[lax, lbx, hx], [ay - cy, by - cy, hy], [laz, lbz, hz]]) {
      const d = q - p; if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) return -1; continue; }
      let u0 = (-h - p) / d, u1 = (h - p) / d; if (u0 > u1) { const t = u0; u0 = u1; u1 = t; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) return -1;
    }
    return t0;
  };
  // a segment against one ground unit: entry t or -1
  function unitT(u, ax, ay, az, bx, by, bz, pad = 0) {
    if (u.kind === 'marine') return u.body.segHit(ax, ay, az, bx, by, bz, pad);
    if (u.kind === 'strider') {
      const s = u.sim, x = u.lite ? u.x : s.c[0], z = u.lite ? u.z : s.c[2];
      if (u.lite || s.up) { const t1 = segCyl(ax, ay, az, bx, by, bz, x, z, 0.3 + pad, u.y + 1.15, u.y + STRIDER.H + pad), t2 = segCyl(ax, ay, az, bx, by, bz, x, z, 0.17 + pad, u.y, u.y + 1.15); return t1 < 0 ? t2 : t2 < 0 ? t1 : Math.min(t1, t2); }
      return segCyl(ax, ay, az, bx, by, bz, x, z, 0.9 + pad, u.y - 0.2, u.y + 0.8);
    }
    if (u.kind === 'hovertank') return segBox(ax, ay, az, bx, by, bz, u.sim.p[0], u.sim.p[1] + 0.35, u.sim.p[2], u.yaw, RW7.W / 2 + pad, 1.1 + pad, RW7.L / 2 + pad);
    const P = u.sim.P; return segBox(ax, ay, az, bx, by, bz, u.sim.p[0], u.sim.p[1] + P.H / 2 + 0.1, u.sim.p[2], u.yaw, P.W / 2 + pad, P.H / 2 + pad, P.hullL / 2 + pad);
  }
  const RAD = { marine: 1.2, strider: 1.4, hovertank: 5, mbt: 5.5 };
  // every unit of the other side within reach of a segment (cheap bounding test first)
  function* candidates(side, ax, az, bx, bz, extra = 0) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, half = Math.hypot(bx - ax, bz - az) / 2 + 6 + extra;
    for (const u of GS.units) {
      if (u.side === side) continue;
      if (!u.alive && !(u.kind === 'strider' && !u.lite)) continue;
      if (Math.abs(u.x - mx) > half || Math.abs(u.z - mz) > half) continue;
      yield u;
    }
  }
  function nearMissAt(p, u, ax, az, bx, bz) {
    if (!u.alive || !u.B) return;
    const cx = u.x - ax, cz = u.z - az, L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1, k = clamp((cx * (bx - ax) + cz * (bz - az)) / L2, 0, 1), dd = Math.hypot(ax + (bx - ax) * k - u.x, az + (bz - az) * k - u.z);
    if (dd > (u.kind === 'marine' ? 3 : 2.5)) return;
    if (!p.near) p.near = new Set(); if (p.near.has(u.id)) return; p.near.add(u.id);
    if (u.kind === 'marine') u.B.mar.nearMiss(u.id, p.big ? 0.6 : p.ammo === 'mg' || p.ammo === 'needle' ? 0.14 : 0.1);
    else u.B.rw.nearMiss(u.id, p.big ? 0.4 : 0.12);
  }
  // the terrain (and on a battle map its obstacles) along a segment: t or -1
  function groundT(ax, ay, az, bx, by, bz) {
    const I = maps.at((ax + bx) / 2, (az + bz) / 2);
    if (I && maps.has(I) && maps.get(I).ready) { const r = maps.get(I).world.raycast(ax, ay, az, bx, by, bz); return r ? r.t : -1; }
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3));
    for (let i = 1; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t; if (y < Math.max(terrainH(x, z), 0)) return t; }
    return -1;
  }
  // apply a hit-info to a unit; returns { part, pen, kia }
  function applyHit(u, h, hp) {
    if (u.kind === 'marine') {
      if (!u.body.alive) return { part: null };
      const wasAble = u.body.able, r = u.body.hit({ point: h.point, hp, kind: h.type === 'blast' || h.type === 'frag' ? 'blast' : 'bullet', why: h.weapon });
      if (r.kia) { GS.stats.kia++; u.B?.mar.casualty(u.id, 'kia'); ev('kia', { id: u.id, x: u.x, y: u.y, z: u.z, part: r.part, I: u.B?.I }); }
      else if (r.wia || (wasAble && !u.body.able)) { GS.stats.wia++; u.B?.mar.casualty(u.id, 'wia'); ev('wia', { id: u.id, x: u.x, y: u.y, z: u.z, part: r.part, I: u.B?.I }); }
      sync(u); return { part: r.part, pen: true, kia: r.kia };
    }
    if (u.lite && u.kind === 'strider' && !h.part) h.part = ['thorax', 'stomach', 'legL', 'legR', 'armL', 'armR', 'head'][Math.floor(R() * 7)];
    const r = u.sim.hit(h);
    if (!u.sim.alive && u.alive) killed(u);
    return r;
  }
  GS.applyHit = applyHit;
  function projStep(dt) {
    for (let i = GS.proj.length - 1; i >= 0; i--) {
      const p = GS.proj[i]; p.life -= dt;
      const ax = p.x, ay = p.y, az = p.z;
      p.vy -= 9.81 * dt; const bx = ax + p.vx * dt, by = ay + p.vy * dt, bz = az + p.vz * dt;
      // point defence (RW-7): an incoming rocket within 45 m gets a flechette burst
      if ((p.heat || p.gl) && p.side === 1 && pdIntercept(bx, by, bz)) { GS.proj.splice(i, 1); continue; }
      let hitT = 2, what = null;
      const gt = groundT(ax, ay, az, bx, by, bz); if (gt >= 0) { hitT = gt; what = { ground: true }; }
      for (const u of candidates(p.side, ax, az, bx, bz)) {
        const t = unitT(u, ax, ay, az, bx, by, bz);
        if (t >= 0 && t < hitT && (u.alive || u.kind === 'strider')) { hitT = t; what = { unit: u }; }
        else if (t < 0) nearMissAt(p, u, ax, az, bx, bz);
      }
      if (p.side === 2 && hooks.extSeg) { const r = hooks.extSeg(p, ax, ay, az, bx, by, bz); if (r && r.t < hitT) { hitT = r.t; what = { ext: r }; } }
      if (hitT <= 1) {
        const hx = ax + (bx - ax) * hitT, hy = ay + (by - ay) * hitT, hz = az + (bz - az) * hitT, sp = Math.hypot(p.vx, p.vy, p.vz);
        if (what.unit) {
          const u = what.unit, A = GW_AMMO[p.ammo], h = normalizeHit({ ...A, velocity: A.velocity, vel: [p.vx, p.vy, p.vz], point: [hx, hy, hz], side: p.side, weapon: p.ammo, src: p.src });
          const r = applyHit(u, h, (RW_HURT[p.ammo] || { hp: 60 }).hp);
          GS.stats.hits[p.side]++;
          ev('hit', { x: hx, y: hy, z: hz, id: u.id, kind: u.kind, part: r.part, pen: r.pen, ammo: p.ammo, side: p.side });
          if (u.B && u.kind !== 'marine') u.B.rw.nearMiss(u.id, 0.3);
        } else if (what.ext) what.ext.apply(hx, hy, hz);
        if (p.heat || p.big || p.gl) explode(p, hx, hy, hz, what.unit);
        else ev('impact', { x: hx, y: hy, z: hz, ammo: p.ammo, unit: !!what.unit, ground: !!what.ground, side: p.side });
        GS.proj.splice(i, 1); continue;
      }
      p.x = bx; p.y = by; p.z = bz;
      if (p.gl && p.life <= 0) { explode(p, bx, by, bz, null); GS.proj.splice(i, 1); continue; }
      if (p.life <= 0 || p.y < -20) GS.proj.splice(i, 1);
    }
  }
  function pdIntercept(x, y, z) {
    for (const u of GS.units) if (u.kind === 'hovertank' && u.alive && u.sim.pdCool <= 0 && u.sim.hp.pd > 0) {
      const d = Math.hypot(x - u.x, y - u.y - 1.5, z - u.z);
      if (d < 45 && d > 6) { u.sim.pdCool = 1.4; const ok = R() < 0.55; ev('pd', { id: u.id, x, y, z, ok, from: [u.x, u.y + 2.4, u.z] }); return ok; }
    }
    return false;
  }
  GS.pdIntercept = pdIntercept;
  function explode(p, x, y, z, direct) {
    const big = p.gl ? 0.45 : p.heat ? 1 : 0.75;
    ev('blast', { x, y, z, big, ammo: p.ammo, side: p.side });
    GS.blast(x, y, z, p.gl ? 5 : 7, big, p.side, direct);
    if (p.side === 2 && hooks.extBlast) hooks.extBlast(x, y, z, p.big ? 7 : 5, big, p.side);
  }
  // a blast at (x, y, z): striders get the blast hit-info (pushes, jolts, damage), vehicles a blast on top, Marines
  // fragments by distance; everyone near is suppressed. power ~ 1 for a LAW / rocket, 0.45 a 40 mm, 3+ a bomb.
  GS.blast = (x, y, z, r, power, side, direct = null) => {
    for (const u of candidates(side, x - r, z - r, x + r, z + r, 4)) {
      if (!u.alive || u === direct) continue;
      const dd = Math.hypot(u.x - x, u.y + 1 - y, u.z - z), reach = u.kind === 'marine' ? r * 1.3 : r;
      if (dd > reach + (RAD[u.kind] || 1) * 0.5) continue;
      const k = clamp(1 - dd / (reach + 0.5), 0.05, 1), dx = (u.x - x) / (dd || 1), dz = (u.z - z) / (dd || 1);
      if (u.kind === 'marine') applyHit(u, { point: null, type: 'blast' }, 260 * power * k);
      else if (u.kind === 'strider') applyHit(u, normalizeHit({ type: 'blast', energy: 9000 * k * power, impulse: 260 * k * power, dir: [dx, 0.3, dz], part: 'stomach', side }), 0);
      else applyHit(u, normalizeHit({ type: 'blast', energy: 30000 * k * power, impulse: 400 * k * power, dir: [dx, -0.5, dz], part: 'top', side }), 0);
      if (u.B) { if (u.kind === 'marine') u.B.mar.nearMiss(u.id, 0.6 * k + 0.2); else u.B.rw.nearMiss(u.id, 0.5 * k); }
    }
    // suppression a bit further out
    for (const B of GS.battles) if (Math.hypot(B.I.x - x, B.I.z - z) < B.I.r + 80) {
      B.rw.hear({ x, y, z, loud: 600, side, kind: 'blast' }); B.mar.hear({ x, y, z, loud: 600, side, kind: 'blast' });
      for (const u of B.units) if (u.alive && u.side !== side) { const dd = Math.hypot(u.x - x, u.z - z); if (dd < r * 2.5 && dd > r) { if (u.kind === 'marine') B.mar.nearMiss(u.id, 0.25); else B.rw.nearMiss(u.id, 0.15); } }
    }
  };
  // ------------------------------------------------------------------------------------------------- the war's rounds
  // a war.js projectile's path this frame (side 1: the player's guns, rockets, bombs; side 2: WASPs, flak) against the
  // ground units. Returns { t, unit, x, y, z } after applying the hit, or null. ammo: a GW_AMMO id.
  GS.segHit = (side, ammo, ax, ay, az, bx, by, bz, hp, pad = 0) => {
    let best = null, bt = 2;
    for (const u of candidates(side, ax, az, bx, bz, pad + 2)) {
      const t = unitT(u, ax, ay, az, bx, by, bz, pad);
      if (t >= 0 && t < bt && u.alive) { bt = t; best = u; }
      else if (t < 0 && u.B) nearMissAt({ ammo, big: false, near: null }, u, ax, az, bx, bz);
    }
    if (!best) return null;
    const x = ax + (bx - ax) * bt, y = ay + (by - ay) * bt, z = az + (bz - az) * bt;
    const A = GW_AMMO[ammo] || GW_AMMO.m60, h = normalizeHit({ ...A, velocity: A.velocity, vel: [bx - ax, by - ay, bz - az], point: [x, y, z], side, weapon: ammo, src: 'war' });
    const r = applyHit(best, h, hp ?? 60); GS.stats.hits[side]++;
    ev('hit', { x, y, z, id: best.id, kind: best.kind, part: r.part, pen: r.pen, ammo, side, war: true });
    return { t: bt, unit: best, x, y, z };
  };
  // the war's projectiles are heard by the battles they pass near (the door gun draws the machines' attention)
  GS.hearWar = (x, y, z, side, loud = 350, src = 'player') => { for (const B of GS.battles) if (B.units.length && Math.hypot(B.I.x - x, B.I.z - z) < B.I.r + loud) { const s = { x, y, z, loud, side, kind: 'shot', src }; B.rw.hear(s); B.mar.hear(s); } };
  GS.reset = () => { GS.battles.length = 0; GS.units.length = 0; GS.proj.length = 0; GS.events.length = 0; GS.time = 0; };
  GS.hAt = hAt; GS.envLand = envLand; GS.armorEnv = armorEnv;
  return GS;
}
