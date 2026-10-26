#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stamp, compareRuns } from './evidence.mjs';

const tools = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), forwarded = [];
let scene = path.join(tools, 'scenes/evidence.mjs'), out = path.join(tools, 'runs', stamp() + '-benchmark');
let baseline, capture = true;
for (let i = 0; i < args.length; i++) {
  const a = args[i], next = () => { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + a); return args[++i]; };
  if (a === '--help' || a === '-h') {
    console.log('node tools/benchmark.mjs [scene.mjs] [--out DIR] [--baseline RUN/result.json] [--no-capture]\n  --frames N --seed N --gpu swiftshader|hardware --browser PATH --url URL --query QUERY --width N --height N --headful\nDefault: seeded coastal flight + research, 120 intervals each, screenshots and two six-second MP4 clips.'); process.exit(0);
  } else if (a === '--out') out = path.resolve(next());
  else if (a === '--baseline') baseline = path.resolve(next());
  else if (a === '--no-capture') capture = false;
  else if (a === '--headful') forwarded.push(a);
  else if (['--frames', '--seed', '--gpu', '--browser', '--url', '--query', '--width', '--height'].includes(a)) forwarded.push(a, next());
  else if (!a.startsWith('-') && scene === path.join(tools, 'scenes/evidence.mjs')) scene = path.resolve(a);
  else throw new Error('Unknown argument: ' + a);
}
const before = baseline ? JSON.parse(fs.readFileSync(baseline, 'utf8')) : null;
if (before && !Array.isArray(before.benchmarks)) throw new Error('Baseline must be a result.json from the benchmark harness');
if (fs.existsSync(path.join(out, 'result.json'))) throw new Error('Run already exists; choose a new --out directory');
const child = spawnSync(process.execPath, [path.join(tools, 'snap.mjs'), scene, '--out', out, ...(capture ? ['--capture'] : []), ...forwarded], { stdio: 'inherit' });
const file = path.join(out, 'result.json');
if (!fs.existsSync(file)) throw new Error('Harness did not produce result.json: ' + (child.error?.message || child.status));
const run = JSON.parse(fs.readFileSync(file, 'utf8'));
const benchmark = { schemaVersion: 1, source: run.source, sourceQualification: run.sourceQualification, servedSource: run.servedSource,
  ok: run.ok, scene: run.name, query: run.query, seed: run.seed, viewport: run.viewport, gpu: run.gpu,
  rendererMode: run.rendererMode, browserVersion: run.browserVersion, host: run.host,
  benchmarks: run.benchmarks, comparison: before ? compareRuns(before, run) : null,
  qualification: 'Recording runs after measurements. Software rendering and XR emulation do not establish hardware performance. No baseline means no before/after claim.' };
fs.writeFileSync(path.join(out, 'benchmark.json'), JSON.stringify(benchmark, null, 2) + '\n');
console.log('Benchmark evidence: ' + path.join(out, 'benchmark.json'));
if (benchmark.comparison) console.log(JSON.stringify(benchmark.comparison, null, 2));
process.exitCode = child.status === 0 && run.ok && run.benchmarks.length ? 0 : 1;
