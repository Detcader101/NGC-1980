// RENDERKIT world (ngc/rk-world): fixed views of terrain, sea, sky and environment, run once per RenderKit setting so the
// screenshots and frame times compare like for like.   RK=0 node snap.mjs scenes/rkworld.mjs   /   RK=world node snap.mjs scenes/rkworld.mjs
// The camera is scripted at render time (seaworld.mjs pattern); the helicopter hovers 40 m above each shot point so the
// terrain windows, sky and haze follow it. VIEWS=home,shore,... runs a subset. Frame time is sampled per view (rAF
// intervals over 5 s of wall time after the view settles); SwiftShader timings, not a GPU claim.
const RK = process.env.RK ?? 'world';
const VIEWS = (process.env.VIEWS || 'all').split(',');
const want = v => VIEWS.includes('all') || VIEWS.includes(v);
export default { name: 'rkworld-' + RK.replace(/[^\w]+/g, '_'), seed: 1980, query: `?debug&auto&kb&peace&res=0.6&sea=4&rk=${RK}`, run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 60000);
  await h.eval('(__G.G.bench=true,1)');
  await h.eval(`(() => {
    const g = __G, r = g.renderer, orig = r.render.bind(r), T = g.THREE, a = new T.Vector3(), b = new T.Vector3();
    const W = (u, l, out) => { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return out.set(u.p.x + l[0] * c + l[2] * s, u.p.y + l[1], u.p.z - l[0] * s + l[2] * c); };
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam === g.zCam) { if (C.u) { W(C.u, C.p, a); W(C.u, C.t, b); } else { a.set(...C.wp); b.set(...C.wt); } cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    clearInterval(window.__hold);
    window.__shotAt = (C) => { window.__cam = C; if (C.u) W(C.u, C.p, a); else a.set(...C.wp); const H = g.H, y = a.y + 40; H.reset(a.clone().setY(y), 0, false, 1); g.cockpitCam = false;
      clearInterval(window.__hold); let prev = -1; window.__hold = setInterval(() => { if (g.war.time === prev) return; prev = g.war.time; H.pos.set(a.x, y, a.z); H.vel.set(0, 0, 0); g.HI.setCollective(.47); }, 16); };
    // game frames: intervals between the player's renders over 5 s; draw: the same scene rendered 8 times with a 1-pixel
    // readback after each (waits for the rasteriser), the shader cost isolated from the sim and the frame pacing
    window.__frames = null; const r2 = r.render; r.render = (sc, cam) => { r2(sc, cam); if (window.__frames && cam === g.zCam) window.__frames.push(performance.now()); };
    window.__sample = () => new Promise(res => { window.__frames = []; setTimeout(() => {
      const f = window.__frames; window.__frames = null; const d = []; for (let i = 1; i < f.length; i++) d.push(f[i] - f[i - 1]); d.sort((x, y) => x - y);
      const gl = r.getContext(), px = new Uint8Array(4), ds = []; for (let i = 0; i < 9; i++) { const t = performance.now(); orig(g.sealife.bedMesh.parent, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); } ds.sort((x, y) => x - y);
      res({ frames: d.length, drawMs50: +ds[4].toFixed(1), drawMsMin: +ds[0].toFixed(1), calls: r.info.render.calls, tris: r.info.render.triangles, terrainAB: window.__terrainAB() }); }, 5000); });
    // terrain shader A/B in ONE page: the near + far terrain alone (everything else hidden), classic vs RK_WORLD programs,
    // alternated ABAB so machine drift cancels; each sample is a render + 1-pixel readback (waits for the rasteriser)
    const sc = g.sealife.bedMesh.parent, terr = sc.children.filter(o => o.material && o.material.uniforms === g.terrainUni);
    if (!g.terrainUni.rkSkyZ) Object.assign(g.terrainUni, { rkSkyZ: { value: new T.Color(0x386bd9).convertLinearToSRGB() }, rkSkyH: { value: new T.Color(0xbfd9f2).convertLinearToSRGB() }, rkSunCol: { value: new T.Color(1, .94, .82) } });
    const variant = rk => terr.map(o => { const d = { ...o.material.defines }; if (rk) d.RK_WORLD = 1; else delete d.RK_WORLD; const m = new T.ShaderMaterial({ uniforms: g.terrainUni, vertexShader: o.material.vertexShader, fragmentShader: o.material.fragmentShader, defines: d, side: o.material.side }); if (rk) m.onBeforeCompile = p => { if (p.toneMapping === 0 && p.outputColorSpace === "srgb") p.fragmentShader = "#define RK_DISPLAY_OUT\\n" + p.fragmentShader; }; return m; });
    const VA = { off: variant(false), on: variant(true) };
    window.__terrainAB = () => {
      const gl = r.getContext(), px = new Uint8Array(4), keep = terr.map(o => o.material), vis = sc.children.map(o => o.visible), bg = sc.background, t = { off: [], on: [] };
      sc.children.forEach(o => { if (!terr.includes(o)) o.visible = false; }); sc.background = null;
      for (let round = 0; round < 6; round++) for (const k of round % 2 ? ['on', 'off'] : ['off', 'on']) {
        terr.forEach((o, i) => o.material = VA[k][i]);
        for (let i = 0; i < 4; i++) { const t0 = performance.now(); orig(sc, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (round) t[k].push(performance.now() - t0); }
      }
      terr.forEach((o, i) => o.material = keep[i]); sc.children.forEach((o, i) => o.visible = vis[i]); sc.background = bg;
      const med = a => { a.sort((x, y) => x - y); return +a[a.length >> 1].toFixed(1); };
      return { offMs: med(t.off), onMs: med(t.on) };
    };
    return 1; })()`);
  // the switch: off = no environment, classic dome and terrain programs; on = kit sky, PMREM environment, RK_WORLD terrain
  const terrDefs = '__G.sealife.bedMesh.parent.children.filter(o => o.material && o.material.uniforms === __G.terrainUni).map(o => o.material.defines)';
  if (RK === '0') await h.expect(`!__G.sealife.bedMesh.parent.environment && !window.__rkWorld && ${terrDefs}.every(d => !d.RK_WORLD)`, 'rk=0: classic terrain/sky programs, no environment');
  else { await h.waitFor(`!!__G.sealife.bedMesh.parent.environment && window.__rkWorld && window.__rkWorld.rebuilds >= 1`, 20000);   // the environment is built a few frames after play starts (depth-sky builds it from the atmosphere)
    await h.expect(`!!__G.sealife.bedMesh.parent.environment && window.__rkWorld.rebuilds === 1 && ${terrDefs}.every(d => d.RK_WORLD) && __G.sealife.bedMesh.parent.children.some(o => o.renderOrder === -10 && /^RenderKit\/(sky|atmosphere-)/.test(o.material.name))   /* the plain kit sky, or depth-sky's atmosphere dome when the sky area is on */`, 'rk world: kit sky, environment built once, RK_WORLD terrain'); }
  if (RK !== '0') await h.expect(`(() => { const r = __G.renderer, gl = r.getContext(), m = __G.sealife.bedMesh.parent.children.find(o => o.material && o.material.uniforms === __G.terrainUni && !o.material.defines.FAR).material, pr = r.properties.get(m).currentProgram; return !!pr && gl.getAttachedShaders(pr.program).some(sh => /#define RK_DISPLAY_OUT/.test(gl.getShaderSource(sh))); })()`, 'default sRGB / no tone mapping: terrain takes the zero-cost display-out path');
  const times = {};
  const view = async (name, camExpr, settle = 2500) => {
    if (!want(name)) return;
    await h.eval(`(__shotAt(${camExpr}),1)`);
    await h.wait(settle);
    if (await h.eval('!!window.__WORLD')) await h.waitFor('__WORLD.stats.pending===0', 60000);
    await h.wait(800);
    await h.shot(name); await h.notblank();
    times[name] = await h.eval('__sample()', name + '-frametime');
  };
  // home island from 200 m: the zone's surface types, beaches, pads, fog of war
  await view('home200', `(() => { const I = __G.ISLANDS[0]; return { wp: [I.x + 160, 200, I.z + 260], wt: [I.x, 0, I.z] }; })()`);
  // a beach: low over the shallows looking along the shore of the home island, into the sun
  await view('shore', `(() => { const g = __G, I = g.ISLANDS[0]; let best = null;
    for (let k = 0; k < 64 && !best; k++) { const ang = k / 64 * 6.283 + 0.8; for (let d = I.r * .4; d < I.r * 2; d += 2) { const x = I.x + Math.cos(ang) * d, z = I.z + Math.sin(ang) * d; if (g.terrainH(x, z) < 0) { if (g.terrainH(x + Math.cos(ang) * 30, z + Math.sin(ang) * 30) < -1.5 && Math.abs(g.terrainH(x - Math.cos(ang) * 14, z - Math.sin(ang) * 14) - 3) < 3) best = { x, z, ang }; break; } } }
    if (!best) best = { x: I.x + I.r, z: I.z, ang: 0 };
    window.__beach = best; const c = Math.cos(best.ang), s = Math.sin(best.ang);
    return { wp: [best.x + c * 45 - s * 30, 9, best.z + s * 45 + c * 30], wt: [best.x - s * 40, 1, best.z + c * 40] }; })()`);
  // open sea towards the sun: the glint and the water's colour
  await view('seasun', `(() => { const I = __G.ISLANDS[0], x = I.x - I.r * 2.2, z = I.z - I.r * 2.2; return { wp: [x, 14, z], wt: [x + 50, 0, z + 30] }; })()`);
  // the carrier at sea (sea, hull foam, metals with the environment)
  await view('carrier', `({ u: __G.war.carrier, p: [70, 26, -110], t: [0, 6, 0] })`);
  // mainland past the zone after flying out: haze, LOD, forests, slopes
  await view('mainland', `(() => { const g = __G, s = __WORLD.net.settlementsNear(3600, 1200, 5000).filter(s => s.size !== 'hamlet')[0] || { x: 3600, z: 1200 }; return { wp: [s.x, Math.max(260, g.groundY(s.x, s.z + 650) + 220), s.z + 650], wt: [s.x, g.groundY(s.x, s.z), s.z] }; })()`, 8000);
  // snow peaks: the highest ground found on a ring 2-6 km out
  await view('snow', `(() => { const g = __G; let b = { h: -1 }; for (let r = 2000; r <= 6000; r += 250) for (let k = 0; k < 48; k++) { const x = Math.cos(k / 48 * 6.283) * r, z = Math.sin(k / 48 * 6.283) * r, hh = g.islandH(x, z); if (hh > b.h) b = { x, z, h: hh }; }
    for (let i = 0; i < 400; i++) { const x = b.x + (Math.random() - .5) * 400, z = b.z + (Math.random() - .5) * 400, hh = g.islandH(x, z); if (hh > b.h) b = { x, z, h: hh }; }
    window.__peak = b; return { wp: [b.x + 520, b.h + 60, b.z + 380], wt: [b.x, b.h - 60, b.z] }; })()`, 8000);
  await h.eval('window.__peak', 'peak');
  // a wild coast past the zone: the shoreline sand and wet band on the streamed world
  await view('coast', `(() => { const g = __G; for (let r = 1500; r < 5000; r += 40) for (let k = 0; k < 32; k++) { const a = k / 32 * 6.283, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (g.islandH(x, z) < -2 && g.islandH(x + 60, z) > 4 && g.islandH(x + 60, z) < 30) { window.__coast = { x, z }; return { wp: [x - 70, 22, z - 40], wt: [x + 60, 2, z + 10] }; } }
    return { wp: [1500, 30, 0], wt: [1600, 0, 0] }; })()`, 8000);
  // environment probe: three PBR spheres (mirror chrome, brushed steel, olive paint) over the sea; with RenderKit world off
  // there is no scene.environment, so the metals can only show the lights
  if (want('envprobe')) {
    await h.eval(`(() => { const g = __G, T = g.THREE, I = g.ISLANDS[0], sc = g.sealife.bedMesh.parent, grp = new T.Group(); grp.name = 'rkEnvProbe';
      const x = I.x - I.r * 1.6, z = I.z; [[0x9ca4aa, 1, .04], [0x9ca4aa, 1, .35], [0x646d60, 0, .65]].forEach(([c, m, r], i) => { const s = new T.Mesh(new T.SphereGeometry(3, 48, 24), new T.MeshStandardMaterial({ color: c, metalness: m, roughness: r })); s.position.set(x + (i - 1) * 8, 6, z); grp.add(s); });
      sc.add(grp); window.__probe = { x, z }; return { env: !!sc.environment }; })()`, 'envprobe-setup');
    await view('envprobe', `({ wp: [__probe.x, 9, __probe.z + 22], wt: [__probe.x, 5, __probe.z] })`);
    await h.eval(`(() => { const sc = __G.sealife.bedMesh.parent, g = sc.getObjectByName('rkEnvProbe'); sc.remove(g); return { env: !!sc.environment, rebuilds: window.__rkWorld?.rebuilds ?? null, buildMs: window.__rkWorld?.lastBuildMs ?? null }; })()`, 'envprobe-env');
  }
  // tone mapping on (what a post / fx agent may enable): terrain, sea and sky must take the linear path together, no seam
  if (want('tonemap')) {
    await h.eval('(__G.renderer.toneMapping = __G.THREE.ACESFilmicToneMapping, 1)');
    await view('tonemap', `(() => { const I = __G.ISLANDS[0]; return { wp: [I.x - I.r * 1.2, 60, I.z - I.r * 1.4], wt: [I.x, 10, I.z] }; })()`);
    await h.eval('(__G.renderer.toneMapping = __G.THREE.NoToneMapping, 1)');
  }
  // weather: sea state 7 should grey the sky (and rebuild the environment once), not every frame
  if (want('weather')) {
    await h.eval(`(() => { window.__rb0 = window.__rkWorld?.rebuilds ?? 0; const g = __G; g.war.setSea(7); return 1; })()`);
    await view('weather', `(() => { const I = __G.ISLANDS[0]; return { wp: [I.x - I.r * 2, 30, I.z - I.r], wt: [I.x, 20, I.z] }; })()`);
    await h.eval(`({ rebuilds: (window.__rkWorld?.rebuilds ?? 0) - __rb0 })`, 'weather-rebuilds');
  }
  console.log('RKWORLD_TIMES ' + JSON.stringify({ rk: RK, times }));
  await h.eval(`(${JSON.stringify(times)})`, 'frame-times');
  await h.eval('(clearInterval(__hold),window.__cam=null,1)');
}};
