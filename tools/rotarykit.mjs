// rotarykit.mjs - shared helpers for the AI rotorcraft benches (ch46bench, mv22bench, waspbench, rotarymission):
// ISA air, a pass/fail table with source tags, and a trim runner that flies a flight model with its AI pilot and
// averages the last seconds. The flight models are pure JS (game/js/units/air/rotary/*), so no loader is needed.
export const ROT = '../game/js/units/air/rotary/';
export const DT = 1 / 60, deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180, KT = 1.94384, FT = 3.28084, FPM = 196.85, HP = 745.7;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// ISA density at a pressure altitude (m)
export const isaRho = h => 1.225 * (1 - 2.25577e-5 * h) ** 4.2559;
export const sea = (rho = 1.225) => ({ groundY: () => -800, water: () => false, rho });
export const land = (rho = 1.225, y = 0) => ({ groundY: () => y, water: () => false, rho });

export function table() {
  const T = { pass: 0, fail: 0, rows: [] };
  T.check = (name, ok, got, want = '', tag = '') => {
    ok ? T.pass++ : T.fail++; T.rows.push({ name, ok, got, want, tag });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(56)} ${got}${want ? '   (want ' + want + ')' : ''}${tag ? '  [' + tag + ']' : ''}`);
  };
  T.done = () => { console.log(`\n${T.pass} passed, ${T.fail} failed`); process.exitCode = T.fail ? 1 : 0; };
  return T;
}
// fly `secs` with step(t) -> ctl; avg = { key: () => value } averaged over the last `last` seconds
export function run(S, secs, step, env, avg = {}, last = 5, each) {
  const acc = {}; let n = 0;
  for (let t = 0; t < secs; t += DT) {
    const c = step(t); const e = S.step(DT, c, env); if (each) each(t, e);
    if (t > secs - last) { n++; for (const k in avg) acc[k] = (acc[k] || 0) + avg[k](); }
    if (S.dead) return { dead: S.dead, t };
  }
  for (const k in acc) acc[k] /= n;
  return acc;
}
