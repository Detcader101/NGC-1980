// NAVAL in the game: each ship at sea (ALBATROSS under way with its wake and smoke, the KRAKEN, the LEVIATHAN
// railgun monitor, the autonomous container ship), seen from a scripted camera; deckY follows the ship's motion;
// the deck crew clear out from under a helicopter.   node snap.mjs scenes/naval.mjs
export const query = '?debug&kb&peace&res=0.6&nofog';
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.6&nofog&sea=4');
  await h.waitFor('window.__G', 15000);
  await h.key('tap', 'Enter'); await h.wait(1200);
  await h.waitFor("__G.G.state === 'play'", 10000);
  // a scripted camera: window.__cam = { u, p: [lx, ly, lz], t: [lx, ly, lz] } in a ship's frame (heading only)
  await h.eval(`(() => {
    const r = __G.renderer, orig = r.render.bind(r), T = __G.THREE, a = new T.Vector3(), b = new T.Vector3();
    const W = (u, l, out) => { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return out.set(u.p.x + l[0] * c + l[2] * s, u.p.y + l[1], u.p.z - l[0] * s + l[2] * c); };
    r.render = (sc, cam) => { const C = window.__cam; if (C && C.u) { W(C.u, C.p, a); W(C.u, C.t, b); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    window.__shot = (u, p, t) => { window.__cam = { u, p, t }; W(u, p, a); __G.H.reset(a.clone().add(new T.Vector3(0, 40, 0)), 0, false, 1); __G.HI.setCollective(0.475); };
    return true; })()`);
  // a Hornet on the catapult: the jet blast deflector comes up behind it
  await h.waitFor('__G.H.landed', 10000);
  await h.key('tap', 'Digit5'); await h.wait(2500);
  await h.waitFor('__G.G.craft === "jet" && __G.war.carrier.parts.jbdK > 0.9', 8000);   // the JBD rises at 0.7/s; slow headless frames
  await h.expect('__G.G.craft === "jet" && __G.war.carrier.parts.jbdK > 0.9', 'JBD raised behind the jet on the cat');
  await h.eval(`(__shot(__G.war.carrier, [-16, 9, 22], [-2.5, 9, -2]), 1)`); await h.wait(1200); await h.shot('albatross-jbd');
  await h.eval('(window.__cam = null, 1)'); await h.key('tap', 'KeyY'); await h.wait(800);
  await h.expect('__G.G.craft === "heli"', 'back in the helicopter');
  // the helicopter out of the way, parked on its home pad
  await h.eval(`(__G.H.reset(new __G.THREE.Vector3(__G.HOME_B.x + 18, 60, __G.HOME_B.z + 18), 0, false, 1), __G.HI.setCollective(0.475), 1)`);

  // ---- ALBATROSS under way
  await h.eval(`(() => { const c = __G.war.carrier; c.speed = 5.5; const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw); __G.war.orderCarrier(c.p.x + fx * 900, c.p.z + fz * 900); return [c.p.x, c.p.z, c.yaw] })()`);
  await h.wait(9000);
  await h.eval(`(__shot(__G.war.carrier, [95, 55, 120], [0, 6, 10]), 1)`); await h.wait(1500); await h.shot('albatross-wake');
  await h.eval(`(__shot(__G.war.carrier, [-70, 22, -95], [0, 10, -10]), 1)`); await h.wait(1200); await h.shot('albatross-bow');
  await h.eval(`(__shot(__G.war.carrier, [-30, 16, 70], [0, 9, 20]), 1)`); await h.wait(1200); await h.shot('albatross-deck-aft');
  await h.eval(`(__shot(__G.war.carrier, [26, 13, -10], [8, 14, 4]), 1)`); await h.wait(1200); await h.shot('albatross-island');
  // deckY follows heave / pitch / roll: sample the deck at the wires and at the bow for a few seconds
  await h.eval(`(() => { window.__dk = []; const c = __G.war.carrier, W = __G.war; window.__dkI = setInterval(() => { const co = Math.cos(c.yaw), si = Math.sin(c.yaw), P = (lx, lz) => [c.p.x + lx * co + lz * si, c.p.z - lx * si + lz * co];
      const [x1, z1] = P(-2.5, 40), [x2, z2] = P(-2.5, -55); __dk.push([W.deckY(x1, z1), W.deckY(x2, z2), c.att.pitch, c.att.roll, c.att.heave, c.mesh.position.y]); }, 100); return 1; })()`);
  await h.wait(6000);
  await h.eval(`(() => { clearInterval(__dkI); const a = __dk.map(r => r[0]), b = __dk.map(r => r[1]); const rg = v => Math.max(...v) - Math.min(...v);
    return { n: __dk.length, aftRange: +rg(a).toFixed(3), bowRange: +rg(b).toFixed(3), aftMean: +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2), pitchDeg: +(__dk.at(-1)[2] * 57.3).toFixed(3), rollDeg: +(__dk.at(-1)[3] * 57.3).toFixed(3) }; })()`);
  await h.expect(`(() => { const a = __dk.map(r => r[0]); return Math.max(...a) - Math.min(...a) > 0.02 && Math.max(...a) < 9.2 && Math.min(...a) > 6.8; })()`, 'deck at the wires moves with the sea, around 8 m');
  await h.expect(`(() => { const c = __G.war.carrier, W = __G.war, co = Math.cos(c.yaw), si = Math.sin(c.yaw), x = c.p.x + 13 * si - 2.5 * co, z = c.p.z + 13 * co + 2.5 * si; return Math.abs(W.deckY(x, z) - W.deckAt(c, x, z)) < 0.02; })()`, 'deckY == deckAt on the deck');
  // crew clear out from under a helicopter hovering low over them
  await h.eval(`(() => { const c = __G.war.carrier, co = Math.cos(c.yaw), si = Math.sin(c.yaw), lx = 4.4, lz = -38; const m = c.parts.crew.members.find(p => p.mode === 'kneel' && p.jersey === 'purple'); window.__cm = m; window.__cm0 = [m.x, m.z];
      __G.H.reset(new __G.THREE.Vector3(c.p.x + m.x * co + m.z * si, c.p.y + 8 + 6, c.p.z - m.x * si + m.z * co), c.yaw, false, 1); __G.HI.setCollective(0.475); return [m.x, m.z]; })()`);
  await h.wait(2500);
  await h.expect(`Math.hypot(__cm.x - __cm0[0], __cm.z - __cm0[1]) > 1.5`, 'the fueller moved out from under the helicopter');
  await h.eval(`(window.__cam = { u: __G.war.carrier, p: [24, 16, -10], t: [6, 9, -38] }, 1)`); await h.wait(600); await h.shot('crew-clear');
  await h.eval(`(__G.H.reset(new __G.THREE.Vector3(__G.HOME_B.x + 18, 60, __G.HOME_B.z + 18), 0, false, 1), 1)`);

  // ---- KRAKEN
  await h.eval(`(__shot(__G.war.enemyCarrier, [110, 50, 90], [0, 8, 0]), 1)`); await h.wait(1500); await h.shot('kraken');
  await h.eval(`(__shot(__G.war.enemyCarrier, [-40, 20, -60], [5, 12, 10]), 1)`); await h.wait(1200); await h.shot('kraken-deck');

  // ---- LEVIATHAN and the container ship, placed in open water off the ALBATROSS and set going
  await h.eval(`(() => { const W = __G.war, c = W.carrier, [x, z] = __G.nav.nearestWater(c.p.x + 300, c.p.z - 200); const b = W.makeShip('battleship', 2, x, z, 1.0); W.battleship = b; b.speed = 6;
      const [x2, z2] = __G.nav.nearestWater(c.p.x - 260, c.p.z + 240); const f = W.makeShip('freighter', 2, x2, z2, -0.5); f.cargo = 10; f.repath = 99; f.speed = 4.5; f.path = [[x2 - Math.sin(-0.5) * -900, z2 - Math.cos(-0.5) * 900]]; window.__lev = b; window.__box = f; return [x, z, x2, z2]; })()`);
  await h.wait(5000);
  await h.eval(`(__shot(__lev, [70, 30, 60], [0, 5, 0]), 1)`); await h.wait(1500); await h.shot('leviathan');
  await h.eval(`(__shot(__lev, [-22, 14, -30], [0, 8, 0]), 1)`); await h.wait(1200); await h.shot('leviathan-close');
  await h.eval(`(__shot(__box, [60, 28, 55], [0, 6, 0]), 1)`); await h.wait(1500); await h.shot('container');
  await h.eval(`(__shot(__box, [-20, 12, -40], [0, 8, 0]), 1)`); await h.wait(1200); await h.shot('container-close');
  await h.eval(`(() => { const r = __G.renderer.info.render; return { calls: r.calls, tris: r.triangles, fps: document.getElementById('dbg').textContent }; })()`);
  await h.eval(`(window.__cam = null, 1)`);
}
