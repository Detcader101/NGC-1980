// armorballistics.js - GAME-LEVEL projectiles, armour and damage for the tracked vehicles. PURE: no THREE, no DOM.
//
// Deliberately simple (a game table, not an engineering model): each round has a headline muzzle velocity, a drag
// constant for a believable flight, and a penetration value from a game table; each armour zone has a game thickness.
// A hit compares the round's value with the zone's thickness (slope makes a zone thicker), and a perforation damages
// whatever components and crew sit behind the hit point. Events go to the game.

export const G = 9.81;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------- rounds
// mv: headline muzzle velocity (m/s); drag: game drag constant (1/m); pen: game penetration value (mm), with KE rounds
// losing a little per km. Values are game balance, not data.
export const ROUNDS = {
  M735: { id: 'M735', name: 'M735 APFSDS-T', short: 'SABOT', kind: 'KE', cal: 105, mv: 1501, drag: 4e-5, pen: 330, penLossKm: 25, color: '#ffb84a' },
  M456: { id: 'M456', name: 'M456 HEAT-T', short: 'HEAT', kind: 'HEAT', cal: 105, mv: 1173, drag: 1e-4, pen: 340, color: '#ff9a3a', blast: 1 },
  M393: { id: 'M393', name: 'M393 HEP-T', short: 'HEP', kind: 'HEP', cal: 105, mv: 732, drag: 1.8e-4, pen: 110, color: '#ff9a3a', blast: 2 },
  M80: { id: 'M80', name: '7.62 mm ball', short: '7.62', kind: 'BALL', cal: 7.62, mv: 853, drag: 1e-3, pen: 6, color: '#ff5a3a', tracer: 5 },
  M2AP: { id: 'M2AP', name: '.50 cal AP', short: '.50', kind: 'BALL', cal: 12.7, mv: 887, drag: 4.5e-4, pen: 22, color: '#ff5a3a', tracer: 5 },
};
export const GUN_ROUNDS = ['M735', 'M456', 'M393'];

// ---------------------------------------------------------------------------------------------------- flight
// A shot: { round, p, v, t, dist, prev }. stepShot moves it with gravity and simple quadratic drag (wind optional).
export function newShot(round, p, dir, extraV = [0, 0, 0], mvVar = 0) {
  const R = typeof round === 'string' ? ROUNDS[round] : round, v0 = R.mv * (1 + mvVar);
  return { round: R, p: p.slice(), v: [dir[0] * v0 + extraV[0], dir[1] * v0 + extraV[1], dir[2] * v0 + extraV[2]], t: 0, dist: 0, prev: p.slice() };
}
export function stepShot(s, dt, wind = null) {
  const k = s.round.drag, ax = s.v[0] - (wind ? wind[0] : 0), ay = s.v[1] - (wind ? wind[1] : 0), az = s.v[2] - (wind ? wind[2] : 0), va = Math.hypot(ax, ay, az);
  s.prev[0] = s.p[0]; s.prev[1] = s.p[1]; s.prev[2] = s.p[2];
  s.v[0] -= k * va * ax * dt; s.v[1] -= (k * va * ay + G) * dt; s.v[2] -= k * va * az * dt;
  s.p[0] += s.v[0] * dt; s.p[1] += s.v[1] * dt; s.p[2] += s.v[2] * dt;
  s.t += dt; s.dist += Math.hypot(s.p[0] - s.prev[0], s.p[1] - s.prev[1], s.p[2] - s.prev[2]);
  return s;
}
export const shotSpeed = s => Math.hypot(s.v[0], s.v[1], s.v[2]);

// range table for the fire-control computer: the elevation above the line of sight to hit at range r and the time of
// flight, by shooting the same flight model (so the computer and the shells agree). 50 m steps to 5000 m.
const _tables = {};
export function fireTable(id) {
  if (_tables[id]) return _tables[id];
  const R = ROUNDS[id], rows = [], dt = 1 / 500;
  const shoot = (el, r) => {
    const s = newShot(R, [0, 0, 0], [0, Math.sin(el), -Math.cos(el)]);
    while (-s.p[2] < r && s.t < 30) stepShot(s, dt);
    const x0 = -s.prev[2], x1 = -s.p[2], f = x1 > x0 ? (r - x0) / (x1 - x0) : 1;
    return [s.prev[1] + (s.p[1] - s.prev[1]) * f, s.t - dt * (1 - f), shotSpeed(s)];
  };
  for (let r = 0; r <= 5000; r += 50) {
    if (r === 0) { rows.push({ r, el: 0, tof: 0, v: R.mv }); continue; }
    let a = 0, b = 0.002, fa = shoot(a, r)[0], fb = shoot(b, r)[0];
    for (let i = 0; i < 12 && Math.abs(fb) > 1e-4; i++) { const c = b - fb * (b - a) / (fb - fa); a = b; fa = fb; b = c; fb = shoot(b, r)[0]; }
    const [, tof, v] = shoot(b, r); rows.push({ r, el: b, tof, v });
  }
  const T = { id, rows, at(r) { r = clamp(r, 0, 5000); const i = Math.min(rows.length - 2, Math.floor(r / 50)), f = (r - rows[i].r) / 50, A = rows[i], B = rows[i + 1]; return { el: A.el + (B.el - A.el) * f, tof: A.tof + (B.tof - A.tof) * f, v: A.v + (B.v - A.v) * f }; } };
  return (_tables[id] = T);
}

// game penetration value of a round at a range (m)
export function penAt(round, range = 0) {
  const R = typeof round === 'string' ? ROUNDS[round] : round;
  return R.kind === 'KE' ? R.pen - (R.penLossKm || 0) * range / 1000 : R.kind === 'BALL' ? R.pen * clamp(1 - range / 1500, 0.2, 1) : R.pen;
}

// ---------------------------------------------------------------------------------------------------- armour zones
// A plate: { zone, frame: 'hull'|'turret', c, n (outward normal), u, hu, hv (half extents), t: game thickness (mm),
// soft: aluminium etc. (HEP blows through), ext: id of an outside component damaged by any heavy hit there }.
export function plate(zone, frame, c, n, u, hu, hv, t, extra = {}) {
  const nl = Math.hypot(...n); n = n.map(x => x / nl);
  const d = u[0] * n[0] + u[1] * n[1] + u[2] * n[2]; u = [u[0] - n[0] * d, u[1] - n[1] * d, u[2] - n[2] * d]; const ul = Math.hypot(...u); u = u.map(x => x / ul);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return { zone, frame, c, n, u, v, hu, hv, t, ...extra };
}
function toTurret(p, ring, az, isDir) {
  const x = p[0] - (isDir ? 0 : ring[0]), y = p[1] - (isDir ? 0 : ring[1]), z = p[2] - (isDir ? 0 : ring[2]);
  const c = Math.cos(-az), s = Math.sin(-az);
  return [c * x + s * z, y, -s * x + c * z];
}
// first plate along a ray (hull frame); state = { az } turret angle (+ left)
export function tracePlates(armor, o, d, state = { az: 0 }) {
  let best = null;
  const oT = toTurret(o, armor.RING, state.az, false), dT = toTurret(d, armor.RING, state.az, true);
  for (const P of armor.PLATES) {
    const oo = P.frame === 'turret' ? oT : o, dd = P.frame === 'turret' ? dT : d;
    const den = dd[0] * P.n[0] + dd[1] * P.n[1] + dd[2] * P.n[2];
    if (den >= -1e-6) continue;
    const t = ((P.c[0] - oo[0]) * P.n[0] + (P.c[1] - oo[1]) * P.n[1] + (P.c[2] - oo[2]) * P.n[2]) / den;
    if (t < 0 || (best && t >= best.t)) continue;
    const q = [oo[0] + dd[0] * t - P.c[0], oo[1] + dd[1] * t - P.c[1], oo[2] + dd[2] * t - P.c[2]];
    if (Math.abs(q[0] * P.u[0] + q[1] * P.u[1] + q[2] * P.u[2]) > P.hu || Math.abs(q[0] * P.v[0] + q[1] * P.v[1] + q[2] * P.v[2]) > P.hv) continue;
    best = { plate: P, t, cos: -den, p: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t] };
  }
  return best;
}
function inComp(armor, C, p, state) {
  const q = C.frame === 'turret' ? toTurret(p, armor.RING, state.az, false) : p;
  return Math.abs(q[0] - C.c[0]) <= C.h[0] && Math.abs(q[1] - C.c[1]) <= C.h[1] && Math.abs(q[2] - C.c[2]) <= C.h[2];
}

export function rng(seed = 1) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------------------------------------------- a hit
// hit: { round, range (m), o: ray start (hull frame, outside), d: unit direction (hull frame) }.
// Effective thickness = zone thickness / cos(angle), capped at 3x; a glancing hit (> 75 deg) usually skips off.
// Perforation: the components and crew within reach behind the hit point (a few sample points along the path, a
// little spread) take damage. Returns { result, zone, eff, pen, events }.
export function resolveHit(armor, hit, state = { az: 0 }, rand = armor.rand || Math.random) {
  const R = typeof hit.round === 'string' ? ROUNDS[hit.round] : hit.round, ev = [];
  const tr = tracePlates(armor, hit.o, hit.d, state);
  if (!tr) return { result: 'miss', events: ev };
  const P = tr.plate, ang = Math.acos(clamp(tr.cos, -1, 1)), eff = P.t / Math.max(1 / 3, tr.cos), pen = penAt(R, hit.range || 0);
  const out = { zone: P.zone, p: tr.p, angle: ang, eff, pen, events: ev, round: R.id };
  if (ang > 75 * D2R && rand() < 0.8) out.result = 'ricochet';
  else if (R.kind === 'HEP') out.result = P.soft ? 'perforated' : P.t <= R.pen ? 'scab' : 'defeated';
  else out.result = pen > eff ? 'perforated' : 'defeated';
  ev.push({ type: 'hit', result: out.result, zone: P.zone, round: R.id, eff: Math.round(eff), pen: Math.round(pen) });
  const heavy = R.cal >= 100;
  if (heavy && P.ext) damage(armor, P.ext, 0.5 + rand() * 0.6, ev, R);
  if (out.result !== 'perforated' && out.result !== 'scab') return out;
  // behind the armour
  const reach = heavy ? (out.result === 'scab' ? 1.0 : 3.0) : 1.2, n = heavy ? 10 : 3, spread = heavy ? 0.35 : 0.1;
  const hitIds = new Set();
  for (let i = 1; i <= n; i++) {
    const s = reach * i / n, j = spread * s;
    const p = [tr.p[0] + hit.d[0] * s + (rand() - 0.5) * j, tr.p[1] + hit.d[1] * s + (rand() - 0.5) * j, tr.p[2] + hit.d[2] * s + (rand() - 0.5) * j];
    for (const C of armor.COMPS) if (!hitIds.has(C.id) && inComp(armor, C, p, state)) { hitIds.add(C.id); damage(armor, C, (heavy ? 0.9 : 0.25) * (0.6 + 0.8 * rand()), ev, R); }
  }
  return out;
}

// damage a component and report: crew wounds, component state, fire, ammunition cook-off (game probabilities)
function damage(armor, C, amount, ev, R) {
  if (typeof C === 'string') C = armor.COMPS.find(c => c.id === C); if (!C) return;
  const before = C.hp; C.hp = Math.max(0, C.hp - amount);
  if (C.kind === 'crew') { if (before > 0) ev.push({ type: 'crew', who: C.id, wound: C.hp <= 0 ? 'killed' : C.hp < 0.4 ? 'serious' : 'light' }); return; }
  if (C.hp < before) ev.push({ type: 'component', id: C.id, hp: +C.hp.toFixed(2), destroyed: C.hp <= 0 && before > 0 });
  const r = armor.rand();
  if (C.kind === 'ammo' && R.cal >= 100 && r < (R.kind === 'HEAT' ? 0.6 : 0.4)) { ev.push({ type: 'cookoff', rack: C.id }); armor.cookoff = true; }
  else if ((C.kind === 'fuel' && r < 0.35) || (C.kind === 'engine' && r < 0.15) || (C.kind === 'hydraulic' && r < 0.08)) ev.push({ type: 'fire', where: C.id });
}

// kill categories: M = mobility, F = firepower, K = catastrophic
export function killState(armor) {
  const hp = id => { const c = armor.COMPS.find(c => c.id === id); return c ? c.hp : 1; };
  const alive = armor.COMPS.filter(c => c.kind === 'crew' && c.hp > 0).length;
  return { M: hp('engine') <= 0 || hp('transmission') <= 0, F: hp('gun') <= 0 || alive === 0, K: !!armor.cookoff || alive === 0, crewAlive: alive };
}
export function makeArmor(def, seed = 7) {
  return { ...def, COMPS: def.COMPS.map(c => ({ ...c, hp: c.hp ?? 1 })), cookoff: false, rand: rng(seed) };
}
