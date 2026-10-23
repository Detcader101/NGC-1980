// SEAWORLD: the lived-in world as colliders and floors (game/js/world/solid.js), in node: a town's houses and church
// stop a walker-sized circle, field walls have their gate gap, bridge decks are floors over the water / valley.
//   node tools/worldsolidbench.mjs [cx] [cz]
import * as world from '../game/js/world.js';
import * as N from '../game/js/world/net.js';
import { createWorldSolid } from '../game/js/world/solid.js';
import { townItems } from '../game/js/world/layout.js';

let pass = 0, fail = 0;
const check = (ok, name, got = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(66)} ${got}`); };
const [cx, cz] = [+(process.argv[2] ?? 3600), +(process.argv[3] ?? 1800)];
N.ensure(cx, cz);
const S = createWorldSolid({ hf: world.islandH });

// a minimal GR.collide for the test: push a circle out of every part near it (ground.js pushBox / pushCircle maths)
function push(o, parts) {
  let n = 0;
  for (const b of parts) {
    if (o.y1 < b.y0 || o.y0 > b.y1) continue;
    if (b.r !== undefined) { const dx = o.x - b.x, dz = o.z - b.z, d = Math.hypot(dx, dz), m = o.r + b.r; if (d < m) { o.x = b.x + dx / (d || 1) * m; o.z = b.z + dz / (d || 1) * m; n++; } continue; }
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw), dx = o.x - b.x, dz = o.z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
    const qx = Math.max(-b.hw, Math.min(b.hw, lx)), qz = Math.max(-b.hl, Math.min(b.hl, lz)), ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
    if (d >= o.r) continue;
    let nlx, nlz, pen; if (d > 1e-6) { nlx = ex / d; nlz = ez / d; pen = o.r - d; } else { const fx = b.hw - Math.abs(lx), fz = b.hl - Math.abs(lz); if (fx < fz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = fx + o.r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = fz + o.r; } }
    o.x += (nlx * c + nlz * s) * pen; o.z += (-nlx * s + nlz * c) * pen; n++;
  }
  return n;
}

// 1. a town: every house blocks, and a walk straight at a house's front stops at its wall
const towns = []; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const s = N.settlementOf(Math.floor(cx / N.CELL) + i, Math.floor(cz / N.CELL) + j); if (s && !towns.includes(s)) towns.push(s); }
const town = towns.sort((a, b) => ({ town: 0, village: 1, hamlet: 2 }[a.size] - { town: 0, village: 1, hamlet: 2 }[b.size]))[0];
check(!!town, 'found a settlement near the probe', town ? `${town.size} at ${town.x.toFixed(0)}, ${town.z.toFixed(0)}` : '');
const items = townItems(town, world.islandH), houses = items.filter(it => it.t === 'house' || it.t === 'terrace' || it.t === 'cottage');
let t0 = performance.now(); S.near(town.x, town.z, 3); const ms = performance.now() - t0;
check(houses.length > 3, 'the town has houses', `${houses.length} houses / terraces / cottages`);
check(ms < 600, 'building the colliders of the town chunk', `${ms.toFixed(0)} ms (once per chunk)`);
let stopped = 0, tried = 0;
for (const h of houses.slice(0, 20)) {
  const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);   // the front (+z local) faces the street
  const o = { x: h.x + fx * (h.d / 2 + 3), z: h.z + fz * (h.d / 2 + 3), r: 0.4, y0: h.y + 0.25, y1: h.y + 1.8 };
  for (let k = 0; k < 80; k++) { o.x -= fx * 0.1; o.z -= fz * 0.1; push(o, S.near(o.x, o.z, 2)); }   // walk 8 m at the door
  const dist = (o.x - h.x) * fx + (o.z - h.z) * fz; tried++; if (dist > h.d / 2 + 0.3) stopped++;
}
check(stopped === tried, 'walking at a house front stops at the wall (never inside)', `${stopped} / ${tried}`);
const church = items.find(it => it.t === 'church');
if (church) { const o = { x: church.x, z: church.z + 30, r: 0.4, y0: church.y + 0.25, y1: church.y + 1.8 }; for (let k = 0; k < 300; k++) { o.z -= 0.1; push(o, S.near(o.x, o.z, 2)); } check(o.z > church.z + 4, 'the churchyard wall / church stops a walker', `stopped at ${(o.z - church.z).toFixed(1)} m`); }

// 2. fields: walls with a gate gap
let farm = null; for (let j = -4; j <= 4 && !farm; j++) for (let i = -4; i <= 4 && !farm; i++) { const f = N.farmOf(Math.floor(cx / N.FARM_CELL) + i, Math.floor(cz / N.FARM_CELL) + j); if (f && f.fields.length) farm = f; }
if (farm) {
  const F = farm.fields[0], parts = S.near(F.x, F.z, Math.max(F.w, F.d)).filter(p => p.t === 'wall' || p.t === 'hedge');
  check(parts.length >= 4, 'a field has walls / hedges round it', `${parts.length} segments (${farm.style})`);
} else check(false, 'found a farm');

// 3. bridges: the deck is a floor (over water or a valley), parapets along it
let br = null; for (const R of N.netState.roads) { for (let i = 0; i + 1 < R.xs.length && !br; i++) if (R.br[i] && R.br[i + 1] && (R.ys[i] + R.ys[i + 1]) / 2 - Math.max(0, world.islandH((R.xs[i] + R.xs[i + 1]) / 2, (R.zs[i] + R.zs[i + 1]) / 2)) > 3) br = { R, i }; if (br) break; }   // a span, not an abutment
if (br) {
  const { R, i } = br, x = (R.xs[i] + R.xs[i + 1]) / 2, z = (R.zs[i] + R.zs[i + 1]) / 2, deck = (R.ys[i] + R.ys[i + 1]) / 2, g = world.islandH(x, z);
  const fl = S.floor(x, z, deck + 0.5, 0.45), under = S.floor(x, z, Math.max(g, 0) + 0.1, 0.45);
  check(fl !== null && Math.abs(fl - deck) < 0.4 && deck - Math.max(g, 0) > 1, 'a bridge deck is a floor above the ground / sea under it', `deck ${fl === null ? 'none' : fl.toFixed(2)} vs road ${deck.toFixed(2)}, ground ${g.toFixed(1)}`);
  check(under === null || under < deck - 1, 'under the bridge you are under it (no floor from below)', String(under));
  const par = S.near(x, z, 8).filter(p => p.t === 'parapet');
  check(par.length >= 2, 'the bridge has parapets', `${par.length}`);
  check(S.surface(x, z) !== null, 'the deck is a road surface', S.surface(x, z));
} else check(false, 'found a bridge');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
