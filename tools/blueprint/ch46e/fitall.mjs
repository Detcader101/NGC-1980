#!/usr/bin/env node
// fitall.mjs - measure the CH-46E model against NADC-81118-60 fig. 2-1: renders the side and top silhouette masks from
// dev/ch46-ref.html (?ref=side|top&mask=1) at the figure's pixel size (3456 x 4808) and runs fit.mjs on ch46trace.json.
//   CHROME_PATH=... node blueprint/ch46e/fitall.mjs [--url http://127.0.0.1:8817/] [--out dir] [--json fit.json] [--nomask]
// Side: every column with both outlines (the masts and the gear are masked in the trace and in the mask). Top: the
// run through the centre line (blade crossings z -5.6..-4.6 and 4.4..5.6 are not measured). The front view of the
// top view stops at z 6.15: aft of it the drawing's plan tapers to 0.5 m at the tail while the ramp (gameplay: the
// squads walk on it) stays 2 m wide; recorded as a deviation. The front view of the
// figure is too small and inconsistent (its 14 ft 4 in reads 8 % short) to fit; it is used for section shapes only.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const D = path.dirname(fileURLToPath(import.meta.url)), TOOLS = path.resolve(D, '../..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const base = arg('--url') || 'http://127.0.0.1:8817/', out = arg('--out') || path.join(TOOLS, 'runs', 'ch46fit'); fs.mkdirSync(out, { recursive: true });
if (!process.argv.includes('--nomask')) for (const v of ['side', 'top']) execFileSync('node', [path.join(TOOLS, 'blueprint/pageshot.mjs'), base + 'dev/ch46-ref.html?ref=' + v + '&mask=1', path.join(out, 'mask-' + v + '.png'), '3456', '4808', '--wait', '1500'], { stdio: 'inherit' });
execFileSync('node', [path.join(TOOLS, 'blueprint/fit.mjs'), path.join(TOOLS, '../game/js/units/air/rotary/ch46trace.json'), '--side', path.join(out, 'mask-side.png'), '--top', path.join(out, 'mask-top.png'),
  '--length', '13.92', '--runs', 'top', '--zmax-top', '6.15', '--json', arg('--json') || path.join(out, 'fit.json')], { stdio: 'inherit' });
// the top view without z 1.15..1.21, where the drawing's sponson outline has a break (the scan finds the cabin wall
// there: 1.52 m half-width between 1.90 and 1.96 on either side)
console.log('top (gap cols) ' + execFileSync('node', [path.join(TOOLS, 'blueprint/fit.mjs'), path.join(TOOLS, '../game/js/units/air/rotary/ch46trace.json'), '--top', path.join(out, 'mask-top.png'), '--length', '13.92', '--runs', 'top', '--zmax-top', '6.15', '--top-skip', '1.15,1.21']).toString().replace(/^top\s+/, '').trim());
