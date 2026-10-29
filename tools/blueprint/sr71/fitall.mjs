#!/usr/bin/env node
// fitall.mjs - measure the SR-71A model against the traced USAF three-view: renders the three silhouette masks from
// dev/sr71.html (?ref=side|top|front&mask=1, gear up) at the drawing's pixel size and runs fit.mjs.
//   CHROME_PATH=... node blueprint/sr71/fitall.mjs [--url http://127.0.0.1:8871/] [--out dir] [--json fit.json]
// Side: every column with both outlines (the fins are masked in the trace: their own check, see the findings); top:
// the whole planform; front: the run through the centre line (the canopy hump and the wing rows the tracer took).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const D = path.dirname(fileURLToPath(import.meta.url)), TOOLS = path.resolve(D, '../..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const base = arg('--url') || 'http://127.0.0.1:8871/', out = arg('--out') || path.join(TOOLS, 'runs', 'sr71fit'); fs.mkdirSync(out, { recursive: true });
const shot = (q, file) => execFileSync('node', [path.join(TOOLS, 'blueprint/pageshot.mjs'), base + 'dev/sr71.html?ui=0&' + q, path.join(out, file), '3708', '2838', '--wait', '2500'], { stdio: 'inherit' });
if (!process.argv.includes('--nomask')) { shot('ref=side&mask=1', 'mask-side.png'); shot('ref=top&mask=1', 'mask-top.png'); shot('ref=front&mask=1', 'mask-front.png'); }
const TR = path.join(TOOLS, '../game/js/units/air/sr71trace.json');
execFileSync('node', [path.join(TOOLS, 'blueprint/fit.mjs'), TR, '--side', path.join(out, 'mask-side.png'), '--top', path.join(out, 'mask-top.png'), '--front', path.join(out, 'mask-front.png'),
  '--length', '32.74', '--runs', 'front', '--front-y', '1.8,2.95', '--top-skip', '16.9,18.95', '--json', arg('--json') || path.join(out, 'fit.json')], { stdio: 'inherit' });
// the front view: the body hump (rows 1.8-2.95, runs through the centre line). The wing rows are not compared by run: the
// drawn wing tips sit ~0.1 m below the inboard wing, so a centre run breaks; the span is checked from the mask instead
for (const [name, yr, runs] of [['body hump', '1.8,2.95', true]]) {
  const o = execFileSync('node', [path.join(TOOLS, 'blueprint/fit.mjs'), TR, '--front', path.join(out, 'mask-front.png'), '--length', '32.74', ...(runs ? ['--runs', 'front'] : []), '--front-y', yr]).toString();
  console.log('front ' + name.padEnd(15), o.replace(/^front\s+/, '').trim());
}
const span = execFileSync('node', [path.join(TOOLS, 'blueprint/sr71/extent.mjs'), path.join(out, 'mask-front.png'), '0', '1700', '3708', '2100']).toString(), e = JSON.parse(span);
console.log('front span (mask):', ((e.xmax - e.xmin + 1) / 137.25).toFixed(3), 'm (manual 16.947 m)');
