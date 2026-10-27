// The lived-in world from the HORNET: towns, roads and farms at the jet's long view distance (far detail), chase and
// cockpit, then low and fast over a town.
export default async function (h) {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && window.__WORLD", 15000); await h.wait(500);
  await h.key('tap', 'Digit5'); await h.wait(300);
  await h.eval(`(() => { const ss = __WORLD.net.settlementsNear(3600, 1200, 5000).filter(s => s.size === 'town'); window.__T = ss[0]; return { x: Math.round(__T.x), z: Math.round(__T.z) }; })()`);
  const fly = async (dx, dz, alt, speed) => h.eval(`(() => { const J = __G.JP.J, T = __T; J.cat = null; const x = T.x + ${dx}, z = T.z + ${dz}, yaw = Math.atan2(-(T.x - x), -(T.z - z)); J.reset(x, 0, z, yaw, { running: true, airborne: true, alt: Math.max(0, __G.groundY(x, z)) + ${alt}, speed: ${speed} }); for (const e of J.eng) e.n = 0.9;
    window.__alt = Math.max(0, __G.groundY(x, z)) + ${alt}; __G.JP.autopilot = (J) => ({ pitch: Math.max(-1, Math.min(1, -J.vel.y * 0.03 + (__alt - J.pos.y) * 0.004)), roll: -J.attitude().roll * 2, yaw: 0, throttle: [0.7, 0.7], brakeL: 0, brakeR: 0 }); return 1; })()`);
  await fly(-2200, -900, 420, 110);
  await h.waitFor('__WORLD.stats.pending === 0 && __WORLD.stats.chunks > 20', 40000); await h.wait(2000);
  await h.eval('(__G.cockpitCam = false, __G.JP.snapChase(), 1)'); await h.wait(1500);
  await h.eval('({ draw: Math.round(__G.view.draw), ...__WORLD.stats, calls: __G.renderer.info.render.calls, tris: __G.renderer.info.render.triangles })');
  await h.shot('jet-high-chase'); await h.notblank();
  await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1200); await h.shot('jet-high-cockpit');
  await fly(-900, -300, 90, 95);
  await h.waitFor('__WORLD.stats.pending === 0', 30000); await h.wait(800);
  await h.eval('(__G.cockpitCam = false, __G.JP.snapChase(), 1)'); await h.wait(1200); await h.shot('jet-low-chase');
  await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1000); await h.shot('jet-low-cockpit');
  await h.expect('__G.JP.alive');
}
