// crop (and scale) an image: node crop.mjs in.png out.png x0 y0 x1 y1 [scale]
import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const [f, o, ...r] = process.argv.slice(2); const [x0, y0, x1, y1, s = 1] = r.map(Number);
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }); const pg = await br.newPage();
const mime = /\.jpe?g$/i.test(f) ? 'jpeg' : 'png';
const d = await pg.evaluate(async (src, x0, y0, x1, y1, s) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = Math.round((x1 - x0) * s); c.height = Math.round((y1 - y0) * s); const g = c.getContext('2d'); g.imageSmoothingEnabled = s < 1; g.drawImage(im, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height); return c.toDataURL('image/png'); }, `data:image/${mime};base64,` + fs.readFileSync(f).toString('base64'), x0, y0, x1, y1, s);
fs.writeFileSync(o, Buffer.from(d.split(',')[1], 'base64')); await br.close(); console.log('wrote', o);
