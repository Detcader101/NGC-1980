#!/usr/bin/env node
// grainmetric.mjs - (ngc/look-terrain) how grainy a screenshot's ground is: the mean absolute 3x3 Laplacian of the
// luminance (pixel-scale contrast: aliasing, sparkle) over a region, next to the 8x8-block mean contrast (the larger
// variation the eye reads as "detail"). Headless Chrome canvas, no image libraries.
//   node tools/grainmetric.mjs a.png b.png ... [--region x0,y0,x1,y1 as fractions, default the lower 45 %]
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const args = process.argv.slice(2); let region = [0, 0.55, 1, 1];
const ri = args.indexOf('--region'); if (ri >= 0) { region = args[ri + 1].split(',').map(Number); args.splice(ri, 2); }
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const f of args) {
  const src = 'data:image/png;base64,' + fs.readFileSync(path.resolve(f)).toString('base64');
  const m = await page.evaluate(async (src, region) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const W = c.width, H = c.height, d = x.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    const x0 = Math.max(1, Math.floor(region[0] * W)), x1 = Math.min(W - 1, Math.floor(region[2] * W)), y0 = Math.max(1, Math.floor(region[1] * H)), y1 = Math.min(H - 1, Math.floor(region[3] * H));
    let lap = 0, n = 0; for (let y = y0; y < y1; y++) for (let i = x0; i < x1; i++) { const k = y * W + i; lap += Math.abs(8 * L[k] - L[k - 1] - L[k + 1] - L[k - W] - L[k + W] - L[k - W - 1] - L[k - W + 1] - L[k + W - 1] - L[k + W + 1]) / 8; n++; }
    let blk = 0, nb = 0; for (let y = y0; y + 8 <= y1; y += 8) for (let i = x0; i + 8 <= x1; i += 8) { let s = 0; for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) s += L[(y + b) * W + i + a]; const mu = s / 64; let v = 0; for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) v += Math.abs(L[(y + b) * W + i + a] - mu); blk += v / 64; nb++; }
    return { lap: +(lap / n).toFixed(2), block: +(blk / nb).toFixed(2), size: [W, H] };
  }, src, region);
  console.log(`${path.basename(path.dirname(f))}/${path.basename(f)}  laplacian ${m.lap}  8x8 contrast ${m.block}  (${m.size.join('x')})`);
}
await browser.close();
