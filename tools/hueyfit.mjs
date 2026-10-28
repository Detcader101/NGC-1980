#!/usr/bin/env node
// hueyfit.mjs - measure the hi-fi UH-1H against the traced TM three-view: renders dev/huey.html?ref=<view>&mask=1 at
// the drawing's pixel size (1970 x 1586, so 1 px = 1 drawing px), takes the body's silhouette and compares it with
// the traced outline (game/js/uh1trace.json) column by column (side, top) or row by row (front).
// Reports IoU and the maximum edge gap (m and % of the 12.62 m fuselage) per view, and the worst stations.
//   CHROME_PATH=... node hueyfit.mjs [--url http://127.0.0.1:8801/] [--json out.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const base = arg('--url') || 'http://127.0.0.1:8801/';
const trace = JSON.parse(fs.readFileSync(path.join(ROOT, 'game/js/uh1trace.json'), 'utf8'));
const C = trace.calibration, LEN = 12.624;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1970, height: 1586 });
const out = {};
for (const view of ['side', 'top', 'front']) {
  await page.goto(new URL(`dev/huey.html?ui=0&ref=${view}&mask=1`, base).href, { waitUntil: 'load' });
  await page.waitForFunction('!!window.__H', { timeout: 120000 });
  // the body silhouette as per-column (or per-row) spans in drawing pixels
  const spans = await page.evaluate((view) => {
    __H.render(0); const cv = __H.renderer.domElement, W = cv.width, H = cv.height;
    const c2 = document.createElement('canvas'); c2.width = 1970; c2.height = 1586; const x = c2.getContext('2d'); x.drawImage(cv, 0, 0, 1970, 1586);
    const d = x.getImageData(0, 0, 1970, 1586).data, blk = (i, j) => d[(j * 1970 + i) * 4] < 128;
    const res = [];
    if (view === 'front') { for (let j = 0; j < 1586; j++) { let a = -1, b = -1; for (let i = 600; i < 1050; i++) if (blk(i, j)) { if (a < 0) a = i; b = i; } res.push([a, b]); } }
    else { const [y0, y1] = view === 'side' ? [1000, 1500] : [40, 400]; for (let i = 0; i < 1970; i++) { let a = -1, b = -1; for (let j = y0; j < y1; j++) if (blk(i, j)) { if (a < 0) a = j; b = j; } res.push([a, b]); } }
    return { res, W, H };
  }, view);
  const sp = spans.res; let inter = 0, uni = 0, gap = 0, worst = [], n = 0;
  const add = (a0, a1, b0, b1, at) => { if (a0 == null || b0 < 0) return; const I = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)), U = Math.max(a1, b1) - Math.min(a0, b0); inter += I; uni += U; const g = Math.max(Math.abs(a0 - b0), Math.abs(a1 - b1)); worst.push([g, at, a0, a1, b0, b1]); gap = Math.max(gap, g); n++; };
  if (view === 'side') {
    const S = C.side; for (const c of trace.side) { if (c.top == null || c.bottom == null || c.z > 6.9) continue; /* aft of z 6.9 the fin and tail rotor own the outline */ const i = Math.round(S.x0 + (c.z - S.zNose) * S.s); const pyT = S.y0 - (c.top - S.yGround) * S.s, pyB = S.y0 - (c.bottom - S.yGround) * S.s; add(pyT, pyB, sp[i][0], sp[i][1], c.z); }
    gap /= S.s;
  } else if (view === 'top') {
    const T = C.top; for (const c of trace.top) { if (c.hw == null || c.z > 2.5 || (c.z > -1.0 && c.z < 0.85)) continue; const i = Math.round(T.xh + (c.z - T.zHub) * T.s); const h = c.hw * T.s; add(T.yc - h, T.yc + h, sp[i][0], sp[i][1], c.z); }
    gap /= T.s;
  } else {
    const F = C.front; for (const r of trace.front) { if (r.left == null || r.y > 0.5 || r.y < -1.35) continue; /* below -1.35: cross tubes and saddles */
      if (Math.abs(r.left - r.right) > 0.1) { const m = Math.min(r.left, r.right); r.left = r.right = m; } /* one side crossed by an extension line */ const j = Math.round(F.y0 - (r.y - F.yGround) * F.s); add(F.xc - r.left * F.s, F.xc + r.right * F.s, sp[j][0], sp[j][1], r.y); }
    gap /= F.s;
  }
  worst.sort((a, b) => b[0] - a[0]);
  out[view] = { iou: +(inter / uni).toFixed(4), maxGapM: +gap.toFixed(3), maxGapPct: +(100 * gap / LEN).toFixed(2), samples: n, worst: worst.slice(0, 8).map(w => ({ at: +w[1].toFixed(3), gapPx: +w[0].toFixed(1), trace: [Math.round(w[2]), Math.round(w[3])], model: w.slice(4) })) };
  console.log(view.padEnd(6), 'IoU', out[view].iou, ' max gap', out[view].maxGapM, 'm (', out[view].maxGapPct, '% )  worst at', out[view].worst.slice(0, 4).map(w => w.at + ':' + w.gapPx + 'px').join(' '));
}
await browser.close();
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
