// M60A3 crew stations on dev/tank.html: the driver (periscopes, instrument panel, T-bar, selector) at rest and moving,
// the gunner's sight pictures (M35E1 day, TTS thermal 3x / 8x, white-hot / black-hot, lased range and ready), the
// gunner's station looking up from the sight, the commander's cupola.   CHROME_PATH=... node snap.mjs scenes/tankinterior.mjs
export default async function (h) {
  await h.goto('dev/tank.html?debug&ui=0&res=0.6&at=0,40,0');
  await h.waitFor('window.__T', 15000);
  await h.eval('(__T.pause(true), __T.step(60), 1)');
  const view = async (name, v, look = [0, 0], js = '') => { await h.eval(`(() => { __T.view = '${v}'; __T.cam.look = [${look}]; ${js}; __T.render(); return 1; })()`); await h.wait(250); await h.shot(name); };
  // driver: engine running at idle, parked
  await view('driver-ahead', 'driver');
  await h.notblank();
  await view('driver-panel', 'driver', [0.75, -0.45]);
  await view('driver-tbar', 'driver', [0, -0.75]);
  await view('driver-right-rack', 'driver', [-1.0, -0.4]);
  await view('driver-head-out', 'driver', [0, -0.05], '__T.hatches.driver = 1; __T.step(1)');
  await h.eval('(__T.hatches.driver = 0, 1)');
  // drive off (H range, turning right): the T-bar, pedal and selector move, the gauges read speed and rpm
  await h.eval("(__T.input({ throttle: 1, range: 'L', park: false, steer: 0.4 }), __T.step(300), __T.input({ range: 'H' }), __T.step(300), 1)");
  await h.eval('({ v: __T.fm.out.fwd * 3.6, rpm: __T.fm.eng.w * 9.549, range: __T.fm.range })');
  await view('driver-moving', 'driver', [0.4, -0.3]);
  await h.eval("(__T.input({ throttle: 0, brake: 1, steer: 0 }), __T.step(240), __T.input(null), 1)");
  // gunner: lase a panel at 1500 m, day sight, then the TTS
  await h.eval("(() => { __T.reset(0, 40, 0, { range: 'N' }); __T.step(60); const t = __T.TG.TARGETS.find(t => t.id === 'panel1500'); __T.aimAt(t.x, 0.5 + 1.2, t.z); __T.input({ lase: true }); __T.step(2); __T.input({ lase: false }); __T.step(30); return __T.V.laser.range; })()");
  await h.expect('__T.V.laser.range > 1400 && __T.V.laser.range < 1600');
  await view('gunner-day', 'gunner', [0, 0], "__T.IN.sight = 'day'; __T.step(1)");
  await view('gunner-tts8-wh', 'gunner', [0, 0], "__T.IN.sight = 'tts'; __T.IN.ttsMag = 8; __T.step(1)");
  await view('gunner-tts3-bh', 'gunner', [0, 0], "__T.IN.ttsMag = 3; __T.IN.ttsPolarity = 'bh'; __T.step(1)");
  await h.eval("(__T.IN.sight = 'day', __T.IN.ttsPolarity = 'wh', __T.IN.ttsMag = 8, 1)");
  await view('gunner-station', 'gunner', [0, 0], '__T.gunLook = true');
  await view('gunner-station-left', 'gunner', [0.6, -0.2], '__T.gunLook = true');
  await view('gunner-station-right', 'gunner', [-0.9, -0.1], '__T.gunLook = true');
  await h.eval('(__T.gunLook = false, 1)');
  await view('commander', 'commander', [0, -0.1]);
  await h.eval('({ sight: __T.sightActive, view: __T.view })');
  await view('commander-left', 'commander', [1.2, -0.15]);
}
