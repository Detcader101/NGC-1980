// Regression: crossing the underside of a sky carrier must not launch an aircraft off the map.
import assert from 'node:assert/strict';
import { createCH46Sim } from '../game/js/units/air/rotary/ch46fm.js';
import { createMV22Sim } from '../game/js/units/air/rotary/mv22fm.js';
import { createWaspSim } from '../game/js/units/air/rotary/waspfm.js';

let checks = 0;
for (const [name, make, ctl] of [
  ['CH-46', createCH46Sim, { coll: 0.5 }],
  ['MV-22', createMV22Sim, { tcl: 0.5, nac: 90 }],
  ['WASP', createWaspSim, { thr: 0.5 }],
]) for (const dt of [1 / 60, 1 / 30, 0.1]) for (const depth of [3, 20, 70]) {
  const S = make();
  S.reset([0, 60, 0], 0, false);
  const env = { groundY: () => 60 + depth, water: () => false };
  let peak = 0;
  for (let i = 0; i < 30 && !S.dead; i++) {
    S.step(dt, ctl, env);
    peak = Math.max(peak, Math.hypot(...S.body.vel));
    assert(S.body.pos.every(Number.isFinite) && S.body.vel.every(Number.isFinite), name + ' remains finite');
  }
  assert(S.dead, name + ' reports a collision');
  assert(peak < 20, name + ' contact is bounded: ' + peak);
  checks++;
}
console.log(`${checks}/${checks} deep-contact cases pass (3 aircraft, 3 frame rates, 3 deck depths)`);
