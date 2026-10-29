#!/usr/bin/env node
// (NGC-1980 copy of the milsim-blueprint skill script; local addition: top.half)
// trace3view.mjs: trace a dimensioned three-view line drawing into per-station profiles in model metres.
// Generalised from NGC-1980's tools/hueytrace.mjs (the UH-1H, traced from the TM 55-1520-210-10 figure).
//
//   CHROME_PATH=<chrome or chrome-headless-shell> node trace3view.mjs config.json [--debug silhouette.png]
//
// Needs puppeteer-core (it decodes the image in a headless browser canvas).
// Method:
//   1. threshold the line art (dark < `threshold`);
//   2. erase long straight runs (dimension and extension lines, the ground line, rotor blades lying over a view);
//      body outlines are curved and never run straight that far;
//   3. dilate by `dilate` px to close small gaps;
//   4. flood the background from the border; whatever the flood can't reach is the silhouette (shrunk back by the
//      dilation, so the edge sits on the line's centre);
//   5. per column (side, top) or per row (front), take the silhouette run through the body's centre line, so detached
//      parts (skids, rotors, labels) are ignored;
//   6. station ranges in `exclude` (mast, cutters, antennas, struts, exhausts) come out as null and are bridged later
//      by loft.mjs's sampler. Model those parts separately.
//
// config.json (pixel coordinates in the drawing image; model frame x right, y up, z along the body):
// {
//   "image": "reference/uh1/tm-3view.png", "out": "uh1trace.json", "source": "<citation>", "frame": "<frame note>",
//   "threshold": 140, "eraseLen": 150, "dilate": 2,
//   "side":  { "x0": 460, "x1": 1731, "rows": [1150, 1475], "s": 100.68, "zAtX0": -3.693, "groundPx": 1503, "yGround": -1.84,
//              "centre": [[-3.69, -0.62], [-3.0, -0.45], [2.6, -0.45], [7.9, -0.05]],
//              "exclude": { "top": [[-0.48, 0.45]], "bottom": [[-1.95, -1.5]] } },
//   "top":   { "x0": 460, "x1": 1734, "rows": [60, 370], "s": 99.4, "xRef": 829, "zRef": -0.12, "centrePx": 214.5,
//              "probe": [0, -6, 6, -12, 12, -20, 20], "zMax": 2.55, "exclude": [] },
//   "front": { "rows": [640, 880], "cols": [600, 1050], "s": 99.9, "centrePx": 825.25, "groundPx": 909.5, "yGround": -1.84 }
// }
// Scale: s = (pixel distance between the ends of a labelled dimension) / (that dimension in metres). Prefer the longest
// label in each view. Any view may be left out.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
// puppeteer-core is resolved from the project you run this in (cwd), so the skill folder needs no node_modules
const puppeteer = (await import(pathToFileURL(createRequire(process.cwd() + '/').resolve('puppeteer-core')).href)).default;

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('usage: node trace3view.mjs config.json [--debug out.png]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')), base = path.dirname(path.resolve(cfgPath));
const di = process.argv.indexOf('--debug'), dbg = di > 0 ? process.argv[di + 1] : null;
const img = path.resolve(base, cfg.image), out = path.resolve(base, cfg.out || 'trace.json');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
const res = await page.evaluate(async (src, cfg, wantDbg) => {
  const im = new Image(); im.src = src; await im.decode();
  const W = im.width, H = im.height, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0); const px = cx.getImageData(0, 0, W, H).data;
  const thr = cfg.threshold ?? 140, L = cfg.eraseLen ?? 150, R = cfg.dilate ?? 2;
  // the darkest channel, so coloured line art (red, blue) thresholds as well as black
  const dark = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) dark[i] = Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) < thr ? 1 : 0;
  const kill = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { let s0 = -1; for (let x = 0; x <= W; x++) { const d = x < W && dark[y * W + x]; if (d && s0 < 0) s0 = x; if (!d && s0 >= 0) { if (x - s0 >= L) for (let k = s0; k < x; k++) kill[y * W + k] = 1; s0 = -1; } } }
  for (let x = 0; x < W; x++) { let s0 = -1; for (let y = 0; y <= H; y++) { const d = y < H && dark[y * W + x]; if (d && s0 < 0) s0 = y; if (!d && s0 >= 0) { if (y - s0 >= L) for (let k = s0; k < y; k++) kill[k * W + x] = 1; s0 = -1; } } }
  for (let i = 0; i < W * H; i++) if (kill[i]) dark[i] = 0;
  // (local addition) cfg.draw: [[x0, y0, x1, y1]...] dark segments drawn after the erase, to seal gaps where an erased
  // centre or extension line crossed the outline
  for (const [x0, y0, x1, y1] of cfg.draw || []) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1; for (let k = 0; k <= n; k++) { const X = Math.round(x0 + (x1 - x0) * k / n), Y = Math.round(y0 + (y1 - y0) * k / n); if (X >= 0 && Y >= 0 && X < W && Y < H) dark[Y * W + X] = 1; } }
  const wall = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark[y * W + x]) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) wall[Y * W + X] = 1; }
  const bg = new Uint8Array(W * H), st = [];
  const push = (x, y) => { const i = y * W + x; if (!wall[i] && !bg[i]) { bg[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); } for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1); }
  const sil = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) sil[i] = bg[i] ? 0 : 1;
  const inSil = (x, y) => x >= 0 && y >= 0 && x < W && y < H && sil[y * W + x];
  const colRun = (x, yRef, y0, y1) => { if (!inSil(x, yRef)) return null; let a = yRef, b = yRef; while (a - 1 >= y0 && inSil(x, a - 1)) a--; while (b + 1 <= y1 && inSil(x, b + 1)) b++; return [a + R, b - R]; };
  const rowRun = (y, xRef, x0, x1) => { if (!inSil(xRef, y)) return null; let a = xRef, b = xRef; while (a - 1 >= x0 && inSil(a - 1, y)) a--; while (b + 1 <= x1 && inSil(b + 1, y)) b++; return [a + R, b - R]; };
  const ex = (z, list) => (list || []).some(([a, b]) => z >= a && z <= b);
  const pl = pts => z => { if (z <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, v0] = pts[i - 1], [z1, v1] = pts[i]; return v0 + (v1 - v0) * (z - z0) / (z1 - z0); } return pts[pts.length - 1][1]; };
  const r4 = v => +v.toFixed(4), result = {};
  if (cfg.side) {
    const S = cfg.side, zOf = x => (x - S.x0) / S.s + S.zAtX0, yOf = py => (S.groundPx - py) / S.s + S.yGround, pyOf = y => S.groundPx - (y - S.yGround) * S.s;
    const centre = pl(S.centre), side = [];
    for (let x = S.x0; x <= S.x1; x++) {
      const z = zOf(x), r = colRun(x, Math.round(pyOf(centre(z))), S.rows[0], S.rows[1]);
      side.push({ z: r4(z), top: r && !ex(z, S.exclude?.top) ? r4(yOf(r[0])) : null, bottom: r && !ex(z, S.exclude?.bottom) ? r4(yOf(r[1])) : null });
    }
    result.side = side;
  }
  if (cfg.top) {
    // half-width from the centre line; probing several offsets survives a rotor blade or a leaked line on one half
    const T = cfg.top, zOf = x => (x - T.xRef) / T.s + T.zRef, top = [];
    for (let x = T.x0; x <= T.x1; x++) {
      const z = zOf(x); let best = 0;
      for (const off of T.probe || [0]) { const r = colRun(x, Math.round(T.centrePx + off), T.rows[0], T.rows[1]); if (r) best = Math.max(best, T.half === "upper" ? 0 : r[1] - T.centrePx, T.half === "lower" ? 0 : T.centrePx - r[0]); }   // (half: "lower" | "upper" uses one half only, when the halves differ: a bottom view over a top view)
      top.push({ z: r4(z), hw: best > 0 && !ex(z, T.exclude) && !(T.zMax != null && z > T.zMax) ? r4(best / T.s) : null });
    }
    result.top = top;
  }
  if (cfg.front) {
    const F = cfg.front, yOf = py => (F.groundPx - py) / F.s + F.yGround, front = [];
    for (let py = F.rows[0]; py <= F.rows[1]; py++) {
      const r = rowRun(py, Math.round(F.centrePx), F.cols[0], F.cols[1]);
      front.push({ y: r4(yOf(py)), left: r ? r4((F.centrePx - r[0]) / F.s) : null, right: r ? r4((r[1] - F.centrePx) / F.s) : null });
    }
    result.front = front;
  }
  if (wantDbg) { const id = cx.getImageData(0, 0, W, H); for (let i = 0; i < W * H; i++) if (sil[i] && !dark[i]) { id.data[i * 4] = 120; id.data[i * 4 + 1] = 160; id.data[i * 4 + 2] = 255; } cx.putImageData(id, 0, 0); result.dbgUrl = cv.toDataURL('image/png'); }
  result.W = W; result.H = H; return result;
}, 'data:image/png;base64,' + fs.readFileSync(img).toString('base64'), cfg, !!dbg);
await browser.close();
if (dbg) fs.writeFileSync(dbg, Buffer.from(res.dbgUrl.split(',')[1], 'base64'));
const outJson = { source: cfg.source || cfg.image, frame: cfg.frame || '', calibration: { side: cfg.side, top: cfg.top, front: cfg.front }, side: res.side, top: res.top, front: res.front };
fs.writeFileSync(out, JSON.stringify(outJson));
const n = a => a ? a.filter(s => (s.top ?? s.hw ?? s.left) != null).length + '/' + a.length : '-';
console.log(`traced ${path.basename(img)} (${res.W}x${res.H}): side ${n(res.side)}, top ${n(res.top)}, front ${n(res.front)} -> ${out}`);
