#!/usr/bin/env node
// hueypedestal.mjs - trace the radio pedestal of TM 55-1520-210-10 fig. 2-5 "Crew compartment - typical" sheet 2
// (public domain, docs/ngc1980/reference/uh1/tm55-1520-210-10_fig2-5_sheet2_pedestal.jpg, archive.org page n70): the
// two Dzus-rail columns and each panel's top / bottom edge (long horizontal lines inside a column), scaled from the
// standard Dzus panel width (5.75 in = 146 mm). Output game/js/uh1pedestal.json. CHROME_PATH=... node hueypedestal.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import puppeteer from 'puppeteer-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(ROOT, 'docs/ngc1980/reference/uh1/tm55-1520-210-10_fig2-5_sheet2_pedestal.jpg');
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }); const p = await b.newPage();
const r = await p.evaluate(async (src) => {
  const im = new Image(); im.src = src; await im.decode(); const W = im.width, H = im.height, k = W / 1540;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
  const d = cx.getImageData(0, 0, W, H).data, dark = (x, y) => d[(y * W + x) * 4] < 120;
  // the stack's frame: vertical dark lines spanning most of the stack height (display x 185 .. 660, y 315 .. 1505)
  const y0 = Math.round(330 * k), y1 = Math.round(1490 * k), vcols = [];
  for (let x = Math.round(180 * k); x < Math.round(665 * k); x++) { let n = 0; for (let y = y0; y < y1; y++) n += dark(x, y); if (n > 0.8 * (y1 - y0)) vcols.push(x); }
  const groups = []; for (const x of vcols) { const g = groups[groups.length - 1]; if (g && x - g[g.length - 1] <= 3) g.push(x); else groups.push([x]); }
  const xs = groups.map(g => (g[0] + g[g.length - 1]) / 2);
  // the two columns: between the frame's outer lines and the middle rail
  const L = xs[0], M = xs.reduce((b, x) => Math.abs(x - (xs[0] + xs[xs.length - 1]) / 2) < Math.abs(b - (xs[0] + xs[xs.length - 1]) / 2) ? x : b, xs[0]), Rr = xs[xs.length - 1];
  const cols = [[L, M], [M, Rr]].map(([a, bb]) => {
    const rows = []; for (let y = Math.round(300 * k); y < Math.round(1520 * k); y++) { let n = 0; for (let x = Math.round(a + 25); x < Math.round(bb - 25); x++) n += dark(x, y); if (n > 0.85 * (bb - a - 50)) rows.push(y); }
    const rg = []; for (const y of rows) { const g = rg[rg.length - 1]; if (g && y - g[g.length - 1] <= 4) g.push(y); else rg.push([y]); }
    return { x0: a, x1: bb, lines: rg.map(g => (g[0] + g[g.length - 1]) / 2) };
  });
  return { k, xs, cols };
}, 'data:image/jpeg;base64,' + fs.readFileSync(IMG).toString('base64'));
await b.close();
const pxPerMm = (r.cols[0].x1 - r.cols[0].x0) / 146.05;
const out = { source: 'TM 55-1520-210-10 (1988) fig. 2-5 sheet 2, pedestal radio stack, public domain; traced by tools/hueypedestal.mjs', scale: { pxPerMm: +pxPerMm.toFixed(3), from: 'Dzus rail panel width 5.75 in' },
  columns: r.cols.map((c, i) => { const top = c.lines[0]; return { side: i ? 'right' : 'left', panels: c.lines.slice(0, -1).map((y, j) => ({ top: +((y - top) / pxPerMm).toFixed(1), height: +((c.lines[j + 1] - y) / pxPerMm).toFixed(1) })).filter(q => q.height > 20) }; }) };
fs.writeFileSync(path.join(ROOT, 'game/js/uh1pedestal.json'), JSON.stringify(out));
fs.writeFileSync(path.join(ROOT, 'game/js/uh1pedestal.js'), '// generated from game/js/uh1pedestal.json (tools/hueypedestal.mjs, TM 55-1520-210-10 fig. 2-5 sheet 2, public domain)\nexport const UH1_PEDESTAL = ' + JSON.stringify(out) + ';\n');
fs.writeFileSync(path.join(ROOT, 'game/js/uh1pedestal.js'), '// generated from game/js/uh1pedestal.json (tools/hueypedestal.mjs, TM 55-1520-210-10 fig. 2-5 sheet 2, public domain)\nexport const UH1_PEDESTAL = ' + JSON.stringify(out) + ';\n');
console.log(JSON.stringify(out, null, 0));
