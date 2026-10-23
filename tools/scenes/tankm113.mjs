// M113A2 on dev/tank.html?veh=m113: exterior with the ramp down and the trim vane up, the troop compartment through
// the open ramp and from inside, the driver's station; then a swim: vane up, pumps on, into the lake, afloat, swim speed.
//   CHROME_PATH=... node snap.mjs scenes/tankm113.mjs
export default async function (h) {
  await h.goto('dev/tank.html?debug&ui=0&res=0.6&veh=m113&at=-60,20,1.5708');
  await h.waitFor('window.__T', 15000);
  await h.eval('(__T.pause(true), __T.step(60), 1)');
  const view = async (name, v, look = [0, 0], js = '') => { await h.eval(`(() => { __T.view = '${v}'; __T.cam.look = [${look}]; ${js}; __T.render(); return 1; })()`); await h.wait(250); await h.shot(name); };
  await view('ext-front34', 'free', [0, 0], 'Object.assign(__T.cam, { yaw: 2.4 - 1.5708, pitch: 0.25, dist: 9 })');
  await h.notblank();
  // ramp down, vane up, hatches open
  await h.eval("(__T.input({ ramp: true, vane: true }), __T.hatches.cupola = 1, __T.hatches.driver = 1, __T.hatches.cargo = 1, __T.step(600), ({ ramp: __T.V.ramp, vane: __T.V.vane }))");
  await h.expect('__T.V.ramp > 0.99 && __T.V.vane > 0.99');
  await view('ext-rear-ramp', 'free', [0, 0], 'Object.assign(__T.cam, { yaw: -0.5 - 1.5708, pitch: 0.18, dist: 8 })');
  await view('ext-vane-up', 'free', [0, 0], 'Object.assign(__T.cam, { yaw: 1.9 - 1.5708, pitch: 0.12, dist: 9 })');
  await view('troops-from-ramp', 'troops', [0, -0.05]);
  await view('troops-left-bench', 'troops', [0.9, -0.2]);
  await h.eval("(__T.hatches.cupola = 0, __T.hatches.driver = 0, __T.hatches.cargo = 0, __T.input({ ramp: false }), __T.step(600), __T.V.ramp)");
  await view('troops-ramp-closed', 'troops', [3.14, -0.1]);
  await view('driver-ahead', 'driver', [0, 0]);
  await view('driver-panel', 'driver', [0.9, -0.35]);
  await view('driver-laterals', 'driver', [0.1, -0.85]);
  // swim: pumps on, drive west into the ford and the lake
  await h.eval("(__T.input({ pumps: true, range: '1', throttle: 0.45, park: false }), __T.step(60 * 10), __T.input({ range: '1-2', throttle: 1 }), __T.step(60 * 25), ({ x: __T.fm.origin()[0], afloat: __T.fm.water.afloat, depth: __T.fm.water.depth, v: __T.fm.out.fwd * 3.6, inside: __T.fm.water.inside, flooded: __T.fm.eng.flooded }))");
  await h.expect('__T.fm.water.afloat && !__T.fm.eng.flooded');
  await h.eval("(() => { for (let i = 0; i < 120 && __T.fm.origin()[0] > -118; i++) __T.step(30); return { x: __T.fm.origin()[0], v: __T.fm.out.fwd * 3.6, inside: __T.fm.water.inside, pitch: __T.fm.out.pitch * 57.3, afloat: __T.fm.water.afloat }; })()");
  await h.expect('Math.abs(__T.fm.out.fwd * 3.6 - 5.8) < 1.2');
  await view('swim-side', 'free', [0, 0], 'Object.assign(__T.cam, { yaw: 2.6, pitch: 0.12, dist: 11 })');
  await view('swim-driver', 'driver', [0, 0]);
  await h.eval('(__T.input(null), 1)');
}
