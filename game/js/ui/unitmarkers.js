// UNIT MARKERS (ngc/healthbars): the one adapter between every unit in the war and the health-bar markers. Pure: no
// THREE, no DOM, no game imports (node runs it in tools/healthbarbench.mjs). The rest of the game does not change to
// get a marker: anything in war.units, the ground war's soldiers and vehicles (war.ground.sim.units), the island
// structures, or a list another module adds to war.markerExtra gets one, from the duck-typed rules below.
//
//   hpOf(x)   -> 0..1   health of a unit / structure / damage model (the shapes the game uses, see hpOf)
//   roleOf(x) -> 'air' | 'heli' | 'ship' | 'armour' | 'vehicle' | 'inf' | 'aa' | 'struct' | 'drone'
//   sideOf(x) -> 0 neutral | 1 TASK FORCE | 2 RUNAWAY
//   collectUnits(W, out) -> n: fills out[0..n) with { key, x, y, z, hp, role, side, n, r, dead } (objects reused;
//                         key = the unit, or its squad: one entry per infantry squad with the squad's aggregate bar)
export const ROLES = ['air', 'heli', 'ship', 'armour', 'vehicle', 'inf', 'aa', 'struct', 'drone'];
const clamp01 = v => v > 1 ? 1 : v > 0 ? v : 0;

// names the war uses (type / kind / mbtType / craft id) -> role. New units with one of these words in their name get
// the right icon without a change here; anything else falls back to the shape rules in roleOf.
const ROLE_OF = {
  carrier: 'ship', freighter: 'ship', battleship: 'ship', lcac: 'ship', lcm8: 'ship', ship: 'ship', boat: 'ship', trawler: 'ship', landingcraft: 'ship',
  ch46: 'heli', mv22: 'heli', huey: 'heli', heli: 'heli', transport: 'heli', osprey: 'heli', rotor: 'heli',
  wasp: 'drone', gunship: 'drone', reaper: 'drone', shahed: 'drone', uav: 'drone', drone: 'drone', loiter: 'drone',
  escort: 'air', tomcat: 'air', shrike: 'air', strike: 'air', jet: 'air', hornet: 'air', dropship: 'air', c130: 'air', fighter: 'air', bomber: 'air',
  squad: 'inf', marine: 'inf', strider: 'inf', inf: 'inf', foot: 'inf', soldier: 'inf', infantry: 'inf', trooper: 'inf',
  hovertank: 'armour', mbt: 'armour', tank: 'armour', m60: 'armour', m113: 'armour', apc: 'armour', armour: 'armour', armor: 'armour', m1a2: 'armour', t90m: 'armour', t72: 'armour',
  m151: 'vehicle', m35: 'vehicle', car: 'vehicle', truck: 'vehicle', jeep: 'vehicle', vehicle: 'vehicle', boxcar: 'vehicle',
  aa: 'aa', sam: 'aa', pantsir: 'aa', lance: 'aa', vads: 'aa', shilka: 'aa', flak: 'aa',
  hq: 'struct', factory: 'struct', fuel: 'struct', radar: 'struct', shipyard: 'struct', fortress: 'struct', struct: 'struct', depot: 'struct', pylon: 'struct', spire: 'struct', fabricator: 'struct', bunker: 'struct',
};
const _roleCache = new Map();
function roleByName(n) {
  if (typeof n !== 'string' || !n) return null;
  let r = _roleCache.get(n); if (r !== undefined) return r;
  const k = n.toLowerCase().replace(/[^a-z0-9]/g, '');
  r = ROLE_OF[k] || null;
  if (!r) for (const w in ROLE_OF) if (w.length > 2 && k.includes(w)) { r = ROLE_OF[w]; break; }   // 'rw7hovertank', 'm60a3', 'mq9reaper'
  _roleCache.set(n, r); return r;
}
export function roleOf(u) {
  if (!u) return 'vehicle';
  if (u.markerRole) return u.markerRole;   // a unit may say what it is
  // the CH-46 is the war's legacy 'drone' (the capture drone it replaced), the MV-22 its 'transport': kind first
  const r = roleByName(u.kind) || roleByName(u.mbtType) || roleByName(u.type) || roleByName(u.id);
  if (r) return r;
  if (u.dims) return 'ship';
  if (u.I && u.max !== undefined) return 'struct';
  if (u.vehicle) return 'vehicle';
  if (u.rot) return 'heli';
  if (u.air) return 'air';
  return 'vehicle';
}
export function sideOf(u) {
  if (!u) return 0;
  const s = u.side ?? u.owner ?? (u.I ? u.I.owner : 0);
  return s === 1 || s === 2 ? s : 0;
}
// health 0..1 from the shapes the game keeps it in (first match wins):
//   number                               already a fraction
//   { hp, hpMax }                        war.js aircraft and ships, rotary, airwar, strike jets, squads (men alive)
//   { hp, max }                          island structures, ship gun mounts
//   { hp: 0..1 }                         ground-war units (groundsim keeps a fraction)
//   { regions, lossFrac() }              medical.js (the Marine): worst of wounds and blood lost
//   { total() }                          foot.js's default medical
//   { hp: { part: 0..1, ... } }          damage.js (Huey), jetdamage.js, tomcatdamage.js: mean of the parts
//   { armor: { COMPS } } / { V: ... }    the M60A3 / M113A2 (armorcraft: components 0..1, crew left out)
//   { dmg: { state } } / { state }       wheeled vehicles (vehicledamage.js)
//   { sim: { hp: 0..100 } }              vehicle.js crafts
//   { M } / { health() }                 the Marine (marine.js), anything that says its own health
export function hpOf(x) {
  if (x == null) return 1;
  if (typeof x === 'number') return Number.isFinite(x) ? clamp01(x) : 0;
  if (typeof x.health === 'function') return clamp01(+x.health() || 0);
  if (x.dead === true || x.wrecked === true || x.alive === false) return 0;
  const hp = x.hp;
  if (typeof hp === 'number') {
    if (x.hpMax > 0) return clamp01(hp / x.hpMax);
    if (x.max > 0) return clamp01(hp / x.max);
    return Number.isFinite(hp) ? clamp01(hp > 1 ? hp / 100 : hp) : 0;
  }
  if (x.regions && typeof x.lossFrac === 'function') {   // medical.js
    let s = 0, n = 0; for (const k in x.regions) { const R = x.regions[k]; if (R && R.max > 0) { s += clamp01(R.hp / R.max); n++; } }
    const wounds = n ? s / n : 1, blood = clamp01(1 - x.lossFrac() / 0.4);   // ~40 % blood loss is class IV shock
    return Math.min(wounds, blood);
  }
  if (typeof x.total === 'function') return clamp01(+x.total() || 0);
  if (hp && typeof hp === 'object') { let s = 0, n = 0; for (const k in hp) if (typeof hp[k] === 'number') { s += clamp01(hp[k]); n++; } return n ? s / n : 1; }
  if (x.armor && x.armor.COMPS) {
    if (x.armor.cookoff) return 0;
    let s = 0, n = 0; for (const c of x.armor.COMPS) if (c.kind !== 'crew' && typeof c.hp === 'number') { s += clamp01(c.hp); n++; } return n ? s / n : 1;
  }
  if (x.V && x.V !== x) return hpOf(x.V);
  if (x.M && typeof x.M === 'object') return hpOf(x.M);
  const st = x.dmg ? x.dmg.state : x.state;
  if (st && typeof st === 'object' && typeof st.engine === 'number') {
    if (st.wrecked) return 0;
    const parts = [st.engine, st.fuelTank, st.radiator, st.gearbox, st.battery].filter(v => typeof v === 'number');
    let s = 0; for (const v of parts) s += clamp01(v); let k = parts.length ? s / parts.length : 1;
    if (Array.isArray(st.tyres) && st.tyres.length) { let t = 0; for (const T of st.tyres) t += T.blown ? 0 : clamp01(T.pressure ?? 1); k *= 0.75 + 0.25 * t / st.tyres.length; }
    return k;
  }
  if (x.sim && typeof x.sim.hp === 'number') return x.sim.dead ? 0 : clamp01(x.sim.hp > 1 ? x.sim.hp / 100 : x.sim.hp);
  return 1;
}

// is the unit gone (destroyed, sinking, crashing, removed)? its marker drops at once
export function goneOf(u) {
  return !u || u.dead === true || u.gone === true || u.dying === true || u.alive === false || u.sinking !== undefined || u.noMarker === true;
}

// how high over the unit's position the marker sits (m)
function topOf(u, role) {
  if (u.dims) return (u.dims.DECK || 8) + (u.dims.TOWER_H || 12) + 6;
  if (role === 'inf') return (u.h || 1.8) + 1.2;
  if (role === 'armour' || role === 'vehicle') return (u.h || 2.6) + 1.6;
  return (u.r || 3) + 1.5;
}

const _sq = new Map();   // squad -> its entry this frame (cleared each call)
const _size = new WeakMap();   // squad -> the most men it has had (the aggregate bar's 100 %)
function slot(out, n) { return out[n] || (out[n] = { key: null, x: 0, y: 0, z: 0, hp: 1, role: 'vehicle', side: 0, n: 1, r: 3, unit: null, sum: 0, size: 1 }); }
function put(out, n, key, u, x, y, z, hp, role, side, r) {
  const e = slot(out, n); e.key = key; e.unit = u; e.x = x; e.y = y; e.z = z; e.hp = hp; e.role = role; e.side = side; e.n = 1; e.r = r; e.sum = hp; e.size = 1; return e;
}

// every unit in the war with a marker this frame. opts.visible(x, z, side) -> bool hides what the player's side can't
// see (fog of war); opts.skip(u) -> true leaves a unit out.
export function collectUnits(W, out, opts = {}) {
  let n = 0; const vis = opts.visible, skip = opts.skip;
  const ok = (u, x, z, side) => !(skip && skip(u)) && !(vis && side === 2 && !vis(x, z, side));
  // war.units: ships, aircraft, rotorcraft, drones, strike jets, the dropship, legacy squads
  for (const u of W.units || []) {
    if (goneOf(u) || !u.p) continue;
    if (u.type === 'squad' && u.members) continue;   // a ground-war proxy: its men are drawn from the ground sim
    if (u.mesh && u.mesh.parent === null && !u.ext) continue;   // not in the scene (queued, stowed)
    const side = sideOf(u); if (!ok(u, u.p.x, u.p.z, side)) continue;
    const role = roleOf(u);
    put(out, n++, u, u, u.p.x, u.p.y + topOf(u, role), u.p.z, hpOf(u), role, side, u.dims ? u.dims.L * 0.5 : u.r || 3);
  }
  // the ground war: STRIDERs, RW-7s, MBTs, Marines; foot soldiers by squad (one marker, the squad's bar)
  const GS = W.ground && W.ground.sim;
  if (GS && GS.units) {
    _sq.clear();
    for (const u of GS.units) {
      if (u.alive === false || u.dead || !Number.isFinite(u.x)) continue;
      const side = sideOf(u); if (!ok(u, u.x, u.z, side)) continue;
      const role = roleOf(u), hp = hpOf(u.hp), y = (u.y || 0) + topOf(u, role);
      const S = !u.vehicle && u.squad ? u.squad : null;
      if (!S) { put(out, n++, u, u, u.x, y, u.z, hp, role, side, u.vehicle ? 4 : 1); continue; }
      let e = _sq.get(S);
      if (!e) { e = put(out, n++, S, u, u.x, y, u.z, hp, 'inf', side, 6); e.n = 1; _sq.set(S, e); continue; }
      e.x += u.x; e.y = Math.max(e.y, y); e.z += u.z; e.sum += hp; e.n++;
    }
    for (const [S, e] of _sq) {
      e.x /= e.n; e.z /= e.n;
      const size = Math.max(e.n, _size.get(S) || 0, Array.isArray(S.members) ? S.members.length : 0); _size.set(S, size);
      e.size = size; e.hp = clamp01(e.sum / size);   // the dead count as empty: 9 of 13 fit men read 69 %
    }
  }
  // island structures: HQ, factory, fuel, radar, shipyard, AA sites
  for (const I of W.islands || []) for (const s of I.structs || []) {
    if (s.dead || s.building > 0) continue;   // (an AA gun still going up has no marker yet)
    const side = sideOf(s); if (!ok(s, s.x, s.z, side)) continue;
    const role = roleOf(s);
    put(out, n++, s, s, s.x, (s.y || 0) + (s.h || 2) * 2 + 2.5, s.z, hpOf(s), role, side, s.r || 4);
  }
  // anything another module wants marked: war.markerExtra = [() => iterable of units with p (or x / y / z), side, hp...]
  for (const src of W.markerExtra || []) for (const u of src() || []) {
    if (goneOf(u)) continue;
    const x = u.p ? u.p.x : u.x, y = u.p ? u.p.y : u.y, z = u.p ? u.p.z : u.z, side = sideOf(u);
    if (!Number.isFinite(x) || !ok(u, x, z, side)) continue;
    const role = roleOf(u); put(out, n++, u, u, x, (y || 0) + topOf(u, role), z, hpOf(u), role, side, u.r || 3);
  }
  return n;
}
