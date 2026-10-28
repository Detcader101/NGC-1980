// canopyrows.mjs - the front view's canopy band, row by row: the model mask's centre run half-width vs the registered
// CR-163098 trace (run from tools/: node blueprint/f14a/canopyrows.mjs, after fitall.mjs)
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const t = JSON.parse(fs.readFileSync('../game/js/units/air/f14trace.json', 'utf8')), C = t.calibration.front;
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }), pg = await br.newPage();
const ys = [0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.86];
const r = await pg.evaluate(async (src, C, ys) => {
  const im = new Image(); im.src = src; await im.decode(); const W = im.width, H = im.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, W, H).data, blk = (i, j) => d[(j * W + i) * 4] < 128;
  return ys.map(y => { const j = Math.round(C.groundPx - (y - C.yGround) * C.s), c0 = Math.round(C.centrePx); if (!blk(c0, j)) return [y, null]; let a = c0, b = c0; while (blk(a - 1, j)) a--; while (blk(b + 1, j)) b++; return [y, +((b - a) / 2 / C.s).toFixed(3)]; });
}, 'data:image/png;base64,' + fs.readFileSync('runs/tomcatfit/mask-front.png').toString('base64'), C, ys);
for (const [y, m] of r) { const c = t.front.reduce((p, q) => Math.abs(q.y - y) < Math.abs(p.y - y) ? q : p); console.log(y, 'model', m, 'CR', c.left != null ? ((c.left + c.right) / 2).toFixed(3) : null); }
await br.close();
