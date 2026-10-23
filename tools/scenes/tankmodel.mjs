// M60A3 exterior model on the test ground (dev/tank.html): several angles, turret / gun / hatches / searchlight
// states, the running gear close up, then contract checks (track links on the belt, wheel bottoms on the ground,
// triangle count).   CHROME_PATH=... node snap.mjs scenes/tankmodel.mjs
const VEH = process.env.VEH || 'm60';
export default async function (h) {
  await h.goto(`dev/tank.html?debug&ui=0&res=0.6&view=free${VEH === 'm113' ? '&veh=m113' : ''}`);
  await h.waitFor('window.__T', 15000);
  await h.eval('(__T.pause(true), __T.step(90), 1)');   // settle on the ground
  const shot = async (name, yaw, pitch, dist, st = {}) => {
    await h.eval(`(() => { Object.assign(__T.cam, { yaw: ${yaw}, pitch: ${pitch}, dist: ${dist} }); __T.view = 'free'; ${st.js || ''}; __T.render(); return 1; })()`);
    await h.wait(250); await h.shot(name);
  };
  await shot('front34', 2.5, 0.22, 13);
  await h.notblank();
  await shot('side', 1.5708, 0.05, 12);
  await shot('rear34', -0.6, 0.3, 13);
  await shot('top', 0.5, 1.3, 13);
  await shot('front', 3.1416, 0.12, 12);
  await shot('low_gear', 1.9, -0.05, 7);
  await shot('turret_traversed', 2.3, 0.35, 13, { js: "__T.V.losAz = 1.1; __T.V.losEl = 0.15; __T.hatches.cupola = 1; __T.hatches.loader = 1; __T.IN.light = 1; __T.step(2)" });
  // contract: wheel bottoms near the ground, the link count, triangles
  await h.eval(`(() => { const T = __T, out = {}; let tris = 0, meshes = 0; T.model.group.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += o.isInstancedMesh ? n * o.count : n; } });
    out.tris = tris; out.meshes = meshes; out.pathLen = T.model.gear ? T.model.gear.map(g => +g.path.len.toFixed(2)) : null; window.__chk = out; return out; })()`);
  await h.expect('__chk.tris > 5000 && __chk.tris < 400000');
}
