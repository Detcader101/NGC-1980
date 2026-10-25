#!/usr/bin/env node
// warsim.mjs - SIM MODE: CPU vs CPU island wars in node, many seeds, to see what wins and whether it is fun.
// The whole game runs (war.js and the rotary / air / ground / defence / naval modules), no browser; both sides are
// CPU commanders under a doctrine (game/js/sim/doctrine.js). Runs are deterministic per seed and spread over worker
// threads. Output: tools/runs/sim/<stamp>-<name>/ runs.jsonl (every war), summary.json, report.md (the tables).
//
//   node tools/warsim.mjs --blue RUSH --red DEFAULT --seeds 50 --tmax 3600 --tech default
//   node tools/warsim.mjs --tournament --seeds 12                      every TASK FORCE doctrine vs every RUNAWAY one
//   node tools/warsim.mjs --blue BALANCED --red DEFAULT --sweep COST.drone=30,40,50,60 --seeds 16
//   node tools/warsim.mjs --sweep blue.aggression=0.5,1,1.5             (a doctrine knob; red.<knob> for the RUNAWAY)
//   node tools/warsim.mjs --list                                       doctrines and sweepable tunables
// Options: --seed0 N (first seed, 1)  --workers N (3: the machine is shared)  --dt S (1/30)  --tech all|default|max|ids
//   --etech (the RUNAWAY's start, else --tech)  --pilot ai|none (the AI Hornet strike wing)  --patch catlane
//   --name NAME  --exact (the exact ground function, no baked table)  --keep (full samples in runs.jsonl)
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const { BLUE, RED } = await import('../game/js/sim/doctrine.js');
const { aggregate, renderReport, deadBranches } = await import('./sim/report.mjs');
const { TECH } = await import('../game/js/techtree.js');

const A = parseArgs(process.argv.slice(2));
if (A.list) {
  const { listTunables } = await import('./sim/headless.mjs');
  console.log('TASK FORCE doctrines:'); for (const d of Object.values(BLUE)) console.log(`  ${d.name.padEnd(12)} ${d.desc}`);
  console.log('RUNAWAY doctrines:'); for (const d of Object.values(RED)) console.log(`  ${d.name.padEnd(12)} ${d.desc}`);
  console.log('sweepable tunables:'); const walk = (o, p) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') walk(v, p + k + '.'); else console.log(`  ${p}${k} = ${v}`); } }; walk(listTunables(), '');
  console.log('doctrine knobs: blue.<knob> / red.<knob>  (aggression, expansion, defence, reserve, risk, mix.air, mix.ground, mix.naval, strikeEvery, escorts, sky)');
  process.exit(0);
}
const blues = A.tournament && !A.blue ? Object.keys(BLUE) : (A.blue || 'BALANCED').split(',');
const reds = A.tournament && !A.red ? Object.keys(RED) : (A.red || 'DEFAULT').split(',');
const seeds = +(A.seeds || 10), seed0 = +(A.seed0 || 1), tmax = +(A.tmax || 3600), workers = Math.max(1, Math.min(+(A.workers || 3), os.cpus().length));
let sweep = null;
if (A.sweep) { const [k, vs] = A.sweep.split('='); sweep = { key: k, values: vs.split(',').map(Number) }; }
const parseTech = t => !t ? undefined : ['all', 'default', 'max', 'none'].includes(t) ? t : t.split(',');
const base = { tmax, dt: A.dt ? +A.dt : 1 / 30, tech: parseTech(A.tech) ?? 'all', etech: parseTech(A.etech), pilot: A.pilot || 'ai', patch: A.patch ? A.patch.split(',') : [], exact: !!A.exact };
const jobs = [];
for (const b of blues) for (const r of reds) for (const sv of sweep ? sweep.values : [null]) for (let s = 0; s < seeds; s++) {
  const cfg = { ...base, blue: b, red: r, seed: seed0 + s };
  if (sv !== null) {
    if (sweep.key.startsWith('blue.')) cfg.blueKnobs = { [sweep.key.slice(5)]: sv };
    else if (sweep.key.startsWith('red.')) cfg.redKnobs = { [sweep.key.slice(4)]: sv };
    else cfg.set = { [sweep.key]: sv };
    cfg.sweep = { key: sweep.key, value: sv };
  }
  jobs.push({ id: jobs.length, cfg, keep: !!A.keep });
}
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const name = A.name || (A.tournament ? 'tournament' : sweep ? `sweep-${sweep.key}` : `${blues.join('+')}-vs-${reds.join('+')}`);
const out = path.join(TOOLS, 'runs', 'sim', `${stamp}-${name}`.replace(/[^\w.+-]/g, '_'));
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({ argv: process.argv.slice(2), base, blues, reds, seeds, seed0, sweep, jobs: jobs.length }, null, 1));
console.log(`${jobs.length} wars (${blues.length} x ${reds.length} doctrines${sweep ? ` x ${sweep.values.length} values of ${sweep.key}` : ''} x ${seeds} seeds, ${tmax} s each) on ${workers} workers -> ${path.relative(process.cwd(), out)}`);

// the baked ground table, shared by every worker (one copy in memory)
const { loadGrid } = await import('./sim/headless.mjs');
const grid = base.exact ? null : await loadGrid();
const recs = [], log = fs.createWriteStream(path.join(out, 'runs.jsonl'));
const t0 = Date.now(); let next = 0, done = 0, simSec = 0;
// one fresh worker thread per war: some game modules keep counters at module level (model seeds, item ids), so a
// war run after another in the same thread is not quite the war run alone - a fresh thread makes every seed exact
await new Promise(resolve => {
  let live = 0;
  const spawn = () => {
    if (next >= jobs.length) { if (live === 0) resolve(); return; }
    const job = jobs[next++]; live++;
    const w = new Worker(path.join(TOOLS, 'sim', 'worker.mjs'), { workerData: { grid: grid ? grid.buffer : null }, resourceLimits: { maxOldGenerationSizeMb: 1400 } });
    let got = false;
    const finish = m => {
      got = true; done++;
      if (m.error) { console.log(`  war ${job.id} FAILED: ${m.error.split('\n')[0]}`); recs.push({ ...job.cfg, error: m.error, failed: true }); }
      else { const r = { ...m.rec, sweep: job.cfg.sweep }; recs.push(r); log.write(JSON.stringify(r) + '\n'); simSec += r.time; }
      const el = (Date.now() - t0) / 1000, r = m.rec;
      console.log(`  [${String(done).padStart(4)}/${jobs.length}] ${r ? `${r.blue.padEnd(11)} vs ${r.red.padEnd(11)} seed ${String(r.seed).padStart(3)}${r.sweep ? ` ${r.sweep.key}=${r.sweep.value}` : ''}: ${r.winner === 1 ? 'TASK FORCE' : r.winner === 2 ? 'RUNAWAY   ' : 'DRAW      '} ${r.decisive ? 'by ' + r.how : '(timeout, on points)'} at ${Math.round(r.time / 60)} min  (${r.speed} sim-min/s)` : ''}  ${(el / 60).toFixed(1)} min elapsed, ~${((el / done) * (jobs.length - done) / 60).toFixed(0)} min left`);
      w.postMessage('exit');
    };
    w.on('message', m => { if (m.ready) w.postMessage(job); else finish(m); });
    w.on('error', e => { if (!got) finish({ error: String(e && e.stack || e) }); });
    w.on('exit', () => { if (!got) finish({ error: 'worker exited' }); live--; spawn(); });
  };
  for (let k = 0; k < Math.min(workers, jobs.length); k++) spawn();
});
log.end();
const wall = (Date.now() - t0) / 1000;
const S = aggregate(recs, { blues, reds, sweep, tmax, wall, simSec, workers, base });
S.techNever = deadBranches(recs, base, TECH);
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(S, null, 1));
const md = renderReport(S);
fs.writeFileSync(path.join(out, 'report.md'), md);
console.log('\n' + md.split('\n').filter(l => !l.startsWith('<!--')).slice(0, 80).join('\n'));
console.log(`\n${recs.length} wars, ${(simSec / 60).toFixed(0)} simulated minutes in ${(wall / 60).toFixed(1)} min (${(simSec / 60 / wall).toFixed(2)} sim-min per real second over ${workers} workers)  ->  ${path.relative(process.cwd(), out)}/report.md`);
process.exit(0);

function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    const k = a[i]; if (!k.startsWith('--')) continue;
    const key = k.slice(2), v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
    o[key] = v;
  }
  return o;
}
