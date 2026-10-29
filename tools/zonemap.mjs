#!/usr/bin/env node
// zonemap.mjs - (ngc/look-terrain) a top-down shaded-relief map of the control zone and a ring round it, from the
// game's own height function (world.js rawH, or islandH with --roads), as a PNG. No browser, no image libraries.
//   node tools/zonemap.mjs [--js game/js] [--out map.png] [--px 1024] [--margin 700] [--roads] [--surf]
// --js: another checkout's game/js (e.g. an old commit unpacked with git archive) to map the old zone the same way.
// North (-z) is up, as on the in-game map. Sites: white rings (cave sites squares); the zone: the dashed yellow square.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.resolve(arg('--js', path.join(ROOT, 'game/js'))), OUT = path.resolve(arg('--out', path.join(ROOT, 'tools/runs/zonemap.png')));
const PX = +arg('--px', 1024), MARGIN = +arg('--margin', 700), ROADS = process.argv.includes('--roads'), SURF = process.argv.includes('--surf');
const W = await import(pathToFileURL(path.join(JS, 'world.js')).href);
const T = SURF ? await import(pathToFileURL(path.join(JS, 'world/terrain.js')).href) : null;
const { BOUND, ISLANDS } = W, Hf = ROADS ? W.islandH : W.rawH;
const E = BOUND + MARGIN, m = 2 * E / PX;
const t0 = performance.now();
const h = new Float32Array((PX + 1) * (PX + 1));
for (let j = 0; j <= PX; j++) for (let i = 0; i <= PX; i++) h[j * (PX + 1) + i] = Hf(-E + i * m, -E + j * m);
const tH = performance.now() - t0;
const img = Buffer.alloc(PX * PX * 3);
const lerp = (a, b, t) => a + (b - a) * t, cl = v => Math.max(0, Math.min(1, v));
const ramp = [[0, [196, 186, 132]], [3, [120, 150, 78]], [30, [92, 136, 64]], [90, [128, 140, 80]], [160, [150, 132, 96]], [260, [140, 120, 104]], [400, [200, 198, 196]], [700, [245, 245, 250]]];
const SC = { grass: [96, 140, 66], sand: [214, 200, 150], wetsand: [170, 160, 120], rock: [130, 126, 120], mud: [110, 92, 64], dirt: [150, 120, 84], shingle: [160, 150, 136], marsh: [96, 110, 70] };
for (let j = 0; j < PX; j++) for (let i = 0; i < PX; i++) {
  const k = j * (PX + 1) + i, y = h[k], x = -E + (i + 0.5) * m, z = -E + (j + 0.5) * m;
  let c;
  if (y <= 0) { const d = cl(-y / 26); c = [lerp(70, 10, d), lerp(140, 40, d), lerp(170, 90, d)]; }
  else if (T && Math.max(Math.abs(x), Math.abs(z)) < BOUND) c = SC[T.zoneSurf(x, z)];
  else { let a = ramp[0], b = ramp[ramp.length - 1]; for (let q = 1; q < ramp.length; q++) if (y < ramp[q][0]) { a = ramp[q - 1]; b = ramp[q]; break; } const t = cl((y - a[0]) / (b[0] - a[0])); c = a[1].map((v, n) => lerp(v, b[1][n], t)); }
  // hill shade (sun from the north-west), land only
  const dx = (h[k + 1] - h[k]) / m, dz = (h[k + PX + 1] - h[k]) / m;
  const nl = Math.hypot(dx, 1, dz), sh = y > 0 ? cl(0.55 + 0.7 * ((dx * 0.6 + dz * 0.6) / nl + 0.55 / nl) - 0.3) : 1;
  const o = (j * PX + i) * 3; img[o] = cl(c[0] * sh / 255) * 255; img[o + 1] = cl(c[1] * sh / 255) * 255; img[o + 2] = cl(c[2] * sh / 255) * 255;
}
const px = x => Math.round((x + E) / m), put = (i, j, c) => { if (i < 0 || j < 0 || i >= PX || j >= PX) return; const o = (j * PX + i) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; };
// the zone, dashed
for (let t = -BOUND; t <= BOUND; t += m) if (Math.floor((t + BOUND) / 60) % 2 === 0) for (const [a, b] of [[t, -BOUND], [t, BOUND], [-BOUND, t], [BOUND, t]]) for (let w = -1; w <= 1; w++) put(px(a) + (a === -BOUND || a === BOUND ? w : 0), px(b) + (b === -BOUND || b === BOUND ? w : 0), [255, 220, 120]);
// roads (with --roads): the zone's road network as built (world/net.js), dark grey; bridges orange
if (ROADS) { const NET = await import(pathToFileURL(path.join(JS, 'world/net.js')).href); for (const R of NET.netState.roads) for (let i = 0; i < R.xs.length; i++) { const c = R.br[i] ? [240, 150, 40] : R.type === 'tarmac' ? [40, 40, 44] : [90, 76, 60]; put(px(R.xs[i]), px(R.zs[i]), c); put(px(R.xs[i]) + 1, px(R.zs[i]), c); }
  console.log('roads', NET.netState.roads.length, NET.netState.roads.map(r => r.kind + ':' + Math.round(r.len)).join(' ')); }
// sites
const OWN = [[240, 236, 220], [80, 200, 255], [255, 90, 70]];
for (const I of ISLANDS) { const r = Math.max(3, 30 / m); for (let a = 0; a < 6.283; a += 0.02) for (let w = 0; w < 2; w++) { const rr = r + w; const X = I.cave ? Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) : Math.cos(a), Z = I.cave ? Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) : Math.sin(a); put(px(I.x + X * rr * m), px(I.z + Z * rr * m), OWN[I.owner]); }
  const rr = I.r / m; for (let a = 0; a < 6.283; a += 0.01) if (Math.floor(a * 20) % 2 === 0) put(px(I.x + Math.cos(a) * rr * m), px(I.z + Math.sin(a) * rr * m), [255, 255, 255]); }
// PNG
const raw = Buffer.alloc((PX * 3 + 1) * PX); for (let j = 0; j < PX; j++) { raw[j * (PX * 3 + 1)] = 0; img.copy(raw, j * (PX * 3 + 1) + 1, j * PX * 3, (j + 1) * PX * 3); }
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(PX, 0); ihdr.writeUInt32BE(PX, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
let land = 0, max = -1e9; for (let j = 0; j < PX; j++) for (let i = 0; i < PX; i++) { const x = -E + i * m, z = -E + j * m; if (Math.max(Math.abs(x), Math.abs(z)) > BOUND) continue; const y = h[j * (PX + 1) + i]; if (y > 0) land++; if (y > max) max = y; }
const zc = (2 * BOUND / m) ** 2;
console.log(`wrote ${OUT}  BOUND ${BOUND}  land ${(100 * land / zc).toFixed(1)}% of the zone  highest ${max.toFixed(0)} m  heights ${tH.toFixed(0)} ms`);
