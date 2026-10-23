// What stands where: houses along the streets, the church on the square, shops in the middle of town, farmyards with
// their fields, walls and hedges, harbours with piers, lighthouses on the headlands, power lines along the main
// roads, radio masts on the hills. Pure and seeded (rng.js), so every thread lays out the same town; cached per thread.
//
// An item: { t: type, x, z, y (floor level), yaw (front = local +z faces the street), drop (plinth below the floor),
//            w, d, seed, ... }. Ground heights come from hf (islandH in the wild; main.js's terrainH in the zone).
import { netState, townOf, settlementOf, roadById, edgeDist, edgeDist0, ground0, addPad, prepArea, plazaR, CELL, FARM_CELL, farmOf, cellReady, zoneNet, padOf, structAngle, zoneReserved, ROAD } from './net.js';
import { rng, hash2 } from './rng.js';
import { PAL } from './models.js';
import { rawH, ISLANDS, BOUND } from '../world.js';

// How lots meet the ground. Wild lands: levelled platforms (net.js addPad) cut into the slope, so the terrain itself
// is flat under every building (physics included). Control zone: stone plinths down to the lowest corner (the zone's
// terrain is main.js's, baked before any of this). E is set per layout run.
const E = { hf: null, edge: null, pads: false };
const WILD = () => ({ hf: ground0, edge: edgeDist0, pads: true });   // lazy: ground0 lives in net.js (an import cycle)
const zoneCtx = hf => ({ hf, edge: edgeDist, pads: false });
const CORN = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5], [0, 0]];
// floor level and plinth for a w x d footprint at (x, z) turned by yaw; null if it would sit in the sea or on a cliff
export function footing(x, z, yaw, w, d, hf = E.hf, maxStep = 4.2) {
  const c = Math.cos(yaw), s = Math.sin(yaw); let lo = 1e9, hi = -1e9, sum = 0;
  for (const [u, v] of CORN) {
    const px = x + c * u * w + s * v * d, pz = z - s * u * w + c * v * d, h = hf(px, pz);
    lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h;
  }
  if (lo < 1.3 || hi - lo > (E.pads && hf === E.hf ? 6 : maxStep)) return null;
  if (E.pads && hf === E.hf) {   // a platform at the mean height (cut and fill balance), then a short plinth
    const y = Math.max(1.5, sum / CORN.length), hu = w / 2 + 0.8, hv = d / 2 + 0.8;
    let near = 1e9; for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) { const [px, pz] = toW(x, z, yaw, u * hu, v * hv); near = Math.min(near, E.edge(px, pz)); }
    const sh = Math.max(0.6, Math.min(near - 1.9, 3 + 1.1 * Math.max(hi - y, y - lo), 10));
    addPad(x, z, y, yaw, hu, hv, sh);
    return { y: y + 0.15, drop: 0.5 };
  }
  return { y: hi + 0.2, drop: hi + 0.2 - lo + 0.35 };
}
// world point of local (u, v) in a frame at (x, z) turned by yaw (yaw like THREE rotation.y)
const toW = (x, z, yaw, u, v) => [x + Math.cos(yaw) * u + Math.sin(yaw) * v, z - Math.sin(yaw) * u + Math.cos(yaw) * v];
// clear of every road / square / quay by `m` metres at the footprint's corners and edge midpoints
function clearOfRoads(x, z, yaw, w, d, m) {
  for (const [u, v] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5], [0, .5], [0, -.5], [.5, 0], [-.5, 0], [0, 0]]) { const [px, pz] = toW(x, z, yaw, u * w, v * d); if (E.edge(px, pz) < m) return false; }
  return true;
}
class Occ {   // occupied circles, to keep lots apart
  constructor() { this.a = []; }
  free(x, z, r) { for (const o of this.a) if ((o[0] - x) ** 2 + (o[1] - z) ** 2 < (o[2] + r) ** 2) return false; return true; }
  add(x, z, r) { this.a.push([x, z, r]); }
}

// ------------------------------------------------------------------------------------------- towns and villages
const cacheT = new Map();
export function townItems(s, hf, extra = {}) {
  const key = s.id; if (cacheT.has(key)) return cacheT.get(key);
  if (!s.zone) prepArea(s.x, s.z, s.R + 80);   // every road, street and track that can pass our lots exists first
  Object.assign(E, s.zone ? zoneCtx(hf) : WILD()); hf = E.hf; const edgeDist = E.edge;
  const lay = s.zone ? s.layout : townOf(s), r = rng(s.seed ^ 0x2c1b3c6d), items = [], occ = new Occ(), PR = s.zone ? 9 : plazaR(s);
  const node = netState.nodes.get(s.id);
  occ.add(s.x, s.z, PR + 2);
  const block = extra.blocked || (() => false);
  const add = (it, rad) => { items.push(it); occ.add(it.x, it.z, rad); return it; };
  const lines = [];
  if (node) for (const { road, end } of node.roads) { const R = roadById(road); lines.push({ R, end, max: Math.min(R.len, s.R * (s.zone ? 1.3 : 1.15)) }); }
  for (const id of (lay.streets || [])) lines.push({ R: roadById(id), end: 0, max: roadById(id).len });
  lines.sort((a, b) => (a.R.key || a.R.kind + a.R.xs[1]) < (b.R.key || b.R.kind + b.R.xs[1]) ? -1 : 1);
  const pt = (R, end, sd) => { const t = end ? R.len - sd : sd; let i = 0; while (i < R.xs.length - 2 && R.s[i + 1] < t) i++; const f = Math.min(1, Math.max(0, (t - R.s[i]) / ((R.s[i + 1] - R.s[i]) || 1))); let dx = R.xs[i + 1] - R.xs[i], dz = R.zs[i + 1] - R.zs[i]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; if (end) { dx = -dx; dz = -dz; } return { x: R.xs[i] + (R.xs[i + 1] - R.xs[i]) * f, z: R.zs[i] + (R.zs[i + 1] - R.zs[i]) * f, dx, dz, br: R.br[i] }; };
  // try to stand a building of w x d facing the road at arc distance sd on `side`, `back` metres behind the edge
  const tryLot = (L, sd, side, w, d, back, mk) => {
    const p = pt(L.R, L.end, sd); if (p.br) return null;
    const nx = -p.dz * side, nz = p.dx * side, off = L.R.hw + back + d / 2, x = p.x + nx * off, z = p.z + nz * off;
    const yaw = Math.atan2(-nx, -nz), rad = Math.hypot(w, d) / 2;
    if (!occ.free(x, z, rad) || block(x, z, rad)) return null;
    if (!clearOfRoads(x, z, yaw, w + 1, d + 1, 1.0)) return null;
    const f = footing(x, z, yaw, w, d, hf); if (!f) return null;
    return add(mk({ x, z, yaw, ...f }), rad);
  };
  const dens = { hamlet: 0.7, village: 0.82, town: 0.9 }[s.size] || 0.8;
  // the church (villages and towns) and the war memorial on the square
  if (s.size !== 'hamlet') {
    for (let k = 0; k < 16; k++) {
      const a = k * 2.4 + r() * 0.3, x = s.x + Math.cos(a) * (PR + 17), z = s.z + Math.sin(a) * (PR + 17), yaw = Math.atan2(s.x - x, s.z - z);
      if (!occ.free(x, z, 14) || block(x, z, 16) || !clearOfRoads(x, z, yaw, 30, 18, 0.5)) continue;
      const f = footing(x, z, yaw, 28, 11, hf, 3.5); if (!f) continue;
      add({ t: 'church', x, z, yaw, ...f, seed: r() * 1e9 | 0 }, 16); break;
    }
    items.push({ t: 'memorial', x: s.x + 2, z: s.z - 1, yaw: r() * 6, y: 0, ground: true, drop: 0.3, seed: 1 });
    for (let k = 0; k < 3; k++) { const a = r() * 6.28, x = s.x + Math.cos(a) * (PR - 1.5), z = s.z + Math.sin(a) * (PR - 1.5); items.push({ t: 'bench', x, z, yaw: Math.atan2(s.x - x, s.z - z), y: 0, ground: true, drop: 0, seed: 0 }); }
  }
  // the houses along each street, densest near the square
  for (const L of lines) for (const side of [-1, 1]) {
    let sd = PR + 3 + r() * 4;
    while (sd < L.max - 4) {
      const dist = (L.R.kind === 'street' ? 0.35 * s.R + sd * 0.6 : sd), cen = Math.max(0, 1 - dist / s.R);
      if (r() > dens * (1 - 0.55 * (1 - cen) ** 2) || dist > s.R * 1.15) { sd += 6 + r() * 6; continue; }
      let it = null;
      const big = s.size === 'town' && cen > 0.45, mid = (s.size === 'town' && cen > 0.2) || (s.size === 'village' && cen > 0.55);
      if (big && r() < 0.75) {
        const units = r.int(2, 4), uw = r.range(5.5, 7), w = units * uw, d = r.range(8, 10);
        it = tryLot(L, sd + w / 2, side, w, d, r.range(0.8, 2.2), f => ({ t: 'terrace', ...f, w, d, units, floors: r() < 0.6 ? 3 : 2, shops: true, roof: r.pick(PAL.roofs.slice(0, 4)), seed: r() * 1e9 | 0 }));
        sd += it ? w + r.range(0.5, 3) : 5;
      } else if (mid && r() < 0.5) {
        const units = r.int(2, 3), uw = r.range(5.5, 6.5), w = units * uw, d = r.range(7.5, 9);
        it = tryLot(L, sd + w / 2, side, w, d, r.range(1.5, 4), f => ({ t: 'terrace', ...f, w, d, units, floors: 2, shops: r() < 0.5, roof: r.pick(PAL.roofs), seed: r() * 1e9 | 0 }));
        sd += it ? w + r.range(2, 5) : 5;
      } else {
        const cottage = s.size === 'hamlet' ? r() < 0.6 : r() < 0.25, w = cottage ? r.range(6.5, 8.5) : r.range(7.5, 10.5), d = cottage ? r.range(5, 6) : r.range(6.5, 8.5);
        it = tryLot(L, sd + w / 2, side, w, d, r.range(3, 7), f => ({ t: cottage ? 'cottage' : 'house', ...f, w, d, floors: cottage ? 1 : r() < 0.7 ? 2 : 1, wall: r.pick(PAL.walls), roof: r.pick(PAL.roofs), door: r.pick(PAL.doors), roofType: r() < 0.22 ? 'hip' : 'gable', seed: r() * 1e9 | 0 }));
        if (it) garden(it, r, items, occ, hf, block);
        sd += it ? w + r.range(4, 12) : 5;
      }
    }
  }
  // street furniture: phone box and post box by the square, lamps along town streets, a bus shelter on the way out
  if (s.size !== 'hamlet') {
    for (const [t, d] of [['phone', PR + 2.5], ['post', PR + 2]]) { const a = r() * 6.28, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d; items.push({ t, x, z, yaw: Math.atan2(s.x - x, s.z - z), y: 0, ground: true, drop: 0, seed: 0 }); }
    for (const L of lines) {
      if (L.R.kind === 'link' && lines.indexOf(L) % 2 === 0) { const p = pt(L.R, L.end, Math.min(L.max - 6, s.R * 0.85)); const x = p.x - p.dz * (L.R.hw + 2.2), z = p.z + p.dx * (L.R.hw + 2.2); if (occ.free(x, z, 2)) items.push({ t: 'shelter', x, z, yaw: Math.atan2(p.dz, -p.dx), y: 0, ground: true, drop: 0, seed: 0 }); }
      if (s.size === 'town' || L.R.kind === 'street') for (let sd = PR + 8; sd < Math.min(L.max, s.R * 0.8); sd += 32) { const p = pt(L.R, L.end, sd); if (p.br) continue; const x = p.x + p.dz * (L.R.hw + 0.6), z = p.z - p.dx * (L.R.hw + 0.6); if (occ.free(x, z, 0.5)) items.push({ t: 'lamp', x, z, yaw: Math.atan2(-p.dz, p.dx), y: 0, ground: true, drop: 0, seed: 0 }); }
      if (L.R.kind === 'link') { const p = pt(L.R, L.end, Math.min(L.max - 2, s.R)); const x = p.x + p.dz * (L.R.hw + 1.2), z = p.z - p.dx * (L.R.hw + 1.2); items.push({ t: 'sign', x, z, yaw: Math.atan2(p.dx, p.dz), y: 0, ground: true, drop: 0, seed: r() * 1e9 | 0 }); }
    }
    if (s.size === 'town' && lines.length) {   // a filling station on the main road out of town
      const L = lines[0]; for (let k = 0; k < 6; k++) if (tryLot(L, s.R * (0.7 + k * 0.08), k % 2 ? 1 : -1, 16, 12, 1.5, f => ({ t: 'petrol', ...f, w: 16, d: 12, seed: r() * 1e9 | 0 }))) break;
    }
  }
  // the harbour: stone quay, a timber pier out into the water, boat sheds, pots; boats moor along the pier
  const q = lay.quay;
  if (q) {
    let len = 18; for (; len < 60; len += 4) if (rawH(q.x + Math.cos(q.a) * (len + 9), q.z + Math.sin(q.a) * (len + 9)) < -3.5) break;
    const yaw = Math.atan2(Math.cos(q.a), Math.sin(q.a));   // local +z points out to sea
    const sea = rawH(q.x + Math.cos(q.a) * (len * 0.5 + 9), q.z + Math.sin(q.a) * (len * 0.5 + 9));
    items.push({ t: 'quay', x: q.x, z: q.z, y: q.y, yaw, drop: q.y - Math.min(0, sea), len, seed: r() * 1e9 | 0, harbour: true });
    for (const sd of [-1, 1]) { const [x, z] = toW(q.x, q.z, yaw, sd * 13, -3); if (!occ.free(x, z, 6) || !clearOfRoads(x, z, yaw, 6, 10, 0.5)) continue; const f = footing(x, z, yaw, 6, 10, hf); if (f) add({ t: 'boatshed', x, z, yaw, ...f, seed: r() * 1e9 | 0 }, 6); }
    const [lx, lz] = toW(q.x, q.z, yaw, 6, -5); items.push({ t: 'pots', x: lx, z: lz, yaw, y: q.y, drop: 0, seed: r() * 1e9 | 0 });
    // a lighthouse on the most seaward point near the harbour
    if (!s.zone && s.size !== 'hamlet') {
      let best = null;
      for (let k = 0; k < 40; k++) {
        const a = q.a + (k % 10 - 4.5) * 0.25, d = 80 + Math.floor(k / 10) * 70, x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d, h = rawH(x, z);
        if (h < 2.5 || h > 40 || edgeDist(x, z) < 6 || !occ.free(x, z, 12)) continue;
        let wet = 0; for (let j = 0; j < 12; j++) if (rawH(x + Math.cos(j * 0.52) * 60, z + Math.sin(j * 0.52) * 60) < 0) wet++;
        if (!best || wet > best.wet) best = { x, z, wet };
      }
      if (best && best.wet >= 5) { const f = footing(best.x, best.z, 0, 6, 6, hf, 6); if (f) add({ t: 'lighthouse', x: best.x, z: best.z, yaw: q.a, ...f, seed: r() * 1e9 | 0 }, 10); }
    }
  }
  cacheT.set(key, items); return items;
}
// a house's garden: washing, a shed, a car on the drive, a tree, a woodpile
function garden(h, r, items, occ, hf, block) {
  const at = (u, v) => toW(h.x, h.z, h.yaw, u, v);
  const putIt = (t, u, v, yawOff, rad, extra = {}) => { const [x, z] = at(u, v); if (!occ.free(x, z, rad) || block(x, z, rad) || E.edge(x, z) < rad) return; if (E.hf(x, z) < 1.2) return; occ.add(x, z, rad); items.push({ t, x, z, y: 0, ground: true, yaw: h.yaw + yawOff, drop: 0.3, seed: r() * 1e9 | 0, ...extra }); };
  if (r() < 0.35) putIt('laundry', (r() - 0.5) * 2, -h.d / 2 - 5, 0, 3);
  if (r() < 0.25) putIt('shed', h.w / 2 - 1, -h.d / 2 - 4.5, 0, 1.8);
  if (r() < 0.4) putIt('car', h.w / 2 + 2.2, h.d / 2 - 0.5, 0, 2.4, { paint: r.pick(PAL.cars) });
  if (r() < 0.45) putIt('tree', -h.w / 2 - 3, -h.d / 2 - 2 - r() * 4, 0, 2.5, { s: 0.8 + r() * 0.7 });
  if (r() < 0.15) putIt('woodpile', -h.w / 2 - 1, -h.d / 2 - 1, Math.PI / 2, 1.3);
  if (r() < 0.12) putIt('garage', -h.w / 2 - 2.6, 0.5, 0, 3);
}

// ------------------------------------------------------------------------------------------- farms
const cacheF = new Map();
export function farmItems(f) {
  if (cacheF.has(f.id)) return cacheF.get(f.id);
  prepArea(f.x, f.z, 60); Object.assign(E, WILD()); const hf = E.hf;
  const r = rng(f.seed), items = [], yaw = f.yaw + Math.PI / 2, at = (u, v) => toW(f.x, f.z, yaw, u, v);
  const put = (t, u, v, w, d, extra = {}, y0 = 0) => { const [x, z] = at(u, v), ft = footing(x, z, yaw + y0, w, d, hf, 5); if (!ft) return null; const it = { t, x, z, yaw: yaw + y0, ...ft, w, d, seed: r() * 1e9 | 0, ...extra }; items.push(it); return it; };
  put('house', -7, 4, 9, 7, { floors: 2, wall: r.pick([0xe9e5da, 0xe8e0c8, 0xd8d2c4, 0x9a9384]), roof: r.pick(PAL.roofs), door: r.pick(PAL.doors), roofType: 'gable', farm: true });
  put('barn', 9, -6, r.range(14, 20), r.range(8, 10), {}, Math.PI / 2);
  if (r() < 0.6) put('openshed', -8, -12, 12, 6);
  if (r() < 0.4) put('silo', 16, 6, 4.4, 4.4);
  if (r() < 0.6) { const [x, z] = at(2, -14); items.push({ t: 'tractor', x, z, y: 0, ground: true, yaw: yaw + r() * 6, drop: 0, seed: r() * 1e9 | 0 }); }
  if (r() < 0.5) { const [x, z] = at(-12, 10); items.push({ t: 'laundry', x, z, y: 0, ground: true, yaw, drop: 0.3, seed: r() * 1e9 | 0 }); }
  for (const F of f.fields) items.push({ t: 'field', x: F.x, z: F.z, y: 0, yaw: F.yaw, w: F.w, d: F.d, crop: F.crop, wall: f.style, seed: F.seed, drop: 0 });
  cacheF.set(f.id, items); return items;
}

// ------------------------------------------------------------------------------------------- power lines and masts
const cacheP = new Map();
// wooden poles along a tarmac / lane link road, 9 m tall, one every ~45 m on the left verge
export function polesOf(R) {
  if (cacheP.has(R.key)) return cacheP.get(R.key);
  const out = [];
  if (R.kind === 'link' && R.type !== 'dirt') {
    let next = 20;
    for (let i = 1; i < R.xs.length - 1; i++) {
      if (R.s[i] < next) continue; next = R.s[i] + 45;
      if (R.br[i] || R.br[i - 1]) continue;
      const dx = R.xs[i + 1] - R.xs[i - 1], dz = R.zs[i + 1] - R.zs[i - 1], l = Math.hypot(dx, dz) || 1, off = R.hw + 3.5;
      const x = R.xs[i] - dz / l * off, z = R.zs[i] + dx / l * off;
      out.push({ x, z, yaw: Math.atan2(dx, dz) });
    }
  }
  cacheP.set(R.key, out); return out;
}
// a radio / TV mast on the highest open ground of some cells
export function mastOf(ci, cj) {
  if (hash2(ci, cj, 31) > 0.22) return null;
  const r = rng(ci * 3301 + cj * 7919 + 77); let best = null;
  for (let k = 0; k < 16; k++) { const x = (ci + 0.1 + 0.8 * r()) * CELL, z = (cj + 0.1 + 0.8 * r()) * CELL; if (Math.max(Math.abs(x), Math.abs(z)) < BOUND + 900) continue; const h = rawH(x, z); if (h > 50 && h < 420 && (!best || h > best.h)) best = { x, z, h }; }
  return best && { t: 'mast', x: best.x, z: best.z, yaw: r() * 6, h: 55 + r() * 30, seed: r() * 1e9 | 0 };
}

// ------------------------------------------------------------------------------------------- the control zone
// The big islands' villages (net.js zoneNet), and on every island a few cottages round the edge of the landing
// apron, a jetty with a boat, a lighthouse on the radar islands. Uses main.js's terrainH (pads and aprons included).
export function zoneItems(hf) {
  zoneNet(); Object.assign(E, zoneCtx(hf));
  const out = [];
  for (const site of netState.zoneSites) {
    const I = site.I, p = padOf(I), r = rng(I.id * 977 + 13), items = [];
    // keep clear of the war's buildings: pad apron, HQ and production slots, AA ring, the cave
    const a0 = structAngle(I), slots = I.cave ? [[p.x - 17, p.z + 9], [p.x + 19, p.z + 6]] : [[p.x + Math.cos(a0) * 17, p.z + Math.sin(a0) * 17], [p.x - Math.cos(a0) * 18, p.z - Math.sin(a0) * 18]];
    const blocked = (x, z, rad = 0) => zoneReserved(I, x, z, rad) || slots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 16 + rad);
    if (site.village) {
      const V = site.village; V.layout = { streets: [], quay: site.quay };
      for (const it of townItems(V, hf, { blocked })) items.push(it);
    }
    // cottages round the rim of small islands, where the ground falls away from the apron
    if (!site.village) {
      let n = 0;
      for (let k = 0; k < 24 && n < 3; k++) {
        const a = a0 + Math.PI * 0.5 + k * 0.785 + r() * 0.2, d = p.r0 + 9 + r() * 10, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, yaw = Math.atan2(p.x - x, p.z - z);
        if (blocked(x, z, 6) && Math.hypot(x - p.x, z - p.z) < p.r0 + 6) continue;
        if (slots.some(([sx, sz]) => Math.hypot(x - sx, z - sz) < 18) || items.some(o => Math.hypot(o.x - x, o.z - z) < 14)) continue;
        const f = footing(x, z, yaw, 7, 5.5, hf, 3.5); if (!f) continue;
        items.push({ t: 'cottage', x, z, yaw, ...f, w: 7, d: 5.5, wall: r.pick(PAL.walls), roof: r.pick(PAL.roofs), door: r.pick(PAL.doors), seed: r() * 1e9 | 0 }); n++;
        if (r() < 0.6) { const [lx, lz] = toW(x, z, yaw, 0, -6); items.push({ t: 'laundry', x: lx, z: lz, y: 0, ground: true, yaw, drop: 0.3, seed: r() * 1e9 | 0 }); }
      }
    }
    // a jetty where there is none: the shore point facing away from the island centre past the apron
    if (!site.quay) {
      const a = a0 + Math.PI * (0.7 + r() * 0.6);
      for (let d = p.r0 + 6; d < I.r + 40; d += 2) {
        const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, h = hf(x, z);
        if (h < 0.6) { const yaw = Math.atan2(Math.cos(a), Math.sin(a)); items.push({ t: 'jetty', x, z, yaw, y: 1.2, drop: 1.2 - Math.min(0, rawH(x + Math.cos(a) * 12, z + Math.sin(a) * 12)), len: 16, seed: r() * 1e9 | 0, harbour: true }); break; }
      }
    }
    if (I.kind === 'radar' || I.name === 'NORTH ROCK' || I.name === 'SOUTH REEF') {   // lighthouse on the seaward rim
      const a = Math.atan2(I.z, I.x) + (r() - 0.5) * 0.6;
      for (let d = I.r * 0.9; d > p.r0 + 8; d -= 3) { const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d; if (hf(x, z) < 2 || blocked(x, z, 6)) continue; const f = footing(x, z, 0, 6, 6, hf, 6); if (f) { items.push({ t: 'lighthouse', x, z, yaw: a, ...f, seed: r() * 1e9 | 0, h: 14 }); break; } }
    }
    for (const it of items) it.isl = I.id;
    out.push({ I, items, roads: site.roads });
  }
  return out;
}
export { cellReady, settlementOf, farmOf, CELL, FARM_CELL, ROAD };
