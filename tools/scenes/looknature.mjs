// RENDERKIT nature, look-nature-2 (ngc/look-nature): tree silhouettes at 5-50 m and every player view that shows trees.
//   NAT=high|med|low TAG=before|after node snap.mjs scenes/looknature.mjs   (VIEWS=hq,oak,pine,fir,forest,village,hedge,heli30,heli200,jet1200)
// Camera scripted at render time (depthnature.mjs pattern); the helicopter is parked 40 m above the shot point so the
// terrain windows, streaming and haze follow it. Each view logs its sync draw time (SwiftShader: relative only) and tris.
const RK = process.env.RK ?? 'all', NAT = process.env.NAT ?? 'high', TAG = process.env.TAG || 'run';
const VIEWS = (process.env.VIEWS || 'all').split(',');
const want = v => VIEWS.includes('all') || VIEWS.includes(v);
export default { name: 'looknature-' + TAG + '-' + NAT, seed: 1980, query: `?debug&auto&kb&peace&res=0.6&sea=4&rk=${RK}&rknature=${NAT}`, run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 60000);
  await h.eval('(__G.G.bench=true,1)');
  await h.eval(`(() => {
    const g = __G, r = g.renderer, orig = r.render.bind(r), a = new g.THREE.Vector3(), b = new g.THREE.Vector3();
    r.render = (sc, cam) => { const C = window.__cam; if (C && cam === g.zCam) { a.set(...C.wp); b.set(...C.wt); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); if (C.fov && cam.fov !== C.fov) { cam.fov = C.fov; cam.updateProjectionMatrix(); } cam.updateMatrixWorld(); } orig(sc, cam); };
    window.__shotAt = (C) => { window.__cam = C; a.set(...C.wp); const H = g.H, y = a.y + 40; H.reset(a.clone().setY(y), 0, false, 1); g.cockpitCam = false;
      clearInterval(window.__hold); let prev = -1; window.__hold = setInterval(() => { if (g.war.time === prev) return; prev = g.war.time; H.pos.set(a.x, y, a.z); H.vel.set(0, 0, 0); g.HI.setCollective(.47); }, 16); };
    window.__eye = (x, z, ang, up = 1.7, dip = 0.6) => { const y = g.groundY(x, z) + up; return { wp: [x, y, z], wt: [x + Math.cos(ang) * 40, y - dip, z + Math.sin(ang) * 40] }; };
    // a zone tree of species k (0 fir, 1 pine, 2 broad) with open ground at d m on its sun-lit side; eye looks at its crown
    window.__treeView = (k, d = 9, side = 2.4, src = 'zone', near0 = null) => { const N = window.__nature; if (!N) return null; const I = near0 || g.ISLANDS[0];
      let best = null; for (const [id, s] of N.forest.sources) { if (src === 'zone' ? id !== 'zone' : (id === 'zone' || id === 'zone-scrub')) continue; for (let i = 0; i < s.n; i++) { if (s.k[i] !== k) continue; const x = s.d[i * 8], y = s.d[i * 8 + 1], z = s.d[i * 8 + 2], sc = s.d[i * 8 + 3];
        const ex = x + Math.cos(side) * d * sc, ez = z + Math.sin(side) * d * sc, gy = g.groundY(ex, ez); if (gy < 1 || Math.abs(gy - y) > 2.5 || Math.abs(g.groundY(ex + 3, ez) - gy) > 1.2 || Math.abs(g.groundY(ex, ez + 3) - gy) > 1.2) continue;
        let near = 0; for (let j = 0; j < s.n; j++) { const q = Math.hypot(s.d[j * 8] - ex, s.d[j * 8 + 2] - ez); if (q < d * sc * 0.8) near++; }
        const sc0 = near * 100 + Math.hypot(x - I.x, z - I.z) * 0.01; if (!best || sc0 < best.s) best = { s: sc0, x, y, z, sc, ex, ez, gy }; } }
      if (!best) return null; window.__tree = best; return { wp: [best.ex, best.gy + 1.7, best.ez], wt: [best.x, best.y + 3 * best.sc, best.z] }; };
    window.__draw = () => { const gl = r.getContext(), px = new Uint8Array(4), ds = []; r.info.autoReset = false; let tris = 0;
      for (let i = 0; i < 5; i++) { r.info.reset(); const t = performance.now(); orig(g.sealife.bedMesh.parent, g.zCam); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); if (i) ds.push(performance.now() - t); tris = r.info.render.triangles; }
      r.info.autoReset = true; ds.sort((x, y) => x - y); return { drawMs: +ds[2].toFixed(0), kt: Math.round(tris / 1000), nature: window.__nature ? __nature.stats() : null }; };
    return 1; })()`);
  const times = {};
  const view = async (name, camExpr, settle = 2500) => {
    if (!want(name)) return;
    const ok = await h.eval(`(() => { const C = ${camExpr}; if (!C) return false; __shotAt(C); return true; })()`, name);
    if (!ok) return;
    await h.wait(settle);
    if (await h.eval('!!window.__WORLD')) await h.waitFor('__WORLD.stats.pending===0', 60000);
    await h.wait(1500);
    await h.shot(name); await h.notblank();
    times[name] = await h.eval('__draw()', name + '-cost');
  };
  // the user's view: on foot at the home island HQ, looking past it to the trees on the hill
  await view('hq', `(() => { const g = __G, I = g.ISLANDS[0], s = I.structs.find(s => s.kind === 'hq') || { x: I.x, z: I.z }; const ang = Math.atan2(s.z - I.z, s.x - I.x) + 3.3, x = s.x + Math.cos(ang) * 28, z = s.z + Math.sin(ang) * 28; return __eye(x, z, Math.atan2(s.z - z, s.x - x), 1.7, 1.5); })()`);
  // single trees at 9-14 m: the crown silhouettes this workstream is about
  await view('oak', '__treeView(2, 8, 2.4)');
  await view('pine', '__treeView(1, 8, 2.4)');
  if (want('fir')) {   // the mainland fir belt (from ~170-220 m up): fly over it first so its chunks stream in, then pick a fir
    await h.eval(`(__shotAt((() => { const g = __G; let best = null; for (let x = 1600; x < 5200; x += 160) for (let z = -2400; z < 2400; z += 160) { const y = g.terrainH(x, z); if (y > 230 && y < 420 && (!best || Math.abs(y - 300) < Math.abs(best.y - 300))) best = { x, z, y }; }
      window.__firAt = best || { x: 2600, z: 900, y: 200 }; return { wp: [__firAt.x - 60, __firAt.y + 120, __firAt.z - 60], wt: [__firAt.x, __firAt.y, __firAt.z] }; })()), 1)`);
    await h.wait(6000); if (await h.eval('!!window.__WORLD')) await h.waitFor('__WORLD.stats.pending===0', 90000); await h.wait(2000);
  }
  await view('fir', '__treeView(0, 7, 2.4, "wild", window.__firAt)', 4000);
  await view('backlit', '__treeView(2, 6, 2.4 + Math.PI)');   // looking toward the sun through a crown: translucency
  // forest edge: the densest zone tree cluster, 30 m out, looking in
  await view('forest', `(() => { const g = __G, I = g.ISLANDS[0]; let best = null, bn = 0; const trees = window.__nature ? __nature.zoneTrees : [];
    for (let k = 0; k < trees.length; k += 7) { const t = trees[k]; let n = 0; for (const u of trees) if (Math.abs(u.x - t.x) < 25 && Math.abs(u.z - t.z) < 25) n++; if (n > bn && Math.hypot(t.x - I.x, t.z - I.z) < 900) { bn = n; best = t; } }
    if (!best) best = { x: I.x + 60, z: I.z + 60 }; const ang = 0.7, x = best.x - Math.cos(ang) * 30, z = best.z - Math.sin(ang) * 30; return __eye(x, z, ang, 1.7, 1.0); })()`);
  // a village street on foot (the densest zone village nearest the carrier) and the hedged fields round it
  await view('village', `(() => { const g = __G; if (!window.__WORLD) return null; let best = null;
    for (const e of __WORLD.zone) { const T = e.items.filter(i => i.t === 'tree'), B = e.items.filter(i => i.w && i.d); for (const t of T) { const n = T.filter(j => Math.hypot(j.x - t.x, j.z - t.z) < 40).length * 2 + B.filter(j => Math.hypot(j.x - t.x, j.z - t.z) < 40).length;
      for (let a = 0; a < 6.28; a += 0.39) { const ex = t.x + Math.cos(a) * 16, ez = t.z + Math.sin(a) * 16; if (B.some(j => Math.hypot(j.x - ex, j.z - ez) < Math.max(j.w, j.d) * 0.75 + 2) || g.groundY(ex, ez) < 1) continue; if (!best || n > best.n) best = { n, x: t.x, z: t.z, ex, ez }; break; } } }
    if (!best) return null; window.__town = best; const s = best; return { wp: [s.ex, g.groundY(s.ex, s.ez) + 1.7, s.ez], wt: [s.x, g.groundY(s.x, s.z) + 3.5, s.z] }; })()`, 3500);
  await view('village30', `(() => { if (!window.__town) return null; const s = __town; return { wp: [s.x + 60, __G.groundY(s.x, s.z) + 30, s.z + 50], wt: [s.x, __G.groundY(s.x, s.z), s.z] }; })()`);
  // the Huey's heights over the home island, and the jet at 1200 m
  await view('heli30', `(() => { const g = __G, I = g.ISLANDS[0], t = window.__tree || { x: I.x, z: I.z }; return { wp: [t.x + 70, g.groundY(t.x, t.z) + 30, t.z + 60], wt: [t.x, g.groundY(t.x, t.z) + 2, t.z] }; })()`);
  await view('heli200', `(() => { const I = __G.ISLANDS[0]; return { wp: [I.x + 160, 200, I.z + 260], wt: [I.x, 0, I.z] }; })()`);
  await view('jet1200', `(() => { const I = __G.ISLANDS[0]; return { wp: [I.x + 1300, 1200, I.z + 900], wt: [I.x, 0, I.z] }; })()`, 4000);
  console.log('LOOKNATURE ' + JSON.stringify({ tag: TAG, nat: NAT, times }));
  await h.eval(`(${JSON.stringify(Object.fromEntries(Object.entries(times).map(([k, v]) => [k, { ms: v.drawMs, kt: v.kt, forestTris: v.nature?.forest.tris, clutterTris: v.nature?.clutter.tris }])))})`, 'summary');
  await h.eval('(clearInterval(__hold),window.__cam=null,1)');
}};
