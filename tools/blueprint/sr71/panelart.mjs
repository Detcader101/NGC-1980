// panelart.mjs - the cockpit panel / console faces from the SR-71A-1 figures (ngc/sr71-fix): crop each figure to its
// panel outline (consoles.json), keep the figure's black faces and white legends as panel art (black -> the panel's
// near-black, white -> the legend's off-white, smoothly), clear everything outside the outline (callout numbers, leader
// lines, the page), and write game/img/sr71/<id>.png (alpha outside). The figures are public domain (declassified USAF).
//   CHROME_PATH=... node blueprint/sr71/panelart.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const D = path.dirname(fileURLToPath(import.meta.url)), REF = path.resolve(D, '../../../docs/ngc1980/reference/sr71'), OUT = path.resolve(D, '../../../game/img/sr71');
const C = JSON.parse(fs.readFileSync(path.join(D, 'consoles.json'), 'utf8'));
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }); const pg = await br.newPage();
const meta = {};
for (const P of C.panels) {
  const src = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(REF, P.fig)).toString('base64');
  const r = await pg.evaluate(async (src, P, k) => {
    const im = new Image(); im.src = src; await im.decode();
    const [x0, y0, x1, y1] = P.crop.map(v => v * k), W = Math.round(x1 - x0), H = Math.round(y1 - y0);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.drawImage(im, x0, y0, W, H, 0, 0, W, H); const id = g.getImageData(0, 0, W, H), p = id.data;
    const m = document.createElement('canvas'); m.width = W; m.height = H; const mg = m.getContext('2d'); mg.fillStyle = '#fff';
    for (const poly of P.polys) { mg.beginPath(); poly.forEach(([x, y], i) => (i ? mg.lineTo : mg.moveTo).call(mg, x * k - x0, y * k - y0)); mg.closePath(); mg.fill(); }
    const md = mg.getImageData(0, 0, W, H).data;
    // white near black is a legend (thin strokes on the panel); white far from any black is the page or an outlined part
    // (the throttle quadrant is drawn in outline): that becomes the console's grey structure, not a glowing legend
    const dk = document.createElement('canvas'); dk.width = W; dk.height = H; const dg = dk.getContext('2d'); const dd = dg.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { const l = (p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]) / 765; dd.data[i * 4] = dd.data[i * 4 + 1] = dd.data[i * 4 + 2] = l < 0.45 ? 255 : 0; dd.data[i * 4 + 3] = 255; }
    dg.putImageData(dd, 0, 0); const bl = document.createElement('canvas'); bl.width = W; bl.height = H; const bg2 = bl.getContext('2d'); bg2.filter = 'blur(4px)'; bg2.drawImage(dk, 0, 0); const near = bg2.getImageData(0, 0, W, H).data;
    const PAN = [20, 21, 23], LEG = [190, 188, 176], STR = [62, 65, 69];
    for (let i = 0; i < W * H; i++) { const l = (p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]) / 765, t = Math.min(1, Math.max(0, (l - 0.38) / 0.4)), s = t * t * (3 - 2 * t), f = near[i * 4] / 255, q = Math.min(1, Math.max(0, (f - 0.42) / 0.3)), nb = q * q * (3 - 2 * q), W2 = s * nb, G2 = s * (1 - nb);
      for (let ch = 0; ch < 3; ch++) p[i * 4 + ch] = PAN[ch] * (1 - s) + LEG[ch] * W2 + STR[ch] * G2; p[i * 4 + 3] = md[i * 4] > 127 ? 255 : 0; }
    g.putImageData(id, 0, 0); return { url: c.toDataURL('image/png'), W, H };
  }, src, P, C.k);
  fs.writeFileSync(path.join(OUT, P.id + '.png'), Buffer.from(r.url.split(',')[1], 'base64'));
  meta[P.id] = { w: r.W / C.pxPerM, h: r.H / C.pxPerM, px: [r.W, r.H] };
  console.log(P.id, r.W + 'x' + r.H, (r.W / C.pxPerM).toFixed(3) + ' x ' + (r.H / C.pxPerM).toFixed(3) + ' m');
}
fs.writeFileSync(path.join(OUT, 'panels.json'), JSON.stringify(meta, null, 1));
await br.close();
