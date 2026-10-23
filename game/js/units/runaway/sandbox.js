// RUNAWAY ground-forces SANDBOX: a pure battle host (no THREE, no DOM) that wires the sims (strider.js,
// hovertank.js, mbt.js), the squad AI (squadai.js) and the world query (rwworld.js) together with 1980 DUMMY targets
// that shoot back, projectiles, hits (hit-info contract) and sounds. dev/runaway.html renders it; the bench
// (tools/runawaybench.mjs) runs whole fights in node. It is also the reference for wave 2's war.js integration: the
// same adapter / apply / fire loop, with war.js units instead of the dummies.
//
// Weapons here are GAME-TUNED (hit.js AMMO classes): rates, spreads and ranges chosen for play, not real performance.

import { makeWorldQuery, sandboxIsland, rng } from './rwworld.js';
import { createStrider, STRIDER } from './strider.js';
import { createHoverTank, RW7 } from './hovertank.js';
import { createMBT, MBT } from './mbt.js';
import { createSquadAI } from './squadai.js';
import { AMMO, normalizeHit } from './hit.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// weapons (game values): rpm, rounds per magazine, reload s, spread rad (1 sigma), range m, ammo class, sound radius
export const WPN = {
  xm7: { rpm: 160, mag: 20, reload: 2.6, spread: 0.0025, range: 320, ammo: 'xm7', loud: 330 },
  coil: { rpm: 90, mag: 12, reload: 3.0, spread: 0.0012, range: 420, ammo: 'needle', loud: 180 },
  coilgun: { rpm: 11, mag: 1, reload: 0, spread: 0.0008, range: 900, ammo: 'coil120', loud: 700, antiArmor: true },
  coax: { rpm: 420, mag: 60, reload: 3.0, spread: 0.004, range: 380, ammo: 'needle', loud: 250 },
  mbtgun: { rpm: 9, mag: 1, reload: 0, spread: 0.001, range: 1200, ammo: 'mbt120', loud: 900, antiArmor: true },
  mbtmg: { rpm: 500, mag: 100, reload: 4, spread: 0.005, range: 500, ammo: 'mg', loud: 400 },
  // 1980 dummies
  rifle: { rpm: 90, mag: 20, reload: 3.0, spread: 0.006, range: 320, ammo: 'rifle', loud: 330 },
  mg: { rpm: 450, mag: 100, reload: 5.0, spread: 0.008, range: 600, ammo: 'mg', loud: 450 },
  law: { rpm: 6, mag: 1, reload: 7.0, spread: 0.012, range: 200, ammo: 'law', loud: 500, antiArmor: true },
  tankgun: { rpm: 7, mag: 1, reload: 0, spread: 0.002, range: 1200, ammo: 'tankgun', loud: 900, antiArmor: true },
};
// a crouched 1980 dummy shows its head and shoulders over the wall while it fires (and for a second after)
const dummyH = d => d.kind === "vehicle" ? d.h : d.crouch ? (d.firing < 1.2 ? 1.5 : 1.15) : 1.8;
const DUMMY = { inf: { h: 1.8, hp: 100, wpn: 'rifle' }, mg: { h: 1.8, hp: 100, wpn: 'mg' }, at: { h: 1.8, hp: 100, wpn: 'law' }, vehicle: { h: 3.0, hp: 500, wpn: 'tankgun' } };

export function createSandbox(opt = {}) {
  const isl = opt.island || sandboxIsland(opt.seed ?? 1980), world = makeWorldQuery(isl), R = rng(opt.seed ?? 11);
  const env = { height: (x, z) => isl.height(x, z), normal: (x, z) => world.normal(x, z) };
  const ai = createSquadAI(world, { seed: opt.seed ?? 7 });
  const B = { isl, world, env, ai, units: [], dummies: [], proj: [], events: [], time: 0, stats: { shots: { 1: 0, 2: 0 }, hits: { 1: 0, 2: 0 }, kills: { 1: 0, 2: 0 }, falls: 0, stumbles: 0, pd: 0, end: { 1: {}, 2: {} } }, nextId: 1 };
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += R(); return (u - 3) / Math.sqrt(0.5); };

  // ---------------------------------------------------------------------------------------- spawning
  B.addStrider = (x, z, yaw, o = {}) => {
    const S = createStrider({ id: B.nextId }); S.place(x, z, yaw, env);
    const w = WPN[o.weapon === 'coil' ? 'coil' : 'xm7'];
    const m = { id: B.nextId++, kind: 'strider', side: 2, sim: S, eye: 1.95, vehicle: false, weaponName: o.weapon === 'coil' ? 'coil' : 'xm7', weapon: { range: w.range, antiArmor: false, rpm: w.rpm }, mag: w.mag, cd: 0, rl: 0, h: 2.1, tag: o.tag };
    sync(m); B.units.push(m); return m;
  };
  B.addHover = (x, z, yaw) => {
    const T = createHoverTank({ id: B.nextId }); T.place(x, z, yaw, env);
    const m = { id: B.nextId++, kind: 'hovertank', side: 2, sim: T, eye: 2.6, gun: 1.6, vehicle: true, weapon: { range: 900, antiArmor: true, rpm: 11 }, mag: 1, cd: 0, rl: 0, coax: { mag: 60, cd: 0, rl: 0 }, h: 2.6 };
    sync(m); B.units.push(m); return m;
  };
  B.addMBT = (type, x, z, yaw) => {
    const T = createMBT(MBT[type], { id: B.nextId }); T.place(x, z, yaw, env);
    const m = { id: B.nextId++, kind: 'mbt', mbtType: type, side: 2, sim: T, eye: 2.6, gun: 2.0, vehicle: true, weapon: { range: 1200, antiArmor: true, rpm: 9 }, mag: 1, cd: 0, rl: 0, coax: { mag: 100, cd: 0, rl: 0 }, h: MBT[type].H };
    sync(m); B.units.push(m); return m;
  };
  B.addSquad = (members, order) => ai.addSquad({ id: 'S' + (ai.squads.length + 1), side: 2, members, order });
  // a 1980 dummy (stand-in for the task force until wave 2): stands / crouches at a spot, shoots back
  B.addDummy = (kind, x, z, o = {}) => {
    const D = DUMMY[kind];
    const d = { id: B.nextId++, side: 1, kind, x, z, y: isl.height(x, z), h: D.h, hp: D.hp, alive: true, wpn: WPN[D.wpn], wpnName: D.wpn, mag: WPN[D.wpn].mag, cd: R() * 2, rl: 0, firing: Infinity,
      crouch: !!o.crouch, supp: 0, spot: new Map(), target: null, yaw: o.yaw ?? 0, vx: 0, vz: 0, advance: o.advance || null, cover: 0, laws: kind === 'at' ? 3 : Infinity };
    if (kind === 'vehicle') d.yaw = o.yaw ?? 0;
    B.dummies.push(d); return d;
  };

  function sync(m) {
    const s = m.sim;
    if (m.kind === 'strider') {
      m.x = s.c[0]; m.z = s.c[2]; m.y = s.pos()[1]; m.yaw = s.yaw; m.headYaw = s.headYaw; m.alive = s.alive; m.up = s.up; m.blind = s.blind; m.prone = s.alive && s.mode === "disabled"; m.gun = s.muzzle()[1] - m.y;
      m.hp = Math.max(0, s.hp.thorax / STRIDER.HP.thorax); m.vx = s.v[0]; m.vz = s.v[2];
    } else if (m.kind === 'hovertank') {
      m.x = s.p[0]; m.z = s.p[2]; m.y = isl.height(s.p[0], s.p[2]); m.yaw = s.yaw; m.alive = s.alive; m.up = s.alive; m.hp = Math.max(0, s.hp.hull / RW7.HP.hull); m.vx = s.v[0]; m.vz = s.v[2];
    } else {
      m.x = s.p[0]; m.z = s.p[2]; m.y = s.p[1]; m.yaw = s.yaw; m.alive = s.alive; m.up = s.alive; m.hp = Math.max(0, s.hp.hull / s.P.hp.hull);
      m.vx = -Math.sin(s.yaw) * s.speed; m.vz = -Math.cos(s.yaw) * s.speed;
    }
  }
  const ev = (e, o) => B.events.push({ e, t: B.time, ...o });
  const sound = (x, y, z, loud, side, kind, src) => { ai.hear({ x, y, z, loud, side, kind, src }); ev('sound', { x, y, z, loud, kind }); };

  // ---------------------------------------------------------------------------------------- firing
  function shoot(side, src, wpn, from, aimPt, extraSpread = 0, opts = {}) {
    const A = AMMO[wpn.ammo], dx = aimPt[0] - from[0], dy = aimPt[1] - from[1], dz = aimPt[2] - from[2], d = Math.hypot(dx, dy, dz) || 1;
    const tf = d / A.velocity, drop = 0.5 * 9.81 * tf * tf * (A.type === 'heat' ? 1 : 1);   // aim up for the drop
    let ux = dx / d, uy = (dy + drop) / d, uz = dz / d; const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const sp = wpn.spread + extraSpread, ex = gauss() * sp, ey = gauss() * sp;
    // perturb in two directions perpendicular to u
    const px = -uz, pz = ux, pl = Math.hypot(px, pz) || 1, qx = -uy * pz / pl, qy = (ux * pz - uz * px) / pl * 1, qz = uy * px / pl;
    ux += px / pl * ex + qx * ey; uy += qy * ey; uz += pz / pl * ex + qz * ey;
    const l = Math.hypot(ux, uy, uz);
    const p = { side, src, ammo: wpn.ammo, x: from[0], y: from[1], z: from[2], vx: ux / l * A.velocity, vy: uy / l * A.velocity, vz: uz / l * A.velocity, life: Math.min(4, wpn.range * 1.4 / A.velocity + 0.5), heat: A.type === 'heat', tgt: opts.tgt ?? null, id: B.nextId++ };
    B.proj.push(p); B.stats.shots[side]++;
    sound(from[0], from[1], from[2], wpn.loud, side, wpn.antiArmor ? 'blast' : 'shot', src);
    ev('shot', { side, src, ammo: wpn.ammo, x: from[0], y: from[1], z: from[2], dx: ux / l, dy: uy / l, dz: uz / l });
    return p;
  }
  // a weapon's cadence: returns true when a round may go now
  function cadence(st, wpn, dt, want) {
    st.cd = Math.max(0, st.cd - dt);
    if (st.rl > 0) { st.rl -= dt; if (st.rl <= 0) st.mag = wpn.mag; return false; }
    if (!want || st.cd > 0) return false;
    st.cd = 60 / wpn.rpm; st.mag--; if (st.mag <= 0 && wpn.reload > 0) st.rl = wpn.reload; else if (st.mag <= 0) st.mag = wpn.mag;
    return true;
  }

  // ---------------------------------------------------------------------------------------- RUNAWAY units
  function driveUnit(m, dt) {
    const a = m.ai, s = m.sim;
    if (m.kind === 'strider') {
      const sp = a.run ? 4.2 : 1.6, [vx, vz] = ai.steerVel(m, sp);
      const cmd = { vx, vz, run: a.run, crouch: a.crouch, aim: a.aim || undefined, look: a.aim ? undefined : a.look };
      if (!a.aim && a.move) { cmd.aimYaw = Math.atan2(-vx, -vz); if (Math.hypot(vx, vz) < 0.2) delete cmd.aimYaw; }
      const evs = s.step(dt, cmd, env);
      for (const e of evs) {
        if (e.e === 'step') ev('step', { id: m.id, x: e.x, y: e.y, z: e.z, v: e.v, stumble: e.stumble });
        if (e.e === 'fall') { B.stats.falls++; ev('fall', { id: m.id, why: e.why }); }
        if (e.e === 'impact') ev('thud', { id: m.id, x: e.x, y: e.y, z: e.z });
        if (e.e === 'destroyed') { B.stats.kills[1]++; ev('destroyed', { id: m.id, x: s.c[0], y: s.c[1], z: s.c[2], kind: m.kind }); }
        if (e.e === 'getup') ev('getup', { id: m.id });
      }
      if (s.stumble > 0.6 && !m._stum) { B.stats.stumbles++; m._stum = true; ev('stumble', { id: m.id }); } else if (s.stumble < 0.2) m._stum = false;
      const w = WPN[m.weaponName];
      if (cadence(m, w, dt, a.fire && s.armed && (s.up || m.prone) && a.aim)) {
        const mz = s.muzzle(), err = s.aimError() + a.supp * 0.01;
        // only fire if the weapon is actually on target (torso slew)
        const ad = s.aimDir(), tx = a.aim[0] - mz[0], ty = a.aim[1] - mz[1], tz = a.aim[2] - mz[2], tl = Math.hypot(tx, ty, tz);
        if ((ad[0] * tx + ad[1] * ty + ad[2] * tz) / tl > 0.9993) { const p = shoot(2, m.id, w, mz, a.aim, err); const k = B.squadOf(m)?.know.get(a.aimId); p.meta = k?.seen ? "seen" : "blind"; p.err = err; }
        else m.cd = 0.05;
      }
    } else {
      const vehSp = a.run ? 12 : 7, [vx, vz] = ai.steerVel(m, vehSp);
      const cmd = { vx, vz };
      if (a.face !== undefined && Math.hypot(vx, vz) < 1) cmd.face = a.face;
      if (a.aim) { const mz = s.muzzle(), dx = a.aim[0] - mz[0], dz = a.aim[2] - mz[2]; cmd.turret = Math.atan2(-dx, -dz); cmd.gun = Math.atan2(a.aim[1] - mz[1], Math.hypot(dx, dz)); }
      const evs = s.step(dt, cmd, env);
      for (const e of evs) if (e.e === 'destroyed') { B.stats.kills[1]++; ev('destroyed', { id: m.id, x: m.x, y: m.y + 1.5, z: m.z, kind: m.kind }); }
      if (!s.alive) return;
      // main gun at vehicles / AT, coax at infantry
      const tg = a.aimId != null ? B.dummies.find(d => d.id === a.aimId) : null;
      const gd = s.gunDir(), mz = s.muzzle();
      const onTgt = a.aim && (() => { const tx = a.aim[0] - mz[0], ty = a.aim[1] - mz[1], tz = a.aim[2] - mz[2], tl = Math.hypot(tx, ty, tz); return (gd[0] * tx + gd[1] * ty + gd[2] * tz) / tl > 0.9985; })();
      const main = m.kind === 'hovertank' ? WPN.coilgun : WPN.mbtgun, coax = m.kind === 'hovertank' ? WPN.coax : WPN.mbtmg;
      const bigTarget = tg && (tg.kind === 'vehicle' || tg.kind === 'at' || tg.kind === 'mg');
      if (a.fire && onTgt && bigTarget && s.fire()) { shoot(2, m.id, main, mz, a.aim, 0.0005 + 0.003 * Math.min(1, s.speed / 10)); ev('mainGun', { id: m.id, kind: m.kind, x: mz[0], y: mz[1], z: mz[2] }); }
      if (cadence(m.coax, coax, dt, a.fire && onTgt && tg && tg.kind !== 'vehicle')) shoot(2, m.id, coax, mz, a.aim, 0.002);
    }
  }

  // ---------------------------------------------------------------------------------------- 1980 dummies
  const ruTargets = () => B.units.filter(m => m.alive);
  function dummyStep(d, dt) {
    if (!d.alive) return;
    d.supp = Math.max(0, d.supp - dt * 0.15); d.firing += dt;
    d.y = isl.height(d.x, d.z);
    // optional advance: walk toward a point (stop when suppressed or in contact)
    if (d.advance && d.supp < 0.4 && d.kind !== 'vehicle') {
      const dx = d.advance[0] - d.x, dz = d.advance[1] - d.z, l = Math.hypot(dx, dz);
      if (l > 2 && !(d.target && d.target.alive)) { const [ux, uz] = world.steer(d.x, d.z, dx, dz, 0.5, 4); d.vx = ux * 1.6; d.vz = uz * 1.6; d.x += d.vx * dt; d.z += d.vz * dt; d.crouch = false; }
      else { d.vx = d.vz = 0; d.crouch = true; }
    }
    // perception: a short delay to spot a machine, faster if it moves or shoots
    let best = null, bs = 0;
    for (const m of ruTargets()) {
      const dx = m.x - d.x, dz = m.z - d.z, dist = Math.hypot(dx, dz);
      if (dist > d.wpn.range * 1.2 && dist > 350) continue;
      const eye = d.y + (d.crouch ? 1.05 : 1.6);
      const vis = world.los(d.x, eye, d.z, m.x, m.y + m.h * 0.65, m.z);
      let sp = d.spot.get(m.id) || 0;
      sp = vis ? Math.min(1.5, sp + dt * (1.0 + Math.hypot(m.vx || 0, m.vz || 0) * 0.6 + (m.vehicle ? 1.5 : 0)) * clamp(1.5 - dist / 400, 0.2, 1.5)) : Math.max(0, sp - dt * 0.3);
      d.spot.set(m.id, sp);
      if (sp < 1 || !vis) continue;
      // who to shoot: AT gunners want vehicles, others the nearest machine
      let s = 1 / (1 + dist / 100);
      if (d.kind === 'at') s *= m.vehicle ? 3 : dist < 90 ? 0.6 : 0;
      if (d.kind === 'vehicle') s *= m.vehicle ? 2.5 : 1;
      if (!d.wpn.antiArmor && m.vehicle) s *= 0.15;
      if (dist > d.wpn.range) s = 0;
      if (s > bs) { bs = s; best = m; }
    }
    d.target = best;
    if (!best) return;
    d.yaw = Math.atan2(-(best.x - d.x), -(best.z - d.z));
    const want = d.supp < 0.85 && (d.kind !== 'at' || d.laws > 0);
    if (cadence(d, d.wpn, dt, want)) {
      const from = [d.x, d.y + (d.crouch ? 1.15 : 1.5), d.z];
      const lead = best.vehicle ? 0.4 : 0.25, aim = [best.x + (best.vx || 0) * lead, best.y + best.h * (best.vehicle ? 0.45 : 0.62), best.z + (best.vz || 0) * lead];
      shoot(1, d.id, d.wpn, from, aim, d.supp * 0.02 + (d.crouch ? 0 : 0.002));
      d.firing = 0; if (d.kind === 'at') d.laws--;
    }
  }

  // ---------------------------------------------------------------------------------------- projectiles
  const segCyl = (ax, ay, az, bx, by, bz, cx, cz, r, y0, y1) => {   // first t of a segment entering a vertical cylinder
    const dx = bx - ax, dz = bz - az, fx = ax - cx, fz = az - cz, a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
    let t;
    if (c <= 0) t = 0; else { const D = b * b - 4 * a * c; if (D < 0 || a < 1e-9) return -1; t = (-b - Math.sqrt(D)) / (2 * a); if (t < 0 || t > 1) return -1; }
    const y = ay + (by - ay) * t; return y >= y0 && y <= y1 ? t : -1;
  };
  const segBox = (ax, ay, az, bx, by, bz, cx, cy, cz, yaw, hx, hy, hz) => {   // oriented box (yaw only)
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const L = (x, z) => [(x - cx) * c - (z - cz) * s, (x - cx) * s + (z - cz) * c];
    const [lax, laz] = L(ax, az), [lbx, lbz] = L(bx, bz); let t0 = 0, t1 = 1;
    for (const [p, q, h] of [[lax, lbx, hx], [ay - cy, by - cy, hy], [laz, lbz, hz]]) {
      const d = q - p; if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) return -1; continue; }
      let u0 = (-h - p) / d, u1 = (h - p) / d; if (u0 > u1) { const t = u0; u0 = u1; u1 = t; } t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) return -1;
    }
    return t0;
  };
  function projStep(dt) {
    for (let i = B.proj.length - 1; i >= 0; i--) {
      const p = B.proj[i]; p.life -= dt;
      const ax = p.x, ay = p.y, az = p.z;
      p.vy -= 9.81 * dt; const bx = ax + p.vx * dt, by = ay + p.vy * dt, bz = az + p.vz * dt;
      // point defence (RW-7): an incoming rocket / shell within 45 m of a hover tank gets a flechette burst
      if (p.heat && p.side === 1) for (const m of B.units) if (m.kind === 'hovertank' && m.alive && m.sim.pdCool <= 0 && m.sim.hp.pd > 0) {
        const d = Math.hypot(bx - m.x, by - m.y - 1.5, bz - m.z);
        if (d < 45 && d > 6) { m.sim.pdCool = 1.4; const ok = R() < 0.55; ev('pd', { id: m.id, x: bx, y: by, z: bz, ok, from: [m.x, m.y + 2.4, m.z] }); if (ok) { B.stats.pd++; ev('impact', { x: bx, y: by, z: bz, ammo: p.ammo, air: true }); B.proj.splice(i, 1); p.dead = true; } break; }
      }
      if (p.dead) continue;
      let hitT = 2, hitWhat = null;
      const wr = world.raycast(ax, ay, az, bx, by, bz); if (wr) { hitT = wr.t; hitWhat = { world: wr }; }
      // units (the enemy side's)
      if (p.side === 1) for (const m of B.units) {
        if (!m.alive && m.kind !== 'strider') continue;
        let t = -1;
        if (m.kind === 'strider') { const s = m.sim; t = s.up ? Math.max(-1, (() => { const t1 = segCyl(ax, ay, az, bx, by, bz, s.c[0], s.c[2], 0.3, m.y + 1.15, m.y + STRIDER.H), t2 = segCyl(ax, ay, az, bx, by, bz, s.c[0], s.c[2], 0.17, m.y, m.y + 1.15); return t1 < 0 ? t2 : t2 < 0 ? t1 : Math.min(t1, t2); })()) : segCyl(ax, ay, az, bx, by, bz, s.c[0], s.c[2], 0.9, m.y - 0.2, m.y + 0.8); }
        else if (m.kind === 'hovertank') t = segBox(ax, ay, az, bx, by, bz, m.sim.p[0], m.sim.p[1] + 0.35, m.sim.p[2], m.yaw, RW7.W / 2, 1.1, RW7.L / 2);
        else t = segBox(ax, ay, az, bx, by, bz, m.sim.p[0], m.sim.p[1] + m.sim.P.H / 2 + 0.1, m.sim.p[2], m.yaw, m.sim.P.W / 2, m.sim.P.H / 2, m.sim.P.hullL / 2);
        if (t >= 0 && t < hitT) { hitT = t; hitWhat = { unit: m }; }
        // near miss -> suppression of the machine (and the squad hears it)
        if (t < 0 && m.alive) { const cx = m.x - ax, cz = m.z - az, L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1, k = clamp((cx * (bx - ax) + cz * (bz - az)) / L2, 0, 1), dd = Math.hypot(ax + (bx - ax) * k - m.x, az + (bz - az) * k - m.z); if (dd < 2.5 && !p.near?.has(m.id)) { (p.near ||= new Set()).add(m.id); ai.nearMiss(m.id, 0.12); } }
      } else for (const d of B.dummies) {
        if (!d.alive) continue;
        let t = d.kind === 'vehicle' ? segBox(ax, ay, az, bx, by, bz, d.x, d.y + 1.4, d.z, d.yaw, 1.8, 1.4, 3.4) : segCyl(ax, ay, az, bx, by, bz, d.x, d.z, 0.32, d.y, d.y + dummyH(d));
        if (t >= 0 && t < hitT) { hitT = t; hitWhat = { dummy: d }; }
        if (t < 0) { const dd = Math.hypot((ax + bx) / 2 - d.x, (az + bz) / 2 - d.z); if (dd < 3 && !p.near?.has(d.id)) { (p.near ||= new Set()).add(d.id); d.supp = Math.min(1.2, d.supp + (p.ammo === 'coil120' ? 0.6 : 0.09)); } }
      }
      if (hitT <= 1) {
        { const o = B.stats.end[p.side], k = (hitWhat.unit || hitWhat.dummy ? "target" : hitWhat.world.kind) + (p.meta ? "-" + p.meta : ""); o[k] = (o[k] || 0) + 1; }
        const hx = ax + (bx - ax) * hitT, hy = ay + (by - ay) * hitT, hz = az + (bz - az) * hitT, sp = Math.hypot(p.vx, p.vy, p.vz);
        const h = normalizeHit({ ...AMMO[p.ammo], velocity: sp, vel: [p.vx, p.vy, p.vz], point: [hx, hy, hz], side: p.side, weapon: p.ammo, src: p.src });
        if (hitWhat.unit) { const r = hitWhat.unit.sim.hit(h); B.stats.hits[p.side]++; ev('hit', { x: hx, y: hy, z: hz, id: hitWhat.unit.id, part: r.part, pen: r.pen, ammo: p.ammo }); ai.nearMiss(hitWhat.unit.id, 0.3); }
        else if (hitWhat.dummy) {
          const d = hitWhat.dummy, dmg = d.kind === 'vehicle' ? (p.ammo === 'coil120' || p.ammo === 'mbt120' ? 260 : p.ammo === 'needle' ? 1 : 0.5) : (p.ammo === 'coil120' || p.ammo === 'mbt120' ? 200 : p.ammo === 'needle' ? 45 : p.ammo === 'xm7' ? 40 : 30);
          d.hp -= dmg * (0.7 + 0.6 * R()); d.supp = Math.min(1.2, d.supp + 0.5); B.stats.hits[p.side]++;
          ev('hit', { x: hx, y: hy, z: hz, dummy: d.id, ammo: p.ammo });
          if (d.hp <= 0) { d.alive = false; B.stats.kills[2]++; ev('destroyed', { dummy: d.id, x: d.x, y: d.y + 1, z: d.z, kind: d.kind }); }
        }
        // explosive rounds: blast near the impact (pushes / jolts striders, suppresses everyone)
        if (p.heat || p.ammo === 'coil120' || p.ammo === 'mbt120') {
          const big = p.heat ? 1 : 0.7; ev('blast', { x: hx, y: hy, z: hz, big }); sound(hx, hy, hz, 600, p.side, 'blast');
          for (const m of B.units) if (m.kind === 'strider' && m.alive && p.side === 1) { const dd = Math.hypot(m.x - hx, m.y + 1 - hy, m.z - hz); if (dd < 7 && hitWhat.unit !== m) { const k = (1 - dd / 7); m.sim.hit({ type: 'blast', energy: 9000 * k * big, impulse: 260 * k * big, dir: [(m.x - hx) / (dd || 1), 0.3, (m.z - hz) / (dd || 1)], part: 'stomach', side: 1 }); ai.nearMiss(m.id, 0.5 * k); } }
          for (const d of B.dummies) if (d.alive && p.side === 2) { const dd = Math.hypot(d.x - hx, d.z - hz); if (dd < 5 && hitWhat.dummy !== d && d.kind !== 'vehicle') { d.hp -= 80 * (1 - dd / 5); d.supp = 1.2; if (d.hp <= 0) { d.alive = false; B.stats.kills[2]++; ev('destroyed', { dummy: d.id, x: d.x, y: d.y + 1, z: d.z, kind: d.kind }); } } }
        } else ev('impact', { x: hx, y: hy, z: hz, ammo: p.ammo, unit: !!(hitWhat.unit || hitWhat.dummy) });
        B.proj.splice(i, 1); continue;
      }
      p.x = bx; p.y = by; p.z = bz;
      if (p.life <= 0 || p.y < -20) { B.proj.splice(i, 1); const o = B.stats.end[p.side]; o.miss = (o.miss || 0) + 1; }
    }
  }

  // ---------------------------------------------------------------------------------------- the loop
  B.targets = () => B.dummies.map(d => ({ id: d.id, side: 1, kind: d.kind, x: d.x, y: d.y, z: d.z, vx: d.vx, vz: d.vz, h: dummyH(d), alive: d.alive, firing: d.firing, cover: d.crouch ? 0.6 : 0 }));
  B.step = (dt) => {
    B.time += dt; B.events.length = 0;
    for (const m of B.units) sync(m);
    ai.update(dt, B.targets());
    for (const m of B.units) driveUnit(m, dt);
    for (const d of B.dummies) dummyStep(d, dt);
    projStep(dt);
    for (const m of B.units) sync(m);
    return B.events;
  };
  B.squadOf = (m) => ai.squads.find(s => s.members.includes(m));
  return B;
}

// Scenario presets used by the dev page and the bench
export function setupScenario(B, name) {
  const H = B.isl.height, rw = B.isl.spawn.rw, pad = B.isl.spawn.pad;
  const sq = (n, cx, cz, o = {}) => Array.from({ length: n }, (_, i) => B.addStrider(cx + (i % 3) * 3 - 3, cz + Math.floor(i / 3) * 3, Math.PI, { weapon: i === 0 ? 'coil' : 'xm7', tag: 'R1-' + String(B.units.length + 1).padStart(2, '0') }));
  if (name === 'patrol') {
    const a = sq(4, rw[0][0], rw[0][1]);
    B.addSquad(a, { type: 'patrol', points: [[-40, -60], [40, -40], [60, 40], [-50, 30]] });
  } else if (name === 'assault' || name === 'combined') {
    // two strider squads (+ armour in 'combined') take the pad; a 1980 platoon holds the farm walls south of it
    const a = sq(4, rw[0][0], rw[0][1]), b = sq(4, rw[2][0], rw[2][1]);
    if (name === 'combined') { a.push(B.addHover(rw[1][0], rw[1][1] - 10, Math.PI)); b.push(B.addMBT('m1a2', rw[1][0] + 18, rw[1][1] - 16, Math.PI)); }
    B.addSquad(a, { type: 'take', x: pad[0], z: pad[1] + 40, r: 30 }); B.addSquad(b, { type: 'take', x: pad[0] + 20, z: pad[1] + 60, r: 30 });
    placeDefenders(B, 9, name === 'combined');
  } else if (name === 'outnumbered') {
    const a = sq(3, 0, -40);
    B.addSquad(a, { type: 'take', x: 0, z: 90, r: 20 });
    placeDefenders(B, 14, true);
  } else if (name === 'flank') {
    const a = sq(4, -10, -30);   // an even fight against a dug-in section: assaulting does not pay, flanking does
    B.addSquad(a, { type: 'take', x: 0, z: 100, r: 20 });
    placeDefenders(B, 7, false, true);
  } else if (name === 'defend') {
    const a = sq(4, pad[0], pad[1]); a.push(B.addHover(pad[0] + 15, pad[1] - 25, 0));
    B.addSquad(a, { type: 'defend', x: pad[0], z: pad[1], r: 28 });
    for (let i = 0; i < 8; i++) B.addDummy(['inf', 'inf', 'mg', 'at'][i % 4], -60 + i * 16, 150 + (i % 2) * 8, { advance: [pad[0] + (i - 4) * 5, pad[1] + 12] });
  } else if (name === 'lineup') {
    B.addStrider(-4, 0, 0, { weapon: 'xm7' }); B.addStrider(-1, 0, 0.3, { weapon: 'coil' }); B.addHover(8, -2, 0.4); B.addMBT('m1a2', 20, 0, 0.3); B.addMBT('t90m', 32, 2, 0.3);
  }
  return B;
}
// defenders in cover along the farm walls (crouched behind the walls facing north), an M60 stand-in on the knoll road
export function placeDefenders(B, n, withTank, dugIn) {
  const W = B.world, spots = W.allCover.filter(cp => cp.ob.mat === 'wall' && cp.nz > 0.6 && cp.z > 40 && cp.z < 140 && Math.abs(cp.x) < 110).sort((a, b) => a.z - b.z);
  const kinds = ['mg', 'inf', 'at', 'inf', 'inf', 'mg', 'at', 'inf', 'inf', 'mg', 'inf', 'at', 'inf', 'inf'];
  const used = [];
  for (const cp of spots) {
    if (used.length >= n) break;
    if (used.some(u => Math.hypot(u.x - cp.x, u.z - cp.z) < (dugIn ? 4 : 7))) continue;
    if (dugIn && Math.abs(cp.x) > 45) continue;
    used.push(cp); cp.taken = 'tf';
    B.addDummy(kinds[used.length - 1], cp.x, cp.z, { crouch: true, yaw: 0 });
  }
  if (withTank) B.addDummy('vehicle', 20, 150, { yaw: 0 });
}
