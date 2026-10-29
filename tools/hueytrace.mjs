#!/usr/bin/env node
// hueytrace.mjs - trace the TM 55-1520-210-10 principal-dimensions figure (public domain, docs/ngc1980/reference/uh1)
// into the UH-1H station table the hi-fi model is lofted from (game/js/uh1trace.json + uh1trace.js).
//   CHROME_PATH=... node hueytrace.mjs [--debug out.png]
// Method: threshold the line art, close 2 px gaps, flood the background from the border; whatever the flood cannot
// reach is the aircraft's silhouette. Per column of the side view, the silhouette run that contains the body's centre
// line gives the upper and lower profile; per column of the top view, the run through the centre line gives the
// half-width; per row of the front view, the run through the centre gives the cross-section's half-width. Parts that
// stick out of the body (mast, wire cutters, antennas, skid struts, chin cutter, the rotor blade lying over the top
// view) are masked by station ranges and bridged by interpolation; see EXCLUDE. Calibration (px):
//   side:  nose x 460, tail x 1731 = 41 ft 5.0 in (12.624 m -> 100.68 px/m); ground y 1503 (= model y -1.84);
//          hub 11 ft 8.65 in (3.573 m) aft of the nose (= model z -0.12)
//   front: skid track 695 .. 955.5 = 8 ft 6.6 in (2.6075 m -> 99.9 px/m); centre x 825.25; ground y 909.5
//   top:   hub x 829 (z -0.12), tail x 1734.5 (z 8.93 -> 99.4 px/m), centre line y 214.5
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const TOOLS = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(TOOLS, '..');
const IMG = path.join(ROOT, 'docs/ngc1980/reference/uh1/tm55-1520-210-10_3view.png');
const OUT = path.join(ROOT, 'game/js/uh1trace.json'), OUTJS = path.join(ROOT, 'game/js/uh1trace.js');
const dbg = process.argv.indexOf('--debug') > 0 ? process.argv[process.argv.indexOf('--debug') + 1] : null;
const CAL = {
  side: { s: 100.68, x0: 460, zNose: -3.693, y0: 1503, yGround: -1.84 },
  front: { s: 99.9, xc: 825.25, y0: 909.5, yGround: -1.84 },
  top: { s: 99.4, xh: 829, zHub: -0.12, yc: 214.5 },
};
// station ranges (model z, m) where something not part of the body breaks the outline; values there are interpolated
const EXCLUDE = {
  sideTop: [[-2.47, -2.02], [-1.92, -1.66], [-0.48, 0.45], [1.30, 1.62], [2.24, 2.50]],   // wire cutter, cabin light, mast pylon, antenna, exhaust stack
  sideBottom: [[-3.62, -2.95], [-1.95, -1.50], [0.42, 0.78], [-0.16, 0.10]],             // chin cutter, cross-tube struts, belly antenna
  top: [[-3.63, -3.59]],   // a leak through the erased blade edge at the nose
};

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage();
const res = await page.evaluate(async (src, CAL, EXCLUDE, wantDbg) => {
  const im = new Image(); im.src = src; await im.decode();
  const W = im.width, H = im.height, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0); const px = cx.getImageData(0, 0, W, H).data;
  // 1 dark line, dilated by R px (closes gaps in the scan), 2 background reached by the flood
  const dark = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) dark[i] = px[i * 4] < 140 ? 1 : 0;
  // erase long straight lines (dimension and extension lines, the ground line, the rotor blades): they would close
  // false regions against the outline; the body outline is curved and never runs straight that long
  const L = 150, kill = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { let s0 = -1; for (let x = 0; x <= W; x++) { const d = x < W && dark[y * W + x]; if (d && s0 < 0) s0 = x; if (!d && s0 >= 0) { if (x - s0 >= L) for (let k = s0; k < x; k++) kill[y * W + k] = 1; s0 = -1; } } }
  for (let x = 0; x < W; x++) { let s0 = -1; for (let y = 0; y <= H; y++) { const d = y < H && dark[y * W + x]; if (d && s0 < 0) s0 = y; if (!d && s0 >= 0) { if (y - s0 >= L) for (let k = s0; k < y; k++) kill[k * W + x] = 1; s0 = -1; } } }
  for (let i = 0; i < W * H; i++) if (kill[i]) dark[i] = 0;
  const R = 2, wall = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark[y * W + x]) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) wall[Y * W + X] = 1; }
  const bg = new Uint8Array(W * H), st = [];
  const push = (x, y) => { const i = y * W + x; if (!wall[i] && !bg[i]) { bg[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); } for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1); }
  // silhouette = not background, shrunk back by the dilation radius (so lines sit on the outline's centre)
  const sil = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) sil[i] = bg[i] ? 0 : 1;
  const inSil = (x, y) => x >= 0 && y >= 0 && x < W && y < H && sil[y * W + x];
  const runAt = (x, yRef, y0, y1, vertical = true) => {   // the run of silhouette through (x, yRef) inside [y0, y1]
    if (!inSil(x, yRef)) return null; let a = yRef, b = yRef;
    while (a - 1 >= y0 && inSil(x, a - 1)) a--; while (b + 1 <= y1 && inSil(x, b + 1)) b++; return [a + R, b - R];
  };
  const rowRun = (y, xRef, x0, x1) => { if (!inSil(xRef, y)) return null; let a = xRef, b = xRef; while (a - 1 >= x0 && inSil(a - 1, y)) a--; while (b + 1 <= x1 && inSil(b + 1, y)) b++; return [a + R, b - R]; };
  const ex = (z, list) => list.some(([a, b]) => z >= a && z <= b);
  // ---- side view: upper and lower profile per column
  const S = CAL.side, zOf = x => (x - S.x0) / S.s + S.zNose, yOf = py => (S.y0 - py) / S.s + S.yGround, pyOf = y => S.y0 - (y - S.yGround) * S.s;
  const centre = z => z < -3.0 ? -0.62 + (z + 3.69) * 0.03 : z < 2.6 ? -0.45 : -0.45 + (z - 2.6) / 5.3 * 0.4;
  const side = [];
  for (let x = S.x0; x <= 1731; x++) {
    const z = zOf(x), r = runAt(x, Math.round(pyOf(centre(z))), 1150, 1475);
    side.push({ z: +z.toFixed(4), top: r && !ex(z, EXCLUDE.sideTop) ? +yOf(r[0]).toFixed(4) : null, bottom: r && !ex(z, EXCLUDE.sideBottom) ? +yOf(r[1]).toFixed(4) : null });
  }
  // ---- top view: half-width per column (the rotor blade lies along the centre line and the boom: only the outline
  // below the centre line (the +x side as drawn, y > yc) is free of the blade from the nose to the boom root)
  const T = CAL.top, zT = x => (x - T.xh) / T.s + T.zHub, top = [];
  for (let x = Math.round(T.xh + (-3.69 - T.zHub) * T.s); x <= 1734; x++) {
    const z = zT(x); let hw = null;
    // scan from far below the centre line up to the first outline pixel of the body
    // both halves (one or the other leaks where an erased blade line crossed the outline): the larger is the body
    // half-widths measured outward from the centre line on each side: the outline pixel farthest from the centre
    // that is still connected to it through the silhouette (start points along the centre band, the blade band can
    // be flooded where its erased edges left gaps)
    let best = 0;
    for (const off of [0, -6, 6, -12, 12, -20, 20, -30, 30]) { const r = runAt(x, Math.round(T.yc + off), 60, 370); if (r) best = Math.max(best, r[1] - T.yc, T.yc - r[0]); }
    if (best > 0 && !ex(z, EXCLUDE.top)) hw = +(best / T.s).toFixed(4);
    if (z > 2.55) hw = null;   // aft of the boom root the rotor blade lies over the boom outline: see BOOM_HW in the model
    top.push({ z: +z.toFixed(4), hw });
  }
  // ---- front view: half-width per row through the centre
  const F = CAL.front, yF = py => (F.y0 - py) / F.s + F.yGround, front = [];
  for (let py = 640; py <= 880; py++) { const r = rowRun(py, Math.round(F.xc), 600, 1050); front.push({ y: +yF(py).toFixed(4), left: r ? +((F.xc - r[0]) / F.s).toFixed(4) : null, right: r ? +((r[1] - F.xc) / F.s).toFixed(4) : null }); }
  let dbgUrl = null;
  if (wantDbg) { const id = cx.getImageData(0, 0, W, H); for (let i = 0; i < W * H; i++) if (sil[i] && !dark[i]) { id.data[i * 4] = 120; id.data[i * 4 + 1] = 160; id.data[i * 4 + 2] = 255; } cx.putImageData(id, 0, 0); dbgUrl = cv.toDataURL('image/png'); }
  return { side, top, front, dbgUrl, W, H };
}, 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64'), CAL, EXCLUDE, !!dbg);
await browser.close();
if (dbg) fs.writeFileSync(dbg, Buffer.from(res.dbgUrl.split(',')[1], 'base64'));
const out = {
  source: 'TM 55-1520-210-10 Operator\'s Manual UH-1H/V (HQ Dept. of the Army, 1986) p. 29, principal dimensions figure; Wikimedia Commons File:Bell_UH-1H_Iroquois_3-view_line_drawing.png (public domain); traced by tools/hueytrace.mjs',
  frame: 'model metres: x right, y up, z aft; nose tip z -3.69, ground y -1.84, main rotor hub z -0.12',
  calibration: CAL, exclude: EXCLUDE,
  side: res.side, top: res.top, front: res.front,
};
fs.writeFileSync(OUT, JSON.stringify(out));
fs.writeFileSync(OUTJS, '// generated by tools/hueytrace.mjs from the TM 55-1520-210-10 three-view (public domain); see uh1trace.json\nexport const UH1_TRACE = ' + JSON.stringify(out) + ';\n');
const n = k => res[k].filter(s => (s.top ?? s.hw ?? s.left) != null).length;
console.log('side', res.side.length, 'cols (', n('side'), 'with data), top', res.top.length, '(', n('top'), '), front', res.front.length, '->', OUT);
