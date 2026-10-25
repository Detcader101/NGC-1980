// Makes the experimental build's icon: the main icon with a hazard-orange "EXP" band, packed as launcher/thrust-zarch-exp.ico.
//   node tools/badge-icon.mjs [LABEL] [#colour] [out-name]   (default EXP #ff7a00 thrust-zarch-exp; e.g. SIM #00b8d4 thrust-zarch-sim)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'launcher', 'thrust-zarch.png'), OUT = path.join(ROOT, 'launcher', (process.argv[4] || 'thrust-zarch-exp') + '.ico');
const LABEL = process.argv[2] || 'EXP', COLOR = process.argv[3] || '#ff7a00';
const BROWSERS = [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const SIZES = [256, 64, 48, 32, 16];

const browser = await puppeteer.launch({ executablePath: BROWSERS.find(p => fs.existsSync(p)), headless: 'new', args: ['--no-first-run'] });
try {
  const page = await browser.newPage();
  const pngs = await page.evaluate(async (b64, sizes, label, color) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    return sizes.map(n => {
      const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, n, n);
      // diagonal hazard band across the bottom-right corner
      x.save(); x.translate(n * 0.62, n * 0.78); x.rotate(-Math.PI / 4);
      x.fillStyle = color; x.fillRect(-n, -n * 0.11, n * 2, n * 0.22);
      if (n >= 32) { x.fillStyle = '#111'; x.font = `bold ${Math.round(n * 0.15)}px Consolas, monospace`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 0, n * 0.01); }
      x.restore();
      return c.toDataURL('image/png').split(',')[1];
    });
  }, fs.readFileSync(SRC).toString('base64'), SIZES, LABEL, COLOR);
  const bufs = pngs.map(p => Buffer.from(p, 'base64'));
  const head = Buffer.alloc(6 + 16 * bufs.length); head.writeUInt16LE(1, 2); head.writeUInt16LE(bufs.length, 4);
  let off = head.length;
  bufs.forEach((b, i) => {
    const e = 6 + 16 * i, n = SIZES[i] >= 256 ? 0 : SIZES[i];
    head.writeUInt8(n, e); head.writeUInt8(n, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(b.length, e + 8); head.writeUInt32LE(off, e + 12); off += b.length;
  });
  fs.writeFileSync(OUT, Buffer.concat([head, ...bufs]));
  fs.writeFileSync(OUT.replace('.ico', '.png'), bufs[0]);
  console.log('wrote', OUT);
} finally { await browser.close(); }
