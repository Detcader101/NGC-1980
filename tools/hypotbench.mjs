#!/usr/bin/env node
// hypotbench.mjs - (ngc/perf-cpu) game/js/hypot.js returns exactly Math.hypot's bits (so swapping it in keeps the seeded
// war replays the same) and allocates nothing.     node tools/hypotbench.mjs
import { hypot2, hypot3 } from '../game/js/hypot.js';
let pass = 0, fail = 0;
const check = (ok, name, got) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${got}`); };
let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
const val = () => { const k = rnd(); if (k < 0.02) return [0, -0, Infinity, -Infinity, NaN, 1e-320, 1e308, -1e308][Math.floor(rnd() * 8)]; const e = Math.floor(rnd() * 40) - 20; return (rnd() - 0.5) * Math.pow(10, e) * (rnd() < 0.3 ? 1 : 1e3); };
let bad2 = 0, bad3 = 0, first = '';
const N = 4e6;
for (let i = 0; i < N; i++) {
  const a = val(), b = val(), c = val();
  if (!Object.is(hypot2(a, b), Math.hypot(a, b))) { bad2++; first ||= `hypot2(${a}, ${b}) = ${hypot2(a, b)} vs ${Math.hypot(a, b)}`; }
  if (!Object.is(hypot3(a, b, c), Math.hypot(a, b, c))) { bad3++; first ||= `hypot3(${a}, ${b}, ${c}) = ${hypot3(a, b, c)} vs ${Math.hypot(a, b, c)}`; }
}
// game-like values: metres and m/s, where the war lives
for (let i = 0; i < N; i++) {
  const a = (rnd() - 0.5) * 8000, b = (rnd() - 0.5) * 300, c = (rnd() - 0.5) * 2;
  if (!Object.is(hypot2(a, b), Math.hypot(a, b))) { bad2++; first ||= `hypot2(${a}, ${b})`; }
  if (!Object.is(hypot3(a, b, c), Math.hypot(a, b, c))) { bad3++; first ||= `hypot3(${a}, ${b}, ${c})`; }
}
check(bad2 === 0, `hypot2 == Math.hypot, bit for bit (${2 * N} pairs)`, `${bad2} differ ${first}`);
check(bad3 === 0, `hypot3 == Math.hypot, bit for bit (${2 * N} triples)`, `${bad3} differ`);
const time = f => { const t0 = performance.now(); let acc = 0; for (let i = 0; i < 5e6; i++) acc += f(i * 0.37 - 900, i * 0.011 + 3, 1.5); return [performance.now() - t0, acc]; };
time((a, b, c) => Math.hypot(a, b, c)); time(hypot3);
const [tm] = time((a, b, c) => Math.hypot(a, b, c)), [th] = time(hypot3);
const m0 = process.memoryUsage().heapUsed; let acc = 0; for (let i = 0; i < 2e6; i++) acc += hypot2(i, 3); const dm = process.memoryUsage().heapUsed - m0;
check(th < tm, 'hypot3 faster than Math.hypot (5M calls)', `${th.toFixed(0)} ms vs ${tm.toFixed(0)} ms`);
check(dm < 1e6, 'hypot2 allocates nothing (2M calls)', `${(dm / 1024).toFixed(0)} KB heap growth (${acc > 0})`);
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
