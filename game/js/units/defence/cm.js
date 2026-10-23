// NGC-1980 countermeasures and the radar warning picture (game level).
//
// Three counters, one per threat, so each tell has an answer:
//   FLARES  decoy missiles. Every burning flare gets ONE roll against each missile that is guiding on the player and has
//           it in front of its nose (a 60 deg cone): CM_RULES.flare.p, less when the missile is already close (late
//           flares). A decoyed missile flies at the flare and bursts there; a burst near the player still hurts a bit.
//   CHAFF   breaks a radar lock. Every RUNAWAY radar (guns, missile trucks: not the LANCE, which is optical) tracking the
//           player within CM_RULES.chaff.range when the cloud blooms keeps only `keep` of its lock and can't build it
//           again for `jam` s; each missile guiding on the player gets one weaker roll at the cloud.
//   SMOKE   (M18 grenades from the Marine, anything else that calls addSmoke) blocks lines of sight: the defence units'
//           lock and missile guidance checks and the LANCE beam (brain.js), the WASPs' fire check (rotary.js).
// These are game rules with game numbers (no seeker or radar physics), per the bible's "weapons stay at game level".
//
// State is module-level (there is one war at a time): the defence module (brain.js) steps it from its tick and reads it;
// the aircraft drop flares / chaff through a dispenser (createDispenser); the Marine's grenades call addSmoke.
// The RADAR WARNING picture (RWR) is filled by brain.js every frame (threats tracking the player, missiles in the air)
// and drawn by the cockpits (drawRwr) and the chase-view HUD cue (createRwrCue).

export const CM_RULES = {
  flare: { burn: 4.2, eject: 24, p: 0.62, pClose: 0.3, close: 45, cone: 0.5, near: 160 },   // near: a flare only counts while it is this close to the missile
  chaff: { bloom: 0.25, life: 5, r: 18, range: 320, keep: 0.25, jam: 2.6, p: 0.28, eject: 14 },
  smoke: { grow: 6, life: 20, r0: 2.5, rMax: 9, dens: 0.16, every: 1.5, drift: 0.6, block: 1 },   // a plume sphere every `every` s from a burning grenade; drift: x the wind
};

// ------------------------------------------------------------------ the shared state
const flares = [], chaff = [], smoke = [];
let seq = 0;
export const CM = { flares, chaff, smoke, stats: { flares: 0, chaff: 0, decoyed: 0, jammed: 0 } };
// radar warning: threats this frame. kind: 'T' TALON (gun / missile radar), 'L' LANCE (laser), 'A' other gun, 'W' a WASP's sensor (rotary.js), 'M' a
// missile in the air at you. brg: world bearing from the player (rad, 0 = -z north, clockwise), d: m, lock 0..1
export const RWR = { threats: [], n: 0, mode: 0, p: 0, launch: false, laser: false, t: 0 };
const _pool = []; let _np = 0;
export function rwrBegin() { _np = 0; }
export function rwrAdd(kind, brg, d, lock, locked, firing) {
  let o = _pool[_np]; if (!o) o = _pool[_np] = { kind: '', brg: 0, d: 0, lock: 0, locked: false, firing: false };
  o.kind = kind; o.brg = brg; o.d = d; o.lock = lock; o.locked = locked; o.firing = firing; _np++; return o;
}
export function rwrPublish(mode, p, t) {
  RWR.threats.length = 0; for (let i = 0; i < _np && i < 12; i++) RWR.threats.push(_pool[i]);
  RWR.n = RWR.threats.length; RWR.mode = mode; RWR.p = p; RWR.t = t;
  RWR.launch = RWR.threats.some(o => o.kind === 'M'); RWR.locked = RWR.threats.some(o => o.locked && o.kind !== 'M'); RWR.laser = RWR.threats.some(o => o.kind === 'L' && o.firing);
}

// ------------------------------------------------------------------ dropping them
export function dropFlare(x, y, z, vx, vy, vz) {
  flares.push({ id: ++seq, x, y, z, vx, vy, vz, age: 0, tried: null }); CM.stats.flares++;
  return flares[flares.length - 1];
}
export function dropChaff(x, y, z, vx, vy, vz) {
  chaff.push({ id: ++seq, x, y, z, vx, vy, vz, age: 0, r: 0.5, bloomed: false }); CM.stats.chaff++;
  return chaff[chaff.length - 1];
}
// a smoke source (an M18 burning on the ground): it lays a plume of spheres downwind for `burn` s
// col: [r, g, b] of the smoke (M18: green, yellow, red, violet)
export function addSmoke(x, y, z, { burn = 60, col = [0.45, 0.62, 0.4] } = {}) {
  const s = { id: ++seq, src: true, x, y, z, burn, col, t: 0, next: 0, puffAcc: 0 };
  smoke.push(s); return s;
}
export function resetCM() { flares.length = chaff.length = smoke.length = 0; rwrBegin(); rwrPublish(0, 0, 0); }

// ------------------------------------------------------------------ the frame (brain.js tick)
// fx: the game's particle pools; groundH(x, z): ground height (sea 0)
export function stepCM(dt, fx, groundH) {
  if (!(dt > 0)) return;
  const R = CM_RULES;
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i]; f.age += dt;
    const k = Math.exp(-1.6 * dt); f.vx *= k; f.vz *= k; f.vy = f.vy * k - 9.81 * dt * 0.75;   // a light candle: slows fast, sinks
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    const gy = groundH ? groundH(f.x, f.z) : 0;
    if (f.y < gy + 0.2) { f.y = gy + 0.2; f.vy = 0; f.vx *= 0.5; f.vz *= 0.5; }
    if (f.age > R.flare.burn) { flares[i] = flares[flares.length - 1]; flares.pop(); continue; }
    if (fx) {   // white-hot core, a halo, and the white smoke trail that hangs in the sky (the classic flare arc)
      const b = f.age < 0.15 ? f.age / 0.15 : 1 - Math.max(0, f.age - R.flare.burn + 0.6) / 0.6, fl = 0.8 + Math.random() * 0.4;
      fx.add.spawn(f.x, f.y, f.z, 0, 0, 0, 0.06, 1.6 * b * fl, 1.2 * b, 1, 0.95, 0.85, 1);
      fx.add.spawn(f.x, f.y, f.z, 0, 0, 0, 0.09, 4.5 * b * fl, 3 * b, 1, 0.7, 0.35, 0.45);
      if (Math.random() < 0.85) fx.mix.spawn(f.x, f.y, f.z, 0, 0.3, 0, 2.6 + Math.random() * 1.6, 0.5, 2.6, 0.93, 0.93, 0.92, 0.55, -0.05, 0.6, 0.4);
      if (Math.random() < 0.3) fx.add.spawn(f.x, f.y, f.z, (Math.random() - 0.5) * 4, -Math.random() * 3, (Math.random() - 0.5) * 4, 0.3, 0.25, 0.1, 1, 0.8, 0.5, 1, 9);   // sparks
    }
  }
  for (let i = chaff.length - 1; i >= 0; i--) {
    const c = chaff[i]; c.age += dt;
    const k = Math.exp(-4 * dt); c.vx *= k; c.vy = c.vy * k - 0.6 * dt; c.vz *= k;   // the bundle bursts and the dipoles hang
    if (fx && fx.wind) { c.vx += fx.wind.x * 0.3 * dt; c.vz += fx.wind.y * 0.3 * dt; }
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    c.r = Math.min(R.chaff.r, 0.5 + R.chaff.r * Math.sqrt(c.age / 1.2));
    if (c.age > R.chaff.life) { chaff[i] = chaff[chaff.length - 1]; chaff.pop(); continue; }
    if (fx && c.age < 1.8) {   // glitter: a burst of tiny bright foil, then a faint grey haze
      const n = c.age < 0.3 ? 14 : 3;
      for (let j = 0; j < n; j++) { const a = Math.random() * 6.283, e = (Math.random() - 0.5) * 2, s = c.r * (0.4 + Math.random() * 0.6); fx.add.spawn(c.x + Math.cos(a) * s, c.y + e * s * 0.5, c.z + Math.sin(a) * s, Math.cos(a) * 1.5, -0.4 - Math.random(), Math.sin(a) * 1.5, 0.5 + Math.random() * 1.2, 0.18, 0.12, 0.9, 0.92, 1, 0.9, 0.3, 1.5, 0.3); }
      if (c.age < 0.3) fx.mix.spawn(c.x, c.y, c.z, c.vx * 0.3, 0, c.vz * 0.3, 2.5, 1, c.r * 0.9, 0.8, 0.82, 0.84, 0.18, 0.1, 1, 0.4);
    }
  }
  // smoke: sources lay plume spheres that drift with the wind, grow and thin out
  const wx = fx && fx.wind ? fx.wind.x : 1, wz = fx && fx.wind ? fx.wind.y : 0.4;
  for (let i = smoke.length - 1; i >= 0; i--) {
    const s = smoke[i];
    if (s.src) {
      s.t += dt; s.next -= dt;
      const on = s.t < s.burn;
      if (on && s.next <= 0) { s.next = R.smoke.every; smoke.push({ id: ++seq, src: false, x: s.x, y: s.y + 1, z: s.z, r: R.smoke.r0, age: 0, dens: 0, col: s.col }); }
      if (fx && on) {   // the visible plume: dense coloured puffs pouring out low, rising and rolling downwind
        const start = Math.min(1, s.t / 2.5);
        s.puffAcc += dt * 14 * start;
        while (s.puffAcc > 1) { s.puffAcc--; const g = 0.85 + Math.random() * 0.25, c = s.col;
          const lo = Math.random() < 0.45, a = Math.random() * 6.283, sp = lo ? 1.5 + Math.random() * 1.5 : 0.6;   // some roll out low along the ground, the rest billow up
          fx.mix.spawn(s.x + (Math.random() - 0.5) * 0.4, s.y + 0.3, s.z + (Math.random() - 0.5) * 0.4, Math.cos(a) * sp, lo ? 0.3 + Math.random() * 0.4 : 1.2 + Math.random() * 1.2, Math.sin(a) * sp, 10 + Math.random() * 7, lo ? 1.6 : 0.9, R.smoke.rMax * (lo ? 1.6 : 2.2), c[0] * g, c[1] * g, c[2] * g, 0.88, lo ? 0 : -0.04, 0.5, 0.3); }   // wind 0.3 / drag 0.5: drifts at 0.6 x the wind, like the spheres
      }
      if (!on && s.t > s.burn + R.smoke.life) { smoke[i] = smoke[smoke.length - 1]; smoke.pop(); }
      continue;
    }
    s.age += dt;
    s.x += wx * R.smoke.drift * dt; s.z += wz * R.smoke.drift * dt; s.y += 0.35 * dt;   // the puffs' terminal drift
    s.r = Math.min(R.smoke.rMax, R.smoke.r0 + (R.smoke.rMax - R.smoke.r0) * Math.min(1, s.age / R.smoke.grow));
    s.dens = R.smoke.dens * Math.min(1, s.age / 1.5) * Math.max(0, Math.min(1, (R.smoke.life - s.age) / (R.smoke.life * 0.3)));
    if (s.age > R.smoke.life) { smoke[i] = smoke[smoke.length - 1]; smoke.pop(); }
  }
}

// summed smoke opacity along the segment a -> b (chord length through each plume sphere x its density)
export function smokeOpacity(ax, ay, az, bx, by, bz) {
  if (!smoke.length) return 0;
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1, ux = dx / L, uy = dy / L, uz = dz / L;
  let acc = 0;
  for (let i = 0; i < smoke.length; i++) {
    const s = smoke[i]; if (s.src || s.dens <= 0) continue;
    const cx = s.x - ax, cy = s.y - ay, cz = s.z - az, t = cx * ux + cy * uy + cz * uz;
    const ex = cx - ux * t, ey = cy - uy * t, ez = cz - uz * t, e2 = ex * ex + ey * ey + ez * ez, r2 = s.r * s.r;
    if (e2 >= r2) continue;
    const h = Math.sqrt(r2 - e2), t0 = Math.max(0, t - h), t1 = Math.min(L, t + h);
    if (t1 > t0) acc += (t1 - t0) * s.dens;
  }
  return acc;
}
export const smokeBlocks = (ax, ay, az, bx, by, bz) => smoke.length > 0 && smokeOpacity(ax, ay, az, bx, by, bz) >= CM_RULES.smoke.block;
// where along a -> dir (unit) the smoke gets thick enough to stop a beam (L if never)
export function smokeStop(ax, ay, az, dx, dy, dz, L) {
  if (!smoke.length) return L;
  let lo = 0, hi = L;
  if (smokeOpacity(ax, ay, az, ax + dx * L, ay + dy * L, az + dz * L) < CM_RULES.smoke.block) return L;
  for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (smokeOpacity(ax, ay, az, ax + dx * m, ay + dy * m, az + dz * m) >= CM_RULES.smoke.block) hi = m; else lo = m; }
  return hi;
}
// is (x, y, z) inside a blooming chaff cloud younger than `age` s?
export function chaffAt(x, y, z, age = CM_RULES.chaff.life) {
  for (const c of chaff) if (c.age < age && (c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2 < (c.r + 10) ** 2) return c;
  return null;
}

// ------------------------------------------------------------------ the player's dispenser
// One per aircraft. o: { name, flares, chaff, program: { flare: n, chaff: n } (cartridges per press), gap (s between
// them), eject (local unit dir [x, y, z], -z forward), ports ([[x, y, z], ...] local), sfx, say }.
// d.press('flare' | 'chaff') queues a program; d.update(dt, pose) fires the queue: pose = { pos, vel, q } (THREE-like:
// pos / vel {x, y, z}, q a quaternion with applyQuaternion semantics given by toWorld(local, out)).
export function createDispenser(o) {
  const D = {
    name: o.name, max: { flare: o.flares, chaff: o.chaff }, flare: o.flares, chaff: o.chaff, queue: [], gap: o.gap ?? 0.18, t: 0, port: 0,
    lastT: -99, last: '', armed: true,
  };
  D.press = kind => {
    if (!D.armed) return false;
    if (D[kind] <= 0) { o.say?.(`${kind === 'flare' ? 'FLARES' : 'CHAFF'} OUT  -  REARM ON THE CARRIER OR A FRIENDLY PAD`, 1.4); o.sfx?.blip?.(300, 200, 0.12, 'square', 0.04); return false; }
    const n = Math.min(D[kind], o.program?.[kind] ?? 1);
    for (let i = 0; i < n; i++) D.queue.push(kind);
    return true;
  };
  // pose.toWorld(local [x, y, z], out) -> world point; pose.dirWorld(local, out) -> world direction; pose.vel
  const _p = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };
  D.update = (dt, pose) => {
    D.t -= dt;
    if (!D.queue.length || D.t > 0 || !pose) return;
    const kind = D.queue.shift();
    if (D[kind] <= 0) { D.queue.length = 0; return; }
    D[kind]--; D.t = D.gap; D.lastT = performance.now(); D.last = kind;
    const port = o.ports[D.port++ % o.ports.length];
    pose.toWorld(port, _p);
    const ej = o.eject[kind] || o.eject.flare || o.eject;
    pose.dirWorld([ej[0] * (port[0] < 0 && o.mirror ? -1 : 1), ej[1], ej[2]], _d);
    const sp = kind === 'flare' ? CM_RULES.flare.eject : CM_RULES.chaff.eject, v = pose.vel;
    if (kind === 'flare') dropFlare(_p.x, _p.y, _p.z, v.x + _d.x * sp, v.y + _d.y * sp, v.z + _d.z * sp);
    else dropChaff(_p.x, _p.y, _p.z, v.x + _d.x * sp, v.y + _d.y * sp, v.z + _d.z * sp);
    // the squib: a sharp pop and (flare) the hiss of the candle lighting
    const s = o.sfx;
    if (s && s.ctx) { s.noiseBurst(2400, 500, 0.09, 0.22); s.blip(180, 70, 0.07, 'square', 0.06); if (kind === 'flare') s.noiseBurst(5000, 2500, 0.5, 0.05); else s.noiseBurst(7000, 4000, 0.3, 0.05); }
  };
  // rearm a cartridge at a time (on deck / a friendly pad); returns true while it is still loading
  D.rearmT = 0;
  D.rearm = dt => {
    D.rearmT -= dt; if (D.flare >= D.max.flare && D.chaff >= D.max.chaff) return false;
    if (D.rearmT <= 0) { D.rearmT = 0.12; if (D.flare < D.max.flare) D.flare++; else D.chaff++; }
    return true;
  };
  D.reset = () => { D.flare = D.max.flare; D.chaff = D.max.chaff; D.queue.length = 0; };
  D.full = () => D.flare >= D.max.flare && D.chaff >= D.max.chaff;
  D.line = () => `${D.name} FLR ${D.flare} CHF ${D.chaff}`;
  return D;
}

// ------------------------------------------------------------------ drawing the radar warning picture
// A round scope on a 2D canvas. style 'apr39' (Huey: green strobes from the centre, length = how close / how locked,
// the 1980 AN/APR-39) or 'alr' (Hornet: threat letters placed by bearing, inner ring = lethal, a circle round the one
// locked on, a diamond on the highest threat, like the ALR-45/67 scopes of the period). yaw: the aircraft's heading
// (rad, compass bearing of the nose). t: time (s) for blinking.
export function drawRwr(c, W, rwr, yaw, t, style = 'apr39', power = true) {
  const R = W / 2;
  c.save(); c.clearRect(0, 0, W, W);
  c.fillStyle = '#050806'; c.beginPath(); c.arc(R, R, R, 0, 6.283); c.fill();
  if (!power) { c.restore(); return; }
  const G = style === 'alr' ? '#8dff8a' : '#6cff7a', dim = style === 'alr' ? '#2c6a30' : '#245a2c';
  c.strokeStyle = dim; c.lineWidth = Math.max(1, W / 140);
  for (const k of [0.33, 0.66, 0.94]) { c.beginPath(); c.arc(R, R, R * k, 0, 6.283); c.stroke(); }
  for (let a = 0; a < 12; a++) { const s = Math.sin(a * Math.PI / 6), co = Math.cos(a * Math.PI / 6); c.beginPath(); c.moveTo(R + s * R * 0.86, R - co * R * 0.86); c.lineTo(R + s * R * 0.94, R - co * R * 0.94); c.stroke(); }
  // aircraft symbol at the centre
  c.strokeStyle = G; c.lineWidth = Math.max(1.5, W / 90); c.beginPath(); c.moveTo(R, R - R * 0.09); c.lineTo(R, R + R * 0.08); c.moveTo(R - R * 0.08, R); c.lineTo(R + R * 0.08, R); c.stroke();
  const blink = (t * 4) % 1 < 0.55;
  let top = null;
  for (const o of rwr.threats) {
    const rel = o.brg - yaw, s = Math.sin(rel), co = Math.cos(rel);
    // ring by lethality: missiles and locks on the inner ring, tracking mid, search outer
    const ring = o.kind === 'M' ? 0.3 : o.locked || o.firing ? 0.45 : 0.62 + 0.25 * (1 - o.lock);
    if (!top || (o.kind === 'M') > (top.kind === 'M') || o.lock > top.lock) top = o;
    const x = R + s * R * ring, y = R - co * R * ring;
    if (style === 'apr39') {
      const len = R * (0.3 + 0.6 * (o.kind === 'M' ? 1 : 0.35 + 0.65 * o.lock));
      if (o.kind === 'M' && !blink) continue;
      c.strokeStyle = o.kind === 'M' || o.locked ? '#c8ffd0' : G; c.lineWidth = Math.max(2, W / (o.locked || o.kind === 'M' ? 45 : 70));
      c.beginPath(); c.moveTo(R + s * R * 0.12, R - co * R * 0.12); c.lineTo(R + s * len, R - co * len); c.stroke();
      if (o.kind === 'L') { c.beginPath(); c.arc(R + s * len, R - co * len, W / 40, 0, 6.283); c.stroke(); }   // the laser: a dot on the strobe
    } else {
      if (o.kind === 'M' && !blink) continue;
      c.fillStyle = G; c.font = `bold ${Math.round(W / 8)}px Consolas, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(o.kind === 'M' ? 'M' : o.kind === 'T' ? '8' : o.kind === 'L' ? 'L' : o.kind === 'W' ? 'W' : 'A', x, y);
      if (o.locked || o.firing) { c.strokeStyle = G; c.lineWidth = Math.max(1.5, W / 100); c.beginPath(); c.arc(x, y, W / 11, 0, 6.283); c.stroke(); }
    }
  }
  if (style === 'alr' && top) {   // the highest threat gets the diamond
    const rel = top.brg - yaw, ring = top.kind === 'M' ? 0.3 : top.locked || top.firing ? 0.45 : 0.62 + 0.25 * (1 - top.lock), x = R + Math.sin(rel) * R * ring, y = R - Math.cos(rel) * R * ring, d = W / 9;
    c.strokeStyle = G; c.lineWidth = Math.max(1.5, W / 100); c.beginPath(); c.moveTo(x, y - d); c.lineTo(x + d, y); c.lineTo(x, y + d); c.lineTo(x - d, y); c.closePath(); c.stroke();
  }
  c.restore();
}

// The chase-view cue: a small scope + LOCK / LAUNCH / LASER words, in the HUD layer, only while something is up.
// parent: the #hud element. update(show, yaw, t, cm) - cm: { flare, chaff } counts (the dispenser) or null
export function createRwrCue(parent) {
  if (typeof document === 'undefined' || !parent) return { update() {}, el: null };
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;left:16px;top:200px;width:132px;text-align:center;font:bold 13px Consolas,monospace;letter-spacing:1px;display:none;text-shadow:0 0 4px #000';
  const cv = document.createElement('canvas'); cv.width = cv.height = 120; cv.style.cssText = 'width:96px;height:96px;opacity:.92;border-radius:50%;box-shadow:0 0 0 2px rgba(80,160,90,.6)';
  const words = document.createElement('div'); words.style.cssText = 'margin-top:3px;min-height:16px';
  const cnt = document.createElement('div'); cnt.style.cssText = 'margin-top:2px;color:#bdb;font-weight:normal;font-size:12px';
  box.append(cv, words, cnt); parent.appendChild(box);
  const c = cv.getContext('2d'); let lastW = '', lastC = '', shown = false, holdT = 0;
  return {
    el: box,
    update(show, yaw, t, cm) {
      const busy = show && (RWR.n > 0);
      if (busy) holdT = t + 1.5;
      const on = show && t < holdT;
      if (on !== shown) { box.style.display = on ? 'block' : 'none'; shown = on; }
      if (!on) return;
      drawRwr(c, 120, RWR, yaw, t, 'apr39');
      const bl = (t * 4) % 1 < 0.55;
      const w = RWR.launch ? (bl ? '<span style="color:#ff4a3a">MISSILE LAUNCH</span>' : '&nbsp;') : RWR.laser ? '<span style="color:#7fe8ff">LASER</span>' : RWR.locked ? '<span style="color:#ffb43a">LOCK</span>' : RWR.n ? '<span style="color:#9f9">SEARCH</span>' : '&nbsp;';
      if (w !== lastW) { words.innerHTML = w; lastW = w; }
      const k = cm ? `FLR ${cm.flare}  CHF ${cm.chaff}` : '';
      if (k !== lastC) { cnt.textContent = k; lastC = k; }
    },
  };
}
