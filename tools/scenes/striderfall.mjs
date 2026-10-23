// RW-1 STRIDER: knocked down by a side blow, lies there, gets up (the mechanical get-up), plus a stumble from a push
// it can recover from. Frames from dev/rwmodels.html, stepped by hand.    node snap.mjs scenes/striderfall.mjs
export default async function (h) {
  await h.goto('dev/rwmodels.html?unit=strider');
  await h.waitFor('window.__RW && __RW.units.length', 10000);
  await h.eval(`(() => { __RW.paused = true; Object.assign(__RW.cam, { yaw: 0.35, pitch: 0.12, dist: 6.5 }); __RW.cam.t.set(0.8, 0.9, 0); __RW.step(0.5); __RW.render(); return true; })()`);
  await h.shot('fall-00-standing');
  await h.eval(`(() => { __RW.units[0].S.push(900, 0, 0); return true; })()`);
  let t = 0;
  for (const [at, name] of [[0.25, 'fall-01-tipping'], [0.6, 'fall-02-going'], [1.0, 'fall-03-down'], [1.75, 'fall-04-getup-fold'], [2.3, 'fall-05-getup-swing'], [2.85, 'fall-06-getup-stop'], [3.4, 'fall-07-getup-finish'], [4.2, 'fall-08-up']]) {
    await h.eval(`(() => { let n = Math.round((${at} - ${t}) / 0.02); while (n-- > 0) __RW.step(0.02); __RW.render(); const S = __RW.units[0].S; return { mode: S.mode, c: S.c.map(v => +v.toFixed(2)), getup: +S.getup.toFixed(2) }; })()`);
    t = at;
    await h.shot(name);
  }
  // a recoverable push: the quick stepping of a stumble
  await h.eval(`(() => { __RW.units[0].S.push(0, 0, -380); return true; })()`);
  t = 0;
  for (const [at, name] of [[0.2, 'stumble-01'], [0.45, 'stumble-02'], [0.8, 'stumble-03'], [1.6, 'stumble-04-recovered']]) {
    await h.eval(`(() => { let n = Math.round((${at} - ${t}) / 0.02); while (n-- > 0) __RW.step(0.02); const S = __RW.units[0].S; Object.assign(__RW.cam, { yaw: 1.4, pitch: 0.1, dist: 7 }); __RW.cam.t.set(S.c[0], 0.9, S.c[2]); __RW.render(); return { mode: S.mode, stumble: +S.stumble.toFixed(2), steps: S.stepCount }; })()`);
    t = at;
    await h.shot(name);
  }
  await h.expect(`__RW.units[0].S.mode === 'stand' || __RW.units[0].S.mode === 'walk'`, 'back on its feet');
}
