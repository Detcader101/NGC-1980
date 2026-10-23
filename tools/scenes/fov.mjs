// Cockpit FOV slider (pause menu): arrows move it, the cockpit camera follows live, the chase camera doesn't, it's
// remembered across reloads, and the Hornet cockpit (and its zoom) use it too.
export default async function (h) {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 15000); await h.wait(500);
  await h.eval('(__G.setCkFov(70), __G.cockpitCam = true, 1)'); await h.wait(600);
  await h.expect('Math.abs(__G.zCam.fov - 70) < 0.5');
  await h.shot('huey-70');
  await h.key('tap', 'Escape'); await h.wait(300);
  await h.expect("__G.G.state === 'paused' && __G.menu.items.some(i => i.id === 'fov')");
  await h.eval("(__G.menu.sel = __G.menu.items.findIndex(i => i.id === 'fov'), 1)");
  for (let i = 0; i < 4; i++) { await h.key('tap', 'ArrowRight'); await h.wait(80); }
  await h.wait(400);
  await h.eval("({ fov: __G.ckFov, cam: __G.zCam.fov, stored: localStorage.getItem('tz_ckfov'), label: document.getElementById('fovVal').textContent })");
  await h.expect("__G.ckFov === 90 && Math.abs(__G.zCam.fov - 90) < 0.5 && localStorage.getItem('tz_ckfov') === '90'");
  await h.shot('menu-90');
  await h.key('tap', 'Escape'); await h.wait(400);
  await h.shot('huey-90');
  await h.eval('(__G.cockpitCam = false, 1)'); await h.wait(400);
  await h.expect('Math.abs(__G.zCam.fov - 62) < 0.5');   // chase view unchanged
  // the Hornet cockpit
  await h.key('tap', 'Digit5'); await h.wait(500);
  await h.eval('(__G.setCkFov(55), __G.cockpitCam = true, 1)'); await h.wait(500);
  await h.expect('__G.G.craft === "jet" && Math.abs(__G.zCam.fov - 55) < 0.5');
  await h.eval('(__G.JP.zoom = 1, 1)'); await h.wait(300);
  await h.expect('Math.abs(__G.zCam.fov - 22) < 0.5');
  await h.eval('(__G.JP.zoom = 0, __G.setCkFov(70), 1)');
}
