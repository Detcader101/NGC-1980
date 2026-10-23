// M60A3 on the test ground (dev/tank.html): the obstacle lanes driven by a simple speed-holding driver - the 0.91 m
// step, the 2.6 m trench, the 60 % ramp, the 30 % ridge, the mud pit, the 1.2 m ford - with a chase-camera shot at the
// hard moment of each, then gunnery: lase the 1000 m panel, fire SABOT, expect a hit; a moving shot with the stabiliser.
//   CHROME_PATH=... node snap.mjs scenes/tankdrive.mjs
export default async function (h) {
  await h.goto('dev/tank.html?debug&ui=0&res=0.5');
  await h.waitFor('window.__T', 15000);
  await h.eval('(__T.pause(true), 1)');
  // a driver that holds a speed (km/h); runs n seconds at 60 Hz
  await h.eval(`(window.__drive = (kmh, secs, steer = 0) => { let range = 'L';
    for (let i = 0; i < secs * 60; i++) { const v = __T.fm.out.fwd * 3.6; if (v > 11 && kmh > 13) range = 'H';
      __T.input({ throttle: Math.max(0, Math.min(1, 0.35 + (kmh - v) * 0.25)), brake: v - kmh > 6 ? 0.4 : 0, range, park: false, steer }); __T.step(1); }
    return { x: __T.fm.origin()[0], y: __T.fm.origin()[1], z: __T.fm.origin()[2], v: __T.fm.out.fwd * 3.6, pitch: __T.fm.out.pitch * 57.3, roll: __T.fm.out.roll * 57.3 }; }, 1)`);
  const lane = async (name, x, z, yaw, kmh, secs, cam, expect, pre = '') => {
    await h.eval(`(__T.reset(${x}, ${z}, ${yaw}, { range: 'L' }), ${pre} __T.step(30), 1)`);
    await h.eval(`(window.__res = __drive(${kmh}, ${secs}), __res)`, name);
    await h.eval(`(() => { __T.view = 'chase'; Object.assign(__T.cam, { yaw: ${cam[0]}, pitch: ${cam[1]}, dist: ${cam[2]} }); __T.render(); return 1; })()`);
    await h.wait(200); await h.shot(name);
    if (expect) await h.expect(expect, name);
  };
  // step A: start 12 m short of it, shoot while the hull is up on the lip
  await lane('step-091', 26, -26, 0, 4, 14.5, [1.9, 0.18, 14], null);
  await h.eval('(window.__res = __drive(4, 10), __res)', 'step-after');
  await h.expect('__res.z < -45 && __res.y > 1.2', 'over the step');
  await lane('trench-26', 42, -28, 0, 5, 6, [1.6, 0.3, 15], null);
  await h.eval('(window.__res = __drive(5, 8), __res)', 'trench-after');
  await h.expect('__res.z < -45 && __res.y > 0.3', 'over the trench');
  await lane('ramp-60', 58, -32, 0, 4, 16, [1.75, 0.1, 18], '__res.y > 3', '');
  await lane('ridge-30', 72.5, -15, 0, 12, 4, [3.0, 0.2, 14], 'Math.abs(__res.roll) > 12 && Math.abs(__res.roll) < 25');
  await lane('mud', -45, 8, 0, 20, 6, [2.3, 0.25, 14], '__res.v > 4');
  await h.eval('({ sink: __T.fm.sink, soil: __T.fm.soil })');
  await lane('ford-12', -72, 0, 1.5708, 6, 5.5, [0.9, 0.12, 14], '__T.fm.water.depth > 0.6 && !__T.fm.eng.flooded');
  await lane('dust-run', 40, 20, 0, 32, 9, [0.5, 0.2, 16], '__res.v > 18');
  await h.eval('(__T.input(null), 1)');
  // ---- gunnery: from the start line, lay on the 1000 m panel, lase, fire SABOT
  await h.eval(`(() => { __T.reset(0, 40, 0, { range: 'N' }); __T.step(120); const t = __T.TG.TARGETS.find(t => t.id === 'panel1000'); __T.aimAt(t.x, 0.5 + 1.2, t.z);
    __T.input({ lase: true }); __T.step(2); __T.input({ lase: false }); __T.step(20); return { range: __T.V.laser.range, se: __T.V.fc.se, gun: __T.V.gun.state }; })()`);
  await h.expect('__T.V.laser.range > 950 && __T.V.laser.range < 1050');
  await h.eval("(() => { __T.view = 'gunner'; __T.IN.sight = 'day'; __T.render(); return 1; })()"); await h.wait(200); await h.shot('gun-laid-1000');
  await h.eval(`(() => { __T.input({ fire: true }); __T.step(3); __T.input({ fire: false }); for (let i = 0; i < 90; i++) __T.step(1); return { hits: __T.stats.hits, shots: __T.stats.shots, last: __T.stats.last }; })()`);
  await h.expect('__T.stats.shots === 1 && __T.stats.hits === 1', 'first-round hit at 1000 m');
  await h.eval("(() => { __T.view = 'free'; Object.assign(__T.cam, { yaw: 2.6, pitch: 0.15, dist: 14 }); __T.input({ fire: false }); __T.step(1); __T.render(); return 1; })()");
  await h.shot('after-shot');
  // a moving shot: 20 km/h up the range road with the stabiliser on; lay once on the 1000 m panel, lase, then hands off
  // for 1.5 s (the stabiliser holds the lay while the hull moves) and fire
  await h.eval(`(() => { __T.input(null); __T.reset(-2, 140, 0, { range: 'L' }); __T.step(30); __T.stats.shots = 0; __T.stats.hits = 0;
    window.__res = __drive(20, 12); const t = __T.TG.TARGETS.find(t => t.id === 'panel1000'); __T.aimAt(t.x, 0.5 + 1.2, t.z);
    __T.input({ lase: true, throttle: 0.5, range: 'H', park: false, stab: true }); __T.step(2); __T.input({ lase: false }); __T.step(90);
    return { v: __T.fm.out.fwd * 3.6, range: __T.V.laser.range, lead: __T.V.fc.lead, dist: Math.hypot(__T.fm.origin()[0] - t.x, __T.fm.origin()[2] - t.z) }; })()`);
  await h.eval("(() => { __T.view = 'gunner'; __T.IN.sight = 'day'; __T.render(); return 1; })()"); await h.wait(150); await h.shot('moving-laid');
  await h.eval(`(() => { __T.input({ fire: true }); __T.step(3); __T.input({ fire: false }); for (let i = 0; i < 90; i++) __T.step(1); return { hits: __T.stats.hits, shots: __T.stats.shots, last: __T.stats.last, impacts: __T.stats.impacts.slice(-1) }; })()`);
  await h.expect('__T.stats.shots === 1 && __T.stats.hits === 1', 'hit on the move at ~1000 m (stabilised)');
  await h.eval('(__T.input(null), 1)');
}
