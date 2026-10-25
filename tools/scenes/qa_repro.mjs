// scratch: first-person "person in front of me" repro
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.6');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 40000);
  await h.eval(`(() => { const r = __G.renderer, orig = r.render.bind(r); r.render = (sc, cam) => { if (sc.children.length > 20) { window.__rc = cam; window.__sc = sc; } orig(sc, cam); };
    window.__front = (D = 0.6) => { const T = __G.THREE, cam = window.__rc, rc = new T.Raycaster(); rc.near = 0.0; rc.far = D; const out = {}; cam.updateMatrixWorld();
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const v = new T.Vector3(i * 0.12, j * 0.12, -1).normalize().applyQuaternion(cam.getWorldQuaternion(new T.Quaternion())); rc.set(cam.getWorldPosition(new T.Vector3()), v);
        for (const x of rc.intersectObjects(window.__sc.children, true)) { let o = x.object, nm = []; while (o && nm.length < 4) { nm.push(o.name || o.type); o = o.parent; } const k = nm.join('<'); out[k] = Math.min(out[k] ?? 9, +x.distance.toFixed(2)); } }
      return out; };
    return 1; })()`);
  await h.shot('heli-cockpit');
  await h.eval('__front()');
  await h.key('tap', 'KeyY'); await h.wait(1500);
  await h.eval("({ craft: __G.G.craft, view: __G.marine.view })");
  await h.shot('foot-spawn-first');
  await h.eval('__front()');
  for (const [i, yaw] of [[1, 1.57], [2, 3.14], [3, -1.57]]) { await h.eval(`(__G.marine.aim(__G.war.carrier.yaw + ${yaw}, 0), 1)`); await h.wait(700); await h.shot('foot-spawn-look' + i); await h.eval('__front()'); }
  await h.eval("(__G.marine.view = 'third', 1)"); await h.wait(800); await h.shot('foot-spawn-third');
}
