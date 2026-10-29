#!/usr/bin/env node
// fit.mjs: measure how well a model's silhouette sits on a traced three-view. Generalised from NGC-1980's
// tools/hueyfit.mjs. Engine-agnostic: you supply silhouette masks, rendered by your engine.
//
//   CHROME_PATH=... node fit.mjs trace.json --side side_mask.png --top top_mask.png --front front_mask.png \
//        [--length 12.624] [--json fit.json] [--zmax-side 6.9] [--top-skip -1.0,0.85] [--zmax-top 2.5] [--front-y -1.35,0.5]
//
// Masks: the model's body alone (the same parts that were traced), flat black on white, rendered with an orthographic
// camera framed so that 1 mask px = 1 drawing px (the same image size and calibration as the drawing). In NGC-1980:
// dev/huey.html?ui=0&ref=<view>&mask=1 at the drawing's size.
// Spans are compared per column (side, top) or per row (front) against the trace.
// Output: IoU, max edge gap (m and % of --length) and the worst stations per view. Fix the worst station first.
// Targets: IoU >= 0.97 and max gap <= ~1% of length per view.
// Skip regions owned by other parts (the fin and tail rotor aft on the side view, the mast pylon on the top view,
// skids and cross tubes low on the front view), using the flags.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// puppeteer-core is resolved from the project you run this in (cwd), so the skill folder needs no node_modules
const puppeteer = (await import(pathToFileURL(createRequire(process.cwd() + '/').resolve('puppeteer-core')).href)).default;
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const pair = k => arg(k) ? arg(k).split(',').map(Number) : null;
const trace = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), C = trace.calibration, LEN = +(arg('--length') || 10);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
// (local: --runs) the run of black through the traced body's reference pixel (the side view's mid line, the top and front
// centre lines), as the tracer takes it, instead of the extreme black pixels: parts that do not touch the body in the
// drawing (stabilators past a gap, fins above the canopy in the front view) then count the same way in both
// --runs side,front: which views use runs (default: none); --front-runs-above y: in the front view, runs above y only
const RUNV = (arg('--runs') || '').split(','), RUNY = arg('--front-runs-above') != null ? +arg('--front-runs-above') : -Infinity;
const spansOf = async (file, view, win, refs, RUNS) => page.evaluate(async (src, view, win, refs, RUNS, half) => {
  const im = new Image(); im.src = src; await im.decode();
  const W = im.width, H = im.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, W, H).data, blk = (i, j) => d[(j * W + i) * 4] < 128;
  const res = [];
  if (RUNS) {
    const N = view === 'front' ? H : W;
    for (let k = 0; k < N; k++) {
      const r = refs[k]; if (r == null) { res.push([-1, -1]); continue; }
      const at = q => view === 'front' ? blk(q, k) : blk(k, q);
      if (!at(r)) { res.push([-1, -1]); continue; }
      let a = r, b = r; while (a - 1 >= win[0] && at(a - 1)) a--; while (b + 1 < win[1] && at(b + 1)) b++;
      if (half === 'lower') a = 2 * r - b;   // one half only (the top view's lower half), mirrored
      res.push([a, b]);
    }
    return res;
  }
  if (view === 'front') { for (let j = 0; j < H; j++) { let a = -1, b = -1; for (let i = win[0]; i < win[1]; i++) if (blk(i, j)) { if (a < 0) a = i; b = i; } res.push([a, b]); } }
  else { for (let i = 0; i < W; i++) { let a = -1, b = -1; for (let j = win[0]; j < win[1]; j++) if (blk(i, j)) { if (a < 0) a = j; b = j; } res.push([a, b]); } }
  return res;
}, 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'), view, win, refs, RUNS, C[view]?.half);
const extOf = (file, view, win) => spansOf(file, view, win, null, false);
const out = {};
for (const view of ['side', 'top', 'front']) {
  const file = arg('--' + view); if (!file || !trace[view] || !C[view]) continue;
  const cal = C[view], win = view === 'front' ? cal.cols : cal.rows;
  const refs = view === 'side' ? (() => { const r = []; for (const c of trace.side) if (c.top != null && c.bottom != null) r[Math.round(cal.x0 + (c.z - cal.zAtX0) * cal.s)] = Math.round(cal.groundPx - ((c.top + c.bottom) / 2 - cal.yGround) * cal.s); return Array.from({ length: 5000 }, (_, i) => r[i] ?? null); })() : Array.from({ length: 5000 }, () => Math.round(cal.centrePx));
  let sp = RUNV.includes(view) ? await spansOf(file, view, win, refs, true) : await extOf(file, view, win);
  if (view === 'front' && RUNV.includes('front')) { const ex = await extOf(file, view, win); sp = sp.map((r, j) => (cal.groundPx - j) / cal.s + cal.yGround > RUNY ? r : ex[j]); }
  let inter = 0, uni = 0, gap = 0, n = 0; const worst = [];
  const add = (a0, a1, s, at) => { if (!s || s[0] < 0) return; const [b0, b1] = s; const I = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)), U = Math.max(a1, b1) - Math.min(a0, b0); inter += I; uni += U; const g = Math.max(Math.abs(a0 - b0), Math.abs(a1 - b1)); worst.push([g, at]); gap = Math.max(gap, g); n++; };
  if (view === 'side') {
    const zmax = +(arg('--zmax-side') ?? Infinity);
    for (const c of trace.side) { if (c.top == null || c.bottom == null || c.z > zmax) continue; const i = Math.round(cal.x0 + (c.z - cal.zAtX0) * cal.s); add(cal.groundPx - (c.top - cal.yGround) * cal.s, cal.groundPx - (c.bottom - cal.yGround) * cal.s, sp[i], c.z); }
  } else if (view === 'top') {
    const zmax = +(arg('--zmax-top') ?? Infinity), skip = pair('--top-skip');
    for (const c of trace.top) { if (c.hw == null || c.z > zmax || (skip && c.z > skip[0] && c.z < skip[1])) continue; const i = Math.round(cal.xRef + (c.z - cal.zRef) * cal.s), h = c.hw * cal.s; add(cal.centrePx - h, cal.centrePx + h, sp[i], c.z); }
  } else {
    const yrs = arg('--front-y') ? arg('--front-y').split(';').map(r => r.split(',').map(Number)) : [[-Infinity, Infinity]];   // (local: several bands 'a,b;c,d')
    for (const r of trace.front) {
      if (r.left == null || !yrs.some(yr => r.y >= yr[0] && r.y <= yr[1])) continue;
      const m = Math.abs(r.left - r.right) > 0.1 ? Math.min(r.left, r.right) : null;   // one side crossed by a leftover line
      const j = Math.round(cal.groundPx - (r.y - cal.yGround) * cal.s); add(cal.centrePx - (m ?? r.left) * cal.s, cal.centrePx + (m ?? r.right) * cal.s, sp[j], r.y);
    }
  }
  worst.sort((a, b) => b[0] - a[0]); const gm = gap / cal.s;
  out[view] = { iou: +(inter / (uni || 1)).toFixed(4), maxGapM: +gm.toFixed(3), maxGapPct: +(100 * gm / LEN).toFixed(2), samples: n, worst: worst.slice(0, 8).map(w => ({ at: +w[1].toFixed(3), gapM: +(w[0] / cal.s).toFixed(3) })) };
  const ok = out[view].iou >= 0.97 && out[view].maxGapPct <= 1.2 ? 'PASS' : 'WORK';
  console.log(`${view.padEnd(6)} IoU ${out[view].iou}  max gap ${out[view].maxGapM} m (${out[view].maxGapPct}%)  ${ok}  worst at ${out[view].worst.slice(0, 4).map(w => w.at + ':' + w.gapM + 'm').join(' ')}`);
}
await browser.close();
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
