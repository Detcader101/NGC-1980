// vehicledamage.js - component damage for the wheeled vehicles. Pure JS (node-testable). The sim (vehiclefm.js) reads the
// effects; the game reads the events.
//   const D = createDamage(spec, sim); sim.dmg = D;
//   D.hit(pointModel, dirModel, kind)  - a projectile through the vehicle (model frame point where it enters + direction);
//                                         kind: 'rifle' (5.56 / 7.62), 'hmg' (12.7 / 14.5), 'cannon' (20-30 mm), 'frag'
//   D.blast(pointModel, radius, power)  - an explosion near / on the vehicle (power 1 = 82 mm mortar class at 0 m)
//   D.puncture(wheel, rate), D.extinguish(), D.repair(what), D.setOccupant(seatId, bool)
// Components and what they do:
//   tyres (per wheel)   punctured -> leak down over ~20-60 s -> flat: less grip, huge rolling resistance, pulls; blown = instant
//   engine              power falls with damage, seizes at 0 (also from no oil, overheating, hydrolock)
//   oil                 sump hit -> leak -> pressure drops -> bearings wear -> seize
//   radiator / coolant  hit -> leak -> overheats (the sim's coolant model) -> head gasket / seize
//   fuel tank           hit -> leak (litres/s), hot engine or an incendiary / tracer -> FIRE
//   battery / generator hit -> no charging, then no starting (the sim's battery)
//   fire                grows, burns tyres and the crew, cooks the tank: WRECK unless put out early (extinguisher)
//   crew / passengers   seats with an occupant: hit when a round or fragments pass the seat, in crashes, rollovers, fire
//   wreck               fire through / catastrophic blast / engine + all tyres gone: dead hulk
// Events (in sim.events, { e, ... }): 'puncture' {wheel}, 'blowout' {wheel}, 'flat' {wheel}, 'oilLeak', 'coolantLeak',
//   'fuelLeak', 'fire', 'fireOut', 'overheat', 'oilPressure', 'seized', 'engineHit', 'radiatorHit', 'batteryHit',
//   'crewHit' {seat, dmg, cause}, 'crewKilled' {seat}, 'wrecked' {cause}, 'ricochet'.
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// penetration (how many component boxes a round passes through) and damage per component by kind (INFERRED, game-tuned)
const KIND = {
  rifle: { dmg: 0.10, pen: 2, tyre: 0.45, blow: 0.03, fire: 0.06, crew: 0.45 },
  hmg: { dmg: 0.28, pen: 4, tyre: 0.9, blow: 0.35, fire: 0.18, crew: 1.0 },
  cannon: { dmg: 0.65, pen: 6, tyre: 1, blow: 0.9, fire: 0.45, crew: 1.0 },
  frag: { dmg: 0.06, pen: 1, tyre: 0.3, blow: 0.02, fire: 0.03, crew: 0.35 },
};

export function createDamage(spec, sim, rng = Math.random) {
  const NW = spec.wheels.length, comps = spec.components;
  const st = {
    engine: 1, oil: 1, coolant: 1, fuelTank: 1, battery: 1, radiator: 1, gearbox: 1,
    oilLeak: 0, coolLeak: 0, fuelLeak: 0,             // per second (fraction / fraction / litres)
    fire: 0, fireT: 0, wrecked: false, cause: null,
    tyres: Array.from({ length: NW }, () => ({ pressure: 1, leak: 0, blown: false, flatEv: false })),
    seats: (spec.seats || []).map(s => ({ id: s.id, occupied: s.role === 'driver', hp: 1, dead: false })),
    overheatT: 0,
  };
  const D = {
    state: st, spec,
    get oil() { return st.oil; }, get coolant() { return st.coolant; }, get genDead() { return st.battery < 0.3; },
    setOccupant(id, on = true) { const s = st.seats.find(s => s.id === id); if (s) { s.occupied = on; if (on) { s.hp = Math.max(s.hp, 0.01); } } },
    occupants() { return st.seats.filter(s => s.occupied && !s.dead); },
    puncture(i, rate = 0.04) { const T = st.tyres[i]; if (!T || T.blown) return; if (rate >= 1) { T.blown = true; T.pressure = 0; ev('blowout', { wheel: i }); } else { T.leak = Math.max(T.leak, rate); ev('puncture', { wheel: i }); } },
    extinguish() {   // hand extinguisher: works on a young fire
      if (st.fire <= 0) return false;
      const p = clamp(1.1 - st.fire * 1.2, 0.05, 0.95);
      if (rng() < p) { st.fire = 0; st.fireT = 0; ev('fireOut'); return true; }
      st.fire = Math.max(0.05, st.fire - 0.2); return false;
    },
    repair(what = 'all') {
      if (what === 'all' || what === 'tyres') st.tyres.forEach(T => Object.assign(T, { pressure: 1, leak: 0, blown: false, flatEv: false }));
      if (what === 'all') { Object.assign(st, { engine: 1, oil: 1, coolant: 1, fuelTank: 1, battery: 1, radiator: 1, gearbox: 1, oilLeak: 0, coolLeak: 0, fuelLeak: 0, fire: 0, fireT: 0, wrecked: false, cause: null }); sim.eng.seized = false; sim.eng.hydrolock = false; }
    },
    // a round through the vehicle: walk the ray through the component boxes, wheels and seats in order of distance
    hit(p, dir, kind = 'rifle') {
      if (st.wrecked) return [];
      const K = KIND[kind] || KIND.rifle, hits = [];
      const l = Math.hypot(dir[0], dir[1], dir[2]) || 1, d = [dir[0] / l, dir[1] / l, dir[2] / l];
      const cand = [];
      for (const [name, b] of Object.entries(comps)) { if (!b) continue; const t = rayBox(p, d, b); if (t !== null) cand.push([t, 'c', name]); }
      spec.wheels.forEach((w, i) => { const r = sim.wheels[i].r, c = [w.x, r, w.z]; const t = raySphere(p, d, c, r * 0.95); if (t !== null) cand.push([t, 'w', i]); });
      spec.seats.forEach((s, i) => { const c = [s.at[0], s.at[1] + 0.45, s.at[2]]; const t = raySphere(p, d, c, 0.32); if (t !== null) cand.push([t, 's', i]); });
      cand.sort((a, b) => a[0] - b[0]);
      let pen = K.pen;
      for (const [, type, k] of cand) {
        if (pen <= 0) break;
        if (type === 'w') { hitTyre(k, K); pen -= 1.5; hits.push('tyre' + k); }
        else if (type === 's') { hitSeat(k, K.crew * (0.6 + 0.6 * rng()), kind); pen -= 0.7; hits.push('seat' + k); }
        else { hitComp(k, K.dmg * (0.7 + 0.6 * rng()), K); pen -= k === 'engine' ? 3 : 1; hits.push(k); }
      }
      if (!hits.length && rng() < 0.3) ev('ricochet');
      return hits;
    },
    blast(p, radius = 4, power = 1) {
      if (st.wrecked) return;
      const fall = c => { const dd = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]); return clamp(1 - dd / radius, 0, 1) ** 1.5 * power; };
      for (const [name, b] of Object.entries(comps)) { if (!b) continue; const k = fall([(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]); if (k > 0.02) hitComp(name, k * 0.9, KIND.frag); }
      spec.wheels.forEach((w, i) => { const k = fall([w.x, 0.4, w.z]); if (k > 0.15 && rng() < k * 1.5) D.puncture(i, k > 0.6 ? 1 : 0.06); });
      spec.seats.forEach((s, i) => { const k = fall(s.at); if (k > 0.03) hitSeat(i, k * (spec.kind === 'jeep' || spec.kind === 'truck' ? 1.4 : 0.9), 'blast'); });
      if (power * fall([0, 0.6, 0]) > 0.75) wreck('blast');
    },
    // sim callbacks: crashes, rollovers, water
    onEvent(S, e, x) {
      if (e === 'impact' && x.speed > 4) {
        const sev = clamp((x.speed - 4) / 14, 0, 1);
        const front = x.local && x.local[2] < -0.5 * spec.dims.wheelbase;
        if (front) { hitComp('radiator', sev * 0.9, KIND.frag); if (sev > 0.4) hitComp('engine', sev * 0.5, KIND.frag); }
        if (x.speed > 8) st.seats.forEach((s, i) => s.occupied && hitSeat(i, clamp((x.speed - 8) / 14, 0, 1) * (0.5 + rng() * 0.5), 'crash'));
        if (x.speed > 20) wreck('crash');
      }
      if (e === 'rollover') {
        const open = spec.kind === 'jeep' || spec.kind === 'truck';   // no roof: the crew is thrown / crushed
        st.seats.forEach((s, i) => s.occupied && hitSeat(i, (open ? 0.45 : 0.15) + (x.speed > 8 ? 0.3 : 0) * rng(), 'rollover'));
        if (rng() < 0.25) st.fuelLeak = Math.max(st.fuelLeak, 0.05);
      }
      if (e === 'hydrolock') { st.engine = 0; }
    },
    update(S, dt, env) {
      if (st.wrecked) { S.mods.power = 0; S.eng.seized = true; return; }
      // leaks
      if (st.oilLeak > 0) st.oil = Math.max(0, st.oil - st.oilLeak * dt);
      if (st.coolLeak > 0) st.coolant = Math.max(0, st.coolant - st.coolLeak * dt * (S.eng.temp > 90 ? 1.5 : 1));
      if (st.fuelLeak > 0) S.fuelL = Math.max(0, S.fuelL - st.fuelLeak * dt);
      // tyres
      S.wheels.forEach((W, i) => {
        const T = st.tyres[i];
        if (T.leak > 0 && T.pressure > 0) T.pressure = Math.max(0, T.pressure - T.leak * dt);
        W.ts.flat = clamp((0.45 - T.pressure) / 0.45, 0, 1);
        if (W.ts.flat > 0.9 && !T.flatEv) { T.flatEv = true; ev('flat', { wheel: i }); }
        // running flat shreds the tyre
        if (W.ts.flat > 0.8 && Math.abs(W.omega * W.r) > 12) T.blown = true;
      });
      // engine: overheating, oil starvation, power
      const e = S.eng;
      if (e.temp > 112 && e.running) { st.overheatT += dt; if (st.overheatT > 0.5) ev('overheat', { temp: e.temp }, 10); }
      else st.overheatT = 0;
      if (e.temp > 120) st.engine -= (e.temp - 120) * 0.0012 * dt;
      if (e.running && e.oilP < 8) { st.engine -= 0.012 * dt * (0.3 + e.rpm / 3000); ev('oilPressure', null, 8); }
      if (e.running && e.rpm > (spec.engine.governor ? spec.engine.governor[1] : spec.engine.redline) * 1.15) st.engine -= 0.01 * dt;   // over-revving downhill
      st.engine = clamp(st.engine, 0, 1);
      S.mods.power = st.engine <= 0 ? 0 : 0.35 + 0.65 * Math.min(1, st.engine * 1.4);
      if (st.engine <= 0 && !e.seized) { e.seized = true; ev('seized'); }
      S.mods.brake = 1;
      if (st.battery < 0.3) S.battery = Math.max(0, S.battery - dt * 0.001);
      // fire: a fuel leak + heat or sparks; it grows, burns, and cooks the tank
      if (st.fire <= 0 && st.fuelLeak > 0 && (e.temp > 100 || st.engine < 0.35) && rng() < dt * 0.08) startFire('leak');
      if (st.fire > 0) {
        st.fireT += dt; st.fire = Math.min(1.5, st.fire + dt * (0.03 + 0.04 * (st.fuelLeak > 0 ? 1 : 0) + 0.02 * (S.fuelL / spec.fuel.capacity)));
        st.engine = Math.max(0, st.engine - st.fire * 0.02 * dt);
        st.tyres.forEach(T => { if (st.fire > 0.6 && rng() < dt * 0.05) { T.blown = true; T.pressure = 0; } });
        st.seats.forEach((s, i) => { if (s.occupied && !s.dead && st.fire > 0.4) hitSeat(i, st.fire * 0.04 * dt, 'fire', true); });
        if (S.inWater > 0.6) { st.fire = 0; ev('fireOut'); }
        if (st.fire >= 1.4 || st.fireT > 75) wreck('fire');
      }
      if (st.engine <= 0 && st.tyres.every(T => T.pressure <= 0)) wreck('destroyed');
    },
  };
  const ev = (e, x, cool) => sim.ev ? sim.ev(e, x, cool) : null;
  function startFire(cause) { if (st.fire > 0 || st.wrecked) return; st.fire = 0.12; st.fireT = 0; ev('fire', { cause }); }
  function wreck(cause) { if (st.wrecked) return; st.wrecked = true; st.cause = cause; st.engine = 0; sim.eng.running = false; sim.eng.seized = true; ev('wrecked', { cause }); if (cause !== 'crash') st.fire = Math.max(st.fire, 0.9); }
  function hitTyre(i, K) {
    if (rng() > K.tyre) return;
    if (rng() < K.blow) D.puncture(i, 1); else D.puncture(i, 0.02 + 0.05 * rng());
  }
  function hitComp(name, dmg, K) {
    switch (name) {
      case 'engine': st.engine = Math.max(0, st.engine - dmg); ev('engineHit', { hp: st.engine });
        if (rng() < 0.35) { st.oilLeak = Math.max(st.oilLeak, 0.004 + 0.02 * rng()); ev('oilLeak'); }
        if (rng() < 0.25) { st.coolLeak = Math.max(st.coolLeak, 0.005 + 0.02 * rng()); ev('coolantLeak'); }
        if (rng() < K.fire * 0.5 && sim.eng.running) startFire('engine'); break;
      case 'radiator': st.radiator = Math.max(0, st.radiator - dmg); st.coolLeak = Math.max(st.coolLeak, 0.01 + 0.05 * dmg * (1 + rng())); ev('radiatorHit'); ev('coolantLeak'); break;
      case 'fuelTank': st.fuelTank = Math.max(0, st.fuelTank - dmg); st.fuelLeak = Math.max(st.fuelLeak, 0.03 + 0.4 * dmg * rng()); ev('fuelLeak');
        if (rng() < K.fire * (spec.fuel.type === 'diesel' ? 0.35 : 1)) startFire('tank'); break;   // diesel is hard to light with a bullet
      case 'battery': st.battery = Math.max(0, st.battery - dmg * 2); ev('batteryHit'); break;
      case 'gearbox': st.gearbox = Math.max(0, st.gearbox - dmg); if (rng() < 0.3) { st.oilLeak = Math.max(st.oilLeak, 0.002); } break;
      default: break;   // cargo etc.: the host decides
    }
  }
  function hitSeat(i, dmg, cause, quiet = false) {
    const s = st.seats[i]; if (!s || !s.occupied || s.dead) return;
    s.hp = Math.max(0, s.hp - dmg);
    if (!quiet || s.hp <= 0) ev('crewHit', { seat: s.id, dmg, cause });
    if (s.hp <= 0) { s.dead = true; ev('crewKilled', { seat: s.id, cause }); }
  }
  return D;
}
// ray helpers (model frame): returns the entry distance or null
function rayBox(p, d, b) {
  let t0 = -1e9, t1 = 1e9;
  for (let a = 0; a < 3; a++) {
    const lo = b[a], hi = b[a + 3];
    if (Math.abs(d[a]) < 1e-9) { if (p[a] < lo || p[a] > hi) return null; continue; }
    let ta = (lo - p[a]) / d[a], tb = (hi - p[a]) / d[a]; if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return null;
  }
  return t1 < 0 ? null : Math.max(0, t0);
}
function raySphere(p, d, c, r) {
  const ox = p[0] - c[0], oy = p[1] - c[1], oz = p[2] - c[2], b = ox * d[0] + oy * d[1] + oz * d[2], q = ox * ox + oy * oy + oz * oz - r * r, h = b * b - q;
  if (h < 0) return null; const t = -b - Math.sqrt(h); return t < -2 * r ? null : Math.max(0, t);
}
