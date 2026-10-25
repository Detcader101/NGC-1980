// HORNET terrain warnings over the real-world terrain: fly level, hands off, at a mountain that's taller than you.
// TERRAIN must come first, then PULL UP with time left to pull, then the crash. Fly it again and pull on the PULL UP:
// you must clear the mountain. Last, low and level over open sea: no warnings at all.
export default async function (h) {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 15000); await h.wait(500);
  await h.key('tap', 'Digit5'); await h.wait(300);
  await h.eval(`(() => { let best = null; for (let z = -3000; z <= 3000; z += 100) for (let x = 3000; x <= 12000; x += 100) { const y = __G.islandH(x, z); if (!best || y > best.y) best = { x, z, y }; } window.__M = best; return best; })()`);
  await h.expect('__M.y > 300');
  // fly at the peak 250 m below its top, heading east (+x), recording when each warning first shows
  const run = (pullOnWarn) => `(() => { const P = __G.JP, J = P.J, M = __M; J.cat = null; P.autopilot = null;
    J.reset(M.x - 3200, 0, M.z, -Math.PI / 2, { running: true, airborne: true, alt: M.y - 250, speed: 110 }); for (const e of J.eng) e.n = 0.9;
    const alt = M.y - 250, t0 = performance.now(); window.__W = { terrain: null, pull: null, pulling: false };
    P.autopilot = (J) => { const W = __W, t = (performance.now() - t0) / 1000;
      if (P.warn === 'TERRAIN' && W.terrain === null) W.terrain = t; if (P.warn === 'PULL UP' && W.pull === null) W.pull = t;
      if (${pullOnWarn} && W.pull !== null) W.pulling = true;
      const roll = -J.attitude().roll * 2;
      if (W.pulling) return { pitch: 1, roll, yaw: 0, throttle: [1, 1], brakeL: 0, brakeR: 0 };
      return { pitch: Math.max(-1, Math.min(1, -J.vel.y * 0.03 + (alt - J.pos.y) * 0.004)), roll, yaw: 0, throttle: [0.75, 0.75], brakeL: 0, brakeR: 0 }; };
    window.__t0 = t0; return { y: J.pos.y, peak: M.y }; })()`;
  await h.eval(run(true));
  await h.waitFor('!__G.JP.alive || __G.JP.J.pos.y > __M.y + 60', 60000);
  await h.wait(2000);
  await h.eval('({ W: __W, alive: __G.JP.alive, y: __G.JP.J.pos.y, peak: __M.y, loss: __G.JP.lastLoss })');
  await h.expect('__G.JP.alive && __W.pull !== null');
  await h.shot('cleared');
  // low and level over open sea (~20 m, 2 km of water ahead): quiet
  await h.eval(`(() => { for (let z = -6000; z <= 6000; z += 250) for (let x = -12000; x <= 12000; x += 250) { let ok = true; for (let d = 0; d <= 2500 && ok; d += 50) ok = __G.groundY(x + d, z) <= 0 && __G.islandH(x + d, z) < -3 && Math.abs(__G.war.deckY(x + d, z)) > 1e3; if (ok) { window.__S = { x, z }; return __S; } } return null; })()`);
  await h.expect('!!window.__S');
  await h.eval(`(() => { const P = __G.JP, J = P.J, S = __S; P.autopilot = null; J.reset(S.x, 0, S.z, -Math.PI / 2, { running: true, airborne: true, alt: 22, speed: 110 }); for (const e of J.eng) e.n = 0.9;
    const casStick = (n) => { const ct = Math.cos(J.attitude().pitch); return Math.max(-1, Math.min(1, n >= ct ? (n - ct) / (3.5 - ct) : (n - ct) / (ct + 1))); };
    window.__Q = { warn: null }; const q0 = performance.now(), g0 = __G.war.time; P.autopilot = (J) => { const stick = casStick(Math.cos(J.attitude().pitch) + 0.02 * (0.1 * (22 - J.pos.y) - J.vel.y)); const o = { pitch: stick, roll: -J.attitude().roll * 2, yaw: 0, throttle: [0.6, 0.6], brakeL: 0, brakeR: 0 }; if (__G.war.time - g0 < 3) { if (performance.now() - (__Q.lt || 0) > 400) { __Q.lt = performance.now(); (__Q.tr = __Q.tr || []).push([((performance.now() - q0) / 1000).toFixed(1), J.pos.y.toFixed(1), J.vel.y.toFixed(1), (J.eas * 1.944).toFixed(0), J.nz.toFixed(2), P.warn || ''].join(' ')); } return o; } if (P.warn) __Q.all = [...new Set([...(__Q.all || []), P.warn])]; if (P.warn && !__Q.warn) { __Q.warn = P.warn; __Q.at = { y: J.pos.y, vy: J.vel.y, agl: P.agl, gcas: P.gcas, pitch: J.attitude().pitch, ground: __G.groundY(J.pos.x, J.pos.z) }; }
      (__Q.tr = __Q.tr || []).length < 400 && (performance.now() - (__Q.lt || 0) > 400) && (__Q.lt = performance.now(), __Q.tr.push([((performance.now() - q0) / 1000).toFixed(1), J.pos.y.toFixed(1), J.vel.y.toFixed(1), (J.eas * 1.944).toFixed(0), J.nz.toFixed(2), P.warn || ''].join(' '))); __Q.minY = Math.min(__Q.minY ?? 1e9, J.pos.y); __Q.maxY = Math.max(__Q.maxY ?? 0, J.pos.y); return o; }; return 1; })()`);
  await h.wait(11000);
  await h.eval('__Q.tr.join(" | ")');
  await h.eval('({ Q: __Q, y: __G.JP.J.pos.y, alive: __G.JP.alive })');
  await h.expect('__G.JP.alive && !__Q.warn');
  // hands off all the way: TERRAIN, then PULL UP with time to spare, then the crash
  await h.eval(run(false));
  await h.waitFor('!__G.JP.alive || __G.JP.J.pos.x > __M.x + 200', 60000);
  await h.eval('(window.__W.hit = (performance.now() - __t0) / 1000, ({ W: __W, alive: __G.JP.alive, loss: __G.JP.lastLoss }))');
  await h.expect('!__G.JP.alive && __W.terrain !== null && __W.pull !== null && __W.terrain < __W.pull - 1.5 && __W.pull < __W.hit - 2');
}
