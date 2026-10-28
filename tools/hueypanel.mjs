#!/usr/bin/env node
// hueypanel.mjs - trace TM 55-1520-210-10 fig. 2-4 "Instrument panel (typical)" (public domain,
// docs/ngc1980/reference/uh1/tm55-1520-210-10_fig2-4_instrument_panel.jpg, archive.org page n68) into the panel table
// game/js/uh1panel.json: the panel face outline and the glare shield's top edge (per column of the silhouette), and
// each legend item's centre and size, refined from a hand-placed seed by scanning the drawn ring / box outward.
// Scale: the copilot's airspeed indicator (item 10, a 3ATI instrument: 3.125 in = 79.4 mm bezel) -> mm per pixel.
//   CHROME_PATH=... node hueypanel.mjs [--debug out.png]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import puppeteer from 'puppeteer-core';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(ROOT, 'docs/ngc1980/reference/uh1/tm55-1520-210-10_fig2-4_instrument_panel.jpg');
const dbg = process.argv.includes('--debug') ? process.argv[process.argv.indexOf('--debug') + 1] : null;
// seeds in display pixels of the 1547-wide page (x 1.657 = original); shape r = round, s = square, b = box [w, h]
const ITEMS = [
  [10, 'Airspeed indicator (copilot)', 420, 403, 'r', 'asi2'], [11, 'Attitude indicator (copilot)', 510, 403, 'r', 'adi2'], [12, 'Altimeter AAU-32/A (copilot)', 600, 400, 'r', 'alt2'],
  [21, 'Radio compass indicator (copilot)', 515, 495, 'r', 'rmi2'], [22, 'Vertical velocity indicator (copilot)', 597, 497, 'r', 'vsi2'],
  [15, 'Fuel pressure', 735, 386, 'r', 'fp'], [16, 'Fuel quantity', 790, 386, 'r', 'fuel'], [17, 'Engine oil pressure', 735, 440, 'r', 'eop'], [18, 'Engine oil temperature', 790, 440, 'r', 'eot'],
  [23, 'Transmission oil pressure', 735, 494, 'r', 'xop'], [24, 'Transmission oil temperature', 790, 494, 'r', 'xot'], [29, 'Main generator loadmeter', 735, 553, 'r', 'load'], [30, 'DC voltmeter', 792, 553, 'r', 'dcv'],
  [36, 'Standby generator loadmeter', 733, 604, 'r', 'sload'], [37, 'AC voltmeter', 792, 610, 'r', 'acv'],
  [20, 'Dual tachometer', 918, 410, 'r', 'tach'], [25, 'Torquemeter', 918, 486, 'r', 'tq'], [32, 'Gas producer tachometer', 918, 545, 'r', 'n1'], [39, 'Exhaust gas temperature', 918, 600, 'r', 'egt'],
  [10, 'Airspeed indicator (pilot)', 1008, 411, 'r', 'asi'], [11, 'Attitude indicator (pilot)', 1100, 411, 'r', 'adi'], [13, 'Altimeter AAU-31/A (pilot)', 1197, 405, 'r', 'alt'],
  [26, 'Radio compass indicator (pilot)', 1100, 515, 'r', 'rmi'], [22, 'Vertical velocity indicator (pilot)', 1197, 498, 'r', 'vsi'],
  [40, 'Turn and slip indicator', 1004, 599, 's', 'ts'], [41, 'Course deviation indicator', 1098, 593, 'r', 'cdi'], [43, 'Clock', 1197, 585, 'r', 'clk'],
  [51, 'DME indicator (V) - radar altimeter in the H', 1003, 488, 'b', 'ralt'],
  [28, 'Operating limits decal', 600, 576, 'b', null], [14, 'Compass correction card holder', 678, 398, 'b', null], [19, 'Cargo caution decal', 843, 420, 'b', null], [31, 'Engine caution decal', 858, 565, 'b', null],
  [34, 'Engine installation decal', 552, 632, 'b', null], [35, 'Transmitter selector decal', 655, 633, 'b', null],
  [3, 'Engine inlet filter clogged light', 680, 333, 'r', 'L3'], [4, 'Master caution', 772, 327, 'b', 'L4'], [5, 'RPM warning light', 890, 328, 'b', 'L5'], [6, 'Fire detector test switch', 948, 333, 'r', 'L6'], [7, 'Fire warning light', 992, 335, 'b', 'L7'],
  [27, 'Magnetic compass', 1272, 500, 'r', 'L27'],
];
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] }); const p = await b.newPage();
const res = await p.evaluate(async (src, ITEMS, wantDbg) => {
  const im = new Image(); im.src = src; await im.decode(); const W = im.width, H = im.height, k = W / 1547;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
  const d = cx.getImageData(0, 0, W, H).data, dark = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(Math.round(y) * W + Math.round(x)) * 4] < 120;
  // items: from the seed, the first dark pixel outward along 16 rays = the ring / box outline; centre and size from those
  const out = [];
  for (const [n, name, sx, sy, shape, id] of ITEMS) {
    // fit the drawn outline: a circle (rings) or an axis-aligned rectangle (boxes, the square turn and slip) whose
    // perimeter lies on dark pixels, searched over centre offsets and sizes round the seed (the item's number inside
    // and leader lines outside score low because they cover little of any perimeter)
    const dk = (x, y) => dark(x, y) || dark(x + 1, y) || dark(x - 1, y) || dark(x, y + 1) || dark(x, y - 1);
    let best = { s: -1 }; const sx0 = sx * k, sy0 = sy * k, small = n >= 3 && n <= 9;
    if (shape === 'r') {
      for (let dx = -24; dx <= 24; dx += 2) for (let dy = -24; dy <= 24; dy += 2) for (let r = small ? 8 : 30; r <= (small ? 30 : 110); r += 1) {
        let c = 0; for (let i = 0; i < 72; i++) { const t = i / 72 * Math.PI * 2; if (dk(sx0 + dx + Math.cos(t) * r, sy0 + dy + Math.sin(t) * r)) c++; }
        // the bezel is the largest well-covered circle (the number and the 13/50 bar make smaller partial circles)
        const cov = c / 72, sc = cov >= 0.88 ? 10 + r * 0.01 + cov : cov; if (sc > best.s) best = { s: sc, x: sx0 + dx, y: sy0 + dy, w: 2 * r, h: 2 * r, cov };
      }
    } else {
      for (let dx = -16; dx <= 16; dx += 4) for (let dy = -12; dy <= 12; dy += 4) for (let hw = 8; hw <= 140; hw += 2) for (let hh = 8; hh <= 80; hh += 2) {
        let c = 0, m = 0; const X = sx0 + dx, Y = sy0 + dy;
        for (let i = 0; i <= 20; i++) { const u = -hw + 2 * hw * i / 20; m += 2; if (dk(X + u, Y - hh)) c++; if (dk(X + u, Y + hh)) c++; }
        for (let i = 0; i <= 12; i++) { const v = -hh + 2 * hh * i / 12; m += 2; if (dk(X - hw, Y + v)) c++; if (dk(X + hw, Y + v)) c++; }
        const sc = c / m + (hw + hh) * 0.0003; if (sc > best.s) best = { s: sc, x: X, y: Y, w: 2 * hw, h: 2 * hh };
      }
    }
    const x0 = best.x, y0 = best.y; const fitScore = best.cov ?? best.s;
    out.push({ n, name, id, shape, cx: x0, cy: y0, w: best.w, h: best.h, fit: +fitScore.toFixed(2) });
  }
  // outline: per column across the panel, the topmost dark pixel (glare shield top) and the bottom-most (panel bottom),
  // and the panel face's top: the first dark pixel scanning up from the top instrument row (y 372 display)
  const cols = [];
  for (let xd = 318; xd <= 1318; xd += 4) {
    const x = xd * k; let top = null, bot = null, face = null;
    for (let y = 215 * k; y < 700 * k; y++) if (dark(x, y)) { top = y; break; }
    for (let y = 700 * k; y > 215 * k; y--) if (dark(x, y)) { bot = y; break; }
    for (let y = 372 * k; y > 215 * k; y--) if (dark(x, y)) { face = y; break; }
    cols.push({ xd, top, bot, face });
  }
  let dbgUrl = null;
  if (wantDbg) { cx.lineWidth = 3; for (const o of out) { cx.strokeStyle = '#e02020'; if (o.shape === 'r') { cx.beginPath(); cx.arc(o.cx, o.cy, (o.w + o.h) / 4, 0, Math.PI * 2); cx.stroke(); } else cx.strokeRect(o.cx - o.w / 2, o.cy - o.h / 2, o.w, o.h); }
    cx.strokeStyle = '#2060ff'; cx.beginPath(); cols.forEach((c, i) => c.top && (i ? cx.lineTo(c.xd * k, c.top) : cx.moveTo(c.xd * k, c.top))); cx.stroke();
    cx.strokeStyle = '#20a040'; cx.beginPath(); cols.forEach((c, i) => c.bot && (i ? cx.lineTo(c.xd * k, c.bot) : cx.moveTo(c.xd * k, c.bot))); cx.stroke();
    dbgUrl = cv.toDataURL('image/jpeg', 0.8); }
  return { W, H, k, items: out, cols, dbgUrl };
}, 'data:image/jpeg;base64,' + fs.readFileSync(IMG).toString('base64'), ITEMS, !!dbg);
await b.close();
if (dbg) fs.writeFileSync(dbg, Buffer.from(res.dbgUrl.split(',')[1], 'base64'));
// scale from the copilot ASI (first item): 3.125 in bezel
const asi = res.items[0], pxPerMm = ((asi.w + asi.h) / 2) / 79.375;
const cxPanel = res.items.find(i => i.id === 'fuel').cx - 0.0 , cyPanel = 470 * res.k;   // panel origin: x on the centre stack's right column, y at the second instrument row
const X = px => +((px - (806 * res.k)) / pxPerMm).toFixed(1), Y = py => +((cyPanel - py) / pxPerMm).toFixed(1);
const table = {
  source: 'TM 55-1520-210-10 (HQ DA, 1988, change 7) fig. 2-4 Instrument panel (typical), public domain; traced by tools/hueypanel.mjs',
  units: 'panel millimetres: x right (pilot side), y up; origin on the panel centre line at the second instrument row',
  scale: { pxPerMm: +pxPerMm.toFixed(4), from: 'item 10 copilot airspeed indicator = 3ATI, 79.4 mm bezel' },
  items: res.items.map(o => ({ n: o.n, name: o.name, id: o.id, shape: o.shape, x: X(o.cx), y: Y(o.cy), w: +(o.w / pxPerMm).toFixed(1), h: +(o.h / pxPerMm).toFixed(1), fit: o.fit })),
  outline: res.cols.filter(c => c.top != null).map(c => ({ x: X(c.xd * res.k), shieldTop: Y(c.top), faceTop: c.face != null ? Y(c.face) : null, bottom: Y(c.bot) })),
};
fs.writeFileSync(path.join(ROOT, 'game/js/uh1panel.json'), JSON.stringify(table, null, 0));
fs.writeFileSync(path.join(ROOT, 'game/js/uh1panel.js'), '// generated by tools/hueypanel.mjs from TM 55-1520-210-10 fig. 2-4 (public domain); see uh1panel.json\nexport const UH1_PANEL = ' + JSON.stringify(table) + ';\n');
console.log('px/mm', pxPerMm.toFixed(3)); for (const i of table.items) console.log(i.n, i.id, i.shape, i.x, i.y, i.w, i.h, i.fit);
