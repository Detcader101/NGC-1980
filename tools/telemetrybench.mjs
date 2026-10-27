// Aircraft can crash and be removed between telemetry samples without damage first reducing their HP to zero.
import assert from 'node:assert/strict';
import { createTelemetry } from '../game/js/sim/telemetry.js';
const W = { time: 0, units: [], islands: [], proj: [], P: { mat: 0, fuel: 0 }, E: { mat: 0, fuel: 0 } };
const T = createTelemetry(W);
const unit = extra => ({ type: 'transport', side: 2, hp: 12, p: {}, ...extra });
const crashed = unit(), shot = unit(), recovered = unit(), stowed = unit(), gone = unit();
W.units.push(crashed, shot, recovered, stowed, gone); T.sample();
assert.equal(T.built[2].transport, 5);
W.time = 1; crashed.dead = crashed.dying = true; W.units.splice(W.units.indexOf(crashed), 1); T.sample();
assert.equal(T.lost[2].transport, 1); assert.equal(T.first.loss, 1);
assert.deepEqual(T.events[0], { t: 1, e: 'lost', side: 2, type: 'transport' });
W.time = 2; shot.dying = true; shot.hp = 0; T.sample();
assert.equal(T.lost[2].transport, 2);
W.time = 3; shot.dead = true; recovered.dead = recovered.recovered = true; stowed.dead = stowed.stowed = true;
T.sample(); W.units.length = 0; T.sample();
assert.equal(T.lost[2].transport, 2); assert.equal(T.events.length, 2);
assert.equal(T.minute.reduce((n, m) => n + m.lost, 0), 2);
console.log('PASS: immediate crashes counted once; damage counted once; recovery, stowage and ordinary removal excluded');

// Exercise the live air-war retirement hooks too: the pilot's successful recovery must be marked on the war unit.
const { runWar } = await import('./sim/headless.mjs');
await runWar({ seed: 1, tech: 'all', tmax: 0, hook({ W }) {
  W.P.mat = 500; W.air.sendEscort(null);
  const escort = [...W.units, ...W.air.pending].find(u => u.type === 'escort');
  W.deck.cancel(escort.deckE, 'TEST RECOVERY'); escort.deckE = null;
  escort.ai.recovered = true; escort.ai.update = () => {}; escort.recT = 3;
  const enemy = W.air.spawnShrike(); enemy.goingHome = true;
  enemy.sim.pos.set(enemy.home.x, enemy.home.y, enemy.home.z);
  const T = createTelemetry(W); T.sample();
  W.air.update(escort, 1 / 30, { alive: false }); W.air.update(enemy, 1 / 30, { alive: false });
  assert.ok(escort.dead && escort.stowed); assert.ok(enemy.dead && enemy.stowed);
  T.sample(); assert.equal(T.lost[1].escort || 0, 0); assert.equal(T.lost[2].shrike || 0, 0);
  escort.dead = false; escort.stowed = false; escort.dying = true;
  const mat = W.P.mat; W.air.update(escort, 1 / 30, { alive: false });
  assert.ok(!escort.stowed); assert.equal(W.P.mat, mat, 'a casualty cannot receive a recovery refund');
} });
console.log('PASS: live friendly and enemy air recovery is stowage, not a combat or physics loss');
