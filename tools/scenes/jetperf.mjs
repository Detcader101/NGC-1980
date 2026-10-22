// frame cost breakdown (sim / scene+HUD prep / render submit) for the helicopter, the jet cockpit and the jet chase view
export default async function (h) {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 15000);
  const sample = async (label) => { await h.wait(2500); const r = await h.eval(`({fps: document.getElementById('dbg').textContent, sim: __G.PROF.sim.toFixed(1), prep: __G.PROF.prep.toFixed(1), render: __G.PROF.render.toFixed(1), draw: Math.round(__G.view.draw), calls: __G.renderer.info.render.calls, tris: __G.renderer.info.render.triangles})`); h.log(label + ' ' + JSON.stringify(r)); };
  await sample('HELI');
  await h.key('tap', 'Digit5'); await h.wait(300);
  await h.eval('__G.cockpitCam = true'); await sample('JET COCKPIT ON CAT');
  await h.eval('(__G.cockpitCam = false, __G.JP.snapChase(), 1)'); await sample('JET CHASE ON CAT');
  await h.eval('(__G.JP.J.cat = null, __G.JP.J.reset(__G.JP.J.pos.x, 0, __G.JP.J.pos.z - 200, 0, {running: true, airborne: true, alt: 300, speed: 80}), __G.JP.J.gearCmd = 0, __G.JP.J.gear = 0, 1)');
  await sample('JET CHASE 300m');
  await h.eval('__G.cockpitCam = true'); await sample('JET COCKPIT 300m');
}
