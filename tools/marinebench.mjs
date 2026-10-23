// node tools/marinebench.mjs - the 1980 Marine as the game drives him (game/js/marinesim.js: INFANTRY's rifleman + MEDINV's
// medical and inventory + FOUNDATION's walker) against a stub world: flat ground, a wall, a ship that sails, turns,
// heaves, pitches and rolls, a target. Checks movement against FM 22-5, that the deck carries him exactly in a seaway,
// that the magazines he fires and reloads are the inventory's, wounds -> bleeding -> death, treatment, resupply.
import { createMarineSim, STEP } from '../game/js/marinesim.js';
import { SURF } from '../game/js/ground.js';
import { createPlatforms } from '../game/js/platform.js';
import { shipPointY } from '../game/js/units/naval/seamotion.js';
import * as I from '../game/js/units/infantry/inventory.js';

let fails = 0;
const check = (name, ok, got, want) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(52)} ${got}${want ? '   (want ' + want + ')' : ''}`); if (!ok) fails++; };

// ---------------------------------------------------------------- stub world
const ship = { p: { x: 300, y: 0, z: 0 }, yaw: 0, v: { x: 0, y: 0, z: 0 }, att: { heave: 0, pitch: 0, roll: 0 }, L: 120, Wd: 28, DECK: 8, type: 'carrier', side: 1 };
const PF = createPlatforms({ deckY, shipAt: (x, z) => deckY(x, z) > -1e8 ? ship : null });
const terrain = (x, z) => (x > 30 && x < 31 && Math.abs(z) < 5 ? 3 : x > 150 ? -20 : 0);
function deckY(x, z) { const [lx, lz] = PF.toLocal(ship, x, z); if (Math.abs(lx) > ship.Wd / 2 || Math.abs(lz) > ship.L / 2) return -1e9; const a = ship.att; return shipPointY(ship.p.y, a.heave, a.pitch, a.roll, lx, ship.DECK, lz); }
const GR = {
  SURF,
  floor(x, z, y, step = 0.45, tall = 1.8) { const t = terrain(x, z), d = deckY(x, z); if (d > -1e8) { if (d <= y + step) return Math.max(d, t); if (y + tall < ship.p.y - 4) return t; return Infinity; } return t > y + step ? Infinity : t; },
  sample(x, z, o) { const d = deckY(x, z), t = terrain(x, z); if (d > -1e8) { o.h = d; o.surface = 'deck'; o.water = 0; o.ny = 1; return o; } o.h = t; o.water = t < 0 ? -t : 0; o.surface = t < 0 ? 'water' : 'grass'; o.ny = 1; return o; },
  collide() { return 0; }, ladderAt() { return null; },
  carry: o => PF.carry(o), settle: (o, on) => PF.settle(o, on),
};
const idle = () => ({ move: [0, 0], look: [0, 0], actions: [] });
function run(MS, secs, input = idle, each) { for (let t = 0; t < secs; t += 1 / 30) { each && each(t); MS.step(1 / 30, typeof input === 'function' ? input(t) : input, GR); } }
const seaway = t => { ship.att.heave = 0.35 * Math.sin(t * 0.8); ship.att.pitch = 0.012 * Math.sin(t * 0.9 + 1); ship.att.roll = 0.03 * Math.sin(t * 0.33); };

// ---------------------------------------------------------------- movement
{
  const MS = createMarineSim({ seed: 1, swayScale: 0 });
  MS.place(-60, 0, 20, -Math.PI / 2);
  check('load from the inventory (rifleman, fighting kit)', MS.S.load > 18 && MS.S.load < 34, MS.S.load.toFixed(1) + ' kg', 'MEDINV rifleman ~20-30');
  run(MS, 3, () => ({ ...idle(), move: [0, 1], walk: true })); const x0 = MS.W.x; run(MS, 4, () => ({ ...idle(), move: [0, 1], walk: true }));
  const vw = (MS.W.x - x0) / 4; check('walk (quick time)', Math.abs(vw - 1.52) < 0.08, vw.toFixed(2) + ' m/s', '1.52 FM 22-5');
  run(MS, 3, () => ({ ...idle(), move: [0, 1] })); const x1 = MS.W.x; run(MS, 4, () => ({ ...idle(), move: [0, 1] }));
  const vr = (MS.W.x - x1) / 4; check('run (double time, loaded)', vr > 2.4 && vr < 2.8, vr.toFixed(2) + ' m/s', '2.74 FM 22-5, less with load');
  MS.place(20, 0, 0, -Math.PI / 2); run(MS, 8, () => ({ ...idle(), move: [0, 1] }));
  check('a wall stops him (walker resolves the soldier)', MS.W.x <= 30.01 && MS.W.x > 28.5 && Math.abs(MS.S.vel.x) < 0.5, 'x ' + MS.W.x.toFixed(2) + ' v ' + MS.S.vel.x.toFixed(2));
  MS.place(0, 0, 0, 0); run(MS, 0.03, () => ({ ...idle(), stance: 'prone' })); run(MS, 3);
  check('prone (soldier.js stance, walker height)', MS.S.stance === 'prone' && MS.W.stance === 'prone' && MS.S.eye.y - MS.W.y < 0.5, MS.S.stance + ' eye ' + (MS.S.eye.y - MS.W.y).toFixed(2));
}
// ---------------------------------------------------------------- the deck in a seaway
{
  const MS = createMarineSim({ seed: 2, swayScale: 0 });
  ship.p.x = 300; ship.p.z = 0; ship.yaw = 0; ship.p.y = 0;
  MS.place(300 + 6, deckY(306, 20), 20, 0); run(MS, 0.5);
  const l0 = PF.toShip(ship, MS.W.x, MS.W.y, MS.W.z, {}); let worst = 0, T = 0;
  for (let k = 0; k < 600; k++) {   // the ship moves (war.update), then he steps: measured after each frame
    T += 1 / 30; seaway(T); ship.p.x += -Math.sin(ship.yaw) * 5 / 30; ship.p.z += -Math.cos(ship.yaw) * 5 / 30; ship.yaw += 0.02 / 30; ship.p.y += 0.3 / 30;
    MS.step(1 / 30, idle(), GR);
    const l = PF.toShip(ship, MS.W.x, MS.W.y, MS.W.z, {}); worst = Math.max(worst, Math.hypot(l.x - l0.x, l.z - l0.z));
  }
  check('stands still on a deck that sails, turns, climbs, heaves, pitches, rolls', worst < 0.05 && MS.W.plat === ship && MS.W.onGround, 'slip ' + worst.toFixed(3) + ' m');
  const l1 = PF.toShip(ship, MS.W.x, MS.W.y, MS.W.z, {});
  check('...and his feet stay on the deck (ship frame y)', Math.abs(l1.y - 8) < 0.06, 'y ' + l1.y.toFixed(3));
  const yaw0 = MS.S.yaw - ship.yaw;
  check('his heading turns with the ship', Math.abs(yaw0) < 0.01, (yaw0 * 57.3).toFixed(2) + ' deg rel');
  const a = PF.toShip(ship, MS.W.x, MS.W.y, MS.W.z, {}); MS.S.yaw = ship.yaw;
  run(MS, 6, () => ({ ...idle(), move: [0, 1], walk: true }), t => { T += 1 / 30; seaway(T); ship.p.z -= 5 / 30; });
  const b = PF.toShip(ship, MS.W.x, MS.W.y, MS.W.z, {});
  check('walks forward along the rolling deck (ship frame)', a.z - b.z > 7 && Math.abs(b.x - a.x) < 0.4, `fwd ${(a.z - b.z).toFixed(2)} m, drift ${(b.x - a.x).toFixed(2)} m`);
}
// ---------------------------------------------------------------- weapons <-> inventory
{
  const MS = createMarineSim({ seed: 3, swayScale: 0 });
  MS.place(0, 0, 0, 0); const R = MS.R, rifleItem = MS.inv.slots.primary;
  check('the M16 holds the inventory rifle\'s magazine', R.cur.key === 'M16A1' && R.cur.mag && R.cur.mag.inst === rifleItem.slots.mag, R.cur.key + ' ' + R.cur.rounds + ' rds');
  const n0 = I.magCount(rifleItem.slots.mag); let shots = 0;
  run(MS, 3, t => ({ ...idle(), fire: Math.floor(t * 4) % 2 === 0 }), () => {}); for (const e of []) shots++;
  const n1 = I.magCount(rifleItem.slots.mag);
  check('rounds fired come out of the inventory magazine', n1 < n0, `${n0} -> ${n1}`);
  const pouch0 = I.countRounds(MS.inv, '556');
  const old = rifleItem.slots.mag;
  run(MS, 0.1, { ...idle(), actions: ['reload'] }); run(MS, 6);
  const nowMag = rifleItem.slots.mag;
  check('tactical reload: a pouch magazine seated in the rifle item', nowMag && nowMag !== old && R.cur.mag.inst === nowMag && I.magCount(nowMag) >= 18, `${I.magCount(nowMag)} rds in`);
  check('...and the old magazine back in a pouch', !!I.parentOf(old) && I.isWithin(old, MS.inv) && !I.isWithin(old, rifleItem), I.parentOf(old) ? 'stowed in ' + I.parentOf(old).c.id : 'lost');
  check('rounds carried are conserved over the reload', I.countRounds(MS.inv, '556') === pouch0, `${pouch0} -> ${I.countRounds(MS.inv, '556')}`);
  // the gear screen: drag a different magazine onto the rifle -> the gun takes it
  const other = I.findAll(MS.inv, (o, d) => d.mag?.cal === '556' && !I.isWithin(o, rifleItem))[0];
  I.detach(rifleItem.slots.mag); I.autoStore(MS.inv, nowMag); I.detach(other); I.slotIn(rifleItem, 'mag', other); run(MS, 0.1);
  check('a magazine put in the rifle on the gear screen feeds the gun', R.cur.mag && R.cur.mag.inst === other, R.cur.mag ? 'ok' : 'none');
  // speed reload with an empty gun until the pouches run dry
  let reloads = 0; for (let k = 0; k < 12; k++) { run(MS, 6, t => ({ ...idle(), fire: Math.round(t * 30) % 4 < 2 })); run(MS, 0.05, { ...idle(), actions: ['reloadSpeed'] }); run(MS, 3); reloads++; }
  const magRounds = I.findAll(MS.inv, (o, d) => d.mag?.cal === '556').reduce((s, m) => s + I.magCount(m), 0);
  check('fired dry: every magazine empty (the bandolier is loose rounds)', magRounds === 0 && R.cur.rounds === 0, magRounds + ' rds in magazines, ' + I.countRounds(MS.inv, '556') + ' loose');
  const got = MS.resupply(); run(MS, 0.1);
  check('resupply at a pad refills the rig', I.countRounds(MS.inv, '556') >= 120 && got.length > 0, I.countRounds(MS.inv, '556') + ' rds; ' + got.join(', '));
  // the LAW: extend, arm, fire -> the tube leaves the inventory
  const lawI = R.slots.findIndex(w => w.key === 'M72A2');
  run(MS, 0.05, { ...idle(), actions: ['slot' + (lawI + 1)] }); run(MS, 2.5);
  run(MS, 0.05, { ...idle(), actions: ['law'] }); run(MS, 3); run(MS, 0.05, { ...idle(), actions: ['law'] }); run(MS, 3);
  run(MS, 2, { ...idle(), ads: true }); run(MS, 0.5, { ...idle(), ads: true, fire: true }); run(MS, 3);
  check('fired LAW: tube discarded, gone from the gear', !MS.inv.slots.secondary && !R.slots.some(w => w.key === 'M72A2'), MS.inv.slots.secondary ? 'still slung' : 'gone');
}
// ---------------------------------------------------------------- hits: rifle rounds register on a target
{
  const MS = createMarineSim({ seed: 4, swayScale: 0 });
  let hits = 0;
  MS.raycast = (x0, y0, z0, x1, y1, z1) => {   // a 1 m steel plate 100 m ahead (z = -100), and the ground
    if (z0 > -100 && z1 <= -100) { const t = (z0 + 100) / (z0 - z1), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (Math.abs(x) < 0.5 && y > 0.8 && y < 1.8) { hits++; return { t, x, y, z: -100, nx: 0, ny: 0, nz: 1, material: 'steel', thickness: 10 }; } }
    if (y1 < 0) { const t = y0 / (y0 - y1); return { t, x: x0 + (x1 - x0) * t, y: 0, z: z0 + (z1 - z0) * t, nx: 0, ny: 1, nz: 0, material: 'soil', thickness: 1e9 }; }
    return null;
  };
  MS.place(0, 0, 0, 0); run(MS, 1, { ...idle(), ads: true });
  let impacts = 0, shots = 0; for (let k = 0; k < 150; k++) { MS.S.pitch = 0; MS.step(1 / 30, { ...idle(), ads: true, fire: k % 30 < 2 }, GR); for (const e of MS.events) { if (e.e === 'impact') impacts++; if (e.e === 'shot') shots++; } }
  console.log('   shots', shots, 'impacts', impacts, 'aim', MS.S.aimPitch.toFixed(4), MS.S.aimYaw.toFixed(4), 'eye', MS.S.eye.y.toFixed(2));
  run(MS, 1, { ...idle(), ads: true }, () => {});
  check('aimed rounds hit a plate at 100 m (host raycast)', hits >= 3, hits + ' hits');
}
// ---------------------------------------------------------------- wounds, bleeding, treatment, death
{
  const MS = createMarineSim({ seed: 5 });
  MS.place(0, 0, 0, 0);
  const r = MS.hit({ round: 'M193', velocity: 900, part: 'legL', zone: 'thigh', dir: [0, 0, 1], kind: 'bullet', source: 'TEST' });
  check('a rifle round to the thigh: wound + bleed', r && r.hp > 0, `${r.region}/${r.zone} ${r.hp} HP bleed ${r.bleed}`);
  // force the worst case: a femoral bleed
  MS.M.bleeds.length = 0; MS.M.regions.legL.hp = 40;
  const fem = { id: 99, region: 'legL', zone: 'thigh', type: 'arterial', rate: 500, ctl: 'tq', name: 'FEMORAL', clot: 0, ctrl: 1, t: 0, dressed: false, packed: false, stopped: false }; MS.M.bleeds.push(fem);
  let t = 0; while (!MS.dead && t < 900) { MS.step(0.25, idle(), GR); t += 0.25; }
  check('untreated femoral bleed: he bleeds out (game life ends)', MS.dead && t > 120 && t < 600, `${MS.cause} at ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, '~6 min (MEDINV bench)');
  const MS2 = createMarineSim({ seed: 6 }); MS2.place(0, 0, 0, 0);
  MS2.M.bleeds.push({ ...fem }); MS2.M.regions.legL.hp = 40;
  run(MS2, 10);
  const cravat = I.find(MS2.inv, o => o.id === 'cravat');
  const tr = MS2.M.startTreatment({ item: cravat, region: 'legL', by: { self: true, skill: 'rifleman' } });
  let tt = 0; while (MS2.M.action && tt < 120) { MS2.step(0.25, idle(), GR); tt += 0.25; }
  const flow = MS2.M.bleedRate();
  check('cravat windlass tourniquet from the kit on the femoral bleed', tr.ok && MS2.M.regions.legL.tq.length > 0, `${tr.label || tr.reason} in ${tt.toFixed(1)} s, flow now ${flow.toFixed(0)} ml/min`);
  check('a leg wound slows him (MEDINV mods -> soldier.js)', MS2.mods.legL > 0.2, 'legL ' + MS2.mods.legL.toFixed(2));
}
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
