#!/usr/bin/env node
// runscenes.mjs - run several snap.mjs scenes one after another (one browser at a time) and print a summary.
//   CHROME_PATH=... node runscenes.mjs scenes/smoke.json scenes/war.json ...
import { spawnSync } from 'node:child_process';
const out = [];
for (const sc of process.argv.slice(2)) {
  const t0 = Date.now(), r = spawnSync(process.execPath, ['snap.mjs', sc], { encoding: 'utf8', maxBuffer: 64 << 20, env: process.env });
  const txt = (r.stdout || '') + (r.stderr || ''), res = (txt.match(/result\s+(.*)/) || [])[1] || `exit ${r.status}`, dir = (txt.match(/run folder: (.*)/) || [])[1] || '';
  const fails = txt.split('\n').filter(l => /\bFAIL\b|PAGEERR/.test(l)).slice(0, 4).map(l => '      ' + l.slice(0, 220));
  out.push(`${sc.padEnd(28)} ${res}  (${((Date.now() - t0) / 1000).toFixed(0)} s)  ${dir}`); out.push(...fails);
  console.log(out.slice(-1 - fails.length).join('\n'));
}
console.log('\n=== summary ===\n' + out.filter(l => !l.startsWith('      ')).join('\n'));
