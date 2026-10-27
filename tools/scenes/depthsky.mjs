// DEPTH PASS sky (ngc/depth-sky): sky, clouds, sun and aerial perspective from the player's heights.
//   RK=0 node snap.mjs scenes/depthsky.mjs   /   RK=all node snap.mjs scenes/depthsky.mjs   (SKY=low adds &rksky=low)
// The camera is scripted at render time (rkworld.mjs pattern). VIEWS=hq,footup,... runs a subset. Each view also times
// the sky dome alone (render + 1-pixel readback, median of 8) so the cloud raymarch cost shows apart from the world.
const RK = process.env.RK ?? 'all', SKY = process.env.SKY ?? '';
const VIEWS = (process.env.VIEWS || 'all').split(',');
const want = v => VIEWS.includes('all') || VIEWS.includes(v);
export default { name: 'depthsky-' + RK.replace(/[^\w]+/g, '_') + (SKY ? '-' + SKY : ''), seed: 1980, query: `?debug&auto&kb&peace&res=0.6&sea=3&nofog&rk=${RK}${SKY ? '&rksky=' + SKY : ''}`, run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 60000);
  await h.eval('(__G.G.bench=true,1)');
  await h.eval(`(() => {
    const g = __G, r = g.renderer, orig = r.render.bind(r), T = g.THREE, a = new T.Vector3(), b = new T.Vector3();
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam === g.zCam) { a.set(...C.wp); b.set(...C.wt); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    clearInterval(window.__hold);
    window.__shotAt = (C) => { window.__cam = C; a.set(...C.wp); const H = g.H, y = Math.max(a.y + (C.hover ?? 40), g.groundY(a.x, a.z) + 30); H.reset(a.clone().setY(y), 0, false, 1); g.cockpitCam = false;
      clearInterval(window.__hold); let prev = -1; window.__hold = setInterval(() => { if (g.war.time === prev) return; prev = g.war.time; H.pos.set(a.x, y, a.z); H.vel.set(0, 0, 0); g.HI.setCollective(.47); }, 16); };
    const sc = g.sealife.bedMesh.parent;
    window.__skyMs = () => { const gl = r.getContext(), px = new Uint8Array(4), vis = sc.children.map(o => o.visible), ds = [];
      sc.children.forEach(o => { o.visible = o.renderOrder === -10; });
      for (let i = 0; i < 9; i++) { const t = performance.now(); orig(sc, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); }
      sc.children.forEach((o, i) => o.visible = vis[i]); ds.sort((x, y) => x - y); return +ds[4].toFixed(1); };
    window.__frameMs = () => { const gl = r.getContext(), px = new Uint8Array(4), ds = [];
      for (let i = 0; i < 7; i++) { const t = performance.now(); r.render(sc, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); }
      ds.sort((x, y) => x - y); return +ds[3].toFixed(1); };
    // the dome alone, tiers alternated in ONE page (ABC rounds cancel machine drift): the kit's plain sky (before this
    // branch), the atmosphere 'low' and 'high'; render + 1-pixel readback, median ms
    window.__skyAB = async () => { if (!window.__rkSky) return null;
      const { createSkyMaterial } = await import('/js/renderkit/effects.js'); const sky = sc.children.find(o => o.renderOrder === -10), keep = sky.material;
      const M = { kit: createSkyMaterial({ zenith: 0x386bd9, horizon: 0xbfd9f2, ground: 0xbfd9f2, depthWrite: false }), low: __rkSky.materials.low, high: __rkSky.materials.high }, t = { kit: [], low: [], high: [] };
      const gl = r.getContext(), px = new Uint8Array(4), vis = sc.children.map(o => o.visible); sc.children.forEach(o => { o.visible = o === sky; });
      for (let round = 0; round < 5; round++) for (const k of round % 2 ? ['high', 'low', 'kit'] : ['kit', 'low', 'high']) { sky.material = M[k];
        for (let i = 0; i < 3; i++) { const t0 = performance.now(); orig(sc, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (round) t[k].push(performance.now() - t0); } }
      sky.material = keep; sc.children.forEach((o, i) => o.visible = vis[i]); M.kit.dispose();
      const med = a => { a.sort((x, y) => x - y); return +a[a.length >> 1].toFixed(1); }; return { kitMs: med(t.kit), lowMs: med(t.low), highMs: med(t.high) }; };
    return 1; })()`);
  const skyOn = RK === 'all' || RK === '1' || RK.split(',').includes('sky');
  const dome = "__G.sealife.bedMesh.parent.children.find(o => o.renderOrder === -10 && o.geometry?.type === 'SphereGeometry')";
  if (skyOn) {
    await h.expect(`!!window.__rkSky && ${dome}.material.name === 'RenderKit/atmosphere-${SKY || 'high'}' && /rkAerial/.test(__G.THREE.ShaderChunk.fog_fragment)`, 'sky on: the atmosphere dome (tier as asked) and the aerial-perspective fog chunk');
    // the clouds drift with the game clock and stop on pause
    await h.eval('(window.__w0 = __rkSky.uniforms.rkCloud.value.z, __G.openMenu(), 1)');
    await h.wait(2500);
    await h.expect('__G.G.state === "paused" && __rkSky.uniforms.rkCloud.value.z === __w0', 'paused: the cloud drift is frozen');
    await h.eval('(document.getElementById("menu").classList.remove("on"), __G.G.state = "play", 1)');
    await h.wait(2500);
    await h.expect('__rkSky.uniforms.rkCloud.value.z !== __w0', 'playing: the clouds drift again');
  } else await h.expect(`!window.__rkSky && !/rkAerial/.test(__G.THREE.ShaderChunk.fog_fragment)`, 'sky off: classic fog chunks, no atmosphere');
  const times = {};
  const view = async (name, camExpr, settle = 3000) => {
    if (!want(name)) return;
    await h.eval(`(__shotAt(${camExpr}),1)`);
    await h.wait(settle);
    if (await h.eval('!!window.__WORLD')) await h.waitFor('__WORLD.stats.pending===0', 60000);
    await h.wait(1200);
    await h.shot(name); await h.notblank();
    times[name] = await h.eval('({ skyMs: __skyMs(), frameMs: __frameMs(), draw: Math.round(__G.view.draw) })', name + '-ms');
    if (['footup', 'huey200', 'jet3000'].includes(name)) times[name].ab = await h.eval('__skyAB()', name + '-sky-tiers');
  };
  const I0 = 'const g = __G, I = g.ISLANDS[0], P = I.pad';
  // the user's view: first person on foot at the home base, looking across the pad at the buildings and the hills
  await view('hq', `(() => { ${I0}; const y = g.groundY(P.x + 30, P.z + 30) + 1.7; return { wp: [P.x + 30, y, P.z + 30], wt: [P.x - 60, y + 6, P.z - 40], hover: 60 }; })()`);
  // first person looking up into the clouds
  await view('footup', `(() => { ${I0}; const y = g.groundY(P.x + 10, P.z - 20) + 1.7; return { wp: [P.x + 10, y, P.z - 20], wt: [P.x + 60, y + 70, P.z - 120], hover: 60 }; })()`);
  // towards the sun, low: disc, halo, forward scatter over the sea
  await view('sun', `(() => { ${I0}; const L = g.sealife.bedMesh.parent.children.find(o => o.isDirectionalLight).position.clone().normalize(); const x = I.x - I.r * 1.6, z = I.z - I.r * 1.6, y = 12; return { wp: [x, y, z], wt: [x + L.x * 100, y + L.y * 100 - 30, z + L.z * 100] }; })()`);
  // the Huey at 200 m: islands and wild land receding
  await view('huey200', `(() => { ${I0}; return { wp: [I.x - I.r * .5, 200, I.z + I.r * .5], wt: [I.x + 800, 120, I.z - 900] }; })()`);
  // a sea horizon, away from the sun
  await view('seahz', `(() => { ${I0}; const x = I.x + I.r * 2.4, z = I.z + I.r * 2.4; return { wp: [x, 8, z], wt: [x - 400, 9, z + 200] }; })()`);
  // jet at 1200 m under the cloud base, at 2000 m inside the cloud layer, at 3000 m above it, and looking down from 3000 m
  // over the zone (the land past the draw distance)
  await view('jet1200', `(() => { ${I0}; return { wp: [I.x, 1200, I.z], wt: [I.x + 2000, 1100, I.z + 900], hover: -400 }; })()`, 5000);
  await view('jet2000', `(() => { ${I0}; return { wp: [I.x, 2000, I.z], wt: [I.x + 2000, 1800, I.z + 900], hover: -400 }; })()`, 5000);
  await view('jet3000', `(() => { ${I0}; return { wp: [I.x, 3000, I.z], wt: [I.x + 3000, 2300, I.z + 1500], hover: -400 }; })()`, 5000);
  if (process.env.PROBE && want('jet3000')) {   // debug: where do these screen pixels meet the sea / land?
    await h.eval(`(() => { const g = __G, T = g.THREE, cam = g.zCam, o = __rkSky.uniforms.rkFarO.value, out = [];
      for (const [px, py] of ${process.env.PROBE}) { const nd = new T.Vector3(px / 640 - 1, 1 - py / 360, 0.5).unproject(cam).sub(cam.position).normalize();
        const t = cam.position.y / -nd.y, x = cam.position.x + nd.x * t, z = cam.position.z + nd.z * t;
        let land = null; for (let s = 0; s < t; s += 20) { const q = cam.position.clone().addScaledVector(nd, s); if (g.terrainH(q.x, q.z) > q.y) { land = [Math.round(q.x), Math.round(q.z), Math.round(s), +g.terrainH(q.x, q.z).toFixed(1)]; break; } }
        out.push({ px, py, sea: [Math.round(x), Math.round(z), Math.round(t)], land }); }
      return JSON.stringify({ cam: cam.position.toArray().map(Math.round), far: [o.x, o.y, o.z, o.w], out }); })()`, 'probe');
  }
  if (process.env.NOFAR && want('jet3000')) {   // debug: the same view with the far land switched off
    await h.eval('(__rkSky.uniforms.rkFarO.value.w = 0, 1)'); await h.wait(1500); await h.shot('jet3000-nofar');
    await h.eval('(__rkSky.uniforms.rkFarO.value.w = 1, 1)');
    await h.eval('(window.__tm = __G.sealife.bedMesh.parent.children.filter(o => o.material && o.material.uniforms === __G.terrainUni), __tm.forEach(o => o.userData.v = o.visible), __tm.forEach(o => o.visible = false), JSON.stringify(__tm.map(o => [o.position.x, o.position.z, o.userData.v])))', 'terrain meshes');
    await h.wait(1500); await h.shot('jet3000-noterrain');
    await h.eval('(__tm.forEach(o => o.visible = o.userData.v), 1)');
  }
  await view('jetdown', `(() => { ${I0}; const dx = -Math.sign(I.x || 1), dz = -Math.sign(I.z || 1); return { wp: [I.x - dx * 1500, 3000, I.z - dz * 1500], wt: [I.x + dx * 1500, 0, I.z + dz * 1500], hover: -400 }; })()`, 5000);
  // sea state 7: more, lower, greyer cloud and a greyer sky (waits for the weather to cross-fade, game time)
  if (want('ss7')) {
    await h.eval('(window.__rb0 = window.__rkWorld?.rebuilds ?? 0, __G.war.setSea(7), 1)');
    if (await h.eval('!!window.__rkSky')) await h.waitFor('__rkSky.grey > 0.9', 240000);
    await view('ss7', `(() => { ${I0}; const x = I.x - I.r * 2, z = I.z - I.r; return { wp: [x, 30, z], wt: [x + 200, 60, z + 120] }; })()`, 4000);
    await h.eval('({ rebuilds: (window.__rkWorld?.rebuilds ?? 0) - __rb0 })', 'ss7-env-rebuilds');
    if (RK !== '0') await h.expect('(window.__rkWorld?.rebuilds ?? 0) - __rb0 <= 1', 'sea state 7: the environment is rebuilt once for the new weather, not per frame / per cross-fade step');
    await h.eval('(__G.war.setSea(3),1)');
  }
  console.log('DEPTHSKY_TIMES ' + JSON.stringify({ rk: RK, sky: SKY, times }));
  await h.eval(`(${JSON.stringify(times)})`, 'times');
  await h.eval('(clearInterval(__hold),window.__cam=null,1)');
}};
