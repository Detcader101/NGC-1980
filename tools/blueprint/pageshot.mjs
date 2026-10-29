#!/usr/bin/env node
// pageshot.mjs - screenshot a dev page (e.g. dev/tomcat.html?ui=0&ref=side&mask=1) at a given size, after it has drawn
// a few frames. Used for the blueprint fit masks, overlays and model previews.
//   CHROME_PATH=... node blueprint/pageshot.mjs "<url>" out.png [width height] [--wait ms] [--eval "js"]
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); if (i < 0) return null; const v = a[i + 1]; a.splice(i, 2); return v; };
const waitMs = +(opt('--wait') || 2500), js = opt('--eval');
const [url, out, w = 1600, h = 900] = a;
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await br.newPage(); await pg.setViewport({ width: +w, height: +h });
const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await pg.goto(url, { waitUntil: 'load' });
await pg.waitForFunction('!!window.__T', { timeout: 120000 }).catch(() => errs.push('no window.__T'));
if (js) console.log('eval:', JSON.stringify(await pg.evaluate(js)));
await new Promise(r => setTimeout(r, waitMs));
await pg.screenshot({ path: out });
if (errs.length) console.log('ERRORS:\n' + errs.slice(0, 8).join('\n'));
console.log('wrote', out);
await br.close();
