// profsummary.mjs - (ngc/perf-cpu) text summary of a V8 .cpuprofile (self time by function and by file) and a sampling
// .heapprofile (allocated bytes by function, self). Used by warprof.mjs and scenes/cpuprofile.mjs; also a CLI:
//   node tools/profsummary.mjs run.cpuprofile [run.heapprofile] [top]
import fs from 'node:fs';
const where = cf => `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`;
export function summarize(cpu, heap, { top = 30 } = {}) {
  const lines = []; let allocBytes = 0; const self = new Map(), file = new Map(), alloc = new Map();
  let tot = 0;
  if (cpu) {
    const byId = new Map(cpu.nodes.map(n => [n.id, n])), cnt = new Map();
    for (let i = 0; i < cpu.samples.length; i++) cnt.set(cpu.samples[i], (cnt.get(cpu.samples[i]) || 0) + (cpu.timeDeltas[i] || 0));
    for (const [id, t] of cnt) { const cf = byId.get(id).callFrame, k = where(cf), f = cf.url.split('/').slice(-2).join('/') || cf.functionName; self.set(k, (self.get(k) || 0) + t); file.set(f, (file.get(f) || 0) + t); tot += t; }
    lines.push(`--- CPU self time (total ${(tot / 1000).toFixed(0)} ms)`);
    for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, top)) lines.push(`${(t / tot * 100).toFixed(1).padStart(5)}%  ${(t / 1000).toFixed(0).padStart(6)} ms  ${k}`);
    lines.push('--- CPU self time by file');
    for (const [k, t] of [...file].sort((a, b) => b[1] - a[1]).slice(0, 20)) lines.push(`${(t / tot * 100).toFixed(1).padStart(5)}%  ${k}`);
  }
  if (heap) {
    const walk = n => { const s = n.selfSize || 0; if (s) { const k = where(n.callFrame); alloc.set(k, (alloc.get(k) || 0) + s); allocBytes += s; } for (const c of n.children || []) walk(c); };
    walk(heap.head);
    lines.push(`--- allocations, self (total ${(allocBytes / 1048576).toFixed(1)} MB sampled)`);
    for (const [k, b] of [...alloc].sort((a, b) => b[1] - a[1]).slice(0, top)) lines.push(`${(b / allocBytes * 100).toFixed(1).padStart(5)}%  ${(b / 1048576).toFixed(1).padStart(7)} MB  ${k}`);
  }
  return { text: lines.join('\n'), allocBytes, cpuMs: tot / 1000, self, alloc };
}
if (process.argv[1] && process.argv[1].endsWith('profsummary.mjs')) {
  const [, , c, h, t] = process.argv;
  const cpu = c && c.endsWith('.cpuprofile') ? JSON.parse(fs.readFileSync(c, 'utf8')) : null;
  const hp = [c, h].find(f => f && f.endsWith('.heapprofile'));
  console.log(summarize(cpu, hp ? JSON.parse(fs.readFileSync(hp, 'utf8')) : null, { top: +(t || 40) }).text);
}
