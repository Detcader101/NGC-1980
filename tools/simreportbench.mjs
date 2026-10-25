// Reporting must preserve the verdict and event metrics measured before samples are thinned.
import assert from 'node:assert/strict';
import { aggregate, renderReport, deadBranches } from './sim/report.mjs';

const rec = {
  blue: 'BALANCED', red: 'DEFAULT', tech: 'default', etech: 'default', time: 95,
  reason: 'tmax', winner: 2, decisive: false, how: 'timeout',
  leadChanges: 3, comeback: true, decisiveMoments: 2, snowball: 0.8,
  deadMinutes: 1, minutesTotal: 2, longestLull: 1,
  samples: [{ t: 0, own: [15, 1, 1], m1: 90, m2: 90, s1: 10, s2: 10 }, { t: 90, own: [14, 2, 1], m1: 50, m2: 70, s1: 40, s2: 10 }],
  built: { 1: {}, 2: {} }, lost: { 1: {}, 2: {} }, research: { 1: [], 2: [['e.reaper', 70]] },
};
const before = structuredClone(rec);
const meta = { blues: ['BALANCED'], reds: ['DEFAULT'], base: { tech: 'default', pilot: 'ai' }, tmax: 95, wall: 1, workers: 1, simSec: 95 };
const S = aggregate([rec, { ...rec, reason: 'error' }, { blue: 'BALANCED', red: 'DEFAULT', failed: true, error: 'worker died' }], meta);
assert.deepEqual(rec, before, 'aggregation does not rewrite the run');
assert.equal(S.overall.red, 1, 'the full-timeline winner survives thinning');
assert.equal(S.overall.fun.leadChanges, 3);
assert.equal(S.overall.fun.comebackRate, 1);
assert.equal(S.overall.fun.decisiveMoments, 2);
assert.equal(S.meta.failed, 2, 'both simulation and worker errors are counted');
assert.equal(S.overall.n, 1, 'errors do not enter outcome rates');
assert.deepEqual(deadBranches([{ ...rec, reason: 'error' }], meta.base, [{ id: 'e.reaper', name: 'REAPER', side: 2, tier: 1 }]), []);
const report = renderReport(S);
assert.match(report, /timeout \(runaway ahead\)/);
assert.match(report, /does not establish balance/);
assert.doesNotMatch(report, /none: no doctrine beats every opponent/);
console.log('11/11 simulation report checks pass');
