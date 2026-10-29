// list the dark line crossings along columns or rows of a drawing (to read interior lines: chine, nacelle, fuselage body)
//   node scan.mjs img.png col|row <x or y list comma> <from> <to>
import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const [f, mode, list, a, b] = process.argv.slice(2);
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }); const pg = await br.newPage();
const out = await pg.evaluate(async (src, mode, list, a, b) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, im.width, im.height).data, W = im.width;
  const res = {}; for (const v of list) { const runs = []; let s = -1; for (let t = a; t <= b + 1; t++) { const x = mode === 'col' ? v : t, y = mode === 'col' ? t : v, i = (y * W + x) * 4, dk = t <= b && Math.min(d[i], d[i + 1], d[i + 2]) < 140; if (dk && s < 0) s = t; if (!dk && s >= 0) { runs.push(((s + t - 1) / 2).toFixed(1)); s = -1; } } res[v] = runs.join(' '); } return res; }, 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'), mode, list.split(',').map(Number), +a, +b);
for (const k in out) console.log(mode, k, ':', out[k]); await br.close();
