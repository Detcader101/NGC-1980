#!/usr/bin/env node
// grid.mjs - a labelled contact sheet of screenshots (headless Chrome, no image libraries).
//   node grid.mjs out.png [--cols 3] [--width 1800] a.png b.png "label=c.png" ...
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = +args[i + 1]; args.splice(i, 2); return v; };
const cols = opt('--cols', 3), width = opt('--width', 1800);
const [out, ...items] = args;
const cells = items.map(s => { const i = s.lastIndexOf('='); const f = path.resolve(i > 0 && !s.slice(0, i).includes('/') ? s.slice(i + 1) : s); return { label: i > 0 && !s.slice(0, i).includes('/') ? s.slice(0, i) : path.basename(f), src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') }; });
const w = Math.floor(width / cols);
const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px);font:12px monospace;color:#ddd">${cells.map(c => `<div><div style="padding:2px 4px">${c.label}</div><img src="${c.src}" style="width:${w}px;display:block"></div>`).join('')}</body></html>`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: w * cols, height: 200 });
await page.setContent(html, { waitUntil: 'load' });
const h = await page.evaluate(() => document.body.scrollHeight);
await page.setViewport({ width: w * cols, height: h });
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
