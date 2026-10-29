// node extent.mjs img.png x0 y0 x1 y1 : dark-pixel bbox and per-row/col extremes
import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const [f, ...r] = process.argv.slice(2); const [x0, y0, x1, y1] = r.map(Number);
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }); const pg = await br.newPage();
const out = await pg.evaluate(async (src, x0, y0, x1, y1) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data, W = x1 - x0; let a = 1e9, b = -1, cc = 1e9, e = -1; for (let y = 0; y < y1 - y0; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (Math.min(d[i], d[i + 1], d[i + 2]) < 140) { a = Math.min(a, x); b = Math.max(b, x); cc = Math.min(cc, y); e = Math.max(e, y); } } return { xmin: a + x0, xmax: b + x0, ymin: cc + y0, ymax: e + y0, W: im.width, H: im.height }; }, 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'), x0, y0, x1, y1);
console.log(JSON.stringify(out)); await br.close();
