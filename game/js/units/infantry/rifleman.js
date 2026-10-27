// NGC-1980 infantry: the whole rifleman in one object, the thing the game host (FOUNDATION) drives. PURE (no THREE / DOM).
// soldier (body, stamina, aim) + weapons (state machines) + inventory (MEDINV's, or the simple reference one) +
// live projectiles (ballistics) + hit registration through a host raycast. One step(dt, input, env, mods) per frame;
// read R.events for audio / effects / damage, R.soldier for the camera, R.cur for the viewmodel.
//
//   import { createRifleman } from './units/infantry/rifleman.js';
//   const R = createRifleman({ loadout: 'rifleman', x, y, z, yaw });
//   each frame: R.step(dt, input, env, mods);  camera <- R.soldier.eye / camYaw / camPitch / camRoll
//                for (const e of R.events) ... ('shot', 'impact', 'hit', 'explode', 'crack', 'wpn', 'body', 'drop')
//
// INPUT: soldier.js input + { fire: bool (held), actions: ['reload' | 'reloadSpeed' | 'ia' | 'charge' | 'fa' |
//   'boltRelease' | 'mode' | 'sightUp' | 'sightDown' | 'checkMag' | 'checkChamber' | 'inspect' | 'barrel' |
//   'breakBelt' | 'remedial' | 'gl' (toggle M203) | 'law' (extend -> arm) | 'lawCollapse' | 'slot1' | 'slot2' | 'slot3' |
//   'zeroUp' | 'zeroDown' | 'zeroLeft' | 'zeroRight'] }   (actions = presses this frame)
// ENV: soldier.js env + {
//   atmos: ballistics atmosphere ({ rho, c, wind: [x, y, z], g }) - default ICAO sea level, no wind,
//   raycast(x0, y0, z0, x1, y1, z1, P) -> null | { t, x, y, z, nx, ny, nz, material, thickness (mm; ground = 1e9),
//            body: null | { target, part, armour: [{ material, thickness }] } }   (skip P.owner's own body),
//   listener: { x, y, z } (for supersonic cracks of passing rounds), dirt: 0..1 (sand / mud fouling the weapon) }
import { createSoldier } from './soldier.js';
import { createWeapon, createSimpleInventory, makeItem, itemMass, WEAPONS } from './weapons.js';
import { createProjectile, stepProjectile, impact, penetration, makeHitInfo, explosionInfo, STD_ATMOS, ROUNDS, rngSeeded, MATERIALS } from './ballistics.js';

// ------------------------------------------------------------------------------------------------ loadouts
// 1980 USMC: magazines loaded with 18 rounds (common practice to spare the springs; INFERRED), last two tracers in
// some. Kit mass outside the inventory (helmet 1.4, M1955 flak vest 4.1, LCE + 2 canteens 4.0, clothes / boots 2.5 kg):
// INFERRED, used only when the inventory does not already count them (kitKg).
export const LOADOUTS = {
  rifleman:  { slots: ['M16A1', 'M72A2', 'M1911A1'], items: () => [...Array(8)].map((_, i) => makeItem('M16-20', 18, { tracerLast: i < 4 ? 2 : 0 })).concat([makeItem('M1911-7'), makeItem('M1911-7')]) },
  grenadier: { slots: ['M16A1/M203', 'M1911A1'], items: () => [...Array(6)].map(() => makeItem('M16-20', 18)).concat([...Array(12)].map(() => makeItem('40mm')), [makeItem('M1911-7'), makeItem('M1911-7')]) },
  gunner:    { slots: ['M60', 'M1911A1'], items: () => [makeItem('M60-belt'), makeItem('M60-belt'), makeItem('M60-barrel'), makeItem('M1911-7'), makeItem('M1911-7')] },
  // the range: every weapon to try, but range kit (helmet and webbing only, kitKg 4) and range ammunition, ~38 kg
  range:     { kitKg: 4, slots: ['M16A1/M203', 'M60', 'M72A2', 'M1911A1'], items: () => [...Array(6)].map((_, i) => makeItem('M16-20', i < 3 ? 20 : 18, { tracerLast: i % 2 ? 2 : 0 })).concat([...Array(6)].map(() => makeItem('40mm')), [makeItem('M60-belt'), makeItem('M60-barrel')], [...Array(2)].map(() => makeItem('M1911-7'))) },
};
// where the bore sits relative to the eye (m, weapon frame: right, up, forward) when shouldered at the hip / low ready
const HIP = { rifle: [0.17, -0.24, 0.55], mg: [0.2, -0.33, 0.7], pistol: [0.12, -0.2, 0.42], law: [0.12, 0.02, 0.45], gl: [0.17, -0.3, 0.45] };

export function createRifleman(o = {}) {
  const rng = o.rng || rngSeeded(o.seed || 1980);
  const L = typeof o.loadout === 'object' ? o.loadout : LOADOUTS[o.loadout || 'rifleman'];
  const inv = o.inventory || createSimpleInventory(L.items());
  const soldier = createSoldier({ ...o, rng });
  const slots = [];
  for (const key of L.slots) {
    if (key === 'M16A1/M203') {
      const w = createWeapon('M16A1', { rng, mag: takeFull('M16-20') }); w.gl = createWeapon('M203', { rng, loaded: !!takeFull('40mm', true) }); slots.push(w);
    } else if (key === 'M60') slots.push(createWeapon('M60', { rng, mag: takeFull('M60-belt'), barrel: makeItem('M60-barrel') }));
    else if (key === 'M72A2') slots.push(createWeapon('M72A2', { rng }));
    else if (key === 'M1911A1') slots.push(createWeapon('M1911A1', { rng, mag: takeFull('M1911-7') }));
    else slots.push(createWeapon(key, { rng, mag: takeFull(WEAPONS[key].fit) }));
  }
  function takeFull(fit, consume = false) { const it = inv.find(fit); if (it) inv.remove(it); return consume ? it : it; }

  const R = {
    soldier, inv, slots, slot: 0, glMode: false, rng, id: o.id ?? 1, side: o.side ?? 1, kitKg: o.kitKg ?? L.kitKg ?? 12,
    swap: null,                       // { t, dur, from, to, phase: 'out' | 'in' }
    projectiles: [], events: [], shots: 0, mods: {},
    get cur() { const w = slots[R.slot]; return R.glMode && w && w.gl ? w.gl : w; },
    get carrier() { return slots[R.slot]; },        // the weapon in the hands (the M16 when the M203 is selected)
    get cls() { const w = R.cur; return w ? w.def.cls : 'none'; },
  };
  const out = (e, x) => { const a = { e }; if (x) Object.assign(a, x); R.events.push(a); return a; };

  function loadKg() { let m = inv.totalKg() + R.kitKg; for (const w of slots) m += w.mass; return m; }
  function wpnInfo() {
    const w = R.carrier, c = R.cur;
    return { mass: w ? w.mass : 0, cls: c ? c.def.cls : 'none', adsTime: c ? c.def.ads : 0.3, bipod: !!(w && w.def.bipod), busy: !!(c && c.act) || !!R.swap };
  }
  // fire direction helpers
  const fwd = (yaw, p, o2) => { o2[0] = -Math.sin(yaw) * Math.cos(p); o2[1] = Math.sin(p); o2[2] = -Math.cos(yaw) * Math.cos(p); return o2; };
  const upv = (yaw, p, o2) => { o2[0] = -Math.sin(yaw) * -Math.sin(p); o2[1] = Math.cos(p); o2[2] = -Math.cos(yaw) * -Math.sin(p); return o2; };
  const _f = [0, 0, 0], _u = [0, 0, 0];

  // ---------------------------------------------------------------- actions
  function doAction(a, ctx) {
    const S = soldier, w = R.cur, carrier = R.carrier;
    if (/^slot\d$/.test(a)) { const i = +a[4] - 1; if (i < slots.length && i !== R.slot && !R.swap) { if (w && w.act) w.cancel(); R.swap = { t: 0, from: R.slot, to: i, dur: (carrier ? carrier.def.swap[1] : 0) + slots[i].def.swap[0], outDur: carrier ? carrier.def.swap[1] : 0 }; R.glMode = false; out('swap', { to: slots[i].key }); } return; }
    if (!w || R.swap) return;
    switch (a) {
      case 'gl': if (carrier.gl && !carrier.act && !carrier.gl.act) { R.glMode = !R.glMode; out('glMode', { on: R.glMode }); } break;
      case 'reload': case 'reloadSpeed': {
        if (w.def.feed === 'single' || w.def.feed === 'belt') { w.start('reload', ctx); break; }
        if (w.def.feed === 'none') break;
        w.start(a === 'reloadSpeed' || (w.bolt === 'locked' && !w.mag?.rounds) ? 'speed' : 'tactical', ctx); break;
      }
      case 'ia': {
        if (w.def.key === 'M60' && w.malf === 'runaway') w.start('breakBelt', ctx);
        else w.start('ia', ctx);
        break;
      }
      case 'remedial': w.start(w.malf === 'double' ? 'remedialDouble' : 'remedialStuck', ctx); break;
      case 'charge': w.start('charge', ctx); break;
      case 'fa': w.start('fa', ctx); break;
      case 'boltRelease': w.start('boltRelease', ctx); break;
      case 'mode': if (!w.act) w.cycleMode(); break;
      case 'sightUp': w.setSight(w.sight + 1); break;
      case 'sightDown': w.setSight(w.sight - 1); break;
      case 'zeroUp': w.zeroClicks[0]++; out('zero', { clicks: w.zeroClicks.slice() }); break;
      case 'zeroDown': w.zeroClicks[0]--; out('zero', { clicks: w.zeroClicks.slice() }); break;
      case 'zeroLeft': w.zeroClicks[1]--; out('zero', { clicks: w.zeroClicks.slice() }); break;
      case 'zeroRight': w.zeroClicks[1]++; out('zero', { clicks: w.zeroClicks.slice() }); break;
      case 'checkMag': w.start('checkMag', ctx); break;
      case 'checkChamber': w.start('checkChamber', ctx); break;
      case 'inspect': w.start('inspect', ctx); break;
      case 'barrel': w.start('barrel', ctx); break;
      case 'breakBelt': w.start('breakBelt', ctx); break;
      case 'law': if (w.law === 'closed') w.start('extend', ctx); else if (w.law === 'extended') w.start('arm', ctx); break;
      case 'lawCollapse': w.start('collapse', ctx); break;
    }
  }

  // ---------------------------------------------------------------- shots -> projectiles
  function spawn(shot, wpn, env) {
    const S = soldier, at = env.atmos || STD_ATMOS, def = wpn.def, ads = S.ads > 0.6;
    const elev = wpn.sightElevation(at), wind = wpn.sightWindage();
    const p = S.aimPitch + elev + shot.dy, y = S.aimYaw - wind + shot.dx;
    // bore origin: on the sights (ADS) the bore is sightHeight under the line of sight; at the hip, low and right
    fwd(S.aimYaw, S.aimPitch, _f); upv(S.aimYaw, S.aimPitch, _u);
    const rx = Math.cos(S.aimYaw), rz = -Math.sin(S.aimYaw);
    const hip = HIP[def.cls] || HIP.rifle, k = ads ? 0 : 1;
    const sh = def.sight.height + (def.cls === 'gl' ? 0 : 0);
    const off = R.xrAim ? [0, 0, .05] : [hip[0] * k, ads ? -sh : hip[1], ads ? 0.05 : hip[2]];
    const eye = R.xrAim?.origin || S.eye;
    const ox = eye.x + rx * off[0] + _u[0] * off[1] + _f[0] * off[2];
    const oy = eye.y + _u[1] * off[1] + _f[1] * off[2];
    const oz = eye.z + rz * off[0] + _u[2] * off[1] + _f[2] * off[2];
    const d = fwd(y, p, [0, 0, 0]);
    const P = createProjectile(shot.round, ox, oy, oz, d[0], d[1], d[2], shot.v, { owner: R.id, side: R.side, id: ++R.shots });
    // the first metre from the eye to the muzzle: a wall right in front stops it there
    R.projectiles.push(P);
    out('shot', { id: P.id, weapon: wpn.key, round: shot.round, x: ox, y: oy, z: oz, dir: d, v: shot.v, tracer: shot.tracer, cookoff: shot.cookoff, J: shot.J });
    if (def.cls !== 'law') S.recoil(shot);
  }
  // advance all live rounds; hit tests through the host raycast
  function flyAll(dt, env) {
    const at = env.atmos || STD_ATMOS, lis = env.listener;
    for (let i = R.projectiles.length - 1; i >= 0; i--) {
      const P = R.projectiles[i];
      stepProjectile(P, dt, at);
      let guard = 0;
      while (P.alive && env.raycast && guard++ < 4) {
        const h = env.raycast(P.px, P.py, P.pz, P.x, P.y, P.z, P);
        if (!h) break;
        let skip = 0.02;
        if (h.body) { skip = bodyHit(P, h); P.ignore = h.body.target; }   // a through-and-through resumes at the exit (hosts may also skip P.ignore)
        else {
          const r = impact(P, h.nx, h.ny, h.nz, h.material || 'soil', h.thickness ?? 1e9, rng);
          out('impact', { id: P.id, t: P.t, owner: P.owner, x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz, material: h.material || 'soil', result: r.result, round: P.round.key, v: r.v0, target: h.target || null, dist: P.dist });
          if (r.result === 'detonate') out('explode', { info: explosionInfo(P, h.x, h.y, h.z), x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz });
        }
        if (!P.alive) break;
        // continue the remaining segment from just past the hit point
        const n = Math.hypot(P.vx, P.vy, P.vz) || 1, rem = Math.max(0, (1 - h.t) * Math.hypot(P.x - P.px, P.y - P.py, P.z - P.pz) - skip);
        P.px = h.x + P.vx / n * skip; P.py = h.y + P.vy / n * skip; P.pz = h.z + P.vz / n * skip;
        P.x = P.px + P.vx / n * rem; P.y = P.py + P.vy / n * rem; P.z = P.pz + P.vz / n * rem;
      }
      // a supersonic round passing the listener: the crack (and its miss distance)
      if (lis && P.alive && P.v > (at.c || 340) && P.owner !== lis.id) {
        const sx = P.x - P.px, sy = P.y - P.py, sz = P.z - P.pz, L2 = sx * sx + sy * sy + sz * sz;
        if (L2 > 0) {
          const u = Math.max(0, Math.min(1, ((lis.x - P.px) * sx + (lis.y - P.py) * sy + (lis.z - P.pz) * sz) / L2));
          if (u > 0 && u < 1) { const cx = P.px + sx * u - lis.x, cy = P.py + sy * u - lis.y, cz = P.pz + sz * u - lis.z, md = Math.hypot(cx, cy, cz); if (md < 12) out('crack', { miss: md, v: P.v, round: P.round.key, x: P.px + sx * u, y: P.py + sy * u, z: P.pz + sz * u }); }
        }
      }
      if (P.y < -200 || !P.alive || P.t > P.maxT) R.projectiles.splice(i, 1);
    }
  }
  function bodyHit(P, h) {
    const armour = [];
    let stopped = false;
    for (const a of h.body.armour || []) {
      const t = penetration(P.round, P.v, a.material);
      if (t < a.thickness) { stopped = true; armour.push({ ...a, stopped: true }); break; }
      armour.push(a); P.v *= 1 - a.thickness / t; const n = Math.hypot(P.vx, P.vy, P.vz); P.vx *= P.v / n; P.vy *= P.v / n; P.vz *= P.v / n;
    }
    const info = makeHitInfo(P, h.body.part, h.x, h.y, h.z, { armour, stopped });
    out('hit', { id: P.id, t: P.t, hit: info, target: h.body.target });
    if (P.round.explosive) { P.alive = false; out('explode', { info: explosionInfo(P, h.x, h.y, h.z), x: h.x, y: h.y, z: h.z, nx: 0, ny: 1, nz: 0 }); return; }
    // through and through (game table: body path lengths in mm against the 'flesh' material)
    const pen = stopped ? 0 : penetration(P.round, P.v, MATERIALS.flesh), path = h.body.part === 'head' ? 180 : h.body.part.startsWith('arm') || h.body.part.startsWith('leg') ? 140 : 300;
    if (pen > path) { P.v *= 1 - path / pen; const n = Math.hypot(P.vx, P.vy, P.vz); P.vx *= P.v / n; P.vy *= P.v / n; P.vz *= P.v / n; P.pens++; }
    else P.alive = false;
    return path / 1000 + 0.08;   // resume past the exit (the head sphere is 0.23 m across)
  }

  // ---------------------------------------------------------------- step
  R.step = function (dt, input = {}, env = {}, mods = {}) {
    R.events.length = 0; R.mods = mods;
    const S = soldier;
    S.load = loadKg();
    const ctx = { inv, mods, data: {} };
    for (const a of input.actions || []) doAction(a, ctx);
    // weapon swap: holster, then draw
    if (R.swap) {
      const sw = R.swap; sw.t += dt;
      if (sw.phase !== 'in' && sw.t >= sw.outDur) { sw.phase = 'in'; R.slot = sw.to; out('drawn', { weapon: slots[sw.to].key }); }
      if (sw.t >= sw.dur) R.swap = null;
    }
    // body
    const bevs = S.step(dt, input, env, mods, wpnInfo());
    // A tracked controller supplies the game weapon's aim; body movement and the simulation remain unchanged.
    const xr = input.xrAim, d = xr?.direction, p = xr?.origin;
    R.xrAim = d && p && [d.x,d.y,d.z,p.x,p.y,p.z].every(Number.isFinite) && Math.hypot(d.x,d.y,d.z)>.5 ? xr : null;
    if (R.xrAim) { S.aimYaw = Math.atan2(-d.x,-d.z); S.aimPitch = Math.atan2(d.y,Math.hypot(d.x,d.z)); }
    for (const e of bevs) out('body', { ev: e });
    // weapons: only the one in the hands takes the trigger; the others still cool down
    const w = R.cur, canFire = S.canFire && !R.swap && !(S.ads < 0.5 && w && w.def.cls === 'law');
    for (const s of slots) {
      for (const ww of s.gl ? [s, s.gl] : [s]) {
        const evs = ww.step(dt, ww === w ? { trigger: !!input.fire } : { trigger: false }, { inv, mods, canFire: ww === w && canFire, dirt: env.dirt });
        for (const e of evs) { if (e.e === 'shot') spawn(e, ww, env); else if (e.e === 'dropItem') out('drop', { item: e.item }); out('wpn', { ev: e, weapon: ww.key }); }
      }
    }
    // a fired LAW is discarded: the slot empties
    for (let i = slots.length - 1; i >= 0; i--) if (slots[i].key === 'M72A2' && slots[i].law === 'spent' && !slots[i].act) {
      out('drop', { item: { kind: 'tube', fit: 'M72A2', name: 'empty M72 tube' } }); slots.splice(i, 1); if (R.slot >= slots.length) R.slot = 0; if (i === R.slot || R.slot >= slots.length) R.slot = 0; R.swap = { t: 0, from: i, to: 0, dur: slots[0].def.swap[0], outDur: 0, phase: 'in' };
    }
    flyAll(dt, env);
    return R.events;
  };
  // HUD summary (no omniscience: the round count is only what you last saw)
  R.status = function () {
    const w = R.cur;
    return { weapon: w ? w.key : null, mode: w ? w.modeName : null, sight: w ? w.sightLabel() : null, busy: w && w.act ? w.act.name : null,
      known: w ? w.lastInfo : null, malfKnown: w ? (w.malfKnown ? w.malf : null) : null, heat: w && w.barrel ? Math.round(w.barrel.temp) : null,
      load: soldier.load, stamina: soldier.staminaFrac, hr: Math.round(soldier.hr), breath: soldier.holdBreath ? 'held' : 'free', stance: soldier.stance,
      glMode: R.glMode, mags: w && w.def.fit ? inv.count(w.def.fit) : 0 };
  };
  return R;
}
