// follow an interior line of a drawing column by column (the chine line in the side view, the fuselage body line in the
// top view): from (x0, y0) step along x to x1, at each column take the dark run nearest the last position (within tol px)
//   node follow.mjs img.png x0 y0 x1 [tol] [step]  -> JSON [[x, y]...]
import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const [f, x0, y0, x1, tol = 3, step = 1] = process.argv.slice(2).map((v, i) => i ? +v : v);
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }); const pg = await br.newPage();
const out = await pg.evaluate(async (src, x0, y0, x1, tol, step) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, im.width, im.height).data, W = im.width;
  const dk = (x, y) => { const i = (y * W + x) * 4; return Math.min(d[i], d[i + 1], d[i + 2]) < 140; };
  const res = []; let y = y0; const dir = x1 > x0 ? 1 : -1;
  for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += dir * step) {
    let best = null; for (let yy = Math.round(y - tol - 6); yy <= y + tol + 6; yy++) if (dk(x, yy)) { let a = yy, b = yy; while (dk(x, b + 1)) b++; const m = (a + b) / 2; if (Math.abs(m - y) <= tol && (best == null || Math.abs(m - y) < Math.abs(best - y))) best = m; yy = b; }
    if (best != null) { y = best; res.push([x, +best.toFixed(1)]); } else res.push([x, null]);
  } return res; }, 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'), x0, y0, x1, tol, step);
console.log(JSON.stringify(out)); await br.close();
