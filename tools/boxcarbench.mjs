// node tools/boxcarbench.mjs - the placeholder TEST CAR (game/js/units/placeholder/boxcar.js) against a stub ground host:
// the contract a pure wheeled / tracked sim has with the game (see docs/ngc1980/FOUNDATION.md), and a sanity check of
// the numbers (M151A2-ish; the WHEELED agent's real M151A2 replaces this car and gets a proper bench).
// World: a flat road along +x at y 0; a 0.3 m kerb at x 200, a 0.6 m wall at x 260 (|z| < 40 lanes, see below);
// a 40% ramp on the z = 100 lane; the sea (fording) on the z = 200 lane; a ship deck on the z = 400 lane.
import { createBoxCar, BOXCAR } from '../game/js/units/placeholder/boxcar.js';
import { SURF } from '../game/js/ground.js';
import { createPlatforms } from '../game/js/platform.js';

let fails = 0;
const check = (name, ok, got, want) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${got}${want ? '   (want ' + want + ')' : ''}`); if (!ok) fails++; };
const ship = { p: { x: 0, y: 0, z: 400 }, yaw: 0, L: 120, W: 28, DECK: 8 };
const toLocal = (u, x, z) => { const dx = x - u.p.x, dz = z - u.p.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
const deckY = (x, z) => { const [lx, lz] = toLocal(ship, x, z); return Math.abs(lx) < ship.W / 2 && Math.abs(lz) < ship.L / 2 ? ship.p.y + ship.DECK : -1e9; };
function terrain(x, z) {
  if (Math.abs(z) < 40) return x > 260 && x < 262 ? 0.6 : x > 200 && x < 203 ? 0.3 : 0;
  if (Math.abs(z - 100) < 40) return x > 0 ? Math.min(40, x * 0.4) : 0;
  if (Math.abs(z - 200) < 40) return -x * 0.02;   // a gentle beach into the sea
  return 0;
}
const PF = createPlatforms({ deckY, shipAt: (x, z) => deckY(x, z) > -1e8 ? ship : null });
const env = {
  G: 9.81, SURF,
  floor(x, z, y, step = 0.45, tall = 1.8) { const t = terrain(x, z), d = deckY(x, z); if (d > -1e8) { if (d <= y + step) return Math.max(d, t); if (y + tall < ship.p.y - 4) return t; return Infinity; } return t; },
  sample(x, z, o) { const d = deckY(x, z), t = terrain(x, z); if (d > -1e8) { o.h = d; o.surface = 'deck'; o.water = 0; } else { o.h = t; o.water = t < 0 ? -t : 0; o.surface = t < 0 ? 'water' : 'road'; } const S = SURF[o.surface]; o.mu = S.mu; o.crr = S.crr; o.ny = 1; return o; },
  collide() { return 0; },
  carry: o => PF.carry(o), settle: (o, on) => PF.settle(o, on),
};
const DT = 1 / 30;
const kmh = v => (v * 3.6).toFixed(1) + ' km/h';
function drive(S, secs, ctl, stop) { for (let t = 0; t < secs; t += DT) { S.step(DT, ctl, env); if (stop && stop(t)) return t; } return secs; }
// ---------------------------------------------------------------- speed, acceleration, brakes, turning
{
  const S = createBoxCar(); S.place(-2000, 0, 0, -Math.PI / 2); S.engineOn = true;
  const t50 = drive(S, 60, { drive: 1 }, () => S.v >= 50 / 3.6);
  check('0-50 km/h on a road', t50 > 4 && t50 < 9, t50.toFixed(1) + ' s', '~4-9 s INFERRED');
  S.place(-3000, 0, 0, -Math.PI / 2); S.engineOn = true; drive(S, 70, { drive: 1 }); check('top speed on a road', S.v * 3.6 > 98 && S.v * 3.6 < 110, kmh(S.v), '106 km/h CONFIRMED');
  S.place(-2000, 0, 0, -Math.PI / 2); S.engineOn = true; drive(S, 60, { drive: 1 }, () => S.v >= 50 / 3.6);
  const x0 = S.x; drive(S, 10, { drive: -1 }, () => S.v <= 0.05);
  const sd = S.x - x0, ideal = (50 / 3.6) ** 2 / (2 * SURF.road.mu * 9.81);
  check('braking from 50 km/h', Math.abs(sd - ideal) < 2.5, sd.toFixed(1) + ' m', ideal.toFixed(1) + ' m (v²/2µg)');
  S.place(0, 0, -20, 0); S.engineOn = true; drive(S, 3, { drive: 0.25 }); const ya = S.yaw, xs = [], zs = [];
  const slow = { drive: 0.3, steer: 1 }; drive(S, 25, slow, () => { slow.drive = S.v < 3 ? 0.3 : 0; xs.push(S.x); zs.push(S.z); return false; });
  const R = (Math.max(...xs) - Math.min(...xs) + Math.max(...zs) - Math.min(...zs)) / 4;
  check('turning circle radius (slow, full lock)', Math.abs(R - 5.45) < 0.8, R.toFixed(2) + ' m', '~5.5 m (35.8 ft dia, TM)');
  check('a right turn turns right', S.yawRate > 0, 'yaw rate ' + S.yawRate.toFixed(2));
  S.place(-2000, 0, 0, -Math.PI / 2); S.engineOn = true; drive(S, 15, { drive: 1 }); const vf = S.v; drive(S, 3, { drive: 1, steer: 1 });
  const lat = S.v * S.yawRate;
  check('cornering grip limit at speed', lat > 6 && lat < SURF.road.mu * 9.81 + 0.1, lat.toFixed(2) + ' m/s²', '< µg = ' + (SURF.road.mu * 9.81).toFixed(1));
}
// ---------------------------------------------------------------- kerbs, walls, slopes
{
  const S = createBoxCar(); S.place(150, 0, 0, -Math.PI / 2); S.engineOn = true;
  drive(S, 10, { drive: 0.4 }, () => S.x > 206);
  check('climbs a 0.3 m kerb', S.x > 205, `x ${S.x.toFixed(1)}`);
  drive(S, 15, { drive: 0.6 }, () => S.x > 263);
  check('stopped by a 0.6 m wall', S.x < 260.5 && S.x > 255, `x ${S.x.toFixed(1)}`);
  const ev = []; S.place(230, 0, 0, -Math.PI / 2); S.engineOn = true; S.v = 12; for (let t = 0; t < 4; t += DT) ev.push(...S.step(DT, { drive: 0 }, env));
  check('hitting it at 43 km/h is a crash', ev.some(e => e.e === 'crash' && e.v > 10), JSON.stringify(ev.find(e => e.e === 'crash')));
  S.place(-20, 0, 100, -Math.PI / 2); S.engineOn = true; drive(S, 30, { drive: 1 }, () => S.y > 15);
  check('climbs a 40% grade (M151: 60% CONFIRMED)', S.y > 15, `y ${S.y.toFixed(1)} v ${kmh(S.v)}`);
  check('pitch on the grade', Math.abs(S.pitch - Math.atan(0.4)) < 0.03, `${(S.pitch * 57.3).toFixed(1)}°`, `${(Math.atan(0.4) * 57.3).toFixed(1)}°`);
  drive(S, 2, { drive: 0 }); drive(S, 6, { drive: 0, handbrake: true }); const y1 = S.y; drive(S, 3, { drive: 0, handbrake: true });
  check('handbrake holds it on the grade', Math.abs(S.y - y1) < 0.05, `slid ${(S.y - y1).toFixed(3)} m`);
}
// ---------------------------------------------------------------- water
{
  const S = createBoxCar(); S.place(0, 0, 200, -Math.PI / 2); S.engineOn = true; const ev = [];
  for (let t = 0; t < 40 && S.water < 0.4; t += DT) ev.push(...S.step(DT, { drive: 0.7 }, env));
  check('fords 0.4 m of water', S.engineOn && !S.flooded, `water ${S.water.toFixed(2)} m`);
  for (let t = 0; t < 40 && !S.flooded; t += DT) ev.push(...S.step(DT, { drive: 1 }, env));
  check('drowns past the fording depth', S.flooded && !S.engineOn && Math.abs(S.water - BOXCAR.FORD) < 0.1, `water ${S.water.toFixed(2)} m`, `${BOXCAR.FORD} m CONFIRMED`);
  S.engineOn = false; const t = drive(S, 2, { drive: 0, engine: true });
  check('will not restart drowned', !S.engineOn, `engine ${S.engineOn}`);
}
// ---------------------------------------------------------------- a ship's deck
{
  const S = createBoxCar(); ship.p = { x: 0, y: 0, z: 400 }; ship.yaw = 0;
  S.place(5, 8, 400, 0); S.step(DT, { drive: 0, handbrake: true }, env);
  const [a0, b0] = toLocal(ship, S.x, S.z);
  for (let t = 0; t < 20; t += DT) { ship.p.x += 6 * DT; ship.p.z -= 2 * DT; ship.yaw += 0.04 * DT; ship.p.y += 1 * DT; S.step(DT, { drive: 0, handbrake: true }, env); }
  const [a1, b1] = toLocal(ship, S.x, S.z);
  check('parked on a moving, turning, rising deck', Math.hypot(a1 - a0, b1 - b0) < 0.05 && Math.abs(S.y - ship.p.y - 8) < 0.05, `slip ${Math.hypot(a1 - a0, b1 - b0).toFixed(3)} m, y-deck ${(S.y - ship.p.y - 8).toFixed(3)}`);
  S.yaw = ship.yaw; S.engineOn = true; drive(S, 4, { drive: 0.3 }, () => { ship.p.x += 6 * DT; return false; });
  const [a2, b2] = toLocal(ship, S.x, S.z);
  check('drives along the deck (relative motion)', b2 < b1 - 5 && Math.abs(a2 - a1) < 0.3 && S.plat === ship, `moved ${(b1 - b2).toFixed(1)} m forward, ${(a2 - a1).toFixed(2)} m sideways`);
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
