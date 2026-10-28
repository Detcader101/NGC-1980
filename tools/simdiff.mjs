#!/usr/bin/env node
// simdiff.mjs - (ngc/perf-cpu) are two warsim runs the same wars? Compares runs.jsonl record by record (by seed and
// matchup) with the wall-clock fields (wall, speed) left out. Exit 0 when every war matches, else prints the first
// differing keys per war.     node tools/simdiff.mjs tools/runs/sim/<a> tools/runs/sim/<b>
import fs from 'node:fs';
import path from 'node:path';
const load = d => new Map(fs.readFileSync(path.join(d, 'runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(r => [`${r.blue}/${r.red}/${r.seed}/${JSON.stringify(r.sweep || null)}`, r]));
const strip = r => JSON.parse(JSON.stringify(r, (k, v) => (k === 'wall' || k === 'speed') ? undefined : v));
const a = load(process.argv[2]), b = load(process.argv[3]);
let bad = 0;
for (const [k, ra] of a) {
  const rb = b.get(k); if (!rb) { console.log(`${k}: missing in B`); bad++; continue; }
  const x = strip(ra), y = strip(rb);
  if (JSON.stringify(x) === JSON.stringify(y)) { console.log(`${k}: same (wall ${ra.wall} s -> ${rb.wall} s)`); continue; }
  bad++; const diff = Object.keys({ ...x, ...y }).filter(f => JSON.stringify(x[f]) !== JSON.stringify(y[f]));
  console.log(`${k}: DIFFERENT in ${diff.join(', ')}`);
}
process.exit(bad ? 1 : 0);
