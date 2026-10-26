#!/usr/bin/env node
// Browser suite, deliberately not named *bench.mjs: the CPU gate never starts Chrome.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadUnitCases, selectCases, serializableCase, readResult } from './unit-catalog.mjs';
import { sourceInfo, hostInfo, stamp } from './evidence.mjs';

const tools = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), forwarded = [];
let out = path.join(tools, 'runs', stamp() + '-units'), baseline, category, units = [], clips = [], capture = false, list = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i], next = () => { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + a); return args[++i]; };
  if (a === '--help' || a === '-h') {
    console.log('node tools/unit-benchmark.mjs [--list] [--unit ID[,ID]] [--category air|ground|naval|defence|structure]\n  [--out DIR] [--baseline SUITE_DIR] [--frames N] [--capture | --clips ID[,ID]]\n  --seed N --gpu swiftshader|hardware --browser PATH --width N --height N --headful\nOne browser at a time. Default: every unit, 120 rendered intervals, screenshots, no clips.\nUse --frames 30 for a smoke run. Unit previews do not establish mission, VR or hardware performance.');
    process.exit(0);
  } else if (a === '--out') out = path.resolve(next());
  else if (a === '--baseline') baseline = path.resolve(next());
  else if (a === '--category') category = next();
  else if (a === '--unit') units.push(...next().split(','));
  else if (a === '--clips') clips.push(...next().split(','));
  else if (a === '--capture') capture = true;
  else if (a === '--list') list = true;
  else if (a === '--headful') forwarded.push(a);
  else if (['--frames', '--seed', '--gpu', '--browser', '--width', '--height'].includes(a)) forwarded.push(a, next());
  else throw new Error('Unknown argument: ' + a);
}
const all = await loadUnitCases(), selected = selectCases(all, { units, category });
for (const id of clips) if (!selected.some(entry => entry.id === id)) throw new Error('Clip unit is not selected: ' + id);
if (list) { for (const entry of selected) console.log(`${entry.id.padEnd(22)} ${entry.category.padEnd(10)} ${entry.name}\n  ${entry.description}`); process.exit(0); }
if (baseline && !fs.existsSync(path.join(baseline, 'suite.json'))) throw new Error('Baseline must contain suite.json');
if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error('Suite output must be new or empty: ' + out);
fs.mkdirSync(out, { recursive: true });
const suite = { schemaVersion: 1, startedAt: new Date().toISOString(), source: sourceInfo(path.join(tools, '..')), host: hostInfo(),
  command: [process.execPath, ...process.argv.slice(1)], catalog: all.map(serializableCase), selected: selected.map(entry => entry.id),
  baseline: baseline || null, complete: false, ok: false, runs: [],
  qualification: 'Isolated unit fixtures using production models and simulations; no busy-war, hardware, real-world fidelity or VR certification. Recording follows sampling. No baseline means no performance-change claim.' };
const save = () => fs.writeFileSync(path.join(out, 'suite.json'), JSON.stringify(suite, null, 2) + '\n');
save();
for (const [index, entry] of selected.entries()) {
  console.log(`\nUnit ${index + 1}/${selected.length}: ${entry.name} (${entry.id})`);
  const dir = path.join(out, entry.id), baselineFile = baseline && path.join(baseline, entry.id, 'result.json');
  const hasBaseline = baselineFile && fs.existsSync(baselineFile);
  const child = spawnSync(process.execPath, [path.join(tools, 'benchmark.mjs'), path.join(tools, 'scenes/unit.mjs'), '--out', dir,
    ...(!(capture || clips.includes(entry.id)) ? ['--no-capture'] : []),
    ...(hasBaseline ? ['--baseline', baselineFile] : []), ...forwarded],
  { cwd: path.join(tools, '..'), env: { ...process.env, UNIT_ID: entry.id, SNAP_WALL: '1' }, stdio: 'inherit' });
  const result = readResult(path.join(dir, 'result.json'));
  suite.runs.push({ id: entry.id, name: entry.name, category: entry.category, directory: entry.id,
    ok: child.status === 0 && !!result?.ok && !!result?.benchmarks?.length,
    exitCode: child.status, error: child.error?.message || null,
    baseline: hasBaseline ? baselineFile : null, missingBaseline: !!baseline && !hasBaseline,
    checks: result?.expects?.length ?? 0, failedChecks: result?.expects?.filter(check => !check.ok).length ?? 0,
    benchmarks: result?.benchmarks?.map(({ name, summary }) => ({ name, summary })) ?? [] });
  save();
  if (child.signal) { suite.interrupted = child.signal; break; }
}
suite.complete = suite.runs.length === selected.length;
suite.ok = suite.complete && suite.runs.every(run => run.ok);
suite.finishedAt = new Date().toISOString();
suite.sourceAfter = sourceInfo(path.join(tools, '..'));
if (suite.sourceAfter.gameSha256 !== suite.source.gameSha256) { suite.ok = false; suite.error = 'Game source changed during the suite'; }
save();
console.log(`${suite.runs.filter(run => run.ok).length}/${selected.length} unit runs passed: ${path.join(out, 'suite.json')}`);
process.exitCode = suite.ok ? 0 : 1;
