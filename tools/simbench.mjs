#!/usr/bin/env node
// simbench.mjs - SIM MODE checks: the headless war is deterministic per seed, the CPU commanders play the game (the
// TASK FORCE takes islands, both sides spend, research happens under the tech tree), nothing goes NaN, the RUNAWAY
// doctrine copy replays war.js's own commander, the baked ground matches the exact one, and how fast it runs.
//   node tools/simbench.mjs          (about 3 minutes on 3 threads)
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const { loadGrid, zone } = await import('./sim/headless.mjs');
const { doctrine, tweak } = await import('../game/js/sim/doctrine.js');

let pass = 0, fail = 0;
const check = (ok, name, info = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -  ' + info : ''}`); };
const grid = await loadGrid();
// a war in a fresh worker thread (as warsim runs them)
function war(cfg) {
  return new Promise((res, rej) => {
    const w = new Worker(path.join(TOOLS, 'sim', 'worker.mjs'), { workerData: { grid: grid.buffer } });
    w.on('message', m => { if (m.ready) w.postMessage({ id: 0, cfg, keep: true }); else { w.postMessage('exit'); m.error ? rej(new Error(m.error)) : res(m.rec); } });
    w.on('error', rej);
  });
}
const hash = (r, dec = true) => crypto.createHash('sha1').update(JSON.stringify({ s: r.samples, d: dec ? r.decisions : r.decisions.filter(x => x.side === 1), b: r.built, l: r.lost, n: r.rngCalls, t: r.time })).digest('hex').slice(0, 12);
const base = { tmax: 420, patch: ['catlane'] };

// 1. determinism, and the RUNAWAY doctrine copy vs war.js's own commander, all at once on 3 threads
const red = doctrine(2, 'DEFAULT'), copy = { ...red, builtin: false, name: 'DEFAULT-COPY' };
const [a, b, c, d, e] = await Promise.all([
  war({ ...base, blue: 'BALANCED', red: 'DEFAULT', seed: 21 }),
  war({ ...base, blue: 'BALANCED', red: 'DEFAULT', seed: 21 }),
  war({ ...base, blue: 'BALANCED', red: 'DEFAULT', seed: 22 }),
]).then(async r => [...r, ...await Promise.all([war({ ...base, blue: 'BALANCED', red: copy, seed: 21 }), war({ ...base, tmax: 1200, blue: 'BALANCED', red: 'DEFAULT', seed: 21, tech: 'default' })])]);
check(hash(a) === hash(b), 'same seed, same war (two fresh threads)', `${hash(a)} / ${hash(b)}, ${a.rngCalls} dice`);
check(hash(a) !== hash(c), 'another seed, another war', `${hash(c)}`);
check(hash(d, false) === hash(a, false), 'the RUNAWAY doctrine copy at DEFAULT knobs replays war.js think() exactly', `${hash(d, false)} / ${hash(a, false)} (the war, less the copy's own decision log)`);
check(!a.bad && !a.anomalies.length && !c.bad, 'no NaN, no runaway units, no errors', JSON.stringify([a.bad, a.anomalies, c.bad]));
check((a.decisions.filter(x => x.side === 1).length > 5) && a.spent[1].drone > 0, 'the TASK FORCE commander gives orders and spends', `${a.decisions.filter(x => x.side === 1).length} orders, ${a.spent[1].drone} on Sea Knights, ${a.spent[1].aa} on guns`);
check((a.built[2].transport || 0) + (a.built[2].gunship || 0) > 0, 'the RUNAWAY commander builds', JSON.stringify(a.built[2]));
{ const rs = s => e.decisions.filter(x => x.side === s && /RESEARCH/.test(x.what)).map(x => x.what.slice(9)); check(rs(1).length > 0, 'under tech=default the TASK FORCE researches (the RUNAWAY count is a balance number, see SIMREPORT)', `TF ${rs(1).join(', ') || '-'}  RW ${rs(2).join(', ') || '-'}`); }
{ const cap = (e.research[1].find(x => x[0] === 'p.cap') || [0, 1e9])[1], first = (e.decisions.find(x => x.side === 1 && /TOMCAT/.test(x.what)) || { t: 1e9 }).t; check(first >= cap - 2 && !(e.built[2].shrike && !e.research[2].some(x => x[0] === 'e.shrike')), 'tech=default: Tomcats only after FLEET AIR DEFENCE, no SHRIKEs without their research', `first Tomcat ${first < 1e9 ? Math.round(first) + ' s' : 'never'}, research done ${cap < 1e9 ? cap + ' s' : 'never'}`); }

// 2. a longer war: the TASK FORCE takes islands, the war moves, the speed
const t0 = performance.now();
const L = await war({ tmax: 1200, patch: ['catlane'], blue: 'BALANCED', red: 'DEFAULT', seed: 4 });
const w = (performance.now() - t0) / 1000, own0 = L.samples[0].own[1], own1 = Math.max(...L.samples.map(s => s.own[1]));
check(own1 > own0, 'the TASK FORCE CPU takes islands', `${own0} -> ${own1} at best, ${L.owner.filter(o => o.to === 1).length} captures`);
check(L.first.shot !== null && L.first.shot < 300, 'first contact inside 5 minutes', `${(L.first.shot / 60).toFixed(1)} min`);
check(L.samples.every(s => Number.isFinite(s.s1 + s.s2 + s.m1 + s.m2)), 'every sample finite');
const perHour = w / (L.time / 3600);
check(perHour < 600, 'speed: a simulated hour in under 10 real minutes on one thread', `${L.speed} sim-min/s, ${(perHour / 60).toFixed(1)} real min per simulated hour (${Math.round(L.time / 60)} min war in ${w.toFixed(0)} s)`);

// 3. the baked ground table vs the exact ground function (main.js's terrain)
{
  const Z = zone(grid); let worst = 0, n = 0, sum = 0;
  for (let i = 0; i < 20000; i++) { const x = (i * 7919 % 1700) - 850 + (i % 13) * 0.37, z = (i * 104729 % 1700) - 850 + (i % 7) * 0.53, dE = Math.abs(Z.terrainH(x, z) - Z.exact(x, z)); worst = Math.max(worst, dE); sum += dE; n++; }
  check(sum / n < 0.05, 'baked ground within 5 cm of the exact ground on average', `mean ${(sum / n * 100).toFixed(1)} cm, worst ${(worst * 100).toFixed(0)} cm (cliff edges)`);
}
console.log(`\n${pass}/${pass + fail} checks pass`);
process.exit(fail ? 1 : 0);
