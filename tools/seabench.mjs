// SEAWORLD: the live sea (seamotion.js retuneSea / advanceSea / seaElevation, step at a position) and the weather
// drift (seaweather.js). Pure node, no browser.   node tools/seabench.mjs
import { SEA_STATES, SHIPS, makeSea, retuneSea, advanceSea, seaElevation, createShipMotion, SEA_GAME_SCALE } from '../game/js/units/naval/seamotion.js';
import { createSeaWeather, WEATHER } from '../game/js/units/naval/seaweather.js';

let pass = 0, fail = 0;
const check = (ok, name, got, want) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${got}${want ? `   (want ${want})` : ''}`); };
const hsOf = sea => 4 * Math.sqrt(sea.comps.reduce((s, c) => s + c.a * c.a / 2, 0));

// 1. integer states are unchanged by the rewrite: Hs exact, 14 components; fractional states interpolate
for (const ss of [3, 4, 5, 7]) { const s = makeSea(ss, -1.2, 11); check(Math.abs(hsOf(s) - SEA_STATES[ss].hs) < 1e-9 && s.comps.length === 14, `SS${ss}: discretised Hs = table`, hsOf(s).toFixed(3)); }
{ const s = makeSea(4.5, -1.2, 11), want = (SEA_STATES[4].hs + SEA_STATES[5].hs) / 2; check(Math.abs(hsOf(s) - want) < 1e-9, 'SS4.5: Hs halfway between SS4 and SS5', hsOf(s).toFixed(3), want.toFixed(3)); }

// 2. retuning keeps the running phases (no jump in the surface at a point beyond the amplitude change)
{
  const s = makeSea(4, -1.2, 11); advanceSea(s, 37.3);
  const ph = s.comps.map(c => c.ph); retuneSea(s, 4.01);
  check(s.comps.every((c, i) => c.ph === ph[i]), 'retune keeps every component phase', 'same');
  const e0 = seaElevation(s, 120, -80); retuneSea(s, 4.02); const e1 = seaElevation(s, 120, -80);
  check(Math.abs(e1 - e0) < 0.05, 'a small retune moves the surface only a little', `${Math.abs(e1 - e0).toFixed(4)} m`, '< 0.05');
}

// 3. the game sea is the carrier's scale: a ship stepped AT ITS POSITION on the live sea moves exactly as the
//    encounter-frequency integration does (k_game U_game = k U_real) when both start from the same phases
{
  const P = SHIPS.albatross, sea = makeSea(5, 0.4, 11), A = createShipMotion(P, sea, 3), B = createShipMotion(P, sea, 3);
  const U = 5, yaw = 1.1, dt = 1 / 60; let x = 30, z = -40, err = 0, amp = 0;
  A.ph = sea.comps.map(c => c.ph - c.kg * (c.dx * x + c.dz * z));
  for (let i = 0; i < 60 * 60; i++) {
    advanceSea(sea, dt); x += -Math.sin(yaw) * U * dt; z += -Math.cos(yaw) * U * dt;
    A.step(dt, U, yaw, 0); B.step(dt, U, yaw, 0, x, z);
    err = Math.max(err, Math.abs(A.heave - B.heave), Math.abs(A.pitch - B.pitch) * 50); amp = Math.max(amp, Math.abs(B.heave));
  }
  check(err < 1e-3 && amp > 0.05, 'ALBATROSS at 5 m/s: position phases == encounter integration (60 s)', `max diff ${err.toExponential(1)} (heave amp ${amp.toFixed(2)} m)`, '< 1e-3');
  check(Math.abs(SEA_GAME_SCALE - P.scale) < 1e-12, 'the drawn sea uses the ALBATROSS scale', SEA_GAME_SCALE.toFixed(4));
}

// 4. what the ship rides is what is drawn: a stationary small ship's heave tracks the surface elevation at its
//    position (LEVIATHAN-sized boat, long swell; the waterplane averaging takes some off, so correlation not equality)
{
  const sea = makeSea(4, 0, 5), mo = createShipMotion(SHIPS.leviathan, sea, 1); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < 60 * 120; i++) { advanceSea(sea, 1 / 60); mo.step(1 / 60, 0, 0, 0, 200, 300); const e = seaElevation(sea, 200, 300) / SEA_GAME_SCALE; if (i > 600) { sxy += e * mo.heave; sxx += e * e; syy += mo.heave * mo.heave; } }
  const r = sxy / Math.sqrt(sxx * syy);
  check(r > 0.5, 'a ship at rest heaves with the surface drawn under it (correlation)', r.toFixed(2), '> 0.5');
}

// 5. the weather: bounded, slow, reports changes; off = no change
{
  const W = createSeaWeather(4, 0, 9); W.set(4, true);
  let lo = 9, hi = -1, maxRate = 0, msgs = 0, prev = W.cur, maxVeer = 0;
  for (let t = 0; t < 4 * 3600; t += 0.5) { const o = W.step(0.5); if (o && o.msg) msgs++; lo = Math.min(lo, W.cur); hi = Math.max(hi, W.cur); maxRate = Math.max(maxRate, Math.abs(W.cur - prev) / 0.5); prev = W.cur; maxVeer = Math.max(maxVeer, Math.abs(W.dir)); }
  check(lo >= 2 - 1e-9 && hi <= 6 + 1e-9 && hi - lo > 1, 'drift stays within 2 states of the choice and does move', `${lo.toFixed(2)} .. ${hi.toFixed(2)}`, '2..6');
  check(maxRate <= WEATHER.rate + 1e-9, 'never faster than one state per 4 minutes', `${(maxRate * 60).toFixed(3)} /min`);
  check(msgs > 2, 'the feed hears about the sea getting up / easing', `${msgs} messages in 4 h`);
  check(maxVeer <= WEATHER.veer + 1e-9, 'the main direction veers at most 25 deg', `${(maxVeer * 57.3).toFixed(1)} deg`);
  const Q = createSeaWeather(5, 0, 9); Q.set(5, false); let moved = false; for (let t = 0; t < 3600; t++) if (Q.step(1)) moved = true;
  check(!moved && Q.cur === 5, 'drift off: the sea stays where it is set', String(Q.cur));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
