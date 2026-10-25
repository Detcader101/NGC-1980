// summarise a .cpuprofile: self time by function (top 40) and by file
import fs from 'node:fs';
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const byId = new Map(p.nodes.map(n => [n.id, n]));
const self = new Map(), file = new Map();
const dts = p.timeDeltas; const cnt = new Map();
for (let i = 0; i < p.samples.length; i++) cnt.set(p.samples[i], (cnt.get(p.samples[i]) || 0) + (dts[i] || 0));
for (const [id, t] of cnt) { const n = byId.get(id), cf = n.callFrame, k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber}`; self.set(k, (self.get(k) || 0) + t); const f = cf.url.split('/').slice(-2).join('/'); file.set(f, (file.get(f) || 0) + t); }
const tot = [...self.values()].reduce((a, b) => a + b, 0);
console.log('--- by function');
for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, +(process.argv[3] || 40))) console.log((t / tot * 100).toFixed(1).padStart(5) + '%  ' + k);
console.log('--- by file');
for (const [k, t] of [...file].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log((t / tot * 100).toFixed(1).padStart(5) + '%  ' + k);
