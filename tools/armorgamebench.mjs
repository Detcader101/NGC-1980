#!/usr/bin/env node
// armorgamebench.mjs - the armour's game layer in plain node (wave 2): the AI driver (armordriver.js), the island-world
// environment (armorworld.js: cached bicubic terrain, decks, platforms, surfaces, obstacles, laser) and riding a moving,
// turning deck (platform carry for a trackfm hull).   node tools/armorgamebench.mjs [--v]
// Tags: GAME = a game-behaviour requirement (no published figure applies), I = inferred.
import { createM60A3 } from '../game/js/units/armor/m60a3.js';
import { createM113 } from '../game/js/units/armor/m113.js';
import { createTrackDriver } from '../game/js/units/armor/armordriver.js';
import { createArmorWorld } from '../game/js/units/armor/armorworld.js';

const VERB = process.argv.includes('--v');
let pass = 0, fail = 0;
const check = (name, ok, got, want, tag = 'GAME') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(58)} ${String(got).padEnd(30)} want ${want}  [${tag}]`); };
const DT = 1 / 60;

// ---------------------------------------------------------------------------------------------- a stub island world
// a round island (radius 300, top 26 m) with a 12 % ramp road east, a beach to the south, trees, a house, a ship
const islandH = (x, z) => { const r = Math.hypot(x, z); return 26 * Math.max(-0.6, 1 - (r / 300) ** 2) + 2 * Math.sin(x * 0.02) * Math.cos(z * 0.017); };
const ship = { type: 'carrier', dims: { L: 120, W: 30, DECK: 12 }, p: { x: 0, y: 0, z: 900 }, yaw: 0, v: { x: 0, z: 0 }, w: 0 };
const deckY = (x, z) => { const dx = x - ship.p.x, dz = z - ship.p.z, c = Math.cos(ship.yaw), s = Math.sin(ship.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < 15 && Math.abs(lz) < 60 ? ship.p.y + 12 : -1e9; };
const trees = [{ x: 40, z: -60, y: islandH(40, -60), r: 0.9 * 0.8 }, { x: 60, z: -60, y: islandH(60, -60), r: 0.9 * 2.6 }];
const felled = [];
const AW = createArmorWorld({
  terrainH: islandH, ships: () => [ship], deckY, shipAt: (x, z) => deckY(x, z) > -1e8 ? ship : null, shipAlive: () => true,
  roadAt: (x, z) => Math.abs(z - 100) < 3 && x > 0 && x < 200 ? { surface: 'tarmac', bridge: false, y: islandH(x, z) } : null,
  pads: [{ x: 0, z: 0, r: 20 }], holes: [{ x: -150, z: 0, r: 9 }], trees,
  items: () => [{ t: 'house', x: -40, z: 120, yaw: 0.3, w: 8, d: 6, h: 6 }], structs: () => [], bounds: () => [],
  onFell: (t, dx, dz) => felled.push(t),
});

console.log('--- the environment on a stub island ---');
{
  const env = AW.env(null).prep(10, 10);
  let maxErr = 0; for (let k = 0; k < 400; k++) { const x = (Math.random() - 0.5) * 500, z = (Math.random() - 0.5) * 500; maxErr = Math.max(maxErr, Math.abs(env.height(x, z) - islandH(x, z))); }
  check('bicubic 2 m terrain within 5 cm of terrainH', maxErr < 0.05, `max ${(maxErr * 100).toFixed(1)} cm`, '< 5 cm (smooth ground)');
  // smoothness: no kinks the sim would read as an edge (second difference over 0.25 m)
  let kink = 0; for (let k = 0; k < 400; k++) { const x = (Math.random() - 0.5) * 400, z = (Math.random() - 0.5) * 400, e = 0.25; kink = Math.max(kink, Math.abs(env.height(x + e, z) + env.height(x - e, z) - 2 * env.height(x, z))); }
  check('no false edges on smooth ground', kink < 0.01, `2nd diff ${(kink * 1000).toFixed(1)} mm`, '< 10 mm (trackfm edge = 50 mm)');
  check('surfaces: pad / road / beach / hill', env.surface(5, 5) === 'paved' && env.surface(100, 100) === 'paved' && env.surface(0, 296) === 'sand' && ['grass', 'dirt', 'mud', 'rock'].includes(env.surface(150, -40)), `${env.surface(5, 5)} ${env.surface(100, 100)} ${env.surface(0, 296)} ${env.surface(150, -40)}`, 'paved paved sand natural');
  check('water: sea level over the sea bed, dry land', env.water(0, 330) === 0 && env.water(0, 0) === -Infinity, `${env.water(0, 330)} / ${env.water(0, 0)}`, '0 / -Infinity');
  const de = AW.env(null).prep(0, 900);
  check('a ship deck is the ground there (no water)', de.height(0, 900) === 12 && de.water(0, 900) === -Infinity && de.surface(0, 900) === 'paved', `${de.height(0, 900)} ${de.water(0, 900)} ${de.surface(0, 900)}`, '12 -Infinity paved');
  const ob = AW.env(null).obstacles(50, -60, 10);
  check('obstacles: trees in reach (cyl, breakable)', ob.filter(o => o.breakN).length === 2, `${ob.length} obstacles`, '2 trees');
  const oh = AW.env(null).obstacles(-40, 118, 6);
  check('obstacles: a village house as a box', oh.some(o => o.kind === 'box' && o.house), `${oh.map(o => o.kind).join(',')}`, 'box');
  const rc = AW.env(null).prep(0, 0).raycast([0, islandH(0, 0) + 3, 0], [0.995, -0.0998, 0], 2000);
  check('laser: ranges the ground', rc > 0 && rc < 400, `${rc && rc.toFixed(0)} m`, 'the hill side within 400 m');
}

// ---------------------------------------------------------------------------------------------- the AI driver
function drive(veh, pts, secs, opt = {}) {
  const V = veh === 'm113' ? createM113() : createM60A3(), env = { height: () => 0, surface: () => opt.surface || 'dirt' };
  V.reset(0, 0, opt.yaw || 0, env, { range: 'N', park: true });
  const D = createTrackDriver(V); D.follow(pts, { speed: opt.speed ?? 7, arrive: 3 });
  let t = 0, maxV = 0, thrown = false;
  for (; t < secs; t += DT) { const inp = D.update(DT); for (const e of V.step(DT, env, inp)) if (e.type === 'thrown') thrown = true; maxV = Math.max(maxV, Math.abs(V.fm.out.fwd)); if (D.state === 'arrived' && Math.abs(V.fm.out.fwd) < 0.1) break; }
  const o = V.fm.origin(), last = pts[pts.length - 1];
  return { t, D, V, miss: Math.hypot(o[0] - last[0], o[2] - last[1]), maxV, thrown };
}
console.log('--- the AI driver ---');
for (const veh of ['m60', 'm113']) {
  const N = veh === 'm60' ? 'M60A3' : 'M113A2';
  let r = drive(veh, [[0, -200]], 90);
  check(`${N}: drives 200 m ahead and stops`, r.D.state === 'arrived' && r.miss < 4, `${r.miss.toFixed(1)} m off, ${r.t.toFixed(0)} s, ${(r.maxV * 3.6).toFixed(0)} km/h`, '< 4 m, arrived');
  r = drive(veh, [[120, 30]], 90);
  check(`${N}: turns to a target behind-right`, r.D.state === 'arrived' && r.miss < 4 && !r.thrown, `${r.miss.toFixed(1)} m off, ${r.t.toFixed(0)} s`, '< 4 m, no thrown track');
  r = drive(veh, [[0, -60], [60, -60], [60, 0], [0, 0]], 160, { speed: 6 });
  check(`${N}: a 60 m square route`, r.D.state === 'arrived' && r.miss < 4 && !r.thrown, `${r.miss.toFixed(1)} m off, ${r.t.toFixed(0)} s`, '< 4 m back at the start');
  if (VERB) console.log(r.D);
}
{   // stuck: a wall ahead -> backs off, retries, gives up
  const V = createM60A3(), env = { height: () => 0, surface: () => 'dirt', obstacles: () => [{ kind: 'box', x: 0, z: -12, hx: 20, hz: 1, yaw: 0, top: 4, id: 'wall' }] };
  V.reset(0, 0, 0, env, { range: 'N' }); const D = createTrackDriver(V); D.goTo(0, -60, { speed: 4 });
  for (let t = 0; t < 60 && D.state !== 'stuck'; t += DT) V.step(DT, env, D.update(DT));
  check('M60A3: blocked by a wall: backs off, retries, gives up', D.state === 'stuck' && D.tries > 3, `${D.state}, ${D.tries} tries`, "'stuck' after 3 retries");
}

// ---------------------------------------------------------------------------------------------- riding a moving deck
console.log('--- riding a moving, turning deck (platform carry) ---');
for (const veh of ['m60', 'm113']) {
  const N = veh === 'm60' ? 'M60A3' : 'M113A2';
  ship.p.x = 0; ship.p.z = 900; ship.yaw = 0;
  const V = veh === 'm113' ? createM113() : createM60A3(), env = AW.env(null), st = {};
  env.prep(5, 890); V.reset(5, 890, 0.4, env, { range: 'N', park: true });
  for (let t = 0; t < 1; t += DT) { env.prep(5, 890); AW.carry(V.fm, st); V.step(DT, env, { park: true }); AW.settle(V.fm, st); }
  const loc0 = st.loc ? [st.loc.x, st.loc.z] : null, yaw0 = V.fm.out.heading - ship.yaw;
  // the ship sails at 6 m/s and turns at 1.5 deg/s for 30 s
  for (let t = 0; t < 30; t += DT) {
    ship.yaw += 0.026 * DT; ship.p.x += -Math.sin(ship.yaw) * 6 * DT; ship.p.z += -Math.cos(ship.yaw) * 6 * DT;
    const o = V.fm.origin(); env.prep(o[0], o[2]); AW.carry(V.fm, st); V.step(DT, env, { park: true }); AW.settle(V.fm, st);
  }
  const loc1 = st.loc ? [st.loc.x, st.loc.z] : null, slip = loc0 && loc1 ? Math.hypot(loc1[0] - loc0[0], loc1[1] - loc0[1]) : 99, dyaw = Math.abs(V.fm.out.heading - ship.yaw - yaw0);
  check(`${N}: parked on a deck that sails and turns 45 deg`, st.plat === ship && slip < 0.1 && dyaw < 0.01, `slip ${(slip * 100).toFixed(1)} cm, heading ${(dyaw * 57.3).toFixed(2)} deg`, '< 10 cm, < 0.6 deg, still aboard');
  // drive 20 m forward along the deck while she turns
  const D = createTrackDriver(V); const lz0 = st.loc.z;
  const goal = (() => { const c = Math.cos(ship.yaw), s = Math.sin(ship.yaw), lx = st.loc.x, lz = st.loc.z - 25; return [ship.p.x + lx * c + lz * s, ship.p.z - lx * s + lz * c]; })();
  let dz = 0;
  for (let t = 0; t < 14; t += DT) {
    ship.yaw += 0.026 * DT; ship.p.x += -Math.sin(ship.yaw) * 6 * DT; ship.p.z += -Math.cos(ship.yaw) * 6 * DT;
    const o = V.fm.origin(); env.prep(o[0], o[2]); AW.carry(V.fm, st);
    const inp = t < 8 ? { throttle: 0.5, range: veh === 'm60' ? 'L' : '1-2', park: false, steer: 0 } : { throttle: 0, brake: 1, park: false, range: 'N' };
    V.step(DT, env, inp); AW.settle(V.fm, st); dz = lz0 - (st.loc ? st.loc.z : lz0);
  }
  check(`${N}: drives along the deck under way (relative to it)`, st.plat === ship && dz > 5 && dz < 40 && Math.abs(V.fm.out.fwd) < 1, `${dz.toFixed(1)} m forward on deck, ${(V.fm.out.fwd * 3.6).toFixed(1)} km/h rel`, '5-40 m, stopped, aboard');
}

{   // knockdown: the M60 pushes over the small tree, not the big one
  const V = createM60A3(), env = AW.env(null), ev = [];
  const sx = 40, sz = -30; env.prep(sx, sz); V.reset(sx, sz, 0, env, { range: 'N' });
  const D = createTrackDriver(V); D.goTo(40, -90, { speed: 3 });
  for (let t = 0; t < 40 && D.state === 'driving'; t += DT) { env.prep(...[V.fm.origin()[0], V.fm.origin()[2]]); for (const e of V.step(DT, env, D.update(DT))) if (e.type === 'knockdown') { ev.push(e.id); AW.fell(e.id, 0, -1); } }
  check('M60A3 pushes over a small tree (event, host lays it down)', ev.includes('tree0') && felled.length === 1, `${ev.join(',') || 'none'}`, 'tree0 knocked down');
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
