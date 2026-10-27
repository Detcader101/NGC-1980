// RENDERKIT light (ngc/depth-light): sun shadows + light balance A/B. Same views with the light area off and on.
//   RK=surface,world,fx,post,ui node snap.mjs scenes/rklight.mjs   (everything but 'light': the A side)
//   node snap.mjs scenes/rklight.mjs                                (RK=all: the B side)      RK=0: the classic game
// VIEWS=deck,hueyck,swim,jet,home,town,forest,tank,foot,huey200 picks a subset; SHADOWS=off|low|xr|desktop forces a tier.
// Frame time per view: rAF intervals over 4 s (frameMs50) + the world pass rendered 6x with a 1-pixel readback (drawMs50,
// shadow maps re-rendered each time when on). SwiftShader: relative numbers only. NOTIME=1 skips the sampling.
const RK = process.env.RK ?? 'all';
const LIGHT = RK === 'all' || RK === '1' || RK.split(',').includes('light');
const VIEWS = (process.env.VIEWS || 'all').split(',');
const SH = process.env.SHADOWS ? `&shadows=${process.env.SHADOWS}` : '';
const want = v => VIEWS.includes('all') || VIEWS.includes(v);
const Q = `?debug&auto&kb&peace&res=0.6&sea=3&rk=${RK}${SH}`;
const READY = "window.__G && __G.G.state==='play' && __G.H.landed";
// scripted camera at render time (rkworld pattern); the shadow boxes follow the scripted camera too
const HOOK = `(() => {
    const g = __G, r = g.renderer, orig = r.render.bind(r);
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam === g.zCam) { const p = typeof C === 'function' ? C() : C; cam.position.set(...p.wp); cam.up.set(0, 1, 0); cam.lookAt(...p.wt); cam.updateMatrixWorld();
      if (g.rkLight) { g.rkLight.follow(cam); g.rkLight.cascades.forEach(c => c.S.needsUpdate = true); } }
      orig(sc, cam); if (window.__frames && cam === g.zCam) window.__frames.push(performance.now()); };
    window.__sample = () => new Promise(res => { window.__frames = []; setTimeout(() => {
      const f = window.__frames; window.__frames = null; const d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]); d.sort((x, y) => x - y);
      const gl = r.getContext(), px = new Uint8Array(4), ds = []; const sc = g.sealife.bedMesh.parent;
      for (let i = 0; i < 7; i++) { if (g.rkLight) g.rkLight.cascades.forEach(c => c.S.needsUpdate = true); const t = performance.now(); orig(sc, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); } ds.sort((x, y) => x - y);
      res({ frames: d.length, frameMs50: d.length ? +d[d.length >> 1].toFixed(1) : null, drawMs50: +ds[3].toFixed(1), calls: r.info.render.calls, tris: r.info.render.triangles, light: g.rkLight ? { ...g.rkLight.stats, tier: g.rkLight.tier } : null }); }, 4000); });
    window.__yawTo = (x, z) => { const W = __G.foot.W; return Math.atan2(-(x - W.x), -(z - W.z)); };
    return 1; })()`;
export default { name: 'rklight-' + RK.replace(/[^\w]+/g, '_') + (process.env.SHADOWS || ''), seed: 1980, query: Q, run: async h => {
  const times = {};
  const boot = async () => {
    await h.waitFor(READY, 120000); await h.eval('(__G.G.bench=true,1)');
    if (!LIGHT) await h.expect('!__G.rkLight && !__G.renderer.shadowMap.enabled', 'light area off: no shadow maps, classic lights');
    else await h.expect('!!__G.rkLight && __G.renderer.shadowMap.enabled', 'light area on: sun shadows');
    await h.eval(HOOK);
  };
  const shoot = async (name, settle = 1500) => {
    await h.wait(settle);
    if (await h.eval('!!window.__WORLD')) await h.waitFor('__WORLD.stats.pending===0', 60000);
    await h.wait(600); await h.shot(name); await h.notblank();
    if (!process.env.NOTIME) times[name] = await h.eval('__sample()', name + '-frametime');
  };
  await boot();
  if (LIGHT) await h.eval('({ ...__G.rkLight.stats, tier: __G.rkLight.tier, cascades: __G.rkLight.cascades.map(c => ({ r: c.r, size: c.size, every: c.every })) })', 'light-stats');
  // A. the carrier at the start: the deck, the parked Huey, its cockpit, a swimmer by the hull
  if (want('deck')) {
    await h.eval(`(window.__cam = () => { const c = __G.war.carrier, s = Math.sin(c.yaw), k = Math.cos(c.yaw); const P = (x, y, z) => [c.p.x + x * k + z * s, c.p.y + y, c.p.z - x * s + z * k]; return { wp: P(38, 26, 40), wt: P(0, 8, -10) }; }, 1)`);
    await shoot('deck');
    await h.eval(`(window.__cam = () => { const H = __G.H.pos; return { wp: [H.x + 9, H.y + 3.2, H.z + 7], wt: [H.x, H.y + 0.5, H.z] }; }, 1)`);
    await shoot('deck-huey');
    await h.eval('(window.__cam = null, 1)');
  }
  if (want('hueyck')) {
    await h.eval('(__G.cockpitCam = true, window.__hy = setInterval(() => { __G.head.yaw = 0; __G.head.pitch = -0.2; }, 5), 1)');
    await shoot('huey-cockpit');
    await h.eval('(clearInterval(__hy), window.__hy = setInterval(() => { __G.head.yaw = 1.2; __G.head.pitch = -0.1; }, 5), 1)');
    await shoot('huey-cockpit-right', 1200);
    await h.eval('(clearInterval(__hy), __G.head.yaw = __G.head.pitch = 0, __G.cockpitCam = false, 1)');
  }
  if (want('swim')) {
    await h.key('tap', 'KeyY'); await h.wait(500);
    await h.expect("__G.G.craft === 'foot'", 'out on the deck');
    await h.eval(`(() => { const c = __G.war.carrier, w = __G.GR.toWorld(c, -26, 20), W = __G.foot.W; W.x = w.x; W.z = w.z; W.y = -1.3; W.vx = W.vz = 0; W.plat = null; W.loc = null; W.swim = true; __G.marine.aim(c.yaw + Math.PI / 2, 0.05); return 1; })()`);
    await h.wait(1500); await h.eval("(__G.marine.view = 'third', 1)");
    await shoot('swim-third');
    await h.eval("(__G.marine.view = 'first', __G.marine.aim(__G.war.carrier.yaw - Math.PI / 2, 0.25), 1)");
    await shoot('swim-first', 1200);
  }
  // B. the Hornet on the catapult, from the cockpit
  if (want('jet')) {
    await h.goto(Q); await boot();
    await h.key('tap', 'Digit5'); await h.wait(600);
    await h.expect("__G.G.craft === 'jet'", 'in the Hornet');
    await h.eval('(__G.cockpitCam = true, 1)');
    await shoot('jet-cockpit');
    await h.eval('(__G.cockpitCam = false, __G.JP.snapChase(), 1)');
    await shoot('jet-chase');
  }
  // C. the home island: wide views, a village street, the forest, the M60, then the user's view (on foot at the HQ / pad,
  // sandbags, the Huey parked on the home pad)
  if (want('foot') || want('home') || want('town') || want('forest') || want('tank')) { await h.goto(Q); await boot(); }
  if (want('home')) {
    await h.eval(`(window.__cam = (() => { const I = __G.ISLANDS[0]; return { wp: [I.x + 160, 200, I.z + 260], wt: [I.x, 0, I.z] }; })(), 1)`); await shoot('home200', 2500);
    await h.eval(`(window.__cam = (() => { const P = __G.PAD; return { wp: [P.x + 38, P.h + 22, P.z + 30], wt: [P.x, P.h, P.z] }; })(), 1)`); await shoot('home-pad', 1500);
  }
  if (want('town')) {   // the densest cluster of zone-village buildings (world/layout.js items with a footprint)
    await h.eval(`(() => { const g = __G; let best = null; const cp = g.war.carrier.p; for (const e of [...__WORLD.zone].sort((a, b) => Math.hypot(a.x - cp.x, a.z - cp.z) - Math.hypot(b.x - cp.x, b.z - cp.z)).slice(0, 1)) { const b = e.items.filter(i => i.w && i.d); for (const i of b) { const n = b.filter(j => Math.hypot(j.x - i.x, j.z - i.z) < 45).length; if (!best || n > best.n) best = { n, x: i.x, z: i.z, yaw: i.yaw || 0, t: i.t, isl: e.I.name }; } }
      window.__town = best; const s = best, gy = (x, z) => g.groundY(x, z), qx = -0.51, qz = 0.86;   // across the sun (azimuth 0.95, 0.57): shadows fall sideways
      window.__cam = { wp: [s.x + qx * 22, gy(s.x + qx * 22, s.z + qz * 22) + 1.8, s.z + qz * 22], wt: [s.x - qx * 6, gy(s.x, s.z) + 2.5, s.z - qz * 6] }; return best; })()`, 'town');
    await shoot('town-street', 3500);
    await h.eval(`(window.__cam = { wp: [__town.x + 45, __G.groundY(__town.x, __town.z) + 35, __town.z + 55], wt: [__town.x, __G.groundY(__town.x, __town.z), __town.z] }, 1)`); await shoot('town-above', 2000);
  }
  if (want('forest')) {
    await h.eval(`(() => { const g = __G, sc = g.sealife.bedMesh.parent, I = g.HOME_B, T = g.THREE, m4 = new T.Matrix4(), p = new T.Vector3(); let best = null;
      sc.traverse(o => { if (!o.isInstancedMesh || o.count < 200) return; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); const d = Math.hypot(p.x - I.x, p.z - I.z); if (d > 70 && d < 400 && (!best || d < best.d)) best = { d, x: p.x, y: p.y, z: p.z, name: o.name || o.geometry.type }; } });
      window.__tree = best; if (best) window.__cam = { wp: [best.x - 9, g.groundY(best.x - 9, best.z + 14) + 1.8, best.z + 14], wt: [best.x + 4, best.y + 1.5, best.z - 6] }; return best; })()`, 'forest');
    await shoot('forest', 2500);
    await h.eval(`(window.__cam = { wp: [__tree.x + 40, __tree.y + 34, __tree.z + 30], wt: [__tree.x, __tree.y, __tree.z] }, 1)`); await shoot('forest-above', 1500);
  }
  await h.eval('(window.__cam = null, 1)');
  if (want('tank')) {
    await h.eval('(() => { const s = __G.GR.motorPool(__G.HOME_B.isl, 4.6); __G.m60C.spawnAt(s); return s.name; })()'); await h.wait(500);
    if (await h.eval("__G.G.craft !== 'foot'")) { await h.key('tap', 'KeyY'); await h.wait(500); }
    await h.eval(`(__G.crafts.control('m60', 1, 'foot'), __G.m60C.view = 'chase', __G.m60C.orbit.yaw = 2.6, __G.m60C.orbit.pitch = 0.3, 1)`);
    await h.expect("__G.G.craft === 'm60'", 'in the M60');
    await shoot('tank-chase', 2000);
    await h.eval(`(__G.m60C.view = 'eye', 1)`); await shoot('tank-eye', 1500);
  }
  if (want('foot')) {
    if (await h.eval("__G.G.craft !== 'foot'")) { await h.key('tap', 'KeyY'); await h.wait(600); }
    await h.expect("__G.G.craft === 'foot'", 'on foot');
    // the Huey parked on the home pad, the soldier a few metres off it towards the HQ
    await h.eval(`(() => { const g = __G, P = g.PAD, B = g.HOME_B, V = g.THREE.Vector3; g.H.reset(new V(P.x, P.h + 1.2, P.z), 2.4, true, 0); g.Z.pos.copy(g.H.pos); g.Z.landed = true;
      const dx = B.x - P.x, dz = B.z - P.z, l = Math.hypot(dx, dz), x = P.x + dx / l * 13 + dz / l * 6, z = P.z + dz / l * 13 - dx / l * 6; g.foot.spawnAt([{ x, y: g.groundY(x, z) + 0.2, z, yaw: 0 }]); return [Math.round(x), Math.round(z)]; })()`, 'place');
    await h.wait(1500);
    for (const [n, expr, pitch] of [['foot-hq', '__yawTo(__G.HOME_B.x, __G.HOME_B.z)', -0.08], ['foot-huey', '__yawTo(__G.H.pos.x, __G.H.pos.z) + 0.35', -0.12], ['foot-away', '__yawTo(__G.HOME_B.x, __G.HOME_B.z) + 2.2', -0.1], ['foot-sun', '__yawTo(__G.foot.W.x + 0.5, __G.foot.W.z + 0.3)', -0.05]]) {
      await h.eval(`(__G.marine.aim(${expr}, ${pitch}), 1)`); await shoot(n, 1200);
    }
    await h.eval(`(__G.marine.view = 'third', __G.marine.aim(__yawTo(__G.HOME_B.x, __G.HOME_B.z) + 1.4, -0.15), 1)`); await shoot('foot-third', 1200);
    await h.eval("(__G.marine.view = 'first', 1)");
  }
  // D. the Huey held 200 m over the home island: its shadow far below
  if (want('huey200')) {
    await h.goto(Q); await boot();
    await h.eval('(__G.respawnHome(), 1)'); await h.waitFor('__G.H.landed && __G.G.mode === "zarch"', 60000);
    await h.eval(`(() => { const g = __G, I = g.ISLANDS[0], a = new g.THREE.Vector3(I.x + 40, 200, I.z + 30); g.H.reset(a.clone(), 0, false, 1);
      window.__hold = setInterval(() => { g.H.pos.copy(a); g.H.vel.set(0, 0, 0); g.HI.setCollective(.47); }, 16);
      window.__cam = () => { const H = g.H.pos; return { wp: [H.x + 26, H.y + 14, H.z + 20], wt: [H.x - 60, H.y - 150, H.z - 36] }; }; return 1; })()`);
    await shoot('huey200', 3000);
    await h.eval(`(window.__cam = () => { const H = __G.H.pos; return { wp: [H.x + 9, H.y + 2.5, H.z + 7], wt: [H.x, H.y, H.z] }; }, 1)`); await shoot('huey200-close', 1200);
    await h.eval('(clearInterval(__hold), 1)');
  }
  console.log('RKLIGHT_TIMES ' + JSON.stringify({ rk: RK, times }));
  await h.eval(`(${JSON.stringify(times)})`, 'frame-times');
}};
