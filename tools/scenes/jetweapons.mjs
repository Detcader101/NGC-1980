// HORNET weapons: AIM-9 lock and kill on a gunship, a gun kill on a transport, and CCIP accuracy (where the bomb
// actually lands vs where the pipper said it would).   ?peace keeps the enemy commander quiet.
export default async function (h) {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 15000); await h.wait(500);
  await h.key('tap', 'Digit5'); await h.wait(300);
  // airborne 150 m up over open sea west of the map, heading north at 300 kt
  const place = (x, z, alt, yaw, tas) => h.eval(`(() => { const J = __G.JP.J; J.cat = null; J.reset(${x}, 0, ${z}, ${yaw}, { running: true, airborne: true, alt: ${alt}, speed: ${tas} }); for (const e of J.eng) e.n = 0.9; __G.JP.thr = 0.7; __G.JP.thrSrc = 'kb'; return 1; })()`);
  const hold = `__G.JP.autopilot = (J, dt) => { const ct = Math.cos(J.attitude().pitch); return { pitch: Math.max(-1, Math.min(1, (-J.vel.y * 0.03 + (window.__alt - J.pos.y) * 0.004))), roll: -J.attitude().roll * 2, yaw: 0, throttle: [0.7, 0.7], brakeL: 0, brakeR: 0 }; }`;
  await place(-900, 300, 150, 0, 75); await h.eval(`(window.__alt = 152, ${hold}, 1)`);
  // a gunship 650 m ahead, same height, flying away slowly
  await h.eval(`(() => { const u = __G.war.spawnGunship(2, [-900, 140, -350]); u.p.set(-900, 152, -350); u.home = [-900, -900]; window.__gs = u; return u.hp; })()`);
  await h.key('tap', 'KeyR'); await h.wait(300);
  await h.expect('__G.JP.mode === "AA"');
  await h.eval('(__G.cockpitCam = true, 1)');
  await h.waitFor('__G.JP.tgt && __G.JP.tgt.lock', 8000);
  await h.eval('({range: __G.JP.tgt.range, off: __G.JP.tgt.off, shoot: __G.JP.tgt.shoot})');
  await h.key('tap', 'KeyR'); await h.wait(100);
  await h.expect('__G.war.proj.some(q => q.kind === "aam" && q.tgt === __gs)');
  await h.shot('aa-fox2-cockpit');
  await h.expect('__G.JP.J.stores.aam.filter(Boolean).length === 1');
  await h.wait(600); await h.eval('(__G.cockpitCam = false, __G.JP.snapChase(), 1)'); await h.shot('fox2');
  await h.waitFor('__gs.dying || __gs.dead', 8000);
  await h.expect('__gs.dying || __gs.dead');
  // gun: a transport parked on the nose 330 m out
  await place(-900, 300, 150, 0, 75); await h.eval('window.__alt = 152');
  await h.eval(`(() => { const J = __G.JP.J, f = J.forward(); const u = __G.war.units.find(u => u.type === 'gunship' && !u.dead) ; const tgt = { p: new __G.THREE.Vector3() }; window.__tr = null; return 1; })()`);
  await h.eval(`(() => { __G.war.spawnGunship(2, [-900, 152, -30]); const u = __G.war.units[__G.war.units.length - 1]; u.type = 'gunship'; u.hp = u.hpMax = 6; window.__tr = u; window.__trFix = setInterval(() => { const J = __G.JP.J; u.p.copy(J.worldPoint([0, 0.33, -7.05])).addScaledVector(J.forward(), 330); u.p.y -= 1.4; u.v.copy(J.vel); }, 10); return 1; })()`);
  await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(300);
  await h.key('hold', 'KeyF', 1500);
  await h.shot('guns');
  await h.eval('({hp: __tr.hp, dying: !!__tr.dying, gun: __G.JP.J.gun})');
  await h.expect('__tr.dying || __tr.dead || __tr.hp < 6');
  await h.eval('(clearInterval(window.__trFix), 1)');
  // bombs: level at 120 m, 300 kt, over open water: CCIP point at release vs actual impact
  await place(-1000, 600, 120, 0, 75); await h.eval('window.__alt = 122');
  await h.key('tap', 'KeyB'); await h.wait(1500);
  await h.expect('__G.JP.mode === "AG"');
  await h.shot('ccip');
  await h.eval(`(() => { const war = __G.war, n0 = war.proj.length; window.__pred = null; window.__imp = null;
     const st = __G.JP.J; const hs = __G.JP; return 1; })()`);
  await h.eval(`(() => { const J = __G.JP.J; let p = J.worldPoint([-2.6, -0.35, 0.3]), v = J.vel.clone(); for (let i = 0; i < 600; i++) { v.y -= 9 * 0.04; p.addScaledVector(v, 0.04); if (p.y <= 0) break; } window.__pred = p.clone(); window.__nb = __G.war.proj.length; return [p.x, p.z]; })()`);
  await h.key('tap', 'KeyB');
  await h.eval(`(() => { window.__pred = __G.JP.lastDrop.pred; const b = __G.JP.lastDrop.bomb; window.__bomb = b; window.__bombLast = null; window.__bt = setInterval(() => { if (__G.war.proj.includes(b)) { const t = Math.max(0, b.p.y) / Math.max(1, -b.v.y); window.__bombLast = b.p.clone().addScaledVector(b.v, t); window.__bombLast.y = 0; } }, 5); return !!b; })()`);
  await h.waitFor('!__G.war.proj.includes(__bomb)', 15000);
  await h.eval('({pred: [__pred.x, __pred.z], hit: [__bombLast.x, __bombLast.y, __bombLast.z], miss: Math.hypot(__pred.x - __bombLast.x, __pred.z - __bombLast.z)})');
  await h.expect('Math.hypot(__pred.x - __bombLast.x, __pred.z - __bombLast.z) < 5');
}
