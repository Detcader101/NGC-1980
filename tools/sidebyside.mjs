#!/usr/bin/env node
// sidebyside.mjs - join screenshots into one labelled PNG with headless Chrome (no image libraries needed).
//   node sidebyside.mjs out.png "label A=path/a.png" "label B=path/b.png" [--width 1600]
// Images are placed left to right at equal width, each with its label above it.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = process.argv.slice(2);
let width = 1600; const wi = args.indexOf('--width'); if (wi >= 0) { width = +args[wi + 1]; args.splice(wi, 2); }
const [out, ...items] = args;
if (!out || !items.length) { console.error('usage: node sidebyside.mjs out.png "label=img.png" ...'); process.exit(1); }
const cells = items.map(s => { const i = s.lastIndexOf('='); const file = path.resolve(s.slice(i + 1)); return { label: s.slice(0, i), src: 'data:image/png;base64,' + fs.readFileSync(file).toString('base64') }; });
const w = Math.floor(width / cells.length);
const html = `<html><body style="margin:0;background:#111;display:flex;font:14px monospace;color:#ddd">${cells.map(c => `<div style="width:${w}px"><div style="padding:4px 6px">${c.label}</div><img src="${c.src}" style="width:${w}px;display:block"></div>`).join('')}</body></html>`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: w * cells.length, height: 200 });
await page.setContent(html, { waitUntil: 'load' });
const h = await page.evaluate(() => document.body.scrollHeight);
await page.setViewport({ width: w * cells.length, height: h });
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
