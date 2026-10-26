#!/usr/bin/env node
// Summarise a ?xrbench run on the console.
//   node tools/xrbenchreport.mjs [tools/runs/xrbench-<id>]     (no argument: the newest run)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const RUNS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runs');
let dir = process.argv[2];
if (!dir) {
  const all = fs.existsSync(RUNS) ? fs.readdirSync(RUNS).filter(d => d.startsWith('xrbench-') && fs.existsSync(path.join(RUNS, d, 'report.json'))).sort() : [];
  if (!all.length) { console.error('no tools/runs/xrbench-*/report.json yet'); process.exit(2); }
  dir = path.join(RUNS, all.at(-1));
}
const R = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
const E = R.env, f = x => x == null ? '-' : String(x);
console.log(`XR bench ${E.runId}${R.aborted ? '  (ABORTED: ' + R.aborted + ')' : ''}`);
console.log(`  ${E.gpu || '?'} | framebuffer ${E.framebuffer} scale ${E.scale} | eyes ${E.eyes.join(' / ')} | frameRate ${f(E.frameRate)} of ${JSON.stringify(E.supportedFrameRates)}`);
console.log(`  GPU timer ${E.gpuTimer ? 'yes' : 'no'} | panel ${E.panelCanvas} | ${E.ua}`);
console.log(`  audio: ${JSON.stringify(E.audio)}`);
const cols = [['view', 16], ['ok', 3], ['fps', 6], ['dt50', 6], ['dt95', 6], ['dt99', 6], ['>8.3%', 6], ['>11%', 6], ['>14%', 6], ['sim', 5], ['prep', 5], ['rend', 5], ['gpu50', 6], ['calls', 6], ['ktris', 6], ['paint', 5], ['cap', 4], ['capms', 6], ['audio dB', 8], ['LT', 4]];
const line = v => v.map((x, i) => f(x).padStart(cols[i][1])).join(' ');
console.log('\n' + line(cols.map(c => c[0])));
for (const s of R.segments) {
  const m = s.summary; if (!m) { console.log(`${s.id.padStart(16)}  (not measured)`); continue; }
  console.log(line([s.id.slice(0, 16), s.ok ? 'y' : 'N', m.fps, m.dt.p50, m.dt.p95, m.dt.p99, m.over8, m.over11, m.over14, m.cpu.sim.p50, m.cpu.prep.p50, m.cpu.render.p50, m.gpu?.p50, m.drawCalls.p50, m.triangles.p50 == null ? null : Math.round(m.triangles.p50 / 1000), m.panel.paints, m.panel.captures, m.panel.lastCaptureMs, m.audio.rmsDb, m.longTasks.count]));
  if (!s.ok || s.notes?.length) console.log(`${''.padStart(18)}notes: ${s.notes.join('; ')}`);
  if (s.images?.errors?.length) console.log(`${''.padStart(18)}images: ${s.images.errors.join('; ')}`);
}
console.log('\nFindings:'); for (const v of R.verdicts) console.log('  - ' + v);
if (R.events.length) { console.log('Events:'); for (const e of R.events) console.log('  - ' + e); }
console.log(`\n${path.join(dir, 'report.html')}`);
