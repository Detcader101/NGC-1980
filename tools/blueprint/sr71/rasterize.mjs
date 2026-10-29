// rasterize the USAF SR-71A three-view SVG (Commons, PD) at 2x for tracing: node blueprint/sr71/rasterize.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const D = path.dirname(fileURLToPath(import.meta.url)), REF = path.resolve(D, '../../../docs/ngc1980/reference/sr71');
const svg = fs.readFileSync(path.join(REF, 'usaf-sr71a-3view.svg'), 'utf8'), K = 2;
const br = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const pg = await br.newPage(); await pg.setViewport({ width: 1854 * K, height: 1419 * K });
await pg.setContent(`<html><body style="margin:0;background:#fff"><img id=i style="width:${1854 * K}px;height:${1419 * K}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
await pg.waitForFunction('document.getElementById("i").complete');
await pg.screenshot({ path: path.join(REF, 'usaf-sr71a-3view-2x.png') }); await br.close(); console.log('wrote 2x png');
