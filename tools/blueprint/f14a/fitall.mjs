#!/usr/bin/env node
// fitall.mjs - measure the F-14A model against the traced NASA drawings: renders the three silhouette masks from
// dev/tomcat.html (?ref=side | top&sweep=68 | front&sweep=20, &mask=1) at the drawings' pixel sizes and runs fit.mjs.
//   CHROME_PATH=... node blueprint/f14a/fitall.mjs [--url http://127.0.0.1:8808/] [--out dir] [--json fit.json]
// Bands: side, all stations with both outlines (the fins and ventrals are masked in the trace); top, the whole
// silhouette at 68 deg (wings, gloves, stabilators); front, the canopy band (y 0.15..0.85) and the intake / nacelle
// band (y -1.25..-0.5), skipping the rows where the thin wing and stabilator planes run across the whole view.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const D = path.dirname(fileURLToPath(import.meta.url)), TOOLS = path.resolve(D, '../..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const base = arg('--url') || 'http://127.0.0.1:8808/', out = arg('--out') || path.join(TOOLS, 'runs', 'tomcatfit'); fs.mkdirSync(out, { recursive: true });
const shot = (q, file, w, h) => execFileSync('node', [path.join(TOOLS, 'blueprint/pageshot.mjs'), base + 'dev/tomcat.html?ui=0&' + q, path.join(out, file), w, h, '--wait', '2500'], { stdio: 'inherit' });
shot('ref=side&mask=1', 'mask-side.png', '2273', '3160');
shot('ref=top&mask=1&sweep=68', 'mask-top.png', '2273', '3160');
shot('ref=front&mask=1&sweep=20', 'mask-front.png', '3050', '3925');
execFileSync('node', [path.join(TOOLS, 'blueprint/fit.mjs'), path.join(TOOLS, '../game/js/units/air/f14trace.json'), '--side', path.join(out, 'mask-side.png'), '--top', path.join(out, 'mask-top.png'), '--front', path.join(out, 'mask-front.png'),
  '--length', '18.821', '--runs', 'front', '--front-runs-above', '0.1', '--zmax-top', '6.5', '--front-y', '0.15,0.89;-1.45,-1.0', '--json', arg('--json') || path.join(out, 'fit.json')], { stdio: 'inherit' });
// the front view split by region (rows; 'runs' = the run through the centre line, as the tracer takes it, 'ext' = the
// extreme black pixels of the row)
const bands = [['canopy', '0.15,0.89', 'runs'], ['nacelles+tunnel', '-1.45,-1.0', 'ext'], ['wings (plane)', '-0.22,-0.16', 'ext']];   // (fins and stabilators: tip positions in the findings; the CR outline joins the fuselage to the nacelles across the tunnel, so a centre run there is not comparable)
for (const [name, yr, mode] of bands) {
  const o = execFileSync('node', [path.join(TOOLS, 'blueprint/fit.mjs'), path.join(TOOLS, '../game/js/units/air/f14trace.json'), '--front', path.join(out, 'mask-front.png'), '--length', '18.821', ...(mode === 'runs' ? ['--runs', 'front', '--front-runs-above', '-9'] : []), '--front-y', yr]).toString();
  console.log('front ' + name.padEnd(16), o.replace(/^front\s+/, '').trim());
}
