// The world past the control zone: continents, mountain ranges and forests, baked by the terrain worker. Fly the jet
// at a mountain range, look at it from the cockpit and outside; then set the helicopter down in a lowland meadow.
export default async function (h) {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 15000); await h.wait(500);
  await h.key('tap', 'Digit5'); await h.wait(300);
  // the highest ground in a 6 km square east of the zone
  await h.eval(`(() => { let best = null; for (let z = -3000; z <= 3000; z += 100) for (let x = 3000; x <= 12000; x += 100) { const y = __G.islandH(x, z); if (!best || y > best.y) best = { x, z, y }; } window.__M = best; return best; })()`);
  await h.expect('__M.y > 300');
  await h.eval(`(() => { const J = __G.JP.J, M = __M; J.cat = null; J.reset(M.x - 2600, 0, M.z + 400, -Math.PI / 2 + 0.15, { running: true, airborne: true, alt: M.y + 120, speed: 90 }); for (const e of J.eng) e.n = 0.92;
    window.__alt = M.y + 120; __G.JP.autopilot = (J) => ({ pitch: Math.max(-1, Math.min(1, -J.vel.y * 0.03 + (__alt - J.pos.y) * 0.004)), roll: -J.attitude().roll * 2, yaw: 0, throttle: [0.75, 0.75], brakeL: 0, brakeR: 0 }); return 1; })()`);
  await h.waitFor('__G.HW.every(L => !L.busy && Math.abs(L.cx - __G.JP.J.pos.x) < 1200) && __G.forest.count > 0', 20000);
  await h.wait(1500);
  await h.eval('({inZone: __G.inZone(__G.JP.J.pos.x, __G.JP.J.pos.z), trees: __G.forest.count, draw: Math.round(__G.view.draw), hint: document.getElementById("hint").textContent, msg: document.getElementById("msg").textContent})');
  await h.expect('!__G.inZone(__G.JP.J.pos.x, __G.JP.J.pos.z) && __G.JP.alive && !/TURN BACK/.test(document.getElementById("hint").textContent + document.getElementById("msg").textContent)');
  await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1200); await h.shot('cockpit-range');
  await h.eval('(__G.cockpitCam = false, __G.JP.snapChase(), 1)'); await h.wait(1800); await h.shot('chase-range');
  await h.notblank();
  // a gentle lowland spot near the range for the helicopter
  await h.eval(`(() => { const M = __M; let best = null; for (let z = M.z - 1500; z <= M.z + 1500; z += 40) for (let x = M.x - 1500; x <= M.x + 1500; x += 40) { const y = __G.islandH(x, z); if (y < 15 || y > 90) continue; const s = Math.abs(__G.islandH(x + 6, z) - y) + Math.abs(__G.islandH(x, z + 6) - y); if (!best || s < best.s) best = { x, z, y, s }; } window.__L = best; return best; })()`);
  await h.expect('!!__L');
  await h.eval('(__G.JP.autopilot = null, __G.JP.stow(), __G.crafts ? __G.crafts.setActive("heli") : (__G.G.craft = "heli"), __G.cockpitCam = false, 1)');
  await h.eval(`(() => { const L = __L; __G.H.reset(new __G.THREE.Vector3(L.x, __G.groundY(L.x, L.z) + 1.2, L.z), 0.5, true, 1); return 1; })()`);
  await h.waitFor('__G.HW[0].busy === false && Math.abs(__G.HW[0].cx - __G.H.pos.x) < 400', 20000);
  await h.wait(2000); await h.shot('heli-meadow');
  await h.expect('__G.Z.alive && __G.H.landed && !__G.JP.lastLoss');
}
