// Exercise the live commander as well as the doctrine copy against small budgets.
import assert from 'node:assert/strict';
import { runWar } from './sim/headless.mjs';
import { createTech, aiPickResearch } from '../game/js/techtree.js';

let checks = 0;
const pl = { alive: false, inCave: false, landed: false, pos: { x: 0, y: -1000, z: 0 }, kind: 'none' };
await runWar({ seed: 9, tech: 'all', tmax: 0, hook({ W }) {
  const update = W.update;
  const prepare = () => {
    W.reset(); W.time = 1000; W.transT = 1e6; W.raidT = 0; W.thinkT = 0;
    W.E.mat = 36; W.allow = (_, key) => key === 'gunship';
    W.researchPolicy = [null, null, null];
  };
  // DEFAULT and its copy use the actual game's purchase/spawn functions.
  for (const builtin of [true, false]) {
    prepare(); W.redAI.builtin = builtin;
    update(0, pl, false);
    const raiders = W.units.filter(u => u.type === 'gunship' && u.raid);
    assert.equal(raiders.length, 3, 'a 36-materiel raid buys three WASPs');
    assert.equal(W.E.mat, 0, 'raid cannot overspend'); checks++;
  }
  prepare(); W.allow = (_, key) => key === 'shahed';
  W.E.mat = 24; W.time = 1600; W.air.shahedT = 0;
  W.air.spot = { t: W.time, ship: W.carrier };
  W.air.think(pl);
  assert.equal(W.air.pending.filter(u => u.type === 'shahed').length, 4);
  assert.equal(W.E.mat, 0, 'late-war salvo is capped by its budget'); checks++;

  prepare(); W.tech[2] = createTech(2); W.researchPolicy[2] = aiPickResearch;
  W.E.mat = 50; W.researchTick(2, pl);
  assert(W.researchHold[2] > 50 && W.spendable(2) === 0, 'next programme protected from unit spending'); checks++;
  W.E.mat = W.researchHold[2]; W.researchTick(2, pl);
  assert(W.tech[2].current && W.researchHold[2] === 0, 'funded research starts and releases the military reserve'); checks++;
  W.reset(); assert.equal(W.researchHold[2], 0, 'new war clears reserved budgets'); checks++;
} });
console.log(`${checks}/${checks} live economy checks pass`);
