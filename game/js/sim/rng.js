// SIM MODE: a seedable Math.random for CPU vs CPU runs. The war code (war.js, the rotary / air / ground / defence
// modules) draws its dice from Math.random; a sim run swaps it for this generator so a seed replays the same war.
// The live game never calls seedMath (only tools/warsim.mjs and ?sim&seed= do), so it plays exactly as before.
//
//   const R = seedMath(42)   Math.random is now sfc32(42); R.restore() puts the browser's back; R.calls counts draws
export function sfc32(seed) {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = (seed >>> 0) ^ 0xdeadbeef;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 16; i++) next();   // stir the seed in
  return next;
}
const NATIVE = Math.random;
export function seedMath(seed) {
  const g = sfc32(seed), R = { seed, calls: 0, restore: () => { Math.random = NATIVE; } };
  Math.random = () => { R.calls++; return g(); };
  return R;
}
// a private stream for the CPU commanders' own dice (so a doctrine change does not reshuffle the war's)
export function stream(seed, salt) { return sfc32((seed * 2654435761 + salt * 40503) >>> 0); }
