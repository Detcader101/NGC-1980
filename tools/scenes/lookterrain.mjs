// RENDERKIT terrain (ngc/look-terrain): every player view of the ground, from the soldier's boots to the jet at 1200 m,
// run per setting so the shots and frame times compare like for like.
//   RK=all TER=high node snap.mjs scenes/lookterrain.mjs      (TER=med|low; RK=0: classic; RK=all TER=off: before)
//   VIEWS=grass,road,... runs a subset. Camera scripted at render time (rkworld.mjs pattern); the helicopter is parked
// above the shot point so the terrain windows, streaming and haze follow it.
const TER = process.env.TER ?? 'high', RK = process.env.RK ?? (TER === 'off' ? 'surface,world,fx,post,ui,figures,sky,light,nature' : 'all');
const VIEWS = (process.env.VIEWS || 'all').split(',');
const want = v => VIEWS.includes('all') || VIEWS.includes(v);
export default { name: 'lookterrain-' + RK.replace(/[^\w]+/g, '_') + '-' + TER, seed: 1980, query: `?debug&auto&kb&peace&res=0.6&sea=3&nofog&rk=${RK}&rkterrain=${TER}`, run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 60000);
  await h.eval('(__G.G.bench=true,1)');
  if (TER !== 'off' && RK !== '0') await h.waitFor('!window.__rkTerrain || __rkTerrain.ready', 60000);
  await h.eval(`(() => {
    const g = __G, r = g.renderer, orig = r.render.bind(r), a = new g.THREE.Vector3(), b = new g.THREE.Vector3();
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam === g.zCam) { a.set(...C.wp); b.set(...C.wt); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
    window.__shotAt = (C) => { window.__cam = C; a.set(...C.wp); const H = g.H, y = Math.max(a.y + (C.hover ?? 40), g.groundY(a.x, a.z) + 30); H.reset(a.clone().setY(y), 0, false, 1); g.cockpitCam = false;
      clearInterval(window.__hold); let prev = -1; window.__hold = setInterval(() => { if (g.war.time === prev) return; prev = g.war.time; H.pos.set(a.x, y, a.z); H.vel.set(0, 0, 0); g.HI.setCollective(.47); }, 16); };
    window.__eye = (x, z, ang, up = 1.7, dip = 0.6) => { const y = g.groundY(x, z) + up; return { wp: [x, y, z], wt: [x + Math.cos(ang) * 40, y - dip, z + Math.sin(ang) * 40] }; };
    const sc = g.sealife.bedMesh.parent;
    window.__frameMs = () => { const gl = r.getContext(), px = new Uint8Array(4), ds = [];
      for (let i = 0; i < 7; i++) { const t = performance.now(); r.render(sc, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); }
      ds.sort((x, y) => x - y); return +ds[3].toFixed(1); };
    // the terrain alone (near + far grid), render + 1-pixel readback, median of 7
    window.__terrMs = () => { const gl = r.getContext(), px = new Uint8Array(4), vis = sc.children.map(o => o.visible), ds = [], T = sc.children.filter(o => o.material && o.material.uniforms && o.material.uniforms.uHM);
      sc.children.forEach(o => { o.visible = T.includes(o) && o.visible; });
      for (let i = 0; i < 7; i++) { const t = performance.now(); orig(sc, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); }
      sc.children.forEach((o, i) => o.visible = vis[i]); ds.sort((x, y) => x - y); return +ds[3].toFixed(1); };
    // no HUD in the shots (the ground is the subject)
    const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { visibility: hidden !important; }'; document.head.appendChild(st);
    return 1; })()`);
  const times = {};
  const view = async (name, camExpr, settle = 2500) => {
    if (!want(name)) return;
    await h.eval(`(__shotAt(${camExpr}),1)`);
    await h.wait(settle);
    if (await h.eval('!!window.__WORLD')) await h.waitFor('__WORLD.stats.pending===0', 60000);
    await h.wait(1200);
    await h.shot(name); await h.notblank();
    times[name] = await h.eval('({ frameMs: __frameMs(), terrMs: __terrMs(), draw: Math.round(__G.view.draw), tris: __G.renderer.info.render.triangles })', name + '-ms');
  };
  const I0 = 'const g = __G, I = g.ISLANDS[0]';
  // grassland on foot: open grass on the home island, looking across it
  await view('grass', `(() => { ${I0}; for (let k = 0; k < 400; k++) { const a = k * 2.399, d = 40 + (k % 20) * 4, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = g.terrainH(x, z);
      if (y > 4 && y < 20 && g.terrainH(x + 30 * Math.cos(a), z + 30 * Math.sin(a)) > 3 && !g.PADS.some(p => Math.hypot(p.x - x, p.z - z) < 50)) return __eye(x, z, a, 1.7, 2.0); } return __eye(I.x + 50, I.z, 0); })()`);
  // looking down at the feet: the texture at 1-4 m (tiling, mip, normal detail)
  await view('feet', `(() => { ${I0}; for (let k = 0; k < 400; k++) { const a = k * 2.399, d = 40 + (k % 20) * 4, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = g.terrainH(x, z);
      if (y > 4 && y < 20 && !g.PADS.some(p => Math.hypot(p.x - x, p.z - z) < 50)) { const e = __eye(x, z, a, 1.7, 0); e.wt = [x + Math.cos(a) * 3, y, z + Math.sin(a) * 3]; return e; } } return __eye(I.x + 50, I.z, 0); })()`);
  // a road on foot: the nearest road to the home pad, standing on its verge looking along it
  await view('road', `(() => { ${I0}; let q = null; for (let k = 0; k < 200 && !q; k++) { const a = k * 2.399, d = 30 + k * 4, x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, r = g.world.net.nearestRoad(x, z, 80);
        if (r && !r.R.br[0] && g.BASES.every(b => Math.hypot(b.x - r.x, b.z - r.z) > 70) && g.PADS.every(b => Math.hypot(b.x - r.x, b.z - r.z) > 60) && r.y > 2) q = r; }
      if (!q) return __eye(I.x, I.z, 0); const R = q.R, p = g.world.roadPoint(R, q.s, 0), p2 = g.world.roadPoint(R, q.s + 30, 0), a = Math.atan2(p2.z - p.z, p2.x - p.x);
      const x = p.x - Math.sin(a) * (R.hw || 3) * 0.6, z = p.z + Math.cos(a) * (R.hw || 3) * 0.6; return __eye(x, z, a, 1.7, 1.6); })()`);
  // beach on foot: at the top of a home island beach looking along the waterline
  await view('beach', `(() => { ${I0}; let best = null;
    for (let k = 0; k < 96 && !best; k++) { const ang = k / 96 * 6.283 + 0.8; for (let d = I.r * .4; d < I.r * 2; d += 2) { const x = I.x + Math.cos(ang) * d, z = I.z + Math.sin(ang) * d; if (g.terrainH(x, z) < 0) { if (g.terrainH(x + Math.cos(ang) * 30, z + Math.sin(ang) * 30) < -1.5 && Math.abs(g.terrainH(x - Math.cos(ang) * 14, z - Math.sin(ang) * 14) - 3) < 3) best = { x, z, ang }; break; } } }
    if (!best) best = { x: I.x + I.r, z: I.z, ang: 0 }; const c = Math.cos(best.ang), s = Math.sin(best.ang), x = best.x - c * 9, z = best.z - s * 9;
    return __eye(x, z, best.ang + 1.1, 1.7, 2.2); })()`);
  // a cliff: the steepest coast of any zone island, from a boat 60 m off
  await view('cliff', `(() => { const g = __G; let best = { s: 0 };
    for (const I of g.ISLANDS) for (let k = 0; k < 64; k++) { const a = k / 64 * 6.283; let prev = null; for (let d = I.r * .6; d < I.r * 1.6; d += 2) { const x = I.x + Math.cos(a) * d, z = I.z + Math.sin(a) * d, y = g.terrainH(x, z); if (y < 0) { const s = (prev ?? 0); if (s > best.s) best = { s, x, z, a }; break; } prev = y; } }
    const c = Math.cos(best.a), s = Math.sin(best.a), x = best.x + c * 60 + s * 25, z = best.z + s * 60 - c * 25; return { wp: [x, 4, z], wt: [best.x, best.s * 0.5, best.z] }; })()`);
  // a mainland hillside on foot: the slope and rock at 10-200 m
  await view('hill', `(() => { const g = __G; let best = null; for (let k = 0; k < 600 && !best; k++) { const x = 2200 + (k % 25) * 40, z = 600 + Math.floor(k / 25) * 40, y = g.terrainH(x, z), y2 = g.terrainH(x + 60, z + 30);
      if (y > 20 && y2 - y > 18) best = { x, z }; } if (!best) best = { x: 2600, z: 900 }; return __eye(best.x, best.z, Math.atan2(30, 60), 1.7, -8); })()`, 6000);
  // Huey at 30 m and 200 m over the home island
  await view('huey30', `(() => { ${I0}; return { wp: [I.x + 90, g.groundY(I.x + 90, I.z + 100) + 30, I.z + 100], wt: [I.x - 40, 5, I.z - 30] }; })()`);
  await view('huey200', `(() => { ${I0}; return { wp: [I.x + 160, 200, I.z + 260], wt: [I.x, 0, I.z] }; })()`);
  // the LOD hand-over band on the mainland: 0.6-1.0 x draw, from 150 m
  await view('band', `(() => { const g = __G, x = 2600, z = 900; return { wp: [x, g.groundY(x, z) + 150, z], wt: [x + 400, g.groundY(x + 400, z + 200), z + 200] }; })()`, 8000);
  // jet at 1200 m, and snow peaks: the highest ground in the mainland ranges, from 1.5 km off at their height
  await view('jet1200', `(() => { ${I0}; return { wp: [I.x, 1200, I.z], wt: [I.x + 2000, 1100, I.z + 900], hover: -400 }; })()`, 6000);
  await view('snow', `(() => { const g = __G; let best = { y: 0 }; for (let x = 1000; x < 9000; x += 120) for (let z = -6000; z < 6000; z += 120) { const y = g.terrainH(x, z); if (y > best.y) best = { x, y, z }; }
      window.__peak = best; return { wp: [best.x - 1100, best.y + 150, best.z - 700], wt: [best.x, best.y - 120, best.z], hover: -200 }; })()`, 9000);
  await view('snowfoot', `(() => { const p = window.__peak || { x: 4000, z: 0 }, g = __G; let best = null; for (let k = 0; k < 300 && !best; k++) { const a = k * 2.399, d = 60 + k * 3, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = g.terrainH(x, z); if (y > 470 && y < p.y - 40) best = { x, z, a }; }
      if (!best) best = { x: p.x - 200, z: p.z, a: 0 }; return __eye(best.x, best.z, best.a + 3.14, 1.7, -6); })()`, 6000);
  console.log('TERRAIN_TIMES ' + JSON.stringify({ rk: RK, ter: TER, times }));
  await h.eval(`(${JSON.stringify(times)})`, 'frame-times');
  await h.eval('(clearInterval(__hold),window.__cam=null,1)');
}};
