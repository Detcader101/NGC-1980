// RENDERKIT terrain (ngc/look-terrain): every player view of the ground, run per setting so shots and frame times compare
// like for like, on the old archipelago or the new land (the views find their places from the game's own data).
//   node snap.mjs scenes/lookterrain.mjs                   (RK=all TER=high; TER=med|low; RK=0: classic; TER=off: no layers)
//   VIEWS=foot,beach,... runs a subset. The camera is scripted at render time (rkworld.mjs pattern); the helicopter is
// parked above the shot point so the terrain windows, streaming and haze follow it. The HUD is hidden except in 'map'.
// Views: foot (the home base on foot), feet, huey30, huey200, jet1200, jet3000, deck (the carrier's deck), tank (a tank
// sight's eye height on open farmland, long view), village, road, beach, cliff, river, mountain, band (the LOD hand-over),
// map (the in-game big map).
const TER = process.env.TER ?? 'high', RK = process.env.RK ?? (TER === 'off' ? 'surface,world,fx,post,ui,figures,sky,light,nature' : 'all');
const VIEWS = (process.env.VIEWS || 'all').split(',');
const want = v => VIEWS.includes('all') || VIEWS.includes(v);
export default { name: 'lookterrain-' + RK.replace(/[^\w]+/g, '_') + '-' + TER, seed: 1980, query: `?debug&auto&kb&peace&res=0.6&sea=3&nofog&rk=${RK}&rkterrain=${TER}`, run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 90000);
  await h.eval('(__G.G.bench=true,1)');
  if (TER !== 'off' && RK !== '0') await h.waitFor('!window.__rkTerrain || __rkTerrain.ready', 60000);
  await h.eval(`(async () => {
    const g = __G, r = g.renderer, orig = r.render.bind(r), a = new g.THREE.Vector3(), b = new g.THREE.Vector3();
    window.__TM = await import('/js/world/terrain.js'); window.__NET = await import('/js/world/net.js');
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam === g.zCam) { a.set(...C.wp); b.set(...C.wt); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); if (C.fov && cam.fov !== C.fov) { cam.fov = C.fov; cam.updateProjectionMatrix(); } cam.updateMatrixWorld(); } orig(sc, cam); };
    window.__shotAt = (C) => { window.__cam = C; if (!C.fov && g.zCam.fov !== window.__fov0) { g.zCam.fov = window.__fov0; g.zCam.updateProjectionMatrix(); } a.set(...C.wp); const H = g.H, y = Math.max(a.y + (C.hover ?? 40), g.groundY(a.x, a.z) + 30); H.reset(a.clone().setY(y), 0, false, 1); g.cockpitCam = false;
      clearInterval(window.__hold); let prev = -1; window.__hold = setInterval(() => { if (g.war.time === prev) return; prev = g.war.time; H.pos.set(a.x, y, a.z); H.vel.set(0, 0, 0); g.HI.setCollective(.47); }, 16); };
    window.__fov0 = g.zCam.fov;
    window.__eye = (x, z, ang, up = 1.7, dip = 0.6) => { const y = g.groundY(x, z) + up; return { wp: [x, y, z], wt: [x + Math.cos(ang) * 40, y - dip, z + Math.sin(ang) * 40] }; };
    const sc = g.sealife.bedMesh.parent;
    window.__frameMs = () => { const gl = r.getContext(), px = new Uint8Array(4), ds = [];
      for (let i = 0; i < 7; i++) { const t = performance.now(); r.render(sc, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); }
      ds.sort((x, y) => x - y); return +ds[3].toFixed(1); };
    window.__terrMs = () => { const gl = r.getContext(), px = new Uint8Array(4), vis = sc.children.map(o => o.visible), ds = [], T = sc.children.filter(o => o.material && o.material.uniforms && o.material.uniforms.uHM);
      sc.children.forEach(o => { o.visible = T.includes(o) && o.visible; });
      for (let i = 0; i < 7; i++) { const t = performance.now(); orig(sc, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); }
      sc.children.forEach((o, i) => o.visible = vis[i]); ds.sort((x, y) => x - y); return +ds[3].toFixed(1); };
    const st = document.createElement('style'); st.id = 'nohud'; st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(st);
    return 1; })()`);
  const times = {};
  const view = async (name, camExpr, settle = 2500) => {
    if (!want(name)) return;
    await h.eval(`(__shotAt(${camExpr}),1)`);
    await h.wait(settle);
    if (await h.eval('!!window.__WORLD')) await h.waitFor('__WORLD.stats.pending===0', 60000);
    await h.wait(1200);
    await h.shot(name); await h.notblank();
    times[name] = await h.eval('({ frameMs: __frameMs(), terrMs: __terrMs(), draw: Math.round(__G.view.draw), tris: __G.renderer.info.render.triangles, at: __cam.wp.map(Math.round) })', name + '-ms');
  };
  const I0 = 'const g = __G, I = g.HOME_B.isl, P = I.pad';
  const open = 'const clear = (x, z) => !g.PADS.some(p => Math.hypot(p.x - x, p.z - z) < 45) && !g.BASES.some(b => Math.hypot(b.x - x, b.z - z) < 60)';
  // on foot at the home base: 60-120 m from the pad, looking across the base and the land
  await view('foot', `(() => { ${I0}; ${open}; for (let k = 0; k < 400; k++) { const a = k * 2.399, d = 60 + (k % 12) * 6, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d, y = g.terrainH(x, z);
      if (y > 2 && clear(x, z) && g.terrainH(x + 40 * Math.cos(a + 3.14), z + 40 * Math.sin(a + 3.14)) > 1) return __eye(x, z, a + 3.14, 1.7, 1.2); } return __eye(P.x + 70, P.z, 3.14); })()`);
  await view('feet', `(() => { ${I0}; ${open}; for (let k = 0; k < 400; k++) { const a = k * 2.399, d = 70 + (k % 12) * 6, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d, y = g.terrainH(x, z);
      if (y > 3 && clear(x, z) && __TM.zoneSurf(x, z) === 'grass') { const e = __eye(x, z, a, 1.7, 0); e.wt = [x + Math.cos(a) * 3, y, z + Math.sin(a) * 3]; return e; } } return __eye(P.x + 70, P.z, 0); })()`);
  await view('huey30', `(() => { ${I0}; return { wp: [P.x + 110, g.groundY(P.x + 110, P.z + 120) + 30, P.z + 120], wt: [P.x - 60, g.groundY(P.x, P.z), P.z - 60] }; })()`);
  await view('huey200', `(() => { ${I0}; return { wp: [P.x + 260, 200, P.z + 300], wt: [P.x - 300, 0, P.z - 400] }; })()`);
  // the jet over the zone, looking across the main island
  await view('jet1200', `(() => { const g = __G, B = g.inZone ? 1 : 1; return { wp: [-1800, 1200, 2400], wt: [400, 0, -900], hover: -400 }; })()`, 7000);
  await view('jet3000', `(() => ({ wp: [-2600, 3000, 3600], wt: [300, 0, -700], hover: -1500 }))()`, 9000);
  // the carrier's deck, standing aft looking forward along it
  await view('deck', `(() => { const g = __G, c = g.war.carrier.p, yaw = g.war.carrier.yaw ?? 0, fx = -Math.sin(yaw), fz = -Math.cos(yaw), y = g.war.deckY(c.x, c.z) + 1.7;
      return { wp: [c.x - fx * 110 + fz * 8, y, c.z - fz * 110 - fx * 8], wt: [c.x + fx * 300, y - 6, c.z + fz * 300] }; })()`, 4000);
  // a tank sight's eye (2.8 m), on open farmland, looking 1-2 km across it (6x: fov 10)
  await view('tank', `(() => { const g = __G; let best = null; for (let k = 0; k < 900 && !best; k++) { const x = -1200 + (k % 30) * 70, z = -300 + Math.floor(k / 30) * 40, y = g.terrainH(x, z);
      if (y > 6 && y < 60 && __TM.zoneSurf(x, z) === 'grass' && g.terrainH(x + 1200, z - 500) > 5) best = { x, z }; } if (!best) best = { x: -400, z: 300 };
      const y = g.groundY(best.x, best.z) + 2.8; return { wp: [best.x, y, best.z], wt: [best.x + 1300, g.groundY(best.x + 1300, best.z - 540) + 3, best.z - 540], fov: 10 }; })()`, 6000);
  // a village: the biggest zone village, from 40 m off at 8 m
  await view('village', `(() => { const g = __G, st = __NET.netState.zoneSites.filter(s => s.village).sort((a, b) => b.I.r - a.I.r)[1] || __NET.netState.zoneSites.find(s => s.village); const V = st.village;
      const a = Math.atan2(V.z - st.I.z, V.x - st.I.x), x = V.x + Math.cos(a) * 70, z = V.z + Math.sin(a) * 70; return { wp: [x, g.groundY(x, z) + 9, z], wt: [V.x, V.y + 2, V.z] }; })()`, 4000);
  // a road on foot: the longest link road, from its verge
  await view('road', `(() => { const g = __G, R = __NET.netState.roads.filter(r => r.kind === 'link' && Math.max(Math.abs(r.xs[0]), Math.abs(r.zs[0])) < __TM.ZONE_E && !r.br.some(b => b)).sort((a, b) => b.len - a.len)[0] || __NET.netState.roads[0];
      const i = Math.floor(R.xs.length * 0.4), x0 = R.xs[i], z0 = R.zs[i], a = Math.atan2(R.zs[i + 3] - z0, R.xs[i + 3] - x0), x = x0 - Math.sin(a) * (R.hw + 1.5), z = z0 + Math.cos(a) * (R.hw + 1.5); return __eye(x, z, a, 1.7, 1.4); })()`);
  // a beach: the first landing beach of the home side, from the top of the sand looking along the waterline
  await view('beach', `(() => { const g = __G, B = __TM.beaches().find(b => b.I.owner === 1) || __TM.beaches()[0]; const [x, z] = B.at(Math.max(4, B.u1 - 4), 0);
      return __eye(x, z, Math.atan2(-B.fx, B.fz) + 0.5, 1.7, 2); })()`);
  // a cliff: the highest coast near the shoreline, from a boat 80 m off
  await view('cliff', `(() => { const g = __G; let best = { y: 0 };
      for (let x = -__TM.ZONE_E + 200; x < __TM.ZONE_E - 200; x += 20) for (let z = -__TM.ZONE_E + 200; z < __TM.ZONE_E - 200; z += 20) { if (__TM.planAt) { const p = __TM.planAt(x, z); if (p.s < 8 || p.s > 30 || p.wc < 0.6) continue; } else if (![0, 1.57, 3.14, 4.71].some(q => g.terrainH(x + Math.cos(q) * 30, z + Math.sin(q) * 30) < -1)) continue; const y = g.terrainH(x, z); if (y > best.y) best = { x, z, y }; }
      let wx = best.x, wz = best.z, a = 0; for (let k = 0; k < 16; k++) { const aa = k / 16 * 6.283; if (g.terrainH(best.x + Math.cos(aa) * 60, best.z + Math.sin(aa) * 60) < -2) { a = aa; break; } }
      wx = best.x + Math.cos(a) * 140; wz = best.z + Math.sin(a) * 140; return { wp: [wx + Math.sin(a) * 40, 5, wz - Math.cos(a) * 40], wt: [best.x, best.y * 0.55, best.z] }; })()`, 4000);
  // a river valley from 60 m up, looking down it
  await view('river', `(() => { const g = __G; return { wp: [-560, g.groundY(-560, -980) + 60, -980], wt: [-420, 10, -300] }; })()`, 4000);
  // the spine on foot: a high slope near the crest
  await view('mountain', `(() => { const g = __G; let best = { y: 0 }; for (let x = -900; x < 1000; x += 30) for (let z = -1700; z < -1000; z += 30) { const y = g.terrainH(x, z); if (y > best.y) best = { x, y, z }; }
      window.__peak = best; const x = best.x - 380, z = best.z + 260; return { wp: [x, g.groundY(x, z) + 1.7, z], wt: [best.x, best.y - 20, best.z] }; })()`, 5000);
  await view('band', `(() => { const g = __G, x = 600, z = -200; return { wp: [x, g.groundY(x, z) + 150, z], wt: [x + 400, g.groundY(x + 400, z - 300), z - 300] }; })()`, 6000);
  // the in-game big map (M), the HUD back on
  if (want('map')) {
    await h.eval(`(() => { const s = document.getElementById('nohud'); if (s) s.remove(); __G.fog.enabled = false; __G.fog.update([]); return 1; })()`);
    await h.key('tap', 'KeyM');
    await h.wait(2500); await h.shot('map');
  }
  console.log('TERRAIN_TIMES ' + JSON.stringify({ rk: RK, ter: TER, times }));
  await h.eval(`(${JSON.stringify(times)})`, 'frame-times');
  await h.eval('(clearInterval(__hold),window.__cam=null,1)');
}};
