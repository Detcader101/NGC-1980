// RW-1 STRIDER gait: a strip of side-on frames through one stride, walking then running, following the machine.
//   node snap.mjs scenes/stridergait.mjs
export default async function (h) {
  for (const [walk, tag, dt] of [[1.6, 'walk', 0.14], [4.4, 'run', 0.07]]) {
    await h.goto(`dev/rwmodels.html?unit=strider&walk=${walk}`);
    await h.waitFor('window.__RW && __RW.units.length', 10000);
    await h.eval(`(() => { __RW.paused = true; for (let i = 0; i < 300; i++) __RW.step(1 / 60); Object.assign(__RW.cam, { yaw: 1.5708, pitch: 0.06, dist: 5.2 }); __RW.cam.t.set(0, 1.0, 0); __RW.render(); return true; })()`);
    for (let k = 0; k < 4; k++) {
      await h.eval(`(() => { for (let i = 0; i < Math.round(${dt} * 60); i++) __RW.step(1 / 60); __RW.render(); const S = __RW.units[0].S; return { t: +S.t.toFixed(2), stance: S.stance, v: +Math.hypot(S.v[0], S.v[2]).toFixed(2) }; })()`);
      await h.shot(`${tag}-${k}`);
    }
  }
}
