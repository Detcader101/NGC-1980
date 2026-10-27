// RenderKit surface materials A/B (ngc/rk-surface): the same views with ?rk=0 (legacy Lambert/Phong) and with the
// RenderKit surface area on. RK=0 or RK=surface picks the side; PART picks the groups (default all).
//   RK=0 node snap.mjs scenes/rksurface.mjs --name rks-off ; RK=surface node snap.mjs scenes/rksurface.mjs --name rks-on
// The huey part also counts RenderKit materials in the main-game scene: none with ?rk=0, many with it on.
const RK = process.env.RK ?? 'surface', PART = (process.env.PART || 'all').split(',');
const want = p => PART.includes('all') || PART.includes(p);
const PI = Math.PI;
// orbit camera around the player's ship group (the Huey), as in hueymodel.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, ship = G.cockpit.group.parent, cam = new T.PerspectiveCamera(35, 1, 0.1, 3000);
  const t = new T.Vector3(), p = new T.Vector3(), orig = r.render.bind(r); window.__ship = ship;
  r.render = (s, c) => {
    if (c !== G.zCam) return orig(s, c);
    const v = window.__view; if (!v) return orig(s, c);
    const [yaw, pitch, dist, tx = 0, ty = 0, tz = 0] = v; ship.updateMatrixWorld();
    t.set(tx, ty, tz); ship.localToWorld(t);
    p.set(tx + dist * Math.sin(yaw) * Math.cos(pitch), ty + dist * Math.sin(pitch), tz + dist * Math.cos(yaw) * Math.cos(pitch)); ship.localToWorld(p);
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.near = 0.1; cam.far = 3000; cam.fov = 35; cam.updateProjectionMatrix();
    return orig(s, cam);
  };
  document.getElementById('hud').style.visibility = 'hidden'; return true; })()`;
const COUNT = `(() => { const n = {}; const seen = new Set(); (() => { let s = __G.cockpit.group; while (s.parent) s = s.parent; return s; })().traverse(o => { if (!o.material) return; for (const m of [].concat(o.material)) { if (seen.has(m)) continue; seen.add(m);
  const k = (m.name || '').startsWith('RK/') ? m.name : m.type; n[k] = (n[k] || 0) + 1; } }); return n; })()`;

export default async function (h) {
  if (want('huey')) {
    await h.goto(`?debug&kb&peace&res=0.6&rk=${RK}`);
    await h.waitFor('window.__G', 15000); await h.wait(600);
    await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 15000); await h.wait(1500);
    await h.eval(COUNT, 'materials');
    if (RK === '0') await h.expect(`!Object.keys(${COUNT}).some(k => k.startsWith('RK/'))`, 'rk=0: no RenderKit material in the scene');
    else await h.expect(`Object.keys(${COUNT}).some(k => k.startsWith('RK/'))`, 'rk on: RenderKit materials in the scene');
    await h.eval(HOOK); await h.eval(`(__G.G.state = 'paused', true)`);
    for (const [name, v] of [['huey_front34', [PI + 0.6, 0.12, 19, 0, 0.6, 1.5]], ['huey_side', [-PI / 2, 0.05, 15, 0, 0.6, 2.6]],
      ['huey_close', [PI + 0.9, 0.1, 6.5, 0, -0.2, -2.2]], ['huey_tail', [-PI / 2 + 0.35, 0.12, 6.5, 0, 1.4, 8.4]],
      ['deck_island', [PI + 0.3, 0.12, 60, 20, 6, -30]], ['deck_wide', [PI + 0.4, 0.35, 70, 0, 0, -20]]]) {
      await h.eval(`(window.__view = ${JSON.stringify(v)}, true)`); await h.wait(700); await h.shot(name);
    }
    await h.eval(`(window.__view = null, __G.G.state = 'play', true)`);
    await h.key('tap', 'c'); await h.wait(900); await h.shot('huey_cockpit');
  }
  if (want('hueyck')) {   // the player's real cockpit view: panel, then looking back into the cabin / door gunner
    await h.goto(`?debug&kb&peace&cockpit&res=0.6&rk=${RK}`); await h.waitFor('window.__G', 15000); await h.wait(600);
    await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 15000); await h.wait(2500);
    await h.shot('huey_cockpit_panel');
    await h.eval(`(window.__hyI = setInterval(() => { __G.head.yaw = 1.9; __G.head.pitch = -0.15; }, 5), true)`); await h.wait(1500); await h.shot('huey_cockpit_cabin');
    await h.eval(`(__G.head.yaw = -1.3, clearInterval(__hyI), window.__hyI = setInterval(() => { __G.head.yaw = -1.3; __G.head.pitch = 0.05; }, 5), true)`); await h.wait(1500); await h.shot('huey_cockpit_left');
    await h.eval(`(clearInterval(__hyI), true)`);
  }
  if (want('jet')) {
    await h.goto(`dev/jet-preview.html?ui=0&rk=${RK}`); await h.waitFor('window.__J', 15000); await h.wait(1500); await h.shot('hornet');
    await h.eval(`(Object.assign(__J.cam, { yaw: 2.3, pitch: 0.18, dist: 8 }), __J.cam.t.set(0, 0.3, -4), true)`); await h.wait(800); await h.shot('hornet_nose');
  }
  if (want('air')) for (const m of ['tomcat', 'shrike', 'reaper']) {
    await h.goto(`dev/air.html?model=${m}&ui=0&rk=${RK}`); await h.waitFor('window.__A', 15000);
    await h.eval(`(Object.assign(__A.cam, { yaw: 2.4, pitch: 0.3, dist: ${m === 'tomcat' ? 24 : 18} }), true)`); await h.wait(800); await h.shot('air_' + m);
    if (m === 'tomcat') { await h.eval(`(Object.assign(__A.cam, { yaw: 2.3, pitch: 0.45, dist: 8 }), __A.cam.t.set(0, 0.8, -5), __A.S.canopy = 1, true)`); await h.wait(800); await h.shot('air_tomcat_cockpit'); }
  }
  if (want('ships')) for (const [ship, cam] of [['albatross', '2.3,0.12,70,0,12,0'], ['kraken', '2.3,0.12,80,0,12,0'], ['leviathan', '2.4,0.15,60,0,6,0'], ['container', '2.4,0.15,60,0,6,0']]) {
    await h.goto(`dev/ships.html?ui=0&freeze=1&ship=${ship}&rk=${RK}`); await h.wait(4000); await h.shot('ship_' + ship);
    await h.goto(`dev/ships.html?ui=0&freeze=1&ship=${ship}&cam=${cam}&rk=${RK}`); await h.wait(4000); await h.shot('ship_' + ship + '_close');
  }
  if (want('tank')) for (const v of ['m60', 'm113']) {
    const q = `dev/tank.html?debug&ui=0&res=1${v === 'm113' ? '&veh=m113' : ''}&rk=${RK}`;
    await h.goto(q + '&view=free'); await h.wait(4000); await h.shot('tank_' + v);
    await h.goto(q + '&view=chase&cam=2.5,0.22,9'); await h.wait(4000); await h.shot('tank_' + v + '_close');
    await h.goto(q + `&view=${v === 'm113' ? 'troops' : 'driver'}`); await h.wait(4000); await h.shot('tank_' + v + '_inside');
  }
  if (want('wheeled')) for (const v of ['m151', 'm35', 'landrover', 'beetle']) {
    await h.goto(`dev/vehicle.html?debug&ui=0&hud=0&v=${v}&zone=start&cam=orbit&paused&rk=${RK}`); await h.waitFor('window.__V', 15000); await h.wait(2500);
    await h.eval(`__V.cam('orbit', { dist: ${v === 'm35' ? 10 : 6.5} })`); await h.wait(1200); await h.shot('wheeled_' + v);
    if (v === 'm151' || v === 'beetle') { await h.eval(`__V.cam('cockpit')`); await h.wait(1200); await h.shot('wheeled_' + v + '_cockpit'); }
  }
  if (want('rw')) for (const [u, cam] of [['strider', '3.74,0.15,4.4,0,1.1,0'], ['all', '3.6,0.18,34,4,1.2,0'], ['hover', '3.7,0.25,12,0,1,0'], ['m1', '3.7,0.2,12,0,1.2,0']]) {
    await h.goto(`dev/rwmodels.html?unit=${u}&walk=0&rk=${RK}`); await h.waitFor('window.__RW && __RW.units.length', 15000); await h.wait(700);
    await h.eval(`(() => { const [y, p, d, x, yy, z] = '${cam}'.split(',').map(Number); Object.assign(__RW.cam, { yaw: y, pitch: p, dist: d }); __RW.cam.t.set(x, yy, z); return true; })()`);
    await h.wait(400); await h.shot('rw_' + u);
  }
  if (want('defence')) {
    await h.goto(`dev/defence.html?mode=lineup&ui=0&cam=0.45,0.2,48,0,1.5,0&rk=${RK}`); await h.wait(4000); await h.shot('defence_lineup');
    await h.goto(`dev/defence.html?mode=view&unit=vads&ui=0&drones=0&rk=${RK}`); await h.wait(4000); await h.shot('defence_vads');
  }
  if (want('rotary')) for (const u of ['ch46', 'mv22', 'wasp']) {
    await h.goto(`dev/rotary.html?ac=${u}&view=model&paused&ui=0&rk=${RK}`); await h.waitFor('window.__R', 15000); await h.wait(500);
    await h.eval(`(Object.assign(__R.cam, { yaw: ${PI + 0.7}, pitch: 0.2, dist: ${u === 'wasp' ? 7 : 26} }), __R.tm.update(0.05, 1), __R.render(), true)`); await h.wait(300); await h.shot('rotary_' + u);
  }
  if (want('c130')) {
    await h.goto(`dev/c130-model.html?ui=0&rk=${RK}`); await h.wait(5000); await h.shot('c130');
  }
  if (want('struct')) for (const [k, s] of [['hq', 1], ['radar', 1], ['factory', 2]]) {
    await h.goto(`dev/structure-unit.html?kind=${k}&side=${s}&rk=${RK}`); await h.wait(4000); await h.shot(`struct_${k}_${s}`);
  }
}
