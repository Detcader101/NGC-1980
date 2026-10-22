#!/usr/bin/env node
// cavebench.mjs - pure-node check of the procedural Thrust caves (game/js/level.js). No browser.
//
//   node cavebench.mjs            # the five game caves as ASCII maps + a sweep of 150 seeds per tier
//   node cavebench.mjs --seeds 500 --quiet
//
// For every cave it asserts: the entrance shaft is open at x 29..35 under the surface and the crust is rock elsewhere;
// a disk of radius NAV_R (6 cells across) can fly from the shaft mouth to hover over the pad, the pod and every tank;
// the pad, tanks and pod rest on flat rock; turrets sit on a rock seat (floor or ceiling) facing air; tier+1 turrets;
// the pod is at least as far along the route as the pad. Exit code 1 on any failure.
import { buildLevel, navMap, levelHeight, SHAFT_X0, SHAFT_X1, WHY } from '../game/js/level.js';
import { ISLANDS } from '../game/js/world.js';

const args = process.argv.slice(2);
const SEEDS = +(args[args.indexOf('--seeds') + 1] || 0) || 150, QUIET = args.includes('--quiet');
let fails = 0;
const fail = (L, msg) => { fails++; console.log(`FAIL seed ${L.seed} tier ${L.tier}: ${msg}`); };

function check(L, home) {
  const { W, H, solid } = L, S = (x, y) => x < 0 || x >= W || y < 0 || (y < H && solid[Math.floor(y) * W + Math.floor(x)] === 1);
  if (H !== levelHeight(L.tier, home)) fail(L, 'height');
  for (let y = H - 6; y < H; y++) for (let x = SHAFT_X0; x <= SHAFT_X1; x++) if (S(x, y)) fail(L, `shaft blocked at ${x},${y}`);
  for (let y = H - 4; y < H; y++) for (let x = 0; x < W; x++) if ((x < SHAFT_X0 || x > SHAFT_X1) && !S(x, y)) { fail(L, `crust hole at ${x},${y}`); y = H; break; }
  // the drop: under the shaft mouth, clear air straight down onto a flat ledge at least 7 cells wide
  let y0 = H - 1; while (y0 > 0 && [...Array(SHAFT_X1 - SHAFT_X0 + 1)].every((_, i) => !S(SHAFT_X0 + i, y0 - 1))) y0--;
  for (let x = SHAFT_X0; x <= SHAFT_X1; x++) if (!S(x, y0 - 1)) { fail(L, `no flat ledge under the shaft (row ${y0 - 1}, x ${x})`); break; }
  if (!home && H - y0 < 18) fail(L, `drop only ${H - y0} cells`);
  L.drop = H - y0;
  const nm = navMap(L);
  const onFloor = (o, name, hw) => {
    const fy = Math.floor(o.y);
    for (let x = Math.floor(o.x) - hw; x <= Math.floor(o.x) + hw; x++) {
      if (!S(x, fy - 1)) return fail(L, `${name} at ${o.x},${o.y} not on rock (no floor under x=${x})`);
      if (S(x, fy) || S(x, fy + 1)) return fail(L, `${name} at ${o.x},${o.y} buried at x=${x}`);
    }
    return true;
  };
  // pad: solid pad cells in one row with air above
  let padN = 0;
  for (let i = 0; i < W * H; i++) if (L.pad[i]) {
    padN++; const x = i % W, y = (i / W) | 0;
    if (!S(x, y) || S(x, y + 1) || y + 1 !== L.padTop) fail(L, `pad cell ${x},${y} not a floor at padTop ${L.padTop}`);
  }
  if (padN < 7) fail(L, `pad only ${padN} cells`);
  const padX = L.start.x;
  if (nm.reach(padX, L.padTop) < 0) fail(L, 'pad unreachable');
  for (const [i, t] of L.tanks.entries()) { onFloor(t, `tank${i}`, 1); if ((!home || i === 1) && nm.reach(t.x, Math.floor(t.y)) < 0) fail(L, `tank${i} unreachable`); }
  if (!home) {
    onFloor(L.orb, 'pod', 1);
    const pr = nm.reach(L.orb.x, Math.floor(L.orb.y)), pa = nm.reach(padX, L.padTop);
    if (pr < 0) fail(L, 'pod unreachable');
    if (pr < pa) fail(L, `pod route ${pr} shorter than pad route ${pa}`);
  }
  if (L.turrets.length !== (home ? 0 : L.tier + 1)) fail(L, `${L.turrets.length} turrets`);
  for (const t of L.turrets) {
    const x = Math.floor(t.x), y = Math.floor(t.y), dir = t.y - y < 0.5 ? 1 : -1;
    if (S(x, y)) fail(L, `turret ${t.x},${t.y} inside rock`);
    else if (!S(x, y - dir) || !S(x - 1, y - dir) || !S(x + 1, y - dir)) fail(L, `turret ${t.x},${t.y} has no seat`);
    else if (S(x, y + dir) || S(x, y + 2 * dir)) fail(L, `turret ${t.x},${t.y} faces rock`);
  }
  return nm;
}

function ascii(L) {
  const { W, H, solid } = L, rows = [];
  const mark = new Map();
  const put = (x, y, c) => mark.set(Math.floor(y) * W + Math.floor(x), c);
  for (const t of L.tanks) put(t.x, t.y, 'F');
  for (const t of L.turrets) put(t.x, t.y, 'T');
  put(L.orb.x, L.orb.y, 'O');
  for (let y = H - 1; y >= 0; y--) {
    let r = '';
    for (let x = 0; x < W; x++) { const i = y * W + x; r += mark.get(i) || (L.pad[i] ? '=' : solid[i] ? '#' : ' '); }
    rows.push(r);
  }
  return rows.join('\n');
}

// 1) the caves the game builds: seed = base name
const caves = ISLANDS.filter(I => I.kind === 'hq' || I.kind === 'fortress').sort((a, b) => a.tier - b.tier);
let t0 = performance.now();
const game = caves.map(I => ({ I, L: buildLevel(I.tier, I.name, { home: I.owner === 1 }) }));
const tGame = performance.now() - t0;
for (const { I, L } of game) {
  const nm = check(L, I.owner === 1);
  if (!QUIET) {
    console.log(`\n=== ${I.name}  tier ${I.tier}  ${L.W}x${L.H}  attempts ${L.attempts}  drop ${L.drop}  route to ${I.owner === 1 ? "pad" : "pod"} ${L.route} steps  turrets ${L.turrets.length}  tanks ${L.tanks.length}`);
    console.log(ascii(L));
  }
}
console.log(`\nfive game caves generated in ${tGame.toFixed(1)} ms`);

// 2) a seed sweep per tier
for (const tier of [0, 1, 2, 3, 4]) {
  const home = tier === 0, st = { n: 0, att: 0, maxAtt: 0, route: 0, ms: 0, maxMs: 0 };
  for (let s = 0; s < SEEDS; s++) {
    const a = performance.now(), L = buildLevel(tier, 1000 + s, { home }), ms = performance.now() - a;
    check(L, home);
    st.n++; st.att += L.attempts; st.maxAtt = Math.max(st.maxAtt, L.attempts); st.route += L.route; st.ms += ms; st.maxMs = Math.max(st.maxMs, ms);
  }
  console.log(`tier ${tier}${home ? ' (home)' : ''}: ${st.n} seeds, attempts avg ${(st.att / st.n).toFixed(2)} max ${st.maxAtt}, route avg ${(st.route / st.n).toFixed(0)} steps, gen avg ${(st.ms / st.n).toFixed(1)} ms max ${st.maxMs.toFixed(1)} ms`);
}
// determinism
for (const { I, L } of game) {
  const L2 = buildLevel(I.tier, I.name, { home: I.owner === 1 });
  if (L2.solid.some((v, i) => v !== L.solid[i]) || JSON.stringify(L2.turrets) !== JSON.stringify(L.turrets)) { fails++; console.log(`FAIL ${I.name} not deterministic`); }
}
console.log(`rejected attempts by reason: ${JSON.stringify(WHY)}`);
console.log(fails ? `\n${fails} FAILURES` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
