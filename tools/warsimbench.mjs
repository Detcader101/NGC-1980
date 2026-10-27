// Exercise the public CLI, including the default research start and its persisted record.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = args => spawnSync(process.execPath, ['tools/warsim.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: 60000 });
let checks = 0;
for (const args of [
  ['--seeds', '0'], ['--workers', 'NaN'], ['--dt', '0'], ['--tmax', '-1'], ['--seeds', '1.5'],
  ['--seed0', '4294967295', '--seeds', '2'], ['--tmax'], ['--unknown'], ['--blue', 'TYPO'],
  ['--tech', 'p.missing'], ['--pilot', 'maybe'], ['--patch', 'unknown'],
  ['--sweep', 'COST.nope=1,2'], ['--sweep', 'COST.drone=1,NaN'],
]) {
  const r = run(args);
  assert(!r.error && r.status !== 0, 'reject invalid CLI: ' + args.join(' ')); checks++;
}
const name = 'cli-bench-' + process.pid;
try {
  const r = run(['--blue', 'balanced', '--red', 'default', '--seeds', '1', '--tmax', '7', '--workers', '1', '--pilot', 'none', '--name', name]);
  assert.equal(r.status, 0, r.stderr); checks++;
  const dir = fs.readdirSync(path.join(root, 'tools/runs/sim')).find(d => d.endsWith('-' + name));
  assert(dir, 'run folder exists');
  const out = path.join(root, 'tools/runs/sim', dir);
  const cfg = JSON.parse(fs.readFileSync(path.join(out, 'config.json')));
  assert.equal(cfg.base.tech, 'default'); checks++;
  const [rec] = fs.readFileSync(path.join(out, 'runs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rec.blue, 'BALANCED'); assert.equal(rec.red, 'DEFAULT'); checks++;
  assert.equal(rec.tech, 'default'); checks++;
  assert(rec.samples.length >= 2 && rec.samples.at(-1).t >= 5, 'thinning retains the final sample between 30-second boundaries'); checks++;
  const summary = JSON.parse(fs.readFileSync(path.join(out, 'summary.json')));
  assert.equal(summary.meta.failed, 0); assert.equal(summary.overall.n, 1); checks++;
} finally {
  for (const dir of fs.readdirSync(path.join(root, 'tools/runs/sim'))) if (dir.endsWith('-' + name)) fs.rmSync(path.join(root, 'tools/runs/sim', dir), { recursive: true });
}
console.log(`${checks}/${checks} simulation CLI checks pass`);
