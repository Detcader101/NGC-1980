// node tools/footbench.mjs - the soldier movement sim (game/js/footsim.js) against a stub world:
// flat ground, a 0.4 m step, a 3 m wall, a 40-degree slope, a moving + turning + climbing ship deck, a ladder, the sea.
// Checks speeds against FM 22-5 drill cadences, jump height, falls, wading / swimming, and that a soldier standing on
// a deck stays on the same deck spot while the ship moves, turns and lifts (platform-relative motion).
import { createWalker, SOLDIER } from '../game/js/footsim.js';
import { SURF } from '../game/js/ground.js';
import { createPlatforms } from '../game/js/platform.js';

let fails = 0;
const check = (name, ok, got, want) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${got}${want ? '   (want ' + want + ')' : ''}`); if (!ok) fails++; };

// ---------------------------------------------------------------- stub world
// x < 100: land at y 0 except: a step (y 0.4) for 20 < x < 22, a wall (y 3) for 30 < x < 31 when |z| < 5,
// a 40 degree ramp for 40 < x < 50 (|z| < 5 north of it is flat), sea (bed -6) for x > 100 (beach 90..100)
const ship = { p: { x: 200, y: 0, z: 0 }, yaw: 0, v: { x: 0, z: 0 }, L: 60, Wd: 20, DECK: 8 };
const toLocal = (u, x, z) => { const dx = x - u.p.x, dz = z - u.p.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
const toWorld = (u, lx, lz) => { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [u.p.x + lx * c + lz * s, u.p.z - lx * s + lz * c]; };
function terrain(x, z) {
  if (x > 100) return -6;
  if (x > 90) return -(x - 90) * 0.6;
  if (x > 20 && x < 22) return 0.4;
  if (x > 30 && x < 31 && Math.abs(z) < 5) return 3;
  if (x > 40 && x < 50 && Math.abs(z) < 5) return (x - 40) * Math.tan(40 * Math.PI / 180);
  if (x >= 50 && x < 60 && Math.abs(z) < 5) return 10 * Math.tan(40 * Math.PI / 180);
  return 0;
}
function deckY(x, z) { const [lx, lz] = toLocal(ship, x, z); return Math.abs(lx) < ship.Wd / 2 && Math.abs(lz) < ship.L / 2 ? ship.p.y + ship.DECK : -1e9; }
const PF = createPlatforms({ deckY, shipAt: (x, z) => deckY(x, z) > -1e8 ? ship : null });
const env = {
  SURF,
  floor(x, z, y, step = 0.45, tall = 1.8) { const t = terrain(x, z), d = deckY(x, z); if (d > -1e8) { if (d <= y + step) return Math.max(d, t); if (y + tall < ship.p.y - 4) return t; return Infinity; } return t; },
  sample(x, z, o) { const d = deckY(x, z), t = terrain(x, z); if (d > -1e8) { o.h = d; o.surface = 'deck'; o.water = 0; o.ny = 1; return o; } o.h = t; o.water = t < 0 ? -t : 0; o.surface = t <= 0 && x > 90 ? 'water' : Math.abs(z - 20) < 2 ? 'road' : 'grass'; const e = 0.5, hx = terrain(x + e, z) - terrain(x - e, z), hz = terrain(x, z + e) - terrain(x, z - e); o.ny = 2 * e / Math.hypot(hx, 2 * e, hz); return o; },
  collide() { return 0; },
  ladderAt(x, z, y, r) {   // the ship's stern ladder: at local (0, +L/2), climber faces -z (toward the bow)
    const [bx, bz] = toWorld(ship, 0, ship.L / 2 + 0.3), yaw = ship.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dx = x - bx, dz = z - bz, along = dx * fz - dz * fx, off = -(dx * fx + dz * fz);
    if (Math.abs(along) < 0.6 && off > -0.2 && off < r + 0.45 && y > ship.p.y - 2.2 && y < ship.p.y + ship.DECK + 0.2) { const [tx, tz] = toWorld(ship, 0, ship.L / 2 - 0.9); return { x: bx, z: bz, fx, fz, y0: ship.p.y - 1.6, y1: ship.p.y + ship.DECK, tx, tz, name: 'STERN' }; }
    return null;
  },
  carry: o => PF.carry(o), settle: (o, on) => PF.settle(o, on),   // the game's own platform code (platform.js)
};
const DT = 1 / 30;
function run(W, secs, intent, each) { const evs = []; for (let t = 0; t < secs; t += DT) { evs.push(...W.step(DT, intent, env)); each && each(t); } return evs; }

// ---------------------------------------------------------------- speeds (FM 22-5 cadences)
{
  const W = createWalker(); W.place(-80, 0, 20, -Math.PI / 2);   // facing +x, along the road lane
  run(W, 2, { mz: 1, walk: true }); const x0 = W.x; run(W, 4, { mz: 1, walk: true });
  const v = (W.x - x0) / 4; check('walk (quick time) speed', Math.abs(v - 1.52) < 0.05, v.toFixed(2) + ' m/s', '1.52 FM 22-5');
  run(W, 2, { mz: 1 }); const x1 = W.x; run(W, 4, { mz: 1 });
  const v2 = (W.x - x1) / 4; check('run (double time) speed', Math.abs(v2 - 2.74) < 0.08, v2.toFixed(2) + ' m/s', '2.74 FM 22-5');
  W.place(-80, 0, 20, -Math.PI / 2); W.stamina = 1; run(W, 1, { mz: 1, sprint: true }); const x2 = W.x; run(W, 3, { mz: 1, sprint: true });
  const v3 = (W.x - x2) / 3; check('sprint speed (loaded rush)', Math.abs(v3 - 5.5) < 0.2, v3.toFixed(2) + ' m/s', '~5.5 INFERRED');
  W.place(0, 0, 20, -Math.PI / 2); W.stamina = 1; let t = 0; while (!W.winded && t < 40) { W.step(DT, { mz: 1, sprint: true }, env); t += DT; }
  check('sprint until winded', t > 10 && t < 16, t.toFixed(1) + ' s', '~13 s');
  W.place(0, 0, 20, -Math.PI / 2); run(W, 1.5, { mz: 1, stance: 'prone' }); const x3 = W.x; run(W, 4, { mz: 1, stance: 'prone' });
  check('prone crawl speed', Math.abs((W.x - x3) / 4 - 0.5) < 0.05, ((W.x - x3) / 4).toFixed(2) + ' m/s', '0.5');
  check('prone eye height', Math.abs(W.eye - 0.3) < 0.02, W.eye.toFixed(2) + ' m', '0.30');
  W.place(0, 0, 20, -Math.PI / 2); run(W, 1, { mz: 1 }); run(W, 1, {}); const xs = W.x; run(W, 1, {});
  check('stops when the keys are released', Math.abs(W.x - xs) < 0.01, (W.x - xs).toFixed(3) + ' m');
}
// ---------------------------------------------------------------- jump, step, wall, slope
{
  const W = createWalker(); W.place(0, 0, 20, 0); let peak = 0;
  W.step(DT, { jump: true }, env); run(W, 1.5, {}, () => { peak = Math.max(peak, W.y); });
  check('standing jump height', Math.abs(peak - 0.45) < 0.03, peak.toFixed(2) + ' m', '~0.45');
  W.place(18, 0, 0, -Math.PI / 2); run(W, 2.2, { mz: 1, walk: true });
  check('steps up a 0.4 m step', W.y > 0.39 && W.x > 20.5, `x ${W.x.toFixed(1)} y ${W.y.toFixed(2)}`);
  W.place(28, 0, 0, -Math.PI / 2); run(W, 3, { mz: 1 });
  check('stopped by a 3 m wall', W.x < 30 && W.x > 29, `x ${W.x.toFixed(2)}`);
  W.place(28, 0, 0, -Math.PI / 2); W.step(DT, { mz: 1, jump: true }, env); run(W, 3, { mz: 1 });
  check('cannot jump a 3 m wall', W.x < 30, `x ${W.x.toFixed(2)}`);
  W.place(38, 0, 0, -Math.PI / 2); run(W, 6, { mz: 1 });
  check('cannot climb a 40 degree slope', W.y < 0.6 && W.x < 41.2, `x ${W.x.toFixed(2)} y ${W.y.toFixed(2)}`);
  W.place(52, 8.39, 0, Math.PI / 2); run(W, 25, { mz: 1 });   // facing -x: walk down the slope
  check('walks down a 40 degree slope', W.y < 0.05 && W.x < 39, `x ${W.x.toFixed(1)} y ${W.y.toFixed(2)}`);
}
// ---------------------------------------------------------------- falls
{
  const W = createWalker(); W.place(0, 3, 0, 0); W.onGround = false; let ev = run(W, 2, {});
  check('3 m fall hurts', ev.some(e => e.e === 'fall' && e.v > 7 && e.v < 8.5), JSON.stringify(ev.find(e => e.e === 'land')));
  W.place(0, 1.5, 0, 0); W.onGround = false; ev = run(W, 2, {});
  check('1.5 m drop does not', !ev.some(e => e.e === 'fall'), JSON.stringify(ev.find(e => e.e === 'land')));
}
// ---------------------------------------------------------------- water: wading, swimming, out on the beach
{
  const W = createWalker(); W.place(88, 0, 30, -Math.PI / 2); let ev = []; run(W, 1.5, { mz: 1 }, () => {});
  check('wades into the shallows', W.wade > 0 && !W.swim, `x ${W.x.toFixed(1)} wade ${W.wade.toFixed(2)}`);
  ev = run(W, 6, { mz: 1 });
  check('swims in deep water', W.swim && Math.abs(W.y + SOLDIER.SWIM_D) < 0.15, `x ${W.x.toFixed(1)} y ${W.y.toFixed(2)}`);
  const x0 = W.x; run(W, 4, { mz: 1 }); const v = (W.x - x0) / 4;
  check('swimming speed', Math.abs(v - 0.9) < 0.1, v.toFixed(2) + ' m/s', '0.9');
  W.yaw = Math.PI / 2; run(W, 25, { mz: 1 });
  check('walks back out onto the beach', !W.swim && W.y >= -0.01 && W.x < 90, `x ${W.x.toFixed(1)} y ${W.y.toFixed(2)}`);
}
// ---------------------------------------------------------------- the ship: stand still on a moving, turning, climbing deck
{
  const W = createWalker(); ship.p = { x: 200, y: 0, z: 0 }; ship.yaw = 0;
  W.place(203, 8, 10, 0); W.step(DT, {}, env);
  const [lx0, lz0] = toLocal(ship, W.x, W.z);
  for (let t = 0; t < 20; t += DT) { ship.p.x += 6 * DT; ship.yaw += 0.05 * DT; ship.p.y += 1.5 * DT; W.step(DT, {}, env); }
  const [lx1, lz1] = toLocal(ship, W.x, W.z);
  check('carried by a moving, turning, rising deck', Math.hypot(lx1 - lx0, lz1 - lz0) < 0.05 && Math.abs(W.y - (ship.p.y + 8)) < 0.05 && W.onGround, `slip ${Math.hypot(lx1 - lx0, lz1 - lz0).toFixed(3)} m, y-deck ${(W.y - ship.p.y - 8).toFixed(3)}`);
  check('turns with the ship', Math.abs(W.yaw - ship.yaw) < 1e-6, `yaw ${W.yaw.toFixed(3)} ship ${ship.yaw.toFixed(3)}`);
  // walk aft along the deck at quick time while the ship steams on: speed relative to the deck
  const yawAft = ship.yaw + Math.PI; W.yaw = yawAft; run(W, 1, { mz: 1, walk: true }, () => { ship.p.x += 6 * DT; });
  const [a0, b0] = toLocal(ship, W.x, W.z); run(W, 3, { mz: 1, walk: true }, () => { ship.p.x += 6 * DT; });
  const [a1, b1] = toLocal(ship, W.x, W.z);
  check('walks at 1.52 m/s relative to the deck', Math.abs(Math.hypot(a1 - a0, b1 - b0) / 3 - 1.52) < 0.06, (Math.hypot(a1 - a0, b1 - b0) / 3).toFixed(2) + ' m/s');
  // jump on the moving deck: lands on the same deck spot
  run(W, 1, {}, () => { ship.p.x += 6 * DT; }); const [c0, d0] = toLocal(ship, W.x, W.z); W.step(DT, { jump: true }, env); run(W, 1.2, {}, () => { ship.p.x += 6 * DT; ship.yaw += 0.05 * DT; });
  const [c1, d1] = toLocal(ship, W.x, W.z);
  check('a jump on a moving deck lands on the same spot', Math.hypot(c1 - c0, d1 - d0) < 0.1 && W.onGround, `slip ${Math.hypot(c1 - c0, d1 - d0).toFixed(3)} m`);
  // walk off the side: falls 8 m into the sea, swims
  ship.p = { x: 200, y: 0, z: 0 }; ship.yaw = 0; W.place(205, 8, 0, -Math.PI / 2); W.step(DT, {}, env);
  const ev = run(W, 8, { mz: 1 });
  check('walks off the deck edge into the sea', W.swim && ev.some(e => e.e === 'splash'), `swim ${W.swim} x ${W.x.toFixed(1)}`);
  // swim round to the stern ladder and climb it
  W.place(200, -SOLDIER.SWIM_D, 33, 0); W.swim = true; W.onGround = false; W.step(DT, {}, env);
  run(W, 2, { mz: 1 });
  const onL = !!W.ladder; run(W, 10, { mz: 1 });
  check('climbs the stern ladder out of the sea onto the deck', onL && W.onGround && Math.abs(W.y - 8) < 0.05 && !!W.plat, `ladder ${onL} y ${W.y.toFixed(2)} plat ${!!W.plat}`);
  // standing on the deck under a flying ship? walk under it on land
  ship.p = { x: 30, y: 40, z: 300 }; W.place(30, 0, 340, 0); W.step(DT, {}, env); run(W, 30, { mz: 1 });
  check('walks under a flying carrier', W.z < 265 && W.y < 0.01, `z ${W.z.toFixed(1)} y ${W.y.toFixed(2)}`);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
