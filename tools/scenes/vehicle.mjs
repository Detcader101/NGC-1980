// GROUND-VEHICLE HOST (FOUNDATION): the placeholder TEST CAR waits at the home island's motor pool. Walk to it, get in
// (ngc/bugsweep) wall timeouts x5 (min 30 s): the full table ran it at 1-5 fps headless (the brake stop timed out and the "parked" car was still rolling)
// (driver), drive across the island (W, steer with D), stop, look from the chase camera, change seat, get out. Then the
// motor pool (7) puts it on the ALBATROSS's deck: drive it along the deck while she sails and turns, park, get out.
// Finally drive it into the sea: the engine drowns past the 0.53 m fording depth.
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 150000);
  await h.eval(`(window.__V = {
    S: () => __G.carC.sim,
    st: () => { const S = __G.carC.sim; return { craft: __G.G.craft, seat: __G.crafts.seat, x: +S.x.toFixed(1), y: +S.y.toFixed(2), z: +S.z.toFixed(1), yaw: +S.yaw.toFixed(2), v: +S.v.toFixed(2), kmh: +(Math.abs(S.v) * 3.6).toFixed(1), engine: S.engineOn, gear: S.gear, rpm: Math.round(S.rpm), surface: S.surface, water: +S.water.toFixed(2), hp: Math.round(S.hp), flooded: S.flooded, plat: S.plat ? S.plat.type : null, onGround: S.onGround, pitch: +S.pitch.toFixed(3), roll: +S.roll.toFixed(3) }; },
    toDoor: () => { const d = __G.crafts.toWorld(__G.carC, [-1.9, 0, -0.1]); return __G.foot.spawnAt({ x: d.x, y: __G.carC.sim.y + 0.5, z: d.z, yaw: d.yaw - Math.PI / 2 }); },
    loc: () => { const c = __G.war.carrier, S = __G.carC.sim; const s = __G.GR.toShip(c, S.x, S.y, S.z); return { x: +s.x.toFixed(2), z: +s.z.toFixed(2) };   /* the ship frame: heave, pitch and roll swing a parked car with her */ },
  }, 1)`);
  await h.expect('__G.carC.exists');
  await h.eval('__V.st()');
  // out of the Huey, over to the car's driver door (the motor pool is on the home island)
  await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === 'foot'");
  await h.eval('__V.toDoor()'); await h.wait(600);
  await h.eval("document.getElementById('hint').textContent");
  await h.expect("document.getElementById('hint').textContent.startsWith('Y: GET IN THE TEST CAR  (DRIVER)')");
  await h.eval("(__G.foot.view = 'third', __G.foot.W.yaw += Math.PI / 2 + 0.6, 1)"); await h.wait(900); await h.shot('walk-up-to-the-car');
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect("__G.G.craft === 'boxcar' && __G.crafts.seat === 0 && __G.carC.sim.engineOn && !__G.foot.exists");
  await h.wait(800); await h.shot('driver-seat');
  // drive: full throttle across the pad, then a right turn, then off the gas (the pad is on a hilltop)
  await h.eval('(window.__p0 = [__V.S().x, __V.S().z, __V.S().yaw], 1)');
  await h.key('down', 'KeyW'); await h.waitFor('Math.abs(__V.S().v) > 8 || Math.hypot(__V.S().x - __p0[0], __V.S().z - __p0[1]) > 30', 150000);
  await h.eval('__V.st()');
  await h.key('down', 'KeyD'); await h.waitFor('Math.abs(__V.S().yaw - __p0[2]) > 0.8', 100000); await h.key('up', 'KeyD'); await h.key('up', 'KeyW');
  await h.eval('__V.st()');
  await h.expect('__V.S().onGround && !__V.S().dead && __V.S().hp > 90 && Math.hypot(__V.S().x - __p0[0], __V.S().z - __p0[1]) > 15 && __V.S().yawRate !== 0');
  await h.shot('driving-driver-view');
  await h.key('tap', 'KeyV'); await h.key('down', 'KeyS'); await h.wait(300); await h.shot('driving-chase-view');
  // stop (S brakes), change seat, get out
  await h.key('down', 'KeyS'); await h.waitFor('Math.abs(__V.S().v) < 0.3', 100000); await h.key('up', 'KeyS');
  await h.eval('__V.st()');
  await h.key('tap', 'BracketRight'); await h.wait(300);
  await h.expect('__G.crafts.seat === 1');
  await h.key('tap', 'KeyV'); await h.wait(700); await h.shot('passenger-seat');
  await h.key('tap', 'KeyY'); await h.wait(500); await h.eval("({ msg: document.getElementById('msg').textContent, st: __V.st() })");
  await h.expect("__G.G.craft === 'foot' && __G.foot.exists && Math.hypot(__G.foot.W.x - __V.S().x, __G.foot.W.z - __V.S().z) < 3.5");
  await h.eval("(__G.foot.view = 'third', __G.foot.W.yaw += 2.4, 1)"); await h.wait(900); await h.shot('got-out');
  // the motor pool: the car onto the ALBATROSS's deck; drive it along the deck while she sails
  await h.eval('(__G.selIsl = null, __G.G.mat = 200, (() => { const c = __G.war.carrier; const s = __G.GR.deckSpot(0); __G.carC.spawnAt(s); return s.name; })())');
  await h.expect('__V.S().plat === __G.war.carrier');
  await h.eval(`(() => { const c = __G.war.carrier; __G.war.orderCarrier(c.p.x - Math.sin(c.yaw + 0.5) * 600, c.p.z - Math.cos(c.yaw + 0.5) * 600); return 1; })()`);
  await h.eval('__V.toDoor()'); await h.wait(300); await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === 'boxcar'");
  await h.eval('(window.__d0 = __V.loc(), 1)');
  await h.key('down', 'KeyW'); await h.waitFor('__d0.z - __V.loc().z > 12', 100000); await h.key('up', 'KeyW');
  // (ngc/bugsweep) stop on the handbrake (Space) and keep it on while parked: S brakes only down to 0.4 m/s and then
  // reverses - at 1-5 fps the poll missed |v| < 0.2 and the car backed off the stern into the sea
  await h.key('down', 'Space'); await h.waitFor('Math.abs(__V.S().v) < 0.05', 100000);
  await h.eval('({ from: __d0, to: __V.loc(), st: __V.st() })');
  await h.expect('__V.S().plat === __G.war.carrier && Math.abs(__V.loc().x - __d0.x) < 1.5');
  await h.wait(1500); await h.shot('on-deck-under-way-chase');
  await h.eval('(window.__d1 = __V.loc(), 1)'); await h.wait(4000);
  await h.eval('({ parked: __d1, now: __V.loc(), ship: [__G.war.carrier.p.x, __G.war.carrier.p.z, __G.war.carrier.yaw] })');
  await h.expect('Math.hypot(__V.loc().x - __d1.x, __V.loc().z - __d1.z) < 0.2');
  await h.key('up', 'Space');
  // into the sea off a beach: the engine drowns
  await h.key('tap', 'KeyY'); await h.wait(400); await h.expect("__G.G.craft === 'foot'");
  await h.eval(`(() => { const T = __G.terrainH; for (const I of __G.ISLANDS) for (let a = 0; a < 6.283; a += 0.04) { const cx = Math.cos(a), sz = Math.sin(a); for (let r = 30; r < 160; r += 2) { const x = I.x + cx * r, z = I.z + sz * r, t = T(x, z); if (t < 0.5 && t > 0.1 && Math.abs(T(x - sz * 2, z + cx * 2) - T(x + sz * 2, z - cx * 2)) < 0.2 && T(x - cx * 3, z - sz * 3) - T(x + cx * 3, z + sz * 3) < 0.6 && T(x - cx * 3, z - sz * 3) > T(x + cx * 3, z + sz * 3) && T(x + cx * 8, z + sz * 8) > -0.8 && T(x + cx * 30, z + sz * 30) < -1.5 && !__G.ISLANDS.some(J => J.structs && J.structs.some(s => Math.hypot(s.x - x, s.z - z) < 12))) { __G.carC.spawnAt({ x, z, yaw: Math.atan2(-cx, -sz) }); return [+x.toFixed(1), +z.toFixed(1), +a.toFixed(2), +t.toFixed(2)]; } } } return null; })()`);
  await h.eval('__V.st()'); await h.eval('__V.toDoor()'); await h.wait(300); await h.eval("document.getElementById('hint').textContent"); await h.key('tap', 'KeyY'); await h.wait(400);
  await h.expect("__G.G.craft === 'boxcar'");
  await h.eval('(__G.carC.sim.engineOn = true, 1)');
  await h.key('down', 'KeyW'); await h.waitFor('__V.S().flooded || __V.S().water > 1.5', 150000); await h.key('up', 'KeyW');
  await h.eval('__V.st()'); await h.wait(600); await h.shot('drowned-in-the-surf');
  await h.expect('__V.S().flooded && !__V.S().engineOn');
}
