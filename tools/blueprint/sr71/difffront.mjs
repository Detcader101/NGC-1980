// front view difference image: red = drawing silhouette (the trace's run per row) only, blue = model mask only, grey = both
//   node difffront.mjs mask-front.png sr71trace.json out.png x0 y0 x1 y1
import puppeteer from 'puppeteer-core'; import fs from 'node:fs';
const [mask, tr, out, x0, y0, x1, y1] = process.argv.slice(2); const T = JSON.parse(fs.readFileSync(tr, 'utf8')); const C = T.calibration.front;
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }); const pg = await br.newPage();
const d = await pg.evaluate(async (src, front, C, x0, y0, x1, y1) => { const im = new Image(); im.src = src; await im.decode(); const W = im.width, H = im.height, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const id = g.getImageData(0, 0, W, H), p = id.data;
  const rows = []; for (const r of front) if (r.left != null) rows[Math.round(C.groundPx - (r.y - C.yGround) * C.s)] = r;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, m = p[i] < 128, r = rows[y], t = !!r && x >= C.centrePx - r.left * C.s && x <= C.centrePx + r.right * C.s; p[i] = m && t ? 150 : t ? 230 : m ? 40 : 255; p[i + 1] = m && t ? 150 : t ? 40 : m ? 60 : 255; p[i + 2] = m && t ? 150 : t ? 40 : m ? 230 : 255; }
  g.putImageData(id, 0, 0); const o = document.createElement('canvas'); o.width = x1 - x0; o.height = y1 - y0; o.getContext('2d').drawImage(c, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0); return o.toDataURL(); }, 'data:image/png;base64,' + fs.readFileSync(mask).toString('base64'), T.front, C, +x0, +y0, +x1, +y1);
fs.writeFileSync(out, Buffer.from(d.split(',')[1], 'base64')); await br.close();
