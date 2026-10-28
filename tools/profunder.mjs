#!/usr/bin/env node
// profunder.mjs - (ngc/perf-cpu) inclusive and self time under a function in a .cpuprofile: what a system spends its
// time on.   node tools/profunder.mjs run.cpuprofile "update wheeled/motorpool.js" [top]
//   (the second argument matches the start of "name file:line" frames, e.g. "pool.update", "stepSchool")
import fs from 'node:fs';
const [, , file, match, top = 25] = process.argv;
const p = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(p.nodes.map(n => [n.id, n])), par = new Map();
for (const n of p.nodes) for (const c of n.children || []) par.set(c, n.id);
const w = cf => `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
const cnt = new Map(); for (let i = 0; i < p.samples.length; i++) cnt.set(p.samples[i], (cnt.get(p.samples[i]) || 0) + (p.timeDeltas[i] || 0));
const incl = new Map(), self = new Map(); let total = 0, all = 0;
for (const [id, t] of cnt) {
  all += t;
  const chain = []; let q = id; while (q !== undefined) { chain.push(w(byId.get(q).callFrame)); q = par.get(q); }
  const k = chain.findIndex(s => s.startsWith(match)); if (k < 0) continue;
  total += t; self.set(chain[0], (self.get(chain[0]) || 0) + t);
  for (const s of new Set(chain.slice(0, k + 1))) incl.set(s, (incl.get(s) || 0) + t);
}
console.log(`under "${match}": ${(total / 1000).toFixed(0)} ms of ${(all / 1000).toFixed(0)} ms sampled`);
console.log('--- inclusive');
for (const [k, t] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, +top)) console.log(`${(t / 1000).toFixed(0).padStart(7)} ms  ${k}`);
console.log('--- self');
for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, +top)) console.log(`${(t / 1000).toFixed(0).padStart(7)} ms  ${k}`);
