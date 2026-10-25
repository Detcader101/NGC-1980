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
