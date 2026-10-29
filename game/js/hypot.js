// hypot.js - (ngc/perf-cpu) Math.hypot without the garbage. V8's Math.hypot is a variadic builtin that allocates an
// array of its arguments on every call (it is not inlined by the optimiser): in the hot loops it was the single
// biggest source of short-lived garbage (a fifth of the war's allocations). These do V8's own algorithm (largest
// magnitude out, Kahan-summed squares of the ratios, sqrt times the largest) with the same operations in the same
// order, so they return the same bits as Math.hypot; tools/hypotbench.mjs checks that against Math.hypot. Plain
// Math.sqrt(x*x + y*y) would round differently now and then, and the seeded war replays (tools/warsim.mjs) would drift.
export function hypot2(x, y) {
  const a = Math.abs(x), b = Math.abs(y);
  if (a === Infinity || b === Infinity) return Infinity;
  if (a !== a || b !== b) return NaN;
  const m = a > b ? a : b;
  if (m === 0) return 0;
  const p = a / m, q = b / m;
  return Math.sqrt(p * p + q * q) * m;   // (the Kahan compensation after the first term is always exactly 0)
}
export function hypot3(x, y, z) {
  const a = Math.abs(x), b = Math.abs(y), d = Math.abs(z);
  if (a === Infinity || b === Infinity || d === Infinity) return Infinity;
  if (a !== a || b !== b || d !== d) return NaN;
  let m = a > b ? a : b; if (d > m) m = d;
  if (m === 0) return 0;
  const p = a / m, q = b / m, r = d / m;
  let sum = 0, c = 0, s, t;
  s = p * p - c; t = sum + s; c = (t - sum) - s; sum = t;
  s = q * q - c; t = sum + s; c = (t - sum) - s; sum = t;
  s = r * r - c; t = sum + s; sum = t;
  return Math.sqrt(sum) * m;
}
