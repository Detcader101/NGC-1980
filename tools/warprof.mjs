#!/usr/bin/env node
// warprof.mjs - (ngc/perf-cpu) CPU and allocation profile of the island war in plain node (tools/sim/headless.mjs).
// One seed: the war runs to --from game seconds unprofiled, then --secs game seconds under the V8 CPU profiler and the
// sampling heap profiler (objects collected by minor and major GC included: the allocation rate, not the live heap).
// Writes <out>/war.cpuprofile and <out>/war.heapprofile, prints self time, allocation sites, MB per game second and the
// GC pauses in the window. The war is the same war as warsim's (same seed, doctrines, tech, dt).
//   node tools/warprof.mjs --seed 1 --from 300 --secs 300 [--out dir] [--top 30]
import fs from 'node:fs';
import path from 'node:path';
import { Session } from 'node:inspector';
import { PerformanceObserver } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const A = {}; for (let i = 2; i < process.argv.length; i++) { const k = process.argv[i].replace(/^--/, ''), v = process.argv[i + 1]; if (v === undefined || v.startsWith('--')) A[k] = true; else { A[k] = v; i++; } }
const seed = +(A.seed ?? 1), from = +(A.from ?? 300), secs = +(A.secs ?? 300), top = +(A.top ?? 30);
const out = path.resolve(A.out || path.join(TOOLS, 'runs', 'prof', `war-s${seed}`)); fs.mkdirSync(out, { recursive: true });
const { runWar } = await import('./sim/headless.mjs');
// the session is in this thread: post() calls back synchronously, so the profilers start and stop inside the war loop
const S = new Session(); S.connect();
const post = (m, p) => { let r, e; S.post(m, p || {}, (err, res) => { e = err; r = res; }); if (e) throw e; return r; };
const gcs = []; let phase = 0, w0 = 0, wall = 0, t0 = 0, t1 = 0, steps = 0, cpu = null, heap = null;
const po = new PerformanceObserver(l => { for (const e of l.getEntries()) if (phase === 1) gcs.push(e.duration); }); po.observe({ entryTypes: ['gc'] });
const rec = await runWar({ seed, tmax: from + secs, blue: A.blue || 'BALANCED', red: A.red || 'DEFAULT', tech: A.tech || 'default', pilot: 'ai',
  onStep: W => {
    if (phase === 0 && W.time >= from) {
      phase = 1; t0 = W.time;
      post('Profiler.enable'); post('Profiler.setSamplingInterval', { interval: 250 }); post('Profiler.start');
      post('HeapProfiler.enable'); post('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      w0 = performance.now();
    } else if (phase === 1) {
      steps++;
      if (W.time >= from + secs - 0.05) { wall = performance.now() - w0; t1 = W.time; cpu = post('Profiler.stop').profile; heap = post('HeapProfiler.stopSampling').profile; phase = 2; }
    }
  } });
if (!cpu) { wall = performance.now() - w0; t1 = rec.time ?? t1; cpu = post('Profiler.stop').profile; heap = post('HeapProfiler.stopSampling').profile; phase = 2; }
await new Promise(r => setTimeout(r, 50));
fs.writeFileSync(path.join(out, 'war.cpuprofile'), JSON.stringify(cpu));
fs.writeFileSync(path.join(out, 'war.heapprofile'), JSON.stringify(heap));
const { summarize } = await import('./profsummary.mjs');
const sum = summarize(cpu, heap, { top });
const gsec = t1 - t0, mb = sum.allocBytes / 1048576;
console.log(`seed ${seed}: game ${t0.toFixed(0)}-${t1.toFixed(0)} s, ${steps} steps, wall ${(wall / 1000).toFixed(2)} s = ${(wall / steps).toFixed(2)} ms/step; ` +
  `allocated ${mb.toFixed(0)} MB = ${(mb / gsec * 1000 / 30).toFixed(1)} KB/step; GC ${gcs.length} pauses, ${gcs.reduce((a, b) => a + b, 0).toFixed(0)} ms, max ${Math.max(0, ...gcs).toFixed(1)} ms`);
console.log(`final: winner ${rec.winner} ${rec.how || ''} own ${JSON.stringify(rec.final?.own)} mat ${rec.final?.mat1}/${rec.final?.mat2} rng ${rec.rngCalls}`);
console.log(sum.text);
fs.writeFileSync(path.join(out, 'summary.txt'), sum.text);
process.exit(0);
