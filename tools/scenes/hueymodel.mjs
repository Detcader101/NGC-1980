// UH-1H exterior model check, in the game: on the carrier deck with the rotor turning, from several angles and states
// (droop at rest, tilted tip-path plane, door gun firing, rockets spent, tail rotor shot away), hovering, the cockpit view
// (exterior shell hidden) and the cave. A render hook swaps in an orbit camera around the helicopter:
// window.__view = [yaw, pitch, dist, tx, ty, tz] in heli-local axes (yaw 0 = behind, PI = in front, -PI/2 = left side).
// node snap.mjs scenes/hueymodel.mjs
const HOOK = `(() => { const G = __G, T = G.THREE, r = G.renderer, ship = G.cockpit.group.parent, cam = new T.PerspectiveCamera(35, 1, 0.1, 3000);
  const t = new T.Vector3(), p = new T.Vector3(), q = new T.Quaternion(), Y = new T.Vector3(0, 1, 0), orig = r.render.bind(r);
  window.__ship = ship;
  r.render = (s, c) => {
    if (c !== G.zCam) return orig(s, c);
    if (window.__ckYaw) { c.quaternion.multiply(q.setFromAxisAngle(Y, window.__ckYaw)); c.updateMatrixWorld(); }
    if (window.__zoom) { cam.fov = c.fov / window.__zoom; cam.aspect = c.aspect; cam.position.copy(c.position); cam.near = 0.5; cam.updateProjectionMatrix(); ship.getWorldPosition(t); cam.up.set(0, 1, 0); cam.lookAt(t); return orig(s, cam); }
    const v = window.__view; if (!v) return orig(s, c);
    const [yaw, pitch, dist, tx = 0, ty = 0, tz = 0] = v; ship.updateMatrixWorld();
    t.set(tx, ty, tz); ship.localToWorld(t);
    p.set(tx + dist * Math.sin(yaw) * Math.cos(pitch), ty + dist * Math.sin(pitch), tz + dist * Math.cos(yaw) * Math.cos(pitch)); ship.localToWorld(p);
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.near = 0.1; cam.fov = 35; cam.updateProjectionMatrix();
    return orig(s, cam);
  };
  document.getElementById('hud').style.visibility = 'hidden'; return true; })()`;
const PI = Math.PI;
const DECK = [
  ['front34', [PI + 0.6, 0.12, 19, 0, 0.6, 1.5]],
  ['side_left', [-PI / 2, 0.03, 20, 0, 0.6, 2.6]],
  ['rear34', [0.75, 0.2, 20, 0, 0.8, 2.5]],
  ['front', [PI, 0.06, 13, 0, 0.2, 0]],
  ['top', [0.0001, 1.45, 24, 0, 0, 2]],
  ['nose_close', [PI + 0.9, 0.1, 6.5, 0, -0.2, -2.2]],
  ['rotor_head', [PI + 0.8, 0.28, 4.2, 0, 2.0, -0.12]],
  ['tail_close', [-PI / 2 + 0.35, 0.12, 6.5, 0, 1.4, 8.4]],
];
const set = st => `(() => { const G = __G; Object.assign(G.H, ${JSON.stringify(st.H || {})}); ${st.js || ''}; return true; })()`;
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.6');
  await h.waitFor('window.__G', 10000); await h.wait(600);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000);
  await h.waitFor('__G.H.rpm > 0.97', 25000);
  await h.eval('({ rpm: __G.H.rpm, landed: __G.H.landed })');
  await h.eval(HOOK);
  // model contract: skids on the ground line, overall size, triangle count, door gun / pod / hub positions
  await h.eval(`(() => { const G = __G, T = G.THREE, ship = __ship, inv = new T.Matrix4().copy(ship.matrixWorld).invert(), v = new T.Vector3(), m = new T.Matrix4();
    const ck = new Set(); G.cockpit.group.traverse(o => ck.add(o));
    const bb = new T.Box3(), skid = { min: 9 }, out = { tris: 0, meshes: 0 };
    ship.traverse(o => { if (!o.isMesh || ck.has(o) || o.name.startsWith('disc') || o.name === 'landingBeam' || o.name === 'trDisc') return; out.meshes++;
      const g = o.geometry, pa = g.attributes.position; out.tris += (g.index ? g.index.count : pa.count) / 3; m.multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(m); bb.expandByPoint(v); } });
    const fb = new T.Box3(); ship.traverse(o => { if (!o.isMesh || ck.has(o) || /^(blade|disc|landingBeam|trDisc)/.test(o.name)) return; const pa = o.geometry.attributes.position; m.multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(m); fb.expandByPoint(v); } });
    out.fuselage = +(fb.max.z - fb.min.z).toFixed(2); out.overall = +(fb.max.z - Math.min(fb.min.z, -0.12 - 7.32)).toFixed(2); out.height = +(fb.max.y - fb.min.y).toFixed(2);
    out.size = bb.getSize(v).toArray().map(x => +x.toFixed(2)); out.min = bb.min.toArray().map(x => +x.toFixed(2)); out.max = bb.max.toArray().map(x => +x.toFixed(2));
    window.__chk = out; return out; })()`);
  await h.expect('Math.abs(__chk.min[1] + 1.84) < 0.03', 'skids on the ground line');
  await h.expect('__chk.overall > 16.8 && __chk.overall < 18.0', 'length with the rotors fore-and-aft ~17.4 m');
  await h.expect('__chk.fuselage > 12.4 && __chk.fuselage < 13.8', 'fuselage + tail rotor ~13 m');
  await h.expect('__chk.tris < 160000', 'triangle budget (all LODs together; per-LOD budgets in hueyhifi stats)');
  // deck views, frozen (pause) so the states hold
  await h.eval(`(__G.G.state = 'paused', true)`);
  for (const [name, v] of DECK) { await h.eval(`(window.__view = ${JSON.stringify(v)}, true)`); await h.wait(500); await h.shot(name); }
  // states
  await h.eval(set({ H: { rpm: 0, run: false, n1: 0 } })); await h.eval(`(window.__view = ${JSON.stringify([-PI / 2 + 0.25, 0.1, 21, 0, 0.8, 1.5])}, true)`); await h.wait(500); await h.shot('rest_droop');
  await h.eval(set({ H: { rpm: 1, run: true, n1: 0.95, tx: 0.12, ty: 0.06 } })); await h.wait(500); await h.shot('disc_tilted');
  await h.eval(`(window.__view = ${JSON.stringify([-PI / 2, 0.02, 22, 0, 1.5, 0])}, true)`); await h.wait(500); await h.shot('disc_tilted_side');
  await h.eval(set({ H: { tx: 0, ty: 0.12 } })); await h.eval(`(window.__view = ${JSON.stringify([0.0001, 0.05, 22, 0, 1.5, 0])}, true)`); await h.wait(500); await h.shot('disc_tilted_right_rear');
  await h.eval(set({ H: { tx: 0, ty: 0 }, js: `G.G.rockets = 5; G.G.light = true; G.Z.fireCd = 1; G.Z.aim.set(-0.8, -0.35, -0.5).normalize().applyQuaternion(G.H.q); G.D.hp.tail = 0` }));
  await h.eval(`(window.__view = ${JSON.stringify([PI + 1.0, 0.15, 9, -1.2, -0.3, -0.5])}, true)`); await h.wait(500); await h.shot('gun_rockets_light');
  await h.eval(`(window.__view = ${JSON.stringify([-PI / 2 + 0.3, 0.12, 6.5, 0, 1.4, 8.4])}, true)`); await h.wait(500); await h.shot('tail_shot_away');
  await h.eval(`(() => { const G = __G; G.D.hp.tail = 1; G.G.rockets = 16; G.G.light = false; G.Z.fireCd = 0; G.G.state = 'play'; return true; })()`);
  // fly: lift into a hover, then a little forward flight
  await h.eval(`(window.__view = ${JSON.stringify([PI + 0.5, 0.05, 22, 0, 0.8, 1])}, true)`);
  await h.key('hold', 'Space', 1300); await h.wait(1200); await h.key('hold', 'ControlLeft', 250); await h.wait(1500);
  await h.eval('({ agl: __G.H.agl, tx: __G.H.tx, ty: __G.H.ty, alive: __G.Z.alive })');
  await h.shot('hover');
  await h.key('down', 'KeyW'); await h.wait(700); await h.key('up', 'KeyW'); await h.wait(1200);
  await h.eval(`(window.__view = ${JSON.stringify([-PI / 2, 0.05, 22, 0, 0.8, 1])}, true)`); await h.wait(300);
  await h.eval('({ agl: __G.H.agl, tx: __G.H.tx, ty: __G.H.ty, alive: __G.Z.alive })');
  await h.shot('forward_flight');
  // cockpit: exterior shell hidden, the rest (rotor, gunner, pods) still there
  await h.eval(`(window.__view = null, __G.cockpitCam = true, true)`); await h.wait(800);
  await h.shot('cockpit');
  await h.expect(`__G.cockpit.group.visible && __ship.getObjectByName('shell').visible === false && __ship.getObjectByName('mast').visible`, 'shell hidden in the cockpit');
  await h.eval(`(window.__ckYaw = 1.6, true)`); await h.wait(500); await h.shot('cockpit_left');
  await h.eval(`(window.__ckYaw = 0, __G.cockpitCam = false, true)`);
  // cave (side view at 0.36 scale)
  await h.goto('?debug&thrust'); await h.waitFor('window.__G && __G.G.mode === "thrust"', 10000); await h.wait(2500);
  await h.shot('cave');
  await h.eval(HOOK); await h.eval(`(window.__zoom = 4, true)`); await h.wait(500); await h.shot('cave_zoom');
}
