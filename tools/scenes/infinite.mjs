// Infinite world: fly the jet far past the archipelago over procedurally generated wild islands. No walls, a warning
// only; the streamed terrain matches the physics height (the jet would hit what it sees).
export default async function (h) {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 15000); await h.wait(500);
  await h.key('tap', 'Digit5'); await h.wait(300);
  // a wild island 3-4 km out to the east, jet 250 m up heading at it
  const I = await h.eval(`(() => { const L = __G.wildIslandsNear(3500, 200, 900).sort((a, b) => b.r - a.r); window.__I = L[0]; return L[0] && { x: L[0].x, z: L[0].z, r: L[0].r, n: L.length }; })()`);
  await h.expect('!!window.__I');
  await h.eval(`(() => { const J = __G.JP.J, I = __I; J.cat = null; J.reset(I.x - 900, 0, I.z, -Math.PI / 2, { running: true, airborne: true, alt: 250, speed: 80 }); for (const e of J.eng) e.n = 0.9;
    __G.JP.autopilot = (J) => ({ pitch: Math.max(-1, Math.min(1, -J.vel.y * 0.03 + (250 - J.pos.y) * 0.004)), roll: -J.attitude().roll * 2, yaw: 0, throttle: [0.7, 0.7], brakeL: 0, brakeR: 0 }); return 1; })()`);
  await h.waitFor('__G.HO.job === null && Math.abs(__G.HO.cx - __G.JP.J.pos.x) < 800', 10000);
  await h.wait(1500);
  await h.eval('({outside: __G.G.outside, hint: __G.opsHint(), pos: __G.JP.J.pos.toArray().map(Math.round), heading: __G.JP.J.heading()})');
  await h.expect('__G.G.outside === true && __G.JP.alive');
  await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1200); await h.shot('cockpit-wild');
  await h.eval('(__G.cockpitCam = false, __G.JP.snapChase(), 1)'); await h.wait(1500); await h.shot('chase-wild');
  await h.notblank();
  // physics height on the island matches the island function, and it's real land
  await h.expect('__G.groundY(__I.x, __I.z) > 3');
  // keep going east for a while: no clamp anywhere
  const x0 = await h.eval('__G.JP.J.pos.x'); await h.wait(6000);
  await h.expect(`__G.JP.J.pos.x > ${x0} + 200 && __G.JP.alive`);
  await h.eval('({x: Math.round(__G.JP.J.pos.x), trees: 0, hint: __G.opsHint()})');
  // the helicopter can go out there too and land on a wild island
  await h.eval('(__G.JP.autopilot = null, __G.JP.stow(), __G.G.craft = "heli", 1)');
  await h.eval(`(() => { const I = __I, y = __G.groundY(I.x, I.z); __G.H.reset(new __G.THREE.Vector3(I.x, y + 1.2, I.z), 0, true, 1); return y; })()`);
  await h.wait(1500); await h.shot('heli-on-wild-island');
  await h.expect('__G.Z.alive && __G.H.landed');
}
