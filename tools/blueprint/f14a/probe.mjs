// probe.mjs - trace vs mask at given stations: node blueprint/f14a/probe.mjs side|top|front z1 z2 ... (masks from fitall.mjs)
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
const D = path.dirname(fileURLToPath(import.meta.url)), TOOLS = path.resolve(D, '../..');
const [view, ...zs] = process.argv.slice(2);
const t = JSON.parse(fs.readFileSync(path.join(TOOLS, '../game/js/units/air/f14trace.json'), 'utf8')), C = t.calibration[view];
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }), pg = await br.newPage();
const file = path.join(TOOLS, 'runs/tomcatfit/mask-' + view + '.png');
const res = await pg.evaluate(async (src, view, C, zs) => {
  const im = new Image(); im.src = src; await im.decode(); const W = im.width, H = im.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, W, H).data, blk = (i, j) => d[(j * W + i) * 4] < 128;
  return zs.map(z => {
    if (view === 'front') { const j = Math.round(C.groundPx - (z - C.yGround) * C.s); let a = -1, b = -1; for (let i = C.cols[0]; i < C.cols[1]; i++) if (blk(i, j)) { if (a < 0) a = i; b = i; } return [z, a < 0 ? null : +((C.centrePx - a) / C.s).toFixed(3), b < 0 ? null : +((b - C.centrePx) / C.s).toFixed(3)]; }
    const i = Math.round(view === 'side' ? C.x0 + (z - C.zAtX0) * C.s : C.xRef + (z - C.zRef) * C.s); let a = -1, b = -1; for (let j = C.rows[0]; j < C.rows[1]; j++) if (blk(i, j)) { if (a < 0) a = j; b = j; }
    return view === 'side' ? [z, a < 0 ? null : +((C.groundPx - a) / C.s + C.yGround).toFixed(3), b < 0 ? null : +((C.groundPx - b) / C.s + C.yGround).toFixed(3)] : [z, a < 0 ? null : +((C.centrePx - a) / C.s).toFixed(3), b < 0 ? null : +((b - C.centrePx) / C.s).toFixed(3)];
  });
}, 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'), view, C, zs.map(Number));
const arr = t[view], key = view === 'front' ? 'y' : 'z';
for (const [z, a, b] of res) { const c = arr.reduce((p, q) => Math.abs(q[key] - z) < Math.abs(p[key] - z) ? q : p); console.log(view, z, 'trace', JSON.stringify(c), 'mask', a, b); }
await br.close();
