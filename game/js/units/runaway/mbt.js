// Seized modern MBTs (M1A2 SEPv3, T-90M) crewed by RUNAWAY machines: parameter sets + a PLACEHOLDER drive.
// Pure (no THREE, no DOM).
//
// Wave 2 swaps the placeholder for the TANK agent's tracked-vehicle sim (game/js/units/armor/trackfm.js, written for
// the M60A3): createMBT(params, { drive: createTrackDrive }) takes any drive factory with the same small interface:
//   drive = factory(P)                  P = the param set below (mass, dimensions, track geometry, power, top speed)
//   drive.place(x, z, yaw, env)
//   drive.step(dt, { throttle -1..1, steer -1..1, brake 0..1 }, env)    env = { height(x, z) }
//   drive.p [x, y, z]  drive.yaw  drive.pitch  drive.roll  drive.speed (m/s, + forward)  drive.yawRate
//   drive.wheelSpin [left, right] (track travel, m, for the model's tread / wheel animation)
// Everything else here (turret, gun, damage, autopilot from a desired velocity) sits on top of that interface.
//
// Dimensions / mass / power / speed: commonly published general figures for the two tanks (used for the model sizes
// and the drive feel only). Weapon and armour values are GAME-TUNED (hit.js armour points), not real performance.

import { normalizeHit, machineDamage } from './hit.js';

export const MBT = {
  m1a2: {
    name: 'M1A2 SEPv3', id: 'm1a2',
    mass: 66800,                    // kg (~73.6 short tons)
    hullL: 7.93, lenGun: 9.77, W: 3.66, H: 2.44,   // m: hull length, length with gun forward, width over skirts, height to turret roof
    clearance: 0.48, trackW: 0.635, gauge: 3.0, contactL: 4.6, wheels: 7, wheelR: 0.32, sprocketAft: true,
    power: 1119000,                 // W (1500 hp gas turbine)
    vmax: 67 / 3.6, vrev: 30 / 3.6, // m/s governed road speed, reverse
    turretRing: [0, 0.35], turretH: 0.85, gunL: 4.25, gunY: 2.05, gunZ: -1.9,    // turret ring centre (x, z local, z + aft), gun trunnion height and its offset ahead of the ring
    traverse: 0.7, elev: [-0.17, 0.35],                             // rad/s, rad (game values)
    ammo: 'mbt120', reload: 6.5,
    armour: { front: 600, side: 120, rear: 60, turret: 650, top: 40 },   // game armour points
    hp: { hull: 520, turret: 300, engine: 120, tracks: 160, gun: 100 },
  },
  t90m: {
    name: 'T-90M', id: 't90m',
    mass: 48000,
    hullL: 6.86, lenGun: 9.63, W: 3.78, H: 2.23,
    clearance: 0.49, trackW: 0.58, gauge: 2.79, contactL: 4.27, wheels: 6, wheelR: 0.375, sprocketAft: true,
    power: 843000,                  // W (1130 hp diesel)
    vmax: 60 / 3.6, vrev: 4.8,
    turretRing: [0, 0.1], turretH: 0.75, gunL: 4.85, gunY: 1.82, gunZ: -1.45,
    traverse: 0.75, elev: [-0.1, 0.24],
    ammo: 'mbt125', reload: 7.0,
    armour: { front: 550, side: 110, rear: 50, turret: 600, top: 35 },
    hp: { hull: 460, turret: 260, engine: 110, tracks: 150, gun: 90 },
  },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

// The placeholder drive: a longitudinal force balance (power-limited traction, grip limit, rolling resistance, grade,
// air drag) and a skid-steer yaw response (the turn rate a tracked vehicle manages falls with speed and with the
// ground's lateral resistance), hull attitude from the ground under the four track ends. No suspension dynamics.
export function createPlaceholderDrive(P) {
  const D = { p: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, speed: 0, yawRate: 0, wheelSpin: [0, 0], engine: 0.3, slip: 0 };
  const G = 9.81, MU = 0.75, CRR = 0.045, CDA = 0.9 * P.W * P.H;
  const ground = (env, x, z) => {   // track footprint: four corners
    const c = Math.cos(D.yaw), s = Math.sin(D.yaw), hl = P.contactL / 2, hg = P.gauge / 2;
    const fx = -s, fz = -c, rx = c, rz = -s;
    const h = (a, b) => env.height(D.p[0] + fx * a + rx * b, D.p[2] + fz * a + rz * b);
    const FL = h(hl, -hg), FR = h(hl, hg), RL = h(-hl, -hg), RR = h(-hl, hg);
    return { y: Math.max((FL + FR + RL + RR) / 4, Math.max(FL, FR, RL, RR) - 0.15), pitch: Math.atan2((FL + FR) - (RL + RR), 2 * P.contactL), roll: Math.atan2((FL + RL) - (FR + RR), 2 * P.gauge) };
  };
  D.place = (x, z, yaw, env) => { D.p = [x, 0, z]; D.yaw = yaw; D.speed = 0; D.yawRate = 0; const g = ground(env, x, z); D.p[1] = g.y; D.pitch = g.pitch; D.roll = g.roll; return D; };
  D.step = (dt, c, env) => {
    const thr = clamp(c.throttle || 0, -1, 1), st = clamp(c.steer || 0, -1, 1), br = clamp(c.brake || 0, 0, 1);
    D.engine += clamp(Math.abs(thr) - D.engine, -dt * 1.5, dt * 0.8);   // spool (a turbine is slow to answer)
    const v = D.speed, g = ground(env, D.p[0], D.p[2]);
    const N = P.mass * G * Math.cos(g.pitch), grip = MU * N;
    let Ft = Math.sign(thr) * Math.min(grip, P.power * D.engine / Math.max(2.5, Math.abs(v))) * (thr ? 1 : 0);
    if (v > P.vmax && thr > 0) Ft = 0; if (v < -P.vrev && thr < 0) Ft = 0;
    // steering costs traction (skid-steer turn resistance)
    Ft *= 1 - 0.35 * Math.abs(st);
    const roll = CRR * N * Math.sign(v) * Math.min(1, Math.abs(v) * 2), grade = P.mass * G * Math.sin(g.pitch), air = 0.5 * 1.225 * CDA * v * Math.abs(v);
    const brake = br * grip * Math.sign(v) * Math.min(1, Math.abs(v) * 3);
    D.speed += (Ft - roll - grade - air - brake) / P.mass * dt;
    // (stopped, or braking at a crawl: the brakes hold it, on any grade the tracks can grip)
    if ((!thr || br > 0.3) && Math.abs(D.speed) < (br > 0.3 ? 0.6 : 0.05) && Math.abs(grade) < grip * 0.8) D.speed = 0;
    // yaw: pivot at rest, falling turn rate with speed (lateral skid limit ~0.4 g)
    const wMax = Math.min(0.55, 0.4 * G / Math.max(1, Math.abs(v)));
    D.yawRate += (st * wMax * (v < -1 ? -1 : 1) * -1 - D.yawRate) * Math.min(1, dt * 3);   // (steering reverses only when really backing)
    D.yaw += D.yawRate * dt;
    const fx = -Math.sin(D.yaw), fz = -Math.cos(D.yaw);
    D.p[0] += fx * D.speed * dt; D.p[2] += fz * D.speed * dt;
    const g2 = ground(env, D.p[0], D.p[2]);
    D.p[1] += (g2.y - D.p[1]) * Math.min(1, dt * 12); D.pitch += (g2.pitch - D.pitch) * Math.min(1, dt * 8); D.roll += (g2.roll - D.roll) * Math.min(1, dt * 8);
    // track travel: speed +- the turn
    for (let k = 0; k < 2; k++) D.wheelSpin[k] += (D.speed + (k ? 1 : -1) * D.yawRate * P.gauge / 2) * dt;
  };
  return D;
}

export function createMBT(P, opt = {}) {
  const drive = (opt.drive || createPlaceholderDrive)(P);
  const T = {
    id: opt.id ?? 0, side: 2, kind: 'mbt', P, drive,
    turretYaw: 0, gunPitch: 0, reload: 0, hp: JSON.parse(JSON.stringify(P.hp)), alive: true, events: [],
    get p() { return drive.p; }, get yaw() { return drive.yaw; }, get speed() { return drive.speed; },
    place(x, z, yaw, env) { drive.place(x, z, yaw, env); return T; },
    muzzle(o = [0, 0, 0]) {
      const y = drive.yaw + T.turretYaw, cp = Math.cos(T.gunPitch + drive.pitch);
      const [rx, rz] = P.turretRing, c = Math.cos(drive.yaw), s = Math.sin(drive.yaw);
      const bx = drive.p[0] + rx * c + rz * s, bz = drive.p[2] - rx * s + rz * c;
      const Lg = P.gunL - P.gunZ; o[0] = bx - Math.sin(y) * cp * Lg; o[1] = drive.p[1] + P.gunY + Math.sin(T.gunPitch + drive.pitch) * Lg; o[2] = bz - Math.cos(y) * cp * Lg; return o;
    },
    gunDir(o = [0, 0, 0]) { const y = drive.yaw + T.turretYaw, p = T.gunPitch + drive.pitch, cp = Math.cos(p); o[0] = -Math.sin(y) * cp; o[1] = Math.sin(p); o[2] = -Math.cos(y) * cp; return o; },
    fire() { if (T.reload > 0 || !T.alive || T.hp.gun <= 0) return false; T.reload = P.reload; T.events.push({ e: 'fire' }); return true; },
    hit(raw) {
      const h = normalizeHit(raw); if (!T.alive) return { dmg: 0 };
      // face from the impact direction relative to the hull (or turret, if high)
      const fx = -Math.sin(drive.yaw), fz = -Math.cos(drive.yaw), d = h.direction, along = d.x * fx + d.z * fz;
      const high = h.point && h.point.y > drive.p[1] + P.H * 0.62;
      let part = h.part || (d.y < -0.7 ? 'top' : high ? 'turret' : along < -0.6 ? 'front' : along > 0.6 ? 'rear' : 'side');
      const r = machineDamage(h, P.armour[part] ?? 120, null, 1 / 500);
      if (part === 'turret') T.hp.turret -= r.dmg; else T.hp.hull -= r.dmg;
      if (r.pen) { if (part === 'rear') T.hp.engine -= r.dmg; if (part === 'side' && Math.random() < 0.4) T.hp.tracks -= r.dmg; if (part === 'turret' && Math.random() < 0.3) T.hp.gun -= r.dmg; }
      if (T.hp.hull <= 0 || T.hp.turret <= 0) T.kill();
      T.events.push({ e: 'hit', part, dmg: r.dmg, pen: r.pen }); return { part, dmg: r.dmg, pen: r.pen };
    },
    kill() { if (!T.alive) return; T.alive = false; T.events.push({ e: 'destroyed' }); },
    // cmd: { throttle, steer } direct, or { vx, vz } autopilot (+ face); turret: world yaw; gun: pitch
    step(dt, cmd, env) {
      T.reload = Math.max(0, T.reload - dt);
      let thr = cmd.throttle ?? 0, st = cmd.steer ?? 0;
      if (!T.alive) { thr = 0; st = 0; }
      else if (cmd.vx !== undefined) {
        const sp = Math.hypot(cmd.vx, cmd.vz), want = sp > 0.5 ? Math.atan2(-cmd.vx, -cmd.vz) : (cmd.face ?? drive.yaw);
        let e = angDiff(drive.yaw, want), rev = false;
        if (sp > 0.5 && Math.abs(e) > 2.2 && sp < 4) { e = angDiff(drive.yaw, want + Math.PI); rev = true; }   // short moves backward: reverse
        st = clamp(-e * 2, -1, 1);
        const vt = (rev ? -1 : 1) * sp * Math.max(0, Math.cos(e));
        thr = clamp((vt - drive.speed) * 0.6, -1, 1); if (Math.abs(vt) < 0.3 && Math.abs(drive.speed) < 0.6) thr = 0;
        cmd.brake = vt === 0 || Math.sign(vt) !== Math.sign(drive.speed) ? 0.6 : 0;
      }
      if (T.hp.engine <= 0) thr = 0; if (T.hp.tracks <= 0) { thr *= 0.0; st = 0; }
      drive.step(dt, { throttle: thr, steer: st, brake: cmd.brake || 0 }, env);
      if (cmd.turret !== undefined) T.turretYaw += clamp(angDiff(T.turretYaw, angDiff(drive.yaw, cmd.turret)), -P.traverse * dt, P.traverse * dt);
      if (cmd.gun !== undefined) T.gunPitch += clamp(clamp(cmd.gun - drive.pitch, P.elev[0], P.elev[1]) - T.gunPitch, -0.3 * dt, 0.3 * dt);
      const out = T.events.slice(); T.events.length = 0; return out;
    },
  };
  return T;
}
