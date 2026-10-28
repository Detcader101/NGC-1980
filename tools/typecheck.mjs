// node tools/check.mjs types [--update] [--list [file-substring]]
//
// Runs tsc (tsconfig.json at the repo root: allowJs + checkJs + noEmit over game/js, three r170 types) and prints the
// error count per file against tools/typecheck-baseline.json. It fails (exit 1) only when the TOTAL goes up, so
// branches keep merging while the count comes down; files whose own count rose are listed as NEW so the author can see
// what they added. When the count goes down, --update writes the lower numbers into the baseline (commit it).
//   --list            also print every error (or only those whose path contains the given substring)
//   --update          rewrite the baseline from this run (refuses to raise the total unless --force)
// Needs typescript + @types/three in tools/node_modules (cd tools && npm ci). The game itself never loads any of this.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function typecheck(root, args = []) {
  const tsc = path.join(root, 'tools/node_modules/typescript/bin/tsc');
  if (!fs.existsSync(tsc)) { console.error('types: typescript is not installed - run: cd tools && npm ci'); return 2; }
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [tsc, '-p', path.join(root, 'tsconfig.json'), '--pretty', 'false'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) { console.error(String(r.error)); return 2; }
  const out = (r.stdout || '') + (r.stderr || '');
  const errors = [], files = {};
  for (const line of out.split('\n')) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
    if (m) { const f = m[1].replace(/\\/g, '/'); errors.push({ f, line: +m[2], col: +m[3], code: m[4], msg: m[5] }); files[f] = (files[f] || 0) + 1; }
    else if (/error TS\d+/.test(line)) { console.error('types: tsc failed outright:\n' + out.slice(0, 4000)); return 2; }   // config errors
  }
  const total = errors.length;
  const basePath = path.join(root, 'tools/typecheck-baseline.json');
  const base = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, 'utf8')) : { total: Infinity, files: {} };
  const listAt = args.indexOf('--list');
  if (listAt >= 0) {
    const filt = args[listAt + 1] && !args[listAt + 1].startsWith('--') ? args[listAt + 1] : '';
    for (const e of errors) if (e.f.includes(filt)) console.log(`${e.f}:${e.line}:${e.col} ${e.code} ${e.msg}`);
  }
  // per-file table, worst first; NEW = this file has more than its baseline
  const names = [...new Set([...Object.keys(files), ...Object.keys(base.files || {})])].sort((a, b) => (files[b] || 0) - (files[a] || 0) || a.localeCompare(b));
  const rows = [];
  for (const f of names) {
    const n = files[f] || 0, b = base.files?.[f] || 0; if (!n && !b) continue;
    rows.push(`${String(n).padStart(5)} ${n > b ? `NEW +${n - b}`.padEnd(8) : n < b ? `-${b - n}`.padEnd(8) : ''.padEnd(8)} ${f}`);
  }
  console.log(rows.join('\n'));
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`Types: ${total} errors in ${Object.keys(files).length} files (baseline ${base.total}) - tsc ${secs}s`);
  if (args.includes('--update')) {
    if (total > base.total && !args.includes('--force')) { console.error('types: refusing to raise the baseline (pass --force if that is really meant)'); return 1; }
    const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(basePath, JSON.stringify({ note: 'node tools/check.mjs types --update; the check fails when the total rises', total, files: sorted }, null, 1) + '\n');
    console.log(`types: baseline written (${total})`);
    return 0;
  }
  if (total > base.total) {
    console.error(`FAIL types: ${total - base.total} more type errors than the baseline. Run: node tools/check.mjs types --list <file> for the NEW files above.`);
    return 1;
  }
  if (total < base.total) console.log(`types: ${base.total - total} fewer than the baseline - lock it in with: node tools/check.mjs types --update`);
  return 0;
}
