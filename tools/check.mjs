#!/usr/bin/env node
// Reproducible local checks; browsers are run separately with snap.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2] || 'all';
if (!['all', 'syntax', 'bench'].includes(mode)) throw new Error('usage: node tools/check.mjs [all|syntax|bench]');
const out = path.join(root, 'tools/runs/check-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(out, { recursive: true });
const results = [];
const run = (name, args, input) => {
  const start = performance.now();
  const r = spawnSync(process.execPath, args, { cwd: root, input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const result = { name, ok: r.status === 0 && !r.error, seconds: +((performance.now() - start) / 1000).toFixed(2) };
  results.push(result);
  fs.writeFileSync(path.join(out, name.replace(/[^\w.-]/g, '_') + '.log'), (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : ''));
  if (!result.ok) console.error(`FAIL ${name}\n${(r.stderr || r.stdout || String(r.error)).slice(-3500)}`);
  return result;
};

if (mode !== 'bench') {
  const files = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z', 'game/*.js', 'tools/*.mjs'], { cwd: root, encoding: 'utf8' });
  if (files.status !== 0) throw new Error(files.stderr);
  const modules = [...new Set(files.stdout.split('\0').filter(Boolean))].sort();
  for (const file of modules) run(file, ['--check', '--input-type=module'], fs.readFileSync(path.join(root, file)));
  console.log(`Syntax: ${results.filter(r => r.ok).length}/${modules.length} modules passed`);
}
if (mode !== 'syntax') {
  const benches = fs.readdirSync(path.join(root, 'tools')).filter(f => f.endsWith('bench.mjs'));
  benches.push('hotas-selftest.mjs', 'rotarydeck.mjs');
  for (const file of benches.sort()) {
    const r = run(file, [path.join('tools', file)]);
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${file} (${r.seconds}s)`);
  }
}
const failed = results.filter(r => !r.ok);
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ mode, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(`${results.length - failed.length}/${results.length} checks passed; logs: ${path.relative(root, out)}`);
process.exitCode = failed.length ? 1 : 0;
