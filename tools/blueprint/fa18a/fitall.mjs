#!/usr/bin/env node
// fitall.mjs - measure the F/A-18A model against the traced NASA three-view: renders the three silhouette masks from
// dev/jet-preview.html (?ref=side | top | front, &mask=1) at the drawing's pixel size and runs fit.mjs.
//   CHROME_PATH=... node blueprint/fa18a/fitall.mjs [--url http://127.0.0.1:8817/] [--out dir] [--json fit.json]
// Spans: top and front by the run through the centre line (as the tracer takes them: the tip rails and the stabilator
// tips beyond a gap do not count), side by the extreme outline.
// Bands: side, every station with both outlines to the nozzle exit (z 6.04: the last columns are line-art ends) (the fins are masked in the trace, z 1.0..5.15, and the AIM-7 under
// the aft fuselage, z -1.63..2.37, is bridged: the model carries none); top, the whole planform (wings, LEX, stabilators,
// tip rails); front, the canopy and forebody band (y 0.48..1.36) and the intake band (y -0.72..-0.25: below it the drawing's front view carries the semi-recessed AIM-7 noses, which the model does not), skipping the rows
// where the thin wing, LEX and stabilator planes run across the view (judged separately: fins and stab tips below).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const D = path.dirname(fileURLToPath(import.meta.url)), TOOLS = path.resolve(D, '../..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const base = arg('--url') || 'http://127.0.0.1:8817/', out = arg('--out') || path.join(TOOLS, 'runs', 'hornetfit'); fs.mkdirSync(out, { recursive: true });
const shot = (q, file) => execFileSync('node', [path.join(TOOLS, 'blueprint/pageshot.mjs'), base + 'dev/jet-preview.html?ui=0&' + q, path.join(out, file), '2865', '1760', '--wait', '1500'], { stdio: 'inherit' });
if (!process.argv.includes('--nomask')) for (const v of ['side', 'top', 'front']) shot(`ref=${v}&mask=1`, `mask-${v}.png`);
const TR = path.join(TOOLS, '../game/js/units/air/fa18trace.json');
execFileSync('node', [path.join(TOOLS, 'blueprint/fit.mjs'), TR, '--side', path.join(out, 'mask-side.png'), '--top', path.join(out, 'mask-top.png'), '--front', path.join(out, 'mask-front.png'),
  '--length', '17.07', '--zmax-side', '6.04', '--runs', 'top,front', '--front-y', '0.48,1.36;-0.72,-0.25', '--json', arg('--json') || path.join(out, 'fit.json')], { stdio: 'inherit' });
// the top view without the straight trailing-edge columns (z 2.20..2.29: the wing TE runs parallel to the columns, so a
// 1 px offset there reads as metres of 'gap'; the IoU above includes them)
console.log('top (TE cols)', execFileSync('node', [path.join(TOOLS, 'blueprint/fit.mjs'), TR, '--top', path.join(out, 'mask-top.png'), '--length', '17.07', '--runs', 'top', '--top-skip', '2.20,2.29']).toString().replace(/^top\s+/, '').trim());
for (const [name, yr] of [['front canopy', '0.48,1.36'], ['front intakes', '-0.72,-0.25']]) {
  const o = execFileSync('node', [path.join(TOOLS, 'blueprint/fit.mjs'), TR, '--front', path.join(out, 'mask-front.png'), '--length', '17.07', '--runs', 'front', '--front-y', yr]).toString();
  console.log(name.padEnd(14), o.replace(/^front\s+/, '').trim());
}
