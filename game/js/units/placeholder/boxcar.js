// FOUNDATION placeholder: the TEST CAR - a deliberately simple wheeled sim that proves the ground-vehicle host
// (ground.js + vehicle.js): it reads terrain, surfaces, walls, other crafts, water and ship decks through `env`, and
// shows the state a real unit sim exposes. The WHEELED agent's M151A2 replaces it with a proper drivetrain and tyre
// model of the same shape. Pure: no THREE, no DOM, no game imports.
//
//   const S = createBoxCar();  S.place(x, y, z, yaw);  S.step(dt, ctl, env) -> events
//   ctl: { drive -1..1 (W = +1 forward / brake when rolling back, S = -1), steer -1..1 (right +), handbrake, engine }
//   env: ground.js (floor, sample, collide, carry, settle, G) - see FOUNDATION.md "ground-vehicle host"
//   state read by the host: x, y (wheel contact plane), z, yaw, pitch (nose up +), roll (right side down +), v (m/s,
//   forward, relative to the ground / deck under it), vy, yawRate, steer, rpm, gear, engineOn, onGround, fuel (L),
//   hp, dead, flooded, sunk, water (m over the wheels), surface, plat / loc / carried (the ground host's deck carry)
//   events: crash {v}, land {v}, flood, sink, stall
//
// Numbers are M151A2-ish so it drives about right (CONFIRMED where marked; TM 9-2320-218-10):
//   mass 1,107 kg empty (CONFIRMED), wheelbase 2.16 m (85 in, CONFIRMED), track 1.34 m (53 in, CONFIRMED),
//   length 3.37 m, width 1.63 m (CONFIRMED), fording 0.53 m without kit (21 in, CONFIRMED), top speed ~106 km/h (CONFIRMED),
//   engine 72 hp gross (CONFIRMED) -> ~45 kW at the wheels (INFERRED), CdA 1.6 m2 (INFERRED, boxy with the top down),
//   fuel 64 L (17 US gal, CONFIRMED).
export const BOXCAR = { L: 3.37, W: 1.63, H: 1.8, WB: 2.16, TRACK: 1.34, MASS: 1107, POWER: 45000, TOP: 29.4, REV_TOP: 6, MAX_STEER: 0.38, F_LOW: 7000, F_HIGH: 2200,
  FORD: 0.53, CDA: 1.6, FUEL: 64, RIDE: 0.42, HP: 100 };

export function createBoxCar(P = BOXCAR) {
  const S = {
    P, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, v: 0, vy: 0, yawRate: 0, steer: 0, rpm: 0, gear: 'N', engineOn: false, onGround: true,
    fuel: P.FUEL, hp: P.HP, dead: false, flooded: false, sunk: false, water: 0, surface: 'grass', plat: null, loc: null, carried: null,
    wheelH: [0, 0, 0, 0], events: [], drive: 0,
  };
  const WHEELS = [[-P.TRACK / 2, -P.WB / 2], [P.TRACK / 2, -P.WB / 2], [-P.TRACK / 2, P.WB / 2], [P.TRACK / 2, P.WB / 2]];   // FL FR RL RR (x right, z aft)
  const _s = {}, _o = { x: 0, z: 0, r: 0, y0: 0, y1: 0, nx: 0, nz: 0 };
  const ev = (e, o) => S.events.push({ e, ...o });
  S.place = (x, y, z, yaw = 0) => { Object.assign(S, { x, y, z, yaw, pitch: 0, roll: 0, v: 0, vy: 0, yawRate: 0, steer: 0, onGround: true, plat: null, loc: null }); S.wheelH.fill(y); };
  S.shift = c => { for (let i = 0; i < 4; i++) S.wheelH[i] += c.dy; };   // the host carried us (a deck went up / down)
  S.reset = () => { Object.assign(S, { fuel: P.FUEL, hp: P.HP, dead: false, flooded: false, sunk: false, engineOn: false }); };
  // wheel contact point i in the world (with the current yaw)
  const wheelAt = (i, x, z, yaw, out) => { const c = Math.cos(yaw), s = Math.sin(yaw), [lx, lz] = WHEELS[i]; out.x = x + lx * c + lz * s; out.z = z - lx * s + lz * c; return out; };
  const _w = { x: 0, z: 0 };
  // ground under each wheel from height y; false if a wheel would go into a wall
  function wheelsOk(x, z, yaw, env, out, moved) {   // each wheel against its own last height: steps over 0.45 m (plus a 45-degree slope over the move) are walls
    for (let i = 0; i < 4; i++) { wheelAt(i, x, z, yaw, _w); const r = S.wheelH[i], g = env.floor(_w.x, _w.z, r + 0.3, 0.45 + moved, P.H); if (g === Infinity || g > r + 0.45 + moved) return false; out[i] = g; }   // moved: extra rise allowed (0 when driving)
    return true;
  }
  const _gh = [0, 0, 0, 0];
  S.step = (dt, ctl, env) => {
    S.events.length = 0;
    env.carry(S); if (S.carried) S.shift(S.carried);
    const n = Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / n;
    for (let k = 0; k < n; k++) sub(h, ctl, env);
    env.settle(S, S.onGround);
    return S.events;
  };
  function sub(h, c, env) {
    const G = env.G || 9.81, m = P.MASS;
    // ---- engine and controls
    if (S.dead || S.sunk) { S.engineOn = false; }
    if (c.engine !== undefined && c.engine !== S.engineOn && !S.dead && !S.sunk) { if (c.engine && (S.flooded || S.fuel <= 0)) { if (!S._crankSaid) { ev('stall'); S._crankSaid = true; } } else { S.engineOn = c.engine; S._crankSaid = false; } }
    const live = S.engineOn && !S.dead;
    const want = (c.steer || 0) * P.MAX_STEER / (1 + S.v * S.v / 300);   // less lock at speed
    S.steer += Math.max(-1.2 * h, Math.min(1.2 * h, want - S.steer));
    let thr = 0, brk = c.handbrake ? 0.6 : 0; const d = c.drive || 0;
    if (d > 0) { if (S.v < -0.4) brk = Math.max(brk, d); else { thr = d; S.gear = 'D'; } }
    else if (d < 0) { if (S.v > 0.4) brk = Math.max(brk, -d); else { thr = -d; S.gear = 'R'; } }
    if (!live) thr = 0;
    // ---- the ground: surface, slope (from the four wheels)
    env.sample(S.x, S.z, _s); S.surface = _s.surface;
    if (!wheelsOk(S.x, S.z, S.yaw, env, _gh, 0.6)) { for (let i = 0; i < 4; i++) _gh[i] = S.wheelH[i]; }
    for (let i = 0; i < 4; i++) S.wheelH[i] = _gh[i];
    const front = (_gh[0] + _gh[1]) / 2, rear = (_gh[2] + _gh[3]) / 2, left = (_gh[0] + _gh[2]) / 2, right = (_gh[1] + _gh[3]) / 2;
    const gy = (front + rear) / 2, pitchT = Math.atan2(front - rear, P.WB), rollT = Math.atan2(left - right, P.TRACK);
    // ---- amphibious (P.AMPHIB, e.g. an M113): afloat once the bottom is deeper than the draft - track / jet thrust
    // against hull drag, slow turning; the wheels / tracks take over again in the shallows. A reference for unit sims.
    S.afloat = !!P.AMPHIB && gy < -P.DRAFT && S.y <= -P.DRAFT + 0.3;
    if (S.afloat) {
      const dir = S.gear === 'R' ? -1 : 1, fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
      S.v += (dir * thr * P.SWIM_F - 0.5 * 1000 * P.SWIM_CDA * S.v * Math.abs(S.v)) / m * h;
      S.yawRate = (c.steer || 0) * P.SWIM_TURN * Math.min(1, 0.3 + Math.abs(S.v));
      S.x += fx * S.v * h; S.z += fz * S.v * h; S.yaw -= S.yawRate * h;
      S.y += (-P.DRAFT - S.y) * Math.min(1, 3 * h); S.vy = 0; S.onGround = false; S.water = -S.y;
      S.pitch *= 1 - Math.min(1, 2 * h); S.roll *= 1 - Math.min(1, 2 * h); for (let i = 0; i < 4; i++) S.wheelH[i] = S.y;
      if (live) S.fuel = Math.max(0, S.fuel - (0.6 + 12 * thr) / 3600 * h);
      S.rpm = live ? 700 + 2500 * thr : Math.max(0, S.rpm - 2000 * h);
      return;
    }
    // ---- longitudinal: drive (power / traction limited), brakes, rolling resistance, drag, grade, water
    const N = m * G * Math.cos(S.pitch) * (S.onGround ? 1 : 0), mu = _s.mu ?? 0.6, crr = _s.crr ?? 0.03;
    let F = 0;
    if (thr > 0 && S.onGround) {
      const dir = S.gear === 'R' ? -1 : 1, top = dir > 0 ? P.TOP : P.REV_TOP;
      const v = Math.abs(S.v), fGear = v < 3 ? P.F_LOW : v < 8 ? P.F_LOW + (P.F_HIGH - P.F_LOW) * (v - 3) / 5 : P.F_HIGH;   // low gears pull hard, high gears less (no gearbox model)
      if (v < top) F += dir * thr * Math.min(mu * N, fGear, P.POWER / Math.max(v, 0.5));
    }
    F -= m * G * Math.sin(S.pitch);                                   // grade
    F -= 0.5 * 1.2 * P.CDA * S.v * Math.abs(S.v);                    // air
    S.water = Math.max(0, -S.y);                                       // sea over the wheel contact plane
    if (S.water > 0) F -= S.v * 900 * Math.min(1.5, S.water);         // wading drag
    // resisting forces that stop at zero speed (brakes, rolling resistance) are applied as a speed change toward 0
    const stop = (brk * mu * N + crr * N + (c.handbrake ? 0.4 * mu * N : 0)) / m * h;
    S.v += F / m * h;
    if (S.onGround) S.v = Math.abs(S.v) <= stop ? 0 : S.v - Math.sign(S.v) * stop;
    // ---- yaw: kinematic bicycle, the turn limited by the tyres' grip (understeer past mu g)
    let r = S.v * Math.tan(S.steer) / P.WB;
    const aLim = mu * G * 0.95; if (Math.abs(S.v * r) > aLim) r = Math.sign(r) * aLim / Math.max(0.5, Math.abs(S.v));
    if (c.handbrake && Math.abs(S.v) > 4) r *= 1.4;
    S.yawRate = S.onGround ? r : S.yawRate * (1 - 0.5 * h);
    // ---- move, with walls (a wheel can't climb more than 0.45 m) and obstacles
    const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
    const nx = S.x + fx * S.v * h, nz = S.z + fz * S.v * h, nyaw = S.yaw - S.yawRate * h;
    if (wheelsOk(nx, nz, nyaw, env, _gh, 0)) { S.x = nx; S.z = nz; S.yaw = nyaw; }
    else { const v = Math.abs(S.v); if (v > 3) ev('crash', { v }); S.v *= -0.15; }
    for (const s of [-1, 1]) {   // two circles along the body: nose and tail
      _o.x = S.x + fx * s * P.L * 0.28; _o.z = S.z + fz * s * P.L * 0.28; _o.r = P.W * 0.55; _o.y0 = S.y + 0.3; _o.y1 = S.y + P.H;
      const ox = _o.x, oz = _o.z;
      if (env.collide(_o, S.self || null)) {
        const vn = S.v * (fx * _o.nx + fz * _o.nz);   // speed into the obstacle
        if (vn < 0) { if (-vn > 3) ev('crash', { v: -vn }); S.v *= 0.2 * (Math.sign(S.v) * s > 0 ? -1 : 1); }
        S.x += _o.x - ox; S.z += _o.z - oz;
      }
    }
    // ---- vertical: suspension follows the ground, the car leaves it over a crest and lands
    const g2 = gy;
    if (S.onGround) {
      if (g2 < S.y - 0.6 || (g2 < S.y - 0.3 && S.v * S.v > 60)) { S.onGround = false; S.vy = 0; }   // off a ledge, or a crest at speed: airborne
      else { const ny = S.y + (g2 - S.y) * Math.min(1, 25 * h); S.vy = (ny - S.y) / h; S.y = ny; }
    }
    if (!S.onGround) {
      S.vy -= G * h; S.y += S.vy * h;
      if (S.y <= g2) { if (S.vy < -5) ev('land', { v: -S.vy }); S.y = g2; S.vy = 0; S.onGround = true; }
    }
    const k = Math.min(1, 10 * h); S.pitch += (pitchT - S.pitch) * k; S.roll += (rollT - S.roll) * k;
    // ---- water: drowned engine past the fording depth, sunk when it's over the body
    if (S.water > P.FORD && S.engineOn) { S.engineOn = false; S.flooded = true; ev('flood'); }
    if (S.water > P.H * 0.85 && !S.sunk) { S.sunk = true; S.v *= 0.3; ev('sink'); }
    // ---- fuel and the gauges: ~16 mpg at a cruise (INFERRED from TM range 482 km / 64 L)
    if (live) S.fuel = Math.max(0, S.fuel - (0.6 + 12 * thr) / 3600 * h);
    if (live && S.fuel <= 0) { S.engineOn = false; ev('stall'); }
    S.rpm = live ? 700 + 3300 * Math.min(1, Math.abs(S.v) / (S.gear === 'R' ? P.REV_TOP : 9 + Math.abs(S.v) * 0.45)) * (0.4 + 0.6 * thr) : Math.max(0, S.rpm - 2000 * h);
  }
  return S;
}
