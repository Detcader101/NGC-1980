#!/usr/bin/env node
// worldbench: the lived-in world's skeleton (game/js/world/net.js) checked in node, no browser.
//   - generation cost per cell (what the main thread pays when the jet flies into new land)
//   - road statistics: length by type, max grade, bridges, causeways
//   - determinism: two independent copies of the generator, fed in different orders, must agree to the centimetre
//   - a map PNG (tools/runs/worldmap-<x>_<z>.png): terrain, roads (tarmac / lane / street / dirt / bridge), towns,
//     fields and farmyards, so you can look at the network
// usage: node worldbench.mjs [cx] [cz] [size_m] [m_per_px]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const NET = '../game/js/world/net.js', WORLD = '../game/js/world.js';
import { execFileSync } from 'node:child_process';
const world = await import(WORLD);
const A = await import(NET);
const args = process.argv.slice(2).filter(a => !a.startsWith('--')), DUMP = process.argv.includes('--dump');
const [cx, cz, size, mpp] = [+(args[0] ?? 3600), +(args[1] ?? 1800), +(args[2] ?? 9000), +(args[3] ?? 6)];
const probe = k => { const half = size / 2; return [cx - half + ((k * 7919) % 1000) / 1000 * size, cz - half + ((k * 104729) % 997) / 997 * size]; };
if (DUMP) {   // a second process: generate the area in the opposite order (and with the far side first), print the ground
  for (let z = cz + size / 2; z >= cz - size / 2; z -= A.CELL / 2) for (let x = cx + size / 2; x >= cx - size / 2; x -= A.CELL / 2) A.ensure(x, z);
  const out = []; for (let k = 0; k < 20000; k++) { const [x, z] = probe(k); out.push(+world.islandH(x, z).toFixed(4)); }
  process.stdout.write(JSON.stringify(out), () => process.exit(0)); await new Promise(() => {});
}
let fails = 0; const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

// ---- generation cost
let t0 = performance.now(); A.ensure(cx, cz); const first = performance.now() - t0;
const times = [];
for (let k = 1; k <= 6; k++) { t0 = performance.now(); A.ensure(cx + k * A.CELL, cz); times.push(performance.now() - t0); }
console.log(`first cell ${first.toFixed(0)} ms (cold: settlements +-10 cells, roads +-4), next cells eastward: ${times.map(t => t.toFixed(0)).join(', ')} ms`);
check(Math.max(...times) < 120, 'a new cell costs < 120 ms on the main thread');

// ---- the area
const half = size / 2, x0 = cx - half, z0 = cz - half;
for (let z = z0; z <= z0 + size; z += A.CELL / 2) for (let x = x0; x <= x0 + size; x += A.CELL / 2) A.ensure(x, z);
const S = A.netState, roads = S.roads.filter(r => r.xs.some((x, i) => Math.abs(x - cx) < half && Math.abs(r.zs[i] - cz) < half));
const len = {}; let maxG = 0, bridges = 0, bridgeLen = 0, steep = null;
for (const r of roads) {
  len[r.kind + '/' + r.type] = (len[r.kind + '/' + r.type] || 0) + r.len;
  for (let i = 1; i < r.xs.length; i++) { const d = Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1]); const g = d > 0.5 ? Math.abs(r.ys[i] - r.ys[i - 1]) / d : 0; if (g > maxG) { maxG = g; steep = `${r.kind}/${r.type} #${r.id} i=${i}/${r.xs.length} at (${r.xs[i].toFixed(0)}, ${r.zs[i].toFixed(0)}) y ${r.ys[i - 1].toFixed(1)}->${r.ys[i].toFixed(1)} d ${d.toFixed(1)}`; } if (r.br[i - 1]) bridgeLen += d; }
  for (let i = 1; i < r.br.length; i++) if (r.br[i] && !r.br[i - 1]) bridges++;
}
const setts = [...S.sett.values()].filter(s => s && Math.abs(s.x - cx) < half && Math.abs(s.z - cz) < half);
const farms = [...S.farms.values()].filter(f => f && Math.abs(f.x - cx) < half && Math.abs(f.z - cz) < half);
console.log(`area ${size / 1000} km square at (${cx}, ${cz}): ${setts.length} settlements (${['hamlet', 'village', 'town'].map(k => setts.filter(s => s.size === k).length + ' ' + k).join(', ')}, ${setts.filter(s => s.coast).length} on the coast), ${farms.length} farms, ${farms.reduce((a, f) => a + f.fields.length, 0)} fields`);
console.log('road km: ' + Object.entries(len).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(', ') + `; ${bridges} bridges (${bridgeLen.toFixed(0)} m); steepest grade ${(maxG * 100).toFixed(1)}%`);
check(maxG < 0.16, 'no road steeper than 16%' + (maxG >= 0.16 ? ': ' + steep : ''));
check(setts.length > 3 && roads.length > 5, 'there are towns and roads');

// ---- the road bed: on a road the physics height is the road's own height
let worst = 0, wat = '', bad = 0, tot = 0; for (const r of roads) for (let i = 0; i < r.xs.length - 1; i += 3) { if (r.br[i] || (i && r.br[i - 1])) continue; const h = world.islandH(r.xs[i], r.zs[i]), e = Math.abs(h - r.ys[i]); tot++; if (e > 0.05) bad++; if (e > worst) { worst = e; wat = `${r.kind}/${r.type} #${r.id} i=${i}/${r.xs.length} (${r.xs[i].toFixed(0)}, ${r.zs[i].toFixed(0)}) road ${r.ys[i].toFixed(2)} ground ${h.toFixed(2)}`; } }
check(bad / tot < 0.01, `road centrelines sit on the terrain: ${bad}/${tot} samples off by > 5 cm (worst ${worst.toFixed(2)} m: ${wat}) - junctions and crossings, where the wider road wins`);
const q = roads.find(r => r.kind === 'link'); if (q) { const m = Math.floor(q.xs.length / 2); const ra = A.roadAt(q.xs[m], q.zs[m]); console.log('roadAt mid-link', JSON.stringify(ra)); check(ra && ra.road === q.id, 'roadAt finds the road under its own centreline'); }

// ---- determinism: a second process generates the area in the opposite order and must give the same ground
{
  const other = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), cx, cz, size, mpp, '--dump'], { maxBuffer: 1 << 26 }).toString());
  let diff = 0, at = null; for (let k = 0; k < other.length; k++) { const [x, z] = probe(k), d = Math.abs(world.islandH(x, z) - other[k]); if (d > diff) { diff = d; at = [x.toFixed(0), z.toFixed(0)]; } }
  check(diff < 2e-3, `two processes generating in opposite orders agree on the ground (${other.length} points, worst ${diff.toExponential(1)} m${diff > 2e-3 ? ' at ' + at : ''})`);
}

// ---- cost of a height query with roads (the terrain worker bakes 2 x 262k of these)
t0 = performance.now(); let s = 0; for (let k = 0; k < 262144; k++) s += world.islandH(cx - 1000 + (k & 511) * 4, cz - 1000 + (k >> 9) * 4); const bake = performance.now() - t0;
t0 = performance.now(); for (let k = 0; k < 262144; k++) s += world.rawH(cx - 1000 + (k & 511) * 4, cz - 1000 + (k >> 9) * 4); const bake0 = performance.now() - t0;
console.log(`2 km @ 4 m bake: ${bake.toFixed(0)} ms with roads, ${bake0.toFixed(0)} ms raw`);

// ---- the map
const N = Math.round(size / mpp), img = new Uint8Array(N * N * 3);
const put = (px, py, c, a = 1) => { if (px < 0 || py < 0 || px >= N || py >= N) return; const o = (py * N + px) * 3; for (let k = 0; k < 3; k++) img[o + k] = img[o + k] * (1 - a) + c[k] * a; };
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = x0 + i * mpp, z = z0 + j * mpp, h = world.islandH(x, z), hx = world.islandH(x + mpp, z) - h, l = Math.max(0.55, Math.min(1.25, 0.95 - hx * 0.25 / mpp * 6));
  const c = h <= 0 ? [30, 80, 120] : h < 3 ? [190, 176, 120] : h < 200 ? [70 + h * 0.2, 120 - h * 0.1, 60] : h < 450 ? [130, 118, 100] : [235, 238, 242];
  put(i, j, c.map(v => Math.min(255, v * (h <= 0 ? 1 : l))));
}
const crop = { wheat: [214, 186, 90], barley: [200, 196, 120], pasture: [96, 160, 70], plough: [120, 86, 60], hay: [170, 176, 90], potato: [60, 110, 50] };
for (const f of farms) for (const F of f.fields) { const ca = Math.cos(F.yaw), sa = Math.sin(F.yaw); for (let v = -F.d / 2; v < F.d / 2; v += mpp / 2) for (let u = -F.w / 2; u < F.w / 2; u += mpp / 2) put(Math.round((F.x + ca * u - sa * v - x0) / mpp), Math.round((F.z + sa * u + ca * v - z0) / mpp), crop[F.crop], 0.7); }
const RC = { tarmac: [40, 40, 44], lane: [70, 70, 74], street: [90, 86, 84], dirt: [150, 110, 70] };
for (const r of S.roads) for (let i = 0; i < r.xs.length - 1; i++) {
  const c = r.br[i] ? [230, 40, 40] : RC[r.type], d = Math.hypot(r.xs[i + 1] - r.xs[i], r.zs[i + 1] - r.zs[i]);
  for (let t = 0; t <= d; t += mpp / 2) { const x = r.xs[i] + (r.xs[i + 1] - r.xs[i]) * t / d, z = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * t / d; const px = Math.round((x - x0) / mpp), py = Math.round((z - z0) / mpp); put(px, py, c); if (r.type === 'tarmac') { put(px + 1, py, c); put(px, py + 1, c); } }
}
for (const s of setts) for (let a = 0; a < 6.283; a += 0.05) put(Math.round((s.x + Math.cos(a) * s.R - x0) / mpp), Math.round((s.z + Math.sin(a) * s.R - z0) / mpp), [255, 255, 255], 0.8);
for (const f of farms) for (let k = -2; k <= 2; k++) { put(Math.round((f.x - x0) / mpp) + k, Math.round((f.z - z0) / mpp), [250, 240, 60]); put(Math.round((f.x - x0) / mpp), Math.round((f.z - z0) / mpp) + k, [250, 240, 60]); }
const raw = Buffer.alloc(N * (N * 3 + 1)); for (let j = 0; j < N; j++) { raw[j * (N * 3 + 1)] = 0; Buffer.from(img.buffer, j * N * 3, N * 3).copy(raw, j * (N * 3 + 1) + 1); }
const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.mkdirSync(path.join(TOOLS, 'runs'), { recursive: true });
const out = path.join(TOOLS, 'runs', `worldmap-${cx}_${cz}.png`);
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('map', out);
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
