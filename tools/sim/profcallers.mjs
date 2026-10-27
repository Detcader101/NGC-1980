// who calls a function (self+children time attributed up the stack):  node profcallers.mjs file.cpuprofile name [depth]
import fs from 'node:fs';
const p = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), want = process.argv[3], depth = +(process.argv[4] || 4);
const byId = new Map(p.nodes.map(n => [n.id, n])), parent = new Map();
for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
const t = new Map(); for (let i = 0; i < p.samples.length; i++) t.set(p.samples[i], (t.get(p.samples[i]) || 0) + (p.timeDeltas[i] || 0));
const name = n => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`;
const agg = new Map(); let tot = 0;
for (const [id, dt] of t) {
  // walk up; if the stack contains `want`, attribute to the chain above the first (lowest) occurrence
  let k = id, chain = null; const st = [];
  while (k !== undefined) { const n = byId.get(k); st.push(n); k = parent.get(k); }
  const i = st.findIndex(n => (n.callFrame.functionName || '') === want); if (i < 0) continue;
  chain = st.slice(i + 1, i + 1 + depth).map(name).join(' <- '); tot += dt;
  agg.set(chain, (agg.get(chain) || 0) + dt);
}
for (const [c, dt] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log((dt / 1000).toFixed(0).padStart(6) + ' ms  ' + c);
console.log('total', (tot / 1000).toFixed(0), 'ms');
