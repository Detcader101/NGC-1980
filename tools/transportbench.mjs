// Real war regression: long boarding on a turning KRAKEN, including nearby freighters' hull separation.
// The simplified deck bench did not reproduce this: every enemy transport formerly crashed before departure.
import assert from 'node:assert/strict';
import { runWar } from './sim/headless.mjs';
let first, spoolFrames = 0, maxTurn = 0, maxVelocityError = 0, previous;
const phases = new Set(), dt = 1 / 30;
const r = await runWar({ seed: 1, blue: 'BALANCED', red: 'DEFAULT', tech: 'default', tmax: 480, dt,
  onStep(W) {
    const c = W.enemyCarrier;
    if (previous) maxVelocityError = Math.max(maxVelocityError, Math.hypot((c.p.x - previous[0]) / dt - c.v.x, (c.p.z - previous[1]) / dt - c.v.z));
    previous = [c.p.x, c.p.z];
    first ||= W.units.find(u => u.type === 'transport');
    if (first) {
      phases.add(first.rot.AI.phase);
      if (first.rot.AI.phase === 'spool' && !first.dead) { spoolFrames++; maxTurn = Math.max(maxTurn, Math.abs(c.w)); }
    }
  },
});
assert.equal(r.bad, null); assert.deepEqual(r.anomalies, []);
assert.ok(spoolFrames * dt > 25 && maxTurn > 0.04, 'boarding spans a carrier turn');
assert.ok(maxVelocityError < 1e-6, 'deck velocity includes hull separation');
assert.ok(phases.has('transit') && phases.has('ground'), 'transport flies and lands');
assert.ok(first.rot.deployed, 'troopers leave the ramp');
assert.ok(r.owner.some(e => e.to === 2), 'RUNAWAY captures an island');
assert.ok(first.stowed && !first.rot.S.dead, 'first sortie returns and stows alive');
console.log(`PASS: boarding ${(spoolFrames * dt).toFixed(1)}s, turn ${maxTurn.toFixed(3)}rad/s; departure, troop landing, capture and recovery; finite war and matching deck velocity`);
